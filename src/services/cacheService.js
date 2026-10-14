const Fuse = require('fuse.js');
const env = require('../config/env');
const dbService = require('./dbService');

let materialCache = new Map(); // kode -> { no, kode, nama }
let materialList = [];
let supplierCache = new Map(); // kode -> { no, kode, nama, supplierUtama, frekuensi, totalQty }
let supplierList = [];

let fuseMaterial = null;
let fuseSupplier = null;
let lastSyncedAt = null;

/**
 * Memuat dan meng-cache tab 'database Material', 'database Supplier Material', dan 'PO 2026' ke memory & PostgreSQL.
 */
async function syncMasterData(sheetsClient) {
  try {
    console.log('🔄 Memulai sinkronisasi Master Data dari Google Sheets...');

    const [materialRes, supplierRes, poRes] = await Promise.all([
      sheetsClient.spreadsheets.values.get({
        spreadsheetId: env.sheets.spreadsheetId,
        range: "'database Material'!A2:C",
      }),
      sheetsClient.spreadsheets.values.get({
        spreadsheetId: env.sheets.spreadsheetId,
        range: "'database Supplier Material'!A2:F",
      }),
      sheetsClient.spreadsheets.values.get({
        spreadsheetId: env.sheets.spreadsheetId,
        range: "'PO 2026'!A2:W",
      }).catch(err => {
        console.warn('ℹ️ Skip PO 2026 sync:', err.message);
        return { data: { values: [] } };
      }),
    ]);

    // 1. Process database Material
    const matRows = materialRes.data.values || [];
    materialCache.clear();
    materialList = matRows
      .filter(row => row && row[1])
      .map(row => ({
        no: row[0] || '',
        kode: (row[1] || '').trim(),
        nama: (row[2] || '').trim(),
      }));

    for (const item of materialList) {
      materialCache.set(item.kode.toUpperCase(), item);
    }

    fuseMaterial = new Fuse(materialList, {
      keys: ['kode', 'nama'],
      threshold: 0.35,
      ignoreLocation: true,
    });

    // 2. Process database Supplier Material
    const supRows = supplierRes.data.values || [];
    supplierCache.clear();
    supplierList = supRows
      .filter(row => row && row[1])
      .map(row => ({
        no: row[0] || '',
        kode: (row[1] || '').trim(),
        nama: (row[2] || '').trim(),
        supplierUtama: (row[3] || '').trim(),
        frekuensi: parseInt(row[4], 10) || 0,
        totalQty: parseFloat(row[5]) || 0,
      }));

    for (const item of supplierList) {
      supplierCache.set(item.kode.toUpperCase(), item);
    }

    fuseSupplier = new Fuse(supplierList, {
      keys: ['kode', 'nama', 'supplierUtama'],
      threshold: 0.35,
      ignoreLocation: true,
    });

    // 3. Process PO 2026 Rows
    const poRawRows = poRes.data.values || [];
    const poList = poRawRows
      .filter(r => r && r[3])
      .map((r, idx) => ({
        rowIndex: idx + 2,
        no: r[0] || '',
        status: r[1] || 'Open',
        date: r[2] || '',
        noPo: r[3] || '',
        supplier: r[4] || '',
        quotation: r[5] || '',
        kode: r[6] || '',
        nama: r[7] || '',
        qty: parseFloat(r[8]) || 0,
        priceUnit: parseFloat(r[13]) || 0,
        discount: parseFloat(r[14]) || 0,
        ppn: parseFloat(r[15]) || 0,
        total: parseFloat(r[16]) || 0,
        grpo: r[17] || '',
        lastGrpoDate: r[18] || '',
        tglBayar: r[19] || '',
        tglInvoice: r[20] || '',
        noInvoice: r[21] || '',
        ket: r[22] || '',
      }));

    lastSyncedAt = new Date();

    // 4. Sinkronisasi ke PostgreSQL jika aktif
    if (dbService.isAvailable()) {
      await dbService.syncFromSheetsToPg(materialList, supplierList, poList);
    }

    console.log(`✅ Master Data tersinkronisasi: ${materialList.length} Material, ${supplierList.length} Supplier Master, ${poList.length} PO Transaksi.`);
    return {
      totalMaterials: materialList.length,
      totalSuppliers: supplierList.length,
      totalPOs: poList.length,
      syncedAt: lastSyncedAt,
    };
  } catch (err) {
    console.error('❌ Gagal sinkronisasi master data:', err.message);
    throw err;
  }
}

/**
 * Mencari material berdasarkan kode eksak (case-insensitive) dari RAM.
 */
function findMaterialByCode(kode) {
  if (!kode) return null;
  return materialCache.get(kode.trim().toUpperCase()) || null;
}

/**
 * Mencari material berdasarkan kode atau nama barang (Substring match + Fuzzy search).
 */
async function searchMaterials(query, limit = 15) {
  if (!query) return { total: 0, items: [] };
  const q = query.trim();
  const lowerQ = q.toLowerCase();

  // 1. Coba PostgreSQL jika aktif
  if (dbService.isAvailable()) {
    const pgResults = await dbService.searchMaterialFromPg(q, limit);
    if (pgResults && pgResults.length > 0) {
      return { total: pgResults.length, items: pgResults };
    }
  }

  // 2. Direct Substring Match di RAM (Paling Cepat & Lengkap untuk kata kunci seperti 'elbow', 'gates')
  const exactMatches = materialList.filter(m =>
    m.kode.toLowerCase().includes(lowerQ) || m.nama.toLowerCase().includes(lowerQ)
  );

  if (exactMatches.length > 0) {
    return {
      total: exactMatches.length,
      items: exactMatches.slice(0, limit),
    };
  }

  // 3. Fallback ke Fuse.js jika ada typo penulisan
  if (!fuseMaterial) return { total: 0, items: [] };
  const results = fuseMaterial.search(q);
  return {
    total: results.length,
    items: results.slice(0, limit).map(res => res.item),
  };
}

/**
 * Mencari supplier utama berdasarkan kode material dari RAM.
 */
function getSupplierByCode(kode) {
  if (!kode) return null;
  return supplierCache.get(kode.trim().toUpperCase()) || null;
}

/**
 * Mencari rekomendasi supplier (Substring match + Fuzzy search).
 */
async function searchSupplierRecommendations(query, limit = 10) {
  if (!query) return { total: 0, items: [] };
  const q = query.trim();
  const lowerQ = q.toLowerCase();

  // 1. Coba PostgreSQL jika aktif
  if (dbService.isAvailable()) {
    const pgResults = await dbService.searchSupplierFromPg(q, limit);
    if (pgResults && pgResults.length > 0) {
      return { total: pgResults.length, items: pgResults };
    }
  }

  // 2. Direct Substring Match di RAM
  const exactMatches = supplierList.filter(s =>
    s.kode.toLowerCase().includes(lowerQ) ||
    s.nama.toLowerCase().includes(lowerQ) ||
    s.supplierUtama.toLowerCase().includes(lowerQ)
  );

  if (exactMatches.length > 0) {
    return {
      total: exactMatches.length,
      items: exactMatches.slice(0, limit),
    };
  }

  // 3. Fallback ke Fuse.js jika ada typo
  if (!fuseSupplier) return { total: 0, items: [] };
  const results = fuseSupplier.search(q);
  return {
    total: results.length,
    items: results.slice(0, limit).map(res => res.item),
  };
}

function getSyncStatus() {
  return {
    isSynced: materialList.length > 0,
    materialCount: materialList.length,
    supplierCount: supplierList.length,
    postgresConnected: dbService.isAvailable(),
    lastSyncedAt,
  };
}

module.exports = {
  syncMasterData,
  findMaterialByCode,
  searchMaterials,
  getSupplierByCode,
  searchSupplierRecommendations,
  getSyncStatus,
};
