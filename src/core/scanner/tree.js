'use strict';
/**
 * Kompakt dizin ağacı + tarama.
 *
 * Her düğüm bir tamsayı indeksidir; alanlar tiplenmiş dizilerde (typed array) tutulur:
 *   parent(Int32) firstChild(Int32) nextSibling(Int32) size(Float64) mtime(Float64) count(Uint32) flags(Uint8)
 * ve adlar düz bir JS dizisinde. 500k düğüm ≈ 16 MB dizi + adlar (~20-30 MB).
 * Ebeveynin indeksi her zaman çocuğundan küçüktür; böylece toplamlar tek bir ters geçişle hesaplanır.
 */
const fsp = require('fs/promises');
const nodePath = require('path');

const F_DIR = 1;
const F_HARDLINK_DUP = 2; // aynı dosyanın ikinci+ sabit bağlantısı (boyut bir kez sayılır)
const F_ERROR = 4; // okunamayan klasör

class CompactTree {
  constructor(rootPath, { platform = process.platform, capacity = 1 << 14 } = {}) {
    this.platform = platform;
    this.P = platform === 'win32' ? nodePath.win32 : nodePath.posix;
    this.rootPath = this.P.resolve(rootPath);
    this.cap = 0;
    this.n = 0;
    this.names = [];
    this._grow(capacity);
    this.add(-1, this.rootPath, true, 0, 0);
    this.finalized = false;
  }

  _grow(min) {
    let cap = Math.max(this.cap * 2, min, 1024);
    const grow = (Old, T) => { const a = new T(cap); if (Old) a.set(Old.subarray(0, this.n)); return a; };
    this.parent = grow(this.parent, Int32Array);
    this.firstChild = grow(this.firstChild, Int32Array);
    this.nextSibling = grow(this.nextSibling, Int32Array);
    this.size = grow(this.size, Float64Array);
    this.mtime = grow(this.mtime, Float64Array);
    this.count = grow(this.count, Uint32Array);
    this.flags = grow(this.flags, Uint8Array);
    this.cap = cap;
  }

  add(parent, name, isDir, size, mtime, extraFlags = 0) {
    if (this.n >= this.cap) this._grow(this.n + 1);
    const i = this.n++;
    this.names[i] = name;
    this.parent[i] = parent;
    this.firstChild[i] = -1;
    this.size[i] = size;
    this.mtime[i] = mtime;
    this.count[i] = isDir ? 0 : 1;
    this.flags[i] = (isDir ? F_DIR : 0) | extraFlags;
    if (parent >= 0) {
      this.nextSibling[i] = this.firstChild[parent];
      this.firstChild[parent] = i;
    } else {
      this.nextSibling[i] = -1;
    }
    return i;
  }

  isDir(i) { return (this.flags[i] & F_DIR) !== 0; }

  /** Klasör boyutlarını ve dosya sayılarını hesapla (çocuklardan ebeveyne). */
  finalize() {
    for (let i = 0; i < this.n; i++) {
      if (this.flags[i] & F_DIR) { this.size[i] = 0; this.count[i] = 0; }
    }
    for (let i = this.n - 1; i > 0; i--) {
      const p = this.parent[i];
      if (this.flags[i] & F_DIR) {
        this.size[p] += this.size[i];
        this.count[p] += this.count[i];
      } else {
        if (!(this.flags[i] & F_HARDLINK_DUP)) this.size[p] += this.size[i];
        this.count[p] += 1;
      }
    }
    this.finalized = true;
  }

  pathOf(i) {
    const parts = [];
    while (i > 0) { parts.push(this.names[i]); i = this.parent[i]; }
    parts.reverse();
    return parts.length ? this.P.join(this.rootPath, ...parts) : this.rootPath;
  }

  /** Yolu düğüm indeksine çevir; ağaçta yoksa -1. */
  find(p) {
    if (typeof p !== 'string' || !p) return -1;
    const P = this.P;
    const rel = P.relative(this.rootPath, P.resolve(p));
    if (rel === '') return 0;
    if (rel.startsWith('..') || P.isAbsolute(rel)) return -1;
    const ci = this.platform === 'win32';
    let cur = 0;
    for (const seg of rel.split(P.sep)) {
      if (!seg) continue;
      const want = ci ? seg.toLowerCase() : seg;
      let c = this.firstChild[cur];
      while (c >= 0) {
        const nm = ci ? this.names[c].toLowerCase() : this.names[c];
        if (nm === want) break;
        c = this.nextSibling[c];
      }
      if (c < 0) return -1;
      cur = c;
    }
    return cur;
  }

  children(i) {
    const out = [];
    for (let c = this.firstChild[i]; c >= 0; c = this.nextSibling[c]) out.push(c);
    return out;
  }

  /** getChildren sözleşmesi: boyuta göre azalan. */
  getChildren(p) {
    const i = this.find(p);
    if (i < 0) return null;
    const base = this.pathOf(i);
    return this.children(i)
      .map((c) => ({
        name: this.names[c],
        path: this.P.join(base, this.names[c]),
        isDir: this.isDir(c),
        sizeBytes: this.size[c],
        fileCount: this.count[c],
      }))
      .sort((a, b) => b.sizeBytes - a.sizeBytes || a.name.localeCompare(b.name));
  }

  /**
   * Dosyaları dolaş. skipDir(path) true dönerse o alt ağaç atlanır.
   * cb(index, path)
   */
  forEachFile(cb, skipDir) {
    const stack = [[0, this.rootPath]];
    while (stack.length) {
      const [i, p] = stack.pop();
      for (let c = this.firstChild[i]; c >= 0; c = this.nextSibling[c]) {
        const cp = this.P.join(p, this.names[c]);
        if (this.flags[c] & F_DIR) {
          if (skipDir && skipDir(cp)) continue;
          stack.push([c, cp]);
        } else if (!(this.flags[c] & F_HARDLINK_DUP)) {
          cb(c, cp);
        }
      }
    }
  }

  /** Düğümü (ve alt ağacını) ağaçtan çıkar; ata toplamlarını güncelle. Çöp kutusuna taşıma sonrası. */
  remove(p) {
    const i = this.find(p);
    if (i <= 0) return false;
    const size = this.flags[i] & F_HARDLINK_DUP ? 0 : this.size[i];
    const count = this.count[i];
    const par = this.parent[i];
    // bağlı listeden çıkar
    if (this.firstChild[par] === i) this.firstChild[par] = this.nextSibling[i];
    else {
      let c = this.firstChild[par];
      while (c >= 0 && this.nextSibling[c] !== i) c = this.nextSibling[c];
      if (c >= 0) this.nextSibling[c] = this.nextSibling[i];
    }
    for (let a = par; a >= 0; a = this.parent[a]) {
      this.size[a] -= size;
      this.count[a] -= count;
    }
    return true;
  }

  get totalBytes() { return this.size[0]; }
  get totalFiles() { return this.count[0]; }
}

/**
 * Klasörü tara. Symlink/junction takip edilmez, erişim hataları sayılıp atlanır.
 * @param {string} root
 * @param {object} o { platform, onProgress(stats), isCancelled(), progressIntervalMs, skipDirs:string[] }
 * @returns {Promise<{tree, files, dirs, bytes, skipped, links, cancelled}>}
 */
async function scanTree(root, o = {}) {
  const platform = o.platform || process.platform;
  const tree = new CompactTree(root, { platform });
  const P = tree.P;
  const isCancelled = o.isCancelled || (() => false);
  const interval = o.progressIntervalMs ?? 100;
  const ci = platform === 'win32';
  const skipSet = new Set((o.skipDirs || []).map((s) => (ci ? P.resolve(s).toLowerCase() : P.resolve(s))));
  const seenInodes = new Map(); // yalnız nlink>1 dosyalar
  const st = { files: 0, dirs: 0, bytes: 0, skipped: 0, links: 0 };
  let lastEmit = 0;
  let currentPath = tree.rootPath;
  const emit = (force) => {
    const now = Date.now();
    if (!o.onProgress || (!force && now - lastEmit < interval)) return;
    lastEmit = now;
    o.onProgress({ files: st.files, dirs: st.dirs, bytes: st.bytes, currentPath });
  };

  const handleStat = (parent, name, s) => {
    if (s.isSymbolicLink()) { st.links++; return; }
    if (s.isDirectory()) return 'dir';
    if (!s.isFile()) return;
    let flags = 0;
    if (s.nlink > 1) {
      const key = `${s.dev}:${s.ino}`;
      if (seenInodes.has(key)) flags = F_HARDLINK_DUP;
      else seenInodes.set(key, true);
    }
    tree.add(parent, name, false, s.size, s.mtimeMs, flags);
    st.files++;
    if (!flags) st.bytes += s.size;
  };

  // Kök: lstat; symlink ise takip etme.
  try {
    const rs = await fsp.lstat(tree.rootPath);
    if (!rs.isDirectory()) throw Object.assign(new Error('not a directory'), { code: 'ENOTDIR' });
  } catch (e) {
    e.code = e.code || 'ENOENT';
    throw e;
  }

  const stack = [0];
  const dirPaths = [tree.rootPath];
  while (stack.length) {
    if (isCancelled()) return { tree, ...st, cancelled: true };
    const idx = stack.pop();
    const dirPath = dirPaths.pop();
    currentPath = dirPath;
    st.dirs++;
    let dir;
    try {
      dir = await fsp.opendir(dirPath, { bufferSize: 128 });
    } catch (e) {
      st.skipped++;
      tree.flags[idx] |= F_ERROR;
      continue;
    }
    const toStat = [];
    try {
      for await (const d of dir) {
        if (d.isDirectory()) {
          const full = P.join(dirPath, d.name);
          if (skipSet.size && skipSet.has(ci ? full.toLowerCase() : full)) continue;
          const c = tree.add(idx, d.name, true, 0, 0);
          stack.push(c);
          dirPaths.push(full);
        } else if (d.isFile() || d.isSymbolicLink()) {
          // Windows'ta tüm reparse point'ler "link" görünür (OneDrive yer tutucuları dahil): lstat ile ayırt et.
          toStat.push(d.name);
        }
        // FIFO, soket, aygıt: atla
      }
    } catch (e) {
      st.skipped++;
      tree.flags[idx] |= F_ERROR;
    }
    for (let k = 0; k < toStat.length; k += 64) {
      const batch = toStat.slice(k, k + 64);
      const stats = await Promise.all(batch.map((nm) => fsp.lstat(P.join(dirPath, nm)).catch(() => null)));
      for (let j = 0; j < batch.length; j++) {
        const s = stats[j];
        if (!s) { st.skipped++; continue; }
        if (handleStat(idx, batch[j], s) === 'dir') {
          // reparse point olmayan bir klasör (ör. bulut klasörü): içine gir
          const full = P.join(dirPath, batch[j]);
          const c = tree.add(idx, batch[j], true, 0, 0);
          stack.push(c);
          dirPaths.push(full);
        }
      }
      if (isCancelled()) return { tree, ...st, cancelled: true };
      emit(false);
    }
    emit(false);
  }
  tree.finalize();
  emit(true);
  return { tree, ...st, cancelled: false };
}

module.exports = { CompactTree, scanTree, F_DIR, F_HARDLINK_DUP, F_ERROR };
