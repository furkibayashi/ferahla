'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { scanTree, CompactTree } = require('../../src/core/scanner/tree');
const { ScanManager } = require('../../src/core/scanner');
const { findLarge } = require('../../src/core/scanner/queries');
const { fileType } = require('../../src/core/scanner/filetypes');
const { makeTmp } = require('./helpers');

function once(emitter, event, filter = () => true) {
  return new Promise((resolve) => {
    const h = (p) => { if (filter(p)) { emitter.off(event, h); resolve(p); } };
    emitter.on(event, h);
  });
}

/** Bilinen boyutlarla bir ağaç üret. */
function buildTree(tmp) {
  const root = tmp.mkdir('tree');
  tmp.file('tree/a.txt', Buffer.alloc(100));
  tmp.file('tree/big/film.mkv', Buffer.alloc(5000));
  tmp.file('tree/big/arsiv.zip', Buffer.alloc(3000));
  tmp.file('tree/big/nested/kurulum.exe', Buffer.alloc(2000));
  tmp.file('tree/small/x1.txt', Buffer.alloc(10));
  tmp.file('tree/small/x2.txt', Buffer.alloc(20));
  tmp.mkdir('tree/empty');
  // dışarıda büyük dosya + içeride ona symlink (sayılmamalı)
  tmp.file('outside/huge.iso', Buffer.alloc(50000));
  fs.symlinkSync(tmp.p('outside', 'huge.iso'), tmp.p('tree', 'link-to-huge.iso'));
  fs.symlinkSync(tmp.p('outside'), tmp.p('tree', 'link-to-outside-dir'));
  // symlink döngüsü
  fs.symlinkSync('..', tmp.p('tree', 'small', 'loop'));
  fs.symlinkSync(root, tmp.p('tree', 'big', 'nested', 'loop2'));
  return root;
}

test('scanTree: boyut ve sayı doğruluğu, symlink takip edilmez, döngü yok', async (t) => {
  const tmp = makeTmp();
  t.after(() => tmp.cleanup());
  const root = buildTree(tmp);
  const r = await scanTree(root, { platform: 'linux' });
  assert.equal(r.cancelled, false);
  assert.equal(r.files, 6);
  assert.equal(r.bytes, 100 + 5000 + 3000 + 2000 + 10 + 20);
  assert.equal(r.tree.totalBytes, 10130);
  assert.equal(r.tree.totalFiles, 6);
  assert.equal(r.links, 4);
  assert.equal(r.dirs, 5); // tree, big, nested, small, empty

  const kids = r.tree.getChildren(root);
  assert.deepEqual(kids.map((k) => k.name), ['big', 'a.txt', 'small', 'empty']);
  assert.deepEqual(kids[0], { name: 'big', path: path.join(root, 'big'), isDir: true, sizeBytes: 10000, fileCount: 3 });
  assert.equal(kids[3].sizeBytes, 0);
  const nested = r.tree.getChildren(path.join(root, 'big', 'nested'));
  assert.deepEqual(nested, [{ name: 'kurulum.exe', path: path.join(root, 'big', 'nested', 'kurulum.exe'), isDir: false, sizeBytes: 2000, fileCount: 1 }]);
  assert.equal(r.tree.getChildren(path.join(root, 'yok')), null);
  assert.equal(r.tree.getChildren(tmp.p('outside')), null);
});

test('scanTree: sabit bağlantılar (hardlink) bir kez sayılır', async (t) => {
  const tmp = makeTmp();
  t.after(() => tmp.cleanup());
  const root = tmp.mkdir('h');
  tmp.file('h/a.bin', Buffer.alloc(4000));
  fs.linkSync(tmp.p('h', 'a.bin'), tmp.p('h', 'b.bin'));
  const r = await scanTree(root, { platform: 'linux' });
  assert.equal(r.tree.totalBytes, 4000);
  assert.equal(r.tree.totalFiles, 2);
});

test('scanTree: iptal', async (t) => {
  const tmp = makeTmp();
  t.after(() => tmp.cleanup());
  for (let i = 0; i < 50; i++) tmp.file(`c/d${i}/f.txt`, 'x');
  let calls = 0;
  const r = await scanTree(tmp.p('c'), { platform: 'linux', isCancelled: () => ++calls > 3 });
  assert.equal(r.cancelled, true);
});

test('scanTree: olmayan kök hata fırlatır; dosya kök reddedilir', async (t) => {
  const tmp = makeTmp();
  t.after(() => tmp.cleanup());
  await assert.rejects(scanTree(tmp.p('yok')), { code: 'ENOENT' });
  tmp.file('f.txt', 'x');
  await assert.rejects(scanTree(tmp.p('f.txt')), { code: 'ENOTDIR' });
});

test('CompactTree: büyüme, remove ve ata toplamları', () => {
  const tr = new CompactTree('/kok', { platform: 'linux', capacity: 2 });
  const a = tr.add(0, 'a', true, 0, 0);
  for (let i = 0; i < 3000; i++) tr.add(a, `f${i}`, false, 10, 0);
  tr.add(0, 'b.bin', false, 7, 0);
  tr.finalize();
  assert.equal(tr.totalBytes, 30007);
  assert.equal(tr.totalFiles, 3001);
  assert.equal(tr.remove('/kok/a/f5'), true);
  assert.equal(tr.totalBytes, 29997);
  assert.equal(tr.getChildren('/kok')[0].fileCount, 2999);
  assert.equal(tr.remove('/kok/a'), true);
  assert.equal(tr.totalBytes, 7);
  assert.equal(tr.totalFiles, 1);
  assert.equal(tr.remove('/kok'), false); // kök çıkarılamaz
});

test('CompactTree: Windows yollarında büyük/küçük harf duyarsız arama', () => {
  const tr = new CompactTree('C:\\', { platform: 'win32' });
  const u = tr.add(0, 'Users', true, 0, 0);
  tr.add(u, 'Ali.TXT', false, 5, 0);
  tr.finalize();
  assert.equal(tr.getChildren('c:\\users').length, 1);
  assert.equal(tr.getChildren('C:\\USERS')[0].path, 'C:\\Users\\Ali.TXT');
});

test('findLarge: eşik, tür filtresi, sınır, hariç tutulan klasörler', async (t) => {
  const tmp = makeTmp();
  t.after(() => tmp.cleanup());
  const root = buildTree(tmp);
  tmp.file('tree/node_modules/pkg/dev.zip', Buffer.alloc(9000));
  const { tree } = await scanTree(root, { platform: 'linux' });
  const all = findLarge(tree, { minBytes: 1000 });
  assert.deepEqual(all.map((f) => f.name), ['film.mkv', 'arsiv.zip', 'kurulum.exe']); // node_modules atlanır
  assert.deepEqual(all.map((f) => f.type), ['video', 'archive', 'installer']);
  assert.ok(all[0].mtimeMs > 0);
  assert.deepEqual(findLarge(tree, { minBytes: 1000, types: ['archive'] }).map((f) => f.name), ['arsiv.zip']);
  assert.equal(findLarge(tree, { minBytes: 1000, limit: 1 }).length, 1);
  assert.deepEqual(findLarge(tree, { minBytes: 1000, excluded: [path.join(root, 'big', 'nested')] }).map((f) => f.name), ['film.mkv', 'arsiv.zip']);
  assert.equal(findLarge(tree, {}).length, 0); // varsayılan eşik 100 MB
  assert.equal(findLarge(tree, { minBytes: 1000, excluded: [root] }).length, 0);
});

test('fileType', () => {
  assert.equal(fileType('Film.MKV'), 'video');
  assert.equal(fileType('win11.iso'), 'disk');
  assert.equal(fileType('setup.msi'), 'installer');
  assert.equal(fileType('foto.HEIC'), 'image');
  assert.equal(fileType('yedek.tar.gz'), 'archive');
  assert.equal(fileType('README'), 'other');
  assert.equal(fileType('.bashrc'), 'other');
});

test('ScanManager (worker_threads): tarama, ilerleme, sorgular, iptal, önceki sonucun korunması', async (t) => {
  const tmp = makeTmp();
  const m = new ScanManager({ platform: 'linux' });
  t.after(async () => { await m.dispose(); tmp.cleanup(); });
  const root = buildTree(tmp);

  await assert.rejects(m.getChildren(root), { code: 'no-scan' });

  const progress = [];
  m.on('progress', (p) => progress.push(p));
  const id1 = m.scan(root);
  const d1 = await once(m, 'done', (d) => d.scanId === id1);
  assert.equal(d1.ok, true);
  assert.equal(d1.root, root);
  assert.equal(d1.totalBytes, 10130);
  assert.equal(d1.files, 6);
  assert.equal(d1.skipped, 0);
  assert.ok(d1.durationMs >= 0);
  assert.ok(progress.length >= 1, 'en az bir ilerleme olayı');
  assert.ok(progress.every((p) => p.scanId === id1 && typeof p.currentPath === 'string'));

  const kids = await m.getChildren(root);
  assert.equal(kids[0].name, 'big');
  assert.equal(await m.getChildren(tmp.p('outside')), null);
  const large = await m.findLarge({ minBytes: 2500 });
  assert.deepEqual(large.map((f) => f.name), ['film.mkv', 'arsiv.zip']);

  // İptal edilen yeni tarama önceki sonucu bozmaz
  for (let i = 0; i < 300; i++) tmp.file(`big2/d${i}/f.bin`, 'x');
  const id2 = m.scan(tmp.p('big2'));
  m.cancel();
  const d2 = await once(m, 'done', (d) => d.scanId === id2);
  assert.equal(d2.ok, false);
  assert.equal(d2.error, 'cancelled');
  const still = await m.getChildren(root);
  assert.equal(still[0].name, 'big');

  // Çöpe taşıma sonrası ağaçtan çıkarma
  await m.removePaths([path.join(root, 'big', 'film.mkv')]);
  const after = await m.getChildren(root);
  assert.equal(after.find((k) => k.name === 'big').sizeBytes, 5000);

  // Olmayan kök
  const id3 = m.scan(tmp.p('olmayan'));
  const d3 = await once(m, 'done', (d) => d.scanId === id3);
  assert.equal(d3.ok, false);
  assert.equal(d3.error, 'not-found');
});

test('ScanManager: yeni tarama süren taramanın yerine geçer', async (t) => {
  const tmp = makeTmp();
  const m = new ScanManager({ platform: 'linux' });
  t.after(async () => { await m.dispose(); tmp.cleanup(); });
  for (let i = 0; i < 200; i++) tmp.file(`a/d${i}/f.bin`, 'x');
  tmp.file('b/tek.bin', Buffer.alloc(42));
  const dones = [];
  m.on('done', (d) => dones.push(d));
  const ida = m.scan(tmp.p('a'));
  const idb = m.scan(tmp.p('b'));
  await once(m, 'done', (d) => d.scanId === idb);
  assert.equal(dones.find((d) => d.scanId === ida).error, 'superseded');
  assert.equal(dones.find((d) => d.scanId === idb).totalBytes, 42);
});
