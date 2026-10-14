const sheetsService = require('../services/sheetsService');
const cacheService = require('../services/cacheService');
const openwaService = require('../services/openwaService');

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
  return `🤖 *SISTEM REKAP PO 2026*
Halo! Silakan pilih menu di bawah ini:

1️⃣ *1* - Input PO Baru (Multi-Item)
2️⃣ *2* - Cari Data (Supplier / Material / PO)
3️⃣ *3* - Update Status PO (GRPO / Pembayaran)
4️⃣ *4* - Hapus / Batalkan PO

📷 _Atau langsung kirim Foto / PDF dokumen PO untuk input otomatis via OCR!_
💡 _Ketik angka pilihan (1-4) atau ketik 'batal'_`;
}

/**
 * Format teks menu pencarian
 */
function getSearchMenuText() {
  return `🔍 *MENU PENCARIAN DATA*
Silakan pilih kategori pencarian:

1️⃣ *1* - Rekomendasi Supplier Utama (dari Material)
2️⃣ *2* - Cari Master Material (Kode / Nama Barang)
3️⃣ *3* - Cek Riwayat PO & Status Bayar

0️⃣ *0* - Kembali ke Menu Utama
💡 _Ketik angka pilihan (0-3):_`;
}

/**
 * Memproses pesan teks pengguna sesuai state percakapan saat ini.
 */
async function handleConversationMessage(chatId, messageText, rawMessage) {
  const text = (messageText || '').trim();
  const lower = text.toLowerCase();

  // 1. Perintah Batal Universal
  if (lower === 'batal' || lower === 'cancel') {
    clearSession(chatId);
    await openwaService.sendText(chatId, '❌ Sesi dibatalkan. Ketik *menu* atau *start* untuk membuka menu utama.');
    return;
  }

  // 2. Ambil sesi pengguna
  const session = getSession(chatId);

  // Jika tidak ada sesi aktif, periksa trigger menu
  if (!session || session.state === 'IDLE') {
    if (lower === 'start' || lower === 'menu' || lower === 'halo' || lower === 'hai' || lower === 'hi') {
      setSession(chatId, 'MAIN_MENU');
      await openwaService.sendText(chatId, getMainTextMenu());
      return;
    }

    // Jika user langsung ketik angka tanpa 'start'
    if (['1', '2', '3', '4'].includes(text)) {
      return handleMainMenuChoice(chatId, text);
    }

    // Jika pesan tidak dikenali
    await openwaService.sendText(
      chatId,
      'Halo! Ketik *menu* atau *start* untuk melihat daftar menu rekap PO, atau kirim foto/PDF dokumen PO untuk scan otomatis.'
    );
    return;
  }

  // 3. Tangani berdasarkan State Mesin Percakapan
  switch (session.state) {
    case 'MAIN_MENU':
      return handleMainMenuChoice(chatId, text);

    case 'SEARCH_MENU':
      return handleSearchMenuChoice(chatId, text);

    case 'WAIT_SEARCH_SUPPLIER':
      return handleSearchSupplierQuery(chatId, text);

    case 'WAIT_SEARCH_MATERIAL':
      return handleSearchMaterialQuery(chatId, text);

    case 'WAIT_SEARCH_PO':
      return handleSearchPOQuery(chatId, text);

    case 'INPUT_PO_HEADER':
      return handleInputPOHeader(chatId, text, session);

    case 'INPUT_PO_ITEMS':
      return handleInputPOItems(chatId, text, session);

    case 'CONFIRM_OCR_PO':
      return handleConfirmOcrPO(chatId, text, session);

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
      await openwaService.sendText(chatId, getMainTextMenu());
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
        `📝 *INPUT PO BARU (Langkah 1/2: Info Header)*
Silakan masukkan *Nomor PO* dan *Nama Supplier* (pisahkan dengan koma).

💡 _Contoh:_
\`PO-2026-001, PT Buana Logam Perkasa\`

_(Ketik 'batal' untuk membatalkan)_`
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
        `✏️ *UPDATE STATUS PO*
Silakan ketik *Nomor PO* yang ingin diperbarui:
Contoh: \`PO-2026-001\``
      );
      break;

    case '4':
      setSession(chatId, 'CANCEL_PO_WAIT_NO');
      await openwaService.sendText(
        chatId,
        `❌ *BATALKAN / HAPUS PO*
Silakan ketik *Nomor PO* dan *Alasan Pembatalan* (pisahkan dengan koma):
Contoh: \`PO-2026-001, Salah spesifikasi material\``
      );
      break;

    default:
      await openwaService.sendText(chatId, 'Pilihan tidak valid. Silakan ketik angka *1*, *2*, *3*, atau *4*.\nKetik *batal* untuk keluar.');
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
        '🏢 *Cari Rekomendasi Supplier*\nKetik nama barang atau kode material yang ingin dicari:\nContoh: `Nipples` atau `RM00355`'
      );
      break;

    case '2':
      setSession(chatId, 'WAIT_SEARCH_MATERIAL');
      await openwaService.sendText(
        chatId,
        '📦 *Cari Master Material*\nKetik kode atau nama spesifikasi barang:\nContoh: `Flange` atau `RM00088`'
      );
      break;

    case '3':
      setSession(chatId, 'WAIT_SEARCH_PO');
      await openwaService.sendText(
        chatId,
        '📋 *Cek Status PO*\nKetik Nomor PO yang ingin dicek:\nContoh: `PO-2026-001`'
      );
      break;

    case '0':
      setSession(chatId, 'MAIN_MENU');
      await openwaService.sendText(chatId, getMainTextMenu());
      break;

    default:
      await openwaService.sendText(chatId, 'Pilihan salah. Ketik angka 1, 2, 3 atau 0 untuk kembali.');
      break;
  }
}

async function handleSearchSupplierQuery(chatId, query) {
  const results = cacheService.searchSupplierRecommendations(query, 5);
  clearSession(chatId);

  if (!results || results.length === 0) {
    await openwaService.sendText(chatId, `⚠️ Tidak ditemukan riwayat supplier untuk kata kunci: "${query}".`);
    return;
  }

  let text = `🏢 *HASIL REKOMENDASI SUPPLIER (${results.length}):*\n`;
  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    text += `\n${i + 1}. *[${item.kode}]* ${item.nama}\n`;
    text += `   • *Supplier Utama:* ${item.supplierUtama || '-'}\n`;
    text += `   • *Frekuensi PO:* ${item.frekuensi} kali (${item.totalQty} unit diorder)\n`;
  }
  text += `\n💡 _Ketik *menu* untuk opsi lainnya._`;
  await openwaService.sendText(chatId, text);
}

async function handleSearchMaterialQuery(chatId, query) {
  const results = cacheService.searchMaterials(query, 5);
  clearSession(chatId);

  if (!results || results.length === 0) {
    await openwaService.sendText(chatId, `⚠️ Material dengan kata kunci "${query}" tidak ditemukan di database master.`);
    return;
  }

  let text = `📦 *HASIL PENCARIAN MATERIAL (${results.length}):*\n`;
  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    text += `\n${i + 1}. *${item.kode}* - ${item.nama}`;
  }
  text += `\n\n💡 _Ketik *menu* untuk opsi lainnya._`;
  await openwaService.sendText(chatId, text);
}

async function handleSearchPOQuery(chatId, noPo) {
  clearSession(chatId);
  try {
    const po = await sheetsService.getPOByNumber(noPo);
    if (!po) {
      await openwaService.sendText(chatId, `⚠️ Dokumen PO *${noPo}* tidak ditemukan di sheet 'PO 2026'.`);
      return;
    }

    let text = `📋 *DETAIL PO: ${po.noPo}*\n`;
    text += `• *Status:* ${po.status}\n`;
    text += `• *Tanggal:* ${po.date}\n`;
    text += `• *Supplier:* ${po.supplier}\n`;
    if (po.grpo) text += `• *No GRPO:* ${po.grpo} (Tgl: ${po.lastGrpoDate || '-'})\n`;
    if (po.tglBayar) text += `• *Status Bayar:* Lunas tgl ${po.tglBayar}\n`;
    if (po.noInvoice) text += `• *No Invoice:* ${po.noInvoice}\n`;

    text += `\n📦 *Rincian Barang (${po.items.length} item):*\n`;
    for (let i = 0; i < po.items.length; i++) {
      const it = po.items[i];
      const subtotal = it.qty * it.priceUnit * (1 - it.discount) + it.ppn;
      text += `${i + 1}. [${it.kode}] ${it.nama}\n   Qty: ${it.qty} x Rp ${it.priceUnit.toLocaleString('id-ID')} = Rp ${subtotal.toLocaleString('id-ID')}\n`;
    }
    text += `───────────────────────\n`;
    text += `*TOTAL PO: Rp ${po.grandTotal.toLocaleString('id-ID')}*`;

    await openwaService.sendText(chatId, text);
  } catch (err) {
    await openwaService.sendText(chatId, `❌ Gagal mengambil data PO: ${err.message}`);
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
      `⚠️ Format salah. Mohon masukkan *Nomor PO* dan *Supplier* dipisahkan koma.\nContoh: \`PO-2026-001, PT Buana Logam Perkasa\``
    );
    return;
  }

  const noPo = parts[0].toUpperCase();
  const supplier = parts[1];

  // Inisialisasi draft PO
  const draft = {
    noPo,
    supplier,
    date: sheetsService.getCurrentFormattedDate(),
    items: [],
  };

  setSession(chatId, 'INPUT_PO_ITEMS', draft);

  await openwaService.sendText(
    chatId,
    `✅ Header tersimpan:
• *No PO:* ${noPo}
• *Supplier:* ${supplier}

📦 *Langkah 2/2: Masukkan Item Barang*
Ketik rincian barang dengan format:
\`[Kode] [Qty] [HargaSatuan]\`

💡 _Contoh (bisa beberapa baris sekaligus):_
RM00355 20 25000
RM00356 10 40000

_(Ketik 'simpan' jika sudah selesai, atau 'batal')_`
  );
}

async function handleInputPOItems(chatId, text, session) {
  const draft = session.data;
  const lower = text.toLowerCase();

  // Jika user konfirmasi simpan
  if (lower === 'simpan' || lower === 'ya' || lower === 'save') {
    if (draft.items.length === 0) {
      await openwaService.sendText(chatId, '⚠️ Keranjang barang masih kosong! Masukkan minimal 1 barang terlebih dahulu.');
      return;
    }

    try {
      await openwaService.sendText(chatId, '⏳ Sedang menyimpan data ke Google Sheets...');
      const result = await sheetsService.appendPOTransaction(draft);
      clearSession(chatId);

      await openwaService.sendText(
        chatId,
        `✅ *BERHASIL DISIMPAN!*
PO *${result.noPo}* berisi *${result.itemsInserted} item* telah berhasil dicatat ke Google Sheets 'PO 2026'.
Total Transaksi: *Rp ${result.grandTotal.toLocaleString('id-ID')}*`
      );
    } catch (err) {
      await openwaService.sendText(chatId, `❌ Gagal menyimpan ke Google Sheets: ${err.message}`);
    }
    return;
  }

  // Parse baris demi baris item
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let addedCount = 0;
  const warnings = [];

  for (const line of lines) {
    const tokens = line.split(/[\s|]+/).filter(Boolean);
    if (tokens.length < 3) {
      warnings.push(`Baris "${line}" dilewati (format harus: Kode Qty Harga)`);
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

  // Hitung total saat ini
  let totalBelanja = 0;
  let summaryText = `🛒 *KERANJANG PO: ${draft.noPo}*\n`;
  for (let i = 0; i < draft.items.length; i++) {
    const it = draft.items[i];
    const sub = it.qty * it.harga;
    totalBelanja += sub;
    summaryText += `${i + 1}. [${it.kode}] ${it.nama}\n   ${it.qty} x Rp ${it.harga.toLocaleString('id-ID')} = Rp ${sub.toLocaleString('id-ID')}\n`;
  }
  summaryText += `───────────────────────\n`;
  summaryText += `*TOTAL: Rp ${totalBelanja.toLocaleString('id-ID')}*\n\n`;

  if (warnings.length > 0) {
    summaryText += `⚠️ _Catatan:_\n${warnings.join('\n')}\n\n`;
  }

  summaryText += `Ketik:
• Kirim baris lagi untuk tambah item
• *SIMPAN* untuk eksekusi ke Google Sheet
• *BATAL* untuk membatalkan`;

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
      await openwaService.sendText(chatId, '⏳ Sedang menyimpan hasil scan ke Google Sheets...');
      const result = await sheetsService.appendPOTransaction(draft);
      clearSession(chatId);

      await openwaService.sendText(
        chatId,
        `✅ *BERHASIL TERCATAT!*
Data dari pindaian dokumen PO *${result.noPo}* (${result.itemsInserted} item) sukses disimpan ke sheet 'PO 2026'.
Total: *Rp ${result.grandTotal.toLocaleString('id-ID')}*`
      );
    } catch (err) {
      await openwaService.sendText(chatId, `❌ Gagal menyimpan ke Google Sheets: ${err.message}`);
    }
  } else {
    clearSession(chatId);
    await openwaService.sendText(chatId, '❌ Draf hasil scan dibatalkan.');
  }
}

// -------------------------------------------------------------
// HANDLER UPDATE PO
// -------------------------------------------------------------
async function handleUpdatePOWaitNo(chatId, noPo) {
  try {
    const po = await sheetsService.getPOByNumber(noPo);
    if (!po) {
      await openwaService.sendText(chatId, `⚠️ Dokumen PO *${noPo}* tidak ditemukan di sheet 'PO 2026'.\nKetik 'batal' untuk keluar.`);
      return;
    }

    setSession(chatId, 'UPDATE_PO_SELECT_ACTION', { noPo: po.noPo });
    await openwaService.sendText(
      chatId,
      `✏️ *PILIH DATA YANG INGIN DIUPDATE (${po.noPo}):*

1️⃣ *1* - Input No. GRPO & Selesai Penerimaan Gudang
2️⃣ *2* - Input Tanggal Bayar (Finance)
3️⃣ *3* - Input No. Invoice Vendor
4️⃣ *4* - Ubah Status Transaksi (Close/Pending)

0️⃣ *0* - Batal
💡 _Ketik angka pilihan (1-4):_`
    );
  } catch (err) {
    await openwaService.sendText(chatId, `❌ Error: ${err.message}`);
  }
}

async function handleUpdatePOSelectAction(chatId, choice, session) {
  const { noPo } = session.data;
  switch (choice.trim()) {
    case '1':
      setSession(chatId, 'UPDATE_PO_WAIT_VALUE', { noPo, type: 'grpo' });
      await openwaService.sendText(chatId, `📦 Masukkan *Nomor GRPO* untuk PO *${noPo}*:\nContoh: \`GRPO-2026-088\``);
      break;

    case '2':
      setSession(chatId, 'UPDATE_PO_WAIT_VALUE', { noPo, type: 'bayar' });
      await openwaService.sendText(chatId, `💰 Masukkan *Tanggal Bayar* untuk PO *${noPo}* (DD/MM/YYYY):\nContoh: \`15/10/2026\``);
      break;

    case '3':
      setSession(chatId, 'UPDATE_PO_WAIT_VALUE', { noPo, type: 'invoice' });
      await openwaService.sendText(chatId, `📄 Masukkan *Nomor Invoice* untuk PO *${noPo}*:\nContoh: \`INV-BLP-2026-09\``);
      break;

    case '4':
      setSession(chatId, 'UPDATE_PO_WAIT_VALUE', { noPo, type: 'status' });
      await openwaService.sendText(chatId, `🔄 Masukkan status baru untuk PO *${noPo}* (\`Close\`, \`Pending\`, atau \`Open\`):`);
      break;

    case '0':
      clearSession(chatId);
      await openwaService.sendText(chatId, 'Update dibatalkan.');
      break;

    default:
      await openwaService.sendText(chatId, 'Pilihan tidak valid. Ketik 1, 2, 3, 4, atau 0.');
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
    await openwaService.sendText(chatId, '⏳ Sedang mengupdate baris di Google Sheets...');
    const res = await sheetsService.updatePOField(noPo, updatePayload);
    await openwaService.sendText(chatId, `✅ *Sukses!* PO *${noPo}* (${res.rowsUpdated} baris) berhasil diperbarui.`);
  } catch (err) {
    await openwaService.sendText(chatId, `❌ Gagal update PO: ${err.message}`);
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
    await openwaService.sendText(chatId, `⏳ Sedang memproses pembatalan PO ${noPo}...`);
    const res = await sheetsService.softDeletePO(noPo, reason);
    if (res.success) {
      await openwaService.sendText(
        chatId,
        `✅ *PO ${noPo} Berhasil Dibatalkan!*
Status transaksi telah diubah menjadi \`Cancelled\` di sheet 'PO 2026' (${res.rowsUpdated} baris).`
      );
    } else {
      await openwaService.sendText(chatId, `⚠️ ${res.message}`);
    }
  } catch (err) {
    await openwaService.sendText(chatId, `❌ Gagal membatalkan PO: ${err.message}`);
  }
}

module.exports = {
  handleConversationMessage,
  setSession,
  getSession,
  clearSession,
};
