const cacheService = require('../services/cacheService');
const sheetsService = require('../services/sheetsService');
const openwaService = require('../services/openwaService');
const driveService = require('../services/driveService');
const conversationManager = require('./conversationManager');
const { getSheetsClient, hasValidToken } = require('../config/googleAuth');

/**
 * Memproses perintah cepat bersimbol / atau ! serta keyword penting (kurs, usd, help, menu, start)
 */
async function handleDirectCommand(chatId, text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return false;

  const isPrefixed = trimmed.startsWith('!') || trimmed.startsWith('/');
  const lower = trimmed.toLowerCase();

  // Kata kunci mandiri yang dapat langsung dieksekusi tanpa awalan simbol
  const standaloneKeywords = ['kurs', 'usd', 'kursbi', 'help', 'bantuan', 'menu', 'start', 'kasbon', 'budget', 'lpj'];
  const isStandalone = standaloneKeywords.includes(lower);

  if (!isPrefixed && !isStandalone) {
    return false; // Bukan command langsung
  }

  const raw = isPrefixed ? trimmed.substring(1).trim() : trimmed;
  const parts = raw.split(/\s+/);
  const command = (parts[0] || '').toLowerCase();
  const args = parts.slice(1).join(' ').trim();

  switch (command) {
    case 'help':
    case 'bantuan':
      await openwaService.sendText(
        chatId,
        `*DAFTAR PERINTAH BOT PROCUREMENT & FINANCE*
━━━━━━━━━━━━━━━━━━━━━━━━
Anda dapat mengirimkan perintah berikut kapan saja tanpa perlu \`start\` terlebih dahulu:

\`INFORMASI & KURS\`
▸ */kurs* atau */usd*
  _Cek Kurs Tengah Bank Indonesia (USD) terkini_
▸ */help*
  _Menampilkan panduan semua perintah bot_
▸ */menu*
  _Membuka navigasi menu interaktif_

\`FINANCE & KASBON\`
▸ */kasbon* atau */budget*
  _Dapatkan link formulir pengajuan kasbon/budget operasional_
▸ */lpj*
  _Link form submit LPJ & upload foto nota belanja fisik_
▸ */cekbudget <no_budget>*
  _Cek status persetujuan, sisa kasbon & closing finance_

\`PENCARIAN DATA MASTER\`
▸ */cari <nama_barang / kode>*
  _Contoh: /cari Hex Nipples atau /cari RM00355_
  _Rekomendasi vendor utama & histori harga_
▸ */supplier <nama_vendor>*
  _Contoh: /supplier Zen Teknik_
  _Daftar seluruh item yang pernah diorder ke vendor_

\`DOKUMEN PURCHASE ORDER\`
▸ */cekpo <nomor_po>*
  _Contoh: /cekpo PO-2026-001_
  _Detail item, GRPO, status bayar & total PO_
▸ */lihatpo <nomor_po>*
  _Contoh: /lihatpo PO-2026-001_
  _Lihat & kirimkan foto PO / surat jalan asli dari Google Drive_
▸ */batalpo <nomor_po> [alasan]*
  _Contoh: /batalpo PO-2026-001 Salah order_
  _Membatalkan PO secara sistem_

\`SINKRONISASI\`
▸ */sync*
  _Sinkronkan data master dari Google Sheets_

\`SCAN DOKUMEN OTOMATIS\`
▸ _Kirim foto atau file PDF dokumen PO / Surat Jalan (GRPO) untuk input & update otomatis via AI OCR._
━━━━━━━━━━━━━━━━━━━━━━━━`
      );
      return true;

    case 'kasbon':
    case 'budget': {
      const senderPhone = chatId ? chatId.split('@')[0].replace(/[^0-9]/g, '') : '';
      const formUrl = `https://bot-whatsapp.ebite.biz.id/form-budget?wa=${senderPhone}`;
      await openwaService.sendText(
        chatId,
        `*FORMULIR PENGAJUAN BUDGET / KASBON*
━━━━━━━━━━━━━━━━━━━━━━━━
Permintaan kasbon/budget operasional untuk divisi Purchasing, Gudang, Maintenance, dan lainnya kini diajukan secara digital:

▸ *Link Form Pengajuan:*
  ${formUrl}

▸ *Alur Pengajuan:*
  1. Buka link formulir di atas.
  2. Isi nama, divisi, keperluan/uraian & nominal dana yang diminta.
  3. Finance akan meninjau dan mencairkan uang kasbon.
  4. Belanjakan dana, kumpulkan nota fisik & buat laporan LPJ.

_Ketik */lpj* untuk upload bukti belanja, atau */cekbudget <no_budget>* untuk cek status._
━━━━━━━━━━━━━━━━━━━━━━━━`
      );
      return true;
    }

    case 'lpj':
    case 'settlement': {
      const senderPhone = chatId ? chatId.split('@')[0].replace(/[^0-9]/g, '') : '';
      const formUrl = `https://bot-whatsapp.ebite.biz.id/form-lpj?wa=${senderPhone}`;
      await openwaService.sendText(
        chatId,
        `*LAPORAN PERTANGGUNGJAWABAN (LPJ) KASBON*
━━━━━━━━━━━━━━━━━━━━━━━━
Silakan lengkapi laporan realisasi belanja dan unggah foto bukti nota fisik:

▸ *Link Form Submit LPJ:*
  ${formUrl}

▸ *Petunjuk:*
  1. Masukkan *Nomor Budget* yang Anda terima (contoh: \`BGT-2026-0001\`).
  2. Masukkan total realisasi belanja aktual sesuai nota.
  3. Foto seluruh nota/bon belanja dengan jelas dan unggah.
  4. Serahkan bukti fisik nota & sisa uang kembalian tunai ke meja Finance.
━━━━━━━━━━━━━━━━━━━━━━━━`
      );
      return true;
    }

    case 'cekbudget':
    case 'cekasbon': {
      if (!args) {
        await openwaService.sendText(chatId, '⚠️ Mohon sertakan Nomor Budget.\nContoh: */cekbudget BGT-2026-0001*');
        return true;
      }
      try {
        const financeBudgetService = require('../services/financeBudgetService');
        const b = await financeBudgetService.getBudgetByNo(args);
        if (!b) {
          await openwaService.sendText(chatId, `❌ Nomor budget *${args}* tidak ditemukan di sistem.`);
          return true;
        }

        const formatRupiah = (val) => 'Rp ' + Number(val || 0).toLocaleString('id-ID');
        const statusMap = {
          PENDING: '⏳ Menunggu Persetujuan Finance',
          APPROVED: '✅ Disetujui (Dana Siap / Dicairkan)',
          LPJ_SUBMITTED: '📝 LPJ & Nota Telah Masuk (Menunggu Closing)',
          CLOSED: '🎉 CLOSED (Selesai & Lunas)',
          REJECTED: '❌ Ditolak',
        };
        const displayStatus = statusMap[b.status] || b.status;

        await openwaService.sendText(
          chatId,
          `*STATUS PENGAJUAN KASBON / BUDGET*
━━━━━━━━━━━━━━━━━━━━━━━━
▸ *No. Budget :* \`${b.no_budget || b.noBudget}\`
▸ *Pemohon    :* ${b.nama} (${b.divisi})
▸ *Tanggal    :* ${b.tgl_kasbon || b.tglKasbon}
▸ *Status     :* *${displayStatus}*

▸ *Uraian :*
  _${b.uraian}_

▸ *Rincian Dana :*
  • Pengajuan Kasbon : ${formatRupiah(b.jumlah)}
  • Realisasi Belanja: ${formatRupiah(b.realisasi_belanja || b.realisasiBelanja)}
  • Sisa Kembali     : ${formatRupiah(b.sisa_kembali || b.sisaKembali)}

${b.tgl_selesai ? `▸ *Tgl Selesai  :* ${b.tgl_selesai}\n` : ''}${b.catatan_finance ? `▸ *Catatan Finance :* _${b.catatan_finance}_\n` : ''}━━━━━━━━━━━━━━━━━━━━━━━━`
        );
      } catch (err) {
        await openwaService.sendText(chatId, `❌ Gagal mengambil status budget: ${err.message}`);
      }
      return true;
    }

    case 'menu':
    case 'start':
      conversationManager.setSession(chatId, 'MAIN_MENU');
      await openwaService.sendText(
        chatId,
        `*PROCUREMENT ASSISTANT — 2026*
━━━━━━━━━━━━━━━━━━━━━━━━
Silakan pilih menu layanan:

*[1]*  Input PO Baru _(Multi-Item & AI Scan)_
*[2]*  Pencarian Data _(Vendor, Material & PO)_
*[3]*  Update Status _(GRPO & Pembayaran)_
*[4]*  Batalkan PO

▸ _Balas angka [1-4] atau kirim dokumen Foto/PDF langsung._
▸ _Ketik */help* untuk melihat seluruh perintah cepat._
━━━━━━━━━━━━━━━━━━━━━━━━`
      );
      return true;

    case 'kurs':
    case 'kursbi':
    case 'usd':
      try {
        const kursService = require('../services/kursService');
        const k = await kursService.getKursUsd();
        const trendLabel = k.trend === 'up' ? 'Menguat (▲)' : (k.trend === 'down' ? 'Melemah (▼)' : 'Stabil (▬)');
        const selisihDisplay = k.selisih && k.selisih !== '0,00' ? ` (${k.trend === 'up' ? '+' : '-'}${k.selisih})` : '';

        let replyKurs = `*KURS TENGAH BANK INDONESIA (USD)*
━━━━━━━━━━━━━━━━━━━━━━━━
📅 ${k.tanggal}

\`RATE RINGKASAN\`
▸ Kurs Tengah : *Rp ${k.kursTengah}* ${selisihDisplay}
▸ Kurs Jual   : Rp ${k.kursJual}
▸ Kurs Beli   : Rp ${k.kursBeli}

\`STATUS PASAR\`
▸ Tren Pasar  : *${trendLabel}*
▸ Sumber Data : Bank Indonesia via Ortax
━━━━━━━━━━━━━━━━━━━━━━━━`;
        await openwaService.sendText(chatId, replyKurs);
      } catch (kErr) {
        await openwaService.sendText(chatId, `✗ Gagal mengambil kurs USD: ${kErr.message}`);
      }
      return true;

    case 'cari':
      if (!args) {
        await openwaService.sendText(
          chatId,
          `*PENCARIAN REKOMENDASI VENDOR*
━━━━━━━━━━━━━━━━━━━━━━━━
Format : \`/cari <nama_barang / kode>\`
Contoh : \`/cari RM00355\` atau \`/cari Hex Nipples\`
━━━━━━━━━━━━━━━━━━━━━━━━`
        );
        return true;
      }
      const supRes = await cacheService.searchSupplierRecommendations(args, 10);
      const supItems = Array.isArray(supRes) ? supRes : (supRes.items || []);
      const supTotal = Array.isArray(supRes) ? supRes.length : (supRes.total || supItems.length);

      if (!supItems || supItems.length === 0) {
        await openwaService.sendText(chatId, `⚠️ _Tidak ditemukan rekomendasi vendor untuk kata kunci:_ *"${args}"*`);
        return true;
      }
      let replyCari = `*HASIL REKOMENDASI VENDOR*
━━━━━━━━━━━━━━━━━━━━━━━━
Kata Kunci : *"${args}"* (${supTotal} ditemukan)

`;
      for (let i = 0; i < supItems.length; i++) {
        const item = supItems[i];
        replyCari += `*[${item.kode}]* ${item.nama}\n`;
        replyCari += `  ▸ Vendor Utama : *${item.supplierUtama || '-'}*\n`;
        replyCari += `  ▸ Histori PO   : ${item.frekuensi}x pemesanan (${item.totalQty} pcs)\n`;
        if (item.hargaMin && item.hargaMin > 0) {
          if (item.hargaMin === item.hargaMax) {
            replyCari += `  ▸ Harga PO     : Rp ${item.hargaMin.toLocaleString('id-ID')}\n`;
          } else {
            replyCari += `  ▸ Rentang Harga: Rp ${item.hargaMin.toLocaleString('id-ID')} — Rp ${item.hargaMax.toLocaleString('id-ID')}\n`;
          }
        }
        replyCari += `\n`;
      }
      if (supTotal > supItems.length) {
        replyCari += `▸ _...dan ${supTotal - supItems.length} hasil lainnya._\n`;
      }
      replyCari += `━━━━━━━━━━━━━━━━━━━━━━━━`;
      await openwaService.sendText(chatId, replyCari.trim());
      return true;

    case 'supplier':
    case 'vendor':
      if (!args) {
        await openwaService.sendText(
          chatId,
          `*RIWAYAT PEMBELIAN VENDOR*
━━━━━━━━━━━━━━━━━━━━━━━━
Format : \`/supplier <nama_vendor>\`
Contoh : \`/supplier Zen Teknik\`
━━━━━━━━━━━━━━━━━━━━━━━━`
        );
        return true;
      }
      await openwaService.sendText(chatId, `🔍 _Sedang mencari riwayat pembelian vendor:_ *"${args}"*...`);
      const vResult = await cacheService.getSupplierOrderHistory(args, 15);
      if (!vResult || !vResult.items || vResult.items.length === 0) {
        await openwaService.sendText(chatId, `⚠️ _Tidak ditemukan riwayat pembelian untuk vendor:_ *"${args}"*`);
        return true;
      }

      let vText = `*RIWAYAT VENDOR: ${vResult.supplier}*
━━━━━━━━━━━━━━━━━━━━━━━━
Total Barang Pernah Dipesan : *${vResult.totalItems} jenis*

`;
      for (let i = 0; i < vResult.items.length; i++) {
        const item = vResult.items[i];
        vText += `*${i + 1}. [${item.kode}]* ${item.nama}\n`;
        if (item.hargaMin === item.hargaMax) {
          vText += `   ▸ Harga    : Rp ${item.hargaMin.toLocaleString('id-ID')}\n`;
        } else {
          vText += `   ▸ Rentang  : Rp ${item.hargaMin.toLocaleString('id-ID')} — Rp ${item.hargaMax.toLocaleString('id-ID')}\n`;
        }
        if (item.hargaTerbaru) {
          vText += `   ▸ Terakhir : Rp ${item.hargaTerbaru.toLocaleString('id-ID')}${item.tglTerbaru ? ' (' + item.tglTerbaru + ')' : ''}\n`;
        }
        if (item.poList && item.poList.length > 0) {
          const poDisplay = item.poList.slice(0, 5).join(', ') + (item.poList.length > 5 ? ` (+${item.poList.length - 5} PO)` : '');
          vText += `   ▸ Terkait  : ${poDisplay} _(${item.totalOrders}x order)_\n`;
        }
        vText += `\n`;
      }

      if (vResult.totalItems > vResult.items.length) {
        vText += `▸ _...dan ${vResult.totalItems - vResult.items.length} barang lainnya._\n`;
      }
      vText += `━━━━━━━━━━━━━━━━━━━━━━━━`;
      await openwaService.sendText(chatId, vText.trim());
      return true;

    case 'cekpo':
      if (!args) {
        await openwaService.sendText(
          chatId,
          `*DETAIL PURCHASE ORDER*
━━━━━━━━━━━━━━━━━━━━━━━━
Format : \`/cekpo <nomor_po>\`
Contoh : \`/cekpo PO-2026-001\`
━━━━━━━━━━━━━━━━━━━━━━━━`
        );
        return true;
      }
      const po = await sheetsService.getPOByNumber(args);
      if (!po) {
        await openwaService.sendText(chatId, `⚠️ Dokumen PO *${args}* tidak ditemukan di sheet 'PO 2026'.`);
        return true;
      }
      let replyPo = `*DOKUMEN PURCHASE ORDER*
━━━━━━━━━━━━━━━━━━━━━━━━
Nomor PO  : \`${po.noPo}\`
Status    : *[${(po.status || 'OPEN').toUpperCase()}]*
Tanggal   : ${po.date}
Supplier  : *${po.supplier}*
`;
      if (po.grpo) replyPo += `No. GRPO  : \`${po.grpo}\` (${po.lastGrpoDate || '-'})\n`;
      if (po.tglBayar) replyPo += `Pembayaran: *LUNAS* (${po.tglBayar})\n`;
      if (po.noInvoice) replyPo += `No Invoice: \`${po.noInvoice}\`\n`;

      replyPo += `\n\`RINCIAN ITEM (${po.items.length})\`\n`;
      for (let i = 0; i < po.items.length; i++) {
        const it = po.items[i];
        const sub = it.qty * it.priceUnit;
        replyPo += `${i + 1}. *[${it.kode}]* ${it.nama}\n`;
        replyPo += `   └ ${it.qty} pcs × Rp ${it.priceUnit.toLocaleString('id-ID')} = Rp ${sub.toLocaleString('id-ID')}\n`;
      }
      replyPo += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      replyPo += `*TOTAL AKHIR : Rp ${po.grandTotal.toLocaleString('id-ID')}*\n`;

      // Cek apakah ada file dokumen fisik di Google Drive
      try {
        const poDocs = await driveService.getDocumentsForPo(po.noPo);
        if (poDocs && poDocs.length > 0) {
          replyPo += `📎 Arsip Drive: *${poDocs.length} file tersedia*\n`;
          replyPo += `▸ Ketik */lihatpo ${po.noPo}* untuk melihat gambar/PDF asli\n`;
        }
      } catch (docErr) {
        // Abaikan error pengecekan dokumen agar tidak mengganggu reply utama
      }

      replyPo += `━━━━━━━━━━━━━━━━━━━━━━━━`;
      await openwaService.sendText(chatId, replyPo);
      return true;

    case 'lihatpo':
    case 'dokumen':
    case 'filepo':
    case 'arsip':
      if (!args) {
        let helpMsg = `*LIHAT ARSIP DOKUMEN PO / GRPO*
━━━━━━━━━━━━━━━━━━━━━━━━
Format : \`/lihatpo <nomor_po> [tipe]\`
Contoh : \`/lihatpo PO-2026-001\`
Opsi Tipe : \`PO\`, \`GRPO\`, \`BUKTI_BAYAR\` (opsional)\n`;

        try {
          const recents = await driveService.getRecentArchivedPOs(5);
          if (recents && recents.length > 0) {
            helpMsg += `\n\`PO TERAKHIR DI GOOGLE DRIVE:\`\n`;
            for (let i = 0; i < recents.length; i++) {
              const r = recents[i];
              const types = (r.doc_types || []).join(', ');
              helpMsg += `${i + 1}. *${r.no_po}* (${r.total_files} file: ${types})\n   └ Ketik: \`/lihatpo ${r.no_po}\`\n`;
            }
          }
        } catch (e) {
          // Abaikan error database
        }

        helpMsg += `━━━━━━━━━━━━━━━━━━━━━━━━`;
        await openwaService.sendText(chatId, helpMsg);
        return true;
      }

      const poArgs = args.trim().split(/\s+/);
      const searchPo = poArgs[0];
      const filterDocType = poArgs[1] || null;

      await openwaService.sendText(chatId, `🔍 _Sedang mencari arsip dokumen untuk PO ${searchPo} di Google Drive..._`);

      try {
        const docs = await driveService.getDocumentsForPo(searchPo, filterDocType);
        if (!docs || docs.length === 0) {
          await openwaService.sendText(
            chatId,
            `⚠️ Belum ada file arsip dokumen (Foto/PDF) untuk PO *${searchPo}* di Google Drive.\n` +
              `_Dokumen dapat diunggah melalui scan WhatsApp atau via Dashboard Web._`
          );
          return true;
        }

        await openwaService.sendText(
          chatId,
          `📄 Ditemukan *${docs.length} dokumen* untuk PO *${searchPo}*. Sedang mengunduh dan mengirimkan file...`
        );

        // Batasi maksimal 3 dokumen terbaru agar tidak membebani chat
        const targetDocs = docs.slice(0, 3);
        for (const doc of targetDocs) {
          try {
            const { buffer, mimeType, filename } = await driveService.downloadDocumentBuffer(doc.drive_file_id);
            const base64Str = buffer.toString('base64');
            const cleanMime = mimeType || doc.mime_type || 'image/jpeg';
            const cleanFilename = doc.file_name || filename || 'dokumen.jpg';
            const isImage =
              (cleanMime && cleanMime.startsWith('image/')) ||
              /\.(jpg|jpeg|png|webp)$/i.test(cleanFilename);
            const caption = `*DOKUMEN ${doc.tipe_dokumen}*\nPO : \`${doc.no_po}\`\nBerkas : ${cleanFilename}\n🔗 [Buka di Google Drive](${doc.drive_url})`;

            if (isImage) {
              await openwaService.sendImage(chatId, {
                base64: `data:${cleanMime};base64,${base64Str}`,
                mimetype: cleanMime,
                filename: cleanFilename,
                caption,
              });
            } else {
              await openwaService.sendDocument(chatId, {
                base64: `data:${cleanMime || 'application/pdf'};base64,${base64Str}`,
                filename: cleanFilename,
                mimetype: cleanMime || 'application/pdf',
                caption,
              });
            }
          } catch (fileErr) {
            console.error(`❌ Gagal kirim file ${doc.file_name} ke WA:`, fileErr.message);
            await openwaService.sendText(
              chatId,
              `⚠️ Gagal memuat file *${doc.file_name}*: ${fileErr.message}\n🔗 Link Drive: ${doc.drive_url}`
            );
          }
        }
      } catch (err) {
        console.error('❌ Gagal perintah /lihatpo:', err.message);
        await openwaService.sendText(chatId, `✗ Gagal mengambil dokumen: ${err.message}`);
      }
      return true;

    case 'batalpo':
      if (!args) {
        await openwaService.sendText(
          chatId,
          `*PEMBATALAN PURCHASE ORDER*
━━━━━━━━━━━━━━━━━━━━━━━━
Format : \`/batalpo <nomor_po> [alasan]\`
Contoh : \`/batalpo PO-2026-001 Salah order\`
━━━━━━━━━━━━━━━━━━━━━━━━`
        );
        return true;
      }
      const batalParts = args.split(/\s+/);
      const targetPo = batalParts[0];
      const alasan = batalParts.slice(1).join(' ') || 'Dibatalkan via WhatsApp';
      const batalRes = await sheetsService.softDeletePO(targetPo, alasan);
      if (batalRes.success) {
        await openwaService.sendText(
          chatId,
          `*STATUS PURCHASE ORDER DIUPDATE*
━━━━━━━━━━━━━━━━━━━━━━━━
PO Ref  : \`${targetPo}\`
Status  : \`[CANCELLED]\`
Alasan  : ${alasan}
━━━━━━━━━━━━━━━━━━━━━━━━`
        );
      } else {
        await openwaService.sendText(chatId, `⚠️ ${batalRes.message}`);
      }
      return true;

    case 'sync':
      if (!hasValidToken()) {
        await openwaService.sendText(chatId, '⚠️ _Token Google Sheets belum diotorisasi. Jalankan `npm run auth` di server._');
        return true;
      }
      await openwaService.sendText(chatId, '⏳ _Sedang menyinkronkan data master dari Google Sheets..._');
      try {
        const syncRes = await cacheService.syncMasterData(getSheetsClient());
        await openwaService.sendText(
          chatId,
          `*SINKRONISASI SELESAI*
━━━━━━━━━━━━━━━━━━━━━━━━
▸ Material Master : *${syncRes.totalMaterials.toLocaleString('id-ID')} data*
▸ Supplier Master : *${syncRes.totalSuppliers.toLocaleString('id-ID')} data*
▸ Status          : \`[BERHASIL DISINKRONKAN]\`
━━━━━━━━━━━━━━━━━━━━━━━━`
        );
      } catch (err) {
        await openwaService.sendText(chatId, `✗ Gagal sinkronisasi: ${err.message}`);
      }
      return true;

    default:
      return false;
  }
}

module.exports = {
  handleDirectCommand,
};
