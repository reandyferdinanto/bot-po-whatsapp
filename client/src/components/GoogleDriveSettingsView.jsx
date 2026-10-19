import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Switch,
  Alert,
  Space,
  Typography,
  Tag,
  Divider,
  message,
  Spin,
  Row,
  Col,
  Radio,
  Collapse,
  Tooltip,
} from 'antd';
import {
  AiOutlineGoogle,
  AiOutlineFolder,
  AiOutlineCheckCircle,
  AiOutlineWarning,
  AiOutlineLink,
  AiOutlineSave,
  AiOutlineCloudServer,
  AiOutlineFilePdf,
  AiOutlineFileImage,
  AiOutlineInfoCircle,
  AiOutlineSync,
} from 'react-icons/ai';
import {
  getDriveSettings,
  saveDriveSettings,
  testDriveAccess,
  getGoogleAuthUrl,
  exchangeGoogleCode,
} from '../services/api';

const { Title, Text, Paragraph } = Typography;

export default function GoogleDriveSettingsView({ isDark }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState(null);
  const [testResult, setTestResult] = useState(null);

  // State untuk re-auth Google
  const [authUrl, setAuthUrl] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [isExchangingCode, setIsExchangingCode] = useState(false);
  const [isFetchingAuthUrl, setIsFetchingAuthUrl] = useState(false);

  const [form] = Form.useForm();

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await getDriveSettings();
      if (res.success && res.config) {
        setConfig(res.config);
        form.setFieldsValue({
          folderUrlOrId: res.config.folderUrl || res.config.folderId || '',
          autoSubfolders: res.config.autoSubfolders !== false,
        });
      }
    } catch (err) {
      message.error(`Gagal memuat pengaturan Google Drive: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const [selectedRedirectUri, setSelectedRedirectUri] = useState('http://localhost:3000/oauth2callback');

  const handleOpenAuthUrl = async () => {
    setIsFetchingAuthUrl(true);
    try {
      const res = await getGoogleAuthUrl(selectedRedirectUri);
      if (res.success && res.authUrl) {
        setAuthUrl(res.authUrl);
        window.open(res.authUrl, '_blank', 'noopener,noreferrer');
        message.info('Halaman otorisasi Google dibuka di tab baru.');
      }
    } catch (err) {
      message.error(`Gagal membuat URL otorisasi: ${err.message}`);
    } finally {
      setIsFetchingAuthUrl(false);
    }
  };

  const handleExchangeCode = async () => {
    if (!authCode || !authCode.trim()) {
      message.warning('Masukkan kode otorisasi terlebih dahulu.');
      return;
    }

    let cleanCode = authCode.trim();
    // Jika user mem-paste full redirect URL: extract param code
    if (cleanCode.includes('code=')) {
      try {
        const urlObj = new URL(cleanCode.startsWith('http') ? cleanCode : `http://dummy.com/${cleanCode}`);
        cleanCode = urlObj.searchParams.get('code') || cleanCode;
      } catch (e) {
        const match = cleanCode.match(/code=([^&]+)/);
        if (match && match[1]) cleanCode = decodeURIComponent(match[1]);
      }
    }

    setIsExchangingCode(true);
    try {
      const res = await exchangeGoogleCode(cleanCode, selectedRedirectUri);
      if (res.success) {
        message.success(res.message || 'Token Google berhasil diperbarui!');
        setAuthCode('');
        fetchSettings();
      } else {
        message.error(res.error || 'Gagal verifikasi kode.');
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message;
      message.error(`Gagal: ${errMsg}`);
    } finally {
      setIsExchangingCode(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (values) => {
    setSaving(true);
    try {
      const res = await saveDriveSettings({
        folderUrlOrId: values.folderUrlOrId,
        autoSubfolders: values.autoSubfolders,
      });
      if (res.success) {
        message.success(res.message || 'Pengaturan Google Drive berhasil disimpan!');
        fetchSettings();
        // Otomatis tes akses
        handleTest(values.folderUrlOrId);
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message;
      message.error(`Gagal menyimpan: ${errMsg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (customUrlOrId = null) => {
    const target = customUrlOrId || form.getFieldValue('folderUrlOrId');
    if (!target) {
      message.warning('Masukkan URL atau ID Folder terlebih dahulu sebelum tes.');
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const res = await testDriveAccess(target);
      setTestResult(res);
      if (res.success) {
        message.success('Tes koneksi folder Google Drive berhasil!');
      } else {
        message.warning('Tes folder selesai dengan catatan.');
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message;
      setTestResult({
        success: false,
        error: errMsg,
      });
      message.error(`Gagal menguji akses: ${errMsg}`);
    } finally {
      setTesting(false);
    }
  };

  const tokenInfo = config?.tokenInfo || {};
  const hasToken = tokenInfo.hasToken;
  const hasDriveWrite = tokenInfo.hasDriveWrite;

  const cardBg = isDark ? '#141414' : '#ffffff';
  const borderCol = isDark ? '#303030' : '#e8e8e8';

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 40 }}>
      {/* HEADER SECTION */}
      <div style={{ marginBottom: 24 }}>
        <Space orientation="vertical" orientationMargin={0} style={{ width: '100%' }}>
          <Space align="center" size={12}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: isDark ? 'rgba(66, 133, 244, 0.15)' : '#e8f0fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#4285F4',
                fontSize: 24,
              }}
            >
              <AiOutlineGoogle />
            </div>
            <div>
              <Title level={4} style={{ margin: 0 }}>
                Pengaturan Penyimpanan Google Drive
              </Title>
              <Text type="secondary">
                Konfigurasi folder Google Drive untuk pengarsipan otomatis berkas OCR (PO, Surat Jalan, & Bukti Bayar)
              </Text>
            </div>
          </Space>
        </Space>
      </div>

      {loading ? (
        <Card style={{ textAlign: 'center', padding: 60, background: cardBg, borderColor: borderCol }}>
          <Spin size="large" tip="Memuat konfigurasi Google Drive..." />
        </Card>
      ) : (
        <Space orientation="vertical" size={20} style={{ width: '100%' }}>
          {/* CARD 1: STATUS AKUN GOOGLE OAUTH */}
          <Card
            title={
              <Space>
                <AiOutlineCloudServer style={{ color: '#1890ff', fontSize: 18 }} />
                <span>Status Akun Google & API</span>
              </Space>
            }
            bordered
            style={{ background: cardBg, borderColor: borderCol }}
          >
            <Row gutter={[24, 16]} align="middle">
              <Col xs={24} md={12}>
                <Space direction="vertical" size={4}>
                  <Text strong>Status Token OAuth Google:</Text>
                  <div>
                    {hasToken ? (
                      <Tag color="success" icon={<AiOutlineCheckCircle />}>
                        TOKEN AKTIF
                      </Tag>
                    ) : (
                      <Tag color="error" icon={<AiOutlineWarning />}>
                        BELUM TEROTORISASI
                      </Tag>
                    )}
                  </div>
                </Space>
              </Col>
              <Col xs={24} md={12}>
                <Space direction="vertical" size={4}>
                  <Text strong>Izin Penulisan File Google Drive (Scope):</Text>
                  <div>
                    {hasDriveWrite ? (
                      <Tag color="blue" icon={<AiOutlineCheckCircle />}>
                        Lengkap (Drive Write & Read)
                      </Tag>
                    ) : (
                      <Tag color="warning" icon={<AiOutlineWarning />}>
                        Terbatas (Perlu Scope drive.file)
                      </Tag>
                    )}
                  </div>
                </Space>
              </Col>
            </Row>

            {!hasDriveWrite && (
              <Alert
                style={{ marginTop: 16 }}
                type="warning"
                showIcon
                message={<Text strong>Pembaruan Izin Google Drive Diperlukan</Text>}
                description={
                  <div style={{ marginTop: 8 }}>
                    <Paragraph style={{ margin: 0, fontSize: 13 }}>
                      Bot saat ini hanya memiliki izin membaca (read-only). Untuk mengunggah berkas scan PO, Surat Jalan, dan Bukti Bayar ke Google Drive, diperlukan otorisasi satu kali untuk izin <code>drive.file</code>.
                    </Paragraph>

                    <div
                      style={{
                        marginTop: 12,
                        padding: 14,
                        borderRadius: 8,
                        background: isDark ? '#1f1f1f' : '#f9fafb',
                        border: `1px solid ${borderCol}`,
                      }}
                    >
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <div>
                          <Text strong>Pilihan Redirect URI (URI Pengalihan):</Text>
                          <div style={{ marginTop: 6 }}>
                            <Radio.Group
                              value={selectedRedirectUri}
                              onChange={(e) => setSelectedRedirectUri(e.target.value)}
                              size="small"
                            >
                              <Radio.Button value="http://localhost:3000/oauth2callback">
                                localhost:3000 (Default)
                              </Radio.Button>
                              <Radio.Button value="https://bot-whatsapp.ebite.biz.id/oauth2callback">
                                Domain Web (Otomatis & Tanpa Salin Kode)
                              </Radio.Button>
                              <Radio.Button value="http://localhost:3001/oauth2callback">
                                localhost:3001
                              </Radio.Button>
                            </Radio.Group>
                          </div>
                          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                            Target URI yang diminta: <code>{selectedRedirectUri}</code>
                          </Text>
                        </div>

                        <Divider style={{ margin: '4px 0' }} />

                        <div>
                          <Text strong>Langkah 1:</Text> Buka halaman otorisasi Google dan berikan izin akses:
                          <div style={{ marginTop: 6, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <Button
                              type="primary"
                              icon={<AiOutlineGoogle />}
                              onClick={handleOpenAuthUrl}
                              loading={isFetchingAuthUrl}
                            >
                              Buka Halaman Otorisasi Google ↗
                            </Button>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              (Login dengan akun Google yang memiliki akses Google Sheets & Drive)
                            </Text>
                          </div>
                        </div>

                        <Divider style={{ margin: '4px 0' }} />

                        <div>
                          <Text strong>Langkah 2:</Text> Masukkan Authorization Code atau URL hasil redirect:
                          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                            <Input
                              placeholder="Paste authorization code (4/0A...) atau URL callback dari browser di sini..."
                              value={authCode}
                              onChange={(e) => setAuthCode(e.target.value)}
                              style={{ flex: 1 }}
                              allowClear
                            />
                            <Button
                              type="primary"
                              onClick={handleExchangeCode}
                              loading={isExchangingCode}
                              style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                            >
                              Aktifkan Izin
                            </Button>
                          </div>
                          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                            💡 <i>Catatan:</i> Jika memilih opsi <b>Domain Web</b>, browser akan langsung otomatis mengaktifkan token setelah klik "Izinkan" tanpa perlu salin kode manual.
                          </Text>
                        </div>

                        {/* PANDUAN ERROR REDIRECT_URI_MISMATCH */}
                        <Collapse
                          ghost
                          size="small"
                          items={[
                            {
                              key: '1',
                              label: (
                                <Text type="danger" style={{ fontSize: 12 }}>
                                  ⚠️ Muncul "Error 400: redirect_uri_mismatch"? Klik di sini untuk panduan perbaikan Google Cloud Console
                                </Text>
                              ),
                              children: (
                                <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                                  <p style={{ margin: '0 0 6px 0' }}>
                                    Google menolak permintaan jika URL pengalihan (redirect URI) belum terdaftar di daftar putih Google Cloud Console.
                                  </p>
                                  <ol style={{ paddingLeft: 18, margin: '0 0 8px 0' }}>
                                    <li>
                                      Buka Google Cloud Console:{' '}
                                      <a
                                        href="https://console.cloud.google.com/apis/credentials?project=peak-text-511605-j1"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ fontWeight: 'bold', color: '#1890ff' }}
                                      >
                                        Credentials (peak-text-511605-j1) ↗
                                      </a>
                                    </li>
                                    <li>Klik nama <b>OAuth 2.0 Client ID</b> Anda (tipe Web client).</li>
                                    <li>
                                      Pada bagian <b>Authorized redirect URIs (URI pengalihan yang diizinkan)</b>, klik <b>ADD URI</b> lalu tambahkan URI berikut:
                                      <div style={{ marginTop: 4, padding: '4px 8px', background: isDark ? '#141414' : '#fff', border: `1px solid ${borderCol}`, borderRadius: 4 }}>
                                        <div>• <code>http://localhost:3000/oauth2callback</code></div>
                                        <div>• <code>https://bot-whatsapp.ebite.biz.id/oauth2callback</code></div>
                                      </div>
                                    </li>
                                    <li>Klik <b>Save (Simpan)</b> di bagian paling bawah.</li>
                                    <li>Tunggu 1-2 menit hingga Google menyinkronkan data, lalu coba klik lagi <b>"Buka Halaman Otorisasi Google ↗"</b> di atas.</li>
                                  </ol>
                                </div>
                              ),
                            },
                          ]}
                        />
                      </Space>
                    </div>
                  </div>
                }
              />
            )}
          </Card>

          {/* CARD 2: PENGATURAN FOLDER TARGET */}
          <Card
            title={
              <Space>
                <AiOutlineFolder style={{ color: '#52c41a', fontSize: 18 }} />
                <span>Folder Target Penyimpanan</span>
              </Space>
            }
            bordered
            style={{ background: cardBg, borderColor: borderCol }}
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSave}
              initialValues={{
                folderUrlOrId: config?.folderUrl || config?.folderId || '',
                autoSubfolders: config?.autoSubfolders !== false,
              }}
            >
              <Form.Item
                label={<Text strong>URL atau ID Folder Google Drive Target</Text>}
                name="folderUrlOrId"
                rules={[{ required: true, message: 'URL atau ID Folder Google Drive wajib diisi.' }]}
                extra={
                  <Space direction="vertical" size={2} style={{ marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Contoh: <code>https://drive.google.com/drive/folders/1ABCxyz-1234567890</code> atau cukup ID-nya saja.
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      💡 Pastikan folder tersebut telah dibagikan (Shared) dengan akun Google bot dengan hak akses <b>Editor</b>.
                    </Text>
                  </Space>
                }
              >
                <Input
                  prefix={<AiOutlineFolder style={{ color: '#8c8c8c' }} />}
                  placeholder="Paste URL folder Google Drive di sini..."
                  size="large"
                  allowClear
                />
              </Form.Item>

              <Form.Item
                label={<Text strong>Otomatis Buat Subfolder per Kategori</Text>}
                name="autoSubfolders"
                valuePropName="checked"
                extra="Jika aktif, file akan otomatis dikelompokkan ke subfolder: PO/, GRPO_Surat_Jalan/, dan Bukti_Bayar/."
              >
                <Switch checkedChildren="Aktif" unCheckedChildren="Nonaktif" />
              </Form.Item>

              <Divider style={{ margin: '16px 0' }} />

              <Space wrap size={12}>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<AiOutlineSave />}
                  loading={saving}
                  size="large"
                >
                  Simpan Pengaturan
                </Button>

                <Button
                  icon={<AiOutlineSync />}
                  onClick={() => handleTest()}
                  loading={testing}
                  size="large"
                >
                  Uji Akses Folder
                </Button>

                {config?.folderUrl && (
                  <Button
                    icon={<AiOutlineLink />}
                    href={config.folderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    size="large"
                  >
                    Buka Folder di Google Drive
                  </Button>
                )}
              </Space>
            </Form>

            {/* HASIL TEST KONEKSI */}
            {testResult && (
              <div style={{ marginTop: 24 }}>
                {testResult.success ? (
                  <Alert
                    type="success"
                    showIcon
                    message="Koneksi Folder Berhasil & Siap Digunakan!"
                    description={
                      <div>
                        <Paragraph style={{ margin: '6px 0' }}>
                          <b>Nama Folder:</b> {testResult.folder?.name}
                          <br />
                          <b>Pemilik:</b> {testResult.folder?.owners || '-'}
                          <br />
                          <b>Izin Tambah File:</b> {testResult.folder?.canAddChildren ? ' Ya (Editor)' : '⚠️ Hanya Baca (Viewer)'}
                        </Paragraph>
                        {testResult.folder?.webViewLink && (
                          <a href={testResult.folder.webViewLink} target="_blank" rel="noreferrer">
                            Buka Folder Target ↗
                          </a>
                        )}
                      </div>
                    }
                  />
                ) : (
                  <Alert
                    type="error"
                    showIcon
                    message="Gagal Mengakses Folder Google Drive"
                    description={
                      <div>
                        <Paragraph style={{ margin: '6px 0' }}>{testResult.error}</Paragraph>
                        {testResult.apiDisabled && (
                          <div style={{ marginTop: 8 }}>
                            <Button
                              type="primary"
                              danger
                              href="https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=1074882063533"
                              target="_blank"
                            >
                              Klik Di Sini untuk Aktifkan Google Drive API di Google Cloud Console
                            </Button>
                          </div>
                        )}
                      </div>
                    }
                  />
                )}
              </div>
            )}
          </Card>

          {/* CARD 3: PETUNJUK AKSES & PANGGILAN WHATSAPP */}
          <Card
            title={
              <Space>
                <AiOutlineInfoCircle style={{ color: '#722ed1', fontSize: 18 }} />
                <span>Panduan Interaksi via WhatsApp</span>
              </Space>
            }
            bordered
            style={{ background: cardBg, borderColor: borderCol }}
          >
            <Paragraph>
              Setelah folder Google Drive terhubung, sistem akan bekerja secara otomatis:
            </Paragraph>

            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <Card
                  size="small"
                  title={
                    <Space>
                      <AiOutlineFileImage style={{ color: '#1890ff' }} />
                      <span>1. Simpan Otomatis dari OCR</span>
                    </Space>
                  }
                  style={{ background: isDark ? '#1f1f1f' : '#fafafa' }}
                >
                  <Text type="secondary">
                    Saat pengguna mengirim foto/PDF via WhatsApp atau mengunggah batch dokumen di menu Multi-OCR Dashboard, berkas asli akan otomatis diunggah ke Google Drive dan link-nya dicatat ke database saat konfirmasi penyimpanan.
                  </Text>
                </Card>
              </Col>

              <Col xs={24} md={12}>
                <Card
                  size="small"
                  title={
                    <Space>
                      <AiOutlineFilePdf style={{ color: '#52c41a' }} />
                      <span>2. Panggil Dokumen di WhatsApp</span>
                    </Space>
                  }
                  style={{ background: isDark ? '#1f1f1f' : '#fafafa' }}
                >
                  <Text type="secondary">
                    Ketik perintah berikut di WhatsApp:
                    <br />
                    <code>/lihatpo PO-2026-001</code>
                    <br />
                    Bot akan langsung mengunduh berkas dari Google Drive dan <b>mengirimkannya langsung sebagai Foto Gambar atau File PDF asli</b> di ruang chat WhatsApp.
                  </Text>
                </Card>
              </Col>
            </Row>
          </Card>
        </Space>
      )}
    </div>
  );
}
