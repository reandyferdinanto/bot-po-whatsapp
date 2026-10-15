import React, { useState, useEffect } from 'react';
import { Table, Input, Tag, Button } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { getSuppliers } from '../services/api';

export default function SuppliersTable({ isDark }) {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const res = await getSuppliers({ q: search, page, limit: pageSize });
      if (res.items) {
        setData(res.items);
        setTotal(res.total || 0);
      }
    } catch (err) {
      console.warn('Gagal load suppliers:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
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
      width: 140,
      render: (kode) => <Tag color="blue" style={{ fontFamily: 'monospace', fontWeight: 700 }}>{kode}</Tag>,
    },
    {
      title: 'Nama Material',
      dataIndex: 'nama',
      key: 'nama',
      render: (nama) => <span style={{ fontWeight: 600 }}>{nama}</span>,
    },
    {
      title: 'Supplier Utama (Sering Diorder)',
      dataIndex: 'supplierUtama',
      key: 'supplierUtama',
      width: 280,
      render: (sup) => (
        <span style={{ fontWeight: 700, color: '#047857' }}>
          {sup || '-'}
        </span>
      ),
    },
    {
      title: 'Frekuensi PO (2017-2026)',
      dataIndex: 'frekuensi',
      key: 'frekuensi',
      width: 160,
      align: 'right',
      render: (freq) => (
        <Tag color="purple" style={{ fontFamily: 'monospace', fontWeight: 700 }}>
          {freq || 0} kali
        </Tag>
      ),
    },
    {
      title: 'Total Qty Diorder',
      dataIndex: 'totalQty',
      key: 'totalQty',
      width: 150,
      align: 'right',
      render: (qty) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
          {Number(qty || 0).toLocaleString('id-ID')}
        </span>
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
            Sheet: database Supplier Material
          </h2>
          <p style={{ margin: '2px 0 0 0', fontSize: 11, color: '#64748b' }}>
            Riwayat akumulasi pembelian material 2017 - 2026 sebagai basis rekomendasi vendor bot WhatsApp.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder="Cari Supplier atau Kode Material..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            allowClear
            style={{ width: 280, borderRadius: 8, fontSize: 12 }}
          />
          <Button icon={<ReloadOutlined />} onClick={loadSuppliers} style={{ borderRadius: 8 }} />
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
