'use strict';
/**
 * `npm start` başlatıcısı (yalnızca geliştirme). Electron'u proje kökünde çalıştırır.
 * Linux'ta root olarak (ör. konteyner) çalışırken Chromium, JS çalışmadan önce sandbox denetimiyle
 * durur; bu yüzden YALNIZCA o durumda sandbox kapatılır. Windows'ta ve normal kullanıcıda hiçbir şey değişmez.
 */
const { spawn } = require('child_process');
const path = require('path');
const electronPath = require('electron');

const root = path.join(__dirname, '..', '..');
const env = { ...process.env };
const args = [root, ...process.argv.slice(2)];
if (process.platform === 'linux' && process.getuid?.() === 0) {
  env.ELECTRON_DISABLE_SANDBOX = '1';
  args.push('--no-sandbox');
}
const child = spawn(electronPath, args, { stdio: 'inherit', env, windowsHide: false });
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
