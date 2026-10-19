import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Form,
  Input,
  InputNumber,
  Button,
  Select,
  Typography,
  Alert,
  Result,
  Upload,
  Divider,
  Space,
  Tag,
  message,
  Spin,
} from 'antd';
import {
  FileTextOutlined,
  DollarCircleOutlined,
  UserOutlined,
  PhoneOutlined,
  CheckCircleOutlined,
  UploadOutlined,
  SearchOutlined,
  ArrowLeftOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { createBudget, getBudgetDetail, submitBudgetLpj, uploadNotaFiles } from '../services/api';

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

export default function FinanceBudgetPublicForm({ mode = 'request', isDark = false }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [submittedData, setSubmittedData] = useState(null);

  // States khusus mode LPJ
  const [checkingBudget, setCheckingBudget] = useState(false);
  const [targetBudget, setTargetBudget] = useState(null);
  const [fileList, setFileList] = useState([]);
  const [calculatedSisa, setCalculatedSisa] = useState(0);

  const initialWa = searchParams.get('wa') || '';
  const initialNo = searchParams.get('no') || '';

  useEffect(() => {
    if (mode === 'request') {
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      form.setFieldsValue({
        noWa: initialWa,
        tglKasbon: `${day}/${month}/${year}`,
        divisi: 'Purchasing',
      });
    } else if (mode === 'lpj' && initialNo) {
      form.setFieldsValue({ noBudget: initialNo });
      handleCheckBudget(initialNo);
    }
  }, [mode, initialWa, initialNo]);

  const handleCheckBudget = async (no) => {
    const cleanNo = (no || form.getFieldValue('noBudget') || '').trim();
    if (!cleanNo) {
      message.warning('Masukkan nomor budget terlebih dahulu.');
      return;
    }
    setCheckingBudget(true);
    try {
      const res = await getBudgetDetail(cleanNo);
      if (res?.budget) {
        setTargetBudget(res.budget);
        const jumlahAwal = parseFloat(res.budget.jumlah) || 0;
        const currentReal = parseFloat(res.budget.realisasi_belanja) || 0;
        setCalculatedSisa(Math.max(0, jumlahAwal - currentReal));
        message.success(`Data ${res.budget.no_budget || cleanNo} ditemukan!`);
      } else {
        setTargetBudget(null);
        message.error(`Nomor budget ${cleanNo} tidak ditemukan.`);
      }
    } catch (err) {
      setTargetBudget(null);
      message.error(`Gagal menemukan nomor budget: ${err.message}`);
    } finally {
      setCheckingBudget(false);
    }
  };

  const handleRealChange = (val) => {
    if (!targetBudget) return;
    const jumlahAwal = parseFloat(targetBudget.jumlah) || 0;
    const real = parseFloat(val) || 0;
    setCalculatedSisa(Math.max(0, jumlahAwal - real));
  };

  // Submit pengajuan kasbon baru
  const handleRequestSubmit = async (values) => {
    setLoading(true);
    try {
      const res = await createBudget({
        nama: values.nama,
        uraian: values.uraian,
        jumlah: values.jumlah,
        divisi: values.divisi,
        noWa: values.noWa,
        tglKasbon: values.tglKasbon,
        catatanFinance: values.catatanFinance,
      });

      if (res?.success) {
        setSubmittedData(res.budget);
        message.success('Pengajuan kasbon berhasil dikirimkan!');
      } else {
        message.error(res?.error || 'Gagal mengirim pengajuan.');
      }
    } catch (err) {
      message.error(`Terjadi kesalahan: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Submit LPJ & Upload foto bukti nota
  const handleLpjSubmit = async (values) => {
    if (!targetBudget) {
      message.error('Silakan periksa dan pastikan Nomor Budget valid terlebih dahulu.');
      return;
    }

    setLoading(true);
    try {
      let buktiNotaUrls = [];

      // Upload file nota jika ada file baru di list
      const rawFiles = fileList
        .map((f) => f.originFileObj || f)
        .filter((f) => f instanceof File || f instanceof Blob);

      if (rawFiles.length > 0) {
        const uploadRes = await uploadNotaFiles(rawFiles);
        if (uploadRes?.success && uploadRes.files) {
          buktiNotaUrls = uploadRes.files.map((f) => f.url);
        }
      }

      const res = await submitBudgetLpj(targetBudget.no_budget || targetBudget.noBudget, {
        realisasiBelanja: values.realisasiBelanja,
        catatanPemohon: values.catatanPemohon,
        buktiNota: buktiNotaUrls.join(', '),
      });

      if (res?.success) {
        setSubmittedData({
          ...res.budget,
          isLpj: true,
        });
        message.success('Laporan Pertanggungjawaban (LPJ) berhasil dikirim!');
      } else {
        message.error(res?.error || 'Gagal submit LPJ.');
      }
    } catch (err) {
      message.error(`Gagal submit LPJ: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const cardBg = isDark ? '#1e293b' : '#ffffff';
  const pageBg = isDark ? '#0f172a' : '#f8fafc';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const subTextColor = isDark ? '#94a3b8' : '#64748b';

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: pageBg,
        padding: '24px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        fontFamily: "'Calibri', 'Carlito', sans-serif",
      }}
    >
      <div style={{ width: '100%', maxWidth: 560 }}>
        {/* Tombol kembali ke Dashboard jika dibuka dari desktop */}
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/finance')}
            style={{ color: subTextColor, paddingLeft: 0 }}
          >
            Kembali ke Dashboard Finance
          </Button>
          <Tag style={{ borderColor: isDark ? '#1bd488' : '#055b65', color: isDark ? '#1bd488' : '#055b65', fontWeight: 600 }}>
            {mode === 'request' ? 'Formulir Permintaan Budget' : 'Formulir LPJ & Nota'}
          </Tag>
        </div>

        <Card
          bordered={false}
          className="smooth-card smooth-page-fade"
          style={{
            backgroundColor: cardBg,
            borderRadius: 16,
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden',
          }}
          bodyStyle={{ padding: '28px 24px' }}
        >
          {/* Header Title */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                backgroundColor: isDark ? 'rgba(27,212,136,0.15)' : 'rgba(178,201,197,0.3)',
                color: isDark ? '#1bd488' : '#055b65',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 26,
                marginBottom: 12,
              }}
            >
              {mode === 'request' ? <DollarCircleOutlined /> : <FileTextOutlined />}
            </div>
            <Title level={3} style={{ margin: 0, color: textColor, fontWeight: 700 }}>
              {mode === 'request' ? 'Pengajuan Kasbon & Budget' : 'Laporan Pertanggungjawaban (LPJ)'}
            </Title>
            <Text style={{ color: subTextColor, fontSize: 13, marginTop: 4, display: 'block' }}>
              {mode === 'request'
                ? 'Permintaan dana operasional divisi Purchasing, Gudang & Maintenance'
                : 'Laporan belanja aktual & upload foto bukti nota bon untuk Finance'}
            </Text>
          </div>

          {/* Success Result View */}
          {submittedData ? (
            <Result
              status="success"
              title={submittedData.isLpj ? 'LPJ Berhasil Dikirimkan!' : 'Pengajuan Berhasil Terkirim!'}
              subTitle={
                <div style={{ textAlign: 'left', marginTop: 12, fontSize: 13, color: textColor }}>
                  <Alert
                    type="success"
                    showIcon
                    style={{ marginBottom: 16, borderRadius: 8 }}
                    message={
                      <b>
                        Nomor Tiket: {submittedData.no_budget || submittedData.noBudget || 'BGT-2026-XXXX'}
                      </b>
                    }
                    description={
                      submittedData.isLpj
                        ? 'Laporan nota belanja Anda telah tercatat. Silakan serahkan nota fisik asli dan uang kembalian (jika ada) ke meja Finance untuk closing.'
                        : 'Permintaan kasbon Anda sedang menunggu peninjauan Finance. Silakan simpan nomor tiket ini untuk pengecekan status.'
                    }
                  />

                  <div
                    style={{
                      backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                      padding: 14,
                      borderRadius: 10,
                      border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                      lineHeight: 1.8,
                    }}
                  >
                    <div><b>Pemohon:</b> {submittedData.nama}</div>
                    <div><b>Divisi:</b> {submittedData.divisi}</div>
                    <div><b>Tanggal:</b> {submittedData.tgl_kasbon || submittedData.tglKasbon}</div>
                    <div><b>Uraian:</b> {submittedData.uraian}</div>
                    <div>
                      <b>Pengajuan Kasbon:</b> Rp {Number(submittedData.jumlah || 0).toLocaleString('id-ID')}
                    </div>
                    {submittedData.isLpj && (
                      <>
                        <div>
                          <b>Realisasi Belanja:</b> Rp {Number(submittedData.realisasi_belanja || submittedData.realisasiBelanja || 0).toLocaleString('id-ID')}
                        </div>
                        <div style={{ color: '#047857', fontWeight: 600 }}>
                          <b>Sisa Uang Kembali:</b> Rp {Number(submittedData.sisa_kembali || submittedData.sisaKembali || 0).toLocaleString('id-ID')}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              }
              extra={[
                <Button
                  key="reset"
                  type="primary"
                  style={{ backgroundColor: '#047857', borderColor: '#047857', borderRadius: 8 }}
                  onClick={() => {
                    setSubmittedData(null);
                    setTargetBudget(null);
                    form.resetFields();
                  }}
                >
                  {mode === 'request' ? 'Buat Pengajuan Baru' : 'Submit LPJ Lainnya'}
                </Button>,
                <Button key="dashboard" onClick={() => navigate('/finance')}>
                  Lihat Rekap di Dashboard
                </Button>,
              ]}
            />
          ) : mode === 'request' ? (
            /* ========================================== */
            /* MODE PENGAJUAN BUDGET (REQUEST)            */
            /* ========================================== */
            <Form form={form} layout="vertical" onFinish={handleRequestSubmit}>
              <Form.Item
                label={<b>Nama Pemohon</b>}
                name="nama"
                rules={[{ required: true, message: 'Nama pemohon wajib diisi!' }]}
              >
                <Input prefix={<UserOutlined style={{ color: '#94a3b8' }} />} placeholder="Contoh: Budi Santoso" size="large" />
              </Form.Item>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Form.Item
                  label={<b>Divisi</b>}
                  name="divisi"
                  rules={[{ required: true, message: 'Pilih divisi pemohon!' }]}
                >
                  <Select size="large">
                    {DIVISI_OPTIONS.map((d) => (
                      <Option key={d} value={d}>{d}</Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item
                  label={<b>No. WhatsApp (Aktif)</b>}
                  name="noWa"
                  rules={[{ required: true, message: 'Nomor WhatsApp wajib diisi!' }]}
                >
                  <Input prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />} placeholder="08xxxxxxxxxx" size="large" />
                </Form.Item>
              </div>

              <Form.Item
                label={<b>Tanggal Pengajuan</b>}
                name="tglKasbon"
                rules={[{ required: true, message: 'Tanggal wajib diisi!' }]}
              >
                <Input prefix={<CalendarOutlined style={{ color: '#94a3b8' }} />} placeholder="DD/MM/YYYY" size="large" />
              </Form.Item>

              <Form.Item
                label={<b>Uraian Kebutuhan Dana</b>}
                name="uraian"
                rules={[{ required: true, message: 'Jelaskan tujuan atau peruntukan kasbon!' }]}
                extra="Sebutkan jenis barang/jasa atau operasional yang akan dibeli."
              >
                <TextArea
                  rows={3}
                  placeholder="Contoh: Pembelian sparepart pipa PVC dan fitting urgent di toko teknik"
                />
              </Form.Item>

              <Form.Item
                label={<b>Jumlah Dana Diminta (Rp)</b>}
                name="jumlah"
                rules={[{ required: true, message: 'Masukkan nominal kasbon!' }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  size="large"
                  min={1000}
                  step={10000}
                  formatter={(value) => `Rp ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                  parser={(value) => value.replace(/Rp\s?|(\.*)/g, '')}
                  placeholder="Contoh: Rp 500.000"
                />
              </Form.Item>

              <Form.Item label="Catatan Tambahan (Opsional)" name="catatanFinance">
                <Input placeholder="Catatan opsional untuk Finance" />
              </Form.Item>

              <Button
                type="primary"
                htmlType="submit"
                size="large"
                block
                loading={loading}
                style={{
                  backgroundColor: '#047857',
                  borderColor: '#047857',
                  borderRadius: 10,
                  height: 48,
                  fontSize: 16,
                  fontWeight: 600,
                  marginTop: 12,
                }}
              >
                Kirim Pengajuan Kasbon
              </Button>
            </Form>
          ) : (
            /* ========================================== */
            /* MODE LPJ & SUBMIT BUKTI NOTA              */
            /* ========================================== */
            <Form form={form} layout="vertical" onFinish={handleLpjSubmit}>
              <Form.Item
                label={<b>Nomor Tiket Budget / Kasbon</b>}
                name="noBudget"
                rules={[{ required: true, message: 'Masukkan Nomor Budget!' }]}
                extra="Contoh: BGT-2026-0001 (cek pesan WhatsApp dari bot saat pengajuan)"
              >
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    prefix={<FileTextOutlined style={{ color: '#94a3b8' }} />}
                    placeholder="BGT-2026-0001"
                    size="large"
                  />
                  <Button
                    type="primary"
                    size="large"
                    icon={<SearchOutlined />}
                    loading={checkingBudget}
                    onClick={() => handleCheckBudget()}
                    style={{ backgroundColor: '#0284c7', borderColor: '#0284c7' }}
                  >
                    Periksa
                  </Button>
                </Space.Compact>
              </Form.Item>

              {/* Detail Budget Ditemukan */}
              {targetBudget && (
                <div
                  style={{
                    backgroundColor: isDark ? '#0f172a' : '#f0f9ff',
                    border: '1px solid #bae6fd',
                    borderRadius: 10,
                    padding: '14px 16px',
                    marginBottom: 20,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text strong style={{ color: '#0369a1' }}>
                      {targetBudget.no_budget || targetBudget.noBudget} — {targetBudget.nama}
                    </Text>
                    <Tag color="cyan">{targetBudget.status}</Tag>
                  </div>
                  <div style={{ fontSize: 13, color: textColor, marginTop: 6 }}>
                    <div><b>Divisi:</b> {targetBudget.divisi} | <b>Tgl:</b> {targetBudget.tgl_kasbon || targetBudget.tglKasbon}</div>
                    <div><b>Uraian:</b> {targetBudget.uraian}</div>
                    <div style={{ marginTop: 4, fontWeight: 700, color: '#047857' }}>
                      Kasbon Diberikan: Rp {Number(targetBudget.jumlah || 0).toLocaleString('id-ID')}
                    </div>
                  </div>
                </div>
              )}

              <Form.Item
                label={<b>Total Realisasi Belanja (Rp)</b>}
                name="realisasiBelanja"
                rules={[{ required: true, message: 'Masukkan total uang yang dibelanjakan sesuai nota!' }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  size="large"
                  min={0}
                  step={1000}
                  onChange={handleRealChange}
                  formatter={(value) => `Rp ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                  parser={(value) => value.replace(/Rp\s?|(\.*)/g, '')}
                  placeholder="Total belanja sesuai nota"
                />
              </Form.Item>

              {/* Kalkulasi Sisa Uang */}
              {targetBudget && (
                <div
                  style={{
                    backgroundColor: isDark ? '#064e3b' : '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    borderRadius: 8,
                    padding: '10px 14px',
                    marginBottom: 18,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#047857', fontWeight: 600 }}>Sisa Uang Kembali ke Finance:</Text>
                  <Text style={{ color: '#047857', fontWeight: 700, fontSize: 16 }}>
                    Rp {calculatedSisa.toLocaleString('id-ID')}
                  </Text>
                </div>
              )}

              <Form.Item
                label={<b>Upload Foto Bukti Nota / Bon Belanja</b>}
                extra="Maksimal 5 file foto atau PDF nota belanja (Jelas & terbaca)"
              >
                <Upload
                  fileList={fileList}
                  beforeUpload={(file) => {
                    setFileList((prev) => [...prev, file]);
                    return false; // cegah auto-upload langsung sebelum submit
                  }}
                  onRemove={(file) => {
                    setFileList((prev) => prev.filter((item) => item.uid !== file.uid));
                  }}
                  multiple
                  listType="picture"
                  accept="image/*,application/pdf"
                >
                  <Button icon={<UploadOutlined />} size="large" block>
                    Pilih Foto Nota / Bon
                  </Button>
                </Upload>
              </Form.Item>

              <Form.Item label="Catatan LPJ (Opsional)" name="catatanPemohon">
                <TextArea rows={2} placeholder="Keterangan rincian belanja atau toko tempat pembelian" />
              </Form.Item>

              <Button
                type="primary"
                htmlType="submit"
                size="large"
                block
                disabled={!targetBudget}
                loading={loading}
                style={{
                  backgroundColor: '#0284c7',
                  borderColor: '#0284c7',
                  borderRadius: 10,
                  height: 48,
                  fontSize: 16,
                  fontWeight: 600,
                  marginTop: 12,
                }}
              >
                Kirim Laporan Pertanggungjawaban (LPJ)
              </Button>
            </Form>
          )}
        </Card>

        {/* Footer Info */}
        <div style={{ textAlign: 'center', marginTop: 18, color: subTextColor, fontSize: 12 }}>
          Sistem Terintegrasi Google Sheets & WhatsApp • PT Ebite Indonesia
        </div>
      </div>
    </div>
  );
}
