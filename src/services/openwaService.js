const axios = require('axios');
const env = require('../config/env');

const apiClient = axios.create({
  baseURL: `${env.openwa.baseUrl.replace(/\/+$/, '')}/api`,
  timeout: 30000,
});

apiClient.interceptors.request.use(config => {
  if (env.openwa.apiKey) {
    config.headers['X-API-Key'] = env.openwa.apiKey;
  }
  return config;
});

/**
 * Mengirim pesan teks biasa ke WhatsApp user / grup.
 *
 * @param {string} chatId - contoh: '628123456789@c.us'
 * @param {string} text - Pesan teks
 */
async function sendText(chatId, text) {
  try {
    const sessionId = env.openwa.sessionId;
    const res = await apiClient.post(`/sessions/${sessionId}/messages/send-text`, {
      chatId,
      text,
      linkPreview: false,
    });
    return res.data;
  } catch (err) {
    const errMsg = err.response && err.response.data ? JSON.stringify(err.response.data) : err.message;
    console.error(`❌ Gagal kirim pesan ke ${chatId}:`, errMsg);
    throw new Error(`OpenWA SendText Error: ${errMsg}`);
  }
}

/**
 * Membalas (quote reply) pesan tertentu.
 *
 * @param {string} chatId
 * @param {string} quotedMessageId
 * @param {string} text
 */
async function replyMessage(chatId, quotedMessageId, text) {
  try {
    const sessionId = env.openwa.sessionId;
    const res = await apiClient.post(`/sessions/${sessionId}/messages/reply`, {
      chatId,
      quotedMessageId,
      text,
      linkPreview: false,
    });
    return res.data;
  } catch (err) {
    // Fallback ke sendText jika quoted id tidak ditemukan
    console.warn(`⚠️ Gagal reply quote, mencoba sendText biasa... (${err.message})`);
    return sendText(chatId, text);
  }
}

/**
 * Mengunduh media dari pesan yang tersimpan di OpenWA jika tidak ter-inline di webhook.
 *
 * @param {string} chatId
 * @param {string} messageId
 */
async function getMessageMedia(chatId, messageId) {
  try {
    const sessionId = env.openwa.sessionId;
    const res = await apiClient.get(`/sessions/${sessionId}/messages/${chatId}/${messageId}/media`, {
      responseType: 'arraybuffer',
    });
    return {
      buffer: Buffer.from(res.data),
      contentType: res.headers['content-type'],
    };
  } catch (err) {
    console.error(`❌ Gagal ambil media untuk message ${messageId}:`, err.message);
    throw err;
  }
}

/**
 * Mengecek status sesi OpenWA.
 */
async function getSessionStatus() {
  try {
    const sessionId = env.openwa.sessionId;
    const res = await apiClient.get(`/sessions/${sessionId}`);
    return res.data;
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = {
  sendText,
  replyMessage,
  getMessageMedia,
  getSessionStatus,
};
