// Zohri IPTV pour ordinateur : une fenêtre qui affiche l'app Zohri hébergée sur le serveur.
// Les mises à jour de l'app arrivent donc toutes seules, sans réinstaller.
const { app, BrowserWindow, ipcMain, session, shell, powerSaveBlocker, Menu } = require('electron');
const path = require('path');
const os = require('os');
const { machineIdSync } = require('node-machine-id');

const APP_URL = process.env.ZOHRI_URL || 'https://tivora-api.onrender.com/app/';
const APP_HOST = new URL(APP_URL).host;
// Les fournisseurs IPTV refusent souvent les navigateurs : on se présente comme un lecteur courant
const PLAYER_UA = 'VLC/3.0.20 LibVLC/3.0.20';

let win = null;
let blocker = null;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

// Lecture automatique du son sans clic, et décodage matériel
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let machineId = '';
try { machineId = machineIdSync(); } catch { machineId = os.hostname() + '-' + os.userInfo().username; }
ipcMain.on('zohri:info', (e) => {
  e.returnValue = { machineId, os: process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux', version: app.getVersion() };
});
ipcMain.on('zohri:fullscreen', () => { if (win) win.setFullScreen(!win.isFullScreen()); });
ipcMain.on('zohri:playing', (_e, on) => {
  if (on && blocker === null) blocker = powerSaveBlocker.start('prevent-display-sleep');
  if (!on && blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
});

function setupNetwork() {
  const ses = session.defaultSession;
  ses.webRequest.onBeforeSendHeaders((d, cb) => {
    const h = d.requestHeaders;
    let host = '';
    try { host = new URL(d.url).host; } catch {}
    const custom = h['X-Zohri-UA'] || h['x-zohri-ua'];
    delete h['X-Zohri-UA']; delete h['x-zohri-ua'];
    // Serveurs IPTV : user-agent de lecteur, et pas d'en-têtes de site web qui les font refuser
    if (host && host !== APP_HOST && !/(^|\.)(googleapis|gstatic|stripe)\.com$/.test(host)) {
      h['User-Agent'] = custom || PLAYER_UA;
      delete h['Origin']; delete h['origin']; delete h['Referer']; delete h['referer'];
      delete h['Sec-Fetch-Site']; delete h['Sec-Fetch-Mode']; delete h['Sec-Fetch-Dest'];
    }
    cb({ requestHeaders: h });
  });
  // Réponses des fournisseurs : on autorise leur lecture par l'app
  ses.webRequest.onHeadersReceived((d, cb) => {
    const h = d.responseHeaders || {};
    let host = '';
    try { host = new URL(d.url).host; } catch {}
    if (host !== APP_HOST) {
      for (const k of Object.keys(h)) if (/^access-control-allow-/i.test(k)) delete h[k];
      h['Access-Control-Allow-Origin'] = ['*'];
      h['Access-Control-Allow-Headers'] = ['*'];
    }
    cb({ responseHeaders: h });
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    backgroundColor: '#05060F', title: 'Zohri IPTV', show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      // Les playlists IPTV sont souvent en http et sur d'autres domaines : on lève ces blocages du navigateur
      webSecurity: false,
      allowRunningInsecureContent: true,
      backgroundThrottling: false
    }
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL(APP_URL);
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
    if (isMain && code !== -3) win.loadFile(path.join(__dirname, 'offline.html'), { query: { url: APP_URL } });
  });
  // Liens externes (paiement, site) : dans le navigateur de l'ordinateur
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    try {
      const u = new URL(url);
      if (u.protocol === 'file:' || (u.host === APP_HOST && u.pathname.startsWith('/app'))) return;
    } catch {}
    e.preventDefault(); shell.openExternal(url);
  });
  // F11 ou Alt+Entrée : plein écran ; Ctrl+R : recharger
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if ((input.control || input.meta) && input.key.toLowerCase() === 'r') { win.webContents.reloadIgnoringCache(); e.preventDefault(); }
  });
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  setupNetwork();
  createWindow();
  app.on('activate', () => { if (!win) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
