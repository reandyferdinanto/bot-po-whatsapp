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
Anda adalah asisten AI ekstraksi dokumen Purchase Order (PO).
Tugas Anda adalah membaca gambar dokumen PO ini dan mengekstrak data penting ke dalam format JSON yang valid.

Aturan Ekstraksi:
1. "noPo": Nomor resmi dokumen PO (contoh: PO-2026-001).
2. "supplier": Nama vendor/supplier atau nama perusahaan tujuan pesanan.
3. "date": Tanggal PO dalam format DD/MM/YYYY.
4. "quotation": Nomor penawaran / quotation jika ada, atau kosong string "".
5. "items": Daftar barang yang dipesan. Untuk setiap item:
   - "kode": Kode item material jika tertera (misal RM00355, OT00120, dll), atau null jika tidak ada.
   - "nama": Nama barang / spesifikasi material lengkap.
   - "qty": Jumlah kuantitas (angka bulat/desimal).
   - "harga": Harga satuan barang per unit (angka murni tanpa simbol mata uang/titik ribuan).
   - "diskon": Nilai diskon jika ada (default: 0).
   - "ppn": Nilai PPN jika ada (default: 0).
   - "ket": Catatan khusus jika ada, atau "".

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

  return {
    source: 'gemini_vision',
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
