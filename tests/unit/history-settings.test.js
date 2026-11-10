'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { History, cleanSummary, trashSummary, startupSummary } = require('../../src/core/history');
const { Settings, sanitize } = require('../../src/main/settings');
const { formatBytes } = require('../../src/core/format');
const { errorResult } = require('../../src/core/errors');
const { makeTmp } = require('./helpers');

test('History: ekleme, listeleme, geri alma', async (t) => {
  const tmp = makeTmp();
  t.after(() => tmp.cleanup());
  const file = tmp.p('alt', 'history.json');
  const h = new History(file);
  assert.deepEqual(h.list(), []);
  h.add({ action: 'clean', summary: cleanSummary({ categories: 2, deleted: 1500, freedBytes: 1.5 * 1024 ** 3, skippedInUse: 3 }), freedBytes: 1.5 * 1024 ** 3 });
  const st = h.add({ action: 'startup', summary: startupSummary({ name: 'Discord', enabled: false }), undo: { type: 'startup', itemId: 'hkcu-run::Discord', enabled: true } });

  const h2 = new History(file); // diskten yeniden oku
  const list = h2.list();
  assert.equal(list.length, 2);
  assert.equal(list[0].id, st.id);
  assert.equal(list[0].undoable, true);
  assert.equal(list[0].undo, undefined, 'iç geri alma verisi arayüze gitmez');
  assert.equal(list[1].undoable, false);
  assert.match(list[1].summary.tr, /2 kategori, 1\.500 dosya silindi \(1,5 GB\); 3 dosya kullanımda olduğu için atlandı/);
  assert.match(list[1].summary.en, /1,500 files removed \(1\.5 GB\)/);
  assert.ok(!Number.isNaN(Date.parse(list[0].at)));

  const calls = [];
  const ok = await h2.undo(st.id, { setStartupItemEnabled: async (id, en) => { calls.push([id, en]); return { ok: true }; } });
  assert.deepEqual(ok, { ok: true });
  assert.deepEqual(calls, [['hkcu-run::Discord', true]]);
  const again = await h2.undo(st.id, { setStartupItemEnabled: async () => ({ ok: true }) });
  assert.equal(again.error, 'not-undoable');
  assert.equal(h2.list()[0].action, 'startup');
  assert.match(h2.list()[0].summary.tr, /^Geri alındı/);
  assert.equal((await h2.undo(list[1].id, {})).error, 'not-undoable');
  assert.equal((await h2.undo('yok', {})).error, 'not-found');

  // Başarısız geri alma kaydı bozmaz
  const st2 = h2.add({ action: 'startup', summary: startupSummary({ name: 'X', enabled: false }), undo: { type: 'startup', itemId: 'a::X', enabled: true } });
  const fail = await h2.undo(st2.id, { setStartupItemEnabled: async () => ({ ok: false, error: 'requires-admin' }) });
  assert.equal(fail.error, 'requires-admin');
  assert.equal(h2.list().find((e) => e.id === st2.id).undoable, true);
});

test('History: bozuk dosya yedeklenir, boş başlanır', (t) => {
  const tmp = makeTmp();
  t.after(() => tmp.cleanup());
  const file = tmp.file('history.json', '{bozuk');
  const h = new History(file);
  assert.deepEqual(h.list(), []);
  h.add({ action: 'trash', summary: trashSummary({ trashed: 1, freedBytes: 10 }), freedBytes: 10 });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).length, 1);
  assert.ok(fs.readdirSync(tmp.dir).some((f) => f.startsWith('history.json.bozuk-')));
});

test('Settings: varsayılanlar, doğrulama, kalıcılık', (t) => {
  const tmp = makeTmp();
  t.after(() => tmp.cleanup());
  const s = new Settings(tmp.p('settings.json'), { defaultLang: 'en' });
  assert.deepEqual(s.get(), { lang: 'en', theme: 'system', excludedPaths: [] });
  const r = s.set({ lang: 'tr', theme: 'dark', excludedPaths: ['/a/b', 'göreli', 5, '/a/b/', '/c\0'], kotu: 1 });
  assert.deepEqual(r, { lang: 'tr', theme: 'dark', excludedPaths: ['/a/b'] });
  assert.deepEqual(new Settings(tmp.p('settings.json')).get(), r);
  assert.deepEqual(s.set({ lang: 'de', theme: 'neon' }), r);
  assert.deepEqual(sanitize(null, { lang: 'tr', theme: 'system', excludedPaths: [] }), { lang: 'tr', theme: 'system', excludedPaths: [] });
});

test('formatBytes / errorResult', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1536, 'tr'), '1,5 KB');
  assert.equal(formatBytes(1536, 'en'), '1.5 KB');
  assert.equal(formatBytes(250 * 1024 ** 3, 'en'), '250 GB');
  const e = errorResult('requires-admin');
  assert.equal(e.ok, false);
  assert.equal(e.error, 'requires-admin');
  assert.match(e.message, /Yönetici olarak çalıştır/);
  assert.match(errorResult('bilinmeyen-kod', 'en').message, /Something unexpected/);
});
