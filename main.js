'use strict';
/**
 * Ferahla — ana süreç giriş noktası.
 * Arka planda çalışmaz: pencere kapanınca uygulama tamamen kapanır. Ağ isteği yapmaz, veri toplamaz.
 */
const { app, BrowserWindow, ipcMain, shell, nativeTheme, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');

const { Settings } = require('./src/main/settings');
const { registerIpc } = require('./src/main/ipc');
const { History } = require('./src/core/history');
const { ScanManager } = require('./src/core/scanner');
const { getPlatform } = require('./src/core/platform');

// Linux'ta root olarak (ör. konteyner) çalışırken Chromium sandbox'ı başlatılamaz. Ana süreçteki denetim JS'den önce
// yapıldığı için `npm start` bunu src/main/dev-start.js ile çözer; buradaki anahtar alt süreçler içindir.
if (process.platform === 'linux' && process.getuid?.() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
// Testler için ayrı veri klasörü (ayarlar, geçmiş).
if (process.env.FERAHLA_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.FERAHLA_USER_DATA));
}

const RENDERER_INDEX = path.join(__dirname, 'src', 'renderer', 'index.html');
const PRELOAD = path.join(__dirname, 'preload.js');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win = null;
  const platform = getPlatform();
  const scanner = new ScanManager();
  let settings;
  let history;
  let adminPromise = null;
  const isAdmin = () => (adminPromise ||= platform.isAdmin().catch(() => false));

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  function applyTheme(s) {
    nativeTheme.themeSource = s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system';
  }

  function createWindow() {
    const iconPath = ['icon.ico', 'icon-256.png', 'icon.png']
      .map((f) => path.join(__dirname, 'assets', f))
      .find((f) => (f.endsWith('.ico') ? process.platform === 'win32' : true) && fs.existsSync(f));
    win = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      show: false,
      title: 'Ferahla',
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#16181d' : '#f6f7f9',
      ...(iconPath ? { icon: iconPath } : {}),
      webPreferences: {
        preload: PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
        spellcheck: false,
      },
    });

    win.once('ready-to-show', () => win.show());
    win.on('closed', () => { win = null; });

    // Gezinme kilidi: uygulama yalnızca kendi sayfasını gösterir; dış bağlantılar tarayıcıda açılır.
    win.webContents.on('will-navigate', (e, url) => {
      if (url !== win.webContents.getURL()) e.preventDefault();
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('before-input-event', (e, input) => {
      if (!app.isPackaged && input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
        win.webContents.toggleDevTools();
      }
    });

    if (fs.existsSync(RENDERER_INDEX)) {
      win.loadFile(RENDERER_INDEX);
    } else {
      win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><meta charset="utf-8"><title>Ferahla</title><p style="font-family:sans-serif;padding:2em">Arayüz dosyaları bulunamadı (src/renderer/index.html).</p>'));
    }
  }

  app.whenReady().then(() => {
    const userData = app.getPath('userData');
    settings = new Settings(path.join(userData, 'settings.json'), { defaultLang: app.getLocale().toLowerCase().startsWith('tr') ? 'tr' : 'en' });
    history = new History(path.join(userData, 'history.json'));
    applyTheme(settings.get());
    isAdmin();

    Menu.setApplicationMenu(null);
    // Hiçbir web izni (kamera, bildirim, konum...) verilmez.
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

    registerIpc({
      ipcMain, shell, app, settings, history, scanner, platform, isAdmin,
      getWindow: () => win,
      rendererIndex: RENDERER_INDEX,
      onSettingsChanged: applyTheme,
    });

    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { scanner.dispose(); });
}
