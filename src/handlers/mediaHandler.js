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

  await openwaService.sendText(chatId, '🔍 _Dokumen terdeteksi. Sedang memproses analisis teks via OCR, mohon tunggu..._');

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
        '⚠️ Tipe berkas tidak didukung. Mohon kirimkan dokumen dalam format *PDF* atau gambar (*JPG / PNG*).'
      );
      return true;
    }

    // =========================================================================
    // KASUS 1: DOKUMEN PURCHASE DELIVERY NOTE (GRPO) -> AUTO UPDATE PO
    // =========================================================================
    if (extractedData.tipeDokumen === 'PURCHASE_DELIVERY_NOTE_GRPO') {
      const targetPo = (extractedData.noPo || '').trim();
      console.log(`📦 Terdeteksi Purchase Delivery Note ${extractedData.noGrpo} untuk PO ${targetPo}`);

      let existingPo = null;
      if (targetPo && targetPo !== 'PO-2026-TEMP') {
        try {
          existingPo = await sheetsService.getPOByNumber(targetPo);
        } catch (err) {
          console.warn(`Gagal cek PO ${targetPo}:`, err.message);
        }
      }

      // Jika PO tidak ditemukan di sheet 'PO 2026'
      if (!existingPo) {
        await openwaService.sendText(
          chatId,
          `*PO TIDAK DITEMUKAN*
━━━━━━━━━━━━━━━━━━━━━━━━
Nomor PO  : *${targetPo || '(Tidak terdeteksi)'}*
Surat Jalan: \`${extractedData.noGrpo || '-'}\`

⚠️ Nomor PO di atas belum tercatat di sheet 'PO 2026'.
▸ _Silakan rekap / input PO terlebih dahulu sebelum mengunggah Surat Jalan ini._
━━━━━━━━━━━━━━━━━━━━━━━━`
        );
        conversationManager.clearSession(chatId);
        return true;
      }

      let summaryText = `*HASIL PINDAIAN SURAT JALAN (GRPO)*
━━━━━━━━━━━━━━━━━━━━━━━━
No. GRPO     : \`${extractedData.noGrpo}\`
PO Terkait   : \`${targetPo}\` _(Status: ${existingPo.status})_
Tgl Terima   : ${extractedData.lastGrpoDate || 'Hari ini'}
Supplier     : *${extractedData.supplier}*\n`;

      if (extractedData.receivedBy) {
        summaryText += `Penerima     : ${extractedData.receivedBy}\n`;
      }
      if (extractedData.remarks) {
        summaryText += `Catatan      : ${extractedData.remarks}\n`;
      }

      if (extractedData.items && extractedData.items.length > 0) {
        summaryText += `\n\`BARANG DITERIMA (${extractedData.items.length})\`\n`;
        for (let i = 0; i < extractedData.items.length; i++) {
          const it = extractedData.items[i];
          summaryText += `${i + 1}. *[${it.kode}]* ${it.nama}\n`;
          summaryText += `   └ Diterima: ${it.qty} ${it.uom}\n`;
        }
      }

      summaryText += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      summaryText += `\`DATA UPDATE PO ${targetPo}\`\n`;
      summaryText += `▸ No. GRPO (Kol. R)   : *${extractedData.noGrpo}*\n`;
      summaryText += `▸ Tgl Terima (Kol. S) : *${extractedData.lastGrpoDate || 'Hari ini'}*\n`;
      summaryText += `▸ Keterangan (Kol. W) : *${extractedData.updateFields ? extractedData.updateFields.ket : `GRPO ${extractedData.noGrpo}`}*\n\n`;

      summaryText += `▸ Ketik *YA* untuk konfirmasi update ke Google Sheets\n▸ Ketik *BATAL* untuk membatalkan`;

      extractedData._fileData = {
        buffer: mediaBuffer,
        filename: media.filename || (isPdf ? 'surat_jalan.pdf' : 'surat_jalan.jpg'),
        mimeType,
      };

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
        `*PINDAIAN DOKUMEN SELESAI*
━━━━━━━━━━━━━━━━━━━━━━━━
Nomor PO : \`${extractedData.noPo || '-'}\`
Vendor   : *${extractedData.supplier || '-'}*

⚠️ _Rincian item barang tidak terdeteksi dengan jelas._
Silakan gunakan input manual dengan mengetik *menu*.
━━━━━━━━━━━━━━━━━━━━━━━━`
      );
      return true;
    }

    const tipeDisplay = extractedData.tipePo === 'PO_JASA' ? 'PO JASA / OPERASIONAL' : 'PO MATERIAL';
    const totals = extractedData.totals || {};
    const subTotal = totals.subTotal || 0;
    const ppnRatePercent = totals.ppnRatePercent !== undefined ? totals.ppnRatePercent : (totals.ppnRate ? Math.round(totals.ppnRate * 100) : 0);
    const ppnNominal = totals.ppnNominal !== undefined ? totals.ppnNominal : (totals.ppn || 0);
    const discount = totals.discount || 0;
    const grandTotal = totals.grandTotal || (subTotal - discount + ppnNominal);

    let summaryText = `*HASIL PINDAIAN PURCHASE ORDER*
━━━━━━━━━━━━━━━━━━━━━━━━
Nomor PO  : \`${extractedData.noPo}\`
Kategori  : \`[${tipeDisplay}]\`
Vendor    : *${extractedData.supplier}*
Tanggal   : ${extractedData.date || 'Hari ini'}
`;
    if (extractedData.quotation) {
      summaryText += `Quotation : \`${extractedData.quotation}\`\n`;
    }

    summaryText += `\n\`RINCIAN ITEM (${extractedData.items.length})\`\n`;
    for (let i = 0; i < extractedData.items.length; i++) {
      const it = extractedData.items[i];
      const kodeDisplay = it.kode ? `[${it.kode}] ` : '[JASA] ';
      const itemSub = (it.qty || 1) * (it.harga || 0);

      summaryText += `${i + 1}. *${kodeDisplay}${it.nama || it.matchedMasterNama || 'Item'}*\n`;
      summaryText += `   └ ${it.qty} pcs × Rp ${(it.harga || 0).toLocaleString('id-ID')} = Rp ${itemSub.toLocaleString('id-ID')}\n`;
    }

    summaryText += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    summaryText += `\`RINGKASAN NILAI\`\n`;
    summaryText += `▸ Subtotal : Rp ${subTotal.toLocaleString('id-ID')}\n`;
    if (ppnRatePercent > 0 || ppnNominal > 0) {
      summaryText += `▸ PPN (${ppnRatePercent}%) : Rp ${ppnNominal.toLocaleString('id-ID')}\n`;
    }
    if (discount > 0) {
      summaryText += `▸ Diskon   : -Rp ${discount.toLocaleString('id-ID')}\n`;
    }
    summaryText += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    summaryText += `*TOTAL TRANSAKSI : Rp ${grandTotal.toLocaleString('id-ID')}*\n`;
    summaryText += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    summaryText += `▸ Ketik *YA* untuk simpan ke sheet 'PO 2026'\n▸ Ketik *BATAL* untuk membatalkan`;

    extractedData._fileData = {
      buffer: mediaBuffer,
      filename: media.filename || (isPdf ? 'dokumen_po.pdf' : 'dokumen_po.jpg'),
      mimeType,
    };

    conversationManager.setSession(chatId, 'CONFIRM_OCR_PO', extractedData);
    await openwaService.sendText(chatId, summaryText);
    return true;
  } catch (err) {
    console.error('❌ Gagal memproses media:', err.message);
    await openwaService.sendText(
      chatId,
      `✗ _Gagal mengekstrak dokumen:_ ${err.message}\nSilakan kirim ulang foto yang lebih jelas atau gunakan menu manual.`
    );
    return true;
  }
}

module.exports = {
  handleIncomingMedia,
};
