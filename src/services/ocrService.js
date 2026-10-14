const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');
const cacheService = require('./cacheService');

/**
 * Memperbaiki kesalahan pembacaan karakter OCR pada Kode Material.
 * Format resmi: 2 huruf kapital + 5 angka (misal: RM00355, OT00120, TO00010, ST00020, FG00001).
 * OCR sering salah membaca angka 0 sebagai huruf O, angka 1 sebagai I/l, angka 5 sebagai S.
 */
function normalizeMaterialCode(rawCode) {
  if (!rawCode) return null;
  const cleaned = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = cleaned.match(/^([A-Z]{2})([0-9OILS]{5})$/i);
  if (!match) return cleaned;

  const prefix = match[1].toUpperCase();
  const digits = match[2]
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/S/g, '5');

  return prefix + digits;
}

/**
 * Parsing teks mentah (hasil Tesseract OCR atau PDF) menjadi struktur data PO.
 *
 * @param {string} text - Teks hasil ekstraksi
 * @param {string} source - 'tesseract_ocr' | 'pdf_parse'
 * @returns {Object} Data terstruktur PO
 */
function parsePOText(text, source = 'tesseract_ocr') {
  if (!text) {
    return {
      source,
      noPo: 'PO-2026-TEMP',
      supplier: 'Supplier Rekanan',
      date: '',
      items: [],
      rawTextPreview: '',
    };
  }

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // 1. Ekstrak Nomor PO
  let noPo = '';
  // Pola spesifik: PO-2026-001, PO/2026/001, PO2026-001, PO-26-001
  const exactPoMatch = text.match(/\b(PO[-_/\s]?[0-9]{2,4}[-_/\s]?[0-9]{2,5})\b/i);
  if (exactPoMatch) {
    noPo = exactPoMatch[1].trim().replace(/\s+/g, '-').toUpperCase();
  } else {
    const poLineMatch = text.match(/(?:NO\.?\s*PO|PO\s*NUMBER|NO\s*PESANAN)[:\s]+([A-Z0-9\/\-_]+)/i);
    if (poLineMatch) {
      noPo = poLineMatch[1].trim().toUpperCase();
    }
  }
  if (!noPo || noPo === 'PO') {
    noPo = 'PO-2026-TEMP';
  }

  // 2. Ekstrak Tanggal PO
  const dateRegex = /(?:DATE|TANGGAL|TGL)[:\s]*([0-3]?\d[\/\-\.][0-1]?\d[\/\-\.]\d{2,4})|\b([0-3]?\d[\/\-\.][0-1]?\d[\/\-\.]202\d)\b/i;
  const dateMatch = text.match(dateRegex);
  let dateStr = '';
  if (dateMatch) {
    dateStr = (dateMatch[1] || dateMatch[2] || '').replace(/[\.\-]/g, '/');
  }

  // 3. Ekstrak Nama Supplier / Vendor
  const supRegexes = [
    /(?:SUPPLIER|VENDOR|KEPADA|TO|DITUJUKAN\s*KEPADA)[:\s]*([^\n\r]+)/i,
    /\b((?:PT|CV|UD|TOKO)\.?\s+[A-Za-z0-9\s\.,&]+)/i,
  ];

  let supplier = '';
  for (const regex of supRegexes) {
    const match = text.match(regex);
    if (match) {
      let candidate = match[1].trim();
      // Potong jika ada label berikutnya dalam satu baris
      candidate = candidate.split(/(?:DATE|TANGGAL|TELP|ATTN|FAX)/i)[0].trim();
      if (candidate.length > 2) {
        supplier = candidate;
        break;
      }
    }
  }
  if (!supplier) {
    supplier = 'Supplier Rekanan';
  }

  // 4. Ekstrak Item Barang (Mencari kode material resmi atau kemiripan nama material)
  const items = [];
  const processedCodes = new Set();

  // Pola kode material: RM00355, OT00120, TO00010, ST00020, FG00001 (toleransi typo OCR)
  const codeRegex = /\b([A-Z]{2}[0-9OIlS]{5})\b/gi;

  for (const line of lines) {
    let match;
    let foundCodeInLine = false;

    // Reset regex index
    codeRegex.lastIndex = 0;

    while ((match = codeRegex.exec(line)) !== null) {
      const normalizedCode = normalizeMaterialCode(match[1]);
      if (processedCodes.has(normalizedCode)) continue;

      const cached = cacheService.findMaterialByCode(normalizedCode);
      const isKnownPrefix = /^(RM|OT|FG|TO|ST)/i.test(normalizedCode);

      if (cached || isKnownPrefix) {
        foundCodeInLine = true;
        processedCodes.add(normalizedCode);

        // Bagian teks setelah kode material
        const afterCode = line.substring(match.index + match[0].length).trim();
        let qty = 1;
        let harga = 0;
        let nama = cached ? cached.nama : '';

        // Deteksi angka di ujung baris (Qty [Satuan] Harga [Subtotal])
        // Contoh: "Hex Nipples 1/2 20 25000" atau "Hex Nipples 1/2 20 pcs 25000 500000"
        const trailing3 = afterCode.match(/^(.*?)\s+(\d+(?:[\.,]\d+)?)\s*(?:pcs|unit|btg|set|roll|lembar|buah)?\s+(\d+(?:[\.,]\d+)?)\s+(\d+(?:[\.,]\d+)?)\s*$/i);
        const trailing2 = afterCode.match(/^(.*?)\s+(\d+(?:[\.,]\d+)?)\s*(?:pcs|unit|btg|set|roll|lembar|buah)?\s+(\d+(?:[\.,]\d+)?)\s*$/i);
        const trailing1 = afterCode.match(/^(.*?)\s+(\d+(?:[\.,]\d+)?)\s*(?:pcs|unit|btg|set|roll|lembar|buah)?\s*$/i);

        if (trailing3) {
          if (!nama) nama = trailing3[1].trim();
          qty = parseFloat(trailing3[2].replace(/,/g, '')) || 1;
          harga = parseFloat(trailing3[3].replace(/,/g, '')) || 0;
        } else if (trailing2) {
          if (!nama) nama = trailing2[1].trim();
          qty = parseFloat(trailing2[2].replace(/,/g, '')) || 1;
          harga = parseFloat(trailing2[3].replace(/,/g, '')) || 0;
        } else if (trailing1) {
          if (!nama) nama = trailing1[1].trim();
          qty = parseFloat(trailing1[2].replace(/,/g, '')) || 1;
        } else {
          if (!nama) nama = afterCode;
        }

        // Jika nama masih kosong, cari sebelum kode
        if (!nama) {
          const beforeCode = line.substring(0, match.index).replace(/^\d+[\.\)]\s*/, '').trim();
          nama = beforeCode || 'Material PO';
        }

        items.push({
          kode: normalizedCode,
          nama: (nama || 'Material PO').trim(),
          qty,
          harga,
          diskon: 0,
          ppn: 0,
        });
      }
    }

    // Jika baris tidak mengandung kode eksak, coba pencocokan nama material jika baris mirip item barang
    if (!foundCodeInLine && line.length > 5 && items.length < 50) {
      if (!/^(no|date|tanggal|supplier|vendor|total|subtotal|ppn|alamat|attn|hal|yth)/i.test(line)) {
        const matches = cacheService.searchMaterials(line, 1);
        if (matches && matches.length > 0) {
          const topMatch = matches[0];
          if (!processedCodes.has(topMatch.kode)) {
            const trailing2 = line.match(/\s+(\d+(?:[\.,]\d+)?)\s*(?:pcs|unit|btg|set|roll|lembar|buah)?\s+(\d+(?:[\.,]\d+)?)\s*$/i);
            const trailing1 = line.match(/\s+(\d+(?:[\.,]\d+)?)\s*(?:pcs|unit|btg|set|roll|lembar|buah)?\s*$/i);

            if (trailing2 || trailing1) {
              processedCodes.add(topMatch.kode);
              const qty = trailing2 ? parseFloat(trailing2[1].replace(/,/g, '')) : (trailing1 ? parseFloat(trailing1[1].replace(/,/g, '')) : 1);
              const harga = trailing2 ? parseFloat(trailing2[2].replace(/,/g, '')) : 0;

              items.push({
                kode: topMatch.kode,
                nama: topMatch.nama,
                qty,
                harga,
                diskon: 0,
                ppn: 0,
              });
            }
          }
        }
      }
    }
  }

  return {
    source,
    noPo,
    supplier,
    date: dateStr,
    items,
    rawTextPreview: text.substring(0, 300),
  };
}

/**
 * Menjalankan OCR pada file gambar menggunakan Tesseract.js (100% Offline / Local).
 *
 * @param {Buffer} imageBuffer - Buffer gambar dokumen PO
 * @returns {Promise<Object>} Data terstruktur PO
 */
async function parseImageWithOcr(imageBuffer) {
  console.log('🔍 Menjalankan Tesseract OCR pada gambar...');
  const result = await Tesseract.recognize(imageBuffer, 'eng');
  const extractedText = result.data.text || '';
  console.log(`📄 OCR selesai: ${extractedText.length} karakter terbaca.`);

  return parsePOText(extractedText, 'tesseract_ocr');
}

/**
 * Menjalankan ekstraksi dokumen PDF (teks digital langsung).
 *
 * @param {Buffer} pdfBuffer - Buffer file PDF
 * @returns {Promise<Object>} Data terstruktur PO
 */
async function parsePdfDocument(pdfBuffer) {
  console.log('📄 Mengekstrak teks dari dokumen PDF...');
  const data = await pdfParse(pdfBuffer);
  const text = data.text || '';

  // Jika PDF memiliki teks digital langsung
  if (text && text.trim().length > 20) {
    return parsePOText(text, 'pdf_parse');
  }

  // Jika PDF adalah scanned PDF (halaman berisi bitmap gambar tanpa teks digital)
  console.log('⚠️ PDF tidak memiliki teks digital langsung, memproses fallback...');
  return parsePOText(text, 'pdf_parse');
}

module.exports = {
  parseImageWithOcr,
  parsePdfDocument,
  parsePOText,
  normalizeMaterialCode,
};
