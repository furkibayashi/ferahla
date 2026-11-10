'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const cleanup = require('../../src/core/cleanup');
const linux = require('../../src/core/platform/linux');
const { makeTmp, OLD } = require('./helpers');

/** Kökleri geçici klasöre yönlendiren sahte platform. */
function fakePlatform(rootsById, { admin = new Set(), procs = {} } = {}) {
  return {
    cleanupRoots: async (id) => rootsById[id] || null,
    requiresAdmin: (id) => admin.has(id),
    processNames: (id) => procs[id] || [],
    getRecycleBin: async () => ({ available: false, sizeBytes: 0, itemCount: 0 }),
    recycleBinRoots: () => [],
  };
}

test('cleanRoot: kökün içeriği silinir, kök kalır; symlink hedefi korunur', async (t) => {
  const tmp = makeTmp();
  t.after(() => tmp.cleanup());
  const root = tmp.mkdir('Cache');
  tmp.file('Cache/a.bin', Buffer.alloc(1000));
  tmp.file('Cache/d1/d2/b.bin', Buffer.alloc(500));
  tmp.mkdir('Cache/bos');
  const secret = tmp.file('disari/onemli.txt', 'önemli veri');
  tmp.file('disari/klasor/x.txt', 'x');
  fs.symlinkSync(secret, path.join(root, 'link-file'));
  fs.symlinkSync(tmp.p('disari', 'klasor'), path.join(root, 'link-dir'));
  fs.symlinkSync('/etc', path.join(root, 'd1', 'etc-link'));

  const r = await cleanup.cleanRoot({ path: root }, { platform: 'linux' });
  assert.equal(r.freedBytes, 1500);
  assert.equal(r.deleted, 5); // 2 dosya + 3 bağlantı
  assert.equal(r.refused, 0);
  assert.equal(r.skippedInUse, 0);
  assert.ok(fs.existsSync(root), 'kök silinmemeli');
  assert.deepEqual(fs.readdirSync(root), []);
  // Bağlantıların hedeflerine dokunulmadı
  assert.equal(fs.readFileSync(secret, 'utf8'), 'önemli veri');
  assert.ok(fs.existsSync(tmp.p('disari/klasor/x.txt')));
  assert.ok(fs.existsSync('/etc/hostname') || fs.existsSync('/etc/passwd'));
});

test('cleanRoot: kilitli (kullanımda) dosyalar atlanır ve sayılır', async (t) => {
  // Not: root olarak çalışan Linux konteynerinde gerçek dosya kilidi (Windows paylaşım ihlali) taklit edilemez;
  // bu yüzden unlink enjekte edilip EBUSY/EPERM fırlatılarak taklit edilir.
  const tmp = makeTmp();
  t.after(() => tmp.cleanup());
  const root = tmp.mkdir('Temp');
  tmp.file('Temp/serbest.tmp', Buffer.alloc(100));
  const locked1 = tmp.file('Temp/kilitli.tmp', Buffer.alloc(200));
  const locked2 = tmp.file('Temp/alt/kilitli2.tmp', Buffer.alloc(300));
  const fsp = require('fs/promises');
  const unlink = async (p) => {
    if (p === locked1) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    if (p === locked2) throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
    return fsp.unlink(p);
  };
  const r = await cleanup.cleanRoot({ path: root }, { platform: 'linux', fs: { unlink } });
  assert.equal(r.deleted, 1);
  assert.equal(r.freedBytes, 100);
  assert.equal(r.skippedInUse, 2);
  assert.ok(fs.existsSync(locked1) && fs.existsSync(locked2));
  assert.ok(fs.existsSync(tmp.p('Temp/alt')), 'içinde kilitli dosya kalan klasör silinmez');
});

test('cleanRoot: minAgeMs ve pattern', async (t) => {
  const tmp = makeTmp();
  t.after(() => tmp.cleanup());
  const root = tmp.mkdir('T');
  tmp.file('T/eski.tmp', Buffer.alloc(10), OLD);
  tmp.file('T/yeni.tmp', Buffer.alloc(20));
  tmp.file('T/eskiklasor/e.tmp', Buffer.alloc(30), OLD);
  fs.utimesSync(tmp.p('T/eskiklasor'), OLD / 1000, OLD / 1000);
  const r = await cleanup.cleanRoot({ path: root, minAgeMs: 24 * 3600 * 1000 }, { platform: 'linux' });
  assert.equal(r.freedBytes, 40);
  assert.deepEqual(fs.readdirSync(root).sort(), ['yeni.tmp']);

  const ex = tmp.mkdir('Explorer');
  tmp.file('Explorer/thumbcache_256.db', Buffer.alloc(50));
  tmp.file('Explorer/thumbcache_idx.db', Buffer.alloc(5));
  tmp.file('Explorer/iconcache_16.db', Buffer.alloc(7));
  tmp.file('Explorer/alt/thumbcache_x.db', Buffer.alloc(9));
  const r2 = await cleanup.cleanRoot({ path: ex, pattern: /^thumbcache_.*\.db$/i }, { platform: 'linux' });
  assert.equal(r2.freedBytes, 55);
  assert.deepEqual(fs.readdirSync(ex).sort(), ['alt', 'iconcache_16.db']);
});

test('cleanRoot: kök symlink ise hiçbir şey silinmez', async (t) => {
  const tmp = makeTmp();
  t.after(() => tmp.cleanup());
  tmp.file('gercek/a.txt', 'a');
  fs.symlinkSync(tmp.p('gercek'), tmp.p('kok-link'));
  const r = await cleanup.cleanRoot({ path: tmp.p('kok-link') }, { platform: 'linux' });
  assert.equal(r.deleted, 0);
  assert.equal(r.refused, 1);
  assert.ok(fs.existsSync(tmp.p('gercek/a.txt')));
});

test('getCategories / cleanCategories (geçici beyaz liste kökleri)', async (t) => {
  const tmp = makeTmp();
  t.after(() => tmp.cleanup());
  tmp.file('chrome/Default/Cache/data_0', Buffer.alloc(4000));
  tmp.file('chrome/Default/Cookies', Buffer.alloc(77)); // kök dışında: silinmemeli
  tmp.file('discord/Cache/x', Buffer.alloc(600));
  tmp.file('wt/eski.log', Buffer.alloc(900), OLD);
  const platform = fakePlatform({
    chrome: [{ path: tmp.p('chrome/Default/Cache') }, { path: tmp.p('chrome/Default/Code Cache') }],
    discord: [{ path: tmp.p('discord/Cache') }],
    'windows-temp': [{ path: tmp.p('wt'), minAgeMs: 1000 }],
  }, { admin: new Set(['windows-temp']), procs: { chrome: ['chrome.exe'] } });

  const cats = await cleanup.getCategories({ platform, isAdmin: false, processes: new Set(['chrome.exe']) });
  assert.equal(cats.length, cleanup.CATEGORIES.length);
  const by = Object.fromEntries(cats.map((c) => [c.id, c]));
  for (const c of cats) {
    assert.ok(c.name.tr && c.name.en && c.description.tr && c.description.en);
    assert.equal(typeof c.sizeBytes, 'number');
    assert.equal(typeof c.itemCount, 'number');
    assert.equal(typeof c.requiresAdmin, 'boolean');
    assert.equal(typeof c.available, 'boolean');
  }
  assert.deepEqual([by.chrome.sizeBytes, by.chrome.itemCount, by.chrome.available], [4000, 1, true]);
  assert.match(by.chrome.warning.tr, /Önce Chrome'u kapatın/);
  assert.equal(by.discord.warning, undefined);
  assert.equal(by.firefox.available, false);
  assert.equal(by['windows-temp'].requiresAdmin, true);
  assert.match(by['windows-temp'].warning.tr, /yönetici/i);
  for (const id of ['user-temp', 'windows-temp', 'recycle-bin', 'thumbnails', 'chrome', 'edge', 'brave', 'opera', 'firefox',
    'discord', 'teams', 'spotify', 'steam', 'windows-update', 'crash-dumps', 'wer']) assert.ok(by[id], `kategori eksik: ${id}`);

  const progress = [];
  const res = await cleanup.cleanCategories(['chrome', 'discord', 'windows-temp', 'yok', 'firefox'], {
    platform, isAdmin: false, onProgress: (p) => progress.push(p),
  });
  assert.equal(res.ok, true);
  assert.equal(res.freedBytes, 4600);
  assert.equal(res.deleted, 2);
  assert.equal(res.skippedInUse, 0);
  const rb = Object.fromEntries(res.results.map((x) => [x.id, x]));
  assert.equal(rb['windows-temp'].error, 'requires-admin');
  assert.equal(rb.yok.error, 'unknown-category');
  assert.equal(rb.firefox.error, 'not-available');
  assert.ok(fs.existsSync(tmp.p('wt/eski.log')), 'yönetici değilken dokunulmaz');
  assert.ok(fs.existsSync(tmp.p('chrome/Default/Cookies')), 'çerezler silinmez');
  assert.ok(fs.existsSync(tmp.p('chrome/Default/Cache')), 'kök kalır');
  assert.ok(progress.some((p) => p.id === 'chrome' && p.percent === 100));

  const res2 = await cleanup.cleanCategories(['windows-temp'], { platform, isAdmin: true });
  assert.equal(res2.freedBytes, 900);
  const none = await cleanup.cleanCategories(['yok'], { platform, isAdmin: true });
  assert.equal(none.ok, false);
});

test('Linux platformu (FERAHLA_TEST_ROOT): çöp kutusu ölçümü ve boşaltma', async (t) => {
  const tmp = makeTmp();
  t.after(() => tmp.cleanup());
  const env = { FERAHLA_TEST_ROOT: tmp.dir };
  const trash = linux.trashDir(env);
  assert.equal(trash, path.join(tmp.dir, 'home', '.local', 'share', 'Trash'));
  tmp.file('home/.local/share/Trash/files/silinen.txt', Buffer.alloc(123));
  tmp.file('home/.local/share/Trash/files/klasor/ic.txt', Buffer.alloc(7));
  tmp.file('home/.local/share/Trash/info/silinen.txt.trashinfo', '[Trash Info]');
  tmp.file('home/.cache/thumbnails/normal/a.png', Buffer.alloc(11));

  const before = await linux.getRecycleBin({ env });
  assert.deepEqual(before, { available: true, sizeBytes: 130, itemCount: 2 });
  const cats = await cleanup.getCategories({ platform: linux, env, isAdmin: false });
  const by = Object.fromEntries(cats.map((c) => [c.id, c]));
  assert.equal(by['recycle-bin'].sizeBytes, 130);
  assert.equal(by.thumbnails.sizeBytes, 11);
  assert.equal(by['windows-update'].available, false);

  const r = await cleanup.cleanCategories(['recycle-bin', 'thumbnails'], { platform: linux, env, isAdmin: false });
  assert.equal(r.freedBytes, 141);
  assert.deepEqual(fs.readdirSync(path.join(trash, 'files')), []);
  assert.deepEqual(fs.readdirSync(path.join(trash, 'info')), []);
  assert.ok(fs.existsSync(tmp.p('home/.cache/thumbnails')));
});
