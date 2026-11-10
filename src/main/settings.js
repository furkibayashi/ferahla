'use strict';
/** Ayarlar: userData/settings.json. Electron'a bağlı değildir (dosya yolu dışarıdan verilir). */
const fs = require('fs');
const path = require('path');

const DEFAULTS = { lang: 'tr', theme: 'system', excludedPaths: [] };

function sanitize(partial, base) {
  const out = { ...base };
  if (!partial || typeof partial !== 'object') return out;
  if (partial.lang === 'tr' || partial.lang === 'en') out.lang = partial.lang;
  if (['system', 'light', 'dark'].includes(partial.theme)) out.theme = partial.theme;
  if (Array.isArray(partial.excludedPaths)) {
    out.excludedPaths = [...new Set(partial.excludedPaths
      .filter((p) => typeof p === 'string' && p.length > 0 && p.length < 4096 && !p.includes('\0') && path.isAbsolute(p))
      .map((p) => {
        const n = path.normalize(p);
        const root = path.parse(n).root;
        return n.length > root.length ? n.replace(/[\\/]+$/, '') : n;
      }))].slice(0, 500);
  }
  return out;
}

class Settings {
  constructor(file, { defaultLang = 'tr' } = {}) {
    this.file = file;
    this.defaults = { ...DEFAULTS, lang: defaultLang === 'en' ? 'en' : 'tr' };
    this.data = null;
  }

  get() {
    if (!this.data) {
      try {
        this.data = sanitize(JSON.parse(fs.readFileSync(this.file, 'utf8')), this.defaults);
      } catch (e) {
        this.data = { ...this.defaults };
      }
    }
    return { ...this.data, excludedPaths: [...this.data.excludedPaths] };
  }

  set(partial) {
    this.data = sanitize(partial, this.get());
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
    return this.get();
  }
}

module.exports = { Settings, sanitize, DEFAULTS };
