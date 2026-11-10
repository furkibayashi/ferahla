'use strict';
/** Küçük, link takip etmeyen klasör boyutu ölçümü (temizlik kategorileri ve çöp kutusu için). */
const fsp = require('fs/promises');
const path = require('path');

/**
 * @param {string} dir
 * @param {object} [o] { pattern?:RegExp (yalnız kök seviyesindeki dosyalar), minAgeMs?, now?, uid? (yalnız bu kullanıcının dosyaları) }
 * @returns {Promise<{bytes:number, files:number, exists:boolean}>}
 */
async function measureDir(dir, o = {}) {
  const res = { bytes: 0, files: 0, exists: false };
  let st;
  try {
    st = await fsp.lstat(dir);
  } catch (e) {
    return res;
  }
  if (!st.isDirectory()) return res;
  res.exists = true;
  const cutoff = o.minAgeMs ? (o.now || Date.now()) - o.minAgeMs : Infinity;
  const stack = [dir];
  let top = true;
  while (stack.length) {
    const d = stack.pop();
    let ents;
    try {
      ents = await fsp.readdir(d, { withFileTypes: true });
    } catch (e) {
      top = false;
      continue;
    }
    for (const ent of ents) {
      const full = path.join(d, ent.name);
      if (o.pattern && !(top && o.pattern.test(ent.name))) continue;
      if (ent.isDirectory()) {
        if (!o.pattern) stack.push(full);
        continue;
      }
      let s;
      try {
        s = await fsp.lstat(full);
      } catch (e) {
        continue;
      }
      if (s.isDirectory() && !s.isSymbolicLink()) { if (!o.pattern) stack.push(full); continue; }
      if (s.mtimeMs > cutoff) continue;
      if (o.uid !== undefined && s.uid !== o.uid) continue;
      res.files++;
      if (!s.isSymbolicLink()) res.bytes += s.size;
    }
    top = false;
  }
  return res;
}

/** Bir yolun (dosya ya da klasör) toplam boyutu; linkler takip edilmez. */
async function sizeOfPath(p) {
  try {
    const s = await fsp.lstat(p);
    if (s.isDirectory()) return (await measureDir(p)).bytes;
    if (s.isSymbolicLink()) return 0;
    return s.size;
  } catch (e) {
    return 0;
  }
}

module.exports = { measureDir, sizeOfPath };
