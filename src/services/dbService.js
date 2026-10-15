const { Pool } = require('pg');
const env = require('../config/env');

let pool = null;
let isDbConnected = false;

/**
 * Inisialisasi koneksi pool PostgreSQL.
 */
function initDb() {
  if (!env.db.enabled) {
    console.log('ℹ️ PostgreSQL dinonaktifkan di .env (PG_ENABLED=false). Menggunakan In-Memory Cache.');
    return null;
  }

  if (pool) return pool;

  pool = new Pool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    ssl: env.db.ssl ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    console.error('❌ PostgreSQL Pool Error:', err.message);
    isDbConnected = false;
  });

  return pool;
}

/**
 * Membuat tabel dan indeks yang dibutuhkan jika belum ada.
 */
async function migrateTables() {
  if (!initDb()) return false;

  try {
    const client = await pool.connect();
    try {
      // 1. Coba aktifkan ekstensi pg_trgm untuk pencarian fuzzy berkecepatan tinggi
      try {
        await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
      } catch (extErr) {
        console.warn('ℹ️ pg_trgm extension tidak aktif (memerlukan hak superuser), menggunakan pencarian ILIKE standar.');
      }

      // 2. Tabel Master Material
      await client.query(`
        CREATE TABLE IF NOT EXISTS master_materials (
          kode VARCHAR(50) PRIMARY KEY,
          nama TEXT NOT NULL,
          no_urut VARCHAR(50),
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_mat_nama ON master_materials (nama);
      `);

      // 3. Tabel Master Supplier Material
      await client.query(`
        CREATE TABLE IF NOT EXISTS master_suppliers (
          id SERIAL PRIMARY KEY,
          kode VARCHAR(50) NOT NULL,
          nama TEXT,
          supplier_utama TEXT,
          frekuensi INT DEFAULT 0,
          total_qty NUMERIC DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_sup_kode ON master_suppliers (kode);
        CREATE INDEX IF NOT EXISTS idx_sup_nama ON master_suppliers (nama);
      `);

      // 4. Tabel Transaksi PO 2026
      await client.query(`
        CREATE TABLE IF NOT EXISTS transactions_po (
          id SERIAL PRIMARY KEY,
          row_index INT,
          no_urut VARCHAR(50),
          status VARCHAR(50),
          tanggal VARCHAR(50),
          no_po VARCHAR(100) NOT NULL,
          supplier TEXT,
          quotation TEXT,
          kode_material VARCHAR(50),
          nama_material TEXT,
          qty NUMERIC DEFAULT 0,
          price_unit NUMERIC DEFAULT 0,
          discount NUMERIC DEFAULT 0,
          ppn NUMERIC DEFAULT 0,
          total NUMERIC DEFAULT 0,
          no_grpo VARCHAR(100),
          last_grpo_date VARCHAR(50),
          tgl_bayar VARCHAR(50),
          tgl_invoice VARCHAR(50),
          no_invoice VARCHAR(100),
          ket TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_po_nopo ON transactions_po (no_po);
      `);

      // 5. Tabel Riwayat Harga Material (Min, Max, Terakhir)
      await client.query(`
        CREATE TABLE IF NOT EXISTS material_prices (
          kode VARCHAR(50) PRIMARY KEY,
          nama TEXT,
          harga_min NUMERIC DEFAULT 0,
          harga_max NUMERIC DEFAULT 0,
          harga_terakhir NUMERIC DEFAULT 0,
          supplier_terakhir TEXT,
          tgl_terakhir VARCHAR(50),
          total_transaksi INT DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_mat_prices_kode ON material_prices (kode);
      `);

      isDbConnected = true;
      console.log('✅ PostgreSQL Schema siap & termigrasi.');
      return true;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('❌ Gagal inisialisasi tabel PostgreSQL:', err.message);
    isDbConnected = false;
    return false;
  }
}

/**
 * Sinkronisasi data dari Google Sheets ke PostgreSQL (Batch Upsert).
 */
async function syncFromSheetsToPg(materials, suppliers, poItems = [], priceList = []) {
  if (!isDbConnected && !(await migrateTables())) {
    return false;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Upsert Materials
    if (materials && materials.length > 0) {
      for (const m of materials) {
        await client.query(`
          INSERT INTO master_materials (kode, nama, no_urut, updated_at)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
          ON CONFLICT (kode) DO UPDATE SET
            nama = EXCLUDED.nama,
            no_urut = EXCLUDED.no_urut,
            updated_at = CURRENT_TIMESTAMP;
        `, [m.kode, m.nama, m.no || '']);
      }
    }

    // 2. Refresh Suppliers
    if (suppliers && suppliers.length > 0) {
      await client.query('TRUNCATE TABLE master_suppliers RESTART IDENTITY;');
      for (const s of suppliers) {
        await client.query(`
          INSERT INTO master_suppliers (kode, nama, supplier_utama, frekuensi, total_qty)
          VALUES ($1, $2, $3, $4, $5);
        `, [s.kode, s.nama, s.supplierUtama, s.frekuensi || 0, s.totalQty || 0]);
      }
    }

    // 3. Refresh Transactions PO jika disediakan
    if (poItems && poItems.length > 0) {
      await client.query('TRUNCATE TABLE transactions_po RESTART IDENTITY;');
      for (const p of poItems) {
        await client.query(`
          INSERT INTO transactions_po (
            row_index, no_urut, status, tanggal, no_po, supplier, quotation,
            kode_material, nama_material, qty, price_unit, discount, ppn,
            total, no_grpo, last_grpo_date, tgl_bayar, tgl_invoice, no_invoice, ket
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20);
        `, [
          p.rowIndex || 0, p.no || '', p.status || 'Open', p.date || '', p.noPo || '',
          p.supplier || '', p.quotation || '', p.kode || '', p.nama || '', p.qty || 0,
          p.priceUnit || 0, p.discount || 0, p.ppn || 0, p.total || 0, p.grpo || '',
          p.lastGrpoDate || '', p.tglBayar || '', p.tglInvoice || '', p.noInvoice || '', p.ket || ''
        ]);
      }
    }

    // 4. Upsert Riwayat Harga Material (Min, Max, Terakhir)
    if (priceList && priceList.length > 0) {
      for (const pr of priceList) {
        await client.query(`
          INSERT INTO material_prices (
            kode, nama, harga_min, harga_max, harga_terakhir,
            supplier_terakhir, tgl_terakhir, total_transaksi, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
          ON CONFLICT (kode) DO UPDATE SET
            nama = EXCLUDED.nama,
            harga_min = EXCLUDED.harga_min,
            harga_max = EXCLUDED.harga_max,
            harga_terakhir = EXCLUDED.harga_terakhir,
            supplier_terakhir = EXCLUDED.supplier_terakhir,
            tgl_terakhir = EXCLUDED.tgl_terakhir,
            total_transaksi = EXCLUDED.total_transaksi,
            updated_at = CURRENT_TIMESTAMP;
        `, [
          pr.kode, pr.nama || '', pr.minPrice || 0, pr.maxPrice || 0, pr.latestPrice || 0,
          pr.latestSupplier || '', pr.latestDate || '', pr.totalOrders || 0
        ]);
      }
    }

    await client.query('COMMIT');
    console.log(`✅ Sinkronisasi PostgreSQL berhasil: ${materials.length} Material, ${suppliers.length} Supplier, ${priceList.length} Indeks Harga.`);
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error sync ke PostgreSQL:', err.message);
    return false;
  } finally {
    client.release();
  }
}

/**
 * Mencari rekomendasi supplier berdasarkan nama barang atau kode material.
 */
async function searchSupplierFromPg(query, limit = 10) {
  if (!isDbConnected && !(await migrateTables())) return null;

  try {
    const qPattern = `%${query.trim()}%`;
    const res = await pool.query(`
      SELECT kode, nama, supplier_utama as "supplierUtama", frekuensi, total_qty as "totalQty"
      FROM master_suppliers
      WHERE kode ILIKE $1 OR nama ILIKE $1 OR supplier_utama ILIKE $1
      ORDER BY frekuensi DESC, total_qty DESC
      LIMIT $2;
    `, [qPattern, limit]);

    return res.rows;
  } catch (err) {
    console.error('❌ Gagal query supplier dari PostgreSQL:', err.message);
    return null; // Fallback ke RAM
  }
}

/**
 * Mencari master material berdasarkan kode atau nama barang beserta histori harga.
 */
async function searchMaterialFromPg(query, limit = 15) {
  if (!isDbConnected && !(await migrateTables())) return null;

  try {
    const qPattern = `%${query.trim()}%`;
    const res = await pool.query(`
      SELECT
        m.kode,
        m.nama,
        m.no_urut as "no",
        COALESCE(p.harga_min, 0)::numeric as "hargaMin",
        COALESCE(p.harga_max, 0)::numeric as "hargaMax",
        COALESCE(p.harga_terakhir, 0)::numeric as "hargaTerakhir",
        COALESCE(p.supplier_terakhir, '') as "supplierTerakhir",
        COALESCE(p.tgl_terakhir, '') as "tglTerakhir",
        COALESCE(p.total_transaksi, 0) as "totalTransaksi"
      FROM master_materials m
      LEFT JOIN material_prices p ON m.kode = p.kode
      WHERE m.kode ILIKE $1 OR m.nama ILIKE $1
      ORDER BY CASE WHEN m.kode ILIKE $1 THEN 1 ELSE 2 END, m.kode ASC
      LIMIT $2;
    `, [qPattern, limit]);

    return res.rows.map(r => ({
      ...r,
      hargaMin: parseFloat(r.hargaMin) || 0,
      hargaMax: parseFloat(r.hargaMax) || 0,
      hargaTerakhir: parseFloat(r.hargaTerakhir) || 0,
    }));
  } catch (err) {
    console.error('❌ Gagal query material dari PostgreSQL:', err.message);
    return null;
  }
}

/**
 * Mengambil detail PO berdasarkan Nomor PO dari database PostgreSQL.
 */
async function getPOFromPg(noPo) {
  if (!isDbConnected && !(await migrateTables())) return null;

  try {
    const cleanNo = noPo.trim();
    const res = await pool.query(`
      SELECT *
      FROM transactions_po
      WHERE UPPER(no_po) = UPPER($1)
      ORDER BY id ASC;
    `, [cleanNo]);

    if (res.rows.length === 0) return null;

    const first = res.rows[0];
    const items = res.rows.map(r => ({
      rowIndex: r.row_index,
      no: r.no_urut,
      status: r.status,
      date: r.tanggal,
      noPo: r.no_po,
      supplier: r.supplier,
      quotation: r.quotation,
      kode: r.kode_material,
      nama: r.nama_material,
      qty: parseFloat(r.qty) || 0,
      priceUnit: parseFloat(r.price_unit) || 0,
      discount: parseFloat(r.discount) || 0,
      ppn: parseFloat(r.ppn) || 0,
      total: parseFloat(r.total) || 0,
      grpo: r.no_grpo,
      lastGrpoDate: r.last_grpo_date,
      tglBayar: r.tgl_bayar,
      tglInvoice: r.tgl_invoice,
      noInvoice: r.no_invoice,
      ket: r.ket,
    }));

    const grandTotal = items.reduce((sum, it) => sum + it.total, 0);

    return {
      noPo: first.no_po,
      supplier: first.supplier,
      date: first.tanggal,
      status: first.status,
      grpo: first.no_grpo,
      lastGrpoDate: first.last_grpo_date,
      tglBayar: first.tgl_bayar,
      noInvoice: first.no_invoice,
      tglInvoice: first.tgl_invoice,
      grandTotal,
      items,
    };
  } catch (err) {
    console.error('❌ Gagal query PO dari PostgreSQL:', err.message);
    return null;
  }
}

/**
 * Mengambil daftar barang yang pernah diorder dari Supplier X beserta harga min, max, terbaru, dan no PO.
 */
async function getSupplierItemsFromPg(supplierQuery, limit = 15) {
  if (!isDbConnected && !(await migrateTables())) return null;

  try {
    const qPattern = `%${supplierQuery.trim()}%`;
    const res = await pool.query(`
      SELECT 
        t.supplier,
        t.kode_material as "kode",
        t.nama_material as "nama",
        MIN(t.price_unit)::numeric as "hargaMin",
        MAX(t.price_unit)::numeric as "hargaMax",
        COUNT(DISTINCT t.no_po)::int as "totalOrders",
        ARRAY_AGG(DISTINCT t.no_po) as "poList",
        (ARRAY_AGG(t.price_unit ORDER BY t.id DESC))[1]::numeric as "hargaTerbaru",
        (ARRAY_AGG(t.tanggal ORDER BY t.id DESC))[1] as "tglTerbaru"
      FROM transactions_po t
      WHERE t.supplier ILIKE $1 AND t.price_unit > 0
      GROUP BY t.supplier, t.kode_material, t.nama_material
      ORDER BY COUNT(DISTINCT t.no_po) DESC, MAX(t.id) DESC
      LIMIT $2;
    `, [qPattern, limit]);

    if (res.rows.length === 0) return null;

    const items = res.rows.map(r => ({
      kode: r.kode,
      nama: r.nama,
      hargaMin: parseFloat(r.hargaMin) || 0,
      hargaMax: parseFloat(r.hargaMax) || 0,
      hargaTerbaru: parseFloat(r.hargaTerbaru) || 0,
      tglTerbaru: r.tglTerbaru || '',
      poList: r.poList || [],
      totalOrders: r.totalOrders || (r.poList ? r.poList.length : 1),
    }));

    return {
      supplier: res.rows[0].supplier,
      totalItems: items.length,
      items,
    };
  } catch (err) {
    console.error('❌ Gagal query riwayat supplier dari PostgreSQL:', err.message);
    return null;
  }
}

function isAvailable() {
  return isDbConnected;
}

module.exports = {
  initDb,
  migrateTables,
  syncFromSheetsToPg,
  searchSupplierFromPg,
  searchMaterialFromPg,
  getPOFromPg,
  getSupplierItemsFromPg,
  isAvailable,
};
