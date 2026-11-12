'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ScanManager } = require('../../src/core/scanner');
const { checkTrashRequest, protectedTrashRoots } = require('../../src/core/trashguard');
const linux = require('../../src/core/platform/linux');
const win32 = require('../../src/core/platform/win32');
const { makeTmp } = require('./helpers');

function once(emitter, event, filter) {
  return new Promise((resolve) => {
    const h = (p) => { if (filter(p)) { emitter.off(event, h); resolve(p); } };
    emitter.on(event, h);
  });
}

test('FER-001: trashItems yalnızca son taramada DOSYA olarak bulunan, korunmasız yolları kabul eder', async (t) => {
  const tmp = makeTmp();
  const m = new ScanManager({ platform: 'linux' });
  t.after(async () => { await m.dispose(); tmp.cleanup(); });

  const env = { FERAHLA_TEST_ROOT: tmp.dir };
  const home = tmp.p('home');
  const userData = tmp.mkdir('userdata');
  tmp.file('userdata/history.json', '[]');
  const docs = tmp.p('home', 'Belgeler');
  const big = tmp.file('home/Belgeler/film.mkv', Buffer.alloc(5000));
  tmp.file('home/Belgeler/alt/not.txt', 'x');
  const changed = tmp.file('home/Belgeler/degisecek.zip', Buffer.alloc(300));
  const replaced = tmp.file('home/Belgeler/yerine.iso', Buffer.alloc(300));
  const chromeFile = tmp.file('home/.config/google-chrome/Default/Cookies', Buffer.alloc(4000));
  tmp.file('home/.cache/thumbnails/normal/a.png', Buffer.alloc(10));
  const outside = tmp.file('disarisi/gizli.txt', 'gizli');
  fs.symlinkSync(tmp.p('disarisi'), tmp.p('home', 'Belgeler', 'kacis'));
  fs.symlinkSync(outside, tmp.p('home', 'Belgeler', 'link.txt'));
  tmp.mkdir('home/Indirilenler');

  const opts = { platform: 'linux', homedir: home, env };
  const base = { ...opts, lookup: (p) => m.fileInfo(p) };

  // Tarama yokken hiçbir şey kabul edilmez
  assert.deepEqual(await checkTrashRequest(big, { ...base, scanRoot: null, protectedRoots: [] }), { ok: false, error: 'not_allowed', reason: 'no-scan' });

  // Ev klasörünün tamamını tara (profil, önbellek, Belgeler...)
  const id = m.scan(home);
  const d = await once(m, 'done', (x) => x.scanId === id);
  assert.equal(d.ok, true);
  fs.writeFileSync(changed, Buffer.alloc(301)); // taramadan sonra değişti
  const notScanned = tmp.file('home/Indirilenler/yeni.iso', Buffer.alloc(100)); // taramadan sonra oluştu
  fs.rmSync(replaced); fs.symlinkSync('/etc/hostname', replaced); // taramadan sonra symlink ile değiştirildi

  const protectedRoots = await protectedTrashRoots({ platform: linux, env, extra: [userData] });
  const ctx = { ...base, scanRoot: d.root, protectedRoots };
  const check = (p) => checkTrashRequest(p, ctx);

  const ok = await check(big);
  assert.equal(ok.ok, true);
  assert.equal(ok.realPath, big);
  assert.equal(ok.size, 5000);

  const cases = {
    klasor: [docs, 'not-a-file'],
    altKlasor: [path.join(docs, 'alt'), 'not-a-file'],
    tarayiciProfiliDosyasi: [chromeFile, 'protected-app-data'],
    tarayiciProfiliKlasoru: [tmp.p('home/.config/google-chrome'), 'not-a-file'],
    kategoriKoku: [tmp.p('home/.cache/thumbnails'), 'not-a-file'],
    kategoriIcindekiDosya: [tmp.p('home/.cache/thumbnails/normal/a.png'), 'protected-app-data'],
    uygulamaVerisi: [userData, 'not-a-file'],
    uygulamaVerisiDosyasi: [path.join(userData, 'history.json'), 'not-in-scan'],
    symlinkUzerindenDisari: [path.join(docs, 'kacis', 'gizli.txt'), 'not-in-scan'],
    symlinkKendisi: [path.join(docs, 'link.txt'), 'not-a-file'],
    taranmamis: [notScanned, 'not-in-scan'],
    taramadanSonraDegisti: [changed, 'changed-since-scan'],
    yerineSymlinkKondu: [replaced, 'not-a-file'],
    profilKoku: [home, 'protected'],
    goreli: ['Belgeler/film.mkv', 'relative-path'],
    noktaNokta: [docs + '/../Belgeler/film.mkv', 'dotdot'],
    sistem: ['/etc/hostname', 'system-path'],
    yok: [path.join(docs, 'yok.bin'), 'not-found'],
    metinDegil: [42, 'invalid-path'],
  };
  for (const [name, [p, reason]] of Object.entries(cases)) {
    const r = await check(p);
    assert.deepEqual(r, { ok: false, error: 'not_allowed', reason }, name);
  }
  // Hariç tutulan klasör
  assert.equal((await checkTrashRequest(big, { ...ctx, excludedPaths: [docs] })).reason, 'excluded');
  // Uygulama verisi taranmış olsa bile korumalı
  const id2 = m.scan(tmp.dir);
  const d2 = await once(m, 'done', (x) => x.scanId === id2);
  const ctx2 = { ...ctx, scanRoot: d2.root };
  assert.equal((await checkTrashRequest(path.join(userData, 'history.json'), ctx2)).reason, 'protected-app-data');
  // Tarama kökü dışındaki dosya (önceki taramanın kökü değişti)
  assert.equal((await checkTrashRequest(big, { ...ctx, scanRoot: tmp.p('home/Indirilenler') })).reason, 'outside-scan');
});

test('protectedTrashRoots: tarayıcı profilleri, kategori kökleri, çöp kutusu ve ekler', async (t) => {
  const tmp = makeTmp();
  t.after(() => tmp.cleanup());
  const env = { FERAHLA_TEST_ROOT: tmp.dir };
  const roots = await protectedTrashRoots({ platform: linux, env, extra: ['/uygulama/verisi'] });
  for (const r of ['home/.config/google-chrome', 'home/.mozilla', 'home/.cache/thumbnails', 'home/.local/share/Trash/files', 'tmp']) {
    assert.ok(roots.includes(path.join(tmp.dir, r)), r);
  }
  assert.ok(roots.includes('/uygulama/verisi'));
  const w = win32.appDataRoots({ env: { USERPROFILE: 'C:\\Users\\Ali', LOCALAPPDATA: 'C:\\Users\\Ali\\AppData\\Local', APPDATA: 'C:\\Users\\Ali\\AppData\\Roaming' } });
  assert.ok(w.includes('C:\\Users\\Ali\\AppData\\Local\\Google\\Chrome\\User Data'));
  assert.ok(w.includes('C:\\Users\\Ali\\AppData\\Roaming\\Mozilla\\Firefox'));
  assert.ok(w.includes('C:\\Users\\Ali\\AppData\\LocalLow'));
});
