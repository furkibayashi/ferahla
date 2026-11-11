/*
 * Ferahla — sahte (mock) API.
 * Gerçek uygulamada preload.js `window.ferahla`yı sağlar; o varsa bu dosya HİÇBİR ŞEY yapmaz.
 * Tarayıcıda/Playwright'ta arayüzü tek başına önizlemek için docs/SPEC.md'deki IPC sözleşmesinin
 * tamamını gerçekçi Windows'a benzer verilerle taklit eder.
 *
 * Önizleme seçenekleri (adres çubuğu): ?mock=admin,fresh,fast,scanerror,caterror,clean,noscan
 *   admin     : yönetici olarak çalışıyormuş gibi
 *   fresh     : ilk açılış (geçmiş boş, karşılama kartı)
 *   fast      : tarama/temizlik animasyonları kısa
 *   scanerror : tarama hata ile biter
 *   caterror  : temizlik kategorileri alınamaz
 *   clean     : temizlenecek bir şey yok (boş durum)
 *   noscan    : açılışta otomatik tarama yapılmaz (varsayılan da budur)
 *   scanned   : açılışta C: taranmış kabul edilir
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.ferahla) return;

  const opts = new Set(
    (new URLSearchParams(location.search).get('mock') || '').split(',').map((s) => s.trim()).filter(Boolean)
  );
  const FAST = opts.has('fast');

  const KB = 1024, MB = KB * 1024, GB = MB * 1024;
  const NOW = Date.now();
  const DAY = 86400000;

  // ---------- deterministik rastgelelik ----------
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rnd = mulberry32(20261110);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const randMtime = (maxDays = 1500) => NOW - Math.floor(rnd() * maxDays * DAY);
  const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(rnd() * 16)]).join('');

  // ---------- düğüm yardımcıları ----------
  const D = (name, children) => ({ name, isDir: true, children });
  const F = (name, size, o = {}) => ({
    name, isDir: false, size: Math.round(size), mtime: o.mtime ?? randMtime(), dup: o.dup,
  });

  const POOLS = {
    sys: {
      dirs: ['drivers', 'DriverStore', 'catroot2', 'spool', 'wbem', 'WindowsPowerShell', 'Tasks', 'LogFiles', 'config',
        'oobe', 'migration', 'downlevel', 'IME', 'Speech', 'tr-TR', 'en-US', 'Boot', 'servicing', 'CodeIntegrity', 'SysWOW64'],
      file: () => pick(['ntoskrnl', 'kernel32', 'shell32', 'win32k', 'dxgi', 'd3d12', 'mfc140', 'msvcp140', 'combase',
        'twinui', 'ucrtbase', 'windows.storage', 'explorer', 'svchost', 'wininit', 'ntdll', 'user32', 'gdi32', 'setupapi',
        'mrt', 'MicrosoftEdgeUpdate', 'wuaueng', 'msmpeng']) + (rnd() < 0.2 ? '_' + hex(4) : '') + pick(['.dll', '.dll', '.sys', '.exe', '.mui', '.dat', '.cat']),
    },
    app: {
      dirs: ['bin', 'resources', 'locales', 'plugins', 'lib', 'data', 'swiftshader', 'extensions', 'assets', 'runtime', 'x64', 'Support Files'],
      file: () => pick(['app', 'core', 'resources', 'libGLESv2', 'ffmpeg', 'icudtl', 'snapshot_blob', 'v8_context', 'vk_swiftshader',
        'chrome_100_percent', 'Qt6Core', 'libcef', 'CrashReporter', 'updater', 'msedge', 'AcroCEF', 'Photoshop', 'nvcontainer'])
        + pick(['.dll', '.pak', '.exe', '.dat', '.bin', '.json', '.asar']),
    },
    cache: {
      dirs: ['Cache_Data', 'Code Cache', 'GPUCache', 'js', 'wasm', 'Service Worker', 'ScriptCache', 'DawnCache'],
      file: () => pick(['f_' + hex(6), 'data_' + Math.floor(rnd() * 4), 'index', hex(16) + '_0', hex(8) + '.tmp']),
    },
    temp: {
      dirs: ['chrome_BITS_' + hex(4), 'Low', 'Diagnostics', 'msedge_url_fetcher_' + hex(4), 'WinGet', 'NVIDIA Corporation', 'Zoom', 'vscode-inno-updater'],
      file: () => pick(['~DF' + hex(4).toUpperCase() + '.TMP', 'tmp' + hex(4) + '.tmp', 'setup_' + hex(4) + '.log', 'MSI' + hex(5) + '.LOG',
        'wct' + hex(4).toUpperCase() + '.tmp', 'dd_vcredist_' + hex(4) + '.log', 'aria-debug-' + Math.floor(rnd() * 9999) + '.log']),
    },
    game: {
      dirs: ['Content', 'Paks', 'Binaries', 'Engine', 'Movies', 'Audio', 'Maps', 'shaders', 'textures', 'csgo', 'bin', 'archive'],
      file: () => pick(['pakchunk' + Math.floor(rnd() * 30) + '-WindowsClient', 'audio_' + hex(3), 'basegame_' + Math.floor(rnd() * 9),
        'texturepack_' + Math.floor(rnd() * 40), 'shaders_' + hex(3), 'movie_intro']) + pick(['.pak', '.bnk', '.bik', '.ucas', '.utoc', '.vpk', '.archive']),
    },
    photo: {
      dirs: ['2019', '2020', '2021', '2022', '2023', '2024', 'Tatil', 'Doğum günü', 'Ekran görüntüleri', 'WhatsApp Images', 'Kamera Rulosu'],
      file: () => pick(['IMG_', 'DSC_', 'PXL_2023', 'WhatsApp Image ', 'Ekran görüntüsü ']) + Math.floor(1000 + rnd() * 8999) + pick(['.JPG', '.jpg', '.HEIC', '.png']),
    },
    music: {
      dirs: ['Sezen Aksu', 'Barış Manço', 'Tarkan', 'Duman', 'MFÖ', 'Coldplay', 'Daft Punk', 'Pink Floyd', 'Zeki Müren', 'Mor ve Ötesi'],
      file: () => String(Math.floor(1 + rnd() * 14)).padStart(2, '0') + ' - ' + pick(['Gülümse', 'Kuzu Kuzu', 'Yaz Dostum', 'Bal',
        'Sarı Laleler', 'Yellow', 'One More Time', 'Time', 'Cambaz', 'Gesi Bağları', 'Bir Derdim Var']) + pick(['.mp3', '.flac', '.m4a']),
    },
    doc: {
      dirs: ['Okul', 'İş', 'Faturalar', 'Tez', 'Vergi', 'Taranan belgeler', 'Özgeçmiş', 'Kira'],
      file: () => pick(['Fatura_2024_', 'Rapor_', 'Sunum_', 'Dilekçe_', 'Tablo_', 'Taranmış_']) + Math.floor(rnd() * 99) + pick(['.pdf', '.docx', '.xlsx', '.pptx', '.pdf']),
    },
    video: {
      dirs: ['OBS Kayıtları', 'Telefon', 'Kurgu', 'Klipler'],
      file: () => pick(['Kayıt ', 'VID_', 'Klip ', 'Ekran kaydı ']) + Math.floor(1000 + rnd() * 8999) + pick(['.mp4', '.mkv', '.mov']),
    },
    misc: {
      dirs: ['Yeni klasör', 'Eski', 'Diğer', 'Yedek', 'Proje'],
      file: () => pick(['notlar', 'liste', 'yedek', 'belge', 'resim', 'ayarlar']) + '_' + Math.floor(rnd() * 99) + pick(['.txt', '.zip', '.pdf', '.png', '.json']),
    },
  };

  /** Türüne göre tipik en büyük dosya boyutu (gerçekçi olmayan dev DLL'ler oluşmasın diye). */
  const MAXFILE = { sys: 60 * MB, app: 180 * MB, cache: 24 * MB, temp: 140 * MB, game: 2.5 * GB, photo: 14 * MB,
    music: 45 * MB, doc: 60 * MB, video: 4 * GB, misc: 900 * MB };

  /** size baytlık, count dosyalık sentetik klasör üretir (üretilmeyen dosyalar `hidden` sayılır). */
  function synth(name, size, count, kind, depth = 0) {
    const pool = POOLS[kind] || POOLS.misc;
    const node = { name, isDir: true, children: [], hidden: 0 };
    const cap = MAXFILE[kind] || MAXFILE.misc;
    let restSize = size, restCount = count;
    const needFiles = Math.ceil(size / (cap * 0.55));
    if (depth < 5 && (count > 80 && depth < 2 || needFiles > 26)) {
      const k = Math.min(8, Math.max(3 + Math.floor(rnd() * 3), Math.ceil(needFiles / 26)));
      const w = Array.from({ length: k }, () => Math.pow(rnd(), 1.6) + 0.12);
      const ws = w.reduce((a, b) => a + b, 0);
      const dirSize = size * 0.88, dirCount = Math.floor(count * 0.88);
      const used = new Set();
      for (let i = 0; i < k; i++) {
        let dn = pick(pool.dirs); let guard = 0;
        while (used.has(dn) && guard++ < 10) dn = pick(pool.dirs);
        if (used.has(dn)) dn += ' (' + (i + 2) + ')';
        used.add(dn);
        node.children.push(synth(dn, (dirSize * w[i]) / ws, Math.max(1, Math.floor((dirCount * w[i]) / ws)), kind, depth + 1));
      }
      restSize = size - dirSize; restCount = count - dirCount;
    }
    const m = Math.max(1, Math.min(Math.max(restCount, 1), 26, Math.max(Math.ceil(restSize / (cap * 0.55)), Math.min(restCount, 12))));
    const w = Array.from({ length: m }, () => Math.exp(rnd() * 2));
    const ws = w.reduce((a, b) => a + b, 0);
    const names = new Set();
    for (let i = 0; i < m; i++) {
      let fn = pool.file(); let g = 0;
      while (names.has(fn) && g++ < 6) fn = pool.file();
      if (names.has(fn)) fn = fn.replace(/(\.[^.]+)?$/, '_' + i + '$1');
      names.add(fn);
      node.children.push(F(fn, (restSize * w[i]) / ws));
    }
    node.hidden = Math.max(0, restCount - m);
    return node;
  }

  // ---------- C: sürücüsü ----------
  const USER = 'Elif';
  function buildC() {
    rnd = mulberry32(42);
    return D('C:\\', [
      D('Users', [
        D(USER, [
          D('AppData', [
            D('Local', [
              synth('Temp', 3.4 * GB, 12840, 'temp'),
              D('Google', [D('Chrome', [D('User Data', [D('Default', [
                synth('Cache', 1.2 * GB, 2300, 'cache'), synth('Extensions', 310 * MB, 900, 'app'),
                F('History', 48 * MB), F('Login Data', 2 * MB), F('Cookies', 6 * MB)])])])]),
              D('Microsoft', [
                D('Edge', [D('User Data', [D('Default', [synth('Cache', 640 * MB, 1400, 'cache')])])]),
                D('Windows', [D('Explorer', [
                  F('thumbcache_256.db', 220 * MB), F('thumbcache_96.db', 120 * MB), F('thumbcache_1280.db', 72 * MB)])]),
                synth('Teams', 380 * MB, 700, 'cache'),
                synth('OneDrive', 420 * MB, 300, 'app'),
              ]),
              synth('Packages', 6.1 * GB, 9800, 'app'),
              synth('Discord', 820 * MB, 1900, 'cache'),
              D('Spotify', [synth('Data', 2.1 * GB, 1600, 'cache')]),
              synth('CrashDumps', 1.1 * GB, 9, 'misc'),
              synth('NVIDIA', 1.4 * GB, 2400, 'cache'),
              synth('Programs', 9.8 * GB, 18000, 'app'),
            ]),
            D('Roaming', [synth('Code', 1.6 * GB, 5200, 'app'), synth('discord', 260 * MB, 800, 'app'),
              synth('Mozilla', 140 * MB, 400, 'app'), synth('Adobe', 1.1 * GB, 1300, 'app'), synth('Zoom', 480 * MB, 500, 'app')]),
            synth('LocalLow', 1.9 * GB, 2200, 'game'),
          ]),
          D('Videos', [
            F('Düğün videosu 2019.mp4', 12.4 * GB, { mtime: NOW - 1900 * DAY }),
            F('Tatil Antalya 2023.mov', 6.8 * GB, { mtime: NOW - 480 * DAY, dup: 'v1' }),
            F('Mezuniyet töreni.mp4', 4.2 * GB, { mtime: NOW - 900 * DAY }),
            synth('OBS Kayıtları', 14.6 * GB, 38, 'video'),
            synth('Telefon', 7.4 * GB, 210, 'video'),
          ]),
          D('Downloads', [
            F('Win11_23H2_Turkish_x64.iso', 6.2 * GB, { mtime: NOW - 410 * DAY, dup: 'iso' }),
            F('Win11_23H2_Turkish_x64 (1).iso', 6.2 * GB, { mtime: NOW - 300 * DAY, dup: 'iso' }),
            F('ubuntu-24.04-desktop-amd64.iso', 5.7 * GB, { mtime: NOW - 200 * DAY }),
            F('Tatil Antalya 2023 (1).mov', 6.8 * GB, { mtime: NOW - 470 * DAY, dup: 'v1' }),
            F('Eski telefon yedeği.zip', 3.9 * GB, { mtime: NOW - 700 * DAY }),
            F('Fotoğraflar_2022.rar', 2.4 * GB, { mtime: NOW - 640 * DAY }),
            F('DaVinci_Resolve_19_Windows.zip', 3.1 * GB, { mtime: NOW - 90 * DAY }),
            F('OfficeSetup.exe', 7.3 * MB, { mtime: NOW - 380 * DAY }),
            F('SteamSetup.exe', 2.3 * MB, { mtime: NOW - 600 * DAY }),
            F('VSCodeUserSetup-x64.exe', 98 * MB, { mtime: NOW - 120 * DAY }),
            F('Adobe_Photoshop_2024_Setup.exe', 2.6 * GB, { mtime: NOW - 260 * DAY }),
            F('nvidia-driver-560.94-win11.exe', 690 * MB, { mtime: NOW - 75 * DAY, dup: 'nv' }),
            F('nvidia-driver-560.94-win11 (1).exe', 690 * MB, { mtime: NOW - 74 * DAY, dup: 'nv' }),
            F('IMG_2041.JPG', 6.2 * MB, { mtime: NOW - 520 * DAY, dup: 'img' }),
            F('Sunum_final_SON.pptx', 184 * MB, { mtime: NOW - 40 * DAY, dup: 'ppt' }),
            synth('Telegram Desktop', 1.3 * GB, 320, 'misc'),
          ]),
          D('Pictures', [
            synth('Kamera Rulosu', 14.2 * GB, 4200, 'photo'),
            synth('Ekran görüntüleri', 2.1 * GB, 1800, 'photo'),
            D('2023', [F('IMG_2041.JPG', 6.2 * MB, { mtime: NOW - 540 * DAY, dup: 'img' }), synth('Bayram', 1.9 * GB, 560, 'photo')]),
            F('Aile_albumu_tarama.psd', 1.4 * GB, { mtime: NOW - 1100 * DAY }),
          ]),
          D('Documents', [
            synth('Okul', 2.3 * GB, 1400, 'doc'),
            synth('İş', 3.4 * GB, 2100, 'doc'),
            D('Sanal Makineler', [F('Windows10_test.vhdx', 22.6 * GB, { mtime: NOW - 820 * DAY })]),
            F('Sunum_final_SON.pptx', 184 * MB, { mtime: NOW - 41 * DAY, dup: 'ppt' }),
            F('Tez_son_v3.pdf', 48 * MB, { mtime: NOW - 380 * DAY, dup: 'tez' }),
            synth('Faturalar', 210 * MB, 260, 'doc'),
          ]),
          D('Desktop', [F('Tez_son_v3 - Kopya.pdf', 48 * MB, { mtime: NOW - 379 * DAY, dup: 'tez' }), synth('Yeni klasör', 1.2 * GB, 90, 'misc')]),
          synth('Music', 9.1 * GB, 2400, 'music'),
          synth('OneDrive', 8.2 * GB, 3600, 'doc'),
        ]),
        synth('Public', 120 * MB, 60, 'misc'),
        synth('Default', 9 * MB, 40, 'misc'),
      ]),
      D('Oyunlar', [
        D('Epic Games', [synth('Fortnite', 41.3 * GB, 3200, 'game'), synth('Rocket League', 22.1 * GB, 1900, 'game')]),
        synth('Euro Truck Simulator 2', 18.4 * GB, 2600, 'game'),
        synth('Minecraft', 3.2 * GB, 4100, 'game'),
      ]),
      D('Program Files', [
        synth('Adobe', 6.2 * GB, 11000, 'app'), synth('Microsoft Office', 4.1 * GB, 9000, 'app'),
        synth('NVIDIA Corporation', 1.6 * GB, 2100, 'app'), synth('Google', 640 * MB, 400, 'app'),
        synth('Blackmagic Design', 7.9 * GB, 4300, 'app'), synth('WindowsApps', 11.2 * GB, 23000, 'app'),
        synth('Common Files', 1.4 * GB, 3100, 'app'), synth('Mozilla Firefox', 290 * MB, 170, 'app'),
      ]),
      D('Program Files (x86)', [
        D('Steam', [D('steamapps', [D('common', [
          synth('Counter-Strike Global Offensive', 34.2 * GB, 5100, 'game'),
          synth('Cyberpunk 2077', 39.8 * GB, 1200, 'game'),
          synth('Stardew Valley', 650 * MB, 900, 'game'),
        ])]), synth('bin', 410 * MB, 600, 'app'), synth('appcache', 290 * MB, 800, 'cache')]),
        synth('Microsoft', 2.8 * GB, 5200, 'app'), synth('Epic Games', 1.3 * GB, 1700, 'app'),
      ]),
      synth('ProgramData', 8.9 * GB, 21000, 'app'),
      D('Windows', [
        synth('System32', 9.4 * GB, 18400, 'sys'),
        synth('WinSxS', 11.3 * GB, 64000, 'sys'),
        D('SoftwareDistribution', [synth('Download', 2.6 * GB, 340, 'sys'), synth('DataStore', 510 * MB, 40, 'sys')]),
        synth('Installer', 4.2 * GB, 900, 'sys'),
        synth('Temp', 1.3 * GB, 2200, 'temp'),
        synth('Fonts', 540 * MB, 1100, 'sys'),
        synth('Logs', 310 * MB, 600, 'sys'),
        synth('SysWOW64', 2.1 * GB, 9000, 'sys'),
      ]),
      F('pagefile.sys', 16 * GB, { mtime: NOW - 2 * 3600000 }),
      F('hiberfil.sys', 12.8 * GB, { mtime: NOW - 2 * 3600000 }),
      F('swapfile.sys', 256 * MB, { mtime: NOW - 2 * 3600000 }),
      synth('$Recycle.Bin', 4.6 * GB, 140, 'misc'),
    ]);
  }

  // ---------- D: sürücüsü ----------
  function buildD() {
    rnd = mulberry32(7);
    return D('D:\\', [
      D('Filmler', [synth('Diziler', 128 * GB, 420, 'video'), synth('Belgeseller', 34 * GB, 60, 'video'),
        F('Babam ve Oğlum (2005).mkv', 8.4 * GB, { mtime: NOW - 1600 * DAY }), F('Eşkıya (1996).mkv', 9.1 * GB, { mtime: NOW - 1500 * DAY }),
        synth('Çocuk filmleri', 31 * GB, 40, 'video')]),
      D('Yedekler', [synth('Eski Laptop', 86 * GB, 51000, 'misc'), synth('Telefon yedeği 2023', 41 * GB, 9800, 'photo'),
        F('Sistem görüntüsü.vhdx', 64 * GB, { mtime: NOW - 900 * DAY })]),
      synth('Fotoğraflar', 96 * GB, 24000, 'photo'),
      synth('Müzik', 38 * GB, 7600, 'music'),
      D('Arşiv', [F('Proje_2021.zip', 12.2 * GB, { mtime: NOW - 1200 * DAY }), F('Proje_2021 - Kopya.zip', 12.2 * GB, { mtime: NOW - 1100 * DAY }),
        synth('Belgeler', 11 * GB, 6000, 'doc')]),
      synth('Oyunlar', 72 * GB, 8800, 'game'),
    ]);
  }

  // ---------- ağaç işlemleri ----------
  function finalize(node, path, parent) {
    node.path = path;
    node.parent = parent || null;
    if (!node.isDir) { node.files = 1; return node; }
    let size = 0, files = node.hidden || 0;
    for (const c of node.children) {
      finalize(c, join(path, c.name), node);
      size += c.size; files += c.files;
    }
    node.size = size; node.files = files;
    return node;
  }
  function join(a, b) { return a.endsWith('\\') ? a + b : a + '\\' + b; }
  function recompute(node) {
    for (let n = node; n; n = n.parent) {
      if (!n.isDir) continue;
      n.size = n.children.reduce((s, c) => s + c.size, 0);
      n.files = (n.hidden || 0) + n.children.reduce((s, c) => s + c.files, 0);
    }
  }
  function walk(node, fn) { fn(node); if (node.isDir) node.children.forEach((c) => walk(c, fn)); }

  const trees = {};
  function tree(root) {
    if (!trees[root]) trees[root] = finalize(root.startsWith('D') ? buildD() : buildC(), root, null);
    return trees[root];
  }
  function findNode(path) {
    const root = Object.keys(trees).find((r) => path === r || path.startsWith(r) || path + '\\' === r);
    if (!root) return null;
    if (path === root || path + '\\' === root) return trees[root];
    const parts = path.slice(root.length).split('\\').filter(Boolean);
    let n = trees[root];
    for (const p of parts) { n = n && n.isDir ? n.children.find((c) => c.name === p) : null; if (!n) return null; }
    return n;
  }

  const DRIVES = [
    { path: 'C:\\', label: 'Windows', totalBytes: 476 * GB },
    { path: 'D:\\', label: 'Veri', totalBytes: 931 * GB },
  ];
  const extraFree = { 'C:\\': 0, 'D:\\': 0 };

  // ---------- olay yayıcılar ----------
  const listeners = { scanProgress: new Set(), scanDone: new Set(), cleanProgress: new Set() };
  const on = (kind) => (cb) => { listeners[kind].add(cb); return () => listeners[kind].delete(cb); };
  const emit = (kind, payload) => listeners[kind].forEach((cb) => { try { cb(payload); } catch (e) { console.error(e); } });
  const wait = (ms) => new Promise((r) => setTimeout(r, FAST ? Math.min(ms, 30) : ms));

  // ---------- durum ----------
  let settings = { lang: 'tr', theme: 'system', excludedPaths: ['D:\\Yedekler\\Eski Laptop'] };
  try {
    const saved = JSON.parse(localStorage.getItem('ferahla.mock.settings') || 'null');
    if (saved) settings = Object.assign(settings, saved);
  } catch (_) { /* önizleme: depolama yoksa varsayılanlar */ }

  let lastScanRoot = null;
  let activeScan = null;
  let scanSeq = 0;
  let hid = 100;

  const L = (tr, en) => ({ tr, en });
  const categories = [
    { id: 'user-temp', name: L('Geçici dosyalar', 'Temporary files'), sizeBytes: 3.4 * GB, itemCount: 12840, requiresAdmin: false, available: true,
      description: L('Programların çalışırken bırakıp unuttuğu geçici dosyalar. Silinmeleri güvenlidir; bir program yeniden ihtiyaç duyarsa kendisi oluşturur.',
        'Leftover files that programs create while running and then forget. Safe to delete; a program recreates them if it needs them again.') },
    { id: 'windows-temp', name: L('Windows geçici dosyaları', 'Windows temporary files'), sizeBytes: 1.3 * GB, itemCount: 2200, requiresAdmin: true, available: true,
      description: L('Windows\'un kurulum ve bakım sırasında bıraktığı geçici dosyalar. Silinmeleri güvenlidir.',
        'Temporary files Windows leaves behind during installs and maintenance. Safe to delete.') },
    { id: 'windows-update', name: L('Windows Update indirmeleri', 'Windows Update downloads'), sizeBytes: 2.6 * GB, itemCount: 340, requiresAdmin: true, available: true,
      description: L('Zaten kurulmuş güncellemelerin indirme dosyaları. Silinirse güncellemeler kaldırılmaz; Windows gerekirse yeniden indirir.',
        'Download files for updates that are already installed. Deleting them does not remove the updates; Windows downloads them again if needed.') },
    { id: 'recycle-bin', name: L('Geri Dönüşüm Kutusu', 'Recycle Bin'), sizeBytes: 4.6 * GB, itemCount: 140, requiresAdmin: false, available: true,
      description: L('Daha önce sildiğiniz dosyalar burada bekler. Kutu boşaltılırsa bu dosyaları artık geri getiremezsiniz; bu yüzden kendiliğinden seçilmez.',
        'Files you deleted earlier wait here. Once emptied, you can no longer bring them back, so it is never selected for you.') },
    { id: 'thumbnails', name: L('Küçük resim önizlemeleri', 'Thumbnail previews'), sizeBytes: 412 * MB, itemCount: 3, requiresAdmin: false, available: true,
      description: L('Klasörlerde gördüğünüz fotoğraf ve video önizlemeleri. Silinirse, bir klasörü ilk açtığınızda birkaç saniyede yeniden oluşur.',
        'The photo and video previews you see in folders. If deleted, they are rebuilt within seconds the next time you open a folder.') },
    { id: 'chrome', name: L('Google Chrome önbelleği', 'Google Chrome cache'), sizeBytes: 1.2 * GB, itemCount: 2300, requiresAdmin: false, available: true,
      warning: L('Önce Chrome\'u kapatın — açıkken bazı dosyaları silinemez.', 'Close Chrome first — some files can\'t be removed while it\'s running.'),
      description: L('Ziyaret ettiğiniz sitelerin geçici kopyaları. Çerezleriniz, şifreleriniz, geçmişiniz ve yer imleriniz SİLİNMEZ. Siteler ilk açılışta bir an yavaş yüklenebilir.',
        'Temporary copies of websites you visited. Your cookies, passwords, history and bookmarks are NOT deleted. Sites may load a little slower the first time.') },
    { id: 'edge', name: L('Microsoft Edge önbelleği', 'Microsoft Edge cache'), sizeBytes: 640 * MB, itemCount: 1400, requiresAdmin: false, available: true,
      description: L('Ziyaret ettiğiniz sitelerin geçici kopyaları. Çerezleriniz, şifreleriniz, geçmişiniz ve yer imleriniz SİLİNMEZ.',
        'Temporary copies of websites you visited. Your cookies, passwords, history and bookmarks are NOT deleted.') },
    { id: 'firefox', name: L('Firefox önbelleği', 'Firefox cache'), sizeBytes: 0, itemCount: 0, requiresAdmin: false, available: false,
      description: L('Ziyaret ettiğiniz sitelerin geçici kopyaları.', 'Temporary copies of websites you visited.') },
    { id: 'brave', name: L('Brave önbelleği', 'Brave cache'), sizeBytes: 0, itemCount: 0, requiresAdmin: false, available: false,
      description: L('Ziyaret ettiğiniz sitelerin geçici kopyaları.', 'Temporary copies of websites you visited.') },
    { id: 'opera', name: L('Opera önbelleği', 'Opera cache'), sizeBytes: 0, itemCount: 0, requiresAdmin: false, available: false,
      description: L('Ziyaret ettiğiniz sitelerin geçici kopyaları.', 'Temporary copies of websites you visited.') },
    { id: 'spotify', name: L('Spotify önbelleği', 'Spotify cache'), sizeBytes: 2.1 * GB, itemCount: 1600, requiresAdmin: false, available: true,
      description: L('Dinlediğiniz şarkıların geçici kopyaları. Silinirse, şarkılar bir sonraki dinleyişte yeniden indirilir.',
        'Temporary copies of songs you played. If deleted, songs are downloaded again the next time you play them.') },
    { id: 'discord', name: L('Discord önbelleği', 'Discord cache'), sizeBytes: 820 * MB, itemCount: 1900, requiresAdmin: false, available: true,
      description: L('Sohbetlerde gördüğünüz resim ve videoların geçici kopyaları. Mesajlarınız silinmez.',
        'Temporary copies of images and videos you saw in chats. Your messages are not deleted.') },
    { id: 'teams', name: L('Microsoft Teams önbelleği', 'Microsoft Teams cache'), sizeBytes: 380 * MB, itemCount: 700, requiresAdmin: false, available: true,
      description: L('Teams\'in hızlı açılmak için tuttuğu geçici dosyalar. Sohbetleriniz ve dosyalarınız silinmez.',
        'Temporary files Teams keeps to open faster. Your chats and files are not deleted.') },
    { id: 'steam', name: L('Steam web önbelleği', 'Steam web cache'), sizeBytes: 290 * MB, itemCount: 800, requiresAdmin: false, available: true,
      description: L('Steam mağaza sayfalarının geçici kopyaları. Oyunlarınız ve kayıtlarınız silinmez.',
        'Temporary copies of Steam store pages. Your games and saves are not deleted.') },
    { id: 'crash-dumps', name: L('Çökme raporları', 'Crash dumps'), sizeBytes: 1.1 * GB, itemCount: 9, requiresAdmin: false, available: true,
      description: L('Bir program çöktüğünde kaydedilen teknik raporlar. Sizin için bir işe yaramazlar; silinmeleri güvenlidir.',
        'Technical reports saved when a program crashed. They are of no use to you and are safe to delete.') },
    { id: 'wer', name: L('Windows hata raporları', 'Windows error reports'), sizeBytes: 210 * MB, itemCount: 46, requiresAdmin: false, available: true,
      description: L('Windows\'un Microsoft\'a göndermek için hazırladığı hata raporları. Silinmeleri güvenlidir.',
        'Error reports Windows prepared to send to Microsoft. Safe to delete.') },
  ].map((c) => ({ ...c, sizeBytes: Math.round(c.sizeBytes) }));
  // Gerçek ana süreç gibi: yönetici değilken yönetici gerektiren kategorilere uyarı eklenir.
  if (!opts.has('admin')) categories.forEach((c) => { if (c.requiresAdmin && c.available) c.warning = L('Bu kategori yönetici izni gerektirir. Temizlemek için Ferahla\'yı sağ tıklayıp "Yönetici olarak çalıştır" ile açın.', 'This category needs administrator rights. To clean it, right-click Ferahla and choose "Run as administrator".'); });
  if (opts.has('clean')) categories.forEach((c) => { if (c.id !== 'windows-update') { c.sizeBytes = c.id === 'user-temp' ? 3 * MB : 0; c.itemCount = c.sizeBytes ? 12 : 0; } delete c.warning; });

  const K = (description, advice) => ({ description, advice });
  const UNKNOWN = K(L('Bu program sözlüğümüzde yok. Ne olduğunu bilmiyorsanız açık bırakın.', 'This program is not in our list. If you are not sure what it is, keep it enabled.'), 'unknown');
  const startupItems = [
    { id: 'hkcu-onedrive', name: 'Microsoft OneDrive', command: '"C:\\Users\\Elif\\AppData\\Local\\Microsoft\\OneDrive\\OneDrive.exe" /background', source: 'HKCU Run', enabled: true, publisher: 'Microsoft Corporation',
      known: K(L('Dosyalarınızı buluta eşitler. OneDrive kullanıyorsanız açık bırakın; kullanmıyorsanız kapatabilirsiniz.', 'Syncs your files to the cloud. Keep it on if you use OneDrive; otherwise you can turn it off.'), 'keep') },
    { id: 'hklm-securityhealth', name: 'Windows Güvenliği bildirimleri', command: '%windir%\\system32\\SecurityHealthSystray.exe', source: 'HKLM Run', enabled: true, publisher: 'Microsoft Corporation',
      known: K(L('Virüs koruması ve güvenlik uyarılarını görev çubuğunda gösterir. Açık bırakın.', 'Shows antivirus and security alerts in the taskbar. Keep it on.'), 'keep') },
    { id: 'hklm-realtek', name: 'Realtek HD Ses Yöneticisi', command: '"C:\\Program Files\\Realtek\\Audio\\HDA\\RtkAudUService64.exe" -background', source: 'HKLM Run', enabled: true, publisher: 'Realtek Semiconductor',
      known: K(L('Hoparlör ve mikrofon ayarlarınızı yönetir. Kapatılırsa ses düzgün çalışmayabilir.', 'Manages your speaker and microphone settings. Sound may not work properly if it is turned off.'), 'keep') },
    { id: 'hklm-nvidia', name: 'NVIDIA Ekran Kartı Bileşeni', command: '"C:\\Program Files\\NVIDIA Corporation\\Display.NvContainer\\NVDisplay.Container.exe" -s', source: 'HKLM Run', enabled: true, publisher: 'NVIDIA Corporation',
      known: K(L('Ekran kartı ayarlarını ve sürücü bildirimlerini yönetir. Açık bırakmanız önerilir.', 'Manages graphics card settings and driver notifications. Keeping it on is recommended.'), 'keep') },
    { id: 'hkcu-discord', name: 'Discord', command: '"C:\\Users\\Elif\\AppData\\Local\\Discord\\Update.exe" --processStart Discord.exe', source: 'HKCU Run', enabled: true, publisher: 'Discord Inc.',
      known: K(L('Sohbet uygulaması. Açılışta başlaması gerekmez; ihtiyaç duyduğunuzda kendiniz açabilirsiniz.', 'Chat app. It does not need to start with Windows; you can open it yourself when needed.'), 'safe-to-disable') },
    { id: 'hkcu-spotify', name: 'Spotify', command: '"C:\\Users\\Elif\\AppData\\Roaming\\Spotify\\Spotify.exe" --autostart --minimized', source: 'HKCU Run', enabled: true, publisher: 'Spotify AB',
      known: K(L('Müzik uygulaması. Açılışta başlaması gerekmez; kapatmak açılışı hızlandırır.', 'Music app. It does not need to start with Windows; turning it off speeds up startup.'), 'safe-to-disable') },
    { id: 'hkcu-steam', name: 'Steam', command: '"C:\\Program Files (x86)\\Steam\\steam.exe" -silent', source: 'HKCU Run', enabled: true, publisher: 'Valve Corporation',
      known: K(L('Oyun mağazası. Oyun oynamak istediğinizde kendiniz açabilirsiniz; kapatmak güvenlidir.', 'Game store. You can open it yourself when you want to play; safe to turn off.'), 'safe-to-disable') },
    { id: 'hkcu-epic', name: 'Epic Games Launcher', command: '"C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win32\\EpicGamesLauncher.exe" -silent', source: 'HKCU Run', enabled: true, publisher: 'Epic Games, Inc.',
      known: K(L('Oyun mağazası. Açılışta başlaması gerekmez; kapatmak güvenlidir.', 'Game store. It does not need to start with Windows; safe to turn off.'), 'safe-to-disable') },
    { id: 'hkcu-teams', name: 'Microsoft Teams', command: '"C:\\Users\\Elif\\AppData\\Local\\Microsoft\\Teams\\Update.exe" --processStart "Teams.exe"', source: 'HKCU Run', enabled: true, publisher: 'Microsoft Corporation',
      known: K(L('Toplantı ve sohbet uygulaması. İş için her gün kullanmıyorsanız kapatabilirsiniz.', 'Meetings and chat app. If you don\'t use it every day for work, you can turn it off.'), 'safe-to-disable') },
    { id: 'hkcu-edge', name: 'Microsoft Edge ön yükleme', command: '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --no-startup-window --win-session-start', source: 'HKCU Run', enabled: true, publisher: 'Microsoft Corporation',
      known: K(L('Edge\'i siz açmadan arka planda hazırlar. Kapatmak güvenlidir; Edge yine normal çalışır.', 'Prepares Edge in the background before you open it. Safe to turn off; Edge still works normally.'), 'safe-to-disable') },
    { id: 'hkcu-adobe', name: 'Adobe Creative Cloud', command: '"C:\\Program Files\\Adobe\\Adobe Creative Cloud\\ACC\\Creative Cloud.exe" --showwindow=false', source: 'HKCU Run', enabled: true, publisher: 'Adobe Inc.',
      known: K(L('Adobe uygulamalarının güncelleyicisi. Kapatabilirsiniz; Photoshop gibi programlar açıldığında yine çalışır.', 'Updater for Adobe apps. You can turn it off; apps like Photoshop still work when opened.'), 'safe-to-disable') },
    { id: 'hkcu-logitech', name: 'LGHUB', command: '"C:\\Program Files\\LGHUB\\lghub.exe" --background', source: 'HKCU Run', enabled: true, publisher: 'Logitech', known: UNKNOWN },
    { id: 'hkcu-updtool', name: 'UpdaterTool', command: '"C:\\Users\\Elif\\AppData\\Roaming\\UpdTool\\upd.exe" /silent', source: 'HKCU Run', enabled: true, known: UNKNOWN },
    { id: 'startup-zoom', name: 'Zoom', command: 'C:\\Users\\Elif\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\Zoom.lnk', source: 'Startup folder', enabled: false, publisher: 'Zoom Video Communications, Inc.',
      known: K(L('Görüntülü görüşme uygulaması. Toplantınız olduğunda açılır; açılışta başlaması gerekmez.', 'Video meeting app. It opens when you have a meeting; it does not need to start with Windows.'), 'safe-to-disable') },
  ];

  let history = opts.has('fresh') ? [] : [
    { id: 'h3', at: new Date(NOW - 5 * DAY - 3 * 3600000).toISOString(), action: 'startup',
      summary: L('Zoom artık açılışta başlamıyor', 'Zoom no longer starts with Windows'), undoable: true, _startupId: 'startup-zoom', _enabled: false },
    { id: 'h2', at: new Date(NOW - 5 * DAY - 4 * 3600000).toISOString(), action: 'trash',
      summary: L('4 dosya Geri Dönüşüm Kutusu\'na taşındı', '4 files moved to the Recycle Bin'), freedBytes: Math.round(2.2 * GB), undoable: false },
    { id: 'h1', at: new Date(NOW - 12 * DAY - 6 * 3600000).toISOString(), action: 'clean',
      summary: L('Güvenli temizlik: 6 kategori temizlendi', 'Safe cleanup: 6 categories cleaned'), freedBytes: Math.round(3.1 * GB), undoable: false },
  ];
  function addHistory(entry) {
    const e = Object.assign({ id: 'h' + hid++, at: new Date().toISOString(), undoable: false }, entry);
    history.unshift(e);
    return e;
  }
  const publicHistory = (h) => {
    const { _startupId, _enabled, ...rest } = h; // eslint-disable-line no-unused-vars
    return rest;
  };

  function typeOf(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (['mp4', 'mkv', 'mov', 'avi', 'wmv', 'webm'].includes(ext)) return 'video';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
    if (['exe', 'msi'].includes(ext)) return 'installer';
    if (['iso', 'img', 'vhd', 'vhdx', 'vmdk'].includes(ext)) return 'disk';
    if (['jpg', 'jpeg', 'png', 'heic', 'raw', 'cr2', 'psd', 'gif'].includes(ext)) return 'image';
    return 'other';
  }

  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ---------- API ----------
  const api = {
    __mock: true,

    async getAppInfo() { return { version: '0.1.0', platform: 'win32', isAdmin: opts.has('admin') }; },

    async getSettings() { return clone(settings); },
    async setSettings(partial) {
      settings = Object.assign({}, settings, partial || {});
      try { localStorage.setItem('ferahla.mock.settings', JSON.stringify(settings)); } catch (_) { /* yoksay */ }
      return clone(settings);
    },

    async listDrives() {
      await wait(120);
      return DRIVES.map((d) => {
        const used = tree(d.path).size;
        return { path: d.path, label: d.label, totalBytes: d.totalBytes, freeBytes: Math.max(0, d.totalBytes - used + extraFree[d.path]) };
      });
    },

    async scan({ root } = {}) {
      root = root || 'C:\\';
      if (!DRIVES.some((d) => d.path === root)) return { ok: false, error: 'not-found', message: 'Bu konum bulunamadı.' };
      if (activeScan) activeScan.cancelled = true;
      const scanId = 's' + ++scanSeq;
      const t = tree(root);
      const dirs = [];
      walk(t, (n) => { if (n.isDir) dirs.push(n.path); });
      const job = { scanId, cancelled: false };
      activeScan = job;
      const steps = FAST ? 4 : root.startsWith('C') ? 46 : 34;
      const started = Date.now();
      (async () => {
        for (let k = 1; k <= steps; k++) {
          await wait(70);
          if (job.cancelled) return;
          const f = Math.min(1, (k / steps) * (0.96 + rnd() * 0.08));
          emit('scanProgress', {
            scanId, files: Math.floor(t.files * f), dirs: Math.floor(dirs.length * 9.3 * f),
            bytes: Math.floor(t.size * f), currentPath: dirs[Math.min(dirs.length - 1, Math.floor(f * dirs.length))],
          });
        }
        if (job.cancelled) return;
        activeScan = null;
        if (opts.has('scanerror')) {
          emit('scanDone', { scanId, ok: false, root, totalBytes: 0, files: 0, dirs: 0, skipped: 0, durationMs: Date.now() - started,
            error: 'io', message: 'Sürücü okunurken bir sorun oluştu.' });
          return;
        }
        lastScanRoot = root;
        emit('scanDone', { scanId, ok: true, root, totalBytes: t.size, files: t.files, dirs: Math.floor(dirs.length * 9.3),
          skipped: root.startsWith('C') ? 1204 : 3, durationMs: FAST ? 2400 : Date.now() - started + 131000 });
      })();
      return { scanId };
    },

    async cancelScan() {
      if (activeScan) {
        const { scanId } = activeScan;
        activeScan.cancelled = true; activeScan = null;
        setTimeout(() => emit('scanDone', { scanId, ok: false, root: '', totalBytes: 0, files: 0, dirs: 0, skipped: 0, durationMs: 0, error: 'cancelled' }), 10);
      }
      return { ok: true };
    },

    onScanProgress: on('scanProgress'),
    onScanDone: on('scanDone'),

    async getChildren(path) {
      await wait(15);
      const n = findNode(path);
      if (!n || !n.isDir) return [];
      return n.children
        .map((c) => ({ name: c.name, path: c.path, isDir: c.isDir, sizeBytes: c.size, fileCount: c.files }))
        .sort((a, b) => b.sizeBytes - a.sizeBytes);
    },

    async findLarge({ minBytes = 100 * MB, limit = 100, types } = {}) {
      await wait(200);
      if (!lastScanRoot) return [];
      const out = [];
      walk(trees[lastScanRoot], (n) => {
        if (!n.isDir && n.size >= minBytes) out.push({ path: n.path, name: n.name, sizeBytes: n.size, mtimeMs: n.mtime, type: typeOf(n.name) });
      });
      return out.filter((f) => !types || !types.length || types.includes(f.type)).sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, limit);
    },

    async findDuplicates({ minBytes = 1 * MB } = {}) {
      if (!lastScanRoot) return { groups: [], wastedBytes: 0 };
      const all = [];
      walk(trees[lastScanRoot], (n) => { if (!n.isDir) all.push(n); });
      const steps = FAST ? 3 : 24;
      for (let k = 1; k <= steps; k++) {
        await wait(60);
        const n = all[Math.floor((k / steps) * (all.length - 1))];
        emit('scanProgress', { scanId: 'dup', files: Math.floor((k / steps) * 3100), dirs: 0, bytes: Math.floor((k / steps) * 41 * GB), currentPath: n.path });
      }
      const by = new Map();
      walk(trees[lastScanRoot], (n) => {
        if (!n.isDir && n.dup && n.size >= minBytes) { if (!by.has(n.dup)) by.set(n.dup, []); by.get(n.dup).push(n); }
      });
      // Birkaç sentetik fotoğraf kopyası grubu daha (Pictures içinden)
      const groups = [...by.entries()].filter(([, a]) => a.length > 1).map(([k, a]) => ({
        hash: 'sha1-' + k + '-' + a[0].size.toString(16), sizeBytes: a[0].size,
        files: a.map((n) => ({ path: n.path, mtimeMs: n.mtime })),
      }));
      groups.sort((a, b) => b.sizeBytes * (b.files.length - 1) - a.sizeBytes * (a.files.length - 1));
      const wastedBytes = groups.reduce((s, g) => s + g.sizeBytes * (g.files.length - 1), 0);
      return { groups, wastedBytes };
    },

    async trashItems(paths = []) {
      await wait(400);
      let trashed = 0, freedBytes = 0; const failed = [];
      for (const p of paths) {
        const n = findNode(p);
        if (!n || !n.parent) { failed.push({ path: p, error: 'not-found' }); continue; }
        if (/\\(pagefile|hiberfil|swapfile)\.sys$/i.test(p)) { failed.push({ path: p, error: 'protected' }); continue; }
        n.parent.children = n.parent.children.filter((c) => c !== n);
        recompute(n.parent);
        trashed++; freedBytes += n.size;
      }
      if (trashed) {
        const rb = categories.find((c) => c.id === 'recycle-bin');
        rb.sizeBytes += freedBytes; rb.itemCount += trashed;
        addHistory({ action: 'trash', summary: L(trashed + ' dosya Geri Dönüşüm Kutusu\'na taşındı', trashed + (trashed === 1 ? ' file' : ' files') + ' moved to the Recycle Bin'), freedBytes });
        // Not: Geri Dönüşüm Kutusu'na taşımak boş alanı değiştirmez; kutu boşaltılana kadar yer kaplar.
        // Sahte ağaçtan çıkardığımız boyutu "boş alan" hesabında geri ekleyerek bunu taklit ediyoruz.
        const drive = DRIVES.find((d) => paths[0] && paths[0].startsWith(d.path));
        if (drive) extraFree[drive.path] -= freedBytes;
      }
      return { ok: failed.length === 0, trashed, failed, freedBytes };
    },

    async getCleanupCategories() {
      await wait(650);
      if (opts.has('caterror')) return { ok: false, error: 'io', message: 'Klasörler okunurken bir sorun oluştu.' };
      return clone(categories);
    },

    async cleanCategories(ids = []) {
      const results = []; let freedBytes = 0, deleted = 0, skippedInUse = 0;
      for (const id of ids) {
        const c = categories.find((x) => x.id === id);
        if (!c || !c.available) { results.push({ id, freedBytes: 0, error: 'not-available' }); continue; }
        if (c.requiresAdmin && !opts.has('admin')) { results.push({ id, freedBytes: 0, error: 'requires-admin' }); continue; }
        for (let p = 0; p <= 100; p += 20) { emit('cleanProgress', { id, percent: p }); await wait(id === 'user-temp' ? 120 : 60); }
        let freed = c.sizeBytes;
        if (id === 'user-temp') { freed = c.sizeBytes - 38 * MB; skippedInUse += 14; c.sizeBytes = 38 * MB; c.itemCount = 14; }
        else if (id === 'discord') { freed = c.sizeBytes - 4 * MB; skippedInUse += 3; c.sizeBytes = 4 * MB; c.itemCount = 3; }
        else { c.sizeBytes = 0; deleted += c.itemCount; c.itemCount = 0; }
        freedBytes += freed; deleted += 200;
        results.push({ id, freedBytes: freed });
      }
      extraFree['C:\\'] += freedBytes;
      if (freedBytes > 0) {
        const n = results.filter((r) => r.freedBytes > 0).length;
        addHistory({ action: 'clean', summary: L('Güvenli temizlik: ' + n + ' kategori temizlendi', 'Safe cleanup: ' + n + (n === 1 ? ' category' : ' categories') + ' cleaned'), freedBytes });
      }
      return { ok: results.every((r) => !r.error), freedBytes, deleted, skippedInUse, results };
    },

    onCleanProgress: on('cleanProgress'),

    async getStartupItems() { await wait(250); return clone(startupItems); },

    async setStartupItemEnabled(id, enabled) {
      await wait(150);
      const it = startupItems.find((s) => s.id === id);
      if (!it) return { ok: false, error: 'not-found', message: 'Öğe bulunamadı.' };
      if (it.enabled === !!enabled) return { ok: true };
      it.enabled = !!enabled;
      addHistory({ action: 'startup', undoable: true, _startupId: id, _enabled: !!enabled,
        summary: enabled ? L(it.name + ' yeniden açılışta başlayacak', it.name + ' will start with Windows again')
          : L(it.name + ' artık açılışta başlamıyor', it.name + ' no longer starts with Windows') });
      return { ok: true };
    },

    async getHistory() { await wait(80); return history.map(publicHistory); },

    async undoHistory(id) {
      await wait(150);
      const h = history.find((x) => x.id === id);
      if (!h || !h.undoable) return { ok: false, error: 'not-undoable', message: 'Bu işlem geri alınamaz.' };
      const it = startupItems.find((s) => s.id === h._startupId);
      if (it) it.enabled = !h._enabled;
      h.undoable = false; h.undone = true;
      if (it) addHistory({ action: 'startup', undoable: false,
        summary: it.enabled ? L('Geri alındı: ' + it.name + ' yeniden açılışta başlayacak', 'Undone: ' + it.name + ' will start with Windows again')
          : L('Geri alındı: ' + it.name + ' artık açılışta başlamıyor', 'Undone: ' + it.name + ' no longer starts with Windows') });
      return { ok: true };
    },

    async openRecycleBin() { console.info('[mock] Geri Dönüşüm Kutusu açılırdı'); },
    async revealInFolder(path) { console.info('[mock] Klasörde gösterilirdi:', path); },
  };

  window.ferahla = api;

  // Önizleme: "scanned" seçeneğiyle C: önceden taranmış sayılır.
  if (opts.has('scanned')) { tree('C:\\'); lastScanRoot = 'C:\\'; api.__prescanned = { root: 'C:\\', totalBytes: trees['C:\\'].size, files: trees['C:\\'].files }; }
})();
