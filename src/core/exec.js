'use strict';
/** child_process yardımcıları: asla fırlatmaz, kabuk kullanmaz (argüman dizisi), zaman aşımı vardır. */
const { execFile } = require('child_process');

/** Buffer'ı metne çevir: UTF-16LE BOM'u veya bol NUL baytı varsa utf16le, yoksa utf8. */
function decodeOutput(buf) {
  if (!buf) return '';
  if (typeof buf === 'string') return buf;
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.slice(2).toString('utf16le');
  let zeros = 0;
  const n = Math.min(buf.length, 512);
  for (let i = 1; i < n; i += 2) if (buf[i] === 0) zeros++;
  if (n > 8 && zeros > n / 4) return buf.toString('utf16le');
  let s = buf.toString('utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s;
}

/**
 * @returns {Promise<{code:number|null, stdout:string, stderr:string, error?:Error}>}
 */
function run(file, args = [], { timeout = 20000, cwd, env, windowsVerbatimArguments } = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, windowsHide: true, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024, cwd, env, windowsVerbatimArguments }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === 'number' ? err.code : null) : 0;
      resolve({ code, stdout: decodeOutput(stdout), stderr: decodeOutput(stderr), ...(err ? { error: err } : {}) });
    });
  });
}

/** PowerShell betiği çalıştır (UTF-8 çıktı). */
function powershell(script, opts = {}) {
  const prelude = "$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;";
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', prelude + script], { timeout: 30000, ...opts });
}

module.exports = { run, powershell, decodeOutput };
