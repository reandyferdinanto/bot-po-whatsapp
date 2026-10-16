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
 * Mendeteksi pemetaan indeks kolom secara dinamis berdasarkan baris header (Row 2).
 */
function getColumnMapping(headers) {
  const map = {};
  if (!headers || !Array.isArray(headers)) return map;

  headers.forEach((h, idx) => {
    if (!h) return;
    const clean = String(h).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

    if (/^no\.?$/i.test(clean) || /^no\s*urut/i.test(clean)) {
      if (map.no === undefined) map.no = idx;
    } else if (/^status/i.test(clean)) {
      if (map.status === undefined) map.status = idx;
    } else if (/^date$/i.test(clean) || /^tanggal\s*po/i.test(clean) || /^tgl\s*po/i.test(clean)) {
      if (map.date === undefined) map.date = idx;
    } else if (/^no\.?\s*po$/i.test(clean) || /^nomor\s*po/i.test(clean)) {
      if (map.noPo === undefined) map.noPo = idx;
    } else if (/^supplier/i.test(clean) || /^vendor/i.test(clean)) {
      if (map.supplier === undefined) map.supplier = idx;
    } else if (/quot/i.test(clean) || /vendor\s*reff/i.test(clean) || /penawaran/i.test(clean)) {
      if (map.quotation === undefined) map.quotation = idx;
    } else if (/kode.*material/i.test(clean) || /kode.*item/i.test(clean) || /kode.*barang/i.test(clean)) {
      if (map.kode === undefined) map.kode = idx;
    } else if (/nama.*material/i.test(clean) || /nama.*barang/i.test(clean) || /deskripsi/i.test(clean)) {
      if (map.nama === undefined) map.nama = idx;
    } else if (/^qty/i.test(clean) || /^quantity/i.test(clean) || /^jumlah/i.test(clean)) {
      if (map.qty === undefined) map.qty = idx;
    } else if (/price\s*unit/i.test(clean) || /harga\s*satuan/i.test(clean) || /harga\s*unit/i.test(clean)) {
      if (map.priceUnit === undefined) map.priceUnit = idx;
    } else if (/^discount/i.test(clean) || /^diskon/i.test(clean) || /^disc/i.test(clean)) {
      if (map.discount === undefined) map.discount = idx;
    } else if (/^ppn$/i.test(clean) || /^pajak$/i.test(clean) || /^vat$/i.test(clean)) {
      if (map.ppn === undefined) map.ppn = idx;
    } else if (/^total$/i.test(clean) || /^total\s*harga/i.test(clean)) {
      if (map.total === undefined) map.total = idx;
    } else if (/^no\.?\s*grpo/i.test(clean) || /^grpo\s*no/i.test(clean)) {
      if (map.grpo === undefined) map.grpo = idx;
    } else if (/last\s*date.*grpo/i.test(clean) || /grpo.*done/i.test(clean)) {
      if (map.lastGrpoDate === undefined) map.lastGrpoDate = idx;
    } else if (/tanggal\s*bayar/i.test(clean) || /tgl\s*bayar/i.test(clean)) {
      if (map.tglBayar === undefined) map.tglBayar = idx;
    } else if (/tanggal\s*invoice/i.test(clean) || /tgl\s*invoice/i.test(clean)) {
      if (map.tglInvoice === undefined) map.tglInvoice = idx;
    } else if (/no\.?\s*invoice/i.test(clean) || /nomor\s*invoice/i.test(clean)) {
      if (map.noInvoice === undefined) map.noInvoice = idx;
    } else if (/^ket/i.test(clean) || /^keterangan/i.test(clean) || /^notes?/i.test(clean)) {
      if (map.ket === undefined) map.ket = idx;
    } else if (/^tanggal$/i.test(clean)) {
      if (map.tglBayar === undefined) map.tglBayar = idx;
    }
  });

  return map;
}

/**
 * Membersihkan dan mengubah teks angka/mata uang ke angka float murni.
 */
function parseNumeric(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const s = String(val).trim();
  if (s === '-' || s === 'Rp -' || s === 'IDR -' || s === '0') return 0;

  let clean = s.replace(/[^0-9.,-]/g, '');
  if (!clean) return 0;

  if (clean.includes('.') && clean.includes(',')) {
    if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
      clean = clean.replace(/,/g, '');
    }
  } else if (clean.includes(',')) {
    const parts = clean.split(',');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      clean = clean.replace(/,/g, '');
    } else {
      clean = clean.replace(',', '.');
    }
  } else if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      clean = clean.replace(/\./g, '');
    }
  }
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

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
        range: "'PO 2026'!A1:Z",
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

    // 3. Process PO 2026 Rows dengan pemetaan dinamis
    const poRawRows = poRes.data.values || [];
    let headerRowIdx = 1;
    if (!poRawRows[1] || poRawRows[1].filter(Boolean).length < 3) {
      headerRowIdx = 0;
    }
    const headers = poRawRows[headerRowIdx] || [];
    const map = getColumnMapping(headers);

    const poList = [];
    let currentHeader = {
      no: '',
      status: 'Open',
      date: '',
      noPo: '',
      supplier: '',
      quotation: '',
      grpo: '',
      lastGrpoDate: '',
      tglBayar: '',
      tglInvoice: '',
      noInvoice: '',
      ket: '',
    };

    for (let r = headerRowIdx + 1; r < poRawRows.length; r++) {
      const row = poRawRows[r];
      if (!row || row.length === 0) continue;

      const rowNoPo = (map.noPo !== undefined && row[map.noPo]) ? String(row[map.noPo]).trim() : '';
      if (rowNoPo && rowNoPo !== '-' && rowNoPo !== '"') {
        currentHeader = {
          no: (map.no !== undefined && row[map.no]) ? String(row[map.no]).trim() : '',
          status: (map.status !== undefined && row[map.status]) ? String(row[map.status]).trim() : 'Open',
          date: (map.date !== undefined && row[map.date]) ? String(row[map.date]).trim() : '',
          noPo: rowNoPo,
          supplier: (map.supplier !== undefined && row[map.supplier]) ? String(row[map.supplier]).trim() : '',
          quotation: (map.quotation !== undefined && row[map.quotation]) ? String(row[map.quotation]).trim() : '',
          grpo: (map.grpo !== undefined && row[map.grpo]) ? String(row[map.grpo]).trim() : '',
          lastGrpoDate: (map.lastGrpoDate !== undefined && row[map.lastGrpoDate]) ? String(row[map.lastGrpoDate]).trim() : '',
          tglBayar: (map.tglBayar !== undefined && row[map.tglBayar]) ? String(row[map.tglBayar]).trim() : '',
          tglInvoice: (map.tglInvoice !== undefined && row[map.tglInvoice]) ? String(row[map.tglInvoice]).trim() : '',
          noInvoice: (map.noInvoice !== undefined && row[map.noInvoice]) ? String(row[map.noInvoice]).trim() : '',
          ket: (map.ket !== undefined && row[map.ket]) ? String(row[map.ket]).trim() : '',
        };
      }

      const rawKode = (map.kode !== undefined && row[map.kode]) ? String(row[map.kode]).trim().toUpperCase() : '';
      const nama = (map.nama !== undefined && row[map.nama]) ? String(row[map.nama]).trim() : '';
      const qty = map.qty !== undefined ? parseNumeric(row[map.qty]) : 0;
      const priceUnit = map.priceUnit !== undefined ? parseNumeric(row[map.priceUnit]) : 0;
      const discount = map.discount !== undefined ? parseNumeric(row[map.discount]) : 0;
      const ppn = map.ppn !== undefined ? parseNumeric(row[map.ppn]) : 0;
      let total = map.total !== undefined ? parseNumeric(row[map.total]) : 0;

      if (!total && qty > 0 && priceUnit > 0) {
        total = Math.round(qty * priceUnit * (1 - discount) + ppn);
      }

      const hasItem = !!(rawKode || nama || qty > 0 || priceUnit > 0 || total > 0);
      const isHeaderRow = !!rowNoPo;
      if (!hasItem && !isHeaderRow) continue;
      if (!currentHeader.noPo) continue;

      const itemObj = {
        rowIndex: r + 1,
        sheetName: 'PO 2026',
        year: '2026',
        no: currentHeader.no || '',
        status: currentHeader.status || 'Open',
        date: currentHeader.date || '',
        noPo: currentHeader.noPo,
        supplier: currentHeader.supplier || '',
        quotation: currentHeader.quotation || '',
        kode: rawKode,
        nama,
        qty,
        priceUnit,
        discount,
        ppn,
        total,
        grpo: (map.grpo !== undefined && row[map.grpo]) ? String(row[map.grpo]).trim() : currentHeader.grpo,
        lastGrpoDate: (map.lastGrpoDate !== undefined && row[map.lastGrpoDate]) ? String(row[map.lastGrpoDate]).trim() : currentHeader.lastGrpoDate,
        tglBayar: (map.tglBayar !== undefined && row[map.tglBayar]) ? String(row[map.tglBayar]).trim() : currentHeader.tglBayar,
        tglInvoice: (map.tglInvoice !== undefined && row[map.tglInvoice]) ? String(row[map.tglInvoice]).trim() : currentHeader.tglInvoice,
        noInvoice: (map.noInvoice !== undefined && row[map.noInvoice]) ? String(row[map.noInvoice]).trim() : currentHeader.noInvoice,
        ket: (map.ket !== undefined && row[map.ket]) ? String(row[map.ket]).trim() : currentHeader.ket,
      };

      poList.push(itemObj);
    }

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
          latestPo: p.noPo,
          totalOrders: 1,
        });
      } else {
        const item = priceCache.get(k);
        item.minPrice = Math.min(item.minPrice, p.priceUnit);
        item.maxPrice = Math.max(item.maxPrice, p.priceUnit);
        item.latestPrice = p.priceUnit;
        item.latestSupplier = p.supplier || item.latestSupplier;
        item.latestDate = p.date || item.latestDate;
        item.latestPo = p.noPo || item.latestPo;
        item.totalOrders++;
      }
    }

    const priceList = Array.from(priceCache.values());
    transactionsList = poList;
    lastSyncedAt = new Date();

    // 4. Sinkronisasi ke PostgreSQL jika aktif (Gunakan partial replace agar data 2017-2025 tidak terhapus)
    if (dbService.isAvailable()) {
      await dbService.syncFromSheetsToPg(materialList, supplierList, poList, priceList, { fullReplace: false });
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

async function getAllSuppliers(query = '', page = 1, limit = 25) {
  // 1. Coba query dari PostgreSQL yang memiliki data lengkap
  if (dbService.isAvailable()) {
    try {
      const pgRes = await dbService.getAllSuppliersFromPg(query, page, limit);
      if (pgRes && pgRes.items && pgRes.items.length > 0) {
        return pgRes;
      }
    } catch (pgErr) {
      console.warn('⚠️ Gagal query getAllSuppliersFromPg, fallback ke RAM:', pgErr.message);
    }
  }

  // 2. Fallback In-Memory cache (menggabungkan master suppliers + transaksi PO)
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

  // A. Dari master database Supplier Material (1.506 baris)
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

  // B. Dari transaksi PO (prioritaskan allYearsTransactions jika ada)
  const txSource = allYearsTransactions.length > 0 ? allYearsTransactions : transactionsList;
  for (const tx of txSource) {
    if (!tx.supplier || !tx.kode) continue;
    const supEntry = getSupplierEntry(tx.supplier);
    const matKey = tx.kode.toUpperCase();
    const priceInfo = priceCache.get(matKey);

    if (!supEntry.materialsMap.has(matKey)) {
      const poSet = new Set(tx.noPo ? [tx.noPo] : []);
      supEntry.materialsMap.set(matKey, {
        kode: tx.kode,
        nama: tx.nama || (priceInfo ? priceInfo.nama : ''),
        frekuensi: 1,
        totalQty: tx.qty || 0,
        hargaMin: tx.priceUnit > 0 ? tx.priceUnit : (priceInfo ? priceInfo.minPrice : 0),
        hargaMax: tx.priceUnit > 0 ? tx.priceUnit : (priceInfo ? priceInfo.maxPrice : 0),
        hargaTerbaru: tx.priceUnit > 0 ? tx.priceUnit : (priceInfo ? priceInfo.latestPrice : 0),
        tglTerbaru: tx.date || (priceInfo ? priceInfo.latestDate : ''),
        latestPo: tx.noPo || '',
        poSet,
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
      if (tx.noPo) {
        mat.poSet = mat.poSet || new Set();
        mat.poSet.add(tx.noPo);
        mat.latestPo = tx.noPo;
      }
      mat.totalOrders = (mat.totalOrders || 0) + 1;
      mat.totalQty = (mat.totalQty || 0) + (tx.qty || 0);
      supEntry.totalQty += tx.qty || 0;
    }
  }

  // Convert ke array supplier dan hitung referensi harga keseluruhan supplier
  let list = Array.from(supplierMap.values()).map((sup) => {
    const materials = Array.from(sup.materialsMap.values()).map((m) => ({
      ...m,
      latestPo: m.latestPo || (m.poSet ? Array.from(m.poSet)[0] : ''),
      poList: m.poSet ? Array.from(m.poSet) : [],
    }));
    materials.sort((a, b) => (b.frekuensi || b.totalOrders || 0) - (a.frekuensi || a.totalOrders || 0));

    let minP = 0;
    let maxP = 0;
    let latestP = 0;
    let totalSpend = 0;

    for (const m of materials) {
      if (m.hargaMin > 0) {
        minP = minP === 0 ? m.hargaMin : Math.min(minP, m.hargaMin);
      }
      if (m.hargaMax > 0) {
        maxP = Math.max(maxP, m.hargaMax);
      }
      if (m.hargaTerbaru > 0 && latestP === 0) {
        latestP = m.hargaTerbaru;
      }
      totalSpend += (m.totalQty || 1) * (m.hargaTerbaru || m.hargaMin || 0);
    }

    return {
      supplierName: sup.supplierName,
      totalMaterials: materials.length,
      totalFrequency: sup.totalFrequency,
      totalQty: sup.totalQty,
      totalSpend: Math.round(totalSpend),
      supplierMinPrice: minP,
      supplierMaxPrice: maxP,
      supplierLatestPrice: latestP,
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
    const poRanges = poSheetNames.map((name) => `'${name}'!A1:Z`);
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

    // 5. Process Seluruh Tab PO (Index 2 ke atas) dengan Pemetaan Kolom Dinamis
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

      if (rawRows.length < 2) {
        yearlyBreakdown.push({
          year,
          sheetName,
          totalRows: 0,
          totalPOs: 0,
          totalSpend: 0,
          countOpen: 0,
          countClose: 0,
          countPending: 0,
          countCancelled: 0,
        });
        continue;
      }

      // Deteksi baris header (Biasanya Row index 1 / Row 2 di Google Sheets)
      let headerRowIdx = 1;
      if (!rawRows[1] || rawRows[1].filter(Boolean).length < 3) {
        headerRowIdx = 0;
      }
      const headers = rawRows[headerRowIdx] || [];
      const map = getColumnMapping(headers);

      let currentHeader = {
        no: '',
        status: 'Closed',
        date: '',
        noPo: '',
        supplier: '',
        quotation: '',
        grpo: '',
        lastGrpoDate: '',
        tglBayar: '',
        tglInvoice: '',
        noInvoice: '',
        ket: '',
      };

      for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (!row || row.length === 0) continue;

        // Ambil header transaksi baru jika ada
        const rowNoPo = (map.noPo !== undefined && row[map.noPo]) ? String(row[map.noPo]).trim() : '';
        if (rowNoPo && rowNoPo !== '-' && rowNoPo !== '"') {
          currentHeader = {
            no: (map.no !== undefined && row[map.no]) ? String(row[map.no]).trim() : '',
            status: (map.status !== undefined && row[map.status]) ? String(row[map.status]).trim() : 'Closed',
            date: (map.date !== undefined && row[map.date]) ? String(row[map.date]).trim() : '',
            noPo: rowNoPo,
            supplier: (map.supplier !== undefined && row[map.supplier]) ? String(row[map.supplier]).trim() : '',
            quotation: (map.quotation !== undefined && row[map.quotation]) ? String(row[map.quotation]).trim() : '',
            grpo: (map.grpo !== undefined && row[map.grpo]) ? String(row[map.grpo]).trim() : '',
            lastGrpoDate: (map.lastGrpoDate !== undefined && row[map.lastGrpoDate]) ? String(row[map.lastGrpoDate]).trim() : '',
            tglBayar: (map.tglBayar !== undefined && row[map.tglBayar]) ? String(row[map.tglBayar]).trim() : '',
            tglInvoice: (map.tglInvoice !== undefined && row[map.tglInvoice]) ? String(row[map.tglInvoice]).trim() : '',
            noInvoice: (map.noInvoice !== undefined && row[map.noInvoice]) ? String(row[map.noInvoice]).trim() : '',
            ket: (map.ket !== undefined && row[map.ket]) ? String(row[map.ket]).trim() : '',
          };
        }

        // Ambil data item material dari kolom yang sesuai
        const rawKode = (map.kode !== undefined && row[map.kode]) ? String(row[map.kode]).trim().toUpperCase() : '';
        const nama = (map.nama !== undefined && row[map.nama]) ? String(row[map.nama]).trim() : '';
        const qty = map.qty !== undefined ? parseNumeric(row[map.qty]) : 0;
        const priceUnit = map.priceUnit !== undefined ? parseNumeric(row[map.priceUnit]) : 0;
        const discount = map.discount !== undefined ? parseNumeric(row[map.discount]) : 0;
        const ppn = map.ppn !== undefined ? parseNumeric(row[map.ppn]) : 0;
        let total = map.total !== undefined ? parseNumeric(row[map.total]) : 0;

        if (!total && qty > 0 && priceUnit > 0) {
          total = Math.round(qty * priceUnit * (1 - discount) + ppn);
        }

        // Validasi apakah baris ini berisi data valid
        const hasItem = !!(rawKode || nama || qty > 0 || priceUnit > 0 || total > 0);
        const isHeaderRow = !!rowNoPo;

        if (!hasItem && !isHeaderRow) continue;
        if (!currentHeader.noPo) continue;

        const rowGrpo = (map.grpo !== undefined && row[map.grpo]) ? String(row[map.grpo]).trim() : currentHeader.grpo;
        const rowLastGrpoDate = (map.lastGrpoDate !== undefined && row[map.lastGrpoDate]) ? String(row[map.lastGrpoDate]).trim() : currentHeader.lastGrpoDate;
        const rowTglBayar = (map.tglBayar !== undefined && row[map.tglBayar]) ? String(row[map.tglBayar]).trim() : currentHeader.tglBayar;
        const rowTglInvoice = (map.tglInvoice !== undefined && row[map.tglInvoice]) ? String(row[map.tglInvoice]).trim() : currentHeader.tglInvoice;
        const rowNoInvoice = (map.noInvoice !== undefined && row[map.noInvoice]) ? String(row[map.noInvoice]).trim() : currentHeader.noInvoice;
        const rowKet = (map.ket !== undefined && row[map.ket]) ? String(row[map.ket]).trim() : currentHeader.ket;

        const itemObj = {
          rowIndex: r + 1,
          sheetName,
          year,
          no: currentHeader.no || '',
          status: currentHeader.status || 'Closed',
          date: currentHeader.date || '',
          noPo: currentHeader.noPo,
          supplier: currentHeader.supplier || '',
          quotation: currentHeader.quotation || '',
          kode: rawKode,
          nama,
          qty,
          priceUnit,
          discount,
          ppn,
          total,
          grpo: rowGrpo || '',
          lastGrpoDate: rowLastGrpoDate || '',
          tglBayar: rowTglBayar || '',
          tglInvoice: rowTglInvoice || '',
          noInvoice: rowNoInvoice || '',
          ket: rowKet || '',
        };

        currentSheetItems.push(itemObj);
        allYearsTransactions.push(itemObj);
        yearPoSet.add(currentHeader.noPo);
        globalPoSet.add(currentHeader.noPo);

        const stLower = (currentHeader.status || '').toLowerCase();
        if (stLower === 'cancelled' || stLower === 'cancel') {
          countCancelled++;
        } else {
          yearSpend += total;
          grandTotalSpendAll += total;
          if (stLower === 'close' || stLower === 'closed' || stLower === 'lunas') {
            countClose++;
          } else if (stLower === 'pending') {
            countPending++;
          } else {
            countOpen++;
          }

          if (currentHeader.supplier) {
            const sKey = currentHeader.supplier.toLowerCase();
            if (!supplierAggregateMap.has(sKey)) {
              supplierAggregateMap.set(sKey, {
                supplierName: currentHeader.supplier,
                totalSpend: 0,
                poCount: new Set(),
                totalQty: 0,
              });
            }
            const sEntry = supplierAggregateMap.get(sKey);
            sEntry.totalSpend += total;
            sEntry.totalQty += qty;
            sEntry.poCount.add(currentHeader.noPo);
          }

          if (rawKode) {
            if (!materialAggregateMap.has(rawKode)) {
              materialAggregateMap.set(rawKode, {
                kode: rawKode,
                nama: nama || (materialCache.get(rawKode) ? materialCache.get(rawKode).nama : ''),
                totalQty: 0,
                orderCount: 0,
                totalSpend: 0,
              });
            }
            const mEntry = materialAggregateMap.get(rawKode);
            mEntry.totalQty += qty;
            mEntry.orderCount++;
            mEntry.totalSpend += total;
          }
        }

        // Catat Histori Harga Material (Urut tahun naik, sehingga tahun terbaru menjadi harga terakhir)
        if (rawKode && priceUnit > 0) {
          if (!priceCache.has(rawKode)) {
            priceCache.set(rawKode, {
              kode: rawKode,
              nama: nama || (materialCache.get(rawKode) ? materialCache.get(rawKode).nama : ''),
              minPrice: priceUnit,
              maxPrice: priceUnit,
              latestPrice: priceUnit,
              latestSupplier: currentHeader.supplier || '',
              latestDate: currentHeader.date || '',
              latestPo: currentHeader.noPo || '',
              totalOrders: 1,
            });
          } else {
            const pInfo = priceCache.get(rawKode);
            pInfo.minPrice = Math.min(pInfo.minPrice, priceUnit);
            pInfo.maxPrice = Math.max(pInfo.maxPrice, priceUnit);
            pInfo.latestPrice = priceUnit;
            if (currentHeader.supplier) pInfo.latestSupplier = currentHeader.supplier;
            if (currentHeader.date) pInfo.latestDate = currentHeader.date;
            if (currentHeader.noPo) pInfo.latestPo = currentHeader.noPo;
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
      await dbService.syncFromSheetsToPg(materialList, supplierList, allYearsTransactions, priceList, { fullReplace: true });
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

async function getHistoricalStats() {
  if (historicalStatsSummary && historicalStatsSummary.totalYears > 1) {
    return historicalStatsSummary;
  }

  if (dbService.isAvailable()) {
    const pgStats = await dbService.getHistoricalStatsFromPg();
    if (pgStats && pgStats.totalYears > 1) {
      historicalStatsSummary = pgStats;
      return pgStats;
    }
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

async function getHistoricalTransactions(options = {}) {
  const { year, search, page = 1, limit = 50 } = options;

  if (dbService.isAvailable()) {
    const pgRes = await dbService.getHistoricalTransactionsFromPg({ year, search, page, limit });
    if (pgRes) {
      return pgRes;
    }
  }

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
