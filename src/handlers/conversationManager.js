const fs = require('fs');
const path = require('path');
const sheetsService = require('../services/sheetsService');
const cacheService = require('../services/cacheService');
const openwaService = require('../services/openwaService');
const driveService = require('../services/driveService');

// State Storage In-Memory: chatId -> { state, data, lastActive }
const userSessions = new Map();
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 menit timeout

function getSession(chatId) {
  const now = Date.now();
  const session = userSessions.get(chatId);
  if (!session) return null;

  if (now - session.lastActive > SESSION_TTL_MS) {
    userSessions.delete(chatId);
    return null;
  }
  session.lastActive = now;
  return session;
}

function setSession(chatId, state, data = {}) {
  userSessions.set(chatId, {
    state,
    data,
    lastActive: Date.now(),
  });
}

function clearSession(chatId) {
  userSessions.delete(chatId);
}

/**
 * Format teks menu utama
 */
function getMainTextMenu() {
  return `*PROCUREMENT ASSISTANT — 2026*
━━━━━━━━━━━━━━━━━━━━━━━━
Silakan tentukan menu layanan:

*[1]*  Input PO Baru _(Multi-Item & AI Scan)_
*[2]*  Pencarian Data _(Vendor, Material & PO)_
*[3]*  Update Status _(GRPO & Pembayaran)_
*[4]*  Batalkan PO

▸ _Balas angka [1-4] atau kirim dokumen Foto/PDF langsung._
▸ _Ketik *batal* untuk mengakhiri sesi._
━━━━━━━━━━━━━━━━━━━━━━━━`;
}

/**
 * Format teks menu pencarian
 */
function getSearchMenuText() {
  return `*MODUL PENCARIAN DATA*
━━━━━━━━━━━━━━━━━━━━━━━━
Pilih kategori pencarian:

*[1]*  Rekomendasi Vendor Utama _(Nama Barang)_
*[2]*  Master Material _(Spesifikasi & Rentang Harga)_
*[3]*  Histori Barang per Vendor _(Katalog Vendor)_
*[4]*  Cek Status & Detail PO Tertentu

*[0]*  Kembali ke Menu Utama
▸ _Balas angka pilihan [0-4]:_
━━━━━━━━━━━━━━━━━━━━━━━━`;
}

/**
 * Memproses pesan teks pengguna sesuai state percakapan saat ini.
 */
async function handleConversationMessage(chatId, messageText, rawMessage) {
  const text = (messageText || '').trim();
  const lower = text.toLowerCase();

  // 1. Ambil sesi pengguna saat ini
  const session = getSession(chatId);

  // Periksa apakah pesan diawali dengan 'start' atau 'menu'
  const isStartOrMenu = /^(?:!|\/)?(start|menu)\b/i.test(text);

  if (isStartOrMenu) {
    setSession(chatId, 'MAIN_MENU');
    await openwaService.sendText(chatId, getMainTextMenu());
    return;
  }

  if (!session || session.state === 'IDLE') {
    return;
  }

  // 2. Jika ada sesi aktif dan user ingin batal
  if (lower === 'batal' || lower === 'cancel') {
    clearSession(chatId);
    await openwaService.sendText(chatId, '✓ _Sesi interaktif telah diakhiri. Ketik *menu* untuk memulai kembali._');
    return;
  }

  // 3. Tangani berdasarkan State Mesin Percakapan (Sesi Aktif)
  switch (session.state) {
    case 'MAIN_MENU':
      return handleMainMenuChoice(chatId, text);

    case 'SEARCH_MENU':
      return handleSearchMenuChoice(chatId, text);

    case 'WAIT_SEARCH_SUPPLIER':
      return handleSearchSupplierQuery(chatId, text);

    case 'WAIT_SEARCH_MATERIAL':
      return handleSearchMaterialQuery(chatId, text);

    case 'WAIT_SEARCH_SUPPLIER_ITEMS':
      return handleSearchSupplierItemsQuery(chatId, text);

    case 'WAIT_SEARCH_PO':
      return handleSearchPOQuery(chatId, text);

    case 'INPUT_PO_HEADER':
      return handleInputPOHeader(chatId, text, session);

    case 'INPUT_PO_ITEMS':
      return handleInputPOItems(chatId, text, session);

    case 'CONFIRM_OCR_PO':
      return handleConfirmOcrPO(chatId, text, session);

    case 'CONFIRM_UPDATE_GRPO':
      return handleConfirmUpdateGrpo(chatId, text, session);

    case 'UPDATE_PO_WAIT_NO':
      return handleUpdatePOWaitNo(chatId, text);

    case 'UPDATE_PO_SELECT_ACTION':
      return handleUpdatePOSelectAction(chatId, text, session);

    case 'UPDATE_PO_WAIT_VALUE':
      return handleUpdatePOWaitValue(chatId, text, session);

    case 'CANCEL_PO_WAIT_NO':
      return handleCancelPOWaitNo(chatId, text);

    default:
      clearSession(chatId);
      break;
  }
}

// -------------------------------------------------------------
// HANDLER PILIHAN MENU UTAMA
// -------------------------------------------------------------
async function handleMainMenuChoice(chatId, choice) {
  switch (choice.trim()) {
    case '1':
      setSession(chatId, 'INPUT_PO_HEADER');
      await openwaService.sendText(
        chatId,
        `*INPUT PO BARU — LANGKAH 1/2*
━━━━━━━━━━━━━━━━━━━━━━━━
Masukkan *Nomor PO* dan *Nama Vendor* (pisahkan koma).

Contoh : \`PO-2026-001, PT Buana Logam Perkasa\`
▸ _Ketik *batal* untuk keluar._
━━━━━━━━━━━━━━━━━━━━━━━━`
      );
      break;

    case '2':
      setSession(chatId, 'SEARCH_MENU');
      await openwaService.sendText(chatId, getSearchMenuText());
      break;

    case '3':
      setSession(chatId, 'UPDATE_PO_WAIT_NO');
      await openwaService.sendText(
        chatId,
        `*UPDATE STATUS PURCHASE ORDER*
━━━━━━━━━━━━━━━━━━━━━━━━
Ketik *Nomor PO* yang ingin diperbarui:
Contoh : \`PO-2026-001\`
▸ _Ketik *batal* untuk keluar._
━━━━━━━━━━━━━━━━━━━━━━━━`
      );
      break;

    case '4':
      setSession(chatId, 'CANCEL_PO_WAIT_NO');
      await openwaService.sendText(
        chatId,
        `*BATALKAN PURCHASE ORDER*
━━━━━━━━━━━━━━━━━━━━━━━━
Ketik *Nomor PO* dan *Alasan Pembatalan* (pisahkan koma):
Contoh : \`PO-2026-001, Salah spesifikasi material\`
▸ _Ketik *batal* untuk keluar._
━━━━━━━━━━━━━━━━━━━━━━━━`
      );
      break;

    default:
      await openwaService.sendText(chatId, 'Pilihan tidak valid. Silakan balas angka *1*, *2*, *3*, atau *4*.\nKetik *batal* untuk keluar.');
      break;
  }
}

// -------------------------------------------------------------
// HANDLER PENCARIAN DATA (MENU 2)
// -------------------------------------------------------------
async function handleSearchMenuChoice(chatId, choice) {
  switch (choice.trim()) {
    case '1':
      setSession(chatId, 'WAIT_SEARCH_SUPPLIER');
      await openwaService.sendText(
        chatId,
        `*PENCARIAN REKOMENDASI VENDOR*
━━━━━━━━━━━━━━━━━━━━━━━━
Ketik nama barang atau kode material yang dicari:
Contoh : \`Nipples\` atau \`RM00355\`
━━━━━━━━━━━━━━━━━━━━━━━━`
      );
      break;

    case '2':
      setSession(chatId, 'WAIT_SEARCH_MATERIAL');
      await openwaService.sendText(
        chatId,
        `*PENCARIAN MASTER MATERIAL*
━━━━━━━━━━━━━━━━━━━━━━━━
Ketik kode atau spesifikasi barang:
Contoh : \`elbow\` atau \`gates\` atau \`OT00736\`
━━━━━━━━━━━━━━━━━━━━━━━━`
      );
      break;

    case '3':
      setSession(chatId, 'WAIT_SEARCH_SUPPLIER_ITEMS');
      await openwaService.sendText(
        chatId,
        `*HISTORI PEMBELIAN PER VENDOR*
━━━━━━━━━━━━━━━━━━━━━━━━
Ketik nama vendor / supplier:
Contoh : \`Zen Teknik\` atau \`Buana Logam\`
━━━━━━━━━━━━━━━━━━━━━━━━`
      );
      break;

    case '4':
      setSession(chatId, 'WAIT_SEARCH_PO');
      await openwaService.sendText(
        chatId,
        `*CEK STATUS PURCHASE ORDER*
━━━━━━━━━━━━━━━━━━━━━━━━
Ketik Nomor PO yang ingin diperiksa:
Contoh : \`2600120\` atau \`PO-2026-001\`
━━━━━━━━━━━━━━━━━━━━━━━━`
      );
      break;

    case '0':
      setSession(chatId, 'MAIN_MENU');
      await openwaService.sendText(chatId, getMainTextMenu());
      break;

    default:
      await openwaService.sendText(chatId, 'Pilihan salah. Ketik angka 1, 2, 3, 4 atau 0 untuk kembali.');
      break;
  }
}

async function handleSearchSupplierQuery(chatId, query) {
  const res = await cacheService.searchSupplierRecommendations(query, 10);
  clearSession(chatId);

  const items = Array.isArray(res) ? res : (res.items || []);
  const total = Array.isArray(res) ? res.length : (res.total || items.length);

  if (!items || items.length === 0) {
    await openwaService.sendText(chatId, `⚠️ _Tidak ditemukan riwayat supplier untuk kata kunci:_ *"${query}"*.`);
    return;
  }

  let text = `*HASIL REKOMENDASI VENDOR*
━━━━━━━━━━━━━━━━━━━━━━━━
Kata Kunci : *"${query}"* (${total} ditemukan)

`;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    text += `*[${item.kode}]* ${item.nama}\n`;
    text += `  ▸ Vendor Utama : *${item.supplierUtama || '-'}*\n`;
    text += `  ▸ Histori PO   : ${item.frekuensi}x pemesanan (${item.totalQty} pcs)\n`;
    if (item.hargaMin && item.hargaMin > 0) {
      if (item.hargaMin === item.hargaMax) {
        text += `  ▸ Harga PO     : Rp ${item.hargaMin.toLocaleString('id-ID')}\n`;
      } else {
        text += `  ▸ Rentang Harga: Rp ${item.hargaMin.toLocaleString('id-ID')} — Rp ${item.hargaMax.toLocaleString('id-ID')}\n`;
      }
    }
    text += `\n`;
  }

  if (total > items.length) {
    text += `▸ _...dan ${total - items.length} hasil lainnya._\n`;
  }
  text += `━━━━━━━━━━━━━━━━━━━━━━━━`;
  await openwaService.sendText(chatId, text.trim());
}

async function handleSearchMaterialQuery(chatId, query) {
  const res = await cacheService.searchMaterials(query, 15);
  clearSession(chatId);

  const items = Array.isArray(res) ? res : (res.items || []);
  const total = Array.isArray(res) ? res.length : (res.total || items.length);

  if (!items || items.length === 0) {
    await openwaService.sendText(chatId, `⚠️ _Material dengan kata kunci "${query}" tidak ditemukan di database master._`);
    return;
  }

  let text = `*HASIL PENCARIAN MATERIAL*
━━━━━━━━━━━━━━━━━━━━━━━━
Kata Kunci : *"${query}"* (${total} ditemukan)

`;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    text += `*[${item.kode}]* ${item.nama}\n`;

    if (item.hargaMin && item.hargaMin > 0) {
      if (item.hargaMin === item.hargaMax) {
        text += `  ▸ Harga   : Rp ${item.hargaMin.toLocaleString('id-ID')}\n`;
      } else {
        text += `  ▸ Rentang : Rp ${item.hargaMin.toLocaleString('id-ID')} — Rp ${item.hargaMax.toLocaleString('id-ID')}\n`;
      }
      if (item.supplierTerakhir) {
        text += `  ▸ Terakhir: Rp ${item.hargaTerakhir.toLocaleString('id-ID')} (${item.supplierTerakhir}${item.tglTerakhir ? ' - ' + item.tglTerakhir : ''})\n`;
      }
    } else {
      text += `  ▸ Harga   : _Belum ada transaksi_\n`;
    }
    text += `\n`;
  }

  if (total > items.length) {
    text += `▸ _...dan ${total - items.length} material lainnya._\n`;
  }
  text += `━━━━━━━━━━━━━━━━━━━━━━━━`;
  await openwaService.sendText(chatId, text.trim());
}

async function handleSearchSupplierItemsQuery(chatId, query) {
  clearSession(chatId);
  await openwaService.sendText(chatId, `🔍 _Sedang mencari riwayat pembelian vendor:_ *"${query}"*...`);

  const result = await cacheService.getSupplierOrderHistory(query, 15);
  if (!result || !result.items || result.items.length === 0) {
    await openwaService.sendText(
      chatId,
      `⚠️ _Tidak ditemukan riwayat pembelian untuk vendor "${query}" di sheet transaksi._`
    );
    return;
  }

  let text = `*RIWAYAT VENDOR: ${result.supplier}*
━━━━━━━━━━━━━━━━━━━━━━━━
Total Barang Pernah Dipesan : *${result.totalItems} jenis*

`;
  for (let i = 0; i < result.items.length; i++) {
    const item = result.items[i];
    text += `*${i + 1}. [${item.kode}]* ${item.nama}\n`;
    if (item.hargaMin === item.hargaMax) {
      text += `   ▸ Harga   : Rp ${item.hargaMin.toLocaleString('id-ID')}\n`;
    } else {
      text += `   ▸ Rentang : Rp ${item.hargaMin.toLocaleString('id-ID')} — Rp ${item.hargaMax.toLocaleString('id-ID')}\n`;
    }
    if (item.hargaTerbaru) {
      text += `   ▸ Terakhir: Rp ${item.hargaTerbaru.toLocaleString('id-ID')}${item.tglTerbaru ? ' (' + item.tglTerbaru + ')' : ''}\n`;
    }
    if (item.poList && item.poList.length > 0) {
      const poDisplay = item.poList.slice(0, 5).join(', ') + (item.poList.length > 5 ? ` (+${item.poList.length - 5} PO)` : '');
      text += `   ▸ Terkait : ${poDisplay} _(${item.totalOrders}x order)_\n`;
    }
    text += `\n`;
  }

  if (result.totalItems > result.items.length) {
    text += `▸ _...dan ${result.totalItems - result.items.length} barang lainnya._\n`;
  }
  text += `━━━━━━━━━━━━━━━━━━━━━━━━`;
  await openwaService.sendText(chatId, text.trim());
}

async function handleSearchPOQuery(chatId, noPo) {
  clearSession(chatId);
  try {
    const po = await sheetsService.getPOByNumber(noPo);
    if (!po) {
      await openwaService.sendText(chatId, `⚠️ Dokumen PO *${noPo}* tidak ditemukan di sheet 'PO 2026'.`);
      return;
    }

    let text = `*DOKUMEN PURCHASE ORDER*
━━━━━━━━━━━━━━━━━━━━━━━━
Nomor PO  : \`${po.noPo}\`
Status    : *[${(po.status || 'OPEN').toUpperCase()}]*
Tanggal   : ${po.date}
Supplier  : *${po.supplier}*
`;
    if (po.grpo) text += `No. GRPO  : \`${po.grpo}\` (${po.lastGrpoDate || '-'})\n`;
    if (po.tglBayar) text += `Pembayaran: *LUNAS* (${po.tglBayar})\n`;
    if (po.noInvoice) text += `No Invoice: \`${po.noInvoice}\`\n`;

    text += `\n\`RINCIAN ITEM (${po.items.length})\`\n`;
    for (let i = 0; i < po.items.length; i++) {
      const it = po.items[i];
      const subtotal = it.qty * it.priceUnit * (1 - it.discount) + it.ppn;
      text += `${i + 1}. *[${it.kode}]* ${it.nama}\n`;
      text += `   └ ${it.qty} pcs × Rp ${it.priceUnit.toLocaleString('id-ID')} = Rp ${subtotal.toLocaleString('id-ID')}\n`;
    }
    text += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*TOTAL AKHIR : Rp ${po.grandTotal.toLocaleString('id-ID')}*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━`;

    await openwaService.sendText(chatId, text);
  } catch (err) {
    await openwaService.sendText(chatId, `✗ Gagal mengambil data PO: ${err.message}`);
  }
}

// -------------------------------------------------------------
// HANDLER INPUT PO MULTI-ITEM (METODE KERANJANG)
// -------------------------------------------------------------
async function handleInputPOHeader(chatId, text, session) {
  const parts = text.split(/[,;\n]/).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) {
    await openwaService.sendText(
      chatId,
      `⚠️ Format tidak sesuai. Masukkan *Nomor PO* dan *Supplier* dipisahkan tanda koma.\nContoh: \`PO-2026-001, PT Buana Logam Perkasa\``
    );
    return;
  }

  const noPo = parts[0].toUpperCase();
  const supplier = parts[1];

  const draft = {
    noPo,
    supplier,
    date: sheetsService.getCurrentFormattedDate(),
    items: [],
  };

  setSession(chatId, 'INPUT_PO_ITEMS', draft);

  await openwaService.sendText(
    chatId,
    `*HEADER PO TERSIMPAN*
━━━━━━━━━━━━━━━━━━━━━━━━
Nomor PO : \`${noPo}\`
Vendor   : *${supplier}*

\`LANGKAH 2/2 : INPUT BARANG\`
Ketik rincian item dengan format:
\`[Kode] [Qty] [HargaSatuan]\`

Contoh (bisa multi-baris):
RM00355 20 25000
RM00356 10 40000

▸ _Ketik *simpan* jika selesai, atau *batal*._
━━━━━━━━━━━━━━━━━━━━━━━━`
  );
}

async function handleInputPOItems(chatId, text, session) {
  const draft = session.data;
  const lower = text.toLowerCase();

  if (lower === 'simpan' || lower === 'ya' || lower === 'save') {
    if (draft.items.length === 0) {
      await openwaService.sendText(chatId, '⚠️ Keranjang item masih kosong. Masukkan minimal 1 barang terlebih dahulu.');
      return;
    }

    try {
      await openwaService.sendText(chatId, '⏳ _Sedang mencatat transaksi ke Google Sheets..._');
      const result = await sheetsService.appendPOTransaction(draft);
      clearSession(chatId);

      await openwaService.sendText(
        chatId,
        `*PURCHASE ORDER BERHASIL DICATAT*
━━━━━━━━━━━━━━━━━━━━━━━━
PO Ref      : \`${result.noPo}\`
Total Item  : *${result.itemsInserted} item*
Total Nilai : *Rp ${result.grandTotal.toLocaleString('id-ID')}*
Status      : \`[TERSIMPAN KE PO 2026]\`
━━━━━━━━━━━━━━━━━━━━━━━━`
      );
    } catch (err) {
      await openwaService.sendText(chatId, `✗ Gagal menyimpan ke Google Sheets: ${err.message}`);
    }
    return;
  }

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let addedCount = 0;
  const warnings = [];

  for (const line of lines) {
    const tokens = line.split(/[\s|]+/).filter(Boolean);
    if (tokens.length < 3) {
      warnings.push(`Baris "${line}" dilewati (format: Kode Qty Harga)`);
      continue;
    }

    const kode = tokens[0].toUpperCase();
    const qty = parseFloat(tokens[1].replace(/,/g, ''));
    const harga = parseFloat(tokens[2].replace(/,/g, ''));

    if (isNaN(qty) || isNaN(harga)) {
      warnings.push(`Baris "${line}" angka Qty/Harga tidak valid.`);
      continue;
    }

    const cached = cacheService.findMaterialByCode(kode);
    const nama = cached ? cached.nama : 'Material Tidak Terdaftar di Master';

    draft.items.push({
      kode,
      nama,
      qty,
      harga,
      diskon: 0,
      ppn: 0,
    });
    addedCount++;
  }

  let totalBelanja = 0;
  let summaryText = `*DRAF KERANJANG PO : ${draft.noPo}*
━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  for (let i = 0; i < draft.items.length; i++) {
    const it = draft.items[i];
    const sub = it.qty * it.harga;
    totalBelanja += sub;
    summaryText += `${i + 1}. *[${it.kode}]* ${it.nama}\n`;
    summaryText += `   └ ${it.qty} pcs × Rp ${it.harga.toLocaleString('id-ID')} = Rp ${sub.toLocaleString('id-ID')}\n`;
  }
  summaryText += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  summaryText += `*SUBTOTAL : Rp ${totalBelanja.toLocaleString('id-ID')}*\n\n`;

  if (warnings.length > 0) {
    summaryText += `⚠️ _Catatan:_\n${warnings.join('\n')}\n\n`;
  }

  summaryText += `▸ Kirim baris item lagi untuk menambah\n▸ Ketik *SIMPAN* untuk finalisasi\n▸ Ketik *BATAL* untuk membatalkan`;

  setSession(chatId, 'INPUT_PO_ITEMS', draft);
  await openwaService.sendText(chatId, summaryText);
}

// -------------------------------------------------------------
// HANDLER KONFIRMASI OCR PO
// -------------------------------------------------------------
async function handleConfirmOcrPO(chatId, text, session) {
  const lower = text.toLowerCase();
  const draft = session.data;

  if (lower === 'ya' || lower === 'simpan' || lower === 'oke' || lower === 'ok') {
    try {
      await openwaService.sendText(chatId, '⏳ _Sedang mencatat pindaian ke Google Sheets..._');
      const result = await sheetsService.appendPOTransaction(draft);
      clearSession(chatId);

      // Auto-upload dokumen ke Google Drive jika ada file fisik
      let driveMsg = '';
      if (draft._fileData && draft._fileData.buffer) {
        try {
          const driveRes = await driveService.uploadDocument({
            buffer: draft._fileData.buffer,
            filename: draft._fileData.filename,
            mimeType: draft._fileData.mimeType,
            docType: 'PO',
            noPo: result.noPo,
          });
          driveMsg = `\n📁 Arsip Drive : [Tersimpan](${driveRes.driveUrl})`;
        } catch (dErr) {
          console.warn('⚠️ Gagal arsip PO ke Drive via WA:', dErr.message);
          // Cadangan lokal agar berkas fisik tidak hilang
          try {
            const backupDir = path.resolve(__dirname, '../../uploads/documents');
            if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
            const ext = path.extname(draft._fileData.filename || '').toLowerCase() || (draft._fileData.mimeType.includes('pdf') ? '.pdf' : '.jpg');
            const cleanPo = (result.noPo || 'TEMP').replace(/[^a-zA-Z0-9_-]/g, '_');
            const localFile = path.join(backupDir, `PO_${cleanPo}_${Date.now()}${ext}`);
            fs.writeFileSync(localFile, draft._fileData.buffer);
            console.log(`💾 Berkas PO berhasil dicadangkan di lokal server: ${localFile}`);
          } catch (bkErr) {
            console.warn('⚠️ Gagal membuat cadangan lokal:', bkErr.message);
          }

          const isScopeErr = dErr.message && (dErr.message.includes('scope') || dErr.message.includes('insufficient'));
          driveMsg = isScopeErr
            ? `\n📁 Arsip Drive : ⚠️ Gagal (Izin Google Drive belum aktif di server)`
            : `\n📁 Arsip Drive : ⚠️ Gagal diunggah (${dErr.message})`;
        }
      }

      await openwaService.sendText(
        chatId,
        `*PURCHASE ORDER BERHASIL DICATAT*
━━━━━━━━━━━━━━━━━━━━━━━━
PO Ref      : \`${result.noPo}\`
Total Item  : *${result.itemsInserted} item*
Total Nilai : *Rp ${result.grandTotal.toLocaleString('id-ID')}*
Status      : \`[TERSIMPAN KE PO 2026]\`${driveMsg}
━━━━━━━━━━━━━━━━━━━━━━━━`
      );
    } catch (err) {
      await openwaService.sendText(chatId, `✗ Gagal menyimpan ke Google Sheets: ${err.message}`);
    }
  } else {
    clearSession(chatId);
    await openwaService.sendText(chatId, '✓ _Draf pindaian dokumen dibatalkan._');
  }
}

// -------------------------------------------------------------
// HANDLER KONFIRMASI UPDATE GRPO
// -------------------------------------------------------------
async function handleConfirmUpdateGrpo(chatId, text, session) {
  const lower = text.toLowerCase();
  const data = session.data;

  if (lower === 'ya' || lower === 'simpan' || lower === 'oke' || lower === 'ok' || lower === 'update') {
    try {
      const existing = await sheetsService.getPOByNumber(data.noPo);
      if (!existing) {
        clearSession(chatId);
        await openwaService.sendText(
          chatId,
          `⚠️ *PO TIDAK DITEMUKAN*\nNomor PO *${data.noPo || '-'}* tidak ditemukan di sheet 'PO 2026'.\nSilakan pastikan PO telah terdaftar sebelum upload Surat Jalan.`
        );
        return;
      }

      await openwaService.sendText(chatId, `⏳ _Sedang memperbarui status GRPO untuk PO ${data.noPo}..._`);

      const updatePayload = {
        grpo: data.noGrpo,
        lastGrpoDate: data.lastGrpoDate,
        ket: data.updateFields ? data.updateFields.ket : `GRPO ${data.noGrpo}`,
      };

      const res = await sheetsService.updatePOField(data.noPo, updatePayload);
      clearSession(chatId);

      // Auto-upload dokumen ke Google Drive jika ada file fisik
      let driveMsg = '';
      if (data._fileData && data._fileData.buffer) {
        try {
          const driveRes = await driveService.uploadDocument({
            buffer: data._fileData.buffer,
            filename: data._fileData.filename,
            mimeType: data._fileData.mimeType,
            docType: 'GRPO',
            noPo: data.noPo,
          });
          driveMsg = `\n📁 Arsip Drive : [Tersimpan](${driveRes.driveUrl})`;
        } catch (dErr) {
          console.warn('⚠️ Gagal arsip GRPO ke Drive via WA:', dErr.message);
          // Cadangan lokal agar berkas fisik tidak hilang
          try {
            const backupDir = path.resolve(__dirname, '../../uploads/documents');
            if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
            const ext = path.extname(data._fileData.filename || '').toLowerCase() || (data._fileData.mimeType.includes('pdf') ? '.pdf' : '.jpg');
            const cleanPo = (data.noPo || 'TEMP').replace(/[^a-zA-Z0-9_-]/g, '_');
            const localFile = path.join(backupDir, `GRPO_${cleanPo}_${Date.now()}${ext}`);
            fs.writeFileSync(localFile, data._fileData.buffer);
            console.log(`💾 Berkas GRPO berhasil dicadangkan di lokal server: ${localFile}`);
          } catch (bkErr) {
            console.warn('⚠️ Gagal membuat cadangan lokal:', bkErr.message);
          }

          const isScopeErr = dErr.message && (dErr.message.includes('scope') || dErr.message.includes('insufficient'));
          driveMsg = isScopeErr
            ? `\n📁 Arsip Drive : ⚠️ Gagal (Izin Google Drive belum aktif di server)`
            : `\n📁 Arsip Drive : ⚠️ Gagal diunggah (${dErr.message})`;
        }
      }

      if (res.success) {
        await openwaService.sendText(
          chatId,
          `*SURAT JALAN / GRPO BERHASIL DIUPDATE*
━━━━━━━━━━━━━━━━━━━━━━━━
PO Ref       : \`${data.noPo}\` (${res.rowsUpdated} baris)
No. GRPO     : \`${data.noGrpo}\`
Tgl Terima   : ${data.lastGrpoDate || '-'}
Status       : \`[UPDATE BERHASIL]\`${driveMsg}
━━━━━━━━━━━━━━━━━━━━━━━━`
        );
      } else {
        await openwaService.sendText(chatId, `⚠️ ${res.message}`);
      }
    } catch (err) {
      await openwaService.sendText(chatId, `✗ Gagal update GRPO ke Google Sheets: ${err.message}`);
    }
  } else {
    clearSession(chatId);
    await openwaService.sendText(chatId, '✓ _Pembaruan status GRPO dibatalkan._');
  }
}

// -------------------------------------------------------------
// HANDLER UPDATE PO MANUAL
// -------------------------------------------------------------
async function handleUpdatePOWaitNo(chatId, noPo) {
  try {
    const po = await sheetsService.getPOByNumber(noPo);
    if (!po) {
      await openwaService.sendText(chatId, `⚠️ Dokumen PO *${noPo}* tidak ditemukan di sheet 'PO 2026'.\nKetik *batal* untuk keluar.`);
      return;
    }

    setSession(chatId, 'UPDATE_PO_SELECT_ACTION', { noPo: po.noPo });
    await openwaService.sendText(
      chatId,
      `*PILIH KOLOM UPDATE: ${po.noPo}*
━━━━━━━━━━━━━━━━━━━━━━━━
*[1]*  Nomor GRPO & Tanggal Terima Gudang
*[2]*  Tanggal Pembayaran (Finance)
*[3]*  Nomor Invoice Vendor
*[4]*  Ubah Status Transaksi (Close / Pending / Open)

*[0]*  Batalkan
▸ _Balas angka [1-4]:_
━━━━━━━━━━━━━━━━━━━━━━━━`
    );
  } catch (err) {
    await openwaService.sendText(chatId, `✗ Terjadi kendala: ${err.message}`);
  }
}

async function handleUpdatePOSelectAction(chatId, choice, session) {
  const { noPo } = session.data;
  switch (choice.trim()) {
    case '1':
      setSession(chatId, 'UPDATE_PO_WAIT_VALUE', { noPo, type: 'grpo' });
      await openwaService.sendText(chatId, `Masukkan *Nomor GRPO* untuk PO \`${noPo}\`:\nContoh : \`GRPO-2026-088\``);
      break;

    case '2':
      setSession(chatId, 'UPDATE_PO_WAIT_VALUE', { noPo, type: 'bayar' });
      await openwaService.sendText(chatId, `Masukkan *Tanggal Bayar* untuk PO \`${noPo}\` (DD/MM/YYYY):\nContoh : \`15/10/2026\``);
      break;

    case '3':
      setSession(chatId, 'UPDATE_PO_WAIT_VALUE', { noPo, type: 'invoice' });
      await openwaService.sendText(chatId, `Masukkan *Nomor Invoice* untuk PO \`${noPo}\`:\nContoh : \`INV-BLP-2026-09\``);
      break;

    case '4':
      setSession(chatId, 'UPDATE_PO_WAIT_VALUE', { noPo, type: 'status' });
      await openwaService.sendText(chatId, `Masukkan status baru untuk PO \`${noPo}\` (\`Close\`, \`Pending\`, atau \`Open\`):`);
      break;

    case '0':
      clearSession(chatId);
      await openwaService.sendText(chatId, '✓ _Update status dibatalkan._');
      break;

    default:
      await openwaService.sendText(chatId, 'Pilihan tidak valid. Silakan balas 1, 2, 3, 4, atau 0.');
      break;
  }
}

async function handleUpdatePOWaitValue(chatId, value, session) {
  const { noPo, type } = session.data;
  clearSession(chatId);

  const updatePayload = {};
  if (type === 'grpo') updatePayload.grpo = value.trim();
  if (type === 'bayar') updatePayload.tglBayar = value.trim();
  if (type === 'invoice') updatePayload.noInvoice = value.trim();
  if (type === 'status') updatePayload.status = value.trim();

  try {
    await openwaService.sendText(chatId, '⏳ _Sedang memperbarui baris di Google Sheets..._');
    const res = await sheetsService.updatePOField(noPo, updatePayload);
    await openwaService.sendText(
      chatId,
      `*STATUS PO BERHASIL DIUPDATE*
━━━━━━━━━━━━━━━━━━━━━━━━
PO Ref  : \`${noPo}\` (${res.rowsUpdated} baris)
Field   : \`${type.toUpperCase()}\`
Nilai   : *${value.trim()}*
Status  : \`[BERHASIL DISIMPAN]\`
━━━━━━━━━━━━━━━━━━━━━━━━`
    );
  } catch (err) {
    await openwaService.sendText(chatId, `✗ Gagal update PO: ${err.message}`);
  }
}

// -------------------------------------------------------------
// HANDLER PEMBATALAN PO (SOFT DELETE)
// -------------------------------------------------------------
async function handleCancelPOWaitNo(chatId, text) {
  clearSession(chatId);
  const parts = text.split(/[,;\n]/).map(p => p.trim()).filter(Boolean);
  const noPo = parts[0];
  const reason = parts[1] || 'Dibatalkan via WhatsApp Bot';

  try {
    await openwaService.sendText(chatId, `⏳ _Sedang memproses pembatalan PO ${noPo}..._`);
    const res = await sheetsService.softDeletePO(noPo, reason);
    if (res.success) {
      await openwaService.sendText(
        chatId,
        `*PURCHASE ORDER DIBATALKAN*
━━━━━━━━━━━━━━━━━━━━━━━━
PO Ref  : \`${noPo}\` (${res.rowsUpdated} baris)
Status  : \`[CANCELLED]\`
Alasan  : ${reason}
━━━━━━━━━━━━━━━━━━━━━━━━`
      );
    } else {
      await openwaService.sendText(chatId, `⚠️ ${res.message}`);
    }
  } catch (err) {
    await openwaService.sendText(chatId, `✗ Gagal membatalkan PO: ${err.message}`);
  }
}

module.exports = {
  handleConversationMessage,
  setSession,
  getSession,
  clearSession,
};
