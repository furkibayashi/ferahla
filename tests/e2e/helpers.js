'use strict';

/**
 * Ferahla uçtan uca test yardımcıları (Playwright `_electron`).
 *
 * !!! GÜVENLİK: Ferahla dosya SİLER. Uygulama bu dosyadaki launchApp() dışında başlatılmamalıdır.
 * launchApp() şu ortam değişkenleri olmadan (ve geçici bir korumalı alanın içini göstermeden) uygulamayı BAŞLATMAZ:
 *   FERAHLA_USER_DATA = <sandbox>/userdata
 *   FERAHLA_TEST_ROOT = <sandbox>/root
 *   XDG_DATA_HOME     = <FERAHLA_TEST_ROOT>/home/.local/share   (shell.trashItem gerçek çöpe gitmesin)
 * Ek önlem: HOME de <root>/home yapılır; listDrives ana süreçte korumalı alanla değiştirilir (gerçek "/" taranmasın).
 *
 * Çalıştırma: xvfb-run -a npm run test:e2e        (önerilen: -- --workers=1)
 * Ortam: FERAHLA_E2E_TMP = korumalı alanların kökü (varsayılan: os.tmpdir()/ferahla-e2e)
 *        FERAHLA_E2E_OUT = ekran görüntüsü / ölçüm JSON klasörü
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { _electron } = require('playwright/test');

const ROOT = path.resolve(__dirname, '..', '..');
const TMP_ROOT = path.resolve(process.env.FERAHLA_E2E_TMP || path.join(os.tmpdir(), 'ferahla-e2e'));
const OUT_DIR = path.resolve(process.env.FERAHLA_E2E_OUT || path.join(TMP_ROOT, 'out'));
fs.mkdirSync(TMP_ROOT, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const FORBIDDEN = ['/', '/home', '/root', '/usr', '/etc', '/var', '/opt', '/bin', '/lib', '/boot', os.homedir(), os.tmpdir()].map((p) => path.resolve(p));
const DAY = 24 * 3600 * 1000;

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Yol korumalı alanların kökü altında değilse test HEMEN durur. */
function assertSafe(p, what = 'yol') {
  const r = path.resolve(String(p || ''));
  if (!p || FORBIDDEN.includes(r) || !isInside(r, TMP_ROOT)) {
    throw new Error(`GÜVENLİK KORUMASI: ${what} (${r}) e2e korumalı alanı (${TMP_ROOT}) içinde değil — işlem reddedildi.`);
  }
  return r;
}

function writeEvidence(name, data) {
  const f = path.join(OUT_DIR, name);
  fs.writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  return f;
}

function sha1(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}

// ------------------------------------------------------------------ korumalı alan

/**
 * Yeni bir korumalı alan: { base, userData, testRoot, home, tmp, cache, config, trash, env }
 */
function makeSandbox(label = 'sb') {
  const base = fs.mkdtempSync(path.join(TMP_ROOT, `${label}-`));
  const userData = path.join(base, 'userdata');
  const testRoot = path.join(base, 'root');
  const home = path.join(testRoot, 'home');
  const sb = {
    base,
    userData,
    testRoot,
    home,
    tmp: path.join(testRoot, 'tmp'),
    cache: path.join(home, '.cache'),
    config: path.join(home, '.config'),
    dataHome: path.join(home, '.local', 'share'),
    trash: path.join(home, '.local', 'share', 'Trash'),
    autostart: path.join(home, '.config', 'autostart'),
  };
  for (const d of [userData, sb.tmp, sb.cache, sb.config, sb.dataHome, sb.autostart]) fs.mkdirSync(d, { recursive: true });
  sb.env = {
    FERAHLA_USER_DATA: userData,
    FERAHLA_TEST_ROOT: testRoot,
    XDG_DATA_HOME: sb.dataHome,
    XDG_CONFIG_HOME: sb.config,
    HOME: home,
  };
  return sb;
}

/** Ortam değişkenleri güvenli mi? Değilse fırlatır. */
function assertSafeEnv(env) {
  for (const k of ['FERAHLA_USER_DATA', 'FERAHLA_TEST_ROOT', 'XDG_DATA_HOME']) {
    if (!env[k]) throw new Error(`GÜVENLİK KORUMASI: ${k} verilmeden Ferahla başlatılamaz.`);
    assertSafe(env[k], k);
  }
  const want = path.join(env.FERAHLA_TEST_ROOT, 'home', '.local', 'share');
  if (path.resolve(env.XDG_DATA_HOME) !== path.resolve(want)) {
    throw new Error(`GÜVENLİK KORUMASI: XDG_DATA_HOME ${want} olmalı (şu an ${env.XDG_DATA_HOME}).`);
  }
  if (env.HOME) assertSafe(env.HOME, 'HOME');
}

let wrapperPath = null;
/** DAC yetkileri düşürülmüş başlatıcı: root olsa da dosya izinlerine uyulur (erişilemeyen klasör / salt okunur dosya testleri). */
function capDropWrapper() {
  if (wrapperPath) return wrapperPath;
  const electronBin = require(path.join(ROOT, 'node_modules', 'electron'));
  const dir = fs.mkdtempSync(path.join(TMP_ROOT, 'bin-'));
  wrapperPath = path.join(dir, 'electron-nodac.sh');
  fs.writeFileSync(wrapperPath, `#!/bin/sh\nexec setpriv --bounding-set=-dac_override,-dac_read_search --inh-caps=-dac_override,-dac_read_search -- "${electronBin}" "$@"\n`, { mode: 0o755 });
  return wrapperPath;
}

const HAS_SETPRIV = (() => {
  try { return require('child_process').spawnSync('setpriv', ['--version'], { stdio: 'ignore' }).status === 0; } catch (_) { return false; }
})();

/**
 * Ferahla'yı korumalı alanla başlatır.
 * opts: { sandbox (zorunlu), settings?, capDrop?=true (root ise), drives?:[{path,label}], welcomed?=true, args? }
 * Dönüş: { app, win, sb, consoleErrors, consoleWarnings, close() }
 */
async function launchApp(opts = {}) {
  const sb = opts.sandbox;
  if (!sb || !sb.env) throw new Error('GÜVENLİK KORUMASI: launchApp için makeSandbox() ile oluşturulmuş korumalı alan gerekir.');
  const env = { ...process.env, ...sb.env };
  delete env.ELECTRON_RUN_AS_NODE;
  assertSafeEnv(env);
  if (opts.settings) fs.writeFileSync(path.join(sb.userData, 'settings.json'), JSON.stringify(opts.settings));
  // Chromium Unix soket yolu ≤ 107 bayt: uygulamanın kendi TMPDIR'i kısa bir sistem geçici klasörü (FERAHLA_TEST_ROOT varken
  // Ferahla TMPDIR'i hiçbir kategori için kullanmaz; linux.js bases()).
  const appTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fer-'));
  env.TMPDIR = appTmp;
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  const capDrop = opts.capDrop !== false && isRoot && HAS_SETPRIV;
  const launch = { args: ['--no-sandbox', ROOT, ...(opts.args || [])], env, cwd: ROOT, timeout: 60000 };
  if (capDrop) launch.executablePath = capDropWrapper();
  const app = await _electron.launch(launch);
  const win = await app.firstWindow();
  const consoleErrors = [];
  const consoleWarnings = [];
  win.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
    else if (m.type() === 'warning') consoleWarnings.push(m.text());
  });
  win.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  // Ana süreçte ikinci kat koruma: sürücü listesi yalnızca korumalı alan; dosya yöneticisi açılmasın.
  const drives = (opts.drives || [{ path: sb.testRoot, label: 'Test' }]).map((d) => ({ ...d, path: assertSafe(d.path, 'sürücü') }));
  await app.evaluate(({ shell }, drv) => {
    const req = process.mainModule ? process.mainModule.require.bind(process.mainModule) : null;
    global.__revealed = [];
    global.__opened = [];
    shell.showItemInFolder = (p) => { global.__revealed.push(p); };
    shell.openPath = async (p) => { global.__opened.push(p); return ''; };
    shell.openExternal = async (u) => { global.__opened.push(u); };
    if (req) {
      const fsx = req('fs');
      const linux = req('./src/core/platform/linux');
      linux.listDrives = async () => drv.map((d) => {
        const s = fsx.statfsSync(d.path);
        return { path: d.path, label: d.label || '', totalBytes: s.blocks * s.bsize, freeBytes: s.bavail * s.bsize };
      });
      global.__drivesStubbed = true;
    }
  }, drives);
  const stubbed = await app.evaluate(() => !!global.__drivesStubbed);
  if (!stubbed) { await app.close(); throw new Error('GÜVENLİK KORUMASI: listDrives korumalı alana yönlendirilemedi.'); }
  if (opts.welcomed !== false) {
    await win.evaluate(() => { try { localStorage.setItem('ferahla.welcomed', '1'); } catch (_) { /* */ } });
  }
  await win.waitForSelector('body.is-ready', { timeout: 30000 });
  // Sürücü listesi stub'dan önce yüklenmiş olabilir: yeniden yükle
  await win.reload();
  await win.waitForSelector('body.is-ready', { timeout: 30000 });
  return {
    app,
    win,
    sb,
    capDrop,
    consoleErrors,
    consoleWarnings,
    async close() {
      try { await app.close(); } catch (_) { /* */ }
      try { fs.rmSync(appTmp, { recursive: true, force: true }); } catch (_) { /* */ }
    },
  };
}

/** Renderer'dan window.ferahla çağrısı. */
function api(win, name, ...args) {
  return win.evaluate(([n, a]) => window.ferahla[n](...a), [name, args]);
}

/** IPC ile tarama ve bitişini bekle (yalnızca korumalı alan içi). */
async function scanIPC(win, root, timeout = 120000) {
  assertSafe(root, 'tarama kökü');
  return win.evaluate(([r, to]) => new Promise((resolve) => {
    let id = null;
    const pending = [];
    const timer = setTimeout(() => resolve({ ok: false, error: 'test-timeout' }), to);
    const un = window.ferahla.onScanDone((d) => {
      if (id === null) { pending.push(d); return; }
      if (d.scanId === id) { clearTimeout(timer); un(); resolve(d); }
    });
    window.ferahla.scan({ root: r }).then((res) => {
      if (!res || res.ok === false) { clearTimeout(timer); un(); resolve(res); return; }
      id = res.scanId;
      const early = pending.find((d) => d.scanId === id);
      if (early) { clearTimeout(timer); un(); resolve(early); }
    });
  }), [root, timeout]);
}

/** Arayüzden (test kancası) tarama başlat: yalnızca korumalı alan. */
async function scanUI(win, root) {
  assertSafe(root, 'tarama kökü');
  await win.evaluate((r) => window.__ferahlaUI.startScan(r), root);
}

// ------------------------------------------------------------------ dosya ağacı

function writeFile(p, size, { fill = null, mtime = null } = {}) {
  assertSafe(p, 'fikstür');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  let buf;
  if (fill === 'random') buf = crypto.randomBytes(size);
  else buf = Buffer.alloc(size, typeof fill === 'number' ? fill : 0x61);
  fs.writeFileSync(p, buf);
  if (mtime) fs.utimesSync(p, mtime / 1000, mtime / 1000);
  return p;
}

/** Bir klasördeki tüm dosyaların (symlink'ler dahil, takip etmeden) göreli yol → sha1|link hedefi listesi. */
function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const full = path.join(d, e.name);
      const rel = path.relative(dir, full);
      const st = fs.lstatSync(full);
      if (st.isSymbolicLink()) out[rel] = 'link->' + fs.readlinkSync(full);
      else if (st.isDirectory()) { out[rel + '/'] = 'dir'; walk(full); }
      else if (st.isFile()) {
        try { out[rel] = sha1(full); } catch (_) { out[rel] = 'unreadable:' + st.size; }
      }
    }
  };
  walk(dir);
  return out;
}

function ls(dir) {
  try { return fs.readdirSync(dir).sort(); } catch (_) { return []; }
}

module.exports = {
  ROOT,
  TMP_ROOT,
  OUT_DIR,
  DAY,
  HAS_SETPRIV,
  assertSafe,
  assertSafeEnv,
  makeSandbox,
  launchApp,
  api,
  scanIPC,
  scanUI,
  writeFile,
  snapshot,
  sha1,
  ls,
  writeEvidence,
  isInside,
};
