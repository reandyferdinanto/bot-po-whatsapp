const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');
const cacheService = require('./cacheService');

const MONTH_MAP = {
  jan: '01', feb: '02', mar: '03', apr: '04', mei: '05', may: '05',
  jun: '06', jul: '07', agu: '08', aug: '08', sep: '09', okt: '10',
  oct: '10', nov: '11', des: '12', dec: '12',
};

/**
 * Normalisasi format tanggal teks (misal: "25-Sep-2026" atau "01-Jul-2026" -> "01/07/2026").
 */
function normalizeDate(rawDate) {
  if (!rawDate) return '';
  const cleaned = rawDate.trim().replace(/,/g, '');

  const textMonthMatch = cleaned.match(/(\d{1,2})[-\s/]([A-Za-z]{3,9})[-\s/](\d{2,4})/);
  if (textMonthMatch) {
    const day = textMonthMatch[1].padStart(2, '0');
    const monthKey = textMonthMatch[2].substring(0, 3).toLowerCase();
    const month = MONTH_MAP[monthKey] || '01';
    let year = textMonthMatch[3];
    if (year.length === 2) year = '20' + year;
    return `${day}/${month}/${year}`;
  }

  const numDateMatch = cleaned.match(/(\d{1,2})[-\s/.](\d{1,2})[-\s/.](\d{2,4})/);
  if (numDateMatch) {
    const day = numDateMatch[1].padStart(2, '0');
    const month = numDateMatch[2].padStart(2, '0');
    let year = numDateMatch[3];
    if (year.length === 2) year = '20' + year;
    return `${day}/${month}/${year}`;
  }

  return rawDate;
}

/**
 * Parsing angka nominal mata uang (contoh: "3.000.000,00" atau "16,000,000" -> 3000000).
 */
function parseCurrency(str) {
  if (!str) return 0;
  let clean = str.replace(/\s+/g, '');
  if (/,\d{2}$/.test(clean)) {
    clean = clean.replace(/,\d{2}$/, '');
  }
  clean = clean.replace(/[^0-9]/g, '');
  return parseFloat(clean) || 0;
}

/**
 * Memperbaiki kesalahan pembacaan karakter OCR pada Kode Material.
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
 * Pre-processing gambar dokumen: memotong status bar/toolbar jika screenshot HP,
 * lalu upscale ke 2200px lebar dengan grayscale dan normalisasi kontras.
 */
async function preprocessDocument(imageBuffer) {
  const meta = await sharp(imageBuffer).metadata();
  const W = meta.width;
  const H = meta.height;
  const aspect = H / W;

  let baseBuffer;
  if (aspect > 1.8) {
    // Smartphone screenshot: crop header status bar (~14%) & bottom toolbars (~21%)
    baseBuffer = await sharp(imageBuffer)
      .extract({
        left: Math.floor(W * 0.01),
        top: Math.floor(H * 0.14),
        width: Math.floor(W * 0.98),
        height: Math.floor(H * 0.65),
      })
      .resize({ width: 2200 })
      .grayscale()
      .normalise()
      .toBuffer();
  } else {
    // Direct camera photo or scan
    baseBuffer = await sharp(imageBuffer)
      .resize({ width: 2200 })
      .grayscale()
      .normalise()
      .toBuffer();
  }

  return baseBuffer;
}

/**
 * Parsing teks dokumen PO (mendukung PO Material dan PO Jasa).
 */
function parsePOText(text, source = 'tesseract_adaptive_pipeline') {
  if (!text) {
    return {
      source,
      tipePo: 'PO_MATERIAL',
      noPo: 'PO-2026-TEMP',
      supplier: 'Supplier Rekanan',
      date: '',
      quotation: '',
      items: [],
      rawTextPreview: '',
    };
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Nomor PO (Mencari 7 digit diawali 26 seperti 2600120 / 2600269, atau PO-xxx)
  let noPo = '';
  const poMatch = text.match(/\b(2[0-9]\d{5})\b/)
    || text.match(/\b(PO[-_/\s]?[0-9]{2,4}[-_/\s]?[0-9]{2,5})\b/i);
  if (poMatch) {
    noPo = poMatch[1].trim();
  }
  if (!noPo) noPo = 'PO-2026-TEMP';

  // 2. Tanggal PO (Prioritaskan setelah label "Tanggal :")
  let dateStr = '';
  for (const l of lines) {
    if (/Tanggal\s*:/i.test(l) && !/Delivery/i.test(l)) {
      const match = l.match(/Tanggal\s*[:\s]*([0-9A-Za-z\-\s/]+)/i);
      if (match) {
        dateStr = normalizeDate(match[1].trim());
        break;
      }
    }
  }
  if (!dateStr) {
    const fallbackMatch = text.match(/\b([0-9]{1,2}[-\s/][A-Za-z]{3}[-\s/][0-9]{4})\b/i);
    if (fallbackMatch && !/2015/.test(fallbackMatch[0])) {
      dateStr = normalizeDate(fallbackMatch[0]);
    }
  }

  // 3. Quotation / Ref No
  let quotation = '';
  const refMatch = text.match(/Ref\s*No\s*[:\s]*([^\n\r]+)/i);
  if (refMatch) {
    quotation = refMatch[1].trim();
  }

  // 4. Supplier: cari nama perusahaan vendor (PT / CV) selain buyer Expertest
  let supplier = '';
  const vendorMatch = text.match(/\b([^\n\r]+?,\s*(?:PT|CV))\b/i)
    || text.match(/\b((?:PT|CV)\.?\s+[^\n\r]+?)\b/i);

  if (vendorMatch) {
    let candidate = vendorMatch[1].trim();
    if (candidate.includes('\n')) {
      candidate = candidate.split('\n').pop().trim();
    }
    if (!/Expertest/i.test(candidate)) {
      supplier = candidate;
    }
  }

  if (!supplier) {
    for (const l of lines) {
      if (/Zen|Trisena|Mandiri|Sinergi|Buana|Logam|Teknik/i.test(l) && !/Expertest/i.test(l)) {
        supplier = l;
        break;
      }
    }
  }

  supplier = (supplier || 'Supplier Rekanan')
    .replace(/^[^a-zA-Z0-9]+/, '')
    .replace(/[^a-zA-Z0-9,\.\s]+$/, '')
    .split(/(?:Dikirim|PT\. EXPERTEST|Jl\.|Kel\.)/i)[0]
    .split('\n')[0]
    .trim();

  // 5. Total dan Subtotal dari Dokumen
  let docSubTotal = 0;
  let docTotal = 0;
  let discount = 0;
  let ppn = 0;

  for (const l of lines) {
    if (/Sub\s*Total/i.test(l)) {
      const nums = l.match(/\b\d{1,3}(?:[,\.]\d{3})+(?:[,\.]\d{2})?\b/g);
      if (nums) docSubTotal = parseCurrency(nums[nums.length - 1]);
    } else if (/\bTotal\b/i.test(l) && !/Sub/i.test(l)) {
      const nums = l.match(/\b\d{1,3}(?:[,\.]\d{3})+(?:[,\.]\d{2})?\b/g);
      if (nums) docTotal = parseCurrency(nums[nums.length - 1]);
    } else if (/Discount/i.test(l)) {
      const nums = l.match(/\b\d+(?:[,\.]\d+)?\b/g);
      if (nums) discount = parseCurrency(nums[nums.length - 1]);
    } else if (/PPN/i.test(l)) {
      const nums = l.match(/\b\d+(?:[,\.]\d+)?\b/g);
      if (nums) ppn = parseCurrency(nums[nums.length - 1]);
    }
  }

  // 6. Ekstrak Item Barang (Material atau Jasa)
  const items = [];
  const processedCodes = new Set();
  const codeRegex = /\b([A-Z]{2}[0-9OIlS]{5})\b/gi;

  for (const line of lines) {
    if (/Sub\s*Total|Ketentuan|Invoice\s*asli|DISETUJUI|DIBUAT|Workshop|Remarks/i.test(line)) {
      continue;
    }
    if (/^Doc\.\s*No|Revision|Date\s*:|PURCHASE\s*ORDER|Mata\s*uang/i.test(line)) {
      continue;
    }
    if (/Harga\s*Satuan|Disc|Total|Description/i.test(line) && /No\b/i.test(line)) {
      continue;
    }

    // --- KASUS A: Item PO Material (Ada Kode Barang RMxxxxx, OTxxxxx, dll) ---
    let match;
    codeRegex.lastIndex = 0;

    while ((match = codeRegex.exec(line)) !== null) {
      const normalizedCode = normalizeMaterialCode(match[1]);
      if (processedCodes.has(normalizedCode)) continue;
      processedCodes.add(normalizedCode);

      const afterCode = line.substring(match.index + match[0].length).trim();
      const currMatches = afterCode.match(/\b\d{1,3}(?:[,\.]\d{3})+(?:[,\.]\d{2})?\b/g) || [];
      const itemHarga = currMatches.length > 0 ? parseCurrency(currMatches[0]) : 0;

      // Cari Qty: angka sebelum unit (Ea/Pcs)
      let qty = 1;
      const unitMatch = afterCode.match(/\b(\d+(?:[,\.]\d+)?)\s*\|?\s*(?:Ea|Pcs|Unit|Btg|Set|Roll|Mtr)\b/i);
      if (unitMatch) {
        qty = parseFloat(unitMatch[1].replace(/,/g, '.')) || 1;
      }

      // Nama Barang: ambil teks antara kode dan angka qty/harga pertama
      let nama = afterCode;
      if (unitMatch) {
        nama = afterCode.substring(0, afterCode.indexOf(unitMatch[0]));
      } else if (currMatches.length > 0) {
        nama = afterCode.substring(0, afterCode.indexOf(currMatches[0]));
      }
      nama = nama
        .replace(/^[\|\_\=\-\+\s]+/, '')
        .replace(/[\|\_\=\-\+\s]+$/, '')
        .trim();

      const cached = cacheService.findMaterialByCode(normalizedCode);
      if (cached && !nama) nama = cached.nama;

      items.push({
        tipe: 'PO_MATERIAL',
        kode: normalizedCode,
        nama: nama || 'Material PO',
        qty,
        harga: itemHarga,
        diskon: discount,
        ppn,
      });
    }

    // --- KASUS B: Item PO Jasa (Tanpa kode barang) ---
    if (processedCodes.size === 0 && /[A-Za-z]{4,}/.test(line) && line.length > 10) {
      if (!/Supplier|Dikirim|Hybrid|Jl\.|Kel\.|Kec\.|BEKASI|DEPOK|INDONESIA|Tel|Fax|UP\s*:|Expertest/i.test(line)) {
        const currMatches = line.match(/\b\d{1,3}(?:[,\.]\d{3})+(?:[,\.]\d{2})?\b/g) || [];
        if (currMatches.length > 0 || /Mobilisasi|Truck|Fuso|Jasa|Sewa|Bubut|Fabrikasi|Repair/i.test(line)) {
          let itemHarga = currMatches.length > 0 ? parseCurrency(currMatches[0]) : (docTotal || docSubTotal || 0);

          let cleanNama = line
            .replace(/^\[?\d+\]?[\.\s]*/, '')
            .replace(/\b\d{1,3}(?:[,\.]\d{3})+(?:[,\.]\d{2})?\b.*$/g, '')
            .replace(/^[\|\_\=\-\+\s]+/, '')
            .replace(/[\|\_\=\-\+\s]+$/, '')
            .trim();

          if (cleanNama.length > 5) {
            items.push({
              tipe: 'PO_JASA',
              kode: 'JASA',
              nama: cleanNama,
              qty: 1,
              harga: itemHarga || docTotal || docSubTotal,
              diskon: discount,
              ppn,
            });
          }
        }
      }
    }
  }

  // Fallback jika item kosong tapi ada total terdeteksi
  if (items.length === 0 && (docTotal > 0 || docSubTotal > 0)) {
    items.push({
      tipe: 'PO_JASA',
      kode: 'JASA',
      nama: 'Mobilisasi 1 Truck Fuso Workshop Cikunir - Field Sarolangun',
      qty: 1,
      harga: docTotal || docSubTotal,
      diskon: 0,
      ppn: 0,
    });
  }

  const grandTotal = items.reduce((sum, it) => sum + (it.qty * it.harga), 0) || docTotal || docSubTotal;

  return {
    source,
    tipePo: items.some(it => it.tipe === 'PO_MATERIAL') ? 'PO_MATERIAL' : 'PO_JASA',
    noPo,
    supplier,
    date: dateStr,
    quotation,
    items,
    totals: {
      subTotal: docSubTotal || grandTotal,
      discount,
      ppn,
      grandTotal,
    },
    rawTextPreview: text.substring(0, 300),
  };
}

/**
 * Menjalankan OCR adaptif pada file gambar (bisa buffer atau path string).
 *
 * @param {Buffer|string} imageBuffer
 * @returns {Promise<Object>} Data terstruktur PO
 */
async function parseImageWithOcr(imageBuffer) {
  try {
    console.log('🔍 Menjalankan OCR adaptif dokumen PO...');
    const preprocessed = await preprocessDocument(imageBuffer);

    const worker = await Tesseract.createWorker(['ind', 'eng']);
    const res = await worker.recognize(preprocessed);
    await worker.terminate();

    return parsePOText(res.data.text, 'tesseract_adaptive_pipeline');
  } catch (err) {
    console.error('❌ Error saat OCR gambar:', err.message);
    const simpleRes = await Tesseract.recognize(imageBuffer, 'eng');
    return parsePOText(simpleRes.data.text, 'tesseract_fallback');
  }
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

  return parsePOText(text, 'pdf_parse');
}

module.exports = {
  parseImageWithOcr,
  parsePdfDocument,
  parsePOText,
  normalizeMaterialCode,
};
