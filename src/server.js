'use strict';

/**
 * Servidor local de transmissão (rede local, sem internet).
 *
 * Rotas:
 *   GET /              -> página inicial com os links
 *   GET /view/slide    -> slide completo (fundo, texto, parágrafo, título, data)
 *   GET /view/text     -> apenas o texto, fundo transparente (fonte de navegador no OBS)
 *   GET /events        -> Server-Sent Events: envia o estado a cada troca de slide
 *   GET /state         -> estado atual em JSON (carga inicial / fallback)
 *
 * Quando o operador troca o slide, broadcast() envia o novo estado a todos
 * os dispositivos conectados automaticamente.
 */

const http = require('http');
const os = require('os');

let server = null;
let clients = new Set();       // conexões SSE ativas (dispositivos conectados)
let currentState = emptyState();
let currentPort = 5757;
let onClientsChange = () => {};

function emptyState() {
  return {
    active: false,
    text: '',
    paragraphNumber: null,
    slideIndex: 0,
    slideTotal: 0,
    title: '',
    dateLabel: '',
    translation: '',
    fontSize: 48,
    background: '#000000',
    textColor: '#ffffff',
    showParagraphNumber: true,
    showTitleDate: true
  };
}

function localIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

function primaryIP() {
  const ips = localIPs();
  // Prefere faixas privadas comuns.
  return (
    ips.find(ip => ip.startsWith('192.168.')) ||
    ips.find(ip => ip.startsWith('10.')) ||
    ips.find(ip => /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) ||
    ips[0] ||
    '127.0.0.1'
  );
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function broadcast(partial) {
  currentState = { ...currentState, ...partial };
  const payload = 'data: ' + JSON.stringify(currentState) + '\n\n';
  for (const res of clients) {
    try { res.write(payload); } catch (_) { /* cliente caiu */ }
  }
}

function clientCount() {
  return clients.size;
}

// ---------- Páginas HTML ----------
function pageIndex() {
  const ip = primaryIP();
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>A Voz do Cristão — Transmissão</title>
<style>
  body{background:#111;color:#eee;font-family:system-ui,Arial,sans-serif;display:flex;
       min-height:100vh;align-items:center;justify-content:center;margin:0}
  .card{background:#1c1c1c;border:1px solid #333;border-radius:14px;padding:34px 40px;max-width:520px}
  h1{margin:0 0 4px;font-size:22px}
  .sub{color:#e39a2b;margin-bottom:20px;font-size:14px}
  a.btn{display:block;text-decoration:none;background:#e39a2b;color:#111;font-weight:600;
        padding:14px 16px;border-radius:10px;margin:10px 0;text-align:center}
  a.btn.alt{background:#2a2a2a;color:#eee;border:1px solid #444}
  code{color:#f0c987}
</style></head><body><div class="card">
  <h1>A Voz do Cristão</h1>
  <div class="sub">Transmissão pela rede local</div>
  <a class="btn" href="/view/slide">Abrir slide completo</a>
  <a class="btn alt" href="/view/text">Abrir somente texto (OBS / transparente)</a>
  <p style="color:#888;font-size:13px;margin-top:18px">
    Endereço deste servidor: <code>http://${esc(ip)}:${currentPort}/</code>
  </p>
</div></body></html>`;
}

// Estrutura comum: palco fixo 1920x1080 escalado para caber, com auto-encaixe.
function canvasStyles(transparent) {
  return `
  html,body{margin:0;height:100%;overflow:hidden;background:${transparent ? 'transparent' : '#000'}}
  #viewport{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
            overflow:hidden;background:${transparent ? 'transparent' : '#000'}}
  #canvas{width:1920px;height:1080px;flex-shrink:0;box-sizing:border-box;padding:60px 110px;
          display:flex;align-items:center;justify-content:center;transform-origin:center center}
  #block{max-width:1700px;text-align:center;display:flex;flex-direction:column;
         align-items:center;gap:34px;transform-origin:center center}
  #para{font-family:system-ui,Arial,sans-serif;font-weight:600}
  #text{line-height:1.32;white-space:pre-wrap;word-break:break-word${transparent ? ';text-shadow:0 2px 8px rgba(0,0,0,.55)' : ''}}
  #meta{font-family:system-ui,Arial,sans-serif}
  .hidden{display:none!important}`;
}

function pageSlide() {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Slide — A Voz do Cristão</title>
<style>${canvasStyles(false)}</style></head><body>
<div id="viewport"><div id="canvas"><div id="block">
  <div id="para" class="hidden"></div>
  <div id="text"></div>
  <div id="meta" class="hidden"></div>
</div></div></div>
<script>
${clientScript(true)}
</script></body></html>`;
}

function pageText() {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Texto — A Voz do Cristão</title>
<style>${canvasStyles(true)}</style></head><body>
<div id="viewport"><div id="canvas"><div id="block">
  <div id="para" class="hidden"></div>
  <div id="text"></div>
  <div id="meta" class="hidden"></div>
</div></div></div>
<script>
${clientScript(false)}
</script></body></html>`;
}

// Script comum aos clientes: assina SSE, monta o slide e encaixa em 1920x1080.
function clientScript(full) {
  return `
  var full = ${full ? 'true' : 'false'};
  var viewport = document.getElementById('viewport');
  var canvas = document.getElementById('canvas');
  var block = document.getElementById('block');
  var textEl = document.getElementById('text');
  var paraEl = document.getElementById('para');
  var metaEl = document.getElementById('meta');
  var CANVAS_W = 1920, CANVAS_H = 1080, PAD_X = 110, PAD_Y = 60;
  var cur = null;

  function fitCanvas(){
    var scale = Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H);
    canvas.style.transform = 'scale(' + scale + ')';
  }
  function fitText(availW, availH, maxPx){
    var lo = 20, hi = maxPx, best = lo;
    for(var i=0;i<14;i++){
      var mid = (lo+hi)/2;
      textEl.style.fontSize = mid + 'px';
      if(block.scrollWidth <= availW && block.scrollHeight <= availH){ best = mid; lo = mid; }
      else { hi = mid; }
    }
    textEl.style.fontSize = best + 'px';
  }
  function fitBlock(availW, availH){
    block.style.transform = 'scale(1)';
    var w = block.scrollWidth, h = block.scrollHeight, f = 1;
    if(w > availW) f = Math.min(f, availW / w);
    if(h > availH) f = Math.min(f, availH / h);
    if(f < 1) block.style.transform = 'scale(' + f + ')';
  }
  function applyFit(){
    if(!cur || !cur.text){ block.style.transform='scale(1)'; return; }
    var availW = CANVAS_W - PAD_X*2, availH = CANVAS_H - PAD_Y*2;
    block.style.transform = 'scale(1)';
    if(cur.autoFit !== false) fitText(availW, availH, cur.autoFitMax || 240);
    else textEl.style.fontSize = (cur.fontSize || 48) + 'px';
    fitBlock(availW, availH);
  }

  function render(s){
    if(!s) return;
    cur = s;
    var op = s.textOpacity == null ? 1 : s.textOpacity;
    // Texto da mensagem: SEMPRE 100% de opacidade, na fonte escolhida.
    textEl.textContent = s.text || '';
    textEl.style.fontSize = (s.fontSize || 48) + 'px';
    textEl.style.opacity = 1;
    textEl.style.color = s.textColor || '#fff';
    textEl.style.fontFamily = s.fontFamily || "Georgia, 'Times New Roman', serif";
    if(full){ viewport.style.background = s.background || '#000'; }
    // Parágrafo, título e data: aparecem no slide completo; no modo texto (OBS) ficam ocultos.
    if(full){
      paraEl.style.color = s.textColor || '#fff';
      metaEl.style.color = s.textColor || '#fff';
      paraEl.style.opacity = op;
      metaEl.style.opacity = op;
      paraEl.style.fontSize = (s.paragraphFontSize || 26) + 'px';
      metaEl.style.fontSize = (s.metaFontSize || 22) + 'px';
      if(s.showParagraphNumber && s.paragraphNumber != null){
        paraEl.textContent = 'Parágrafo ' + s.paragraphNumber;
        paraEl.classList.remove('hidden');
      } else { paraEl.classList.add('hidden'); }
      var meta = [];
      if(s.title) meta.push(s.title);
      if(s.dateLabel) meta.push(s.dateLabel);
      if(s.showTitleDate && meta.length){
        metaEl.textContent = meta.join(' — ');
        metaEl.classList.remove('hidden');
      } else { metaEl.classList.add('hidden'); }
    } else {
      paraEl.classList.add('hidden');
      metaEl.classList.add('hidden');
    }
    requestAnimationFrame(applyFit);
  }

  window.addEventListener('resize', function(){ fitCanvas(); applyFit(); });
  fitCanvas();

  function connect(){
    var es = new EventSource('/events');
    es.onmessage = function(e){ try{ render(JSON.parse(e.data)); }catch(_){} };
    es.onerror = function(){ es.close(); setTimeout(connect, 1500); };
  }
  fetch('/state').then(function(r){return r.json();}).then(render).catch(function(){});
  connect();
  `;
}

function handle(req, res) {
  const url = req.url.split('?')[0];

  if (url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('retry: 1500\n\n');
    res.write('data: ' + JSON.stringify(currentState) + '\n\n');
    clients.add(res);
    onClientsChange(clients.size);
    req.on('close', () => {
      clients.delete(res);
      onClientsChange(clients.size);
    });
    return;
  }

  const send = (type, body) => {
    res.writeHead(200, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
    res.end(body);
  };

  if (url === '/state') return send('application/json; charset=utf-8', JSON.stringify(currentState));
  if (url === '/view/slide') return send('text/html; charset=utf-8', pageSlide());
  if (url === '/view/text') return send('text/html; charset=utf-8', pageText());
  if (url === '/' || url === '/index.html') return send('text/html; charset=utf-8', pageIndex());

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Não encontrado');
}

function start(port, hooks = {}) {
  return new Promise((resolve, reject) => {
    if (server) return resolve(status());
    currentPort = Number(port) || 5757;
    onClientsChange = hooks.onClientsChange || (() => {});
    server = http.createServer(handle);
    server.on('error', (err) => {
      server = null;
      reject(err);
    });
    server.listen(currentPort, '0.0.0.0', () => {
      currentState.active = true;
      resolve(status());
    });
  });
}

function stop() {
  return new Promise((resolve) => {
    for (const res of clients) { try { res.end(); } catch (_) {} }
    clients.clear();
    currentState.active = false;
    if (server) {
      server.close(() => { server = null; resolve(status()); });
    } else {
      resolve(status());
    }
  });
}

function status() {
  const ip = primaryIP();
  return {
    running: !!server,
    ip,
    port: currentPort,
    address: `http://${ip}:${currentPort}/view/slide`,
    textAddress: `http://${ip}:${currentPort}/view/text`,
    clients: clients.size,
    allIPs: localIPs()
  };
}

module.exports = { start, stop, status, broadcast, clientCount, primaryIP, localIPs };
