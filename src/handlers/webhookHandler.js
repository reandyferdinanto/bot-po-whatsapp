const crypto = require('crypto');
const env = require('../config/env');
const commandHandler = require('./commandHandler');
const conversationManager = require('./conversationManager');
const mediaHandler = require('./mediaHandler');

// Idempotency cache: Set of recently processed message IDs (TTL 5 minutes)
const processedMessages = new Map();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;

function isDuplicate(key) {
  if (!key) return false;
  const now = Date.now();
  if (processedMessages.has(key)) {
    const ts = processedMessages.get(key);
    if (now - ts < IDEMPOTENCY_TTL_MS) return true;
  }
  processedMessages.set(key, now);

  // Periodic cleanup
  if (processedMessages.size > 2000) {
    for (const [k, ts] of processedMessages.entries()) {
      if (now - ts > IDEMPOTENCY_TTL_MS) processedMessages.delete(k);
    }
  }
  return false;
}

/**
 * Validasi HMAC signature jika secret diset di .env
 */
function verifySignature(rawBody, signatureHeader) {
  if (!env.openwa.webhookSecret) return true;
  if (!signatureHeader) return false;

  const expected = 'sha256=' + crypto.createHmac('sha256', env.openwa.webhookSecret).update(rawBody).digest('hex');
  const sigBuffer = Buffer.from(signatureHeader);
  const expBuffer = Buffer.from(expected);

  return sigBuffer.length === expBuffer.length && crypto.timingSafeEqual(sigBuffer, expBuffer);
}

/**
 * Main Webhook Event Router
 */
async function handleWebhook(req, res) {
  try {
    const signature = req.headers['x-openwa-signature'];
    const eventName = req.headers['x-openwa-event'] || (req.body && req.body.event);
    const idempotencyKey = req.headers['x-openwa-idempotency-key'] || (req.body && req.body.idempotencyKey);

    // 1. Verifikasi Signature HMAC jika diaktifkan
    if (env.openwa.webhookSecret && req.rawBody) {
      if (!verifySignature(req.rawBody, signature)) {
        console.warn('⚠️ Webhook ditolak: Invalid HMAC Signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Segera jawab 200 OK agar OpenWA tidak timeout/retry
    res.status(200).json({ received: true });

    // Hanya proses event 'message.received'
    if (eventName !== 'message.received') {
      return;
    }

    const payload = req.body;
    const msg = payload.data || {};

    // 2. Cegah loop pesan sendiri (fromMe)
    if (msg.fromMe === true) {
      return;
    }

    const messageId = msg.id || idempotencyKey;
    if (isDuplicate(messageId)) {
      console.log(`ℹ️ Pesan duplikat diabaikan: ${messageId}`);
      return;
    }

    const chatId = msg.chatId || msg.from;
    const body = (msg.body || '').trim();
    const sender = (msg.from || '').replace(/[^0-9]/g, '');

    // 3. Whitelist Otorisasi Nomor Pengirim (Jika dikonfigurasi di .env)
    if (env.security.allowedNumbers.length > 0) {
      const isAllowed = env.security.allowedNumbers.some(num => sender.includes(num));
      if (!isAllowed) {
        console.warn(`🔒 Pesan dari nomor tidak berwenang: ${sender}`);
        return;
      }
    }

    console.log(`📩 Pesan masuk [${chatId}]: ${msg.type} - "${body.substring(0, 50)}"`);

    // 4. Periksa apakah pesan membawa file/gambar dokumen PO
    if (msg.media || msg.type === 'image' || msg.type === 'document') {
      const handled = await mediaHandler.handleIncomingMedia(msg);
      if (handled) return;
    }

    // 5. Periksa jika ada perintah langsung (misal: !cari, !cekpo, !menu)
    const commandHandled = await commandHandler.handleDirectCommand(chatId, body);
    if (commandHandled) return;

    // 6. Teruskan ke State Machine Percakapan Terpandu (Wizard)
    await conversationManager.handleConversationMessage(chatId, body, msg);
  } catch (err) {
    console.error('❌ Error saat menangani webhook:', err);
  }
}

module.exports = {
  handleWebhook,
};
