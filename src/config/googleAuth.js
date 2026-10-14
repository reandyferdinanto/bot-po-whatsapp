const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const env = require('./env');

let oauth2Client = null;

/**
 * Initializes and returns the authenticated Google OAuth2 Client.
 */
function getOAuth2Client() {
  if (oauth2Client) return oauth2Client;

  if (!fs.existsSync(env.sheets.credentialsPath)) {
    throw new Error(`Google Client Secret not found at: ${env.sheets.credentialsPath}`);
  }

  const credentialsRaw = fs.readFileSync(env.sheets.credentialsPath, 'utf8');
  const credentials = JSON.parse(credentialsRaw);
  const clientInfo = credentials.web || credentials.installed;

  if (!clientInfo) {
    throw new Error('Invalid client_secret.json format. Missing "web" or "installed" key.');
  }

  const redirectUri = (clientInfo.redirect_uris && clientInfo.redirect_uris[0]) || 'http://localhost:3000/oauth2callback';

  oauth2Client = new google.auth.OAuth2(
    clientInfo.client_id,
    clientInfo.client_secret,
    redirectUri
  );

  // Auto-save refreshed tokens to token.json
  oauth2Client.on('tokens', (tokens) => {
    try {
      let existingTokens = {};
      if (fs.existsSync(env.sheets.tokenPath)) {
        existingTokens = JSON.parse(fs.readFileSync(env.sheets.tokenPath, 'utf8'));
      }
      const updatedTokens = { ...existingTokens, ...tokens };
      fs.writeFileSync(env.sheets.tokenPath, JSON.stringify(updatedTokens, null, 2), 'utf8');
      console.log('🔄 Google OAuth2 token refreshed and saved successfully.');
    } catch (err) {
      console.error('Failed to save refreshed token:', err.message);
    }
  });

  if (fs.existsSync(env.sheets.tokenPath)) {
    const token = JSON.parse(fs.readFileSync(env.sheets.tokenPath, 'utf8'));
    oauth2Client.setCredentials(token);
  }

  return oauth2Client;
}

/**
 * Checks if a valid persistent token exists.
 */
function hasValidToken() {
  if (!fs.existsSync(env.sheets.tokenPath)) return false;
  try {
    const token = JSON.parse(fs.readFileSync(env.sheets.tokenPath, 'utf8'));
    return !!(token.access_token || token.refresh_token);
  } catch {
    return false;
  }
}

/**
 * Returns Google Sheets API v4 instance.
 */
function getSheetsClient() {
  const auth = getOAuth2Client();
  return google.sheets({ version: 'v4', auth });
}

module.exports = {
  getOAuth2Client,
  hasValidToken,
  getSheetsClient,
};
