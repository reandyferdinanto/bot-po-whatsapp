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
  security: {
    allowedNumbers: (process.env.ALLOWED_NUMBERS || '')
      .split(',')
      .map(n => n.trim().replace(/[^0-9]/g, ''))
      .filter(Boolean),
  },
};
