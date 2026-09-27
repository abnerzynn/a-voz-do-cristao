'use strict';

/**
 * Roteiro do culto — interpreta a lista preparada no Word e a transforma
 * numa sequência de (mensagem + parágrafo) pronta para projetar.
 *
 * Reconhece os dois formatos de referência usados no documento:
 *
 *   A JUNÇÃO DO TEMPO 1956.01.15        -> título seguido de AAAA.MM.DD
 *   64-0313 — A Voz do Sinal            -> AAMMDD seguido do título
 *   60-1204M — A Revelação de Jesus     -> com letra do período (M, E, T...)
 *
 * Depois de cada referência, as linhas que começam com um número são os
 * parágrafos a ler.
 */

const PERIODO_LETRA = { A: 'Amanhecer', C: 'Café da Manhã', M: 'Manhã', T: 'Tarde', E: 'Noite', N: 'Noite' };

/** Texto comparável: sem acentos, sem pontuação e sem "(Noite)", "(Tarde)". */
function normalizar(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Tenta ler uma linha como referência de mensagem. */
function lerReferencia(linha) {
  const t = linha.trim();
  if (!t || t.length > 160) return null;

  // Formato: 64-0313 — Título   /   60-1204M — Título
  let m = t.match(/^(\d{2})-?(\d{4})([A-Za-z])?\s*[—–-]+\s*(.+)$/);
  if (m) {
    const aa = parseInt(m[1], 10);
    const mm = parseInt(m[2].slice(0, 2), 10);
    const dd = parseInt(m[2].slice(2, 4), 10);
    if (mm >= 1 && mm <= 12) {
      return {
        titulo: m[4].trim(),
        ano: 1900 + aa,
        mes: mm,
        dia: dd >= 1 && dd <= 31 ? dd : null,
        periodo: PERIODO_LETRA[(m[3] || '').toUpperCase()] || null
      };
    }
  }

  // Formato: TÍTULO 1956.01.15
  m = t.match(/^(.+?)\s+(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})\s*$/);
  if (m) {
    const mm = parseInt(m[3], 10), dd = parseInt(m[4], 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return { titulo: m[1].trim(), ano: +m[2], mes: mm, dia: dd, periodo: null };
    }
  }
  return null;
}

/**
 * Interpreta o texto colado.
 * @returns {{tema:string, escritura:string, referencias:Array}}
 */
function parsearTexto(texto) {
  const linhas = String(texto || '').replace(/\r\n?/g, '\n').split('\n')
    .map(l => l.trim()).filter(Boolean);

  let tema = '', escritura = '';
  const referencias = [];
  let atual = null;

  for (const linha of linhas) {
    const mTema = linha.match(/^tema\s*:?\s*(.+)$/i);
    if (mTema && !tema) { tema = mTema[1].trim(); continue; }

    const mEsc = linha.match(/^escrituras?\s*:?\s*(.+)$/i);
    if (mEsc && !escritura) { escritura = mEsc[1].trim(); continue; }

    const ref = lerReferencia(linha);
    if (ref) {
      atual = { ...ref, paragrafos: [] };
      referencias.push(atual);
      continue;
    }

    // Linha de parágrafo: começa com o número
    const mPar = linha.match(/^(\d{1,4})\s+\S/);
    if (mPar && atual) {
      const n = parseInt(mPar[1], 10);
      if (!atual.paragrafos.includes(n)) atual.paragrafos.push(n);
    }
  }

  return { tema, escritura, referencias: referencias.filter(r => r.paragrafos.length) };
}

/**
 * Casa uma referência com as mensagens da biblioteca.
 * A DATA é decisiva: vários sermões têm o mesmo título.
 *
 * @param ref  referência lida do documento
 * @param msgs lista de mensagens (com id, title, year, month, day)
 * @returns {{mensagem:object|null, motivo:string}}
 */
function casarMensagem(ref, msgs) {
  const alvo = normalizar(ref.titulo);
  if (!alvo) return { mensagem: null, motivo: 'referência sem título' };

  // Candidatas pelo título (igual, começa com, ou contém).
  const porTitulo = msgs.filter(m => {
    const t = normalizar(m.title);
    return t === alvo || t.startsWith(alvo) || alvo.startsWith(t) || t.includes(alvo);
  });

  const mesmaData = (m) =>
    m.year === ref.ano &&
    (ref.mes == null || m.month === ref.mes) &&
    (ref.dia == null || m.day === ref.dia);

  // 1) Título + data exata — o caso ideal.
  const exatas = porTitulo.filter(mesmaData);
  if (exatas.length) {
    // Se houver período no documento (M/E/T), prefere o título que o traga.
    if (ref.periodo) {
      const comPeriodo = exatas.find(m => new RegExp('\\(' + ref.periodo + '\\)', 'i').test(m.title));
      if (comPeriodo) return { mensagem: comPeriodo, motivo: 'título e data conferem' };
    }
    const igual = exatas.find(m => normalizar(m.title) === alvo);
    return { mensagem: igual || exatas[0], motivo: 'título e data conferem' };
  }

  // 2) Só a data bate (o título pode ter sido traduzido diferente).
  const porData = msgs.filter(mesmaData);
  if (porData.length === 1) {
    return { mensagem: porData[0], motivo: 'encontrada pela data (título diferente)' };
  }

  // 3) Um único título parecido, mas a data não confere — avisa.
  if (porTitulo.length === 1) {
    return { mensagem: porTitulo[0], motivo: 'ATENÇÃO: a data não confere' };
  }

  if (porTitulo.length > 1) {
    return { mensagem: null, motivo: `${porTitulo.length} mensagens com esse título e nenhuma na data` };
  }
  return { mensagem: null, motivo: 'não encontrada na biblioteca' };
}

module.exports = { parsearTexto, casarMensagem, normalizar, lerReferencia };
