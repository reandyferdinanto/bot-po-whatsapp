const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dbService = require('./dbService');

const CACHE_DIR = path.resolve(__dirname, '../../cache');
const CACHE_FILE = path.join(CACHE_DIR, 'kurs_usd.json');

// In-memory cache state
let kursCache = null;
let lastScrapedTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 jam cache TTL

/**
 * Konversi string rupiah format Indonesia "17.948,00" ke angka murni float 17948.00
 */
function parseRupiahNumber(str) {
  if (!str) return 0;
  const clean = str.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

/**
 * Memuat data kurs dari cache file lokal jika ada
 */
function loadFromFileCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (data && data.kursTengah) {
        kursCache = data;
        lastScrapedTime = new Date(data.scrapedAt || 0).getTime();
        return kursCache;
      }
    }
  } catch (err) {
    console.warn('⚠️ [KURS] Gagal membaca cache file kurs_usd.json:', err.message);
  }
  return null;
}

/**
 * Menyimpan data kurs ke cache file lokal
 */
function saveToFileCache(data) {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('⚠️ [KURS] Gagal menulis cache file kurs_usd.json:', err.message);
  }
}

/**
 * Menyimpan ke tabel PostgreSQL jika database aktif
 */
async function saveToDatabase(data) {
  if (!dbService.isAvailable()) return;
  try {
    const client = await dbService.getPool().connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS kurs_history (
          id SERIAL PRIMARY KEY,
          currency VARCHAR(10) NOT NULL,
          name TEXT,
          kurs_tengah NUMERIC,
          kurs_jual NUMERIC,
          kurs_beli NUMERIC,
          kurs_tengah_raw TEXT,
          kurs_jual_raw TEXT,
          kurs_beli_raw TEXT,
          trend VARCHAR(20),
          trend_text TEXT,
          selisih TEXT,
          selisih_num NUMERIC,
          tanggal TEXT,
          source TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_kurs_curr_date UNIQUE (currency, tanggal)
        );
        CREATE INDEX IF NOT EXISTS idx_kurs_curr_date ON kurs_history (currency, tanggal);
      `);

      await client.query(`
        INSERT INTO kurs_history (
          currency, name, kurs_tengah, kurs_jual, kurs_beli,
          kurs_tengah_raw, kurs_jual_raw, kurs_beli_raw,
          trend, trend_text, selisih, selisih_num, tanggal, source
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )
        ON CONFLICT (currency, tanggal) DO UPDATE SET
          kurs_tengah = EXCLUDED.kurs_tengah,
          kurs_jual = EXCLUDED.kurs_jual,
          kurs_beli = EXCLUDED.kurs_beli,
          kurs_tengah_raw = EXCLUDED.kurs_tengah_raw,
          kurs_jual_raw = EXCLUDED.kurs_jual_raw,
          kurs_beli_raw = EXCLUDED.kurs_beli_raw,
          trend = EXCLUDED.trend,
          trend_text = EXCLUDED.trend_text,
          selisih = EXCLUDED.selisih,
          selisih_num = EXCLUDED.selisih_num,
          source = EXCLUDED.source,
          created_at = CURRENT_TIMESTAMP;
      `, [
        data.currency,
        data.name,
        data.kursTengahNum,
        data.kursJualNum,
        data.kursBeliNum,
        data.kursTengah,
        data.kursJual,
        data.kursBeli,
        data.trend,
        data.trendText,
        data.selisih,
        data.selisihNum,
        data.tanggal,
        data.source,
      ]);
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('⚠️ [KURS] Gagal menyimpan kurs ke PostgreSQL:', err.message);
  }
}

/**
 * Scraping Kurs Tengah USD dari https://datacenter.ortax.org/ortax/kursbi/list
 */
async function scrapeOrtaxKursUsd() {
  const url = 'https://datacenter.ortax.org/ortax/kursbi/list';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  };

  const response = await axios.get(url, { headers, timeout: 20000 });
  const html = response.data;

  // 1. Ekstrak Tanggal Berlaku
  let tanggal = '';
  const dateMatch =
    html.match(/Tanggal Berlaku:\s*<!--\s*-->\s*([^<]+)/i) ||
    html.match(/Tanggal Berlaku\s*:\s*<!--\s*-->\s*([0-9\/]+)/i) ||
    html.match(/Tanggal Berlaku<\/i><b>([^<]+)<\/b>/i);
  if (dateMatch) {
    tanggal = dateMatch[1].trim();
  }

  // 2. Ekstrak Baris USD
  const usdIndex = html.indexOf('/ortax/kursbi/show/USD');
  if (usdIndex === -1) {
    throw new Error('Elemen mata uang USD tidak ditemukan di halaman Ortax.');
  }

  const nextTr = html.indexOf('</tr>', usdIndex);
  const usdSnippet = html.substring(usdIndex, nextTr !== -1 ? nextTr : usdIndex + 1500);

  // Ambil semua angka setelah Rp di baris USD
  const cleanSnippet = usdSnippet.replace(/<[^>]+>/g, ' ');
  const rpRegex = /Rp\s*([\d\.]+(?:,\d{1,2})?)/gi;
  const matches = [];
  let m;
  while ((m = rpRegex.exec(cleanSnippet)) !== null) {
    matches.push(m[1].trim());
  }

  // Trend detection
  let trend = 'flat';
  let trendText = '';
  let selisih = '0,00';
  let selisihNum = 0;

  const trendMatch = usdSnippet.match(/(?:aria-label|title)=["']([^"']*Kurs tengah[^"']*)["']/i);
  if (trendMatch) {
    trendText = trendMatch[1];
    if (/naik/i.test(trendText)) trend = 'up';
    else if (/turun/i.test(trendText)) trend = 'down';

    const diffMatch = trendText.match(/Rp\s*([\d\.]+(?:,\d{1,2})?)/i);
    if (diffMatch) {
      selisih = diffMatch[1];
      selisihNum = parseRupiahNumber(selisih);
      if (trend === 'down') selisihNum = -Math.abs(selisihNum);
    }
  }

  // Urutan kolom: 0 = Kurs Jual, 1 = Kurs Beli, 2 = Kurs Tengah
  const kursJual = matches[0] || '0,00';
  const kursBeli = matches[1] || '0,00';
  const kursTengah = matches[2] || '0,00';

  if (!kursTengah || kursTengah === '0,00') {
    throw new Error('Gagal mengekstrak angka Kurs Tengah USD dari baris Ortax.');
  }

  const result = {
    currency: 'USD',
    name: 'Dolar Amerika Serikat',
    tanggal: tanggal || new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
    kursTengah,
    kursTengahNum: parseRupiahNumber(kursTengah),
    kursJual,
    kursJualNum: parseRupiahNumber(kursJual),
    kursBeli,
    kursBeliNum: parseRupiahNumber(kursBeli),
    trend,
    trendText: trendText || `Kurs tengah ${kursTengah}`,
    selisih,
    selisihNum,
    source: url,
    scrapedAt: new Date().toISOString(),
    isLive: true,
  };

  return result;
}

/**
 * Fallback scraping langsung dari halaman USD: https://datacenter.ortax.org/ortax/kursbi/show/USD
 */
async function scrapeOrtaxUsdFallback() {
  const url = 'https://datacenter.ortax.org/ortax/kursbi/show/USD';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };

  const response = await axios.get(url, { headers, timeout: 20000 });
  const html = response.data;

  // Ekstrak Kurs Tengah dari judul card
  const middleMatch =
    html.match(/Kurs Tengah\s*[·\.]\s*USD[\s\S]{1,150}?Rp\s*([\d\.]+(?:,\d{2})?)/i) ||
    html.match(/Rp\s*([\d\.]+(?:,\d{2})?)/i);

  const dateMatch = html.match(/(\d{1,2}\s+(?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+\d{4})/i);

  const kursTengah = middleMatch ? middleMatch[1] : '0,00';
  const tanggal = dateMatch ? dateMatch[1] : new Date().toLocaleDateString('id-ID');

  return {
    currency: 'USD',
    name: 'Dolar Amerika Serikat',
    tanggal,
    kursTengah,
    kursTengahNum: parseRupiahNumber(kursTengah),
    kursJual: '0,00',
    kursJualNum: 0,
    kursBeli: '0,00',
    kursBeliNum: 0,
    trend: 'flat',
    trendText: `Kurs tengah USD: Rp ${kursTengah}`,
    selisih: '0,00',
    selisihNum: 0,
    source: url,
    scrapedAt: new Date().toISOString(),
    isLive: true,
  };
}

/**
 * Mengambil data kurs USD saat ini (dengan cache cerdas & fallback)
 */
async function getKursUsd({ forceRefresh = false } = {}) {
  // 1. Cek in-memory cache jika masih baru (< CACHE_TTL_MS) dan tidak dipaksa refresh
  const now = Date.now();
  if (!forceRefresh && kursCache && (now - lastScrapedTime < CACHE_TTL_MS)) {
    return { ...kursCache, fromCache: true };
  }

  // 2. Jika belum ada di memory, coba load dari file cache
  if (!kursCache) {
    loadFromFileCache();
    if (!forceRefresh && kursCache && (now - lastScrapedTime < CACHE_TTL_MS)) {
      return { ...kursCache, fromCache: true };
    }
  }

  // 3. Lakukan scraping baru
  try {
    console.log('🔄 [KURS] Menjalankan scraping Kurs Tengah USD dari Ortax...');
    let data;
    try {
      data = await scrapeOrtaxKursUsd();
    } catch (primaryErr) {
      console.warn(`⚠️ [KURS] Gagal scrape dari list, mencoba fallback show/USD: ${primaryErr.message}`);
      data = await scrapeOrtaxUsdFallback();
    }

    kursCache = data;
    lastScrapedTime = Date.now();

    // Simpan ke file cache & PostgreSQL
    saveToFileCache(data);
    await saveToDatabase(data);

    console.log(`✅ [KURS] Berhasil memperbarui Kurs USD: Rp ${data.kursTengah} (${data.tanggal}) [${data.trend.toUpperCase()}]`);
    return { ...data, fromCache: false };
  } catch (err) {
    console.error('❌ [KURS] Error saat scraping Kurs Ortax:', err.message);

    // Fallback ke cache sebelumnya jika scraping gagal (agar UI tidak pecah)
    if (kursCache) {
      return {
        ...kursCache,
        fromCache: true,
        stale: true,
        warning: `Gagal memperbarui kurs terbaru: ${err.message}. Menampilkan data cache terakhir.`,
      };
    }

    throw err;
  }
}

/**
 * Mengambil riwayat data kurs dari database PostgreSQL (jika ada)
 */
async function getKursHistory(limit = 14) {
  if (!dbService.isAvailable()) {
    return kursCache ? [kursCache] : [];
  }

  try {
    const client = await dbService.getPool().connect();
    try {
      const res = await client.query(`
        SELECT
          currency, name, kurs_tengah, kurs_jual, kurs_beli,
          kurs_tengah_raw, kurs_jual_raw, kurs_beli_raw,
          trend, trend_text, selisih, selisih_num, tanggal, source, created_at
        FROM kurs_history
        WHERE currency = 'USD'
        ORDER BY created_at DESC
        LIMIT $1
      `, [limit]);

      return res.rows.map(r => ({
        currency: r.currency,
        name: r.name,
        kursTengah: r.kurs_tengah_raw || String(r.kurs_tengah),
        kursTengahNum: Number(r.kurs_tengah),
        kursJual: r.kurs_jual_raw || String(r.kurs_jual),
        kursJualNum: Number(r.kurs_jual),
        kursBeli: r.kurs_beli_raw || String(r.kurs_beli),
        kursBeliNum: Number(r.kurs_beli),
        trend: r.trend,
        trendText: r.trend_text,
        selisih: r.selisih,
        selisihNum: Number(r.selisih_num || 0),
        tanggal: r.tanggal,
        source: r.source,
        createdAt: r.created_at,
      }));
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('⚠️ [KURS] Gagal mengambil riwayat kurs dari DB:', err.message);
    return kursCache ? [kursCache] : [];
  }
}

// Inisialisasi awal saat modul dimuat: coba baca cache file agar instan
loadFromFileCache();

module.exports = {
  getKursUsd,
  getKursHistory,
  scrapeOrtaxKursUsd,
  loadFromFileCache,
};
