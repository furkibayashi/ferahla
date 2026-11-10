'use strict';
const fsp = require('fs/promises');

const DAY = 24 * 60 * 60 * 1000;
const CHROMIUM_PROFILE_RE = /^(Default|Profile \d+|Guest Profile|System Profile)$/;
const CHROMIUM_CACHE_DIRS = ['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache'];
const CHROMIUM_SHARED_CACHE_DIRS = ['ShaderCache', 'GrShaderCache', 'GraphiteDawnCache'];

/** Klasördeki alt klasör adları (yoksa boş). */
async function listDirs(dir) {
  try {
    const ents = await fsp.readdir(dir, { withFileTypes: true });
    return ents.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (e) {
    return [];
  }
}

/**
 * Chromium tabanlı tarayıcı önbellekleri: <userData>\<profil>\{Cache, Code Cache, GPUCache...}.
 * Çerezler, şifreler, geçmiş (Cookies, Login Data, History, Local Storage...) ASLA kökler arasında değildir.
 */
async function chromiumRoots(P, userDataDirs, { profileRe = CHROMIUM_PROFILE_RE, cacheDirs = CHROMIUM_CACHE_DIRS, extraDirs = [] } = {}) {
  const roots = [];
  for (const ud of userDataDirs) {
    for (const prof of await listDirs(ud)) {
      if (!profileRe.test(prof)) continue;
      for (const c of cacheDirs) roots.push({ path: P.join(ud, prof, c) });
    }
    for (const c of CHROMIUM_SHARED_CACHE_DIRS) roots.push({ path: P.join(ud, c) });
    for (const c of extraDirs) roots.push({ path: P.join(ud, c) });
  }
  return roots;
}

/** Firefox: <Profiles>\<profil>\{cache2, startupCache}. */
async function firefoxRoots(P, profilesDirs) {
  const roots = [];
  for (const pd of profilesDirs) {
    for (const prof of await listDirs(pd)) {
      roots.push({ path: P.join(pd, prof, 'cache2') });
      roots.push({ path: P.join(pd, prof, 'startupCache') });
    }
  }
  return roots;
}

/** tasklist /FO CSV /NH çıktısından süreç adları (küçük harf). */
function parseTasklistCsv(text) {
  const out = new Set();
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^"([^"]+)"/.exec(line.trim());
    if (m) out.add(m[1].toLowerCase());
  }
  return out;
}

/** ps -A -o comm= çıktısından süreç adları (küçük harf). */
function parsePsComm(text) {
  const out = new Set();
  for (const line of String(text).split(/\r?\n/)) {
    const t = line.trim();
    if (t) out.add(t.split('/').pop().toLowerCase());
  }
  return out;
}

module.exports = { DAY, listDirs, chromiumRoots, firefoxRoots, parseTasklistCsv, parsePsComm, CHROMIUM_CACHE_DIRS };
