# Ferahla — Ürün Şartnamesi ve Ekip Sözleşmesi

**Tek cümle:** "C: neden doldu, bilgisayar neden yavaş açılıyor?" sorusunu görsel olarak yanıtlayan, yalnızca güvenli
olanı silen ve yaptığını geri alınabilir şekilde kaydeden, reklamsız, veri toplamayan Windows PC bakım aracı.

Geliştiricinin diğer uygulamalarıyla (Zamanlayıcı, FlacSync, Yakala, OtoTık) aynı çizgide:
Türkçe öncelikli (TR/EN), açık/koyu tema, kurulumsuz tek .exe, açık kaynak (MIT).
CCleaner'ın tersine: arka planda çalışmaz, satış ekranı yok, kayıt defteri "temizliği" YOK (riskli ve faydasız).

## Teknoloji
- Electron 33 (`electron@33`), saf JavaScript (CommonJS ana süreç, renderer'da vanilla JS + CSS; treemap için `d3-hierarchy`
  renderer'a yerel dosya olarak kopyalanabilir veya squarify algoritması elle yazılabilir — CDN yok, çevrimdışı çalışmalı).
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; renderer sadece `window.ferahla` API'sini görür.
- Disk taraması: ana süreçte değil **worker_threads** içinde, `fs.promises.opendir` ile; symlink/junction (reparse point) **takip edilmez**;
  erişim hatası (EPERM/EACCES/EBUSY) sessizce sayılıp atlanır. Hedef: 500k dosyada arayüz donmaz, ilerleme akar, iptal edilebilir.
- Windows'a özgü işler `child_process` ile `reg.exe` / `powershell.exe -NoProfile` (yerel modül YOK, derleme gerekmesin).
- **Platform katmanı**: `src/core/platform/win32.js` ve `src/core/platform/linux.js` aynı arayüzü uygular. Linux uygulaması bu
  konteynerde geliştirme/test içindir (ör. `~/.cache`, `/tmp`, `~/.config/autostart`), böylece her şey burada test edilebilir.
- Silme: kullanıcı dosyaları (büyük/kopya dosyalar) **her zaman** `shell.trashItem` ile Geri Dönüşüm Kutusu'na. Önbellek/temp
  kategorileri kalıcı silinir ama yalnızca beyaz listedeki klasörlerin **içeriği** silinir, klasörün kendisi değil.
- Testler: birim `node --test` (tests/unit), uçtan uca Playwright `_electron` (tests/e2e) — `xvfb-run -a` ile.

## Özellikler (öncelik sırasıyla)
1. **Özet ekranı**: sürücüler (dolu/boş çubuğu), "Kazanılabilecek alan" toplamı, tek tık "Güvenli Temizlik".
2. **Güvenli temizlik kategorileri** (her biri: ad, açıklama "Bu ne? Silinirse ne olur?", boyut, öğe sayısı, onay kutusu):
   Kullanıcı Temp (`%TEMP%`), Windows Temp (yönetici gerekir → `requiresAdmin`), Geri Dönüşüm Kutusu, küçük resim önbelleği
   (`%LOCALAPPDATA%\Microsoft\Windows\Explorer\thumbcache_*.db`), Chrome/Edge/Brave/Opera/Firefox önbellekleri (çerezler,
   şifreler, geçmiş ASLA), Discord/Teams/Spotify/Steam (htmlcache) önbellekleri, Windows Update indirmeleri
   (`C:\Windows\SoftwareDistribution\Download`, yönetici), çökme dökümleri (`%LOCALAPPDATA%\CrashDumps`), Windows Hata Raporlama.
   Çalışan uygulamanın kilitli dosyaları atlanır ve "X dosya kullanımda olduğu için atlandı" denir.
   Tarayıcı açıksa uyarı: "Önce Chrome'u kapatın".
3. **Disk haritası**: seçilen sürücü/klasör için treemap + klasör ağacı listesi (boyuta göre sıralı), tıklayınca içine gir,
   ekmek kırıntısı ile geri çık, "Klasörde göster".
4. **Büyük dosyalar**: en büyük N dosya (varsayılan 100, ≥ 100 MB), türe göre filtre (video, arşiv, kurulum dosyası, disk imajı),
   seç → Geri Dönüşüm'e taşı.
5. **Kopya dosyalar**: boyut eşleşmesi → ilk/son 64 KB hash → tam hash (sha1) kademeli; gruplar halinde göster, her gruptan
   biri otomatik "tut" işaretli; seçilenleri Geri Dönüşüm'e taşı. Sistem klasörleri (Windows, Program Files) taranmaz.
6. **Başlangıç programları**: HKCU/HKLM `...\CurrentVersion\Run`, Başlangıç klasörleri. Her öğe: ad, komut, kaynak, yayıncı (varsa),
   "Bu nedir?" açıklaması (`src/core/startup-known.json` sözlüğü: Discord, Spotify, Steam, Epic, OneDrive, Teams, Adobe, NVIDIA,
   Realtek, Microsoft Edge vb. — "Kapatılabilir / Kapatmayın" önerisiyle). Aç/kapat Görev Yöneticisi'nin kullandığı
   `...\Explorer\StartupApproved\Run` anahtarıyla yapılır (silme değil, geri alınabilir).
7. **Geçmiş**: her işlem (tarih, ne yapıldı, kaç dosya, ne kadar alan) `%APPDATA%\Ferahla\history.json`'a yazılır;
   Geri Dönüşüm'e taşınanlar için "Geri Dönüşüm Kutusu'nu aç", başlangıç değişiklikleri için "Geri al".
8. Ayarlar: dil (TR/EN), tema (sistem/açık/koyu), hariç tutulan klasörler.

## Dosya sahipliği (ÇAKIŞMAYI ÖNLEMEK İÇİN KESİN)
| Alan | Sahibi |
|---|---|
| `package.json`, `main.js`, `preload.js`, `src/main/**`, `src/core/**`, `tests/unit/**`, `electron-builder.yml`, `README.md` | **Yazılımcı** |
| `src/renderer/**` (index.html, styles.css, app.js, i18n.js, treemap.js, mock-api.js, ikonlar), `assets/**`, `docs/DESIGN.md` | **Tasarımcı** |
| `tests/e2e/**`, `docs/TEST_REPORT.md` | **Test edici** |

Başkasının alanındaki bir değişiklik gerekiyorsa dosyayı düzenleme; `docs/NOTES.md` dosyasına "[Kimden → Kime] istek" diye ekle.

## IPC sözleşmesi — `window.ferahla` (preload.js, `contextBridge`)
Hepsi Promise döner. Boyutlar bayt (number). Hata olursa reject değil, `{ ok:false, error:'kod', message }` döner.
```
getAppInfo() -> { version, platform, isAdmin:boolean }
getSettings() -> { lang:'tr'|'en', theme:'system'|'light'|'dark', excludedPaths:string[] }
setSettings(partial) -> settings
listDrives() -> [{ path, label, totalBytes, freeBytes }]
scan({ root }) -> { scanId }
cancelScan() -> { ok:true }
onScanProgress(cb) -> unsubscribe   // cb({ scanId, files, dirs, bytes, currentPath })
onScanDone(cb) -> unsubscribe       // cb({ scanId, ok, root, totalBytes, files, dirs, skipped, durationMs, error? })
getChildren(path) -> [{ name, path, isDir, sizeBytes, fileCount }]   // son taramanın önbelleğinden, boyuta göre azalan
findLarge({ minBytes?, limit?, types?:string[] }) -> [{ path, name, sizeBytes, mtimeMs, type:'video'|'archive'|'installer'|'image'|'disk'|'other' }]  // son taramadan
findDuplicates({ minBytes? }) -> { groups:[{ hash, sizeBytes, files:[{ path, mtimeMs }] }], wastedBytes }  // son taramadan, ilerleme onScanProgress ile
trashItems(paths:string[]) -> { ok, trashed:number, failed:[{ path, error }], freedBytes }
getCleanupCategories() -> [{ id, name:{tr,en}, description:{tr,en}, sizeBytes, itemCount, requiresAdmin:boolean,
                             available:boolean, warning?:{tr,en} /* ör. tarayıcı açık */ }]
cleanCategories(ids:string[]) -> { ok, freedBytes, deleted:number, skippedInUse:number, results:[{ id, freedBytes, error? }] }
onCleanProgress(cb) -> unsubscribe  // cb({ id, percent })
getStartupItems() -> [{ id, name, command, source:'HKCU Run'|'HKLM Run'|'Startup folder'|'Autostart', enabled:boolean,
                        publisher?, known?:{ description:{tr,en}, advice:'safe-to-disable'|'keep'|'unknown' } }]
setStartupItemEnabled(id, enabled) -> { ok, error? }
getHistory() -> [{ id, at, action:'clean'|'trash'|'startup', summary:{tr,en}, freedBytes?, undoable:boolean }]
undoHistory(id) -> { ok, error? }      // başlangıç değişikliklerini geri alır
openRecycleBin() -> void
revealInFolder(path) -> void
pickFolder() -> string|null           // klasör seçme penceresi (iptal = null)
relaunchAsAdmin() -> { ok, error? }   // win32: UAC ile yönetici olarak yeniden başlatır, başarılıysa bu örnek kapanır;
                                      // UAC iptal = error:'cancelled', linux = error:'unsupported'
```
Tasarımcı `src/renderer/mock-api.js` yazar: `window.ferahla` yoksa gerçekçi sahte veriyle aynı sözleşmeyi taklit eder; böylece
arayüz tarayıcıda (Playwright ile) tek başına önizlenebilir. Gerçek uygulamada preload API'si varsa mock devreye girmez.

## Kalite çıtası (GÜVENLİK EN ÖNEMLİ ŞEY)
- Beyaz liste dışında hiçbir yol silinemez (birim testle kanıtlı); `..`, symlink, junction kaçışları engellenir.
- Kullanıcı dosyaları kalıcı silinmez, yalnızca Geri Dönüşüm'e gider. Kayıt defterinden hiçbir şey silinmez.
- Her işlemde Türkçe, teknik olmayan, ne yapılacağını söyleyen hata mesajı.
- `npm start` (Linux'ta `xvfb-run -a npm start`) çalışır; `npm test` birim testleri; `npm run test:e2e` uçtan uca.
