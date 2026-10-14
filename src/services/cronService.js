const cron = require('node-cron');
const env = require('../config/env');
const { hasValidToken, getSheetsClient } = require('../config/googleAuth');
const cacheService = require('./cacheService');

let syncTask = null;

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
}

module.exports = {
  initCron,
  stopCron,
};
