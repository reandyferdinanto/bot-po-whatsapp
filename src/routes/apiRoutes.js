const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sheetsService = require('../services/sheetsService');
const cacheService = require('../services/cacheService');
const ocrService = require('../services/ocrService');
const openwaService = require('../services/openwaService');
const dbService = require('../services/dbService');
const kursService = require('../services/kursService');
const financeBudgetService = require('../services/financeBudgetService');
const kasKecilService = require('../services/kasKecilService');
const driveService = require('../services/driveService');
const { hasValidToken, getSheetsClient } = require('../config/googleAuth');
const env = require('../config/env');

const router = express.Router();

// Memory storage for OCR file uploads (up to 20 files, max 25MB each)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 20 },
});

// Disk storage for temporary OCR files pending commit
const ocrCacheDir = path.resolve(__dirname, '../../uploads/ocr_cache');
if (!fs.existsSync(ocrCacheDir)) {
  fs.mkdirSync(ocrCacheDir, { recursive: true });
}

// Disk storage for Finance Nota/Receipt uploads
const notaDir = path.resolve(__dirname, '../../uploads/nota');
if (!fs.existsSync(notaDir)) {
  fs.mkdirSync(notaDir, { recursive: true });
}

const notaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, notaDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const cleanBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `nota_${Date.now()}_${cleanBase}${ext}`);
  },
});

const uploadNota = multer({
  storage: notaStorage,
  limits: { fileSize: 20 * 1024 * 1024, files: 5 },
});

/**
 * GET /api/stats - Ringkasan KPI dan Status Dashboard
 */
router.get('/stats', async (req, res) => {
  try {
    let sheetData = { stats: {} };
    if (hasValidToken()) {
      sheetData = await sheetsService.getAllTransactions();
    }
    const syncStatus = cacheService.getSyncStatus();

    let kursUsd = null;
    try {
      kursUsd = await kursService.getKursUsd();
    } catch (kErr) {
      console.warn('⚠️ Gagal mengambil kurs USD saat /api/stats:', kErr.message);
    }

    res.json({
      success: true,
      stats: {
        totalRows: sheetData.stats.totalRows || 0,
        totalPOs: sheetData.stats.totalPOs || 0,
        totalActiveSum: sheetData.stats.totalActiveSum || 0,
        countOpen: sheetData.stats.countOpen || 0,
        countClose: sheetData.stats.countClose || 0,
        countPending: sheetData.stats.countPending || 0,
        countCancelled: sheetData.stats.countCancelled || 0,
        spreadsheetId: env.sheets.spreadsheetId,
        syncedAt: syncStatus.lastSyncedAt || new Date().toISOString(),
        kursUsd,
      },
      system: {
        googleAuth: hasValidToken(),
        postgresConnected: dbService.isAvailable(),
        openwaHost: env.openwa.baseUrl,
        openwaSession: env.openwa.sessionId,
        cacheStatus: syncStatus,
      },
    });
  } catch (err) {
    console.error('❌ Error /api/stats:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/kurs/usd - Mengambil data Kurs Tengah USD Bank Indonesia dari Ortax
 */
router.get('/kurs/usd', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const kurs = await kursService.getKursUsd({ forceRefresh });
    const history = await kursService.getKursHistory(14);
    res.json({
      success: true,
      data: kurs,
      history,
    });
  } catch (err) {
    console.error('❌ Error /api/kurs/usd:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/kurs/usd/refresh - Memaksa scraping ulang Kurs Tengah USD sekarang
 */
router.post('/kurs/usd/refresh', async (req, res) => {
  try {
    const kurs = await kursService.getKursUsd({ forceRefresh: true });
    const history = await kursService.getKursHistory(14);
    res.json({
      success: true,
      message: 'Kurs USD berhasil diperbarui dari Ortax',
      data: kurs,
      history,
    });
  } catch (err) {
    console.error('❌ Error /api/kurs/usd/refresh:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/pos - Mengambil seluruh data transaksi Sheet 'PO 2026'
 */
router.get('/pos', async (req, res) => {
  try {
    if (!hasValidToken()) {
      return res.status(401).json({
        success: false,
        error: 'Google OAuth2 Token belum siap. Jalankan node auth-google.js di server.',
      });
    }

    const { status, search } = req.query;
    const data = await sheetsService.getAllTransactions();

    let filteredRows = data.rows;
    let filteredPOs = data.pos;

    if (status && status !== 'ALL') {
      const targetStatus = status.toLowerCase().trim();
      const matchStatus = (sVal) => {
        const s = (sVal || '').toLowerCase().trim();
        if (targetStatus === 'close') return s.startsWith('clos') || s === 'lunas' || s === 'done';
        if (targetStatus === 'pending') return s.startsWith('pend') || s === 'hold';
        if (targetStatus === 'cancelled') return s.startsWith('cancel') || s === 'batal';
        if (targetStatus === 'open') return s === 'open';
        return s === targetStatus;
      };
      filteredRows = filteredRows.filter(r => matchStatus(r.status));
      filteredPOs = filteredPOs.filter(p => matchStatus(p.status));
    }

    if (search) {
      const q = search.trim().toLowerCase();
      filteredRows = filteredRows.filter(r =>
        (r.noPo || '').toLowerCase().includes(q) ||
        (r.supplier || '').toLowerCase().includes(q) ||
        (r.kode || '').toLowerCase().includes(q) ||
        (r.nama || '').toLowerCase().includes(q) ||
        (r.grpo || '').toLowerCase().includes(q)
      );
      filteredPOs = filteredPOs.filter(p =>
        (p.noPo || '').toLowerCase().includes(q) ||
        (p.supplier || '').toLowerCase().includes(q) ||
        (p.grpo || '').toLowerCase().includes(q) ||
        p.items.some(it => (it.kode || '').toLowerCase().includes(q) || (it.nama || '').toLowerCase().includes(q))
      );
    }

    res.json({
      success: true,
      stats: data.stats,
      rows: filteredRows,
      pos: filteredPOs,
      totalCount: filteredRows.length,
    });
  } catch (err) {
    console.error('❌ Error /api/pos:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/stats/historical - Mengambil statistik multi-tahun (2017 s/d 2026) dari cache lokal (<5ms)
 */
router.get('/stats/historical', async (req, res) => {
  try {
    const data = await cacheService.getHistoricalStats();
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('❌ Error /api/stats/historical:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/pos/historical - Mengambil transaksi historis multi-tahun dari cache lokal (<5ms)
 */
router.get('/pos/historical', async (req, res) => {
  try {
    const year = req.query.year || 'ALL';
    const search = req.query.search || '';
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;

    const result = await cacheService.getHistoricalTransactions({ year, search, page, limit });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('❌ Error /api/pos/historical:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/pos/:noPo - Detail spesifik 1 PO
 */
router.get('/pos/:noPo', async (req, res) => {
  try {
    const po = await sheetsService.getPOByNumber(req.params.noPo);
    if (!po) {
      return res.status(404).json({ success: false, message: `PO ${req.params.noPo} tidak ditemukan.` });
    }
    res.json({ success: true, po });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/pos - Input PO Baru (Multi-Item)
 */
router.post('/pos', async (req, res) => {
  try {
    const { noPo, supplier, date, quotation, items } = req.body;

    if (!noPo || !supplier || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Data PO tidak lengkap. Harap isi noPo, supplier, dan minimal 1 item barang.',
      });
    }

    const appendRes = await sheetsService.appendPOTransaction({
      noPo,
      supplier,
      date,
      quotation,
      items,
    });

    res.json({ success: true, result: appendRes });
  } catch (err) {
    console.error('❌ Error POST /api/pos:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/pos/:noPo - Update status, GRPO, Tanggal Bayar, Invoice, Catatan
 */
router.patch('/pos/:noPo', async (req, res) => {
  try {
    const noPo = req.params.noPo;
    const updateData = req.body;

    const result = await sheetsService.updatePOField(noPo, updateData);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({ success: true, result });
  } catch (err) {
    console.error(`❌ Error PATCH /api/pos/${req.params.noPo}:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/pos/:noPo - Soft Delete / Batalkan PO
 */
router.delete('/api/pos/:noPo', async (req, res) => {
  try {
    const noPo = req.params.noPo;
    const reason = req.body.reason || 'Dibatalkan via Dashboard';

    const result = await sheetsService.softDeletePO(noPo, reason);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({ success: true, result });
  } catch (err) {
    console.error(`❌ Error DELETE /api/pos/${req.params.noPo}:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/materials - Katalog Master Material (1.506 baris)
 */
router.get('/materials', async (req, res) => {
  try {
    const query = req.query.q || '';
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;

    if (query) {
      const searchRes = await cacheService.searchMaterials(query, limit);
      if (searchRes && searchRes.items && searchRes.items.length > 0) {
        return res.json({
          success: true,
          total: searchRes.total,
          page: 1,
          limit,
          items: searchRes.items,
        });
      }
    }

    const result = await cacheService.getAllMaterials(query, page, limit);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/suppliers - Master Supplier Material (1.506 rekomendasi vendor)
 */
router.get('/suppliers', async (req, res) => {
  try {
    const query = req.query.q || '';
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;

    const result = await cacheService.getAllSuppliers(query, page, limit);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/sync - Manual Sync Master Data dari Google Sheets
 */
/**
 * POST /api/sync - Manual Sync Master Data Sheet 2026
 */
router.post('/sync', async (req, res) => {
  try {
    if (!hasValidToken()) {
      return res.status(401).json({
        success: false,
        error: 'Google OAuth2 Token belum siap. Jalankan node auth-google.js di terminal.',
      });
    }

    const sheetsClient = getSheetsClient();
    const result = await cacheService.syncMasterData(sheetsClient);
    res.json({ success: true, result });
  } catch (err) {
    console.error('❌ Gagal sinkronisasi manual:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/sync-all - Sinkronisasi Seluruh Tab PO (2017 s/d 2026) & Master Data
 */
router.post('/sync-all', async (req, res) => {
  try {
    if (!hasValidToken()) {
      return res.status(401).json({
        success: false,
        error: 'Google OAuth2 Token belum siap. Jalankan node auth-google.js di terminal.',
      });
    }

    const sheetsClient = getSheetsClient();
    const result = await cacheService.syncAllSheets(sheetsClient);
    res.json({ success: true, result });
  } catch (err) {
    console.error('❌ Gagal sinkronisasi seluruh sheet:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});


/**
 * POST /api/ocr/parse - Multi-File & Multi-Page OCR Document Parser
 * Menerima file upload (multipart/form-data) atau JSON base64.
 */
router.post('/ocr/parse', upload.array('files', 20), async (req, res) => {
  try {
    const filesToProcess = [];

    // 1. Ambil dari multipart upload (req.files)
    if (req.files && req.files.length > 0) {
      for (const f of req.files) {
        filesToProcess.push({
          filename: f.originalname,
          buffer: f.buffer,
          mimeType: f.mimetype,
        });
      }
    }

    // 2. Ambil dari body jika dikirim via JSON base64
    if (req.body && Array.isArray(req.body.files)) {
      for (const item of req.body.files) {
        if (item.base64) {
          const buffer = Buffer.from(item.base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
          filesToProcess.push({
            filename: item.filename || item.name || 'uploaded_doc',
            buffer,
            mimeType: item.mimeType || item.type || 'application/pdf',
          });
        }
      }
    }

    if (filesToProcess.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Tidak ada file yang dikirim. Unggah minimal 1 dokumen PDF atau gambar (JPG/PNG).',
      });
    }

    console.log(`📥 Menerima ${filesToProcess.length} file untuk OCR ekstraksi...`);

    // Cache file buffers untuk auto-upload Google Drive saat di-commit
    const fileRefMap = {};
    for (const f of filesToProcess) {
      try {
        const cleanName = path.basename(f.filename || 'dokumen').replace(/[^a-zA-Z0-9_.-]/g, '_');
        const fileRef = `ocr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${cleanName}`;
        fs.writeFileSync(path.join(ocrCacheDir, fileRef), f.buffer);
        fileRefMap[f.filename] = { fileRef, mimeType: f.mimeType };
      } catch (cacheErr) {
        console.warn('⚠️ Gagal cache file OCR untuk Drive:', cacheErr.message);
      }
    }

    const parsedBatch = await ocrService.parseBatchDocuments(filesToProcess);

    // Tempelkan fileRef dan mimeType ke setiap parsed document
    for (const doc of parsedBatch) {
      if (doc.filename && fileRefMap[doc.filename]) {
        doc.fileRef = fileRefMap[doc.filename].fileRef;
        doc.mimeType = fileRefMap[doc.filename].mimeType;
      }
    }

    // Cross-check PO reference untuk Purchase Delivery Note (GRPO)
    for (const doc of parsedBatch) {
      if (doc.tipeDokumen === 'PURCHASE_DELIVERY_NOTE_GRPO') {
        if (doc.noPo && doc.noPo !== 'PO-2026-TEMP') {
          try {
            const existingPo = await sheetsService.getPOByNumber(doc.noPo);
            if (existingPo) {
              doc.poFound = true;
              doc.existingPo = {
                noPo: existingPo.noPo,
                supplier: existingPo.supplier,
                date: existingPo.date,
                status: existingPo.status,
                grandTotal: existingPo.grandTotal,
                itemsCount: existingPo.items ? existingPo.items.length : 0,
              };
            } else {
              doc.poFound = false;
              doc.poNotFoundMessage = 'PO tidak ditemukan, scan atau input terlebih dahulu PO nya.';
            }
          } catch (poErr) {
            doc.poFound = false;
            doc.poNotFoundMessage = 'PO tidak ditemukan, scan atau input terlebih dahulu PO nya.';
          }
        } else {
          doc.poFound = false;
          doc.poNotFoundMessage = 'Nomor referensi PO tidak terdeteksi pada dokumen. PO tidak ditemukan, scan atau input terlebih dahulu PO nya.';
        }
      }
    }

    res.json({
      success: true,
      totalFiles: filesToProcess.length,
      totalPOsParsed: parsedBatch.length,
      documents: parsedBatch,
    });
  } catch (err) {
    console.error('❌ Error /api/ocr/parse:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/ocr/batch-commit - Simpan/Update hasil OCR ke Google Sheets
 * - Jika Purchase Delivery Note (GRPO): Update baris PO yang ada
 * - Jika Purchase Order (PO): Insert baris baru ke sheet 'PO 2026'
 */
router.post('/ocr/batch-commit', async (req, res) => {
  try {
    const { pos } = req.body;
    if (!Array.isArray(pos) || pos.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Daftar dokumen yang akan disimpan kosong.',
      });
    }

    const results = [];
    let successCount = 0;

    for (const po of pos) {
      // KASUS 1: PURCHASE DELIVERY NOTE (GRPO) -> UPDATE EXISTING PO BARIS DI SHEET 'PO 2026'
      if (po.tipeDokumen === 'PURCHASE_DELIVERY_NOTE_GRPO') {
        const targetPo = (po.noPo || '').trim();
        if (!targetPo) {
          results.push({
            noPo: 'UNKNOWN',
            tipeDokumen: 'PURCHASE_DELIVERY_NOTE_GRPO',
            success: false,
            error: 'PO tidak ditemukan, scan atau input terlebih dahulu PO nya.',
          });
          continue;
        }

        const existing = await sheetsService.getPOByNumber(targetPo);
        if (!existing) {
          results.push({
            noPo: targetPo,
            tipeDokumen: 'PURCHASE_DELIVERY_NOTE_GRPO',
            success: false,
            error: `PO tidak ditemukan, scan atau input terlebih dahulu PO nya. (Target: ${targetPo})`,
          });
          continue;
        }

        const updatePayload = {
          grpo: po.noGrpo || (po.updateFields && po.updateFields.grpo),
          lastGrpoDate: po.lastGrpoDate || (po.updateFields && po.updateFields.lastGrpoDate) || sheetsService.getCurrentFormattedDate(),
          tglBayar: po.tglBayar !== undefined ? po.tglBayar : ((po.updateFields && po.updateFields.tglBayar) || ''),
          tglInvoice: po.tglInvoice !== undefined ? po.tglInvoice : ((po.updateFields && po.updateFields.tglInvoice) || ''),
          noInvoice: po.noInvoice !== undefined ? po.noInvoice : ((po.updateFields && po.updateFields.noInvoice) || ''),
          ket: po.ket !== undefined ? po.ket : ((po.updateFields && po.updateFields.ket) || (po.noGrpo ? `GRPO ${po.noGrpo}` : 'Update Delivery Note')),
        };

        const updateRes = await sheetsService.updatePOField(targetPo, updatePayload);
        if (updateRes.success) {
          successCount++;

          // Auto-archive ke Google Drive jika ada fileRef
          let driveDoc = null;
          if (po.fileRef) {
            const cachedPath = path.join(ocrCacheDir, po.fileRef);
            if (fs.existsSync(cachedPath)) {
              try {
                const buffer = fs.readFileSync(cachedPath);
                driveDoc = await driveService.uploadDocument({
                  buffer,
                  filename: po.filename || 'dokumen.pdf',
                  mimeType: po.mimeType || (po.filename?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
                  docType: 'GRPO',
                  noPo: targetPo,
                });
                console.log(`📁 Auto-archive GRPO ke Google Drive sukses: ${targetPo}`);
              } catch (dErr) {
                console.warn(`⚠️ Auto-archive GRPO ke Drive gagal (${targetPo}):`, dErr.message);
              }
            }
          }

          results.push({
            noPo: targetPo,
            tipeDokumen: 'PURCHASE_DELIVERY_NOTE_GRPO',
            action: 'updated_grpo',
            noGrpo: po.noGrpo,
            success: true,
            rowsUpdated: updateRes.rowsUpdated,
            drive: driveDoc,
          });
        } else {
          results.push({
            noPo: targetPo,
            tipeDokumen: 'PURCHASE_DELIVERY_NOTE_GRPO',
            success: false,
            error: updateRes.message || 'Gagal update baris PO.',
          });
        }
        continue;
      }

      // KASUS 2: NORMAL PURCHASE ORDER (PO) -> APPEND BARIS BARU KE SHEET 'PO 2026'
      if (!po.noPo || !po.supplier || !Array.isArray(po.items) || po.items.length === 0) {
        results.push({
          noPo: po.noPo || 'UNKNOWN',
          tipeDokumen: 'PURCHASE_ORDER',
          success: false,
          error: 'Data PO tidak lengkap atau item kosong.',
        });
        continue;
      }

      try {
        const commitRes = await sheetsService.appendPOTransaction({
          noPo: po.noPo,
          supplier: po.supplier,
          date: po.date,
          quotation: po.quotation || '',
          items: po.items,
        });

        successCount++;

        // Auto-archive ke Google Drive jika ada fileRef
        let driveDoc = null;
        if (po.fileRef) {
          const cachedPath = path.join(ocrCacheDir, po.fileRef);
          if (fs.existsSync(cachedPath)) {
            try {
              const buffer = fs.readFileSync(cachedPath);
              driveDoc = await driveService.uploadDocument({
                buffer,
                filename: po.filename || 'dokumen.pdf',
                mimeType: po.mimeType || (po.filename?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
                docType: 'PO',
                noPo: po.noPo,
              });
              console.log(`📁 Auto-archive PO ke Google Drive sukses: ${po.noPo}`);
            } catch (dErr) {
              console.warn(`⚠️ Auto-archive PO ke Drive gagal (${po.noPo}):`, dErr.message);
            }
          }
        }

        results.push({
          noPo: po.noPo,
          tipeDokumen: 'PURCHASE_ORDER',
          action: 'inserted_po',
          success: true,
          itemsCount: po.items.length,
          grandTotal: commitRes.grandTotal,
          drive: driveDoc,
        });
      } catch (itemErr) {
        results.push({
          noPo: po.noPo,
          tipeDokumen: 'PURCHASE_ORDER',
          success: false,
          error: itemErr.message,
        });
      }
    }

    res.json({
      success: true,
      totalRequested: pos.length,
      successCount,
      results,
    });
  } catch (err) {
    console.error('❌ Error /api/ocr/batch-commit:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/openwa/send-test - Kirim tes pesan WhatsApp
 */
router.post('/openwa/send-test', async (req, res) => {
  try {
    const { chatId, text } = req.body;
    if (!chatId || !text) {
      return res.status(400).json({ success: false, error: 'chatId dan text wajib diisi.' });
    }

    const waRes = await openwaService.sendText(chatId, text);
    res.json({ success: true, result: waRes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * ====================================================
 * FINANCE / KASBON & SETTLEMENT (BUDGET) API ROUTES
 * ====================================================
 */

// GET /api/finance/budgets - Ambil list kasbon beserta KPI stats
router.get('/finance/budgets', async (req, res) => {
  try {
    const { status, divisi, search } = req.query;
    const data = await financeBudgetService.getAllBudgets({ status, divisi, search });
    res.json(data);
  } catch (err) {
    console.error('❌ Error GET /api/finance/budgets:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/finance/budgets/:noBudget - Detail kasbon tertentu
router.get('/finance/budgets/:noBudget', async (req, res) => {
  try {
    const budget = await financeBudgetService.getBudgetByNo(req.params.noBudget);
    if (!budget) {
      return res.status(404).json({ success: false, error: 'Data kasbon tidak ditemukan.' });
    }
    res.json({ success: true, budget });
  } catch (err) {
    console.error('❌ Error GET /api/finance/budgets/:noBudget:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/finance/budgets - Buat pengajuan kasbon baru
router.post('/finance/budgets', async (req, res) => {
  try {
    const { nama, uraian, jumlah, divisi, noWa, tglKasbon, catatanFinance } = req.body;
    const result = await financeBudgetService.createBudget({
      nama,
      uraian,
      jumlah,
      divisi,
      noWa,
      tglKasbon,
      catatanFinance,
    });
    res.json({
      success: true,
      budget: result,
      message: `Pengajuan Kasbon ${result.no_budget || result.noBudget} berhasil dibuat.`,
    });
  } catch (err) {
    console.error('❌ Error POST /api/finance/budgets:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/finance/budgets/:noBudget/approve - Persetujuan & pencairan dana oleh Finance
router.post('/finance/budgets/:noBudget/approve', async (req, res) => {
  try {
    const { catatanFinance } = req.body;
    const result = await financeBudgetService.approveBudget(req.params.noBudget, { catatanFinance });
    res.json({
      success: true,
      budget: result,
      message: `Kasbon ${req.params.noBudget} berhasil disetujui & dicairkan.`,
    });
  } catch (err) {
    console.error('❌ Error approve budget:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/finance/budgets/:noBudget/reject - Penolakan kasbon oleh Finance
router.post('/finance/budgets/:noBudget/reject', async (req, res) => {
  try {
    const { alasan } = req.body;
    const result = await financeBudgetService.rejectBudget(req.params.noBudget, { alasan });
    res.json({
      success: true,
      budget: result,
      message: `Kasbon ${req.params.noBudget} telah ditolak.`,
    });
  } catch (err) {
    console.error('❌ Error reject budget:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/finance/budgets/:noBudget/lpj - Submit Laporan Pertanggungjawaban & Nota
router.post('/finance/budgets/:noBudget/lpj', async (req, res) => {
  try {
    const { realisasiBelanja, buktiNota, catatanPemohon } = req.body;
    const result = await financeBudgetService.submitLpj(req.params.noBudget, {
      realisasiBelanja,
      buktiNota,
      catatanPemohon,
    });
    res.json({
      success: true,
      budget: result,
      message: `LPJ Kasbon ${req.params.noBudget} berhasil dikirimkan.`,
    });
  } catch (err) {
    console.error('❌ Error submit LPJ:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/finance/budgets/:noBudget/close - Closing budget & verifikasi sisa kas
router.post('/finance/budgets/:noBudget/close', async (req, res) => {
  try {
    const { catatanFinance, sisaKembaliDiterima } = req.body;
    const result = await financeBudgetService.closeBudget(req.params.noBudget, {
      catatanFinance,
      sisaKembaliDiterima,
    });
    res.json({
      success: true,
      budget: result,
      message: `Kasbon ${req.params.noBudget} berhasil ditutup (CLOSED).`,
    });
  } catch (err) {
    console.error('❌ Error close budget:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/finance/budgets/sync - Sinkronisasi manual Google Sheets <-> PostgreSQL
router.post('/finance/budgets/sync', async (req, res) => {
  try {
    const result = await financeBudgetService.syncFromSheet();
    res.json(result);
  } catch (err) {
    console.error('❌ Error sync finance budgets:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/finance/upload-nota - Upload foto nota bon / struk belanja
router.post('/finance/upload-nota', uploadNota.array('files', 5), async (req, res) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ success: false, error: 'Tidak ada file yang diunggah.' });
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const fileResults = files.map((f) => ({
      originalName: f.originalname,
      fileName: f.filename,
      size: f.size,
      url: `/uploads/nota/${f.filename}`,
      fullUrl: `${protocol}://${host}/uploads/nota/${f.filename}`,
    }));

    res.json({
      success: true,
      files: fileResults,
      firstUrl: fileResults[0].url,
    });
  } catch (err) {
    console.error('❌ Error upload nota:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// KAS KECIL (PETTY CASH) 12 BULAN ENDPOINTS
// ============================================================================

// GET /api/finance/kas-kecil - Ambil data kas kecil per bulan
router.get('/finance/kas-kecil', async (req, res) => {
  try {
    const { bulan, q, cc, draftOnly } = req.query;
    const targetMonth = bulan || kasKecilService.getCurrentMonthName();
    const data = await kasKecilService.getKasKecilMonthData(targetMonth);

    let transactions = data.transactions || [];
    if (q && q.trim()) {
      const lowerQ = q.trim().toLowerCase();
      transactions = transactions.filter(t =>
        (t.keterangan || '').toLowerCase().includes(lowerQ) ||
        (t.noVoucher || '').toLowerCase().includes(lowerQ)
      );
    }
    if (cc && cc !== 'ALL') {
      transactions = transactions.filter(t => (t.cc || '').toUpperCase() === cc.toUpperCase());
    }
    if (draftOnly === 'true' || draftOnly === true) {
      transactions = transactions.filter(t => t.isDraft);
    }

    res.json({
      success: true,
      ...data,
      transactions,
    });
  } catch (err) {
    console.error('❌ Error GET /api/finance/kas-kecil:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/finance/kas-kecil/summary - Ringkasan 12 Bulan
router.get('/finance/kas-kecil/summary', async (req, res) => {
  try {
    const summary = await kasKecilService.getAllMonthsSummary();
    res.json({ success: true, ...summary });
  } catch (err) {
    console.error('❌ Error GET /api/finance/kas-kecil/summary:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/finance/kas-kecil - Tambah entri kas kecil baru
router.post('/finance/kas-kecil', async (req, res) => {
  try {
    const { bulan, date, noVoucher, cc, keterangan, tipe, nominal } = req.body;
    const result = await kasKecilService.addKasKecilEntry({
      bulan,
      date,
      noVoucher,
      cc,
      keterangan,
      tipe,
      nominal,
    });
    res.json({ success: true, entry: result });
  } catch (err) {
    console.error('❌ Error POST /api/finance/kas-kecil:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/finance/kas-kecil/voucher - Update nomor voucher dari 'draft'
router.put('/finance/kas-kecil/voucher', async (req, res) => {
  try {
    const { bulan, rowIndex, noVoucher, cc } = req.body;
    const result = await kasKecilService.updateKasKecilVoucher({
      bulan,
      rowIndex,
      noVoucher,
      cc,
    });
    res.json({ success: true, result });
  } catch (err) {
    console.error('❌ Error PUT /api/finance/kas-kecil/voucher:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// ============================================================================
// GOOGLE DRIVE SETTINGS & DOCUMENT ARCHIVE ENDPOINTS
// ============================================================================

/**
 * GET /api/auth/google/url - Menghasilkan Auth URL untuk login Google OAuth2
 */
router.get('/auth/google/url', (req, res) => {
  try {
    const { google } = require('googleapis');
    const raw = fs.readFileSync(env.sheets.credentialsPath, 'utf8');
    const creds = JSON.parse(raw);
    const ci = creds.web || creds.installed;

    const requestedUri =
      req.query.redirectUri ||
      process.env.GOOGLE_REDIRECT_URI ||
      (ci.redirect_uris && ci.redirect_uris[0]) ||
      'http://localhost:3000/oauth2callback';

    const client = new google.auth.OAuth2(ci.client_id, ci.client_secret, requestedUri);
    const scopes = [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
    ];
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
    });
    res.json({ success: true, authUrl, redirectUri: requestedUri });
  } catch (err) {
    console.error('❌ Error generate Google Auth URL:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/auth/google/exchange - Menukar Authorization Code dengan Token
 */
router.post('/auth/google/exchange', async (req, res) => {
  try {
    const { code, redirectUri } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ success: false, error: 'Authorization Code wajib diisi.' });
    }

    const { google } = require('googleapis');
    const raw = fs.readFileSync(env.sheets.credentialsPath, 'utf8');
    const creds = JSON.parse(raw);
    const ci = creds.web || creds.installed;

    const candidateUris = [
      redirectUri,
      'http://localhost:3000/oauth2callback',
      'http://localhost:3001/oauth2callback',
      'https://bot-whatsapp.ebite.biz.id/oauth2callback',
    ].filter(Boolean);

    let tokens = null;
    let lastErr = null;

    for (const uri of candidateUris) {
      try {
        const client = new google.auth.OAuth2(ci.client_id, ci.client_secret, uri);
        const resTok = await client.getToken(code.trim());
        tokens = resTok.tokens;
        break;
      } catch (e) {
        lastErr = e;
      }
    }

    if (!tokens) {
      throw lastErr || new Error('Gagal menukar kode otorisasi.');
    }

    const { getOAuth2Client } = require('../config/googleAuth');
    const auth = getOAuth2Client();
    auth.setCredentials(tokens);

    // Simpan ke credentials/token.json
    fs.writeFileSync(env.sheets.tokenPath, JSON.stringify(tokens, null, 2), 'utf8');
    console.log('🎉 Token Google OAuth2 berhasil diperbarui dengan izin Drive File!');

    const scopeStr = tokens.scope || '';
    res.json({
      success: true,
      message: 'Token Google OAuth2 berhasil diperbarui! Izin Google Drive aktif.',
      tokenInfo: {
        scope: scopeStr,
        hasDriveWrite: scopeStr.includes('drive.file') || scopeStr.includes('drive '),
      },
    });
  } catch (err) {
    console.error('❌ Gagal menukar token Google:', err.message);
    res.status(400).json({ success: false, error: `Gagal verifikasi kode: ${err.message}` });
  }
});

/**
 * GET /api/settings/drive - Mengambil konfigurasi & status Google Drive
 */
router.get('/settings/drive', async (req, res) => {
  try {
    const config = await driveService.getDriveConfig();
    res.json({
      success: true,
      config,
    });
  } catch (err) {
    console.error('❌ Error GET /api/settings/drive:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/settings/drive - Menyimpan konfigurasi Google Drive
 */
router.post('/settings/drive', async (req, res) => {
  try {
    const { folderUrlOrId, autoSubfolders } = req.body;
    if (!folderUrlOrId) {
      return res.status(400).json({ success: false, error: 'URL atau ID Folder Google Drive wajib diisi.' });
    }

    const saved = await driveService.saveDriveConfig({ folderUrlOrId, autoSubfolders });
    res.json({
      success: true,
      config: saved,
      message: 'Pengaturan Google Drive berhasil disimpan!',
    });
  } catch (err) {
    console.error('❌ Error POST /api/settings/drive:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/settings/drive/test - Menguji akses & izin folder Google Drive
 */
router.post('/settings/drive/test', async (req, res) => {
  try {
    const { folderUrlOrId } = req.body || {};
    const result = await driveService.testFolderAccess(folderUrlOrId);
    res.json(result);
  } catch (err) {
    console.error('❌ Error POST /api/settings/drive/test:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/documents/po/:noPo - Mengambil daftar lampiran dokumen untuk PO tertentu
 */
router.get('/documents/po/:noPo', async (req, res) => {
  try {
    const { noPo } = req.params;
    const { docType } = req.query;
    const docs = await driveService.getDocumentsForPo(noPo, docType);
    res.json({
      success: true,
      noPo,
      total: docs.length,
      documents: docs,
    });
  } catch (err) {
    console.error('❌ Error GET /api/documents/po:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/documents/download/:id - Unduh file dari Google Drive via stream server
 */
router.get('/documents/download/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = dbService.getPool();
    if (!pool) {
      return res.status(500).json({ success: false, error: 'Database PostgreSQL tidak aktif.' });
    }

    const docQuery = await pool.query('SELECT * FROM po_documents WHERE id = $1', [id]);
    if (docQuery.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Dokumen tidak ditemukan di database.' });
    }

    const doc = docQuery.rows[0];
    const { buffer, mimeType, filename } = await driveService.downloadDocumentBuffer(doc.drive_file_id);

    res.setHeader('Content-Type', mimeType || doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${filename || doc.file_name}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error('❌ Error download document:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/documents/upload - Upload dokumen manual (PO, GRPO, Bukti Bayar) untuk suatu PO
 */
router.post('/documents/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const { noPo, docType } = req.body;

    if (!file) {
      return res.status(400).json({ success: false, error: 'File wajib diunggah.' });
    }
    if (!noPo) {
      return res.status(400).json({ success: false, error: 'Nomor PO (noPo) wajib disertakan.' });
    }

    const uploadRes = await driveService.uploadDocument({
      buffer: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
      docType: docType || 'DOKUMEN',
      noPo,
    });

    res.json({
      success: true,
      document: uploadRes,
      message: `Dokumen berhasil diunggah dan diarsipkan ke Google Drive!`,
    });
  } catch (err) {
    console.error('❌ Error upload document:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

