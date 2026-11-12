'use strict';

/**
 * Güvenli temizlik: test kökünde sahte önbellek/temp; 24 saatten yeni dosyalar korunur; salt okunur (silinemeyen) dosya
 * "kullanımda" sayılıp atlanır; çerez/şifre/geçmiş dosyalarına dokunulmaz; kategori içindeki dışarıyı gösteren symlink'in
 * yalnızca kendisi kaldırılır (hedef sağlam); symlink olan kategori kökü reddedilir; onay penceresi olmadan hiçbir şey silinmez.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { test, expect } = require('playwright/test');
const H = require('./helpers');

const MB = 1024 * 1024;

function old(p, days = 3) {
  const t = (Date.now() - days * H.DAY) / 1000;
  fs.lutimesSync(p, t, t);
  return p;
}

/** Sahte kullanıcı ortamı + dışarıdaki "kanarya" dosyaları. */
function makeEnv(sb) {
  const e = {};
  const outside = path.join(sb.base, 'disarisi');
  e.outside = outside;
  H.writeFile(path.join(outside, 'gizli.txt'), 4321, { fill: 'random' });
  H.writeFile(path.join(outside, 'klasor', 'onemli.doc'), 5555, { fill: 'random' });
  H.writeFile(path.join(outside, 'spotify-gercek', 'onemli.dat'), 6666, { fill: 'random' });
  // Kullanıcı Temp
  const tmp = sb.tmp;
  old(H.writeFile(path.join(tmp, 'eski1.log'), 10000));
  old(H.writeFile(path.join(tmp, 'eski-klasor', 'eski2.tmp'), 20000));
  old(path.join(tmp, 'eski-klasor'));
  H.writeFile(path.join(tmp, 'yeni.tmp'), 5000); // 24 saatten yeni: dokunulmamalı
  old(H.writeFile(path.join(tmp, 'yeni-klasor', 'eski4.tmp'), 3000));
  old(H.writeFile(path.join(tmp, 'salt-okunur', 'eski3.tmp'), 4000));
  old(path.join(tmp, 'salt-okunur'));
  fs.chmodSync(path.join(tmp, 'salt-okunur'), 0o555);
  fs.symlinkSync(path.join(outside, 'gizli.txt'), path.join(tmp, 'bag-dosya'));
  old(path.join(tmp, 'bag-dosya'));
  fs.symlinkSync(path.join(outside, 'klasor'), path.join(tmp, 'bag-klasor'));
  old(path.join(tmp, 'bag-klasor'));
  // Küçük resimler
  H.writeFile(path.join(sb.cache, 'thumbnails', 'normal', 'a.png'), 8000);
  H.writeFile(path.join(sb.cache, 'thumbnails', 'large', 'b.png'), 9000);
  // Chrome: önbellek + asla dokunulmaması gerekenler
  const gc = path.join(sb.config, 'google-chrome', 'Default');
  H.writeFile(path.join(gc, 'Cache', 'Cache_Data', 'data_0'), 6 * MB);
  H.writeFile(path.join(gc, 'Code Cache', 'js', 'x'), 6000);
  for (const n of ['Cookies', 'Login Data', 'History', 'Bookmarks', 'Preferences']) H.writeFile(path.join(gc, n), 1234, { fill: 'random' });
  H.writeFile(path.join(sb.cache, 'google-chrome', 'Default', 'Cache', 'f'), 7000);
  // Chrome önbelleğinde dışarıyı gösteren bağlantılar (hedef silinmemeli)
  fs.symlinkSync(path.join(outside, 'gizli.txt'), path.join(gc, 'Cache', 'kacis-dosya'));
  fs.symlinkSync(path.join(outside, 'klasor'), path.join(gc, 'Cache', 'kacis-klasor'));
  // Firefox
  H.writeFile(path.join(sb.cache, 'mozilla', 'firefox', 'abc.default-release', 'cache2', 'entries', 'e1'), 11000);
  H.writeFile(path.join(sb.home, '.mozilla', 'firefox', 'abc.default-release', 'cookies.sqlite'), 999, { fill: 'random' });
  // Discord
  H.writeFile(path.join(sb.config, 'discord', 'Cache', 'Cache_Data', 'c1'), 12000);
  H.writeFile(path.join(sb.config, 'discord', 'Local Storage', 'leveldb', 'oturum.ldb'), 777, { fill: 'random' });
  // Spotify: kategori kökünün KENDİSİ dışarıyı gösteren bir symlink → reddedilmeli
  fs.mkdirSync(path.join(sb.cache, 'spotify'), { recursive: true });
  fs.symlinkSync(path.join(outside, 'spotify-gercek'), path.join(sb.cache, 'spotify', 'Data'));
  // Steam
  H.writeFile(path.join(sb.dataHome, 'Steam', 'config', 'htmlcache', 'Cache', 's'), 13000);
  // Çöp kutusu (önerilmez, kendiliğinden seçilmez)
  H.writeFile(path.join(sb.trash, 'files', 'eski-belge.txt'), 777);
  fs.mkdirSync(path.join(sb.trash, 'info'), { recursive: true });
  fs.writeFileSync(path.join(sb.trash, 'info', 'eski-belge.txt.trashinfo'), '[Trash Info]\nPath=/x/eski-belge.txt\nDeletionDate=2020-01-01T00:00:00\n');
  return e;
}

const byId = (cats) => Object.fromEntries(cats.map((c) => [c.id, c]));

test('kategoriler: boyut/öğe sayıları doğru; yeni dosyalar sayılmaz; symlink kök "yok"; Windows kategorileri Linux’ta kullanılamaz', async () => {
  const sb = H.makeSandbox('cats');
  makeEnv(sb);
  const ctx = await H.launchApp({ sandbox: sb });
  try {
    const cats = byId(await H.api(ctx.win, 'getCleanupCategories'));
    H.writeEvidence('cleanup-categories.json', cats);
    expect(cats['user-temp']).toMatchObject({ available: true, sizeBytes: 37000, itemCount: 6 });
    expect(cats.thumbnails).toMatchObject({ available: true, sizeBytes: 17000, itemCount: 2 });
    expect(cats.chrome).toMatchObject({ available: true, sizeBytes: 6 * MB + 6000 + 7000 });
    expect(cats.firefox).toMatchObject({ available: true, sizeBytes: 11000 });
    expect(cats.discord).toMatchObject({ available: true, sizeBytes: 12000 });
    expect(cats.steam).toMatchObject({ available: true, sizeBytes: 13000 });
    expect(cats.spotify.available).toBe(false);
    expect(cats['recycle-bin']).toMatchObject({ available: true, sizeBytes: 777, itemCount: 1 });
    for (const id of ['windows-temp', 'windows-update', 'wer', 'crash-dumps']) expect(cats[id].available).toBe(false);
    for (const c of Object.values(cats)) {
      expect(c.name.tr && c.name.en && c.description.tr && c.description.en).toBeTruthy();
    }
  } finally {
    await ctx.close();
  }
});

test('Güvenli Temizlik (arayüz): Vazgeç → hiçbir şey silinmez; onayla → yalnızca beyaz liste içeriği silinir, kanaryalar sağlam', async () => {
  test.setTimeout(120000);
  const sb = H.makeSandbox('clean');
  const e = makeEnv(sb);
  const outsideBefore = H.snapshot(e.outside);
  const ctx = await H.launchApp({ sandbox: sb, settings: { lang: 'tr', theme: 'light' } });
  try {
    const { win } = ctx;
    const before = H.snapshot(sb.testRoot);
    const btn = win.locator('#btn-safe-clean');
    await expect(btn).toBeEnabled({ timeout: 20000 });
    await btn.click();
    const dlg = win.locator('#dlg');
    await expect(dlg).toBeVisible();
    const dlgText = await dlg.innerText();
    H.writeEvidence('clean-dialog.txt', dlgText);
    expect(dlgText).toContain('Chrome');
    expect(dlgText).not.toMatch(/Geri Dönüşüm Kutusu\s+\d/); // çöp kutusu listede değil
    await win.screenshot({ path: path.join(H.OUT_DIR, 'clean-confirm-light.png') });
    await win.locator('#dlg-cancel').click();
    await expect(dlg).toBeHidden();
    await win.waitForTimeout(500);
    expect(H.snapshot(sb.testRoot), 'Vazgeç sonrası dosyalar değişti').toEqual(before);

    await btn.click();
    await win.locator('#dlg-ok').click();
    await expect(win.locator('#result-h')).toBeVisible({ timeout: 60000 });
    await win.screenshot({ path: path.join(H.OUT_DIR, 'clean-result-light.png') });
    const after = H.snapshot(sb.testRoot);
    H.writeEvidence('clean-after.json', after);
    const has = (rel) => Object.prototype.hasOwnProperty.call(after, rel);
    const tmpRel = (p) => path.relative(sb.testRoot, path.join(sb.tmp, p));
    // Silinmesi gerekenler
    for (const p of ['eski1.log', 'eski-klasor/eski2.tmp', 'yeni-klasor/eski4.tmp', 'bag-dosya', 'bag-klasor']) expect(has(tmpRel(p)), p).toBe(false);
    // Korunanlar
    expect(has(tmpRel('yeni.tmp')), '24 saatten yeni dosya silindi').toBe(true);
    expect(has(tmpRel('yeni-klasor') + '/')).toBe(true);
    if (ctx.capDrop) expect(has(tmpRel('salt-okunur/eski3.tmp'))).toBe(true);
    const gc = path.relative(sb.testRoot, path.join(sb.config, 'google-chrome', 'Default'));
    for (const n of ['Cookies', 'Login Data', 'History', 'Bookmarks', 'Preferences']) expect(has(`${gc}/${n}`), n).toBe(true);
    expect(has(`${gc}/Cache/Cache_Data/data_0`)).toBe(false);
    expect(has(`${gc}/Cache/`), 'kategori kökünün kendisi silindi').toBe(true);
    expect(has(`${gc}/Cache/kacis-dosya`)).toBe(false);
    expect(has(path.relative(sb.testRoot, path.join(sb.home, '.mozilla', 'firefox', 'abc.default-release', 'cookies.sqlite')))).toBe(true);
    expect(has(path.relative(sb.testRoot, path.join(sb.config, 'discord', 'Local Storage', 'leveldb', 'oturum.ldb')))).toBe(true);
    expect(has(path.relative(sb.testRoot, path.join(sb.trash, 'files', 'eski-belge.txt'))), 'çöp kutusu kendiliğinden boşaltıldı').toBe(true);
    // Dışarıdaki kanaryalar (symlink hedefleri) birebir aynı
    expect(H.snapshot(e.outside)).toEqual(outsideBefore);
    // Sonuç ekranı ve geçmiş
    const r = await win.evaluate(() => window.__ferahlaUI.state.clean.result);
    H.writeEvidence('clean-result.json', r);
    const res = byId(r.results);
    expect(res['user-temp']).toMatchObject({ freedBytes: ctx.capDrop ? 33000 : 37000, skippedInUse: ctx.capDrop ? 1 : 0 });
    expect(res.chrome.freedBytes).toBe(6 * MB + 6000 + 7000);
    if (ctx.capDrop) await expect(win.locator('.result .hint')).toContainText('1');
    const hist = await H.api(win, 'getHistory');
    expect(hist[0]).toMatchObject({ action: 'clean', undoable: false });
    expect(ctx.consoleErrors).toEqual([]);
  } finally {
    try { fs.chmodSync(path.join(sb.tmp, 'salt-okunur'), 0o755); } catch (_) { /* */ }
    await ctx.close();
  }
});

test('yalnızca klavye: Tab → Güvenli Temizlik → Enter → onay penceresinde Enter → sonuç; Esc ile vazgeçince hiçbir şey silinmez', async () => {
  test.setTimeout(120000);
  const sb = H.makeSandbox('kbd');
  makeEnv(sb);
  const ctx = await H.launchApp({ sandbox: sb, settings: { lang: 'tr' } });
  try {
    const { win } = ctx;
    await expect(win.locator('#btn-safe-clean')).toBeEnabled({ timeout: 20000 });
    const before = H.snapshot(sb.testRoot);
    await win.locator('body').press('Tab'); // "İçeriğe geç"
    const stops = [];
    let found = false;
    for (let i = 0; i < 30; i++) {
      const d = await win.evaluate(() => {
        const a = document.activeElement;
        const cs = getComputedStyle(a);
        return { id: a.id, tag: a.tagName, text: (a.textContent || '').trim().slice(0, 30), visibleFocus: cs.outlineStyle !== 'none' || cs.boxShadow !== 'none' };
      });
      stops.push(d);
      if (d.id === 'btn-safe-clean') { found = true; break; }
      await win.keyboard.press('Tab');
    }
    H.writeEvidence('kbd-stops.json', stops);
    expect(found, 'Tab ile Güvenli Temizlik düğmesine ulaşılamadı').toBe(true);
    expect(stops.filter((s) => !s.visibleFocus && s.tag !== 'BODY'), 'görünür odak halkası olmayan duraklar').toEqual([]);
    await win.keyboard.press('Enter');
    await expect(win.locator('#dlg')).toBeVisible();
    await win.keyboard.press('Escape');
    await expect(win.locator('#dlg')).toBeHidden();
    expect(await win.evaluate(() => document.activeElement.id)).toBe('btn-safe-clean');
    expect(H.snapshot(sb.testRoot)).toEqual(before);
    await win.keyboard.press('Enter');
    await expect(win.locator('#dlg')).toBeVisible();
    const focused = await win.evaluate(() => document.activeElement.id);
    H.writeEvidence('kbd-dialog-focus.json', { focused });
    await win.keyboard.press(focused === 'dlg-ok' ? 'Enter' : 'Tab');
    if (focused !== 'dlg-ok') await win.keyboard.press('Enter');
    await expect(win.locator('#result-h')).toBeVisible({ timeout: 60000 });
    expect(await win.evaluate(() => document.activeElement.id)).toBe('result-h');
    expect(fs.existsSync(path.join(sb.tmp, 'eski1.log'))).toBe(false);
    expect(ctx.consoleErrors).toEqual([]);
  } finally {
    try { fs.chmodSync(path.join(sb.tmp, 'salt-okunur'), 0o755); } catch (_) { /* */ }
    await ctx.close();
  }
});

test('uygulama açıkken uyarı: "discord" süreci çalışırken kategori engellenir, Güvenli Temizlik onu seçmez', async () => {
  test.setTimeout(60000);
  const sb = H.makeSandbox('proc');
  makeEnv(sb);
  const fake = path.join(sb.base, 'bin', 'discord');
  fs.mkdirSync(path.dirname(fake), { recursive: true });
  fs.copyFileSync('/bin/sleep', fake);
  fs.chmodSync(fake, 0o755);
  const child = spawn(fake, ['120'], { stdio: 'ignore' });
  const ctx = await H.launchApp({ sandbox: sb, settings: { lang: 'tr' } });
  try {
    const { win } = ctx;
    const cats = byId(await H.api(win, 'getCleanupCategories'));
    expect(cats.discord.warning && cats.discord.warning.tr).toMatch(/Discord/);
    await win.keyboard.press('Control+2');
    await expect(win.locator('#cat-discord')).toBeDisabled({ timeout: 20000 });
    await expect(win.locator('.cat-note-warn')).toContainText('Discord');
    await win.screenshot({ path: path.join(H.OUT_DIR, 'clean-app-running.png') });
    const sel = await win.evaluate(() => [...window.__ferahlaUI.state.selected]);
    expect(sel).not.toContain('discord');
    expect(sel).not.toContain('recycle-bin');
  } finally {
    child.kill('SIGKILL');
    try { fs.chmodSync(path.join(sb.tmp, 'salt-okunur'), 0o755); } catch (_) { /* */ }
    await ctx.close();
  }
});

test('cleanCategories IPC: geçersiz girdiler reddedilir; aynı anda ikinci temizlik "busy"; çöp kutusu yalnızca açıkça istenince boşalır', async () => {
  const sb = H.makeSandbox('cleanipc');
  makeEnv(sb);
  const ctx = await H.launchApp({ sandbox: sb });
  try {
    const { win } = ctx;
    const before = H.snapshot(sb.testRoot);
    expect(await H.api(win, 'cleanCategories', 'user-temp')).toMatchObject({ ok: false, error: 'invalid-argument' });
    expect(await H.api(win, 'cleanCategories', [123])).toMatchObject({ ok: false, error: 'invalid-argument' });
    expect(await H.api(win, 'cleanCategories', [{ id: 'user-temp' }])).toMatchObject({ ok: false, error: 'invalid-argument' });
    const unk = await H.api(win, 'cleanCategories', ['../../etc', '/tmp', 'bilinmeyen']);
    expect(unk.ok).toBe(false);
    expect(unk.results.map((x) => x.error)).toEqual(['unknown-category', 'unknown-category', 'unknown-category']);
    const na = await H.api(win, 'cleanCategories', ['windows-update', 'spotify']);
    expect(na.results[0].error).toBe('not-available');
    // Kökü symlink olan kategori: hata vermese de hiçbir şey silinmemeli (aşağıdaki anlık görüntü karşılaştırması)
    expect(na.results[1]).toMatchObject({ id: 'spotify', deleted: 0, freedBytes: 0 });
    expect(H.snapshot(sb.testRoot)).toEqual(before);
    const both = await win.evaluate(() => Promise.all([window.ferahla.cleanCategories(['thumbnails']), window.ferahla.cleanCategories(['thumbnails'])]));
    H.writeEvidence('clean-busy.json', both);
    expect(both.some((r) => r.error === 'busy')).toBe(true);
    const rb = await H.api(win, 'cleanCategories', ['recycle-bin']);
    expect(rb.results[0]).toMatchObject({ id: 'recycle-bin', deleted: 1, freedBytes: 777 });
    expect(H.ls(path.join(sb.trash, 'files'))).toEqual([]);
  } finally {
    try { fs.chmodSync(path.join(sb.tmp, 'salt-okunur'), 0o755); } catch (_) { /* */ }
    await ctx.close();
  }
});
