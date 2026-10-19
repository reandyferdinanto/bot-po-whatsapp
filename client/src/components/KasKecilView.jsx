import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Input,
  Select,
  Tag,
  Space,
  Modal,
  Form,
  InputNumber,
  Typography,
  Tooltip,
  message,
  Popconfirm,
  Badge,
  Row,
  Col,
  Statistic,
  Radio,
  Checkbox,
} from 'antd';
import {
  AiOutlineSearch,
  AiOutlineSync,
  AiOutlinePlus,
  AiOutlineCheck,
  AiOutlineEdit,
  AiOutlineCalendar,
  AiOutlineDollar,
  AiOutlineClockCircle,
  AiOutlineFileText,
  AiOutlineCheckCircle,
  AiOutlineTags,
} from 'react-icons/ai';
import {
  getKasKecil,
  getKasKecilSummary,
  createKasKecilEntry,
  updateKasKecilVoucher,
} from '../services/api';

const { Title, Text } = Typography;
const { Option } = Select;

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export default function KasKecilView({ isDark = false }) {
  // Current month default
  const defaultMonth = MONTH_NAMES[new Date().getMonth()] || 'Januari';
  const [activeMonth, setActiveMonth] = useState(defaultMonth);

  const [data, setData] = useState({
    transactions: [],
    kasbonList: [],
    saldoAwal: 0,
    totalDebet: 0,
    totalKredit: 0,
    saldoAkhir: 0,
    draftCount: 0,
  });

  const [summaryList, setSummaryList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [ccFilter, setCcFilter] = useState('ALL');
  const [draftOnly, setDraftOnly] = useState(false);

  // Modals
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [voucherModalVisible, setVoucherModalVisible] = useState(false);
  const [targetRow, setTargetRow] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [form] = Form.useForm();
  const [voucherForm] = Form.useForm();

  // Flag apakah CC telah diubah manual oleh user di modal input
  const [isManualCcOverridden, setIsManualCcOverridden] = useState(false);

  const formatRupiah = (val) => 'Rp ' + Number(val || 0).toLocaleString('id-ID');

  const cardBg = isDark ? '#0a252a' : '#ffffff';
  const tableHeaderBg = isDark ? '#071f24' : '#f2f6f7';
  const textColor = isDark ? '#fbfcfc' : '#055b65';
  const subTextColor = isDark ? '#8ea8ab' : '#5c7e84';
  const borderColor = isDark ? '#133e46' : '#e0e5e9';

  // Load Month Data
  const loadMonthData = async () => {
    setLoading(true);
    try {
      const res = await getKasKecil({
        bulan: activeMonth,
        q: searchQuery,
        cc: ccFilter,
        draftOnly,
      });
      if (res.success) {
        setData(res);
      }
    } catch (err) {
      message.error(`Gagal memuat data Kas Kecil bulan ${activeMonth}: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Load 12 Months Summary (untuk info pill badge)
  const loadSummary = async () => {
    try {
      const res = await getKasKecilSummary();
      if (res.success && res.months) {
        setSummaryList(res.months);
      }
    } catch (err) {
      console.warn('Gagal memuat ringkasan 12 bulan kas kecil:', err.message);
    }
  };

  useEffect(() => {
    loadMonthData();
  }, [activeMonth, ccFilter, draftOnly]);

  useEffect(() => {
    loadSummary();
  }, []);

  // Handle Search dengan debounce
  const handleSearch = () => {
    loadMonthData();
  };

  // Otomatis deteksi CC dari Keterangan saat user mengetik
  const handleKeteranganChange = (e) => {
    const val = e.target.value || '';
    if (!isManualCcOverridden) {
      if (/svc|service/i.test(val)) {
        form.setFieldsValue({ cc: 'SVC' });
      } else if (/\bga\b|\bgad\b|general\s+affair/i.test(val)) {
        form.setFieldsValue({ cc: 'GAD' });
      }
    }
  };

  // Buka modal input kas kecil baru
  const openCreateModal = () => {
    setIsManualCcOverridden(false);
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    form.resetFields();
    form.setFieldsValue({
      bulan: activeMonth,
      date: dateStr,
      noVoucher: 'draft',
      cc: '',
      tipe: 'KREDIT',
      nominal: undefined,
      keterangan: '',
    });
    setCreateModalVisible(true);
  };

  // Submit Simpan Transaksi Kas Kecil Baru
  const handleCreateSubmit = async (values) => {
    setSubmitting(true);
    try {
      const res = await createKasKecilEntry({
        bulan: values.bulan || activeMonth,
        date: values.date,
        noVoucher: values.noVoucher || 'draft',
        cc: values.cc,
        keterangan: values.keterangan,
        tipe: values.tipe,
        nominal: values.nominal,
      });

      if (res.success) {
        message.success(`Transaksi kas kecil berhasil ditambahkan ke sheet '${values.bulan || activeMonth}'!`);
        setCreateModalVisible(false);
        form.resetFields();
        await loadMonthData();
        loadSummary();
      }
    } catch (err) {
      message.error(`Gagal menyimpan transaksi: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Buka modal update voucher dari draft
  const openVoucherModal = (record) => {
    setTargetRow(record);
    voucherForm.setFieldsValue({
      noVoucher: record.noVoucher === 'draft' ? '' : record.noVoucher,
      cc: record.cc || '',
    });
    setVoucherModalVisible(true);
  };

  // Submit Update Voucher
  const handleVoucherSubmit = async (values) => {
    if (!targetRow) return;
    setSubmitting(true);
    try {
      const res = await updateKasKecilVoucher({
        bulan: activeMonth,
        rowIndex: targetRow.rowIndex,
        noVoucher: values.noVoucher,
        cc: values.cc,
      });

      if (res.success) {
        message.success(`Voucher baris #${targetRow.rowIndex} diperbarui menjadi '${values.noVoucher}'!`);
        setVoucherModalVisible(false);
        await loadMonthData();
        loadSummary();
      }
    } catch (err) {
      message.error(`Gagal update nomor voucher: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Table Columns
  const columns = [
    {
      title: 'Baris',
      dataIndex: 'rowIndex',
      key: 'rowIndex',
      width: 60,
      align: 'center',
      render: (val) => (
        <span className="tabular-nums" style={{ fontSize: 11, color: subTextColor, fontFamily: 'monospace' }}>
          #{val}
        </span>
      ),
    },
    {
      title: 'DATE',
      dataIndex: 'date',
      key: 'date',
      width: 105,
      render: (val) => (
        <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 500 }}>
          {val || '-'}
        </span>
      ),
    },
    {
      title: 'NO.',
      dataIndex: 'noVoucher',
      key: 'noVoucher',
      width: 130,
      render: (val, record) => {
        const isDraft = record.isDraft || String(val).toLowerCase() === 'draft';
        if (isDraft) {
          return (
            <Tooltip title="Klik untuk tetapkan No. Voucher resmi">
              <Button
                size="small"
                onClick={() => openVoucherModal(record)}
                className="smooth-clickable"
                style={{
                  height: 22,
                  padding: '0 8px',
                  borderRadius: 4,
                  backgroundColor: 'rgba(217, 119, 6, 0.12)',
                  borderColor: '#d97706',
                  color: '#d97706',
                  fontWeight: 700,
                  fontSize: 11,
                  fontFamily: 'monospace',
                }}
              >
                draft <AiOutlineEdit style={{ fontSize: 11, marginLeft: 3 }} />
              </Button>
            </Tooltip>
          );
        }
        return (
          <Space orientation="horizontal" size={4}>
            <span className="tabular-nums" style={{ fontWeight: 700, color: '#055b65', fontFamily: 'monospace', fontSize: 12 }}>
              {val || '-'}
            </span>
            <Button
              type="text"
              size="small"
              icon={<AiOutlineEdit style={{ fontSize: 11, color: subTextColor }} />}
              onClick={() => openVoucherModal(record)}
              title="Edit No. Voucher"
              style={{ width: 20, height: 20, padding: 0 }}
            />
          </Space>
        );
      },
    },
    {
      title: 'CC',
      dataIndex: 'cc',
      key: 'cc',
      width: 90,
      align: 'center',
      render: (val) => {
        const clean = String(val || '').toUpperCase();
        if (clean === 'SVC') {
          return <Tag color="cyan" style={{ fontWeight: 700, margin: 0, fontSize: 11 }}>SVC</Tag>;
        }
        if (clean === 'GAD' || clean === 'GA') {
          return <Tag color="green" style={{ fontWeight: 700, margin: 0, fontSize: 11 }}>GAD</Tag>;
        }
        if (clean) {
          return <Tag color="default" style={{ fontWeight: 600, margin: 0, fontSize: 11 }}>{clean}</Tag>;
        }
        return <span style={{ color: subTextColor }}>-</span>;
      },
    },
    {
      title: 'KETERANGAN',
      dataIndex: 'keterangan',
      key: 'keterangan',
      render: (val) => (
        <span style={{ fontSize: 12, fontWeight: 500, color: textColor }}>
          {val || '-'}
        </span>
      ),
    },
    {
      title: 'DEBET (MASUK)',
      dataIndex: 'debet',
      key: 'debet',
      width: 140,
      align: 'right',
      render: (val) => {
        const num = Number(val || 0);
        if (num <= 0) return <span style={{ color: subTextColor, fontSize: 11 }}>-</span>;
        return (
          <span className="tabular-nums" style={{ fontWeight: 700, color: '#1bd488', fontFamily: 'monospace', fontSize: 12 }}>
            {formatRupiah(num)}
          </span>
        );
      },
    },
    {
      title: 'KREDIT (KELUAR)',
      dataIndex: 'kredit',
      key: 'kredit',
      width: 140,
      align: 'right',
      render: (val) => {
        const num = Number(val || 0);
        if (num <= 0) return <span style={{ color: subTextColor, fontSize: 11 }}>-</span>;
        return (
          <span className="tabular-nums" style={{ fontWeight: 700, color: isDark ? '#f87171' : '#b91c1c', fontFamily: 'monospace', fontSize: 12 }}>
            {formatRupiah(num)}
          </span>
        );
      },
    },
    {
      title: 'SALDO',
      dataIndex: 'saldo',
      key: 'saldo',
      width: 150,
      align: 'right',
      render: (val) => {
        const num = Number(val || 0);
        return (
          <span className="tabular-nums" style={{ fontWeight: 700, color: '#055b65', fontFamily: 'monospace', fontSize: 12 }}>
            {formatRupiah(num)}
          </span>
        );
      },
    },
  ];

  return (
    <div className="smooth-page-fade" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 14, overflowY: 'auto' }}>
      {/* 12 Months Pill Selector Bar */}
      <div
        className="smooth-card"
        style={{
          backgroundColor: cardBg,
          borderRadius: 12,
          border: `1px solid ${borderColor}`,
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: subTextColor, marginRight: 6, whiteSpace: 'nowrap' }}>
          Pilih Bulan:
        </span>
        {MONTH_NAMES.map((m) => {
          const isSelected = activeMonth.toLowerCase() === m.toLowerCase();
          const summary = summaryList.find((s) => s.bulan.toLowerCase() === m.toLowerCase());
          const drafts = summary ? summary.draftCount : 0;

          return (
            <button
              key={m}
              onClick={() => setActiveMonth(m)}
              className="smooth-clickable"
              style={{
                border: 'none',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: isSelected ? 800 : 600,
                backgroundColor: isSelected
                  ? (isDark ? '#1bd488' : '#055b65')
                  : (isDark ? '#071f24' : '#f2f6f7'),
                color: isSelected
                  ? (isDark ? '#05191d' : '#ffffff')
                  : textColor,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
                transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <span>{m}</span>
              {drafts > 0 && (
                <span
                  style={{
                    backgroundColor: isSelected ? 'rgba(0,0,0,0.25)' : '#d97706',
                    color: '#ffffff',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '0 5px',
                    borderRadius: 10,
                    lineHeight: '16px',
                  }}
                  title={`${drafts} transaksi berstatus draft`}
                >
                  {drafts}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* KPI Cards Ringkasan Bulan Terpilih */}
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} md={6} lg={4}>
          <Card
            variant="borderless"
            className="smooth-card"
            style={{ backgroundColor: cardBg, borderRadius: 10, borderLeft: '4px solid #45828b' }}
            styles={{ body: { padding: '14px 16px' } }}
          >
            <Statistic
              title={<span style={{ color: subTextColor, fontSize: 12 }}>Saldo Awal ({activeMonth})</span>}
              value={data.saldoAwal || 0}
              formatter={(val) => formatRupiah(val)}
              valueStyle={{ color: '#45828b', fontWeight: 700, fontSize: 16 }}
            />
          </Card>
        </Col>

        <Col xs={12} sm={6} md={4} lg={4}>
          <Card
            variant="borderless"
            className="smooth-card"
            style={{ backgroundColor: cardBg, borderRadius: 10, borderLeft: '4px solid #1bd488' }}
            styles={{ body: { padding: '14px 16px' } }}
          >
            <Statistic
              title={<span style={{ color: subTextColor, fontSize: 12 }}>Total Debet (Pengisian)</span>}
              value={data.totalDebet || 0}
              formatter={(val) => formatRupiah(val)}
              valueStyle={{ color: '#1bd488', fontWeight: 700, fontSize: 16 }}
            />
          </Card>
        </Col>

        <Col xs={12} sm={6} md={4} lg={4}>
          <Card
            variant="borderless"
            className="smooth-card"
            style={{ backgroundColor: cardBg, borderRadius: 10, borderLeft: '4px solid #b91c1c' }}
            styles={{ body: { padding: '14px 16px' } }}
          >
            <Statistic
              title={<span style={{ color: subTextColor, fontSize: 12 }}>Total Kredit (Belanja)</span>}
              value={data.totalKredit || 0}
              formatter={(val) => formatRupiah(val)}
              valueStyle={{ color: isDark ? '#f87171' : '#b91c1c', fontWeight: 700, fontSize: 16 }}
            />
          </Card>
        </Col>

        <Col xs={12} sm={6} md={4} lg={4}>
          <Card
            variant="borderless"
            className="smooth-card"
            style={{ backgroundColor: cardBg, borderRadius: 10, borderLeft: '4px solid #055b65' }}
            styles={{ body: { padding: '14px 16px' } }}
          >
            <Statistic
              title={<span style={{ color: subTextColor, fontSize: 12 }}>Saldo Akhir Berjalan</span>}
              value={data.saldoAkhir || 0}
              formatter={(val) => formatRupiah(val)}
              valueStyle={{ color: isDark ? '#1bd488' : '#055b65', fontWeight: 800, fontSize: 16 }}
            />
          </Card>
        </Col>

        <Col xs={12} sm={6} md={4} lg={4}>
          <Card
            variant="borderless"
            className="smooth-card"
            style={{ backgroundColor: cardBg, borderRadius: 10, borderLeft: '4px solid #d97706' }}
            styles={{ body: { padding: '14px 16px' } }}
          >
            <Statistic
              title={<span style={{ color: subTextColor, fontSize: 12 }}>Menunggu Voucher (Draft)</span>}
              value={data.draftCount || 0}
              valueStyle={{ color: '#d97706', fontWeight: 800, fontSize: 18 }}
              suffix="Baris"
            />
          </Card>
        </Col>

        <Col xs={12} sm={6} md={4} lg={4}>
          <Card
            variant="borderless"
            className="smooth-card"
            style={{ backgroundColor: cardBg, borderRadius: 10, borderLeft: '4px solid #45828b' }}
            styles={{ body: { padding: '14px 16px' } }}
          >
            <Statistic
              title={<span style={{ color: subTextColor, fontSize: 12 }}>Total Transaksi</span>}
              value={(data.transactions || []).length}
              valueStyle={{ color: textColor, fontWeight: 700, fontSize: 18 }}
              suffix="Item"
            />
          </Card>
        </Col>
      </Row>

      {/* Main Table Card */}
      <Card
        variant="borderless"
        className="smooth-card"
        style={{
          backgroundColor: cardBg,
          borderRadius: 12,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        styles={{
          body: {
            padding: 16,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          },
        }}
      >
        {/* Table Toolbar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Input
              prefix={<AiOutlineSearch style={{ color: subTextColor }} />}
              placeholder="Cari keterangan / no. voucher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
              style={{ width: 260, borderRadius: 8, fontSize: 12 }}
            />

            {/* CC Filter */}
            <div
              style={{
                display: 'flex',
                backgroundColor: isDark ? '#071f24' : '#f2f6f7',
                padding: 3,
                borderRadius: 8,
                border: `1px solid ${borderColor}`,
              }}
            >
              {[
                { id: 'ALL', label: 'Semua CC' },
                { id: 'SVC', label: 'SVC' },
                { id: 'GAD', label: 'GAD' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setCcFilter(opt.id)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: 'none',
                    fontSize: 11,
                    fontWeight: ccFilter === opt.id ? 700 : 500,
                    backgroundColor: ccFilter === opt.id ? (isDark ? '#133e46' : '#ffffff') : 'transparent',
                    color: ccFilter === opt.id ? (isDark ? '#1bd488' : '#055b65') : subTextColor,
                    cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <Checkbox
              checked={draftOnly}
              onChange={(e) => setDraftOnly(e.target.checked)}
              style={{ fontSize: 12, color: textColor }}
            >
              Hanya Draft ({data.draftCount || 0})
            </Checkbox>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              icon={<AiOutlineSync style={{ animation: loading ? 'antRotate 1s infinite linear' : 'none' }} />}
              onClick={loadMonthData}
              loading={loading}
              className="smooth-clickable"
              style={{ fontSize: 12, borderRadius: 8 }}
            >
              Refresh
            </Button>

            <Button
              type="primary"
              icon={<AiOutlinePlus />}
              onClick={openCreateModal}
              className="smooth-clickable"
              style={{
                fontSize: 12,
                borderRadius: 8,
                backgroundColor: isDark ? '#1bd488' : '#055b65',
                borderColor: isDark ? '#1bd488' : '#055b65',
                color: isDark ? '#05191d' : '#ffffff',
                fontWeight: 700,
              }}
            >
              + Input Kas Kecil
            </Button>
          </div>
        </div>

        {/* Data Table */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Table
            rowKey={(r, idx) => `${r.rowIndex || idx}`}
            columns={columns}
            dataSource={data.transactions || []}
            loading={loading}
            pagination={{
              pageSize: 25,
              showSizeChanger: true,
              pageSizeOptions: ['25', '50', '100'],
              showTotal: (total) => `Total ${total} transaksi baris`,
            }}
            size="small"
            scroll={{ x: 900 }}
          />
        </div>
      </Card>

      {/* MODAL: Input Transaksi Kas Kecil Baru */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AiOutlinePlus style={{ color: isDark ? '#1bd488' : '#055b65', fontSize: 18 }} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>Input Transaksi Kas Kecil ({activeMonth})</span>
          </div>
        }
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        footer={null}
        destroyOnHidden
        width={540}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateSubmit} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Form.Item label="Bulan Target" name="bulan" rules={[{ required: true }]}>
              <Select>
                {MONTH_NAMES.map((m) => (
                  <Option key={m} value={m}>{m}</Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item label="Tanggal (YYYY-MM-DD)" name="date" rules={[{ required: true }]}>
              <Input placeholder="YYYY-MM-DD" />
            </Form.Item>
          </div>

          <Form.Item
            label="Keterangan Transaksi"
            name="keterangan"
            rules={[{ required: true, message: 'Keterangan transaksi wajib diisi!' }]}
            extra="Ketik 'svc' untuk auto Cost Center SVC, atau 'ga' untuk auto GAD."
          >
            <Input
              placeholder="Contoh: Service pompa air SVC / BBM operasional GA"
              onChange={handleKeteranganChange}
            />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Form.Item
              label="Cost Center (CC)"
              name="cc"
              extra="Bisa terisi otomatis atau dipilih manual"
            >
              <Select
                placeholder="Pilih CC"
                allowClear
                onChange={() => setIsManualCcOverridden(true)}
              >
                <Option value="SVC">SVC (Service)</Option>
                <Option value="GAD">GAD (General Affair)</Option>
                <Option value="CA SVC">CA SVC</Option>
              </Select>
            </Form.Item>

            <Form.Item
              label="No. Voucher"
              name="noVoucher"
              extra="Default 'draft' untuk input baru"
            >
              <Input placeholder="draft" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10 }}>
            <Form.Item label="Jenis Transaksi" name="tipe" rules={[{ required: true }]}>
              <Radio.Group buttonStyle="solid">
                <Radio.Button value="KREDIT">Pengeluaran</Radio.Button>
                <Radio.Button value="DEBET">Pemasukan</Radio.Button>
              </Radio.Group>
            </Form.Item>

            <Form.Item
              label="Nominal (Rp)"
              name="nominal"
              rules={[{ required: true, message: 'Masukkan nominal rupiah!' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                formatter={(val) => `Rp ${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                parser={(val) => val.replace(/Rp\s?|(\.*)/g, '')}
                placeholder="0"
                min={1}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => setCreateModalVisible(false)}>
              Batal
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={submitting}
              style={{
                backgroundColor: isDark ? '#1bd488' : '#055b65',
                borderColor: isDark ? '#1bd488' : '#055b65',
                color: isDark ? '#05191d' : '#ffffff',
                fontWeight: 700,
              }}
            >
              Simpan ke Spreadsheet
            </Button>
          </div>
        </Form>
      </Modal>

      {/* MODAL: Update Voucher dari Draft */}
      <Modal
        title={<b>Tetapkan Nomor Voucher Resmi</b>}
        open={voucherModalVisible}
        onCancel={() => setVoucherModalVisible(false)}
        footer={null}
        destroyOnHidden
        width={420}
      >
        {targetRow && (
          <Form form={voucherForm} layout="vertical" onFinish={handleVoucherSubmit} style={{ marginTop: 12 }}>
            <div style={{ padding: 12, backgroundColor: isDark ? '#071f24' : '#f2f6f7', borderRadius: 8, marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: subTextColor }}>Baris #{targetRow.rowIndex} • {activeMonth}</div>
              <div style={{ fontWeight: 600, color: textColor, marginTop: 2 }}>{targetRow.keterangan}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1bd488', marginTop: 4 }}>
                {targetRow.kredit > 0 ? `Pengeluaran: ${formatRupiah(targetRow.kredit)}` : `Pemasukan: ${formatRupiah(targetRow.debet)}`}
              </div>
            </div>

            <Form.Item
              label="Nomor Voucher Resmi"
              name="noVoucher"
              rules={[{ required: true, message: 'Nomor voucher tidak boleh kosong!' }]}
            >
              <Input placeholder="Contoh: 2600599" />
            </Form.Item>

            <Form.Item label="Cost Center (CC)" name="cc">
              <Select placeholder="Pilih / ubah CC" allowClear>
                <Option value="SVC">SVC</Option>
                <Option value="GAD">GAD</Option>
                <Option value="CA SVC">CA SVC</Option>
              </Select>
            </Form.Item>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <Button onClick={() => setVoucherModalVisible(false)}>
                Batal
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={submitting}
                style={{
                  backgroundColor: isDark ? '#1bd488' : '#055b65',
                  borderColor: isDark ? '#1bd488' : '#055b65',
                  color: isDark ? '#05191d' : '#ffffff',
                  fontWeight: 700,
                }}
              >
                Update Voucher
              </Button>
            </div>
          </Form>
        )}
      </Modal>
    </div>
  );
}
