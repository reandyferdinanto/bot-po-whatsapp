const { getSheetsClient } = require('../config/googleAuth');
const env = require('../config/env');
const cacheService = require('./cacheService');
const dbService = require('./dbService');

/**
 * Format tanggal sekarang menjadi DD/MM/YYYY
 */
function getCurrentFormattedDate() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Mengambil baris terakhir dan nomor urut terakhir pada tab 'PO 2026'.
 */
async function getLastRowInfo() {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.sheets.spreadsheetId,
    range: "'PO 2026'!A:D",
  });

  const rows = res.data.values || [];
  let maxNo = 0;
  for (let i = 1; i < rows.length; i++) {
    const val = parseInt(rows[i][0], 10);
    if (!isNaN(val) && val > maxNo) {
      maxNo = val;
    }
  }

  return {
    rowCount: rows.length, // total baris terisi saat ini
    nextNo: maxNo + 1,
  };
}

/**
 * Menyimpan transaksi PO baru (bisa multi-item) ke tab 'PO 2026'.
 *
 * @param {Object} poData
 * @param {string} poData.noPo - Nomor PO resmi
 * @param {string} poData.supplier - Nama Supplier
 * @param {string} [poData.date] - Tanggal PO (DD/MM/YYYY)
 * @param {string} [poData.quotation] - Nomor penawaran vendor
 * @param {Array} poData.items - Array item: [{ kode, nama?, qty, harga, diskon?, ppn?, ket? }]
 */
async function appendPOTransaction(poData) {
  const sheets = getSheetsClient();
  const { rowCount, nextNo } = await getLastRowInfo();

  const dateStr = poData.date || getCurrentFormattedDate();
  const rowsToInsert = [];
  let currentNo = nextNo;
  let currentRowIdx = rowCount + 1; // 1-based row index in spreadsheet

  let grandTotal = 0;

  for (const item of poData.items) {
    let materialName = item.nama;
    if (!materialName) {
      const cached = cacheService.findMaterialByCode(item.kode);
      materialName = cached ? cached.nama : '-';
    }

    const qty = parseFloat(item.qty) || 0;
    const priceUnit = parseFloat(item.harga) || 0;
    const discount = parseFloat(item.diskon) || 0; // Desimal misal 0.1 atau 0
    const ppn = parseFloat(item.ppn) || 0;

    // Hitung nominal total per item (nilai angka langsung)
    const itemTotal = Math.round((qty * priceUnit) * (1 - discount) + ppn);
    grandTotal += itemTotal;

    // Schema 23 Kolom (A - W)
    const row = [
      currentNo,                        // A (0): NO.
      'Open',                           // B (1): STATUS
      dateStr,                          // C (2): DATE
      poData.noPo.trim(),               // D (3): NO. PO
      poData.supplier.trim(),           // E (4): SUPPLIER
      poData.quotation || '',           // F (5): QUOT. / Vendor Reff
      (item.kode || '').trim().toUpperCase(), // G (6): Kode Item Material
      materialName,                     // H (7): Nama Material
      qty,                              // I (8): Quantity
      '',                               // J (9): TTD P Endik / P Adhis
      '',                               // K (10): Em
      '',                               // L (11): DO
      '',                               // M (12): Fkt/Inv
      priceUnit,                        // N (13): Price Unit
      discount,                         // O (14): Discount
      ppn,                              // P (15): PPN
      itemTotal,                        // Q (16): TOTAL (Nominal Angka)
      '',                               // R (17): No. GRPO
      '',                               // S (18): LAST DATE OF GRPO JOB DONE
      '',                               // T (19): TANGGAL BAYAR
      '',                               // U (20): TANGGAL INVOICE
      '',                               // V (21): NO. INVOICE
      item.ket || '',                   // W (22): KET
    ];

    rowsToInsert.push(row);
    currentNo++;
    currentRowIdx++;
  }

  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: env.sheets.spreadsheetId,
    range: "'PO 2026'!A:W",
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: rowsToInsert,
    },
  });

  return {
    success: true,
    noPo: poData.noPo,
    itemsInserted: rowsToInsert.length,
    grandTotal,
    updatedRange: res.data.updates ? res.data.updates.updatedRange : '',
  };
}

/**
 * Mencari PO berdasarkan Nomor PO pada tab 'PO 2026' (atau arsip jika tidak ada).
 */
async function getPOByNumber(noPo, forceFreshFromSheets = false) {
  if (!noPo) return null;
  const cleanNo = noPo.trim().toUpperCase();

  // 1. Coba baca dari PostgreSQL lokal (<5ms) hanya jika tidak diminta data fresh
  if (!forceFreshFromSheets && dbService.isAvailable()) {
    try {
      const pgPo = await dbService.getPOFromPg(cleanNo);
      if (pgPo) return pgPo;
    } catch (err) {
      console.warn('Fallback ke Google Sheets untuk getPOByNumber:', err.message);
    }
  }

  // 2. Baca langsung dari Google Sheets
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.sheets.spreadsheetId,
    range: "'PO 2026'!A:W",
  });

  const rows = res.data.values || [];
  const matchingItems = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNoPo = (row[3] || '').trim().toUpperCase();

    if (rowNoPo === cleanNo) {
      matchingItems.push({
        rowIndex: i + 1, // 1-based baris fisik spreadsheet
        no: row[0] || '',
        status: row[1] || 'Open',
        date: row[2] || '',
        noPo: row[3] || '',
        supplier: row[4] || '',
        quotation: row[5] || '',
        kode: row[6] || '',
        nama: row[7] || '',
        qty: parseFloat(row[8]) || 0,
        ttd: row[9] || '',
        em: row[10] || '',
        doNum: row[11] || '',
        fktInv: row[12] || '',
        priceUnit: parseFloat(row[13]) || 0,
        discount: parseFloat(row[14]) || 0,
        ppn: parseFloat(row[15]) || 0,
        total: row[16] || 0,
        grpo: row[17] || '',
        lastGrpoDate: row[18] || '',
        tglBayar: row[19] || '',
        tglInvoice: row[20] || '',
        noInvoice: row[21] || '',
        ket: row[22] || '',
      });
    }
  }

  if (matchingItems.length === 0) return null;

  const first = matchingItems[0];
  let grandTotal = 0;
  for (const it of matchingItems) {
    const val = parseFloat(it.total) || (it.qty * it.priceUnit * (1 - it.discount) + it.ppn);
    grandTotal += val;
  }

  return {
    noPo: first.noPo,
    supplier: first.supplier,
    date: first.date,
    status: first.status,
    quotation: first.quotation,
    ttd: first.ttd,
    em: first.em,
    doNum: first.doNum,
    fktInv: first.fktInv,
    grpo: first.grpo,
    lastGrpoDate: first.lastGrpoDate,
    tglBayar: first.tglBayar,
    noInvoice: first.noInvoice,
    tglInvoice: first.tglInvoice,
    ket: first.ket,
    grandTotal,
    items: matchingItems,
  };
}

/**
 * Memperbarui seluruh kolom (A s/d W) dan daftar material dari suatu nomor PO.
 * Mendukung perubahan data header, edit material yang ada, penambahan item baru,
 * maupun pengurangan item (untuk antisipasi kesalahan OCR atau revisi transaksi).
 */
async function updateCompletePO(noPo, updateData) {
  const existing = await getPOByNumber(noPo, true);
  if (!existing || existing.items.length === 0) {
    return { success: false, message: `PO ${noPo} tidak ditemukan di sheet 'PO 2026'.` };
  }

  const sheets = getSheetsClient();
  const header = updateData.header || updateData;
  const newItems = Array.isArray(updateData.items) ? updateData.items : existing.items;

  const targetNoPo = (header.noPo || noPo).trim();
  const dateStr = header.date || existing.date || getCurrentFormattedDate();
  const statusStr = header.status || existing.status || 'Open';
  const supplierStr = (header.supplier || existing.supplier || '').trim();
  const quotationStr = header.quotation !== undefined ? header.quotation : (existing.quotation || '');
  const ttdStr = header.ttd !== undefined ? header.ttd : (existing.ttd || '');
  const emStr = header.em !== undefined ? header.em : (existing.em || '');
  const doNumStr = header.doNum !== undefined ? header.doNum : (existing.doNum || '');
  const fktInvStr = header.fktInv !== undefined ? header.fktInv : (existing.fktInv || '');
  const grpoStr = header.grpo !== undefined ? header.grpo : (existing.grpo || '');
  const lastGrpoDateStr = header.lastGrpoDate !== undefined ? header.lastGrpoDate : (existing.lastGrpoDate || '');
  const tglBayarStr = header.tglBayar !== undefined ? header.tglBayar : (existing.tglBayar || '');
  const tglInvoiceStr = header.tglInvoice !== undefined ? header.tglInvoice : (existing.tglInvoice || '');
  const noInvoiceStr = header.noInvoice !== undefined ? header.noInvoice : (existing.noInvoice || '');
  const headerKetStr = header.ket !== undefined ? header.ket : (existing.ket || '');

  const updateRequests = [];
  const existingCount = existing.items.length;
  const newCount = newItems.length;
  const minCount = Math.min(existingCount, newCount);

  const updatedRowsForPg = [];

  // 1. Update baris-baris fisik yang sudah ada (1 s/d minCount)
  for (let i = 0; i < minCount; i++) {
    const it = newItems[i];
    const rIdx = existing.items[i].rowIndex;
    const noUrut = existing.items[i].no || (i + 1);

    const kode = (it.kode || '').trim().toUpperCase();
    let nama = it.nama || '';
    if (!nama && kode) {
      const cached = cacheService.findMaterialByCode(kode);
      nama = cached ? cached.nama : '-';
    }

    const qty = parseFloat(it.qty) || 0;
    const priceUnit = parseFloat(it.priceUnit !== undefined ? it.priceUnit : it.harga) || 0;
    const discount = parseFloat(it.discount !== undefined ? it.discount : it.diskon) || 0;
    const ppn = parseFloat(it.ppn) || 0;
    const itemTotal = it.total !== undefined && !isNaN(parseFloat(it.total))
      ? Math.round(parseFloat(it.total))
      : Math.round((qty * priceUnit) * (1 - discount) + ppn);

    const itemKet = it.ket !== undefined ? it.ket : headerKetStr;

    // Schema 23 Kolom (A - W)
    const rowValues = [
      noUrut,             // A: NO.
      statusStr,          // B: STATUS
      dateStr,            // C: DATE
      targetNoPo,         // D: NO. PO
      supplierStr,        // E: SUPPLIER
      quotationStr,       // F: QUOT. / Vendor Reff
      kode,               // G: Kode Item Material
      nama,               // H: Nama Material
      qty,                // I: Quantity
      ttdStr,             // J: TTD
      emStr,              // K: Em
      doNumStr,           // L: DO
      fktInvStr,          // M: Fkt/Inv
      priceUnit,          // N: Price Unit
      discount,           // O: Discount
      ppn,                // P: PPN
      itemTotal,          // Q: TOTAL
      grpoStr,            // R: No. GRPO
      lastGrpoDateStr,    // S: LAST DATE OF GRPO
      tglBayarStr,        // T: TANGGAL BAYAR
      tglInvoiceStr,      // U: TANGGAL INVOICE
      noInvoiceStr,       // V: NO. INVOICE
      itemKet,            // W: KET
    ];

    updateRequests.push({
      range: `'PO 2026'!A${rIdx}:W${rIdx}`,
      values: [rowValues],
    });

    updatedRowsForPg.push({
      rowIndex: rIdx,
      no: noUrut,
      status: statusStr,
      date: dateStr,
      noPo: targetNoPo,
      supplier: supplierStr,
      quotation: quotationStr,
      kode,
      nama,
      qty,
      priceUnit,
      discount,
      ppn,
      total: itemTotal,
      grpo: grpoStr,
      lastGrpoDate: lastGrpoDateStr,
      tglBayar: tglBayarStr,
      tglInvoice: tglInvoiceStr,
      noInvoice: noInvoiceStr,
      ket: itemKet,
    });
  }

  // 2. Jika item baru LEBIH SEDIKIT daripada baris lama (penghapusan item salah baca OCR)
  if (newCount < existingCount) {
    for (let i = newCount; i < existingCount; i++) {
      const rIdx = existing.items[i].rowIndex;
      const blankRow = new Array(23).fill('');
      updateRequests.push({
        range: `'PO 2026'!A${rIdx}:W${rIdx}`,
        values: [blankRow],
      });
    }
  }

  // Eksekusi batchUpdate ke Google Sheets
  if (updateRequests.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: env.sheets.spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updateRequests,
      },
    });
  }

  // 3. Jika item baru LEBIH BANYAK daripada baris lama (penambahan item terlewat)
  if (newCount > existingCount) {
    const { nextNo } = await getLastRowInfo();
    let curNo = nextNo;
    const rowsToAppend = [];

    for (let i = existingCount; i < newCount; i++) {
      const it = newItems[i];
      const kode = (it.kode || '').trim().toUpperCase();
      let nama = it.nama || '';
      if (!nama && kode) {
        const cached = cacheService.findMaterialByCode(kode);
        nama = cached ? cached.nama : '-';
      }

      const qty = parseFloat(it.qty) || 0;
      const priceUnit = parseFloat(it.priceUnit !== undefined ? it.priceUnit : it.harga) || 0;
      const discount = parseFloat(it.discount !== undefined ? it.discount : it.diskon) || 0;
      const ppn = parseFloat(it.ppn) || 0;
      const itemTotal = it.total !== undefined && !isNaN(parseFloat(it.total))
        ? Math.round(parseFloat(it.total))
        : Math.round((qty * priceUnit) * (1 - discount) + ppn);

      const itemKet = it.ket !== undefined ? it.ket : headerKetStr;

      const appendRow = [
        curNo,
        statusStr,
        dateStr,
        targetNoPo,
        supplierStr,
        quotationStr,
        kode,
        nama,
        qty,
        ttdStr,
        emStr,
        doNumStr,
        fktInvStr,
        priceUnit,
        discount,
        ppn,
        itemTotal,
        grpoStr,
        lastGrpoDateStr,
        tglBayarStr,
        tglInvoiceStr,
        noInvoiceStr,
        itemKet,
      ];

      rowsToAppend.push(appendRow);
      updatedRowsForPg.push({
        rowIndex: 0,
        no: curNo,
        status: statusStr,
        date: dateStr,
        noPo: targetNoPo,
        supplier: supplierStr,
        quotation: quotationStr,
        kode,
        nama,
        qty,
        priceUnit,
        discount,
        ppn,
        total: itemTotal,
        grpo: grpoStr,
        lastGrpoDate: lastGrpoDateStr,
        tglBayar: tglBayarStr,
        tglInvoice: tglInvoiceStr,
        noInvoice: noInvoiceStr,
        ket: itemKet,
      });

      curNo++;
    }

    if (rowsToAppend.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: env.sheets.spreadsheetId,
        range: "'PO 2026'!A:W",
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: rowsToAppend,
        },
      });
    }
  }

  // 4. Update sinkron ke PostgreSQL jika aktif
  if (dbService.isAvailable() && typeof dbService.updatePoInPg === 'function') {
    await dbService.updatePoInPg(targetNoPo, updatedRowsForPg).catch(err => {
      console.warn('⚠️ Gagal sync PostgreSQL setelah update PO:', err.message);
    });
  }

  return {
    success: true,
    noPo: targetNoPo,
    itemsUpdated: minCount,
    itemsAppended: Math.max(0, newCount - existingCount),
    itemsCleared: Math.max(0, existingCount - newCount),
  };
}

/**
 * Memperbarui field status, GRPO, atau pembayaran pada seluruh baris item suatu PO.
 * Jika updateData menyertakan array 'items', otomatis mendelegasikan ke updateCompletePO.
 */
async function updatePOField(noPo, updateData) {
  // Jika permintaan berisi daftar items atau isFullUpdate, gunakan fungsi update komprehensif
  if (Array.isArray(updateData.items) || updateData.isFullUpdate) {
    return updateCompletePO(noPo, updateData);
  }

  // Selalu ambil live data dari Google Sheets agar rowIndex 100% tepat
  const existing = await getPOByNumber(noPo, true);
  if (!existing || existing.items.length === 0) {
    return { success: false, message: `PO ${noPo} tidak ditemukan di sheet 'PO 2026'.` };
  }

  const sheets = getSheetsClient();
  const updateRequests = [];

  for (const it of existing.items) {
    const rIdx = it.rowIndex;

    // 1. Update Status jika ada (Kolom B)
    if (updateData.status) {
      updateRequests.push({
        range: `'PO 2026'!B${rIdx}`,
        values: [[updateData.status]],
      });
    }

    // 2. Update tertarget persis ke Kolom R s/d W
    const valGrpo = updateData.grpo !== undefined ? updateData.grpo : (it.grpo || '');
    const valLastDate = updateData.lastGrpoDate !== undefined
      ? updateData.lastGrpoDate
      : (updateData.grpo ? (it.lastGrpoDate || getCurrentFormattedDate()) : (it.lastGrpoDate || ''));
    const valTglBayar = updateData.tglBayar !== undefined ? updateData.tglBayar : (it.tglBayar || '');
    const valTglInvoice = updateData.tglInvoice !== undefined ? updateData.tglInvoice : (it.tglInvoice || '');
    const valNoInvoice = updateData.noInvoice !== undefined ? updateData.noInvoice : (it.noInvoice || '');

    let valKet = it.ket || '';
    if (updateData.ket) {
      if (!valKet.includes(updateData.ket)) {
        valKet = valKet ? `${valKet}; ${updateData.ket}` : updateData.ket;
      }
    }

    updateRequests.push({
      range: `'PO 2026'!R${rIdx}:W${rIdx}`,
      values: [[valGrpo, valLastDate, valTglBayar, valTglInvoice, valNoInvoice, valKet]],
    });
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: env.sheets.spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: updateRequests,
    },
  });

  return {
    success: true,
    noPo,
    rowsUpdated: existing.items.length,
  };
}

/**
 * Membatalkan PO (Soft Delete: Mengubah STATUS menjadi 'Cancelled').
 */
async function softDeletePO(noPo, reason = '') {
  return updatePOField(noPo, {
    status: 'Cancelled',
    ket: reason ? `[DIBATALKAN: ${reason}]` : '[DIBATALKAN]',
  });
}

/**
 * Mengambil seluruh data transaksi dari tab 'PO 2026' Google Sheets.
 */
async function getAllTransactions() {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.sheets.spreadsheetId,
    range: "'PO 2026'!A2:W",
    valueRenderOption: 'FORMATTED_VALUE',
  });

  const rawRows = res.data.values || [];
  const rows = [];
  const poMap = new Map();

  let totalActiveSum = 0;
  let countOpen = 0;
  let countClose = 0;
  let countPending = 0;
  let countCancelled = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i];
    if (!r || !r[3]) continue; // Skip jika tidak ada NO. PO

    const rowIndex = i + 2; // Row index di Google Sheets (1-based, starts at row 2)
    const no = r[0] || '';
    const status = (r[1] || 'Open').trim();
    const date = r[2] || '';
    const noPo = (r[3] || '').trim();
    const supplier = (r[4] || '').trim();
    const quotation = r[5] || '';
    const kode = (r[6] || '').trim().toUpperCase();
    const nama = r[7] || '';
    const qty = parseFloat(String(r[8] || '0').replace(/,/g, '')) || 0;
    const ttd = r[9] || '';
    const em = r[10] || '';
    const doNum = r[11] || '';
    const fktInv = r[12] || '';
    const priceUnit = parseFloat(String(r[13] || '0').replace(/[^0-9.-]/g, '')) || 0;
    const discount = parseFloat(String(r[14] || '0').replace(/,/g, '')) || 0;
    const ppn = parseFloat(String(r[15] || '0').replace(/[^0-9.-]/g, '')) || 0;

    const rawTotal = r[16] || '';
    let parsedTotal = parseFloat(String(rawTotal).replace(/[^0-9.-]/g, ''));
    if (isNaN(parsedTotal) || parsedTotal === 0) {
      parsedTotal = (qty * priceUnit) * (1 - discount) + ppn;
    }

    const grpo = r[17] || '';
    const lastGrpoDate = r[18] || '';
    const tglBayar = r[19] || '';
    const tglInvoice = r[20] || '';
    const noInvoice = r[21] || '';
    const ket = r[22] || '';

    const rowObj = {
      rowIndex,
      no,
      status,
      date,
      noPo,
      supplier,
      quotation,
      kode,
      nama,
      qty,
      ttd,
      em,
      doNum,
      fktInv,
      priceUnit,
      discount,
      ppn,
      total: parsedTotal,
      rawTotal,
      grpo,
      lastGrpoDate,
      tglBayar,
      tglInvoice,
      noInvoice,
      ket,
      rawCols: r,
    };

    rows.push(rowObj);

    if (!poMap.has(noPo)) {
      poMap.set(noPo, {
        noPo,
        supplier,
        date,
        status,
        quotation,
        grpo,
        lastGrpoDate,
        tglBayar,
        tglInvoice,
        noInvoice,
        ket,
        items: [],
        grandTotal: 0,
      });
    }

    const poEntry = poMap.get(noPo);
    poEntry.items.push(rowObj);
    poEntry.grandTotal += parsedTotal;

    const statusLower = status.toLowerCase();
    if (statusLower === 'cancelled') {
      countCancelled++;
    } else {
      totalActiveSum += parsedTotal;
      if (statusLower === 'close' || statusLower === 'lunas') {
        countClose++;
      } else if (statusLower === 'pending') {
        countPending++;
      } else {
        countOpen++;
      }
    }
  }

  const groupedPOs = Array.from(poMap.values());

  return {
    rows,
    pos: groupedPOs,
    stats: {
      totalRows: rows.length,
      totalPOs: groupedPOs.length,
      totalActiveSum,
      countOpen,
      countClose,
      countPending,
      countCancelled,
      spreadsheetId: env.sheets.spreadsheetId,
      syncedAt: new Date().toISOString(),
    },
  };
}

module.exports = {
  getCurrentFormattedDate,
  appendPOTransaction,
  getPOByNumber,
  updatePOField,
  updateCompletePO,
  softDeletePO,
  getAllTransactions,
};
