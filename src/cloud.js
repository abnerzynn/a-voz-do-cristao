'use strict';

/**
 * Sincronização na nuvem (Supabase / PostgREST).
 *
 * O aplicativo continua funcionando offline: o banco local é a fonte de
 * verdade. Este módulo apenas envia o que mudou e traz o que os outros
 * computadores mudaram, quando há internet.
 *
 * Na nuvem guardamos somente o texto original da mensagem — cada computador
 * recalcula parágrafos e slides conforme o seu próprio limite de caracteres.
 */

const https = require('https');
const { URL } = require('url');

const TABLE = 'mensagens';

function configured(cfg) {
  return !!(cfg && cfg.url && cfg.key && cfg.workspace);
}

/** Executa uma chamada REST no Supabase. */
function request(cfg, method, pathAndQuery, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    let base;
    try {
      base = new URL(cfg.url);
    } catch (_) {
      return reject(new Error('Endereço (URL) da nuvem é inválido.'));
    }
    const payload = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const headers = Object.assign({
      'apikey': cfg.key,
      'Authorization': 'Bearer ' + cfg.key,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }, extraHeaders || {});
    if (payload) headers['Content-Length'] = payload.length;

    const req = https.request({
      protocol: base.protocol,
      hostname: base.hostname,
      port: base.port || 443,
      path: '/rest/v1/' + pathAndQuery,
      method,
      headers
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (!data) return resolve([]);
          try { resolve(JSON.parse(data)); }
          catch (_) { resolve([]); }
        } else {
          let msg = data;
          try { const j = JSON.parse(data); msg = j.message || j.hint || data; } catch (_) {}
          if (res.statusCode === 401 || res.statusCode === 403) {
            msg = 'Chave de acesso inválida ou sem permissão.';
          } else if (res.statusCode === 404) {
            msg = `Tabela "${TABLE}" não encontrada no banco. Rode o script de criação.`;
          }
          reject(new Error(msg || ('Erro HTTP ' + res.statusCode)));
        }
      });
    });
    req.on('error', (err) => {
      reject(new Error('Sem conexão com a nuvem: ' + (err.code || err.message)));
    });
    req.setTimeout(20000, () => { req.destroy(new Error('Tempo esgotado.')); });
    if (payload) req.write(payload);
    req.end();
  });
}

/** Converte linha da nuvem -> formato local. */
function toLocal(row) {
  return {
    id: row.id,
    title: row.title || '',
    day: row.day == null ? null : Number(row.day),
    month: row.month == null ? null : Number(row.month),
    year: row.year == null ? null : Number(row.year),
    translation: row.translation || '',
    originalText: row.original_text || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: !!row.deleted
  };
}

/** Converte mensagem local -> linha da nuvem. */
function toRemote(m, workspace, deleted) {
  return {
    id: m.id,
    workspace,
    title: m.title || '',
    day: m.day,
    month: m.month,
    year: m.year,
    translation: m.translation || '',
    original_text: m.originalText || '',
    created_at: m.createdAt || new Date().toISOString(),
    updated_at: m.updatedAt || new Date().toISOString(),
    deleted: !!deleted
  };
}

/** Testa a conexão e a existência da tabela. */
async function test(cfg) {
  if (!configured(cfg)) throw new Error('Preencha endereço, chave e chave da igreja.');
  const q = `${TABLE}?select=id&workspace=eq.${encodeURIComponent(cfg.workspace)}&limit=1`;
  await request(cfg, 'GET', q);
  return true;
}

/**
 * Baixa as linhas alteradas na nuvem desde a data informada.
 *
 * A leitura é feita em páginas. Cada mensagem carrega o sermão inteiro, então
 * pedir centenas de uma vez estoura o tempo limite do banco — era o que
 * quebrava a primeira sincronização de um computador novo.
 */
async function pull(cfg, sinceISO, aoProgredir) {
  const PAGINA = 25;
  const todas = [];
  for (let offset = 0; ; offset += PAGINA) {
    const parts = [
      'select=*',
      'workspace=eq.' + encodeURIComponent(cfg.workspace),
      'order=updated_at.asc,id.asc',
      'limit=' + PAGINA,
      'offset=' + offset
    ];
    if (sinceISO) parts.push('updated_at=gt.' + encodeURIComponent(sinceISO));
    const rows = await request(cfg, 'GET', `${TABLE}?${parts.join('&')}`);
    const lote = Array.isArray(rows) ? rows : [];
    for (const r of lote) todas.push(toLocal(r));
    if (typeof aoProgredir === 'function') aoProgredir(todas.length);
    if (lote.length < PAGINA) break;
  }
  return todas;
}

/** Envia (insere ou atualiza) as mensagens informadas. */
async function push(cfg, messages, tombstones) {
  const rows = [];
  for (const m of messages || []) rows.push(toRemote(m, cfg.workspace, false));
  for (const t of tombstones || []) {
    rows.push({
      id: t.id,
      workspace: cfg.workspace,
      title: '',
      original_text: '',
      created_at: t.deletedAt,
      updated_at: t.deletedAt,
      deleted: true
    });
  }
  if (!rows.length) return 0;
  // Envia em lotes para não estourar o tamanho da requisição.
  const LOTE = 50;
  for (let i = 0; i < rows.length; i += LOTE) {
    await request(cfg, 'POST', `${TABLE}?on_conflict=id`, rows.slice(i, i + LOTE), {
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    });
  }
  return rows.length;
}

// O roteiro do culto viaja numa linha reservada da mesma tabela, para chegar
// junto nos outros computadores sem precisar de alteração no banco.
const ID_ROTEIRO = '__roteiro__';

async function pushRoteiro(cfg, roteiro) {
  const linha = {
    id: ID_ROTEIRO,
    workspace: cfg.workspace,
    title: '__roteiro__',
    original_text: JSON.stringify(roteiro || {}),
    created_at: roteiro.atualizadoEm || new Date().toISOString(),
    updated_at: roteiro.atualizadoEm || new Date().toISOString(),
    deleted: false
  };
  await request(cfg, 'POST', `${TABLE}?on_conflict=id`, [linha], {
    'Prefer': 'resolution=merge-duplicates,return=minimal'
  });
  return true;
}

module.exports = { configured, test, pull, push, pushRoteiro, TABLE, ID_ROTEIRO };
