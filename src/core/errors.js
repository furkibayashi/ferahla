'use strict';
/** Hata kodları -> teknik olmayan, ne yapılacağını söyleyen mesajlar. */
const MESSAGES = {
  'no-scan': ['Önce bir sürücü ya da klasör tarayın.', 'Scan a drive or folder first.'],
  'not-in-scan': ['Bu klasör son taramada yok. Klasörü yeniden tarayın.', 'This folder is not in the last scan. Scan it again.'],
  'not-found': ['Dosya ya da klasör bulunamadı. Taşınmış veya silinmiş olabilir; yeniden tarayın.', 'File or folder not found. It may have been moved or deleted; scan again.'],
  'access-denied': ['Bu konuma erişim izni yok. Başka bir klasör seçin ya da Ferahla\'yı yönetici olarak açın.', 'No permission to access this location. Choose another folder or run Ferahla as administrator.'],
  'scan-failed': ['Tarama tamamlanamadı. Tekrar deneyin.', 'The scan could not finish. Please try again.'],
  'cancelled': ['İşlem iptal edildi.', 'The operation was cancelled.'],
  'superseded': ['Yeni bir tarama başlatıldığı için önceki tarama durduruldu.', 'The previous scan stopped because a new one started.'],
  'invalid-argument': ['Geçersiz istek. Uygulamayı yeniden başlatıp tekrar deneyin.', 'Invalid request. Restart the app and try again.'],
  'invalid-path': ['Bu yol geçerli değil.', 'This path is not valid.'],
  'relative-path': ['Bu yol geçerli değil.', 'This path is not valid.'],
  'dotdot': ['Güvenlik nedeniyle bu yol kabul edilmedi.', 'This path was rejected for safety reasons.'],
  'protected': ['Bu bir sistem ya da korumalı klasör; Ferahla buna dokunmaz.', 'This is a system or protected folder; Ferahla will not touch it.'],
  'system-path': ['Bu dosya Windows ya da bir program için gerekli olabilir; Ferahla buna dokunmaz.', 'This file may be needed by Windows or a program; Ferahla will not touch it.'],
  'outside-whitelist': ['Bu konum güvenli temizlik listesinde değil; silinmedi.', 'This location is not on the safe-cleanup list; it was not deleted.'],
  'is-root': ['Klasörün kendisi silinmez, yalnızca içindekiler temizlenir.', 'The folder itself is never deleted, only its contents.'],
  'excluded': ['Bu klasör ayarlarda hariç tutulmuş.', 'This folder is excluded in settings.'],
  'requires-admin': ['Bu işlem yönetici izni gerektirir. Ferahla\'yı sağ tıklayıp "Yönetici olarak çalıştır" ile açın.', 'This needs administrator rights. Right-click Ferahla and choose "Run as administrator".'],
  'registry-write-failed': ['Başlangıç ayarı değiştirilemedi. Tekrar deneyin.', 'The startup setting could not be changed. Please try again.'],
  'write-failed': ['Ayar kaydedilemedi. Tekrar deneyin.', 'The setting could not be saved. Please try again.'],
  'not-undoable': ['Bu işlem geri alınamaz.', 'This action cannot be undone.'],
  'undo-failed': ['Geri alma başarısız oldu. Tekrar deneyin.', 'Undo failed. Please try again.'],
  'unknown-category': ['Bilinmeyen temizlik kategorisi.', 'Unknown cleanup category.'],
  'not-available': ['Bu kategori bu bilgisayarda yok.', 'This category is not available on this computer.'],
  'clean-failed': ['Temizlik tamamlanamadı. Açık programları kapatıp tekrar deneyin.', 'Cleanup could not finish. Close open programs and try again.'],
  'recycle-bin-failed': ['Geri Dönüşüm Kutusu boşaltılamadı. Tekrar deneyin.', 'The Recycle Bin could not be emptied. Please try again.'],
  'trash-failed': ['Geri Dönüşüm Kutusu\'na taşınamadı. Dosya açık olabilir; kapatıp tekrar deneyin.', 'Could not move to the Recycle Bin. The file may be open; close it and try again.'],
  'in-use': ['Dosya şu an kullanımda; ilgili programı kapatıp tekrar deneyin.', 'The file is in use; close the program and try again.'],
  'busy': ['Başka bir temizlik sürüyor; bitmesini bekleyin.', 'Another cleanup is running; please wait for it to finish.'],
  'unsupported': ['Bu özellik bu işletim sisteminde kullanılamıyor.', 'This feature is not available on this operating system.'],
  'relaunch-failed': ['Ferahla yönetici olarak yeniden başlatılamadı. Ferahla\'yı sağ tıklayıp "Yönetici olarak çalıştır" ile açın.', 'Could not restart Ferahla as administrator. Right-click Ferahla and choose "Run as administrator".'],
  'not_allowed': ['Bu öğe Geri Dönüşüm Kutusu\'na taşınmadı: yalnızca son taramada bulunan, o zamandan beri değişmemiş ve uygulama/tarayıcı verisi olmayan dosyalar taşınabilir. Gerekirse yeniden tarayın.', 'This item was not moved to the Recycle Bin: only files found in the last scan, unchanged since, and not app or browser data can be moved. Scan again if needed.'],
  'forbidden-sender': ['İzin verilmeyen istek.', 'Request not allowed.'],
  'internal': ['Beklenmeyen bir sorun oluştu. Uygulamayı yeniden başlatıp tekrar deneyin.', 'Something unexpected happened. Restart the app and try again.'],
};

function errorMessage(code, lang = 'tr') {
  const m = MESSAGES[code] || MESSAGES.internal;
  return lang === 'en' ? m[1] : m[0];
}

/** Sözleşmedeki hata biçimi. */
function errorResult(code, lang = 'tr', extra = {}) {
  return { ok: false, error: code, message: errorMessage(code, lang), ...extra };
}

module.exports = { errorMessage, errorResult, MESSAGES };
