/*
 * Ferahla — treemap (squarified, Bruls/Huizing/van Wijk 2000). Harici kütüphane yok.
 * Renk, klasör türüne göre DEĞİL, kapladığı paya göre: büyüdükçe koyulaşır (açık temada) / parlaklaşır (koyu temada).
 * Erişilebilirlik: SVG yalnızca görsel bir özettir (role="img"); klavye/ekran okuyucu alternatifi yanındaki listedir.
 */
(function () {
  'use strict';

  /** values: azalan sıralı pozitif sayılar. Dönen: her değer için {x,y,w,h} (aynı sırada). */
  function squarify(values, x, y, w, h) {
    const out = new Array(values.length);
    const total = values.reduce((a, b) => a + b, 0);
    if (!total || w <= 0 || h <= 0) return out.fill(null).map(() => ({ x, y, w: 0, h: 0 }));
    const scale = (w * h) / total;
    const areas = values.map((v) => v * scale);
    let rect = { x, y, w, h };
    let row = []; // indeksler
    let i = 0;

    const worst = (idxs, side) => {
      if (!idxs.length) return Infinity;
      let sum = 0, max = -Infinity, min = Infinity;
      for (const k of idxs) { const a = areas[k]; sum += a; if (a > max) max = a; if (a < min) min = a; }
      const s2 = side * side, sum2 = sum * sum;
      return Math.max((s2 * max) / sum2, sum2 / (s2 * min));
    };
    const layoutRow = (idxs) => {
      const sum = idxs.reduce((s, k) => s + areas[k], 0);
      if (rect.w >= rect.h) {
        const colW = sum / rect.h;
        let yy = rect.y;
        for (const k of idxs) { const hh = areas[k] / colW; out[k] = { x: rect.x, y: yy, w: colW, h: hh }; yy += hh; }
        rect = { x: rect.x + colW, y: rect.y, w: Math.max(0, rect.w - colW), h: rect.h };
      } else {
        const rowH = sum / rect.w;
        let xx = rect.x;
        for (const k of idxs) { const ww = areas[k] / rowH; out[k] = { x: xx, y: rect.y, w: ww, h: rowH }; xx += ww; }
        rect = { x: rect.x, y: rect.y + rowH, w: rect.w, h: Math.max(0, rect.h - rowH) };
      }
    };

    while (i < areas.length) {
      const side = Math.min(rect.w, rect.h);
      if (row.length === 0 || worst(row.concat(i), side) <= worst(row, side)) { row.push(i); i++; }
      else { layoutRow(row); row = []; }
    }
    if (row.length) layoutRow(row);
    return out;
  }

  // ---------- renk ----------
  const RAMPS = {
    light: ['#E6F4EF', '#C2E6DA', '#8CCFBC', '#46A491', '#176E60'],
    dark: ['#1B2925', '#1E3B34', '#21594D', '#2C8070', '#5CC6AE'],
  };
  const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const rgbToHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  function lum(hex) {
    const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const contrast = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };

  /** share: 0..1 (öğenin görünen toplam içindeki payı) → renk. Karekök ölçeği küçük farkları da okunur kılar. */
  function colorFor(share, theme) {
    const ramp = RAMPS[theme] || RAMPS.light;
    const t = Math.max(0, Math.min(1, Math.sqrt(Math.max(0, share)) / Math.sqrt(0.45)));
    const pos = t * (ramp.length - 1);
    const i = Math.min(ramp.length - 2, Math.floor(pos));
    const f = pos - i;
    const a = hexToRgb(ramp[i]), b = hexToRgb(ramp[i + 1]);
    return rgbToHex(a.map((v, k) => v + (b[k] - v) * f));
  }
  function textOn(bg) {
    const dark = '#0D231E', light = '#FFFFFF';
    return contrast(bg, dark) >= contrast(bg, light) ? dark : light;
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fit = (s, px, charW) => {
    const max = Math.floor(px / charW);
    if (max < 3) return '';
    return s.length <= max ? s : s.slice(0, Math.max(1, max - 1)) + '…';
  };

  /**
   * container: boyutu CSS ile belirlenen bir öğe.
   * o.items: [{ name, path, isDir, sizeBytes, fileCount, children?: [...] }] (azalan sıralı)
   * o.total: görünen toplam (pay hesabı için)
   * o.theme: 'light' | 'dark'
   * o.fmtSize(bytes) → metin
   * o.othersLabel(count) → metin
   * o.ariaLabel: SVG'nin erişilebilir adı
   * o.onHover(item|null, event), o.onClick(item)
   */
  function render(container, o) {
    const W = Math.max(0, Math.floor(container.clientWidth));
    const H = Math.max(0, Math.floor(container.clientHeight));
    const theme = o.theme || 'light';
    const MAX = 40;
    let items = (o.items || []).filter((it) => it.sizeBytes > 0);
    if (items.length > MAX) {
      const rest = items.slice(MAX);
      items = items.slice(0, MAX);
      items.push({ name: o.othersLabel ? o.othersLabel(rest.length) : '…', path: null, isDir: false, isOther: true,
        sizeBytes: rest.reduce((s, r) => s + r.sizeBytes, 0), fileCount: rest.reduce((s, r) => s + (r.fileCount || 0), 0) });
    }
    const total = o.total || items.reduce((s, it) => s + it.sizeBytes, 0) || 1;
    const nodes = []; // etkileşim için
    let svg = '';
    const GAP = 2;

    const rects = squarify(items.map((it) => it.sizeBytes), 0, 0, W, H);
    items.forEach((it, idx) => {
      const r = rects[idx];
      const x = r.x + GAP / 2, y = r.y + GAP / 2, w = r.w - GAP, h = r.h - GAP;
      if (w < 1 || h < 1) return;
      const share = it.sizeBytes / total;
      const fill = it.isOther ? (theme === 'dark' ? '#25302D' : '#EEF2F0') : colorFor(share, theme);
      const fg = textOn(fill);
      const id = nodes.push(it) - 1;
      const cls = 'tm-cell' + (it.isDir ? ' is-dir' : '') + (it.isOther ? ' is-other' : '');
      svg += `<g class="${cls}" data-i="${id}"${it.path ? ` data-path="${esc(it.path)}"` : ''}>`;
      svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="5" fill="${fill}"${it.isOther ? ' class="tm-other"' : ''}/>`;

      const showLabel = w > 54 && h > 26;
      const header = 34;
      // İkinci seviye: büyük klasörlerin içi (yalnızca görsel doku; tıklanınca o alt klasöre gidilir)
      if (it.isDir && it.children && it.children.length && w > 110 && h > 90) {
        const kids = it.children.filter((c) => c.sizeBytes > 0).slice(0, 24);
        const ix = x + 4, iy = y + header, iw = w - 8, ih = h - header - 4;
        if (iw > 20 && ih > 20 && kids.length) {
          const sum = kids.reduce((s, c) => s + c.sizeBytes, 0);
          // Listelenmeyen küçük öğelerin payı boş bırakılır; böylece iç alan da orantılı kalır.
          const vals = kids.map((c, k) => ({ v: c.sizeBytes, k }));
          const rest = it.sizeBytes - sum;
          if (rest > 0) vals.push({ v: rest, k: -1 });
          vals.sort((a, b) => b.v - a.v);
          const sq = squarify(vals.map((q) => q.v), ix, iy, iw, ih);
          const kr = [];
          vals.forEach((q, j) => { if (q.k >= 0) kr[q.k] = sq[j]; });
          kids.forEach((c, k) => {
            const q = kr[k];
            const qx = q.x + 1, qy = q.y + 1, qw = q.w - 2, qh = q.h - 2;
            if (qw < 2 || qh < 2) return;
            const cf = colorFor(c.sizeBytes / total, theme);
            const cid = nodes.push(Object.assign({ parentItem: it }, c)) - 1;
            svg += `<rect class="tm-sub${c.isDir ? ' is-dir' : ''}" data-i="${cid}" x="${qx.toFixed(1)}" y="${qy.toFixed(1)}" width="${qw.toFixed(1)}" height="${qh.toFixed(1)}" rx="3" fill="${cf}"/>`;
            if (qw > 70 && qh > 22) {
              const ct = textOn(cf);
              svg += `<text class="tm-sublabel" x="${(qx + 6).toFixed(1)}" y="${(qy + 15).toFixed(1)}" fill="${ct}" pointer-events="none">${esc(fit(c.name, qw - 10, 6.4))}</text>`;
            }
          });
        }
      }
      if (showLabel) {
        const name = fit(it.name, w - 14, 7.2);
        if (name) svg += `<text class="tm-label" x="${(x + 8).toFixed(1)}" y="${(y + 17).toFixed(1)}" fill="${fg}" pointer-events="none">${esc(name)}</text>`;
        if (it.via && w > 140) {
          const via = fit('› ' + it.via, w - 16 - name.length * 7.2 - 10, 6.4);
          if (via) svg += `<text class="tm-via" x="${(x + 16 + name.length * 7.2).toFixed(1)}" y="${(y + 17).toFixed(1)}" fill="${fg}" pointer-events="none">${esc(via)}</text>`;
        }
        if (h > 40 && w > 64) {
          svg += `<text class="tm-size" x="${(x + 8).toFixed(1)}" y="${(y + 30).toFixed(1)}" fill="${fg}" pointer-events="none">${esc(o.fmtSize ? o.fmtSize(it.sizeBytes) : '')}</text>`;
        }
      }
      svg += '</g>';
    });

    container.innerHTML = `<svg class="tm-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.ariaLabel || '')}">${svg}</svg>`;
    const svgEl = container.firstChild;
    const get = (e) => { const el = e.target.closest('[data-i]'); return el ? nodes[+el.dataset.i] : null; };
    let last = null;
    svgEl.addEventListener('mousemove', (e) => { const n = get(e); if (n !== last) { last = n; } o.onHover && o.onHover(n, e); });
    svgEl.addEventListener('mouseleave', (e) => { last = null; o.onHover && o.onHover(null, e); });
    svgEl.addEventListener('click', (e) => { const n = get(e); if (n && o.onClick) o.onClick(n); });
    return { nodes };
  }

  /** Yol eşleşen hücreyi vurgula (listeyle bağlantı için). */
  function highlight(container, path) {
    const svg = container.querySelector('svg');
    if (!svg) return;
    svg.querySelectorAll('.is-hl').forEach((el) => el.classList.remove('is-hl'));
    if (!path) return;
    svg.querySelectorAll('g.tm-cell').forEach((g) => {
      if (g.dataset.path === path) g.classList.add('is-hl');
    });
  }

  window.FerahlaTreemap = { squarify, colorFor, textOn, contrast, render, highlight, RAMPS };
})();
