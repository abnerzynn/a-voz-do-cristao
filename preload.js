'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (patch) => ipcRenderer.invoke('settings:save', patch)
  },
  messages: {
    list: () => ipcRenderer.invoke('messages:list'),
    get: (id) => ipcRenderer.invoke('messages:get', id),
    create: (data) => ipcRenderer.invoke('messages:create', data),
    update: (id, data) => ipcRenderer.invoke('messages:update', id, data),
    remove: (id) => ipcRenderer.invoke('messages:delete', id),
    duplicate: (id) => ipcRenderer.invoke('messages:duplicate', id),
    preview: (text, limit) => ipcRenderer.invoke('messages:preview', text, limit),
    rebuildAll: (limit) => ipcRenderer.invoke('messages:rebuildAll', limit),
    stats: () => ipcRenderer.invoke('messages:stats')
  },
  search: {
    titleParagraph: (title, num) => ipcRenderer.invoke('search:titleParagraph', title, num),
    fullText: (q, opts) => ipcRenderer.invoke('search:fullText', q, opts)
  },
  projection: {
    displays: () => ipcRenderer.invoke('projection:displays'),
    open: (displayId) => ipcRenderer.invoke('projection:open', displayId),
    close: () => ipcRenderer.invoke('projection:close'),
    isOpen: () => ipcRenderer.invoke('projection:isOpen'),
    push: (state) => ipcRenderer.invoke('projection:push', state),
    onState: (cb) => ipcRenderer.on('projection:state', (_e, s) => cb(s)),
    onClosed: (cb) => ipcRenderer.on('projection:closed', () => cb())
  },
  server: {
    start: (port) => ipcRenderer.invoke('server:start', port),
    stop: () => ipcRenderer.invoke('server:stop'),
    status: () => ipcRenderer.invoke('server:status'),
    onClients: (cb) => ipcRenderer.on('server:clients', (_e, n) => cb(n))
  },
  backup: {
    export: () => ipcRenderer.invoke('backup:export'),
    import: () => ipcRenderer.invoke('backup:import'),
    wipe: () => ipcRenderer.invoke('backup:wipe')
  },
  cloud: {
    config: () => ipcRenderer.invoke('cloud:config'),
    test: (cfg) => ipcRenderer.invoke('cloud:test', cfg),
    sync: () => ipcRenderer.invoke('cloud:sync'),
    onSynced: (cb) => ipcRenderer.on('cloud:synced', (_e, r) => cb(r))
  },
  app: {
    info: () => ipcRenderer.invoke('app:info')
  }
});
