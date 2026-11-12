'use strict';
/**
 * İşlem geçmişi (JSON). Her kayıt: { id, at, action:'clean'|'trash'|'startup', summary:{tr,en}, freedBytes?,
 * undoable, undo?:{...} (iç alan, arayüze gönderilmez), undone?:true }.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { formatBytes, formatCount } = require('./format');

const MAX_ENTRIES = 500;

class History {
  constructor(file) {
    this.file = file;
    this.entries = null;
  }

  _load() {
    if (this.entries) return this.entries;
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.entries = Array.isArray(data) ? data.filter((e) => e && typeof e.id === 'string') : [];
    } catch (e) {
      if (e.code !== 'ENOENT') {
        // Bozuk dosya: yedekle, boş başla.
        try { fs.renameSync(this.file, `${this.file}.bozuk-${Date.now()}`); } catch (e2) { /* yok say */ }
      }
      this.entries = [];
    }
    return this.entries;
  }

  _save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.entries, null, 1), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  /** Arayüze giden liste (yeniden eskiye). */
  list() {
    return this._load().map((e) => {
      const out = { id: e.id, at: e.at, action: e.action, summary: e.summary, undoable: !!e.undoable && !e.undone };
      if (typeof e.freedBytes === 'number') out.freedBytes = e.freedBytes;
      if (e.undone) out.undone = true;
      return out;
    });
  }

  add({ action, summary, freedBytes, undo }) {
    const entries = this._load();
    const entry = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      action,
      summary,
      undoable: !!undo,
    };
    if (typeof freedBytes === 'number') entry.freedBytes = freedBytes;
    if (undo) entry.undo = undo;
    entries.unshift(entry);
    if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
    this._save();
    return entry;
  }

  get(id) {
    return this._load().find((e) => e.id === id) || null;
  }

  /**
   * Geri al. Yalnızca başlangıç değişiklikleri geri alınabilir.
   * @param {string} id
   * @param {{ setStartupItemEnabled:(itemId:string, enabled:boolean)=>Promise<{ok:boolean,error?:string}> }} handlers
   */
  async undo(id, handlers) {
    const e = this.get(id);
    if (!e) return { ok: false, error: 'not-found' };
    if (!e.undoable || e.undone || !e.undo) return { ok: false, error: 'not-undoable' };
    if (e.action !== 'startup' || e.undo.type !== 'startup') return { ok: false, error: 'not-undoable' };
    const r = await handlers.setStartupItemEnabled(e.undo.itemId, e.undo.enabled);
    if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'undo-failed' };
    e.undone = true;
    e.undoable = false;
    this._save();
    this.add({
      action: 'startup',
      summary: {
        tr: `Geri alındı: ${e.summary.tr}`,
        en: `Undone: ${e.summary.en}`,
      },
    });
    return { ok: true };
  }
}

// ---------- özet metinleri ----------

function cleanSummary({ categories, deleted, freedBytes, skippedInUse, skippedNoAccess = 0 }) {
  const tr = `Güvenli temizlik: ${categories} kategori, ${formatCount(deleted, 'tr')} dosya silindi (${formatBytes(freedBytes, 'tr')})` +
    (skippedInUse ? `; ${formatCount(skippedInUse, 'tr')} dosya kullanımda olduğu için atlandı` : '') +
    (skippedNoAccess ? `; ${formatCount(skippedNoAccess, 'tr')} dosyaya erişim izni olmadığı için dokunulmadı` : '');
  const en = `Safe cleanup: ${categories} ${categories === 1 ? 'category' : 'categories'}, ${formatCount(deleted, 'en')} files removed (${formatBytes(freedBytes, 'en')})` +
    (skippedInUse ? `; ${formatCount(skippedInUse, 'en')} ${skippedInUse === 1 ? 'file' : 'files'} skipped because ${skippedInUse === 1 ? 'it was' : 'they were'} in use` : '') +
    (skippedNoAccess ? `; ${formatCount(skippedNoAccess, 'en')} ${skippedNoAccess === 1 ? 'file' : 'files'} left alone because of missing permission` : '');
  return { tr, en };
}

function trashSummary({ trashed, freedBytes }) {
  return {
    tr: `${formatCount(trashed, 'tr')} öğe Geri Dönüşüm Kutusu'na taşındı (${formatBytes(freedBytes, 'tr')})`,
    en: `${formatCount(trashed, 'en')} ${trashed === 1 ? 'item' : 'items'} moved to the Recycle Bin (${formatBytes(freedBytes, 'en')})`,
  };
}

function startupSummary({ name, enabled }) {
  return enabled
    ? { tr: `"${name}" başlangıçta yeniden açıldı`, en: `"${name}" re-enabled at startup` }
    : { tr: `"${name}" başlangıçta kapatıldı`, en: `"${name}" disabled at startup` };
}

module.exports = { History, cleanSummary, trashSummary, startupSummary, MAX_ENTRIES };
