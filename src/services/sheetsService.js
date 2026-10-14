const { getSheetsClient } = require('../config/googleAuth');
const env = require('../config/env');
const cacheService = require('./cacheService');

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

    // Hitung nominal total per item
    const itemTotal = (qty * priceUnit) * (1 - discount) + ppn;
    grandTotal += itemTotal;

    // Formula spreadsheet: =(I{row}*N{row})*(1-O{row})+P{row}
    const formulaTotal = `=((I${currentRowIdx}*N${currentRowIdx})*(1-O${currentRowIdx}))+P${currentRowIdx}`;

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
      formulaTotal,                     // Q (16): TOTAL (Formula)
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
async function getPOByNumber(noPo) {
  if (!noPo) return null;
  const cleanNo = noPo.trim().toUpperCase();
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
        rowIndex: i + 1, // 1-based
        no: row[0] || '',
        status: row[1] || 'Open',
        date: row[2] || '',
        noPo: row[3] || '',
        supplier: row[4] || '',
        quotation: row[5] || '',
        kode: row[6] || '',
        nama: row[7] || '',
        qty: parseFloat(row[8]) || 0,
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
    grpo: first.grpo,
    lastGrpoDate: first.lastGrpoDate,
    tglBayar: first.tglBayar,
    noInvoice: first.noInvoice,
    tglInvoice: first.tglInvoice,
    grandTotal,
    items: matchingItems,
  };
}

/**
 * Memperbarui field status, GRPO, atau pembayaran pada seluruh baris item suatu PO.
 */
async function updatePOField(noPo, updateData) {
  const existing = await getPOByNumber(noPo);
  if (!existing || existing.items.length === 0) {
    return { success: false, message: `PO ${noPo} tidak ditemukan di sheet 'PO 2026'.` };
  }

  const sheets = getSheetsClient();
  const updateRequests = [];

  for (const it of existing.items) {
    const rIdx = it.rowIndex;

    if (updateData.status) {
      updateRequests.push({
        range: `'PO 2026'!B${rIdx}`,
        values: [[updateData.status]],
      });
    }
    if (updateData.grpo !== undefined) {
      updateRequests.push({
        range: `'PO 2026'!R${rIdx}:S${rIdx}`,
        values: [[updateData.grpo, updateData.lastGrpoDate || getCurrentFormattedDate()]],
      });
    }
    if (updateData.tglBayar !== undefined) {
      updateRequests.push({
        range: `'PO 2026'!T${rIdx}`,
        values: [[updateData.tglBayar]],
      });
    }
    if (updateData.noInvoice !== undefined || updateData.tglInvoice !== undefined) {
      updateRequests.push({
        range: `'PO 2026'!U${rIdx}:V${rIdx}`,
        values: [[updateData.tglInvoice || getCurrentFormattedDate(), updateData.noInvoice || '']],
      });
    }
    if (updateData.ket) {
      const newKet = it.ket ? `${it.ket}; ${updateData.ket}` : updateData.ket;
      updateRequests.push({
        range: `'PO 2026'!W${rIdx}`,
        values: [[newKet]],
      });
    }
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

module.exports = {
  getCurrentFormattedDate,
  appendPOTransaction,
  getPOByNumber,
  updatePOField,
  softDeletePO,
};
