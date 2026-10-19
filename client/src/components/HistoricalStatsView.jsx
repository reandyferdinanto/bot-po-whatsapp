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
  AiOutlineDatabase,
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
import { getHistoricalStats } from '../services/api';

export default function HistoricalStatsView({ isDark }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    loadStats();
  }, []);

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
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
      {/* Top Banner with One-Click Sync Button */}
      <div
        style={{
          background: isDark
            ? 'linear-gradient(135deg, rgba(6, 78, 59, 0.45) 0%, rgba(15, 23, 42, 0.85) 100%)'
            : 'linear-gradient(135deg, #f0fdf4 0%, #f8fafc 100%)',
          borderRadius: 14,
          padding: '20px 24px',
          border: `1px solid ${isDark ? 'rgba(5, 150, 105, 0.4)' : '#a7f3d0'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 14,
          boxShadow: '0 2px 8px rgba(4, 120, 87, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: '#047857',
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
              <Tag color="blue" style={{ fontWeight: 700 }}>
                10 Tahun Historis
              </Tag>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: mutedColor }}>
              Data statistik multi-tahun (2017-2026) diolah langsung secara instan dari database PostgreSQL (&lt;5ms).
            </p>
          </div>
        </div>

        {/* Action: Reload Stats */}
        <Button
          size="middle"
          icon={<AiOutlineReload style={{ animation: loading ? 'antRotate 1s infinite linear' : 'none' }} />}
          loading={loading}
          onClick={loadStats}
          style={{
            borderRadius: 8,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontWeight: 600,
          }}
        >
          Muat Ulang Data
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
              backgroundColor: isDark ? 'rgba(14, 165, 233, 0.18)' : '#f0f9ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0284c7',
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
            <div style={{ fontSize: 20, fontWeight: 800, color: '#047857', fontFamily: 'monospace', marginTop: 4 }}>
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
              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : '#ecfdf5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#059669',
              fontSize: 20,
            }}
          >
            <AiOutlineDatabase />
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
                Data riwayat supplier 10 tahun sedang diproses atau belum tersedia.
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
                Data riwayat material 10 tahun sedang diproses atau belum tersedia.
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
    </div>
  );
}
