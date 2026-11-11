'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { checkDeletable, checkTrashable, isStrictlyInside, isDriveRoot } = require('../../src/core/safety');
const { makeTmp } = require('./helpers');

// ---------------------------------------------------------------------------
// Gerçek dosya sistemi (POSIX) senaryoları
// ---------------------------------------------------------------------------
test('safety (gerçek dosya sistemi)', async (t) => {
  const tmp = makeTmp();
  t.after(() => tmp.cleanup());
  const home = tmp.mkdir('home');
  const root = tmp.mkdir('home/.cache/app/Cache');
  const outside = tmp.mkdir('outside');
  tmp.file('outside/secret.txt', 'gizli');
  tmp.file('home/.cache/app/Cache/a.bin', 'x');
  tmp.file('home/.cache/app/Cache/sub/deep/b.bin', 'y');
  tmp.mkdir('home/.cache/app/Cache2');
  tmp.file('home/.cache/app/Cache2/c.bin', 'z');
  fs.symlinkSync(outside, path.join(root, 'link-dir'));
  fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'link-file'));
  const opts = { platform: 'linux', homedir: home };

  await t.test('1. kök içindeki dosya silinebilir', () => {
    const r = checkDeletable(path.join(root, 'a.bin'), [root], opts);
    assert.equal(r.ok, true);
    assert.equal(r.realPath, path.join(root, 'a.bin'));
  });

  await t.test('2. derindeki dosya ve klasör silinebilir', () => {
    assert.equal(checkDeletable(path.join(root, 'sub', 'deep', 'b.bin'), [root], opts).ok, true);
    assert.equal(checkDeletable(path.join(root, 'sub'), [root], opts).ok, true);
  });

  await t.test('3. kökün kendisi silinemez (sonda ayırıcı olsa da)', () => {
    assert.deepEqual(checkDeletable(root, [root], opts), { ok: false, reason: 'is-root' });
    assert.equal(checkDeletable(root + '/', [root], opts).ok, false);
  });

  await t.test('4. kök dışındaki yol reddedilir', () => {
    assert.equal(checkDeletable(path.join(outside, 'secret.txt'), [root], opts).reason, 'outside-whitelist');
  });

  await t.test('5. önek hilesi (Cache vs Cache2) reddedilir', () => {
    assert.equal(checkDeletable(tmp.p('home/.cache/app/Cache2/c.bin'), [root], opts).reason, 'outside-whitelist');
  });

  await t.test('6. ".." içeren yol, içeride çözülse bile reddedilir', () => {
    // path.join '..' bölümlerini yok eder; saldırgan girdisi gibi ham metin kullan
    assert.equal(checkDeletable(root + '/../../../../outside/secret.txt', [root], opts).reason, 'dotdot');
    assert.equal(checkDeletable(root + '/sub/../a.bin', [root], opts).reason, 'dotdot');
  });

  await t.test('7. göreli yol, boş yol, NUL ve metin olmayan girdi reddedilir', () => {
    assert.equal(checkDeletable('Cache/a.bin', [root], opts).reason, 'relative-path');
    assert.equal(checkDeletable('', [root], opts).reason, 'invalid-path');
    assert.equal(checkDeletable(root + '/a\0.bin', [root], opts).reason, 'invalid-path');
    assert.equal(checkDeletable(null, [root], opts).reason, 'invalid-path');
    assert.equal(checkDeletable({ toString: () => root }, [root], opts).reason, 'invalid-path');
  });

  await t.test('8. symlink klasör üzerinden kaçış reddedilir', () => {
    const r = checkDeletable(path.join(root, 'link-dir', 'secret.txt'), [root], opts);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'outside-whitelist');
  });

  await t.test('9. kök içindeki symlink yalnızca bağlantı olarak kabul edilir (hedefi değil)', () => {
    const r = checkDeletable(path.join(root, 'link-file'), [root], opts);
    assert.equal(r.ok, true);
    assert.equal(r.isLink, true);
    assert.equal(r.realPath, path.join(root, 'link-file')); // hedef değil, bağlantının konumu
    const d = checkDeletable(path.join(root, 'link-dir'), [root], opts);
    assert.equal(d.isLink, true);
    assert.equal(d.realPath, path.join(root, 'link-dir'));
  });

  await t.test('10. kökün kendisi symlink ise gerçek konumu esas alınır', () => {
    const rootLink = path.join(tmp.dir, 'root-link');
    fs.symlinkSync(root, rootLink);
    assert.equal(checkDeletable(path.join(rootLink, 'a.bin'), [rootLink], opts).ok, true);
    assert.equal(checkDeletable(path.join(root, 'a.bin'), [rootLink], opts).ok, true);
    assert.equal(checkDeletable(path.join(outside, 'secret.txt'), [rootLink], opts).ok, false);
  });

  await t.test('11. "/" gösteren symlink kök hiçbir şeye izin vermez', () => {
    const evil = path.join(tmp.dir, 'evil-root');
    fs.symlinkSync('/', evil);
    const r = checkDeletable(path.join(evil, 'etc', 'hostname'), [evil], opts);
    assert.equal(r.ok, false);
    assert.equal(checkDeletable('/etc/hostname', ['/'], opts).ok, false);
  });

  await t.test('12. sürücü kökü ve kullanıcı profili kökü reddedilir', () => {
    assert.equal(checkDeletable('/', ['/'], opts).ok, false);
    assert.equal(checkDeletable(home, [tmp.dir], opts).reason, 'protected');
    assert.equal(checkDeletable(path.join(home, '.cache'), [tmp.dir], opts).reason, 'protected');
  });

  await t.test('13. profil kökü beyaz listeye yanlışlıkla konsa bile içindekiler silinemez', () => {
    tmp.file('home/belge.txt', 'önemli');
    assert.equal(checkDeletable(path.join(home, 'belge.txt'), [home], opts).ok, false);
  });

  await t.test('14. korumalı klasörün ATASI silinemez', () => {
    // tmp.dir, korumalı "home" klasörünün atasıdır
    assert.equal(checkDeletable(tmp.p('home'), [tmp.dir], opts).reason, 'protected');
  });

  await t.test('15. var olmayan dosya / boş kök listesi reddedilir', () => {
    assert.equal(checkDeletable(path.join(root, 'yok.bin'), [root], opts).reason, 'not-found');
    assert.equal(checkDeletable(path.join(root, 'a.bin'), [], opts).reason, 'outside-whitelist');
    assert.equal(checkDeletable(path.join(root, 'a.bin'), [path.join(tmp.dir, 'olmayan-kok')], opts).reason, 'outside-whitelist');
  });

  await t.test('16. sistem klasörleri (/etc, /usr) silinemez', () => {
    assert.equal(checkDeletable('/etc', ['/'], opts).ok, false);
    assert.equal(checkDeletable('/usr/bin', ['/usr'], opts).ok, false);
  });

  await t.test('17. checkTrashable: kullanıcı dosyası çöpe gidebilir, sistem/hariç tutulan gidemez', () => {
    const f = tmp.file('home/Videos/film.mkv', 'v');
    assert.equal(checkTrashable(f, opts).ok, true);
    assert.equal(checkTrashable('/etc/hostname', opts).reason, 'system-path');
    assert.equal(checkTrashable('/usr/bin/env', opts).reason, 'system-path');
    assert.equal(checkTrashable(home, opts).reason, 'protected');
    assert.equal(checkTrashable(f, { ...opts, excludedPaths: [tmp.p('home/Videos')] }).reason, 'excluded');
    assert.equal(checkTrashable(path.join(root, 'link-dir', 'secret.txt'), opts).ok, true); // çöpe taşıma: gerçek konum
    assert.equal(checkTrashable(tmp.dir + '/x/../outside/secret.txt', opts).reason, 'dotdot');
  });
});

// ---------------------------------------------------------------------------
// Windows senaryoları (platform enjekte edilir; realpath sahte eşlemeyle)
// ---------------------------------------------------------------------------
test('safety (Windows yolları, enjekte edilmiş platform)', async (t) => {
  const env = {
    SystemDrive: 'C:',
    SystemRoot: 'C:\\Windows',
    USERPROFILE: 'C:\\Users\\Ali',
    LOCALAPPDATA: 'C:\\Users\\Ali\\AppData\\Local',
    APPDATA: 'C:\\Users\\Ali\\AppData\\Roaming',
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    ProgramData: 'C:\\ProgramData',
  };
  // Junction: ...\Temp\junc -> C:\Windows\System32
  const links = new Map([['c:\\users\\ali\\appdata\\local\\temp\\junc', 'C:\\Windows\\System32']]);
  const realpath = (p) => {
    const n = path.win32.normalize(p);
    for (const [from, to] of links) {
      const l = n.toLowerCase();
      if (l === from || l.startsWith(from + '\\')) return to + n.slice(from.length);
    }
    return n;
  };
  const lstat = (p) => {
    const isLink = links.has(path.win32.normalize(p).toLowerCase());
    return { isSymbolicLink: () => isLink, isDirectory: () => isLink };
  };
  const o = { platform: 'win32', env, homedir: 'C:\\Users\\Ali', realpath, lstat };
  const TEMP = 'C:\\Users\\Ali\\AppData\\Local\\Temp';

  await t.test('W1. %TEMP% içindeki dosya silinebilir (büyük/küçük harf duyarsız)', () => {
    assert.equal(checkDeletable(TEMP + '\\setup123\\x.tmp', [TEMP], o).ok, true);
    assert.equal(checkDeletable('c:\\users\\ali\\appdata\\local\\TEMP\\x.tmp', [TEMP], o).ok, true);
    assert.equal(checkDeletable('C:/Users/Ali/AppData/Local/Temp/x.tmp', [TEMP], o).ok, true);
  });

  await t.test('W2. C:\\Windows\\Temp içeriği silinebilir, C:\\Windows silinemez', () => {
    assert.equal(checkDeletable('C:\\Windows\\Temp\\old.log', ['C:\\Windows\\Temp'], o).ok, true);
    assert.equal(checkDeletable('C:\\Windows', ['C:\\'], o).ok, false);
    assert.equal(checkDeletable('C:\\Windows\\Temp', ['C:\\Windows\\Temp'], o).reason, 'is-root');
  });

  await t.test('W3. System32 ve Program Files beyaz listede olsa bile reddedilir', () => {
    assert.equal(checkDeletable('C:\\Windows\\System32\\drivers\\etc\\hosts', ['C:\\Windows\\System32'], o).ok, false);
    assert.equal(checkDeletable('C:\\Program Files\\App\\app.exe', ['C:\\Program Files'], o).ok, false);
    assert.equal(checkDeletable('C:\\Windows\\notepad.exe', ['C:\\Windows'], o).ok, false);
  });

  await t.test('W4. sürücü kökü, profil kökü ve C:\\Users reddedilir', () => {
    assert.equal(checkDeletable('C:\\', ['C:\\'], o).ok, false);
    assert.equal(checkDeletable('D:\\', ['D:\\'], o).ok, false);
    assert.equal(checkDeletable('C:\\Users\\Ali', ['C:\\Users'], o).reason, 'protected');
    assert.equal(checkDeletable('C:\\Users', ['C:\\'], o).reason, 'protected');
    assert.equal(checkDeletable('C:\\Users\\Ali\\Documents\\tez.docx', ['C:\\Users\\Ali'], o).ok, false);
    assert.equal(checkDeletable('D:\\Filmler\\a.mkv', ['D:\\'], o).ok, false);
  });

  await t.test('W5. junction kaçışı reddedilir', () => {
    const r = checkDeletable(TEMP + '\\junc\\kernel32.dll', [TEMP], o);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'outside-whitelist'); // gerçek konum C:\Windows\System32\kernel32.dll
    // junction'ın KENDİSİ yalnızca bağlantı olarak kaldırılabilir; hedefi (System32) asla
    const j = checkDeletable(TEMP + '\\junc', [TEMP], o);
    assert.equal(j.ok, true);
    assert.equal(j.isLink, true);
    assert.equal(j.realPath.toLowerCase(), (TEMP + '\\junc').toLowerCase());
  });

  await t.test('W6. ".." ve önek hilesi reddedilir', () => {
    assert.equal(checkDeletable(TEMP + '\\..\\..\\Roaming\\x', [TEMP], o).reason, 'dotdot');
    assert.equal(checkDeletable(TEMP + '/../Temp/x', [TEMP], o).reason, 'dotdot');
    assert.equal(checkDeletable('C:\\Users\\Ali\\AppData\\Local\\Temp2\\x', [TEMP], o).reason, 'outside-whitelist');
  });

  await t.test('W7. ADS, aygıt yolları, joker ve kök-göreli yollar reddedilir', () => {
    assert.equal(checkDeletable(TEMP + '\\x.txt:gizli', [TEMP], o).reason, 'invalid-path');
    assert.equal(checkDeletable('\\\\.\\C:\\Users\\Ali\\AppData\\Local\\Temp\\x', [TEMP], o).reason, 'invalid-path');
    assert.equal(checkDeletable('\\\\?\\GLOBALROOT\\Device\\x', [TEMP], o).reason, 'invalid-path');
    assert.equal(checkDeletable(TEMP + '\\*.tmp', [TEMP], o).reason, 'invalid-path');
    assert.equal(checkDeletable('\\Users\\Ali\\AppData\\Local\\Temp\\x', [TEMP], o).reason, 'invalid-path');
    assert.equal(checkDeletable('C:Temp\\x', [TEMP], o).ok, false);
  });

  await t.test('W8. uzun yol öneki (\\\\?\\C:\\) normalleştirilir', () => {
    assert.equal(checkDeletable('\\\\?\\' + TEMP + '\\x.tmp', [TEMP], o).ok, true);
  });

  await t.test('W9. checkTrashable: sistem dosyaları ve klasörleri çöpe gitmez', () => {
    assert.equal(checkTrashable('C:\\pagefile.sys', o).reason, 'system-path');
    assert.equal(checkTrashable('C:\\Windows\\explorer.exe', o).reason, 'system-path');
    assert.equal(checkTrashable('C:\\Program Files (x86)\\Steam\\steam.exe', o).reason, 'system-path');
    assert.equal(checkTrashable('C:\\ProgramData\\x.dat', o).reason, 'system-path');
    assert.equal(checkTrashable('C:\\Users\\Ali\\Downloads', o).reason, 'protected');
    assert.equal(checkTrashable('C:\\Users\\Ali\\Downloads\\win11.iso', o).ok, true);
    assert.equal(checkTrashable('D:\\Yedek\\eski.zip', o).ok, true);
  });
});

test('yardımcılar: isStrictlyInside / isDriveRoot', () => {
  assert.equal(isStrictlyInside('/a/b/c', '/a/b', 'linux'), true);
  assert.equal(isStrictlyInside('/a/b', '/a/b', 'linux'), false);
  assert.equal(isStrictlyInside('/a/bc', '/a/b', 'linux'), false);
  assert.equal(isStrictlyInside('C:\\A\\b', 'c:\\a', 'win32'), true);
  assert.equal(isDriveRoot('C:\\', 'win32'), true);
  assert.equal(isDriveRoot('c:', 'win32'), true);
  assert.equal(isDriveRoot('\\\\nas\\paylasim', 'win32'), true);
  assert.equal(isDriveRoot('/', 'linux'), true);
  assert.equal(isDriveRoot(os.tmpdir(), 'linux'), false);
});

test('checkExistingPath: renderer yolları (göster/aç) için temel denetim', (t) => {
  const { checkExistingPath } = require('../../src/core/safety');
  const tmp = makeTmp();
  t.after(() => tmp.cleanup());
  const f = tmp.file('a/b.txt', 'x');
  assert.equal(checkExistingPath(f, { platform: 'linux' }).ok, true);
  assert.equal(checkExistingPath('/', { platform: 'linux' }).ok, true);
  assert.equal(checkExistingPath(tmp.dir + '/a/../a/b.txt', { platform: 'linux' }).reason, 'dotdot');
  assert.equal(checkExistingPath('a/b.txt', { platform: 'linux' }).reason, 'relative-path');
  assert.equal(checkExistingPath(tmp.p('yok'), { platform: 'linux' }).reason, 'not-found');
  assert.equal(checkExistingPath(123, { platform: 'linux' }).reason, 'invalid-path');
});
