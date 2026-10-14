const openwaService = require('../services/openwaService');
const ocrService = require('../services/ocrService');
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

    // 2. Routing ke Parser OCR
    const isPdf = mimeType.includes('pdf') || (media.filename && media.filename.toLowerCase().endsWith('.pdf'));

    if (isPdf) {
      console.log(`📄 Memproses file PDF (${media.filename || 'dokumen.pdf'})...`);
      extractedData = await ocrService.parsePdfDocument(mediaBuffer);
    } else if (mimeType.startsWith('image/')) {
      console.log(`📷 Memproses foto PO via Tesseract OCR (${mimeType})...`);
      extractedData = await ocrService.parseImageWithOcr(mediaBuffer);
    } else {
      await openwaService.sendText(
        chatId,
        '⚠️ Tipe file tidak didukung. Mohon kirimkan dokumen dalam format *PDF* atau foto (*JPG/PNG*).'
      );
      return true;
    }

    // 3. Validasi hasil ekstraksi
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

    // 4. Hitung estimasi total
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

    // Simpan draf ke sesi pengguna untuk menunggu konfirmasi "YA"
    conversationManager.setSession(chatId, 'CONFIRM_OCR_PO', extractedData);
    await openwaService.sendText(chatId, summaryText);
    return true;
  } catch (err) {
    console.error('❌ Gagal memproses media PO:', err.message);
    await openwaService.sendText(
      chatId,
      `❌ Gagal mengekstrak dokumen PO: ${err.message}\nSilakan periksa kembali kualitas foto atau gunakan menu manual.`
    );
    return true;
  }
}

module.exports = {
  handleIncomingMedia,
};
