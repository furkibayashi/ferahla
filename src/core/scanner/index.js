'use strict';
/**
 * ScanManager: tarama worker'larını yönetir. Electron'dan bağımsızdır.
 *  - scan(root) yeni bir worker başlatır; tamamlanınca "güncel" worker olur (eski sonlandırılır).
 *  - İptal edilen/başarısız tarama, önceki başarılı taramanın sonucunu bozmaz.
 *  - Sorgular (getChildren/findLarge/findDuplicates) güncel worker'a gider.
 * Olaylar: 'progress' {scanId, files, dirs, bytes, currentPath, phase?}, 'done' {scanId, ok, root, ...}
 */
const { Worker } = require('worker_threads');
const { EventEmitter } = require('events');
const nodePath = require('path');

function defaultWorkerPath() {
  // Paketlenmiş uygulamada worker dosyası asar dışına açılır (electron-builder asarUnpack).
  const p = nodePath.join(__dirname, 'worker.js');
  return p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

class ScanManager extends EventEmitter {
  constructor({ workerPath = defaultWorkerPath(), platform = process.platform } = {}) {
    super();
    this.workerPath = workerPath;
    this.platform = platform;
    this.pending = null; // { worker, scanId, root }
    this.current = null; // { worker, scanId, root, result }
    this.reqs = new Map();
    this.nextReq = 1;
    this.scanSeq = 0;
  }

  get isScanning() { return !!this.pending; }
  get lastScan() { return this.current ? { scanId: this.current.scanId, ...this.current.result } : null; }

  _spawn() {
    const w = new Worker(this.workerPath);
    return w;
  }

  /** @returns {string} scanId */
  scan(root, { skipDirs = [] } = {}) {
    if (this.pending) this._abortPending('superseded');
    const scanId = `s${Date.now().toString(36)}${(++this.scanSeq).toString(36)}`;
    const worker = this._spawn();
    const entry = { worker, scanId, root };
    this.pending = entry;
    worker.on('message', (m) => this._onMessage(entry, m));
    worker.on('error', (e) => this._onWorkerGone(entry, e));
    worker.on('exit', (code) => { if (code !== 0) this._onWorkerGone(entry, new Error(`worker exit ${code}`)); });
    worker.postMessage({ type: 'scan', root, platform: this.platform, skipDirs });
    return scanId;
  }

  cancel() {
    if (this.pending) this.pending.worker.postMessage({ type: 'cancel' });
    if (this.current) this.current.worker.postMessage({ type: 'cancel' });
    return { ok: true };
  }

  _abortPending(reason) {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    p.dead = true;
    p.worker.terminate().catch(() => {});
    this.emit('done', { scanId: p.scanId, ok: false, root: p.root, totalBytes: 0, files: 0, dirs: 0, skipped: 0, durationMs: 0, error: reason });
  }

  _onMessage(entry, m) {
    if (entry.dead) return;
    if (m.type === 'progress') {
      this.emit('progress', { scanId: entry.scanId, files: m.files, dirs: m.dirs, bytes: m.bytes, currentPath: m.currentPath, ...(m.phase ? { phase: m.phase } : {}) });
    } else if (m.type === 'done') {
      if (this.pending !== entry) return;
      this.pending = null;
      const payload = {
        scanId: entry.scanId, ok: !!m.ok, root: m.root || entry.root, totalBytes: m.totalBytes || 0,
        files: m.files || 0, dirs: m.dirs || 0, skipped: m.skipped || 0, durationMs: m.durationMs || 0,
      };
      if (!m.ok) payload.error = m.error || 'scan-failed';
      if (m.ok) {
        const old = this.current;
        this.current = { worker: entry.worker, scanId: entry.scanId, root: payload.root, result: payload };
        if (old) { old.dead = true; this._rejectFor(old.worker); old.worker.terminate().catch(() => {}); }
      } else {
        entry.dead = true;
        entry.worker.terminate().catch(() => {});
      }
      this.emit('done', payload);
    } else if (m.type === 'reply') {
      const r = this.reqs.get(m.reqId);
      if (!r) return;
      this.reqs.delete(m.reqId);
      if (m.error) r.reject(Object.assign(new Error(m.message || m.error), { code: m.error }));
      else r.resolve(m.result);
    }
  }

  _rejectFor(worker) {
    for (const [id, r] of this.reqs) {
      if (r.worker === worker) { this.reqs.delete(id); r.reject(Object.assign(new Error('worker gone'), { code: 'no-scan' })); }
    }
  }

  _onWorkerGone(entry, err) {
    if (entry.dead) return;
    entry.dead = true;
    this._rejectFor(entry.worker);
    if (this.pending === entry) {
      this.pending = null;
      this.emit('done', { scanId: entry.scanId, ok: false, root: entry.root, totalBytes: 0, files: 0, dirs: 0, skipped: 0, durationMs: 0, error: 'scan-failed', message: err && err.message });
    } else if (this.current && this.current.worker === entry.worker) {
      this.current = null;
    }
  }

  /** Güncel worker'a sorgu. Tarama yoksa Error{code:'no-scan'} fırlatır. */
  _query(type, payload) {
    const cur = this.current;
    if (!cur) return Promise.reject(Object.assign(new Error('no scan'), { code: 'no-scan' }));
    const reqId = this.nextReq++;
    return new Promise((resolve, reject) => {
      this.reqs.set(reqId, { resolve, reject, worker: cur.worker });
      cur.worker.postMessage({ type, reqId, ...payload });
    });
  }

  getChildren(path) { return this._query('getChildren', { path }); }
  findLarge(opts) { return this._query('findLarge', { opts }); }

  /** Kopya arama ilerlemesi 'progress' olayıyla (phase: 'partial'|'full'|'done') yayınlanır. */
  findDuplicates(opts) { return this._query('findDuplicates', { opts }); }
  sizeOf(path) { return this._query('sizeOf', { path }); }
  removePaths(paths) { return this.current ? this._query('remove', { paths }) : Promise.resolve([]); }
  stats() { return this._query('stats', {}); }

  async dispose() {
    const ws = [this.pending, this.current].filter(Boolean);
    this.pending = null;
    this.current = null;
    for (const e of ws) { e.dead = true; this._rejectFor(e.worker); }
    await Promise.all(ws.map((e) => e.worker.terminate().catch(() => {})));
  }
}

module.exports = { ScanManager, defaultWorkerPath };
