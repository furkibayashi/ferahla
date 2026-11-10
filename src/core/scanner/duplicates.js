'use strict';
/**
 * Kademeli kopya bulma: boyut eşleşmesi -> ilk+son 64 KB hash -> tam sha1.
 */
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');

const CHUNK = 64 * 1024;

async function partialHash(path, size) {
  const fh = await fsp.open(path, 'r');
  try {
    const h = crypto.createHash('sha1');
    h.update(String(size) + ':');
    const headLen = Math.min(CHUNK, size);
    const head = Buffer.alloc(headLen);
    await fh.read(head, 0, headLen, 0);
    h.update(head);
    if (size > CHUNK) {
      const tailLen = Math.min(CHUNK, size - CHUNK);
      const tail = Buffer.alloc(tailLen);
      await fh.read(tail, 0, tailLen, size - tailLen);
      h.update(tail);
    }
    return h.digest('hex');
  } finally {
    await fh.close();
  }
}

function fullHash(path, isCancelled, onBytes) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1');
    const s = fs.createReadStream(path, { highWaterMark: 1024 * 1024 });
    s.on('data', (b) => {
      if (isCancelled()) { s.destroy(Object.assign(new Error('cancelled'), { code: 'CANCELLED' })); return; }
      h.update(b);
      if (onBytes) onBytes(b.length);
    });
    s.on('error', reject);
    s.on('end', () => resolve(h.digest('hex')));
  });
}

function groupBy(items, keyFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (k === undefined || k === null) continue;
    let a = m.get(k);
    if (!a) m.set(k, (a = []));
    a.push(it);
  }
  return m;
}

/**
 * @param {Array<{path:string,size:number,mtimeMs:number}>} files
 * @param {object} o { minBytes, isCancelled, onProgress({files, bytes, currentPath, phase}), maxGroups }
 * @returns {Promise<{groups, wastedBytes, cancelled?:boolean}>}
 */
async function findDuplicateGroups(files, o = {}) {
  const minBytes = Math.max(1, o.minBytes ?? 1024 * 1024);
  const isCancelled = o.isCancelled || (() => false);
  const onProgress = o.onProgress || (() => {});
  const maxGroups = o.maxGroups || 5000;
  let lastEmit = 0;
  let hashedFiles = 0;
  let hashedBytes = 0;
  const emit = (currentPath, phase, force) => {
    const now = Date.now();
    if (!force && now - lastEmit < 100) return;
    lastEmit = now;
    onProgress({ files: hashedFiles, bytes: hashedBytes, currentPath, phase });
  };

  // 1) boyut
  const bySize = groupBy(files.filter((f) => f.size >= minBytes), (f) => f.size);
  const sizeGroups = [...bySize.values()].filter((g) => g.length > 1);

  // 2) ilk+son 64 KB
  const partialGroups = [];
  for (const g of sizeGroups) {
    const withHash = [];
    for (const f of g) {
      if (isCancelled()) return { groups: [], wastedBytes: 0, cancelled: true };
      try {
        f.partial = await partialHash(f.path, f.size);
        withHash.push(f);
      } catch (e) { /* okunamıyor: atla */ }
      hashedFiles++;
      hashedBytes += Math.min(f.size, 2 * CHUNK);
      emit(f.path, 'partial');
    }
    for (const pg of groupBy(withHash, (f) => f.partial).values()) if (pg.length > 1) partialGroups.push(pg);
  }

  // 3) tam sha1 (128 KB'tan küçük dosyalarda kısmi hash zaten tüm içeriktir)
  const result = [];
  for (const g of partialGroups) {
    const size = g[0].size;
    let hashed;
    if (size <= 2 * CHUNK) {
      hashed = g.map((f) => ({ ...f, full: f.partial }));
    } else {
      hashed = [];
      for (const f of g) {
        if (isCancelled()) return { groups: [], wastedBytes: 0, cancelled: true };
        try {
          const full = await fullHash(f.path, isCancelled, (n) => { hashedBytes += n; emit(f.path, 'full'); });
          hashed.push({ ...f, full });
        } catch (e) {
          if (e.code === 'CANCELLED') return { groups: [], wastedBytes: 0, cancelled: true };
        }
        hashedFiles++;
      }
    }
    for (const fg of groupBy(hashed, (f) => f.full).values()) {
      if (fg.length < 2) continue;
      result.push({
        hash: fg[0].full,
        sizeBytes: size,
        files: fg
          .map((f) => ({ path: f.path, mtimeMs: f.mtimeMs }))
          .sort((a, b) => a.mtimeMs - b.mtimeMs || a.path.localeCompare(b.path)),
      });
    }
  }
  result.sort((a, b) => b.sizeBytes * (b.files.length - 1) - a.sizeBytes * (a.files.length - 1));
  const groups = result.slice(0, maxGroups);
  const wastedBytes = groups.reduce((s, g) => s + g.sizeBytes * (g.files.length - 1), 0);
  emit('', 'done', true);
  return { groups, wastedBytes };
}

module.exports = { findDuplicateGroups, partialHash, CHUNK };
