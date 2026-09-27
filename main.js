'use strict';

const { app, BrowserWindow, ipcMain, screen, dialog, globalShortcut } = require('electron');
const path = require('path');
const db = require('./src/db');
const server = require('./src/server');
const cloud = require('./src/cloud');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let projectionWindow = null;
let lastState = null; // último estado de projeção enviado

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 640,
    backgroundColor: '#111111',
    title: 'A Voz do Cristão',
    icon: path.join(__dirname, 'assets', 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ---------- Projeção (janela externa Electron) ----------
function getDisplays() {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  return displays.map((d, i) => ({
    id: d.id,
    index: i,
    label: `Monitor ${i + 1}${d.id === primary.id ? ' (principal)' : ''} — ${d.size.width}×${d.size.height}`,
    bounds: d.bounds,
    isPrimary: d.id === primary.id
  }));
}

function openProjectionWindow(displayId) {
  const displays = screen.getAllDisplays();
  let target = displays.find(d => d.id === displayId);
  if (!target) {
    // Prefere um monitor secundário, se existir.
    const primary = screen.getPrimaryDisplay();
    target = displays.find(d => d.id !== primary.id) || primary;
  }
  const { x, y, width, height } = target.bounds;

  if (projectionWindow && !projectionWindow.isDestroyed()) {
    projectionWindow.setBounds({ x, y, width, height });
    projectionWindow.setFullScreen(true);
    projectionWindow.focus();
    if (lastState) projectionWindow.webContents.send('projection:state', lastState);
    return { ok: true };
  }

  projectionWindow = new BrowserWindow({
    x, y, width, height,
    backgroundColor: '#000000',
    frame: false,
    fullscreen: true,
    autoHideMenuBar: true,
    title: 'Projeção — A Voz do Cristão',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  projectionWindow.removeMenu();
  projectionWindow.loadFile(path.join(__dirname, 'renderer', 'projection.html'));
  projectionWindow.webContents.on('did-finish-load', () => {
    if (lastState) projectionWindow.webContents.send('projection:state', lastState);
  });
  projectionWindow.on('closed', () => {
    projectionWindow = null;
    if (mainWindow) mainWindow.webContents.send('projection:closed');
  });
  return { ok: true };
}

function closeProjectionWindow() {
  if (projectionWindow && !projectionWindow.isDestroyed()) projectionWindow.close();
  projectionWindow = null;
  return { ok: true };
}

// Envia o estado para a janela de projeção E para o servidor de transmissão.
function pushState(state) {
  lastState = state;
  if (projectionWindow && !projectionWindow.isDestroyed()) {
    projectionWindow.webContents.send('projection:state', state);
  }
  if (server.status().running) {
    server.broadcast(state);
  }
}

// ---------- IPC ----------
function registerIpc() {
  // Configurações
  ipcMain.handle('settings:get', () => db.getSettings());
  ipcMain.handle('settings:save', (_e, patch) => db.saveSettings(patch));

  // Mensagens
  ipcMain.handle('messages:list', () => db.listMessages());
  ipcMain.handle('messages:get', (_e, id) => db.getMessage(id));
  ipcMain.handle('messages:create', (_e, data) => db.createMessage(data));
  ipcMain.handle('messages:update', (_e, id, data) => db.updateMessage(id, data));
  ipcMain.handle('messages:delete', (_e, id) => db.deleteMessage(id));
  ipcMain.handle('messages:duplicate', (_e, id) => db.duplicateMessage(id));
  ipcMain.handle('messages:preview', (_e, text, limit) => db.preview(text, limit));
  ipcMain.handle('messages:rebuildAll', (_e, limit) => db.rebuildAll(limit));
  ipcMain.handle('messages:stats', () => db.stats());

  // Busca
  ipcMain.handle('search:titleParagraph', (_e, title, num) => db.searchByTitleParagraph(title, num));
  ipcMain.handle('search:fullText', (_e, q, opts) => db.searchFullText(q, opts));

  // Projeção
  ipcMain.handle('projection:displays', () => getDisplays());
  ipcMain.handle('projection:open', (_e, displayId) => openProjectionWindow(displayId));
  ipcMain.handle('projection:close', () => closeProjectionWindow());
  ipcMain.handle('projection:isOpen', () => !!(projectionWindow && !projectionWindow.isDestroyed()));
  ipcMain.handle('projection:push', (_e, state) => { pushState(state); return true; });

  // Transmissão
  ipcMain.handle('server:start', async (_e, port) => {
    try {
      const s = await server.start(port || db.getSettings().port, {
        onClientsChange: (n) => {
          if (mainWindow) mainWindow.webContents.send('server:clients', n);
        }
      });
      if (lastState) server.broadcast(lastState);
      return { ok: true, status: s };
    } catch (err) {
      return { ok: false, error: err.code === 'EADDRINUSE'
        ? `A porta ${port} já está em uso. Escolha outra porta nas configurações.`
        : String(err.message || err) };
    }
  });
  ipcMain.handle('server:stop', async () => ({ ok: true, status: await server.stop() }));
  ipcMain.handle('server:status', () => server.status());

  // Backup
  ipcMain.handle('backup:export', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Exportar backup',
      defaultPath: `avoz-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'Backup JSON', extensions: ['json'] }]
    });
    if (canceled || !filePath) return { ok: false };
    db.exportBackup(filePath);
    return { ok: true, path: filePath };
  });
  ipcMain.handle('backup:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Importar backup',
      properties: ['openFile'],
      filters: [{ name: 'Backup JSON', extensions: ['json'] }]
    });
    if (canceled || !filePaths || !filePaths[0]) return { ok: false };
    try {
      const count = db.importBackup(filePaths[0]);
      return { ok: true, count };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('backup:wipe', () => db.wipeAll());

  // Sincronização na nuvem
  ipcMain.handle('cloud:config', () => db.getCloudConfig());
  ipcMain.handle('cloud:test', async (_e, cfg) => {
    try { await cloud.test(cfg); return { ok: true }; }
    catch (err) { return { ok: false, error: String(err.message || err) }; }
  });
  ipcMain.handle('cloud:sync', async () => doSync());

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    dataFile: path.join(app.getPath('userData'), 'avoz-database.json')
  }));
}

// ---------- Atualização automática (GitHub Releases) ----------
function setupAutoUpdate() {
  if (!app.isPackaged) return; // não checa em desenvolvimento
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Reiniciar e atualizar', 'Depois'],
      defaultId: 0,
      cancelId: 1,
      title: 'Atualização disponível',
      message: `Uma nova versão (${info.version}) foi baixada.`,
      detail: 'Deseja reiniciar o aplicativo agora para instalar a atualização? Suas mensagens serão mantidas.'
    }).then((r) => { if (r.response === 0) autoUpdater.quitAndInstall(); }).catch(() => {});
  });

  // Falhas (sem internet, sem release publicado etc.) não incomodam o usuário.
  autoUpdater.on('error', () => {});

  autoUpdater.checkForUpdatesAndNotify().catch(() => {});
}


// ---------- Sincronização na nuvem ----------
async function doSync() {
  const cfg = db.getCloudConfig();
  if (!cloud.configured(cfg)) {
    return { ok: false, error: 'Configure o endereço, a chave e a chave da igreja.' };
  }
  try {
    const since = cfg.lastSyncAt || '';
    // 1) Traz o que mudou na nuvem e aplica aqui.
    const rows = await cloud.pull(cfg, since);
    const aplicado = db.applyRemote(rows, db.getSettings().charLimit);
    // 2) Envia o que mudou aqui.
    const { messages, tombstones } = db.getLocalChanges(since);
    const enviadas = await cloud.push(cfg, messages, tombstones);
    // 3) Guarda a data, com folga de 5 minutos para tolerar relógios diferentes.
    const marca = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    db.setLastSync(marca);
    return { ok: true, baixadas: aplicado, enviadas, at: new Date().toISOString() };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

// Sincroniza sozinho ao abrir, se estiver configurado (sem incomodar em caso de falha).
async function syncOnStart() {
  const cfg = db.getCloudConfig();
  if (!cfg.enabled || !cloud.configured(cfg)) return;
  const r = await doSync();
  if (r.ok && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('cloud:synced', r);
  }
}

app.whenReady().then(() => {
  db.init(app.getPath('userData'));
  registerIpc();
  createMainWindow();
  setupAutoUpdate();
  syncOnStart();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', async () => {
  await server.stop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
