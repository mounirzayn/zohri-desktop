// Pont minimal entre l'app et l'ordinateur : identifiant de la machine (essai gratuit), plein écran, veille
const { contextBridge, ipcRenderer } = require('electron');
const info = ipcRenderer.sendSync('zohri:info');
contextBridge.exposeInMainWorld('zohriDesktop', {
  machineId: info.machineId,
  os: info.os,
  version: info.version,
  toggleFullscreen: () => ipcRenderer.send('zohri:fullscreen'),
  setPlaying: (on) => ipcRenderer.send('zohri:playing', !!on)
});
