const express = require('express');
const path = require('path');
const fs = require('fs');
const env = require('./config/env');
const { hasValidToken, getSheetsClient } = require('./config/googleAuth');
const cacheService = require('./services/cacheService');
const dbService = require('./services/dbService');
const cronService = require('./services/cronService');
const kursService = require('./services/kursService');
const { handleWebhook } = require('./handlers/webhookHandler');
const apiRoutes = require('./routes/apiRoutes');

const app = express();

// CORS Middleware untuk UI Dashboard
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware parsing JSON & capture raw body untuk verifikasi HMAC
app.use(
  express.json({
    limit: '50mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health Check Endpoint
app.get('/health', async (req, res) => {
  const syncStatus = cacheService.getSyncStatus();
  let kursUsd = null;
  try {
    kursUsd = await kursService.getKursUsd();
  } catch (kErr) {}

  res.json({
    status: 'ok',
    googleAuth: hasValidToken(),
    postgres: dbService.isAvailable(),
    masterCache: syncStatus,
    kursUsd: kursUsd ? { tengah: kursUsd.kursTengah, tanggal: kursUsd.tanggal, trend: kursUsd.trend } : null,
    openwaSession: env.openwa.sessionId,
    timestamp: new Date().toISOString(),
  });
});

// Webhook Router
app.post('/webhook', handleWebhook);

// Google OAuth2 Callback Route
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  const error = req.query.error;

  if (error) {
    return res.status(400).send(`
      <div style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
        <h2 style="color: #ef4444;">❌ Otorisasi Dibatalkan: ${error}</h2>
        <p><a href="/settings/drive">Kembali ke Dashboard Google Drive</a></p>
      </div>
    `);
  }

  if (code) {
    try {
      const raw = fs.readFileSync(env.sheets.credentialsPath, 'utf8');
      const creds = JSON.parse(raw);
      const ci = creds.web || creds.installed;

      const hostUri = `${req.protocol}://${req.get('host')}/oauth2callback`;
      const candidateUris = [
        hostUri,
        'https://bot-whatsapp.ebite.biz.id/oauth2callback',
        'http://localhost:3000/oauth2callback',
        'http://localhost:3001/oauth2callback',
      ];

      let tokens = null;
      let lastErr = null;
      const { google } = require('googleapis');

      for (const uri of candidateUris) {
        try {
          const client = new google.auth.OAuth2(ci.client_id, ci.client_secret, uri);
          const resTok = await client.getToken(code);
          tokens = resTok.tokens;
          break;
        } catch (e) {
          lastErr = e;
        }
      }

      if (!tokens) {
        throw lastErr || new Error('Gagal menukar token dengan semua redirect URI yang dicoba.');
      }

      const { getOAuth2Client } = require('./config/googleAuth');
      const auth = getOAuth2Client();
      auth.setCredentials(tokens);
      fs.writeFileSync(env.sheets.tokenPath, JSON.stringify(tokens, null, 2), 'utf8');
      console.log('🎉 Token Google OAuth2 berhasil disimpan via /oauth2callback!');

      return res.send(`
        <div style="font-family: Arial, sans-serif; padding: 40px; text-align: center; max-width: 600px; margin: 40px auto; border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <h2 style="color: #10b981; margin-bottom: 12px;">✅ Otorisasi Google Berhasil!</h2>
          <p style="color: #4b5563; font-size: 15px;">Izin Google Drive & Sheets telah aktif sepenuhnya. Bot PO kini dapat mengarsipkan berkas OCR secara otomatis ke Google Drive.</p>
          <p style="margin-top: 24px;"><a href="/settings/drive" style="display: inline-block; padding: 12px 24px; background: #1890ff; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Buka Dashboard Google Drive</a></p>
        </div>
      `);
    } catch (err) {
      console.error('❌ Gagal tukar token di /oauth2callback:', err.message);
      return res.status(500).send(`
        <div style="font-family: Arial, sans-serif; padding: 40px; text-align: center; max-width: 600px; margin: 40px auto; border: 1px solid #fee2e2; border-radius: 12px; background: #fff5f5;">
          <h2 style="color: #ef4444; margin-bottom: 12px;">❌ Gagal Memproses Token Otomatis</h2>
          <p style="color: #4b5563;">Error: ${err.message}</p>
          <p style="margin-top: 16px;">Salin kode berikut dan masukkan manual di Dashboard: <br><code style="background: #e5e7eb; padding: 4px 8px; border-radius: 4px; font-size: 14px;">${code}</code></p>
          <p style="margin-top: 20px;"><a href="/settings/drive" style="display: inline-block; padding: 10px 20px; background: #4b5563; color: white; text-decoration: none; border-radius: 6px;">Buka Dashboard Google Drive</a></p>
        </div>
      `);
    }
  }

  res.redirect('/settings/drive');
});

// REST API Dashboard Routes
app.use('/api', apiRoutes);

// Uploads Static Serving (Nota Kasbon, Dokumen Belanja)
const uploadsPath = path.resolve(__dirname, '../uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

// Static Client Serving (Production Build dari Vite React)
const clientDistPath = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
  console.log(`🌐 Melayani UI Dashboard dari: ${clientDistPath}`);
  app.use(express.static(clientDistPath));
  // SPA Fallback untuk client-side routing
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/webhook') ||
      req.path.startsWith('/health') ||
      req.path.startsWith('/uploads')
    ) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  // Endpoint Root Fallback jika belum di-build
  app.get('/', (req, res) => {
    res.send(`
      <div style="font-family: Arial, sans-serif; padding: 40px; line-height: 1.6;">
        <h2>🤖 Bot PO WhatsApp & Google Sheets Integration</h2>
        <p>Status Server: <b style="color: #10b981;">ONLINE</b></p>
        <p>OpenWA Gateway: <code>${env.openwa.baseUrl}</code> (Session: <code>${env.openwa.sessionId}</code>)</p>
        <p>Spreadsheet Target: <code>${env.sheets.spreadsheetId}</code></p>
        <p>PostgreSQL VPS: <code>${dbService.isAvailable() ? 'CONNECTED' : 'STANDBY / RAM MODE'}</code></p>
        <p>REST API: <code>/api/stats</code>, <code>/api/pos</code>, <code>/api/ocr/parse</code></p>
        <p>Webhook URL: <code>POST /webhook</code></p>
      </div>
    `);
  });
}

// Inisialisasi Server, Database, Cache & Cron Job
async function startServer() {
  console.log('\n====================================================');
  console.log('🚀 Memulai Bot PO WhatsApp x Google Sheets Server');
  console.log('====================================================');
  console.log(`📡 OpenWA Host    : ${env.openwa.baseUrl}`);
  console.log(`📱 Session ID     : ${env.openwa.sessionId}`);
  console.log(`📊 Spreadsheet ID : ${env.sheets.spreadsheetId}`);

  // 1. Inisialisasi PostgreSQL jika diaktifkan
  if (env.db.enabled) {
    console.log(`🐘 Menghubungkan ke PostgreSQL di ${env.db.host}:${env.db.port}/${env.db.database}...`);
    await dbService.migrateTables();
  }

  // 2. Inisialisasi Master Data dari Google Sheets
  if (hasValidToken()) {
    console.log('🔑 Token Google OAuth2 terdeteksi.');
    try {
      const sheetsClient = getSheetsClient();
      await cacheService.syncMasterData(sheetsClient);
    } catch (err) {
      console.warn(`⚠️ Gagal sinkronisasi awal master data: ${err.message}`);
      console.warn('Pastikan file token.json masih valid.');
    }
  } else {
    console.log('\n⚠️ PERINGATAN: credentials/token.json belum dibuat.');
    console.log('👉 Jalankan perintah ini di terminal:');
    console.log('   node auth-google.js\n');
  }

  // 3. Jalankan Cron Job Sinkronisasi Otomatis
  cronService.initCron();

  // 4. Inisialisasi Data Kurs USD Bank Indonesia dari Ortax
  kursService.getKursUsd().catch(err => {
    console.warn(`⚠️ Gagal inisialisasi awal Kurs USD: ${err.message}`);
  });

  app.listen(env.port, () => {
    console.log(`\n✅ Server bot berjalan di: http://localhost:${env.port}`);
    console.log(`🔗 Webhook endpoint : http://localhost:${env.port}/webhook`);
    console.log('====================================================\n');
  });
}

startServer().catch(err => {
  console.error('❌ Gagal menjalankan server:', err);
});
