const pdfParse = require('pdf-parse');
const cacheService = require('./cacheService');

/**
 * Mengekstrak teks digital dan mem-parse struktur PO dari file PDF buffer.
 *
 * @param {Buffer} buffer - Buffer file PDF
 * @returns {Promise<Object>} Data terstruktur PO
 */
async function parsePdfPO(buffer) {
  const data = await pdfParse(buffer);
  const text = data.text || '';

  // 1. Ekstrak Nomor PO
  const poRegex = /(?:NO\.?\s*PO|PURCHASE\s*ORDER\s*NO\.?|PO\s*NUMBER)[:\s]*([A-Z0-9\/\-_]+)/i;
  const poMatch = text.match(poRegex) || text.match(/(PO[-_]\d{4}[-_]\d{3,})/i);
  const noPo = poMatch ? poMatch[1].trim() : 'PO-2026-TEMP';

  // 2. Ekstrak Tanggal PO
  const dateRegex = /(?:DATE|TANGGAL)[:\s]*([0-3]?\d[\/\-\.][0-1]?\d[\/\-\.]\d{2,4})/i;
  const dateMatch = text.match(dateRegex);
  let dateStr = '';
  if (dateMatch) {
    dateStr = dateMatch[1].replace(/[\.\-]/g, '/');
  }

  // 3. Ekstrak Supplier
  const supRegex = /(?:SUPPLIER|VENDOR|TO|KEPADA)[:\s]*([^\n\r]+)/i;
  const supMatch = text.match(supRegex);
  let supplier = supMatch ? supMatch[1].trim() : 'Supplier Rekanan';

  // 4. Ekstrak Item Barang (Mencari pola kode material atau baris tabel)
  const items = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Pola kode material: RM00355, OT00120, TO00010, ST00020, dll.
  const codeRegex = /\b([A-Z]{2}\d{5})\b/i;

  for (const line of lines) {
    const codeMatch = line.match(codeRegex);
    if (codeMatch) {
      const kode = codeMatch[1].toUpperCase();
      const cached = cacheService.findMaterialByCode(kode);

      // Cari angka di sekitar kode (Qty dan Harga)
      const numbers = line.match(/\b\d+(?:[\.,]\d+)?\b/g) || [];
      let qty = 1;
      let harga = 0;

      // Ambil angka setelah kode jika ada
      if (numbers.length >= 2) {
        qty = parseFloat(numbers[numbers.length - 2].replace(/,/g, '')) || 1;
        harga = parseFloat(numbers[numbers.length - 1].replace(/,/g, '')) || 0;
      } else if (numbers.length === 1) {
        qty = parseFloat(numbers[0]) || 1;
      }

      items.push({
        kode,
        nama: cached ? cached.nama : line.replace(codeRegex, '').trim(),
        qty,
        harga,
        diskon: 0,
        ppn: 0,
      });
    }
  }

  return {
    source: 'pdf_parse',
    noPo,
    supplier,
    date: dateStr,
    items,
    rawTextPreview: text.substring(0, 300),
  };
}

module.exports = {
  parsePdfPO,
};
