import React, { useState, useEffect } from 'react';
import { Button, Tag, Divider, Empty, message, Tooltip, Spin, Upload, Select } from 'antd';
import {
  AiOutlineEdit,
  AiOutlineCloseCircle,
  AiOutlineFileText,
  AiOutlineShop,
  AiOutlineInbox,
  AiOutlineCreditCard,
  AiOutlineDollar,
  AiOutlineCopy,
  AiOutlineCheck,
  AiOutlineFolder,
  AiOutlineCloudUpload,
  AiOutlineLink,
  AiOutlineDownload,
  AiOutlineFilePdf,
  AiOutlineFileImage,
} from 'react-icons/ai';
import { getPoDocuments, uploadPoDocument } from '../services/api';

export default function RowInspectorDrawer({
  selectedRow,
  allRows = [],
  onEditPo,
  onCancelPo,
  onClose,
  isDark,
}) {
  const [copiedField, setCopiedField] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadType, setUploadType] = useState('PO');
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'items' | 'drive'

  const loadDocuments = async () => {
    if (!selectedRow?.noPo) return;
    setLoadingDocs(true);
    try {
      const res = await getPoDocuments(selectedRow.noPo);
      if (res.success) {
        setDocuments(res.documents || []);
      }
    } catch (err) {
      console.warn('Gagal memuat dokumen PO:', err.message);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [selectedRow?.noPo]);

  const handleUploadDoc = async (file) => {
    try {
      message.loading({ content: 'Mengunggah dokumen ke Google Drive...', key: 'doc-upload' });
      const res = await uploadPoDocument(selectedRow.noPo, uploadType, file);
      if (res.success) {
        message.success({ content: 'Dokumen berhasil diarsipkan ke Google Drive!', key: 'doc-upload' });
        loadDocuments();
      } else {
        message.error({ content: res.error || 'Gagal unggah dokumen', key: 'doc-upload' });
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message;
      message.error({ content: `Gagal: ${errMsg}`, key: 'doc-upload' });
    }
    return false;
  };

  const formatRupiah = (val) => {
    return 'Rp ' + Number(val || 0).toLocaleString('id-ID');
  };

  const handleCopy = (text, fieldName) => {
    if (!text || text === '-') return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    message.success(`${text} disalin ke clipboard!`);
    setTimeout(() => {
      setCopiedField(null);
    }, 2000);
  };

  const drawerBg = isDark ? '#071f24' : '#f7faf9';
  const cardBg = isDark ? '#0a252a' : '#ffffff';
  const borderColor = isDark ? '#133e46' : '#e0e5e9';
  const textColor = isDark ? '#fbfcfc' : '#055b65';
  const mutedColor = isDark ? '#8ea8ab' : '#5c7e84';

  if (!selectedRow) {
    return (
      <aside
        style={{
          width: 340,
          borderLeft: `1px solid ${borderColor}`,
          backgroundColor: drawerBg,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          flexShrink: 0,
        }}
      >
        <Empty description="Pilih baris pada tabel untuk melihat detail 23 kolom" />
      </aside>
    );
  }

  const isCancelled = selectedRow.status?.toLowerCase() === 'cancelled';
  const matchingItems = allRows.filter(
    (r) => (r.noPo || '').trim().toUpperCase() === (selectedRow.noPo || '').trim().toUpperCase()
  );
  const itemsToDisplay = matchingItems.length > 0 ? matchingItems : [selectedRow];
  const totalItemsCount = itemsToDisplay.length;
  const totalPoSpend = itemsToDisplay.reduce((sum, item) => sum + (Number(item.total) || 0), 0);

  // 1. Identitas Dokumen
  const isIdentitasFilled = Boolean(selectedRow.noPo && selectedRow.supplier);

  // 2. Detail Barang & Nilai
  const isBarangFilled = itemsToDisplay.some(
    (item) =>
      Boolean(item.nama || item.kode) &&
      ((item.total && item.total > 0) || (item.priceUnit && item.priceUnit > 0) || (item.qty && item.qty > 0))
  );

  // 3. Gudang & Penerimaan
  const cleanGrpo = (selectedRow.grpo || '').trim();
  const cleanLastGrpoDate = (selectedRow.lastGrpoDate || '').trim();
  const cleanDoNum = (selectedRow.doNum || '').trim();
  const isGudangFilled = Boolean(
    (cleanGrpo && cleanGrpo !== '-' && cleanGrpo.toLowerCase() !== 'belum diterima') ||
    (cleanLastGrpoDate && cleanLastGrpoDate !== '-') ||
    (cleanDoNum && cleanDoNum !== '-')
  );

  // 4. Keuangan & Faktur
  const cleanTglBayar = (selectedRow.tglBayar || '').trim();
  const cleanNoInvoice = (selectedRow.noInvoice || '').trim();
  const cleanTglInvoice = (selectedRow.tglInvoice || '').trim();
  const cleanFktInv = (selectedRow.fktInv || '').trim();
  const isKeuanganFilled = Boolean(
    (cleanTglBayar && cleanTglBayar !== '-' && !cleanTglBayar.toLowerCase().includes('belum')) ||
    (cleanNoInvoice && cleanNoInvoice !== '-') ||
    (cleanTglInvoice && cleanTglInvoice !== '-') ||
    (cleanFktInv && cleanFktInv !== '-')
  );

  // 5. Catatan Operasional
  const isKetFilled = Boolean(selectedRow.ket && selectedRow.ket.trim() && selectedRow.ket.trim() !== '-');

  // STEP KELENGKAPAN: HANYA 3 STEP
  // Step 1: PO (pengganti step dokumen dan barang, 2 step jadi 1)
  // Step 2: GRPO (penerimaan barang)
  // Step 3: Invoice & Pembayaran
  const isPoFilled = Boolean(isIdentitasFilled && isBarangFilled);
  const isGrpoFilled = isGudangFilled;
  const isInvoiceFilled = isKeuanganFilled;

  const stepStates = [
    { label: 'PO', sub: 'Dokumen & Barang', filled: isPoFilled },
    { label: 'GRPO', sub: 'Penerimaan Gudang', filled: isGrpoFilled },
    { label: 'Invoice & Pembayaran', sub: 'Keuangan & Faktur', filled: isInvoiceFilled },
  ];
  const filledStepsCount = stepStates.filter((s) => s.filled).length;
  const completionPercentage = (filledStepsCount / 3) * 100;

  // Helper untuk styling card yang premium sesuai palet tema
  const getCardStyle = (isFilled) => {
    if (isFilled) {
      return {
        backgroundColor: isDark ? 'rgba(27, 212, 136, 0.12)' : '#f2faf7',
        borderRadius: 10,
        border: `1px solid ${isDark ? 'rgba(27, 212, 136, 0.35)' : '#b2c9c5'}`,
        borderLeft: '4px solid #1bd488',
        padding: 12,
        transition: 'all 0.25s ease',
        boxShadow: isDark
          ? '0 2px 6px rgba(0, 0, 0, 0.3)'
          : '0 1px 4px rgba(27, 212, 136, 0.12)',
      };
    }
    return {
      backgroundColor: cardBg,
      borderRadius: 10,
      border: `1px solid ${borderColor}`,
      borderLeft: `4px solid ${isDark ? '#1d525c' : '#e0e5e9'}`,
      padding: 12,
      transition: 'all 0.25s ease',
      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
    };
  };

  const renderChecklistBadge = (isFilled) => {
    if (isFilled) {
      return (
        <span
          title="Data terisi"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
            borderRadius: '50%',
            backgroundColor: isDark ? 'rgba(27, 212, 136, 0.25)' : '#e0f5ed',
            color: isDark ? '#1bd488' : '#055b65',
            border: '1.5px solid #1bd488',
            fontSize: 11,
            fontWeight: 800,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          <AiOutlineCheck style={{ fontSize: 11 }} />
        </span>
      );
    }
    return (
      <span
        title="Belum terisi"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 20,
          height: 20,
          borderRadius: '50%',
          backgroundColor: isDark ? 'rgba(19, 62, 70, 0.3)' : '#f8fafc',
          border: `1.5px dashed ${isDark ? '#1d525c' : '#b2c9c5'}`,
          flexShrink: 0,
        }}
      />
    );
  };

  const renderCopyButton = (text, fieldName) => {
    if (!text || text === '-' || text.toLowerCase().includes('belum')) return null;
    const isCopied = copiedField === fieldName;
    return (
      <Tooltip title={isCopied ? 'Tersalin!' : `Salin ${text}`}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopy(text, fieldName);
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 4px',
            color: isCopied ? '#059669' : mutedColor,
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: 12,
            borderRadius: 4,
            transition: 'color 0.15s ease',
          }}
        >
          {isCopied ? <AiOutlineCheck style={{ color: '#059669' }} /> : <AiOutlineCopy />}
        </button>
      </Tooltip>
    );
  };

  return (
    <aside
      className="inspector-drawer"
      style={{
        width: 340,
        borderLeft: `1px solid ${borderColor}`,
        backgroundColor: drawerBg,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: `1px solid ${borderColor}`,
          backgroundColor: cardBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AiOutlineFileText style={{ color: '#2563eb', fontSize: 16 }} />
          <span style={{ fontWeight: 700, fontSize: 13, color: textColor }}>
            Inspeksi Baris
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Tag color="blue" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, margin: 0 }}>
            Baris #{selectedRow.rowIndex || 2}
          </Tag>
          {onClose && (
            <Tooltip title="Tutup Detail">
              <button
                onClick={onClose}
                className="smooth-clickable"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 6,
                  color: mutedColor,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                <AiOutlineCloseCircle style={{ fontSize: 17 }} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${borderColor}`,
          display: 'flex',
          gap: 8,
          backgroundColor: cardBg,
        }}
      >
        <Button
          type="primary"
          icon={<AiOutlineEdit />}
          onClick={() => onEditPo(selectedRow)}
          disabled={isCancelled}
          className="smooth-clickable"
          style={{ flex: 1, fontSize: 12, borderRadius: 6, backgroundColor: '#2563eb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
        >
          Edit PO ({totalItemsCount})
        </Button>
        <Button
          danger
          icon={<AiOutlineCloseCircle />}
          onClick={() => onCancelPo(selectedRow)}
          disabled={isCancelled}
          className="smooth-clickable"
          style={{ flex: 1, fontSize: 12, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
        >
          Batalkan
        </Button>
      </div>

      {/* Segmented Tab Navigator */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${borderColor}`, backgroundColor: isDark ? '#071f24' : '#f2f6f7' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, backgroundColor: isDark ? '#0a252a' : '#e0e5e9', padding: 3, borderRadius: 8 }}>
          <button
            onClick={() => setActiveTab('overview')}
            className="smooth-clickable"
            style={{
              border: 'none',
              borderRadius: 6,
              padding: '5px 0',
              fontSize: 11,
              fontWeight: activeTab === 'overview' ? 700 : 500,
              backgroundColor: activeTab === 'overview' ? (isDark ? '#133e46' : '#ffffff') : 'transparent',
              color: activeTab === 'overview' ? (isDark ? '#1bd488' : '#055b65') : mutedColor,
              boxShadow: activeTab === 'overview' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Ringkasan
          </button>
          <button
            onClick={() => setActiveTab('items')}
            className="smooth-clickable"
            style={{
              border: 'none',
              borderRadius: 6,
              padding: '5px 0',
              fontSize: 11,
              fontWeight: activeTab === 'items' ? 700 : 500,
              backgroundColor: activeTab === 'items' ? (isDark ? '#133e46' : '#ffffff') : 'transparent',
              color: activeTab === 'items' ? (isDark ? '#1bd488' : '#055b65') : mutedColor,
              boxShadow: activeTab === 'items' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Items ({totalItemsCount})
          </button>
          <button
            onClick={() => setActiveTab('drive')}
            className="smooth-clickable"
            style={{
              border: 'none',
              borderRadius: 6,
              padding: '5px 0',
              fontSize: 11,
              fontWeight: activeTab === 'drive' ? 700 : 500,
              backgroundColor: activeTab === 'drive' ? (isDark ? '#133e46' : '#ffffff') : 'transparent',
              color: activeTab === 'drive' ? (isDark ? '#1bd488' : '#055b65') : mutedColor,
              boxShadow: activeTab === 'drive' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Drive ({documents.length})
          </button>
        </div>
      </div>

      {/* Tab 1: Ringkasan & Status Overview */}
      {activeTab === 'overview' && (
        <div className="smooth-page-fade">
          {/* Completion Progress Stepper (3 Steps: PO -> GRPO -> Invoice & Pembayaran) */}
          <div
            style={{
              padding: '10px 16px',
              borderBottom: `1px solid ${borderColor}`,
              backgroundColor: isDark ? 'rgba(15, 23, 42, 0.45)' : '#fafafa',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: textColor }}>
                Kelengkapan Tahap PO (3 Tahap)
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 800,
                  color: completionPercentage === 100 ? '#059669' : completionPercentage >= 50 ? '#2563eb' : '#d97706',
                }}
              >
                {completionPercentage.toFixed(0)}%
              </span>
            </div>

            {/* Progress track */}
            <div
              style={{
                width: '100%',
                height: 5,
                borderRadius: 3,
                backgroundColor: isDark ? '#334155' : '#e2e8f0',
                overflow: 'hidden',
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  width: `${completionPercentage}%`,
                  height: '100%',
                  borderRadius: 3,
                  backgroundColor:
                    completionPercentage === 100
                      ? '#10b981'
                      : completionPercentage >= 50
                      ? '#2563eb'
                      : '#f59e0b',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>

            {/* 3 Steps mini indicators */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {stepStates.map((st, sIdx) => (
                <div
                  key={st.label}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 3,
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      backgroundColor: st.filled
                        ? '#1bd488'
                        : (isDark ? '#133e46' : '#cbd5e1'),
                      color: st.filled ? '#05191d' : '#ffffff',
                      fontSize: 10,
                      fontWeight: 900,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {st.filled ? <AiOutlineCheck style={{ fontSize: 9 }} /> : sIdx + 1}
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: st.filled ? (isDark ? '#1bd488' : '#055b65') : mutedColor,
                      fontWeight: st.filled ? 700 : 500,
                      lineHeight: 1.15,
                    }}
                  >
                    {st.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12 }}>
            {/* Card 1: Identitas Dokumen PO */}
            <div style={getCardStyle(isIdentitasFilled)}>
              <div style={{ fontWeight: 700, color: textColor, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AiOutlineShop style={{ color: isIdentitasFilled ? '#059669' : '#2563eb', fontSize: 16 }} /> Identitas Dokumen
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Tag color="blue" style={{ margin: 0, fontWeight: 600 }}>{totalItemsCount} Material</Tag>
                  {renderChecklistBadge(isIdentitasFilled)}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: mutedColor }}>Nomor PO:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontWeight: 700, color: '#2563eb', fontFamily: "'JetBrains Mono', monospace" }}>
                      {selectedRow.noPo}
                    </span>
                    {renderCopyButton(selectedRow.noPo, 'noPo')}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: mutedColor }}>Status:</span>
                  <span>
                    <Tag color={
                      (selectedRow.status || '').toLowerCase().startsWith('clos') || (selectedRow.status || '').toLowerCase() === 'lunas'
                        ? 'green'
                        : (selectedRow.status || '').toLowerCase().startsWith('cancel')
                        ? 'red'
                        : (selectedRow.status || '').toLowerCase().startsWith('pend')
                        ? 'orange'
                        : 'blue'
                    }>
                      {selectedRow.status}
                    </Tag>
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: mutedColor }}>Tanggal PO:</span>
                  <span style={{ color: textColor, fontFamily: "'JetBrains Mono', monospace" }}>{selectedRow.date || '-'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: mutedColor }}>Supplier:</span>
                  <span style={{ fontWeight: 600, color: textColor, textAlign: 'right' }}>{selectedRow.supplier || '-'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: mutedColor }}>Ref Quotation:</span>
                  <span style={{ color: textColor }}>{selectedRow.quotation || '-'}</span>
                </div>
              </div>
            </div>

            {/* Card 3: Penerimaan Gudang (GRPO) */}
            <div style={getCardStyle(isGudangFilled)}>
              <div style={{ fontWeight: 700, color: textColor, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AiOutlineInbox style={{ color: isGudangFilled ? '#059669' : '#d97706', fontSize: 16 }} /> Gudang &amp; Penerimaan
                </span>
                {renderChecklistBadge(isGudangFilled)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: mutedColor }}>No. GRPO:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: isGudangFilled && cleanGrpo && cleanGrpo !== '-' ? (isDark ? '#6ee7b7' : '#059669') : textColor }}>
                      {cleanGrpo || 'Belum Diterima'}
                    </span>
                    {renderCopyButton(cleanGrpo, 'grpo')}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: mutedColor }}>Tgl Selesai GRPO:</span>
                  <span style={{ color: textColor, fontFamily: "'JetBrains Mono', monospace" }}>{cleanLastGrpoDate || '-'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: mutedColor }}>Surat Jalan (DO):</span>
                  <span style={{ color: textColor }}>{cleanDoNum || '-'}</span>
                </div>
              </div>
            </div>

            {/* Card 4: Faktur & Pembayaran Finance */}
            <div style={getCardStyle(isKeuanganFilled)}>
              <div style={{ fontWeight: 700, color: textColor, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AiOutlineDollar style={{ color: isKeuanganFilled ? '#059669' : '#64748b', fontSize: 16 }} /> Keuangan &amp; Faktur
                </span>
                {renderChecklistBadge(isKeuanganFilled)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: mutedColor }}>Tanggal Bayar:</span>
                  <span style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: cleanTglBayar && !cleanTglBayar.toLowerCase().includes('belum') ? (isDark ? '#6ee7b7' : '#059669') : textColor }}>
                    {cleanTglBayar ? `Lunas (${cleanTglBayar})` : 'Belum Lunas'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: mutedColor }}>No. Invoice:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: textColor, fontFamily: "'JetBrains Mono', monospace" }}>{cleanNoInvoice || '-'}</span>
                    {renderCopyButton(cleanNoInvoice, 'invoice')}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: mutedColor }}>Tgl Invoice:</span>
                  <span style={{ color: textColor, fontFamily: "'JetBrains Mono', monospace" }}>{cleanTglInvoice || '-'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: mutedColor }}>Faktur Pajak:</span>
                  <span style={{ color: textColor }}>{cleanFktInv || '-'}</span>
                </div>
              </div>
            </div>

            {/* Card 5: Catatan Operasional (KET) */}
            {selectedRow.ket && (
              <div style={getCardStyle(isKetFilled)}>
                <div style={{ fontWeight: 700, color: textColor, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Catatan Operasional (KET)</span>
                  {renderChecklistBadge(isKetFilled)}
                </div>
                <p style={{ margin: 0, color: mutedColor, fontSize: 11, fontStyle: 'italic', wordBreak: 'break-word' }}>
                  {selectedRow.ket}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Material Items */}
      {activeTab === 'items' && (
        <div className="smooth-page-fade" style={{ padding: 14 }}>
          {/* Card 2: List Material */}
          <div style={getCardStyle(isBarangFilled)}>
            <div style={{ fontWeight: 700, color: textColor, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AiOutlineCreditCard style={{ color: isBarangFilled ? '#059669' : '#0284c7', fontSize: 16 }} /> List Material
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Tag color="cyan" style={{ margin: 0, fontWeight: 600 }}>{totalItemsCount} Item</Tag>
                {renderChecklistBadge(isBarangFilled)}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {itemsToDisplay.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    paddingBottom: idx === itemsToDisplay.length - 1 ? 0 : 8,
                    borderBottom: idx === itemsToDisplay.length - 1 ? 'none' : `1px dashed ${borderColor}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  {/* Header Item: #1 [Kode] Nama */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 10, color: isBarangFilled ? '#059669' : '#0284c7' }}>
                        #{idx + 1}
                      </span>
                      <Tag color="cyan" style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '18px' }}>
                        {item.kode || 'JASA'}
                      </Tag>
                      <span style={{ fontWeight: 600, color: textColor, fontSize: 12 }}>
                        {item.nama || '-'}
                      </span>
                    </div>
                  </div>

                  {/* Harga, Qty & Total per item */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                    <span style={{ color: mutedColor, fontFamily: "'JetBrains Mono', monospace" }}>
                      {item.qty || 1} x {formatRupiah(item.priceUnit)}
                      {item.discount > 0 && ` (-${(item.discount * 100).toFixed(0)}%)`}
                      {item.ppn > 0 && ` (+PPN)`}
                    </span>
                    <span style={{ fontWeight: 700, color: isBarangFilled ? '#047857' : '#2563eb', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                      {formatRupiah(item.total)}
                    </span>
                  </div>
                </div>
              ))}

              {/* Total Keseluruhan PO */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderTop: `1px solid ${isBarangFilled ? (isDark ? 'rgba(52, 211, 153, 0.3)' : '#bbf7d0') : borderColor}`,
                  paddingTop: 8,
                  marginTop: 2,
                }}
              >
                <span style={{ fontWeight: 700, color: textColor }}>TOTAL (Kolom Q):</span>
                <span style={{ fontWeight: 800, color: isBarangFilled ? '#047857' : '#2563eb', fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatRupiah(totalPoSpend || selectedRow.total)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Google Drive Documents */}
      {activeTab === 'drive' && (
        <div className="smooth-page-fade" style={{ padding: 14 }}>
          {/* Card 6: Arsip Dokumen Google Drive (PO, GRPO, Bukti Bayar) */}
          <div style={getCardStyle(documents.length > 0)}>
            <div style={{ fontWeight: 700, color: textColor, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AiOutlineFolder style={{ color: '#4285F4', fontSize: 16 }} /> Dokumen Google Drive
              </span>
              <Tag color={documents.length > 0 ? 'blue' : 'default'} style={{ margin: 0, fontSize: 10 }}>
                {documents.length} File
              </Tag>
            </div>

            {loadingDocs ? (
              <div style={{ textAlign: 'center', padding: 16 }}>
                <Spin size="small" />
              </div>
            ) : documents.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {documents.map((doc) => {
                  const isPdf = doc.mime_type?.includes('pdf') || doc.file_name?.endsWith('.pdf');
                  return (
                    <div
                      key={doc.id}
                      className="smooth-card"
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        backgroundColor: isDark ? '#111827' : '#ffffff',
                        border: `1px solid ${borderColor}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 11,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                        {isPdf ? (
                          <AiOutlineFilePdf style={{ color: '#ef4444', fontSize: 18, flexShrink: 0 }} />
                        ) : (
                          <AiOutlineFileImage style={{ color: '#3b82f6', fontSize: 18, flexShrink: 0 }} />
                        )}
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 600, color: textColor }}>
                            <Tag color="cyan" style={{ fontSize: 9, padding: '0 3px', lineHeight: '14px', margin: '0 4px 0 0' }}>
                              {doc.tipe_dokumen}
                            </Tag>
                            {doc.file_name}
                          </div>
                          <div style={{ fontSize: 10, color: mutedColor }}>
                            {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : ''} • {new Date(doc.created_at).toLocaleDateString('id-ID')}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        {doc.drive_url && (
                          <Tooltip title="Buka di Google Drive">
                            <Button
                              type="text"
                              size="small"
                              className="smooth-clickable"
                              icon={<AiOutlineLink />}
                              href={doc.drive_url}
                              target="_blank"
                              style={{ padding: '0 4px' }}
                            />
                          </Tooltip>
                        )}
                        <Tooltip title="Unduh File">
                          <Button
                            type="text"
                            size="small"
                            className="smooth-clickable"
                            icon={<AiOutlineDownload />}
                            href={`/api/documents/download/${doc.id}`}
                            target="_blank"
                            style={{ padding: '0 4px' }}
                          />
                        </Tooltip>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: mutedColor, marginBottom: 12, fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
                Belum ada file terunggah untuk PO ini.
              </div>
            )}

            {/* Form Quick Upload Lampiran */}
            <div style={{ borderTop: `1px dashed ${borderColor}`, paddingTop: 10, display: 'flex', gap: 6 }}>
              <Select
                size="small"
                value={uploadType}
                onChange={setUploadType}
                style={{ width: 120, fontSize: 11 }}
                options={[
                  { value: 'PO', label: 'PO' },
                  { value: 'GRPO', label: 'Surat Jalan' },
                  { value: 'BUKTI_BAYAR', label: 'Bukti Bayar' },
                ]}
              />
              <Upload beforeUpload={handleUploadDoc} showUploadList={false}>
                <Button size="small" icon={<AiOutlineCloudUpload />} className="smooth-clickable" style={{ fontSize: 11, borderRadius: 6 }}>
                  + Unggah File
                </Button>
              </Upload>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
