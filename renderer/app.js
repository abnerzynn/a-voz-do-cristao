'use strict';

/* ============================================================
   A Voz do Cristão — lógica do renderer (interface principal)
   ============================================================ */

const MONTHS = ['janeiro','fevereiro','março','abril','maio','junho',
                'julho','agosto','setembro','outubro','novembro','dezembro'];
const TRANSLATIONS = ['VGR','GO','AM','MH','MLE','VSA','CB'];

// Fontes disponíveis para o texto da mensagem (todas presentes no Windows).
const FONTS = [
  { name: 'Georgia (serifada)',        css: "Georgia, 'Times New Roman', serif" },
  { name: 'Times New Roman (serifada)', css: "'Times New Roman', Times, serif" },
  { name: 'Cambria (serifada)',        css: "Cambria, Georgia, serif" },
  { name: 'Palatino (serifada)',       css: "'Palatino Linotype', 'Book Antiqua', Palatino, serif" },
  { name: 'Constantia (serifada)',     css: "Constantia, Georgia, serif" },
  { name: 'Arial',                     css: "Arial, Helvetica, sans-serif" },
  { name: 'Segoe UI',                  css: "'Segoe UI', system-ui, sans-serif" },
  { name: 'Calibri',                   css: "Calibri, 'Segoe UI', sans-serif" },
  { name: 'Verdana',                   css: "Verdana, Geneva, sans-serif" },
  { name: 'Trebuchet MS',              css: "'Trebuchet MS', Tahoma, sans-serif" },
  { name: 'Tahoma',                    css: "Tahoma, Geneva, sans-serif" }
];

// Estado global da aplicação
const S = {
  settings: null,
  messages: [],
  serverStatus: { running: false, clients: 0 },
  projectionOpen: false,
  // Projeção atual
  current: null,        // mensagem completa carregada
  slideIndex: 0
};

/* ---------- Utilidades ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

let toastTimer;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

function confirmModal(title, body, okLabel = 'Confirmar', danger = false) {
  return new Promise((resolve) => {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = body;
    const ok = $('#modalOk'), cancel = $('#modalCancel'), overlay = $('#modal');
    ok.textContent = okLabel;
    ok.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
    overlay.classList.remove('hidden');
    const done = (val) => {
      overlay.classList.add('hidden');
      ok.onclick = cancel.onclick = null;
      resolve(val);
    };
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
  });
}

function dateLabelOf(m) {
  const parts = [];
  if (m.day) parts.push(String(m.day));
  const mn = m.monthName || (m.month ? MONTHS[m.month - 1] : '');
  if (mn) parts.push('de ' + mn);
  if (m.year) parts.push('de ' + m.year);
  return parts.join(' ');
}

/* ---------- Navegação ---------- */
function go(page) {
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $$('.page').forEach(p => p.classList.add('hidden'));
  $('#page-' + page).classList.remove('hidden');
  const render = {
    inicio: renderInicio, biblioteca: renderBiblioteca, nova: renderNova,
    busca: renderBusca, projecao: renderProjecao, transmissao: renderTransmissao,
    config: renderConfig
  }[page];
  if (render) render();
}

$$('.nav-item').forEach(b => b.addEventListener('click', () => go(b.dataset.page)));

// Alternador de tema na barra superior
$('#themeToggle').addEventListener('click', () => {
  if (!S.settings) return;
  const next = S.settings.theme === 'dark' ? 'light' : 'dark';
  S.settings.theme = next;
  window.api.settings.save({ theme: next });
  applyTheme();
  const cfg = $('#cTheme'); if (cfg) cfg.value = next;
});

/* ============================================================
   1. INÍCIO
   ============================================================ */
async function renderInicio() {
  const stats = await window.api.messages.stats();
  const recent = [...S.messages]
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 5);

  $('#page-inicio').innerHTML = `
    <div class="page-head">
      <h1 class="page-title">Início <small>Painel rápido — A Voz do Cristão</small></h1>
      <button class="btn btn-primary" id="homeNova">✚ Nova Mensagem</button>
    </div>
    <div class="cards">
      <div class="card stat-card"><div class="stat-num">${stats.messageCount}</div><div class="stat-label">Mensagens cadastradas</div></div>
      <div class="card stat-card"><div class="stat-num">${stats.paragraphCount}</div><div class="stat-label">Parágrafos no total</div></div>
      <div class="card stat-card"><div class="stat-num">${stats.slideCount}</div><div class="stat-label">Slides gerados</div></div>
    </div>

    <div class="section-title">Acesso rápido</div>
    <div class="quick-grid">
      <button class="quick" data-go="biblioteca"><span class="qi">📚</span><span class="qt">Biblioteca</span><span class="qs">${stats.messageCount} mensagem(ns)</span></button>
      <button class="quick" data-go="projecao"><span class="qi">📽️</span><span class="qt">Projeção</span><span class="qs">Projetar em tela / monitor</span></button>
      <button class="quick" data-go="busca"><span class="qi">🔎</span><span class="qt">Busca</span><span class="qs">Por título, parágrafo ou frase</span></button>
      <button class="quick" data-go="transmissao"><span class="qi">📡</span><span class="qt">Transmissão</span><span class="qs">Rede local e OBS</span></button>
    </div>

    <div class="section-title">Adicionadas recentemente</div>
    <div class="msg-list" id="recentList"></div>
  `;
  $('#homeNova').onclick = () => go('nova');
  $$('#page-inicio .quick').forEach(q => q.onclick = () => go(q.dataset.go));

  const rl = $('#recentList');
  if (!recent.length) {
    rl.innerHTML = `<div class="empty"><div class="big">📭</div>Nenhuma mensagem ainda. Comece cadastrando uma nova mensagem.</div>`;
  } else {
    rl.innerHTML = recent.map(m => rowHtml(m)).join('');
    bindRowActions(rl);
  }
}

/* ============================================================
   2. BIBLIOTECA
   ============================================================ */
const libState = { q: '', sort: 'date', year: '', month: '', translation: '' };

function rowHtml(m) {
  return `
    <div class="msg-row" data-id="${m.id}">
      <div class="msg-main">
        <div class="msg-title">${esc(m.title)}</div>
        <div class="msg-meta">
          <span>${esc(m.dateLabel || dateLabelOf(m)) || '<span class="muted">sem data</span>'}</span>
          ${m.translation ? `<span class="badge tr">${esc(m.translation)}</span>` : ''}
          <span>${m.paragraphCount} parágrafos</span>
          <span>${m.slideCount} slides</span>
        </div>
      </div>
      <div class="msg-actions">
        <button class="icon-btn" data-act="project" title="Abrir na projeção">📽️</button>
        <button class="icon-btn" data-act="open" title="Abrir / editar">✏️</button>
        <button class="icon-btn" data-act="duplicate" title="Duplicar">⧉</button>
        <button class="icon-btn" data-act="delete" title="Excluir">🗑️</button>
      </div>
    </div>`;
}

function bindRowActions(root) {
  $$('.msg-row', root).forEach(row => {
    const id = row.dataset.id;
    row.querySelector('[data-act="project"]').onclick = () => openInProjection(id, 0);
    row.querySelector('[data-act="open"]').onclick = () => editMessage(id);
    row.querySelector('[data-act="duplicate"]').onclick = async () => {
      await window.api.messages.duplicate(id);
      await reloadMessages();
      toast('Mensagem duplicada.', 'ok');
      go('biblioteca');
    };
    row.querySelector('[data-act="delete"]').onclick = async () => {
      const m = S.messages.find(x => x.id === id);
      const ok = await confirmModal('Excluir mensagem',
        `Deseja excluir <b>${esc(m.title)}</b>? Esta ação não pode ser desfeita.`,
        'Excluir', true);
      if (!ok) return;
      await window.api.messages.remove(id);
      await reloadMessages();
      toast('Mensagem excluída.', 'ok');
      go('biblioteca');
    };
    row.querySelector('.msg-main').onclick = () => editMessage(id);
    row.querySelector('.msg-main').style.cursor = 'pointer';
  });
}

function filteredMessages() {
  let list = [...S.messages];
  const q = libState.q.trim().toLowerCase();
  if (q) list = list.filter(m => (m.title || '').toLowerCase().includes(q));
  if (libState.year) list = list.filter(m => String(m.year) === libState.year);
  if (libState.month) list = list.filter(m => String(m.month) === libState.month);
  if (libState.translation) list = list.filter(m => m.translation === libState.translation);
  if (libState.sort === 'title') {
    list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'pt'));
  } else {
    list.sort((a, b) => {
      const da = (a.year||0)*10000 + (a.month||0)*100 + (a.day||0);
      const dbb = (b.year||0)*10000 + (b.month||0)*100 + (b.day||0);
      return dbb - da;
    });
  }
  return list;
}

function renderBiblioteca() {
  const years = [...new Set(S.messages.map(m => m.year).filter(Boolean))].sort((a,b)=>b-a);
  $('#page-biblioteca').innerHTML = `
    <div class="page-head">
      <h1 class="page-title">Biblioteca <small>${S.messages.length} mensagem(ns) salva(s)</small></h1>
      <button class="btn btn-primary" id="libNova">✚ Nova Mensagem</button>
    </div>
    <div class="toolbar">
      <input class="input search-input" id="libSearch" placeholder="Buscar por título…" value="${esc(libState.q)}">
      <select id="libSort">
        <option value="date">Ordenar por data</option>
        <option value="title">Ordenar por título</option>
      </select>
      <select id="libYear"><option value="">Todos os anos</option>${years.map(y=>`<option value="${y}">${y}</option>`).join('')}</select>
      <select id="libMonth"><option value="">Todos os meses</option>${MONTHS.map((mn,i)=>`<option value="${i+1}">${mn}</option>`).join('')}</select>
      <select id="libTr"><option value="">Todas traduções</option>${TRANSLATIONS.map(t=>`<option value="${t}">${t}</option>`).join('')}</select>
    </div>
    <div class="msg-list" id="libList"></div>
  `;
  $('#libNova').onclick = () => go('nova');
  const s = $('#libSort'); s.value = libState.sort;
  const y = $('#libYear'); y.value = libState.year;
  const mo = $('#libMonth'); mo.value = libState.month;
  const tr = $('#libTr'); tr.value = libState.translation;

  $('#libSearch').oninput = (e) => { libState.q = e.target.value; drawLibList(); };
  s.onchange = (e) => { libState.sort = e.target.value; drawLibList(); };
  y.onchange = (e) => { libState.year = e.target.value; drawLibList(); };
  mo.onchange = (e) => { libState.month = e.target.value; drawLibList(); };
  tr.onchange = (e) => { libState.translation = e.target.value; drawLibList(); };
  drawLibList();
}

function drawLibList() {
  const list = filteredMessages();
  const el = $('#libList');
  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="big">🔍</div>Nenhuma mensagem encontrada com esses filtros.</div>`;
    return;
  }
  el.innerHTML = list.map(rowHtml).join('');
  bindRowActions(el);
}

/* ============================================================
   3. NOVA MENSAGEM / EDIÇÃO
   ============================================================ */
let editingId = null;
let previewTimer = null;

function renderNova() {
  const editing = !!editingId;
  const m = editing ? S.messages.find(x => x.id === editingId) : null;
  $('#page-nova').innerHTML = `
    <div class="page-head">
      <h1 class="page-title">${editing ? 'Editar Mensagem' : 'Nova Mensagem'}
        <small>Cole o texto completo — os parágrafos e slides são criados automaticamente</small></h1>
      ${editing ? '<button class="btn btn-ghost" id="cancelEdit">Cancelar edição</button>' : ''}
    </div>
    <div class="form-grid">
      <div class="field"><label>Título da mensagem</label><input class="input" id="fTitle" placeholder="Ex.: Humilha-te"></div>
      <div class="field"><label>Dia</label><input class="input" id="fDay" type="number" min="1" max="31" placeholder="14"></div>
      <div class="field"><label>Mês</label><select id="fMonth"><option value="">—</option>${MONTHS.map((mn,i)=>`<option value="${i+1}">${mn}</option>`).join('')}</select></div>
      <div class="field"><label>Ano</label><input class="input" id="fYear" type="number" min="1900" max="2100" placeholder="1963"></div>
      <div class="field"><label>Tradução</label><select id="fTr"><option value="">—</option>${TRANSLATIONS.map(t=>`<option value="${t}">${t}</option>`).join('')}</select></div>
    </div>
    <div class="two-col">
      <div class="field">
        <label>Texto completo da mensagem</label>
        <textarea class="text-area" id="fText" placeholder="Cole aqui o texto com os parágrafos numerados…
Exemplo:
10 Alguém estava contando uma história...
11 Agora começa outro parágrafo..."></textarea>
        <div style="margin-top:14px; display:flex; gap:10px;">
          <button class="btn btn-primary" id="saveMsg">💾 ${editing ? 'Salvar alterações' : 'Salvar mensagem'}</button>
          <button class="btn" id="reprocess">↻ Reprocessar prévia</button>
        </div>
      </div>
      <div class="preview-box">
        <div style="font-weight:600; margin-bottom:12px;">Pré-visualização</div>
        <div class="preview-stats">
          <div class="ps"><b id="pvParas">0</b><span>parágrafos</span></div>
          <div class="ps"><b id="pvSlides">0</b><span>slides</span></div>
        </div>
        <ul class="warn-list" id="pvWarns"></ul>
        <div class="para-preview" id="pvParaList"></div>
      </div>
    </div>
  `;

  // Preenche campos se estiver editando
  if (editing) {
    window.api.messages.get(editingId).then(full => {
      $('#fTitle').value = full.title || '';
      $('#fDay').value = full.day || '';
      $('#fMonth').value = full.month || '';
      $('#fYear').value = full.year || '';
      $('#fTr').value = full.translation || '';
      $('#fText').value = full.originalText || '';
      updatePreview();
    });
    $('#cancelEdit').onclick = () => { editingId = null; go('biblioteca'); };
  }

  $('#fText').oninput = () => { clearTimeout(previewTimer); previewTimer = setTimeout(updatePreview, 350); };
  $('#reprocess').onclick = updatePreview;
  $('#saveMsg').onclick = saveMessage;
}

async function updatePreview() {
  const text = $('#fText').value;
  const limit = S.settings.charLimit;
  const pv = await window.api.messages.preview(text, limit);
  $('#pvParas').textContent = pv.paragraphCount;
  $('#pvSlides').textContent = pv.slideCount;
  $('#pvWarns').innerHTML = pv.warnings.map(w => `<li>⚠ ${esc(w)}</li>`).join('');

  // Slides agrupados por parágrafo
  const byPara = {};
  pv.slides.forEach(sl => {
    const k = sl.paragraphNumber == null ? 'intro' : sl.paragraphNumber;
    (byPara[k] = byPara[k] || []).push(sl);
  });

  $('#pvParaList').innerHTML = pv.paragraphs.map(p => {
    const key = p.number == null ? 'intro' : p.number;
    const slides = byPara[key] || [];
    const chips = slides.map((s,i)=>`<span class="slide-chip">slide ${i+1} · ${s.charCount} car.</span>`).join('');
    const label = p.number == null ? 'Introdução' : ('Parágrafo ' + p.number);
    const preview = esc((p.text || '').slice(0, 160)) + (p.text && p.text.length > 160 ? '…' : '');
    return `<div class="para-item">
      <span class="pc">${p.charCount} car.</span>
      <span class="pn">${esc(label)}</span>
      <div style="margin-top:6px;color:var(--cinza-txt)">${preview}</div>
      <div style="margin-top:6px">${chips}</div>
    </div>`;
  }).join('');
}

async function saveMessage() {
  const data = {
    title: $('#fTitle').value.trim(),
    day: $('#fDay').value,
    month: $('#fMonth').value,
    year: $('#fYear').value,
    translation: $('#fTr').value,
    originalText: $('#fText').value,
    charLimit: S.settings.charLimit
  };
  if (!data.title) { toast('Informe o título da mensagem.', 'err'); return; }
  if (!data.originalText.trim()) { toast('Cole o texto da mensagem.', 'err'); return; }

  let res;
  if (editingId) {
    res = await window.api.messages.update(editingId, data);
    toast('Mensagem atualizada.', 'ok');
  } else {
    res = await window.api.messages.create(data);
    toast('Mensagem salva.', 'ok');
  }
  editingId = null;
  await reloadMessages();
  go('biblioteca');
}

function editMessage(id) {
  editingId = id;
  go('nova');
}

/* ============================================================
   4. BUSCA
   ============================================================ */
let searchTab = 'titulo';

function renderBusca() {
  $('#page-busca').innerHTML = `
    <div class="page-head"><h1 class="page-title">Busca <small>Localize por título/parágrafo ou por palavra/frase</small></h1></div>
    <div class="tabs">
      <button class="tab ${searchTab==='titulo'?'active':''}" data-tab="titulo">Título + Parágrafo</button>
      <button class="tab ${searchTab==='texto'?'active':''}" data-tab="texto">Palavra ou frase</button>
    </div>
    <div id="searchBody"></div>
  `;
  $$('#page-busca .tab').forEach(t => t.onclick = () => { searchTab = t.dataset.tab; renderBusca(); });
  if (searchTab === 'titulo') renderTitleSearch();
  else renderTextSearch();
}

function renderTitleSearch() {
  $('#searchBody').innerHTML = `
    <div class="toolbar">
      <input class="input search-input" id="stTitle" placeholder="Título — ex.: Humilha-te" style="flex:2">
      <input class="input" id="stPara" type="number" placeholder="Parágrafo — ex.: 46" style="width:180px">
      <button class="btn btn-primary" id="stGo">Buscar</button>
    </div>
    <div id="stResults"></div>
  `;
  const run = async () => {
    const title = $('#stTitle').value;
    const num = $('#stPara').value;
    if (!title.trim() && !num) { $('#stResults').innerHTML = ''; return; }
    const results = await window.api.search.titleParagraph(title, num);
    const box = $('#stResults');
    if (!results.length) { box.innerHTML = `<div class="empty"><div class="big">🔍</div>Nenhuma mensagem encontrada.</div>`; return; }
    box.innerHTML = results.map(r => {
      const paraInfo = (num && num !== '')
        ? (r.hasParagraph
            ? `<span class="badge tr">parágrafo ${r.paragraphNumber} encontrado</span>`
            : `<span class="badge" style="background:rgba(192,69,59,.2);color:var(--vermelho)">parágrafo ${r.paragraphNumber} não existe</span>`)
        : '';
      return `<div class="result-row" data-id="${r.id}" data-slide="${r.slideIndex != null ? r.slideIndex : 0}">
        <div class="result-head">
          <span class="rt">${esc(r.title)}</span>
          ${r.translation ? `<span class="badge tr">${esc(r.translation)}</span>` : ''}
          <span>${esc(r.dateLabel)}</span>
          <span>${r.slideCount} slides</span>
          ${paraInfo}
        </div>
        <div class="muted" style="font-size:12.5px">Clique para abrir na projeção${(num&&r.hasParagraph)?' no parágrafo '+r.paragraphNumber:''}.</div>
      </div>`;
    }).join('');
    $$('.result-row', box).forEach(row => {
      row.onclick = () => openInProjection(row.dataset.id, parseInt(row.dataset.slide,10) || 0);
    });
  };
  $('#stGo').onclick = run;
  $('#stTitle').oninput = debounce(run, 300);
  $('#stPara').oninput = debounce(run, 300);
  $('#stTitle').onkeydown = (e) => { if (e.key === 'Enter') run(); };
  $('#stPara').onkeydown = (e) => { if (e.key === 'Enter') run(); };
  $('#stTitle').focus();
}

function renderTextSearch() {
  $('#searchBody').innerHTML = `
    <div class="toolbar">
      <input class="input search-input" id="ftQuery" placeholder="Digite uma palavra ou frase — ex.: Deus está">
      <button class="btn btn-primary" id="ftGo">Buscar</button>
    </div>
    <div class="muted" id="ftCount" style="margin-bottom:12px"></div>
    <div id="ftResults"></div>
  `;
  const run = async () => {
    const q = $('#ftQuery').value;
    if (!q.trim()) { $('#ftResults').innerHTML=''; $('#ftCount').textContent=''; return; }
    const results = await window.api.search.fullText(q, { context: 55 });
    $('#ftCount').textContent = `${results.length} ocorrência(s) encontrada(s).`;
    const box = $('#ftResults');
    if (!results.length) { box.innerHTML = `<div class="empty"><div class="big">🔍</div>Nada encontrado para "${esc(q)}".</div>`; return; }
    box.innerHTML = results.map((r, i) => `
      <div class="result-row" data-idx="${i}">
        <div class="result-head">
          <span class="rt">${esc(r.title)}</span>
          ${r.translation ? `<span class="badge tr">${esc(r.translation)}</span>` : ''}
          <span>${esc(r.dateLabel)}</span>
          <span class="badge">Parágrafo ${r.paragraphNumber == null ? '—' : r.paragraphNumber}</span>
        </div>
        <div class="snippet">${esc(r.before)}<mark>${esc(r.match)}</mark>${esc(r.after)}</div>
      </div>`).join('');
    $$('.result-row', box).forEach(row => {
      const r = results[parseInt(row.dataset.idx,10)];
      row.onclick = () => openInProjection(r.messageId, r.slideIndex >= 0 ? r.slideIndex : 0);
    });
  };
  $('#ftGo').onclick = run;
  $('#ftQuery').oninput = debounce(run, 350);
  $('#ftQuery').onkeydown = (e) => { if (e.key === 'Enter') run(); };
  $('#ftQuery').focus();
}

/* ============================================================
   5. PROJEÇÃO
   ============================================================ */
async function openInProjection(id, slideIndex = 0) {
  const full = await window.api.messages.get(id);
  if (!full) { toast('Mensagem não encontrada.', 'err'); return; }
  S.current = full;
  S.slideIndex = Math.max(0, Math.min(slideIndex, (full.slides.length || 1) - 1));
  go('projecao');
  pushCurrentSlide();
}

function buildState(active = true) {
  const m = S.current;
  if (!m || !m.slides || !m.slides.length) {
    return { active: false, text: '', slideIndex: 0, slideTotal: 0 };
  }
  const sl = m.slides[S.slideIndex];
  const st = S.settings;
  return {
    active,
    text: sl.text,
    paragraphNumber: sl.paragraphNumber,
    slideIndex: S.slideIndex,
    slideTotal: m.slides.length,
    title: m.title,
    dateLabel: m.dateLabel || dateLabelOf(m),
    translation: m.translation,
    fontSize: st.fontSize,
    paragraphFontSize: st.paragraphFontSize,
    metaFontSize: st.metaFontSize,
    fontFamily: st.fontFamily,
    autoFit: st.autoFit,
    autoFitMax: st.autoFitMax,
    textOpacity: st.textOpacity,
    background: st.background,
    textColor: st.textColor,
    showParagraphNumber: st.showParagraphNumber,
    showTitleDate: st.showTitleDate
  };
}

function pushCurrentSlide() {
  const state = buildState(true);
  window.api.projection.push(state);
  renderProjecao();
}

function setSlide(i) {
  if (!S.current || !S.current.slides.length) return;
  S.slideIndex = Math.max(0, Math.min(i, S.current.slides.length - 1));
  pushCurrentSlide();
}

function renderProjecao() {
  const m = S.current;
  const page = $('#page-projecao');
  if (!m || !m.slides || !m.slides.length) {
    const msgs = [...S.messages].sort((a,b)=>(a.title||'').localeCompare(b.title||'','pt'));
    page.innerHTML = `
      <div class="page-head"><h1 class="page-title">Projeção <small>Selecione uma mensagem para projetar</small></h1></div>
      ${msgs.length ? `<div class="select-grid">${msgs.map(x=>`
        <button class="select-card" data-id="${x.id}">
          <div class="sc-top"><span class="sc-ico">📄</span><span class="sc-play">📽️</span></div>
          <div class="sc-title">${esc(x.title)}</div>
          <div class="sc-sub">${esc(x.dateLabel || dateLabelOf(x))}</div>
          <div class="sc-foot">${x.translation ? `<span class="badge tr">${esc(x.translation)}</span>` : ''}<span class="muted">${x.slideCount} slides</span></div>
        </button>`).join('')}</div>`
      : `<div class="empty"><div class="big">📽️</div>Nenhuma mensagem cadastrada ainda. Vá em <a href="#" id="pNova" style="color:var(--laranja)">Nova Mensagem</a> para começar.</div>`}
    `;
    $$('#page-projecao .select-card').forEach(c => c.onclick = () => openInProjection(c.dataset.id, 0));
    const nova = $('#pNova'); if (nova) nova.onclick = (e)=>{e.preventDefault();go('nova');};
    return;
  }

  const sl = m.slides[S.slideIndex];
  const st = S.settings;
  const scale = 0.62; // fator da prévia (a projeção real usa o tamanho cheio)
  const previewFont = Math.round(st.fontSize * scale);
  const previewPara = Math.round((st.paragraphFontSize || 26) * scale);
  const previewMeta = Math.round((st.metaFontSize || 22) * scale);
  const op = st.textOpacity == null ? 1 : st.textOpacity;

  page.innerHTML = `
    <div class="page-head">
      <div>
        <div class="proj-current-title">${esc(m.title)}</div>
        <div class="proj-current-sub">${esc(m.dateLabel || dateLabelOf(m))} ${m.translation ? '· '+esc(m.translation) : ''}</div>
      </div>
      <div class="proj-controls">
        <button class="btn" id="pcOpen">🖥️ Abrir janela de projeção</button>
        <select id="pcDisplay" class="input" style="min-width:150px"></select>
        <button class="btn btn-danger" id="pcClose">Fechar janela</button>
      </div>
    </div>

    <div class="proj-layout">
      <div class="slide-list" id="slideList"></div>
      <div class="proj-main">
        <div class="proj-preview">
          <div class="pp-block">
            ${st.showParagraphNumber && sl.paragraphNumber != null ? `<div class="pp-para" style="font-size:${previewPara}px; color:${st.textColor}; opacity:${op}">Parágrafo ${sl.paragraphNumber}</div>` : ''}
            <div class="pp-text" style="font-size:${previewFont}px; color:${st.textColor}; opacity:1; font-family:${st.fontFamily || "Georgia, serif"}">${esc(sl.text)}</div>
            ${st.showTitleDate ? `<div class="pp-meta" style="font-size:${previewMeta}px; color:${st.textColor}; opacity:${op}">${esc(m.title)} — ${esc(m.dateLabel || dateLabelOf(m))}</div>` : ''}
          </div>
        </div>
        <div class="proj-info">
          <span>Parágrafo <b>${sl.paragraphNumber == null ? '—' : sl.paragraphNumber}</b></span>
          <span>Slide <b>${S.slideIndex + 1}</b> de <b>${m.slides.length}</b></span>
          <span>${sl.charCount} caracteres</span>
        </div>
        <div class="proj-controls">
          <button class="btn" id="pFirst" title="Home">⏮ Primeiro</button>
          <button class="btn" id="pPrev" title="←">◀ Anterior</button>
          <button class="btn btn-primary" id="pNext" title="→ / espaço">Próximo ▶</button>
          <button class="btn" id="pLast" title="End">Último ⏭</button>
          <span class="spacer"></span>
          <span class="muted" style="font-size:12px">← → Home End · espaço = próximo</span>
        </div>
      </div>
    </div>
  `;

  // Lista de slides
  const list = $('#slideList');
  list.innerHTML = m.slides.map((s, i) => `
    <div class="slide-thumb ${i===S.slideIndex?'active':''}" data-i="${i}">
      <div class="st-head">§ ${s.paragraphNumber == null ? '—' : s.paragraphNumber} · slide ${i+1}</div>
      <div class="st-text">${esc(s.text)}</div>
    </div>`).join('');
  $$('.slide-thumb', list).forEach(t => t.onclick = () => setSlide(parseInt(t.dataset.i,10)));
  const activeThumb = $('.slide-thumb.active', list);
  if (activeThumb) activeThumb.scrollIntoView({ block: 'nearest' });

  // A prévia também mostra o auto-ajuste (fonte enche a caixa).
  requestAnimationFrame(fitProjPreview);

  $('#pFirst').onclick = () => setSlide(0);
  $('#pPrev').onclick = () => setSlide(S.slideIndex - 1);
  $('#pNext').onclick = () => setSlide(S.slideIndex + 1);
  $('#pLast').onclick = () => setSlide(m.slides.length - 1);
  $('#pcClose').onclick = async () => { await window.api.projection.close(); S.projectionOpen = false; updateStatusDots(); toast('Janela de projeção fechada.'); };
  $('#pcOpen').onclick = async () => {
    const sel = $('#pcDisplay');
    const displayId = sel.value ? Number(sel.value) : undefined;
    await window.api.projection.open(displayId);
    S.projectionOpen = true;
    updateStatusDots();
    pushCurrentSlide();
    toast('Janela de projeção aberta.', 'ok');
  };

  // Monitores disponíveis
  window.api.projection.displays().then(displays => {
    const sel = $('#pcDisplay');
    if (!sel) return;
    sel.innerHTML = displays.map(d => `<option value="${d.id}">${esc(d.label)}</option>`).join('');
    const secondary = displays.find(d => !d.isPrimary);
    if (secondary) sel.value = secondary.id;
  });
}

// Encaixe da prévia interna: escolhe a maior fonte que cabe na caixa de preview.
function fitProjPreview() {
  const box = $('.proj-preview');
  if (!box) return;
  const block = $('.pp-block', box), txt = $('.pp-text', box);
  if (!block || !txt) return;
  const st = S.settings;
  const pad = 30; // padding da .proj-preview
  const availW = box.clientWidth - pad * 2;
  const availH = box.clientHeight - pad * 2;
  if (availW <= 0 || availH <= 0) return;
  const maxPx = st.autoFit
    ? Math.min(availH, (st.autoFitMax || 240))
    : Math.round((st.fontSize || 48) * 0.62);
  let lo = 8, hi = Math.max(8, maxPx), best = lo;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    txt.style.fontSize = mid + 'px';
    if (block.scrollWidth <= availW && block.scrollHeight <= availH) { best = mid; lo = mid; }
    else hi = mid;
  }
  txt.style.fontSize = best + 'px';
}

// Atalhos de teclado (ativos na página de projeção)
document.addEventListener('keydown', (e) => {
  const onProj = !$('#page-projecao').classList.contains('hidden');
  if (!onProj || !S.current) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  switch (e.key) {
    case 'ArrowRight': case ' ': e.preventDefault(); setSlide(S.slideIndex + 1); break;
    case 'ArrowLeft': e.preventDefault(); setSlide(S.slideIndex - 1); break;
    case 'Home': e.preventDefault(); setSlide(0); break;
    case 'End': e.preventDefault(); setSlide(S.current.slides.length - 1); break;
  }
});

/* ============================================================
   6. TRANSMISSÃO
   ============================================================ */
async function renderTransmissao() {
  const st = await window.api.server.status();
  S.serverStatus = st;
  const running = st.running;
  $('#page-transmissao').innerHTML = `
    <div class="page-head"><h1 class="page-title">Transmissão <small>Rede local — funciona sem internet</small></h1></div>
    <div class="trans-grid">
      <div class="card">
        <div class="big-status"><span class="live-dot ${running?'on':''}"></span> ${running ? 'Transmissão ativa' : 'Transmissão inativa'}</div>
        <div class="muted" style="margin-bottom:16px">Inicie o servidor para transmitir os slides pela rede local.</div>
        <div style="display:flex; gap:10px; margin-bottom:8px">
          <button class="btn btn-primary" id="srvStart" ${running?'disabled':''}>▶ Iniciar transmissão</button>
          <button class="btn btn-danger" id="srvStop" ${running?'':'disabled'}>■ Parar transmissão</button>
        </div>
        <div class="kv"><span>IP do computador</span><span><b>${esc(st.ip)}</b></span></div>
        <div class="kv"><span>Porta</span><span><b>${st.port}</b></span></div>
        <div class="kv"><span>Dispositivos conectados</span><span><b id="cliCount">${st.clients}</b></span></div>
        <div class="kv"><span>Último slide enviado</span><span><b>${S.current ? 'Slide '+(S.slideIndex+1) : '—'}</b></span></div>
      </div>
      <div class="card">
        <div style="font-weight:600; margin-bottom:6px">Endereços</div>
        <div class="muted" style="font-size:13px; margin-bottom:4px">Slide completo (fundo + texto + parágrafo + título):</div>
        <div class="addr-box"><code id="addrSlide">${esc(st.address)}</code><button class="btn btn-sm" data-copy="addrSlide">Copiar</button></div>
        <div class="muted" style="font-size:13px; margin:10px 0 4px">Somente texto, fundo transparente (fonte de navegador no OBS):</div>
        <div class="addr-box"><code id="addrText">${esc(st.textAddress)}</code><button class="btn btn-sm" data-copy="addrText">Copiar</button></div>
        <div class="muted" style="font-size:12.5px; margin-top:14px">
          Abra esse endereço em outro computador, celular ou no OBS (fonte de navegador),
          conectado à mesma rede Wi-Fi/cabo. Ao trocar o slide aqui, os dispositivos atualizam sozinhos.
        </div>
        ${st.allIPs && st.allIPs.length > 1 ? `<div class="muted" style="font-size:12px;margin-top:10px">Outros IPs detectados: ${st.allIPs.map(esc).join(', ')}</div>` : ''}
      </div>
    </div>
  `;
  $('#srvStart').onclick = async () => {
    const res = await window.api.server.start(S.settings.port);
    if (res.ok) { toast('Transmissão iniciada.', 'ok'); if (S.current) pushCurrentSlide(); }
    else toast(res.error || 'Falha ao iniciar.', 'err');
    updateStatusDots();
    renderTransmissao();
  };
  $('#srvStop').onclick = async () => {
    await window.api.server.stop();
    toast('Transmissão parada.');
    updateStatusDots();
    renderTransmissao();
  };
  $$('[data-copy]').forEach(b => b.onclick = () => {
    const text = $('#'+b.dataset.copy).textContent;
    navigator.clipboard.writeText(text).then(()=>toast('Endereço copiado.', 'ok'));
  });
}

/* ============================================================
   7. CONFIGURAÇÕES
   ============================================================ */
function renderConfig() {
  const s = S.settings;
  $('#page-config').innerHTML = `
    <div class="page-head"><h1 class="page-title">Configurações <small>As alterações ficam salvas ao fechar o aplicativo</small></h1></div>
    <div class="config-grid">
      <div class="card">
        <div style="font-weight:600;margin-bottom:8px">Aparência e projeção</div>
        <div class="config-row">
          <div class="cl">Tema<small>Claro ou escuro</small></div>
          <select id="cTheme" class="input"><option value="dark">Escuro</option><option value="light">Claro</option></select>
        </div>
        <div class="config-row">
          <div class="cl">Fonte do texto da mensagem</div>
          <select id="cFontFamily" class="input" style="max-width:240px">${FONTS.map(f=>`<option value="${esc(f.css)}">${esc(f.name)}</option>`).join('')}</select>
        </div>
        <div class="config-row">
          <div class="cl">Ajuste automático da fonte<small>O texto aumenta ou diminui sozinho para preencher a tela</small></div>
          <label class="switch"><input type="checkbox" id="cAutoFit" ${s.autoFit?'checked':''}><span class="track"></span></label>
        </div>
        <div class="config-row">
          <div class="cl">Tamanho máximo da fonte<small>Com ajuste automático: limite máximo · sem ele: tamanho fixo</small></div>
        </div>
        <div class="preset-row" id="fontPresets">
          <button class="preset-btn" data-size="120">Pequena</button>
          <button class="preset-btn" data-size="200">Padrão</button>
          <button class="preset-btn" data-size="270">Grande</button>
          <button class="preset-btn" data-size="330">Enorme</button>
          <button class="preset-btn" data-size="400">Gigante</button>
        </div>
        <div class="range-row">
          <button class="btn btn-sm" id="fMinus">−</button>
          <input type="range" id="cFont" min="18" max="400" value="${s.autoFit ? (s.autoFitMax||240) : s.fontSize}">
          <button class="btn btn-sm" id="fPlus">+</button>
          <span class="range-val" id="cFontVal">${s.autoFit ? (s.autoFitMax||240) : s.fontSize}px</span>
        </div>
        <div class="cfg-preview"><span id="cfgPreviewText">Exemplo de texto projetado</span></div>
        <div class="muted" style="font-size:11px;margin-top:4px">Prévia ilustrativa (a projeção real ajusta o texto à tela).</div>
        <div class="config-row">
          <div class="cl">Tamanho do número do parágrafo</div>
        </div>
        <div class="range-row">
          <button class="btn btn-sm" id="pMinus">−</button>
          <input type="range" id="cPara" min="10" max="120" value="${s.paragraphFontSize}">
          <button class="btn btn-sm" id="pPlus">+</button>
          <span class="range-val" id="cParaVal">${s.paragraphFontSize}px</span>
        </div>
        <div class="config-row">
          <div class="cl">Tamanho do título e data</div>
        </div>
        <div class="range-row">
          <button class="btn btn-sm" id="mMinus">−</button>
          <input type="range" id="cMeta" min="10" max="120" value="${s.metaFontSize}">
          <button class="btn btn-sm" id="mPlus">+</button>
          <span class="range-val" id="cMetaVal">${s.metaFontSize}px</span>
        </div>
        <div class="config-row">
          <div class="cl">Opacidade do parágrafo, título e data<small>Só afeta esses itens — o texto da mensagem fica sempre 100%</small></div>
        </div>
        <div class="range-row">
          <button class="btn btn-sm" id="oMinus">−</button>
          <input type="range" id="cOpacity" min="5" max="100" value="${Math.round((s.textOpacity==null?1:s.textOpacity)*100)}">
          <button class="btn btn-sm" id="oPlus">+</button>
          <span class="range-val" id="cOpacityVal">${Math.round((s.textOpacity==null?1:s.textOpacity)*100)}%</span>
        </div>
        <div class="config-row">
          <div class="cl">Cor de fundo da projeção</div>
          <input type="color" id="cBg" value="${s.background}" style="width:52px;height:34px;border:0;background:none">
        </div>
        <div class="config-row">
          <div class="cl">Cor do texto</div>
          <input type="color" id="cFg" value="${s.textColor}" style="width:52px;height:34px;border:0;background:none">
        </div>
        <div class="config-row">
          <div class="cl">Mostrar número do parágrafo</div>
          <label class="switch"><input type="checkbox" id="cShowPara" ${s.showParagraphNumber?'checked':''}><span class="track"></span></label>
        </div>
        <div class="config-row">
          <div class="cl">Mostrar título e data</div>
          <label class="switch"><input type="checkbox" id="cShowMeta" ${s.showTitleDate?'checked':''}><span class="track"></span></label>
        </div>
      </div>

      <div class="card">
        <div style="font-weight:600;margin-bottom:8px">Slides e transmissão</div>
        <div class="config-row">
          <div class="cl">Limite de caracteres por slide<small>Padrão 250 — recalcula todas as mensagens</small></div>
          <input class="input" id="cLimit" type="number" min="80" max="1000" value="${s.charLimit}" style="width:100px">
        </div>
        <div class="config-row">
          <div class="cl">Porta da transmissão<small>Padrão 5757</small></div>
          <input class="input" id="cPort" type="number" min="1024" max="65535" value="${s.port}" style="width:100px">
        </div>
        <div style="margin-top:16px;font-weight:600;margin-bottom:8px">Backup e dados</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button class="btn btn-block" id="bExport">⭳ Exportar backup</button>
          <button class="btn btn-block" id="bImport">⭱ Importar backup</button>
          <button class="btn btn-danger btn-block" id="bWipe">Apagar todos os dados</button>
        </div>
        <div class="muted" id="dataPath" style="font-size:11.5px;margin-top:14px"></div>
      </div>

      <div class="card" style="grid-column:1/-1">
        <div style="font-weight:600;margin-bottom:4px">Sincronização na nuvem</div>
        <div class="muted" style="font-size:12.5px;margin-bottom:10px">
          Compartilha a mesma biblioteca de mensagens entre vários computadores.
          O aplicativo continua funcionando normalmente sem internet.
        </div>
        <div class="config-row">
          <div class="cl">Ativar sincronização<small>Sincroniza ao abrir o aplicativo</small></div>
          <label class="switch"><input type="checkbox" id="cSyncOn" ${s.cloudEnabled?'checked':''}><span class="track"></span></label>
        </div>
        <div class="field" style="margin-top:10px">
          <label>Endereço do projeto (URL)</label>
          <input class="input" id="cSyncUrl" placeholder="https://xxxxxxxx.supabase.co" value="${esc(s.cloudUrl||'')}">
        </div>
        <div class="field" style="margin-top:10px">
          <label>Chave pública (anon key)</label>
          <input class="input" id="cSyncKey" type="password" placeholder="cole aqui a chave anon/public" value="${esc(s.cloudKey||'')}">
        </div>
        <div class="field" style="margin-top:10px">
          <label>Chave da igreja<small style="color:var(--cinza-txt)"> — a mesma em todos os computadores</small></label>
          <input class="input" id="cSyncWs" placeholder="ex.: tabernaculo-a-voz-do-cristao" value="${esc(s.cloudWorkspace||'')}">
        </div>
        <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;align-items:center">
          <button class="btn" id="cSyncTest">🔌 Testar conexão</button>
          <button class="btn btn-primary" id="cSyncNow">🔄 Sincronizar agora</button>
          <span class="muted" id="cSyncStatus" style="font-size:12.5px"></span>
        </div>
      </div>
    </div>
  `;

  $('#cTheme').value = s.theme;
  $('#cFontFamily').value = s.fontFamily || FONTS[0].css;
  const commit = (patch) => { S.settings = { ...S.settings, ...patch }; window.api.settings.save(patch); applyTheme(); };

  $('#cTheme').onchange = (e) => commit({ theme: e.target.value });
  $('#cFontFamily').onchange = (e) => { commit({ fontFamily: e.target.value }); if (S.current) pushCurrentSlide(); };
  $('#cBg').onchange = (e) => { commit({ background: e.target.value }); if (S.current) pushCurrentSlide(); };
  $('#cFg').onchange = (e) => { commit({ textColor: e.target.value }); if (S.current) pushCurrentSlide(); };
  $('#cShowPara').onchange = (e) => { commit({ showParagraphNumber: e.target.checked }); if (S.current) pushCurrentSlide(); };
  $('#cShowMeta').onchange = (e) => { commit({ showTitleDate: e.target.checked }); if (S.current) pushCurrentSlide(); };

  $('#cAutoFit').onchange = (e) => { commit({ autoFit: e.target.checked }); if (S.current) pushCurrentSlide(); renderConfig(); };

  const font = $('#cFont'), fontVal = $('#cFontVal');
  const previewText = $('#cfgPreviewText');
  const updateFontUI = (v) => {
    font.value = v; fontVal.textContent = v + 'px';
    if (previewText) {
      previewText.style.fontFamily = S.settings.fontFamily || 'Georgia, serif';
      previewText.style.fontSize = Math.max(14, Math.min(52, Math.round(v * 0.17))) + 'px';
    }
    $$('#fontPresets .preset-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.size,10) === v));
  };
  const setFont = (v) => {
    v = Math.max(18, Math.min(400, v));
    updateFontUI(v);
    // Com ajuste automático, o controle é o limite máximo; sem ele, o tamanho fixo.
    commit(S.settings.autoFit ? { autoFitMax: v } : { fontSize: v });
    if (S.current) pushCurrentSlide();
  };
  updateFontUI(parseInt(font.value, 10));
  font.oninput = (e) => setFont(parseInt(e.target.value,10));
  $('#fMinus').onclick = () => setFont(parseInt(font.value,10) - 2);
  $('#fPlus').onclick = () => setFont(parseInt(font.value,10) + 2);
  $$('#fontPresets .preset-btn').forEach(b => b.onclick = () => setFont(parseInt(b.dataset.size,10)));

  // Tamanho do número do parágrafo (independente)
  const para = $('#cPara'), paraVal = $('#cParaVal');
  const setPara = (v) => {
    v = Math.max(10, Math.min(120, v));
    para.value = v; paraVal.textContent = v + 'px';
    commit({ paragraphFontSize: v });
    if (S.current) pushCurrentSlide();
  };
  para.oninput = (e) => setPara(parseInt(e.target.value,10));
  $('#pMinus').onclick = () => setPara(parseInt(para.value,10) - 2);
  $('#pPlus').onclick = () => setPara(parseInt(para.value,10) + 2);

  // Tamanho do título e data (independente)
  const meta = $('#cMeta'), metaVal = $('#cMetaVal');
  const setMeta = (v) => {
    v = Math.max(10, Math.min(120, v));
    meta.value = v; metaVal.textContent = v + 'px';
    commit({ metaFontSize: v });
    if (S.current) pushCurrentSlide();
  };
  meta.oninput = (e) => setMeta(parseInt(e.target.value,10));
  $('#mMinus').onclick = () => setMeta(parseInt(meta.value,10) - 2);
  $('#mPlus').onclick = () => setMeta(parseInt(meta.value,10) + 2);

  // Opacidade / transparência do texto
  const opac = $('#cOpacity'), opacVal = $('#cOpacityVal');
  const setOpac = (v) => {
    v = Math.max(5, Math.min(100, v));
    opac.value = v; opacVal.textContent = v + '%';
    commit({ textOpacity: v / 100 });
    if (S.current) pushCurrentSlide();
  };
  opac.oninput = (e) => setOpac(parseInt(e.target.value,10));
  $('#oMinus').onclick = () => setOpac(parseInt(opac.value,10) - 5);
  $('#oPlus').onclick = () => setOpac(parseInt(opac.value,10) + 5);

  $('#cLimit').onchange = async (e) => {
    const v = Math.max(80, Math.min(1000, parseInt(e.target.value,10) || 250));
    e.target.value = v;
    commit({ charLimit: v });
    const n = await window.api.messages.rebuildAll(v);
    await reloadMessages();
    if (S.current) {
      S.current = await window.api.messages.get(S.current.id);
      S.slideIndex = 0;
      pushCurrentSlide();
    }
    toast(`Limite atualizado — ${n} mensagem(ns) recalculada(s).`, 'ok');
  };
  $('#cPort').onchange = (e) => {
    const v = Math.max(1024, Math.min(65535, parseInt(e.target.value,10) || 5757));
    e.target.value = v; commit({ port: v });
    toast('Porta salva. Reinicie a transmissão para aplicar.');
  };

  $('#bExport').onclick = async () => {
    const r = await window.api.backup.export();
    if (r.ok) toast('Backup exportado.', 'ok');
  };
  $('#bImport').onclick = async () => {
    const ok = await confirmModal('Importar backup',
      'Isso substituirá todas as mensagens e configurações atuais pelo conteúdo do arquivo. Deseja continuar?',
      'Importar', true);
    if (!ok) return;
    const r = await window.api.backup.import();
    if (r.ok) {
      S.settings = await window.api.settings.get();
      await reloadMessages();
      applyTheme();
      toast(`Backup importado (${r.count} mensagens).`, 'ok');
      renderConfig();
    } else if (r.error) toast(r.error, 'err');
  };
  $('#bWipe').onclick = async () => {
    const ok = await confirmModal('Apagar todos os dados',
      'Todas as mensagens e configurações serão <b>apagadas permanentemente</b>. Esta ação não pode ser desfeita.',
      'Apagar tudo', true);
    if (!ok) return;
    await window.api.backup.wipe();
    S.settings = await window.api.settings.get();
    S.current = null;
    await reloadMessages();
    applyTheme();
    toast('Todos os dados foram apagados.');
    renderConfig();
  };

  // ----- Sincronização na nuvem -----
  const syncStatus = $('#cSyncStatus');
  const semBarraFinal = (u) => { while (u.endsWith('/')) u = u.slice(0, -1); return u; };
  const cloudCfg = () => ({
    url: semBarraFinal($('#cSyncUrl').value.trim()),
    key: $('#cSyncKey').value.trim(),
    workspace: $('#cSyncWs').value.trim()
  });
  const salvarCloud = () => {
    const c = cloudCfg();
    commit({ cloudUrl: c.url, cloudKey: c.key, cloudWorkspace: c.workspace });
  };
  $('#cSyncUrl').onchange = salvarCloud;
  $('#cSyncKey').onchange = salvarCloud;
  $('#cSyncWs').onchange = salvarCloud;
  $('#cSyncOn').onchange = (e) => commit({ cloudEnabled: e.target.checked });

  $('#cSyncTest').onclick = async () => {
    salvarCloud();
    syncStatus.textContent = 'Testando…';
    const r = await window.api.cloud.test(cloudCfg());
    if (r.ok) { syncStatus.textContent = '✅ Conexão funcionando.'; toast('Conexão com a nuvem funcionando.', 'ok'); }
    else { syncStatus.textContent = '❌ ' + r.error; toast(r.error, 'err'); }
  };

  $('#cSyncNow').onclick = async () => {
    salvarCloud();
    syncStatus.textContent = 'Sincronizando…';
    const r = await window.api.cloud.sync();
    if (!r.ok) { syncStatus.textContent = '❌ ' + r.error; toast(r.error, 'err'); return; }
    const b = r.baixadas || {};
    let resumo = `✅ ${b.added||0} nova(s), ${b.updated||0} atualizada(s), ${b.removed||0} removida(s) · ${r.enviadas||0} enviada(s)`;
    if (b.exclusoesBloqueadas) {
      resumo += ` · ⚠ ${b.exclusoesBloqueadas} exclusões recusadas por segurança`;
      toast(`Por segurança, ${b.exclusoesBloqueadas} exclusões vindas da nuvem foram recusadas. Suas mensagens continuam aqui.`, 'err');
    }
    syncStatus.textContent = resumo;
    await reloadMessages();
    toast('Sincronização concluída.', 'ok');
  };

  window.api.app.info().then(info => {
    $('#dataPath').textContent = 'Dados salvos em: ' + info.dataFile;
  });
}

/* ============================================================
   Infra: tema, status, recarga
   ============================================================ */
function applyTheme() {
  const theme = S.settings.theme || 'dark';
  document.body.dataset.theme = theme;
  const btn = $('#themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function updateStatusDots() {
  $('#dotProj').classList.toggle('on', S.projectionOpen);
  $('#dotServer').classList.toggle('on', S.serverStatus.running);
}

async function reloadMessages() {
  S.messages = await window.api.messages.list();
}

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ---------- Eventos vindos do main ---------- */
window.api.projection.onClosed(() => { S.projectionOpen = false; updateStatusDots(); });
window.api.server.onClients((n) => {
  S.serverStatus.clients = n;
  const c = $('#cliCount'); if (c) c.textContent = n;
});

/* ---------- Inicialização ---------- */
(async function init() {
  S.settings = await window.api.settings.get();
  applyTheme();
  await reloadMessages();
  const st = await window.api.server.status();
  S.serverStatus = st;
  S.projectionOpen = await window.api.projection.isOpen();
  updateStatusDots();
  go('inicio');
})();
