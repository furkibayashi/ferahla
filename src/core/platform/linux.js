'use strict';
/**
 * Linux platform katmanı (geliştirme/test içindir; aynı arayüz).
 * FERAHLA_TEST_ROOT ortam değişkeni verilirse tüm kullanıcı yolları o klasörün altına yönlenir
 * (home = $ROOT/home, tmp = $ROOT/tmp). Uçtan uca testlerde gerçek dosyalara dokunmamak için kullanın.
 */
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const P = require('path').posix;
const { run } = require('../exec');
const { measureDir } = require('../fswalk');
const { DAY, chromiumRoots, firefoxRoots, parsePsComm } = require('./common');

const name = 'linux';

function bases(env = process.env) {
  const tr = env.FERAHLA_TEST_ROOT;
  if (tr) return { home: P.join(tr, 'home'), tmp: P.join(tr, 'tmp'), testRoot: tr };
  return { home: os.homedir(), tmp: env.TMPDIR || '/tmp', testRoot: null };
}

const REAL_FS = new Set(['ext2', 'ext3', 'ext4', 'xfs', 'btrfs', 'zfs', 'vfat', 'exfat', 'ntfs', 'ntfs3', 'fuseblk', 'f2fs', 'overlay', 'reiserfs', 'jfs']);

/** /proc/mounts metninden gerçek dosya sistemi bağlama noktaları. */
function parseProcMounts(text) {
  const out = [];
  const seen = new Set();
  for (const line of String(text).split('\n')) {
    const parts = line.split(' ');
    if (parts.length < 3) continue;
    const mnt = parts[1].replace(/\\040/g, ' ').replace(/\\011/g, '\t').replace(/\\134/g, '\\');
    const type = parts[2];
    if (!REAL_FS.has(type)) continue;
    if (/^\/(proc|sys|dev|run|snap|boot\/efi)(\/|$)/.test(mnt)) continue;
    if (type === 'overlay' && mnt !== '/') continue;
    if (seen.has(mnt)) continue;
    seen.add(mnt);
    out.push(mnt);
  }
  return out;
}

async function listDrives() {
  let mounts = ['/'];
  try {
    const m = parseProcMounts(await fsp.readFile('/proc/mounts', 'utf8'));
    if (m.length) mounts = m;
  } catch (e) { /* /proc yok */ }
  if (!mounts.includes('/')) mounts.unshift('/');
  const out = [];
  const seenDev = new Set();
  for (const m of mounts) {
    try {
      const s = await fsp.statfs(m);
      const total = s.blocks * s.bsize;
      if (!(total > 0)) continue;
      const key = `${s.type}:${s.blocks}:${s.bfree}`;
      if (seenDev.has(key) && m !== '/') continue;
      seenDev.add(key);
      out.push({ path: m, label: m === '/' ? 'Sistem' : P.basename(m), totalBytes: total, freeBytes: s.bavail * s.bsize });
    } catch (e) { /* erişilemiyor */ }
  }
  return out;
}

async function isAdmin() {
  return typeof process.getuid === 'function' && process.getuid() === 0;
}

async function listProcesses() {
  const r = await run('ps', ['-A', '-o', 'comm='], { timeout: 8000 });
  return r.code === 0 ? parsePsComm(r.stdout) : null;
}

async function cleanupRoots(id, { env = process.env } = {}) {
  const { home, tmp } = bases(env);
  const cache = P.join(home, '.cache');
  const config = P.join(home, '.config');
  const sub = (base, dirs) => dirs.map((d) => ({ path: P.join(base, d) }));
  const CACHE3 = ['Cache', 'Code Cache', 'GPUCache'];
  switch (id) {
    case 'user-temp': return [{ path: tmp, minAgeMs: DAY, ownedOnly: true }];
    case 'thumbnails': return [{ path: P.join(cache, 'thumbnails') }];
    case 'chrome': return chromiumRoots(P, [P.join(cache, 'google-chrome'), P.join(config, 'google-chrome'), P.join(cache, 'chromium'), P.join(config, 'chromium')]);
    case 'edge': return chromiumRoots(P, [P.join(cache, 'microsoft-edge'), P.join(config, 'microsoft-edge')]);
    case 'brave': return chromiumRoots(P, [P.join(cache, 'BraveSoftware', 'Brave-Browser'), P.join(config, 'BraveSoftware', 'Brave-Browser')]);
    case 'opera': return [...sub(P.join(cache, 'opera'), CACHE3), ...sub(P.join(config, 'opera'), CACHE3)];
    case 'firefox': return firefoxRoots(P, [P.join(cache, 'mozilla', 'firefox')]);
    case 'discord': return sub(P.join(config, 'discord'), CACHE3);
    case 'teams': return [...sub(P.join(config, 'Microsoft', 'Microsoft Teams'), CACHE3), ...sub(P.join(config, 'teams-for-linux'), CACHE3)];
    case 'spotify': return [{ path: P.join(cache, 'spotify', 'Data') }];
    case 'steam': return sub(P.join(home, '.local', 'share', 'Steam', 'config', 'htmlcache'), [...CACHE3, 'DawnCache']);
    case 'crash-dumps': return null;
    default: return null; // windows-temp, windows-update, wer: Linux'ta yok
  }
}

const PROCESS_NAMES = {
  chrome: ['chrome', 'chromium', 'chromium-browse'],
  edge: ['msedge'],
  brave: ['brave'],
  opera: ['opera'],
  firefox: ['firefox', 'firefox-bin'],
  discord: ['discord'],
  teams: ['teams', 'teams-for-linux'],
  spotify: ['spotify'],
  steam: ['steam', 'steamwebhelper'],
};
function processNames(id) { return PROCESS_NAMES[id] || []; }
function requiresAdmin() { return false; }

function trashDir(env = process.env) {
  const { home, testRoot } = bases(env);
  const dataHome = (!testRoot && env.XDG_DATA_HOME) || P.join(home, '.local', 'share');
  return P.join(dataHome, 'Trash');
}

async function getRecycleBin({ env = process.env } = {}) {
  const t = trashDir(env);
  const files = P.join(t, 'files');
  const m = await measureDir(files);
  let itemCount = 0;
  try { itemCount = (await fsp.readdir(files)).length; } catch (e) { /* yok */ }
  return { available: true, sizeBytes: m.bytes, itemCount };
}

/** Çöp kutusunu boşalt: cleanup modülü bu kökleri güvenli silme yolundan geçirir. */
function recycleBinRoots(env = process.env) {
  const t = trashDir(env);
  return [{ path: P.join(t, 'files') }, { path: P.join(t, 'info') }, { path: P.join(t, 'expunged') }];
}

function recycleBinOpenCommand(env = process.env) {
  const files = P.join(trashDir(env), 'files');
  try { fs.mkdirSync(files, { recursive: true }); } catch (e) { /* yok say */ }
  return { openPath: files };
}

module.exports = {
  name,
  listDrives,
  isAdmin,
  listProcesses,
  cleanupRoots,
  processNames,
  requiresAdmin,
  getRecycleBin,
  recycleBinRoots,
  recycleBinOpenCommand,
  trashDir,
  bases,
  parseProcMounts,
};
