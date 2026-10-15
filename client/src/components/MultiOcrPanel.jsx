import React, { useState } from 'react';
import {
  Upload,
  Button,
  Card,
  Tag,
  Table,
  Input,
  InputNumber,
  Space,
  message,
  Checkbox,
  Progress,
  Tooltip,
  Alert,
  Empty,
  Collapse,
} from 'antd';
import { Formik, FieldArray } from 'formik';
import * as Yup from 'yup';
import {
  InboxOutlined,
  ScanOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  DeleteOutlined,
  EditOutlined,
  CalculatorOutlined,
  SaveOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { parseOcrFiles, commitBatchOCR } from '../services/api';

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

export default function MultiOcrPanel({ onPoCommitted, isDark }) {
  const [fileList, setFileList] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedDocuments, setParsedDocuments] = useState([]);
  const [isCommitting, setIsCommitting] = useState(false);

  const formatRupiah = (val) => 'Rp ' + Number(val || 0).toLocaleString('id-ID');

  const handleUploadChange = ({ fileList: newFileList }) => {
    setFileList(newFileList);
  };

  const handleStartBatchOcr = async () => {
    if (fileList.length === 0) {
      message.warning('Pilih minimal 1 file PDF atau foto dokumen PO.');
      return;
    }

    setIsProcessing(true);
    message.loading({ content: `Memproses OCR ${fileList.length} file...`, key: 'ocr-proc' });

    try {
      const rawFiles = fileList.map((f) => f.originFileObj || f);
      const res = await parseOcrFiles(rawFiles);

      if (res.success && res.documents) {
        setParsedDocuments(res.documents);
        message.success({
          content: `Ekstraksi Sukses! Ditemukan ${res.totalPOsParsed} dokumen PO dari ${res.totalFiles} file.`,
          key: 'ocr-proc',
        });
        setFileList([]); // Clear upload queue
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

  const handleCommitSingle = async (poData) => {
    setIsCommitting(true);
    try {
      const res = await commitBatchOCR([poData]);
      if (res.success && res.successCount > 0) {
        message.success(`PO ${poData.noPo} berhasil disimpan ke Google Sheets 'PO 2026'!`);
        setParsedDocuments((prev) => prev.filter((d) => d.noPo !== poData.noPo));
        if (onPoCommitted) onPoCommitted();
      } else {
        message.error(`Gagal: ${res.results?.[0]?.error || 'Error simpan'}`);
      }
    } catch (err) {
      message.error(`Error simpan PO: ${err.message}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleCommitSelected = async () => {
    const selected = parsedDocuments.filter((d) => d.selected && d.status !== 'error');
    if (selected.length === 0) {
      message.warning('Pilih minimal 1 dokumen PO yang valid untuk disimpan.');
      return;
    }

    setIsCommitting(true);
    message.loading({ content: `Menyimpan ${selected.length} PO ke Google Sheets...`, key: 'commit-proc' });

    try {
      const res = await commitBatchOCR(selected);
      if (res.success) {
        message.success({
          content: `✅ Sukses menyimpan ${res.successCount} dari ${selected.length} PO ke Google Sheets!`,
          key: 'commit-proc',
        });
        // Hapus yang sukses dari daftar
        const successfulNoPos = new Set(res.results.filter((r) => r.success).map((r) => r.noPo));
        setParsedDocuments((prev) => prev.filter((d) => !successfulNoPos.has(d.noPo)));
        if (onPoCommitted) onPoCommitted();
      }
    } catch (err) {
      message.error({ content: `Gagal simpan batch: ${err.message}`, key: 'commit-proc' });
    } finally {
      setIsCommitting(false);
    }
  };

  const selectedCount = parsedDocuments.filter((d) => d.selected).length;
  const totalItemsCount = parsedDocuments.reduce((acc, d) => acc + (d.items?.length || 0), 0);
  const totalGrandSum = parsedDocuments.reduce(
    (acc, d) => acc + (d.totals?.grandTotal || d.items?.reduce((s, it) => s + (it.total || 0), 0) || 0),
    0
  );

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
              <ScanOutlined />
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: textColor, letterSpacing: '-0.3px' }}>
                Smart Multi-OCR &amp; Multi-Page PO Document Engine
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: 12, color: mutedColor }}>
                Mendukung unggahan <strong>banyak file sekaligus</strong> dan <strong>PDF multi-halaman</strong> (otomatis mengenali setiap nomor PO dan menggabungkan halaman lanjutan secara cerdas).
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
            <CheckCircleOutlined style={{ color: '#059669' }} /> 1 PDF Multi-Halaman: Ekstrak seluruh halaman &amp; multi-PO
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
            <CheckCircleOutlined style={{ color: '#059669' }} /> Multi-File Upload: Sekaligus scan PDF + Foto JPG/PNG
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
            <CheckCircleOutlined style={{ color: '#059669' }} /> Auto-Match 1.506 Master Material &amp; Histori Harga
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
            <CheckCircleOutlined style={{ color: '#059669' }} /> Validasi Perhitungan Qty x Harga = Total &amp; PPN
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
          fileList={fileList}
          onChange={handleUploadChange}
          beforeUpload={() => false} // Do not auto-upload, wait for button
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          style={{
            padding: '24px 0',
            backgroundColor: isDark ? '#1e293b' : '#fafafa',
            borderColor: '#0284c7',
            borderRadius: 10,
          }}
        >
          <p className="ant-upload-drag-icon">
            <CloudUploadOutlined style={{ fontSize: 44, color: '#0284c7' }} />
          </p>
          <p style={{ fontSize: 15, fontWeight: 700, color: textColor, margin: '8px 0 4px 0' }}>
            Klik atau Tarik Dokumen PDF / Foto PO ke Area Ini
          </p>
          <p style={{ fontSize: 12, color: mutedColor }}>
            Mendukung banyak file sekaligus (*.pdf, *.jpg, *.png). Jika 1 PDF berisi beberapa halaman, sistem otomatis memindai seluruh lembar dokumen.
          </p>
        </Dragger>

        {fileList.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: mutedColor }}>
              <strong>{fileList.length} file</strong> siap diproses OCR.
            </span>
            <Button
              type="primary"
              size="large"
              icon={<ScanOutlined />}
              loading={isProcessing}
              onClick={handleStartBatchOcr}
              style={{
                backgroundColor: '#0284c7',
                borderColor: '#0284c7',
                fontWeight: 700,
                borderRadius: 8,
              }}
            >
              ⚡ Mulai Ekstraksi OCR ({fileList.length} Dokumen)
            </Button>
          </div>
        )}
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
                  Pilih Semua ({selectedCount}/{parsedDocuments.length} PO)
                </span>
              </Checkbox>

              <span style={{ color: mutedColor, fontSize: 12 }}>
                Total Item: <strong style={{ color: textColor }}>{totalItemsCount}</strong> • Nilai: <strong style={{ color: '#059669', fontFamily: 'monospace' }}>{formatRupiah(totalGrandSum)}</strong>
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => setParsedDocuments([])} size="middle">
                Bersihkan Antrian
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={isCommitting}
                onClick={handleCommitSelected}
                style={{
                  backgroundColor: '#047857',
                  borderColor: '#047857',
                  fontWeight: 700,
                  borderRadius: 8,
                }}
              >
                ✓ Simpan {selectedCount} PO Terpilih ke Google Sheets 'PO 2026'
              </Button>
            </div>
          </div>

          {/* List of Parsed PO Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {parsedDocuments.map((doc, docIdx) => (
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
                              <Tag color="red" icon={<FilePdfOutlined />} style={{ fontWeight: 600 }}>
                                {doc.filename} {doc.pageRange ? `(${doc.pageRange})` : ''}
                              </Tag>
                            ) : (
                              <Tag color="purple" icon={<FileImageOutlined />} style={{ fontWeight: 600 }}>
                                {doc.filename}
                              </Tag>
                            )}
                            <Tag color={doc.tipePo === 'PO_JASA' ? 'orange' : 'green'} style={{ fontWeight: 700 }}>
                              {doc.tipePo === 'PO_JASA' ? 'PO JASA' : 'PO MATERIAL'}
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
                              icon={<DeleteOutlined />}
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
                                              icon={<DeleteOutlined />}
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
                                  icon={<PlusOutlined />}
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
                            icon={<SaveOutlined />}
                            loading={isCommitting}
                            style={{
                              backgroundColor: '#047857',
                              borderColor: '#047857',
                              fontSize: 11,
                              fontWeight: 700,
                              borderRadius: 6,
                            }}
                          >
                            Simpan PO Ini ke Google Sheets
                          </Button>
                        </div>
                      </form>
                    );
                  }}
                </Formik>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
