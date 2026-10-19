import React from 'react';
import { Card, Tag, Button, Empty } from 'antd';
import {
  AiOutlineInbox,
  AiOutlineDollar,
  AiOutlineTool,
  AiOutlineClockCircle,
  AiOutlineCheckCircle,
  AiOutlineArrowRight,
} from 'react-icons/ai';

const MODULE_CONFIG = {
  warehouse: {
    title: 'Modul Warehouse (Gudang)',
    tag: 'Operasional Gudang',
    icon: <AiOutlineInbox style={{ fontSize: 36, color: '#1bd488' }} />,
    color: '#1bd488',
    description: 'Pusat manajemen penerimaan barang fisik, kontrol Surat Jalan (DO), dan verifikasi Goods Receipt PO (GRPO).',
    features: [
      'Pencatatan Goods Receipt PO (GRPO) langsung dari gudang',
      'Pengecekan fisik barang terhadap pesanan PO Purchasing',
      'Verifikasi Surat Jalan (DO) vendor via OCR & WhatsApp Bot',
      'Status stok material masuk & serah terima barang',
    ],
    statusText: 'Integrasi WhatsApp Bot Aktif • Dashboard Khusus Segera Hadir',
  },
  finance: {
    title: 'Modul Finance (Keuangan)',
    tag: 'Keuangan & Pembayaran',
    icon: <AiOutlineDollar style={{ fontSize: 36, color: '#45828b' }} />,
    color: '#45828b',
    description: 'Pusat rekonsiliasi faktur, validasi perpajakan (PPN/PPH), verifikasi nomor invoice, dan pelunasan PO.',
    features: [
      'Rekonsiliasi Faktur Pembayaran terhadap GRPO & PO',
      'Pemantauan Live Kurs USD Bank Indonesia untuk barang impor',
      'Validasi Faktur Pajak & nomor invoice vendor',
      'Penjadwalan jatuh tempo dan riwayat bukti pembayaran',
    ],
    statusText: 'Kurs Bank Indonesia Live • Modul Pelunasan Segera Hadir',
  },
  maintenance: {
    title: 'Modul Maintenance (Pemeliharaan)',
    tag: 'Teknik & Pemeliharaan',
    icon: <AiOutlineTool style={{ fontSize: 36, color: '#055b65' }} />,
    color: '#055b65',
    description: 'Pusat pengajuan kebutuhan sparepart mesin, work order pemeliharaan fasilitas, dan monitoring suku cadang.',
    features: [
      'Pengajuan permintaan suku cadang/material ke Purchasing',
      'Pencatatan Work Order perbaikan mesin & jadwal servis',
      'Riwayat penggantian sparepart dan konsumsi material',
      'Monitoring kesiapan alat kerja dan inventaris teknis',
    ],
    statusText: 'Modul Siap Diintegrasikan ke Alur Purchasing',
  },
};

export default function PlaceholderModuleView({ module = 'warehouse', isDark }) {
  const config = MODULE_CONFIG[module] || MODULE_CONFIG.warehouse;

  const bgColor = isDark ? '#0a252a' : '#ffffff';
  const borderColor = isDark ? '#133e46' : '#e0e5e9';
  const textColor = isDark ? '#fbfcfc' : '#055b65';
  const mutedColor = isDark ? '#8ea8ab' : '#5c7e84';

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        overflowY: 'auto',
      }}
    >
      <div
        className="smooth-card smooth-page-fade"
        style={{
          maxWidth: 680,
          width: '100%',
          backgroundColor: bgColor,
          borderRadius: 14,
          border: `1px solid ${borderColor}`,
          padding: '36px 32px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 16,
        }}
      >
        {/* Module Icon */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            backgroundColor: isDark ? 'rgba(5, 150, 105, 0.15)' : '#ecfdf5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          }}
        >
          {config.icon}
        </div>

        {/* Titles */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: textColor }}>
              {config.title}
            </h2>
            <Tag color="cyan" style={{ margin: 0, fontWeight: 700 }}>
              {config.tag}
            </Tag>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: mutedColor, maxWidth: 540 }}>
            {config.description}
          </p>
        </div>

        {/* Status Banner */}
        <div
          style={{
            width: '100%',
            padding: '10px 16px',
            borderRadius: 8,
            backgroundColor: isDark ? 'rgba(14, 165, 233, 0.12)' : '#f0f9ff',
            border: `1px solid ${isDark ? 'rgba(14, 165, 233, 0.3)' : '#bae6fd'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 12,
            fontWeight: 600,
            color: isDark ? '#38bdf8' : '#0369a1',
          }}
        >
          <AiOutlineClockCircle style={{ fontSize: 16 }} />
          <span>{config.statusText}</span>
        </div>

        {/* Key Features Coming Soon */}
        <div style={{ width: '100%', textAlign: 'left', marginTop: 8 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: mutedColor,
              letterSpacing: '0.05em',
              marginBottom: 10,
            }}
          >
            Fitur Utama yang Sedang Disiapkan:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {config.features.map((feat, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 8,
                  backgroundColor: isDark ? '#1e293b' : '#f8fafc',
                  border: `1px solid ${borderColor}`,
                  fontSize: 12,
                  color: textColor,
                }}
              >
                <AiOutlineCheckCircle style={{ color: '#059669', fontSize: 16, flexShrink: 0 }} />
                <span>{feat}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Note */}
        <p style={{ margin: '8px 0 0 0', fontSize: 11, color: mutedColor, fontStyle: 'italic' }}>
          *Data saat ini tetap terhubung melalui Sheet PO 2026, bot WhatsApp OpenWA, dan Smart Multi-OCR.
        </p>
      </div>
    </div>
  );
}
