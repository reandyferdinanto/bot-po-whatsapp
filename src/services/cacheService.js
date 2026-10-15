const Fuse = require('fuse.js');
const env = require('../config/env');
const dbService = require('./dbService');

let materialCache = new Map(); // kode -> { no, kode, nama }
let materialList = [];
let supplierCache = new Map(); // kode -> { no, kode, nama, supplierUtama, frekuensi, totalQty }
let supplierList = [];
let priceCache = new Map(); // kode -> { minPrice, maxPrice, latestPrice, latestSupplier, latestDate, totalOrders }
let transactionsList = [];

let allYearsTransactions = []; // Seluruh baris transaksi dari 2017 hingga 2026
let historicalStatsSummary = null; // Rangkuman statistik multi-tahun (2017-2026)
let sheetsSyncedList = []; // Daftar nama sheet yang disinkronkan

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

/**
 * Sinkronisasi seluruh tab PO dari tahun 2017 hingga 2026, database Material, dan database Supplier Material.
 */
async function syncAllSheets(sheetsClient) {
  try {
    console.log('🔄 Memulai Sinkronisasi Multi-Tahun (PO 2017 s/d PO 2026 & Master)...');

    // 1. Ambil metadata seluruh sheet yang ada di spreadsheet
    let allSheetTitles = [];
    try {
      const meta = await sheetsClient.spreadsheets.get({
        spreadsheetId: env.sheets.spreadsheetId,
      });
      allSheetTitles = (meta.data.sheets || []).map((s) => s.properties.title);
      console.log(`📋 Ditemukan ${allSheetTitles.length} tab di Google Sheets:`, allSheetTitles.join(', '));
    } catch (metaErr) {
      console.warn('⚠️ Gagal ambil metadata sheets, gunakan daftar fallback:', metaErr.message);
    }

    // Filter sheet PO (e.g. "PO 2017", "PO 2018", ..., "PO 2026")
    let poSheetNames = allSheetTitles.filter((t) => /^PO\s*(?:20\d{2})/i.test(t));
    if (poSheetNames.length === 0) {
      poSheetNames = [
        'PO 2017', 'PO 2018', 'PO 2019', 'PO 2020', 'PO 2021',
        'PO 2022', 'PO 2023', 'PO 2024', 'PO 2025', 'PO 2026',
      ];
    }
    if (!poSheetNames.some((t) => /2026/i.test(t))) {
      poSheetNames.push('PO 2026');
    }

    // Sort ascending by year (2017 -> 2026)
    poSheetNames.sort((a, b) => {
      const yA = parseInt((a.match(/\d{4}/) || [0])[0], 10);
      const yB = parseInt((b.match(/\d{4}/) || [0])[0], 10);
      return yA - yB;
    });

    console.log(`📑 Tab PO yang akan disinkronkan (${poSheetNames.length}):`, poSheetNames.join(', '));

    // 2. Fetch Master Data & Semua Tab PO
    const masterRanges = [
      "'database Material'!A2:C",
      "'database Supplier Material'!A2:F",
    ];
    const poRanges = poSheetNames.map((name) => `'${name}'!A2:W`);
    const allRanges = [...masterRanges, ...poRanges];

    let valueRanges = [];
    try {
      const batchRes = await sheetsClient.spreadsheets.values.batchGet({
        spreadsheetId: env.sheets.spreadsheetId,
        ranges: allRanges,
      });
      valueRanges = batchRes.data.valueRanges || [];
    } catch (batchErr) {
      console.warn('⚠️ batchGet gagal, fallback mengambil satu-per-satu:', batchErr.message);
      for (const r of allRanges) {
        try {
          const single = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: env.sheets.spreadsheetId,
            range: r,
          });
          valueRanges.push(single.data);
        } catch (sErr) {
          console.warn(`Skip range ${r}:`, sErr.message);
          valueRanges.push({ values: [] });
        }
      }
    }

    // 3. Process database Material (Index 0)
    const matRows = (valueRanges[0] && valueRanges[0].values) || [];
    materialCache.clear();
    materialList = matRows
      .filter((row) => row && row[1])
      .map((row) => ({
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

    // 4. Process database Supplier Material (Index 1)
    const supRows = (valueRanges[1] && valueRanges[1].values) || [];
    supplierCache.clear();
    supplierList = supRows
      .filter((row) => row && row[1])
      .map((row) => ({
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

    // 5. Process Seluruh Tab PO (Index 2 ke atas)
    allYearsTransactions = [];
    const yearlyBreakdown = [];
    let grandTotalSpendAll = 0;
    const globalPoSet = new Set();
    priceCache.clear();

    const supplierAggregateMap = new Map();
    const materialAggregateMap = new Map();

    for (let sIdx = 0; sIdx < poSheetNames.length; sIdx++) {
      const sheetName = poSheetNames[sIdx];
      const rangeIdx = sIdx + 2;
      const vData = valueRanges[rangeIdx];
      const rawRows = (vData && vData.values) || [];

      const yearMatch = sheetName.match(/\d{4}/);
      const year = yearMatch ? yearMatch[0] : '2026';

      let yearSpend = 0;
      let countOpen = 0;
      let countClose = 0;
      let countPending = 0;
      let countCancelled = 0;
      const yearPoSet = new Set();
      const currentSheetItems = [];

      for (let r = 0; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (!row || !row[3]) continue;

        const noPo = (row[3] || '').trim();
        const status = (row[1] || 'Open').trim();
        const kode = (row[6] || '').trim().toUpperCase();
        const nama = (row[7] || '').trim();
        const qty = parseFloat(String(row[8] || '0').replace(/,/g, '')) || 0;
        const priceUnit = parseFloat(String(row[13] || '0').replace(/[^0-9.-]/g, '')) || 0;
        const discount = parseFloat(String(row[14] || '0').replace(/,/g, '')) || 0;
        const ppn = parseFloat(String(row[15] || '0').replace(/[^0-9.-]/g, '')) || 0;

        let total = parseFloat(String(row[16] || '0').replace(/[^0-9.-]/g, ''));
        if (isNaN(total) || total === 0) {
          total = Math.round(qty * priceUnit * (1 - discount) + ppn);
        }

        const supplier = (row[4] || '').trim();

        const itemObj = {
          rowIndex: r + 2,
          sheetName,
          year,
          no: row[0] || '',
          status,
          date: row[2] || '',
          noPo,
          supplier,
          quotation: row[5] || '',
          kode,
          nama,
          qty,
          priceUnit,
          discount,
          ppn,
          total,
          grpo: row[17] || '',
          lastGrpoDate: row[18] || '',
          tglBayar: row[19] || '',
          tglInvoice: row[20] || '',
          noInvoice: row[21] || '',
          ket: row[22] || '',
        };

        currentSheetItems.push(itemObj);
        allYearsTransactions.push(itemObj);
        yearPoSet.add(noPo);
        globalPoSet.add(noPo);

        const stLower = status.toLowerCase();
        if (stLower === 'cancelled') {
          countCancelled++;
        } else {
          yearSpend += total;
          grandTotalSpendAll += total;
          if (stLower === 'close' || stLower === 'lunas') {
            countClose++;
          } else if (stLower === 'pending') {
            countPending++;
          } else {
            countOpen++;
          }

          if (supplier) {
            const sKey = supplier.toLowerCase();
            if (!supplierAggregateMap.has(sKey)) {
              supplierAggregateMap.set(sKey, {
                supplierName: supplier,
                totalSpend: 0,
                poCount: new Set(),
                totalQty: 0,
              });
            }
            const sEntry = supplierAggregateMap.get(sKey);
            sEntry.totalSpend += total;
            sEntry.totalQty += qty;
            sEntry.poCount.add(noPo);
          }

          if (kode) {
            if (!materialAggregateMap.has(kode)) {
              materialAggregateMap.set(kode, {
                kode,
                nama,
                totalQty: 0,
                orderCount: 0,
                totalSpend: 0,
              });
            }
            const mEntry = materialAggregateMap.get(kode);
            mEntry.totalQty += qty;
            mEntry.orderCount++;
            mEntry.totalSpend += total;
          }
        }

        if (kode && priceUnit > 0) {
          if (!priceCache.has(kode)) {
            priceCache.set(kode, {
              kode,
              nama,
              minPrice: priceUnit,
              maxPrice: priceUnit,
              latestPrice: priceUnit,
              latestSupplier: supplier,
              latestDate: row[2] || '',
              totalOrders: 1,
            });
          } else {
            const pInfo = priceCache.get(kode);
            pInfo.minPrice = Math.min(pInfo.minPrice, priceUnit);
            pInfo.maxPrice = Math.max(pInfo.maxPrice, priceUnit);
            pInfo.latestPrice = priceUnit;
            pInfo.latestSupplier = supplier || pInfo.latestSupplier;
            pInfo.latestDate = row[2] || pInfo.latestDate;
            pInfo.totalOrders++;
          }
        }
      }

      if (year === '2026') {
        transactionsList = currentSheetItems;
      }

      yearlyBreakdown.push({
        year,
        sheetName,
        totalRows: currentSheetItems.length,
        totalPOs: yearPoSet.size,
        totalSpend: Math.round(yearSpend),
        countOpen,
        countClose,
        countPending,
        countCancelled,
      });
    }

    const topSuppliersAllTime = Array.from(supplierAggregateMap.values())
      .map((s) => ({
        supplierName: s.supplierName,
        totalSpend: Math.round(s.totalSpend),
        totalOrders: s.poCount.size,
        totalQty: Math.round(s.totalQty),
      }))
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 10);

    const topMaterialsAllTime = Array.from(materialAggregateMap.values())
      .sort((a, b) => b.orderCount - a.orderCount || b.totalQty - a.totalQty)
      .slice(0, 10);

    const priceList = Array.from(priceCache.values());
    lastSyncedAt = new Date();
    sheetsSyncedList = poSheetNames;

    historicalStatsSummary = {
      totalYears: yearlyBreakdown.length,
      totalAllRows: allYearsTransactions.length,
      totalAllPOs: globalPoSet.size,
      totalAllSpend: Math.round(grandTotalSpendAll),
      averageSpendPerYear: Math.round(grandTotalSpendAll / (yearlyBreakdown.length || 1)),
      yearlyBreakdown,
      topSuppliersAllTime,
      topMaterialsAllTime,
      sheetsSynced: poSheetNames,
      lastSyncedAt,
    };

    if (dbService.isAvailable()) {
      await dbService.syncFromSheetsToPg(materialList, supplierList, allYearsTransactions, priceList);
    }

    console.log(
      `✅ SINKRONISASI LENGKAP SUKSES! ${poSheetNames.length} Tab PO (${poSheetNames[0]} - ${poSheetNames[poSheetNames.length - 1]}), ` +
      `${allYearsTransactions.length} Total Baris, Rp ${grandTotalSpendAll.toLocaleString('id-ID')} Total Belanja.`
    );

    return {
      success: true,
      totalSheets: poSheetNames.length,
      sheets: poSheetNames,
      totalAllRows: allYearsTransactions.length,
      totalAllPOs: globalPoSet.size,
      totalAllSpend: Math.round(grandTotalSpendAll),
      totalMaterials: materialList.length,
      totalSuppliers: supplierList.length,
      totalPrices: priceList.length,
      yearlyBreakdown,
      lastSyncedAt,
    };
  } catch (err) {
    console.error('❌ Gagal sinkronisasi seluruh sheet:', err.message);
    throw err;
  }
}

function getHistoricalStats() {
  if (historicalStatsSummary) {
    return historicalStatsSummary;
  }
  const currentTotal = transactionsList.reduce(
    (sum, t) => sum + (t.status?.toLowerCase() !== 'cancelled' ? (t.total || 0) : 0),
    0
  );
  return {
    totalYears: 1,
    totalAllRows: transactionsList.length,
    totalAllPOs: new Set(transactionsList.map((t) => t.noPo)).size,
    totalAllSpend: currentTotal,
    averageSpendPerYear: currentTotal,
    yearlyBreakdown: [
      {
        year: '2026',
        sheetName: 'PO 2026',
        totalRows: transactionsList.length,
        totalPOs: new Set(transactionsList.map((t) => t.noPo)).size,
        totalSpend: currentTotal,
        countOpen: transactionsList.filter((t) => t.status === 'Open').length,
        countClose: transactionsList.filter((t) => t.status === 'Close').length,
        countPending: transactionsList.filter((t) => t.status === 'Pending').length,
        countCancelled: transactionsList.filter((t) => t.status === 'Cancelled').length,
      },
    ],
    topSuppliersAllTime: [],
    topMaterialsAllTime: [],
    sheetsSynced: ['PO 2026'],
    lastSyncedAt,
  };
}

function getHistoricalTransactions(options = {}) {
  const { year, search, page = 1, limit = 50 } = options;
  let list = allYearsTransactions.length > 0 ? allYearsTransactions : transactionsList;

  if (year && year !== 'ALL') {
    list = list.filter((t) => t.year === String(year) || t.sheetName?.includes(String(year)));
  }

  if (search) {
    const q = search.trim().toLowerCase();
    list = list.filter(
      (t) =>
        (t.noPo && t.noPo.toLowerCase().includes(q)) ||
        (t.supplier && t.supplier.toLowerCase().includes(q)) ||
        (t.kode && t.kode.toLowerCase().includes(q)) ||
        (t.nama && t.nama.toLowerCase().includes(q)) ||
        (t.grpo && t.grpo.toLowerCase().includes(q))
    );
  }

  const total = list.length;
  const startIndex = (page - 1) * limit;
  const items = list.slice(startIndex, startIndex + limit);
  return { total, page, limit, items };
}

module.exports = {
  syncMasterData,
  syncAllSheets,
  findMaterialByCode,
  searchMaterials,
  getSupplierByCode,
  searchSupplierRecommendations,
  getSupplierOrderHistory,
  getSyncStatus,
  getAllMaterials,
  getAllSuppliers,
  getHistoricalStats,
  getHistoricalTransactions,
};
