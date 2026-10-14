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
async function syncFromSheetsToPg(materials, suppliers, poItems = []) {
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

    await client.query('COMMIT');
    console.log(`✅ Sinkronisasi PostgreSQL berhasil: ${materials.length} Material, ${suppliers.length} Supplier.`);
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
 * Mencari master material berdasarkan kode atau nama barang.
 */
async function searchMaterialFromPg(query, limit = 15) {
  if (!isDbConnected && !(await migrateTables())) return null;

  try {
    const qPattern = `%${query.trim()}%`;
    const res = await pool.query(`
      SELECT kode, nama, no_urut as "no"
      FROM master_materials
      WHERE kode ILIKE $1 OR nama ILIKE $1
      ORDER BY CASE WHEN kode ILIKE $1 THEN 1 ELSE 2 END, kode ASC
      LIMIT $2;
    `, [qPattern, limit]);

    return res.rows;
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
  isAvailable,
};
