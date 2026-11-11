'use strict';
/**
 * IPC işleyicileri — window.ferahla sözleşmesi (docs/SPEC.md).
 * Tüm işleyiciler Promise döner; hata olursa reject değil { ok:false, error, message } döner.
 */
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const safety = require('../core/safety');
const cleanup = require('../core/cleanup');
const startup = require('../core/startup');
const { sizeOfPath } = require('../core/fswalk');
const { errorResult, errorMessage, MESSAGES } = require('../core/errors');
const { cleanSummary, trashSummary, startupSummary } = require('../core/history');

const CH = (name) => `ferahla:${name}`;
const EVENTS = { scanProgress: 'ferahla:scan-progress', scanDone: 'ferahla:scan-done', cleanProgress: 'ferahla:clean-progress' };

/**
 * @param {object} d
 *   ipcMain, shell, app, getWindow():BrowserWindow|null, settings, history, scanner(ScanManager),
 *   platform (core/platform), isAdmin():Promise<boolean>, rendererIndex (index.html mutlak yolu), log?
 */
function registerIpc(d) {
  const { ipcMain, shell, app, getWindow, settings, history, scanner, platform } = d;
  const log = d.log || ((...a) => console.error('[ferahla]', ...a));
  const lang = () => { try { return settings.get().lang; } catch (e) { return 'tr'; } };
  // file:// URL karşılaştırması: kodlama ve (Windows'ta) harf farklarına dayanıklı.
  const normUrl = (u) => {
    let x = String(u || '').split(/[?#]/)[0];
    try { x = decodeURIComponent(x); } catch (e) { /* olduğu gibi */ }
    x = x.replace(/\\/g, '/');
    return process.platform === 'win32' ? x.toLowerCase() : x;
  };
  const trustedUrl = normUrl(pathToFileURL(d.rendererIndex).href);

  const send = (channel, payload) => {
    const w = getWindow();
    if (w && !w.isDestroyed() && !w.webContents.isDestroyed()) w.webContents.send(channel, payload);
  };

  function isTrustedSender(event) {
    const url = (event.senderFrame && event.senderFrame.url) || '';
    return url.startsWith('file:') && normUrl(url) === trustedUrl;
  }

  function handle(name, fn) {
    ipcMain.handle(CH(name), async (event, ...args) => {
      if (!isTrustedSender(event)) return errorResult('forbidden-sender', lang());
      try {
        return await fn(...args);
      } catch (e) {
        const code = e && typeof e.code === 'string' && MESSAGES[e.code] ? e.code : 'internal';
        if (code === 'internal') log(`${name} hata:`, e);
        return errorResult(code, lang());
      }
    });
  }

  const excludedForSearch = () => [...settings.get().excludedPaths, ...safety.systemDirs()];
  const isAbsString = (p) => typeof p === 'string' && p.length > 0 && p.length < 32768 && !p.includes('\0') && path.isAbsolute(p);

  // ---------- olaylar ----------
  scanner.on('progress', (p) => send(EVENTS.scanProgress, p));
  scanner.on('done', (p) => send(EVENTS.scanDone, p));

  // ---------- uygulama / ayarlar ----------
  handle('getAppInfo', async () => ({ version: app.getVersion(), platform: process.platform, isAdmin: await d.isAdmin() }));
  handle('getSettings', async () => settings.get());
  handle('setSettings', async (partial) => {
    const s = settings.set(partial);
    if (d.onSettingsChanged) d.onSettingsChanged(s);
    return s;
  });

  // ---------- sürücüler / tarama ----------
  handle('listDrives', async () => platform.listDrives());

  handle('scan', async (opts) => {
    const root = opts && opts.root;
    if (!isAbsString(root)) return errorResult('invalid-argument', lang());
    let st;
    try {
      st = await fsp.stat(root);
    } catch (e) {
      return errorResult(e.code === 'EACCES' || e.code === 'EPERM' ? 'access-denied' : 'not-found', lang());
    }
    if (!st.isDirectory()) return errorResult('not-found', lang());
    const skipDirs = process.platform === 'win32' ? [] : ['/proc', '/sys', '/dev', '/run'];
    const scanId = scanner.scan(path.resolve(root), { skipDirs });
    return { scanId };
  });

  handle('cancelScan', async () => scanner.cancel());

  handle('getChildren', async (p) => {
    if (!isAbsString(p)) return errorResult('invalid-argument', lang());
    const r = await scanner.getChildren(p);
    return r === null ? errorResult('not-in-scan', lang()) : r;
  });

  handle('findLarge', async (opts = {}) => {
    const o = opts && typeof opts === 'object' ? opts : {};
    const r = await scanner.findLarge({
      minBytes: Number.isFinite(o.minBytes) ? o.minBytes : undefined,
      limit: Number.isFinite(o.limit) ? o.limit : undefined,
      types: Array.isArray(o.types) ? o.types.filter((t) => typeof t === 'string') : undefined,
      excluded: excludedForSearch(),
    });
    return r === null ? errorResult('no-scan', lang()) : r;
  });

  handle('findDuplicates', async (opts = {}) => {
    const o = opts && typeof opts === 'object' ? opts : {};
    const r = await scanner.findDuplicates({
      minBytes: Number.isFinite(o.minBytes) ? o.minBytes : undefined,
      excluded: excludedForSearch(),
    });
    if (r === null) return errorResult('no-scan', lang());
    if (r.cancelled) return errorResult('cancelled', lang());
    return { groups: r.groups, wastedBytes: r.wastedBytes };
  });

  // ---------- çöp kutusuna taşıma ----------
  handle('trashItems', async (paths) => {
    if (!Array.isArray(paths)) return errorResult('invalid-argument', lang());
    const list = [...new Set(paths)].slice(0, 20000);
    const failed = [];
    const trashedPaths = [];
    let freedBytes = 0;
    const excludedPaths = settings.get().excludedPaths;
    for (const p of list) {
      const chk = safety.checkTrashable(p, { excludedPaths });
      if (!chk.ok) {
        failed.push({ path: String(p), error: chk.reason, message: errorMessage(chk.reason, lang()) });
        continue;
      }
      let size = null;
      try { size = await scanner.sizeOf(p); } catch (e) { size = null; }
      if (size === null) size = await sizeOfPath(chk.realPath);
      try {
        await shell.trashItem(chk.realPath);
        trashedPaths.push(p);
        freedBytes += size || 0;
      } catch (e) {
        failed.push({ path: p, error: 'trash-failed', message: errorMessage('trash-failed', lang()) });
      }
    }
    if (trashedPaths.length) {
      try { await scanner.removePaths(trashedPaths); } catch (e) { /* tarama yok */ }
      history.add({ action: 'trash', summary: trashSummary({ trashed: trashedPaths.length, freedBytes }), freedBytes });
    }
    return { ok: failed.length === 0 || trashedPaths.length > 0, trashed: trashedPaths.length, failed, freedBytes };
  });

  // ---------- güvenli temizlik ----------
  handle('getCleanupCategories', async () => {
    let processes = null;
    try { processes = await platform.listProcesses(); } catch (e) { processes = null; }
    return cleanup.getCategories({ platform, isAdmin: await d.isAdmin(), processes });
  });

  let cleaning = false;
  handle('cleanCategories', async (ids) => {
    if (!Array.isArray(ids) || ids.some((i) => typeof i !== 'string')) return errorResult('invalid-argument', lang());
    if (cleaning) return errorResult('busy', lang());
    cleaning = true;
    try {
      const r = await cleanup.cleanCategories(ids, {
        platform,
        isAdmin: await d.isAdmin(),
        onProgress: (p) => send(EVENTS.cleanProgress, p),
      });
      for (const x of r.results) if (x.error) x.message = errorMessage(x.error, lang());
      if (r.deleted > 0 || r.freedBytes > 0) {
        history.add({
          action: 'clean',
          summary: cleanSummary({ categories: r.results.filter((x) => !x.error).length, deleted: r.deleted, freedBytes: r.freedBytes, skippedInUse: r.skippedInUse }),
          freedBytes: r.freedBytes,
        });
      }
      if (!r.ok) {
        const first = r.results.find((x) => x.error);
        r.error = first ? first.error : 'clean-failed';
        r.message = errorMessage(r.error, lang());
      }
      return r;
    } finally {
      cleaning = false;
    }
  });

  // ---------- başlangıç ----------
  handle('getStartupItems', async () => startup.listStartupItems());

  async function toggleStartup(id, enabled, { record = true } = {}) {
    const r = await startup.setStartupItemEnabled(id, enabled, { isAdmin: await d.isAdmin() });
    if (!r.ok) return r;
    if (record && r.previous !== enabled) {
      history.add({
        action: 'startup',
        summary: startupSummary({ name: r.name, enabled }),
        undo: { type: 'startup', itemId: id, enabled: r.previous },
      });
    }
    return r;
  }

  handle('setStartupItemEnabled', async (id, enabled) => {
    if (typeof id !== 'string' || typeof enabled !== 'boolean') return errorResult('invalid-argument', lang());
    const r = await toggleStartup(id, enabled);
    return r.ok ? { ok: true } : errorResult(r.error, lang());
  });

  // ---------- geçmiş ----------
  handle('getHistory', async () => history.list());
  handle('undoHistory', async (id) => {
    if (typeof id !== 'string') return errorResult('invalid-argument', lang());
    const r = await history.undo(id, { setStartupItemEnabled: (itemId, en) => toggleStartup(itemId, en, { record: false }) });
    return r.ok ? { ok: true } : errorResult(r.error, lang());
  });

  // ---------- kabuk ----------
  handle('openRecycleBin', async () => {
    const c = platform.recycleBinOpenCommand();
    if (c.file) {
      const child = spawn(c.file, c.args || [], { detached: true, stdio: 'ignore', windowsHide: false });
      child.on('error', (e) => log('openRecycleBin', e));
      child.unref();
    } else if (c.openPath) {
      await shell.openPath(c.openPath);
    }
    return undefined;
  });

  handle('pickFolder', async () => {
    const p = d.pickFolder ? await d.pickFolder() : null;
    return typeof p === 'string' && p ? p : null;
  });

  handle('relaunchAsAdmin', async () => {
    const r = d.relaunchAsAdmin ? await d.relaunchAsAdmin() : { ok: false, error: 'unsupported' };
    return r.ok ? { ok: true } : errorResult(r.error || 'relaunch-failed', lang());
  });

  handle('revealInFolder', async (p) => {
    if (!isAbsString(p)) return undefined;
    shell.showItemInFolder(path.normalize(p));
    return undefined;
  });

  return { EVENTS };
}

module.exports = { registerIpc, EVENTS };
