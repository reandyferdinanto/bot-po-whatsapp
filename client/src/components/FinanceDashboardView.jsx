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
  Divider,
  Image,
  Upload,
} from 'antd';
import {
  PlusOutlined,
  SyncOutlined,
  FileExcelOutlined,
  CopyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DollarCircleOutlined,
  ClockCircleOutlined,
  SearchOutlined,
  EyeOutlined,
  UploadOutlined,
  WhatsAppOutlined,
  LinkOutlined,
  InfoCircleOutlined,
  CheckSquareOutlined,
} from '@ant-design/icons';
import {
  getBudgets,
  createBudget,
  approveBudget,
  rejectBudget,
  submitBudgetLpj,
  closeBudget,
  syncBudgets,
  uploadNotaFiles,
} from '../services/api';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const DIVISI_OPTIONS = [
  'Purchasing',
  'Gudang / Warehouse',
  'Maintenance / Workshop',
  'Produksi',
  'Operasional / Lapangan',
  'IT & Sistem',
  'Umum / GA',
];

export default function FinanceDashboardView({ isDark = false }) {
  const [budgets, setBudgets] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [divisiFilter, setDivisiFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [approveModalVisible, setApproveModalVisible] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [lpjModalVisible, setLpjModalVisible] = useState(false);
  const [closeModalVisible, setCloseModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [activeBudget, setActiveBudget] = useState(null);

  // Forms
  const [createForm] = Form.useForm();
  const [approveForm] = Form.useForm();
  const [rejectForm] = Form.useForm();
  const [lpjForm] = Form.useForm();
  const [closeForm] = Form.useForm();
  const [lpjFileList, setLpjFileList] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getBudgets({
        status: statusFilter,
        divisi: divisiFilter,
        search: searchQuery,
      });
      if (res?.budgets) {
        setBudgets(res.budgets);
        setStats(res.stats || {});
      }
    } catch (err) {
      console.warn('Gagal memuat budgets:', err.message);
      message.error(`Gagal memuat data kasbon: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, divisiFilter, searchQuery]);

  // Sync dengan Google Sheet
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await syncBudgets();
      message.success(`Berhasil sinkronisasi: ${res.totalSynced || 0} baris diperbarui.`);
      await loadData();
    } catch (err) {
      message.error(`Gagal sinkronisasi: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  // Salin Link Form
  const copyFormLink = (type) => {
    const origin = window.location.origin;
    const path = type === 'request' ? '/form-budget' : '/form-lpj';
    const url = `${origin}${path}`;
    navigator.clipboard.writeText(url);
    message.success(`Link formulir ${type === 'request' ? 'Pengajuan' : 'LPJ'} berhasil disalin ke clipboard!`);
  };

  // Buat Budget Baru
  const handleCreateSubmit = async (values) => {
    setActionLoading(true);
    try {
      const res = await createBudget(values);
      if (res?.success) {
        message.success(`Kasbon ${res.budget?.no_budget || res.budget?.noBudget || ''} berhasil dibuat!`);
        setCreateModalVisible(false);
        createForm.resetFields();
        await loadData();
      } else {
        message.error(res?.error || 'Gagal membuat kasbon.');
      }
    } catch (err) {
      message.error(`Error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Approve Budget
  const handleApproveSubmit = async (values) => {
    if (!activeBudget) return;
    setActionLoading(true);
    try {
      const noBudget = activeBudget.no_budget || activeBudget.noBudget;
      const res = await approveBudget(noBudget, { catatanFinance: values.catatanFinance });
      if (res?.success) {
        message.success(`Kasbon ${noBudget} berhasil disetujui & dicairkan!`);
        setApproveModalVisible(false);
        approveForm.resetFields();
        await loadData();
      }
    } catch (err) {
      message.error(`Gagal menyetujui kasbon: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Reject Budget
  const handleRejectSubmit = async (values) => {
    if (!activeBudget) return;
    setActionLoading(true);
    try {
      const noBudget = activeBudget.no_budget || activeBudget.noBudget;
      const res = await rejectBudget(noBudget, { alasan: values.alasan });
      if (res?.success) {
        message.success(`Kasbon ${noBudget} telah ditolak.`);
        setRejectModalVisible(false);
        rejectForm.resetFields();
        await loadData();
      }
    } catch (err) {
      message.error(`Gagal menolak kasbon: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Submit LPJ dari Dashboard
  const handleLpjSubmit = async (values) => {
    if (!activeBudget) return;
    setActionLoading(true);
    try {
      const noBudget = activeBudget.no_budget || activeBudget.noBudget;
      let buktiNotaUrls = [];

      const rawFiles = lpjFileList
        .map((f) => f.originFileObj || f)
        .filter((f) => f instanceof File || f instanceof Blob);

      if (rawFiles.length > 0) {
        const uploadRes = await uploadNotaFiles(rawFiles);
        if (uploadRes?.success && uploadRes.files) {
          buktiNotaUrls = uploadRes.files.map((f) => f.url);
        }
      }

      const res = await submitBudgetLpj(noBudget, {
        realisasiBelanja: values.realisasiBelanja,
        catatanPemohon: values.catatanPemohon,
        buktiNota: buktiNotaUrls.join(', '),
      });

      if (res?.success) {
        message.success(`LPJ untuk ${noBudget} berhasil dicatat.`);
        setLpjModalVisible(false);
        lpjForm.resetFields();
        setLpjFileList([]);
        await loadData();
      }
    } catch (err) {
      message.error(`Gagal mencatat LPJ: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Close Budget (Verifikasi selesai & lunas)
  const handleCloseSubmit = async (values) => {
    if (!activeBudget) return;
    setActionLoading(true);
    try {
      const noBudget = activeBudget.no_budget || activeBudget.noBudget;
      const res = await closeBudget(noBudget, {
        catatanFinance: values.catatanFinance,
        sisaKembaliDiterima: values.sisaKembaliDiterima,
      });

      if (res?.success) {
        message.success(`Kasbon ${noBudget} berhasil ditutup & selesai!`);
        setCloseModalVisible(false);
        closeForm.resetFields();
        await loadData();
      }
    } catch (err) {
      message.error(`Gagal menutup kasbon: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const cardBg = isDark ? '#0a252a' : '#ffffff';
  const tableHeaderBg = isDark ? '#071f24' : '#f2f6f7';
  const textColor = isDark ? '#fbfcfc' : '#055b65';
  const subTextColor = isDark ? '#8ea8ab' : '#5c7e84';
  const borderColor = isDark ? '#133e46' : '#e0e5e9';

  // Render Status Tag
  const renderStatusTag = (status) => {
    const s = String(status || '').toUpperCase();
    switch (s) {
      case 'PENDING':
        return <Tag color="warning" icon={<ClockCircleOutlined />}>PENDING APPROVAL</Tag>;
      case 'APPROVED':
        return <Tag color="processing" icon={<DollarCircleOutlined />}>DANA DICAIRKAN</Tag>;
      case 'LPJ_SUBMITTED':
        return <Tag color="cyan" icon={<CheckSquareOutlined />}>LPJ MASUK</Tag>;
      case 'CLOSED':
        return <Tag color="success" icon={<CheckCircleOutlined />}>CLOSED / SELESAI</Tag>;
      case 'REJECTED':
        return <Tag color="error" icon={<CloseCircleOutlined />}>DITOLAK</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  // Table Columns
  const columns = [
    {
      title: 'No. Budget',
      dataIndex: 'no_budget',
      key: 'no_budget',
      width: 140,
      render: (val, record) => {
        const no = val || record.noBudget || '-';
        return (
          <Space orientation="horizontal" size={4}>
            <Text strong style={{ color: '#0284c7' }}>{no}</Text>
            <Tooltip title="Salin No. Budget">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined style={{ fontSize: 12, color: subTextColor }} />}
                onClick={() => {
                  navigator.clipboard.writeText(no);
                  message.success(`No. ${no} disalin!`);
                }}
              />
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: 'Tgl Kasbon',
      dataIndex: 'tgl_kasbon',
      key: 'tgl_kasbon',
      width: 105,
      render: (val, record) => <Text style={{ fontSize: 13 }}>{val || record.tglKasbon || '-'}</Text>,
    },
    {
      title: 'Pemohon & Divisi',
      key: 'pemohon',
      width: 180,
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 600, color: textColor }}>{record.nama}</div>
          <Space size={6} style={{ marginTop: 2 }}>
            <Tag style={{ fontSize: 11, padding: '0 4px', margin: 0 }}>{record.divisi}</Tag>
            {record.no_wa && (
              <a
                href={`https://wa.me/${record.no_wa.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#10b981', fontSize: 12 }}
                title="Kirim pesan WhatsApp"
              >
                <WhatsAppOutlined />
              </a>
            )}
          </Space>
        </div>
      ),
    },
    {
      title: 'Uraian Kebutuhan',
      dataIndex: 'uraian',
      key: 'uraian',
      ellipsis: true,
      render: (val) => <Text style={{ fontSize: 13 }}>{val || '-'}</Text>,
    },
    {
      title: 'Jumlah Kasbon',
      dataIndex: 'jumlah',
      key: 'jumlah',
      width: 130,
      align: 'right',
      render: (val) => (
        <Text strong style={{ color: '#047857' }}>
          Rp {Number(val || 0).toLocaleString('id-ID')}
        </Text>
      ),
    },
    {
      title: 'Realisasi Belanja',
      dataIndex: 'realisasi_belanja',
      key: 'realisasi_belanja',
      width: 130,
      align: 'right',
      render: (val) => (
        <Text style={{ color: Number(val) > 0 ? textColor : subTextColor }}>
          {Number(val) > 0 ? `Rp ${Number(val).toLocaleString('id-ID')}` : '-'}
        </Text>
      ),
    },
    {
      title: 'Sisa Kembali',
      dataIndex: 'sisa_kembali',
      key: 'sisa_kembali',
      width: 120,
      align: 'right',
      render: (val, record) => {
        const num = Number(val || 0);
        if (num <= 0 && record.status !== 'CLOSED' && record.status !== 'LPJ_SUBMITTED') {
          return <Text style={{ color: subTextColor }}>-</Text>;
        }
        return (
          <Text strong style={{ color: num > 0 ? '#0284c7' : '#64748b' }}>
            Rp {num.toLocaleString('id-ID')}
          </Text>
        );
      },
    },
    {
      title: 'Bukti Nota',
      dataIndex: 'bukti_nota',
      key: 'bukti_nota',
      width: 95,
      align: 'center',
      render: (val) => {
        if (!val) return <Text style={{ color: subTextColor, fontSize: 12 }}>Belum ada</Text>;
        const urls = val.split(',').map((u) => u.trim()).filter(Boolean);
        return (
          <Space size={4}>
            {urls.slice(0, 2).map((url, idx) => (
              <Image
                key={idx}
                src={url}
                width={28}
                height={28}
                style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #cbd5e1' }}
                fallback="https://via.placeholder.com/28?text=Nota"
              />
            ))}
            {urls.length > 2 && <Tag style={{ margin: 0, padding: '0 3px' }}>+{urls.length - 2}</Tag>}
          </Space>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 155,
      align: 'center',
      render: (val) => renderStatusTag(val),
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 175,
      align: 'center',
      render: (_, record) => {
        const st = String(record.status || '').toUpperCase();
        return (
          <Space size={6} wrap>
            {st === 'PENDING' && (
              <>
                <Button
                  type="primary"
                  size="small"
                  style={{ backgroundColor: '#047857', borderColor: '#047857', fontSize: 12 }}
                  onClick={() => {
                    setActiveBudget(record);
                    approveForm.resetFields();
                    setApproveModalVisible(true);
                  }}
                >
                  Setujui
                </Button>
                <Button
                  danger
                  size="small"
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    setActiveBudget(record);
                    rejectForm.resetFields();
                    setRejectModalVisible(true);
                  }}
                >
                  Tolak
                </Button>
              </>
            )}

            {st === 'APPROVED' && (
              <Button
                type="primary"
                size="small"
                style={{ backgroundColor: '#0284c7', borderColor: '#0284c7', fontSize: 12 }}
                onClick={() => {
                  setActiveBudget(record);
                  lpjForm.setFieldsValue({
                    realisasiBelanja: record.realisasi_belanja || 0,
                    catatanPemohon: '',
                  });
                  setLpjFileList([]);
                  setLpjModalVisible(true);
                }}
              >
                Input LPJ
              </Button>
            )}

            {st === 'LPJ_SUBMITTED' && (
              <Button
                type="primary"
                size="small"
                style={{ backgroundColor: '#059669', borderColor: '#059669', fontSize: 12 }}
                onClick={() => {
                  setActiveBudget(record);
                  closeForm.setFieldsValue({
                    sisaKembaliDiterima: record.sisa_kembali || 0,
                    catatanFinance: 'Nota belanja & uang kembalian telah diverifikasi lunas.',
                  });
                  setCloseModalVisible(true);
                }}
              >
                Closing (Lunas)
              </Button>
            )}

            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                setActiveBudget(record);
                setDetailModalVisible(true);
              }}
            />
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 14, overflowY: 'auto' }}>
      {/* KPI Statistic Cards */}
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} md={6} lg={4}>
          <Card
            bordered={false}
            className="smooth-card"
            style={{ backgroundColor: cardBg, borderRadius: 10, borderLeft: '4px solid #055b65' }}
            bodyStyle={{ padding: '14px 16px' }}
          >
            <Statistic
              title={<span style={{ color: subTextColor, fontSize: 12 }}>Total Kasbon (Rp)</span>}
              value={stats.totalNominal || 0}
              formatter={(val) => `Rp ${Number(val).toLocaleString('id-ID')}`}
              valueStyle={{ color: isDark ? '#1bd488' : '#055b65', fontWeight: 700, fontSize: 18 }}
            />
          </Card>
        </Col>

        <Col xs={12} sm={6} md={4} lg={3}>
          <Card
            bordered={false}
            className="smooth-card"
            style={{ backgroundColor: cardBg, borderRadius: 10, borderLeft: '4px solid #d97706' }}
            bodyStyle={{ padding: '14px 16px' }}
          >
            <Statistic
              title={<span style={{ color: subTextColor, fontSize: 12 }}>Pending Approval</span>}
              value={stats.countPending || 0}
              valueStyle={{ color: '#d97706', fontWeight: 700, fontSize: 18 }}
            />
          </Card>
        </Col>

        <Col xs={12} sm={6} md={4} lg={3}>
          <Card
            bordered={false}
            className="smooth-card"
            style={{ backgroundColor: cardBg, borderRadius: 10, borderLeft: '4px solid #45828b' }}
            bodyStyle={{ padding: '14px 16px' }}
          >
            <Statistic
              title={<span style={{ color: subTextColor, fontSize: 12 }}>Dana Dicairkan</span>}
              value={stats.countApproved || 0}
              valueStyle={{ color: '#45828b', fontWeight: 700, fontSize: 18 }}
            />
          </Card>
        </Col>

        <Col xs={12} sm={6} md={4} lg={3}>
          <Card
            bordered={false}
            className="smooth-card"
            style={{ backgroundColor: cardBg, borderRadius: 10, borderLeft: '4px solid #1bd488' }}
            bodyStyle={{ padding: '14px 16px' }}
          >
            <Statistic
              title={<span style={{ color: subTextColor, fontSize: 12 }}>LPJ Masuk</span>}
              value={stats.countLpjSubmitted || 0}
              valueStyle={{ color: '#1bd488', fontWeight: 700, fontSize: 18 }}
            />
          </Card>
        </Col>

        <Col xs={12} sm={6} md={4} lg={3}>
          <Card
            bordered={false}
            className="smooth-card"
            style={{ backgroundColor: cardBg, borderRadius: 10, borderLeft: '4px solid #1bd488' }}
            bodyStyle={{ padding: '14px 16px' }}
          >
            <Statistic
              title={<span style={{ color: subTextColor, fontSize: 12 }}>Closed / Selesai</span>}
              value={stats.countClosed || 0}
              valueStyle={{ color: '#1bd488', fontWeight: 700, fontSize: 18 }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={8} lg={8}>
          <Card
            bordered={false}
            className="smooth-card"
            style={{ backgroundColor: cardBg, borderRadius: 10, borderLeft: '4px solid #055b65' }}
            bodyStyle={{ padding: '14px 16px' }}
          >
            <Row gutter={8}>
              <Col span={12}>
                <Statistic
                  title={<span style={{ color: subTextColor, fontSize: 12 }}>Realisasi Belanja</span>}
                  value={stats.totalRealisasi || 0}
                  formatter={(val) => `Rp ${Number(val).toLocaleString('id-ID')}`}
                  valueStyle={{ color: textColor, fontWeight: 700, fontSize: 15 }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title={<span style={{ color: subTextColor, fontSize: 12 }}>Sisa Kas Kembali</span>}
                  value={stats.totalSisaKembali || 0}
                  formatter={(val) => `Rp ${Number(val).toLocaleString('id-ID')}`}
                  valueStyle={{ color: '#0284c7', fontWeight: 700, fontSize: 15 }}
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      {/* Main Table Card */}
      <Card
        bordered={false}
        style={{ backgroundColor: cardBg, borderRadius: 10, flex: 1, display: 'flex', flexDirection: 'column' }}
        bodyStyle={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column' }}
      >
        {/* Top Control Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <Space wrap size={8}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                const now = new Date();
                const d = String(now.getDate()).padStart(2, '0');
                const m = String(now.getMonth() + 1).padStart(2, '0');
                const y = now.getFullYear();
                createForm.resetFields();
                createForm.setFieldsValue({
                  tglKasbon: `${d}/${m}/${y}`,
                  divisi: 'Purchasing',
                });
                setCreateModalVisible(true);
              }}
              style={{ backgroundColor: '#047857', borderColor: '#047857' }}
            >
              Pengajuan Kasbon Baru
            </Button>

            <Button
              icon={<SyncOutlined spin={syncing} />}
              onClick={handleSync}
              loading={syncing}
            >
              Sinkron Google Sheet
            </Button>

            <Button
              icon={<FileExcelOutlined />}
              href="https://docs.google.com/spreadsheets/d/1kYdVrUCfMwv2_FtvC3RtDGH2GxwKB6zp_SMzEEm863A/edit#gid=0"
              target="_blank"
            >
              Buka Google Sheet
            </Button>

            <Button
              icon={<LinkOutlined />}
              onClick={() => copyFormLink('request')}
            >
              Salin Link Form Pengajuan
            </Button>

            <Button
              icon={<LinkOutlined />}
              onClick={() => copyFormLink('lpj')}
            >
              Salin Link Form LPJ
            </Button>
          </Space>

          <Space wrap size={8}>
            <Select
              value={divisiFilter}
              onChange={setDivisiFilter}
              style={{ width: 160 }}
              placeholder="Filter Divisi"
            >
              <Option value="ALL">Semua Divisi</Option>
              {DIVISI_OPTIONS.map((d) => (
                <Option key={d} value={d}>{d}</Option>
              ))}
            </Select>

            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 170 }}
              placeholder="Filter Status"
            >
              <Option value="ALL">Semua Status</Option>
              <Option value="PENDING">Menunggu Approval</Option>
              <Option value="APPROVED">Dana Dicairkan</Option>
              <Option value="LPJ_SUBMITTED">LPJ Masuk</Option>
              <Option value="CLOSED">Closed (Selesai)</Option>
              <Option value="REJECTED">Ditolak</Option>
            </Select>

            <Input
              placeholder="Cari No. Budget, Nama, Uraian..."
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: 240 }}
              allowClear
            />
          </Space>
        </div>

        {/* Table */}
        <Table
          dataSource={budgets}
          columns={columns}
          rowKey={(r) => r.id || r.no_budget || r.noBudget}
          loading={loading}
          pagination={{ pageSize: 12, showSizeChanger: true, showTotal: (t) => `Total ${t} Kasbon` }}
          scroll={{ x: 1200 }}
          size="middle"
        />
      </Card>

      {/* ======================================================== */}
      {/* MODAL: Pengajuan Kasbon Baru                             */}
      {/* ======================================================== */}
      <Modal
        title={<b>Buat Pengajuan Kasbon & Budget Baru</b>}
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateSubmit} style={{ marginTop: 12 }}>
          <Form.Item label="Nama Pemohon" name="nama" rules={[{ required: true, message: 'Nama pemohon wajib diisi!' }]}>
            <Input placeholder="Nama karyawan / pemohon" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Form.Item label="Divisi" name="divisi" rules={[{ required: true }]}>
              <Select>
                {DIVISI_OPTIONS.map((d) => (
                  <Option key={d} value={d}>{d}</Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="No. WhatsApp" name="noWa" rules={[{ required: true }]}>
              <Input placeholder="08xxxxxxxxxx" />
            </Form.Item>
          </div>

          <Form.Item label="Tanggal Kasbon" name="tglKasbon" rules={[{ required: true }]}>
            <Input placeholder="DD/MM/YYYY" />
          </Form.Item>

          <Form.Item label="Uraian Peruntukan Dana" name="uraian" rules={[{ required: true }]}>
            <TextArea rows={3} placeholder="Keperluan pembelian barang/jasa atau operasional lapangan" />
          </Form.Item>

          <Form.Item label="Jumlah Kasbon (Rp)" name="jumlah" rules={[{ required: true }]}>
            <InputNumber
              style={{ width: '100%' }}
              min={1000}
              step={10000}
              formatter={(value) => `Rp ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(value) => value.replace(/Rp\s?|(\.*)/g, '')}
            />
          </Form.Item>

          <Form.Item label="Catatan Tambahan" name="catatanFinance">
            <Input placeholder="Catatan internal" />
          </Form.Item>

          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Space>
              <Button onClick={() => setCreateModalVisible(false)}>Batal</Button>
              <Button type="primary" htmlType="submit" loading={actionLoading} style={{ backgroundColor: '#047857', borderColor: '#047857' }}>
                Simpan & Daftarkan Kasbon
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL: Approve Kasbon (Finance Menyerahkan Uang)         */}
      {/* ======================================================== */}
      <Modal
        title={<b>Setujui & Serahkan Uang Kasbon</b>}
        open={approveModalVisible}
        onCancel={() => setApproveModalVisible(false)}
        footer={null}
        destroyOnHidden
      >
        {activeBudget && (
          <Form form={approveForm} layout="vertical" onFinish={handleApproveSubmit}>
            <div style={{ padding: 12, backgroundColor: isDark ? '#0f172a' : '#f0fdf4', borderRadius: 8, marginBottom: 16 }}>
              <div><b>No. Budget:</b> {activeBudget.no_budget || activeBudget.noBudget}</div>
              <div><b>Pemohon:</b> {activeBudget.nama} ({activeBudget.divisi})</div>
              <div><b>Nominal Dana:</b> Rp {Number(activeBudget.jumlah || 0).toLocaleString('id-ID')}</div>
              <div><b>Uraian:</b> {activeBudget.uraian}</div>
            </div>

            <Paragraph style={{ color: subTextColor, fontSize: 13 }}>
              Dengan menyetujui pengajuan ini, status tiket akan berubah menjadi <b>APPROVED</b> dan dana fisik diserahkan kepada pemohon.
            </Paragraph>

            <Form.Item label="Catatan Persetujuan Finance (Opsional)" name="catatanFinance">
              <Input placeholder="Misal: Uang diserahkan tunai di kasir finance" />
            </Form.Item>

            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setApproveModalVisible(false)}>Batal</Button>
                <Button type="primary" htmlType="submit" loading={actionLoading} style={{ backgroundColor: '#047857', borderColor: '#047857' }}>
                  Setujui & Serahkan Uang
                </Button>
              </Space>
            </div>
          </Form>
        )}
      </Modal>

      {/* ======================================================== */}
      {/* MODAL: Reject Kasbon                                    */}
      {/* ======================================================== */}
      <Modal
        title={<b>Tolak Pengajuan Kasbon</b>}
        open={rejectModalVisible}
        onCancel={() => setRejectModalVisible(false)}
        footer={null}
        destroyOnHidden
      >
        {activeBudget && (
          <Form form={rejectForm} layout="vertical" onFinish={handleRejectSubmit}>
            <Paragraph>
              Apakah Anda yakin ingin menolak kasbon <b>{activeBudget.no_budget || activeBudget.noBudget}</b> pemohon <b>{activeBudget.nama}</b>?
            </Paragraph>
            <Form.Item label="Alasan Penolakan" name="alasan" rules={[{ required: true, message: 'Sebutkan alasan penolakan!' }]}>
              <TextArea rows={3} placeholder="Contoh: Anggaran belum disetujui manajemen / pengajuan ganda" />
            </Form.Item>
            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setRejectModalVisible(false)}>Batal</Button>
                <Button danger type="primary" htmlType="submit" loading={actionLoading}>
                  Tolak Pengajuan
                </Button>
              </Space>
            </div>
          </Form>
        )}
      </Modal>

      {/* ======================================================== */}
      {/* MODAL: Input / Review LPJ                                */}
      {/* ======================================================== */}
      <Modal
        title={<b>Laporan Pertanggungjawaban (LPJ) & Bukti Nota</b>}
        open={lpjModalVisible}
        onCancel={() => setLpjModalVisible(false)}
        footer={null}
        destroyOnHidden
      >
        {activeBudget && (
          <Form form={lpjForm} layout="vertical" onFinish={handleLpjSubmit}>
            <div style={{ padding: 12, backgroundColor: isDark ? '#0f172a' : '#f0f9ff', borderRadius: 8, marginBottom: 16 }}>
              <div><b>No. Budget:</b> {activeBudget.no_budget || activeBudget.noBudget}</div>
              <div><b>Pemohon:</b> {activeBudget.nama} ({activeBudget.divisi})</div>
              <div><b>Dana Kasbon Awal:</b> Rp {Number(activeBudget.jumlah || 0).toLocaleString('id-ID')}</div>
            </div>

            <Form.Item
              label="Realisasi Belanja Aktual (Rp)"
              name="realisasiBelanja"
              rules={[{ required: true, message: 'Masukkan realisasi belanja sesuai nota!' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                step={1000}
                formatter={(value) => `Rp ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                parser={(value) => value.replace(/Rp\s?|(\.*)/g, '')}
              />
            </Form.Item>

            <Form.Item label="Upload Foto Bukti Nota / Bon Belanja">
              <Upload
                fileList={lpjFileList}
                beforeUpload={(file) => {
                  setLpjFileList((prev) => [...prev, file]);
                  return false;
                }}
                onRemove={(file) => {
                  setLpjFileList((prev) => prev.filter((item) => item.uid !== file.uid));
                }}
                multiple
                listType="picture"
              >
                <Button icon={<UploadOutlined />}>Pilih Foto Nota (Max 5)</Button>
              </Upload>
            </Form.Item>

            <Form.Item label="Catatan LPJ" name="catatanPemohon">
              <TextArea rows={2} placeholder="Keterangan toko atau rincian barang yang dibeli" />
            </Form.Item>

            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setLpjModalVisible(false)}>Batal</Button>
                <Button type="primary" htmlType="submit" loading={actionLoading} style={{ backgroundColor: '#0284c7', borderColor: '#0284c7' }}>
                  Simpan LPJ
                </Button>
              </Space>
            </div>
          </Form>
        )}
      </Modal>

      {/* ======================================================== */}
      {/* MODAL: Closing / Selesai (Finance Terima Nota & Uang Sisa)*/}
      {/* ======================================================== */}
      <Modal
        title={<b>Closing Tiket Kasbon (Lunas)</b>}
        open={closeModalVisible}
        onCancel={() => setCloseModalVisible(false)}
        footer={null}
        destroyOnHidden
      >
        {activeBudget && (
          <Form form={closeForm} layout="vertical" onFinish={handleCloseSubmit}>
            <div style={{ padding: 12, backgroundColor: isDark ? '#0f172a' : '#ecfdf5', borderRadius: 8, marginBottom: 16 }}>
              <div><b>No. Budget:</b> {activeBudget.no_budget || activeBudget.noBudget}</div>
              <div><b>Pemohon:</b> {activeBudget.nama} ({activeBudget.divisi})</div>
              <div><b>Kasbon Awal:</b> Rp {Number(activeBudget.jumlah || 0).toLocaleString('id-ID')}</div>
              <div><b>Realisasi Belanja:</b> Rp {Number(activeBudget.realisasi_belanja || 0).toLocaleString('id-ID')}</div>
              <div style={{ color: '#047857', fontWeight: 700, marginTop: 4 }}>
                Sisa Kembali Diterima: Rp {Number(activeBudget.sisa_kembali || 0).toLocaleString('id-ID')}
              </div>
            </div>

            <Form.Item
              label="Konfirmasi Nominal Uang Sisa Kembali Fisik (Rp)"
              name="sisaKembaliDiterima"
              rules={[{ required: true }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                formatter={(value) => `Rp ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                parser={(value) => value.replace(/Rp\s?|(\.*)/g, '')}
              />
            </Form.Item>

            <Form.Item label="Catatan Verifikasi Finance" name="catatanFinance">
              <TextArea rows={2} placeholder="Keterangan nota fisik dan uang kembalian telah sesuai" />
            </Form.Item>

            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setCloseModalVisible(false)}>Batal</Button>
                <Button type="primary" htmlType="submit" loading={actionLoading} style={{ backgroundColor: '#059669', borderColor: '#059669' }}>
                  Tutup & Selesaikan Tiket
                </Button>
              </Space>
            </div>
          </Form>
        )}
      </Modal>

      {/* ======================================================== */}
      {/* MODAL: Detail Audit & Dokumen                           */}
      {/* ======================================================== */}
      <Modal
        title={<b>Detail Kasbon & Riwayat</b>}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            Tutup
          </Button>,
        ]}
        width={600}
      >
        {activeBudget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Title level={4} style={{ margin: 0, color: '#0284c7' }}>
                {activeBudget.no_budget || activeBudget.noBudget}
              </Title>
              {renderStatusTag(activeBudget.status)}
            </div>

            <Divider style={{ margin: '8px 0' }} />

            <Row gutter={[12, 8]}>
              <Col span={12}><b>Nama Pemohon:</b> {activeBudget.nama}</Col>
              <Col span={12}><b>Divisi:</b> {activeBudget.divisi}</Col>
              <Col span={12}><b>No. WhatsApp:</b> {activeBudget.no_wa || '-'}</Col>
              <Col span={12}><b>Tgl Kasbon:</b> {activeBudget.tgl_kasbon || activeBudget.tglKasbon}</Col>
              <Col span={12}><b>Tgl Selesai:</b> {activeBudget.tgl_selesai || '-'}</Col>
              <Col span={24}><b>Uraian:</b> {activeBudget.uraian}</Col>
            </Row>

            <Divider style={{ margin: '8px 0' }} />

            <div style={{ backgroundColor: isDark ? '#0f172a' : '#f8fafc', padding: 12, borderRadius: 8 }}>
              <Row gutter={8}>
                <Col span={8}>
                  <Statistic
                    title="Kasbon Diberikan"
                    value={activeBudget.jumlah || 0}
                    formatter={(v) => `Rp ${Number(v).toLocaleString('id-ID')}`}
                    valueStyle={{ fontSize: 14, color: '#047857' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Realisasi Belanja"
                    value={activeBudget.realisasi_belanja || 0}
                    formatter={(v) => `Rp ${Number(v).toLocaleString('id-ID')}`}
                    valueStyle={{ fontSize: 14, color: textColor }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Sisa Kas Kembali"
                    value={activeBudget.sisa_kembali || 0}
                    formatter={(v) => `Rp ${Number(v).toLocaleString('id-ID')}`}
                    valueStyle={{ fontSize: 14, color: '#0284c7' }}
                  />
                </Col>
              </Row>
            </div>

            {activeBudget.catatan_finance && (
              <div style={{ fontSize: 13, color: subTextColor }}>
                <b>Catatan Finance:</b> {activeBudget.catatan_finance}
              </div>
            )}

            {/* Bukti Nota Gallery */}
            <div>
              <b>Foto Bukti Nota:</b>
              {activeBudget.bukti_nota ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {activeBudget.bukti_nota.split(',').map((u, i) => (
                    <Image
                      key={i}
                      src={u.trim()}
                      width={90}
                      height={90}
                      style={{ objectFit: 'cover', borderRadius: 6, border: '1px solid #cbd5e1' }}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ color: subTextColor, fontSize: 13, marginTop: 4 }}>Belum ada foto nota yang diunggah.</div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
