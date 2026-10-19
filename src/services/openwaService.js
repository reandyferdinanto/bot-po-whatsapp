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
 * Mengirim gambar ke WhatsApp user / grup.
 * Mendukung base64 (data URI atau base64 string) atau URL langsung.
 *
 * @param {string} chatId - contoh: '628123456789@c.us'
 * @param {Object} options
 * @param {string} [options.url] - URL gambar
 * @param {string} [options.base64] - Base64 gambar (dengan atau tanpa prefix data:image/...)
 * @param {string} [options.caption] - Teks caption
 * @param {string} [options.quotedMessageId] - ID pesan yang dibalas
 */
async function sendImage(chatId, options = {}) {
  try {
    const sessionId = env.openwa.sessionId;
    const payload = {
      chatId,
      caption: options.caption || '',
    };
    if (options.base64) {
      payload.base64 = options.base64;
    } else if (options.url) {
      payload.url = options.url;
    } else {
      throw new Error('sendImage memerlukan url atau base64.');
    }
    if (options.quotedMessageId) {
      payload.quotedMessageId = options.quotedMessageId;
    }

    const res = await apiClient.post(`/sessions/${sessionId}/messages/send-image`, payload);
    return res.data;
  } catch (err) {
    const errMsg = err.response && err.response.data ? JSON.stringify(err.response.data) : err.message;
    console.error(`❌ Gagal kirim gambar ke ${chatId}:`, errMsg);
    throw new Error(`OpenWA SendImage Error: ${errMsg}`);
  }
}

/**
 * Mengirim dokumen PDF / file lainnya ke WhatsApp user / grup.
 *
 * @param {string} chatId
 * @param {Object} options
 * @param {string} [options.url]
 * @param {string} [options.base64]
 * @param {string} [options.filename]
 * @param {string} [options.mimetype]
 * @param {string} [options.caption]
 * @param {string} [options.quotedMessageId]
 */
async function sendDocument(chatId, options = {}) {
  try {
    const sessionId = env.openwa.sessionId;
    const payload = {
      chatId,
      filename: options.filename || 'dokumen.pdf',
      mimetype: options.mimetype || 'application/pdf',
      caption: options.caption || '',
    };
    if (options.base64) {
      payload.base64 = options.base64;
    } else if (options.url) {
      payload.url = options.url;
    } else {
      throw new Error('sendDocument memerlukan url atau base64.');
    }
    if (options.quotedMessageId) {
      payload.quotedMessageId = options.quotedMessageId;
    }

    const res = await apiClient.post(`/sessions/${sessionId}/messages/send-document`, payload);
    return res.data;
  } catch (err) {
    const errMsg = err.response && err.response.data ? JSON.stringify(err.response.data) : err.message;
    console.error(`❌ Gagal kirim dokumen ke ${chatId}:`, errMsg);
    throw new Error(`OpenWA SendDocument Error: ${errMsg}`);
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
  sendImage,
  sendDocument,
};

