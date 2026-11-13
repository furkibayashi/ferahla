## Ferahla v0.1.0 — ilk sürüm

"C: neden doldu, bilgisayar neden yavaş açılıyor?" sorusunu görsel olarak yanıtlar; yalnızca güvenli olanı siler, yaptığını geri alınabilir şekilde kaydeder.

**İndir:** `Ferahla-0.1.0-portable.exe` — kurulum gerektirmez, çift tıkla çalışır.

### Neler var
- **Güvenli temizlik:** geçici dosyalar, tarayıcı/Discord/Teams/Spotify önbellekleri, küçük resim önbelleği, çökme dökümleri, Windows Update artıkları — her birinde "Bu ne? Silinirse ne olur?" açıklaması
- **Disk haritası:** klasörlerin ne kadar yer kapladığını gösteren harita ve liste
- **Büyük dosyalar ve kopyalar:** seç → Geri Dönüşüm Kutusu'na taşı (kalıcı silme yok)
- **Başlangıç programları:** açılışı yavaşlatanları aç/kapat, "Kapatılabilir / Kapatmayın" önerisi; geri alınabilir
- Türkçe / English, açık / koyu tema, geçmiş ve geri alma

### Ne yapmaz
Kayıt defteri "temizliği" yapmaz, arka planda çalışmaz, reklam göstermez, veri toplamaz. Çerezlere, şifrelere ve tarama geçmişine dokunmaz.

### Bilmeniz gerekenler
- **İlk sürüm:** Linux üzerinde 75 birim + 27 uçtan uca testle (silme güvenliği saldırı testleri dahil) doğrulandı; Windows'a özgü kısımlar (kayıt defteri, Geri Dönüşüm Kutusu, yönetici izni) gerçek Windows makinelerde geniş çaplı denenmedi. Sorun görürseniz lütfen Issues'a yazın.
- **SmartScreen uyarısı:** exe dijital olarak imzalı değil. "Windows bilgisayarınızı korudu" ekranında **Ek bilgi → Yine de çalıştır**'a basın. Exe bu depodaki koddan GitHub Actions ile derlenmiştir; `SHA256SUMS.txt` ile doğrulayabilirsiniz.
- Windows Temp ve Windows Update kategorileri için "Yönetici olarak yeniden aç" gerekir.
