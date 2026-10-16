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

// REST API Dashboard Routes
app.use('/api', apiRoutes);

// Static Client Serving (Production Build dari Vite React)
const clientDistPath = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
  console.log(`🌐 Melayani UI Dashboard dari: ${clientDistPath}`);
  app.use(express.static(clientDistPath));
  // SPA Fallback untuk client-side routing
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/webhook') || req.path.startsWith('/health')) {
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
