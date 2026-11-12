# Ferahla

**"C: neden doldu, bilgisayar neden yavaş açılıyor?"** sorusunu görsel olarak yanıtlayan, yalnızca güvenli olanı silen
ve yaptığını geri alınabilir şekilde kaydeden Windows bakım aracı.

Reklam yok, satış ekranı yok, hesap yok, veri toplama yok. Kurulum gerektirmeyen tek bir `.exe`.
Türkçe öncelikli (TR/EN), açık/koyu tema. Açık kaynak (MIT).

## Ne yapar?

- **Özet** — sürücülerinizin doluluğu ve tek tıkla kazanılabilecek alan.
- **Güvenli Temizlik** — geçici dosyalar, Geri Dönüşüm Kutusu, küçük resim önbelleği, tarayıcı önbellekleri
  (Chrome, Edge, Brave, Opera, Firefox), Discord / Teams / Spotify / Steam önbellekleri, Windows Update indirmeleri,
  çökme dökümleri ve hata raporları. Her kategoride "Bu ne? Silinirse ne olur?" açıklaması vardır.
  - Tarayıcıların **çerezleri, şifreleri ve geçmişi asla silinmez**; yalnızca önbellek klasörleri.
  - Açık bir programın kullandığı dosyalar atlanır ve "X dosya kullanımda olduğu için atlandı" denir.
  - Geçici dosyalarda son 24 saatte oluşturulanlara dokunulmaz (o an çalışan bir kurulum bozulmasın diye).
- **Disk Haritası** — bir sürücüyü ya da klasörü tarar; neyin yer kapladığını kutucuklarla (treemap) ve boyuta göre
  sıralı listeyle gösterir. 500 bin dosyalık bir diskte bile arayüz donmaz; tarama istenildiği an iptal edilebilir.
- **Büyük Dosyalar** — en büyük dosyalar (varsayılan ≥ 100 MB), türe göre süzme (video, arşiv, kurulum dosyası,
  disk imajı, fotoğraf).
- **Kopya Dosyalar** — aynı içerikteki dosyaları bulur (önce boyut, sonra baş/son 64 KB, sonra tam SHA-1 karşılaştırması).
  Windows ve Program Files klasörleri taranmaz.
- **Başlangıç Programları** — bilgisayar açılırken neyin başladığını, ne işe yaradığını ve kapatılıp kapatılamayacağını
  söyler. Kapatma, Görev Yöneticisi'nin kullandığı yöntemle yapılır: program **silinmez**, tek tıkla geri açılır.
- **Geçmiş** — her işlem tarihiyle kaydedilir. Başlangıç değişiklikleri "Geri al" ile geri alınır; çöpe taşınan dosyalar
  için "Geri Dönüşüm Kutusu'nu aç" düğmesi vardır.

## Ne yapmaz?

- **Kayıt defteri "temizliği" yapmaz.** Riskli ve hiçbir hız kazancı sağlamaz. Kayıt defterinden hiçbir şey silinmez;
  başlangıç ayarları için yalnızca Windows'un kendi "başlangıçta açık/kapalı" işareti değiştirilir.
- **Arka planda çalışmaz.** Pencereyi kapattığınızda Ferahla tamamen kapanır; sistem tepsisi simgesi, zamanlanmış görev,
  hizmet ya da kendini başlangıca ekleme yoktur.
- **Veri toplamaz.** İnternete hiçbir istek göndermez; istatistik, telemetri, reklam yok. Ayarlar ve geçmiş yalnızca
  bilgisayarınızda (`%APPDATA%\Ferahla`) durur.
- **Kişisel dosyalarınızı kalıcı olarak silmez.** Büyük ve kopya dosyalar her zaman Geri Dönüşüm Kutusu'na taşınır.
- **"PC'niz yavaş!" korkutması yapmaz**, sürücü güncelleme ya da "optimizasyon" vaat etmez.

## Güvenlik nasıl sağlanıyor?

- Kalıcı silme yalnızca kategori beyaz listesindeki klasörlerin **içinde** yapılır; klasörün kendisi silinmez.
- Her dosya silinmeden önce gerçek yolu (realpath) denetlenir: `..` hileleri, kısayol/sembolik bağlantı (symlink) ve
  junction kaçışları, sürücü kökü, kullanıcı klasörü, Windows ve Program Files reddedilir. Bu kurallar birim testlerle
  kanıtlanır (`tests/unit/safety.test.js`).
- Bağlantılar (symlink/junction) taranırken ve silinirken **takip edilmez**; en fazla bağlantının kendisi kaldırılır.
- Ferahla yönetici izni istemeden açılır. Yönetici gerektiren kategoriler (Windows Temp, Windows Update) yalnızca
  işaretlenir; isterseniz Ferahla'yı "Yönetici olarak çalıştır" ile açabilirsiniz.

## Kullanım

1. [Sürümler](../../releases) sayfasından `Ferahla-x.y.z-portable.exe` dosyasını indirin.
2. Çift tıklayın. Kurulum yok; dosyayı istediğiniz yere taşıyabilirsiniz.

> Windows SmartScreen "tanınmayan uygulama" uyarısı verebilir (uygulama kod imzalı değil): **Ek bilgi → Yine de çalıştır**.

## Geliştirme

Gereksinim: Node.js 20+.

```bash
npm install
npm start            # uygulamayı başlat (Linux'ta ekransız ortamda: xvfb-run -a npm start)
npm test             # birim testler (node --test)
npm run test:e2e     # uçtan uca testler (Playwright _electron, xvfb-run -a ile)
npm run dist         # Windows portable .exe (dist/ klasörüne)
```

Proje yapısı:

| Yol | İçerik |
|---|---|
| `main.js` | Ana süreç: pencere, tek örnek kilidi, güvenlik ayarları |
| `preload.js` | Arayüzün gördüğü tek API: `window.ferahla` (bkz. `docs/SPEC.md`) |
| `src/main/` | IPC işleyicileri, ayarlar |
| `src/core/` | Electron'dan bağımsız çekirdek: tarama (worker_threads), güvenlik, temizlik, başlangıç, geçmiş |
| `src/core/platform/` | `win32.js` (reg.exe, PowerShell, tasklist) ve `linux.js` (geliştirme/test) — aynı arayüz |
| `src/renderer/` | Arayüz (vanilla JS + CSS) |

Yerel (native) modül yoktur; Windows'a özgü işler `reg.exe` ve `powershell.exe -NoProfile` ile yapılır.

Test için ortam değişkenleri: `FERAHLA_USER_DATA` (ayarlar/geçmiş klasörü), `FERAHLA_TEST_ROOT` (Linux'ta tüm kullanıcı
yollarını — önbellekler, çöp kutusu, autostart, geçici dosyalar — bu klasörün altına yönlendirir; gerçek dosyalara
dokunmadan temizlik denemek için).

## Geliştiriciler için: Windows'ta elle doğrulanması gerekenler

Ferahla Linux konteynerinde geliştirilip test edildi; Windows'a özgü kod ayrıştırma mantığı ayrılarak örnek çıktılarla
birim testlendi. Aşağıdakiler gerçek Windows'ta doğrulanmalıdır:

1. **Kayıt defteri okuma:** `reg query` çıktısı `chcp 65001` ile UTF-8 geliyor mu (Türkçe karakterli değer adları);
   HKCU/HKLM `Run` ve `WOW6432Node` öğeleri listeleniyor mu.
2. **Başlangıç aç/kapat:** `reg add` ile `StartupApproved\Run` (02 = açık, 03 + FILETIME = kapalı) yazılıyor ve Görev Yöneticisi >
   Başlangıç aynı durumu gösteriyor mu; HKLM yalnızca yöneticiyle; Run değerlerinden hiçbir şey silinmiyor; Geçmiş'ten geri al.
3. **Junction / reparse point:** taramada takip edilmiyor (`C:\Documents and Settings` gibi); OneDrive yer tutucuları indirme
   tetiklemiyor; temizlikte junction yalnızca bağlantı olarak `unlink` ile kaldırılıyor, hedefine dokunulmuyor.
4. **Sürücüler ve yetki:** `Get-CimInstance Win32_LogicalDisk` (yedekleri `wmic`, `fs.statfs`); `net session` ve PowerShell
   `IsInRole` ile yönetici tespiti.
5. **Geri Dönüşüm Kutusu:** `$Recycle.Bin\<SID>` boyut/öğe sayısı (`whoami /user`), `Clear-RecycleBin` ve COM yedeği,
   `explorer shell:RecycleBinFolder`; `shell.trashItem` sonrası Gezgin'den "Geri yükle".
6. **Açık uygulama uyarısı:** `tasklist` ile Chrome/Edge/Firefox/Discord algılanıyor mu (Edge çoğu zaman arka planda çalışır).
7. **Kilitli ve izinsiz dosyalar:** açık dosyalar `EBUSY` → `skippedInUse`; erişim reddi `EPERM/EACCES` → `skippedNoAccess`;
   salt okunur öznitelikte `chmod` sonrası yeniden deneme. (Windows'ta bazı "kullanımda" durumları `EPERM` olarak gelebilir.)
8. **Kategori yolları:** Teams (yeni EBWebView / klasik), Opera GX, Spotify (klasik ve Mağaza sürümü), Steam `htmlcache`,
   `thumbcache_*.db`, CrashDumps, WER — profil klasöründe çerez/şifre/geçmiş dosyalarına dokunulmadığını doğrulayın.
9. **Paket:** portable `.exe` açılıyor; tarama worker'ı `app.asar.unpacked` içinden yükleniyor; 8.3 kısa adlı `%TEMP%`;
   `relaunchAsAdmin` (UAC kabul/iptal, `PORTABLE_EXECUTABLE_FILE`) ve tek örnek kilidinin `--elevated` ile devri.
10. **Başlangıç ayrıntıları:** `.lnk` hedefi ve exe yayıncısı için PowerShell betiği; bilinen program eşleşmesi gerçek listeyle
    (Steam, Teams, TeamSpeak, Opera GX).

## Lisans

MIT

---

## English

**Ferahla** ("breathe easy" in Turkish) is a free, open-source Windows maintenance tool that visually answers
*"Why is my C: drive full and why does my PC boot slowly?"* — and only removes what is safe to remove.

- **Safe Cleanup:** temp files, Recycle Bin, thumbnail cache, browser caches (Chrome, Edge, Brave, Opera, Firefox —
  never cookies, passwords or history), Discord/Teams/Spotify/Steam caches, Windows Update downloads, crash dumps,
  error reports. Files in use are skipped and counted.
- **Disk Map:** treemap + sorted folder list; scans run in a worker thread, stay responsive with 500k files, cancellable.
- **Large files** and **duplicate files** (size → first/last 64 KB → full SHA-1). Your files always go to the Recycle Bin.
- **Startup programs** with plain-language advice; toggled via Windows' own `StartupApproved` flag (nothing is deleted,
  fully reversible).
- **History** of every action, with undo for startup changes.

**What it does not do:** no registry "cleaning", no background process or tray icon, no telemetry or network requests,
no scare tactics. Portable single `.exe`, runs without admin rights. MIT licensed.
