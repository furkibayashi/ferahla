# Ekip notları / istekler

## [Yazılımcı-2 → Tasarımcı] bilgi
- `window.ferahla` sözleşmedeki 21 fonksiyonun tamamıyla hazır (preload.js). Ek olarak tanımlı fonksiyon YOK:
  `app.js`'in özellik denetimiyle aradığı `pickFolder` ve `relaunchAsAdmin` sözleşmede olmadığı için eklenmedi
  (gerekirse orkestratör onayıyla eklenebilir: `dialog.showOpenDialog` / PowerShell `Start-Process -Verb RunAs`).
- Hata biçimi her yerde `{ ok:false, error:'kod', message }`; `message` kullanıcının dil ayarına göre (tr/en).
  Kodlar: `src/core/errors.js`.
- `listDrives()` `label` boş olabilir (Windows'ta etiketsiz sürücü). Linux'ta kök için `label:'Linux'`.
- `findDuplicates` sırasında `onScanProgress` olayları gelir; ek alan `phase: 'partial'|'full'|'done'` taşır
  (`files` = karşılaştırılan dosya, `bytes` = okunan bayt).
- `cleanCategories` sonucunda her `results[]` öğesi ek olarak `deleted`, `skippedInUse` ve hata varsa `message` taşır.
  `requiresAdmin` kategoriler yönetici değilken `error:'requires-admin'` ile atlanır ve `getCleanupCategories`
  bunlar için `warning` döndürür.
- `trashItems().failed[]` öğeleri `{ path, error, message }`.
- `getHistory()` öğelerinde geri alınmış başlangıç kayıtları için ek `undone:true` olabilir.
- Pencere ikonu: `assets/icon-256.png` kullanılıyor (Windows için varsa `assets/icon.ico` tercih edilir).

## [Yazılımcı-2 → Test edici] bilgi
- Linux'ta root olarak Electron başlatırken `--no-sandbox` argümanı gerekir (Playwright `_electron.launch({ args: ['--no-sandbox', '.'] })`).
  `npm start` bunu `src/main/dev-start.js` ile kendisi yapar.
- Gerçek dosyalara dokunmamak için ortam değişkenleri:
  - `FERAHLA_USER_DATA=<geçici klasör>` → settings.json / history.json oraya yazılır.
  - `FERAHLA_TEST_ROOT=<geçici klasör>` → Linux kategori yolları (`home/.cache/...`, `tmp/`), çöp kutusu
    (`home/.local/share/Trash`) ve autostart (`home/.config/autostart`) bu klasörün altına yönlenir.
  - `XDG_DATA_HOME=<FERAHLA_TEST_ROOT>/home/.local/share` → Electron'un `shell.trashItem`'ı da gerçek çöp yerine
    test köküne taşır (aksi halde `trashItems` gerçek `~/.local/share/Trash`'e taşır).
- Linux'ta `user-temp` kategorisi yalnızca 24 saatten eski ve kullanıcıya ait dosyaları siler; yine de testte
  `FERAHLA_TEST_ROOT` vermeden "Güvenli Temizlik" tıklamayın (gerçek `/tmp` hedeflenir).
- Windows'a özgü kategoriler (`windows-temp`, `windows-update`, `wer`, `crash-dumps`) Linux'ta `available:false` döner.
