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

## [Tasarımcı-2 → Yazılımcı-2] istek
> Durum (Tasarımcı-2): 1, 2 ve 3 karşılandı (053b98e) — arayüz `pickFolder`/`relaunchAsAdmin`'i kullanıyor; teşekkürler. 4 isteğe bağlı.

1. **Pencere boyutu** (main.js): tasarım `width:1100, height:720, minWidth:800, minHeight:560` için yapıldı ve bu ölçülerde
   doğrulandı (≤960 px genişlikte kenar menüsü otomatik ikon moduna geçer). Şu anki 1200×800 / min 900×600 da çalışır;
   uygun görürsen brief'teki değerlere çek.
2. **backgroundColor** (main.js): açılıştaki renk sıçramasını önlemek için arayüz token'larıyla eşle:
   açık `#F3F7F5`, koyu `#0C1412` (şu an `#f6f7f9` / `#16181d`).
3. **İsteğe bağlı API (orkestratör onayıyla)**: `pickFolder() -> string|null` (Ayarlar › Hariç tutulan klasörler için
   "Klasör seç…" düğmesi; yoksa yalnızca metin kutusu görünür) ve `relaunchAsAdmin()` (Temizlik ekranındaki
   yönetici notunda "Yönetici olarak yeniden aç" düğmesi). İkisi de app.js'te özellik denetimiyle bağlı; eklenmezse arayüz bozulmaz.
4. **findLarge**: arayüz `C:\Windows`, `Program Files`, `ProgramData`, `steamapps`, `Epic Games` altındaki dosyaları
   kendi tarafında kilitli gösterip varsayılan olarak gizliyor. İstersen sonuç öğelerine `protected:true` ekleyebilirsin;
   arayüz bunu da dikkate alır (alan isteğe bağlı).
5. Bilgi: kategori kimlikleriniz (`chrome`, `edge`, `discord`, `spotify` …) gruplama için kullanılıyor
   (Windows / Tarayıcılar / Uygulamalar); yeni kategori eklerseniz bilinmeyenler "Windows" grubuna düşer.
   `recycle-bin` hiçbir zaman kendiliğinden seçilmez (kalıcı kayıp). İsteğe bağlı `recommended:boolean` alanı gelirse onu esas alır.

## [Yazılımcı-2 → Tasarımcı-2] yanıt
- 1 ve 2 uygulandı: pencere 1100×720 (min 800×560), backgroundColor açık `#F3F7F5` / koyu `#0C1412`.
- 3 onaylandı ve eklendi (SPEC'e işlendi): `pickFolder() -> string|null`, `relaunchAsAdmin() -> { ok, error? }`
  (Linux'ta `error:'unsupported'`, UAC iptalinde `error:'cancelled'`; başarıda mevcut pencere kendiliğinden kapanır).
- 4: `findLarge` sistem klasörlerini (Windows, Program Files, ProgramData, `$Recycle.Bin`, `node_modules`, `.git`) zaten
  hiç döndürmüyor; `protected` alanı şimdilik eklenmedi. `steamapps`/`Epic Games` (oyun dosyaları) döner.
