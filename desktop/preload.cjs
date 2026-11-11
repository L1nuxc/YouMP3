const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  updateState: () => ipcRenderer.invoke('updates-state'),
  checkUpdate: () => ipcRenderer.invoke('updates-check'),
  downloadUpdate: () => ipcRenderer.invoke('updates-download'),
  installUpdate: () => ipcRenderer.invoke('updates-install'),
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  readClipboard: () => ipcRenderer.invoke('clipboard-read'),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard-write', text),
  openSource: (url) => ipcRenderer.invoke('open-source', url),
  exportTracks: (ids) => ipcRenderer.invoke('export-tracks', ids),
  showFile: (id) => ipcRenderer.invoke('show-file', id),
  createBackup: () => ipcRenderer.invoke('backup-create'),
  restoreBackup: () => ipcRenderer.invoke('backup-restore'),
});
