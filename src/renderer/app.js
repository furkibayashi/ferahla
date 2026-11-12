/*
 * Ferahla — arayüz (vanilla JS, framework yok).
 * Yalnızca window.ferahla sözleşmesini kullanır (docs/SPEC.md). Gerçek preload yoksa mock-api.js devreye girer.
 * İlke: hiçbir şey kullanıcı onaylamadan silinmez; tehlikeli hiçbir şey kendiliğinden seçilmez.
 */
(function () {
  'use strict';

  const api = window.ferahla;
  const I = window.FerahlaI18n;
  const TM = window.FerahlaTreemap;
  const icon = window.FerahlaIcons.icon;
  const t = (k, v, soft) => I.t(k, v, soft);
  const B = (n) => I.fmtBytes(n);

  const ROUTES = ['overview', 'clean', 'map', 'large', 'dups', 'startup', 'history', 'settings'];
  const ROUTE_ICONS = { overview: 'overview', clean: 'clean', map: 'map', large: 'large', dups: 'dups', startup: 'startup', history: 'history', settings: 'settings' };
  const MB = 1024 * 1024, GB = MB * 1024;

  const state = {
    route: 'overview',
    info: { version: '', platform: 'win32', isAdmin: false },
    settings: { lang: 'tr', theme: 'system', excludedPaths: [] },
    showWelcome: false,
    drives: null, drivesError: null,
    categories: null, catError: null, catLoading: false,
    selected: new Set(), openDesc: new Set(), selectionTouched: false,
    clean: { status: 'idle', ids: [], progress: {}, result: null, freeBefore: null },
    scan: { status: 'idle', root: null, scanId: null, progress: null, last: null, error: null, notice: null, startedAt: 0 },
    map: { path: null, items: null, loading: false },
    large: { status: 'idle', items: [], filter: 'all', minBytes: 100 * MB, selected: new Set(), key: null, showProtected: false },
    dups: { status: 'idle', groups: [], wasted: 0, keep: new Map(), selected: new Set(), progress: null, key: null, error: null },
    startup: { items: null, error: null, busy: new Set() },
    history: { items: null, error: null },
    settingsDraft: '',
    settingsError: '',
  };

  // ---------- küçük yardımcılar ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isErr = (r) => !!r && typeof r === 'object' && !Array.isArray(r) && r.ok === false;
  const loc = (o) => (o && typeof o === 'object' ? o[state.settings.lang] || o.tr || o.en || '' : o || '');
  const sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);
  const cssId = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '_');
  async function call(name, ...args) {
    try {
      if (!api || typeof api[name] !== 'function') return { ok: false, error: 'unavailable', message: t('err.unavailable') };
      return await api[name](...args);
    } catch (e) {
      return { ok: false, error: 'exception', message: (e && e.message) || String(e) };
    }
  }
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* önemli değil */ } },
  };
  const sep = (p) => (p && p.includes('\\') ? '\\' : '/');
  const joinPath = (a, b) => (a.endsWith('\\') || a.endsWith('/') ? a + b : a + sep(a) + b);
  const baseName = (p) => { const s = sep(p); const parts = p.split(s).filter(Boolean); return parts[parts.length - 1] || p; };
  const dirName = (p) => { const s = sep(p); const i = p.replace(/[\\/]+$/, '').lastIndexOf(s); return i > 0 ? p.slice(0, i + (p.slice(0, i).endsWith(':') ? 1 : 0)) : p; };
  function midTrunc(s, max) {
    if (!s || s.length <= max) return s;
    const head = Math.ceil(max * 0.4), tail = max - head - 1;
    return s.slice(0, head) + '…' + s.slice(s.length - tail);
  }
  /** Kök yolun kısa adı: "C:\\" → "C:", "/" → "/", uzun klasör yolu → son klasör adı. */
  const rootLabel = (p) => {
    const trimmed = String(p || '').replace(/[\\/]+$/, '');
    if (!trimmed) return p || '/';
    if (/^[a-z]:$/i.test(trimmed)) return trimmed;
    return baseName(trimmed);
  };
  const driveName = (d) => {
    const letter = rootLabel(d.path);
    return d.label ? `${d.label} (${letter})` : `${t('drive.local')} (${letter})`;
  };

  /** Kullanıcı dosyası olmayan, dokunulmaması gereken yollar (kendi koruma katmanımız; ana süreç zaten engeller). */
  function protectedReason(path, item) {
    if (item && item.protected) return 'system';
    const p = String(path || '');
    if (/(^|\\)(pagefile|hiberfil|swapfile)\.sys$/i.test(p) || /^[a-z]:\\(windows|program files( \(x86\))?|programdata|\$recycle\.bin|system volume information)(\\|$)/i.test(p)) return 'system';
    if (/\\(steamapps|epic games|riot games|origin games|ea games|ubisoft game launcher)\\/i.test(p)) return 'program';
    if (/^\/(usr|bin|sbin|lib|lib64|etc|boot|proc|sys|dev|opt)(\/|$)/.test(p)) return 'system';
    return null;
  }

  function categoryGroup(c) {
    const id = String(c.id).toLowerCase();
    if (/chrome|edge|brave|opera|firefox|browser/.test(id)) return 'browsers';
    if (/discord|teams|spotify|steam|app-|apps?$/.test(id)) return 'apps';
    return 'system';
  }
  const isRecycle = (c) => /recycle|trash|bin$/i.test(String(c.id));
  function catBlock(c) {
    if (!c.available) return 'unavailable';
    if (c.requiresAdmin && !state.info.isAdmin) return 'admin';
    if (c.warning && loc(c.warning)) return 'warning';
    if (!(c.sizeBytes > 0)) return 'empty';
    return null;
  }
  const isRecommended = (c) => (typeof c.recommended === 'boolean' ? c.recommended : !isRecycle(c));
  const recommendedCats = () => (state.categories || []).filter((c) => !catBlock(c) && isRecommended(c));

  function announce(msg) {
    const el = $('#sr-status');
    el.textContent = '';
    setTimeout(() => { el.textContent = msg; }, 30);
  }

  // ---------- tema & dil ----------
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  function resolvedTheme() {
    const th = state.settings.theme;
    return th === 'light' || th === 'dark' ? th : (mql.matches ? 'dark' : 'light');
  }
  function applyTheme() {
    const th = state.settings.theme;
    if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th;
    else delete document.documentElement.dataset.theme;
  }
  function applyLang() {
    I.setLang(state.settings.lang === 'en' ? 'en' : 'tr');
    document.documentElement.lang = I.lang;
    document.title = 'Ferahla';
    $('#skip-link').textContent = t('a11y.skip');
    $('#brand-tag').textContent = t('brand.tag');
    $('#privacy-note').innerHTML = icon('shield') + '<span>' + esc(t('brand.privacy')) + '</span>';
    $('#nav').setAttribute('aria-label', t('a11y.nav'));
  }
  mql.addEventListener('change', () => { if (state.settings.theme === 'system' && state.route === 'map') render(); });

  // ---------- render altyapısı ----------
  const view = () => $('#view');
  function render(opts = {}) {
    renderNav();
    const v = view();
    const main = $('#main');
    const active = document.activeElement;
    const key = active && v.contains(active) ? active.id || active.dataset.fk : null;
    const scroll = main.scrollTop;
    const html = SCREENS[state.route]();
    v.innerHTML = html;
    v.dataset.route = state.route;
    if (state.route === 'map') drawTreemap();
    if (opts.focusHeading) {
      const h = v.querySelector('h1');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
      main.scrollTop = 0;
    } else {
      main.scrollTop = scroll;
      if (key) {
        const el = document.getElementById(key) || v.querySelector(`[data-fk="${CSS.escape(key)}"]`);
        if (el) el.focus({ preventScroll: true });
      }
    }
  }
  const rerenderIf = (...routes) => { if (routes.includes(state.route)) render(); };

  function renderNav() {
    const nav = $('#nav-list');
    const pending = (r) => {
      if (r === 'map' && state.scan.status === 'running') return `<span class="nav-dot" aria-hidden="true"></span><span class="sr-only">${esc(t('nav.scanning'))}</span>`;
      if (r === 'clean' && state.clean.status === 'running') return `<span class="nav-dot" aria-hidden="true"></span>`;
      return '';
    };
    nav.innerHTML = ROUTES.map((r) => `
      <li><button type="button" class="nav-item" data-route="${r}" id="nav-${r}" ${state.route === r ? 'aria-current="page"' : ''} title="${esc(t('nav.' + r))}">
        ${icon(ROUTE_ICONS[r])}<span class="nav-label">${esc(t('nav.' + r))}</span>${pending(r)}
      </button></li>`).join('');
  }

  function go(route, opts = {}) {
    if (!ROUTES.includes(route)) return;
    state.route = route;
    hideTip();
    try { history.replaceState(null, '', '#' + route); } catch (_) { /* file:// */ }
    onEnter(route);
    render({ focusHeading: opts.focus !== false });
  }
  function onEnter(route) {
    if (route === 'large') maybeLoadLarge();
    if (route === 'history') loadHistory();
    if (route === 'startup' && !state.startup.items) loadStartup();
    if (route === 'clean' && !state.categories && !state.catLoading) loadCategories();
  }

  // ---------- ortak parçalar ----------
  function head(titleKey, leadKey, extra = '') {
    return `<header class="screen-head"><div><h1>${esc(t(titleKey))}</h1>${leadKey ? `<p class="lead">${esc(t(leadKey))}</p>` : ''}</div>${extra}</header>`;
  }
  function errorCard(msg, action, actionLabel) {
    return `<div class="card note note-error" role="alert">${icon('alert')}<div><p class="note-title">${esc(t('err.title'))}</p><p>${esc(msg || t('err.generic'))}</p>
      ${action ? `<button type="button" class="btn btn-secondary btn-sm" data-action="${action}">${icon('refresh')}${esc(actionLabel || t('common.retry'))}</button>` : ''}</div></div>`;
  }
  function emptyState({ art = 'breeze', title, text, actions = '' }) {
    return `<div class="empty">${illustration(art)}<h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}${actions ? `<div class="empty-actions">${actions}</div>` : ''}</div>`;
  }
  function illustration(kind) {
    if (kind === 'map') {
      return `<svg class="art" viewBox="0 0 160 110" aria-hidden="true"><rect x="10" y="12" width="140" height="86" rx="12" class="art-bg"/>
        <rect x="20" y="22" width="62" height="66" rx="6" class="art-a"/><rect x="86" y="22" width="54" height="34" rx="6" class="art-b"/>
        <rect x="86" y="60" width="26" height="28" rx="5" class="art-c"/><rect x="116" y="60" width="24" height="28" rx="5" class="art-d"/></svg>`;
    }
    if (kind === 'done') {
      return `<svg class="art art-done" viewBox="0 0 160 110" aria-hidden="true"><circle cx="80" cy="55" r="40" class="art-bg"/>
        <path d="M62 56l12 12 24-26" class="art-check"/><path d="M14 40h26a8 8 0 1 0-8-8" class="art-wind"/><path d="M120 76h26a8 8 0 1 1-8 8" class="art-wind"/><path d="M128 30h22" class="art-wind"/></svg>`;
    }
    return `<svg class="art" viewBox="0 0 160 110" aria-hidden="true"><circle cx="80" cy="55" r="40" class="art-bg"/>
      <path d="M40 46h58a12 12 0 1 0-12-12" class="art-wind"/><path d="M40 62h72a12 12 0 1 1-12 12" class="art-wind"/><path d="M52 78h24" class="art-wind"/></svg>`;
  }
  function badge(kind, text, ic) {
    return `<span class="badge badge-${kind}">${ic ? icon(ic) : ''}${esc(text)}</span>`;
  }
  function bytesBig(n) {
    const p = I.fmtBytesParts(n);
    return `<span class="num-big">${esc(p.num)}<span class="unit">${esc(p.unit)}</span></span>`;
  }
  function meter(pct, label) {
    const v = Math.max(0, Math.min(100, Math.round(pct)));
    return `<div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}" aria-label="${esc(label || '')}"><div class="meter-fill" style="width:${v}%"></div></div>`;
  }
  function driveLevel(d) {
    const used = 1 - d.freeBytes / d.totalBytes;
    if (used >= 0.9 || d.freeBytes < 10 * GB) return 'crit';
    if (used >= 0.8) return 'warn';
    return 'ok';
  }
  function scanContext() {
    const l = state.scan.last;
    if (!l) return '';
    return `<p class="context">${icon('drive')}${esc(t('scan.context', { root: rootLabel(l.root), ago: I.fmtRelative(l.at) }))}</p>`;
  }

  // ======================================================================
  // ÖZET
  // ======================================================================
  function vOverview() {
    let html = head('overview.title', 'overview.lead');
    if (state.showWelcome) {
      html += `<section class="card welcome" aria-labelledby="welcome-h">
        <div class="welcome-art">${icon('leaf')}</div>
        <div><h2 id="welcome-h">${esc(t('welcome.title'))}</h2><p>${esc(t('welcome.text'))}</p>
        <ul class="ticks"><li>${icon('check')}${esc(t('welcome.p1'))}</li><li>${icon('check')}${esc(t('welcome.p2'))}</li><li>${icon('check')}${esc(t('welcome.p3'))}</li></ul>
        <button type="button" class="btn btn-secondary btn-sm" data-action="welcome-ok" id="welcome-ok">${esc(t('welcome.ok'))}</button></div></section>`;
    }

    // Güvenli temizlik kartı
    if (state.catError) {
      html += errorCard(state.catError, 'reload-cats');
    } else if (!state.categories) {
      html += `<section class="card hero is-loading" aria-busy="true"><div class="hero-text"><p class="eyebrow">${esc(t('overview.reclaimable'))}</p>
        <div class="skel skel-num"></div><div class="skel skel-line"></div><p class="sr-only" role="status">${esc(t('overview.measuring'))}</p></div>
        <div class="hero-actions"><button type="button" class="btn btn-primary btn-lg" disabled>${icon('clean')}${esc(t('overview.safeClean'))}</button></div>${breeze()}</section>`;
    } else {
      const rec = recommendedCats();
      const total = sum(rec, (c) => c.sizeBytes);
      const waiting = state.categories.filter((c) => ['admin', 'warning'].includes(catBlock(c)) && c.sizeBytes > 0);
      const nothing = total < 5 * MB;
      html += `<section class="card hero" aria-labelledby="hero-h">
        <div class="hero-text">
          <p class="eyebrow" id="hero-h">${esc(t('overview.reclaimable'))}</p>
          ${nothing ? `<p class="hero-calm">${esc(t('overview.nothing'))}</p>` : `<p class="hero-num">${bytesBig(total)}</p>`}
          <p class="hero-sub">${esc(nothing ? t('overview.nothingSub') : t('overview.heroSub', { n: rec.length }))}</p>
        </div>
        <div class="hero-actions">
          <button type="button" class="btn btn-primary btn-lg" data-action="safe-clean" id="btn-safe-clean" ${nothing ? 'disabled' : ''}>${icon('clean')}${esc(t('overview.safeClean'))}</button>
          <button type="button" class="btn btn-quiet" data-action="go" data-route="clean" id="btn-see-details">${esc(t('overview.seeDetails'))}${icon('arrowRight')}</button>
        </div>
        ${breeze()}
      </section>`;
      if (waiting.length) {
        html += `<p class="hint">${icon('info')}<span>${esc(t('overview.waiting', { list: waiting.map((c) => loc(c.name)).join(', ') }))}</span></p>`;
      }
    }

    // Sürücüler
    html += `<section class="section" aria-labelledby="drives-h"><h2 class="section-title" id="drives-h">${esc(t('overview.drives'))}</h2>`;
    if (state.drivesError) html += errorCard(state.drivesError, 'reload-drives');
    else if (!state.drives) html += `<div class="drive-grid">${'<div class="card drive is-loading"><div class="skel skel-line"></div><div class="skel skel-num"></div><div class="skel skel-bar"></div></div>'.repeat(2)}</div>`;
    else html += `<div class="drive-grid">${state.drives.map(driveCard).join('')}</div>`;
    html += '</section>';

    // Diğer fırsatlar
    const su = state.startup.items;
    const suOn = su ? su.filter((s) => s.enabled).length : null;
    const suSafe = su ? su.filter((s) => s.enabled && s.known && s.known.advice === 'safe-to-disable').length : 0;
    html += `<section class="section" aria-labelledby="more-h"><h2 class="section-title" id="more-h">${esc(t('overview.more'))}</h2><div class="tiles">
      ${tile('map', 'map', t('overview.tileMap'), t('overview.tileMapSub'))}
      ${tile('large', 'large', t('overview.tileLarge'), t('overview.tileLargeSub'))}
      ${tile('startup', 'startup', t('overview.tileStartup'), suOn == null ? t('overview.tileStartupSub0') : t('overview.tileStartupSub', { n: suOn, m: suSafe }))}
    </div></section>`;
    return html;
  }
  function breeze() {
    return `<svg class="hero-breeze" viewBox="0 0 800 200" aria-hidden="true" preserveAspectRatio="none">
      <path d="M0 150 C 160 118, 280 178, 440 136 S 690 96, 800 124"/>
      <path d="M0 176 C 190 150, 320 198, 480 162 S 710 128, 800 152"/>
      <path d="M0 122 C 130 100, 250 146, 400 112 S 650 72, 800 98"/>
      <path d="M300 60 C 420 40, 520 80, 640 52 S 760 30, 800 40"/></svg>`;
  }
  function tile(route, ic, title, sub) {
    return `<button type="button" class="card tile" data-action="go" data-route="${route}" id="tile-${route}">
      <span class="tile-ic">${icon(ic)}</span>${icon('arrowRight', 'tile-chev')}<span class="tile-title">${esc(title)}</span><span class="tile-sub">${esc(sub)}</span></button>`;
  }
  function driveCard(d) {
    const used = d.totalBytes - d.freeBytes;
    const pct = d.totalBytes ? (used / d.totalBytes) * 100 : 0;
    const lvl = driveLevel(d);
    const lvlText = t('drive.level.' + lvl);
    return `<article class="card drive drive-${lvl}" aria-labelledby="dr-${cssId(d.path)}">
      <header class="drive-head"><span class="drive-ic">${icon('drive')}</span><h3 id="dr-${cssId(d.path)}">${esc(driveName(d))}</h3>${badge(lvl === 'ok' ? 'ok' : lvl === 'warn' ? 'warn' : 'crit', lvlText)}</header>
      <p class="drive-free">${bytesBig(d.freeBytes)}<span class="drive-free-label">${esc(t('drive.free'))}</span></p>
      <div class="bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="${esc(t('drive.usedAria', { pct: I.fmtPct(pct / 100) }))}"><div class="bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
      <p class="drive-meta">${esc(t('drive.meta', { used: B(used), total: B(d.totalBytes), pct: I.fmtPct(pct / 100) }))}</p>
      <button type="button" class="btn btn-quiet btn-sm" data-action="scan-drive" data-root="${esc(d.path)}" id="scan-${cssId(d.path)}">${icon('map')}${esc(t('drive.inspect'))}</button>
    </article>`;
  }

  // ======================================================================
  // TEMİZLİK
  // ======================================================================
  function vClean() {
    const c = state.clean;
    if (c.status === 'running') return vCleaning();
    if (c.status === 'done') return vCleanResult();
    let html = head('clean.title', 'clean.lead');
    if (state.catError) return html + errorCard(state.catError, 'reload-cats');
    if (!state.categories) {
      return html + `<div class="card" aria-busy="true"><p role="status" class="muted">${esc(t('clean.measuring'))}</p>${'<div class="skel skel-row"></div>'.repeat(5)}</div>`;
    }
    const cats = state.categories;
    const avail = cats.filter((x) => x.available);
    const missing = cats.filter((x) => !x.available);
    if (!avail.some((x) => x.sizeBytes > 0)) {
      return html + emptyState({ art: 'done', title: t('clean.emptyTitle'), text: t('clean.emptyText'),
        actions: `<button type="button" class="btn btn-secondary" data-action="reload-cats">${icon('refresh')}${esc(t('clean.recheck'))}</button>` });
    }
    html += `<div class="toolbar">
      <button type="button" class="btn btn-quiet btn-sm" data-action="cats-recommended" id="cats-rec">${icon('check')}${esc(t('clean.selectRecommended'))}</button>
      <button type="button" class="btn btn-quiet btn-sm" data-action="cats-none" id="cats-none">${esc(t('clean.selectNone'))}</button>
      <span class="spacer"></span>
      <button type="button" class="btn btn-quiet btn-sm" data-action="reload-cats" id="cats-reload">${icon('refresh')}${esc(t('clean.recheck'))}</button>
    </div>`;
    if (!state.info.isAdmin && avail.some((x) => x.requiresAdmin && x.sizeBytes > 0)) {
      html += `<div class="note note-info">${icon('shield')}<div><p class="note-title">${esc(t('clean.adminTitle'))}</p><p>${esc(t('clean.adminText'))}</p>
        ${typeof api.relaunchAsAdmin === 'function' && state.info.platform === 'win32' ? `<button type="button" class="btn btn-secondary btn-sm" data-action="relaunch-admin">${esc(t('clean.relaunchAdmin'))}</button>` : ''}</div></div>`;
    }
    for (const g of ['system', 'browsers', 'apps']) {
      const list = avail.filter((x) => categoryGroup(x) === g);
      if (!list.length) continue;
      html += `<section class="cat-group" aria-labelledby="cg-${g}"><h2 class="section-title" id="cg-${g}">${esc(t('clean.group.' + g))}</h2><ul class="card cat-list">${list.map(catRow).join('')}</ul></section>`;
    }
    if (missing.length) html += `<p class="hint">${icon('info')}<span>${esc(t('clean.notInstalled', { list: missing.map((x) => loc(x.name)).join(', ') }))}</span></p>`;
    const sel = cats.filter((x) => state.selected.has(x.id) && !catBlock(x));
    const selBytes = sum(sel, (x) => x.sizeBytes);
    html += `<div class="actionbar" role="region" aria-label="${esc(t('clean.selection'))}">
      <p class="actionbar-text" aria-live="polite">${sel.length ? esc(t('clean.selected', { n: sel.length, size: B(selBytes) })) : esc(t('clean.selectedNone'))}</p>
      <button type="button" class="btn btn-primary" data-action="clean-selected" id="btn-clean" ${sel.length ? '' : 'disabled'}>${icon('clean')}${esc(t('clean.go'))}</button>
    </div>`;
    return html;
  }
  function catRow(c) {
    const block = catBlock(c);
    const id = 'cat-' + cssId(c.id);
    const disabled = !!block;
    const checked = !disabled && state.selected.has(c.id);
    const open = state.openDesc.has(c.id);
    const badges = [];
    if (c.requiresAdmin) badges.push(badge(state.info.isAdmin ? 'neutral' : 'admin', t('clean.badgeAdmin'), 'shield'));
    if (isRecycle(c)) badges.push(badge('warn', t('clean.badgeNoUndo')));
    let note = '';
    if (block === 'admin' && c.sizeBytes > 0) note = `<p class="cat-note" id="${id}-note">${icon('lock')}<span>${esc(t('clean.adminReason'))}</span></p>`;
    if (block === 'warning') note = `<p class="cat-note cat-note-warn" id="${id}-note">${icon('alert')}<span>${esc(loc(c.warning))}</span>
      <button type="button" class="btn btn-quiet btn-sm" data-action="reload-cats" data-fk="recheck-${id}">${icon('refresh')}${esc(t('clean.recheck'))}</button></p>`;
    return `<li class="cat${disabled ? ' is-disabled' : ''}">
      <div class="cat-main">
        <input type="checkbox" class="check" id="${id}" data-change="cat-toggle" data-id="${esc(c.id)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} ${note ? `aria-describedby="${id}-note"` : ''}>
        <label for="${id}" class="cat-name">${esc(loc(c.name))}</label>
        <span class="cat-badges">${badges.join('')}</span>
        <span class="cat-size">${!(c.sizeBytes > 0) ? `<span class="muted">${esc(t('clean.empty'))}</span>` : esc(B(c.sizeBytes))}${c.itemCount > 0 ? `<small>${esc(t('common.items', { n: I.fmtNum(c.itemCount) }))}</small>` : ''}</span>
        <button type="button" class="btn-disclose" data-action="cat-desc" data-id="${esc(c.id)}" id="${id}-q" aria-expanded="${open}" aria-controls="${id}-desc">${icon('help')}<span>${esc(t('clean.whatIsThis'))}</span></button>
      </div>
      ${note}
      <div class="cat-desc" id="${id}-desc" ${open ? '' : 'hidden'}><p>${esc(loc(c.description))}</p></div>
    </li>`;
  }
  function vCleaning() {
    const c = state.clean;
    const cats = c.ids.map((id) => (state.categories || []).find((x) => x.id === id)).filter(Boolean);
    return `<header class="screen-head"><div><h1>${esc(t('cleaning.title'))}</h1><p class="lead">${esc(t('cleaning.lead'))}</p></div></header>
      <section class="card progress-card" aria-busy="true"><ul class="prog-list">${cats.map((x) => {
        const p = c.progress[x.id] || 0;
        return `<li id="prog-${cssId(x.id)}"><span class="prog-name">${esc(loc(x.name))}</span>${meter(p, loc(x.name))}<span class="prog-state">${p >= 100 ? icon('check') : esc(I.fmtPct(p / 100))}</span></li>`;
      }).join('')}</ul></section>`;
  }
  function vCleanResult() {
    const r = state.clean.result || {};
    const freed = r.freedBytes || 0;
    const parts = I.fmtBytesParts(freed);
    const cDrive = (state.drives || []).find((d) => /^c:/i.test(d.path)) || (state.drives || [])[0];
    let html = `<section class="result" aria-labelledby="result-h">${illustration('done')}
      <h1 id="result-h" tabindex="-1">${freed > 0 ? t('result.title', { num: `<span class="result-num">${esc(parts.num)}<span class="unit">${esc(parts.unit)}</span></span>` }) : esc(t('result.titleNone'))}</h1>
      ${cDrive ? `<p class="lead">${esc(t('result.driveNow', { drive: driveName(cDrive), free: B(cDrive.freeBytes) }))}</p>` : ''}`;
    const rows = (r.results || []).map((x) => {
      const c = (state.categories || []).find((k) => k.id === x.id);
      const name = c ? loc(c.name) : x.id;
      const err = x.error ? t('result.err.' + x.error, {}, true) || x.message || t('result.errGeneric') : '';
      return `<li><span>${esc(name)}</span><span class="${x.error ? 'muted' : 'num'}">${x.error ? esc(err) : esc(B(x.freedBytes || 0))}</span></li>`;
    }).join('');
    if (rows) html += `<ul class="card result-list">${rows}</ul>`;
    // skippedInUse = kilitli/meşgul dosyalar; skippedNoAccess = izin yok (eski ana süreçte alan yoksa 0 sayılır).
    const inUse = Number(r.skippedInUse) || 0;
    const noAccess = Number(r.skippedNoAccess) || 0;
    if (inUse > 0) html += `<p class="hint">${icon('info')}<span>${esc(t('result.inUse', { n: I.fmtNum(inUse) }))}</span></p>`;
    if (noAccess > 0) html += `<p class="hint">${icon('lock')}<span>${esc(t(state.info.isAdmin ? 'result.noAccessAdmin' : 'result.noAccess', { n: I.fmtNum(noAccess) }))}</span></p>`;
    if (r.error) html += errorCard(r.message || r.error);
    html += `<div class="result-actions"><button type="button" class="btn btn-primary" data-action="result-done" id="result-done">${esc(t('result.back'))}</button>
      <button type="button" class="btn btn-secondary" data-action="go" data-route="history" id="result-history">${icon('history')}${esc(t('result.history'))}</button></div></section>`;
    return html;
  }

  // ======================================================================
  // DİSK HARİTASI
  // ======================================================================
  function vMap() {
    const s = state.scan;
    const drives = state.drives || [];
    const chooser = `<div class="map-controls" role="group" aria-label="${esc(t('map.chooseDrive'))}">
      ${drives.map((d) => `<button type="button" class="seg${s.last && s.last.root === d.path ? ' is-on' : ''}" data-action="scan-drive" data-root="${esc(d.path)}" id="seg-${cssId(d.path)}" ${s.status === 'running' ? 'disabled' : ''}
        aria-label="${esc(t(s.last && s.last.root === d.path ? 'map.rescanAria' : 'map.scanAria', { drive: driveName(d) }))}">${icon('drive')}<span>${esc(rootLabel(d.path))}</span>${s.last && s.last.root === d.path ? `<span class="seg-sub">${esc(t('map.rescan'))}</span>` : ''}</button>`).join('')}
    </div>`;
    let html = head('map.title', 'map.lead', drives.length ? chooser : '');

    if (s.status === 'running') {
      const p = s.progress || { files: 0, bytes: 0, currentPath: s.root };
      return html + `<section class="card scan-live" aria-labelledby="scan-h">
        <div class="scan-top"><div class="pulse" aria-hidden="true"></div><h2 id="scan-h">${esc(t('scan.running', { root: rootLabel(s.root || '') }))}</h2>
        <button type="button" class="btn btn-secondary" data-action="scan-cancel" id="scan-cancel">${icon('stop')}${esc(t('scan.cancel'))}</button></div>
        <div class="indeterminate" role="progressbar" aria-label="${esc(t('scan.running', { root: s.root || '' }))}"><div></div></div>
        <dl class="scan-stats">
          <div><dt>${esc(t('scan.files'))}</dt><dd id="sc-files">${esc(I.fmtNum(p.files || 0))}</dd></div>
          <div><dt>${esc(t('scan.size'))}</dt><dd id="sc-bytes">${esc(B(p.bytes || 0))}</dd></div>
          <div><dt>${esc(t('scan.elapsed'))}</dt><dd id="sc-time">${esc(I.fmtDuration(Date.now() - s.startedAt))}</dd></div>
        </dl>
        <p class="scan-path"><span class="muted">${esc(t('scan.now'))}</span> <span id="sc-path" class="path">${esc(midTrunc(p.currentPath || '', 90))}</span></p>
        <p class="hint">${icon('shield')}<span>${esc(t('scan.readOnly'))}</span></p>
      </section>`;
    }
    if (s.status === 'error') {
      html += errorCard(t('scan.error', { msg: s.error || '' }), 'scan-retry', t('scan.retry'));
    }
    if (s.notice === 'cancelled') html += `<p class="hint" role="status">${icon('info')}<span>${esc(t('scan.cancelled'))}</span></p>`;
    if (!s.last) {
      if (s.status !== 'error') {
        html += emptyState({ art: 'map', title: t('map.emptyTitle'), text: t('map.emptyText'),
          actions: drives.map((d, i) => `<button type="button" class="btn ${i === 0 ? 'btn-primary' : 'btn-secondary'}" data-action="scan-drive" data-root="${esc(d.path)}" id="empty-scan-${cssId(d.path)}">${icon('search')}${esc(t('map.scanDrive', { drive: driveName(d) }))}</button>`).join('') });
      }
      return html;
    }
    const l = s.last;
    html += `<p class="context">${icon('check')}<span>${esc(t('scan.summary', { root: rootLabel(l.root), files: I.fmtNum(l.files), size: B(l.totalBytes), dur: I.fmtDuration(l.durationMs) }))}${l.skipped ? ' ' + esc(t('scan.skipped', { n: I.fmtNum(l.skipped) })) : ''}</span></p>`;

    // ekmek kırıntısı
    const crumbs = buildCrumbs(l.root, state.map.path || l.root);
    html += `<div class="crumbbar"><nav aria-label="${esc(t('map.location'))}"><ol class="crumbs">${crumbs.map((c, i) => `<li>${i === crumbs.length - 1
      ? `<span aria-current="location">${esc(c.name)}</span>`
      : `<button type="button" class="crumb" data-action="map-open" data-path="${esc(c.path)}" data-fk="crumb-${i}">${esc(c.name)}</button>${icon('chevronRight', 'crumb-sep')}`}</li>`).join('')}</ol></nav>
      <span class="spacer"></span>
      ${crumbs.length > 1 ? `<button type="button" class="btn btn-quiet btn-sm" data-action="map-up" id="map-up">${icon('arrowUp')}${esc(t('map.up'))}</button>` : ''}
      <button type="button" class="btn btn-quiet btn-sm" data-action="reveal" data-path="${esc(state.map.path || l.root)}" id="map-reveal">${icon('reveal')}${esc(t('common.reveal'))}</button></div>`;

    const items = state.map.items;
    const total = items ? sum(items, (x) => x.sizeBytes) : 0;
    html += `<div class="map-wrap">
      <div class="map-left"><div class="tm" id="tm" ${state.map.loading ? 'aria-busy="true"' : ''}></div>
        <div class="legend" aria-hidden="true"><span>${esc(t('map.small'))}</span><span class="legend-ramp"></span><span>${esc(t('map.big'))}</span><span class="legend-tip">${esc(t(resolvedTheme() === 'dark' ? 'map.legendTipDark' : 'map.legendTip'))}</span></div></div>
      <section class="map-list card" aria-labelledby="ml-h"><h2 id="ml-h" class="ml-head">${esc(t('map.contents'))}<span class="muted">${items ? esc(B(total)) : ''}</span></h2>
        ${!items ? `<p class="muted pad">${esc(t('common.loading'))}</p>` : items.length === 0 ? `<p class="muted pad">${esc(t('map.emptyFolder'))}</p>` : `<ul class="ml" id="ml">${listRows(items, total)}</ul>`}
      </section></div>`;
    return html;
  }
  function listRows(items, total) {
    const MAX = 200;
    const shown = items.slice(0, MAX);
    let html = shown.map((it, i) => {
      const share = total ? it.sizeBytes / total : 0;
      const prot = protectedReason(it.path, it);
      const meta = (it.isDir ? t('common.files', { n: I.fmtNum(it.fileCount || 0) }) + ' · ' : '') + I.fmtPct(share);
      const inner = `${icon(it.isDir ? 'folder' : 'file', 'ml-ic')}<span class="ml-name">${esc(it.name)}${prot === 'system' ? `<span class="tag">${esc(t('map.systemTag'))}</span>` : ''}</span>
        <span class="ml-meta">${esc(meta)}</span><span class="ml-bar" aria-hidden="true"><i style="width:${Math.max(1, share * 100).toFixed(1)}%"></i></span>`;
      return `<li class="ml-row" data-path="${esc(it.path)}">
        ${it.isDir ? `<button type="button" class="ml-main" data-action="map-open" data-path="${esc(it.path)}" data-fk="ml-${i}" aria-label="${esc(t('map.openAria', { name: it.name, size: B(it.sizeBytes) }))}">${inner}</button>` : `<div class="ml-main">${inner}</div>`}
        <span class="ml-size">${esc(B(it.sizeBytes))}</span>
        <button type="button" class="btn-icon" data-action="reveal" data-path="${esc(it.path)}" data-fk="mlr-${i}" aria-label="${esc(t('common.revealAria', { name: it.name }))}" title="${esc(t('common.reveal'))}">${icon('reveal')}</button>
      </li>`;
    }).join('');
    if (items.length > MAX) html += `<li class="ml-more muted">${esc(t('map.more', { n: I.fmtNum(items.length - MAX) }))}</li>`;
    return html;
  }
  function buildCrumbs(root, path) {
    const s = sep(root);
    const rootName = rootLabel(root);
    const out = [{ name: rootName, path: root }];
    if (!path || path === root) return out;
    const rest = path.slice(root.length).split(s).filter(Boolean);
    let cur = root;
    for (const part of rest) { cur = joinPath(cur, part); out.push({ name: part, path: cur }); }
    return out;
  }
  const kidsCache = new Map();
  async function getKids(p) {
    if (kidsCache.has(p)) return kidsCache.get(p);
    const r = await call('getChildren', p);
    const arr = Array.isArray(r) ? r.slice().sort((a, b) => b.sizeBytes - a.sizeBytes) : [];
    kidsCache.set(p, arr);
    return arr;
  }
  async function openMapPath(path, focusList) {
    state.map.path = path;
    state.map.loading = true;
    hideTip();
    const kids = await getKids(path);
    const dirs = kids.filter((k) => k.isDir).slice(0, 16);
    await Promise.all(dirs.map(async (k) => {
      k.children = await getKids(k.path);
      // Tek alt klasörden oluşan zincirleri (ör. Users → Elif) bir kat daha aç ki önizleme anlamlı olsun.
      let guard = 0;
      while (k.children.length && k.children[0].isDir && k.children[0].sizeBytes >= 0.85 * k.sizeBytes && guard++ < 3) {
        k.via = (k.via ? k.via + ' › ' : '') + k.children[0].name;
        k.children = await getKids(k.children[0].path);
      }
    }));
    if (state.map.path !== path) return;
    state.map.items = kids;
    state.map.loading = false;
    if (state.route === 'map') {
      render();
      announce(t('map.opened', { name: baseName(path), n: kids.length }));
      if (focusList) { const f = $('#ml .ml-main[data-action], #ml .btn-icon'); if (f) f.focus(); }
    }
  }
  let tmObserver = null;
  function drawTreemap() {
    const el = $('#tm');
    if (!el || !state.map.items) return;
    const items = state.map.items;
    const total = sum(items, (x) => x.sizeBytes);
    TM.render(el, {
      items, total, theme: resolvedTheme(),
      fmtSize: B,
      othersLabel: (n) => t('map.others', { n: I.fmtNum(n) }),
      ariaLabel: t('map.tmAria', { name: baseName(state.map.path || '') }),
      onHover: (n, e) => (n ? showTip(n, e, total) : hideTip()),
      onClick: (n) => {
        if (n.isOther) return;
        const target = n.isDir ? n : n.parentItem;
        if (target && target.isDir) openMapPath(target.path);
      },
    });
    if (tmObserver) tmObserver.disconnect();
    let lastW = el.clientWidth, lastH = el.clientHeight;
    tmObserver = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - lastW) > 2 || Math.abs(el.clientHeight - lastH) > 2) {
        lastW = el.clientWidth; lastH = el.clientHeight;
        if (document.body.contains(el)) drawTreemap();
      }
    });
    tmObserver.observe(el);
  }
  function showTip(n, e, total) {
    const tip = $('#tip');
    const share = total ? n.sizeBytes / total : 0;
    const kind = n.isOther ? '' : n.isDir ? t('map.folder') + ' · ' + t('common.files', { n: I.fmtNum(n.fileCount || 0) }) : t('map.file');
    tip.innerHTML = `<strong>${esc(n.name)}</strong>${n.path ? `<span class="tip-path">${esc(midTrunc(n.path, 80))}</span>` : ''}
      <span class="tip-row"><b>${esc(B(n.sizeBytes))}</b> · ${esc(I.fmtPct(share))}${kind ? ' · ' + esc(kind) : ''}</span>
      ${n.isDir && !n.isOther ? `<span class="tip-hint">${esc(t('map.clickToOpen'))}</span>` : ''}`;
    tip.hidden = false;
    const pad = 14;
    const r = tip.getBoundingClientRect();
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - pad;
    tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
    // listede eşleşen satırı vurgula
    const row = n.path && document.querySelector(`.ml-row[data-path="${CSS.escape(n.parentItem ? n.parentItem.path : n.path)}"]`);
    document.querySelectorAll('.ml-row.is-hl').forEach((x2) => x2 !== row && x2.classList.remove('is-hl'));
    if (row) row.classList.add('is-hl');
  }
  function hideTip() {
    const tip = $('#tip');
    if (tip) tip.hidden = true;
    document.querySelectorAll('.ml-row.is-hl').forEach((x) => x.classList.remove('is-hl'));
  }

  async function startScan(root) {
    if (!root) return;
    if (state.scan.status === 'running') return;
    state.scan.status = 'running';
    state.scan.root = root;
    state.scan.progress = { files: 0, bytes: 0, currentPath: root };
    state.scan.error = null; state.scan.notice = null;
    state.scan.startedAt = Date.now();
    if (state.route !== 'map') go('map'); else render();
    announce(t('scan.started', { root }));
    const r = await call('scan', { root });
    if (isErr(r)) {
      state.scan.status = 'error'; state.scan.error = r.message || r.error;
      rerenderIf('map');
      return;
    }
    state.scan.scanId = r.scanId;
    tickTimer();
  }
  let timer = null;
  function tickTimer() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (state.scan.status !== 'running') { clearInterval(timer); return; }
      const el = $('#sc-time');
      if (el) el.textContent = I.fmtDuration(Date.now() - state.scan.startedAt);
    }, 1000);
  }
  function onScanProgress(p) {
    if (state.dups.status === 'running' && state.scan.status !== 'running') {
      state.dups.progress = p;
      const a = $('#dp-files'); if (a) a.textContent = I.fmtNum(p.files || 0);
      const b = $('#dp-path'); if (b) b.textContent = midTrunc(p.currentPath || '', 90);
      return;
    }
    if (state.scan.status !== 'running') return;
    if (state.scan.scanId && p.scanId && p.scanId !== state.scan.scanId) return;
    state.scan.progress = p;
    const f = $('#sc-files'); if (f) f.textContent = I.fmtNum(p.files || 0);
    const b = $('#sc-bytes'); if (b) b.textContent = B(p.bytes || 0);
    const c = $('#sc-path'); if (c) c.textContent = midTrunc(p.currentPath || '', 90);
  }
  function onScanDone(d) {
    if (state.scan.status !== 'running') return;
    if (state.scan.scanId && d.scanId && d.scanId !== state.scan.scanId) return;
    clearInterval(timer);
    if (!d.ok && d.error === 'cancelled') {
      state.scan.status = state.scan.last ? 'done' : 'idle';
      state.scan.notice = 'cancelled';
      announce(t('scan.cancelled'));
      rerenderIf('map');
      renderNav();
      return;
    }
    if (!d.ok) {
      state.scan.status = 'error';
      state.scan.error = t('scan.err.' + d.error, {}, true) || d.message || '';
      announce(t('scan.error', { msg: state.scan.error }));
      rerenderIf('map'); renderNav();
      return;
    }
    state.scan.status = 'done';
    state.scan.last = Object.assign({ at: Date.now() }, d);
    kidsCache.clear();
    state.map.items = null;
    state.large.key = null; state.large.selected.clear();
    state.dups = { status: 'idle', groups: [], wasted: 0, keep: new Map(), selected: new Set(), progress: null, key: null, error: null };
    announce(t('scan.doneAnnounce', { root: d.root, size: B(d.totalBytes), files: I.fmtNum(d.files) }));
    renderNav();
    openMapPath(d.root);
    if (state.route === 'large') maybeLoadLarge();
  }

  // ======================================================================
  // BÜYÜK DOSYALAR
  // ======================================================================
  const TYPES = ['video', 'archive', 'installer', 'disk', 'image', 'other'];
  const TYPE_ICON = { video: 'video', archive: 'archive', installer: 'installer', disk: 'disk', image: 'image', other: 'other' };
  function needScan(titleKey, leadKey) {
    const drives = state.drives || [];
    return head(titleKey, leadKey) + emptyState({ art: 'map', title: t('needScan.title'), text: t('needScan.text'),
      actions: (state.scan.status === 'running'
        ? `<button type="button" class="btn btn-secondary" data-action="go" data-route="map">${icon('map')}${esc(t('needScan.watch'))}</button>`
        : drives.map((d, i) => `<button type="button" class="btn ${i ? 'btn-secondary' : 'btn-primary'}" data-action="scan-drive" data-root="${esc(d.path)}">${icon('search')}${esc(t('map.scanDrive', { drive: driveName(d) }))}</button>`).join('')) });
  }
  async function maybeLoadLarge() {
    const l = state.scan.last;
    if (!l) return;
    const key = l.at + ':' + state.large.minBytes;
    if (state.large.key === key && state.large.status !== 'error') return;
    state.large.key = key;
    state.large.status = 'loading';
    rerenderIf('large');
    const r = await call('findLarge', { minBytes: state.large.minBytes, limit: 100 });
    if (state.large.key !== key) return;
    if (isErr(r)) { state.large.status = 'error'; state.large.error = r.message || r.error; }
    else {
      state.large.status = 'done';
      state.large.items = Array.isArray(r) ? r : [];
      const have = new Set(state.large.items.map((x) => x.path));
      [...state.large.selected].forEach((p) => { if (!have.has(p)) state.large.selected.delete(p); });
    }
    rerenderIf('large');
  }
  function vLarge() {
    if (!state.scan.last) return needScan('large.title', 'large.lead');
    const L = state.large;
    const minSel = `<span class="head-field"><label class="select-label" for="large-min">${esc(t('large.min'))}</label>
      <select id="large-min" class="select" data-change="large-min">${[100 * MB, 500 * MB, 1 * GB, 5 * GB].map((v) => `<option value="${v}" ${v === L.minBytes ? 'selected' : ''}>${esc(B(v))}</option>`).join('')}</select></span>`;
    let html = head('large.title', 'large.lead') + `<div class="subbar">${scanContext()}<span class="spacer"></span>${minSel}</div>`;
    if (L.status === 'error') return html + errorCard(L.error, 'large-reload');
    const hiddenProt = L.showProtected ? [] : L.items.filter((x) => protectedReason(x.path, x));
    const visible = L.showProtected ? L.items : L.items.filter((x) => !protectedReason(x.path, x));
    const counts = {};
    for (const x of visible) counts[x.type] = (counts[x.type] || 0) + 1;
    const chips = ['all', ...TYPES.filter((ty) => counts[ty])];
    html += `<div class="toolbar">
      <div class="chips" role="group" aria-label="${esc(t('large.filter'))}">${chips.map((ty) => `<button type="button" class="chip" data-action="large-filter" data-type="${ty}" id="chip-${ty}" aria-pressed="${L.filter === ty}">
        ${ty === 'all' ? '' : icon(TYPE_ICON[ty])}${esc(t('type.' + ty))}<span class="chip-n">${ty === 'all' ? visible.length : counts[ty]}</span></button>`).join('')}</div>
    </div>`;
    if (L.status === 'loading') return html + `<div class="card" aria-busy="true"><p role="status" class="muted">${esc(t('large.loading'))}</p>${'<div class="skel skel-row"></div>'.repeat(6)}</div>`;
    const protNote = hiddenProt.length
      ? `<p class="hint">${icon('lock')}<span>${esc(t('large.hiddenProt', { n: hiddenProt.length, size: B(sum(hiddenProt, (x) => x.sizeBytes)) }))}</span>
         <button type="button" class="btn btn-quiet btn-sm" data-action="large-prot" id="large-prot">${esc(t('large.showProt'))}</button></p>`
      : L.showProtected && L.items.some((x) => protectedReason(x.path, x))
        ? `<p class="hint">${icon('lock')}<span>${esc(t('large.protNote'))}</span><button type="button" class="btn btn-quiet btn-sm" data-action="large-prot" id="large-prot">${esc(t('large.hideProt'))}</button></p>` : '';
    html += protNote;
    if (L.filter !== 'all' && !counts[L.filter]) L.filter = 'all';
    const rows = visible.filter((x) => L.filter === 'all' || x.type === L.filter);
    if (!rows.length) return html + emptyState({ art: 'done', title: t('large.emptyTitle'), text: t('large.emptyText', { size: B(L.minBytes) }) });
    const selectable = rows.filter((x) => !protectedReason(x.path, x));
    const selIn = selectable.filter((x) => L.selected.has(x.path)).length;
    html += `<div class="card table-card"><table class="tbl">
      <caption class="sr-only">${esc(t('large.caption'))}</caption>
      <thead><tr>
        <th class="c-check" scope="col"><input type="checkbox" class="check" id="large-all" data-change="large-all" aria-label="${esc(t('common.selectAll'))}" ${selIn && selIn === selectable.length ? 'checked' : ''} ${!selectable.length ? 'disabled' : ''}></th>
        <th scope="col">${esc(t('large.colFile'))}</th><th scope="col" class="c-type">${esc(t('large.colType'))}</th>
        <th scope="col" class="c-date">${esc(t('large.colDate'))}</th><th scope="col" class="c-size">${esc(t('large.colSize'))}</th><th class="c-act"><span class="sr-only">${esc(t('common.actions'))}</span></th>
      </tr></thead><tbody>${rows.map((x, i) => largeRow(x, i)).join('')}</tbody></table></div>`;
    html += selectionBar(L.selected, L.items, 'large');
    return html;
  }
  function largeRow(x, i) {
    const prot = protectedReason(x.path, x);
    const id = 'lg-' + i;
    const sel = state.large.selected.has(x.path);
    return `<tr class="${sel ? 'is-sel' : ''}${prot ? ' is-locked' : ''}">
      <td class="c-check">${prot
        ? `<span class="lock" title="${esc(t('large.protected.' + prot))}">${icon('lock')}<span class="sr-only">${esc(t('large.protected.' + prot))}</span></span>`
        : `<input type="checkbox" class="check" id="${id}" data-change="large-sel" data-path="${esc(x.path)}" ${sel ? 'checked' : ''} aria-label="${esc(t('common.selectItem', { name: x.name }))}">`}</td>
      <td class="c-name"><span class="fname">${icon(TYPE_ICON[x.type] || 'other', 'ftype')}<span><span class="fname-main" title="${esc(x.name)}">${esc(x.name)}</span>
        <span class="fname-path" title="${esc(x.path)}">${esc(midTrunc(dirName(x.path), 64))}</span>${prot ? `<span class="fname-note">${esc(t('large.protected.' + prot))}</span>` : ''}</span></span></td>
      <td class="c-type">${esc(t('type.' + (x.type || 'other')))}</td>
      <td class="c-date" title="${esc(I.fmtDate(x.mtimeMs))}">${esc(I.fmtRelative(x.mtimeMs))}</td>
      <td class="c-size">${esc(B(x.sizeBytes))}</td>
      <td class="c-act"><button type="button" class="btn-icon" data-action="reveal" data-path="${esc(x.path)}" data-fk="lgr-${i}" aria-label="${esc(t('common.revealAria', { name: x.name }))}" title="${esc(t('common.reveal'))}">${icon('reveal')}</button></td>
    </tr>`;
  }
  function selectionBar(selected, items, kind) {
    const sizeOf = (p) => { const f = items.find((x) => x.path === p); return f ? f.sizeBytes : 0; };
    const n = selected.size;
    const total = sum([...selected], sizeOf);
    return `<div class="actionbar" role="region" aria-label="${esc(t('common.selection'))}">
      <p class="actionbar-text" aria-live="polite">${n ? esc(t('common.selectedFiles', { n, size: B(total) })) : esc(t('common.selectHint'))}</p>
      ${n ? `<button type="button" class="btn btn-quiet" data-action="${kind}-clear" id="${kind}-clear">${esc(t('common.clearSelection'))}</button>` : ''}
      <button type="button" class="btn btn-primary" data-action="${kind}-trash" id="${kind}-trash" ${n ? '' : 'disabled'}>${icon('trash')}${esc(t('common.toRecycle'))}</button>
    </div>`;
  }

  // ======================================================================
  // KOPYALAR
  // ======================================================================
  function vDups() {
    if (!state.scan.last) return needScan('dups.title', 'dups.lead');
    const D = state.dups;
    let html = head('dups.title', 'dups.lead') + `<div class="subbar">${scanContext()}</div>`;
    if (D.status === 'idle') {
      return html + `<section class="card intro-card"><div class="intro-ic">${icon('dups')}</div><div>
        <h2>${esc(t('dups.introTitle'))}</h2><p>${esc(t('dups.introText'))}</p>
        <ul class="ticks"><li>${icon('check')}${esc(t('dups.p1'))}</li><li>${icon('check')}${esc(t('dups.p2'))}</li><li>${icon('check')}${esc(t('dups.p3'))}</li></ul>
        <button type="button" class="btn btn-primary" data-action="dups-find" id="dups-find">${icon('search')}${esc(t('dups.find'))}</button></div></section>`;
    }
    if (D.status === 'running') {
      const p = D.progress || {};
      return html + `<section class="card scan-live"><div class="scan-top"><div class="pulse" aria-hidden="true"></div><h2>${esc(t('dups.running'))}</h2></div>
        <div class="indeterminate" role="progressbar" aria-label="${esc(t('dups.running'))}"><div></div></div>
        <dl class="scan-stats"><div><dt>${esc(t('dups.checked'))}</dt><dd id="dp-files">${esc(I.fmtNum(p.files || 0))}</dd></div></dl>
        <p class="scan-path"><span class="muted">${esc(t('scan.now'))}</span> <span id="dp-path" class="path">${esc(midTrunc(p.currentPath || '', 90))}</span></p></section>`;
    }
    if (D.status === 'error') return html + errorCard(D.error, 'dups-find');
    if (!D.groups.length) {
      return html + emptyState({ art: 'done', title: t('dups.emptyTitle'), text: t('dups.emptyText'),
        actions: `<button type="button" class="btn btn-secondary" data-action="dups-find">${icon('refresh')}${esc(t('dups.again'))}</button>` });
    }
    html += `<div class="summary-strip"><div><span class="eyebrow">${esc(t('dups.groups'))}</span><strong>${esc(I.fmtNum(D.groups.length))}</strong></div>
      <div><span class="eyebrow">${esc(t('dups.wasted'))}</span><strong>${esc(B(D.wasted))}</strong></div>
      <p class="muted">${esc(t('dups.keepRule'))}</p></div>
      <div class="toolbar"><button type="button" class="btn btn-quiet btn-sm" data-action="dups-select-extra" id="dups-extra">${icon('check')}${esc(t('dups.selectExtras'))}</button>
      <span class="spacer"></span><button type="button" class="btn btn-quiet btn-sm" data-action="dups-find" id="dups-again">${icon('refresh')}${esc(t('dups.again'))}</button></div>`;
    html += D.groups.map(dupGroup).join('');
    const items = D.groups.flatMap((g) => g.files.map((f) => ({ path: f.path, sizeBytes: g.sizeBytes })));
    html += selectionBar(D.selected, items, 'dups');
    return html;
  }
  function dupGroup(g, gi) {
    const keep = state.dups.keep.get(g.hash);
    const first = g.files[0];
    const name = baseName(keep || first.path);
    const ty = guessType(name);
    return `<section class="card dup-group" aria-labelledby="dg-${gi}">
      <header class="dup-head">${icon(TYPE_ICON[ty], 'ftype')}<div><h3 id="dg-${gi}">${esc(name)}</h3>
        <p class="muted">${esc(t('dups.groupMeta', { n: g.files.length, size: B(g.sizeBytes) }))}</p></div>
        <span class="dup-waste">${esc(t('dups.extra', { size: B(g.sizeBytes * (g.files.length - 1)) }))}</span></header>
      <ul class="dup-list">${g.files.map((f, fi) => {
        const id = `dp-${gi}-${fi}`;
        const isKeep = f.path === keep;
        const prot = protectedReason(f.path);
        return `<li class="dup-row${isKeep ? ' is-keep' : ''}">
          ${isKeep ? `<span class="keep-ic" title="${esc(t('dups.kept'))}">${icon('lock')}</span>`
            : prot ? `<span class="keep-ic">${icon('lock')}</span>`
            : `<input type="checkbox" class="check" id="${id}" data-change="dups-sel" data-path="${esc(f.path)}" ${state.dups.selected.has(f.path) ? 'checked' : ''}>`}
          <label ${isKeep || prot ? '' : `for="${id}"`} class="dup-path"><span class="fname-main">${esc(baseName(f.path))}</span><span class="fname-path" title="${esc(f.path)}">${esc(midTrunc(dirName(f.path), 70))}</span></label>
          <span class="dup-date" title="${esc(I.fmtDate(f.mtimeMs))}">${esc(I.fmtRelative(f.mtimeMs))}</span>
          ${isKeep ? badge('ok', t('dups.kept'), 'lock') : prot ? badge('neutral', t('large.protected.' + prot)) : `<button type="button" class="btn btn-quiet btn-sm" data-action="dups-keep" data-hash="${esc(g.hash)}" data-path="${esc(f.path)}" data-fk="keep-${id}">${esc(t('dups.keepThis'))}</button>`}
          <button type="button" class="btn-icon" data-action="reveal" data-path="${esc(f.path)}" data-fk="rv-${id}" aria-label="${esc(t('common.revealAria', { name: f.path }))}" title="${esc(t('common.reveal'))}">${icon('reveal')}</button>
        </li>`;
      }).join('')}</ul></section>`;
  }
  function guessType(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (['mp4', 'mkv', 'mov', 'avi', 'wmv', 'webm'].includes(ext)) return 'video';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
    if (['exe', 'msi'].includes(ext)) return 'installer';
    if (['iso', 'img', 'vhd', 'vhdx', 'vmdk'].includes(ext)) return 'disk';
    if (['jpg', 'jpeg', 'png', 'heic', 'gif', 'psd', 'raw'].includes(ext)) return 'image';
    return 'other';
  }
  async function findDups() {
    const D = state.dups;
    D.status = 'running'; D.progress = null; D.error = null;
    render();
    announce(t('dups.running'));
    const r = await call('findDuplicates', { minBytes: 1 * MB });
    if (isErr(r)) { D.status = 'error'; D.error = r.message || r.error; rerenderIf('dups'); return; }
    D.groups = (r.groups || []).filter((g) => g.files && g.files.length > 1);
    D.wasted = r.wastedBytes || sum(D.groups, (g) => g.sizeBytes * (g.files.length - 1));
    D.keep = new Map();
    for (const g of D.groups) {
      // En eski (muhtemelen asıl) kopya tutulur; korunan yollar varsa onlardan biri.
      const prot = g.files.find((f) => protectedReason(f.path));
      const oldest = g.files.slice().sort((a, b) => (a.mtimeMs || 0) - (b.mtimeMs || 0))[0];
      D.keep.set(g.hash, (prot || oldest).path);
    }
    D.selected = new Set();
    D.status = 'done';
    announce(t('dups.doneAnnounce', { n: D.groups.length, size: B(D.wasted) }));
    rerenderIf('dups');
  }

  // ---------- Geri Dönüşüm'e taşıma (büyük dosyalar + kopyalar) ----------
  async function trashFlow(paths, sizeOf) {
    if (!paths.length) return;
    const total = sum(paths, sizeOf);
    const list = paths.slice(0, 6).map((p) => `<li><span class="fname-main">${esc(baseName(p))}</span><span class="num">${esc(B(sizeOf(p)))}</span></li>`).join('')
      + (paths.length > 6 ? `<li class="muted">${esc(t('trash.more', { n: paths.length - 6 }))}</li>` : '');
    const ok = await dialog({
      title: t('trash.title', { n: paths.length }),
      body: `<p>${esc(t('trash.text'))}</p><ul class="dlg-list">${list}</ul>
        <p class="dlg-total"><span>${esc(t('common.total'))}</span><strong>${esc(B(total))}</strong></p>
        <p class="hint">${icon('info')}<span>${esc(t('trash.note'))}</span></p>`,
      confirm: t('common.toRecycle'), confirmIcon: 'trash', focus: 'cancel',
    });
    if (!ok) return;
    const r = await call('trashItems', paths);
    const failed = (r && r.failed) || [];
    const failedSet = new Set(failed.map((f) => f.path));
    const done = isErr(r) && !r.failed ? [] : paths.filter((p) => !failedSet.has(p));
    if (done.length) {
      toast(t('trash.done', { n: done.length }), { label: t('history.openBin'), fn: () => call('openRecycleBin') });
    }
    if (failed.length || (isErr(r) && !r.failed)) {
      const why = (failed[0] && failed[0].message) || (r && r.message) || '';
      toast(t('trash.failed', { n: failed.length || paths.length }) + (why ? ' ' + why : ''), null, 'warn');
    }
    // durum güncelle
    const gone = new Set(done);
    state.large.items = state.large.items.filter((x) => !gone.has(x.path));
    done.forEach((p) => { state.large.selected.delete(p); state.dups.selected.delete(p); });
    state.dups.groups = state.dups.groups.map((g) => Object.assign({}, g, { files: g.files.filter((f) => !gone.has(f.path)) })).filter((g) => g.files.length > 1);
    state.dups.wasted = sum(state.dups.groups, (g) => g.sizeBytes * (g.files.length - 1));
    kidsCache.clear();
    if (state.map.path) openMapPath(state.map.path);
    render();
    loadHistory(); loadCategories(true); loadDrives();
  }

  // ======================================================================
  // BAŞLANGIÇ
  // ======================================================================
  const SOURCE_KEYS = { 'HKCU Run': 'hkcu', 'HKLM Run': 'hklm', 'Startup folder': 'folder', Autostart: 'autostart' };
  function vStartup() {
    let html = head('startup.title', 'startup.lead');
    const S = state.startup;
    if (S.error) return html + errorCard(S.error, 'reload-startup');
    if (!S.items) return html + `<div class="card" aria-busy="true"><p role="status" class="muted">${esc(t('common.loading'))}</p>${'<div class="skel skel-row"></div>'.repeat(5)}</div>`;
    if (!S.items.length) return html + emptyState({ art: 'done', title: t('startup.emptyTitle'), text: t('startup.emptyText') });
    const on = S.items.filter((s) => s.enabled).length;
    const safeOn = S.items.filter((s) => s.enabled && advice(s) === 'safe-to-disable').length;
    html += `<div class="summary-strip"><div><span class="eyebrow">${esc(t('startup.onCount'))}</span><strong>${on}</strong></div>
      <div><span class="eyebrow">${esc(t('startup.canOff'))}</span><strong>${safeOn}</strong></div>
      <p class="muted">${icon('undo')}${esc(t('startup.reassure'))}</p></div>`;
    for (const adv of ['safe-to-disable', 'unknown', 'keep']) {
      const list = S.items.filter((s) => advice(s) === adv);
      if (!list.length) continue;
      html += `<section class="su-group" aria-labelledby="sg-${adv}"><h2 class="section-title" id="sg-${adv}">${esc(t('startup.group.' + adv))}</h2>
        <p class="section-sub">${esc(t('startup.groupSub.' + adv))}</p><ul class="card su-list">${list.map(suRow).join('')}</ul></section>`;
    }
    return html;
  }
  const advice = (s) => (s.known && s.known.advice) || 'unknown';
  function hue(name) { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; }
  function suRow(s) {
    const id = 'su-' + cssId(s.id);
    const adv = advice(s);
    const busy = state.startup.busy.has(s.id);
    const desc = s.known && s.known.description ? loc(s.known.description) : t('startup.unknownDesc');
    const badgeKind = adv === 'safe-to-disable' ? 'ok' : adv === 'keep' ? 'keep' : 'neutral';
    return `<li class="su-row${s.enabled ? '' : ' is-off'}">
      <span class="avatar" style="--h:${hue(s.name)}" aria-hidden="true">${esc((s.name || '?').trim().charAt(0).toUpperCase())}</span>
      <div class="su-info">
        <p class="su-title"><strong id="${id}-name">${esc(s.name)}</strong>${badge(badgeKind, t('startup.advice.' + adv))}</p>
        ${s.publisher ? `<p class="su-pub">${esc(s.publisher)}</p>` : ''}
        <p class="su-desc">${esc(desc)}</p>
        <details class="su-tech"><summary>${esc(t('startup.tech'))}</summary><dl>
          <dt>${esc(t('startup.command'))}</dt><dd><code>${esc(s.command)}</code></dd>
          <dt>${esc(t('startup.source'))}</dt><dd>${esc(t('startup.src.' + (SOURCE_KEYS[s.source] || 'other')))}</dd></dl></details>
      </div>
      <div class="su-toggle">
        <span class="su-state" id="${id}-state">${esc(t(s.enabled ? 'startup.on' : 'startup.off'))}</span>
        <button type="button" class="switch" role="switch" id="${id}" aria-checked="${s.enabled}" aria-labelledby="${id}-name" aria-describedby="${id}-state"
          data-action="su-toggle" data-id="${esc(s.id)}" ${busy ? 'disabled aria-busy="true"' : ''}><span class="switch-knob"></span></button>
      </div>
    </li>`;
  }
  async function toggleStartup(id) {
    const s = (state.startup.items || []).find((x) => x.id === id);
    if (!s) return;
    const next = !s.enabled;
    if (!next && advice(s) === 'keep') {
      const ok = await dialog({
        title: t('startup.keepTitle', { name: s.name }),
        body: `<p>${esc(s.known && s.known.description ? loc(s.known.description) : '')}</p><p>${esc(t('startup.keepText'))}</p>`,
        confirm: t('startup.keepConfirm'), focus: 'cancel', safeDefault: true,
      });
      if (!ok) return;
    }
    state.startup.busy.add(id);
    rerenderIf('startup');
    const r = await call('setStartupItemEnabled', id, next);
    state.startup.busy.delete(id);
    if (isErr(r) || (r && r.ok === false)) {
      toast(t('startup.failed', { name: s.name }) + (r && r.message ? ' ' + r.message : ''), null, 'warn');
    } else {
      s.enabled = next;
      toast(t(next ? 'startup.turnedOn' : 'startup.turnedOff', { name: s.name }));
      loadHistory();
    }
    rerenderIf('startup', 'overview');
    const sw = document.getElementById('su-' + cssId(id));
    if (sw) sw.focus();
  }

  // ======================================================================
  // GEÇMİŞ
  // ======================================================================
  const ACTION_ICON = { clean: 'clean', trash: 'trash', startup: 'startup' };
  function vHistory() {
    let html = head('history.title', 'history.lead');
    const H = state.history;
    if (H.error) return html + errorCard(H.error, 'reload-history');
    if (!H.items) return html + `<div class="card" aria-busy="true"><p role="status" class="muted">${esc(t('common.loading'))}</p></div>`;
    if (!H.items.length) return html + emptyState({ art: 'breeze', title: t('history.emptyTitle'), text: t('history.emptyText') });
    const totalFreed = sum(H.items.filter((h) => h.action === 'clean'), (h) => h.freedBytes || 0);
    if (totalFreed > 0) html += `<div class="summary-strip"><div><span class="eyebrow">${esc(t('history.totalFreed'))}</span><strong>${esc(B(totalFreed))}</strong></div><p class="muted">${esc(t('history.local'))}</p></div>`;
    const groups = [];
    for (const h of H.items) {
      const label = I.dayLabel(h.at);
      let g = groups[groups.length - 1];
      if (!g || g.label !== label) { g = { label, items: [] }; groups.push(g); }
      g.items.push(h);
    }
    html += groups.map((g, gi) => `<section class="tl-day" aria-labelledby="tl-${gi}"><h2 class="section-title" id="tl-${gi}">${esc(g.label)}</h2><ol class="timeline">
      ${g.items.map((h) => `<li class="tl-item tl-${esc(h.action)}"><span class="tl-dot" aria-hidden="true">${icon(ACTION_ICON[h.action] || 'info')}</span>
        <div class="tl-body card"><div class="tl-text"><p class="tl-summary">${esc(loc(h.summary))}</p>
          <p class="tl-meta"><time datetime="${esc(h.at)}">${esc(I.fmtTime(h.at))}</time>${h.freedBytes ? ' · ' + esc(t(h.action === 'trash' ? 'history.moved' : 'history.freed', { size: B(h.freedBytes) })) : ''}</p></div>
          <div class="tl-actions">${historyActions(h)}</div></div></li>`).join('')}</ol></section>`).join('');
    return html;
  }
  function historyActions(h) {
    if (h.action === 'trash') return `<button type="button" class="btn btn-secondary btn-sm" data-action="open-bin" data-fk="bin-${esc(h.id)}">${icon('trash')}${esc(t('history.openBin'))}</button>`;
    if (h.undone) return `<span class="badge badge-neutral">${icon('undo')}${esc(t('history.wasUndone'))}</span>`;
    if (h.action === 'startup' && h.undoable) return `<button type="button" class="btn btn-secondary btn-sm" data-action="undo" data-id="${esc(h.id)}" data-fk="undo-${esc(h.id)}">${icon('undo')}${esc(t('history.undo'))}</button>`;
    if (h.action === 'clean') return `<span class="muted small" title="${esc(t('history.cleanNoUndoLong'))}">${esc(t('history.cleanNoUndo'))}</span>`;
    return '';
  }

  // ======================================================================
  // AYARLAR
  // ======================================================================
  function vSettings() {
    const S = state.settings;
    const radio = (name, value, label, ic, sub) => `<label class="opt${S[name] === value ? ' is-on' : ''}">
      <input type="radio" name="${name}" value="${value}" data-change="setting" data-key="${name}" ${S[name] === value ? 'checked' : ''}>
      ${ic ? icon(ic) : ''}<span><span class="opt-title">${esc(label)}</span>${sub ? `<span class="opt-sub">${esc(sub)}</span>` : ''}</span></label>`;
    let html = head('settings.title', null);
    html += `<section class="card set-card" aria-labelledby="set-look"><h2 id="set-look">${esc(t('settings.appearance'))}</h2>
      <fieldset class="set-row"><legend>${esc(t('settings.language'))}</legend><div class="opts">
        ${radio('lang', 'tr', 'Türkçe', 'globe')}${radio('lang', 'en', 'English', 'globe')}</div></fieldset>
      <fieldset class="set-row"><legend>${esc(t('settings.theme'))}</legend><div class="opts">
        ${radio('theme', 'system', t('settings.themeSystem'), 'monitor')}${radio('theme', 'light', t('settings.themeLight'), 'sun')}${radio('theme', 'dark', t('settings.themeDark'), 'moon')}</div></fieldset>
    </section>`;
    const ex = S.excludedPaths || [];
    html += `<section class="card set-card" aria-labelledby="set-ex"><h2 id="set-ex">${esc(t('settings.excluded'))}</h2><p class="muted">${esc(t('settings.excludedSub'))}</p>
      ${ex.length ? `<ul class="ex-list">${ex.map((p, i) => `<li>${icon('folder')}<span class="path" title="${esc(p)}">${esc(p)}</span>
        <button type="button" class="btn btn-quiet btn-sm" data-action="ex-remove" data-i="${i}" data-fk="exr-${i}" aria-label="${esc(t('settings.removeAria', { path: p }))}">${icon('x')}${esc(t('settings.remove'))}</button></li>`).join('')}</ul>`
        : `<p class="muted small">${esc(t('settings.excludedNone'))}</p>`}
      <form class="ex-add" data-submit="ex-add" novalidate>
        <label for="ex-input" class="sr-only">${esc(t('settings.addLabel'))}</label>
        <input id="ex-input" class="input" type="text" spellcheck="false" autocomplete="off" placeholder="${esc(t('settings.addPlaceholder'))}" value="${esc(state.settingsDraft)}" ${state.settingsError ? 'aria-invalid="true" aria-describedby="ex-err"' : ''}>
        ${typeof api.pickFolder === 'function' ? `<button type="button" class="btn btn-secondary" data-action="ex-pick">${icon('folder')}${esc(t('settings.pick'))}</button>` : ''}
        <button type="submit" class="btn btn-secondary" id="ex-add-btn">${icon('plus')}${esc(t('settings.add'))}</button>
      </form>${state.settingsError ? `<p class="field-err" id="ex-err" role="alert">${esc(state.settingsError)}</p>` : ''}
    </section>`;
    html += `<section class="card set-card" aria-labelledby="set-about"><h2 id="set-about">${esc(t('settings.about'))}</h2>
      <div class="about"><img src="logo.svg" alt="" width="48" height="48" class="about-logo">
      <div><p><strong>Ferahla</strong> ${esc(state.info.version ? 'v' + state.info.version : '')}</p><p class="muted">${esc(t('settings.aboutText'))}</p>
      <p class="muted small">${icon(state.info.isAdmin ? 'shield' : 'info')}${esc(t(state.info.isAdmin ? 'settings.admin' : 'settings.notAdmin'))}</p></div></div></section>`;
    return html;
  }

  const SCREENS = { overview: vOverview, clean: vClean, map: vMap, large: vLarge, dups: vDups, startup: vStartup, history: vHistory, settings: vSettings };

  // ======================================================================
  // diyalog & bildirim
  // ======================================================================
  function dialog({ title, body, confirm, cancel, confirmIcon, focus = 'confirm', tone = 'primary', safeDefault = false }) {
    const dlg = $('#dlg');
    $('#dlg-title').textContent = title;
    $('#dlg-body').innerHTML = body;
    const okBtn = $('#dlg-ok'), noBtn = $('#dlg-cancel');
    okBtn.innerHTML = (confirmIcon ? icon(confirmIcon) : '') + esc(confirm || t('common.ok'));
    // safeDefault: güvenli seçenek (Vazgeç) görsel olarak öne çıkar, riskli seçenek ikincil kalır.
    okBtn.className = 'btn btn-' + (safeDefault ? 'secondary' : tone);
    noBtn.className = 'btn btn-' + (safeDefault ? 'primary' : 'secondary');
    noBtn.textContent = cancel || t('common.cancel');
    const opener = document.activeElement;
    return new Promise((resolve) => {
      const done = () => {
        dlg.removeEventListener('close', done);
        resolve(dlg.returnValue === 'ok');
        if (opener && document.body.contains(opener)) opener.focus();
      };
      dlg.addEventListener('close', done);
      dlg.returnValue = '';
      dlg.showModal();
      (focus === 'cancel' ? noBtn : okBtn).focus();
    });
  }
  function toast(msg, action, tone) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast' + (tone ? ' toast-' + tone : '');
    el.innerHTML = `${icon(tone === 'warn' ? 'alert' : 'check')}<span class="toast-msg">${esc(msg)}</span>`;
    if (action) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn btn-quiet btn-sm'; b.textContent = action.label;
      b.addEventListener('click', () => { action.fn(); el.remove(); });
      el.appendChild(b);
    }
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'btn-icon'; x.setAttribute('aria-label', t('common.close')); x.innerHTML = icon('x');
    x.addEventListener('click', () => el.remove());
    el.appendChild(x);
    box.appendChild(el);
    let timeout = setTimeout(() => el.remove(), action ? 10000 : 6000);
    el.addEventListener('mouseenter', () => clearTimeout(timeout));
    el.addEventListener('focusin', () => clearTimeout(timeout));
    el.addEventListener('mouseleave', () => { timeout = setTimeout(() => el.remove(), 4000); });
  }

  // ======================================================================
  // veri yükleme
  // ======================================================================
  async function loadDrives() {
    const r = await call('listDrives');
    if (isErr(r) || !Array.isArray(r)) { state.drivesError = (r && r.message) || t('err.generic'); state.drives = null; }
    else { state.drives = r; state.drivesError = null; }
    rerenderIf('overview', 'map', 'large', 'dups');
  }
  async function loadCategories(quiet) {
    state.catLoading = true;
    if (!quiet) { state.catError = null; }
    const r = await call('getCleanupCategories');
    state.catLoading = false;
    if (isErr(r) || !Array.isArray(r)) { state.catError = (r && r.message) || t('err.generic'); state.categories = null; }
    else {
      state.catError = null;
      state.categories = r;
      // Varsayılan seçim: yalnızca önerilen ve engelsiz olanlar. Kullanıcı seçimiyle oynadıysa korunur (engellenenler düşer).
      if (!state.selectionTouched) state.selected = new Set(recommendedCats().map((c) => c.id));
      else [...state.selected].forEach((id) => { const c = r.find((x) => x.id === id); if (!c || catBlock(c)) state.selected.delete(id); });
    }
    rerenderIf('overview', 'clean');
  }
  async function loadStartup() {
    const r = await call('getStartupItems');
    if (isErr(r) || !Array.isArray(r)) { state.startup.error = (r && r.message) || t('err.generic'); }
    else { state.startup.items = r; state.startup.error = null; }
    rerenderIf('startup', 'overview');
  }
  async function loadHistory() {
    const r = await call('getHistory');
    if (isErr(r) || !Array.isArray(r)) state.history.error = (r && r.message) || t('err.generic');
    else { state.history.items = r.slice().sort((a, b) => new Date(b.at) - new Date(a.at)); state.history.error = null; }
    rerenderIf('history');
  }

  // ---------- temizlik akışı ----------
  async function confirmAndClean(ids) {
    const cats = (state.categories || []).filter((c) => ids.includes(c.id));
    if (!cats.length) return;
    const total = sum(cats, (c) => c.sizeBytes);
    const skipped = (state.categories || []).filter((c) => !ids.includes(c.id) && c.sizeBytes > 0 && c.available && catBlock(c) !== 'empty');
    const body = `<p>${esc(t('confirm.text'))}</p>
      <ul class="dlg-list">${cats.map((c) => `<li><span>${esc(loc(c.name))}</span><span class="num">${esc(B(c.sizeBytes))}</span></li>`).join('')}</ul>
      <p class="dlg-total"><span>${esc(t('common.total'))}</span><strong>${esc(B(total))}</strong></p>
      <p class="hint">${icon('shield')}<span>${esc(t('confirm.safe'))}</span></p>
      ${skipped.length ? `<details class="dlg-skipped"><summary>${esc(t('confirm.skipped', { n: skipped.length }))}</summary><ul>${skipped.map((c) => {
        const b = catBlock(c);
        const why = b === 'admin' ? t('confirm.why.admin') : b === 'warning' ? loc(c.warning) : isRecycle(c) ? t('confirm.why.recycle') : t('confirm.why.notSelected');
        return `<li><strong>${esc(loc(c.name))}</strong> — ${esc(why)}</li>`;
      }).join('')}</ul></details>` : ''}`;
    const ok = await dialog({ title: t('confirm.title'), body, confirm: t('confirm.go', { size: B(total) }), confirmIcon: 'clean' });
    if (!ok) return;
    runClean(ids);
  }
  async function runClean(ids) {
    state.clean = { status: 'running', ids, progress: {}, result: null };
    go('clean');
    announce(t('cleaning.title'));
    const r = await call('cleanCategories', ids);
    state.clean.status = 'done';
    state.clean.result = isErr(r) && !r.results ? { freedBytes: 0, results: [], error: r.error, message: r.message } : r;
    await loadDrives();
    state.selectionTouched = false;
    await loadCategories(true);
    loadHistory();
    if (state.route === 'clean') { render(); const h = $('#result-h'); if (h) h.focus(); }
    renderNav();
    announce(t('result.announce', { size: B((state.clean.result && state.clean.result.freedBytes) || 0) }));
  }
  function onCleanProgress(p) {
    if (state.clean.status !== 'running') return;
    state.clean.progress[p.id] = p.percent;
    const li = document.getElementById('prog-' + cssId(p.id));
    if (li) {
      const m = li.querySelector('.meter');
      m.setAttribute('aria-valuenow', Math.round(p.percent));
      m.firstElementChild.style.width = Math.round(p.percent) + '%';
      li.querySelector('.prog-state').innerHTML = p.percent >= 100 ? icon('check') : esc(I.fmtPct(p.percent / 100));
      li.classList.toggle('is-done', p.percent >= 100);
    }
  }

  // ======================================================================
  // olaylar
  // ======================================================================
  const actions = {
    go: (el) => go(el.dataset.route),
    'welcome-ok': () => { state.showWelcome = false; store.set('ferahla.welcomed', '1'); render(); const b = $('#btn-safe-clean'); if (b) b.focus(); },
    'reload-cats': () => { state.categories = null; render(); loadCategories(); },
    'reload-drives': () => { state.drivesError = null; state.drives = null; render(); loadDrives(); },
    'reload-startup': () => { state.startup.error = null; state.startup.items = null; render(); loadStartup(); },
    'reload-history': () => { state.history.error = null; state.history.items = null; render(); loadHistory(); },
    'safe-clean': () => confirmAndClean(recommendedCats().map((c) => c.id)),
    'clean-selected': () => confirmAndClean([...state.selected].filter((id) => { const c = state.categories.find((x) => x.id === id); return c && !catBlock(c); })),
    'cats-recommended': () => { state.selectionTouched = true; state.selected = new Set(recommendedCats().map((c) => c.id)); render(); },
    'cats-none': () => { state.selectionTouched = true; state.selected = new Set(); render(); },
    'cat-desc': (el) => { const id = el.dataset.id; if (state.openDesc.has(id)) state.openDesc.delete(id); else state.openDesc.add(id); render(); },
    'relaunch-admin': async () => {
      const r = await call('relaunchAsAdmin');
      if (r && r.ok === false) toast(r.error === 'cancelled' ? t('clean.relaunchCancelled') : t('clean.relaunchFailed') + (r.message ? ' ' + r.message : ''), null, 'warn');
    },
    'result-done': () => { state.clean = { status: 'idle', ids: [], progress: {}, result: null }; go('overview'); },
    'scan-drive': (el) => startScan(el.dataset.root),
    'scan-retry': () => startScan(state.scan.root || (state.drives && state.drives[0] && state.drives[0].path)),
    'scan-cancel': () => { call('cancelScan'); },
    'map-open': (el) => openMapPath(el.dataset.path, true),
    'map-up': () => { const c = buildCrumbs(state.scan.last.root, state.map.path); if (c.length > 1) openMapPath(c[c.length - 2].path, true); },
    reveal: (el) => call('revealInFolder', el.dataset.path),
    'large-filter': (el) => { state.large.filter = el.dataset.type; render(); },
    'large-prot': () => { state.large.showProtected = !state.large.showProtected; render(); },
    'large-reload': () => { state.large.key = null; maybeLoadLarge(); },
    'large-clear': () => { state.large.selected.clear(); render(); },
    'large-trash': () => trashFlow([...state.large.selected], (p) => (state.large.items.find((x) => x.path === p) || {}).sizeBytes || 0),
    'dups-find': () => findDups(),
    'dups-keep': (el) => { state.dups.keep.set(el.dataset.hash, el.dataset.path); state.dups.selected.delete(el.dataset.path); render(); announce(t('dups.keepAnnounce', { name: baseName(el.dataset.path) })); },
    'dups-select-extra': () => {
      for (const g of state.dups.groups) {
        const k = state.dups.keep.get(g.hash);
        g.files.forEach((f) => { if (f.path !== k && !protectedReason(f.path)) state.dups.selected.add(f.path); });
      }
      render();
    },
    'dups-clear': () => { state.dups.selected.clear(); render(); },
    'dups-trash': () => {
      const sizes = new Map();
      state.dups.groups.forEach((g) => g.files.forEach((f) => sizes.set(f.path, g.sizeBytes)));
      // Güvenlik: "tut" işaretli dosyalar asla gönderilmez.
      const keepSet = new Set(state.dups.keep.values());
      trashFlow([...state.dups.selected].filter((p) => !keepSet.has(p)), (p) => sizes.get(p) || 0);
    },
    'su-toggle': (el) => toggleStartup(el.dataset.id),
    'open-bin': () => call('openRecycleBin'),
    undo: async (el) => {
      const r = await call('undoHistory', el.dataset.id);
      if (isErr(r)) toast(t('history.undoFailed') + (r.message ? ' ' + r.message : ''), null, 'warn');
      else toast(t('history.undone'));
      await loadHistory();
      state.startup.items = null; loadStartup();
    },
    'ex-remove': async (el) => {
      const ex = (state.settings.excludedPaths || []).slice();
      ex.splice(+el.dataset.i, 1);
      await saveSettings({ excludedPaths: ex });
      const next = $('#ex-input'); if (next) next.focus();
    },
    'ex-pick': async () => {
      const p = await call('pickFolder');
      if (typeof p === 'string' && p) addExcluded(p);
    },
  };
  async function saveSettings(partial) {
    const r = await call('setSettings', partial);
    if (isErr(r) || !r) { toast(t('settings.saveFailed'), null, 'warn'); return; }
    const langChanged = r.lang !== state.settings.lang;
    state.settings = Object.assign({}, state.settings, r);
    applyTheme();
    if (langChanged) applyLang();
    render();
  }
  /** Ana süreçle aynı mantıkla karşılaştırma için: ayırıcıları birleştir, sondaki ayırıcıyı kırp, büyük/küçük harf duyarsız. */
  const normPath = (p) => {
    let n = String(p || '').trim().replace(/[\\/]+/g, '/');
    if (n.length > 1 && !/^[a-z]:\/$/i.test(n)) n = n.replace(/\/+$/, '');
    return n.toLowerCase();
  };
  const looksAbsolute = (p) => /^[a-z]:[\\/]/i.test(p) || /^[\\/]/.test(p);
  async function addExcluded(p) {
    const path = String(p || '').trim();
    const ex = state.settings.excludedPaths || [];
    state.settingsDraft = path;
    if (!path) { state.settingsError = t('settings.errEmpty'); render(); return; }
    if (ex.some((x) => normPath(x) === normPath(path))) { state.settingsError = t('settings.errDup'); render(); return; }
    if (!looksAbsolute(path)) { state.settingsError = t('settings.errInvalid'); render(); focusExInput(); return; }
    state.settingsError = '';
    const r = await call('setSettings', { excludedPaths: ex.concat(path) });
    if (isErr(r) || !r) { state.settingsError = (r && r.message) || t('settings.saveFailed'); render(); focusExInput(); return; }
    state.settings = Object.assign({}, state.settings, r);
    // Ana süreç geçersiz yolları sessizce atar: gerçekten eklendi mi, dönen listeden doğrula.
    const added = (r.excludedPaths || []).some((x) => normPath(x) === normPath(path));
    if (!added) {
      state.settingsError = t('settings.errNotAdded');
      render(); focusExInput();
      announce(state.settingsError);
      return;
    }
    state.settingsDraft = '';
    render();
    toast(t('settings.added'));
    focusExInput();
  }
  function focusExInput() { const inp = $('#ex-input'); if (inp) inp.focus(); }

  function wire() {
    $('#nav-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-route]');
      if (b) go(b.dataset.route);
    });
    const v = view();
    v.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || el.disabled || !v.contains(el)) return;
      const fn = actions[el.dataset.action];
      if (fn) { e.preventDefault(); fn(el, e); }
    });
    v.addEventListener('change', (e) => {
      const el = e.target;
      const k = el.dataset && el.dataset.change;
      if (!k) return;
      if (k === 'cat-toggle') { state.selectionTouched = true; if (el.checked) state.selected.add(el.dataset.id); else state.selected.delete(el.dataset.id); render(); }
      if (k === 'large-sel') { if (el.checked) state.large.selected.add(el.dataset.path); else state.large.selected.delete(el.dataset.path); render(); }
      if (k === 'large-all') {
        const rows = state.large.items.filter((x) => (state.large.filter === 'all' || x.type === state.large.filter) && !protectedReason(x.path, x));
        // (korunan dosyalar hiçbir zaman seçilemez)
        rows.forEach((x) => (el.checked ? state.large.selected.add(x.path) : state.large.selected.delete(x.path)));
        render();
      }
      if (k === 'large-min') { state.large.minBytes = +el.value; state.large.key = null; maybeLoadLarge(); }
      if (k === 'dups-sel') { if (el.checked) state.dups.selected.add(el.dataset.path); else state.dups.selected.delete(el.dataset.path); render(); }
      if (k === 'setting') saveSettings({ [el.dataset.key]: el.value });
    });
    v.addEventListener('input', (e) => {
      if (e.target.id === 'ex-input') { state.settingsDraft = e.target.value; }
    });
    v.addEventListener('submit', (e) => {
      const f = e.target.closest('[data-submit]');
      if (!f) return;
      e.preventDefault();
      if (f.dataset.submit === 'ex-add') addExcluded($('#ex-input').value);
    });
    // listeden treemap'e vurgu
    const hl = (e) => {
      const row = e.target.closest && e.target.closest('.ml-row');
      const tm = $('#tm');
      if (tm) TM.highlight(tm, row ? row.dataset.path : null);
    };
    v.addEventListener('mouseover', hl);
    v.addEventListener('focusin', hl);
    v.addEventListener('mouseleave', () => { const tm = $('#tm'); if (tm) TM.highlight(tm, null); });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideTip();
      // Alt+Sol / Backspace: haritada üst klasöre çık
      if (state.route === 'map' && ((e.altKey && e.key === 'ArrowLeft') || (e.key === 'Backspace' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)))) {
        if (state.scan.last && state.map.path && state.map.path !== state.scan.last.root) { e.preventDefault(); actions['map-up'](); }
      }
      // Ctrl+1..8: ekranlar arası geçiş
      if (e.ctrlKey && !e.altKey && /^[1-8]$/.test(e.key)) { e.preventDefault(); go(ROUTES[+e.key - 1]); }
    });
    $('#main').addEventListener('scroll', hideTip, { passive: true });
  }

  async function init() {
    if (!api) {
      $('#view').innerHTML = `<div class="card note note-error">${icon('alert')}<p>Ferahla could not start: window.ferahla is missing.</p></div>`;
      return;
    }
    wire();
    const [info, settings] = await Promise.all([call('getAppInfo'), call('getSettings')]);
    if (!isErr(info) && info) state.info = info;
    if (!isErr(settings) && settings) state.settings = Object.assign(state.settings, settings);
    applyLang();
    applyTheme();
    const forceFresh = /(^|[?&,=])fresh(\b|,|&|$)/.test(location.search);
    state.showWelcome = forceFresh || !store.get('ferahla.welcomed');
    if (api.__prescanned) state.scan = Object.assign(state.scan, { status: 'done', last: Object.assign({ at: Date.now() - 12 * 60000, ok: true, dirs: 0, skipped: 1204, durationMs: 134000 }, api.__prescanned) });
    const hash = (location.hash || '').slice(1);
    state.route = ROUTES.includes(hash) ? hash : 'overview';
    api.onScanProgress && api.onScanProgress(onScanProgress);
    api.onScanDone && api.onScanDone(onScanDone);
    api.onCleanProgress && api.onCleanProgress(onCleanProgress);
    render();
    document.body.classList.add('is-ready');
    onEnter(state.route);
    loadDrives(); loadCategories(); loadStartup(); loadHistory();
    if (state.scan.last) openMapPath(state.scan.last.root);
  }

  // Geliştirme/test kolaylığı (yalnızca okuma amaçlı)
  window.__ferahlaUI = { state, go, startScan };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
