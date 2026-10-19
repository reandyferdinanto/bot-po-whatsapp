require('dotenv').config();
const path = require('path');

const rootDir = path.resolve(__dirname, '../../');

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  openwa: {
    baseUrl: process.env.OPENWA_BASE_URL || 'https://openwa.ebite.biz.id',
    apiKey: process.env.OPENWA_API_KEY || '',
    sessionId: process.env.OPENWA_SESSION_ID || '997f4002-105',
    webhookSecret: process.env.OPENWA_WEBHOOK_SECRET || '',
  },
  sheets: {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '15n9joeQAoic8FvP5V_-bChqjHKjFeMG0WGHzQ4xHGPk',
    credentialsPath: path.resolve(rootDir, process.env.GOOGLE_CREDENTIALS_PATH || './credentials/client_secret.json'),
    tokenPath: path.resolve(rootDir, process.env.GOOGLE_TOKEN_PATH || './credentials/token.json'),
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
  },
  router9: {
    enabled: process.env.ROUTER9_ENABLED !== 'false',
    baseUrl: process.env.ROUTER9_BASE_URL || 'http://localhost:20128/v1',
    apiKey: process.env.ROUTER9_API_KEY || 'sk-40895848c4bbfc69-46eo6g-4a3ee245',
    model: process.env.ROUTER9_MODEL || 'ag/gemini-3-flash',
    timeout: parseInt(process.env.ROUTER9_TIMEOUT_MS, 10) || 30000,
  },
  security: {
    allowedNumbers: (process.env.ALLOWED_NUMBERS || '')
      .split(',')
      .map(n => n.trim().replace(/[^0-9]/g, ''))
      .filter(Boolean),
  },
  db: {
    enabled: process.env.PG_ENABLED === 'true' || !!process.env.PGDATABASE,
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT, 10) || 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'bot_po',
    ssl: process.env.PGSSL === 'true',
  },
  cron: {
    enabled: process.env.CRON_ENABLED !== 'false',
    schedule: process.env.CRON_SYNC_SCHEDULE || '*/30 * * * *', // Default: tiap 30 menit
  },
};
