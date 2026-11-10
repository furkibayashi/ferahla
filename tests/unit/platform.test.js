'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const win32 = require('../../src/core/platform/win32');
const linux = require('../../src/core/platform/linux');
const { parseTasklistCsv, parsePsComm } = require('../../src/core/platform/common');
const { decodeOutput } = require('../../src/core/exec');
const { getPlatform } = require('../../src/core/platform');

test('Get-CimInstance JSON ayrıştırma (tek nesne ve dizi)', () => {
  const arr = '[{"DeviceID":"C:","VolumeName":"Windows","Size":511101161472,"FreeSpace":102400000000,"DriveType":3},' +
    '{"DeviceID":"D:","VolumeName":null,"Size":0,"FreeSpace":0,"DriveType":5},' +
    '{"DeviceID":"E:","VolumeName":"USB","Size":32000000000,"FreeSpace":1000,"DriveType":2},' +
    '{"DeviceID":"Z:","VolumeName":"Ağ","Size":1000,"FreeSpace":10,"DriveType":4}]';
  assert.deepEqual(win32.parseCimDisksJson(arr), [
    { path: 'C:\\', label: 'Windows', totalBytes: 511101161472, freeBytes: 102400000000 },
    { path: 'E:\\', label: 'USB', totalBytes: 32000000000, freeBytes: 1000 },
  ]);
  const one = '{"DeviceID":"C:","VolumeName":"","Size":100,"FreeSpace":40,"DriveType":3}';
  assert.deepEqual(win32.parseCimDisksJson(one), [{ path: 'C:\\', label: '', totalBytes: 100, freeBytes: 40 }]);
  assert.equal(win32.parseCimDisksJson('bozuk'), null);
});

test('wmic CSV ayrıştırma (\\r\\r\\n satır sonları dahil)', () => {
  const text = '\r\r\nNode,DeviceID,DriveType,FreeSpace,Size,VolumeName\r\r\nMASAUSTU,C:,3,102400000000,511101161472,Windows\r\r\nMASAUSTU,D:,5,,,\r\r\nMASAUSTU,F:,3,5,10,Veri, Yedek\r\r\n';
  assert.deepEqual(win32.parseWmicCsv(text), [
    { path: 'C:\\', label: 'Windows', totalBytes: 511101161472, freeBytes: 102400000000 },
    { path: 'F:\\', label: 'Veri, Yedek', totalBytes: 10, freeBytes: 5 },
  ]);
  assert.equal(win32.parseWmicCsv(''), null);
});

test('whoami SID, tasklist ve ps ayrıştırma', () => {
  assert.equal(win32.parseWhoamiSid('"masaustu\\ali","S-1-5-21-1004336348-1177238915-682003330-1001"\r\n'), 'S-1-5-21-1004336348-1177238915-682003330-1001');
  assert.equal(win32.parseWhoamiSid('hata'), null);
  const tl = '"System Idle Process","0","Services","0","8 K"\r\n"chrome.exe","1234","Console","1","123.456 K"\r\n"Discord.exe","99","Console","1","1 K"\r\n';
  const s = parseTasklistCsv(tl);
  assert.ok(s.has('chrome.exe') && s.has('discord.exe') && !s.has('Discord.exe'));
  const ps = parsePsComm('systemd\n  firefox\n/usr/bin/Discord\nteams-for-linux\n');
  assert.ok(ps.has('firefox') && ps.has('discord') && ps.has('teams-for-linux'));
});

test('çıktı çözme: UTF-16LE (BOM\'lu ve BOM\'suz) ve UTF-8', () => {
  assert.equal(decodeOutput(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Merhaba Dünya', 'utf16le')])), 'Merhaba Dünya');
  assert.equal(decodeOutput(Buffer.from('Node,DeviceID\r\nPC,C:', 'utf16le')), 'Node,DeviceID\r\nPC,C:');
  assert.equal(decodeOutput(Buffer.from('Güncelleme', 'utf8')), 'Güncelleme');
});

test('win32 kategori kökleri ortam değişkenlerinden üretilir', async () => {
  const env = {
    SystemRoot: 'C:\\Windows', SystemDrive: 'C:', USERPROFILE: 'C:\\Users\\Ali',
    LOCALAPPDATA: 'C:\\Users\\Ali\\AppData\\Local', APPDATA: 'C:\\Users\\Ali\\AppData\\Roaming',
    TEMP: 'C:\\Users\\Ali\\AppData\\Local\\Temp', ProgramData: 'C:\\ProgramData',
  };
  const p = async (id) => (await win32.cleanupRoots(id, { env })).map((r) => r.path);
  assert.deepEqual(await p('user-temp'), ['C:\\Users\\Ali\\AppData\\Local\\Temp']);
  assert.deepEqual(await p('windows-temp'), ['C:\\Windows\\Temp']);
  assert.deepEqual(await p('windows-update'), ['C:\\Windows\\SoftwareDistribution\\Download']);
  assert.deepEqual(await p('crash-dumps'), ['C:\\Users\\Ali\\AppData\\Local\\CrashDumps']);
  const th = (await win32.cleanupRoots('thumbnails', { env }))[0];
  assert.equal(th.path, 'C:\\Users\\Ali\\AppData\\Local\\Microsoft\\Windows\\Explorer');
  assert.ok(th.pattern.test('thumbcache_1024.db') && !th.pattern.test('iconcache_16.db'));
  assert.ok((await p('discord')).includes('C:\\Users\\Ali\\AppData\\Roaming\\discord\\Cache'));
  assert.ok((await p('steam')).includes('C:\\Users\\Ali\\AppData\\Local\\Steam\\htmlcache\\Cache'));
  assert.ok((await p('wer')).includes('C:\\ProgramData\\Microsoft\\Windows\\WER\\ReportQueue'));
  assert.equal(await win32.cleanupRoots('yok', { env }), null);
  // Hiçbir tarayıcı kökü çerez/şifre/geçmiş dosyalarını hedeflemez
  for (const id of ['chrome', 'edge', 'brave', 'opera', 'firefox', 'discord', 'teams', 'spotify', 'steam']) {
    for (const root of await p(id)) assert.doesNotMatch(root, /Cookies|Login Data|History|Local Storage|Bookmarks|Web Data/i);
  }
  assert.equal(win32.requiresAdmin('windows-temp'), true);
  assert.equal(win32.requiresAdmin('windows-update'), true);
  assert.equal(win32.requiresAdmin('user-temp'), false);
  assert.deepEqual(win32.processNames('chrome'), ['chrome.exe']);
  assert.deepEqual(win32.recycleBinOpenCommand(), { file: 'explorer.exe', args: ['shell:RecycleBinFolder'] });
});

test('linux: /proc/mounts ayrıştırma ve FERAHLA_TEST_ROOT yönlendirmesi', async () => {
  const mounts = [
    'overlay / overlay rw,relatime 0 0',
    'proc /proc proc rw 0 0',
    '/dev/sda1 /home ext4 rw 0 0',
    '/dev/sdb1 /media/ali/USB\\040Bellek vfat rw 0 0',
    'tmpfs /run tmpfs rw 0 0',
    '/dev/sda2 /boot/efi vfat rw 0 0',
  ].join('\n');
  assert.deepEqual(linux.parseProcMounts(mounts), ['/', '/home', '/media/ali/USB Bellek']);
  const env = { FERAHLA_TEST_ROOT: '/x/test' };
  assert.deepEqual((await linux.cleanupRoots('user-temp', { env })).map((r) => r.path), ['/x/test/tmp']);
  assert.deepEqual((await linux.cleanupRoots('thumbnails', { env })).map((r) => r.path), ['/x/test/home/.cache/thumbnails']);
  assert.equal(await linux.cleanupRoots('windows-update', { env }), null);
  const drives = await linux.listDrives();
  assert.ok(drives.length >= 1 && drives[0].totalBytes > 0 && drives[0].freeBytes >= 0);
  assert.equal(getPlatform('win32'), win32);
  assert.equal(getPlatform('linux'), linux);
});
