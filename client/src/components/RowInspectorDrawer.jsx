import React from 'react';
import { Button, Tag, Divider, Empty } from 'antd';
import {
  AiOutlineEdit,
  AiOutlineCloseCircle,
  AiOutlineFileText,
  AiOutlineShop,
  AiOutlineInbox,
  AiOutlineCreditCard,
} from 'react-icons/ai';

export default function RowInspectorDrawer({
  selectedRow,
  onEditPo,
  onCancelPo,
  onClose,
  isDark,
}) {
  const formatRupiah = (val) => {
    return 'Rp ' + Number(val || 0).toLocaleString('id-ID');
  };

  const drawerBg = isDark ? '#111827' : '#f8fafc';
  const cardBg = isDark ? '#1f2937' : '#ffffff';
  const borderColor = isDark ? '#374151' : '#e2e8f0';
  const textColor = isDark ? '#f9fafb' : '#111827';
  const mutedColor = isDark ? '#9ca3af' : '#6b7280';

  if (!selectedRow) {
    return (
      <aside
        style={{
          width: 320,
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

  return (
    <aside
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
        <Tag color="blue" style={{ fontFamily: 'monospace', fontWeight: 700, margin: 0 }}>
          Baris #{selectedRow.rowIndex || 2}
        </Tag>
      </div>

      {/* Action Buttons */}
      <div
        style={{
          padding: 12,
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
          style={{ flex: 1, fontSize: 12, borderRadius: 6, backgroundColor: '#2563eb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
        >
          Edit Baris PO
        </Button>
        <Button
          danger
          icon={<AiOutlineCloseCircle />}
          onClick={() => onCancelPo(selectedRow)}
          disabled={isCancelled}
          style={{ flex: 1, fontSize: 12, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
        >
          Batalkan PO
        </Button>
      </div>

      {/* Content */}
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12 }}>
        {/* Card 1: Identitas Dokumen PO */}
        <div
          style={{
            backgroundColor: cardBg,
            borderRadius: 8,
            border: `1px solid ${borderColor}`,
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 700, color: textColor, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AiOutlineShop style={{ color: '#059669', fontSize: 16 }} /> Identitas Dokumen
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: mutedColor }}>Nomor PO:</span>
              <span style={{ fontWeight: 700, color: '#2563eb', fontFamily: 'monospace' }}>{selectedRow.noPo}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: mutedColor }}>Status:</span>
              <span><Tag color={selectedRow.status === 'Close' ? 'green' : selectedRow.status === 'Cancelled' ? 'red' : 'blue'}>{selectedRow.status}</Tag></span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: mutedColor }}>Tanggal PO:</span>
              <span style={{ color: textColor }}>{selectedRow.date || '-'}</span>
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

        {/* Card 2: Material & Finansial */}
        <div
          style={{
            backgroundColor: cardBg,
            borderRadius: 8,
            border: `1px solid ${borderColor}`,
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 700, color: textColor, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AiOutlineCreditCard style={{ color: '#7c3aed', fontSize: 16 }} /> Detail Barang & Nilai
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>
              <span style={{ color: mutedColor }}>Barang:</span>
              <div style={{ fontWeight: 600, color: textColor, marginTop: 2 }}>
                <Tag color="cyan">{selectedRow.kode || 'JASA'}</Tag>
                {selectedRow.nama || '-'}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${borderColor}`, paddingTop: 6 }}>
              <span style={{ color: mutedColor }}>Quantity:</span>
              <span style={{ fontWeight: 700, color: textColor }}>{selectedRow.qty}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: mutedColor }}>Harga Satuan:</span>
              <span style={{ fontFamily: 'monospace', color: textColor }}>{formatRupiah(selectedRow.priceUnit)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: mutedColor }}>Diskon:</span>
              <span style={{ color: textColor }}>{selectedRow.discount > 0 ? `${(selectedRow.discount * 100).toFixed(0)}%` : '0%'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: mutedColor }}>PPN:</span>
              <span style={{ color: textColor }}>{formatRupiah(selectedRow.ppn)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${borderColor}`, paddingTop: 6 }}>
              <span style={{ fontWeight: 700, color: textColor }}>TOTAL (Kolom Q):</span>
              <span style={{ fontWeight: 700, color: '#2563eb', fontSize: 13, fontFamily: 'monospace' }}>
                {formatRupiah(selectedRow.total)}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Penerimaan Gudang (GRPO) */}
        <div
          style={{
            backgroundColor: cardBg,
            borderRadius: 8,
            border: `1px solid ${borderColor}`,
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 700, color: textColor, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AiOutlineInbox style={{ color: '#d97706', fontSize: 16 }} /> Gudang &amp; Penerimaan
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: mutedColor }}>No. GRPO:</span>
              <span style={{ fontWeight: 600, color: textColor }}>{selectedRow.grpo || 'Belum Diterima'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: mutedColor }}>Tgl Selesai GRPO:</span>
              <span style={{ color: textColor }}>{selectedRow.lastGrpoDate || '-'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: mutedColor }}>Surat Jalan (DO):</span>
              <span style={{ color: textColor }}>{selectedRow.doNum || '-'}</span>
            </div>
          </div>
        </div>

        {/* Card 4: Faktur & Pembayaran Finance */}
        <div
          style={{
            backgroundColor: cardBg,
            borderRadius: 8,
            border: `1px solid ${borderColor}`,
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 700, color: textColor, marginBottom: 8 }}>
            Keuangan &amp; Faktur
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: mutedColor }}>Tanggal Bayar:</span>
              <span style={{ fontWeight: 600, color: selectedRow.tglBayar ? '#059669' : textColor }}>
                {selectedRow.tglBayar ? `Lunas (${selectedRow.tglBayar})` : 'Belum Lunas'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: mutedColor }}>No. Invoice:</span>
              <span style={{ color: textColor }}>{selectedRow.noInvoice || '-'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: mutedColor }}>Tgl Invoice:</span>
              <span style={{ color: textColor }}>{selectedRow.tglInvoice || '-'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: mutedColor }}>Faktur Pajak:</span>
              <span style={{ color: textColor }}>{selectedRow.fktInv || '-'}</span>
            </div>
          </div>
        </div>

        {/* Card 5: Catatan Operasional (KET) */}
        {selectedRow.ket && (
          <div
            style={{
              backgroundColor: cardBg,
              borderRadius: 8,
              border: `1px solid ${borderColor}`,
              padding: 12,
            }}
          >
            <div style={{ fontWeight: 700, color: textColor, marginBottom: 4 }}>
              Catatan Operasional (KET)
            </div>
            <p style={{ margin: 0, color: mutedColor, fontSize: 11, fontStyle: 'italic', wordBreak: 'break-word' }}>
              {selectedRow.ket}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
