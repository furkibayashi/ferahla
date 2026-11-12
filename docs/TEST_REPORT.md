# Ferahla — Test Raporu

**Test edilen sürüm:** `main` @ `33ddc00` (0.1.0) · **Tarih:** 2026-11-12 · **Test Edici:** Test Edici (Claude)
**Ortam:** Linux konteyner (root, 4 çekirdek), Node 22, Electron 45.3.0, Playwright 1.63 (`_electron`), `xvfb-run -a`,
deviceScaleFactor 1.

## Güvenlik önlemleri (testlerin kendisi için)
Ferahla dosya sildiği için **her** başlatma `tests/e2e/helpers.js` içindeki `launchApp()` üzerinden yapılır. Bu işlev:
- `FERAHLA_USER_DATA=<sandbox>/userdata`, `FERAHLA_TEST_ROOT=<sandbox>/root`, `XDG_DATA_HOME=<root>/home/.local/share` ortam değişkenleri
  yoksa, ya da e2e geçici kökünün (`FERAHLA_E2E_TMP`) dışını gösteriyorsa uygulamayı **başlatmaz**. Ek olarak `HOME` ve `XDG_CONFIG_HOME` de korumalı alana yönlenir.
- Ana süreçte `listDrives`'ı korumalı alandaki bir klasörle değiştirir (arayüz gerçek `/` sürücüsünü taratamaz); yönlendirme
  başarısızsa uygulamayı kapatır. `shell.showItemInFolder/openPath/openExternal` yalnızca kaydedilir.
- Tarama yardımcıları (`scanIPC`, `scanUI`) ve tüm fikstür yazımları kök denetiminden (`assertSafe`) geçer.
- Gerçek sistem yollarına yönelik her `trashItems` isteği önce test sürecinde aynı çekirdek modülle (`src/core/safety.js`) "kuru"
  denetlenir; modül kabul edecekse ve yol korumalı alanın dışındaysa istek gönderilmez (hiç gerekmedi: hepsi reddedildi).
- Root olarak çalışılsa da dosya izinlerine uyulsun diye uygulama `setpriv` ile DAC yetkileri düşürülerek başlatılır
  (erişilemeyen klasör ve salt okunur dosya senaryoları bu sayede gerçekçi).
- Uygulamanın kendi `TMPDIR`'i kısa bir sistem geçici klasörüdür (Chromium soket yolu ≤ 107 bayt); `FERAHLA_TEST_ROOT` varken
  Ferahla hiçbir kategori için `TMPDIR` kullanmaz (`linux.js bases()`). Kapanışta silinir.

## Nasıl çalıştırılır
```bash
npm test                                         # birim (71 test, 0,7 sn)
xvfb-run -a npm run test:e2e                     # uçtan uca (27 test, ~1 dk)
xvfb-run -a npm run test:e2e -- --workers=1      # performans ölçümleri için önerilen
# İsteğe bağlı: FERAHLA_E2E_TMP=<korumalı alan kökü>  FERAHLA_E2E_OUT=<ekran görüntüsü/ölçüm klasörü>
```
Not (FER-005): `@playwright/test` `devDependencies`'te yok; betik konteynerdeki genel `playwright` kurulumuyla çalıştı.
Kanıt dosyaları bu koşuda `/tmp/claude-0/-home-user/b303732c-6774-565f-bebf-76e257d70a06/scratchpad/fer-out-final/`
altındadır (geçici; testler yeniden çalıştırılınca aynı adlarla üretilir).

## Özet

| Alan | Test | Geçti | Kaldı |
|---|---:|---:|---:|
| Birim testleri (`npm test`, 0,74 sn) | 71 | 71 | 0 |
| Tarama ve disk haritası (bilinen ağaç, symlink döngüsü, erişilemeyen klasör, 100k dosya, iptal, içine gir/ekmek kırıntısı/treemap) | 4 | 4 | 0 |
| Büyük dosyalar ve kopyalar (türler, hariç tutma, gerçek kopya / aynı boyut farklı içerik, "tut" kilidi, çöpe taşıma) | 4 | 4 | 0 |
| Güvenli temizlik (kategori boyutları, 24 saat kuralı, salt okunur, symlink hedefi, çerez/şifre korunur, uygulama açık uyarısı, IPC) | 4 | 4 | 0 |
| Güvenlik (IPC saldırıları, trashItems kapsamı, yalıtım, CSP, izinler, preload ↔ sözleşme, IPC yüzeyi, gönderen, gezinme) | 9 | 8 | 1 |
| Başlangıç programları ve geçmiş (aç/kapat, "Kapatmayın" uyarısı, geri al, symlink'li .desktop) | 1 | 0 | 1 |
| Ayarlar, dil, tema (kalıcılık, hariç klasörler, TR↔EN çevrilmemiş metin avı) | 2 | 1 | 1 |
| Arayüz / erişilebilirlik (yalnızca klavyeyle temizlik, 800×560 açık/koyu taşma + ekran görüntüleri, konsol hataları) | 3 | 3 | 0 |
| **Toplam uçtan uca** | **27** | **24** | **3** |

İki tam koşuda (1 ve 2 işçi) sonuç aynı; kararsız test yok. Kalan 3 test FER-001, FER-002 ve FER-003'e karşılık gelir
(başlangıç ve ayarlar testleri `expect.soft` ile hata kaydedip akışın geri kalanını doğrulamaya devam eder; o adımlar geçti).

**Hata dağılımı:** Kritik 0 · Yüksek 1 · Orta 1 · Düşük 3 (toplam 5).

### Ana doğrulamalar (geçenler)
- **Tarama doğruluğu:** bilinen ağaçta toplam 5 060 096 bayt / 11 dosya birebir; sabit bağlantı bir kez sayılıyor; `getChildren` boyuta göre azalan ve
  klasör boyut/dosya sayıları doğru. Symlink döngüsü (`dongu → .`, `geri-don → kök`), dışarıyı gösteren klasör ve dosya bağlantıları (50 MB) **takip edilmiyor**;
  FIFO atlanıyor; erişilemeyen klasör `skipped:1` olarak sayılıp atlanıyor. Hatalı kökler (`yok`, dosya, göreli, boş) anlaşılır hata.
- **100 000 dosya:** tarama 1,1–1,8 sn, 12–18 ilerleme olayı, arayüzde en uzun kare boşluğu 33–67 ms (donma yok), sonuç 100 000 dosya / 10 000 000 bayt.
  İptal: "iptal edildi" bildirimi, önceki taramanın ağacı sorgulanabilir kalıyor, ardından yeni tarama çalışıyor.
- **Disk haritası:** sürücü düğmesiyle tarama, listeden içine girme, 3 seviyeli ekmek kırıntısı (`aria-current="location"`), Alt+← ile üst klasör,
  kırıntıdan köke dönüş, treemap hücresine tıklama, "Klasörde göster".
- **Büyük dosyalar:** ≥ 100 MB, sıralı, türler (disk/video/arşiv/kurulum) doğru; `node_modules` ve hariç tutulan klasör atlanıyor; tür çipleri ve limit çalışıyor.
- **Kopyalar:** 3'lü ve 2'li gerçek kopya grupları bulundu; baş ve son 64 KB'ı aynı, ortası farklı dosyalar ve sondan farklı dosya **ayrıldı**;
  hariç klasördeki kopya yok; israf 9 MB doğru. Arayüzde en eski kopya "Tutulacak" (onay kutusu yok); "Tüm fazla kopyaları seç" yalnızca fazlaları seçiyor.
- **Çöpe taşıma:** onay penceresinde ilk odak *Vazgeç*; Esc → hiçbir dosya değişmedi (anlık görüntü karşılaştırması). Onaylayınca dosyalar **test çöpüne**
  (`<root>/home/.local/share/Trash/files`, `.trashinfo` ile) gitti, kaynaktan kalktı, çöpteki içerik asılla aynı (geri getirilebilir), geçmişe yazıldı.
- **Güvenli temizlik:** kategori boyut/öğe sayıları birebir; 24 saatten yeni dosya ve yeni klasör korunuyor; salt okunur klasördeki dosya atlanıp sayılıyor;
  Chrome `Cookies / Login Data / History / Bookmarks / Preferences`, Firefox `cookies.sqlite`, Discord `Local Storage` **dokunulmadan** kaldı;
  kategori klasörlerinin kendisi silinmedi; kategori içindeki dışarıyı gösteren dosya/klasör symlink'lerinin **yalnızca kendisi** kaldırıldı, hedefler
  (kanarya dosyaları) SHA-1 ile birebir aynı; kökü symlink olan kategori (Spotify) "yok" sayıldı ve dokunulmadı; Geri Dönüşüm Kutusu kendiliğinden seçilmedi.
  "discord" adlı bir süreç çalışırken Discord kategorisi devre dışı + amber uyarı. Geçersiz kimlikler (`'../../etc'`, `'/tmp'`, dizi yerine string, sayı, nesne) reddedildi;
  eşzamanlı ikinci temizlik `busy`.
- **IPC saldırıları (trashItems):** `..`, `kacis-etc/passwd` (symlink kaçışı), test kökü, ev klasörü, `.cache/.config/.local/share`, `/`, `/etc/passwd`, `/usr/bin/env`,
  `/root`, `/home`, `/proc/self/environ`, hariç tutulan klasör ve içindeki dosya, boş/boşluk/göreli/`~`/NUL'lu/40 000 karakterlik yol, dizi yerine string/null/nesne,
  dizide null/sayı — **hepsi reddedildi**, korumalı alanda hiçbir dosya değişmedi, gerçek `/etc/passwd` aynı.
- **Yalıtım:** `require/process/Buffer/module` yok; `contextIsolation`, `sandbox`, `webSecurity` açık; `window.ferahla` dondurulmuş; CSP satır içi betiği,
  `on*` özniteliğini ve dış görseli engelliyor; bildirim/konum/kamera/mikrofon izinleri `denied`.
- **Preload = sözleşme:** tam 23 işlev, eksik/fazla yok; `relaunchAsAdmin` Linux'ta `unsupported`.
- **IPC yüzeyi:** Electron 45'in boş uygulamada da kaydettiği iç kanal (`IMPORT_SHARED_TEXTURE_RELEASE_RENDERER_TO_MAIN`) taban çizgisiyle çıkarıldıktan sonra
  yalnızca 20 `ferahla:*` sözleşme kanalı; senkron dinleyici yok. Başka kökenden / başka `file://` sayfasından gelen istek `forbidden-sender`.
- **Başlangıç:** `.desktop` dosyasında `X-GNOME-Autostart-enabled=false` yazılıyor, `Exec` korunuyor; "Kapatmayın" (OneDrive) öğesinde uyarı penceresi, ilk odak
  *Vazgeç*, Esc → değişiklik yok; symlink'li `.desktop`'un hedef dosyası değişmiyor; Geçmiş'ten "Geri al" çalışıyor, "Geri alındı" rozeti, ikinci kez `not-undoable`;
  `autostart::../../...` kimliği reddediliyor.
- **Ayarlar:** tema anında (zemin `#F3F7F5` / `#0C1412`, `nativeTheme`), dil/tema/hariç klasör yeniden başlatmada korunuyor; hariç klasör kopya aramasında
  gerçekten atlanıyor; bozuk `settings.json` → Türkçe/sistem varsayılanı; `setSettings` çöp girdiyi temizliyor.
- **TR↔EN:** 10 ekran durumunda (özet, temizlik, "Bu ne?", onay penceresi, harita, büyük, kopyalar, başlangıç, geçmiş, ayarlar) ham anahtar, EN'de Türkçe metin,
  iki dilde aynı kalan metin **yok**; TR/EN sözlükleri 287/287 anahtar.
- **Arayüz:** 800×560'ta açık ve koyu temada tüm ekranlar + sonuç ekranı taşmasız (kenar menüsü ikon moduna geçiyor); yalnızca klavyeyle
  Tab → Güvenli Temizlik → Enter → Enter akışı tamamlanıyor, tüm duraklarda görünür odak halkası, Esc sonrası odak açan düğmeye dönüyor, sonuçta odak başlığa geliyor.
  Tüm UI testlerinde konsol hatası yok. Ekran görüntüleri (`min-light-*.png`, `min-dark-*.png`, `clean-*.png`, `dups-confirm.png` …) tek tek incelendi:
  bozuk ya da üst üste binen öğe görülmedi.

---

## Hatalar

### FER-001 — `trashItems` renderer'dan gelen HER korunmasız yolu kabul ediyor (tarayıcı profili, kategori kökü, uygulama verisi, tüm klasörler)
- **Önem:** Yüksek · **Sorumlu:** Yazılımcı-2
- **Test:** `security.spec.js` › "trashItems kapsamı …" (KALDI)
- **Adımlar:** Tarama yapmadan, renderer'dan `window.ferahla.trashItems([...])` ile şunları gönder: `~/.cache/thumbnails` (temizlik kategorisi kökü),
  `~/.config/google-chrome` (çerez + kayıtlı şifreler), `FERAHLA_USER_DATA` (Ferahla'nın kendi ayar/geçmiş klasörü), `~/Belgeler/alt` (tüm klasör),
  `~/kacis-disari/gizli.txt` (symlink üzerinden dışarıdaki dosya).
- **Beklenen:** SPEC "Beyaz liste dışında hiçbir yol silinemez" ve sözleşme (`findLarge`/`findDuplicates` "son taramadan"): yalnızca son taramada bulunan
  **dosyalar** taşınabilmeli; kategori kökleri, tarayıcı profilleri, uygulamanın kendi verisi ve klasörler reddedilmeli.
- **Gerçekleşen:** Beşi de `trashed:1` ile Geri Dönüşüm'e taşındı (Chrome profili tümüyle — çerezler ve şifreler dahil; geri yüklenebilir ama oturumlar kapanır).
  Yalnızca `checkTrashable`'ın sabit koruma listesi (ev kökü, `.cache`, sistem klasörleri…) devrede; bunların bir alt klasörü serbest.
  Renderer CSP ile korunuyor, dolayısıyla sömürü için önce renderer'ın ele geçirilmesi ya da arayüzde bir hata gerekir — ama bu sınır,
  "yalnızca güvenli olanı siler" vaadinin ana süreçteki tek güvencesi.
- **Kanıt:** `sec-trash-scope.json` (her hedef `trashed:1`, `stillExists:false`).
- **İlgili yer:** `src/main/ipc.js:127-155` (`trashItems` işleyicisi: yalnızca `safety.checkTrashable`), `src/core/safety.js` `checkTrashable` (244).
  Öneri: yol son taramanın ağacında **dosya** olarak bulunmalı (`scanner.sizeOf(p) !== null` ve dizin değil), kategori kökleri / tarayıcı profil klasörleri /
  `app.getPath('userData')` altı reddedilmeli.

### FER-002 — Başlangıç sözlüğü alt dize eşleşmesiyle yanlış program tanıyor (TeamSpeak → Teams, "Cooperative" → Opera)
- **Önem:** Orta · **Sorumlu:** Yazılımcı-2
- **Test:** `ui-settings.spec.js` › "başlangıç: …" (KALDI, `expect.soft`)
- **Adımlar:** Autostart'a `Name=TeamSpeak 3` ve `Name=Cooperative Notes` içeren `.desktop` dosyaları koy → Başlangıç ekranı.
- **Beklenen:** Sözlükte olmayan programlar "Bilinmiyor — ne olduğunu bilmiyorsanız açık bırakın".
- **Gerçekleşen:** TeamSpeak "Microsoft Teams" açıklamasıyla, "Cooperative Notes" ise "Opera tarayıcısının otomatik başlatması. Kapatılırsa tarayıcıyı siz açarsınız."
  açıklamasıyla **"Kapatılabilir"** gösteriliyor. Kullanıcı tavsiyeye güvenerek bilmediği bir programı kapatabilir; ters yönde, "keep" anahtarları
  (`nvidia`, `realtek`, `google drive` …) da ilgisiz adları yakalayabilir. Windows'ta komut satırı da (`name + command`) aranıyor; yol içinde "steam",
  "opera", "teams" geçen her şey eşleşir.
- **Kanıt:** `startup-items.json`, `min-dark-6-baslangic.png` (Cooperative Notes → Opera açıklaması).
- **İlgili yer:** `src/core/startup.js:103` `matchKnown` (`hay.includes(m)`), `src/core/startup-known.json` (`"teams"`, `"opera"`, `"steam"`, `"zoom"` gibi kısa eşleyiciler).
  Öneri: yürütülebilir dosya adı / kelime sınırı eşleşmesi.

### FER-003 — Geçersiz (göreli) hariç klasör sessizce atılıyor ama arayüz "Klasör eklendi." diyor
- **Önem:** Düşük · **Sorumlu:** Tasarımcı-2
- **Test:** `ui-settings.spec.js` › "ayarlar: …" (KALDI, `expect.soft`)
- **Adımlar:** Ayarlar → Hariç tutulan klasörler → metin kutusuna `goreli/klasor` yaz → Ekle.
- **Beklenen:** "Bu yol geçerli değil; tam klasör yolunu yazın (ör. C:\Oyunlar)" türü alan hatası, listeye eklenmez.
- **Gerçekleşen:** Ana süreç (`settings.sanitize`) yolu atıyor, liste değişmiyor; arayüz yine de "Klasör eklendi." bildirimi gösteriyor, hata yok.
- **Kanıt:** `settings-invalid-excluded.json` (liste 1 öğe, `err` boş, bildirim "Klasör eklendi.").
- **İlgili yer:** `src/renderer/app.js:1244-1253` `addExcluded` (dönen listede yolun olup olmadığına bakmıyor); `src/main/settings.js` `sanitize`.

### FER-004 — İzin hatası (salt okunur) "kullanımda olduğu için atlandı" diye raporlanıyor
- **Önem:** Düşük · **Sorumlu:** Yazılımcı-2
- **Adımlar:** Temp'te yazma izni olmayan bir klasördeki eski dosyayla Güvenli Temizlik.
- **Beklenen:** Dosya atlanır; neden doğru söylenir (izin yok) ya da en azından "kullanımda" denmez.
- **Gerçekleşen:** `skippedInUse:1` ve sonuç ekranında "1 dosya şu an kullanıldığı için atlandı. Bu normaldir…". Kullanıcı programı kapatıp tekrar dener, sonuç değişmez.
- **Kanıt:** `clean-result.json` (`user-temp.skippedInUse: 1`). **İlgili yer:** `src/core/cleanup.js:105` `IN_USE_CODES` (`EACCES`, `EPERM` "kullanımda" sayılıyor).

### FER-005 — `npm run test:e2e` için `@playwright/test` bağımlılığı tanımlı değil
- **Önem:** Düşük · **Sorumlu:** Yazılımcı-2
- **Gerçekleşen:** `package.json` `devDependencies`'te yalnızca `electron` ve `electron-builder` var; betik bu konteynerde genel kurulu `playwright` (1.63) ile çalıştı.
  Temiz bir klonda `npm ci && npm run test:e2e` "playwright: not found" verir. Testler `require('playwright/test')` kullanır (`@playwright/test` kurulunca da çözülür).
- **İlgili yer:** `package.json` (`devDependencies`). Öneri: `"@playwright/test": "^1.63.0"`.

---

## Gözlemler (hata sayılmadı)
- `docs/NOTES.md` "21 fonksiyon" diyor; SPEC ve preload 23 (`pickFolder`, `relaunchAsAdmin`) — not güncellenmeli.
- Koordinatörün sözünü ettiği "Yazılımcı-2'nin NOTES.md'deki 10 maddelik Windows listesi" depoda (`33ddc00` ve geçmişte) bulunamadı;
  aşağıdaki liste test edicinin kendi listesidir.
- Kategori kökünün bir ATASI symlink/junction ise (ör. `~/.cache` başka bir diske bağlı) kök realpath ile çözülür ve oradaki içerik temizlenir. Bu,
  AppData'yı başka sürücüye taşıyan kullanıcılar için istenen davranış olabilir; kökün kendisi symlink ise doğru şekilde reddediliyor.
- Linux'ta root olarak `isAdmin:true` döndüğü için yönetici rozeti/engeli e2e'de görülemedi (Windows'ta elle).
- Kopya grubunda tüm dosyaların değişiklik zamanı aynıysa "Tutulacak" sıradaki ilk dosya oluyor (belirleyici ama açıklanmıyor).

## Windows'ta elle doğrulanması gerekenler
1. **Paket:** `npm run dist` (Windows) → portable `.exe` açılıyor; SmartScreen akışı; tarama worker'ı `app.asar.unpacked` içinden yükleniyor.
2. **Gerçek Geri Dönüşüm Kutusu:** `trashItems` dosyayı Geri Dönüşüm'e taşıyor, Gezgin'den "Geri yükle" çalışıyor; "Geri Dönüşüm Kutusu'nu aç" düğmesi;
   kutuyu boşaltma (PowerShell) ve boyut/öğe sayısı ölçümü.
3. **Kilitli dosyalar:** açık Word/Chrome dosyaları (EBUSY) atlanıp "kullanımda" sayılıyor; salt okunur öznitelikli dosyada `chmod` + yeniden deneme.
4. **Tarayıcı açık uyarısı:** Chrome/Edge/Firefox/Discord çalışırken (tasklist) satır devre dışı, kapatınca "Yeniden kontrol et" ile açılıyor.
5. **Yönetici kategorileri:** yönetici değilken Windows Temp/Update "Yönetici izni gerekir"; "Yönetici olarak yeniden aç" → UAC kabul (yeni pencere, eskisi kapanır) ve
   UAC iptal ("cancelled" bildirimi); yönetici modunda temizlik.
6. **Başlangıç (kayıt defteri):** HKCU Run aç/kapat → `StartupApproved\Run` 02/03 değeri, Görev Yöneticisi > Başlangıç ile aynı durum; HKLM öğeleri yönetici ister;
   Başlangıç klasörü `.lnk`; Run değerlerinden hiçbir şey silinmiyor; Geçmiş'ten geri al. FER-002'yi gerçek program listesiyle (Steam, Teams, TeamSpeak, Opera GX) kontrol edin.
7. **Koruma listesi:** gerçek `%USERPROFILE%`, `%APPDATA%`, `%LOCALAPPDATA%`, `C:\Windows`, `Program Files`, farklı `SystemDrive` (D:), `\\?\` ve UNC yollar, NTFS
   alternatif veri akışı (`dosya.txt:gizli`), junction ile kaçış (`mklink /J`) — `trashItems` ve temizlikte reddediliyor mu (FER-001 düzeltmesiyle birlikte).
8. **Tarama:** 500k dosyalı NTFS C: (süre, donma yok, iptal), OneDrive yer tutucuları (indirme tetiklenmemeli), junction/reparse point'ler takip edilmiyor,
   260+ karakterlik yollar, `pagefile.sys`/`hiberfil.sys` büyük dosyalarda yok.
9. **Kategori yolları:** `thumbcache_*.db` deseni (yalnızca kök seviyesinde), Chrome/Edge/Brave/Opera profilleri (`Profile 1`…), Firefox `cache2`, Teams (yeni/klasik),
   Spotify `Data`, Steam `htmlcache`, CrashDumps, WER — çerez/şifre/geçmiş dosyalarına dokunulmadığını profil klasöründe doğrulayın.
10. **Arayüz:** sürücü etiketleri ve harfleri, Segoe UI Variable, %125/%150 ölçekleme, `forced-colors` yüksek karşıtlık, NVDA/Ekran Okuyucusu duyuruları,
    `pickFolder` diyaloğu, Windows açık/koyu tema "Sistem" canlı geçişi.
