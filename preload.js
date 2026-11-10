'use strict';
/**
 * window.ferahla — renderer'ın gördüğü TEK API (docs/SPEC.md "IPC sözleşmesi").
 * sandbox:true altında çalışır: yalnızca 'electron' modülü kullanılabilir.
 */
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (name, ...args) =>
  ipcRenderer.invoke(`ferahla:${name}`, ...args).catch((e) => ({
    ok: false,
    error: 'internal',
    message: 'Beklenmeyen bir sorun oluştu. Uygulamayı yeniden başlatıp tekrar deneyin.',
    detail: String((e && e.message) || e),
  }));

function subscribe(channel, cb) {
  if (typeof cb !== 'function') return () => {};
  const listener = (_event, payload) => {
    try {
      cb(payload);
    } catch (e) {
      console.error(e);
    }
  };
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('ferahla', {
  getAppInfo: () => invoke('getAppInfo'),
  getSettings: () => invoke('getSettings'),
  setSettings: (partial) => invoke('setSettings', partial),
  listDrives: () => invoke('listDrives'),
  scan: (opts) => invoke('scan', { root: opts && opts.root }),
  cancelScan: () => invoke('cancelScan'),
  onScanProgress: (cb) => subscribe('ferahla:scan-progress', cb),
  onScanDone: (cb) => subscribe('ferahla:scan-done', cb),
  getChildren: (path) => invoke('getChildren', path),
  findLarge: (opts = {}) => invoke('findLarge', opts),
  findDuplicates: (opts = {}) => invoke('findDuplicates', opts),
  trashItems: (paths) => invoke('trashItems', paths),
  getCleanupCategories: () => invoke('getCleanupCategories'),
  cleanCategories: (ids) => invoke('cleanCategories', ids),
  onCleanProgress: (cb) => subscribe('ferahla:clean-progress', cb),
  getStartupItems: () => invoke('getStartupItems'),
  setStartupItemEnabled: (id, enabled) => invoke('setStartupItemEnabled', id, enabled),
  getHistory: () => invoke('getHistory'),
  undoHistory: (id) => invoke('undoHistory', id),
  openRecycleBin: () => invoke('openRecycleBin').then(() => undefined),
  revealInFolder: (path) => invoke('revealInFolder', path).then(() => undefined),
});
