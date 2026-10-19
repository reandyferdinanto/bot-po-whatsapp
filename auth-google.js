const fs = require('fs');
const http = require('http');
const url = require('url');
const readline = require('readline');
const { google } = require('googleapis');
const env = require('./src/config/env');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
];

async function main() {
  console.log('====================================================');
  console.log('🔐 Google OAuth 2.0 Authorization Initializer');
  console.log('====================================================\n');

  if (!fs.existsSync(env.sheets.credentialsPath)) {
    console.error(`❌ Error: File credentials tidak ditemukan di: ${env.sheets.credentialsPath}`);
    process.exit(1);
  }

  const credentialsRaw = fs.readFileSync(env.sheets.credentialsPath, 'utf8');
  const credentials = JSON.parse(credentialsRaw);
  const clientInfo = credentials.web || credentials.installed;

  if (!clientInfo) {
    console.error('❌ Error: Format client_secret.json tidak valid (wajib memiliki root "web" atau "installed").');
    process.exit(1);
  }

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    (clientInfo.redirect_uris && clientInfo.redirect_uris[0]) ||
    'http://localhost:3000/oauth2callback';

  const oAuth2Client = new google.auth.OAuth2(
    clientInfo.client_id,
    clientInfo.client_secret,
    redirectUri
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Memastikan refresh_token selalu diberikan
  });

  console.log('📋 LANGKAH OTORISASI:');
  console.log('1. Buka URL berikut di browser Anda:');
  console.log('----------------------------------------------------');
  console.log(authUrl);
  console.log('----------------------------------------------------\n');
  console.log(`2. Login dengan akun Google yang memiliki akses ke spreadsheet.`);
  console.log(`3. Klik Lanjutkan / Izinkan (Allow).`);
  console.log(`\n⏳ Menunggu redirect otomatis di ${redirectUri} ...`);
  console.log('(Atau jika Anda di-redirect ke halaman yang tidak bisa dibuka, salin kode dari URL browser dan paste di sini)\n');

  // Start temporary local HTTP server to receive the callback
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/oauth2callback')) {
        const queryParams = new url.URL(req.url, `http://localhost:${port}`).searchParams;
        const code = queryParams.get('code');
        const error = queryParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h2>❌ Otorisasi Ditolak: ${error}</h2>`);
          console.error(`❌ Otorisasi dibatalkan pengguna: ${error}`);
          server.close();
          process.exit(1);
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <div style="font-family: Arial; padding: 40px; text-align: center;">
              <h1 style="color: #10b981;">✅ Otorisasi Berhasil!</h1>
              <p>Token Google OAuth2 telah disimpan ke <code>credentials/token.json</code>.</p>
              <p>Anda dapat menutup jendela browser ini sekarang dan kembali ke terminal.</p>
            </div>
          `);

          await saveToken(oAuth2Client, code);
          server.close();
          process.exit(0);
        }
      }
    } catch (err) {
      console.error('Error saat menangani callback:', err.message);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`ℹ️ Port ${port} sedang aktif digunakan oleh server bot-po.`);
      console.log('👉 Setelah membuka URL otorisasi, salin parameter "code=" dari URL dan paste di bawah:');
    } else {
      console.warn(`⚠️ Warning: ${err.message}`);
    }
  });

  try {
    server.listen(port);
  } catch (e) {}

  // Provide terminal prompt fallback
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('👉 Masukkan Authorization Code di sini: ', async (code) => {
    if (code && code.trim()) {
      try {
        await saveToken(oAuth2Client, code.trim());
        try { server.close(); } catch (e) {}
        rl.close();
        process.exit(0);
      } catch (err) {
        console.error('❌ Gagal menukar kode:', err.message);
      }
    }
  });
}

async function saveToken(oAuth2Client, code) {
  console.log('\n⏳ Sedang menukar Authorization Code dengan Refresh Token...');
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  fs.writeFileSync(env.sheets.tokenPath, JSON.stringify(tokens, null, 2), 'utf8');
  console.log(`\n🎉 SUKSES! Token tersimpan di: ${env.sheets.tokenPath}`);
  console.log('Sekarang bot dapat mengakses Google Sheets secara otomatis 24/7.');
}

main().catch(err => {
  console.error('❌ Fatal Error:', err.message);
  process.exit(1);
});
