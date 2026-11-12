'use strict';

/**
 * Tarama doğruluğu (bilinen ağaç), symlink döngüsü, erişilemeyen klasör, 100k dosya (süre + arayüz donmaması),
 * iptal, disk haritası etkileşimi (içine gir, ekmek kırıntısı, treemap, Alt+←, Klasörde göster).
 * Tüm taramalar YALNIZCA korumalı alan içindeki ağaçlarda yapılır.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, expect } = require('playwright/test');
const H = require('./helpers');

/** Bilinen ağaç: toplam 5 060 096 bayt (sabit bağlantı bir kez), 11 dosya. */
function makeKnownTree(base) {
  const k = path.join(base, 'bilinen');
  H.writeFile(path.join(k, 'a', 'x1.bin'), 1000);
  H.writeFile(path.join(k, 'a', 'x2.bin'), 2000);
  H.writeFile(path.join(k, 'a', 'x3.bin'), 3000);
  for (let i = 1; i <= 5; i++) H.writeFile(path.join(k, 'b', 'c', `y${i}.bin`), 10000);
  const iso = path.join(k, 'kalip.iso');
  fs.writeFileSync(iso, '');
  fs.truncateSync(iso, 5000000); // seyrek dosya: boyut 5 MB
  H.writeFile(path.join(k, 'sabit.bin'), 4096);
  fs.linkSync(path.join(k, 'sabit.bin'), path.join(k, 'sabit-bag.bin'));
  fs.mkdirSync(path.join(k, 'bos'));
  // Symlink döngüsü ve dışarıyı gösteren bağlantı (takip edilmemeli)
  fs.symlinkSync('.', path.join(k, 'dongu'));
  fs.symlinkSync(k, path.join(k, 'a', 'geri-don'));
  const dis = path.join(base, 'disarida');
  fs.mkdirSync(dis, { recursive: true });
  fs.writeFileSync(path.join(dis, 'koca.bin'), '');
  fs.truncateSync(path.join(dis, 'koca.bin'), 50 * 1024 * 1024);
  fs.symlinkSync(dis, path.join(k, 'dis-bag'));
  fs.symlinkSync(path.join(dis, 'koca.bin'), path.join(k, 'dosya-bag.bin'));
  // Erişilemeyen klasör (DAC yetkisi düşürülmüş süreçte EACCES)
  H.writeFile(path.join(k, 'kilitli', 'gizli.bin'), 7777);
  fs.chmodSync(path.join(k, 'kilitli'), 0o000);
  // FIFO (atlanmalı)
  try { execFileSync('mkfifo', [path.join(k, 'boru')]); } catch (_) { /* yoksa geç */ }
  return k;
}

function make100k(base) {
  const r = path.join(base, 'yuzbin');
  const buf = Buffer.alloc(100, 0x62);
  for (let d = 0; d < 100; d++) {
    const dir = path.join(r, `k${String(d).padStart(3, '0')}`, 'alt');
    fs.mkdirSync(dir, { recursive: true });
    for (let f = 0; f < 1000; f++) fs.writeFileSync(path.join(dir, `f${f}.txt`), buf);
  }
  return r;
}

let sb;
let known;
let big;
test.beforeAll(() => {
  test.setTimeout(180000);
  sb = H.makeSandbox('scan');
  known = makeKnownTree(sb.testRoot);
  big = make100k(sb.testRoot);
});
test.afterAll(() => {
  try { fs.chmodSync(path.join(known, 'kilitli'), 0o755); } catch (_) { /* */ }
});

test('bilinen ağaç: toplam boyut, dosya sayısı, sıralı içerik; symlink/döngü takip edilmez, erişilemeyen klasör sayılıp atlanır', async () => {
  const ctx = await H.launchApp({ sandbox: sb });
  try {
    const d = await H.scanIPC(ctx.win, known);
    H.writeEvidence('scan-known.json', d);
    expect(d.ok).toBe(true);
    const lockedCounted = !ctx.capDrop; // DAC yetkisi varsa root kilitli klasörü okuyabilir
    expect(d.totalBytes).toBe(5060096 + (lockedCounted ? 7777 : 0));
    expect(d.files).toBe(11 + (lockedCounted ? 1 : 0));
    if (ctx.capDrop) expect(d.skipped).toBeGreaterThanOrEqual(1);
    const kids = await H.api(ctx.win, 'getChildren', known);
    H.writeEvidence('scan-known-children.json', kids);
    expect(kids.map((k) => k.name).sort()).toEqual(['a', 'b', 'bos', 'kalip.iso', 'kilitli', 'sabit-bag.bin', 'sabit.bin']);
    expect(kids[0].name).toBe('kalip.iso');
    const by = Object.fromEntries(kids.map((k) => [k.name, k]));
    expect(by['kalip.iso'].sizeBytes).toBe(5000000);
    expect(by.b).toMatchObject({ isDir: true, sizeBytes: 50000, fileCount: 5 });
    expect(by.a).toMatchObject({ isDir: true, sizeBytes: 6000, fileCount: 3 });
    expect(kids.some((k) => ['dongu', 'dis-bag', 'dosya-bag.bin', 'boru'].includes(k.name))).toBe(false);
    for (let i = 1; i < kids.length; i++) expect(kids[i - 1].sizeBytes).toBeGreaterThanOrEqual(kids[i].sizeBytes);
    const c = await H.api(ctx.win, 'getChildren', path.join(known, 'b', 'c'));
    expect(c).toHaveLength(5);
    // Tarama dışındaki yol
    const out = await H.api(ctx.win, 'getChildren', sb.trash);
    expect(out).toMatchObject({ ok: false, error: 'not-in-scan' });
    // Hatalı kökler
    expect(await H.api(ctx.win, 'scan', { root: path.join(sb.testRoot, 'yok') })).toMatchObject({ ok: false, error: 'not-found' });
    expect(await H.api(ctx.win, 'scan', { root: path.join(known, 'a', 'x1.bin') })).toMatchObject({ ok: false, error: 'not-found' });
    expect(await H.api(ctx.win, 'scan', { root: 'goreli/yol' })).toMatchObject({ ok: false, error: 'invalid-argument' });
    expect(await H.api(ctx.win, 'scan', {})).toMatchObject({ ok: false, error: 'invalid-argument' });
    expect(ctx.consoleErrors).toEqual([]);
  } finally {
    await ctx.close();
  }
});

test('100 bin dosya: tarama süresi, ilerleme akıyor, arayüz donmuyor (rAF boşluğu), sonuç doğru', async () => {
  test.setTimeout(240000);
  const ctx = await H.launchApp({ sandbox: sb, drives: [{ path: big, label: 'Yuzbin' }] });
  try {
    const { win } = ctx;
    await win.evaluate(() => {
      window.__gap = 0; window.__run = true; window.__prog = [];
      let last = performance.now();
      const tick = (t) => { window.__gap = Math.max(window.__gap, t - last); last = t; if (window.__run) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      window.ferahla.onScanProgress((p) => window.__prog.push(p.files));
    });
    const t0 = Date.now();
    await H.scanUI(win, big);
    await expect(win.locator('#scan-cancel')).toBeVisible();
    await expect(win.locator('.context')).toBeVisible({ timeout: 200000 });
    const ms = Date.now() - t0;
    const r = await win.evaluate(() => { window.__run = false; return { gap: window.__gap, prog: window.__prog, last: window.__ferahlaUI.state.scan.last }; });
    H.writeEvidence('perf-scan-100k.json', { ms, maxFrameGapMs: Math.round(r.gap), progressEvents: r.prog.length, last: r.last });
    expect(r.last.files).toBe(100000);
    expect(r.last.totalBytes).toBe(100000 * 100);
    expect(r.prog.length).toBeGreaterThan(3);
    expect(r.gap, 'arayüz 500 ms’den uzun dondu').toBeLessThan(500);
    await expect(win.locator('#ml .ml-row')).toHaveCount(100);
    expect(ms).toBeLessThan(60000);
    expect(ctx.consoleErrors).toEqual([]);
  } finally {
    await ctx.close();
  }
});

test('iptal: 100k taramayı arayüzden iptal et → "iptal edildi", önceki tarama sonucu korunur', async () => {
  test.setTimeout(240000);
  const ctx = await H.launchApp({ sandbox: sb });
  try {
    const { win } = ctx;
    // Önce küçük bir tarama (önceki sonuç)
    await H.scanUI(win, known);
    await expect(win.locator('.context')).toBeVisible({ timeout: 30000 });
    await H.scanUI(win, big);
    await expect(win.locator('#scan-cancel')).toBeVisible();
    await expect.poll(() => win.evaluate(() => (window.__ferahlaUI.state.scan.progress || {}).files || 0), { timeout: 30000 }).toBeGreaterThan(100);
    await win.locator('#scan-cancel').click();
    await expect(win.locator('.hint[role="status"]')).toBeVisible({ timeout: 30000 });
    const st = await win.evaluate(() => ({ status: window.__ferahlaUI.state.scan.status, root: window.__ferahlaUI.state.scan.last && window.__ferahlaUI.state.scan.last.root }));
    expect(st).toEqual({ status: 'done', root: known });
    // Önceki taramanın ağacı sorgulanabilir olmalı
    const kids = await H.api(win, 'getChildren', known);
    expect(Array.isArray(kids)).toBe(true);
    // Yeni tarama başlatılabilir
    const d = await H.scanIPC(win, path.join(known, 'a'));
    expect(d.ok).toBe(true);
    await win.screenshot({ path: path.join(H.OUT_DIR, 'scan-cancelled.png') });
  } finally {
    await ctx.close();
  }
});

test('disk haritası: sürücü düğmesiyle tara → listeye tıkla içine gir → ekmek kırıntısı/Alt+← ile çık → treemap hücresi → Klasörde göster', async () => {
  test.setTimeout(120000);
  const ctx = await H.launchApp({ sandbox: sb, drives: [{ path: known, label: 'Bilinen' }] });
  try {
    const { win, app } = ctx;
    await win.keyboard.press('Control+3');
    await expect(win.locator('h1')).toBeVisible();
    await win.locator('[data-action="scan-drive"]').first().click();
    await expect(win.locator('.context')).toBeVisible({ timeout: 30000 });
    const rows = win.locator('#ml .ml-row');
    await expect(rows.first()).toContainText('kalip.iso');
    await win.locator(`#ml .ml-main[data-path="${path.join(known, 'b')}"]`).click();
    await expect(win.locator('[aria-current="location"]')).toHaveText('b');
    await win.locator(`#ml .ml-main[data-path="${path.join(known, 'b', 'c')}"]`).click();
    await expect(win.locator('[aria-current="location"]')).toHaveText('c');
    await expect(win.locator('.crumbs li')).toHaveCount(3);
    await expect(rows).toHaveCount(5);
    await win.screenshot({ path: path.join(H.OUT_DIR, 'map-c.png') });
    await win.keyboard.press('Alt+ArrowLeft');
    await expect(win.locator('[aria-current="location"]')).toHaveText('b');
    await win.locator('.crumbs .crumb').first().click();
    await expect(win.locator('[aria-current="location"]')).toHaveText('bilinen');
    // Treemap hücresine tıkla (klasör a)
    const cell = win.locator(`#tm g.tm-cell[data-path="${path.join(known, 'a')}"]`);
    if (await cell.count()) {
      await cell.locator('rect').first().click({ force: true });
      await expect(win.locator('[aria-current="location"]')).toHaveText('a');
    }
    await win.locator('#map-reveal').click();
    await expect.poll(() => app.evaluate(() => global.__revealed.length)).toBeGreaterThan(0);
    const rev = await app.evaluate(() => global.__revealed);
    H.writeEvidence('map-reveal.json', rev);
    expect(ctx.consoleErrors).toEqual([]);
  } finally {
    await ctx.close();
  }
});
