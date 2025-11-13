// File: codeBroadcast.gs
// Berisi semua logika terkait broadcast pesan informasi dengan sistem antrian


/**
 * FUNGSI PEMICU (QUEUER)
 * Fungsi ini dipanggil oleh onEdit(e) saat mengetik "kirim" di H2.
 * Tugasnya: Menemukan semua pesan "Belum Kirim" dan memasukkannya ke antrian.
 */
function prosesPesanInformasiPeroranganTemplete() {
  const config = getAppConfigTemplete();
  if (!config) {
    Logger.log('Dibatalkan: Konfigurasi tidak ditemukan saat proses informasi.');
    return;
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INFORMASI_SHEET_NAME_Templete);
  if (!sheet) {
    Logger.log(`ERROR: Sheet "${INFORMASI_SHEET_NAME_Templete}" tidak ditemukan.`);
    SpreadsheetApp.getUi().alert(`Error: Sheet "${INFORMASI_SHEET_NAME_Templete}" tidak ditemukan.`);
    return;
  }

  const data = sheet.getDataRange().getValues();
  const scriptProperties = PropertiesService.getScriptProperties();
  let rowsToSchedule = [];
  let firstTaskId = null;

  // INDEKS KOLOM DI SHEET WA_INFORMASI
  const NAMA_COLUMN = 0;      // Kolom A
  const HP_COLUMN = 1;        // Kolom B
  const PESAN_COLUMN = 4;     // Kolom E
  const STATUS_COLUMN = 5;    // Kolom F

  // Loop untuk menemukan semua pesan yang akan dijadwalkan
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = String(row[STATUS_COLUMN] || '').trim();

    if (status === '') {
      const nama = String(row[NAMA_COLUMN] || '').trim();
      const phone = String(row[HP_COLUMN] || '').trim();
      const pesan = String(row[PESAN_COLUMN] || '').trim();
      const rowNum = i + 1;

      if (phone && pesan) {
        const taskId = "bc_task_" + new Date().getTime() + "_" + rowNum; // ID unik
        const taskData = { row: rowNum, phone: phone, message: pesan };
        scriptProperties.setProperty(taskId, JSON.stringify(taskData));
        rowsToSchedule.push(rowNum);
        if (!firstTaskId) {
          firstTaskId = taskId; // Simpan ID tugas pertama untuk dipicu
        }
      }
    }
  }

  if (rowsToSchedule.length > 0) {
    // Update status semua baris yang dimasukkan ke antrian
    sheet.getRangeList(rowsToSchedule.map(r => `F${r}`)).setValue('Dijadwalkan');
    Logger.log(`${rowsToSchedule.length} pesan berhasil dimasukkan ke antrian broadcast.`);

    // Buat trigger untuk tugas PERTAMA, dijalankan 1 menit dari sekarang
    if (firstTaskId) {
      scriptProperties.setProperty('FIRST_BC_TASK', firstTaskId); // Simpan ID pertama
      ScriptApp.newTrigger('prosesSatuPesanBroadcastTemplete')
        .timeBased()
        .after(60 * 1000) // 1 menit
        .create();
      Logger.log('Trigger untuk pesan broadcast pertama telah dibuat.');
    }
  } else {
    Logger.log('Tidak ada pesan "Belum Kirim" untuk di-broadcast.');
  }
}

/**
 * FUNGSI PEKERJA (WORKER)
 * Fungsi ini dijalankan oleh trigger setiap 1 menit.
 * Tugasnya: Mengambil SATU pesan dari antrian dan mengirimkannya.
 */
function prosesSatuPesanBroadcastTemplete() {
  const config = getAppConfigTemplete();
  if (!config) return;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INFORMASI_SHEET_NAME_Templete);
  const scriptProperties = PropertiesService.getScriptProperties();
  
  // Ambil ID tugas pertama yang harus dijalankan
  let taskId = scriptProperties.getProperty('FIRST_BC_TASK');
  if (!taskId) {
    Logger.log('Antrian broadcast kosong atau tidak ada tugas pertama.');
    return;
  }

  const taskDataString = scriptProperties.getProperty(taskId);
  if (!taskDataString) {
    Logger.log(`Tugas ${taskId} tidak ditemukan. Mungkin sudah diproses.`);
    scriptProperties.deleteProperty('FIRST_BC_TASK'); // Bersihkan jika kosong
    return;
  }

  try {
    const taskData = JSON.parse(taskDataString);
    const { row, phone, message } = taskData;

    Logger.log(`Memproses broadcast untuk baris ${row} (${phone})...`);

    // Kirim pesan
    const hasil = WhatsAppProvider.sendWhatsApp(config.WHATSAPP_PROVIDER, phone, message, config);

    // Update status di spreadsheet
    if (hasil.status === 'success') {
      sheet.getRange(row, 6).setValue('Sudah Kirim');
      Logger.log(`✅ Sukses kirim ke ${phone}.`);
    } else {
      sheet.getRange(row, 6).setValue('Gagal: ' + hasil.reason);
      Logger.log(`❌ Gagal kirim ke ${phone}. Alasan: ${hasil.reason}`);
    }

  } catch (e) {
    sheet.getRange(taskData.row, 6).setValue('Error: ' + e.message);
    Logger.log(`❌ Error saat kirim ke ${taskData.phone}: ${e.message}`);
  } finally {
    // Hapus tugas yang sudah selesai
    scriptProperties.deleteProperty(taskId);
    scriptProperties.deleteProperty('FIRST_BC_TASK');
  }

  // Cek apakah ada tugas selanjutnya di antrian
  const allTasks = scriptProperties.getKeys();
  const nextTask = allTasks.find(key => key.startsWith('bc_task_'));
  
  if (nextTask) {
    // Jika ada, jadwalkan untuk 1 menit lagi
    scriptProperties.setProperty('FIRST_BC_TASK', nextTask);
    ScriptApp.newTrigger('prosesSatuPesanBroadcastTemplete')
      .timeBased()
      .after(60 * 1000) // 1 menit
      .create();
    Logger.log(`Menjadwalkan tugas broadcast berikutnya: ${nextTask}`);
  } else {
    Logger.log('Semua antrian broadcast telah selesai diproses.');
  }

  // Hapus trigger yang baru saja dijalankan
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'prosesSatuPesanBroadcastTemplete') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}
