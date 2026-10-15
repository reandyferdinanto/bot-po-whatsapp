const { GoogleGenerativeAI } = require('@google/generative-ai');
const env = require('../config/env');
const cacheService = require('./cacheService');

/**
 * Menganalisis gambar/foto scan dokumen PO menggunakan Gemini 1.5 Flash Vision.
 *
 * @param {Buffer} imageBuffer - Buffer file gambar
 * @param {string} mimeType - contoh: 'image/jpeg' atau 'image/png'
 * @returns {Promise<Object>} Data terstruktur PO
 */
async function parseImageWithGemini(imageBuffer, mimeType = 'image/jpeg') {
  if (!env.gemini.apiKey) {
    throw new Error(
      'API Key Gemini belum diatur. Dapatkan API Key gratis di https://aistudio.google.com dan masukkan ke file .env (GEMINI_API_KEY).'
    );
  }

  const genAI = new GoogleGenerativeAI(env.gemini.apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `
Anda adalah asisten AI ahli ekstraksi dokumen procurement Purchase Order (PO) dan Purchase Delivery Note (Surat Jalan / GRPO / Goods Receipt).
Tugas Anda adalah membaca gambar dokumen ini, mengenali tipe dokumen secara akurat, dan mengekstrak data penting ke dalam format JSON yang valid.

Aturan Ekstraksi:
1. "tipeDokumen": Wajib tentukan salah satu:
   - "PURCHASE_DELIVERY_NOTE_GRPO" jika dokumen adalah Purchase Delivery Note / Surat Jalan / GRPO / Goods Receipt / Bukti Penerimaan Barang / Delivery Order gudang.
   - "PURCHASE_ORDER" jika dokumen adalah Purchase Order pemesanan barang atau jasa.

2. "noPo": Nomor resmi PO referensi (contoh: 2600120 atau PO-2026-001).
   PENTING: Pada Purchase Delivery Note / GRPO, cari nomor PO referensi yang biasanya tertera di bawah tanggal atau berlabel "PO#", "PO :", "Ref PO", "Based on PO", atau "Purchase Orders".
3. "noGrpo": Nomor dokumen GRPO / Nomor Surat Jalan (misal 2600055).
4. "supplier": Nama vendor / supplier / pengirim barang.
5. "date": Tanggal dokumen dalam format DD/MM/YYYY.
6. "lastGrpoDate": Tanggal selesai / penerimaan barang (DD/MM/YYYY).
7. "receivedBy": Nama staf penerima gudang jika ada.
8. "remarks": Catatan khusus / remarks pada dokumen.
9. "quotation": Nomor penawaran / quotation jika ada.
10. "items": Daftar barang yang tercantum pada dokumen. Untuk setiap item:
   - "kode": Kode item material jika tertera (misal RM00355, OT00120, dll), atau null jika tidak ada.
   - "nama": Nama barang / spesifikasi lengkap.
   - "qty": Jumlah kuantitas (angka).
   - "uom": Satuan barang (Pcs, Ea, Unit, Btg, Set, dll).
   - "harga": Harga satuan per unit (hanya jika ada pada PO, default: 0).
   - "diskon": Nilai diskon desimal/persen (default: 0).
   - "ppn": Nilai PPN (default: 0).

PENTING:
Kembalikan HANYA teks JSON murni (dimulai dengan { dan diakhiri dengan }). Jangan gunakan markdown code block (seperti \`\`\`json).
`;

  const imagePart = {
    inlineData: {
      data: imageBuffer.toString('base64'),
      mimeType,
    },
  };

  const result = await model.generateContent([prompt, imagePart]);
  const responseText = result.response.text().trim();

  // Bersihkan kemungkinan markdown code fence jika model tetap menambahkannya
  const cleanedJson = responseText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let parsedData;
  try {
    parsedData = JSON.parse(cleanedJson);
  } catch (err) {
    console.error('Gagal parse JSON dari Gemini:', responseText);
    throw new Error('Format ekstraksi AI tidak valid. Mohon pastikan foto dokumen PO jelas dan terbaca.');
  }

  // Auto-matching: Jika kode barang tidak terdeteksi, cari dari nama barang ke master
  if (Array.isArray(parsedData.items)) {
    for (const item of parsedData.items) {
      if (!item.kode && item.nama) {
        const matches = cacheService.searchMaterials(item.nama, 1);
        if (matches && matches.length > 0) {
          item.kode = matches[0].kode;
          item.matchedMasterNama = matches[0].nama;
        }
      } else if (item.kode) {
        const cached = cacheService.findMaterialByCode(item.kode);
        if (cached) {
          item.matchedMasterNama = cached.nama;
        }
      }
    }
  }

  const isDelivery = parsedData.tipeDokumen === 'PURCHASE_DELIVERY_NOTE_GRPO'
    || /Purchase\s*Delivery\s*Note|Delivery\s*Note|Surat\s*Jalan|\bGRPO\b|Goods\s*Receipt|Penerimaan/i.test(JSON.stringify(parsedData));

  if (isDelivery) {
    const noGrpo = parsedData.noGrpo || parsedData.noPo || '';
    const targetPo = (parsedData.noPo && parsedData.noPo !== noGrpo) ? parsedData.noPo : '';
    const itemsSummary = (parsedData.items || []).map(it => `${it.qty || 1} ${it.uom || 'Ea'} ${it.kode || ''}`).filter(Boolean).join(', ');
    const ketText = `GRPO ${noGrpo}`
      + (parsedData.receivedBy ? ` (Diterima: ${parsedData.receivedBy})` : '')
      + (itemsSummary ? ` [${itemsSummary}]` : '')
      + (parsedData.remarks ? ` - ${parsedData.remarks}` : '');

    return {
      source: 'gemini_vision',
      tipeDokumen: 'PURCHASE_DELIVERY_NOTE_GRPO',
      noGrpo,
      noPo: targetPo || parsedData.noPo || '',
      lastGrpoDate: parsedData.lastGrpoDate || parsedData.date || '',
      supplier: parsedData.supplier || 'Supplier',
      receivedBy: parsedData.receivedBy || '',
      remarks: parsedData.remarks || '',
      items: parsedData.items || [],
      updateFields: {
        grpo: noGrpo,
        lastGrpoDate: parsedData.lastGrpoDate || parsedData.date || '',
        ket: ketText,
      },
    };
  }

  return {
    source: 'gemini_vision',
    tipeDokumen: 'PURCHASE_ORDER',
    noPo: parsedData.noPo || 'PO-2026-TEMP',
    supplier: parsedData.supplier || 'Supplier',
    date: parsedData.date || '',
    quotation: parsedData.quotation || '',
    items: parsedData.items || [],
  };
}

module.exports = {
  parseImageWithGemini,
};
