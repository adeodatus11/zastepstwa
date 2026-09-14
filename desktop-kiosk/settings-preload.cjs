const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('screens', {
  get: () => ipcRenderer.invoke('screens:get'),
  save: config => ipcRenderer.invoke('screens:save', config),
  identify: () => ipcRenderer.invoke('screens:identify'),
  onChange: callback => ipcRenderer.on('screens:changed', () => callback())
});
