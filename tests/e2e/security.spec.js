'use strict';

/**
 * GÜVENLİK — renderer'dan doğrudan IPC ile beyaz liste/koruma dışını çöpe atma denemeleri, yalıtım, CSP, izinler,
 * IPC yüzeyi (Electron iç kanalları boş uygulamadan alınan taban çizgisiyle hariç), preload ↔ sözleşme.
 *
 * Gerçek sistem yollarına yönelik her istek, önce test sürecinde AYNI çekirdek güvenlik modülüyle (src/core/safety.js)
 * "kuru" denetlenir: modül yolu kabul edecekse ve yol korumalı alanın dışındaysa istek GÖNDERİLMEZ, bulgu olarak kaydedilir.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect, _electron } = require('playwright/test');
const H = require('./helpers');

const safety = require(path.join(H.ROOT, 'src', 'core', 'safety.js'));

// docs/SPEC.md — window.ferahla (23 işlev)
const CONTRACT = [
  'getAppInfo', 'getSettings', 'setSettings', 'listDrives', 'scan', 'cancelScan', 'onScanProgress', 'onScanDone',
  'getChildren', 'findLarge', 'findDuplicates', 'trashItems', 'getCleanupCategories', 'cleanCategories', 'onCleanProgress',
  'getStartupItems', 'setStartupItemEnabled', 'getHistory', 'undoHistory', 'openRecycleBin', 'revealInFolder', 'pickFolder', 'relaunchAsAdmin',
];

let sb;
let ctx;
test.beforeAll(async () => {
  sb = H.makeSandbox('sec');
  H.writeFile(path.join(sb.home, 'Belgeler', 'dosya.txt'), 1000, { fill: 'random' });
  H.writeFile(path.join(sb.home, 'Belgeler', 'alt', 'ic.txt'), 1000, { fill: 'random' });
  H.writeFile(path.join(sb.home, 'Haric', 'korunan.txt'), 1000, { fill: 'random' });
  H.writeFile(path.join(sb.cache, 'thumbnails', 'normal', 'k.png'), 2000);
  H.writeFile(path.join(sb.config, 'google-chrome', 'Default', 'Cookies'), 3000, { fill: 'random' });
  H.writeFile(path.join(sb.config, 'google-chrome', 'Default', 'Login Data'), 3000, { fill: 'random' });
  H.writeFile(path.join(sb.base, 'disarisi', 'gizli.txt'), 4000, { fill: 'random' });
  fs.symlinkSync('/etc', path.join(sb.home, 'kacis-etc'));
  fs.symlinkSync(path.join(sb.base, 'disarisi'), path.join(sb.home, 'kacis-disari'));
  ctx = await H.launchApp({ sandbox: sb, settings: { lang: 'tr', excludedPaths: [path.join(sb.home, 'Haric')] } });
});
test.afterAll(async () => {
  if (ctx) await ctx.close();
});

function dry(p) {
  return safety.checkTrashable(p, { platform: 'linux', homedir: sb.home, excludedPaths: [path.join(sb.home, 'Haric')] });
}

test('trashItems saldırıları: .., symlink kaçışı, test kökü, ev klasörü, sistem yolları, boş/yanlış tür/çok uzun/NUL/göreli → reddedilir, hiçbir dosya kaybolmaz', async () => {
  const before = H.snapshot(sb.base);
  const realBefore = { passwd: H.sha1('/etc/passwd'), hostname: fs.existsSync('/etc/hostname') ? H.sha1('/etc/hostname') : null };
  const attacks = [
    path.join(sb.home, 'Belgeler') + '/../Belgeler/dosya.txt',
    sb.home + '/Belgeler/alt/../../Belgeler/dosya.txt',
    path.join(sb.home, 'kacis-etc', 'passwd'),
    path.join(sb.home, 'kacis-etc', 'hostname'),
    sb.testRoot,
    sb.home,
    sb.cache,
    sb.config,
    sb.dataHome,
    '/', '/etc/passwd', '/etc', '/usr/bin/env', '/usr', '/root', '/home', '/proc/self/environ', '/bin/sh',
    path.join(sb.home, 'Haric', 'korunan.txt'),
    path.join(sb.home, 'Haric'),
    '', ' ', 'Belgeler/dosya.txt', './x', '~/Belgeler/dosya.txt',
    path.join(sb.home, 'Belgeler', 'dosya.txt') + '\0.png',
    '/' + 'a'.repeat(40000),
    path.join(sb.home, 'Belgeler', 'a'.repeat(5000)),
  ];
  const sent = [];
  const skippedDangerous = [];
  for (const p of attacks) {
    const d = dry(p);
    const inside = typeof p === 'string' && p && (H.isInside(path.resolve(p.replace(/\0.*/, '')), sb.base));
    if (d.ok && !inside) { skippedDangerous.push({ p, dry: d }); continue; }
    sent.push(p);
  }
  expect(skippedDangerous, 'çekirdek güvenlik modülü korumalı alan dışındaki bir yolu kabul ediyor').toEqual([]);
  const r = await H.api(ctx.win, 'trashItems', sent);
  const odd = await Promise.all([
    H.api(ctx.win, 'trashItems', path.join(sb.home, 'Belgeler', 'dosya.txt')),
    H.api(ctx.win, 'trashItems', null),
    H.api(ctx.win, 'trashItems', { 0: path.join(sb.home, 'Belgeler', 'dosya.txt'), length: 1 }),
    H.api(ctx.win, 'trashItems', [null, 42, {}, ['x'], true]),
  ]);
  H.writeEvidence('sec-trash-attacks.json', { sent, result: r, odd });
  // Saldırı listesinde (aşağıdakiler hariç) hiçbir şey taşınmamalı
  const expectedAllowed = new Set(); // hiçbiri
  expect(r.trashed, JSON.stringify(r.failed.filter((f) => !f.error))).toBe(expectedAllowed.size);
  expect(r.failed).toHaveLength(sent.length);
  for (const f of r.failed) {
    expect(f.error, f.path).toBeTruthy();
    expect(f.message).toBeTruthy();
  }
  expect(odd[0]).toMatchObject({ ok: false, error: 'invalid-argument' });
  expect(odd[1]).toMatchObject({ ok: false, error: 'invalid-argument' });
  expect(odd[2]).toMatchObject({ ok: false, error: 'invalid-argument' });
  expect(odd[3].trashed).toBe(0);
  expect(H.snapshot(sb.base)).toEqual(before);
  expect(H.sha1('/etc/passwd')).toBe(realBefore.passwd);
  if (realBefore.hostname) expect(H.sha1('/etc/hostname')).toBe(realBefore.hostname);
  const codes = Object.fromEntries(r.failed.map((f) => [f.path, f.error]));
  expect(codes[path.join(sb.home, 'kacis-etc', 'passwd')]).toMatch(/protected|system-path/);
  expect(codes[sb.testRoot]).toBe('protected');
  expect(codes[path.join(sb.home, 'Haric', 'korunan.txt')]).toBe('excluded');
});

test('trashItems kapsamı: son taramada olmayan / kategori kökü / tarayıcı profili / uygulamanın kendi verisi / tüm klasör renderer’dan çöpe atılabiliyor mu?', async () => {
  // Bu istekler korumalı alanın İÇİNDE; savunma derinliği açısından trashItems'ın neyi kabul ettiği kaydedilir.
  const targets = {
    kategoriKoku: path.join(sb.cache, 'thumbnails'),
    tarayiciProfili: path.join(sb.config, 'google-chrome'),
    uygulamaVerisi: sb.userData,
    tumKlasor: path.join(sb.home, 'Belgeler', 'alt'),
    symlinkUzerindenDisari: path.join(sb.home, 'kacis-disari', 'gizli.txt'),
  };
  for (const p of Object.values(targets)) expect(H.isInside(p, sb.base)).toBe(true);
  const outsideBefore = H.snapshot(path.join(sb.base, 'disarisi'));
  const res = {};
  for (const [k, p] of Object.entries(targets)) {
    const r = await H.api(ctx.win, 'trashItems', [p]);
    res[k] = { path: p, trashed: r.trashed, error: r.failed[0] && r.failed[0].error, stillExists: fs.existsSync(p) };
  }
  H.writeEvidence('sec-trash-scope.json', res);
  const accepted = Object.entries(res).filter(([, v]) => v.trashed > 0).map(([k]) => k);
  // Beklenen (SPEC "Beyaz liste dışında hiçbir yol silinemez" + koordinatör kuralı): hepsi reddedilmeli
  expect.soft(accepted, 'renderer bu yolları Geri Dönüşüm’e taşıyabildi').toEqual([]);
  // En azından symlink'in gösterdiği dışarıdaki dosya ile ilgili kayıt
  H.writeEvidence('sec-trash-scope-outside.json', { before: outsideBefore, after: H.snapshot(path.join(sb.base, 'disarisi')) });
});

test('renderer yalıtımı: require/process/Buffer yok; contextIsolation, sandbox açık; window.ferahla dondurulmuş', async () => {
  const r = await ctx.win.evaluate(() => {
    const o = { require: typeof window.require, process: typeof window.process, Buffer: typeof window.Buffer, module: typeof window.module };
    try { window.ferahla.trashItems = () => 'ele geçirildi'; } catch (_) { /* */ }
    o.overridable = String(window.ferahla.trashItems).includes('ele geçirildi');
    o.frozen = Object.isFrozen(window.ferahla);
    return o;
  });
  expect(r).toEqual({ require: 'undefined', process: 'undefined', Buffer: 'undefined', module: 'undefined', overridable: false, frozen: true });
  const wp = await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
  expect(wp).toMatchObject({ contextIsolation: true, sandbox: true, nodeIntegration: false, nodeIntegrationInSubFrames: false, webSecurity: true, webviewTag: false });
});

test('CSP meta etiketi var ve etkin (satır içi betik/olay işleyici, dış kaynak engelli)', async () => {
  const r = await ctx.win.evaluate(async () => {
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    const v = [];
    document.addEventListener('securitypolicyviolation', (e) => v.push(e.violatedDirective));
    window.__inl = false; window.__attr = false;
    const s = document.createElement('script'); s.textContent = 'window.__inl = true'; document.head.appendChild(s);
    const d = document.createElement('div'); d.innerHTML = '<img src="data:x" onerror="window.__attr=true">'; document.body.appendChild(d);
    const img = document.createElement('img'); img.src = 'https://example.com/izle.png'; document.body.appendChild(img);
    await new Promise((res) => setTimeout(res, 400));
    s.remove(); d.remove(); img.remove();
    return { csp: meta && meta.content, inl: window.__inl, attr: window.__attr, v };
  });
  expect(r.csp).toContain("default-src 'self'");
  expect(r.csp).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline/);
  expect(r.inl).toBe(false);
  expect(r.attr).toBe(false);
  expect(r.v).toEqual(expect.arrayContaining(['script-src-elem', 'script-src-attr', 'img-src']));
});

test('izin istekleri ve sorguları reddedilir (bildirim, konum, kamera)', async () => {
  const r = await ctx.win.evaluate(async () => {
    const o = {};
    try { o.notification = await Notification.requestPermission(); } catch (e) { o.notification = 'hata'; }
    for (const name of ['geolocation', 'notifications', 'camera', 'microphone']) {
      try { o[name] = (await navigator.permissions.query({ name })).state; } catch (e) { o[name] = 'hata'; }
    }
    try { await navigator.mediaDevices.getUserMedia({ video: true }); o.gum = 'verildi'; } catch (e) { o.gum = e.name; }
    return o;
  });
  H.writeEvidence('sec-permissions.json', r);
  expect(r.notification).not.toBe('granted');
  for (const k of ['geolocation', 'notifications', 'camera', 'microphone']) expect(r[k], k).not.toBe('granted');
  expect(r.gum).not.toBe('verildi');
});

test('preload API sözleşmeyle birebir (23 işlev, eksik/fazla yok)', async () => {
  const keys = await ctx.win.evaluate(() => Object.keys(window.ferahla).sort());
  H.writeEvidence('sec-preload-keys.json', keys);
  expect(keys).toEqual([...CONTRACT].sort());
  const types = await ctx.win.evaluate(() => Object.values(window.ferahla).map((f) => typeof f));
  expect(new Set(types)).toEqual(new Set(['function']));
  const un = await ctx.win.evaluate(() => [window.ferahla.onScanProgress(() => {}), window.ferahla.onScanDone(() => {}), window.ferahla.onCleanProgress(() => {}), window.ferahla.onCleanProgress('x')].map((f) => typeof f));
  expect(un).toEqual(['function', 'function', 'function', 'function']);
  expect(await H.api(ctx.win, 'relaunchAsAdmin')).toMatchObject({ ok: false, error: 'unsupported' });
});

test('ana süreç IPC yüzeyi: Electron iç kanalları (boş uygulama taban çizgisi) hariç yalnızca sözleşme kanalları; senkron dinleyici yok', async () => {
  // Taban çizgisi: aynı Electron sürümüyle boş bir uygulama
  const empty = fs.mkdtempSync(path.join(H.TMP_ROOT, 'bos-electron-'));
  fs.writeFileSync(path.join(empty, 'package.json'), JSON.stringify({ name: 'bos', main: 'main.js' }));
  fs.writeFileSync(path.join(empty, 'main.js'), "const { app, BrowserWindow } = require('electron'); app.whenReady().then(() => { new BrowserWindow({ show: false }).loadURL('about:blank'); });");
  const appTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fer-'));
  const base = await _electron.launch({ executablePath: require(path.join(H.ROOT, 'node_modules', 'electron')), args: ['--no-sandbox', empty], env: { ...process.env, ...sb.env, TMPDIR: appTmp, FERAHLA_USER_DATA: path.join(empty, 'ud') } });
  let baseline;
  try {
    await base.firstWindow();
    baseline = await base.evaluate(({ ipcMain }) => ({ invoke: [...ipcMain._invokeHandlers.keys()], on: ipcMain.eventNames().map(String) }));
  } finally {
    await base.close();
    fs.rmSync(appTmp, { recursive: true, force: true });
  }
  const r = await ctx.app.evaluate(({ ipcMain }) => ({ invoke: [...ipcMain._invokeHandlers.keys()], on: ipcMain.eventNames().map(String) }));
  H.writeEvidence('sec-ipc-channels.json', { baseline, app: r });
  const own = r.invoke.filter((c) => !baseline.invoke.includes(c)).sort();
  const expected = CONTRACT.filter((k) => !k.startsWith('on')).map((k) => 'ferahla:' + k).sort();
  expect(own).toEqual(expected);
  expect(r.on.filter((e) => !baseline.on.includes(e))).toEqual([]);
});

test('gönderen doğrulaması: başka kökenden / başka file:// sayfadan gelen istek reddedilir', async () => {
  const r = await ctx.app.evaluate(async ({ ipcMain }) => {
    const h = ipcMain._invokeHandlers.get('ferahla:trashItems');
    const g = ipcMain._invokeHandlers.get('ferahla:getSettings');
    return {
      evil: await h({ senderFrame: { url: 'https://kotu.example/' } }, ['/tmp/x']),
      otherFile: await h({ senderFrame: { url: 'file:///tmp/kotu.html' } }, ['/tmp/x']),
      none: await g({ senderFrame: null }),
    };
  });
  expect(r.evil).toMatchObject({ ok: false, error: 'forbidden-sender' });
  expect(r.otherFile).toMatchObject({ ok: false, error: 'forbidden-sender' });
  expect(r.none).toMatchObject({ ok: false, error: 'forbidden-sender' });
});

test('gezinme/yeni pencere engelli; setSettings çöp girdiyi temizler; revealInFolder yalnızca gösterir', async () => {
  const before = ctx.win.url();
  await ctx.win.evaluate(() => { try { window.location.href = 'https://example.com/'; } catch (_) { /* */ } });
  await ctx.win.waitForTimeout(400);
  expect(ctx.win.url()).toBe(before);
  expect(await ctx.win.evaluate(() => window.open('https://example.com') === null)).toBe(true);
  expect(await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  const s = await H.api(ctx.win, 'setSettings', { lang: 'xx', theme: 'mor', excludedPaths: ['goreli', '', 'a\0b', 42, path.join(sb.home, 'Haric') + '/'] });
  expect(s).toEqual({ lang: 'tr', theme: 'system', excludedPaths: [path.join(sb.home, 'Haric')] });
  const s2 = await H.api(ctx.win, 'setSettings', { excludedPaths: 'bir-string' });
  expect(s2.excludedPaths).toEqual([path.join(sb.home, 'Haric')]);
  const snap = H.snapshot(sb.base);
  await H.api(ctx.win, 'revealInFolder', '/etc/passwd');
  await H.api(ctx.win, 'revealInFolder', path.join(sb.home, 'kacis-etc', '..', 'x'));
  const rev = await ctx.app.evaluate(() => global.__revealed);
  H.writeEvidence('sec-reveal.json', rev);
  expect(rev.some((p) => p.includes('..'))).toBe(false);
  expect(H.snapshot(sb.base)).toEqual(snap);
});
