'use strict';

/**
 * Başlangıç öğeleri (aç/kapat, "Kapatmayın" uyarısı, Geçmiş'ten geri al), ayarlar (dil, tema, kalıcılık, hariç tutulan
 * klasörler), TR↔EN çevrilmemiş metin avı, 800×560 taşma denetimi + açık/koyu ekran görüntüleri, konsol hataları.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { test, expect } = require('playwright/test');
const H = require('./helpers');

const MB = 1024 * 1024;

function desktop(dir, file, fields) {
  const body = ['[Desktop Entry]', 'Type=Application', ...Object.entries(fields).map(([k, v]) => `${k}=${v}`)].join('\n') + '\n';
  fs.writeFileSync(path.join(dir, file), body);
  return path.join(dir, file);
}

/** Tüm ekranları dolduracak zengin korumalı alan. */
function richSandbox(label) {
  const sb = H.makeSandbox(label);
  const a = sb.autostart;
  desktop(a, 'discord.desktop', { Name: 'Discord', Exec: '/usr/bin/discord --start-minimized' });
  desktop(a, 'onedrive.desktop', { Name: 'OneDrive', Exec: '/opt/onedrive/onedrive' });
  desktop(a, 'garip.desktop', { Name: 'Garip Araç', Exec: '/opt/garip/arac' });
  desktop(a, 'teamspeak.desktop', { Name: 'TeamSpeak 3', Exec: '/opt/teamspeak3/ts3client_runscript.sh' });
  desktop(a, 'kooperatif.desktop', { Name: 'Cooperative Notes', Exec: '/opt/coop/notes' });
  desktop(a, 'kapali.desktop', { Name: 'Kapalı Uygulama', Exec: '/opt/k', Hidden: 'true' });
  // Dışarıdaki bir dosyayı gösteren .desktop bağlantısı (hedef değişmemeli)
  const ext = path.join(sb.base, 'disarisi', 'paylasilan.desktop');
  fs.mkdirSync(path.dirname(ext), { recursive: true });
  desktop(path.dirname(ext), 'paylasilan.desktop', { Name: 'Slack', Exec: '/usr/bin/slack' });
  fs.symlinkSync(ext, path.join(a, 'slack.desktop'));
  // Temizlik verisi
  const old = (p) => { const t = (Date.now() - 3 * H.DAY) / 1000; fs.utimesSync(p, t, t); return p; };
  old(H.writeFile(path.join(sb.tmp, 'eski.log'), 30000));
  H.writeFile(path.join(sb.config, 'google-chrome', 'Default', 'Cache', 'd'), 7 * MB);
  H.writeFile(path.join(sb.cache, 'thumbnails', 'normal', 't.png'), 9000);
  H.writeFile(path.join(sb.trash, 'files', 'cop.txt'), 500);
  // Disk haritası / büyük / kopya verisi
  const docs = path.join(sb.home, 'Belgeler');
  for (const [n, s] of [['film.mkv', 400], ['arsiv.7z', 180], ['kurulum.msi', 130]]) {
    const p = path.join(docs, n);
    fs.mkdirSync(docs, { recursive: true });
    fs.writeFileSync(p, ''); fs.truncateSync(p, s * MB);
  }
  const dup = crypto.randomBytes(2 * MB);
  for (const p of [path.join(docs, 'foto.jpg'), path.join(docs, 'Yedek', 'foto.jpg')]) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, dup); }
  H.writeFile(path.join(docs, 'Çok uzun klasör adı ile Türkçe karakterler ğüşiöç', 'not.txt'), 1000);
  sb.docs = docs;
  return sb;
}

test('başlangıç: kapat → .desktop güncellenir + geçmiş; "Kapatmayın" öğesinde uyarı (Vazgeç birincil); Geçmiş’ten geri al; symlink hedefi değişmez', async () => {
  test.setTimeout(90000);
  const sb = richSandbox('su');
  const extTarget = path.join(sb.base, 'disarisi', 'paylasilan.desktop');
  const extHash = H.sha1(extTarget);
  const ctx = await H.launchApp({ sandbox: sb, settings: { lang: 'tr', theme: 'light' } });
  try {
    const { win } = ctx;
    const items = await H.api(win, 'getStartupItems');
    H.writeEvidence('startup-items.json', items);
    const by = Object.fromEntries(items.map((i) => [i.name, i]));
    expect(by.Discord).toMatchObject({ enabled: true, source: 'Autostart', known: { advice: 'safe-to-disable' } });
    expect(by.OneDrive.known.advice).toBe('keep');
    expect(by['Garip Araç'].known.advice).toBe('unknown');
    expect(by['Kapalı Uygulama'].enabled).toBe(false);
    // Alt dize eşleşmesiyle yanlış tanıma (bulgu kaydı): TeamSpeak → Teams, Cooperative → Opera
    expect.soft(by['TeamSpeak 3'].known.advice, 'TeamSpeak, Microsoft Teams sanılıyor').toBe('unknown');
    expect.soft(by['Cooperative Notes'].known.advice, '"Cooperative" adı Opera sanılıyor').toBe('unknown');

    await win.keyboard.press('Control+6');
    const sw = win.locator('#su-autostart__discord_desktop');
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    const txt = fs.readFileSync(path.join(sb.autostart, 'discord.desktop'), 'utf8');
    expect(txt).toMatch(/X-GNOME-Autostart-enabled=false/);
    expect(txt).toContain('Exec=/usr/bin/discord --start-minimized');
    // Kapatmayın: uyarı penceresi, ilk odak Vazgeç; Esc → değişmez
    const od = win.locator('#su-autostart__onedrive_desktop');
    await od.click();
    await expect(win.locator('#dlg')).toBeVisible();
    expect(await win.evaluate(() => document.activeElement.id)).toBe('dlg-cancel');
    await win.screenshot({ path: path.join(H.OUT_DIR, 'startup-keep-warning.png') });
    await win.keyboard.press('Escape');
    await expect(od).toHaveAttribute('aria-checked', 'true');
    expect(fs.readFileSync(path.join(sb.autostart, 'onedrive.desktop'), 'utf8')).not.toMatch(/enabled=false/);
    // Symlink'li .desktop
    await win.locator('#su-autostart__slack_desktop').click();
    await expect(win.locator('#su-autostart__slack_desktop')).toHaveAttribute('aria-checked', 'false');
    expect(H.sha1(extTarget), 'bağlantının hedefi değiştirildi').toBe(extHash);
    // Geçmiş → Geri al
    await win.keyboard.press('Control+7');
    const undo = win.locator('[data-action="undo"]');
    await expect(undo).toHaveCount(2);
    const hist = await H.api(win, 'getHistory');
    const discordEntry = hist.find((h) => h.action === 'startup' && /Discord/.test(h.summary.tr));
    await win.locator(`[data-action="undo"][data-id="${discordEntry.id}"]`).click();
    await expect(win.locator('.badge').filter({ hasText: 'Geri alındı' })).toHaveCount(1);
    expect(fs.readFileSync(path.join(sb.autostart, 'discord.desktop'), 'utf8')).toMatch(/X-GNOME-Autostart-enabled=true/);
    expect((await H.api(win, 'undoHistory', discordEntry.id))).toMatchObject({ ok: false, error: 'not-undoable' });
    // IPC kötüye kullanım
    expect(await H.api(win, 'setStartupItemEnabled', 'autostart::../../../disarisi/paylasilan.desktop', false)).toMatchObject({ ok: false });
    expect(await H.api(win, 'setStartupItemEnabled', 'autostart::discord.desktop', 'false')).toMatchObject({ ok: false, error: 'invalid-argument' });
    expect(await H.api(win, 'undoHistory', 'yok')).toMatchObject({ ok: false });
    expect(ctx.consoleErrors).toEqual([]);
  } finally {
    await ctx.close();
  }
});

test('ayarlar: tema (açık/koyu/sistem) anında uygulanır, dil/tema/hariç klasörler yeniden başlatmada korunur; geçersiz hariç yol', async () => {
  test.setTimeout(90000);
  const sb = richSandbox('set');
  let ctx = await H.launchApp({ sandbox: sb, settings: { lang: 'tr', theme: 'light' } });
  try {
    const { win } = ctx;
    await win.keyboard.press('Control+8');
    const bg = () => win.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(await bg()).toBe('rgb(243, 247, 245)');
    await win.locator('input[name="theme"][value="dark"]').check();
    await expect(win.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await bg()).toBe('rgb(12, 20, 18)');
    expect(await ctx.app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark');
    // Hariç klasör ekle (metin kutusu)
    await win.locator('#ex-input').fill(path.join(sb.docs, 'Yedek'));
    await win.locator('#ex-add-btn').click();
    await expect(win.locator('.ex-list li')).toHaveCount(1);
    // Geçersiz (göreli) yol
    await win.locator('#ex-input').fill('goreli/klasor');
    await win.locator('#ex-add-btn').click();
    await win.waitForTimeout(300);
    const st = await win.evaluate(() => ({ list: window.__ferahlaUI.state.settings.excludedPaths, err: (document.querySelector('#ex-err') || {}).textContent || '', toasts: document.querySelector('#toasts').innerText }));
    H.writeEvidence('settings-invalid-excluded.json', st);
    expect(st.list).toHaveLength(1);
    expect.soft(st.err, 'göreli yol için hata mesajı gösterilmeli').not.toBe('');
    expect.soft(st.toasts, 'eklenmeyen yol için "Klasör eklendi" denmemeli').not.toContain('Klasör eklendi');
    await win.locator('input[name="lang"][value="en"]').check();
    await expect(win.locator('html')).toHaveAttribute('lang', 'en');
    await expect(win.locator('#nav-settings')).toContainText('Settings');
  } finally {
    await ctx.close();
  }
  ctx = await H.launchApp({ sandbox: sb });
  try {
    const s = await H.api(ctx.win, 'getSettings');
    expect(s).toEqual({ lang: 'en', theme: 'dark', excludedPaths: [path.join(sb.docs, 'Yedek')] });
    await expect(ctx.win.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(ctx.win.locator('html')).toHaveAttribute('lang', 'en');
    // Hariç klasör kopya aramasında gerçekten atlanıyor
    await H.scanIPC(ctx.win, sb.docs);
    const d = await H.api(ctx.win, 'findDuplicates', { minBytes: 1 });
    expect(d.groups).toHaveLength(0);
    // Bozuk settings.json → varsayılan (Türkçe)
  } finally {
    await ctx.close();
  }
  fs.writeFileSync(path.join(sb.userData, 'settings.json'), '{bozuk');
  ctx = await H.launchApp({ sandbox: sb });
  try {
    expect(await H.api(ctx.win, 'getSettings')).toEqual({ lang: 'tr', theme: 'system', excludedPaths: [] });
  } finally {
    await ctx.close();
  }
});

// ------------------------------------------------------------------ çevrilmemiş metin avı

async function texts(win) {
  return win.evaluate(() => {
    const out = new Set();
    const vis = (el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const s = n.nodeValue.replace(/\s+/g, ' ').trim();
      const el = n.parentElement;
      if (!s || el.closest('script,style,#toasts,#sr-status,.tip')) continue;
      if (vis(el) || el.closest('.sr-only') || el.closest('dialog[open]')) out.add(s);
    }
    document.querySelectorAll('[aria-label],[title],[placeholder]').forEach((el) => {
      if (!vis(el) || el.closest('#toasts')) return;
      for (const a of ['aria-label', 'title', 'placeholder']) { const v = el.getAttribute(a); if (v) out.add(`[${a}] ${v}`); }
    });
    return [...out];
  });
}

async function visitAll(ctx, sb, lang, shots) {
  const { win } = ctx;
  const res = {};
  const grab = async (name) => {
    await win.waitForTimeout(250);
    res[name] = await texts(win);
    if (shots) await win.screenshot({ path: path.join(H.OUT_DIR, `${shots}-${name}.png`) });
  };
  const nav = async (n) => { await win.keyboard.press(`Control+${n}`); await win.waitForTimeout(200); };
  await nav(1); await expect(win.locator('#btn-safe-clean')).toBeEnabled({ timeout: 20000 }); await grab('1-ozet');
  await nav(2); await grab('2-temizlik');
  await win.locator('.btn-disclose').first().click(); await grab('2b-bu-ne');
  await nav(1); await win.locator('#btn-safe-clean').click(); await expect(win.locator('#dlg')).toBeVisible(); await grab('2c-onay');
  await win.keyboard.press('Escape');
  await nav(3);
  if (!(await win.locator('.context').count())) {
    await win.locator('[data-action="scan-drive"]').first().click();
    await expect(win.locator('.context')).toBeVisible({ timeout: 30000 });
  }
  await grab('3-harita');
  await nav(4); await expect(win.locator('.tbl')).toBeVisible({ timeout: 20000 }); await grab('4-buyuk');
  await nav(5);
  if (await win.locator('#dups-find').count()) { await win.locator('#dups-find').click(); }
  await expect(win.locator('.dup-group').first()).toBeVisible({ timeout: 30000 });
  await grab('5-kopya');
  await nav(6); await expect(win.locator('.su-row').first()).toBeVisible(); await grab('6-baslangic');
  await nav(7); await grab('7-gecmis');
  await nav(8); await grab('8-ayarlar');
  return res;
}

test('dil TR ↔ EN: tüm ekranlarda çevrilmemiş metin avı (ham anahtar, EN’de Türkçe, iki dilde aynı kalan)', async () => {
  test.setTimeout(180000);
  const sb = richSandbox('i18n');
  const ctx = await H.launchApp({ sandbox: sb, settings: { lang: 'tr', theme: 'light' }, drives: [{ path: sb.docs, label: 'Belgeler' }] });
  try {
    const { win } = ctx;
    // Geçmişte kayıt olsun
    await win.keyboard.press('Control+6');
    await win.locator('#su-autostart__discord_desktop').click();
    const tr = await visitAll(ctx, sb, 'tr');
    await H.api(win, 'setSettings', { lang: 'en' });
    await win.reload();
    await win.waitForSelector('body.is-ready');
    const en = await visitAll(ctx, sb, 'en');
    const names = ['Belgeler', 'film.mkv', 'arsiv.7z', 'kurulum.msi', 'foto.jpg', 'Yedek', 'Discord', 'OneDrive', 'Garip Araç', 'TeamSpeak', 'Cooperative', 'Kapalı Uygulama', 'Slack', 'Ferahla', 'Türkçe', 'English', 'ğüşiöç', sb.base];
    const isData = (s) => names.some((n) => s.includes(n)) || /^[\d\s.,:%·/()+\-–—×]+$/.test(s) || /^\/|\.desktop|\.(mkv|7z|msi|jpg|txt)\b/.test(s);
    const strip = (s) => s.replace(/^\[[\w-]+\] /, '');
    const ALLOW = /^(Ferahla|Chrome|Firefox|Edge|Brave|Opera|Discord|Steam|Spotify|Teams|Windows|Linux|OK|KB|MB|GB|TB|v[\d.]+|Video|Autostart|Test|\(.*\))$/;
    const rep = { rawKeys: {}, turkishInEN: {}, sameInBoth: {} };
    for (const k of Object.keys(en)) {
      const trs = new Set(tr[k] || []);
      rep.rawKeys[k] = [...(tr[k] || []), ...en[k]].filter((s) => /^(\[[\w-]+\] )?[a-z]+(\.[a-zA-Z0-9_-]+)+$/.test(s) && !isData(s));
      rep.turkishInEN[k] = en[k].filter((s) => /[ğĞüÜşŞıİöÖçÇ]/.test(s) && !isData(s));
      rep.sameInBoth[k] = en[k].filter((s) => trs.has(s) && !isData(s) && !ALLOW.test(strip(s)) && /[A-Za-z]{3,}/.test(s));
    }
    H.writeEvidence('i18n-hunt.json', rep);
    H.writeEvidence('i18n-texts.json', { tr, en });
    const flat = (o) => Object.entries(o).flatMap(([k, v]) => v.map((x) => `${k}: ${x}`));
    expect.soft(flat(rep.rawKeys), 'ham anahtar adları').toEqual([]);
    expect.soft(flat(rep.turkishInEN), 'EN arayüzde Türkçe metin').toEqual([]);
    expect.soft(flat(rep.sameInBoth), 'TR ve EN’de aynı kalan metinler').toEqual([]);
    expect(ctx.consoleErrors).toEqual([]);
  } finally {
    await ctx.close();
  }
});

// ------------------------------------------------------------------ 800×560 + ekran görüntüleri

async function overflowAudit(win) {
  return win.evaluate(() => {
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const issues = [];
    const desc = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')}`.slice(0, 70);
    const vis = (el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
    if (document.documentElement.scrollWidth > vw + 1) issues.push(`sayfa yatay taşıyor ${document.documentElement.scrollWidth}>${vw}`);
    if (document.documentElement.scrollHeight > vh + 1) issues.push(`sayfa dikey taşıyor ${document.documentElement.scrollHeight}>${vh}`);
    for (const el of document.querySelectorAll('body *')) {
      if (!vis(el) || el.closest('.sr-only, #toasts, .tip, dialog:not([open]), svg')) continue;
      // Görsel olarak gizlenmiş (1×1 kırpılmış, ekran okuyucuya kalan) metinler taşma sayılmaz
      let hidden = false;
      for (let x = el; x && x !== document.body; x = x.parentElement) { const q = x.getBoundingClientRect(); if (q.width <= 1 && q.height <= 1) { hidden = true; break; } }
      if (hidden) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      let sc = el.parentElement;
      while (sc && sc !== document.body) { const o = getComputedStyle(sc); if (/(auto|scroll|hidden)/.test(o.overflowX + o.overflowY)) break; sc = sc.parentElement; }
      const clipped = sc && sc !== document.body;
      if (!clipped && (r.right > vw + 1 || r.left < -1)) issues.push(`pencere dışında: ${desc(el)} [${Math.round(r.left)}..${Math.round(r.right)}]`);
      const cs = getComputedStyle(el);
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
      if (hasText && el.scrollWidth > el.clientWidth + 2 && !/(auto|scroll)/.test(cs.overflowX) && cs.textOverflow !== 'ellipsis' && cs.display !== 'inline') {
        issues.push(`metin taşıyor: ${desc(el)} "${el.textContent.trim().slice(0, 40)}" ${el.scrollWidth}>${el.clientWidth}`);
      }
    }
    return [...new Set(issues)];
  });
}

for (const theme of ['light', 'dark']) {
  test(`800×560 (${theme}): tüm ekranlarda taşma yok, ekran görüntüleri, konsol hatası yok`, async () => {
    test.setTimeout(180000);
    const sb = richSandbox('min-' + theme);
    const ctx = await H.launchApp({ sandbox: sb, settings: { lang: 'tr', theme }, drives: [{ path: sb.docs, label: 'Belgeler' }] });
    try {
      const { win, app } = ctx;
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(800, 560));
      await win.waitForTimeout(400);
      expect(await win.evaluate(() => [window.innerWidth, window.innerHeight, window.devicePixelRatio])).toEqual([800, 560, 1]);
      const tx = await visitAll(ctx, sb, 'tr', `min-${theme}`);
      expect(Object.keys(tx)).toHaveLength(10);
      // Taşma denetimi her ekranda
      const issues = {};
      for (let n = 1; n <= 8; n++) {
        await win.keyboard.press(`Control+${n}`);
        await win.waitForTimeout(300);
        issues[n] = await overflowAudit(win);
      }
      // Sonuç ekranı (gerçek temizlik, korumalı alanda)
      await win.keyboard.press('Control+1');
      await win.locator('#btn-safe-clean').click();
      await win.locator('#dlg-ok').click();
      await expect(win.locator('#result-h')).toBeVisible({ timeout: 60000 });
      await win.screenshot({ path: path.join(H.OUT_DIR, `min-${theme}-9-sonuc.png`) });
      issues.sonuc = await overflowAudit(win);
      H.writeEvidence(`overflow-${theme}.json`, issues);
      const all = Object.entries(issues).flatMap(([k, v]) => v.map((x) => `${k}: ${x}`));
      expect.soft(all, 'taşma bulguları').toEqual([]);
      expect(ctx.consoleErrors).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
}
