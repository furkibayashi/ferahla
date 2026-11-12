'use strict';
/**
 * Tarama worker'ı. Bir worker bir taramanın ağacını tutar ve sonraki sorgulara (getChildren, findLarge,
 * findDuplicates, remove) yanıt verir. Mesajlar: { type, reqId, ... }.
 */
const { parentPort } = require('worker_threads');
const { scanTree } = require('./tree');
const queries = require('./queries');

let tree = null;
let cancelFlag = false;

function post(msg) { parentPort.postMessage(msg); }

parentPort.on('message', async (msg) => {
  try {
    switch (msg.type) {
      case 'scan': {
        cancelFlag = false;
        const started = Date.now();
        let res;
        try {
          res = await scanTree(msg.root, {
            platform: msg.platform,
            skipDirs: msg.skipDirs,
            isCancelled: () => cancelFlag,
            onProgress: (p) => post({ type: 'progress', ...p }),
          });
        } catch (e) {
          post({ type: 'done', ok: false, error: e.code === 'ENOENT' || e.code === 'ENOTDIR' ? 'not-found' : (e.code === 'EACCES' || e.code === 'EPERM' ? 'access-denied' : 'scan-failed'), message: e.message, durationMs: Date.now() - started });
          return;
        }
        if (res.cancelled) {
          post({ type: 'done', ok: false, error: 'cancelled', durationMs: Date.now() - started, files: res.files, dirs: res.dirs, skipped: res.skipped, totalBytes: res.bytes });
          return;
        }
        tree = res.tree;
        post({
          type: 'done', ok: true, root: tree.rootPath, totalBytes: tree.totalBytes, files: res.files, dirs: res.dirs,
          skipped: res.skipped, durationMs: Date.now() - started, nodes: tree.n,
        });
        return;
      }
      case 'cancel':
        cancelFlag = true;
        return;
      case 'getChildren': {
        const r = tree ? tree.getChildren(msg.path) : null;
        post({ type: 'reply', reqId: msg.reqId, result: r });
        return;
      }
      case 'findLarge':
        post({ type: 'reply', reqId: msg.reqId, result: tree ? queries.findLarge(tree, msg.opts) : null });
        return;
      case 'findDuplicates': {
        if (!tree) { post({ type: 'reply', reqId: msg.reqId, result: null }); return; }
        cancelFlag = false;
        const r = await queries.findDuplicates(tree, {
          ...msg.opts,
          isCancelled: () => cancelFlag,
          onProgress: (p) => post({ type: 'progress', ...p }),
        });
        post({ type: 'reply', reqId: msg.reqId, result: r });
        return;
      }
      case 'sizeOf': {
        const i = tree ? tree.find(msg.path) : -1;
        post({ type: 'reply', reqId: msg.reqId, result: i >= 0 ? tree.size[i] : null });
        return;
      }
      case 'fileInfo': {
        const i = tree ? tree.find(msg.path) : -1;
        post({ type: 'reply', reqId: msg.reqId, result: i > 0 ? { isDir: tree.isDir(i), size: tree.size[i], mtimeMs: tree.mtime[i] } : null });
        return;
      }
      case 'remove': {
        const ok = tree ? msg.paths.map((p) => tree.remove(p)) : [];
        post({ type: 'reply', reqId: msg.reqId, result: ok });
        return;
      }
      case 'stats': {
        const mem = process.memoryUsage();
        post({ type: 'reply', reqId: msg.reqId, result: { nodes: tree ? tree.n : 0, heapUsed: mem.heapUsed, arrayBuffers: mem.arrayBuffers } });
        return;
      }
      default:
        post({ type: 'reply', reqId: msg.reqId, error: 'unknown-message' });
    }
  } catch (e) {
    post({ type: 'reply', reqId: msg.reqId, error: 'internal', message: e.message });
  }
});
