import React, { useState } from 'react';
import {
  Upload,
  Button,
  Card,
  Tag,
  Input,
  InputNumber,
  Space,
  message,
  Checkbox,
  Alert,
} from 'antd';
import { Formik, FieldArray } from 'formik';
import * as Yup from 'yup';
import {
  AiOutlineInbox,
  AiOutlineScan,
  AiOutlineCheckCircle,
  AiOutlineCloudUpload,
  AiOutlineFilePdf,
  AiOutlineFileImage,
  AiOutlineDelete,
  AiOutlineEdit,
  AiOutlineSave,
  AiOutlineExclamationCircle,
  AiOutlinePlus,
  AiOutlineSearch,
  AiOutlineSync,
} from 'react-icons/ai';
import { parseOcrFiles, commitBatchOCR, getPODetail } from '../services/api';

const { Dragger } = Upload;

const SinglePoSchema = Yup.object().shape({
  noPo: Yup.string().trim().required('No PO wajib'),
  supplier: Yup.string().trim().required('Supplier wajib'),
  date: Yup.string().trim().required('Tanggal wajib'),
  items: Yup.array()
    .of(
      Yup.object().shape({
        nama: Yup.string().trim().required('Nama item wajib'),
        qty: Yup.number().positive('Qty > 0').required('Qty wajib'),
        harga: Yup.number().min(0).required('Harga wajib'),
      })
    )
    .min(1, 'Minimal 1 item'),
});

const DeliveryNoteSchema = Yup.object().shape({
  noPo: Yup.string().trim().required('Nomor PO referensi wajib diisi'),
  noGrpo: Yup.string().trim().required('Nomor GRPO wajib diisi'),
});

export default function MultiOcrPanel({ onPoCommitted, isDark }) {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedDocuments, setParsedDocuments] = useState([]);
  const [isCommitting, setIsCommitting] = useState(false);

  const formatRupiah = (val) => 'Rp ' + Number(val || 0).toLocaleString('id-ID');

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Langsung jalankan scan OCR saat dokumen berhasil dipilih/diunggah
  const handleProcessUploadedFiles = async (files) => {
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    message.loading({ content: `Memproses OCR ${files.length} dokumen secara otomatis...`, key: 'ocr-proc' });

    const newUploadSummary = Array.from(files).map((f) => {
      const isPdf = (f.type && f.type.includes('pdf')) || (f.name && f.name.toLowerCase().endsWith('.pdf'));
      return {
        name: f.name,
        size: f.size,
        isPdf,
        type: isPdf ? 'pdf' : 'image',
      };
    });
    setUploadedFiles((prev) => [...prev, ...newUploadSummary]);

    try {
      const rawFiles = Array.from(files).map((f) => f.originFileObj || f);
      const res = await parseOcrFiles(rawFiles);

      if (res.success && res.documents) {
        setParsedDocuments((prev) => [...prev, ...res.documents]);
        message.success({
          content: `Ekstraksi Sukses! Ditemukan ${res.totalPOsParsed} dokumen dari ${res.totalFiles} file.`,
          key: 'ocr-proc',
        });
      } else {
        message.error({ content: res.error || 'Gagal ekstraksi OCR.', key: 'ocr-proc' });
      }
    } catch (err) {
      message.error({ content: `Error OCR: ${err.message}`, key: 'ocr-proc' });
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleSelectDoc = (id) => {
    setParsedDocuments((prev) =>
      prev.map((doc) => (doc.id === id ? { ...doc, selected: !doc.selected } : doc))
    );
  };

  const toggleSelectAll = (checked) => {
    setParsedDocuments((prev) => prev.map((doc) => ({ ...doc, selected: checked })));
  };

  const handleRemoveDoc = (id) => {
    setParsedDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  // Re-check PO reference manually from UI
  const handleCheckPoReference = async (docId, noPo) => {
    if (!noPo || !noPo.trim()) {
      message.warning('Masukkan nomor PO yang ingin diperiksa.');
      return;
    }
    const cleanNo = noPo.trim();
    try {
      const res = await getPODetail(cleanNo);
      if (res.success && res.po) {
        message.success(`PO ${cleanNo} ditemukan di sheet 'PO 2026' (Status: ${res.po.status})!`);
        setParsedDocuments((prev) =>
          prev.map((d) =>
            d.id === docId
              ? {
                  ...d,
                  noPo: cleanNo,
                  poFound: true,
                  existingPo: {
                    noPo: res.po.noPo,
                    supplier: res.po.supplier,
                    date: res.po.date,
                    status: res.po.status,
                    grandTotal: res.po.grandTotal,
                  },
                }
              : d
          )
        );
      } else {
        message.warning(`PO ${cleanNo} tidak ditemukan. Scan atau input terlebih dahulu PO nya.`);
        setParsedDocuments((prev) =>
          prev.map((d) =>
            d.id === docId
              ? {
                  ...d,
                  noPo: cleanNo,
                  poFound: false,
                  poNotFoundMessage: `PO ${cleanNo} tidak ditemukan di sheet 'PO 2026'. Scan atau input terlebih dahulu PO nya.`,
                }
              : d
          )
        );
      }
    } catch (err) {
      message.warning(`PO ${cleanNo} tidak ditemukan. Scan atau input terlebih dahulu PO nya.`);
      setParsedDocuments((prev) =>
        prev.map((d) =>
          d.id === docId
            ? {
                ...d,
                noPo: cleanNo,
                poFound: false,
                poNotFoundMessage: `PO ${cleanNo} tidak ditemukan di sheet 'PO 2026'. Scan atau input terlebih dahulu PO nya.`,
              }
            : d
        )
      );
    }
  };

  const handleCommitSingle = async (docData) => {
    setIsCommitting(true);
    try {
      const res = await commitBatchOCR([docData]);
      if (res.success && res.successCount > 0) {
        const isGrpo = docData.tipeDokumen === 'PURCHASE_DELIVERY_NOTE_GRPO';
        const actionMsg = isGrpo
          ? `Baris PO ${docData.noPo} berhasil di-update dengan GRPO ${docData.noGrpo}!`
          : `PO ${docData.noPo} berhasil disimpan ke Google Sheets 'PO 2026'!`;

        message.success(actionMsg);
        setParsedDocuments((prev) => prev.filter((d) => d.id !== docData.id));
        if (onPoCommitted) onPoCommitted();
      } else {
        const errorMsg = res.results?.[0]?.error || 'Gagal menyimpan dokumen.';
        message.error(errorMsg);
      }
    } catch (err) {
      message.error(`Error: ${err.message}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleCommitSelected = async () => {
    const selected = parsedDocuments.filter((d) => d.selected && d.status !== 'error');
    if (selected.length === 0) {
      message.warning('Pilih minimal 1 dokumen yang valid untuk disimpan.');
      return;
    }

    // Check if there is any Delivery Note whose PO is not found
    const invalidGrpo = selected.find(
      (d) => d.tipeDokumen === 'PURCHASE_DELIVERY_NOTE_GRPO' && d.poFound === false
    );
    if (invalidGrpo) {
      message.warning(
        `PO ${invalidGrpo.noPo || ''} tidak ditemukan di sheet 'PO 2026'. Hapus centang pada dokumen tersebut atau scan/input terlebih dahulu PO nya.`
      );
      return;
    }

    setIsCommitting(true);
    message.loading({ content: `Memproses ${selected.length} dokumen ke Google Sheets...`, key: 'commit-proc' });

    try {
      const res = await commitBatchOCR(selected);
      if (res.success) {
        message.success({
          content: `✅ Sukses memproses ${res.successCount} dari ${selected.length} dokumen di Google Sheets!`,
          key: 'commit-proc',
        });
        const successfulNoPos = new Set(res.results.filter((r) => r.success).map((r) => r.noPo));
        setParsedDocuments((prev) => prev.filter((d) => !successfulNoPos.has(d.noPo)));
        if (onPoCommitted) onPoCommitted();
      }
    } catch (err) {
      message.error({ content: `Gagal proses batch: ${err.message}`, key: 'commit-proc' });
    } finally {
      setIsCommitting(false);
    }
  };

  const selectedCount = parsedDocuments.filter((d) => d.selected).length;

  const cardBg = isDark ? '#0f172a' : '#ffffff';
  const borderColor = isDark ? '#1e293b' : '#e2e8f0';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
      {/* Fitur Unggulan Hero Banner */}
      <div
        style={{
          background: isDark
            ? 'linear-gradient(135deg, #0c4a6e 0%, #065f46 100%)'
            : 'linear-gradient(135deg, #e0f2fe 0%, #ecfdf5 100%)',
          borderRadius: 14,
          padding: '20px 24px',
          border: `1px solid ${isDark ? '#0284c7' : '#7dd3fc'}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          boxShadow: '0 2px 8px rgba(14, 165, 233, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: '#0284c7',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
              }}
            >
              <AiOutlineScan />
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: textColor, letterSpacing: '-0.3px' }}>
                Smart Multi-OCR &amp; Multi-Page Document Engine (PO &amp; Delivery Note)
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: 12, color: mutedColor }}>
                Mendukung <strong>Purchase Order (Input Baris Baru)</strong> dan <strong>Purchase Delivery Note / GRPO (Update Baris PO Lama)</strong> secara otomatis.
              </p>
            </div>
          </div>
          <Tag color="geekblue" style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, fontWeight: 700 }}>
            Batch Input Ready
          </Tag>
        </div>

        {/* Feature Highlights Pills */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          <span
            style={{
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 6,
              backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.8)',
              color: textColor,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontWeight: 600,
            }}
          >
            <AiOutlineCheckCircle style={{ color: '#059669' }} /> Jika PO: Disimpan sebagai baris transaksi baru di sheet 'PO 2026'
          </span>
          <span
            style={{
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 6,
              backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.8)',
              color: textColor,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontWeight: 600,
            }}
          >
            <AiOutlineCheckCircle style={{ color: '#0284c7' }} /> Jika Purchase Delivery Note: Cari nomor PO dan update No. GRPO &amp; tanggal selesai
          </span>
          <span
            style={{
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 6,
              backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.8)',
              color: textColor,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontWeight: 600,
            }}
          >
            <AiOutlineExclamationCircle style={{ color: '#ea580c' }} /> Validasi PO Wajib: Jika PO belum ada, muncul notifikasi untuk input PO terlebih dahulu
          </span>
        </div>
      </div>

      {/* Drag & Drop Upload Zone */}
      <div
        style={{
          backgroundColor: cardBg,
          borderRadius: 12,
          border: `1px solid ${borderColor}`,
          padding: 20,
        }}
      >
        <Dragger
          multiple={true}
          showUploadList={false}
          disabled={isProcessing}
          beforeUpload={(file, fileListArg) => {
            if (file === fileListArg[fileListArg.length - 1]) {
              handleProcessUploadedFiles(fileListArg);
            }
            return false;
          }}
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          style={{
            padding: '20px 10px',
            backgroundColor: isDark ? '#1e293b' : '#fafafa',
            borderColor: isProcessing ? '#059669' : '#0284c7',
            borderRadius: 10,
            cursor: isProcessing ? 'wait' : 'pointer',
          }}
        >
          {uploadedFiles.length === 0 && !isProcessing ? (
            <div style={{ padding: '16px 10px' }}>
              <p className="ant-upload-drag-icon" style={{ margin: '0 0 12px 0' }}>
                <AiOutlineCloudUpload style={{ fontSize: 48, color: '#0284c7' }} />
              </p>

              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2', border: '1px solid #fca5a5' }}>
                  <AiOutlineFilePdf style={{ fontSize: 22, color: '#dc2626' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c' }}>Dokumen PDF (Multi-Halaman)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, backgroundColor: isDark ? 'rgba(139, 92, 246, 0.15)' : '#ede9fe', border: '1px solid #c4b5fd' }}>
                  <AiOutlineFileImage style={{ fontSize: 22, color: '#7c3aed' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9' }}>Foto / Scan (JPG, PNG, WEBP)</span>
                </div>
              </div>

              <p style={{ fontSize: 15, fontWeight: 700, color: textColor, margin: '8px 0 4px 0' }}>
                Klik atau Tarik Dokumen PO / Surat Jalan (GRPO) ke Area Ini
              </p>
              <p style={{ fontSize: 12, color: mutedColor, maxWidth: 640, margin: '0 auto' }}>
                <strong>Otomatis langsung di-scan saat diunggah!</strong> Sistem otomatis membedakan apakah dokumen adalah <strong>Purchase Order (Input Baru)</strong> atau <strong>Purchase Delivery Note (Update GRPO)</strong>.
              </p>
            </div>
          ) : (
            <div style={{ padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 14 }}>
                {isProcessing ? (
                  <>
                    <AiOutlineSync style={{ fontSize: 30, color: '#0284c7', animation: 'antRotate 1s infinite linear' }} />
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#0284c7' }}>
                        Sedang Mengekstrak Teks Dokumen via OCR Otomatis...
                      </div>
                      <div style={{ fontSize: 11, color: mutedColor }}>
                        Memindai teks digital, tabel item, dan nomor PO.
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <AiOutlineCheckCircle style={{ fontSize: 30, color: '#059669' }} />
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#059669' }}>
                        ✓ {uploadedFiles.length} Dokumen Berhasil Diunggah &amp; Diekstrak
                      </div>
                      <div style={{ fontSize: 11, color: mutedColor }}>
                        Klik atau tarik file tambahan ke sini untuk menambah antrian scan OCR.
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Badges Dokumen yang Terupload dengan Pembeda Ikon Jelas */}
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, maxWidth: 840, margin: '0 auto' }}>
                {uploadedFiles.map((f, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 12px',
                      borderRadius: 8,
                      backgroundColor: f.isPdf
                        ? (isDark ? 'rgba(239, 68, 68, 0.2)' : '#fef2f2')
                        : (isDark ? 'rgba(139, 92, 246, 0.2)' : '#f5f3ff'),
                      border: `1px solid ${f.isPdf ? '#f87171' : '#c084fc'}`,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    }}
                  >
                    {f.isPdf ? (
                      <AiOutlineFilePdf style={{ fontSize: 22, color: '#dc2626', flexShrink: 0 }} />
                    ) : (
                      <AiOutlineFileImage style={{ fontSize: 22, color: '#7c3aed', flexShrink: 0 }} />
                    )}
                    <div style={{ textAlign: 'left' }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: textColor,
                          maxWidth: 200,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={f.name}
                      >
                        {f.name}
                      </div>
                      <div style={{ fontSize: 10, color: mutedColor }}>
                        {f.isPdf ? 'Dokumen PDF' : 'Foto Dokumen'} • {formatFileSize(f.size)}
                      </div>
                    </div>
                    <Tag
                      color={f.isPdf ? 'red' : 'purple'}
                      style={{ fontSize: 10, margin: 0, fontWeight: 700, borderRadius: 4 }}
                    >
                      {f.isPdf ? 'PDF' : 'GAMBAR'}
                    </Tag>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Dragger>
      </div>

      {/* OCR Queue & Verification Section */}
      {parsedDocuments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Batch Action Toolbar */}
          <div
            style={{
              backgroundColor: cardBg,
              borderRadius: 12,
              border: `1px solid ${borderColor}`,
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Checkbox
                checked={selectedCount === parsedDocuments.length && parsedDocuments.length > 0}
                indeterminate={selectedCount > 0 && selectedCount < parsedDocuments.length}
                onChange={(e) => toggleSelectAll(e.target.checked)}
              >
                <span style={{ fontWeight: 600, color: textColor }}>
                  Pilih Semua ({selectedCount}/{parsedDocuments.length} Dokumen)
                </span>
              </Checkbox>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                onClick={() => {
                  setParsedDocuments([]);
                  setUploadedFiles([]);
                }}
                size="middle"
              >
                Bersihkan Antrian
              </Button>
              <Button
                type="primary"
                icon={<AiOutlineSave />}
                loading={isCommitting}
                onClick={handleCommitSelected}
                style={{
                  backgroundColor: '#047857',
                  borderColor: '#047857',
                  fontWeight: 700,
                  borderRadius: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                ✓ Proses {selectedCount} Dokumen Terpilih ke Google Sheets 'PO 2026'
              </Button>
            </div>
          </div>

          {/* List of Parsed Document Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {parsedDocuments.map((doc, docIdx) => {
              const isDeliveryNote = doc.tipeDokumen === 'PURCHASE_DELIVERY_NOTE_GRPO';

              // =======================================================================
              // TAMPILAN KHUSUS KASUS 1: PURCHASE DELIVERY NOTE (GRPO)
              // =======================================================================
              if (isDeliveryNote) {
                return (
                  <Card
                    key={doc.id || docIdx}
                    style={{
                      backgroundColor: cardBg,
                      borderRadius: 12,
                      border: doc.poFound === false
                        ? '2px solid #f59e0b'
                        : doc.selected
                        ? '2px solid #0284c7'
                        : `1px solid ${borderColor}`,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                    }}
                    bodyStyle={{ padding: 18 }}
                  >
                    <Formik
                      initialValues={{
                        id: doc.id,
                        tipeDokumen: 'PURCHASE_DELIVERY_NOTE_GRPO',
                        noPo: doc.noPo || '',
                        noGrpo: doc.noGrpo || '',
                        lastGrpoDate: doc.lastGrpoDate || '',
                        supplier: doc.supplier || '',
                        receivedBy: doc.receivedBy || '',
                        remarks: doc.remarks || '',
                        items: doc.items || [],
                        updateFields: doc.updateFields || {},
                      }}
                      validationSchema={DeliveryNoteSchema}
                      onSubmit={(values) => {
                        handleCommitSingle(values);
                      }}
                    >
                      {({ values, handleChange, handleBlur, handleSubmit, setFieldValue, isSubmitting }) => (
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                          {/* Top Card Row */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              borderBottom: `1px solid ${borderColor}`,
                              paddingBottom: 10,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <Checkbox
                                checked={doc.selected && doc.poFound !== false}
                                disabled={doc.poFound === false}
                                onChange={() => toggleSelectDoc(doc.id)}
                              />
                              {doc.fileType === 'pdf' ? (
                                <Tag color="red" icon={<AiOutlineFilePdf />} style={{ fontWeight: 600 }}>
                                  {doc.filename} {doc.pageRange ? `(${doc.pageRange})` : ''}
                                </Tag>
                              ) : (
                                <Tag color="purple" icon={<AiOutlineFileImage />} style={{ fontWeight: 600 }}>
                                  {doc.filename}
                                </Tag>
                              )}
                              <Tag color="orange" style={{ fontWeight: 700 }}>
                                📦 PURCHASE DELIVERY NOTE (GRPO)
                              </Tag>
                              <Tag color="blue" style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                                No. GRPO: {values.noGrpo || '-'}
                              </Tag>
                            </div>

                            <Button
                              type="text"
                              danger
                              icon={<AiOutlineDelete />}
                              onClick={() => handleRemoveDoc(doc.id)}
                              title="Hapus dari antrian"
                            />
                          </div>

                          {/* Status Verifikasi Referensi PO */}
                          {doc.poFound === true ? (
                            <Alert
                              type="success"
                              showIcon
                              message={
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                                  <span>
                                    ✓ Referensi PO Ditemukan di sheet 'PO 2026': <strong>{doc.noPo}</strong> ({doc.existingPo?.supplier || doc.supplier}) • Status: <strong>{doc.existingPo?.status}</strong>
                                  </span>
                                </div>
                              }
                              description="Dokumen ini akan mengupdate baris PO terkait pada sheet 'PO 2026' (Kolom R: No. GRPO & Kolom S: Tanggal Selesai)."
                            />
                          ) : (
                            <Alert
                              type="warning"
                              showIcon
                              message={
                                <div style={{ fontWeight: 700, color: '#b45309', fontSize: 13 }}>
                                  ⚠️ PO tidak ditemukan, scan atau input terlebih dahulu PO nya.
                                </div>
                              }
                              description={
                                <div style={{ fontSize: 12, marginTop: 4 }}>
                                  Nomor referensi PO <strong>{values.noPo || '(Kosong / Tidak Terdeteksi)'}</strong> belum terdaftar di sheet 'PO 2026'.
                                  Jika ada kesalahan pembacaan OCR nomor PO, Anda dapat mengoreksi nomornya di bawah dan klik tombol <strong>"Cek Ulang PO"</strong>.
                                </div>
                              }
                            />
                          )}

                          {/* Delivery Note Fields */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 1fr 1.2fr', gap: 10 }}>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: mutedColor }}>
                                TARGET NOMOR PO (REFERENSI) *
                              </label>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <Input
                                  name="noPo"
                                  value={values.noPo}
                                  onChange={handleChange}
                                  onBlur={handleBlur}
                                  placeholder="Contoh: 2600120"
                                  style={{ fontWeight: 700, fontFamily: 'monospace' }}
                                />
                                <Button
                                  icon={<AiOutlineSearch />}
                                  onClick={() => handleCheckPoReference(doc.id, values.noPo)}
                                  title="Cek ulang nomor PO ke Google Sheets"
                                >
                                  Cek PO
                                </Button>
                              </div>
                            </div>

                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: mutedColor }}>
                                NOMOR GRPO GUDANG *
                              </label>
                              <Input
                                name="noGrpo"
                                value={values.noGrpo}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                placeholder="Contoh: 2600055"
                                style={{ fontWeight: 700, fontFamily: 'monospace' }}
                              />
                            </div>

                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: mutedColor }}>
                                TGL SELESAI / TERIMA
                              </label>
                              <Input
                                name="lastGrpoDate"
                                value={values.lastGrpoDate}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                placeholder="DD/MM/YYYY"
                              />
                            </div>

                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: mutedColor }}>
                                SUPPLIER / VENDOR
                              </label>
                              <Input
                                name="supplier"
                                value={values.supplier}
                                onChange={handleChange}
                                onBlur={handleBlur}
                              />
                            </div>
                          </div>

                          {/* Penerima & Catatan KET */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: mutedColor }}>
                                PENERIMA BARANG
                              </label>
                              <Input
                                name="receivedBy"
                                placeholder="Nama staf gudang (e.g. Untung)"
                                value={values.receivedBy}
                                onChange={handleChange}
                                onBlur={handleBlur}
                              />
                            </div>

                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: mutedColor }}>
                                CATATAN UPDATE (KOLOM W - KET)
                              </label>
                              <Input
                                value={values.updateFields?.ket || values.remarks || `GRPO ${values.noGrpo}`}
                                onChange={(e) => setFieldValue('updateFields.ket', e.target.value)}
                                placeholder="Keterangan GRPO & catatan penerimaan barang"
                              />
                            </div>
                          </div>

                          {/* Barang Diterima (Jika terdeteksi) */}
                          {values.items && values.items.length > 0 && (
                            <div style={{ border: `1px solid ${borderColor}`, borderRadius: 8, padding: 10, backgroundColor: isDark ? '#1e293b' : '#f8fafc' }}>
                              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, color: mutedColor }}>
                                BARANG YANG DITERIMA PADA DELIVERY NOTE INI ({values.items.length} Item):
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {values.items.map((it, idx) => (
                                  <div key={idx} style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', color: textColor }}>
                                    <span>
                                      {idx + 1}. <Tag color="cyan">{it.kode || 'MATERIAL'}</Tag> {it.nama}
                                    </span>
                                    <span style={{ fontWeight: 600 }}>
                                      {it.qty} {it.uom || 'Pcs'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Bottom Action for GRPO */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              backgroundColor: isDark ? '#1e293b' : '#fffbeb',
                              border: `1px solid ${isDark ? '#374151' : '#fde68a'}`,
                              borderRadius: 8,
                              padding: '8px 14px',
                              fontSize: 11,
                            }}
                          >
                            <span style={{ color: doc.poFound ? '#047857' : '#b45309', fontWeight: 600 }}>
                              {doc.poFound
                                ? `✓ Siap mengupdate baris PO ${values.noPo} di sheet 'PO 2026'`
                                : '⚠️ PO tidak ditemukan, scan atau input terlebih dahulu PO nya.'}
                            </span>

                            <Button
                              type="primary"
                              htmlType="submit"
                              icon={<AiOutlineSave />}
                              disabled={doc.poFound === false}
                              loading={isCommitting}
                              style={{
                                backgroundColor: doc.poFound ? '#d97706' : undefined,
                                borderColor: doc.poFound ? '#d97706' : undefined,
                                fontSize: 11,
                                fontWeight: 700,
                                borderRadius: 6,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              {doc.poFound
                                ? `✓ Update Baris PO ${values.noPo} dengan No. GRPO ${values.noGrpo}`
                                : 'PO Tidak Ditemukan'}
                            </Button>
                          </div>
                        </form>
                      )}
                    </Formik>
                  </Card>
                );
              }

              // =======================================================================
              // TAMPILAN KASUS 2: PURCHASE ORDER (PO) -> INPUT BARIS BARU
              // =======================================================================
              return (
                <Card
                  key={doc.id || docIdx}
                  style={{
                    backgroundColor: cardBg,
                    borderRadius: 12,
                    border: doc.selected
                      ? `2px solid ${isDark ? '#0284c7' : '#0284c7'}`
                      : `1px solid ${borderColor}`,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                  }}
                  bodyStyle={{ padding: 18 }}
                >
                  <Formik
                    initialValues={{
                      id: doc.id,
                      tipeDokumen: 'PURCHASE_ORDER',
                      noPo: doc.noPo || 'PO-2026-TEMP',
                      supplier: doc.supplier || 'Supplier Rekanan',
                      date: doc.date || '15/10/2026',
                      quotation: doc.quotation || '',
                      items: doc.items || [],
                    }}
                    validationSchema={SinglePoSchema}
                    onSubmit={(values) => {
                      handleCommitSingle(values);
                    }}
                  >
                    {({ values, handleChange, handleBlur, handleSubmit, setFieldValue, isSubmitting }) => {
                      // Compute card totals
                      let subTotal = 0;
                      let totalPpn = 0;
                      values.items.forEach((it) => {
                        const itemSub = (it.qty || 0) * (it.harga || 0) * (1 - (it.diskon || 0));
                        subTotal += itemSub;
                        totalPpn += Number(it.ppn || 0);
                      });
                      const grandTotal = subTotal + totalPpn;

                      return (
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                          {/* Top Card Row */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${borderColor}`, paddingBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <Checkbox
                                checked={doc.selected}
                                onChange={() => toggleSelectDoc(doc.id)}
                              />
                              {doc.fileType === 'pdf' ? (
                                <Tag color="red" icon={<AiOutlineFilePdf />} style={{ fontWeight: 600 }}>
                                  {doc.filename} {doc.pageRange ? `(${doc.pageRange})` : ''}
                                </Tag>
                              ) : (
                                <Tag color="purple" icon={<AiOutlineFileImage />} style={{ fontWeight: 600 }}>
                                  {doc.filename}
                                </Tag>
                              )}
                              <Tag color={doc.tipePo === 'PO_JASA' ? 'orange' : 'green'} style={{ fontWeight: 700 }}>
                                {doc.tipePo === 'PO_JASA' ? 'PO JASA' : 'PO MATERIAL'}
                              </Tag>
                              <Tag color="cyan" style={{ fontWeight: 600 }}>
                                Input Baris Baru
                              </Tag>
                              {doc.totalPages && doc.totalPages > 1 && (
                                <Tag color="blue">Multi-Halaman: {doc.totalPages} Hal</Tag>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 14, fontWeight: 800, color: '#047857', fontFamily: 'monospace' }}>
                                Total: {formatRupiah(grandTotal)}
                              </span>
                              <Button
                                type="text"
                                danger
                                icon={<AiOutlineDelete />}
                                onClick={() => handleRemoveDoc(doc.id)}
                                title="Hapus dari antrian"
                              />
                            </div>
                          </div>

                          {/* PO Header Formik Inputs */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 1fr 1fr', gap: 10 }}>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: mutedColor }}>NO. PO</label>
                              <Input
                                name="noPo"
                                value={values.noPo}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                style={{ fontWeight: 700, fontFamily: 'monospace' }}
                              />
                            </div>

                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: mutedColor }}>SUPPLIER</label>
                              <Input
                                name="supplier"
                                value={values.supplier}
                                onChange={handleChange}
                                onBlur={handleBlur}
                              />
                            </div>

                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: mutedColor }}>TANGGAL</label>
                              <Input
                                name="date"
                                value={values.date}
                                onChange={handleChange}
                                onBlur={handleBlur}
                              />
                            </div>

                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: mutedColor }}>REF / QUOTATION</label>
                              <Input
                                name="quotation"
                                placeholder="No Ref"
                                value={values.quotation}
                                onChange={handleChange}
                                onBlur={handleBlur}
                              />
                            </div>
                          </div>

                          {/* PO Items Formik Table */}
                          <FieldArray name="items">
                            {({ push, remove }) => (
                              <div style={{ border: `1px solid ${borderColor}`, borderRadius: 8, overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                  <thead>
                                    <tr style={{ backgroundColor: isDark ? '#1e293b' : '#f1f5f9', color: textColor, borderBottom: `1px solid ${borderColor}` }}>
                                      <th style={{ padding: '6px 8px', textAlign: 'center', width: 40 }}>#</th>
                                      <th style={{ padding: '6px 8px', textAlign: 'left', width: 120 }}>Kode Material</th>
                                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Nama Material</th>
                                      <th style={{ padding: '6px 8px', textAlign: 'right', width: 70 }}>Qty</th>
                                      <th style={{ padding: '6px 8px', textAlign: 'right', width: 130 }}>Harga Unit (Rp)</th>
                                      <th style={{ padding: '6px 8px', textAlign: 'right', width: 80 }}>Diskon</th>
                                      <th style={{ padding: '6px 8px', textAlign: 'right', width: 110 }}>PPN (Rp)</th>
                                      <th style={{ padding: '6px 8px', textAlign: 'right', width: 130 }}>Subtotal (Rp)</th>
                                      <th style={{ padding: '6px 8px', textAlign: 'center', width: 50 }}>Aksi</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {values.items.map((it, itIdx) => {
                                      const itSub = (it.qty || 0) * (it.harga || 0) * (1 - (it.diskon || 0)) + Number(it.ppn || 0);

                                      return (
                                        <tr key={itIdx} style={{ borderBottom: `1px solid ${borderColor}` }}>
                                          <td style={{ textAlign: 'center', color: mutedColor }}>{itIdx + 1}</td>
                                          <td style={{ padding: 4 }}>
                                            <Input
                                              size="small"
                                              value={it.kode}
                                              onChange={(e) => setFieldValue(`items.${itIdx}.kode`, e.target.value.toUpperCase())}
                                              style={{ fontFamily: 'monospace', fontWeight: 600 }}
                                            />
                                          </td>
                                          <td style={{ padding: 4 }}>
                                            <Input
                                              size="small"
                                              value={it.nama}
                                              onChange={(e) => setFieldValue(`items.${itIdx}.nama`, e.target.value)}
                                            />
                                            {it.matchedMaster && (
                                              <div style={{ fontSize: 9, color: '#059669', marginTop: 2 }}>
                                                ✓ Sesuai Master: {it.matchedMaster.nama}
                                              </div>
                                            )}
                                            {!it.matchedMaster && it.suggestedMaster && (
                                              <div style={{ fontSize: 9, color: '#0284c7', marginTop: 2 }}>
                                                ⚡ Rekomendasi: [{it.suggestedMaster.kode}] {it.suggestedMaster.nama}
                                              </div>
                                            )}
                                          </td>
                                          <td style={{ padding: 4, textAlign: 'right' }}>
                                            <InputNumber
                                              size="small"
                                              min={0.01}
                                              value={it.qty}
                                              onChange={(v) => setFieldValue(`items.${itIdx}.qty`, v || 0)}
                                              style={{ width: '100%' }}
                                            />
                                          </td>
                                          <td style={{ padding: 4, textAlign: 'right' }}>
                                            <InputNumber
                                              size="small"
                                              min={0}
                                              value={it.harga}
                                              onChange={(v) => setFieldValue(`items.${itIdx}.harga`, v || 0)}
                                              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                                              parser={(v) => v.replace(/\./g, '')}
                                              style={{ width: '100%' }}
                                            />
                                          </td>
                                          <td style={{ padding: 4, textAlign: 'right' }}>
                                            <InputNumber
                                              size="small"
                                              min={0}
                                              max={100}
                                              value={(it.diskon || 0) * 100}
                                              onChange={(v) => setFieldValue(`items.${itIdx}.diskon`, (v || 0) / 100)}
                                              style={{ width: '100%' }}
                                            />
                                          </td>
                                          <td style={{ padding: 4, textAlign: 'right' }}>
                                            <InputNumber
                                              size="small"
                                              min={0}
                                              value={it.ppn}
                                              onChange={(v) => setFieldValue(`items.${itIdx}.ppn`, v || 0)}
                                              style={{ width: '100%' }}
                                            />
                                          </td>
                                          <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, color: '#2563eb', fontFamily: 'monospace' }}>
                                            {formatRupiah(itSub)}
                                          </td>
                                          <td style={{ textAlign: 'center' }}>
                                            {values.items.length > 1 && (
                                              <Button
                                                type="text"
                                                danger
                                                size="small"
                                                icon={<AiOutlineDelete />}
                                                onClick={() => remove(itIdx)}
                                              />
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>

                                <div style={{ padding: 6, backgroundColor: isDark ? '#1e293b' : '#fafafa', display: 'flex', justifyContent: 'flex-start' }}>
                                  <Button
                                    type="link"
                                    size="small"
                                    icon={<AiOutlinePlus />}
                                    onClick={() =>
                                      push({
                                       kode: '',
                                       nama: '',
                                       qty: 1,
                                       harga: 0,
                                       diskon: 0,
                                       ppn: 0,
                                     })
                                   }
                                   style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                 >
                                   + Tambah Item
                                 </Button>
                               </div>
                             </div>
                           )}
                         </FieldArray>

                         {/* Bottom Summary & Math Cross-Check Bar */}
                         <div
                           style={{
                             display: 'flex',
                             alignItems: 'center',
                             justifyContent: 'space-between',
                             backgroundColor: isDark ? '#1e293b' : '#f8fafc',
                             border: `1px solid ${borderColor}`,
                             borderRadius: 8,
                             padding: '8px 14px',
                             fontSize: 11,
                           }}
                         >
                           <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                             <span style={{ color: '#059669', fontWeight: 600 }}>
                               ✓ Subtotal: {formatRupiah(subTotal)}
                             </span>
                             <span style={{ color: '#0284c7', fontWeight: 600 }}>
                               ✓ PPN: {formatRupiah(totalPpn)}
                             </span>
                             <span style={{ color: '#7c3aed', fontWeight: 700 }}>
                               ✓ Grand Total: {formatRupiah(grandTotal)}
                             </span>
                           </div>

                           <Button
                             type="primary"
                             htmlType="submit"
                             icon={<AiOutlineSave />}
                             loading={isCommitting}
                             style={{
                               backgroundColor: '#047857',
                               borderColor: '#047857',
                               fontSize: 11,
                               fontWeight: 700,
                               borderRadius: 6,
                               display: 'inline-flex',
                               alignItems: 'center',
                               gap: 4,
                             }}
                           >
                             Simpan PO Baru Ini ke Google Sheets
                           </Button>
                         </div>
                       </form>
                     );
                   }}
                 </Formik>
               </Card>
             );
           })}
         </div>
       </div>
     )}
   </div>
 );
}
