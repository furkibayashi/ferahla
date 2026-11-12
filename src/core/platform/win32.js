'use strict';
/**
 * Windows platform katmanı. Yerel modül yok: reg.exe / powershell.exe / tasklist / whoami / net.
 * Ayrıştırma fonksiyonları saf olup Linux'ta örnek çıktılarla birim testlenir.
 */
const fs = require('fs');
const fsp = require('fs/promises');
const P = require('path').win32;
const { run, powershell } = require('../exec');
const { measureDir } = require('../fswalk');
const { DAY, chromiumRoots, firefoxRoots, parseTasklistCsv } = require('./common');

const name = 'win32';

// ---------- ayrıştırıcılar ----------

/** Get-CimInstance Win32_LogicalDisk | ConvertTo-Json çıktısı. */
function parseCimDisksJson(text) {
  let data;
  try {
    data = JSON.parse(String(text).trim() || '[]');
  } catch (e) {
    return null;
  }
  if (!Array.isArray(data)) data = [data];
  return data
    .filter((d) => d && d.DeviceID && (d.DriveType === 3 || d.DriveType === 2) && Number(d.Size) > 0)
    .map((d) => ({
      path: String(d.DeviceID).toUpperCase() + '\\',
      label: d.VolumeName ? String(d.VolumeName) : '',
      totalBytes: Number(d.Size) || 0,
      freeBytes: Number(d.FreeSpace) || 0,
    }));
}

/** wmic logicaldisk get DeviceID,DriveType,FreeSpace,Size,VolumeName /format:csv çıktısı. */
function parseWmicCsv(text) {
  const lines = String(text).split(/\r*\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const hi = lines.findIndex((l) => /(^|,)DeviceID(,|$)/i.test(l));
  if (hi < 0) return null;
  const head = lines[hi].split(',').map((h) => h.trim().toLowerCase());
  const col = (row, n) => row[head.indexOf(n)];
  const out = [];
  for (const l of lines.slice(hi + 1)) {
    const row = l.split(',');
    if (row.length < head.length) continue;
    const type = Number(col(row, 'drivetype'));
    const size = Number(col(row, 'size'));
    if (!(type === 2 || type === 3) || !(size > 0)) continue;
    out.push({
      path: String(col(row, 'deviceid')).toUpperCase() + '\\',
      label: row.slice(head.indexOf('volumename')).join(',').trim(),
      totalBytes: size,
      freeBytes: Number(col(row, 'freespace')) || 0,
    });
  }
  return out;
}

/** whoami /user /fo csv /nh -> SID */
function parseWhoamiSid(text) {
  const m = /S-1-\d+(?:-\d+)+/.exec(String(text));
  return m ? m[0] : null;
}

// ---------- sürücüler / yetki ----------

async function listDrives() {
  const ps = await powershell('Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,VolumeName,Size,FreeSpace,DriveType | ConvertTo-Json -Compress');
  let drives = ps.code === 0 ? parseCimDisksJson(ps.stdout) : null;
  if (!drives || !drives.length) {
    const w = await run('wmic', ['logicaldisk', 'get', 'DeviceID,DriveType,FreeSpace,Size,VolumeName', '/format:csv']);
    drives = w.code === 0 ? parseWmicCsv(w.stdout) : null;
  }
  if (!drives || !drives.length) {
    // Son çare: fs.statfs ile C..Z
    drives = [];
    for (let c = 67; c <= 90; c++) {
      const root = String.fromCharCode(c) + ':\\';
      try {
        const s = await fsp.statfs(root);
        drives.push({ path: root, label: '', totalBytes: s.blocks * s.bsize, freeBytes: s.bavail * s.bsize });
      } catch (e) { /* yok */ }
    }
  }
  return drives.sort((a, b) => a.path.localeCompare(b.path));
}

async function isAdmin() {
  const r = await run('net', ['session'], { timeout: 8000 });
  if (r.code === 0) return true;
  // "Sunucu" hizmeti kapalıysa net session yöneticide de başarısız olur: PowerShell ile doğrula.
  const ps = await powershell('([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)', { timeout: 15000 });
  return ps.code === 0 && /true/i.test(ps.stdout);
}

async function listProcesses() {
  const r = await run('tasklist', ['/FO', 'CSV', '/NH'], { timeout: 10000 });
  return r.code === 0 ? parseTasklistCsv(r.stdout) : null;
}

// ---------- temizlik kökleri ----------

function envPaths(env = process.env) {
  const sysDrive = (env.SystemDrive || 'C:') + '\\';
  const profile = env.USERPROFILE || P.join(sysDrive, 'Users', env.USERNAME || 'Default');
  const local = env.LOCALAPPDATA || P.join(profile, 'AppData', 'Local');
  const roaming = env.APPDATA || P.join(profile, 'AppData', 'Roaming');
  return {
    sysDrive,
    sysRoot: env.SystemRoot || env.windir || P.join(sysDrive, 'Windows'),
    programData: env.ProgramData || P.join(sysDrive, 'ProgramData'),
    profile,
    local,
    roaming,
    temp: env.TEMP || env.TMP || P.join(local, 'Temp'),
  };
}

const CACHE3 = ['Cache', 'Code Cache', 'GPUCache'];

/**
 * Kategori kökleri. Her kök: { path, pattern?, minAgeMs? }. Platformda yoksa null.
 */
async function cleanupRoots(id, { env = process.env } = {}) {
  const e = envPaths(env);
  const sub = (base, dirs) => dirs.map((d) => ({ path: P.join(base, d) }));
  switch (id) {
    case 'user-temp': return [{ path: e.temp, minAgeMs: DAY }];
    case 'windows-temp': return [{ path: P.join(e.sysRoot, 'Temp'), minAgeMs: DAY }];
    case 'thumbnails': return [{ path: P.join(e.local, 'Microsoft', 'Windows', 'Explorer'), pattern: /^thumbcache_.*\.db$/i }];
    case 'chrome': return chromiumRoots(P, [P.join(e.local, 'Google', 'Chrome', 'User Data')]);
    case 'edge': return chromiumRoots(P, [P.join(e.local, 'Microsoft', 'Edge', 'User Data')]);
    case 'brave': return chromiumRoots(P, [P.join(e.local, 'BraveSoftware', 'Brave-Browser', 'User Data')]);
    case 'opera': {
      const roots = [];
      for (const flavor of ['Opera Stable', 'Opera GX Stable']) {
        roots.push(...sub(P.join(e.local, 'Opera Software', flavor), CACHE3));
        roots.push(...sub(P.join(e.local, 'Opera Software', flavor, 'Default'), CACHE3));
        roots.push(...sub(P.join(e.roaming, 'Opera Software', flavor), ['GPUCache', 'Code Cache', 'ShaderCache']));
        roots.push(...sub(P.join(e.roaming, 'Opera Software', flavor, 'Default'), ['GPUCache', 'Code Cache']));
      }
      return roots;
    }
    case 'firefox': return firefoxRoots(P, [P.join(e.local, 'Mozilla', 'Firefox', 'Profiles')]);
    case 'discord':
      return ['discord', 'discordptb', 'discordcanary'].flatMap((d) => sub(P.join(e.roaming, d), CACHE3));
    case 'teams':
      return [
        ...sub(P.join(e.roaming, 'Microsoft', 'Teams'), CACHE3),
        ...sub(P.join(e.local, 'Packages', 'MSTeams_8wekyb3d8bbwe', 'LocalCache', 'Microsoft', 'MSTeams', 'EBWebView', 'Default'), CACHE3),
        ...sub(P.join(e.local, 'Packages', 'MSTeams_8wekyb3d8bbwe', 'LocalCache', 'Microsoft', 'MSTeams', 'EBWebView', 'WV2Profile_tfw'), CACHE3),
      ];
    case 'spotify':
      return [
        { path: P.join(e.local, 'Spotify', 'Data') },
        ...sub(P.join(e.local, 'Spotify', 'Browser'), CACHE3),
        { path: P.join(e.local, 'Packages', 'SpotifyAB.SpotifyMusic_zpdnekdrzrea0', 'LocalCache', 'Spotify', 'Data') },
      ];
    case 'steam': return sub(P.join(e.local, 'Steam', 'htmlcache'), [...CACHE3, 'DawnCache']);
    case 'windows-update': return [{ path: P.join(e.sysRoot, 'SoftwareDistribution', 'Download'), minAgeMs: DAY }];
    case 'crash-dumps': return [{ path: P.join(e.local, 'CrashDumps') }];
    case 'wer':
      return [
        ...sub(P.join(e.local, 'Microsoft', 'Windows', 'WER'), ['ReportArchive', 'ReportQueue', 'Temp']),
        ...sub(P.join(e.programData, 'Microsoft', 'Windows', 'WER'), ['ReportArchive', 'ReportQueue', 'Temp']),
      ];
    default: return null;
  }
}

/**
 * Uygulama verisi kökleri: altındaki hiçbir şey "Büyük/Kopya dosyalar" üzerinden çöpe taşınmaz
 * (tarayıcı profilleri, uygulama ayarları; bunlar için Güvenli Temizlik kategorileri vardır).
 */
function appDataRoots({ env = process.env } = {}) {
  const e = envPaths(env);
  return [
    e.local, e.roaming, P.join(e.profile, 'AppData', 'LocalLow'),
    P.join(e.local, 'Google', 'Chrome', 'User Data'),
    P.join(e.local, 'Microsoft', 'Edge', 'User Data'),
    P.join(e.local, 'BraveSoftware', 'Brave-Browser', 'User Data'),
    P.join(e.roaming, 'Opera Software'), P.join(e.local, 'Opera Software'),
    P.join(e.roaming, 'Mozilla', 'Firefox'), P.join(e.local, 'Mozilla', 'Firefox'),
  ];
}

const PROCESS_NAMES = {
  chrome: ['chrome.exe'],
  edge: ['msedge.exe'],
  brave: ['brave.exe'],
  opera: ['opera.exe', 'opera_gx.exe'],
  firefox: ['firefox.exe'],
  discord: ['discord.exe', 'discordptb.exe', 'discordcanary.exe'],
  teams: ['teams.exe', 'ms-teams.exe'],
  spotify: ['spotify.exe'],
  steam: ['steam.exe', 'steamwebhelper.exe'],
};
function processNames(id) { return PROCESS_NAMES[id] || []; }

const REQUIRES_ADMIN = new Set(['windows-temp', 'windows-update']);
function requiresAdmin(id) { return REQUIRES_ADMIN.has(id); }

// ---------- Geri Dönüşüm Kutusu ----------

let sidCache = null;
async function currentSid() {
  if (sidCache) return sidCache;
  const r = await run('whoami', ['/user', '/fo', 'csv', '/nh'], { timeout: 8000 });
  sidCache = r.code === 0 ? parseWhoamiSid(r.stdout) : null;
  return sidCache;
}

/** Kullanıcının tüm sürücülerdeki $Recycle.Bin\<SID> klasörleri. */
async function recycleBinDirs() {
  const sid = await currentSid();
  if (!sid) return [];
  const drives = await listDrives();
  return drives.map((d) => P.join(d.path, '$Recycle.Bin', sid)).filter((p) => fs.existsSync(p));
}

async function getRecycleBin() {
  const dirs = await recycleBinDirs();
  let sizeBytes = 0;
  let itemCount = 0;
  for (const d of dirs) {
    sizeBytes += (await measureDir(d)).bytes;
    try {
      itemCount += (await fsp.readdir(d)).filter((n) => n.startsWith('$R')).length;
    } catch (e) { /* erişim yok */ }
  }
  return { available: true, sizeBytes, itemCount };
}

async function emptyRecycleBin() {
  const script =
    "try { Clear-RecycleBin -Force -ErrorAction Stop } catch { " +
    "$sh = New-Object -ComObject Shell.Application; " +
    "$sh.NameSpace(10).Items() | ForEach-Object { Remove-Item -LiteralPath $_.Path -Recurse -Force -ErrorAction SilentlyContinue } }";
  const r = await powershell(script, { timeout: 120000 });
  return r.code === 0 ? { ok: true } : { ok: false, error: 'recycle-bin-failed' };
}

/** Geri Dönüşüm Kutusu'nu açmak için komut. */
function recycleBinOpenCommand() {
  return { file: 'explorer.exe', args: ['shell:RecycleBinFolder'] };
}

module.exports = {
  name,
  listDrives,
  isAdmin,
  listProcesses,
  cleanupRoots,
  appDataRoots,
  processNames,
  requiresAdmin,
  getRecycleBin,
  emptyRecycleBin,
  recycleBinOpenCommand,
  envPaths,
  // test için
  parseCimDisksJson,
  parseWmicCsv,
  parseWhoamiSid,
};
