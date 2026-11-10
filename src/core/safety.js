'use strict';
/**
 * Ferahla silme güvenliği.
 *
 * Kural: bir yol YALNIZCA beyaz listedeki bir kökün GERÇEK (realpath) alt yolu ise kalıcı olarak silinebilir.
 *  - Kökün kendisi silinmez (yalnızca içeriği).
 *  - `..` içeren yollar, göreli yollar, NUL/ADS içeren yollar reddedilir.
 *  - Üst klasörlerdeki symlink/junction'lar realpath ile çözülür; kökün dışına çıkan her şey reddedilir.
 *  - Hedefin KENDİSİ bir symlink/junction ise yalnızca bağlantının kendisi kaldırılabilir (isLink:true);
 *    bağlantının gösterdiği yere asla dokunulmaz (çağıran unlink kullanmalı, takip etmemeli).
 *  - Sürücü kökü, kullanıcı profili kökü, Windows, Program Files vb. korumalı yollar (veya bunların ataları) reddedilir.
 *
 * Bu modül Electron'dan bağımsızdır; platform, realpath ve ortam değişkenleri testte enjekte edilebilir.
 */
const fs = require('fs');
const os = require('os');
const nodePath = require('path');

function pathFor(platform) {
  return platform === 'win32' ? nodePath.win32 : nodePath.posix;
}

function defaultRealpath(p) {
  return fs.realpathSync.native(p);
}

function defaultLstat(p) {
  return fs.lstatSync(p);
}

/** Karşılaştırma için normalleştir (win32'de küçük harf, sondaki ayırıcı yok). */
function canon(p, platform) {
  const P = pathFor(platform);
  // "C:" (sürücü-göreli) -> "C:\\" olarak ele al
  if (platform === 'win32' && /^[a-z]:$/i.test(p)) p += '\\';
  let n = P.normalize(p);
  if (platform === 'win32') {
    n = n.replace(/\//g, '\\');
    if (/^\\\\\?\\[a-z]:\\/i.test(n)) n = n.slice(4); // \\?\C:\... -> C:\...
    n = n.toLowerCase();
  }
  const root = P.parse(n).root;
  while (n.length > root.length && (n.endsWith(P.sep))) n = n.slice(0, -1);
  return n;
}

/** child, parent'ın KESİN alt yolu mu (eşit değil)? Her iki yol da gerçek/normal olmalı. */
function isStrictlyInside(child, parent, platform) {
  const P = pathFor(platform);
  const c = canon(child, platform);
  const p = canon(parent, platform);
  if (c === p) return false;
  const prefix = p.endsWith(P.sep) ? p : p + P.sep;
  return c.startsWith(prefix);
}

function samePath(a, b, platform) {
  return canon(a, platform) === canon(b, platform);
}

/** a, b'ye eşit ya da onun atası mı? */
function isSameOrAncestor(a, b, platform) {
  return samePath(a, b, platform) || isStrictlyInside(b, a, platform);
}

function isDriveRoot(p, platform) {
  const P = pathFor(platform);
  const c = canon(p, platform);
  if (platform === 'win32') {
    if (/^[a-z]:\\?$/.test(c)) return true;
    // UNC paylaşım kökü: \\sunucu\paylasim
    if (/^\\\\[^\\]+\\[^\\]+\\?$/.test(c)) return true;
    return false;
  }
  return c === P.parse(c).root;
}

/**
 * Asla silinmemesi gereken yollar (kendisi ya da atası silinemez).
 * @returns {string[]}
 */
function protectedPaths({ platform = process.platform, env = process.env, homedir = os.homedir() } = {}) {
  const P = pathFor(platform);
  const list = [];
  const add = (p) => { if (p && typeof p === 'string' && P.isAbsolute(p)) list.push(P.normalize(p)); };
  if (platform === 'win32') {
    const sysDrive = (env.SystemDrive || 'C:') + '\\';
    const sysRoot = env.SystemRoot || env.windir || P.join(sysDrive, 'Windows');
    add(sysRoot);
    add(P.join(sysRoot, 'System32'));
    add(P.join(sysRoot, 'SysWOW64'));
    add(P.join(sysRoot, 'WinSxS'));
    add(env.ProgramFiles || P.join(sysDrive, 'Program Files'));
    add(env['ProgramFiles(x86)'] || P.join(sysDrive, 'Program Files (x86)'));
    add(env.ProgramW6432);
    add(env.ProgramData || P.join(sysDrive, 'ProgramData'));
    add(P.join(sysDrive, 'Users'));
    add(env.PUBLIC);
    const profile = env.USERPROFILE || homedir;
    add(profile);
    if (profile) {
      for (const sub of ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos', 'OneDrive',
        'AppData', 'AppData\\Local', 'AppData\\Roaming', 'AppData\\LocalLow']) add(P.join(profile, sub));
    }
    add(env.APPDATA);
    add(env.LOCALAPPDATA);
  } else {
    for (const p of ['/', '/bin', '/boot', '/dev', '/etc', '/home', '/lib', '/lib32', '/lib64', '/opt',
      '/proc', '/root', '/run', '/sbin', '/snap', '/srv', '/sys', '/usr', '/var', '/var/lib', '/mnt', '/media']) add(p);
    add(homedir);
    if (homedir) {
      for (const sub of ['.cache', '.config', '.local', '.local/share', 'Desktop', 'Documents', 'Downloads',
        'Pictures', 'Music', 'Videos', '.ssh', '.gnupg']) add(P.join(homedir, sub));
    }
  }
  return list;
}

/**
 * Sistem klasörleri: içindeki hiçbir şey çöp kutusuna bile taşınmaz, kopya/büyük dosya aramasında da taranmaz.
 */
function systemDirs({ platform = process.platform, env = process.env } = {}) {
  const P = pathFor(platform);
  if (platform === 'win32') {
    const sysDrive = (env.SystemDrive || 'C:') + '\\';
    const sysRoot = env.SystemRoot || env.windir || P.join(sysDrive, 'Windows');
    return [sysRoot,
      env.ProgramFiles || P.join(sysDrive, 'Program Files'),
      env['ProgramFiles(x86)'] || P.join(sysDrive, 'Program Files (x86)'),
      env.ProgramW6432,
      env.ProgramData || P.join(sysDrive, 'ProgramData'),
      P.join(sysDrive, '$Recycle.Bin'),
      P.join(sysDrive, 'System Volume Information'),
      P.join(sysDrive, 'Recovery'),
      P.join(sysDrive, '$WinREAgent'),
      P.join(sysDrive, 'Config.Msi'),
    ].filter(Boolean).map((p) => P.normalize(p));
  }
  return ['/bin', '/boot', '/dev', '/etc', '/lib', '/lib32', '/lib64', '/proc', '/run', '/sbin', '/snap',
    '/sys', '/usr', '/var/lib', '/var/cache', '/opt'];
}

/** Sürücü kökünde duran ve asla dokunulmaması gereken sistem dosyaları. */
const SYSTEM_FILE_NAMES = new Set(['pagefile.sys', 'hiberfil.sys', 'swapfile.sys', 'dumpstack.log', 'dumpstack.log.tmp', 'bootmgr']);

function isProtected(p, opts) {
  const platform = opts.platform;
  const prot = opts.protected || protectedPaths(opts);
  if (isDriveRoot(p, platform)) return true;
  for (const q of prot) {
    if (isSameOrAncestor(p, q, platform)) return true;
  }
  return false;
}

/** Ortak ön denetimler. Hata varsa reason döner, yoksa null. */
function precheck(target, platform) {
  const P = pathFor(platform);
  if (typeof target !== 'string' || target.length === 0 || target.length > 32000) return 'invalid-path';
  if (target.includes('\0')) return 'invalid-path';
  if (!P.isAbsolute(target)) return 'relative-path';
  const segments = target.split(platform === 'win32' ? /[\\/]+/ : /\/+/);
  if (segments.some((s) => s === '..')) return 'dotdot';
  if (platform === 'win32') {
    // Yalnızca "C:\..." veya UNC "\\sunucu\paylasim\..."; aygıt ad alanı (\\.\, \\?\GLOBALROOT) yok.
    const isDrive = /^[a-zA-Z]:[\\/]/.test(target);
    const isLong = /^\\\\\?\\[a-zA-Z]:\\/.test(target);
    const isUnc = /^\\\\[^\\?.][^\\]*\\[^\\]+/.test(target);
    if (!isDrive && !isLong && !isUnc) return 'invalid-path';
    // Sürücü harfinden sonra ':' -> NTFS alternatif veri akışı; reddet.
    const rest = isLong ? target.slice(6) : (isDrive ? target.slice(2) : target);
    if (rest.includes(':')) return 'invalid-path';
    // Joker karakterler ve Windows'ta geçersiz karakterler.
    if (/[*?"<>|]/.test(isLong ? target.slice(4) : target)) return 'invalid-path';
  }
  return null;
}

/**
 * Yolun gerçek konumunu bul: üst klasörün realpath'i + son ad. (Son öğe symlink ise takip EDİLMEZ.)
 */
function realLocation(target, P, realpath, lstat) {
  const parent = P.dirname(target);
  const base = P.basename(target);
  if (!base || base === '.') return { error: 'invalid-path' };
  let realParent;
  try {
    realParent = realpath(parent);
  } catch (e) {
    return { error: 'not-found' };
  }
  const loc = P.join(realParent, base);
  let st;
  try {
    st = lstat(loc);
  } catch (e) {
    return { error: 'not-found' };
  }
  return { loc, isLink: st.isSymbolicLink(), isDir: st.isDirectory() };
}

/**
 * Kalıcı silme (önbellek/temp temizliği) izni.
 * @param {string} target
 * @param {string[]} roots  kategori beyaz liste kökleri
 * @param {object} [opts] { platform, env, homedir, realpath, lstat }
 * @returns {{ok:true, realPath:string, root:string, isLink:boolean, isDir:boolean} | {ok:false, reason:string}}
 */
function checkDeletable(target, roots, opts = {}) {
  const o = normalizeOpts(opts);
  const P = pathFor(o.platform);
  const pre = precheck(target, o.platform);
  if (pre) return { ok: false, reason: pre };
  if (!Array.isArray(roots) || roots.length === 0) return { ok: false, reason: 'outside-whitelist' };

  const loc = realLocation(target, P, o.realpath, o.lstat);
  if (loc.error) return { ok: false, reason: loc.error };

  if (isProtected(loc.loc, o) || isProtected(P.normalize(target), o)) return { ok: false, reason: 'protected' };

  let sawRoot = false;
  for (const root of roots) {
    if (typeof root !== 'string' || precheck(root, o.platform)) continue;
    let realRoot;
    try {
      realRoot = o.realpath(root);
    } catch (e) {
      continue;
    }
    // Yanlış yapılandırılmış kök (ör. C:\ veya profil kökü) hiçbir şeye izin vermez.
    if (isProtected(realRoot, o)) continue;
    if (samePath(loc.loc, realRoot, o.platform)) { sawRoot = true; continue; }
    if (isStrictlyInside(loc.loc, realRoot, o.platform)) {
      return { ok: true, realPath: loc.loc, root: realRoot, isLink: loc.isLink, isDir: loc.isDir };
    }
  }
  return { ok: false, reason: sawRoot ? 'is-root' : 'outside-whitelist' };
}

/**
 * Kullanıcı dosyasını Geri Dönüşüm Kutusu'na taşıma izni (büyük/kopya dosyalar).
 * Kalıcı silme değildir ama yine de sistem klasörleri, sürücü kökü, profil kökü vb. reddedilir.
 */
function checkTrashable(target, opts = {}) {
  const o = normalizeOpts(opts);
  const P = pathFor(o.platform);
  const pre = precheck(target, o.platform);
  if (pre) return { ok: false, reason: pre };
  const loc = realLocation(target, P, o.realpath, o.lstat);
  if (loc.error) return { ok: false, reason: loc.error };
  if (isProtected(loc.loc, o) || isProtected(P.normalize(target), o)) return { ok: false, reason: 'protected' };
  const sys = o.systemDirs || systemDirs(o);
  for (const s of sys) {
    if (isSameOrAncestor(s, loc.loc, o.platform)) return { ok: false, reason: 'system-path' };
  }
  if (SYSTEM_FILE_NAMES.has(P.basename(loc.loc).toLowerCase()) && isDriveRoot(P.dirname(loc.loc), o.platform)) {
    return { ok: false, reason: 'system-path' };
  }
  for (const ex of o.excludedPaths || []) {
    if (typeof ex === 'string' && P.isAbsolute(ex) && isSameOrAncestor(ex, loc.loc, o.platform)) {
      return { ok: false, reason: 'excluded' };
    }
  }
  return { ok: true, realPath: loc.loc, isLink: loc.isLink, isDir: loc.isDir };
}

function normalizeOpts(opts) {
  const platform = opts.platform || process.platform;
  return {
    ...opts,
    platform,
    env: opts.env || process.env,
    homedir: opts.homedir !== undefined ? opts.homedir : os.homedir(),
    realpath: opts.realpath || defaultRealpath,
    lstat: opts.lstat || defaultLstat,
  };
}

module.exports = {
  checkDeletable,
  checkTrashable,
  protectedPaths,
  systemDirs,
  isStrictlyInside,
  isSameOrAncestor,
  samePath,
  isDriveRoot,
  canon,
  pathFor,
};
