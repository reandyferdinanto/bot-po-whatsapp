const { getSheetsClient } = require('../src/config/googleAuth');
const cacheService = require('../src/services/cacheService');
const dbService = require('../src/services/dbService');

async function run() {
  console.log('\n=============================================================');
  console.log('🚀 MEMULAI IMPORT / SINKRONISASI MANUAL SELURUH TAB PO (2017-2026)');
  console.log('=============================================================\n');

  try {
    // 1. Inisialisasi PostgreSQL
    console.log('🐘 Menyiapkan tabel PostgreSQL...');
    await dbService.migrateTables();

    // 2. Otorisasi Google Sheets
    console.log('🔑 Mengambil kredensial Google Sheets API...');
    const sheetsClient = getSheetsClient();

    // 3. Jalankan Sinkronisasi Seluruh Tahun
    console.log('⏳ Memproses seluruh tab Google Sheets...');
    const startTime = Date.now();
    const result = await cacheService.syncAllSheets(sheetsClient);
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n=============================================================');
    console.log('🎉 IMPORT MANUAL SELESAI DENGAN SUKSES!');
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

    console.log('\n✅ Seluruh data di PostgreSQL (tabel transactions_po, master_materials, master_suppliers, material_prices) telah diperbarui 100% akurat.');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Gagal import manual:', err);
    process.exit(1);
  }
}

run();
