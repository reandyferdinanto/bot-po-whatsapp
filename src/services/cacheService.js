const Fuse = require('fuse.js');
const env = require('../config/env');
const dbService = require('./dbService');

let materialCache = new Map(); // kode -> { no, kode, nama }
let materialList = [];
let supplierCache = new Map(); // kode -> { no, kode, nama, supplierUtama, frekuensi, totalQty }
let supplierList = [];
let priceCache = new Map(); // kode -> { minPrice, maxPrice, latestPrice, latestSupplier, latestDate, totalOrders }
let transactionsList = [];

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
        kode: (r[6] || '').trim().toUpperCase(),
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

    // Hitung Indeks Harga (Min, Max, Terakhir per material)
    priceCache.clear();
    for (const p of poList) {
      if (!p.kode || p.priceUnit <= 0) continue;
      const k = p.kode;
      if (!priceCache.has(k)) {
        priceCache.set(k, {
          kode: k,
          nama: p.nama,
          minPrice: p.priceUnit,
          maxPrice: p.priceUnit,
          latestPrice: p.priceUnit,
          latestSupplier: p.supplier,
          latestDate: p.date,
          totalOrders: 1,
        });
      } else {
        const item = priceCache.get(k);
        item.minPrice = Math.min(item.minPrice, p.priceUnit);
        item.maxPrice = Math.max(item.maxPrice, p.priceUnit);
        item.latestPrice = p.priceUnit;
        item.latestSupplier = p.supplier || item.latestSupplier;
        item.latestDate = p.date || item.latestDate;
        item.totalOrders++;
      }
    }

    const priceList = Array.from(priceCache.values());
    transactionsList = poList;
    lastSyncedAt = new Date();

    // 4. Sinkronisasi ke PostgreSQL jika aktif
    if (dbService.isAvailable()) {
      await dbService.syncFromSheetsToPg(materialList, supplierList, poList, priceList);
    }

    console.log(`✅ Master Data tersinkronisasi: ${materialList.length} Material, ${supplierList.length} Supplier Master, ${poList.length} PO Transaksi, ${priceList.length} Indeks Harga.`);
    return {
      totalMaterials: materialList.length,
      totalSuppliers: supplierList.length,
      totalPOs: poList.length,
      totalPrices: priceList.length,
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

function enrichItemWithPrice(item) {
  if (item.hargaMin !== undefined) return item; // Sudah diperkaya dari PostgreSQL
  const pInfo = priceCache.get(item.kode.toUpperCase());
  return {
    ...item,
    hargaMin: pInfo ? pInfo.minPrice : 0,
    hargaMax: pInfo ? pInfo.maxPrice : 0,
    hargaTerakhir: pInfo ? pInfo.latestPrice : 0,
    supplierTerakhir: pInfo ? pInfo.latestSupplier : '',
    tglTerakhir: pInfo ? pInfo.latestDate : '',
    totalTransaksi: pInfo ? pInfo.totalOrders : 0,
  };
}

/**
 * Mencari material berdasarkan kode atau nama barang (Substring match + Fuzzy search) beserta histori harga.
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
      items: exactMatches.slice(0, limit).map(enrichItemWithPrice),
    };
  }

  // 3. Fallback ke Fuse.js jika ada typo penulisan
  if (!fuseMaterial) return { total: 0, items: [] };
  const results = fuseMaterial.search(q);
  return {
    total: results.length,
    items: results.slice(0, limit).map(res => enrichItemWithPrice(res.item)),
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
      return { total: pgResults.length, items: pgResults.map(enrichItemWithPrice) };
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
      items: exactMatches.slice(0, limit).map(enrichItemWithPrice),
    };
  }

  // 3. Fallback ke Fuse.js jika ada typo
  if (!fuseSupplier) return { total: 0, items: [] };
  const results = fuseSupplier.search(q);
  return {
    total: results.length,
    items: results.slice(0, limit).map(res => enrichItemWithPrice(res.item)),
  };
}

/**
 * Mencari riwayat pembelian barang dari Supplier X (daftar material, harga min/max/terbaru, dan no PO).
 */
async function getSupplierOrderHistory(supplierQuery, limit = 15) {
  if (!supplierQuery) return null;
  const q = supplierQuery.trim();

  // 1. Coba PostgreSQL jika aktif
  if (dbService.isAvailable()) {
    const pgResult = await dbService.getSupplierItemsFromPg(q, limit);
    if (pgResult && pgResult.items && pgResult.items.length > 0) {
      return pgResult;
    }
  }

  // 2. Fallback RAM
  const lowerQ = q.toLowerCase();
  const matchingTx = transactionsList.filter(t => t.supplier && t.supplier.toLowerCase().includes(lowerQ));
  if (matchingTx.length === 0) return null;

  const actualSupplierName = matchingTx[0].supplier;
  const materialMap = new Map();

  for (const tx of matchingTx) {
    if (!tx.kode || tx.priceUnit <= 0) continue;
    const k = tx.kode.toUpperCase();

    if (!materialMap.has(k)) {
      materialMap.set(k, {
        kode: k,
        nama: tx.nama || '',
        prices: [tx.priceUnit],
        minPrice: tx.priceUnit,
        maxPrice: tx.priceUnit,
        latestPrice: tx.priceUnit,
        latestDate: tx.date || '',
        poSet: new Set([tx.noPo]),
      });
    } else {
      const entry = materialMap.get(k);
      entry.prices.push(tx.priceUnit);
      entry.minPrice = Math.min(entry.minPrice, tx.priceUnit);
      entry.maxPrice = Math.max(entry.maxPrice, tx.priceUnit);
      entry.latestPrice = tx.priceUnit;
      entry.latestDate = tx.date || entry.latestDate;
      entry.poSet.add(tx.noPo);
    }
  }

  const allItems = Array.from(materialMap.values()).map(m => ({
    kode: m.kode,
    nama: m.nama,
    hargaMin: m.minPrice,
    hargaMax: m.maxPrice,
    hargaTerbaru: m.latestPrice,
    tglTerbaru: m.latestDate,
    poList: Array.from(m.poSet),
    totalOrders: m.poSet.size,
  }));

  // Urutkan berdasarkan total order terbanyak
  allItems.sort((a, b) => b.totalOrders - a.totalOrders);

  return {
    supplier: actualSupplierName,
    totalItems: allItems.length,
    items: allItems.slice(0, limit),
  };
}

function getSyncStatus() {
  return {
    isSynced: materialList.length > 0,
    materialCount: materialList.length,
    supplierCount: supplierList.length,
    transactionsCount: transactionsList.length,
    postgresConnected: dbService.isAvailable(),
    lastSyncedAt,
  };
}

function getAllMaterials(query = '', page = 1, limit = 50) {
  let list = materialList;
  if (query) {
    const q = query.trim().toLowerCase();
    list = materialList.filter(m => m.kode.toLowerCase().includes(q) || m.nama.toLowerCase().includes(q));
  }
  const total = list.length;
  const startIndex = (page - 1) * limit;
  const items = list.slice(startIndex, startIndex + limit).map(enrichItemWithPrice);
  return { total, page, limit, items };
}

function getAllSuppliers(query = '', page = 1, limit = 25) {
  const supplierMap = new Map();

  function getSupplierEntry(rawName) {
    const cleanName = (rawName || 'Supplier Lainnya').trim();
    const key = cleanName.toLowerCase();
    if (!supplierMap.has(key)) {
      supplierMap.set(key, {
        supplierName: cleanName,
        totalMaterials: 0,
        totalFrequency: 0,
        totalQty: 0,
        materialsMap: new Map(),
      });
    }
    return supplierMap.get(key);
  }

  // 1. Dari master database Supplier Material (1.506 baris)
  for (const s of supplierList) {
    if (!s.supplierUtama) continue;
    const supEntry = getSupplierEntry(s.supplierUtama);
    const matKey = (s.kode || '').toUpperCase();
    const priceInfo = priceCache.get(matKey);

    if (!supEntry.materialsMap.has(matKey)) {
      supEntry.materialsMap.set(matKey, {
        kode: s.kode,
        nama: s.nama,
        frekuensi: s.frekuensi || 0,
        totalQty: s.totalQty || 0,
        hargaMin: priceInfo ? priceInfo.minPrice : 0,
        hargaMax: priceInfo ? priceInfo.maxPrice : 0,
        hargaTerbaru: priceInfo ? priceInfo.latestPrice : 0,
        tglTerbaru: priceInfo ? priceInfo.latestDate : '',
        totalOrders: priceInfo ? priceInfo.totalOrders : (s.frekuensi || 0),
      });
      supEntry.totalFrequency += s.frekuensi || 0;
      supEntry.totalQty += s.totalQty || 0;
    }
  }

  // 2. Dari transaksi PO 2026 (transactionsList)
  for (const tx of transactionsList) {
    if (!tx.supplier || !tx.kode) continue;
    const supEntry = getSupplierEntry(tx.supplier);
    const matKey = tx.kode.toUpperCase();
    const priceInfo = priceCache.get(matKey);

    if (!supEntry.materialsMap.has(matKey)) {
      supEntry.materialsMap.set(matKey, {
        kode: tx.kode,
        nama: tx.nama || (priceInfo ? priceInfo.nama : ''),
        frekuensi: 1,
        totalQty: tx.qty || 0,
        hargaMin: tx.priceUnit > 0 ? tx.priceUnit : (priceInfo ? priceInfo.minPrice : 0),
        hargaMax: tx.priceUnit > 0 ? tx.priceUnit : (priceInfo ? priceInfo.maxPrice : 0),
        hargaTerbaru: tx.priceUnit > 0 ? tx.priceUnit : (priceInfo ? priceInfo.latestPrice : 0),
        tglTerbaru: tx.date || (priceInfo ? priceInfo.latestDate : ''),
        totalOrders: 1,
      });
      supEntry.totalFrequency += 1;
      supEntry.totalQty += tx.qty || 0;
    } else {
      const mat = supEntry.materialsMap.get(matKey);
      if (tx.priceUnit > 0) {
        mat.hargaMin = mat.hargaMin > 0 ? Math.min(mat.hargaMin, tx.priceUnit) : tx.priceUnit;
        mat.hargaMax = Math.max(mat.hargaMax, tx.priceUnit);
        mat.hargaTerbaru = tx.priceUnit;
        mat.tglTerbaru = tx.date || mat.tglTerbaru;
      }
      mat.totalOrders = (mat.totalOrders || 0) + 1;
      mat.totalQty = (mat.totalQty || 0) + (tx.qty || 0);
      supEntry.totalQty += tx.qty || 0;
    }
  }

  // Convert ke array supplier dan hitung total material
  let list = Array.from(supplierMap.values()).map(sup => {
    const materials = Array.from(sup.materialsMap.values());
    materials.sort((a, b) => (b.frekuensi || b.totalOrders || 0) - (a.frekuensi || a.totalOrders || 0));
    return {
      supplierName: sup.supplierName,
      totalMaterials: materials.length,
      totalFrequency: sup.totalFrequency,
      totalQty: sup.totalQty,
      materials,
    };
  });

  // Urutkan supplier berdasarkan jumlah ragam material terbanyak
  list.sort((a, b) => b.totalMaterials - a.totalMaterials || b.totalFrequency - a.totalFrequency);

  // Filter pencarian (bisa nama supplier, kode material, atau nama material)
  if (query) {
    const q = query.trim().toLowerCase();
    list = list.filter(sup =>
      sup.supplierName.toLowerCase().includes(q) ||
      sup.materials.some(m => m.kode.toLowerCase().includes(q) || m.nama.toLowerCase().includes(q))
    );
  }

  const total = list.length;
  const startIndex = (page - 1) * limit;
  const items = list.slice(startIndex, startIndex + limit);
  return { total, page, limit, items };
}

module.exports = {
  syncMasterData,
  findMaterialByCode,
  searchMaterials,
  getSupplierByCode,
  searchSupplierRecommendations,
  getSupplierOrderHistory,
  getSyncStatus,
  getAllMaterials,
  getAllSuppliers,
};
