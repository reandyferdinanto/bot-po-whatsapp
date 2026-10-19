import React, { useState, useEffect } from 'react';
import { Table, Input, Tag, Card, Button, Tooltip } from 'antd';
import { AiOutlineSearch, AiOutlineReload } from 'react-icons/ai';
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
      title: 'Last Price',
      dataIndex: 'hargaTerakhir',
      key: 'lastPrice',
      width: 180,
      render: (val, r) => {
        const price = Number(val || r.hargaTerbaru || 0);
        if (price <= 0) {
          return <span style={{ color: '#94a3b8', fontSize: 12 }}>-</span>;
        }
        return (
          <Tooltip title={r.supplierTerakhir ? `Vendor: ${r.supplierTerakhir}${r.tglTerakhir ? ' (' + r.tglTerakhir + ')' : ''}` : 'Harga terakhir dari riwayat PO'}>
            <span
              style={{
                fontWeight: 700,
                color: isDark ? '#1bd488' : '#055b65',
                fontFamily: 'monospace',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {formatRupiah(price)}
            </span>
          </Tooltip>
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
        <Tag color={count > 0 ? 'cyan' : 'default'} style={{ fontWeight: 600 }}>
          {count || 0}x Order
        </Tag>
      ),
    },
  ];

  const cardBg = isDark ? '#0a252a' : '#ffffff';
  const borderColor = isDark ? '#133e46' : '#e0e5e9';
  const textColor = isDark ? '#fbfcfc' : '#055b65';

  return (
    <div
      className="smooth-card"
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
            prefix={<AiOutlineSearch style={{ color: '#94a3b8' }} />}
            placeholder="Cari Kode atau Nama Material..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            allowClear
            style={{ width: 280, borderRadius: 8, fontSize: 12 }}
          />
          <Button icon={<AiOutlineReload />} onClick={loadMaterials} className="smooth-clickable" style={{ borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} />
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
