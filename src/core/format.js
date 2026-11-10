'use strict';
/** Bayt biçimlendirme (geçmiş özetleri için). tr: "1,5 GB", en: "1.5 GB". */
function formatBytes(n, lang = 'tr') {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = Math.max(0, Number(n) || 0);
  let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  const digits = u === 0 ? 0 : v < 10 ? 1 : 0;
  const s = v.toFixed(digits);
  return `${lang === 'tr' ? s.replace('.', ',') : s} ${units[u]}`;
}

function formatCount(n, lang = 'tr') {
  return Number(n || 0).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US');
}

module.exports = { formatBytes, formatCount };
