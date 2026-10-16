const cron = require('node-cron');
const env = require('../config/env');
const { hasValidToken, getSheetsClient } = require('../config/googleAuth');
const cacheService = require('./cacheService');
const kursService = require('./kursService');

let syncTask = null;
let kursTask = null;

/**
 * Menjalankan Cron Job untuk sinkronisasi berkala dari Google Sheets ke PostgreSQL / Cache RAM.
 */
function initCron() {
  if (!env.cron.enabled) {
    console.log('ℹ️ Cron auto-sync dinonaktifkan (CRON_ENABLED=false).');
    return null;
  }

  const schedule = env.cron.schedule || '*/30 * * * *';
  console.log(`⏰ Cron Job Auto-Sync dijadwalkan: "${schedule}"`);

  syncTask = cron.schedule(schedule, async () => {
    console.log(`\n⏰ [CRON ${new Date().toLocaleTimeString('id-ID')}] Menjalankan sinkronisasi berkala dari Google Sheets...`);
    if (!hasValidToken()) {
      console.warn('⚠️ [CRON] Token Google Sheets belum diotorisasi, melewati proses sync.');
      return;
    }

    try {
      const sheetsClient = getSheetsClient();
      const result = await cacheService.syncMasterData(sheetsClient);
      console.log(`✅ [CRON] Sinkronisasi sukses: ${result.totalMaterials} Material, ${result.totalSuppliers} Supplier.`);
    } catch (err) {
      console.error('❌ [CRON] Error saat sinkronisasi berkala:', err.message);
    }
  });

  // Auto-sync Kurs Tengah USD dari Ortax setiap jam pada jam kerja (08:00 - 18:00 WIB)
  kursTask = cron.schedule('15 8-18 * * *', async () => {
    console.log(`\n⏰ [CRON ${new Date().toLocaleTimeString('id-ID')}] Memeriksa pembaruan Kurs Tengah USD dari Ortax...`);
    try {
      const kurs = await kursService.getKursUsd({ forceRefresh: true });
      console.log(`✅ [CRON] Kurs USD berhasil diperbarui: Rp ${kurs.kursTengah} (${kurs.tanggal})`);
    } catch (kErr) {
      console.warn('⚠️ [CRON] Gagal auto-update Kurs USD:', kErr.message);
    }
  });

  return syncTask;
}

/**
 * Menghentikan Cron Job jika diperlukan.
 */
function stopCron() {
  if (syncTask) {
    syncTask.stop();
    syncTask = null;
  }
  if (kursTask) {
    kursTask.stop();
    kursTask = null;
  }
}

module.exports = {
  initCron,
  stopCron,
};
