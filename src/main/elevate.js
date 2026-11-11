'use strict';
/**
 * "Yönetici olarak yeniden başlat" (yalnızca Windows).
 * PowerShell Start-Process -Verb RunAs ile aynı exe UAC onayıyla başlatılır. Yeni örnek `--elevated` argümanını
 * alır ve eski örnek kapanıp tek örnek kilidini bırakana kadar kilidi bekler (bkz. main.js).
 * Exe yolu ve argümanlar betiğe metin olarak gömülmez; base64 JSON ile verilir (tırnak/enjeksiyon sorunu yok).
 */
const { powershell } = require('../core/exec');

const ELEVATED_FLAG = '--elevated';

/** Windows komut satırı için tek argümanı tırnakla (CommandLineToArgvW kuralları). */
function quoteArg(a) {
  const s = String(a);
  if (s && !/[\s"]/.test(s)) return s;
  let out = '"';
  let bs = 0;
  for (const ch of s) {
    if (ch === '\\') { bs++; continue; }
    if (ch === '"') { out += '\\'.repeat(bs * 2 + 1) + '"'; bs = 0; continue; }
    out += '\\'.repeat(bs) + ch;
    bs = 0;
  }
  return out + '\\'.repeat(bs * 2) + '"';
}

/** Yeniden başlatılacak exe ve argümanlar. Paketliyse exe'nin kendisi; geliştirmede electron + uygulama klasörü. */
function relaunchTarget({ execPath, isPackaged, appPath, extraArgs = [] }) {
  const args = isPackaged ? [] : [appPath];
  return { exe: execPath, args: [...args, ...extraArgs.filter((a) => a !== ELEVATED_FLAG), ELEVATED_FLAG] };
}

function buildElevateScript(exe, args) {
  const payload = Buffer.from(JSON.stringify({ exe, args: args.map(quoteArg).join(' ') }), 'utf8').toString('base64');
  return (
    `$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}'))|ConvertFrom-Json;` +
    'try{' +
    "if($p.args){Start-Process -FilePath $p.exe -ArgumentList $p.args -Verb RunAs -ErrorAction Stop}" +
    'else{Start-Process -FilePath $p.exe -Verb RunAs -ErrorAction Stop};' +
    "'FERAHLA:OK'" +
    '}catch{' +
    '$e=$_.Exception;$c=0;' +
    'while($e){if($e.NativeErrorCode -eq 1223 -or $e.HResult -eq -2147023673 -or $e.Message -match "canceled by the user"){$c=1};$e=$e.InnerException};' +
    "if($c){'FERAHLA:CANCELLED'}else{'FERAHLA:FAIL '+$_.Exception.Message}" +
    '}'
  );
}

/** PowerShell çıktısını sonuca çevir. 1223 = ERROR_CANCELLED (kullanıcı UAC'de "Hayır" dedi). */
function parseElevateOutput(stdout) {
  const s = String(stdout || '');
  if (/FERAHLA:OK/.test(s)) return { ok: true };
  if (/FERAHLA:CANCELLED/.test(s)) return { ok: false, error: 'cancelled' };
  return { ok: false, error: 'relaunch-failed' };
}

/**
 * @returns {Promise<{ok:boolean, error?:string}>}  ok:true ise çağıran mevcut örneği kapatmalıdır.
 */
async function relaunchAsAdmin({ platform = process.platform, execPath, isPackaged, appPath, runner = powershell }) {
  if (platform !== 'win32') return { ok: false, error: 'unsupported' };
  const { exe, args } = relaunchTarget({ execPath, isPackaged, appPath });
  const r = await runner(buildElevateScript(exe, args), { timeout: 120000 });
  return parseElevateOutput(r.stdout);
}

module.exports = { relaunchAsAdmin, relaunchTarget, buildElevateScript, parseElevateOutput, quoteArg, ELEVATED_FLAG };
