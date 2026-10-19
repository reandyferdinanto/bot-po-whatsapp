const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const env = require('../config/env');
const cacheService = require('./cacheService');

const PROMPT_EXTRACTION = `
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

/**
 * Panggil 9Router (OpenAI-compatible) untuk Vision AI Gemini Flash
 */
async function call9RouterVision(imageBuffer, mimeType, prompt) {
  const base64Data = imageBuffer.toString('base64');
  const targetUrl = `${env.router9.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const response = await axios.post(
    targetUrl,
    {
      model: env.router9.model || 'ag/gemini-3-flash',
      stream: false,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`,
              },
            },
          ],
        },
      ],
      temperature: 0.1,
    },
    {
      headers: {
        Authorization: `Bearer ${env.router9.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: env.router9.timeout || 30000,
    }
  );

  const choices = response.data?.choices;
  if (!choices || choices.length === 0) {
    throw new Error('9Router mengembalikan respon kosong tanpa choices');
  }

  return choices[0].message?.content || '';
}

/**
 * Panggil Google Generative AI langsung jika ada direct GEMINI_API_KEY
 */
async function callDirectGeminiVision(imageBuffer, mimeType, prompt) {
  const genAI = new GoogleGenerativeAI(env.gemini.apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const imagePart = {
    inlineData: {
      data: imageBuffer.toString('base64'),
      mimeType,
    },
  };

  const result = await model.generateContent([prompt, imagePart]);
  return result.response.text();
}

/**
 * Menganalisis gambar/foto scan dokumen PO menggunakan Gemini Flash Vision (9Router / Direct Gemini).
 *
 * @param {Buffer} imageBuffer - Buffer file gambar
 * @param {string} mimeType - contoh: 'image/jpeg' atau 'image/png'
 * @returns {Promise<Object>} Data terstruktur PO
 */
async function parseImageWithGemini(imageBuffer, mimeType = 'image/jpeg') {
  let responseText = null;
  let aiSource = 'gemini_vision';

  // 1. Coba 9Router (Antigravity Gemini Flash)
  if (env.router9 && env.router9.enabled && env.router9.baseUrl && env.router9.apiKey) {
    try {
      console.log(`🤖 [AI Vision] Mengirim gambar ke 9Router (${env.router9.model || 'ag/gemini-3-flash'})...`);
      responseText = await call9RouterVision(imageBuffer, mimeType, PROMPT_EXTRACTION);
      aiSource = '9router_gemini_vision';
    } catch (err) {
      console.warn(`⚠️ [AI Vision] 9Router error: ${err.message}`);
    }
  }

  // 2. Fallback ke Direct Gemini SDK jika 9Router gagal dan GEMINI_API_KEY tersedia
  if (!responseText && env.gemini && env.gemini.apiKey) {
    try {
      console.log('🤖 [AI Vision] Mencoba Direct Google Generative AI (gemini-1.5-flash)...');
      responseText = await callDirectGeminiVision(imageBuffer, mimeType, PROMPT_EXTRACTION);
      aiSource = 'direct_gemini_vision';
    } catch (err) {
      console.warn(`⚠️ [AI Vision] Direct Gemini error: ${err.message}`);
    }
  }

  // 3. Jika kedua metode AI tidak menghasilkan respon, lempar error agar fallback ke Tesseract
  if (!responseText) {
    throw new Error('Semua provider Gemini AI tidak tersedia atau gagal merespon.');
  }

  // Bersihkan markdown code fence jika ada
  const cleanedJson = responseText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let parsedData;
  try {
    parsedData = JSON.parse(cleanedJson);
  } catch (err) {
    console.error('Gagal parse JSON dari AI Vision:', responseText);
    throw new Error('Format ekstraksi AI tidak valid JSON. Dokumen mungkin tidak terbaca jelas.');
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

  // Kalkulasi total matematis
  let calculatedSubTotal = 0;
  for (const it of (parsedData.items || [])) {
    const qty = Number(it.qty) || 1;
    const harga = Number(it.harga) || 0;
    const diskon = Number(it.diskon) || 0;
    const itemSub = qty * harga * (1 - diskon);
    calculatedSubTotal += itemSub;
    it.total = itemSub;
  }
  const totals = {
    subTotal: calculatedSubTotal,
    discount: 0,
    ppnRate: 0.11,
    ppnRatePercent: 11,
    ppn: Math.round(calculatedSubTotal * 0.11),
    grandTotal: Math.round(calculatedSubTotal * 1.11),
  };

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
      source: aiSource,
      tipeDokumen: 'PURCHASE_DELIVERY_NOTE_GRPO',
      noGrpo,
      noPo: targetPo || parsedData.noPo || '',
      lastGrpoDate: parsedData.lastGrpoDate || parsedData.date || '',
      supplier: parsedData.supplier || 'Supplier',
      receivedBy: parsedData.receivedBy || '',
      remarks: parsedData.remarks || '',
      items: parsedData.items || [],
      totals,
      updateFields: {
        grpo: noGrpo,
        lastGrpoDate: parsedData.lastGrpoDate || parsedData.date || '',
        ket: ketText,
      },
    };
  }

  return {
    source: aiSource,
    tipeDokumen: 'PURCHASE_ORDER',
    tipePo: (parsedData.items || []).some(it => it.tipe === 'PO_MATERIAL' || it.kode) ? 'PO_MATERIAL' : 'PO_JASA',
    noPo: parsedData.noPo || 'PO-2026-TEMP',
    supplier: parsedData.supplier || 'Supplier',
    date: parsedData.date || '',
    quotation: parsedData.quotation || '',
    items: parsedData.items || [],
    totals,
  };
}

module.exports = {
  parseImageWithGemini,
};
