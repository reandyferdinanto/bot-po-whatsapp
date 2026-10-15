const cacheService = require('../services/cacheService');
const sheetsService = require('../services/sheetsService');
const openwaService = require('../services/openwaService');
const conversationManager = require('./conversationManager');
const { getSheetsClient, hasValidToken } = require('../config/googleAuth');

/**
 * Memproses perintah cepat bersimbol ! atau /
 */
async function handleDirectCommand(chatId, text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('!') && !trimmed.startsWith('/')) {
    return false; // Bukan command langsung
  }

  const parts = trimmed.substring(1).trim().split(/\s+/);
  const command = (parts[0] || '').toLowerCase();
  const args = parts.slice(1).join(' ').trim();

  switch (command) {
    case 'menu':
    case 'start':
    case 'help':
      conversationManager.setSession(chatId, 'MAIN_MENU');
      await openwaService.sendText(
        chatId,
        `🤖 *SISTEM REKAP PO 2026*
Silakan pilih menu di bawah:

1️⃣ *1* - Input PO Baru (Multi-Item)
2️⃣ *2* - Cari Data (Supplier / Material / PO)
3️⃣ *3* - Update Status PO (GRPO / Pembayaran)
4️⃣ *4* - Hapus / Batalkan PO

💡 _Ketik angka pilihan (1-4) atau kirim foto/PDF dokumen PO._`
      );
      return true;

    case 'cari':
      if (!args) {
        await openwaService.sendText(chatId, '⚠️ Format: `!cari <nama_barang / kode_material>`\nContoh: `!cari RM00355` atau `!cari Hex Nipples`');
        return true;
      }
      const supRes = await cacheService.searchSupplierRecommendations(args, 10);
      const supItems = Array.isArray(supRes) ? supRes : (supRes.items || []);
      const supTotal = Array.isArray(supRes) ? supRes.length : (supRes.total || supItems.length);

      if (!supItems || supItems.length === 0) {
        await openwaService.sendText(chatId, `⚠️ Tidak ditemukan rekomendasi untuk "${args}".`);
        return true;
      }
      let replyCari = `🏢 *HASIL PENCARIAN & REKOMENDASI (${supTotal} Ditemukan):*\n`;
      for (let i = 0; i < supItems.length; i++) {
        const item = supItems[i];
        replyCari += `\n${i + 1}. *[${item.kode}]* ${item.nama}\n`;
        replyCari += `   • *Supplier Utama:* ${item.supplierUtama || '-'}\n`;
        replyCari += `   • *Riwayat PO:* ${item.frekuensi} kali (${item.totalQty} pcs)\n`;
        if (item.hargaMin && item.hargaMin > 0) {
          if (item.hargaMin === item.hargaMax) {
            replyCari += `   💰 *Histori Harga:* Rp ${item.hargaMin.toLocaleString('id-ID')}\n`;
          } else {
            replyCari += `   💰 *Histori Harga:* Rp ${item.hargaMin.toLocaleString('id-ID')} _(Termurah)_ - Rp ${item.hargaMax.toLocaleString('id-ID')} _(Termahal)_\n`;
          }
        }
      }
      if (supTotal > supItems.length) {
        replyCari += `\n_... dan ${supTotal - supItems.length} hasil lainnya._`;
      }
      await openwaService.sendText(chatId, replyCari);
      return true;

    case 'supplier':
    case 'vendor':
      if (!args) {
        await openwaService.sendText(chatId, '⚠️ Format: `!supplier <nama_vendor>`\nContoh: `!supplier Zen Teknik` atau `!supplier Rivindi`');
        return true;
      }
      await openwaService.sendText(chatId, `🔍 Sedang mencari riwayat pembelian dari vendor "${args}"...`);
      const vResult = await cacheService.getSupplierOrderHistory(args, 15);
      if (!vResult || !vResult.items || vResult.items.length === 0) {
        await openwaService.sendText(chatId, `⚠️ Tidak ditemukan riwayat pembelian untuk vendor "${args}".`);
        return true;
      }

      let vText = `🏢 *RIWAYAT PEMBELIAN VENDOR: ${vResult.supplier}*\n`;
      vText += `Ditemukan *${vResult.totalItems} jenis barang* yang pernah dipesan:\n`;

      for (let i = 0; i < vResult.items.length; i++) {
        const item = vResult.items[i];
        vText += `\n${i + 1}. *[${item.kode}]* ${item.nama}\n`;
        if (item.hargaMin === item.hargaMax) {
          vText += `   💰 *Harga:* Rp ${item.hargaMin.toLocaleString('id-ID')}\n`;
        } else {
          vText += `   💰 *Harga:* Rp ${item.hargaMin.toLocaleString('id-ID')} _(Termurah)_ - Rp ${item.hargaMax.toLocaleString('id-ID')} _(Termahal)_\n`;
        }
        if (item.hargaTerbaru) {
          vText += `   • *Terbaru:* Rp ${item.hargaTerbaru.toLocaleString('id-ID')}${item.tglTerbaru ? ' (' + item.tglTerbaru + ')' : ''}\n`;
        }
        if (item.poList && item.poList.length > 0) {
          const poDisplay = item.poList.slice(0, 5).join(', ') + (item.poList.length > 5 ? ` (+${item.poList.length - 5} PO lainnya)` : '');
          vText += `   📋 *No. PO:* ${poDisplay} _(${item.totalOrders}x order)_\n`;
        }
      }

      if (vResult.totalItems > vResult.items.length) {
        vText += `\n_... dan ${vResult.totalItems - vResult.items.length} barang lainnya._\n`;
      }

      await openwaService.sendText(chatId, vText);
      return true;

    case 'cekpo':
      if (!args) {
        await openwaService.sendText(chatId, '⚠️ Format: `!cekpo <nomor_po>`\nContoh: `!cekpo PO-2026-001`');
        return true;
      }
      const po = await sheetsService.getPOByNumber(args);
      if (!po) {
        await openwaService.sendText(chatId, `⚠️ PO *${args}* tidak ditemukan di sheet 'PO 2026'.`);
        return true;
      }
      let replyPo = `📋 *DETAIL PO: ${po.noPo}*\n`;
      replyPo += `• Status: *${po.status}*\n`;
      replyPo += `• Tanggal: *${po.date}*\n`;
      replyPo += `• Supplier: *${po.supplier}*\n`;
      if (po.grpo) replyPo += `• No GRPO: ${po.grpo} (${po.lastGrpoDate || '-'})\n`;
      if (po.tglBayar) replyPo += `• Status Bayar: Lunas (${po.tglBayar})\n`;
      replyPo += `\n📦 *Item (${po.items.length}):*\n`;
      for (let i = 0; i < po.items.length; i++) {
        const it = po.items[i];
        replyPo += `${i + 1}. [${it.kode}] ${it.nama} (Qty: ${it.qty} x ${it.priceUnit})\n`;
      }
      replyPo += `───────────────────────\n`;
      replyPo += `*TOTAL: Rp ${po.grandTotal.toLocaleString('id-ID')}*`;
      await openwaService.sendText(chatId, replyPo);
      return true;

    case 'batalpo':
      if (!args) {
        await openwaService.sendText(chatId, '⚠️ Format: `!batalpo <nomor_po> [alasan]`\nContoh: `!batalpo PO-2026-001 Salah order`');
        return true;
      }
      const batalParts = args.split(/\s+/);
      const targetPo = batalParts[0];
      const alasan = batalParts.slice(1).join(' ') || 'Dibatalkan via WhatsApp';
      const batalRes = await sheetsService.softDeletePO(targetPo, alasan);
      if (batalRes.success) {
        await openwaService.sendText(chatId, `✅ PO *${targetPo}* berhasil diubah statusnya menjadi \`Cancelled\`.`);
      } else {
        await openwaService.sendText(chatId, `⚠️ ${batalRes.message}`);
      }
      return true;

    case 'sync':
      if (!hasValidToken()) {
        await openwaService.sendText(chatId, '❌ Token Google Sheets belum diotorisasi. Jalankan `node auth-google.js` di server.');
        return true;
      }
      await openwaService.sendText(chatId, '⏳ Sedang menyinkronkan data master dari Google Sheets...');
      try {
        const syncRes = await cacheService.syncMasterData(getSheetsClient());
        await openwaService.sendText(
          chatId,
          `✅ *Sinkronisasi Sukses!*
• ${syncRes.totalMaterials} Material
• ${syncRes.totalSuppliers} Supplier Master`
        );
      } catch (err) {
        await openwaService.sendText(chatId, `❌ Gagal sinkronisasi: ${err.message}`);
      }
      return true;

    default:
      return false;
  }
}

module.exports = {
  handleDirectCommand,
};
