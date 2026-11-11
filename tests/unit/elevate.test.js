'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../src/main/elevate');

test('quoteArg: Windows komut satırı tırnaklama', () => {
  assert.equal(E.quoteArg('C:\\App\\a.exe'), 'C:\\App\\a.exe');
  assert.equal(E.quoteArg('C:\\Program Files\\Ferahla'), '"C:\\Program Files\\Ferahla"');
  assert.equal(E.quoteArg('C:\\Uygulama Klasörü\\'), '"C:\\Uygulama Klasörü\\\\"'); // sondaki \ kapanış tırnağını kaçırmasın
  assert.equal(E.quoteArg('a"b'), '"a\\"b"');
  assert.equal(E.quoteArg(''), '""');
});

test('relaunchTarget: paketli ve geliştirme', () => {
  assert.deepEqual(E.relaunchTarget({ execPath: 'C:\\F\\Ferahla.exe', isPackaged: true, appPath: 'x' }), { exe: 'C:\\F\\Ferahla.exe', args: ['--elevated'] });
  assert.deepEqual(E.relaunchTarget({ execPath: 'C:\\n\\electron.exe', isPackaged: false, appPath: 'C:\\Kod\\ferahla' }), { exe: 'C:\\n\\electron.exe', args: ['C:\\Kod\\ferahla', '--elevated'] });
});

test('buildElevateScript: yol betiğe düz metin olarak gömülmez (base64 JSON)', () => {
  const exe = "C:\\Ali'nin Dosyaları\\Ferahla.exe";
  const s = E.buildElevateScript(exe, ['--elevated']);
  assert.ok(!s.includes("Ali'nin"));
  assert.match(s, /-Verb RunAs/);
  const b64 = /FromBase64String\('([^']+)'\)/.exec(s)[1];
  assert.deepEqual(JSON.parse(Buffer.from(b64, 'base64').toString('utf8')), { exe, args: '--elevated' });
});

test('parseElevateOutput ve relaunchAsAdmin (sahte PowerShell)', async () => {
  assert.deepEqual(E.parseElevateOutput('FERAHLA:OK\r\n'), { ok: true });
  assert.deepEqual(E.parseElevateOutput('FERAHLA:CANCELLED\r\n'), { ok: false, error: 'cancelled' });
  assert.deepEqual(E.parseElevateOutput('FERAHLA:FAIL x'), { ok: false, error: 'relaunch-failed' });
  assert.deepEqual(E.parseElevateOutput(''), { ok: false, error: 'relaunch-failed' });
  assert.deepEqual(await E.relaunchAsAdmin({ platform: 'linux', execPath: '/x' }), { ok: false, error: 'unsupported' });
  let script = null;
  const r = await E.relaunchAsAdmin({ platform: 'win32', execPath: 'C:\\F.exe', isPackaged: true, runner: async (sc) => { script = sc; return { code: 0, stdout: 'FERAHLA:CANCELLED' }; } });
  assert.deepEqual(r, { ok: false, error: 'cancelled' });
  assert.match(script, /Start-Process/);
});
