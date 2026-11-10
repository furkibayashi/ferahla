'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const S = require('../../src/core/startup');
const { makeTmp } = require('./helpers');

const RUN_HKCU = [
  '',
  'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
  '    OneDrive    REG_SZ    "C:\\Users\\Ali\\AppData\\Local\\Microsoft\\OneDrive\\OneDrive.exe" /background',
  '    Discord    REG_SZ    "C:\\Users\\Ali\\AppData\\Local\\Discord\\Update.exe" --processStart Discord.exe',
  '    com.squirrel.Teams.Teams    REG_SZ    C:\\Users\\Ali\\AppData\\Local\\Microsoft\\Teams\\Update.exe --processStart "Teams.exe" --process-start-args "--system-initiated"',
  '    Steam    REG_SZ    "C:\\Program Files (x86)\\Steam\\steam.exe" -silent',
  '    Benim Güzel Uygulamam    REG_EXPAND_SZ    %LOCALAPPDATA%\\Benim\\app.exe --tray',
  '    (Varsayılan)    REG_SZ    ',
  '    Sayi    REG_DWORD    0x1',
  '',
  'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\AltAnahtar',
  '    Gizli    REG_SZ    C:\\gizli.exe',
  '',
].join('\r\n');

const APPROVED_HKCU = [
  '',
  'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run',
  '    OneDrive    REG_BINARY    020000000000000000000000',
  '    Discord    REG_BINARY    0300000066AF9A3C5A2CD901',
  '    steam    REG_BINARY    030000004B1E2F8C1A5BD901',
  '    Eski    REG_BINARY    030000004B1E2F8C1A5BD901',
  '',
].join('\r\n');

const RUN_HKLM = [
  '',
  'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
  '    SecurityHealth    REG_EXPAND_SZ    %windir%\\system32\\SecurityHealthSystray.exe',
  '    RtkAudUService    REG_SZ    "C:\\Windows\\System32\\DriverStore\\FileRepository\\realtek\\RtkAudUService64.exe" -background',
  '',
].join('\r\n');

const APPROVED_HKLM = [
  '',
  'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run',
  '    RtkAudUService    REG_BINARY    060000000000000000000000',
  '    SecurityHealth    REG_BINARY    070000000000000000000000',
  '',
].join('\r\n');

const NOT_FOUND = { code: 1, stdout: '', stderr: 'ERROR: The system was unable to find the specified registry key or value.' };

function fakeRunner(calls = []) {
  return async (file, args) => {
    calls.push({ file, args });
    if (file === 'cmd.exe') {
      const cmd = args[args.length - 1];
      const key = /reg query "([^"]+)"/.exec(cmd)[1];
      const map = {
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run': RUN_HKCU,
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run': APPROVED_HKCU,
        'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run': RUN_HKLM,
        'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run': APPROVED_HKLM,
      };
      return map[key] ? { code: 0, stdout: map[key], stderr: '' } : NOT_FOUND;
    }
    if (file === 'reg.exe') return { code: 0, stdout: 'The operation completed successfully.', stderr: '' };
    return { code: 1, stdout: '', stderr: '' };
  };
}

const ENV = {
  APPDATA: '/olmayan/Roaming', ProgramData: '/olmayan/ProgramData',
  LOCALAPPDATA: 'C:\\Users\\Ali\\AppData\\Local', windir: 'C:\\Windows',
};

test('parseRegQuery: adlar boşluk içerebilir, alt anahtarlar yok sayılır', () => {
  const v = S.parseRegQuery(RUN_HKCU);
  assert.deepEqual(v.map((x) => x.name), ['OneDrive', 'Discord', 'com.squirrel.Teams.Teams', 'Steam', 'Benim Güzel Uygulamam', '(Varsayılan)', 'Sayi']);
  assert.equal(v[3].data, '"C:\\Program Files (x86)\\Steam\\steam.exe" -silent');
  assert.equal(v[4].type, 'REG_EXPAND_SZ');
  assert.equal(v[5].data, '');
  assert.deepEqual(S.parseRegQuery(''), []);
  assert.deepEqual(S.parseRegQuery(NOT_FOUND.stderr), []);
});

test('StartupApproved bayt mantığı: 02=açık, 03=kapalı', () => {
  assert.equal(S.approvedEnabledFromHex('020000000000000000000000'), true);
  assert.equal(S.approvedEnabledFromHex('0300000066AF9A3C5A2CD901'), false);
  assert.equal(S.approvedEnabledFromHex('06 00 00 00'), true);
  assert.equal(S.approvedEnabledFromHex('07'), false);
  assert.equal(S.approvedEnabledFromHex(''), null);
  assert.equal(S.buildApprovedHex(true), '020000000000000000000000');
  const off = S.buildApprovedHex(false, new Date(0));
  assert.equal(off, '03000000' + '00803ED5DEB19D01'); // 1970-01-01 FILETIME küçük-sonlu
  assert.equal(off.length, 24);
  assert.equal(S.approvedEnabledFromHex(off), false);
});

test('parseCommandExe ve expandEnv', () => {
  assert.equal(S.parseCommandExe('"C:\\Program Files\\A B\\x.exe" -q'), 'C:\\Program Files\\A B\\x.exe');
  assert.equal(S.parseCommandExe('C:\\PROGRA~1\\App\\app.exe /min'), 'C:\\PROGRA~1\\App\\app.exe');
  assert.equal(S.parseCommandExe('%LOCALAPPDATA%\\x\\y.exe', { LOCALAPPDATA: 'C:\\L' }), 'C:\\L\\x\\y.exe');
  assert.equal(S.parseCommandExe('rundll32.exe C:\\a.dll,Run'), 'rundll32.exe');
  assert.equal(S.parseCommandExe(''), null);
  assert.equal(S.expandEnv('%WinDir%\\a %YOK%', { windir: 'C:\\Windows' }), 'C:\\Windows\\a %YOK%');
});

test('bilinen programlar sözlüğü: en az 30 kayıt, şema ve eşleşme', () => {
  assert.ok(S.KNOWN.length >= 30);
  const ids = new Set();
  for (const k of S.KNOWN) {
    assert.ok(!ids.has(k.id), `tekrarlı id ${k.id}`);
    ids.add(k.id);
    assert.ok(['safe-to-disable', 'keep', 'unknown'].includes(k.advice));
    assert.ok(k.description.tr.length > 10 && k.description.en.length > 10);
    assert.ok(Array.isArray(k.match) && k.match.length > 0 && k.match.every((m) => m === m.toLowerCase()));
  }
  for (const need of ['discord', 'spotify', 'steam', 'epic', 'onedrive', 'teams', 'skype', 'zoom', 'adobe-cc', 'acrobat-update',
    'nvidia', 'amd-radeon', 'realtek-audio', 'logitech-ghub', 'razer-synapse', 'edge-update', 'google-update', 'java-update',
    'itunes-helper', 'dropbox', 'whatsapp', 'telegram', 'utorrent', 'qbittorrent', 'battlenet', 'ea-app', 'riot-client',
    'ubisoft-connect', 'cortana', 'windows-security']) {
    assert.ok(ids.has(need), `eksik: ${need}`);
  }
  assert.equal(S.matchKnown('com.squirrel.Teams.Teams', 'C:\\x\\Teams\\Update.exe').advice, 'safe-to-disable');
  assert.match(S.matchKnown('MSTeams', 'ms-teams.exe').description.en, /Meetings/);
  assert.match(S.matchKnown('Steam', '"C:\\Program Files (x86)\\Steam\\steam.exe" -silent').description.en, /Game store/);
  assert.equal(S.matchKnown('SecurityHealth', 'C:\\Windows\\system32\\SecurityHealthSystray.exe').advice, 'keep');
  assert.equal(S.matchKnown('Tamamen Bilinmeyen', 'C:\\x\\y.exe'), null);
});

test('listStartupItems (win32, sahte reg çıktısıyla)', async () => {
  const items = await S.listStartupItems({ platform: 'win32', env: ENV, runner: fakeRunner() });
  const by = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(items.length, 7);
  assert.equal(by['hkcu-run::OneDrive'].enabled, true);
  assert.equal(by['hkcu-run::Discord'].enabled, false);
  assert.equal(by['hkcu-run::Steam'].enabled, false); // değer adı büyük/küçük harf duyarsız eşleşir
  assert.equal(by['hkcu-run::com.squirrel.Teams.Teams'].enabled, true); // StartupApproved kaydı yok = açık
  assert.equal(by['hkcu-run::Benim Güzel Uygulamam'].command, 'C:\\Users\\Ali\\AppData\\Local\\Benim\\app.exe --tray');
  assert.equal(by['hkcu-run::Benim Güzel Uygulamam'].known.advice, 'unknown');
  assert.equal(by['hkcu-run::OneDrive'].source, 'HKCU Run');
  assert.equal(by['hklm-run::RtkAudUService'].source, 'HKLM Run');
  assert.equal(by['hklm-run::RtkAudUService'].enabled, true);
  assert.equal(by['hklm-run::SecurityHealth'].enabled, false);
  assert.equal(by['hklm-run::SecurityHealth'].command, 'C:\\Windows\\system32\\SecurityHealthSystray.exe');
  assert.equal(by['hkcu-run::Discord'].known.advice, 'safe-to-disable');
  assert.ok(!items.some((i) => i.name === '(Varsayılan)' || i.name === 'Sayi' || i.name === 'Gizli'));
});

test('setStartupItemEnabled (win32): yalnızca StartupApproved yazılır, Run silinmez', async () => {
  const calls = [];
  const runner = fakeRunner(calls);
  const r = await S.setStartupItemEnabled('hkcu-run::Discord', true, { platform: 'win32', env: ENV, runner });
  assert.deepEqual(r, { ok: true, previous: false, name: 'Discord' });
  const writes = calls.filter((c) => c.file === 'reg.exe');
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].args, ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run', '/v', 'Discord', '/t', 'REG_BINARY', '/d', '020000000000000000000000', '/f', '/reg:64']);
  assert.ok(!calls.some((c) => c.args.includes('delete') || /reg delete/i.test(c.args.join(' '))));

  const off = await S.setStartupItemEnabled('hkcu-run::OneDrive', false, { platform: 'win32', env: ENV, runner });
  assert.equal(off.ok, true);
  const w2 = calls.filter((c) => c.file === 'reg.exe')[1];
  assert.match(w2.args[7], /^03000000[0-9A-F]{16}$/);

  // HKLM: yönetici değilse yazma denenmez
  const n = calls.length;
  const lm = await S.setStartupItemEnabled('hklm-run::RtkAudUService', false, { platform: 'win32', env: ENV, runner, isAdmin: false });
  assert.equal(lm.ok, false);
  assert.equal(lm.error, 'requires-admin');
  assert.ok(!calls.slice(n).some((c) => c.file === 'reg.exe'));

  assert.equal((await S.setStartupItemEnabled('hkcu-run::Yok', false, { platform: 'win32', env: ENV, runner })).error, 'not-found');
  assert.equal((await S.setStartupItemEnabled('bozuk', false, { platform: 'win32', env: ENV, runner })).error, 'invalid-argument');
  assert.equal((await S.setStartupItemEnabled('hkcu-run::Discord', 'evet', { platform: 'win32', env: ENV, runner })).error, 'invalid-argument');
});

test('Linux autostart: .desktop okuma ve aç/kapat', async (t) => {
  const tmp = makeTmp();
  t.after(() => tmp.cleanup());
  const env = { FERAHLA_TEST_ROOT: tmp.dir };
  const dir = S.autostartDir(env);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'discord.desktop'), '[Desktop Entry]\nType=Application\nName=Discord\nExec=/usr/bin/discord --start-minimized\n\n[Desktop Action New]\nName=Yeni\n');
  fs.writeFileSync(path.join(dir, 'gizli.desktop'), '[Desktop Entry]\nName=Gizli Uygulama\nExec=gizli\nHidden=true\n');
  fs.writeFileSync(path.join(dir, 'kapali.desktop'), '[Desktop Entry]\nName=Kapalı\nExec=k\nX-GNOME-Autostart-enabled=false\n');
  fs.writeFileSync(path.join(dir, 'not-desktop.txt'), 'x');

  const items = await S.listStartupItems({ platform: 'linux', env });
  assert.deepEqual(items.map((i) => [i.id, i.enabled, i.source]), [
    ['autostart::discord.desktop', true, 'Autostart'],
    ['autostart::gizli.desktop', false, 'Autostart'],
    ['autostart::kapali.desktop', false, 'Autostart'],
  ]);
  assert.equal(items[0].known.advice, 'safe-to-disable');

  const r = await S.setStartupItemEnabled('autostart::discord.desktop', false, { platform: 'linux', env });
  assert.deepEqual(r, { ok: true, previous: true, name: 'Discord' });
  const text = fs.readFileSync(path.join(dir, 'discord.desktop'), 'utf8');
  assert.match(text, /X-GNOME-Autostart-enabled=false/);
  assert.match(text, /\[Desktop Action New\]\nName=Yeni/); // diğer bölümler korunur
  assert.ok(text.indexOf('X-GNOME-Autostart-enabled') < text.indexOf('[Desktop Action New]'));

  assert.equal((await S.setStartupItemEnabled('autostart::gizli.desktop', true, { platform: 'linux', env })).ok, true);
  const after = await S.listStartupItems({ platform: 'linux', env });
  assert.deepEqual(after.map((i) => i.enabled), [false, true, false]);

  assert.equal((await S.setStartupItemEnabled('autostart::../../etc/x.desktop', true, { platform: 'linux', env })).ok, false);
});

test('setDesktopEnabledText / parseDesktopEntry', () => {
  const t1 = S.setDesktopEnabledText('[Desktop Entry]\nName=A\nX-GNOME-Autostart-enabled=true\n', false);
  assert.equal(S.desktopEnabled(S.parseDesktopEntry(t1)), false);
  const t2 = S.setDesktopEnabledText('[Desktop Entry]\nName=A\nHidden=true\n', true);
  assert.equal(S.desktopEnabled(S.parseDesktopEntry(t2)), true);
  assert.equal(S.parseDesktopEntry('# yorum\n[Desktop Entry]\nName=Ad = Soyad\n').Name, 'Ad = Soyad');
});
