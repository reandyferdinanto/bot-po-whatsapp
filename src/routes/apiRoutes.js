const express = require('express');
const multer = require('multer');
const sheetsService = require('../services/sheetsService');
const cacheService = require('../services/cacheService');
const ocrService = require('../services/ocrService');
const openwaService = require('../services/openwaService');
const dbService = require('../services/dbService');
const { hasValidToken, getSheetsClient } = require('../config/googleAuth');
const env = require('../config/env');

const router = express.Router();

// Memory storage for file uploads (up to 20 files, max 25MB each)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 20 },
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
      const targetStatus = status.toLowerCase();
      filteredRows = filteredRows.filter(r => (r.status || '').toLowerCase() === targetStatus);
      filteredPOs = filteredPOs.filter(p => (p.status || '').toLowerCase() === targetStatus);
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
router.get('/materials', (req, res) => {
  try {
    const query = req.query.q || '';
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;

    const result = cacheService.getAllMaterials(query, page, limit);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/suppliers - Master Supplier Material (1.506 rekomendasi vendor)
 */
router.get('/suppliers', (req, res) => {
  try {
    const query = req.query.q || '';
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;

    const result = cacheService.getAllSuppliers(query, page, limit);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/sync - Manual Sync Master Data dari Google Sheets
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
    const parsedBatch = await ocrService.parseBatchDocuments(filesToProcess);

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
 * POST /api/ocr/batch-commit - Simpan daftar PO hasil OCR ke Google Sheets
 */
router.post('/ocr/batch-commit', async (req, res) => {
  try {
    const { pos } = req.body;
    if (!Array.isArray(pos) || pos.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Daftar PO yang akan disimpan kosong.',
      });
    }

    const results = [];
    let successCount = 0;

    for (const po of pos) {
      if (!po.noPo || !po.supplier || !Array.isArray(po.items) || po.items.length === 0) {
        results.push({
          noPo: po.noPo || 'UNKNOWN',
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
        results.push({
          noPo: po.noPo,
          success: true,
          itemsCount: po.items.length,
          grandTotal: commitRes.grandTotal,
        });
      } catch (itemErr) {
        results.push({
          noPo: po.noPo,
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

module.exports = router;
