const { getSheetsClient, hasValidToken } = require('../config/googleAuth');
const dbService = require('./dbService');

const BUDGET_SPREADSHEET_ID = '1kYdVrUCfMwv2_FtvC3RtDGH2GxwKB6zp_SMzEEm863A';
const BUDGET_SHEET_NAME = 'Sheet1';

/**
 * Format tanggal sekarang DD/MM/YYYY
 */
function getCurrentFormattedDate() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Parse angka bersih dari string/number
 */
function parseCleanNumber(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Normalisasi status
 */
function normalizeBudgetStatus(status) {
  if (!status) return 'PENDING';
  const s = String(status).trim().toUpperCase();
  if (['APPROVED', 'DISETUJUI', 'CAIR', 'DICAIRKAN'].includes(s)) return 'APPROVED';
  if (['LPJ_SUBMITTED', 'LPJ', 'NOTA_DISERAHKAN', 'SUBMITTED'].includes(s)) return 'LPJ_SUBMITTED';
  if (['CLOSED', 'SELESAI', 'DONE', 'LUNAS', 'TUTUP'].includes(s)) return 'CLOSED';
  if (['REJECTED', 'DITOLAK', 'BATAL', 'CANCELLED'].includes(s)) return 'REJECTED';
  return 'PENDING';
}

/**
 * Generate nomor tiket budget otomatis: BGT-YYYY-XXXX (misal BGT-2026-0001)
 */
async function generateNextBudgetNo() {
  const currentYear = new Date().getFullYear();
  const prefix = `BGT-${currentYear}-`;

  try {
    // Coba cek dari PG
    const allBudgets = await dbService.getAllBudgetsFromPg();
    let maxSeq = 0;
    for (const b of allBudgets) {
      if (b.no_budget && b.no_budget.startsWith(prefix)) {
        const numPart = parseInt(b.no_budget.substring(prefix.length), 10);
        if (!isNaN(numPart) && numPart > maxSeq) {
          maxSeq = numPart;
        }
      }
    }
    if (maxSeq > 0) {
      return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
    }

    // Jika di PG belum ada, cek langsung dari Google Sheets
    if (hasValidToken()) {
      const sheets = getSheetsClient();
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: BUDGET_SPREADSHEET_ID,
        range: `'${BUDGET_SHEET_NAME}'!B2:B`,
      });
      const rows = res.data.values || [];
      for (const r of rows) {
        const val = (r[0] || '').trim();
        if (val.startsWith(prefix)) {
          const numPart = parseInt(val.substring(prefix.length), 10);
          if (!isNaN(numPart) && numPart > maxSeq) {
            maxSeq = numPart;
          }
        }
      }
      return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
    }
  } catch (err) {
    console.warn('⚠️ Gagal generate nomor budget berurut, menggunakan timestamp fallback:', err.message);
  }

  return `${prefix}${String(Date.now()).slice(-4)}`;
}

/**
 * Sinkronisasi data Google Sheet ke PostgreSQL
 */
async function syncFromSheet() {
  if (!hasValidToken()) {
    throw new Error('Google OAuth2 token tidak valid atau kadaluarsa.');
  }

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: BUDGET_SPREADSHEET_ID,
    range: `'${BUDGET_SHEET_NAME}'!A2:M`,
  });

  const rows = res.data.values || [];
  const parsedBudgets = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const nama = (r[0] || '').trim();
    const noBudget = (r[1] || '').trim();
    if (!noBudget && !nama) continue;

    const uraian = (r[2] || '').trim();
    const jumlah = parseCleanNumber(r[3]);
    const tglKasbon = (r[4] || '').trim() || getCurrentFormattedDate();
    const divisi = (r[5] || '').trim() || 'Umum';
    const noWa = (r[6] || '').trim();
    const realisasiBelanja = parseCleanNumber(r[7]);
    const sisaKembali = parseCleanNumber(r[8]);
    const buktiNota = (r[9] || '').trim();
    const status = normalizeBudgetStatus(r[10]);
    const tglSelesai = (r[11] || '').trim();
    const catatanFinance = (r[12] || '').trim();

    parsedBudgets.push({
      rowIndex: i + 2, // Baris 1 adalah header, jadi data mulai baris 2
      noBudget: noBudget || `BGT-LEGACY-${i + 1}`,
      nama,
      uraian,
      jumlah,
      tglKasbon,
      divisi,
      noWa,
      realisasiBelanja,
      sisaKembali,
      buktiNota,
      status,
      tglSelesai,
      catatanFinance,
    });
  }

  if (parsedBudgets.length > 0) {
    await dbService.syncBudgetsFromSheetToPg(parsedBudgets);
  }

  return {
    success: true,
    totalSynced: parsedBudgets.length,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Mencari row index di Google Sheet berdasarkan nomor budget
 */
async function findRowIndexByNoBudget(noBudget) {
  if (!hasValidToken()) return null;
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: BUDGET_SPREADSHEET_ID,
    range: `'${BUDGET_SHEET_NAME}'!B2:B`,
  });
  const rows = res.data.values || [];
  const cleanTarget = String(noBudget).trim().toUpperCase();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toUpperCase() === cleanTarget) {
      return i + 2; // Baris 1 header
    }
  }
  return null;
}

/**
 * Mengambil daftar kasbon dengan statistik agregat
 */
async function getAllBudgets(filters = {}) {
  // Ambil data dari PostgreSQL
  let budgets = await dbService.getAllBudgetsFromPg(filters);

  // Jika PG kosong dan ada token Google, coba auto-sync sekali
  if (budgets.length === 0 && hasValidToken()) {
    try {
      await syncFromSheet();
      budgets = await dbService.getAllBudgetsFromPg(filters);
    } catch (e) {
      console.warn('⚠️ Gagal auto sync dari sheet saat getAllBudgets:', e.message);
    }
  }

  // Hitung KPI
  let totalNominal = 0;
  let countPending = 0;
  let countApproved = 0;
  let countLpjSubmitted = 0;
  let countClosed = 0;
  let countRejected = 0;
  let totalRealisasi = 0;
  let totalSisaKembali = 0;

  for (const b of budgets) {
    const jml = parseFloat(b.jumlah) || 0;
    const real = parseFloat(b.realisasi_belanja) || 0;
    const sisa = parseFloat(b.sisa_kembali) || 0;
    const st = (b.status || '').toUpperCase();

    totalNominal += jml;
    totalRealisasi += real;
    totalSisaKembali += sisa;

    if (st === 'PENDING') countPending++;
    else if (st === 'APPROVED') countApproved++;
    else if (st === 'LPJ_SUBMITTED') countLpjSubmitted++;
    else if (st === 'CLOSED') countClosed++;
    else if (st === 'REJECTED') countRejected++;
  }

  return {
    success: true,
    budgets,
    stats: {
      totalBudgets: budgets.length,
      totalNominal,
      totalRealisasi,
      totalSisaKembali,
      countPending,
      countApproved,
      countLpjSubmitted,
      countClosed,
      countRejected,
      spreadsheetId: BUDGET_SPREADSHEET_ID,
    },
  };
}

/**
 * Mengambil satu budget berdasarkan nomor
 */
async function getBudgetByNo(noBudget) {
  let budget = await dbService.getBudgetByNoFromPg(noBudget);
  if (!budget && hasValidToken()) {
    await syncFromSheet();
    budget = await dbService.getBudgetByNoFromPg(noBudget);
  }
  return budget;
}

/**
 * Membuat pengajuan kasbon baru (Dibuat oleh divisi / pemohon via web form)
 */
async function createBudget(data) {
  const nama = (data.nama || '').trim();
  const uraian = (data.uraian || '').trim();
  const jumlah = parseCleanNumber(data.jumlah);
  const divisi = (data.divisi || '').trim() || 'Umum';
  const noWa = (data.noWa || '').trim();
  const tglKasbon = (data.tglKasbon || '').trim() || getCurrentFormattedDate();

  if (!nama) throw new Error('Nama pemohon wajib diisi.');
  if (!uraian) throw new Error('Uraian kebutuhan wajib diisi.');
  if (jumlah <= 0) throw new Error('Jumlah pengajuan kasbon harus lebih dari 0.');

  const noBudget = data.noBudget || (await generateNextBudgetNo());
  const status = 'PENDING';

  // 1. Simpan ke Google Sheet
  let rowIndex = 0;
  if (hasValidToken()) {
    try {
      const sheets = getSheetsClient();
      const rowValues = [
        nama,
        noBudget,
        uraian,
        jumlah,
        tglKasbon,
        divisi,
        noWa,
        0, // Realisasi Belanja awal
        0, // Sisa Kembali awal
        '', // Bukti Nota
        status,
        '', // Tgl Selesai
        data.catatanFinance || '',
      ];

      const appendRes = await sheets.spreadsheets.values.append({
        spreadsheetId: BUDGET_SPREADSHEET_ID,
        range: `'${BUDGET_SHEET_NAME}'!A:M`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [rowValues] },
      });

      // Dapatkan rowIndex dari updatedRange (misal 'Sheet1'!A10:M10)
      const updatedRange = appendRes.data?.updates?.updatedRange || '';
      const match = updatedRange.match(/![A-Z]+(\d+)/);
      if (match && match[1]) {
        rowIndex = parseInt(match[1], 10);
      }
    } catch (sheetErr) {
      console.warn('⚠️ Gagal append ke Google Sheet kasbon:', sheetErr.message);
    }
  }

  // 2. Simpan ke PostgreSQL
  const savedBudget = await dbService.insertBudgetToPg({
    rowIndex,
    noBudget,
    nama,
    uraian,
    jumlah,
    tglKasbon,
    divisi,
    noWa,
    realisasiBelanja: 0,
    sisaKembali: 0,
    buktiNota: '',
    status,
    tglSelesai: '',
    catatanFinance: data.catatanFinance || '',
  });

  return savedBudget || { noBudget, nama, uraian, jumlah, divisi, status };
}

/**
 * Menyetujui pengajuan kasbon & menyerahkan dana fisik (Finance Action)
 */
async function approveBudget(noBudget, { catatanFinance = '' } = {}) {
  const existing = await getBudgetByNo(noBudget);
  if (!existing) throw new Error(`Kasbon dengan No. ${noBudget} tidak ditemukan.`);

  const updates = {
    status: 'APPROVED',
  };
  if (catatanFinance) {
    updates.catatanFinance = catatanFinance;
  }

  // Update di Google Sheet
  if (hasValidToken()) {
    try {
      let rIdx = existing.row_index;
      if (!rIdx || rIdx < 2) {
        rIdx = await findRowIndexByNoBudget(noBudget);
      }
      if (rIdx) {
        const sheets = getSheetsClient();
        await sheets.spreadsheets.values.update({
          spreadsheetId: BUDGET_SPREADSHEET_ID,
          range: `'${BUDGET_SHEET_NAME}'!K${rIdx}:M${rIdx}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [['APPROVED', existing.tgl_selesai || '', catatanFinance || existing.catatan_finance || '']],
          },
        });
      }
    } catch (sheetErr) {
      console.warn('⚠️ Gagal update status APPROVED di Google Sheet:', sheetErr.message);
    }
  }

  // Update di PostgreSQL
  return await dbService.updateBudgetInPg(noBudget, updates);
}

/**
 * Menolak pengajuan kasbon (Finance Action)
 */
async function rejectBudget(noBudget, { alasan = 'Pengajuan ditolak oleh Finance' } = {}) {
  const existing = await getBudgetByNo(noBudget);
  if (!existing) throw new Error(`Kasbon dengan No. ${noBudget} tidak ditemukan.`);

  const updates = {
    status: 'REJECTED',
    catatanFinance: alasan,
  };

  if (hasValidToken()) {
    try {
      let rIdx = existing.row_index || (await findRowIndexByNoBudget(noBudget));
      if (rIdx) {
        const sheets = getSheetsClient();
        await sheets.spreadsheets.values.update({
          spreadsheetId: BUDGET_SPREADSHEET_ID,
          range: `'${BUDGET_SHEET_NAME}'!K${rIdx}:M${rIdx}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [['REJECTED', existing.tgl_selesai || '', alasan]],
          },
        });
      }
    } catch (sheetErr) {
      console.warn('⚠️ Gagal update status REJECTED di Google Sheet:', sheetErr.message);
    }
  }

  return await dbService.updateBudgetInPg(noBudget, updates);
}

/**
 * Submit Laporan Pertanggungjawaban (LPJ) & Bukti Nota Belanja oleh pemohon/Finance
 */
async function submitLpj(noBudget, { realisasiBelanja, buktiNota = '', catatanPemohon = '' }) {
  const existing = await getBudgetByNo(noBudget);
  if (!existing) throw new Error(`Kasbon dengan No. ${noBudget} tidak ditemukan.`);

  const real = parseCleanNumber(realisasiBelanja);
  const jumlahAwal = parseFloat(existing.jumlah) || 0;
  // Sisa kembali = Jumlah Kasbon Awal - Realisasi Belanja
  const sisa = Math.max(0, jumlahAwal - real);

  // Jika buktiNota baru ada dan sebelumnya sudah ada, gabungkan koma
  let combinedBukti = buktiNota;
  if (existing.bukti_nota && buktiNota && !existing.bukti_nota.includes(buktiNota)) {
    combinedBukti = `${existing.bukti_nota}, ${buktiNota}`;
  } else if (!combinedBukti) {
    combinedBukti = existing.bukti_nota || '';
  }

  let finalCatatan = existing.catatan_finance || '';
  if (catatanPemohon) {
    finalCatatan = finalCatatan ? `${finalCatatan} | LPJ: ${catatanPemohon}` : `LPJ: ${catatanPemohon}`;
  }

  const updates = {
    realisasiBelanja: real,
    sisaKembali: sisa,
    buktiNota: combinedBukti,
    status: 'LPJ_SUBMITTED',
    catatanFinance: finalCatatan,
  };

  // Update di Google Sheet
  if (hasValidToken()) {
    try {
      let rIdx = existing.row_index || (await findRowIndexByNoBudget(noBudget));
      if (rIdx) {
        const sheets = getSheetsClient();
        // Kolom H: Realisasi, I: Sisa Kembali, J: Bukti Nota, K: Status, L: Tgl Selesai, M: Catatan
        await sheets.spreadsheets.values.update({
          spreadsheetId: BUDGET_SPREADSHEET_ID,
          range: `'${BUDGET_SHEET_NAME}'!H${rIdx}:M${rIdx}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[real, sisa, combinedBukti, 'LPJ_SUBMITTED', existing.tgl_selesai || '', finalCatatan]],
          },
        });
      }
    } catch (sheetErr) {
      console.warn('⚠️ Gagal update LPJ di Google Sheet:', sheetErr.message);
    }
  }

  // Update di PostgreSQL
  return await dbService.updateBudgetInPg(noBudget, updates);
}

/**
 * Menutup / Closing Budget setelah Finance memverifikasi nota fisik & menerima sisa uang tunai
 */
async function closeBudget(noBudget, { catatanFinance = '', sisaKembaliDiterima = null } = {}) {
  const existing = await getBudgetByNo(noBudget);
  if (!existing) throw new Error(`Kasbon dengan No. ${noBudget} tidak ditemukan.`);

  const tglSelesai = getCurrentFormattedDate();
  const sisa = sisaKembaliDiterima !== null ? parseCleanNumber(sisaKembaliDiterima) : parseFloat(existing.sisa_kembali) || 0;

  const finalCatatan = catatanFinance
    ? (existing.catatan_finance ? `${existing.catatan_finance} | Closing: ${catatanFinance}` : catatanFinance)
    : existing.catatan_finance || 'Closing verified by Finance';

  const updates = {
    sisaKembali: sisa,
    status: 'CLOSED',
    tglSelesai,
    catatanFinance: finalCatatan,
  };

  // Update di Google Sheet
  if (hasValidToken()) {
    try {
      let rIdx = existing.row_index || (await findRowIndexByNoBudget(noBudget));
      if (rIdx) {
        const sheets = getSheetsClient();
        await sheets.spreadsheets.values.update({
          spreadsheetId: BUDGET_SPREADSHEET_ID,
          range: `'${BUDGET_SHEET_NAME}'!I${rIdx}:M${rIdx}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[sisa, existing.bukti_nota || '', 'CLOSED', tglSelesai, finalCatatan]],
          },
        });
      }
    } catch (sheetErr) {
      console.warn('⚠️ Gagal close budget di Google Sheet:', sheetErr.message);
    }
  }

  // Update di PostgreSQL
  return await dbService.updateBudgetInPg(noBudget, updates);
}

module.exports = {
  BUDGET_SPREADSHEET_ID,
  BUDGET_SHEET_NAME,
  syncFromSheet,
  getAllBudgets,
  getBudgetByNo,
  createBudget,
  approveBudget,
  rejectBudget,
  submitLpj,
  closeBudget,
  generateNextBudgetNo,
};
