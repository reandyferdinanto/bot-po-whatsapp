const { parseMultiPagePdf, parsePOText, extractPdfPages } = require('./ocrService');
const cacheService = require('./cacheService');

/**
 * Mengekstrak teks digital dan mem-parse struktur PO dari file PDF buffer.
 *
 * @param {Buffer} buffer - Buffer file PDF
 * @returns {Promise<Object>} Data terstruktur PO
 */
async function parsePdfPO(buffer) {
  const poList = await parseMultiPagePdf(buffer);
  return poList[0] || parsePOText('', 'pdf_empty');
}

module.exports = {
  parsePdfPO,
};
