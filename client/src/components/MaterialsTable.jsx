import React, { useState, useEffect } from 'react';
import { Table, Input, Tag, Card, Button } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { getMaterials } from '../services/api';

export default function MaterialsTable({ isDark }) {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const formatRupiah = (val) => 'Rp ' + Number(val || 0).toLocaleString('id-ID');

  const loadMaterials = async () => {
    setLoading(true);
    try {
      const res = await getMaterials({ q: search, page, limit: pageSize });
      if (res.items) {
        setData(res.items);
        setTotal(res.total || 0);
      }
    } catch (err) {
      console.warn('Gagal load materials:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMaterials();
  }, [page, pageSize, search]);

  const columns = [
    {
      title: 'No.',
      dataIndex: 'no',
      key: 'no',
      width: 60,
      align: 'center',
    },
    {
      title: 'Kode Item Material',
      dataIndex: 'kode',
      key: 'kode',
      width: 150,
      render: (kode) => <Tag color="cyan" style={{ fontFamily: 'monospace', fontWeight: 700 }}>{kode}</Tag>,
    },
    {
      title: 'Nama Material (Spesifikasi Teknis)',
      dataIndex: 'nama',
      key: 'nama',
      render: (nama) => <span style={{ fontWeight: 600 }}>{nama}</span>,
    },
    {
      title: 'Histori Harga (Min / Max / Terakhir)',
      key: 'priceHistory',
      width: 280,
      render: (_, r) => {
        if (!r.hargaTerakhir || r.hargaTerakhir <= 0) {
          return <span style={{ color: '#94a3b8', fontSize: 11 }}>Belum ada riwayat PO</span>;
        }
        return (
          <div style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div>
              <strong>Terbaru:</strong> <span style={{ color: '#059669', fontFamily: 'monospace' }}>{formatRupiah(r.hargaTerakhir)}</span>
            </div>
            {r.hargaMin !== r.hargaMax && (
              <div style={{ color: '#64748b' }}>
                Rentang: {formatRupiah(r.hargaMin)} - {formatRupiah(r.hargaMax)}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Riwayat Transaksi',
      dataIndex: 'totalTransaksi',
      key: 'totalTransaksi',
      width: 140,
      align: 'center',
      render: (count) => (
        <Tag color={count > 0 ? 'blue' : 'default'} style={{ fontWeight: 600 }}>
          {count || 0}x Order
        </Tag>
      ),
    },
  ];

  const cardBg = isDark ? '#0f172a' : '#ffffff';
  const borderColor = isDark ? '#1e293b' : '#e2e8f0';
  const textColor = isDark ? '#f8fafc' : '#0f172a';

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: cardBg,
        borderRadius: 12,
        border: `1px solid ${borderColor}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      }}
    >
      <div
        style={{
          padding: '12px 18px',
          borderBottom: `1px solid ${borderColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: textColor }}>
            Sheet: database Material
          </h2>
          <p style={{ margin: '2px 0 0 0', fontSize: 11, color: '#64748b' }}>
            Total 1.506 master item yang digunakan untuk auto-match dan validasi saat pembuatan PO.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder="Cari Kode atau Nama Material..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            allowClear
            style={{ width: 280, borderRadius: 8, fontSize: 12 }}
          />
          <Button icon={<ReloadOutlined />} onClick={loadMaterials} style={{ borderRadius: 8 }} />
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        <Table
          rowKey="kode"
          dataSource={data}
          columns={columns}
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['25', '50', '100'],
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
            showTotal: (tot) => `Total ${tot} item`,
          }}
          size="small"
        />
      </div>
    </div>
  );
}
