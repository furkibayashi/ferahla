'use strict';
/**
 * Güvenli temizlik kategorileri: ölçüm ve temizlik.
 * - Yalnızca kategori köklerinin İÇERİĞİ silinir; kökün kendisi asla.
 * - Her dosya silinmeden önce safety.checkDeletable ile denetlenir (realpath, symlink kaçışı...).
 * - Linkler takip edilmez; yalnızca bağlantının kendisi kaldırılır.
 * - Kilitli/kullanımdaki dosyalar atlanır ve sayılır (skippedInUse).
 */
const fsp = require('fs/promises');
const { checkDeletable } = require('./safety');
const { measureDir } = require('./fswalk');

const T = (tr, en) => ({ tr, en });

/** Şartnamedeki kategori listesi (sıra arayüzde gösterim sırasıdır). */
const CATEGORIES = [
  {
    id: 'user-temp',
    name: T('Geçici dosyalar', 'Temporary files'),
    description: T(
      'Programların çalışırken bırakıp unuttuğu geçici dosyalar (%TEMP%). Silinirse hiçbir şey kaybolmaz; 24 saatten yeni dosyalara dokunulmaz.',
      'Leftover files programs create while running (%TEMP%). Nothing is lost if removed; files newer than 24 hours are kept.'),
  },
  {
    id: 'windows-temp',
    name: T('Windows geçici dosyaları', 'Windows temporary files'),
    description: T(
      'Windows ve kurulum programlarının geçici dosyaları (C:\\Windows\\Temp). Silinirse sorun olmaz; yönetici izni gerekir.',
      'Temporary files from Windows and installers (C:\\Windows\\Temp). Safe to remove; requires administrator rights.'),
  },
  {
    id: 'recycle-bin',
    name: T('Geri Dönüşüm Kutusu', 'Recycle Bin'),
    description: T(
      'Daha önce sildiğiniz dosyalar. Boşaltılırsa bu dosyalar artık geri getirilemez.',
      'Files you deleted earlier. Once emptied, they cannot be restored.'),
  },
  {
    id: 'thumbnails',
    name: T('Küçük resim önbelleği', 'Thumbnail cache'),
    description: T(
      'Gezginin klasörlerdeki resim önizlemeleri için tuttuğu kopyalar. Silinirse önizlemeler gerektiğinde yeniden oluşturulur.',
      'Copies Explorer keeps for picture previews. If removed, previews are rebuilt when needed.'),
  },
  ...[
    ['chrome', 'Chrome', "Chrome'u", "Chrome'un"],
    ['edge', 'Microsoft Edge', "Edge'i", "Edge'in"],
    ['brave', 'Brave', "Brave'i", "Brave'in"],
    ['opera', 'Opera', "Opera'yı", "Opera'nın"],
    ['firefox', 'Firefox', "Firefox'u", "Firefox'un"],
  ].map(([id, app, acc, gen]) => ({
    id,
    app,
    appAcc: acc,
    name: T(`${app} önbelleği`, `${app} cache`),
    description: T(
      `${gen} sayfaları hızlı açmak için sakladığı kopyalar. Silinirse siteler ilk açılışta biraz yavaş yüklenir. Çerezler, şifreler ve geçmiş SİLİNMEZ.`,
      `Copies ${app} keeps to open pages faster. If removed, sites load a little slower the first time. Cookies, passwords and history are NOT touched.`),
  })),
  {
    id: 'discord', app: 'Discord', appAcc: "Discord'u",
    name: T('Discord önbelleği', 'Discord cache'),
    description: T('Discord\'un resim ve sayfa önbelleği. Silinirse yeniden indirilir; mesajlarınız ve oturumunuz etkilenmez.',
      'Discord\'s image and page cache. Re-downloaded if removed; your messages and login are not affected.'),
  },
  {
    id: 'teams', app: 'Teams', appAcc: "Teams'i",
    name: T('Microsoft Teams önbelleği', 'Microsoft Teams cache'),
    description: T('Teams\'in sayfa önbelleği. Silinirse Teams bir sonraki açılışta biraz yavaş başlar; sohbetler etkilenmez.',
      'Teams\' page cache. If removed, Teams starts a bit slower next time; chats are not affected.'),
  },
  {
    id: 'spotify', app: 'Spotify', appAcc: "Spotify'ı",
    name: T('Spotify önbelleği', 'Spotify cache'),
    description: T('Dinlediğiniz şarkıların geçici kopyaları. Silinirse şarkılar yeniden akışla indirilir; çevrimdışı indirmeler yeniden indirilmesi gerekebilir.',
      'Temporary copies of songs you played. If removed, songs stream again; offline downloads may need to be downloaded again.'),
  },
  {
    id: 'steam', app: 'Steam', appAcc: "Steam'i",
    name: T('Steam tarayıcı önbelleği', 'Steam web cache'),
    description: T('Steam mağaza ve topluluk sayfalarının önbelleği (htmlcache). Silinirse sayfalar yeniden yüklenir; oyunlar etkilenmez.',
      'Cache of Steam store and community pages (htmlcache). Pages reload if removed; games are not affected.'),
  },
  {
    id: 'windows-update',
    name: T('Windows Update indirmeleri', 'Windows Update downloads'),
    description: T('Kurulmuş güncellemelerin indirilen dosyaları. Silinirse gerekirse Windows yeniden indirir; yönetici izni gerekir.',
      'Downloaded files of installed updates. Windows re-downloads them if needed; requires administrator rights.'),
  },
  {
    id: 'crash-dumps',
    name: T('Çökme dökümleri', 'Crash dumps'),
    description: T('Çöken programların bıraktığı hata dökümleri. Yalnızca geliştiriciler için anlamlıdır; silinmesi güvenlidir.',
      'Memory dumps left by crashed programs. Only useful to developers; safe to remove.'),
  },
  {
    id: 'wer',
    name: T('Windows Hata Raporlama', 'Windows Error Reporting'),
    description: T('Microsoft\'a gönderilmiş ya da bekleyen hata raporları. Silinmesi güvenlidir.',
      'Error reports sent or waiting to be sent to Microsoft. Safe to remove.'),
  },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
const IN_USE_CODES = new Set(['EBUSY', 'EPERM', 'EACCES', 'ETXTBSY']);

function adminWarning() {
  return T('Bu kategori yönetici izni gerektirir. Temizlemek için Ferahla\'yı sağ tıklayıp "Yönetici olarak çalıştır" ile açın.',
    'This category needs administrator rights. To clean it, right-click Ferahla and choose "Run as administrator".');
}

function appRunningWarning(cat) {
  return T(`Önce ${cat.appAcc} kapatın — açıkken bazı dosyaları silinemez.`, `Close ${cat.app} first — some files can't be removed while it's running.`);
}

async function resolveRoots(platform, id, env) {
  if (id === 'recycle-bin') return null;
  const roots = await platform.cleanupRoots(id, { env });
  if (!roots) return null;
  // Aynı kök iki kez gelirse tekilleştir.
  const seen = new Set();
  return roots.filter((r) => r && r.path && !seen.has(r.path) && seen.add(r.path));
}

function rootMeasureOpts(r, now) {
  const o = { pattern: r.pattern, minAgeMs: r.minAgeMs, now };
  if (r.ownedOnly && typeof process.getuid === 'function') o.uid = process.getuid();
  return o;
}

/** Bir kategorinin boyutu: { available, sizeBytes, itemCount }. */
async function measureCategory(platform, id, { env = process.env, now = Date.now() } = {}) {
  if (id === 'recycle-bin') {
    try {
      const rb = await platform.getRecycleBin({ env });
      return { available: !!rb.available, sizeBytes: rb.sizeBytes || 0, itemCount: rb.itemCount || 0 };
    } catch (e) {
      return { available: false, sizeBytes: 0, itemCount: 0 };
    }
  }
  const roots = await resolveRoots(platform, id, env);
  if (!roots) return { available: false, sizeBytes: 0, itemCount: 0 };
  let sizeBytes = 0;
  let itemCount = 0;
  let any = false;
  for (const r of roots) {
    const m = await measureDir(r.path, rootMeasureOpts(r, now));
    if (m.exists) any = true;
    sizeBytes += m.bytes;
    itemCount += m.files;
  }
  return { available: any, sizeBytes, itemCount };
}

/**
 * getCleanupCategories sözleşmesi.
 * @param {object} ctx { platform, env?, isAdmin:boolean, processes?:Set<string>|null }
 */
async function getCategories(ctx) {
  const { platform, env = process.env, isAdmin = false, processes = null } = ctx;
  const now = Date.now();
  const list = await Promise.all(CATEGORIES.map(async (cat) => {
    const m = await measureCategory(platform, cat.id, { env, now });
    const requiresAdmin = !!platform.requiresAdmin(cat.id);
    const item = {
      id: cat.id,
      name: cat.name,
      description: cat.description,
      sizeBytes: m.sizeBytes,
      itemCount: m.itemCount,
      requiresAdmin,
      available: m.available,
    };
    if (m.available && requiresAdmin && !isAdmin) item.warning = adminWarning();
    else if (m.available && processes && cat.app && platform.processNames(cat.id).some((n) => processes.has(n))) {
      item.warning = appRunningWarning(cat);
    }
    return item;
  }));
  return list;
}

/**
 * Bir kökün içeriğini sil (kök kalır).
 * @param {{path:string, pattern?:RegExp, minAgeMs?:number, ownedOnly?:boolean}} root
 * @param {object} o { platform?:'win32'|'linux', now?, fs?:{unlink,rmdir,lstat,readdir,chmod}, onFile?(), safetyOpts? }
 * @returns {Promise<{deleted, freedBytes, skippedInUse, refused, failed}>}
 */
async function cleanRoot(root, o = {}) {
  const f = { unlink: fsp.unlink, rmdir: fsp.rmdir, lstat: fsp.lstat, readdir: fsp.readdir, chmod: fsp.chmod, ...(o.fs || {}) };
  const platform = o.platform || process.platform;
  const safetyOpts = { platform, ...(o.safetyOpts || {}) };
  const nodePath = platform === 'win32' ? require('path').win32 : require('path').posix;
  const res = { deleted: 0, freedBytes: 0, skippedInUse: 0, refused: 0, failed: 0 };
  const cutoff = root.minAgeMs ? (o.now || Date.now()) - root.minAgeMs : Infinity;
  const uid = root.ownedOnly && typeof process.getuid === 'function' ? process.getuid() : undefined;
  const onFile = o.onFile || (() => {});

  let rs;
  try {
    rs = await f.lstat(root.path);
  } catch (e) {
    return res;
  }
  if (!rs.isDirectory() || rs.isSymbolicLink()) { res.refused++; return res; }

  const tryUnlink = async (p) => {
    try {
      await f.unlink(p);
    } catch (e) {
      // Windows: salt okunur dosya -> özniteliği kaldırıp bir kez daha dene
      if (platform === 'win32' && e.code === 'EPERM') {
        await f.chmod(p, 0o666);
        await f.unlink(p);
      } else throw e;
    }
  };

  async function walk(dir, top) {
    let ents;
    try {
      ents = await f.readdir(dir, { withFileTypes: true });
    } catch (e) {
      if (IN_USE_CODES.has(e.code)) res.skippedInUse++; else if (e.code !== 'ENOENT') res.failed++;
      return false;
    }
    let allGone = true;
    for (const ent of ents) {
      const full = nodePath.join(dir, ent.name);
      if (root.pattern && !(top && root.pattern.test(ent.name))) { allGone = false; continue; }
      let st;
      try {
        st = await f.lstat(full);
      } catch (e) {
        if (e.code !== 'ENOENT') { allGone = false; res.failed++; }
        continue;
      }
      if (uid !== undefined && st.uid !== uid) { allGone = false; continue; }
      const realDir = st.isDirectory() && !st.isSymbolicLink();
      if (realDir) {
        if (root.pattern) { allGone = false; continue; }
        const gone = await walk(full, false);
        if (!gone || st.mtimeMs > cutoff) { allGone = false; continue; }
        const chk = checkDeletable(full, [root.path], safetyOpts);
        if (!chk.ok) { res.refused++; allGone = false; continue; }
        try {
          await f.rmdir(chk.realPath);
        } catch (e) {
          if (e.code !== 'ENOENT') allGone = false;
        }
        continue;
      }
      if (st.mtimeMs > cutoff) { allGone = false; continue; }
      const chk = checkDeletable(full, [root.path], safetyOpts);
      if (!chk.ok) { res.refused++; allGone = false; continue; }
      try {
        await tryUnlink(chk.realPath);
        res.deleted++;
        if (!st.isSymbolicLink()) res.freedBytes += st.size;
      } catch (e) {
        if (e.code === 'ENOENT') continue;
        allGone = false;
        if (IN_USE_CODES.has(e.code)) res.skippedInUse++; else res.failed++;
      }
      onFile(st.isSymbolicLink() ? 0 : st.size);
    }
    return allGone;
  }

  await walk(root.path, true);
  return res;
}

/**
 * cleanCategories sözleşmesi.
 * @param {string[]} ids
 * @param {object} ctx { platform, env?, isAdmin, onProgress?({id, percent}), fs?, safetyOpts? }
 */
async function cleanCategories(ids, ctx) {
  const { platform, env = process.env, isAdmin = false } = ctx;
  const onProgress = ctx.onProgress || (() => {});
  const out = { ok: true, freedBytes: 0, deleted: 0, skippedInUse: 0, results: [] };
  const uniq = [...new Set(Array.isArray(ids) ? ids : [])];
  for (const id of uniq) {
    const r = { id, freedBytes: 0, deleted: 0, skippedInUse: 0 };
    out.results.push(r);
    if (!BY_ID.has(id)) { r.error = 'unknown-category'; continue; }
    if (platform.requiresAdmin(id) && !isAdmin) { r.error = 'requires-admin'; continue; }
    try {
      if (id === 'recycle-bin') {
        onProgress({ id, percent: 0 });
        const before = await platform.getRecycleBin({ env });
        if (typeof platform.emptyRecycleBin === 'function') {
          const e = await platform.emptyRecycleBin({ env });
          if (!e.ok) r.error = e.error || 'recycle-bin-failed';
        } else {
          for (const root of platform.recycleBinRoots(env)) {
            const c = await cleanRoot(root, ctx);
            r.skippedInUse += c.skippedInUse;
          }
        }
        const after = await platform.getRecycleBin({ env });
        r.freedBytes = Math.max(0, (before.sizeBytes || 0) - (after.sizeBytes || 0));
        r.deleted = Math.max(0, (before.itemCount || 0) - (after.itemCount || 0));
        if (r.error && r.freedBytes > 0) delete r.error;
      } else {
        const roots = await resolveRoots(platform, id, env);
        if (!roots) { r.error = 'not-available'; continue; }
        onProgress({ id, percent: 0 });
        const now = Date.now();
        let total = 0;
        for (const root of roots) total += (await measureDir(root.path, rootMeasureOpts(root, now))).bytes;
        let done = 0;
        let last = 0;
        for (const root of roots) {
          const c = await cleanRoot(root, {
            ...ctx,
            now,
            onFile: (bytes) => {
              done += bytes;
              const t = Date.now();
              if (t - last > 100 && total > 0) { last = t; onProgress({ id, percent: Math.min(99, Math.round((done / total) * 100)) }); }
            },
          });
          r.freedBytes += c.freedBytes;
          r.deleted += c.deleted;
          r.skippedInUse += c.skippedInUse;
        }
      }
    } catch (e) {
      r.error = 'clean-failed';
    }
    onProgress({ id, percent: 100 });
    out.freedBytes += r.freedBytes;
    out.deleted += r.deleted;
    out.skippedInUse += r.skippedInUse;
  }
  out.ok = out.results.length === 0 || out.results.some((r) => !r.error);
  return out;
}

module.exports = { CATEGORIES, getCategories, cleanCategories, cleanRoot, measureCategory, resolveRoots };
