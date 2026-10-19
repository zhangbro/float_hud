'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hud', {
  onRows: (cb) => ipcRenderer.on('rows', (_e, data) => cb(data)),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  openConfig: () => ipcRenderer.invoke('open-config'),
  openConfigDir: () => ipcRenderer.invoke('open-config-dir'),
  previewStyle: (style) => ipcRenderer.send('preview-style', style),
  resize: (w, h) => ipcRenderer.send('resize-hud', w, h),
  moveWindowBy: (dx, dy) => ipcRenderer.send('move-window', dx, dy),
  showHudMenu: () => ipcRenderer.send('show-hud-menu'),
  setSize: (kind, index, w, h) => ipcRenderer.send('set-size', kind, index, w, h),
  activateLicense: (key) => ipcRenderer.invoke('activate-license', key),
  deactivateLicense: () => ipcRenderer.invoke('deactivate-license'),
});
