/*
 * Ferahla — metinler (TR varsayılan, EN) ve biçimlendiriciler.
 * Ses tonu: sakin, "siz" diliyle, teknik olmayan; alarm yok, ünlem yok.
 * Değer bir metin ya da (vars) => metin olabilir. {ad} yer tutucuları vars ile doldurulur.
 */
(function () {
  'use strict';

  const tr = {
    'brand.tag': 'Bilgisayarınıza nefes aldırır',
    'brand.privacy': 'Çevrimdışı çalışır · Veri toplamaz',
    'a11y.skip': 'İçeriğe geç',
    'a11y.nav': 'Bölümler',

    'nav.overview': 'Özet', 'nav.clean': 'Temizlik', 'nav.map': 'Disk Haritası', 'nav.large': 'Büyük Dosyalar',
    'nav.dups': 'Kopyalar', 'nav.startup': 'Başlangıç', 'nav.history': 'Geçmiş', 'nav.settings': 'Ayarlar',
    'nav.scanning': '(taranıyor)',

    'common.retry': 'Tekrar dene', 'common.loading': 'Yükleniyor…', 'common.ok': 'Tamam', 'common.cancel': 'Vazgeç', 'common.close': 'Kapat',
    'common.items': '{n} öğe', 'common.files': '{n} dosya', 'common.total': 'Toplam',
    'common.reveal': 'Klasörde göster', 'common.revealAria': '{name} — klasörde göster',
    'common.selectAll': 'Görünen tüm dosyaları seç', 'common.selectItem': '{name} dosyasını seç', 'common.actions': 'İşlemler',
    'common.selection': 'Seçim', 'common.selectedFiles': '{n} dosya seçildi · {size}', 'common.selectHint': 'Taşımak istediğiniz dosyaları seçin.',
    'common.clearSelection': 'Seçimi kaldır', 'common.toRecycle': "Geri Dönüşüm Kutusu'na taşı",

    'err.title': 'Bir şeyler yolunda gitmedi', 'err.generic': 'Beklenmeyen bir sorun oluştu. Hiçbir dosyaya dokunulmadı.',
    'err.unavailable': 'Bu işlem şu an kullanılamıyor.',

    'welcome.title': "Ferahla'ya hoş geldiniz",
    'welcome.text': 'Ferahla, bilgisayarınızda neyin yer kapladığını gösterir ve yalnızca güvenle silinebilecek olanları temizler.',
    'welcome.p1': 'Siz onaylamadan hiçbir şey silinmez.',
    'welcome.p2': "Kendi dosyalarınız yalnızca Geri Dönüşüm Kutusu'na taşınır; oradan geri alabilirsiniz.",
    'welcome.p3': "Yaptığınız her işlem Geçmiş'te kayıtlı kalır.",
    'welcome.ok': 'Anladım',

    'overview.title': 'Özet',
    'overview.lead': 'Bilgisayarınızın durumu bir bakışta.',
    'overview.reclaimable': 'Güvenle açılabilecek alan',
    'overview.measuring': 'Temizlenebilecek alan hesaplanıyor…',
    'overview.heroSub': ({ n }) => `Geçici dosyalar ve önbellekler (${n} kategori). Belgelerinize, fotoğraflarınıza ve şifrelerinize dokunulmaz.`,
    'overview.nothing': 'Şu an her şey ferah görünüyor',
    'overview.nothingSub': 'Temizlenecek kayda değer bir geçici dosya yok. Yer arıyorsanız Disk Haritası\'na göz atın.',
    'overview.safeClean': 'Güvenli Temizlik',
    'overview.seeDetails': 'Neler silinecek?',
    'overview.waiting': 'Bekleyenler: {list}. Ayrıntılar Temizlik ekranında.',
    'overview.drives': 'Sürücüler',
    'overview.more': 'Daha fazla yer mi gerekiyor?',
    'overview.tileMap': 'Diski ne dolduruyor?', 'overview.tileMapSub': 'Klasörleri boyutlarıyla haritada görün',
    'overview.tileLarge': 'En büyük dosyalarınız', 'overview.tileLargeSub': 'Unutulmuş videolar, kurulum dosyaları, disk imajları',
    'overview.tileStartup': 'Açılış hızı', 'overview.tileStartupSub0': 'Açılışta başlayan programlar',
    'overview.tileStartupSub': ({ n, m }) => `${n} program açılışta başlıyor${m ? `, ${m} tanesi kapatılabilir` : ''}`,

    'drive.local': 'Yerel Disk',
    'drive.free': 'boş',
    'drive.level.ok': 'Rahat', 'drive.level.warn': 'Dolmaya başlıyor', 'drive.level.crit': 'Neredeyse dolu',
    'drive.meta': '{used} dolu · toplam {total}',
    'drive.usedAria': 'Doluluk {pct}',
    'drive.inspect': 'Bu sürücüyü incele',

    'clean.title': 'Temizlik',
    'clean.lead': 'Yalnızca geçici dosyalar ve önbellekler. Önerilenler sizin için seçildi; her birinin ne olduğunu "Bu ne?" ile görebilirsiniz.',
    'clean.measuring': 'Klasörler ölçülüyor…',
    'clean.selectRecommended': 'Önerilenleri seç', 'clean.selectNone': 'Hiçbirini seçme', 'clean.recheck': 'Yeniden kontrol et',
    'clean.group.system': 'Windows', 'clean.group.browsers': 'Tarayıcılar', 'clean.group.apps': 'Uygulamalar',
    'clean.whatIsThis': 'Bu ne?',
    'clean.empty': 'Boş',
    'clean.badgeAdmin': 'Yönetici izni gerekir', 'clean.badgeNoUndo': 'Geri getirilemez',
    'clean.adminReason': "Bu klasörü Windows korur. Temizlemek için Ferahla'yı yönetici olarak açmanız gerekir.",
    'clean.adminTitle': 'Bazı kategoriler yönetici izni istiyor',
    'clean.adminText': "Windows'a ait klasörler için Ferahla'yı kapatın, simgesine sağ tıklayıp \"Yönetici olarak çalıştır\"ı seçin. Gerekmiyorsa bu adımı atlayabilirsiniz.",
    'clean.relaunchAdmin': 'Yönetici olarak yeniden aç',
    'clean.notInstalled': 'Bu bilgisayarda bulunmayanlar: {list}.',
    'clean.selection': 'Temizlenecekler',
    'clean.selected': '{n} kategori seçildi · {size}',
    'clean.selectedNone': 'Henüz bir şey seçilmedi.',
    'clean.go': 'Temizle',
    'clean.emptyTitle': 'Her şey zaten ferah',
    'clean.emptyText': 'Temizlenecek kayda değer bir geçici dosya bulunamadı. Bir süre sonra yeniden bakabilirsiniz.',

    'confirm.title': 'Temizlemeden önce bir bakın',
    'confirm.text': 'Şunlar silinecek:',
    'confirm.safe': 'Bunlar programların yeniden oluşturabildiği geçici dosyalardır. Belgeleriniz, fotoğraflarınız, şifreleriniz ve tarayıcı geçmişiniz silinmez.',
    'confirm.skipped': ({ n }) => `Bu sefer dokunulmayacak ${n} kategori`,
    'confirm.why.admin': 'yönetici izni gerekiyor',
    'confirm.why.recycle': 'içindekileri geri getirmek isteyebilirsiniz; isterseniz Temizlik ekranından ayrıca seçin',
    'confirm.why.notSelected': 'seçilmedi',
    'confirm.go': '{size} temizle',

    'cleaning.title': 'Temizleniyor…',
    'cleaning.lead': 'Birkaç saniye sürer. Ferahla yalnızca seçtiğiniz kategorilere dokunuyor.',

    'result.title': ({ num }) => `Bilgisayarınız ${num} ferahladı`,
    'result.titleNone': 'Temizlenecek bir şey kalmamıştı',
    'result.driveNow': '{drive} sürücüsünde artık {free} boş.',
    'result.inUse': '{n} dosya şu an bir program tarafından kullanıldığı için atlandı. Bu normaldir; o program kapandıktan sonraki temizlikte silinebilir.',
    'result.err.requires-admin': 'Yönetici izni gerekiyordu, atlandı',
    'result.err.not-available': 'Bulunamadı, atlandı',
    'result.err.in-use': 'Kullanımda olduğu için atlandı',
    'result.errGeneric': 'Atlandı',
    'result.back': 'Özete dön',
    'result.history': 'Geçmişte gör',
    'result.announce': 'Temizlik bitti. {size} yer açıldı.',

    'map.title': 'Disk Haritası',
    'map.lead': 'Hangi klasörün ne kadar yer kapladığını görün. Tarama yalnızca okur; hiçbir şeyi değiştirmez.',
    'map.chooseDrive': 'Taranacak sürücü',
    'map.scanAria': '{drive} sürücüsünü tara', 'map.rescanAria': '{drive} sürücüsünü yeniden tara', 'map.rescan': 'yeniden tara',
    'map.scanDrive': '{drive} sürücüsünü tara',
    'map.emptyTitle': 'Henüz bir sürücü taranmadı',
    'map.emptyText': 'Tarama, büyüklüğüne göre birkaç dakika sürebilir. Bu sırada bilgisayarınızı kullanmaya devam edebilirsiniz.',
    'map.location': 'Konum',
    'map.up': 'Üst klasör',
    'map.contents': 'İçindekiler',
    'map.emptyFolder': 'Bu klasör boş.',
    'map.small': 'Az yer', 'map.big': 'Çok yer',
    'map.legendTip': 'Renk koyulaştıkça daha çok yer kaplar. İçine girmek için tıklayın.',
    'map.systemTag': 'Windows',
    'map.openAria': '{name}, {size} — klasörü aç',
    'map.more': 've {n} küçük öğe daha',
    'map.others': '{n} küçük öğe',
    'map.tmAria': '{name} klasörünün haritası. Aynı bilgiler yandaki listede de var.',
    'map.folder': 'Klasör', 'map.file': 'Dosya',
    'map.clickToOpen': 'İçine girmek için tıklayın',
    'map.opened': '{name} açıldı, {n} öğe.',

    'scan.running': '{root} taranıyor',
    'scan.cancel': 'İptal',
    'scan.files': 'Dosya', 'scan.size': 'Boyut', 'scan.elapsed': 'Geçen süre',
    'scan.now': 'Şu an:',
    'scan.readOnly': 'Tarama yalnızca okur; hiçbir dosyayı değiştirmez ya da silmez.',
    'scan.started': '{root} taranmaya başlandı.',
    'scan.cancelled': 'Tarama durduruldu. Hiçbir şey değişmedi.',
    'scan.error': 'Tarama tamamlanamadı. {msg}',
    'scan.retry': 'Yeniden tara',
    'scan.err.not-found': 'Bu sürücü ya da klasör artık bulunamıyor. Çıkarılmış olabilir.',
    'scan.err.access-denied': 'Windows bu konuma erişime izin vermedi.',
    'scan.err.scan-failed': 'Okuma sırasında beklenmeyen bir sorun oluştu. Hiçbir şey değişmedi.',
    'scan.summary': '{root} tarandı: {size}, {files} dosya, {dur}.',
    'scan.skipped': '{n} korumalı klasör atlandı; bu normaldir.',
    'scan.doneAnnounce': 'Tarama bitti: {root}, {size}, {files} dosya.',
    'scan.context': '{root} taramasından · {ago}',

    'needScan.title': 'Önce bir sürücüyü tarayalım',
    'needScan.text': 'Bu liste, son taramadan hazırlanır. Tarama yalnızca okur ve birkaç dakika sürebilir.',
    'needScan.watch': 'Taramayı izle',

    'large.title': 'Büyük Dosyalar',
    'large.lead': "En çok yer kaplayan dosyalarınız. Seçtikleriniz Geri Dönüşüm Kutusu'na taşınır; fikrinizi değiştirirseniz oradan geri alabilirsiniz.",
    'large.filter': 'Türe göre süz',
    'large.min': 'En az',
    'large.loading': 'Büyük dosyalar listeleniyor…',
    'large.caption': 'Büyük dosyalar, boyuta göre sıralı',
    'large.colFile': 'Dosya', 'large.colType': 'Tür', 'large.colDate': 'Son değişiklik', 'large.colSize': 'Boyut',
    'large.emptyTitle': 'Bu ölçüde dosya yok',
    'large.emptyText': '{size} üzerinde, bu türde bir dosya bulunamadı.',
    'large.protected.system': "Windows'a ait, dokunulmaz",
    'large.protected.program': 'Bir programa ait; silmek yerine programı kaldırın',
    'large.hiddenProt': 'Windows\'a ve programlara ait {n} büyük dosya ({size}) gizlendi. Bunlar elle silinmemeli; yer açmak için kullanmadığınız programı kaldırabilirsiniz.',
    'large.showProt': 'Yine de göster', 'large.hideProt': 'Gizle',
    'large.protNote': 'Kilitli dosyalar Windows\'a veya programlara aittir; seçilemezler.',

    'type.all': 'Tümü', 'type.video': 'Video', 'type.archive': 'Arşiv', 'type.installer': 'Kurulum dosyası',
    'type.disk': 'Disk imajı', 'type.image': 'Resim', 'type.other': 'Diğer',

    'trash.title': ({ n }) => `${n} dosya Geri Dönüşüm Kutusu'na taşınsın mı?`,
    'trash.text': "Bu dosyalar silinmez, Geri Dönüşüm Kutusu'na taşınır. Fikrinizi değiştirirseniz oradan geri getirebilirsiniz.",
    'trash.note': 'Diskte yer, Geri Dönüşüm Kutusu boşaltıldığında açılır.',
    'trash.more': 've {n} dosya daha',
    'trash.done': "{n} dosya Geri Dönüşüm Kutusu'na taşındı.",
    'trash.failed': '{n} dosya taşınamadı; başka bir program kullanıyor olabilir.',

    'dups.title': 'Kopyalar',
    'dups.lead': 'İçeriği birebir aynı olan dosyalar. Her gruptan biri her zaman korunur.',
    'dups.introTitle': 'Aynı dosyanın fazladan kopyalarını bulun',
    'dups.introText': 'Ferahla dosyaları yalnızca adlarına göre değil, içeriklerini karşılaştırarak eşleştirir.',
    'dups.p1': 'Windows ve Program Files klasörlerine bakılmaz.',
    'dups.p2': 'Her gruptan bir dosya "tutulacak" olarak kilitlenir.',
    'dups.p3': 'Hiçbir şey kendiliğinden seçilmez; siz seçersiniz.',
    'dups.find': 'Kopyaları bul',
    'dups.again': 'Yeniden ara',
    'dups.running': 'Dosyalar karşılaştırılıyor…',
    'dups.checked': 'Karşılaştırılan',
    'dups.groups': 'Kopya grubu', 'dups.wasted': 'Fazladan kaplanan yer',
    'dups.keepRule': 'Her gruptan en eski dosya tutulur. Değiştirmek için "Bunu tut"a basın.',
    'dups.selectExtras': 'Tüm fazla kopyaları seç',
    'dups.groupMeta': ({ n, size }) => `${n} kopya · her biri ${size}`,
    'dups.extra': 'Fazlalık {size}',
    'dups.kept': 'Tutulacak',
    'dups.keepThis': 'Bunu tut',
    'dups.keepAnnounce': '{name} tutulacak olarak işaretlendi.',
    'dups.emptyTitle': 'Kopya bulunamadı',
    'dups.emptyText': 'Taranan sürücüde aynı içerikli dosya yok. Dosyalarınız düzenli görünüyor.',
    'dups.doneAnnounce': '{n} kopya grubu bulundu, {size} fazladan yer.',

    'startup.title': 'Başlangıç',
    'startup.lead': 'Bilgisayar açılırken kendiliğinden başlayan programlar. Ne kadar azsa açılış o kadar hızlı olur.',
    'startup.onCount': 'Açılışta başlayan', 'startup.canOff': 'Kapatılabilir',
    'startup.reassure': 'Kapatmak programı silmez; yalnızca açılışta başlamasını durdurur. İstediğiniz zaman yeniden açabilirsiniz.',
    'startup.group.safe-to-disable': 'Kapatılabilir', 'startup.group.unknown': 'Bilinmiyor', 'startup.group.keep': 'Kapatmayın',
    'startup.groupSub.safe-to-disable': 'Bunların açılışta başlaması gerekmez; ihtiyaç duyduğunuzda kendiniz açabilirsiniz.',
    'startup.groupSub.unknown': 'Bunları tanımıyoruz. Ne olduğundan emin değilseniz açık bırakın; tanıyor ve kullanmıyorsanız kapatabilirsiniz, istediğiniz an geri açılır.',
    'startup.groupSub.keep': 'Bunlar bilgisayarınızın düzgün çalışması için gereklidir. Açık bırakmanızı öneririz.',
    'startup.advice.safe-to-disable': 'Kapatılabilir', 'startup.advice.keep': 'Kapatmayın', 'startup.advice.unknown': 'Bilinmiyor',
    'startup.unknownDesc': 'Bu program hakkında bilgimiz yok. Ne olduğundan emin değilseniz açık bırakın.',
    'startup.tech': 'Teknik ayrıntılar',
    'startup.command': 'Komut', 'startup.source': 'Nereden başlıyor',
    'startup.src.hkcu': 'Kayıt defteri (yalnızca sizin hesabınız)', 'startup.src.hklm': 'Kayıt defteri (tüm kullanıcılar)',
    'startup.src.folder': 'Başlangıç klasörü', 'startup.src.autostart': 'Otomatik başlatma klasörü', 'startup.src.other': 'Diğer',
    'startup.on': 'Açılışta başlar', 'startup.off': 'Başlamaz',
    'startup.keepTitle': '{name} kapatılsın mı?',
    'startup.keepText': 'Bu programın açık kalmasını öneriyoruz. Yine de kapatırsanız, bir sorun olduğunda buradan ya da Geçmiş\'ten geri açabilirsiniz.',
    'startup.keepConfirm': 'Yine de kapat',
    'startup.turnedOff': '{name} artık açılışta başlamayacak. Geri almak için anahtarı yeniden açın.',
    'startup.turnedOn': '{name} yeniden açılışta başlayacak.',
    'startup.failed': '{name} değiştirilemedi.',
    'startup.emptyTitle': 'Açılışta başlayan program yok',
    'startup.emptyText': 'Bilgisayarınız açılırken fazladan bir program çalıştırmıyor.',

    'history.title': 'Geçmiş',
    'history.lead': 'Ferahla ile yaptığınız her işlem burada. Geri alınabilenleri tek tıkla geri alabilirsiniz.',
    'history.totalFreed': 'Şimdiye kadar temizlenen',
    'history.local': 'Geçmiş yalnızca bu bilgisayarda saklanır.',
    'history.openBin': "Geri Dönüşüm Kutusu'nu aç",
    'history.undo': 'Geri al', 'history.wasUndone': 'Geri alındı',
    'history.undone': 'Geri alındı.',
    'history.undoFailed': 'Geri alınamadı.',
    'history.freed': '{size} yer açıldı', 'history.moved': '{size} taşındı',
    'history.cleanNoUndo': 'Geri almaya gerek yok',
    'history.cleanNoUndoLong': 'Silinen geçici dosyalar geri getirilemez; zaten gerekli değillerdi.',
    'history.emptyTitle': 'Henüz bir işlem yapılmadı',
    'history.emptyText': 'Temizlik, taşıma ya da başlangıç değişikliği yaptığınızda burada listelenir.',

    'settings.title': 'Ayarlar',
    'settings.appearance': 'Görünüm',
    'settings.language': 'Dil', 'settings.theme': 'Tema',
    'settings.themeSystem': 'Sistem', 'settings.themeLight': 'Açık', 'settings.themeDark': 'Koyu',
    'settings.excluded': 'Hariç tutulan klasörler',
    'settings.excludedSub': 'Bu klasörler taramalarda, büyük dosya ve kopya aramalarında atlanır.',
    'settings.excludedNone': 'Henüz hariç tutulan bir klasör yok.',
    'settings.addLabel': 'Hariç tutulacak klasörün yolu',
    'settings.addPlaceholder': 'Örnek: D:\\Yedekler',
    'settings.add': 'Ekle', 'settings.pick': 'Klasör seç…', 'settings.remove': 'Kaldır',
    'settings.removeAria': '{path} klasörünü listeden kaldır',
    'settings.added': 'Klasör eklendi.',
    'settings.errEmpty': 'Lütfen bir klasör yolu yazın.',
    'settings.errDup': 'Bu klasör zaten listede.',
    'settings.saveFailed': 'Ayar kaydedilemedi.',
    'settings.about': 'Hakkında',
    'settings.aboutText': 'Ferahla internete bağlanmaz, hiçbir veri toplamaz, arka planda çalışmaz ve reklam göstermez. Açık kaynaklıdır (MIT).',
    'settings.admin': 'Yönetici olarak çalışıyor.',
    'settings.notAdmin': 'Normal kullanıcı olarak çalışıyor; Windows\'a ait birkaç klasör atlanır.',
  };

  const en = {
    'brand.tag': 'Gives your PC room to breathe',
    'brand.privacy': 'Works offline · Collects no data',
    'a11y.skip': 'Skip to content',
    'a11y.nav': 'Sections',

    'nav.overview': 'Overview', 'nav.clean': 'Cleanup', 'nav.map': 'Disk Map', 'nav.large': 'Large Files',
    'nav.dups': 'Duplicates', 'nav.startup': 'Startup', 'nav.history': 'History', 'nav.settings': 'Settings',
    'nav.scanning': '(scanning)',

    'common.retry': 'Try again', 'common.loading': 'Loading…', 'common.ok': 'OK', 'common.cancel': 'Cancel', 'common.close': 'Close',
    'common.items': ({ n }) => `${n} ${n === '1' ? 'item' : 'items'}`, 'common.files': ({ n }) => `${n} ${n === '1' ? 'file' : 'files'}`, 'common.total': 'Total',
    'common.reveal': 'Show in folder', 'common.revealAria': '{name} — show in folder',
    'common.selectAll': 'Select all visible files', 'common.selectItem': 'Select {name}', 'common.actions': 'Actions',
    'common.selection': 'Selection', 'common.selectedFiles': ({ n, size }) => `${n} ${n === 1 ? 'file' : 'files'} selected · ${size}`,
    'common.selectHint': 'Select the files you want to move.',
    'common.clearSelection': 'Clear selection', 'common.toRecycle': 'Move to Recycle Bin',

    'err.title': 'Something didn\'t go as planned', 'err.generic': 'An unexpected problem occurred. No files were touched.',
    'err.unavailable': 'This action is not available right now.',

    'welcome.title': 'Welcome to Ferahla',
    'welcome.text': 'Ferahla shows what is taking up space on your PC and cleans only what is safe to delete.',
    'welcome.p1': 'Nothing is deleted without your approval.',
    'welcome.p2': 'Your own files only go to the Recycle Bin, so you can bring them back.',
    'welcome.p3': 'Everything you do is recorded in History.',
    'welcome.ok': 'Got it',

    'overview.title': 'Overview',
    'overview.lead': 'Your PC at a glance.',
    'overview.reclaimable': 'Space you can safely free',
    'overview.measuring': 'Measuring what can be cleaned…',
    'overview.heroSub': ({ n }) => `Temporary files and caches (${n} ${n === 1 ? 'category' : 'categories'}). Your documents, photos and passwords are not touched.`,
    'overview.nothing': 'Everything looks fresh right now',
    'overview.nothingSub': 'There are no temporary files worth cleaning. Looking for space? Try the Disk Map.',
    'overview.safeClean': 'Safe Cleanup',
    'overview.seeDetails': 'What will be removed?',
    'overview.waiting': 'Waiting: {list}. Details on the Cleanup screen.',
    'overview.drives': 'Drives',
    'overview.more': 'Need more space?',
    'overview.tileMap': 'What is filling the disk?', 'overview.tileMapSub': 'See folders on a map, by size',
    'overview.tileLarge': 'Your largest files', 'overview.tileLargeSub': 'Forgotten videos, installers, disk images',
    'overview.tileStartup': 'Startup speed', 'overview.tileStartupSub0': 'Programs that start with Windows',
    'overview.tileStartupSub': ({ n, m }) => `${n} ${n === 1 ? 'program starts' : 'programs start'} with Windows${m ? `, ${m} can be turned off` : ''}`,

    'drive.local': 'Local Disk',
    'drive.free': 'free',
    'drive.level.ok': 'Roomy', 'drive.level.warn': 'Filling up', 'drive.level.crit': 'Almost full',
    'drive.meta': '{used} used · {total} total',
    'drive.usedAria': '{pct} used',
    'drive.inspect': 'Inspect this drive',

    'clean.title': 'Cleanup',
    'clean.lead': 'Only temporary files and caches. The recommended ones are selected for you; use "What is this?" to see what each one is.',
    'clean.measuring': 'Measuring folders…',
    'clean.selectRecommended': 'Select recommended', 'clean.selectNone': 'Select none', 'clean.recheck': 'Check again',
    'clean.group.system': 'Windows', 'clean.group.browsers': 'Browsers', 'clean.group.apps': 'Apps',
    'clean.whatIsThis': 'What is this?',
    'clean.empty': 'Empty',
    'clean.badgeAdmin': 'Needs administrator', 'clean.badgeNoUndo': 'Cannot be undone',
    'clean.adminReason': 'Windows protects this folder. To clean it, open Ferahla as an administrator.',
    'clean.adminTitle': 'Some categories need administrator permission',
    'clean.adminText': 'For folders that belong to Windows, close Ferahla, right-click its icon and choose "Run as administrator". You can skip this if you don\'t need it.',
    'clean.relaunchAdmin': 'Reopen as administrator',
    'clean.notInstalled': 'Not on this PC: {list}.',
    'clean.selection': 'To be cleaned',
    'clean.selected': ({ n, size }) => `${n} ${n === 1 ? 'category' : 'categories'} selected · ${size}`,
    'clean.selectedNone': 'Nothing selected yet.',
    'clean.go': 'Clean',
    'clean.emptyTitle': 'Everything is already fresh',
    'clean.emptyText': 'No temporary files worth cleaning were found. You can check again in a while.',

    'confirm.title': 'Take a look before cleaning',
    'confirm.text': 'These will be deleted:',
    'confirm.safe': 'These are temporary files that programs can recreate. Your documents, photos, passwords and browsing history are not deleted.',
    'confirm.skipped': ({ n }) => `${n} ${n === 1 ? 'category' : 'categories'} left alone this time`,
    'confirm.why.admin': 'needs administrator permission',
    'confirm.why.recycle': 'you may want to restore something from it; select it separately on the Cleanup screen if you like',
    'confirm.why.notSelected': 'not selected',
    'confirm.go': 'Clean {size}',

    'cleaning.title': 'Cleaning…',
    'cleaning.lead': 'This takes a few seconds. Ferahla only touches the categories you selected.',

    'result.title': ({ num }) => `Your PC has ${num} more room to breathe`,
    'result.titleNone': 'There was nothing left to clean',
    'result.driveNow': '{drive} now has {free} free.',
    'result.inUse': ({ n }) => `${n} ${n === '1' ? 'file was' : 'files were'} skipped because a program is using ${n === '1' ? 'it' : 'them'}. That's normal; they can be cleaned next time, after that program closes.`,
    'result.err.requires-admin': 'Needed administrator, skipped',
    'result.err.not-available': 'Not found, skipped',
    'result.err.in-use': 'In use, skipped',
    'result.errGeneric': 'Skipped',
    'result.back': 'Back to overview',
    'result.history': 'See in history',
    'result.announce': 'Cleanup finished. {size} freed.',

    'map.title': 'Disk Map',
    'map.lead': 'See how much space each folder takes. Scanning only reads; it never changes anything.',
    'map.chooseDrive': 'Drive to scan',
    'map.scanAria': 'Scan {drive}', 'map.rescanAria': 'Scan {drive} again', 'map.rescan': 'scan again',
    'map.scanDrive': 'Scan {drive}',
    'map.emptyTitle': 'No drive scanned yet',
    'map.emptyText': 'Depending on its size, a scan can take a few minutes. You can keep using your PC meanwhile.',
    'map.location': 'Location',
    'map.up': 'Up one level',
    'map.contents': 'Contents',
    'map.emptyFolder': 'This folder is empty.',
    'map.small': 'Less space', 'map.big': 'More space',
    'map.legendTip': 'Darker means more space. Click to go inside.',
    'map.systemTag': 'Windows',
    'map.openAria': '{name}, {size} — open folder',
    'map.more': 'and {n} more small items',
    'map.others': '{n} small items',
    'map.tmAria': 'Map of the {name} folder. The same information is in the list next to it.',
    'map.folder': 'Folder', 'map.file': 'File',
    'map.clickToOpen': 'Click to go inside',
    'map.opened': 'Opened {name}, {n} items.',

    'scan.running': 'Scanning {root}',
    'scan.cancel': 'Cancel',
    'scan.files': 'Files', 'scan.size': 'Size', 'scan.elapsed': 'Elapsed',
    'scan.now': 'Now:',
    'scan.readOnly': 'Scanning only reads; it never changes or deletes any file.',
    'scan.started': 'Started scanning {root}.',
    'scan.cancelled': 'Scan stopped. Nothing was changed.',
    'scan.error': 'The scan could not finish. {msg}',
    'scan.retry': 'Scan again',
    'scan.err.not-found': 'This drive or folder can no longer be found. It may have been removed.',
    'scan.err.access-denied': 'Windows did not allow access to this location.',
    'scan.err.scan-failed': 'An unexpected problem occurred while reading. Nothing was changed.',
    'scan.summary': '{root} scanned: {size}, {files} files, {dur}.',
    'scan.skipped': '{n} protected folders were skipped; that\'s normal.',
    'scan.doneAnnounce': 'Scan finished: {root}, {size}, {files} files.',
    'scan.context': 'From the {root} scan · {ago}',

    'needScan.title': 'Let\'s scan a drive first',
    'needScan.text': 'This list is built from the latest scan. Scanning only reads and can take a few minutes.',
    'needScan.watch': 'Watch the scan',

    'large.title': 'Large Files',
    'large.lead': 'The files taking up the most space. What you select goes to the Recycle Bin, so you can restore it if you change your mind.',
    'large.filter': 'Filter by type',
    'large.min': 'At least',
    'large.loading': 'Listing large files…',
    'large.caption': 'Large files, sorted by size',
    'large.colFile': 'File', 'large.colType': 'Type', 'large.colDate': 'Last changed', 'large.colSize': 'Size',
    'large.emptyTitle': 'No files this large',
    'large.emptyText': 'No file of this type over {size} was found.',
    'large.protected.system': 'Belongs to Windows, left alone',
    'large.protected.program': 'Belongs to a program; uninstall it instead',
    'large.hiddenProt': '{n} large files ({size}) that belong to Windows or programs are hidden. They shouldn\'t be deleted by hand; to free that space, uninstall a program you don\'t use.',
    'large.showProt': 'Show anyway', 'large.hideProt': 'Hide',
    'large.protNote': 'Locked files belong to Windows or programs; they cannot be selected.',

    'type.all': 'All', 'type.video': 'Video', 'type.archive': 'Archive', 'type.installer': 'Installer',
    'type.disk': 'Disk image', 'type.image': 'Image', 'type.other': 'Other',

    'trash.title': ({ n }) => `Move ${n} ${n === 1 ? 'file' : 'files'} to the Recycle Bin?`,
    'trash.text': 'These files are not deleted; they go to the Recycle Bin. If you change your mind, you can restore them from there.',
    'trash.note': 'Disk space is freed when the Recycle Bin is emptied.',
    'trash.more': 'and {n} more',
    'trash.done': ({ n }) => `${n} ${n === 1 ? 'file' : 'files'} moved to the Recycle Bin.`,
    'trash.failed': ({ n }) => `${n} ${n === 1 ? 'file' : 'files'} could not be moved; another program may be using ${n === 1 ? 'it' : 'them'}.`,

    'dups.title': 'Duplicates',
    'dups.lead': 'Files with exactly the same content. One file in every group is always kept.',
    'dups.introTitle': 'Find extra copies of the same file',
    'dups.introText': 'Ferahla matches files by comparing their contents, not just their names.',
    'dups.p1': 'Windows and Program Files folders are not searched.',
    'dups.p2': 'One file in each group is locked as "keep".',
    'dups.p3': 'Nothing is selected for you; you choose.',
    'dups.find': 'Find duplicates',
    'dups.again': 'Search again',
    'dups.running': 'Comparing files…',
    'dups.checked': 'Compared',
    'dups.groups': 'Duplicate groups', 'dups.wasted': 'Extra space used',
    'dups.keepRule': 'The oldest file in each group is kept. Press "Keep this" to change it.',
    'dups.selectExtras': 'Select all extra copies',
    'dups.groupMeta': ({ n, size }) => `${n} copies · ${size} each`,
    'dups.extra': '{size} extra',
    'dups.kept': 'Keep',
    'dups.keepThis': 'Keep this',
    'dups.keepAnnounce': '{name} marked to keep.',
    'dups.emptyTitle': 'No duplicates found',
    'dups.emptyText': 'There are no files with the same content on the scanned drive. Your files look tidy.',
    'dups.doneAnnounce': 'Found {n} duplicate groups, {size} of extra space.',

    'startup.title': 'Startup',
    'startup.lead': 'Programs that start by themselves when your PC turns on. The fewer, the faster it starts.',
    'startup.onCount': 'Start with Windows', 'startup.canOff': 'Can be turned off',
    'startup.reassure': 'Turning one off does not uninstall it; it just stops it from starting automatically. You can turn it back on anytime.',
    'startup.group.safe-to-disable': 'Can be turned off', 'startup.group.unknown': 'Unknown', 'startup.group.keep': 'Keep on',
    'startup.groupSub.safe-to-disable': 'These don\'t need to start with Windows; you can open them yourself when needed.',
    'startup.groupSub.unknown': 'We don\'t recognize these. If you\'re not sure what they are, keep them on; if you know one and don\'t use it, you can turn it off and back on anytime.',
    'startup.groupSub.keep': 'These help your PC work properly. We recommend leaving them on.',
    'startup.advice.safe-to-disable': 'Can be turned off', 'startup.advice.keep': 'Keep on', 'startup.advice.unknown': 'Unknown',
    'startup.unknownDesc': 'We don\'t have information about this program. If you\'re not sure what it is, keep it on.',
    'startup.tech': 'Technical details',
    'startup.command': 'Command', 'startup.source': 'Starts from',
    'startup.src.hkcu': 'Registry (your account only)', 'startup.src.hklm': 'Registry (all users)',
    'startup.src.folder': 'Startup folder', 'startup.src.autostart': 'Autostart folder', 'startup.src.other': 'Other',
    'startup.on': 'Starts with Windows', 'startup.off': 'Doesn\'t start',
    'startup.keepTitle': 'Turn off {name}?',
    'startup.keepText': 'We recommend keeping this program on. If you turn it off anyway, you can turn it back on here or from History if something goes wrong.',
    'startup.keepConfirm': 'Turn off anyway',
    'startup.turnedOff': '{name} will no longer start with Windows. Flip the switch again to undo.',
    'startup.turnedOn': '{name} will start with Windows again.',
    'startup.failed': '{name} could not be changed.',
    'startup.emptyTitle': 'No startup programs',
    'startup.emptyText': 'Your PC doesn\'t run any extra programs when it starts.',

    'history.title': 'History',
    'history.lead': 'Everything you did with Ferahla. Actions that can be undone are one click away.',
    'history.totalFreed': 'Cleaned so far',
    'history.local': 'History is kept only on this PC.',
    'history.openBin': 'Open Recycle Bin',
    'history.undo': 'Undo', 'history.wasUndone': 'Undone',
    'history.undone': 'Undone.',
    'history.undoFailed': 'Could not undo.',
    'history.freed': '{size} freed', 'history.moved': '{size} moved',
    'history.cleanNoUndo': 'Nothing to undo',
    'history.cleanNoUndoLong': 'Deleted temporary files cannot be restored; they weren\'t needed anyway.',
    'history.emptyTitle': 'Nothing here yet',
    'history.emptyText': 'Cleanups, moved files and startup changes will be listed here.',

    'settings.title': 'Settings',
    'settings.appearance': 'Appearance',
    'settings.language': 'Language', 'settings.theme': 'Theme',
    'settings.themeSystem': 'System', 'settings.themeLight': 'Light', 'settings.themeDark': 'Dark',
    'settings.excluded': 'Excluded folders',
    'settings.excludedSub': 'These folders are skipped in scans and in large file and duplicate searches.',
    'settings.excludedNone': 'No excluded folders yet.',
    'settings.addLabel': 'Path of the folder to exclude',
    'settings.addPlaceholder': 'Example: D:\\Backups',
    'settings.add': 'Add', 'settings.pick': 'Choose folder…', 'settings.remove': 'Remove',
    'settings.removeAria': 'Remove {path} from the list',
    'settings.added': 'Folder added.',
    'settings.errEmpty': 'Please type a folder path.',
    'settings.errDup': 'This folder is already in the list.',
    'settings.saveFailed': 'The setting could not be saved.',
    'settings.about': 'About',
    'settings.aboutText': 'Ferahla never connects to the internet, collects no data, doesn\'t run in the background and shows no ads. It is open source (MIT).',
    'settings.admin': 'Running as administrator.',
    'settings.notAdmin': 'Running as a normal user; a few Windows folders are skipped.',
  };

  const STR = { tr, en };
  const LOCALE = { tr: 'tr-TR', en: 'en-US' };
  let lang = 'tr';

  function t(key, vars, soft) {
    const v = (STR[lang] && STR[lang][key]) ?? STR.tr[key];
    if (v == null) {
      if (soft) return '';
      if (typeof console !== 'undefined') console.warn('[i18n] eksik anahtar:', key);
      return key;
    }
    if (typeof v === 'function') return v(vars || {});
    if (!vars) return v;
    return v.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  }

  // ---------- biçimlendiriciler ----------
  const nf = (opts) => new Intl.NumberFormat(LOCALE[lang], opts);
  /** 1024 tabanlı (Windows Gezgini ile aynı), birim adları KB/MB/GB/TB. */
  function fmtBytesParts(n) {
    n = Math.max(0, Number(n) || 0);
    const units = ['KB', 'MB', 'GB', 'TB'];
    if (n < 1024) return { num: nf({ maximumFractionDigits: 0 }).format(n), unit: lang === 'tr' ? 'bayt' : (n === 1 ? 'byte' : 'bytes') };
    let v = n / 1024, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    const digits = v < 10 ? 1 : v < 100 && i >= 2 ? 1 : 0;
    return { num: nf({ maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(v), unit: units[i] };
  }
  const fmtBytes = (n) => { const p = fmtBytesParts(n); return p.num + ' ' + p.unit; };
  const fmtNum = (n) => nf({ maximumFractionDigits: 0 }).format(Number(n) || 0);
  const fmtPct = (share) => {
    const s = Math.max(0, Number(share) || 0);
    return nf({ style: 'percent', maximumFractionDigits: s > 0 && s < 0.01 ? 1 : 0 }).format(s);
  };
  const toDate = (d) => (d instanceof Date ? d : new Date(typeof d === 'number' ? d : Date.parse(d)));
  const fmtDate = (d) => new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'long', year: 'numeric' }).format(toDate(d));
  const fmtTime = (d) => new Intl.DateTimeFormat(LOCALE[lang], { hour: '2-digit', minute: '2-digit' }).format(toDate(d));
  function fmtRelative(d) {
    const ms = toDate(d).getTime() - Date.now();
    const rtf = new Intl.RelativeTimeFormat(LOCALE[lang], { numeric: 'auto' });
    const abs = Math.abs(ms);
    const M = 60000, H = 60 * M, D = 24 * H;
    if (abs < M) return lang === 'tr' ? 'az önce' : 'just now';
    if (abs < H) return rtf.format(Math.round(ms / M), 'minute');
    if (abs < D) return rtf.format(Math.round(ms / H), 'hour');
    if (abs < 30 * D) return rtf.format(Math.round(ms / D), 'day');
    if (abs < 365 * D) return rtf.format(Math.round(ms / (30 * D)), 'month');
    return rtf.format(Math.round(ms / (365 * D)), 'year');
  }
  function fmtDuration(ms) {
    const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    const m = Math.floor(s / 60), r = s % 60;
    if (lang === 'tr') return m ? `${m} dk ${r} sn` : `${r} sn`;
    return m ? `${m} min ${r} s` : `${r} s`;
  }
  function dayLabel(d) {
    const x = toDate(d);
    const start = (q) => new Date(q.getFullYear(), q.getMonth(), q.getDate()).getTime();
    const diff = Math.round((start(new Date()) - start(x)) / 86400000);
    if (diff === 0) return lang === 'tr' ? 'Bugün' : 'Today';
    if (diff === 1) return lang === 'tr' ? 'Dün' : 'Yesterday';
    return new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'long', year: x.getFullYear() === new Date().getFullYear() ? undefined : 'numeric', weekday: 'long' }).format(x);
  }

  window.FerahlaI18n = {
    get lang() { return lang; },
    setLang(l) { lang = STR[l] ? l : 'tr'; },
    t, fmtBytes, fmtBytesParts, fmtNum, fmtPct, fmtDate, fmtTime, fmtRelative, fmtDuration, dayLabel,
    strings: STR,
  };
})();
