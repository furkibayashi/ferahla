'use strict';
/** Son taramanın ağacı üzerinde sorgular (worker içinde çalışır, ama saf fonksiyonlardır). */
const { fileType } = require('./filetypes');
const { findDuplicateGroups } = require('./duplicates');

// Kopya/büyük dosya aramasında içine girilmeyen klasör adları (her seviyede).
const SKIP_DIR_NAMES = new Set(['node_modules', '.git', '$recycle.bin', 'system volume information', 'windowsapps']);
const SKIP_FILE_NAMES = new Set(['pagefile.sys', 'hiberfil.sys', 'swapfile.sys']);

function makeSkipper(tree, excluded, { names = true } = {}) {
  const P = tree.P;
  const ci = tree.platform === 'win32';
  const norm = (p) => { const n = P.resolve(p); return ci ? n.toLowerCase() : n; };
  const ex = (excluded || []).filter((p) => typeof p === 'string' && P.isAbsolute(p)).map(norm);
  return (dirPath) => {
    if (names && SKIP_DIR_NAMES.has(P.basename(dirPath).toLowerCase())) return true;
    const n = norm(dirPath);
    for (const e of ex) {
      if (n === e || n.startsWith(e.endsWith(P.sep) ? e : e + P.sep)) return true;
    }
    return false;
  };
}

/** Kök klasörün kendisi bir dışlama altında mı? (ör. C:\Windows taranıp kopya istenirse) */
function rootExcluded(tree, excluded) {
  return makeSkipper(tree, excluded, { names: false })(tree.rootPath);
}

function findLarge(tree, { minBytes = 100 * 1024 * 1024, limit = 100, types, excluded } = {}) {
  minBytes = Number.isFinite(minBytes) && minBytes >= 0 ? minBytes : 100 * 1024 * 1024;
  limit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 10000) : 100;
  const typeSet = Array.isArray(types) && types.length ? new Set(types) : null;
  if (rootExcluded(tree, excluded)) return [];
  const out = [];
  tree.forEachFile((i, dir) => {
    const size = tree.size[i];
    if (size < minBytes) return;
    const name = tree.names[i];
    if (SKIP_FILE_NAMES.has(name.toLowerCase())) return;
    const type = fileType(name);
    if (typeSet && !typeSet.has(type)) return;
    out.push({ path: tree.P.join(dir, name), name, sizeBytes: size, mtimeMs: tree.mtime[i], type });
  }, makeSkipper(tree, excluded));
  out.sort((a, b) => b.sizeBytes - a.sizeBytes);
  return out.slice(0, limit);
}

async function findDuplicates(tree, { minBytes = 1024 * 1024, excluded, isCancelled, onProgress } = {}) {
  if (rootExcluded(tree, excluded)) return { groups: [], wastedBytes: 0 };
  const files = [];
  tree.forEachFile((i, dir) => {
    const size = tree.size[i];
    if (size < minBytes) return;
    if (SKIP_FILE_NAMES.has(tree.names[i].toLowerCase())) return;
    files.push({ path: tree.P.join(dir, tree.names[i]), size, mtimeMs: tree.mtime[i] });
  }, makeSkipper(tree, excluded));
  return findDuplicateGroups(files, { minBytes, isCancelled, onProgress });
}

module.exports = { findLarge, findDuplicates, makeSkipper };
