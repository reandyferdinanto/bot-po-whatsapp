const express = require('express');
const env = require('./config/env');
const { hasValidToken, getSheetsClient } = require('./config/googleAuth');
const cacheService = require('./services/cacheService');
const dbService = require('./services/dbService');
const cronService = require('./services/cronService');
const { handleWebhook } = require('./handlers/webhookHandler');

const app = express();

// Middleware parsing JSON & capture raw body untuk verifikasi HMAC
app.use(
  express.json({
    limit: '25mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Health Check Endpoint
app.get('/health', (req, res) => {
  const syncStatus = cacheService.getSyncStatus();
  res.json({
    status: 'ok',
    googleAuth: hasValidToken(),
    postgres: dbService.isAvailable(),
    masterCache: syncStatus,
    openwaSession: env.openwa.sessionId,
    timestamp: new Date().toISOString(),
  });
});

// Endpoint Root Info
app.get('/', (req, res) => {
  res.send(`
    <div style="font-family: Arial, sans-serif; padding: 40px; line-height: 1.6;">
      <h2>🤖 Bot PO WhatsApp & Google Sheets Integration</h2>
      <p>Status Server: <b style="color: #10b981;">ONLINE</b></p>
      <p>OpenWA Gateway: <code>${env.openwa.baseUrl}</code> (Session: <code>${env.openwa.sessionId}</code>)</p>
      <p>Spreadsheet Target: <code>${env.sheets.spreadsheetId}</code></p>
      <p>PostgreSQL VPS: <code>${dbService.isAvailable() ? 'CONNECTED' : 'STANDBY / RAM MODE'}</code></p>
      <p>Webhook URL: <code>POST /webhook</code></p>
    </div>
  `);
});

// Webhook Router
app.post('/webhook', handleWebhook);

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

  app.listen(env.port, () => {
    console.log(`\n✅ Server bot berjalan di: http://localhost:${env.port}`);
    console.log(`🔗 Webhook endpoint : http://localhost:${env.port}/webhook`);
    console.log('====================================================\n');
  });
}

startServer().catch(err => {
  console.error('❌ Gagal menjalankan server:', err);
});
