'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const crypto = require('crypto');
const { scanTree } = require('../../src/core/scanner/tree');
const { findDuplicates } = require('../../src/core/scanner/queries');
const { findDuplicateGroups, partialHash } = require('../../src/core/scanner/duplicates');
const { makeTmp } = require('./helpers');

function rnd(n, seed) {
  // deterministik içerik
  const out = Buffer.alloc(n);
  let h = crypto.createHash('sha256').update(String(seed)).digest();
  for (let i = 0; i < n; i += h.length) {
    h.copy(out, i, 0, Math.min(h.length, n - i));
    h = crypto.createHash('sha256').update(h).digest();
  }
  return out;
}

test('findDuplicates: kademeli eşleştirme ve boşa giden alan', async (t) => {
  const tmp = makeTmp();
  t.after(() => tmp.cleanup());
  const MB = 1024 * 1024;
  const A = rnd(MB + 500, 'A');           // 3 kopya
  const B = rnd(200 * 1024, 'B');          // 2 kopya
  const C1 = rnd(300 * 1024, 'C');         // aynı boyut, yalnızca ortası farklı (kısmi hash aynı, tam hash farklı)
  const C2 = Buffer.from(C1); C2[150 * 1024] ^= 0xff;
  const D1 = rnd(80 * 1024, 'D');          // aynı boyut, baştan farklı
  const D2 = rnd(80 * 1024, 'D2');
  const S = rnd(500, 'S');                 // eşik altı küçük kopyalar

  tmp.file('r/foto/a1.jpg', A, Date.now() - 10000);
  tmp.file('r/yedek/a2.jpg', A, Date.now() - 5000);
  tmp.file('r/yedek/eski/a3.jpg', A);
  tmp.file('r/b1.pdf', B);
  tmp.file('r/x/b2.pdf', B);
  tmp.file('r/c1.bin', C1);
  tmp.file('r/c2.bin', C2);
  tmp.file('r/d1.bin', D1);
  tmp.file('r/d2.bin', D2);
  tmp.file('r/s1.txt', S);
  tmp.file('r/s2.txt', S);
  tmp.file('r/node_modules/p/a4.jpg', A); // atlanmalı
  fs.linkSync(tmp.p('r/b1.pdf'), tmp.p('r/b1-hardlink.pdf')); // sabit bağlantı kopya sayılmaz

  const { tree } = await scanTree(tmp.p('r'), { platform: 'linux' });
  const phases = new Set();
  const res = await findDuplicates(tree, { minBytes: 1024, onProgress: (p) => phases.add(p.phase) });
  assert.equal(res.groups.length, 2);
  const [g1, g2] = res.groups;
  assert.equal(g1.sizeBytes, A.length);
  assert.deepEqual(g1.files.map((f) => f.path), [tmp.p('r/foto/a1.jpg'), tmp.p('r/yedek/a2.jpg'), tmp.p('r/yedek/eski/a3.jpg')]); // eskiden yeniye
  assert.equal(g1.hash, crypto.createHash('sha1').update(A).digest('hex'));
  assert.equal(g2.sizeBytes, B.length);
  assert.equal(g2.files.length, 2);
  assert.equal(res.wastedBytes, 2 * A.length + B.length);
  assert.ok(phases.has('done'));

  // Varsayılan eşik 1 MB: yalnız A grubu
  const res2 = await findDuplicates(tree, {});
  assert.equal(res2.groups.length, 1);

  // Hariç tutulan klasör
  const res3 = await findDuplicates(tree, { minBytes: 1024, excluded: [tmp.p('r/yedek')] });
  assert.equal(res3.groups.length, 1);
  assert.equal(res3.groups[0].sizeBytes, B.length);
});

test('findDuplicateGroups: iptal ve okunamayan dosya', async (t) => {
  const tmp = makeTmp();
  t.after(() => tmp.cleanup());
  const X = rnd(300 * 1024, 'X');
  const f1 = tmp.file('x1', X);
  const f2 = tmp.file('x2', X);
  const files = [f1, f2].map((p) => ({ path: p, size: X.length, mtimeMs: 0 }));
  const c = await findDuplicateGroups(files, { minBytes: 1, isCancelled: () => true });
  assert.equal(c.cancelled, true);
  const missing = [...files, { path: tmp.p('olmayan'), size: X.length, mtimeMs: 0 }];
  const r = await findDuplicateGroups(missing, { minBytes: 1 });
  assert.equal(r.groups.length, 1);
  assert.equal(r.groups[0].files.length, 2);
});

test('partialHash: boyut dahil, küçük dosyada tüm içerik', async (t) => {
  const tmp = makeTmp();
  t.after(() => tmp.cleanup());
  const a = tmp.file('a', Buffer.from('merhaba'));
  const b = tmp.file('b', Buffer.from('merhabA'));
  assert.notEqual(await partialHash(a, 7), await partialHash(b, 7));
});
