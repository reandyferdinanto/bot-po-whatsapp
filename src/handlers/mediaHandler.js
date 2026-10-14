const openwaService = require('../services/openwaService');
const ocrService = require('../services/ocrService');
const sheetsService = require('../services/sheetsService');
const conversationManager = require('./conversationManager');

/**
 * Menangani pesan media yang masuk (Foto atau Dokumen PDF).
 */
async function handleIncomingMedia(message) {
  const chatId = message.chatId || message.from;
  const media = message.media;

  if (!media) return false;

  await openwaService.sendText(chatId, '🔍 *Dokumen terdeteksi!* Sedang memindai teks dokumen via OCR, mohon tunggu...');

  let mediaBuffer;
  let mimeType = media.mimetype || 'application/octet-stream';

  try {
    // 1. Ambil buffer media
    if (media.data) {
      mediaBuffer = Buffer.from(media.data, 'base64');
    } else {
      const downloaded = await openwaService.getMessageMedia(chatId, message.id);
      mediaBuffer = downloaded.buffer;
      if (downloaded.contentType) mimeType = downloaded.contentType;
    }

    let extractedData;

    // 2. Routing ke Parser OCR (PDF atau Gambar)
    const isPdf = mimeType.includes('pdf') || (media.filename && media.filename.toLowerCase().endsWith('.pdf'));

    if (isPdf) {
      console.log(`📄 Memproses file PDF (${media.filename || 'dokumen.pdf'})...`);
      extractedData = await ocrService.parsePdfDocument(mediaBuffer);
    } else if (mimeType.startsWith('image/')) {
      console.log(`📷 Memproses foto dokumen via OCR (${mimeType})...`);
      extractedData = await ocrService.parseImageWithOcr(mediaBuffer);
    } else {
      await openwaService.sendText(
        chatId,
        '⚠️ Tipe file tidak didukung. Mohon kirimkan dokumen dalam format *PDF* atau foto (*JPG/PNG*).'
      );
      return true;
    }

    // =========================================================================
    // KASUS 1: DOKUMEN PURCHASE DELIVERY NOTE (GRPO) -> AUTO UPDATE PO
    // =========================================================================
    if (extractedData.tipeDokumen === 'PURCHASE_DELIVERY_NOTE_GRPO') {
      const targetPo = extractedData.noPo;
      console.log(`📦 Terdeteksi Purchase Delivery Note ${extractedData.noGrpo} untuk PO ${targetPo}`);

      let existingPo = null;
      try {
        existingPo = await sheetsService.getPOByNumber(targetPo);
      } catch (err) {
        console.warn(`Gagal cek PO ${targetPo}:`, err.message);
      }

      let summaryText = `📦 *HASIL PINDAIAN PURCHASE DELIVERY NOTE (GRPO)*\n`;
      summaryText += `───────────────────────\n`;
      summaryText += `• *No. GRPO:* ${extractedData.noGrpo}\n`;
      summaryText += `• *Target No. PO:* ${targetPo}` + (existingPo ? ` (Ditemukan, Status: ${existingPo.status})\n` : `\n`);
      summaryText += `• *Tgl Selesai / Terima:* ${extractedData.lastGrpoDate || 'Hari ini'}\n`;
      summaryText += `• *Supplier:* ${extractedData.supplier}\n`;
      if (extractedData.receivedBy) {
        summaryText += `• *Penerima:* ${extractedData.receivedBy}\n`;
      }
      if (extractedData.remarks) {
        summaryText += `• *Catatan:* ${extractedData.remarks}\n`;
      }

      if (extractedData.items && extractedData.items.length > 0) {
        summaryText += `\n📦 *Barang Diterima (${extractedData.items.length} Item):*\n`;
        for (let i = 0; i < extractedData.items.length; i++) {
          const it = extractedData.items[i];
          summaryText += `${i + 1}. [${it.kode}] ${it.nama} (Qty: ${it.qty} ${it.uom})\n`;
        }
      }

      summaryText += `───────────────────────\n`;
      summaryText += `📝 *Kolom yang akan di-update pada PO ${targetPo}:*\n`;
      summaryText += `• No. GRPO ➔ *${extractedData.noGrpo}*\n`;
      summaryText += `• LAST DATE OF GRPO JOB DONE ➔ *${extractedData.lastGrpoDate || 'Hari ini'}*\n`;
      summaryText += `• KET ➔ *${extractedData.updateFields.ket}*\n\n`;

      if (!existingPo) {
        summaryText += `⚠️ *Perhatian:* Nomor PO *${targetPo}* saat ini belum tercatat di sheet 'PO 2026'.\n`;
        summaryText += `Jika Anda konfirmasi 'YA', bot akan mencoba mencari dan mengupdate baris tersebut saat data siap.\n\n`;
      }

      summaryText += `Ketik:\n• *YA* untuk update baris PO di Google Sheets 'PO 2026'\n• *BATAL* jika data tidak sesuai`;

      conversationManager.setSession(chatId, 'CONFIRM_UPDATE_GRPO', extractedData);
      await openwaService.sendText(chatId, summaryText);
      return true;
    }

    // =========================================================================
    // KASUS 2: DOKUMEN PURCHASE ORDER (PO MATERIAL / JASA) -> AUTO INPUT PO
    // =========================================================================
    if (!extractedData.items || extractedData.items.length === 0) {
      await openwaService.sendText(
        chatId,
        `⚠️ Berhasil membaca dokumen, tetapi tidak menemukan baris material yang jelas.
Nomor PO terdeteksi: *${extractedData.noPo}*
Supplier: *${extractedData.supplier}*

Silakan coba gunakan menu *Input PO Manual* dengan mengetik *menu*.`
      );
      return true;
    }

    let grandTotal = 0;
    const tipeDisplay = extractedData.tipePo === 'PO_JASA' ? 'PO JASA / OPERASIONAL' : 'PO MATERIAL';

    let summaryText = `📄 *HASIL PINDAIAN DOKUMEN PO*\n`;
    summaryText += `───────────────────────\n`;
    summaryText += `• *Kategori:* ${tipeDisplay}\n`;
    summaryText += `• *No PO:* ${extractedData.noPo}\n`;
    summaryText += `• *Supplier:* ${extractedData.supplier}\n`;
    summaryText += `• *Tanggal:* ${extractedData.date || 'Hari ini'}\n`;
    if (extractedData.quotation) {
      summaryText += `• *Ref / Quotation:* ${extractedData.quotation}\n`;
    }
    summaryText += `\n📦 *Daftar Item (${extractedData.items.length} Item):*\n`;

    for (let i = 0; i < extractedData.items.length; i++) {
      const it = extractedData.items[i];
      const kodeDisplay = it.kode ? `[${it.kode}] ` : '[JASA] ';
      const sub = (it.qty || 1) * (it.harga || 0);
      grandTotal += sub;

      summaryText += `${i + 1}. ${kodeDisplay}${it.nama || it.matchedMasterNama || 'Item'}\n`;
      summaryText += `   ${it.qty} x Rp ${(it.harga || 0).toLocaleString('id-ID')} = Rp ${sub.toLocaleString('id-ID')}\n`;
    }

    summaryText += `───────────────────────\n`;
    summaryText += `*TOTAL ESTIMASI: Rp ${grandTotal.toLocaleString('id-ID')}*\n\n`;
    summaryText += `Ketik:\n• *YA* untuk simpan ke sheet 'PO 2026'\n• *BATAL* jika data tidak sesuai`;

    conversationManager.setSession(chatId, 'CONFIRM_OCR_PO', extractedData);
    await openwaService.sendText(chatId, summaryText);
    return true;
  } catch (err) {
    console.error('❌ Gagal memproses media:', err.message);
    await openwaService.sendText(
      chatId,
      `❌ Gagal mengekstrak dokumen: ${err.message}\nSilakan periksa kembali foto atau gunakan menu manual.`
    );
    return true;
  }
}

module.exports = {
  handleIncomingMedia,
};
