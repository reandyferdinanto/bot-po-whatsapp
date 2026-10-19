const { getSheetsClient } = require('../src/config/googleAuth');
const cacheService = require('../src/services/cacheService');
const dbService = require('../src/services/dbService');

/**
 * Script Sinkronisasi Manual Google Sheets -> PostgreSQL untuk AI / Developer CLI
 * Penggunaan:
 *   node scripts/syncAllYears.js         -> Sync seluruh tab (2017-2026) + master
 *   node scripts/syncAllYears.js 2026    -> Sync hanya tab 'PO 2026' + master
 *   npm run sync:all                     -> Alias untuk sync seluruh tab
 */
async function run() {
  const args = process.argv.slice(2);
  const targetArg = args[0] ? args[0].trim() : 'all';

  if (targetArg === '--help' || targetArg === '-h') {
    console.log(`
Panduan Sync Manual Google Sheets -> PostgreSQL:
  node scripts/syncAllYears.js           Sinkronkan seluruh tab PO (2017-2026) & Master Data ke Postgres
  node scripts/syncAllYears.js 2026      Sinkronkan tab PO 2026 & Master Data ke Postgres
  node scripts/syncAllYears.js all       Sama dengan sync seluruh tab
    `);
    process.exit(0);
  }

  console.log('\n=============================================================');
  console.log(`🚀 MEMULAI SINKRONISASI MANUAL SHEETS -> POSTGRES (Target: ${targetArg.toUpperCase()})`);
  console.log('=============================================================\n');

  try {
    // 1. Inisialisasi PostgreSQL
    console.log('🐘 Menyiapkan tabel PostgreSQL...');
    await dbService.migrateTables();

    // 2. Otorisasi Google Sheets
    console.log('🔑 Mengambil kredensial Google Sheets API...');
    const sheetsClient = getSheetsClient();

    const startTime = Date.now();

    if (targetArg === '2026' || targetArg === 'PO 2026') {
      console.log('⏳ Memproses Sheet PO 2026 & Master Data...');
      const result = await cacheService.syncMasterData(sheetsClient);
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('\n=============================================================');
      console.log('🎉 SINKRONISASI PO 2026 SELESAI!');
      console.log('=============================================================');
      console.log(`⏱️ Waktu Eksekusi    : ${durationSec} detik`);
      console.log(`📦 Total Material   : ${result.materialsCount} item`);
      console.log(`🏢 Total Supplier   : ${result.suppliersCount} vendor`);
      console.log(`📊 Total Transaksi  : ${result.transactionsCount} baris`);
      console.log(`🏷️ Indeks Harga Mat : ${result.pricesCount} material terindeks`);
      console.log('\n✅ Data tab PO 2026 di PostgreSQL telah berhasil diperbarui.');
    } else {
      console.log('⏳ Memproses seluruh tab Google Sheets (2017 s/d 2026)...');
      const result = await cacheService.syncAllSheets(sheetsClient);
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('\n=============================================================');
      console.log('🎉 SINKRONISASI SELURUH TAB SELESAI!');
      console.log('=============================================================');
      console.log(`⏱️ Waktu Eksekusi    : ${durationSec} detik`);
      console.log(`📑 Total Sheet PO   : ${result.totalSheets} tab (${result.sheets.join(', ')})`);
      console.log(`📦 Total Material   : ${result.totalMaterials.toLocaleString('id-ID')} item`);
      console.log(`🏢 Total Supplier   : ${result.totalSuppliers.toLocaleString('id-ID')} vendor`);
      console.log(`📊 Total Transaksi  : ${result.totalAllRows.toLocaleString('id-ID')} baris item`);
      console.log(`🏷️ Total Unik PO    : ${result.totalAllPOs.toLocaleString('id-ID')} Purchase Orders`);
      console.log(`💰 Total Belanja    : Rp ${result.totalAllSpend.toLocaleString('id-ID')}`);
      console.log(`🏷️ Indeks Harga Mat : ${result.totalPrices.toLocaleString('id-ID')} material terindeks`);

      console.log('\n📊 Ringkasan per Tahun:');
      result.yearlyBreakdown.forEach((y) => {
        console.log(`  • ${y.sheetName}: ${y.totalPOs} PO | ${y.totalRows} baris item | Total: Rp ${y.totalSpend.toLocaleString('id-ID')} (Open: ${y.countOpen}, Close: ${y.countClose}, Pending: ${y.countPending}, Cancelled: ${y.countCancelled})`);
      });

      console.log('\n✅ Seluruh data di PostgreSQL telah diperbarui 100% akurat.');
    }

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Gagal import manual:', err);
    process.exit(1);
  }
}

run();
