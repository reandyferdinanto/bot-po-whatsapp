import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Input,
  Select,
  Progress,
  Space,
  message,
  Tooltip,
  Modal,
  Alert,
} from 'antd';
import {
  AiOutlineBarChart,
  AiOutlineSync,
  AiOutlineThunderbolt,
  AiOutlineSearch,
  AiOutlineShop,
  AiOutlineAppstore,
  AiOutlineDollar,
  AiOutlineClockCircle,
  AiOutlineCheckCircle,
  AiOutlineRise,
  AiOutlineCalendar,
  AiOutlineReload,
} from 'react-icons/ai';
import { getHistoricalStats, getHistoricalPOs, syncAllSheets } from '../services/api';

export default function HistoricalStatsView({ isDark }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);

  // Transactions explorer states
  const [selectedYear, setSelectedYear] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const [txPageSize, setTxPageSize] = useState(25);
  const [txLoading, setTxLoading] = useState(false);

  const formatRupiah = (val) => 'Rp ' + Number(val || 0).toLocaleString('id-ID');

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await getHistoricalStats();
      if (res) {
        setStats(res);
      }
    } catch (err) {
      console.warn('Gagal memuat statistik historis:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async () => {
    setTxLoading(true);
    try {
      const res = await getHistoricalPOs({
        year: selectedYear,
        search: searchQuery,
        page: txPage,
        limit: txPageSize,
      });
      if (res) {
        setTransactions(res.items || []);
        setTxTotal(res.total || 0);
      }
    } catch (err) {
      console.warn('Gagal load transaksi historis:', err.message);
    } finally {
      setTxLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [selectedYear, searchQuery, txPage, txPageSize]);

  // Eksekusi Sinkronisasi Seluruh Sheet (2017 - 2026)
  const handleTriggerSyncAll = async () => {
    setSyncingAll(true);
    message.loading({
      content: 'Sedang menyinkronkan seluruh sheet (PO 2017 s/d PO 2026, database Material, & Supplier)...',
      key: 'sync-all-proc',
      duration: 0,
    });

    try {
      const res = await syncAllSheets();
      message.destroy('sync-all-proc');

      if (res.success) {
        Modal.success({
          title: '✅ Sinkronisasi Multi-Tahun Berhasil!',
          width: 520,
          content: (
            <div style={{ fontSize: 13, marginTop: 10, lineHeight: 1.6 }}>
              <p>
                Berhasil menarik dan mengindeks data dari <strong>{res.totalSheets} Tab PO ({res.sheets?.join(', ')})</strong>.
              </p>
              <ul style={{ paddingLeft: 18, margin: '8px 0' }}>
                <li>Total Baris Transaksi: <strong>{res.totalAllRows} Baris</strong></li>
                <li>Total Dokumen PO Unik: <strong>{res.totalAllPOs} PO</strong></li>
                <li>Total Akumulasi Belanja: <strong>{formatRupiah(res.totalAllSpend)}</strong></li>
                <li>Master Material: <strong>{res.totalMaterials} Item</strong></li>
                <li>Indeks Histori Harga: <strong>{res.totalPrices} Material</strong></li>
              </ul>
              <p style={{ color: '#059669', fontSize: 12, margin: 0 }}>
                Seluruh statistik kini tersimpan di cache lokal berkecepatan tinggi (&lt;5ms).
              </p>
            </div>
          ),
        });

        await loadStats();
        await loadTransactions();
      }
    } catch (err) {
      message.destroy('sync-all-proc');
      message.error(`Gagal sinkronisasi seluruh sheet: ${err.message}`);
    } finally {
      setSyncingAll(false);
    }
  };

  const cardBg = isDark ? '#0f172a' : '#ffffff';
  const borderColor = isDark ? '#1e293b' : '#e2e8f0';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';

  // Hitung persentase proporsi belanja tahunan
  const maxYearlySpend = Math.max(
    ...(stats?.yearlyBreakdown || []).map((y) => y.totalSpend || 0),
    1
  );

  const yearlyColumns = [
    {
      title: 'Tahun / Sheet',
      dataIndex: 'sheetName',
      key: 'sheetName',
      width: 140,
      render: (name, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <AiOutlineCalendar style={{ color: '#0284c7' }} />
          <strong style={{ color: textColor }}>{name || `PO ${r.year}`}</strong>
        </div>
      ),
    },
    {
      title: 'Total Belanja (Exclude Cancelled)',
      dataIndex: 'totalSpend',
      key: 'totalSpend',
      width: 250,
      render: (spend) => {
        const percent = Math.min(Math.round((spend / maxYearlySpend) * 100), 100);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 800, color: '#047857', fontFamily: 'monospace' }}>
              {formatRupiah(spend)}
            </span>
            <Progress percent={percent} size="small" strokeColor="#059669" showInfo={false} />
          </div>
        );
      },
    },
    {
      title: 'Dokumen PO',
      dataIndex: 'totalPOs',
      key: 'totalPOs',
      width: 120,
      align: 'center',
      render: (pos) => <Tag color="blue" style={{ fontWeight: 700 }}>{pos} PO</Tag>,
    },
    {
      title: 'Total Baris Item',
      dataIndex: 'totalRows',
      key: 'totalRows',
      width: 130,
      align: 'center',
      render: (rows) => <Tag style={{ fontWeight: 600 }}>{rows} Baris</Tag>,
    },
    {
      title: 'Status Breakdown',
      key: 'status',
      width: 260,
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <Tag color="green">Close: {r.countClose || 0}</Tag>
          <Tag color="orange">Pending: {r.countPending || 0}</Tag>
          <Tag color="blue">Open: {r.countOpen || 0}</Tag>
          {r.countCancelled > 0 && <Tag color="red">Batal: {r.countCancelled}</Tag>}
        </div>
      ),
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 130,
      align: 'center',
      render: (_, r) => (
        <Button
          size="small"
          type="link"
          onClick={() => {
            setSelectedYear(r.year);
            setTxPage(1);
          }}
          style={{ fontSize: 11 }}
        >
          Lihat Transaksi
        </Button>
      ),
    },
  ];

  const transactionColumns = [
    {
      title: 'Tahun',
      dataIndex: 'year',
      key: 'year',
      width: 90,
      align: 'center',
      render: (yr, r) => <Tag color="purple">{yr || r.sheetName || '2026'}</Tag>,
    },
    {
      title: 'No. PO',
      dataIndex: 'noPo',
      key: 'noPo',
      width: 130,
      render: (noPo) => <strong style={{ color: '#2563eb', fontFamily: 'monospace' }}>{noPo}</strong>,
    },
    {
      title: 'Tanggal',
      dataIndex: 'date',
      key: 'date',
      width: 100,
    },
    {
      title: 'Supplier',
      dataIndex: 'supplier',
      key: 'supplier',
      width: 200,
      render: (sup) => <span style={{ fontWeight: 600 }}>{sup || '-'}</span>,
    },
    {
      title: 'Barang',
      key: 'material',
      render: (_, r) => (
        <div>
          <Tag color="cyan">{r.kode || 'JASA'}</Tag>
          <span>{r.nama || '-'}</span>
        </div>
      ),
    },
    {
      title: 'Qty',
      dataIndex: 'qty',
      key: 'qty',
      width: 75,
      align: 'right',
    },
    {
      title: 'Harga Satuan',
      dataIndex: 'priceUnit',
      key: 'priceUnit',
      width: 120,
      align: 'right',
      render: (p) => formatRupiah(p),
    },
    {
      title: 'Total Nilai',
      dataIndex: 'total',
      key: 'total',
      width: 135,
      align: 'right',
      render: (t) => <strong style={{ color: '#047857', fontFamily: 'monospace' }}>{formatRupiah(t)}</strong>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 95,
      align: 'center',
      render: (s) => (
        <Tag color={s === 'Close' ? 'green' : s === 'Cancelled' ? 'red' : 'blue'}>
          {s || 'Open'}
        </Tag>
      ),
    },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
      {/* Top Banner with One-Click Sync Button */}
      <div
        style={{
          background: isDark
            ? 'linear-gradient(135deg, #311042 0%, #064e3b 100%)'
            : 'linear-gradient(135deg, #f5f3ff 0%, #ecfdf5 100%)',
          borderRadius: 14,
          padding: '20px 24px',
          border: `1px solid ${isDark ? '#8b5cf6' : '#c4b5fd'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 14,
          boxShadow: '0 2px 8px rgba(139, 92, 246, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: '#7c3aed',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
            }}
          >
            <AiOutlineBarChart />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: textColor, letterSpacing: '-0.3px' }}>
                Statistik &amp; Analisis Multi-Tahun (PO 2017 s/d PO 2026)
              </h2>
              <Tag color="purple" style={{ fontWeight: 700 }}>
                10 Tahun Historis
              </Tag>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: mutedColor }}>
              Menyinkronkan seluruh lembar PO tahunan ke dalam cache berkecepatan tinggi agar data statistik dapat diolah langsung secara instan (&lt;5ms).
            </p>
          </div>
        </div>

        {/* The One-Click Multi-Sheet Sync Button */}
        <Button
          type="primary"
          size="large"
          icon={<AiOutlineThunderbolt style={{ animation: syncingAll ? 'antRotate 1s infinite linear' : 'none' }} />}
          loading={syncingAll}
          onClick={handleTriggerSyncAll}
          style={{
            backgroundColor: '#7c3aed',
            borderColor: '#7c3aed',
            fontWeight: 700,
            borderRadius: 10,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)',
          }}
        >
          ⚡ Sync Semua Sheet (2017 - 2026)
        </Button>
      </div>

      {/* KPI Cards across All Years */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div
          style={{
            backgroundColor: cardBg,
            borderRadius: 12,
            border: `1px solid ${borderColor}`,
            padding: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: mutedColor }}>
              TOTAL BELANJA (2017 - 2026)
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#047857', fontFamily: 'monospace', marginTop: 4 }}>
              {formatRupiah(stats?.totalAllSpend || 0)}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Akumulasi 10 Tahun Transaksi
            </div>
          </div>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              backgroundColor: isDark ? 'rgba(5, 150, 105, 0.2)' : '#ecfdf5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#059669',
              fontSize: 20,
            }}
          >
            <AiOutlineDollar />
          </div>
        </div>

        <div
          style={{
            backgroundColor: cardBg,
            borderRadius: 12,
            border: `1px solid ${borderColor}`,
            padding: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: mutedColor }}>
              RATA-RATA PENGELUARAN / TAHUN
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#2563eb', fontFamily: 'monospace', marginTop: 4 }}>
              {formatRupiah(stats?.averageSpendPerYear || 0)}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Rerata per tahun buku aktif
            </div>
          </div>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              backgroundColor: isDark ? 'rgba(37, 99, 235, 0.2)' : '#eff6ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563eb',
              fontSize: 20,
            }}
          >
            <AiOutlineRise />
          </div>
        </div>

        <div
          style={{
            backgroundColor: cardBg,
            borderRadius: 12,
            border: `1px solid ${borderColor}`,
            padding: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: mutedColor }}>
              TOTAL BARIS DOKUMEN PO
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: textColor, fontFamily: 'monospace', marginTop: 4 }}>
              {Number(stats?.totalAllRows || 0).toLocaleString('id-ID')} Baris
            </div>
            <div style={{ fontSize: 11, color: '#059669', fontWeight: 600, marginTop: 2 }}>
              {Number(stats?.totalAllPOs || 0).toLocaleString('id-ID')} Dokumen PO Unik
            </div>
          </div>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              backgroundColor: isDark ? 'rgba(124, 58, 237, 0.2)' : '#f5f3ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#7c3aed',
              fontSize: 20,
            }}
          >
            <AiOutlineCalendar />
          </div>
        </div>

        <div
          style={{
            backgroundColor: cardBg,
            borderRadius: 12,
            border: `1px solid ${borderColor}`,
            padding: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: mutedColor }}>
              TAB TERSINKRONKAN
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#ea580c', fontFamily: 'monospace', marginTop: 4 }}>
              {stats?.yearlyBreakdown?.length || 1} Tahun Buku
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              {stats?.sheetsSynced ? `${stats.sheetsSynced.length} Lembar Tab` : 'PO 2017 - 2026'}
            </div>
          </div>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              backgroundColor: isDark ? 'rgba(234, 88, 12, 0.2)' : '#fff7ed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ea580c',
              fontSize: 20,
            }}
          >
            <AiOutlineThunderbolt />
          </div>
        </div>
      </div>

      {/* Rincian Perbandingan Pengeluaran Per Tahun (2017 s/d 2026) */}
      <div
        style={{
          backgroundColor: cardBg,
          borderRadius: 12,
          border: `1px solid ${borderColor}`,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: textColor }}>
              📊 Distribusi Pengeluaran &amp; Transaksi Tahunan (PO 2017 - 2026)
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: 11, color: mutedColor }}>
              Data perbandingan dihitung otomatis dari masing-masing sheet tahunan di Google Spreadsheet.
            </p>
          </div>
        </div>

        <Table
          rowKey="sheetName"
          columns={yearlyColumns}
          dataSource={stats?.yearlyBreakdown || []}
          pagination={false}
          size="small"
        />
      </div>

      {/* Dua Kolom: Top 10 Vendor Sepanjang Masa & Top 10 Material Terlaris */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 14 }}>
        {/* Top 10 Vendor */}
        <div
          style={{
            backgroundColor: cardBg,
            borderRadius: 12,
            border: `1px solid ${borderColor}`,
            padding: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <AiOutlineShop style={{ color: '#059669', fontSize: 18 }} />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: textColor }}>
              Top 10 Vendor Teraktif Sepanjang Masa (2017 - 2026)
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(stats?.topSuppliersAllTime || []).length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: mutedColor, fontSize: 12 }}>
                Klik tombol <strong>"⚡ Sync Semua Sheet"</strong> di atas untuk mengumpulkan data riwayat vendor 10 tahun.
              </div>
            ) : (
              (stats?.topSuppliersAllTime || []).map((s, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 8,
                    backgroundColor: isDark ? '#1e293b' : '#f8fafc',
                    border: `1px solid ${borderColor}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        backgroundColor: idx < 3 ? '#047857' : isDark ? '#334155' : '#e2e8f0',
                        color: idx < 3 ? '#ffffff' : textColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {idx + 1}
                    </span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: textColor }}>
                        {s.supplierName}
                      </div>
                      <div style={{ fontSize: 10, color: mutedColor }}>
                        {s.totalOrders} kali order • {Number(s.totalQty).toLocaleString('id-ID')} unit
                      </div>
                    </div>
                  </div>
                  <span style={{ fontWeight: 800, color: '#047857', fontFamily: 'monospace', fontSize: 12 }}>
                    {formatRupiah(s.totalSpend)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top 10 Material */}
        <div
          style={{
            backgroundColor: cardBg,
            borderRadius: 12,
            border: `1px solid ${borderColor}`,
            padding: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <AiOutlineAppstore style={{ color: '#0284c7', fontSize: 18 }} />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: textColor }}>
              Top 10 Material Paling Sering Diorder (2017 - 2026)
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(stats?.topMaterialsAllTime || []).length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: mutedColor, fontSize: 12 }}>
                Klik tombol <strong>"⚡ Sync Semua Sheet"</strong> di atas untuk mengumpulkan data riwayat material 10 tahun.
              </div>
            ) : (
              (stats?.topMaterialsAllTime || []).map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 8,
                    backgroundColor: isDark ? '#1e293b' : '#f8fafc',
                    border: `1px solid ${borderColor}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        backgroundColor: idx < 3 ? '#0284c7' : isDark ? '#334155' : '#e2e8f0',
                        color: idx < 3 ? '#ffffff' : textColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {idx + 1}
                    </span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: textColor }}>
                        <Tag color="cyan" style={{ fontSize: 10, padding: '0 4px', margin: '0 4px 0 0' }}>
                          {m.kode}
                        </Tag>
                        {m.nama}
                      </div>
                      <div style={{ fontSize: 10, color: mutedColor }}>
                        {m.orderCount} transaksi • Total {Number(m.totalQty).toLocaleString('id-ID')} unit
                      </div>
                    </div>
                  </div>
                  <span style={{ fontWeight: 800, color: '#2563eb', fontFamily: 'monospace', fontSize: 12 }}>
                    {formatRupiah(m.totalSpend)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Interactive Historical Transactions Explorer */}
      <div
        style={{
          backgroundColor: cardBg,
          borderRadius: 12,
          border: `1px solid ${borderColor}`,
          padding: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: textColor }}>
              🔍 Penjelajah Transaksi Historis (Live Cache &lt;5ms)
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: 11, color: mutedColor }}>
              Jelajahi dan saring seluruh transaksi dari tahun 2017 s/d 2026 secara instan.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Filter Tahun */}
            <Select
              value={selectedYear}
              onChange={(val) => {
                setSelectedYear(val);
                setTxPage(1);
              }}
              style={{ width: 140 }}
              options={[
                { label: 'Semua Tahun', value: 'ALL' },
                ...((stats?.yearlyBreakdown || []).map((y) => ({
                  label: `Tahun ${y.year}`,
                  value: y.year,
                }))),
              ]}
            />

            <Input
              prefix={<AiOutlineSearch style={{ color: '#94a3b8' }} />}
              placeholder="Cari No PO, Supplier, Material..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setTxPage(1);
              }}
              allowClear
              style={{ width: 240, borderRadius: 8, fontSize: 12 }}
            />

            <Button
              icon={<AiOutlineReload />}
              onClick={loadTransactions}
              style={{ borderRadius: 8 }}
              title="Refresh tabel"
            />
          </div>
        </div>

        <Table
          rowKey={(r, i) => `${r.year}_${r.noPo}_${i}`}
          columns={transactionColumns}
          dataSource={transactions}
          loading={txLoading}
          size="small"
          pagination={{
            current: txPage,
            pageSize: txPageSize,
            total: txTotal,
            showSizeChanger: true,
            pageSizeOptions: ['25', '50', '100'],
            onChange: (p, ps) => {
              setTxPage(p);
              setTxPageSize(ps);
            },
            showTotal: (tot) => `Total ${tot} Transaksi`,
          }}
        />
      </div>
    </div>
  );
}
