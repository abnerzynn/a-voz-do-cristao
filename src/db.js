'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseParagraphs } = require('./parser');
const { buildSlides } = require('./slicer');

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

const TRANSLATIONS = ['VGR', 'GO', 'AM', 'MH', 'MLE', 'VSA', 'CB'];

const DEFAULT_SETTINGS = {
  theme: 'dark',              // 'dark' | 'light'
  charLimit: 250,
  fontSize: 48,              // px, texto principal da projeção
  paragraphFontSize: 26,     // px, número do parágrafo (independente)
  metaFontSize: 22,          // px, título + data (independente)
  fontFamily: "Georgia, 'Times New Roman', serif", // fonte do texto da mensagem
  autoFit: true,             // texto aumenta/diminui sozinho para preencher a tela
  autoFitMax: 240,           // tamanho máximo (px) que a fonte pode atingir no auto-ajuste
  textOpacity: 1,            // 0.05 a 1 — opacidade APENAS do parágrafo/título/data
  port: 5757,
  projectionStyle: 'default',
  showParagraphNumber: true,
  showTitleDate: true,
  background: '#000000',
  textColor: '#ffffff'
};

let dataFile = null;
let db = { settings: { ...DEFAULT_SETTINGS }, messages: [] };

function uid() {
  return crypto.randomBytes(8).toString('hex');
}

function load() {
  try {
    if (fs.existsSync(dataFile)) {
      const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      db = {
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
        messages: Array.isArray(parsed.messages) ? parsed.messages : []
      };
    }
  } catch (err) {
    // Backup do arquivo corrompido para não perder dados.
    try {
      if (fs.existsSync(dataFile)) {
        fs.copyFileSync(dataFile, dataFile + '.corrupted-' + Date.now());
      }
    } catch (_) { /* ignore */ }
    db = { settings: { ...DEFAULT_SETTINGS }, messages: [] };
  }
}

let saveTimer = null;
function save() {
  const tmp = dataFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, dataFile); // gravação atômica
}
function saveDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { save(); } catch (_) { /* ignore */ }
  }, 150);
}

function init(dir) {
  fs.mkdirSync(dir, { recursive: true });
  dataFile = path.join(dir, 'avoz-database.json');
  load();
  if (!fs.existsSync(dataFile)) save();
  return dataFile;
}

// ---------- Configurações ----------
function getSettings() {
  return { ...db.settings };
}
function saveSettings(patch) {
  db.settings = { ...db.settings, ...patch };
  save();
  return getSettings();
}

// ---------- Utilidades de mensagem ----------
function dateLabel(m) {
  const month = MONTHS[(m.month || 1) - 1] || '';
  const parts = [];
  if (m.day) parts.push(String(m.day));
  if (month) parts.push('de ' + month);
  if (m.year) parts.push('de ' + m.year);
  return parts.join(' ');
}

function summarize(m) {
  const paragraphs = m.paragraphs || [];
  const slides = m.slides || [];
  return {
    id: m.id,
    title: m.title,
    day: m.day,
    month: m.month,
    monthName: MONTHS[(m.month || 1) - 1] || '',
    year: m.year,
    translation: m.translation,
    dateLabel: dateLabel(m),
    paragraphCount: paragraphs.filter(p => p.number !== null).length || paragraphs.length,
    slideCount: slides.length,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt
  };
}

function rebuild(message, limit) {
  const { paragraphs, warnings } = parseParagraphs(message.originalText || '');
  const slides = buildSlides(paragraphs, limit || db.settings.charLimit);
  message.paragraphs = paragraphs;
  message.slides = slides;
  return warnings;
}

/**
 * Pré-visualização (usada na tela de criação, sem salvar).
 */
function preview(originalText, limit) {
  const { paragraphs, warnings } = parseParagraphs(originalText || '');
  const slides = buildSlides(paragraphs, limit || db.settings.charLimit);
  return {
    paragraphs,
    slides,
    warnings,
    paragraphCount: paragraphs.filter(p => p.number !== null).length || paragraphs.length,
    slideCount: slides.length
  };
}

// ---------- CRUD ----------
function listMessages() {
  return db.messages.map(summarize);
}

function getMessage(id) {
  const m = db.messages.find(x => x.id === id);
  if (!m) return null;
  return { ...m, dateLabel: dateLabel(m), monthName: MONTHS[(m.month || 1) - 1] || '' };
}

function createMessage(data) {
  const now = new Date().toISOString();
  const m = {
    id: uid(),
    title: (data.title || 'Sem título').trim(),
    day: data.day ? Number(data.day) : null,
    month: data.month ? Number(data.month) : null,
    year: data.year ? Number(data.year) : null,
    translation: data.translation || '',
    originalText: data.originalText || '',
    createdAt: now,
    updatedAt: now,
    paragraphs: [],
    slides: []
  };
  const warnings = rebuild(m, data.charLimit);
  db.messages.push(m);
  save();
  return { message: getMessage(m.id), warnings };
}

function updateMessage(id, data) {
  const m = db.messages.find(x => x.id === id);
  if (!m) return null;
  if (data.title !== undefined) m.title = String(data.title).trim();
  if (data.day !== undefined) m.day = data.day ? Number(data.day) : null;
  if (data.month !== undefined) m.month = data.month ? Number(data.month) : null;
  if (data.year !== undefined) m.year = data.year ? Number(data.year) : null;
  if (data.translation !== undefined) m.translation = data.translation;
  let warnings = [];
  if (data.originalText !== undefined) {
    m.originalText = data.originalText;
    warnings = rebuild(m, data.charLimit);
  } else if (data.charLimit !== undefined) {
    warnings = rebuild(m, data.charLimit);
  }
  m.updatedAt = new Date().toISOString();
  save();
  return { message: getMessage(id), warnings };
}

function deleteMessage(id) {
  const before = db.messages.length;
  db.messages = db.messages.filter(x => x.id !== id);
  save();
  return db.messages.length < before;
}

function duplicateMessage(id) {
  const m = db.messages.find(x => x.id === id);
  if (!m) return null;
  const now = new Date().toISOString();
  const copy = JSON.parse(JSON.stringify(m));
  copy.id = uid();
  copy.title = m.title + ' (cópia)';
  copy.createdAt = now;
  copy.updatedAt = now;
  db.messages.push(copy);
  save();
  return getMessage(copy.id);
}

/**
 * Recalcula slides de todas as mensagens (ex.: mudou o limite de caracteres).
 */
function rebuildAll(limit) {
  for (const m of db.messages) rebuild(m, limit);
  save();
  return db.messages.length;
}

// ---------- Busca por título + parágrafo ----------
function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .trim();
}

// Distância de Levenshtein (para tolerância a pequenos erros de digitação).
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * Busca por título (com tolerância) e opcionalmente por número de parágrafo.
 * Resultados exatos aparecem primeiro.
 */
function searchByTitleParagraph(title, paragraphNumber) {
  const q = normalize(title);
  const results = [];

  for (const m of db.messages) {
    const t = normalize(m.title);
    let score;
    if (!q) {
      score = 0;
    } else if (t === q) {
      score = 1000;
    } else if (t.startsWith(q)) {
      score = 800;
    } else if (t.includes(q)) {
      score = 600;
    } else {
      const dist = levenshtein(q, t);
      const tol = Math.max(2, Math.floor(q.length * 0.34));
      if (dist <= tol) score = 400 - dist * 10;
      else continue;
    }

    const entry = { ...summarize(m), score };

    if (paragraphNumber != null && paragraphNumber !== '') {
      const num = Number(paragraphNumber);
      const slideIdx = (m.slides || []).findIndex(s => s.paragraphNumber === num);
      entry.paragraphNumber = num;
      entry.slideIndex = slideIdx >= 0 ? slideIdx : null;
      entry.hasParagraph = slideIdx >= 0;
      if (slideIdx < 0) entry.score -= 100;
    }
    results.push(entry);
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * Busca completa por palavra ou frase em todos os parágrafos.
 */
function searchFullText(query, options = {}) {
  const q = normalize(query);
  if (!q) return [];
  const contextChars = options.context || 60;
  const maxPerMessage = options.maxPerMessage || 20;
  const results = [];

  for (const m of db.messages) {
    let countInMsg = 0;
    for (const p of m.paragraphs || []) {
      const text = p.text || '';
      const hay = normalize(text);
      let from = 0;
      let idx;
      while ((idx = hay.indexOf(q, from)) !== -1) {
        // Recorte de contexto no texto ORIGINAL (mesmos índices que o normalizado,
        // pois a normalização preserva o comprimento por caractere).
        const start = Math.max(0, idx - contextChars);
        const end = Math.min(text.length, idx + q.length + contextChars);
        results.push({
          messageId: m.id,
          title: m.title,
          dateLabel: dateLabel(m),
          translation: m.translation,
          paragraphNumber: p.number,
          before: (start > 0 ? '…' : '') + text.slice(start, idx),
          match: text.slice(idx, idx + q.length),
          after: text.slice(idx + q.length, end) + (end < text.length ? '…' : ''),
          // Índice do primeiro slide desse parágrafo (para abrir na projeção).
          slideIndex: (m.slides || []).findIndex(s => s.paragraphNumber === p.number)
        });
        from = idx + q.length;
        countInMsg++;
        if (countInMsg >= maxPerMessage) break;
      }
      if (countInMsg >= maxPerMessage) break;
    }
  }
  return results;
}

// ---------- Backup ----------
function exportBackup(destPath) {
  fs.writeFileSync(destPath, JSON.stringify(db, null, 2), 'utf8');
  return destPath;
}

function importBackup(srcPath) {
  const parsed = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
  if (!parsed || !Array.isArray(parsed.messages)) {
    throw new Error('Arquivo de backup inválido.');
  }
  db = {
    settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
    messages: parsed.messages
  };
  save();
  return db.messages.length;
}

function wipeAll() {
  db = { settings: { ...DEFAULT_SETTINGS }, messages: [] };
  save();
  return true;
}

function stats() {
  return {
    messageCount: db.messages.length,
    paragraphCount: db.messages.reduce((a, m) => a + (m.paragraphs ? m.paragraphs.length : 0), 0),
    slideCount: db.messages.reduce((a, m) => a + (m.slides ? m.slides.length : 0), 0)
  };
}

module.exports = {
  init, MONTHS, TRANSLATIONS, DEFAULT_SETTINGS,
  getSettings, saveSettings,
  listMessages, getMessage, createMessage, updateMessage, deleteMessage,
  duplicateMessage, rebuildAll, preview,
  searchByTitleParagraph, searchFullText,
  exportBackup, importBackup, wipeAll, stats, dateLabel
};
