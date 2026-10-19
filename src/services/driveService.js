const { Readable } = require('stream');
const path = require('path');
const { getDriveClient, getTokenInfo, hasValidToken } = require('../config/googleAuth');
const dbService = require('./dbService');

// In-memory cache untuk subfolder ID agar tidak query Google Drive terus-menerus
const subfolderCache = new Map();

/**
 * Mengekstrak Google Drive Folder ID dari URL atau string ID langsung.
 *
 * Contoh URL yang didukung:
 * - https://drive.google.com/drive/folders/1ABC_xyz-12345
 * - https://drive.google.com/drive/u/0/folders/1ABC_xyz-12345?usp=sharing
 * - 1ABC_xyz-12345
 *
 * @param {string} input
 * @returns {string|null}
 */
function parseFolderId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // Pola URL /folders/<id>
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch && folderMatch[1]) {
    return folderMatch[1];
  }

  // Pola query param id=<id>
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch && idParamMatch[1]) {
    return idParamMatch[1];
  }

  // Jika berupa ID langsung (hanya karakter alfanumerik, dash, underscore)
  if (/^[a-zA-Z0-9_-]{15,60}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Mengambil konfigurasi Google Drive dari database app_settings.
 */
async function getDriveConfig() {
  const folderId = await dbService.getSetting('gdrive_folder_id', process.env.GDRIVE_FOLDER_ID || '');
  const folderUrl = await dbService.getSetting('gdrive_folder_url', '');
  const autoSubfolders = (await dbService.getSetting('gdrive_auto_subfolders', 'true')) === 'true';

  const tokenInfo = getTokenInfo();

  return {
    folderId,
    folderUrl: folderUrl || (folderId ? `https://drive.google.com/drive/folders/${folderId}` : ''),
    autoSubfolders,
    tokenInfo,
  };
}

/**
 * Menyimpan konfigurasi Google Drive ke database app_settings.
 */
async function saveDriveConfig({ folderUrlOrId, autoSubfolders }) {
  const folderId = parseFolderId(folderUrlOrId);
  if (!folderId) {
    throw new Error('Format URL atau ID Folder Google Drive tidak valid.');
  }

  const rawUrl = folderUrlOrId.startsWith('http')
    ? folderUrlOrId.trim()
    : `https://drive.google.com/drive/folders/${folderId}`;

  await dbService.setSetting('gdrive_folder_id', folderId, 'Google Drive Folder ID target arsip dokumen');
  await dbService.setSetting('gdrive_folder_url', rawUrl, 'Google Drive Folder URL target arsip dokumen');
  if (typeof autoSubfolders !== 'undefined') {
    await dbService.setSetting(
      'gdrive_auto_subfolders',
      autoSubfolders ? 'true' : 'false',
      'Otomatis pisahkan subfolder PO, GRPO, Bukti Bayar'
    );
  }

  // Bersihkan cache subfolder saat konfigurasi folder berubah
  subfolderCache.clear();

  return {
    folderId,
    folderUrl: rawUrl,
    autoSubfolders: !!autoSubfolders,
  };
}

/**
 * Menguji koneksi dan izin akses ke folder Google Drive.
 */
async function testFolderAccess(customFolderUrlOrId = null) {
  if (!hasValidToken()) {
    return {
      success: false,
      error: 'Token otentikasi Google belum terdaftar. Silakan jalankan `npm run auth` di server.',
    };
  }

  let folderId = null;
  if (customFolderUrlOrId) {
    folderId = parseFolderId(customFolderUrlOrId);
  } else {
    const config = await getDriveConfig();
    folderId = config.folderId;
  }

  if (!folderId) {
    return {
      success: false,
      error: 'Folder ID belum ditentukan. Masukkan URL atau ID folder Google Drive terlebih dahulu.',
    };
  }

  try {
    const drive = getDriveClient();
    const res = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, mimeType, capabilities, owners, webViewLink',
      supportsAllDrives: true,
    });

    const folder = res.data;
    if (folder.mimeType !== 'application/vnd.google-apps.folder') {
      return {
        success: false,
        error: `Item "${folder.name}" bukan merupakan Folder (MIME type: ${folder.mimeType}).`,
      };
    }

    const canAddChildren = folder.capabilities?.canAddChildren !== false;

    return {
      success: true,
      folder: {
        id: folder.id,
        name: folder.name,
        webViewLink: folder.webViewLink,
        owners: folder.owners ? folder.owners.map((o) => o.displayName || o.emailAddress).join(', ') : 'Unknown',
        canAddChildren,
      },
      message: canAddChildren
        ? `Akses berhasil! Folder "${folder.name}" siap digunakan untuk arsip dokumen.`
        : `Folder "${folder.name}" dapat dibaca, namun akun Anda tidak memiliki izin menulis (tambah file).`,
    };
  } catch (err) {
    const errMsg = err.message || '';
    if (errMsg.includes('has not been used in project') || errMsg.includes('disabled')) {
      return {
        success: false,
        apiDisabled: true,
        error:
          'Google Drive API belum diaktifkan di Google Cloud Console. Silakan buka: https://console.developers.google.com/apis/api/drive.googleapis.com/overview lalu klik "Enable" / "Aktifkan".',
      };
    }
    if (errMsg.includes('File not found') || err.code === 404) {
      return {
        success: false,
        error: `Folder dengan ID "${folderId}" tidak ditemukan atau belum dibagikan (share) ke akun Google bot.`,
      };
    }
    if (errMsg.includes('insufficient') || errMsg.includes('scope')) {
      return {
        success: false,
        scopeError: true,
        error:
          'Izin Google OAuth tidak mencukupi untuk menulis file ke Drive. Jalankan `npm run auth` di server untuk memperbarui izin (scope drive.file).',
      };
    }
    return {
      success: false,
      error: `Gagal mengakses Google Drive: ${errMsg}`,
    };
  }
}

/**
 * Mencari atau membuat subfolder di dalam folder target.
 *
 * @param {string} parentId
 * @param {string} folderName
 */
async function ensureSubfolder(parentId, folderName) {
  const cacheKey = `${parentId}:${folderName}`;
  if (subfolderCache.has(cacheKey)) {
    return subfolderCache.get(cacheKey);
  }

  const drive = getDriveClient();

  // Cari apakah subfolder sudah ada
  const query = `'${parentId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const listRes = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (listRes.data.files && listRes.data.files.length > 0) {
    const existingId = listRes.data.files[0].id;
    subfolderCache.set(cacheKey, existingId);
    return existingId;
  }

  // Jika belum ada, buat subfolder baru
  const createRes = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id, name',
    supportsAllDrives: true,
  });

  const newId = createRes.data.id;
  subfolderCache.set(cacheKey, newId);
  return newId;
}

/**
 * Mengunggah file dokumen ke Google Drive dan mencatat riwayatnya ke PostgreSQL.
 *
 * @param {Object} params
 * @param {Buffer} params.buffer - Isi file binary
 * @param {string} params.filename - Nama file asli
 * @param {string} params.mimeType - MIME Type (image/jpeg, application/pdf, dsb)
 * @param {string} params.docType - 'PO' | 'GRPO' | 'BUKTI_BAYAR' | 'NOTA'
 * @param {string} params.noPo - Nomor PO terkait
 * @param {Object} [params.metadata] - Data tambahan
 */
async function uploadDocument({ buffer, filename, mimeType, docType, noPo, metadata = {} }) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Buffer file tidak valid untuk diunggah ke Google Drive.');
  }

  const config = await getDriveConfig();
  if (!config.folderId) {
    throw new Error('Folder Google Drive target belum dikonfigurasi di Pengaturan Dashboard.');
  }

  const drive = getDriveClient();

  // Tentukan folder tujuan (root atau subfolder berdasarkan tipe dokumen)
  let targetFolderId = config.folderId;
  const cleanDocType = (docType || 'DOKUMEN').toUpperCase();

  if (config.autoSubfolders) {
    try {
      let subfolderName = 'PO';
      if (cleanDocType.includes('GRPO') || cleanDocType.includes('DELIVERY')) {
        subfolderName = 'GRPO_Surat_Jalan';
      } else if (cleanDocType.includes('BAYAR') || cleanDocType.includes('INVOICE') || cleanDocType.includes('NOTA')) {
        subfolderName = 'Bukti_Bayar';
      }
      targetFolderId = await ensureSubfolder(config.folderId, subfolderName);
    } catch (subErr) {
      console.warn('⚠️ Gagal membuat subfolder Drive, fallback ke folder utama:', subErr.message);
      targetFolderId = config.folderId;
    }
  }

  // Format nama file agar rapi: [TIPE]_[NO_PO]_[TIMESTAMP].[ext]
  const ext = path.extname(filename || '').toLowerCase() || (mimeType.includes('pdf') ? '.pdf' : '.jpg');
  const cleanPo = (noPo || 'TEMP').replace(/[^a-zA-Z0-9_-]/g, '_');
  const standardizedName = `${cleanDocType}_${cleanPo}_${Date.now()}${ext}`;

  // Upload ke Google Drive
  const stream = Readable.from(buffer);
  let driveRes;
  try {
    driveRes = await drive.files.create({
      requestBody: {
        name: standardizedName,
        parents: [targetFolderId],
        description: `Dokumen ${cleanDocType} untuk PO ${noPo || '-'} (Diupload otomatis oleh Bot PO)`,
      },
      media: {
        mimeType: mimeType || 'application/octet-stream',
        body: stream,
      },
      fields: 'id, name, webViewLink, webContentLink, size',
      supportsAllDrives: true,
    });
  } catch (uploadErr) {
    const errMsg = uploadErr.message || '';
    if (errMsg.includes('insufficient') || errMsg.includes('scope')) {
      throw new Error('Izin Google OAuth tidak mencukupi untuk menulis file ke Drive (perlu scope drive.file). Silakan perbarui otorisasi di Dashboard atau jalankan "npm run auth".');
    }
    throw uploadErr;
  }

  const uploadedFile = driveRes.data;
  console.log(` Google Drive Upload Sukses: "${uploadedFile.name}" (ID: ${uploadedFile.id})`);

  // Simpan record ke database PostgreSQL
  const dbDoc = await dbService.savePoDocument({
    noPo: noPo || 'TEMP',
    tipeDokumen: cleanDocType,
    fileName: standardizedName,
    driveFileId: uploadedFile.id,
    driveUrl: uploadedFile.webViewLink,
    mimeType: mimeType,
    fileSize: buffer.length,
    metadata: {
      ...metadata,
      originalFilename: filename,
      webContentLink: uploadedFile.webContentLink,
      targetFolderId,
    },
  });

  return {
    id: dbDoc ? dbDoc.id : null,
    driveFileId: uploadedFile.id,
    driveUrl: uploadedFile.webViewLink,
    filename: standardizedName,
    mimeType,
    fileSize: buffer.length,
    noPo,
    docType: cleanDocType,
  };
}

/**
 * Mengunduh file dari Google Drive sebagai binary Buffer.
 * Digunakan saat bot WhatsApp akan mengirimkan gambar/PDF ke user.
 *
 * @param {string} driveFileId
 * @returns {Promise<{ buffer: Buffer, mimeType: string, filename: string }>}
 */
async function downloadDocumentBuffer(driveFileId) {
  const drive = getDriveClient();

  // Ambil metadata file dulu untuk tahu tipe & namanya
  const metaRes = await drive.files.get({
    fileId: driveFileId,
    fields: 'id, name, mimeType',
    supportsAllDrives: true,
  });

  // Ambil isi binary file
  const mediaRes = await drive.files.get(
    {
      fileId: driveFileId,
      alt: 'media',
      supportsAllDrives: true,
    },
    { responseType: 'arraybuffer' }
  );

  return {
    buffer: Buffer.from(mediaRes.data),
    mimeType: metaRes.data.mimeType,
    filename: metaRes.data.name,
  };
}

/**
 * Mengambil daftar dokumen lampiran untuk nomor PO tertentu dari database.
 */
async function getDocumentsForPo(noPo, docType = null) {
  return await dbService.getDocumentsByPo(noPo, docType);
}

/**
 * Mengambil daftar PO terbaru yang memiliki arsip dokumen di Google Drive.
 */
async function getRecentArchivedPOs(limit = 10) {
  return await dbService.getRecentArchivedPOs(limit);
}

module.exports = {
  parseFolderId,
  getDriveConfig,
  saveDriveConfig,
  testFolderAccess,
  uploadDocument,
  downloadDocumentBuffer,
  getDocumentsForPo,
  getRecentArchivedPOs,
};

