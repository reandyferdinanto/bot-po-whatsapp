const axios = require('axios');
const { getSheetsClient, hasValidToken } = require('../config/googleAuth');
const dbService = require('./dbService');

const KAS_KECIL_SPREADSHEET_ID = process.env.KAS_KECIL_SPREADSHEET_ID || '1X3KEBpofbFlK9TsC0bd-Cb_3iecGLp3ns3QM3Rny3QI';

const MONTHS_CONFIG = [
  { name: 'Januari', gid: '1883935875' },
  { name: 'Februari', gid: '455251796' },
  { name: 'Maret', gid: '701371746' },
  { name: 'April', gid: '919564125' },
  { name: 'Mei', gid: '2091490227' },
  { name: 'Juni', gid: '1543188358' },
  { name: 'Juli', gid: '1766518511' },
  { name: 'Agustus', gid: '1689624422' },
  { name: 'September', gid: '419557711' },
  { name: 'Oktober', gid: '987142853' },
  { name: 'November', gid: '405374628' },
  { name: 'Desember', gid: '515602731' },
];

const MONTH_NAMES = MONTHS_CONFIG.map(m => m.name);

/**
 * Mendapatkan nama bulan berjalan dalam Bahasa Indonesia
 */
function getCurrentMonthName() {
  const monthIdx = new Date().getMonth(); // 0 = Januari, 11 = Desember
  return MONTH_NAMES[monthIdx] || 'Januari';
}

/**
 * Format tanggal sekarang YYYY-MM-DD
 */
function getCurrentFormattedDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Mendeteksi Cost Center (CC):
 * - Jika manual CC diinput, gunakan itu.
 * - Jika ada kata 'svc' atau 'service' -> 'SVC'
 * - Jika ada kata 'ga' atau 'gad' -> 'GAD'
 * - Default: kosong atau string kosong
 */
function detectCostCenter(keterangan = '', manualCc = '') {
  if (manualCc && manualCc.trim()) {
    return manualCc.trim().toUpperCase();
  }

  const text = (keterangan || '').trim();
  if (/svc|service/i.test(text)) {
    return 'SVC';
  }
  if (/\bga\b|\bgad\b|general\s+affair/i.test(text)) {
    return 'GAD';
  }

  return '';
}

/**
 * Parse angka bersih dari string/number
 */
function parseCleanNumber(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parse baris CSV sederhana dengan penanganan string berkutip
 */
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Ambil raw rows dari Google Sheet (via Google Sheets API v4 atau Fallback Public Export)
 */
async function fetchMonthRawRows(monthName) {
  const targetMonth = monthName || getCurrentMonthName();
  const cfg = MONTHS_CONFIG.find(m => m.name.toLowerCase() === targetMonth.toLowerCase());
  const cleanSheetName = cfg ? cfg.name : targetMonth;

  // 1. Coba via Google Sheets API resmi jika token valid
  if (hasValidToken()) {
    try {
      const sheets = getSheetsClient();
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: KAS_KECIL_SPREADSHEET_ID,
        range: `'${cleanSheetName}'!A1:G250`,
        valueRenderOption: 'FORMATTED_VALUE',
      });
      if (res.data.values && res.data.values.length > 0) {
        return {
          month: cleanSheetName,
          gid: cfg ? cfg.gid : null,
          rows: res.data.values,
          source: 'google_api',
        };
      }
    } catch (err) {
      console.warn(`[WARN] Gagal get via Google Sheets API untuk sheet '${cleanSheetName}':`, err.message);
    }
  }

  // 2. Fallback: Unduh via Public CSV Export Google Sheet jika ada GID
  if (cfg && cfg.gid) {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${KAS_KECIL_SPREADSHEET_ID}/export?format=csv&gid=${cfg.gid}`;
      const res = await axios.get(url, { timeout: 10000 });
      const lines = res.data.split(/\r?\n/);
      const rows = lines.map(line => parseCsvLine(line));
      return {
        month: cleanSheetName,
        gid: cfg.gid,
        rows,
        source: 'public_csv',
      };
    } catch (csvErr) {
      console.warn(`[WARN] Gagal download public CSV untuk bulan '${cleanSheetName}':`, csvErr.message);
    }
  }

  return {
    month: cleanSheetName,
    gid: cfg ? cfg.gid : null,
    rows: [],
    source: 'empty',
  };
}

/**
 * Memproses dan menstrukturkan data bulan dari baris mentah
 */
async function getKasKecilMonthData(monthName) {
  const { month, gid, rows } = await fetchMonthRawRows(monthName);
  if (!rows || rows.length === 0) {
    return {
      month,
      gid,
      saldoAwal: 0,
      totalDebet: 0,
      totalKredit: 0,
      saldoAkhir: 0,
      draftCount: 0,
      transactions: [],
      kasbonList: [],
    };
  }

  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const r = rows[i];
    const joined = (r || []).join(' ').toUpperCase();
    if (joined.includes('DATE') && joined.includes('KETERANGAN') && (joined.includes('DEBET') || joined.includes('KREDIT'))) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) headerRowIndex = 5; // default row 6 (0-indexed 5)

  let saldoAwal = 0;
  let saldoAwalKet = '';
  const transactions = [];
  const kasbonList = [];
  let isKasbonSection = false;

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const colDate = (r[0] || '').trim();
    const colNo = (r[1] || '').trim();
    const colCc = (r[2] || '').trim();
    const colKet = (r[3] || '').trim();
    const colDebet = parseCleanNumber(r[4]);
    const colKredit = parseCleanNumber(r[5]);
    const colSaldo = parseCleanNumber(r[6]);

    const lineText = `${colDate} ${colNo} ${colCc} ${colKet}`.toUpperCase();

    // Deteksi baris Saldo Awal per 30/31 bulan lalu
    if (colKet.toLowerCase().startsWith('saldo per') || colDate.toLowerCase().startsWith('saldo per')) {
      saldoAwal = colDebet || colSaldo || 0;
      saldoAwalKet = colKet || colDate;
      continue;
    }

    // Deteksi pemisah bagian KASBON
    if (lineText.includes('KASBON') || colDate.toUpperCase() === 'KASBON') {
      isKasbonSection = true;
      continue;
    }

    // Lewati baris ringkasan saldo fisik cikunir dan ttd footer
    if (
      lineText.includes('SALDO KAS FISIK') ||
      lineText.includes('DIBUAT OLEH') ||
      lineText.includes('BEKASI,') ||
      lineText.includes('DIREKTUR UTAMA')
    ) {
      continue;
    }

    // Lewati baris kosong total
    if (!colDate && !colNo && !colCc && !colKet && colDebet === 0 && colKredit === 0) {
      continue;
    }

    // Lewati baris subtotal yang tidak ada keterangan transaksi (hanya debet & kredit besar)
    if (!colDate && !colNo && !colCc && !colKet && (colDebet > 0 || colKredit > 0)) {
      continue;
    }

    const item = {
      rowIndex: i + 1, // 1-based index untuk Google Sheets
      date: colDate,
      noVoucher: colNo || (colKet ? 'draft' : ''),
      isDraft: (colNo || '').toLowerCase() === 'draft',
      cc: colCc,
      keterangan: colKet,
      debet: colDebet,
      kredit: colKredit,
      saldo: colSaldo,
      isKasbon: isKasbonSection,
    };

    if (isKasbonSection) {
      kasbonList.push(item);
    } else {
      transactions.push(item);
    }
  }

  // Hitung agregasi
  const totalDebet = transactions.reduce((acc, t) => acc + (t.debet || 0), 0);
  const totalKredit = transactions.reduce((acc, t) => acc + (t.kredit || 0), 0);
  const lastTrans = transactions[transactions.length - 1];
  const saldoAkhir = lastTrans ? lastTrans.saldo : (saldoAwal + totalDebet - totalKredit);
  const draftCount = transactions.filter(t => t.isDraft).length;

  return {
    month,
    gid,
    saldoAwal,
    saldoAwalKet,
    totalDebet,
    totalKredit,
    saldoAkhir,
    draftCount,
    transactions,
    kasbonList,
  };
}

/**
 * Menambahkan entri kas kecil baru ke Google Sheets
 */
async function addKasKecilEntry(data) {
  const monthName = data.bulan || getCurrentMonthName();
  const cfg = MONTHS_CONFIG.find(m => m.name.toLowerCase() === monthName.toLowerCase());
  const cleanSheetName = cfg ? cfg.name : monthName;

  const date = data.date || getCurrentFormattedDate();
  const keterangan = (data.keterangan || '').trim();
  if (!keterangan) {
    throw new Error('Keterangan transaksi wajib diisi.');
  }

  // Auto-detect CC jika tidak diisi manual
  const cc = detectCostCenter(keterangan, data.cc);

  // Kolom No auto update dengan 'draft' untuk input baru jika kosong
  const noVoucher = (data.noVoucher && data.noVoucher.trim() !== '') ? data.noVoucher.trim() : 'draft';

  const tipe = data.tipe || 'KREDIT'; // KREDIT (pengeluaran) atau DEBET (pemasukan/pengisian)
  const nominal = parseCleanNumber(data.nominal || data.jumlah || data.kredit || data.debet);
  if (nominal <= 0) {
    throw new Error('Nominal transaksi harus lebih dari 0.');
  }

  const debet = tipe === 'DEBET' ? nominal : 0;
  const kredit = tipe === 'KREDIT' ? nominal : 0;

  // 1. Simpan ke Google Sheet jika token tersedia
  let insertedRowIndex = 0;
  if (hasValidToken()) {
    try {
      const sheets = getSheetsClient();

      // Dapatkan data baris untuk menentukan posisi baris sebelum KASBON
      const checkRes = await sheets.spreadsheets.values.get({
        spreadsheetId: KAS_KECIL_SPREADSHEET_ID,
        range: `'${cleanSheetName}'!A1:G200`,
      });

      const currentRows = checkRes.data.values || [];
      let insertAtRow = currentRows.length + 1; // Default append di paling bawah

      // Cari baris pemisah KASBON atau baris subtotal sebelum KASBON
      for (let i = 0; i < currentRows.length; i++) {
        const rowText = (currentRows[i] || []).join(' ').toUpperCase();
        if (rowText.includes('KASBON')) {
          // Cari jika ada baris subtotal tepat sebelum KASBON
          const prevRow = currentRows[i - 1] || [];
          if (!prevRow[0] && !prevRow[1] && !prevRow[3] && (prevRow[4] || prevRow[5])) {
            insertAtRow = i; // Selipkan sebelum baris subtotal
          } else {
            insertAtRow = i + 1; // Selipkan tepat sebelum baris KASBON
          }
          break;
        }
      }

      // Pastikan ada sheetId (gid)
      let sheetId = cfg ? parseInt(cfg.gid, 10) : null;
      if (!sheetId) {
        const metaRes = await sheets.spreadsheets.get({ spreadsheetId: KAS_KECIL_SPREADSHEET_ID });
        const targetSheet = (metaRes.data.sheets || []).find(
          s => s.properties.title.toLowerCase() === cleanSheetName.toLowerCase()
        );
        if (targetSheet) {
          sheetId = targetSheet.properties.sheetId;
        }
      }

      if (sheetId !== null && !isNaN(sheetId)) {
        // Sisipkan 1 baris kosong di insertAtRow
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: KAS_KECIL_SPREADSHEET_ID,
          requestBody: {
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId,
                    dimension: 'ROWS',
                    startIndex: insertAtRow - 1, // 0-based
                    endIndex: insertAtRow,
                  },
                  inheritFromBefore: true,
                },
              },
            ],
          },
        });

        // Tulis data transaksi baru ke baris tersebut
        const newRowValues = [
          date,
          noVoucher,
          cc,
          keterangan,
          debet > 0 ? debet : '',
          kredit > 0 ? kredit : '',
          `=G${insertAtRow - 1}+E${insertAtRow}-F${insertAtRow}`,
        ];

        await sheets.spreadsheets.values.update({
          spreadsheetId: KAS_KECIL_SPREADSHEET_ID,
          range: `'${cleanSheetName}'!A${insertAtRow}:G${insertAtRow}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [newRowValues],
          },
        });

        insertedRowIndex = insertAtRow;
      } else {
        // Fallback append jika tidak ada sheetId
        const appendRes = await sheets.spreadsheets.values.append({
          spreadsheetId: KAS_KECIL_SPREADSHEET_ID,
          range: `'${cleanSheetName}'!A:G`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: {
            values: [[date, noVoucher, cc, keterangan, debet || '', kredit || '', '']],
          },
        });
        const match = (appendRes.data?.updates?.updatedRange || '').match(/![A-Z]+(\d+)/);
        if (match && match[1]) insertedRowIndex = parseInt(match[1], 10);
      }
    } catch (sheetErr) {
      console.warn(`[WARN] Gagal insert baris kas kecil ke Google Sheets (${cleanSheetName}):`, sheetErr.message);
    }
  }

  // 2. Simpan / Cache ke PostgreSQL jika aktif
  try {
    await dbService.insertKasKecilToPg({
      bulan: cleanSheetName,
      rowIndex: insertedRowIndex,
      tanggal: date,
      noVoucher,
      cc,
      keterangan,
      debet,
      kredit,
      saldo: 0,
    });
  } catch (dbErr) {
    // Non-blocking
  }

  return {
    success: true,
    bulan: cleanSheetName,
    rowIndex: insertedRowIndex,
    date,
    noVoucher,
    cc,
    keterangan,
    debet,
    kredit,
  };
}

/**
 * Memperbarui nomor voucher dari 'draft' ke nomor voucher resmi (misal: 2600550)
 */
async function updateKasKecilVoucher(data) {
  const { bulan, rowIndex, noVoucher, cc } = data;
  if (!bulan || !rowIndex) {
    throw new Error('Bulan dan Row Index baris yang ingin diupdate wajib disertakan.');
  }
  if (!noVoucher || !noVoucher.trim()) {
    throw new Error('Nomor voucher baru wajib diisi.');
  }

  const cleanNo = noVoucher.trim();

  // 1. Update ke Google Sheet
  if (hasValidToken()) {
    try {
      const sheets = getSheetsClient();
      await sheets.spreadsheets.values.update({
        spreadsheetId: KAS_KECIL_SPREADSHEET_ID,
        range: `'${bulan}'!B${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[cleanNo]] },
      });

      if (cc && cc.trim()) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: KAS_KECIL_SPREADSHEET_ID,
          range: `'${bulan}'!C${rowIndex}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[cc.trim().toUpperCase()]] },
        });
      }
    } catch (sheetErr) {
      console.warn(`[WARN] Gagal update voucher di Google Sheets:`, sheetErr.message);
    }
  }

  // 2. Update di PostgreSQL
  try {
    await dbService.updateKasKecilVoucherInPg(bulan, rowIndex, cleanNo, cc);
  } catch (dbErr) {
    // Non-blocking
  }

  return {
    success: true,
    bulan,
    rowIndex,
    noVoucher: cleanNo,
    cc,
  };
}

/**
 * Mendapatkan ringkasan seluruh 12 bulan (Januari - Desember)
 */
async function getAllMonthsSummary() {
  const summaryList = [];

  for (const cfg of MONTHS_CONFIG) {
    try {
      const data = await getKasKecilMonthData(cfg.name);
      summaryList.push({
        bulan: cfg.name,
        gid: cfg.gid,
        saldoAwal: data.saldoAwal || 0,
        totalDebet: data.totalDebet || 0,
        totalKredit: data.totalKredit || 0,
        saldoAkhir: data.saldoAkhir || 0,
        totalTransaksi: (data.transactions || []).length,
        draftCount: data.draftCount || 0,
      });
    } catch (err) {
      summaryList.push({
        bulan: cfg.name,
        gid: cfg.gid,
        saldoAwal: 0,
        totalDebet: 0,
        totalKredit: 0,
        saldoAkhir: 0,
        totalTransaksi: 0,
        draftCount: 0,
      });
    }
  }

  return {
    spreadsheetId: KAS_KECIL_SPREADSHEET_ID,
    months: summaryList,
    currentMonth: getCurrentMonthName(),
  };
}

module.exports = {
  KAS_KECIL_SPREADSHEET_ID,
  MONTHS_CONFIG,
  MONTH_NAMES,
  getCurrentMonthName,
  getCurrentFormattedDate,
  detectCostCenter,
  getKasKecilMonthData,
  addKasKecilEntry,
  updateKasKecilVoucher,
  getAllMonthsSummary,
};
