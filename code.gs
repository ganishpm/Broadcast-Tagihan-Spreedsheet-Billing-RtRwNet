// ========================================
// CODE.GS - SCRIPT UTAMA (SISTEM ANTRIAN)
// ========================================

// Nama sheet tempat menyimpan SEMUA konfigurasi
const SETUP_SHEET_NAME_Templete = 'Setup_Templete';

// Nama kunci untuk menyimpan tanggal proses terakhir di PropertiesService
const LAST_RUN_PROPERTY_KEY_Templete = 'LAST_RUN_DATE';

// >>> KONSTANTA UNTUK KOLOM STATUS ANTRIAN (Kolom R) <<<
const STATUS_KIRIM_COLUMN = 18; // Indeks ke-18 adalah Kolom R

// Nama sheet tempat menyimpan daftar pesan informasi yang akan di-broadcast
const INFORMASI_SHEET_NAME_Templete = 'WA_INFORMASI';

// ========================================
// FUNGSI UTAMA UNTUK MENGAMBIL SEMUA KONFIGURASI DARI SHEET
// ========================================

// Fungsi Mendapatkan config setup_Templete
function getAppConfigTemplete() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETUP_SHEET_NAME_Templete);
  if (!sheet) {
    Logger.log(`ERROR: Sheet bernama "${SETUP_SHEET_NAME_Templete}" tidak ditemukan.`);
    return null;
  }
  const data = sheet.getDataRange().getValues();
  const config = {};
  for (let i = 1; i < data.length; i++) {
    const key = data[i][0]; // Mengambil dari data Sheet Setup_provideWhatsapp
    const value = data[i][1];
    if (key === 'DATA_SHEET_NAME' || key === 'ADMIN_PHONE_NUMBER' || key === 'WHATSAPP_PROVIDER') {
      config[key] = value;
    }
  }
  if (!config.DATA_SHEET_NAME || !config.ADMIN_PHONE_NUMBER || !config.WHATSAPP_PROVIDER) {
    Logger.log('ERROR: Konfigurasi wajib (DATA_SHEET_NAME, ADMIN_PHONE_NUMBER, WHATSAPP_PROVIDER) tidak lengkap di sheet "Setup_ProvideWhatsapp".');
    return null;
  }
  const providerConfig = getProviderCredentialsTemplete(config.WHATSAPP_PROVIDER, data);
  if (!providerConfig) {
    Logger.log(`ERROR: Kredensial untuk provider "${config.WHATSAPP_PROVIDER}" tidak ditemukan di sheet "Setup_ProvideWhatsapp".`);
    return null;
  }
  return { ...config, ...providerConfig };
}

function getProviderCredentialsTemplete(providerName, data) {
  let config = null;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === providerName) {
      switch (providerName) {
        case 'weagate': config = { token: data[i][1], endpoint: 'https://mywifi.weagate.com/api/send-message' }; break;
        case 'wablas': config = { token: data[i][1], secret: data[i][2], endpoint: 'https://bdg.wablas.com/api/v2/send-message' }; break;
        case 'kirimi':
          let secretKey = '';
          for (let j = 1; j < data.length; j++) { if (data[j][0] === 'secret_key') { secretKey = data[j][1]; break; } }
          config = { userCode: data[i][1], deviceId: data[i][2], secret: secretKey, endpoint: 'https://api.kirimi.id/v1/send-message' };
          break;
      }
      break;
    }
  }
  return config;
}


// ========================================
// FUNGSI PENGENDALI (CONTROLLER) - DIJALANKAN OLEH TRIGGER
// ========================================

function jalankanOtomasiSetiap2HariTemplete() {
  const config = getAppConfigTemplete();
  if (!config) return;
  const properties = PropertiesService.getScriptProperties();
  const lastRunDateStr = properties.getProperty(LAST_RUN_PROPERTY_KEY_Templete);
  const hariIni = new Date(); hariIni.setHours(0, 0, 0, 0);
  let lastRunDate = null;
  if (lastRunDateStr) { lastRunDate = new Date(lastRunDateStr); lastRunDate.setHours(0, 0, 0, 0); }
  if (!lastRunDate || (hariIni - lastRunDate) / (1000 * 60 * 60 * 24) >= 2) {
    Logger.log('=== MEMULAI PROSES PENAMBAHAN ANTRIAN TAGIHAN Templete ===');
    tambahAntrianTagihanTemplete(config);
    properties.setProperty(LAST_RUN_PROPERTY_KEY_Templete, hariIni.toISOString());
    Logger.log('Proses penambahan antrian tagihan selesai. ===');
  } else { Logger.log('Belum waktunya jalankan proses penambahan antrian tagihan Templete.'); }
}

function cekDanTambahAntrianKonfirmasiTemplete() {
  const config = getAppConfigTemplete();
  if (!config) { Logger.log('Dibatalkan: Konfigurasi tidak ditemukan saat cek konfirmasi.'); return; }
  Logger.log('=== MEMULAI PROSES PENAMBAHAN ANTRIAN KONFIRMASI Templete ===');
  tambahAntrianKonfirmasiTemplete(config);
  Logger.log('Proses penambahan antrian konfirmasi selesai. ===');
}

// ========================================
// FUNGSI PROSES UTAMA (WORKER & ENQUEUER)
// ========================================

function tambahAntrianTagihanTemplete(config) {
  if (!config) return;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config.DATA_SHEET_NAME);
  if (!sheet) {
    Logger.log(`ERROR: Sheet data "${config.DATA_SHEET_NAME}" tidak ditemukan.`);
    return;
  }

  const data = sheet.getDataRange().getValues();
  const hariIni = new Date(); hariIni.setHours(0, 0, 0, 0);
  let rowsToUpdate = [];

  // Mulai dari i = 2 karena data ada di baris ke-3 spreadsheet
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    const statusKirim = row[STATUS_KIRIM_COLUMN - 1]; // Kolom S (Status Kirim)
    const status = row[5]; // Kolom F (Status)
    const phone = row[1]; // Kolom B (No HP)
    const tanggalJatuhTempo = row[8]; // Kolom I (Tanggal Jatuh Tempo)

    // Hanya tambahkan ke antrian jika statusnya bukan Paid, ada nomor HP, 
    // dan Status Kirim masih KOSONG (belum pernah diproses).
    if (status !== 'Paid' && phone && !statusKirim) {
      if (tanggalJatuhTempo instanceof Date && !isNaN(tanggalJatuhTempo.getTime())) {
        tanggalJatuhTempo.setHours(0, 0, 0, 0);
        const selisihHari = (tanggalJatuhTempo.getTime() - hariIni.getTime()) / (1000 * 60 * 60 * 24);
        
        // Masukkan ke antrian jika H-10 atau sudah lewat jatuh tempo
        if (selisihHari <= 10) {
          rowsToUpdate.push({ row: i + 1, status: 'Antrian' });
        }
      }
    }
  }

  if (rowsToUpdate.length > 0) {
    sheet.getRangeList(rowsToUpdate.map(r => `R${r.row}`)).setValue('Antrian');
    Logger.log(`${rowsToUpdate.length} tagihan berhasil ditambahkan ke antrian.`);
  } else {
    Logger.log('Tidak ada tagihan baru yang perlu ditambahkan ke antrian.');
  }
}

function tambahAntrianKonfirmasiTemplete(config) {
  if (!config) return;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config.DATA_SHEET_NAME);
  if (!sheet) {
    Logger.log(`ERROR: Sheet data "${config.DATA_SHEET_NAME}" tidak ditemukan.`);
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  let rowsToUpdate = [];

  // Mulai dari i = 2 karena data ada di baris ke-3 spreadsheet
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    const statusKirim = row[STATUS_KIRIM_COLUMN - 1]; // Kolom S (Status Kirim)
    const status = row[5]; // Kolom F (Status)
    const statusPesan = row[16]; // Kolom Q (Status Pesan)
    const phone = row[1]; // Kolom B (No HP)
    const pesanKonfirmasi = row[15]; // Kolom P (Pesan Konfirmasi)
    
    // Hanya tambahkan ke antrian jika status Paid, Status Pesan (Kolom R) kosong,
    // dan Status Kirim (Kolom S) juga kosong.
    if (status == 'Paid' && !statusPesan && !statusKirim && phone && pesanKonfirmasi) {
      rowsToUpdate.push({ row: i + 1, status: 'Antrian Konfirmasi' });
    }
  }

  if (rowsToUpdate.length > 0) {
    sheet.getRangeList(rowsToUpdate.map(r => `R${r.row}`)).setValue('Antrian Konfirmasi');
    Logger.log(`${rowsToUpdate.length} konfirmasi pembayaran berhasil ditambahkan ke antrian.`);
  } else {
    Logger.log('Tidak ada konfirmasi pembayaran baru yang perlu ditambahkan ke antrian.');
  }
}

function prosesSatuPesanAntrianTemplete() {
  const config = getAppConfigTemplete();
  if (!config) return;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config.DATA_SHEET_NAME);
  if (!sheet) {
    Logger.log(`ERROR: Sheet data "${config.DATA_SHEET_NAME}" tidak ditemukan.`);
    return;
  }
  
  // >>>> PERUBAHAN ADA DI BARIS INI <<<<<
  // Hapus .matchEntireCell(true) agar bisa menemukan "Antrian" dan "Antrian Konfirmasi"
  const textFinder = sheet.createTextFinder('Antrian'); 
  const foundCells = textFinder.findAll();
  
  if (foundCells.length === 0) {
    Logger.log('Antrian kosong, tidak ada pesan untuk diproses.');
    return;
  }

  // Ambil baris pertama yang ditemukan
  const cell = foundCells[0];
  const rowNum = cell.getRow();
  const statusType = cell.getValue(); // "Antrian" atau "Antrian Konfirmasi"
  
  // Kunci baris ini dengan status "Proses" agar tidak diambil oleh proses lain
  sheet.getRange(rowNum, STATUS_KIRIM_COLUMN).setValue('Proses');
  SpreadsheetApp.flush(); // Pastikan perubahan tersimpan

  const row = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
  const nama = row[0];
  const phone = String(row[1] || '').trim();
  const pesanNormal = row[2];
  const pesanTerlambat = row[3];
  const tanggalJatuhTempo = row[8];
  const pesanKonfirmasi = row[15];
  const statusPesanCol = 17; // Kolom Q

  let pesanYangAkanDikirim = '';
  let finalStatus = '';
  let logMessage = '';

  if (statusType === 'Antrian Konfirmasi') {
    pesanYangAkanDikirim = pesanKonfirmasi;
    logMessage = `Memproses konfirmasi untuk ${nama}...`;
  } else { // 'Antrian'
    const hariIni = new Date(); hariIni.setHours(0, 0, 0, 0);
    if (tanggalJatuhTempo instanceof Date) {
      tanggalJatuhTempo.setHours(0, 0, 0, 0);
      const selisihHari = (tanggalJatuhTempo.getTime() - hariIni.getTime()) / (1000 * 60 * 60 * 24);
      pesanYangAkanDikirim = (selisihHari < 0) ? pesanTerlambat : pesanNormal;
      logMessage = `Memproses tagihan untuk ${nama}...`;
    }
  }

  if (!pesanYangAkanDikirim) {
    sheet.getRange(rowNum, STATUS_KIRIM_COLUMN).setValue('Gagal: Pesan kosong');
    Logger.log(`Gagal: Pesan kosong untuk ${nama}. Periksa Kolom C atau D.`);
    return;
  }

  Logger.log(logMessage);
  const hasil = WhatsAppProvider.sendWhatsApp(config.WHATSAPP_PROVIDER, phone, pesanYangAkanDikirim, config);

  if (hasil.status === 'success') {
    finalStatus = 'Sukses';
    Logger.log(`Pesan ke ${nama} (${phone}) BERHASIL dikirim.`);
    if (statusType === 'Antrian Konfirmasi') {
      sheet.getRange(rowNum, statusPesanCol).setValue('Sudah Kirim');
      WhatsAppProvider.sendWhatsApp(config.WHATSAPP_PROVIDER, config.ADMIN_PHONE_NUMBER, `✅ *Pembayaran Diterima!*\n\nPelanggan: *${nama}*\nTelah melakukan pembayaran. Konfirmasi telah dikirim.`, config);
    }
  } else {
    finalStatus = 'Gagal: ' + hasil.reason;
    Logger.log(`Pesan ke ${nama} (${phone}) GAGAL dikirim. Alasan: ${hasil.reason}`);
  }

  sheet.getRange(rowNum, STATUS_KIRIM_COLUMN).setValue(finalStatus);
}

/**
 * FUNGSI TRIGGER UTAMA (Dispatcher)
 * Fungsi ini menangani semua trigger edit dari spreadsheet.
 * - Edit di sheet WA_INFORMASI (H2) -> jalankan broadcast.
 * - Edit di sheet data tagihan (Kolom H) -> jadwalkan satu pesan.
 */
function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  const kolom = range.getColumn(); // Kolom H = 8
  const nilaiBaru = e.value;
  const baris = range.getRow();

  // --- KONDISI 1: Trigger untuk Proses Broadcast Informasi ---
  if (sheet.getName() === INFORMASI_SHEET_NAME_Templete && baris === 2 && kolom === 8 && nilaiBaru === 'kirim') {
    
    // Panggil fungsi broadcast yang ada di file Broadcast.gs
    prosesPesanInformasiPeroranganTemplete();
    
    // Kosongkan sel trigger
    e.range.setValue('');
    return; // Hentikan eksekusi
  }

  // --- KONDISI 2: Trigger untuk Jadwalkan Satu Pesan Tagihan ---
  const config = getAppConfigTemplete();
  if (!config) return;

  if (sheet.getName() === config.DATA_SHEET_NAME && kolom === 8 && nilaiBaru === 'kirim') {
    const phone = sheet.getRange(baris, 2).getValue(); // Kolom B
    const pesan = sheet.getRange(baris, 5).getValue(); // Kolom E

    if (!phone || !pesan) {
      sheet.getRange(baris, 5).setValue('Gagal: Nomor HP atau Pesan kosong.');
      sheet.getRange(baris, 8).setValue('');
      return;
    }

    sheet.getRange(baris, 5).setValue('Dijadwalkan');
    sheet.getRange(baris, 8).setValue('Menunggu...');

    const scriptPropertiesTemplete = PropertiesService.getScriptProperties();
    const taskId = "task_" + new Date().getTime();
    const taskData = { row: baris, phone: phone, message: pesan };
    scriptPropertiesTemplete.setProperty(taskId, JSON.stringify(taskData));

    ScriptApp.newTrigger('kirimPesanTerjadwalTemplete')
      .timeBased()
      .after(60 * 1000)
      .create();
      
    Logger.log('Pesan untuk baris ' + baris + ' telah dijadwalkan.');
  }
}
