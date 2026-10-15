import React, { useState, useEffect } from 'react';
import { Table, Input, Tag, Button, Tooltip, Empty } from 'antd';
import {
  AiOutlineSearch,
  AiOutlineReload,
  AiOutlineShop,
  AiOutlineAppstore,
  AiOutlineDown,
  AiOutlineRight,
  AiOutlineTag,
} from 'react-icons/ai';
import { getSuppliers } from '../services/api';

export default function SuppliersTable({ isDark }) {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedRowKeys, setExpandedRowKeys] = useState([]);

  const formatRupiah = (val) => {
    if (!val || val <= 0) return '-';
    return 'Rp ' + Number(val).toLocaleString('id-ID');
  };

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

  const toggleRowExpansion = (key) => {
    setExpandedRowKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleToggleExpandAll = () => {
    if (expandedRowKeys.length === data.length && data.length > 0) {
      setExpandedRowKeys([]);
    } else {
      setExpandedRowKeys(data.map((s) => s.supplierName));
    }
  };

  // Sub-Table Kolom untuk Material yang Dibeli dari Supplier ini
  const materialColumns = [
    {
      title: 'No.',
      key: 'matNo',
      width: 50,
      align: 'center',
      render: (_, __, idx) => idx + 1,
    },
    {
      title: 'Kode Item Material',
      dataIndex: 'kode',
      key: 'kode',
      width: 140,
      render: (kode) => (
        <Tag color="cyan" style={{ fontFamily: 'monospace', fontWeight: 700 }}>
          {kode}
        </Tag>
      ),
    },
    {
      title: 'Nama Material (Spesifikasi)',
      dataIndex: 'nama',
      key: 'nama',
      render: (nama) => (
        <span style={{ fontWeight: 600, color: isDark ? '#f1f5f9' : '#1e293b' }}>
          {nama || '-'}
        </span>
      ),
    },
    {
      title: 'Harga Terendah (Min)',
      dataIndex: 'hargaMin',
      key: 'hargaMin',
      width: 160,
      align: 'right',
      render: (val) => (
        <span style={{ fontWeight: 700, color: '#059669', fontFamily: 'monospace' }}>
          {formatRupiah(val)}
        </span>
      ),
    },
    {
      title: 'Harga Termahal (Max)',
      dataIndex: 'hargaMax',
      key: 'hargaMax',
      width: 160,
      align: 'right',
      render: (val) => (
        <span style={{ fontWeight: 700, color: '#ea580c', fontFamily: 'monospace' }}>
          {formatRupiah(val)}
        </span>
      ),
    },
    {
      title: 'Harga Terakhir (Last Price)',
      key: 'hargaTerbaru',
      width: 190,
      align: 'right',
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontWeight: 800, color: '#2563eb', fontFamily: 'monospace' }}>
            {formatRupiah(r.hargaTerbaru)}
          </span>
          {r.tglTerbaru && (
            <span style={{ fontSize: 10, color: '#64748b' }}>
              Tgl: {r.tglTerbaru}
            </span>
          )}
        </div>
      ),
    },
    {
      title: 'Frekuensi PO',
      dataIndex: 'frekuensi',
      key: 'frekuensi',
      width: 120,
      align: 'center',
      render: (freq, r) => (
        <Tag color="purple" style={{ fontWeight: 700 }}>
          {freq || r.totalOrders || 1}x Order
        </Tag>
      ),
    },
    {
      title: 'Total Qty',
      dataIndex: 'totalQty',
      key: 'totalQty',
      width: 120,
      align: 'right',
      render: (qty) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
          {Number(qty || 0).toLocaleString('id-ID')}
        </span>
      ),
    },
  ];

  // Kolom Master Supplier
  const supplierColumns = [
    {
      title: 'No.',
      key: 'index',
      width: 60,
      align: 'center',
      render: (_, __, idx) => (page - 1) * pageSize + idx + 1,
    },
    {
      title: 'Nama Supplier / Vendor',
      dataIndex: 'supplierName',
      key: 'supplierName',
      render: (name, record) => {
        const isExpanded = expandedRowKeys.includes(record.supplierName);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: isDark ? 'rgba(5, 150, 105, 0.2)' : '#ecfdf5',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                flexShrink: 0,
              }}
            >
              <AiOutlineShop />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: isDark ? '#ffffff' : '#0f172a' }}>
                {name}
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                {isExpanded ? '▼ Menampilkan material & referensi harga' : '▶ Klik untuk melihat daftar material & harga'}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Ragam Material',
      dataIndex: 'totalMaterials',
      key: 'totalMaterials',
      width: 160,
      align: 'center',
      render: (count) => (
        <Tag
          color="blue"
          icon={<AiOutlineAppstore />}
          style={{
            fontSize: 12,
            padding: '3px 8px',
            borderRadius: 6,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {count} Jenis Barang
        </Tag>
      ),
    },
    {
      title: 'Akumulasi Frekuensi Order',
      dataIndex: 'totalFrequency',
      key: 'totalFrequency',
      width: 180,
      align: 'center',
      render: (freq) => (
        <Tag color="purple" style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>
          {freq || 0}x Order
        </Tag>
      ),
    },
    {
      title: 'Total Kuantitas Dipesan',
      dataIndex: 'totalQty',
      key: 'totalQty',
      width: 170,
      align: 'right',
      render: (qty) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: isDark ? '#f8fafc' : '#0f172a' }}>
          {Number(qty || 0).toLocaleString('id-ID')}
        </span>
      ),
    },
    {
      title: 'Detail Material',
      key: 'action',
      width: 140,
      align: 'center',
      render: (_, record) => {
        const isExpanded = expandedRowKeys.includes(record.supplierName);
        return (
          <Button
            size="small"
            type={isExpanded ? 'primary' : 'default'}
            icon={isExpanded ? <AiOutlineDown /> : <AiOutlineRight />}
            onClick={(e) => {
              e.stopPropagation();
              toggleRowExpansion(record.supplierName);
            }}
            style={{
              fontSize: 11,
              borderRadius: 6,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              backgroundColor: isExpanded ? '#047857' : undefined,
              borderColor: isExpanded ? '#047857' : undefined,
            }}
          >
            {isExpanded ? 'Tutup' : 'Lihat Barang'}
          </Button>
        );
      },
    },
  ];

  const cardBg = isDark ? '#0f172a' : '#ffffff';
  const borderColor = isDark ? '#1e293b' : '#e2e8f0';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const isAllExpanded = expandedRowKeys.length === data.length && data.length > 0;

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
      {/* Header Toolbar */}
      <div
        style={{
          padding: '12px 18px',
          borderBottom: `1px solid ${borderColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.6)' : '#fafafa',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: textColor }}>
              Daftar Supplier &amp; Riwayat Pembelian Material
            </h2>
            <Tag color="green" style={{ margin: 0, fontWeight: 600 }}>
              {total} Vendor Terdata
            </Tag>
          </div>
          <p style={{ margin: '2px 0 0 0', fontSize: 11, color: '#64748b' }}>
            Klik baris supplier untuk membuka daftar material yang biasa dibeli beserta referensi harga terendah, termahal, dan harga terakhir.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button
            size="small"
            onClick={handleToggleExpandAll}
            style={{ fontSize: 11, borderRadius: 6 }}
          >
            {isAllExpanded ? 'Tutup Semua Baris' : 'Buka Semua Baris'}
          </Button>

          <Input
            prefix={<AiOutlineSearch style={{ color: '#94a3b8' }} />}
            placeholder="Cari Supplier atau Kode/Nama Material..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            allowClear
            style={{ width: 280, borderRadius: 8, fontSize: 12 }}
          />

          <Button
            icon={<AiOutlineReload />}
            onClick={loadSuppliers}
            style={{ borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            title="Muat ulang data"
          />
        </div>
      </div>

      {/* Main Table with Expandable Sub-Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
        <Table
          rowKey="supplierName"
          dataSource={data}
          columns={supplierColumns}
          loading={loading}
          expandable={{
            expandedRowKeys,
            onExpand: (expanded, record) => {
              toggleRowExpansion(record.supplierName);
            },
            expandedRowRender: (record) => (
              <div
                style={{
                  margin: '6px 0',
                  padding: '14px 16px',
                  backgroundColor: isDark ? '#111827' : '#f8fafc',
                  border: `1px solid ${isDark ? '#374151' : '#cbd5e1'}`,
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AiOutlineTag style={{ color: '#0284c7', fontSize: 16 }} />
                    <span style={{ fontWeight: 700, fontSize: 13, color: isDark ? '#f8fafc' : '#0f172a' }}>
                      Material yang Biasa Dibeli dari: <span style={{ color: '#047857' }}>{record.supplierName}</span>
                    </span>
                    <Tag color="cyan" style={{ fontWeight: 600 }}>
                      {record.materials?.length || 0} Material
                    </Tag>
                  </div>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    Referensi harga dirangkum otomatis dari riwayat master &amp; transaksi PO
                  </span>
                </div>

                {record.materials && record.materials.length > 0 ? (
                  <Table
                    rowKey="kode"
                    columns={materialColumns}
                    dataSource={record.materials}
                    pagination={false}
                    size="small"
                    style={{
                      border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
                      borderRadius: 6,
                      overflow: 'hidden',
                    }}
                  />
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="Belum ada rincian material tercatat untuk supplier ini."
                  />
                )}
              </div>
            ),
          }}
          onRow={(record) => ({
            onClick: () => toggleRowExpansion(record.supplierName),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['15', '25', '50'],
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
            showTotal: (tot) => `Total ${tot} Supplier`,
          }}
          size="middle"
        />
      </div>
    </div>
  );
}
