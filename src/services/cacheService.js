const Fuse = require('fuse.js');
const env = require('../config/env');

let materialCache = new Map(); // kode -> { no, kode, nama }
let materialList = [];
let supplierCache = new Map(); // kode -> { no, kode, nama, supplierUtama, frekuensi, totalQty }
let supplierList = [];

let fuseMaterial = null;
let fuseSupplier = null;
let lastSyncedAt = null;

/**
 * Memuat dan meng-cache tab 'database Material' dan 'database Supplier Material' ke memory.
 */
async function syncMasterData(sheetsClient) {
  try {
    console.log('🔄 Memulai sinkronisasi Master Data dari Google Sheets...');

    const [materialRes, supplierRes] = await Promise.all([
      sheetsClient.spreadsheets.values.get({
        spreadsheetId: env.sheets.spreadsheetId,
        range: "'database Material'!A2:C",
      }),
      sheetsClient.spreadsheets.values.get({
        spreadsheetId: env.sheets.spreadsheetId,
        range: "'database Supplier Material'!A2:F",
      }),
    ]);

    // 1. Process database Material
    const matRows = materialRes.data.values || [];
    materialCache.clear();
    materialList = matRows
      .filter(row => row && row[1]) // Pastikan ada kode
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
      threshold: 0.35, // Cukup ketat agar akurat
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
        totalQty: parseInt(row[5], 10) || 0,
      }));

    for (const item of supplierList) {
      supplierCache.set(item.kode.toUpperCase(), item);
    }

    fuseSupplier = new Fuse(supplierList, {
      keys: ['kode', 'nama', 'supplierUtama'],
      threshold: 0.35,
      ignoreLocation: true,
    });

    lastSyncedAt = new Date();
    console.log(`✅ Master Data tersinkronisasi: ${materialList.length} Material, ${supplierList.length} Supplier Master.`);
    return {
      totalMaterials: materialList.length,
      totalSuppliers: supplierList.length,
      syncedAt: lastSyncedAt,
    };
  } catch (err) {
    console.error('❌ Gagal sinkronisasi master data:', err.message);
    throw err;
  }
}

/**
 * Mencari material berdasarkan kode eksak (case-insensitive).
 */
function findMaterialByCode(kode) {
  if (!kode) return null;
  return materialCache.get(kode.trim().toUpperCase()) || null;
}

/**
 * Mencari material dengan fuzzy search (berdasarkan kode atau nama barang).
 */
function searchMaterials(query, limit = 5) {
  if (!query || !fuseMaterial) return [];
  const results = fuseMaterial.search(query);
  return results.slice(0, limit).map(res => res.item);
}

/**
 * Mencari supplier utama berdasarkan kode material.
 */
function getSupplierByCode(kode) {
  if (!kode) return null;
  return supplierCache.get(kode.trim().toUpperCase()) || null;
}

/**
 * Mencari rekomendasi supplier berdasarkan nama barang atau kode.
 */
function searchSupplierRecommendations(query, limit = 5) {
  if (!query || !fuseSupplier) return [];
  const results = fuseSupplier.search(query);
  return results.slice(0, limit).map(res => res.item);
}

function getSyncStatus() {
  return {
    isSynced: materialList.length > 0,
    materialCount: materialList.length,
    supplierCount: supplierList.length,
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
