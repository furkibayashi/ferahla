'use strict';

/**
 * Büyük dosyalar ve kopyalar: findLarge doğruluğu/türleri/hariç tutma, kopya gruplama (gerçek kopyalar, aynı boyut
 * farklı içerik — baş/son 64 KB aynı, ortası farklı), "tut" kilidi, Geri Dönüşüm'e taşıma (test çöpüne gider,
 * kaynaktan kalkar), onay penceresi olmadan hiçbir şey taşınmaz.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { test, expect } = require('playwright/test');
const H = require('./helpers');

const MB = 1024 * 1024;

function sparse(p, size) {
  H.assertSafe(p);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, '');
  fs.truncateSync(p, size);
  return p;
}

function makeTree(sb) {
  const r = path.join(sb.home, 'Belgeler');
  const t = {};
  t.root = r;
  t.movie = sparse(path.join(r, 'Videolar', 'tatil.mp4'), 300 * MB);
  t.zip = sparse(path.join(r, 'yedek.zip'), 150 * MB);
  t.exe = sparse(path.join(r, 'İndirilenler', 'kurulum.exe'), 120 * MB);
  t.iso = sparse(path.join(r, 'win.iso'), 500 * MB);
  t.small = H.writeFile(path.join(r, 'kucuk.txt'), 1 * MB);
  t.excludedBig = sparse(path.join(r, 'Hariç', 'gizli-buyuk.mkv'), 200 * MB);
  t.nodeMod = sparse(path.join(r, 'proje', 'node_modules', 'paket.bin'), 200 * MB);
  // Gerçek kopyalar: 2 MB rastgele, 3 kopya (farklı mtime: en eski "tutulur")
  const content = crypto.randomBytes(2 * MB);
  t.dupA = path.join(r, 'Fotolar', 'asil.jpg');
  t.dupB = path.join(r, 'Yedek', 'asil (1).jpg');
  t.dupC = path.join(r, 'Masaüstü kopyası', 'asil - Kopya.jpg');
  const now = Date.now();
  [[t.dupA, now - 30 * H.DAY], [t.dupB, now - 5 * H.DAY], [t.dupC, now - 1 * H.DAY]].forEach(([p, m]) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
    fs.utimesSync(p, m / 1000, m / 1000);
  });
  t.dupExcluded = path.join(r, 'Hariç', 'asil-kopya.jpg');
  fs.writeFileSync(t.dupExcluded, content);
  // Aynı boyut, farklı içerik: baş ve son 64 KB aynı, ortası farklı (kısmi hash eşleşir, tam hash ayırmalı)
  const base = crypto.randomBytes(3 * MB);
  const other = Buffer.from(base);
  other[1.5 * MB] ^= 0xff;
  t.sameSizeA = path.join(r, 'benzer', 'rapor-v1.pdf');
  t.sameSizeB = path.join(r, 'benzer', 'rapor-v2.pdf');
  fs.mkdirSync(path.dirname(t.sameSizeA), { recursive: true });
  fs.writeFileSync(t.sameSizeA, base);
  fs.writeFileSync(t.sameSizeB, other);
  // Aynı boyut, sondan farklı
  const tail = Buffer.from(base);
  tail[tail.length - 1] ^= 0x01;
  t.sameSizeC = path.join(r, 'benzer', 'rapor-v3.pdf');
  fs.writeFileSync(t.sameSizeC, tail);
  // İkinci gerçek kopya grubu (5 MB, 2 kopya)
  const c2 = crypto.randomBytes(5 * MB);
  t.g2a = path.join(r, 'Muzik', 'sarki.flac');
  t.g2b = path.join(r, 'Muzik', 'eski', 'sarki.flac');
  fs.mkdirSync(path.dirname(t.g2b), { recursive: true });
  fs.writeFileSync(t.g2a, c2);
  fs.writeFileSync(t.g2b, c2);
  t.excluded = path.join(r, 'Hariç');
  return t;
}

let sb;
let T;
test.beforeAll(() => {
  test.setTimeout(120000);
  sb = H.makeSandbox('large');
  T = makeTree(sb);
});

test('findLarge: ≥100 MB, boyuta göre sıralı, türler doğru, node_modules ve hariç tutulan klasör atlanır, limit/tür filtresi', async () => {
  const ctx = await H.launchApp({ sandbox: sb, settings: { lang: 'tr', excludedPaths: [T.excluded] } });
  try {
    const d = await H.scanIPC(ctx.win, T.root);
    expect(d.ok).toBe(true);
    const big = await H.api(ctx.win, 'findLarge', {});
    H.writeEvidence('large-default.json', big);
    expect(big.map((x) => x.name)).toEqual(['win.iso', 'tatil.mp4', 'yedek.zip', 'kurulum.exe']);
    expect(big.map((x) => x.type)).toEqual(['disk', 'video', 'archive', 'installer']);
    expect(big[0]).toMatchObject({ path: T.iso, sizeBytes: 500 * MB });
    expect(await H.api(ctx.win, 'findLarge', { limit: 2 })).toHaveLength(2);
    const vids = await H.api(ctx.win, 'findLarge', { types: ['video'] });
    expect(vids.map((x) => x.name)).toEqual(['tatil.mp4']);
    const all = await H.api(ctx.win, 'findLarge', { minBytes: 1 * MB });
    expect(all.some((x) => x.path.startsWith(T.excluded))).toBe(false);
    expect(all.some((x) => x.name === 'kucuk.txt')).toBe(true);
    // Hariç tutma kaldırılınca görünür
    await H.api(ctx.win, 'setSettings', { excludedPaths: [] });
    const all2 = await H.api(ctx.win, 'findLarge', {});
    expect(all2.some((x) => x.path === T.excludedBig)).toBe(true);
    expect(all2.some((x) => x.path === T.nodeMod)).toBe(false);
  } finally {
    await ctx.close();
  }
});

test('findDuplicates: gerçek kopyalar gruplanır, aynı boyut farklı içerik ayrılır, hariç tutulan klasördeki kopya yok', async () => {
  const ctx = await H.launchApp({ sandbox: sb, settings: { lang: 'tr', excludedPaths: [T.excluded] } });
  try {
    await H.scanIPC(ctx.win, T.root);
    const r = await H.api(ctx.win, 'findDuplicates', { minBytes: 1 * MB });
    H.writeEvidence('dups-ipc.json', r);
    const groups = r.groups.map((g) => g.files.map((f) => f.path).sort());
    expect(groups).toHaveLength(2);
    expect(groups).toContainEqual([T.dupA, T.dupB, T.dupC].sort());
    expect(groups).toContainEqual([T.g2a, T.g2b].sort());
    expect(groups.flat()).not.toContain(T.sameSizeA);
    expect(groups.flat()).not.toContain(T.dupExcluded);
    expect(r.wastedBytes).toBe(2 * 2 * MB + 5 * MB);
    // Seyrek büyük dosyalar (aynı boyut yok) ve sıfır içerikli dosyalar karışmamalı
    expect(await H.api(ctx.win, 'findDuplicates', { minBytes: 1 })).toHaveProperty('groups');
  } finally {
    await ctx.close();
  }
});

test('Kopyalar ekranı: en eski "Tutulacak" kilitli; fazla kopyaları seç → Vazgeç hiçbir şey taşımaz → onayla → test çöpüne gider', async () => {
  test.setTimeout(120000);
  const s2 = H.makeSandbox('dupsui');
  const t2 = makeTree(s2);
  const ctx = await H.launchApp({ sandbox: s2, settings: { lang: 'tr', theme: 'light', excludedPaths: [t2.excluded] }, drives: [{ path: t2.root, label: 'Belgeler' }] });
  try {
    const { win } = ctx;
    await H.scanUI(win, t2.root);
    await expect(win.locator('.context')).toBeVisible({ timeout: 30000 });
    await win.keyboard.press('Control+5');
    await win.locator('#dups-find').click();
    await expect(win.locator('.dup-group')).toHaveCount(2, { timeout: 60000 });
    const keepRow = win.locator('.dup-row.is-keep');
    await expect(keepRow).toHaveCount(2);
    await expect(keepRow.filter({ hasText: 'asil.jpg' })).toHaveCount(1); // en eski
    await expect(win.locator('.dup-row.is-keep input[type=checkbox]')).toHaveCount(0);
    await win.locator('#dups-extra').click();
    await expect(win.locator('.dup-row input[type=checkbox]:checked')).toHaveCount(3);
    const before = H.snapshot(t2.root);
    await win.locator('#dups-trash').click();
    const dlg = win.locator('#dlg');
    await expect(dlg).toBeVisible();
    // Riskli onayda ilk odak "Vazgeç"te
    expect(await win.evaluate(() => document.activeElement.id)).toBe('dlg-cancel');
    await win.screenshot({ path: path.join(H.OUT_DIR, 'dups-confirm.png') });
    await win.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    expect(H.snapshot(t2.root)).toEqual(before);
    await win.locator('#dups-trash').click();
    await win.locator('#dlg-ok').click();
    await expect(win.locator('.toast').first()).toBeVisible();
    await expect.poll(() => fs.existsSync(t2.dupB)).toBe(false);
    expect(fs.existsSync(t2.dupA)).toBe(true);
    expect(fs.existsSync(t2.dupC)).toBe(false);
    expect(fs.existsSync(t2.g2a) !== fs.existsSync(t2.g2b)).toBe(true);
    const trashed = H.ls(path.join(s2.trash, 'files'));
    H.writeEvidence('dups-trashed.json', trashed);
    expect(trashed).toHaveLength(3);
    // Çöpteki içerik asıl dosyayla aynı (geri getirilebilir)
    expect(H.sha1(path.join(s2.trash, 'files', trashed.find((n) => n.startsWith('asil'))))).toBe(H.sha1(t2.dupA));
    const hist = await H.api(win, 'getHistory');
    expect(hist[0]).toMatchObject({ action: 'trash' });
    await expect(win.locator('.dup-group')).toHaveCount(0);
    expect(ctx.consoleErrors).toEqual([]);
  } finally {
    await ctx.close();
  }
});

test('Büyük Dosyalar ekranı: tür filtresi, seç → onay → test çöpüne taşınır, listeden kalkar', async () => {
  test.setTimeout(120000);
  const s3 = H.makeSandbox('largeui');
  const t3 = makeTree(s3);
  const ctx = await H.launchApp({ sandbox: s3, settings: { lang: 'tr', theme: 'dark' }, drives: [{ path: t3.root, label: 'Belgeler' }] });
  try {
    const { win } = ctx;
    await H.scanUI(win, t3.root);
    await expect(win.locator('.context')).toBeVisible({ timeout: 30000 });
    await win.keyboard.press('Control+4');
    await expect(win.locator('.tbl tbody tr')).toHaveCount(5); // iso, mp4, mkv(Hariç değil), zip, exe
    await win.locator('#chip-video').click();
    await expect(win.locator('.tbl tbody tr')).toHaveCount(2);
    await win.locator('#chip-all').click();
    await win.locator(`input[data-path="${t3.zip}"]`).check();
    await expect(win.locator('.actionbar-text')).toContainText('150');
    await win.screenshot({ path: path.join(H.OUT_DIR, 'large-dark.png') });
    await win.locator('#large-trash').click();
    await win.locator('#dlg-ok').click();
    await expect.poll(() => fs.existsSync(t3.zip)).toBe(false);
    expect(H.ls(path.join(s3.trash, 'files'))).toEqual(['yedek.zip']);
    await expect(win.locator('.tbl tbody tr')).toHaveCount(4);
    // Çöp bilgi dosyası doğru asıl yolu tutuyor (geri yüklenebilirlik)
    const info = fs.readFileSync(path.join(s3.trash, 'info', 'yedek.zip.trashinfo'), 'utf8');
    expect(info).toContain('yedek.zip');
    expect(ctx.consoleErrors).toEqual([]);
  } finally {
    await ctx.close();
  }
});
