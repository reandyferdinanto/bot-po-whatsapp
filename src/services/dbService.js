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

      // 4. Tabel Transaksi PO (Mendukung Multi-Tahun 2017 - 2026)
      await client.query(`
        CREATE TABLE IF NOT EXISTS transactions_po (
          id SERIAL PRIMARY KEY,
          row_index INT,
          no_urut TEXT,
          status TEXT,
          tanggal TEXT,
          no_po TEXT NOT NULL,
          supplier TEXT,
          quotation TEXT,
          kode_material TEXT,
          nama_material TEXT,
          qty NUMERIC DEFAULT 0,
          price_unit NUMERIC DEFAULT 0,
          discount NUMERIC DEFAULT 0,
          ppn NUMERIC DEFAULT 0,
          total NUMERIC DEFAULT 0,
          no_grpo TEXT,
          last_grpo_date TEXT,
          tgl_bayar TEXT,
          tgl_invoice TEXT,
          no_invoice TEXT,
          ket TEXT,
          sheet_name TEXT DEFAULT 'PO 2026',
          tahun TEXT DEFAULT '2026',
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_po_nopo ON transactions_po (no_po);
        ALTER TABLE transactions_po ADD COLUMN IF NOT EXISTS sheet_name TEXT DEFAULT 'PO 2026';
        ALTER TABLE transactions_po ADD COLUMN IF NOT EXISTS tahun TEXT DEFAULT '2026';
        ALTER TABLE transactions_po ALTER COLUMN no_urut TYPE TEXT;
        ALTER TABLE transactions_po ALTER COLUMN status TYPE TEXT;
        ALTER TABLE transactions_po ALTER COLUMN tanggal TYPE TEXT;
        ALTER TABLE transactions_po ALTER COLUMN no_po TYPE TEXT;
        ALTER TABLE transactions_po ALTER COLUMN kode_material TYPE TEXT;
        ALTER TABLE transactions_po ALTER COLUMN no_grpo TYPE TEXT;
        ALTER TABLE transactions_po ALTER COLUMN last_grpo_date TYPE TEXT;
        ALTER TABLE transactions_po ALTER COLUMN tgl_bayar TYPE TEXT;
        ALTER TABLE transactions_po ALTER COLUMN tgl_invoice TYPE TEXT;
        ALTER TABLE transactions_po ALTER COLUMN no_invoice TYPE TEXT;
        ALTER TABLE transactions_po ALTER COLUMN sheet_name TYPE TEXT;
        ALTER TABLE transactions_po ALTER COLUMN tahun TYPE TEXT;
        CREATE INDEX IF NOT EXISTS idx_po_tahun ON transactions_po (tahun);
        CREATE INDEX IF NOT EXISTS idx_po_sheet ON transactions_po (sheet_name);
      `);

      // 5. Tabel Riwayat Harga Material (Min, Max, Terakhir)
      await client.query(`
        CREATE TABLE IF NOT EXISTS material_prices (
          kode VARCHAR(100) PRIMARY KEY,
          nama TEXT,
          harga_min NUMERIC DEFAULT 0,
          harga_max NUMERIC DEFAULT 0,
          harga_terakhir NUMERIC DEFAULT 0,
          supplier_terakhir TEXT,
          tgl_terakhir TEXT,
          latest_po TEXT,
          total_transaksi INT DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        ALTER TABLE material_prices ADD COLUMN IF NOT EXISTS latest_po TEXT;
        ALTER TABLE material_prices ALTER COLUMN kode TYPE VARCHAR(100);
        ALTER TABLE material_prices ALTER COLUMN tgl_terakhir TYPE TEXT;
        CREATE INDEX IF NOT EXISTS idx_mat_prices_kode ON material_prices (kode);
      `);

      // 6. Tabel Riwayat Kurs (USD dsb.)
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
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_kurs_currency_created ON kurs_history (currency, created_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_kurs_currency_tanggal ON kurs_history (currency, tanggal);
      `);

      // 7. Tabel Finance Budgets (Kasbon & Settlement)
      await client.query(`
        CREATE TABLE IF NOT EXISTS finance_budgets (
          id SERIAL PRIMARY KEY,
          row_index INT,
          no_budget VARCHAR(50) UNIQUE NOT NULL,
          nama TEXT NOT NULL,
          uraian TEXT NOT NULL,
          jumlah NUMERIC NOT NULL DEFAULT 0,
          tgl_kasbon TEXT NOT NULL,
          divisi TEXT NOT NULL,
          no_wa TEXT,
          realisasi_belanja NUMERIC DEFAULT 0,
          sisa_kembali NUMERIC DEFAULT 0,
          bukti_nota TEXT,
          status VARCHAR(30) DEFAULT 'PENDING',
          tgl_selesai TEXT,
          catatan_finance TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_fb_no_budget ON finance_budgets (no_budget);
        CREATE INDEX IF NOT EXISTS idx_fb_status ON finance_budgets (status);
        CREATE INDEX IF NOT EXISTS idx_fb_divisi ON finance_budgets (divisi);
      `);

      // 8. Tabel App Settings (Konfigurasi Dinamis Google Drive, dsb.)
      await client.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key VARCHAR(100) PRIMARY KEY,
          value TEXT,
          description TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 9. Tabel PO Documents (Riwayat Arsip Dokumen PO, GRPO, Bukti Bayar di Google Drive)
      await client.query(`
        CREATE TABLE IF NOT EXISTS po_documents (
          id SERIAL PRIMARY KEY,
          no_po TEXT NOT NULL,
          tipe_dokumen VARCHAR(50) NOT NULL,
          file_name TEXT,
          drive_file_id TEXT NOT NULL,
          drive_url TEXT,
          mime_type VARCHAR(100),
          file_size INT DEFAULT 0,
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_pdoc_nopo ON po_documents (no_po);
        CREATE INDEX IF NOT EXISTS idx_pdoc_tipe ON po_documents (tipe_dokumen);
        CREATE INDEX IF NOT EXISTS idx_pdoc_created ON po_documents (created_at DESC);
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
async function syncFromSheetsToPg(materials, suppliers, poItems = [], priceList = [], options = {}) {
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

    // 3. Transactions PO (Support Full Replace vs Specific Sheet Update)
    if (poItems && poItems.length > 0) {
      if (options.fullReplace) {
        await client.query('TRUNCATE TABLE transactions_po RESTART IDENTITY;');
      } else {
        const affectedSheets = [...new Set(poItems.map(p => p.sheetName || 'PO 2026'))];
        await client.query('DELETE FROM transactions_po WHERE sheet_name = ANY($1);', [affectedSheets]);
      }

      // Batch insert in chunks of 100 items (22 columns = 2200 parameters per query)
      const chunkSize = 100;
      for (let i = 0; i < poItems.length; i += chunkSize) {
        const chunk = poItems.slice(i, i + chunkSize);
        const valuePlaceholders = [];
        const params = [];
        let pIdx = 1;

        for (const p of chunk) {
          const rowParams = [
            p.rowIndex || 0,
            p.no || '',
            p.status || 'Open',
            p.date || '',
            p.noPo || '',
            p.supplier || '',
            p.quotation || '',
            p.kode || '',
            p.nama || '',
            p.qty || 0,
            p.priceUnit || 0,
            p.discount || 0,
            p.ppn || 0,
            p.total || 0,
            p.grpo || '',
            p.lastGrpoDate || '',
            p.tglBayar || '',
            p.tglInvoice || '',
            p.noInvoice || '',
            p.ket || '',
            p.sheetName || 'PO 2026',
            p.year || '2026'
          ];
          const placeholders = rowParams.map(() => `$${pIdx++}`);
          valuePlaceholders.push(`(${placeholders.join(', ')})`);
          params.push(...rowParams);
        }

        const insertQuery = `
          INSERT INTO transactions_po (
            row_index, no_urut, status, tanggal, no_po, supplier, quotation,
            kode_material, nama_material, qty, price_unit, discount, ppn,
            total, no_grpo, last_grpo_date, tgl_bayar, tgl_invoice, no_invoice, ket,
            sheet_name, tahun
          ) VALUES ${valuePlaceholders.join(', ')};
        `;
        await client.query(insertQuery, params);
      }
    }

    // 4. Upsert Riwayat Harga Material (Min, Max, Terakhir)
    if (priceList && priceList.length > 0) {
      for (const pr of priceList) {
        await client.query(`
          INSERT INTO material_prices (
            kode, nama, harga_min, harga_max, harga_terakhir,
            supplier_terakhir, tgl_terakhir, latest_po, total_transaksi, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
          ON CONFLICT (kode) DO UPDATE SET
            nama = EXCLUDED.nama,
            harga_min = EXCLUDED.harga_min,
            harga_max = EXCLUDED.harga_max,
            harga_terakhir = EXCLUDED.harga_terakhir,
            supplier_terakhir = EXCLUDED.supplier_terakhir,
            tgl_terakhir = EXCLUDED.tgl_terakhir,
            latest_po = EXCLUDED.latest_po,
            total_transaksi = EXCLUDED.total_transaksi,
            updated_at = CURRENT_TIMESTAMP;
        `, [
          pr.kode, pr.nama || '', pr.minPrice || 0, pr.maxPrice || 0, pr.latestPrice || 0,
          pr.latestSupplier || '', pr.latestDate || '', pr.latestPo || '', pr.totalOrders || 0
        ]);
      }
    }

    await client.query('COMMIT');
    console.log(`✅ Sinkronisasi PostgreSQL berhasil: ${materials.length} Material, ${suppliers.length} Supplier, ${poItems.length} Transaksi PO (${options.fullReplace ? 'Full Replace' : 'Partial'}), ${priceList.length} Indeks Harga.`);
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
 * Mengambil katalog master material dengan pagination dan histori harga terakhir dari PostgreSQL.
 */
async function getAllMaterialsFromPg(query = '', page = 1, limit = 50) {
  if (!isDbConnected && !(await migrateTables())) return null;

  try {
    const offset = (page - 1) * limit;
    let countQuery = 'SELECT count(*) FROM master_materials';
    let dataQuery = `
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
    `;

    const countParams = [];
    const dataParams = [];

    if (query) {
      const qPattern = `%${query.trim()}%`;
      countQuery += ' WHERE kode ILIKE $1 OR nama ILIKE $1';
      countParams.push(qPattern);

      dataQuery += ' WHERE m.kode ILIKE $1 OR m.nama ILIKE $1';
      dataParams.push(qPattern);

      dataQuery += ' ORDER BY CASE WHEN m.kode ILIKE $1 THEN 1 ELSE 2 END, m.kode ASC LIMIT $2 OFFSET $3';
      dataParams.push(limit, offset);
    } else {
      dataQuery += ' ORDER BY NULLIF(regexp_replace(m.no_urut, \'\\D\', \'\', \'g\'), \'\')::int NULLS LAST, m.kode ASC LIMIT $1 OFFSET $2';
      dataParams.push(limit, offset);
    }

    const [countRes, dataRes] = await Promise.all([
      pool.query(countQuery, countParams),
      pool.query(dataQuery, dataParams),
    ]);

    const total = parseInt(countRes.rows[0].count, 10) || 0;
    const items = dataRes.rows.map(r => ({
      ...r,
      hargaMin: parseFloat(r.hargaMin) || 0,
      hargaMax: parseFloat(r.hargaMax) || 0,
      hargaTerakhir: parseFloat(r.hargaTerakhir) || 0,
    }));

    return { total, page, limit, items };
  } catch (err) {
    console.warn('⚠️ Gagal query getAllMaterialsFromPg:', err.message);
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

/**
 * Mengambil daftar supplier lengkap dengan ragam material dan referensi harga (Min, Max, Last Price) dari PostgreSQL.
 */
async function getAllSuppliersFromPg(query = '', page = 1, limit = 25) {
  if (!isDbConnected && !(await migrateTables())) return null;

  try {
    let whereClause = '';
    const params = [];
    if (query) {
      params.push(`%${query.trim()}%`);
      whereClause = `AND (t.supplier ILIKE $1 OR t.kode_material ILIKE $1 OR t.nama_material ILIKE $1)`;
    }

    const sql = `
      WITH supplier_materials AS (
        SELECT 
          t.supplier as "supplierName",
          t.kode_material as "kode",
          t.nama_material as "nama",
          MIN(t.price_unit)::numeric as "hargaMin",
          MAX(t.price_unit)::numeric as "hargaMax",
          (ARRAY_AGG(t.price_unit ORDER BY t.id DESC))[1]::numeric as "hargaTerbaru",
          (ARRAY_AGG(t.tanggal ORDER BY t.id DESC))[1] as "tglTerbaru",
          (ARRAY_AGG(t.no_po ORDER BY t.id DESC))[1] as "latestPo",
          ARRAY_AGG(DISTINCT t.no_po) as "poList",
          COUNT(DISTINCT t.no_po)::int as "frekuensi",
          SUM(t.qty)::numeric as "totalQty",
          SUM(t.total)::numeric as "itemTotalSpend"
        FROM transactions_po t
        WHERE t.supplier IS NOT NULL AND TRIM(t.supplier) != '' AND t.price_unit > 0
        ${whereClause}
        GROUP BY t.supplier, t.kode_material, t.nama_material
      )
      SELECT 
        sm."supplierName",
        COUNT(DISTINCT sm."kode")::int as "totalMaterials",
        SUM(sm."frekuensi")::int as "totalFrequency",
        SUM(sm."totalQty")::numeric as "totalQty",
        SUM(sm."itemTotalSpend")::numeric as "totalSpend",
        MIN(sm."hargaMin")::numeric as "supplierMinPrice",
        MAX(sm."hargaMax")::numeric as "supplierMaxPrice",
        (ARRAY_AGG(sm."hargaTerbaru" ORDER BY sm."frekuensi" DESC))[1]::numeric as "supplierLatestPrice",
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'kode', sm."kode",
            'nama', sm."nama",
            'hargaMin', sm."hargaMin",
            'hargaMax', sm."hargaMax",
            'hargaTerbaru', sm."hargaTerbaru",
            'tglTerbaru', sm."tglTerbaru",
            'latestPo', sm."latestPo",
            'poList', sm."poList",
            'frekuensi', sm."frekuensi",
            'totalQty', sm."totalQty"
          ) ORDER BY sm."frekuensi" DESC
        ) as "materials"
      FROM supplier_materials sm
      GROUP BY sm."supplierName"
      ORDER BY COUNT(DISTINCT sm."kode") DESC, SUM(sm."frekuensi") DESC;
    `;

    const res = await pool.query(sql, params);
    if (!res.rows || res.rows.length === 0) return null;

    const allSuppliers = res.rows.map((r) => ({
      supplierName: r.supplierName,
      totalMaterials: parseInt(r.totalMaterials, 10) || 0,
      totalFrequency: parseInt(r.totalFrequency, 10) || 0,
      totalQty: parseFloat(r.totalQty) || 0,
      totalSpend: parseFloat(r.totalSpend) || 0,
      supplierMinPrice: parseFloat(r.supplierMinPrice) || 0,
      supplierMaxPrice: parseFloat(r.supplierMaxPrice) || 0,
      supplierLatestPrice: parseFloat(r.supplierLatestPrice) || 0,
      materials: (r.materials || []).map((m) => ({
        ...m,
        hargaMin: parseFloat(m.hargaMin) || 0,
        hargaMax: parseFloat(m.hargaMax) || 0,
        hargaTerbaru: parseFloat(m.hargaTerbaru) || 0,
        totalQty: parseFloat(m.totalQty) || 0,
      })),
    }));

    const total = allSuppliers.length;
    const startIndex = (page - 1) * limit;
    const items = allSuppliers.slice(startIndex, startIndex + limit);

    return { total, page, limit, items };
  } catch (err) {
    console.error('❌ Gagal query suppliers dari PostgreSQL:', err.message);
    return null;
  }
}

/**
 * Mengambil rekap analitik multi-tahun (2017-2026) langsung dari PostgreSQL.
 */
async function getHistoricalStatsFromPg() {
  if (!isDbConnected && !(await migrateTables())) return null;

  try {
    const breakdownRes = await pool.query(`
      SELECT
        tahun as "year",
        sheet_name as "sheetName",
        COUNT(*)::int as "totalRows",
        COUNT(DISTINCT no_po)::int as "totalPOs",
        COALESCE(SUM(total), 0)::numeric as "totalSpend",
        COUNT(*) FILTER (WHERE status ILIKE '%open%')::int as "countOpen",
        COUNT(*) FILTER (WHERE status ILIKE '%clos%' OR status ILIKE '%lunas%')::int as "countClose",
        COUNT(*) FILTER (WHERE status ILIKE '%pend%')::int as "countPending",
        COUNT(*) FILTER (WHERE status ILIKE '%cancel%')::int as "countCancelled"
      FROM transactions_po
      GROUP BY tahun, sheet_name
      ORDER BY tahun ASC;
    `);

    if (!breakdownRes.rows || breakdownRes.rows.length === 0) return null;

    const yearlyBreakdown = breakdownRes.rows.map((r) => ({
      year: r.year,
      sheetName: r.sheetName,
      totalRows: r.totalRows,
      totalPOs: r.totalPOs,
      totalSpend: Math.round(parseFloat(r.totalSpend) || 0),
      countOpen: r.countOpen,
      countClose: r.countClose,
      countPending: r.countPending,
      countCancelled: r.countCancelled,
    }));

    const totalAllRows = yearlyBreakdown.reduce((sum, y) => sum + y.totalRows, 0);
    const totalAllSpend = yearlyBreakdown.reduce((sum, y) => sum + y.totalSpend, 0);

    const distinctPoRes = await pool.query(`SELECT COUNT(DISTINCT no_po)::int as "totalAllPOs" FROM transactions_po;`);
    const totalAllPOs = distinctPoRes.rows[0]?.totalAllPOs || 0;

    const topSuppliersRes = await pool.query(`
      SELECT
        supplier as "supplierName",
        COALESCE(SUM(total), 0)::numeric as "totalSpend",
        COUNT(DISTINCT no_po)::int as "totalOrders",
        COALESCE(SUM(qty), 0)::numeric as "totalQty"
      FROM transactions_po
      WHERE supplier IS NOT NULL AND TRIM(supplier) != ''
      GROUP BY supplier
      ORDER BY SUM(total) DESC
      LIMIT 10;
    `);
    const topSuppliersAllTime = topSuppliersRes.rows.map((s) => ({
      supplierName: s.supplierName,
      totalSpend: Math.round(parseFloat(s.totalSpend) || 0),
      totalOrders: s.totalOrders,
      totalQty: Math.round(parseFloat(s.totalQty) || 0),
    }));

    const topMaterialsRes = await pool.query(`
      SELECT
        kode_material as "kode",
        nama_material as "nama",
        COALESCE(SUM(qty), 0)::numeric as "totalQty",
        COUNT(DISTINCT no_po)::int as "orderCount",
        COALESCE(SUM(total), 0)::numeric as "totalSpend"
      FROM transactions_po
      WHERE (kode_material IS NOT NULL AND TRIM(kode_material) != '')
         OR (nama_material IS NOT NULL AND TRIM(nama_material) != '')
      GROUP BY kode_material, nama_material
      ORDER BY COUNT(DISTINCT no_po) DESC, SUM(qty) DESC
      LIMIT 10;
    `);
    const topMaterialsAllTime = topMaterialsRes.rows.map((m) => ({
      kode: m.kode || '',
      nama: m.nama || '',
      totalQty: Math.round(parseFloat(m.totalQty) || 0),
      orderCount: m.orderCount,
      totalSpend: Math.round(parseFloat(m.totalSpend) || 0),
    }));

    const sheetsSynced = yearlyBreakdown.map((y) => y.sheetName);

    return {
      totalYears: yearlyBreakdown.length,
      totalAllRows,
      totalAllPOs,
      totalAllSpend,
      averageSpendPerYear: Math.round(totalAllSpend / (yearlyBreakdown.length || 1)),
      yearlyBreakdown,
      topSuppliersAllTime,
      topMaterialsAllTime,
      sheetsSynced,
      lastSyncedAt: new Date(),
    };
  } catch (err) {
    console.error('❌ Gagal query historical stats dari PostgreSQL:', err.message);
    return null;
  }
}

/**
 * Mengambil daftar baris transaksi historis dari PostgreSQL dengan filter tahun, pencarian, dan paginasi.
 */
async function getHistoricalTransactionsFromPg(options = {}) {
  if (!isDbConnected && !(await migrateTables())) return null;

  try {
    const { year = 'ALL', search = '', page = 1, limit = 50 } = options;
    const conditions = [];
    const params = [];

    if (year && year !== 'ALL') {
      params.push(String(year));
      conditions.push(`tahun = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      const pIdx = params.length;
      conditions.push(`(
        no_po ILIKE $${pIdx} OR
        supplier ILIKE $${pIdx} OR
        kode_material ILIKE $${pIdx} OR
        nama_material ILIKE $${pIdx} OR
        no_grpo ILIKE $${pIdx} OR
        no_invoice ILIKE $${pIdx}
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(`SELECT COUNT(*)::int as total FROM transactions_po ${whereClause};`, params);
    const total = countRes.rows[0]?.total || 0;

    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const sql = `
      SELECT
        id,
        row_index as "rowIndex",
        no_urut as "no",
        status,
        tanggal as "date",
        no_po as "noPo",
        supplier,
        quotation,
        kode_material as "kode",
        nama_material as "nama",
        qty::numeric,
        price_unit::numeric as "priceUnit",
        discount::numeric,
        ppn::numeric,
        total::numeric,
        no_grpo as "grpo",
        last_grpo_date as "lastGrpoDate",
        tgl_bayar as "tglBayar",
        tgl_invoice as "tglInvoice",
        no_invoice as "noInvoice",
        ket,
        sheet_name as "sheetName",
        tahun as "year"
      FROM transactions_po
      ${whereClause}
      ORDER BY id ASC
      LIMIT $${params.length - 1} OFFSET $${params.length};
    `;

    const dataRes = await pool.query(sql, params);
    const items = dataRes.rows.map((r) => ({
      ...r,
      qty: parseFloat(r.qty) || 0,
      priceUnit: parseFloat(r.priceUnit) || 0,
      discount: parseFloat(r.discount) || 0,
      ppn: parseFloat(r.ppn) || 0,
      total: parseFloat(r.total) || 0,
    }));

    return { total, page, limit, items };
  } catch (err) {
    console.error('❌ Gagal query historical transactions dari PostgreSQL:', err.message);
    return null;
  }
}

/**
 * Memperbarui data transaksi suatu nomor PO di PostgreSQL (PO 2026).
 */
async function updatePoInPg(noPo, rows) {
  if (!isDbConnected && !(await migrateTables())) return false;
  try {
    const cleanNo = noPo.trim();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM transactions_po WHERE UPPER(no_po) = UPPER($1) AND tahun = $2', [cleanNo, '2026']);
      if (rows && rows.length > 0) {
        for (const r of rows) {
          await client.query(`
            INSERT INTO transactions_po (
              row_index, no_urut, status, tanggal, no_po, supplier, quotation,
              kode_material, nama_material, qty, price_unit, discount, ppn,
              total, no_grpo, last_grpo_date, tgl_bayar, tgl_invoice, no_invoice, ket,
              sheet_name, tahun
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
          `, [
            r.rowIndex || 0, r.no || '', r.status || 'Open', r.date || '', r.noPo || cleanNo,
            r.supplier || '', r.quotation || '', r.kode || '', r.nama || '',
            r.qty || 0, r.priceUnit || 0, r.discount || 0, r.ppn || 0, r.total || 0,
            r.grpo || '', r.lastGrpoDate || '', r.tglBayar || '', r.tglInvoice || '',
            r.noInvoice || '', r.ket || '', 'PO 2026', '2026'
          ]);
        }
      }
      await client.query('COMMIT');
      return true;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('⚠️ Gagal update PO di PostgreSQL:', err.message);
    return false;
  }
}

/**
 * Mengambil daftar kasbon / budgets dari PostgreSQL
 */
async function getAllBudgetsFromPg(filters = {}) {
  if (!isDbConnected && !(await migrateTables())) return [];
  try {
    let query = 'SELECT * FROM finance_budgets';
    const params = [];
    const conditions = [];

    if (filters.status && filters.status !== 'ALL') {
      params.push(filters.status.toUpperCase());
      conditions.push(`UPPER(status) = $${params.length}`);
    }
    if (filters.divisi && filters.divisi !== 'ALL') {
      params.push(filters.divisi);
      conditions.push(`LOWER(divisi) = LOWER($${params.length})`);
    }
    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(`(nama ILIKE $${params.length} OR no_budget ILIKE $${params.length} OR uraian ILIKE $${params.length})`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY id DESC';

    const res = await pool.query(query, params);
    return res.rows;
  } catch (err) {
    console.warn('⚠️ Gagal mengambil budgets dari PG:', err.message);
    return [];
  }
}

/**
 * Mengambil satu kasbon berdasarkan no_budget
 */
async function getBudgetByNoFromPg(noBudget) {
  if (!isDbConnected && !(await migrateTables())) return null;
  try {
    const res = await pool.query(
      'SELECT * FROM finance_budgets WHERE UPPER(no_budget) = UPPER($1) LIMIT 1',
      [String(noBudget).trim()]
    );
    return res.rows[0] || null;
  } catch (err) {
    console.warn('⚠️ Gagal getBudgetByNoFromPg:', err.message);
    return null;
  }
}

/**
 * Insert budget baru ke PostgreSQL
 */
async function insertBudgetToPg(data) {
  if (!isDbConnected && !(await migrateTables())) return null;
  try {
    const res = await pool.query(`
      INSERT INTO finance_budgets (
        row_index, no_budget, nama, uraian, jumlah, tgl_kasbon, divisi, no_wa,
        realisasi_belanja, sisa_kembali, bukti_nota, status, tgl_selesai, catatan_finance
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (no_budget) DO UPDATE SET
        nama = EXCLUDED.nama,
        uraian = EXCLUDED.uraian,
        jumlah = EXCLUDED.jumlah,
        tgl_kasbon = EXCLUDED.tgl_kasbon,
        divisi = EXCLUDED.divisi,
        no_wa = EXCLUDED.no_wa,
        realisasi_belanja = EXCLUDED.realisasi_belanja,
        sisa_kembali = EXCLUDED.sisa_kembali,
        bukti_nota = EXCLUDED.bukti_nota,
        status = EXCLUDED.status,
        tgl_selesai = EXCLUDED.tgl_selesai,
        catatan_finance = EXCLUDED.catatan_finance,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `, [
      data.rowIndex || 0,
      data.noBudget,
      data.nama,
      data.uraian,
      parseFloat(data.jumlah) || 0,
      data.tglKasbon,
      data.divisi,
      data.noWa || '',
      parseFloat(data.realisasiBelanja) || 0,
      parseFloat(data.sisaKembali) || 0,
      data.buktiNota || '',
      data.status || 'PENDING',
      data.tglSelesai || '',
      data.catatanFinance || ''
    ]);
    return res.rows[0];
  } catch (err) {
    console.warn('⚠️ Gagal insertBudgetToPg:', err.message);
    return null;
  }
}

/**
 * Update budget di PostgreSQL
 */
async function updateBudgetInPg(noBudget, updates) {
  if (!isDbConnected && !(await migrateTables())) return null;
  try {
    const keys = Object.keys(updates);
    if (keys.length === 0) return await getBudgetByNoFromPg(noBudget);

    const setClauses = [];
    const values = [String(noBudget).trim()];
    let idx = 2;

    const columnMap = {
      rowIndex: 'row_index',
      nama: 'nama',
      uraian: 'uraian',
      jumlah: 'jumlah',
      tglKasbon: 'tgl_kasbon',
      divisi: 'divisi',
      noWa: 'no_wa',
      realisasiBelanja: 'realisasi_belanja',
      sisaKembali: 'sisa_kembali',
      buktiNota: 'bukti_nota',
      status: 'status',
      tglSelesai: 'tgl_selesai',
      catatanFinance: 'catatan_finance'
    };

    for (const key of keys) {
      const col = columnMap[key] || key;
      setClauses.push(`${col} = $${idx}`);
      values.push(updates[key]);
      idx++;
    }
    setClauses.push('updated_at = CURRENT_TIMESTAMP');

    const query = `UPDATE finance_budgets SET ${setClauses.join(', ')} WHERE UPPER(no_budget) = UPPER($1) RETURNING *;`;
    const res = await pool.query(query, values);
    return res.rows[0] || null;
  } catch (err) {
    console.warn('⚠️ Gagal updateBudgetInPg:', err.message);
    return null;
  }
}

/**
 * Sinkronisasi daftar budget dari Google Sheet ke PostgreSQL (Batch Upsert)
 */
async function syncBudgetsFromSheetToPg(budgetRows) {
  if (!isDbConnected && !(await migrateTables())) return false;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const b of budgetRows) {
      if (!b.noBudget) continue;
      await client.query(`
        INSERT INTO finance_budgets (
          row_index, no_budget, nama, uraian, jumlah, tgl_kasbon, divisi, no_wa,
          realisasi_belanja, sisa_kembali, bukti_nota, status, tgl_selesai, catatan_finance
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (no_budget) DO UPDATE SET
          row_index = EXCLUDED.row_index,
          nama = EXCLUDED.nama,
          uraian = EXCLUDED.uraian,
          jumlah = EXCLUDED.jumlah,
          tgl_kasbon = EXCLUDED.tgl_kasbon,
          divisi = EXCLUDED.divisi,
          no_wa = EXCLUDED.no_wa,
          realisasi_belanja = EXCLUDED.realisasi_belanja,
          sisa_kembali = EXCLUDED.sisa_kembali,
          bukti_nota = EXCLUDED.bukti_nota,
          status = EXCLUDED.status,
          tgl_selesai = EXCLUDED.tgl_selesai,
          catatan_finance = EXCLUDED.catatan_finance,
          updated_at = CURRENT_TIMESTAMP;
      `, [
        b.rowIndex || 0,
        b.noBudget,
        b.nama,
        b.uraian,
        parseFloat(b.jumlah) || 0,
        b.tglKasbon,
        b.divisi,
        b.noWa || '',
        parseFloat(b.realisasiBelanja) || 0,
        parseFloat(b.sisaKembali) || 0,
        b.buktiNota || '',
        b.status || 'PENDING',
        b.tglSelesai || '',
        b.catatanFinance || ''
      ]);
    }
    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK');
    console.warn('⚠️ Gagal syncBudgetsFromSheetToPg:', e.message);
    return false;
  } finally {
    client.release();
  }
}

/**
 * Mengambil nilai setting aplikasi dari PostgreSQL.
 */
async function getSetting(key, defaultValue = null) {
  if (!initDb()) return defaultValue;
  try {
    const res = await pool.query('SELECT value FROM app_settings WHERE key = $1', [key]);
    if (res.rows.length > 0) {
      return res.rows[0].value;
    }
    return defaultValue;
  } catch (err) {
    console.warn(`⚠️ Gagal getSetting(${key}):`, err.message);
    return defaultValue;
  }
}

/**
 * Menyimpan atau memperbarui nilai setting aplikasi.
 */
async function setSetting(key, value, description = null) {
  if (!initDb()) return false;
  try {
    await pool.query(
      `INSERT INTO app_settings (key, value, description, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           description = COALESCE(EXCLUDED.description, app_settings.description),
           updated_at = CURRENT_TIMESTAMP`,
      [key, String(value), description]
    );
    return true;
  } catch (err) {
    console.error(`❌ Gagal setSetting(${key}):`, err.message);
    return false;
  }
}

/**
 * Mengambil seluruh setting aplikasi dalam bentuk key-value object.
 */
async function getAllSettings() {
  if (!initDb()) return {};
  try {
    const res = await pool.query('SELECT key, value, description, updated_at FROM app_settings');
    const settings = {};
    for (const row of res.rows) {
      settings[row.key] = row.value;
    }
    return settings;
  } catch (err) {
    console.warn('⚠️ Gagal getAllSettings:', err.message);
    return {};
  }
}

/**
 * Menyimpan riwayat dokumen PO/GRPO/Bukti Bayar ke database.
 */
async function savePoDocument({ noPo, tipeDokumen, fileName, driveFileId, driveUrl, mimeType, fileSize, metadata }) {
  if (!initDb()) return null;
  try {
    const res = await pool.query(
      `INSERT INTO po_documents (no_po, tipe_dokumen, file_name, drive_file_id, drive_url, mime_type, file_size, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        noPo,
        tipeDokumen,
        fileName || 'dokumen',
        driveFileId,
        driveUrl || '',
        mimeType || 'application/octet-stream',
        fileSize || 0,
        JSON.stringify(metadata || {}),
      ]
    );
    return res.rows[0];
  } catch (err) {
    console.error(`❌ Gagal savePoDocument untuk ${noPo}:`, err.message);
    throw err;
  }
}

/**
 * Mengambil daftar dokumen lampiran untuk nomor PO tertentu.
 */
async function getDocumentsByPo(noPo, tipeDokumen = null) {
  if (!initDb()) return [];
  try {
    let query = 'SELECT * FROM po_documents WHERE UPPER(TRIM(no_po)) = UPPER(TRIM($1))';
    const params = [noPo];
    if (tipeDokumen) {
      params.push(tipeDokumen.toUpperCase());
      query += ` AND UPPER(tipe_dokumen) = $2`;
    }
    query += ' ORDER BY created_at DESC';

    const res = await pool.query(query, params);
    return res.rows;
  } catch (err) {
    console.warn(`⚠️ Gagal getDocumentsByPo(${noPo}):`, err.message);
    return [];
  }
}

/**
 * Mengambil daftar PO terbaru yang memiliki dokumen arsip di Google Drive.
 */
async function getRecentArchivedPOs(limit = 10) {
  if (!initDb()) return [];
  try {
    const res = await pool.query(
      `SELECT no_po, count(*) as total_files, 
              array_agg(DISTINCT tipe_dokumen) as doc_types,
              max(created_at) as last_updated
       FROM po_documents 
       GROUP BY no_po 
       ORDER BY last_updated DESC 
       LIMIT $1`,
      [limit]
    );
    return res.rows;
  } catch (err) {
    console.warn('⚠️ Gagal getRecentArchivedPOs:', err.message);
    return [];
  }
}

/**
 * Menghapus record lampiran dokumen berdasarkan ID.
 */
async function deletePoDocument(id) {
  if (!initDb()) return false;
  try {
    const res = await pool.query('DELETE FROM po_documents WHERE id = $1 RETURNING *', [id]);
    return res.rows[0] || null;
  } catch (err) {
    console.error(`❌ Gagal deletePoDocument(${id}):`, err.message);
    return null;
  }
}

function isAvailable() {
  return isDbConnected;
}

function getPool() {
  if (!pool && env.db.enabled) {
    initDb();
  }
  return pool;
}

module.exports = {
  initDb,
  migrateTables,
  syncFromSheetsToPg,
  searchSupplierFromPg,
  searchMaterialFromPg,
  getAllMaterialsFromPg,
  getPOFromPg,
  updatePoInPg,
  getSupplierItemsFromPg,
  getAllSuppliersFromPg,
  getHistoricalStatsFromPg,
  getHistoricalTransactionsFromPg,
  getAllBudgetsFromPg,
  getBudgetByNoFromPg,
  insertBudgetToPg,
  updateBudgetInPg,
  syncBudgetsFromSheetToPg,
  getSetting,
  setSetting,
  getAllSettings,
  savePoDocument,
  getDocumentsByPo,
  getRecentArchivedPOs,
  deletePoDocument,
  isAvailable,
  getPool,
};


