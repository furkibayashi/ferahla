'use strict';
/**
 * trashItems kapı bekçisi (FER-001). Renderer'dan gelen bir yol YALNIZCA şu koşulların hepsi sağlanırsa
 * Geri Dönüşüm Kutusu'na taşınabilir:
 *  1. safety.checkTrashable geçer (mutlak, '..' yok, sistem/korumalı yol değil, hariç tutulmamış),
 *  2. son taramanın ağacında DOSYA olarak var (klasör ve bağlantı kabul edilmez),
 *  3. gerçek konumu (realpath) hâlâ tarama kökünün altında,
 *  4. boyutu ve değişiklik zamanı taramadakiyle aynı (arada değiştirilmemiş / yerine başka şey konmamış),
 *  5. korumalı uygulama verisi köklerinin (tarayıcı profilleri, temizlik kategorisi kökleri, Ferahla'nın kendi verisi,
 *     uygulamanın kurulum klasörü, AppData / ~/.config / ~/.cache / ~/.local/share) altında değil.
 * Aksi halde { ok:false, error:'not_allowed', reason }.
 */
const fs = require('fs');
const nodePath = require('path');
const safety = require('./safety');
const { CATEGORIES, resolveRoots } = require('./cleanup');

/** safety.checkTrashable'ın ret nedenleri (temel güvenlik); diğer nedenler kapsam reddidir. */
const SAFETY_REASONS = new Set(['invalid-path', 'relative-path', 'dotdot', 'not-found', 'protected', 'system-path', 'excluded']);

function deny(reason) {
  return { ok: false, error: 'not_allowed', reason };
}

/**
 * @param {string} p
 * @param {object} ctx { platform?, excludedPaths?, scanRoot:string|null, lookup:(p)=>Promise<{isDir,size,mtimeMs}|null>,
 *                       protectedRoots:string[], realpath?, lstat?, env?, homedir? }
 */
async function checkTrashRequest(p, ctx) {
  const platform = ctx.platform || process.platform;
  const realpath = ctx.realpath || ((x) => fs.realpathSync.native(x));
  const lstat = ctx.lstat || ((x) => fs.lstatSync(x));
  const base = safety.checkTrashable(p, { platform, excludedPaths: ctx.excludedPaths, env: ctx.env, homedir: ctx.homedir, realpath, lstat });
  if (!base.ok) return deny(base.reason);
  if (base.isLink || base.isDir) return deny('not-a-file');
  if (!ctx.scanRoot) return deny('no-scan');

  let info = null;
  try { info = await ctx.lookup(p); } catch (e) { info = null; }
  if (!info) return deny('not-in-scan');
  if (info.isDir) return deny('not-a-file');

  let realRoot;
  try { realRoot = realpath(ctx.scanRoot); } catch (e) { return deny('not-in-scan'); }
  if (!safety.isStrictlyInside(base.realPath, realRoot, platform)) return deny('outside-scan');

  let st;
  try { st = lstat(base.realPath); } catch (e) { return deny('not-found'); }
  if (!st.isFile() || st.isSymbolicLink()) return deny('not-a-file');
  if (st.size !== info.size || Math.abs(st.mtimeMs - info.mtimeMs) > 2) return deny('changed-since-scan');

  for (const r of ctx.protectedRoots || []) {
    if (typeof r !== 'string' || !r) continue;
    let rr = r;
    try { rr = realpath(r); } catch (e) { /* yoksa olduğu gibi karşılaştır */ }
    if (safety.isSameOrAncestor(rr, base.realPath, platform) || safety.isSameOrAncestor(r, p, platform)) return deny('protected-app-data');
  }
  return { ok: true, realPath: base.realPath, size: st.size };
}

/**
 * Korumalı kökler: platformun uygulama verisi kökleri + tüm temizlik kategorisi kökleri + çöp kutusu kökleri
 * + Ferahla'nın kendi verisi ve kurulum klasörleri.
 */
async function protectedTrashRoots({ platform, env = process.env, extra = [] }) {
  const roots = new Set(extra.filter(Boolean));
  for (const r of (platform.appDataRoots ? platform.appDataRoots({ env }) : [])) roots.add(r);
  for (const cat of CATEGORIES) {
    let rs = null;
    try { rs = await resolveRoots(platform, cat.id, env); } catch (e) { rs = null; }
    for (const r of rs || []) roots.add(r.path);
  }
  if (platform.recycleBinRoots) for (const r of platform.recycleBinRoots(env)) roots.add(r.path);
  return [...roots].map((r) => nodePath.normalize(r));
}

module.exports = { checkTrashRequest, protectedTrashRoots, SAFETY_REASONS };
