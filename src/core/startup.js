'use strict';
/**
 * Başlangıç programları.
 *
 * Windows: HKCU/HKLM ...\CurrentVersion\Run (+ WOW6432Node), Başlangıç klasörleri.
 *   Aç/kapat, Görev Yöneticisi'nin kullandığı ...\Explorer\StartupApproved\{Run,Run32,StartupFolder} REG_BINARY
 *   değerine yazılır: ilk bayt 02 = açık, 03 = kapalı (genel kural: tek sayı = kapalı). Run'dan HİÇBİR ŞEY silinmez.
 * Linux: ~/.config/autostart/*.desktop (Hidden=true / X-GNOME-Autostart-enabled=false = kapalı).
 */
const fsp = require('fs/promises');
const nodePath = require('path');
const os = require('os');
const { run, powershell } = require('./exec');
const KNOWN = require('./startup-known.json');

const W = nodePath.win32;
const CV = 'Software\\Microsoft\\Windows\\CurrentVersion';
const APPROVED = `${CV}\\Explorer\\StartupApproved`;

/** Windows kaynakları. id öneki -> konum bilgisi. */
function winSources(env = process.env) {
  const roaming = env.APPDATA || W.join(env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
  const programData = env.ProgramData || 'C:\\ProgramData';
  return {
    'hkcu-run': { kind: 'reg', source: 'HKCU Run', key: `HKCU\\${CV}\\Run`, approved: `HKCU\\${APPROVED}\\Run`, machine: false },
    'hklm-run': { kind: 'reg', source: 'HKLM Run', key: `HKLM\\${CV}\\Run`, approved: `HKLM\\${APPROVED}\\Run`, machine: true },
    'hklm-run32': { kind: 'reg', source: 'HKLM Run', key: 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run', approved: `HKLM\\${APPROVED}\\Run32`, machine: true },
    'user-folder': { kind: 'folder', source: 'Startup folder', dir: W.join(roaming, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'), approved: `HKCU\\${APPROVED}\\StartupFolder`, machine: false },
    'common-folder': { kind: 'folder', source: 'Startup folder', dir: W.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'StartUp'), approved: `HKLM\\${APPROVED}\\StartupFolder`, machine: true },
  };
}

// ---------- saf ayrıştırıcılar ----------

/**
 * `reg query <anahtar>` çıktısını ayrıştır.
 * @returns {Array<{name:string,type:string,data:string}>}  (yalnız ilk anahtarın değerleri; alt anahtarlar yok sayılır)
 */
function parseRegQuery(text) {
  const out = [];
  let inFirstKey = false;
  let seenKey = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line) continue;
    if (/^HKEY_/i.test(line)) {
      if (seenKey) { inFirstKey = false; continue; }
      seenKey = true;
      inFirstKey = true;
      continue;
    }
    if (!inFirstKey) continue;
    // "    Ad    REG_TİP    veri"  (ad boşluk içerebilir; ayırıcı 4 boşluk)
    const m = /^ {4}(.*?) {4}(REG_[A-Z0-9_]+)(?: {4}(.*))?$/.exec(line);
    if (!m) continue;
    out.push({ name: m[1], type: m[2], data: m[3] === undefined ? '' : m[3] });
  }
  return out;
}

/** StartupApproved REG_BINARY onaltılık verisi -> true (açık) / false (kapalı) / null (geçersiz). */
function approvedEnabledFromHex(hex) {
  const h = String(hex || '').replace(/[^0-9a-f]/gi, '');
  if (h.length < 2) return null;
  const b = parseInt(h.slice(0, 2), 16);
  return (b & 1) === 0; // 02/06 = açık, 03/07 = kapalı
}

/** Windows FILETIME (1601'den beri 100 ns) küçük-sonlu 8 bayt onaltılık. */
function filetimeHex(date = new Date()) {
  const ft = (BigInt(date.getTime()) + 11644473600000n) * 10000n;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(ft);
  return buf.toString('hex').toUpperCase();
}

/** StartupApproved'a yazılacak 12 baytlık değer. Açık: 02 + 11 sıfır bayt; kapalı: 03 00 00 00 + FILETIME. */
function buildApprovedHex(enabled, date = new Date()) {
  return enabled ? '020000000000000000000000' : '03000000' + filetimeHex(date);
}

/** %VAR% genişletme (büyük/küçük harf duyarsız). */
function expandEnv(s, env = process.env) {
  const lower = {};
  for (const k of Object.keys(env)) lower[k.toLowerCase()] = env[k];
  return String(s).replace(/%([^%]+)%/g, (all, k) => (lower[k.toLowerCase()] !== undefined ? lower[k.toLowerCase()] : all));
}

/** Komut satırından çalıştırılabilir dosya yolunu çıkar. */
function parseCommandExe(cmd, env = process.env) {
  const c = expandEnv(String(cmd || '').trim(), env);
  if (!c) return null;
  if (c.startsWith('"')) {
    const end = c.indexOf('"', 1);
    return end > 1 ? c.slice(1, end) : null;
  }
  const m = /^(.*?\.(exe|com|bat|cmd|lnk|vbs|ps1))(\s|$)/i.exec(c);
  if (m) return m[1];
  return c.split(/\s+/)[0];
}

const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const KNOWN_COMPILED = KNOWN.map((k) => ({
  k,
  exes: k.match.filter((m) => /\.exe$/.test(m)),
  words: k.match.filter((m) => !/\.exe$/.test(m)).map((m) => new RegExp(`(^|[^a-z0-9])${escapeRe(m)}($|[^a-z0-9])`)),
}));

/** Komut satırındaki çalıştırılabilir dosya adları (küçük harf): "...\\Update.exe --processStart Discord.exe" -> [update.exe, discord.exe] */
function commandExeNames(command, env) {
  const out = new Set();
  const first = parseCommandExe(command, env);
  if (first) out.add(first.split(/[\\/]/).pop().toLowerCase());
  for (const m of String(command || '').matchAll(/([^\s"\\/]+\.exe)\b/gi)) out.add(m[1].toLowerCase());
  return [...out];
}

/**
 * Bilinen program sözlüğünde ara. Alt dize DEĞİL:
 *  - ".exe" ile biten eşleyiciler komuttaki exe adlarıyla birebir karşılaştırılır,
 *  - diğerleri program adında ve exe adında (uzantısız) KELİME SINIRIYLA aranır
 *    (TeamSpeak ≠ Teams, "Cooperative" ≠ Opera). Komut satırının geri kalanına (klasör yolları) bakılmaz.
 * Eşleşme yoksa null (arayüzde advice:'unknown').
 */
function matchKnown(name, command, env = process.env) {
  const nm = String(name || '').toLowerCase();
  const exes = commandExeNames(command, env);
  const stems = exes.map((e) => e.replace(/\.[a-z0-9]+$/, ''));
  for (const { k, exes: kx, words } of KNOWN_COMPILED) {
    if (kx.some((x) => exes.includes(x)) || words.some((re) => re.test(nm) || stems.some((st) => re.test(st)))) {
      return { description: k.description, advice: k.advice };
    }
  }
  return null;
}

// ---------- .desktop (Linux) ----------

function parseDesktopEntry(text) {
  const out = {};
  let inMain = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[')) { inMain = line === '[Desktop Entry]'; continue; }
    if (!inMain) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    if (!(k in out)) out[k] = line.slice(eq + 1).trim();
  }
  return out;
}

function desktopEnabled(entry) {
  if (String(entry.Hidden).toLowerCase() === 'true') return false;
  if (String(entry['X-GNOME-Autostart-enabled']).toLowerCase() === 'false') return false;
  return true;
}

/** .desktop metninde açık/kapalı durumunu ayarla (diğer satırlar korunur). */
function setDesktopEnabledText(text, enabled) {
  const lines = String(text).split(/\r?\n/);
  let start = lines.findIndex((l) => l.trim() === '[Desktop Entry]');
  if (start < 0) { lines.unshift('[Desktop Entry]'); start = 0; }
  let end = lines.findIndex((l, i) => i > start && l.trim().startsWith('['));
  if (end < 0) end = lines.length;
  const setKey = (key, value) => {
    for (let i = start + 1; i < end; i++) {
      if (lines[i].trim().startsWith(key + '=')) { lines[i] = `${key}=${value}`; return; }
    }
    // son boş olmayan satırın arkasına ekle
    let at = end;
    while (at - 1 > start && lines[at - 1].trim() === '') at--;
    lines.splice(at, 0, `${key}=${value}`);
    end++;
  };
  setKey('X-GNOME-Autostart-enabled', enabled ? 'true' : 'false');
  if (enabled) {
    for (let i = start + 1; i < end; i++) if (/^Hidden=/i.test(lines[i].trim())) lines[i] = 'Hidden=false';
  }
  return lines.join('\n');
}

function autostartDir(env = process.env) {
  if (env.FERAHLA_TEST_ROOT) return nodePath.posix.join(env.FERAHLA_TEST_ROOT, 'home', '.config', 'autostart');
  return nodePath.join(env.XDG_CONFIG_HOME || nodePath.join(os.homedir(), '.config'), 'autostart');
}

// ---------- Windows: okuma ----------

/** reg query: UTF-8 çıktı için chcp 65001 (anahtar sabit metindir, kullanıcı girdisi değil). */
async function regQuery(key, runner = run) {
  const r = await runner('cmd.exe', ['/d', '/s', '/c', `"chcp 65001>nul & reg query "${key}" /reg:64"`], { windowsVerbatimArguments: true, timeout: 15000 });
  if (r.code !== 0) return [];
  return parseRegQuery(r.stdout);
}

/** .lnk hedeflerini ve exe yayıncılarını tek PowerShell çağrısıyla al. Hata olursa boş. */
async function windowsLinkAndPublisherInfo(lnks, exes) {
  if (!lnks.length && !exes.length) return { targets: {}, publishers: {} };
  const payload = Buffer.from(JSON.stringify({ l: lnks, e: exes }), 'utf8').toString('base64');
  const script =
    `$in=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}'))|ConvertFrom-Json;` +
    '$sh=New-Object -ComObject WScript.Shell;$t=@{};$p=@{};' +
    'foreach($l in @($in.l)){try{$s=$sh.CreateShortcut($l);$t[$l]=(\'"\'+$s.TargetPath+\'" \'+$s.Arguments).Trim()}catch{}};' +
    '$all=@($in.e)+@($t.Values|ForEach-Object{ if($_ -match \'^"([^"]+)"\'){$matches[1]} });' +
    'foreach($e in $all){try{if($e -and (Test-Path -LiteralPath $e)){$c=(Get-Item -LiteralPath $e).VersionInfo.CompanyName;if($c){$p[$e]=$c.Trim()}}}catch{}};' +
    '@{t=$t;p=$p}|ConvertTo-Json -Compress -Depth 3';
  const r = await powershell(script, { timeout: 20000 });
  if (r.code !== 0) return { targets: {}, publishers: {} };
  try {
    const j = JSON.parse(r.stdout.trim());
    return { targets: j.t || {}, publishers: j.p || {} };
  } catch (e) {
    return { targets: {}, publishers: {} };
  }
}

async function listWindows({ env = process.env, runner = run, withDetails = runner === run } = {}) {
  const S = winSources(env);
  const ids = Object.keys(S);
  const approvedKeys = [...new Set(ids.map((i) => S[i].approved))];
  const [approvedLists, runLists] = await Promise.all([
    Promise.all(approvedKeys.map((k) => regQuery(k, runner))),
    Promise.all(ids.map((i) => (S[i].kind === 'reg' ? regQuery(S[i].key, runner) : Promise.resolve(null)))),
  ]);
  const approved = {};
  approvedKeys.forEach((k, idx) => {
    approved[k] = new Map(approvedLists[idx].filter((v) => v.type === 'REG_BINARY').map((v) => [v.name.toLowerCase(), v.data]));
  });
  const items = [];
  for (let n = 0; n < ids.length; n++) {
    const sid = ids[n];
    const src = S[sid];
    const appr = approved[src.approved];
    const stateOf = (valueName) => {
      const hex = appr.get(valueName.toLowerCase());
      const e = hex === undefined ? null : approvedEnabledFromHex(hex);
      return e === null ? true : e;
    };
    if (src.kind === 'reg') {
      for (const v of runLists[n]) {
        if (!/^REG_(EXPAND_)?SZ$/.test(v.type)) continue;
        if (/^\(.*\)$/.test(v.name) && !v.data) continue; // (Varsayılan) boş değer
        items.push({ id: `${sid}::${v.name}`, name: v.name, command: v.type === 'REG_EXPAND_SZ' ? expandEnv(v.data, env) : v.data, source: src.source, enabled: stateOf(v.name) });
      }
    } else {
      let files = [];
      try { files = await fsp.readdir(src.dir, { withFileTypes: true }); } catch (e) { files = []; }
      for (const f of files) {
        if (!f.isFile() || f.name.toLowerCase() === 'desktop.ini') continue;
        items.push({ id: `${sid}::${f.name}`, name: f.name.replace(/\.(lnk|url)$/i, ''), command: W.join(src.dir, f.name), source: src.source, enabled: stateOf(f.name) });
      }
    }
  }
  if (withDetails) {
    const lnks = items.filter((i) => /\.lnk$/i.test(i.command)).map((i) => i.command);
    const exes = [...new Set(items.map((i) => parseCommandExe(i.command, env)).filter((p) => p && /\.exe$/i.test(p) && W.isAbsolute(p)))];
    const info = await windowsLinkAndPublisherInfo(lnks, exes);
    for (const it of items) {
      if (info.targets[it.command]) it.command = info.targets[it.command];
      const exe = parseCommandExe(it.command, env);
      if (exe && info.publishers[exe]) it.publisher = info.publishers[exe];
    }
  }
  return items;
}

// ---------- Linux: okuma ----------

async function listLinux({ env = process.env } = {}) {
  const dir = autostartDir(env);
  let files = [];
  try { files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.desktop')); } catch (e) { return []; }
  const items = [];
  for (const f of files.sort()) {
    let text;
    try { text = await fsp.readFile(nodePath.join(dir, f), 'utf8'); } catch (e) { continue; }
    const e = parseDesktopEntry(text);
    items.push({ id: `autostart::${f}`, name: e.Name || f.replace(/\.desktop$/, ''), command: e.Exec || '', source: 'Autostart', enabled: desktopEnabled(e) });
  }
  return items;
}

/** getStartupItems sözleşmesi. */
async function listStartupItems({ platform = process.platform, env = process.env, runner } = {}) {
  const items = platform === 'win32' ? await listWindows({ env, ...(runner ? { runner } : {}) }) : await listLinux({ env });
  for (const it of items) {
    const k = matchKnown(it.name, it.command);
    it.known = k || { description: { tr: 'Bu program sözlüğümüzde yok. Ne olduğunu bilmiyorsanız açık bırakın.', en: 'This program is not in our list. If you are not sure what it is, keep it enabled.' }, advice: 'unknown' };
  }
  return items;
}

function splitId(id) {
  if (typeof id !== 'string') return null;
  const i = id.indexOf('::');
  if (i <= 0) return null;
  const name = id.slice(i + 2);
  if (!name || name.includes('\0')) return null;
  return { prefix: id.slice(0, i), name };
}

/**
 * setStartupItemEnabled sözleşmesi.
 * @returns {Promise<{ok:boolean, error?:string, previous?:boolean, name?:string}>}
 */
async function setStartupItemEnabled(id, enabled, { platform = process.platform, env = process.env, runner = run, isAdmin = false } = {}) {
  const sp = splitId(id);
  if (!sp || typeof enabled !== 'boolean') return { ok: false, error: 'invalid-argument' };
  const items = platform === 'win32' ? await listWindows({ env, runner, withDetails: false }) : await listLinux({ env });
  const item = items.find((i) => i.id === id);
  if (!item) return { ok: false, error: 'not-found' };
  const previous = item.enabled;

  if (platform === 'win32') {
    const src = winSources(env)[sp.prefix];
    if (!src) return { ok: false, error: 'not-found' };
    if (src.machine && !isAdmin) return { ok: false, error: 'requires-admin', previous, name: item.name };
    const args = ['add', src.approved, '/v', sp.name, '/t', 'REG_BINARY', '/d', buildApprovedHex(enabled), '/f', '/reg:64'];
    const r = await runner('reg.exe', args, { timeout: 15000 });
    if (r.code !== 0) return { ok: false, error: /denied|reddedildi/i.test(r.stderr) ? 'requires-admin' : 'registry-write-failed', previous, name: item.name };
    return { ok: true, previous, name: item.name };
  }

  if (sp.prefix !== 'autostart' || sp.name.includes('/') || sp.name.includes('\\') || !sp.name.endsWith('.desktop')) {
    return { ok: false, error: 'not-found' };
  }
  const file = nodePath.join(autostartDir(env), sp.name);
  try {
    const text = await fsp.readFile(file, 'utf8');
    const tmp = file + '.ferahla-tmp';
    await fsp.writeFile(tmp, setDesktopEnabledText(text, enabled), 'utf8');
    await fsp.rename(tmp, file);
    return { ok: true, previous, name: item.name };
  } catch (e) {
    return { ok: false, error: 'write-failed', previous, name: item.name };
  }
}

module.exports = {
  listStartupItems,
  setStartupItemEnabled,
  // saf yardımcılar (test)
  parseRegQuery,
  approvedEnabledFromHex,
  buildApprovedHex,
  filetimeHex,
  parseCommandExe,
  expandEnv,
  matchKnown,
  commandExeNames,
  parseDesktopEntry,
  desktopEnabled,
  setDesktopEnabledText,
  winSources,
  listWindows,
  autostartDir,
  KNOWN,
};
