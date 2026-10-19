import React from 'react';
import { Button, Tag, Tooltip } from 'antd';
import {
  AiOutlineSync,
  AiOutlinePlus,
  AiOutlineScan,
  AiOutlineBulb,
  AiFillBulb,
  AiOutlineTable,
  AiOutlineBarChart,
  AiOutlineInbox,
  AiOutlineDollar,
  AiOutlineTool,
  AiOutlineCluster,
} from 'react-icons/ai';
import UsdRateTicker from './UsdRateTicker';

export default function Header({
  activeNav,
  stats,
  isSyncing,
  onSync,
  onOpenCreateModal,
  onOpenOcrTab,
  isDark,
  toggleTheme,
  kurs,
  isRefreshingKurs,
  onRefreshKurs,
}) {
  const titles = {
    po2026: {
      title: 'Purchasing: Sheet "PO 2026" (Live Tracking PO • GRPO • Bayar)',
      tag: 'Live Tracking',
      tagColor: 'green',
      icon: <AiOutlineTable style={{ color: '#059669' }} />,
    },
    analytics: {
      title: 'Purchasing: Statistik & Analisis Belanja (PO 2017 s/d PO 2026)',
      tag: '10 Tahun Historis',
      tagColor: 'blue',
      icon: <AiOutlineBarChart style={{ color: '#0284c7' }} />,
    },
    'multi-ocr': {
      title: 'Smart Multi-OCR: Ekstraksi AI (Purchasing • Finance • Warehouse)',
      tag: 'High-Precision OCR',
      tagColor: 'blue',
      icon: <AiOutlineScan style={{ color: '#0284c7' }} />,
    },
    material: {
      title: 'Purchasing: Katalog Master Material ("database Material")',
      tag: '1.506 Master Items',
      tagColor: 'cyan',
      icon: <AiOutlineTable style={{ color: '#059669' }} />,
    },
    supplier: {
      title: 'Purchasing: Rekomendasi Vendor ("database Supplier Material")',
      tag: '1.506 Vendor History',
      tagColor: 'orange',
      icon: <AiOutlineTable style={{ color: '#ea580c' }} />,
    },
    warehouse: {
      title: 'Warehouse: Penerimaan Barang, Surat Jalan & Goods Receipt PO',
      tag: 'Operasional Gudang',
      tagColor: 'green',
      icon: <AiOutlineInbox style={{ color: '#059669' }} />,
    },
    finance: {
      title: 'Finance: Verifikasi Faktur, Perpajakan & Rekonsiliasi Pelunasan',
      tag: 'Keuangan & Pajak',
      tagColor: 'blue',
      icon: <AiOutlineDollar style={{ color: '#0284c7' }} />,
    },
    maintenance: {
      title: 'Maintenance: Permintaan Suku Cadang Mesin & Jadwal Servis',
      tag: 'Teknik & Servis',
      tagColor: 'cyan',
      icon: <AiOutlineTool style={{ color: '#0d9488' }} />,
    },
    topology: {
      title: 'Status Infrastruktur: OpenWA WhatsApp & Google Sheets API v4',
      tag: 'System Healthy',
      tagColor: 'success',
      icon: <AiOutlineCluster style={{ color: '#10b981' }} />,
    },
  };

  const current = titles[activeNav] || titles.po2026;
  const bgColor = isDark ? '#071f24' : '#ffffff';
  const borderColor = isDark ? '#133e46' : '#e0e5e9';
  const textColor = isDark ? '#fbfcfc' : '#055b65';
  const mutedColor = isDark ? '#8ea8ab' : '#5c7e84';

  return (
    <header
      style={{
        height: 64,
        backgroundColor: bgColor,
        borderBottom: `1px solid ${borderColor}`,
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        zIndex: 20,
      }}
    >
      {/* Left: Active View Title */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: textColor, lineHeight: 1.2 }}>
            {current.title}
          </h1>
          <Tag color={current.tagColor} style={{ fontWeight: 600, fontSize: 11, margin: 0, borderRadius: 6 }}>
            {current.tag}
          </Tag>
        </div>
        <p style={{ margin: '3px 0 0 0', fontSize: 11, color: mutedColor, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="live-dot-green" style={{ width: 6, height: 6 }} />
          <span>Live Sync</span>
          <span>•</span>
          <span className="tabular-nums">Terakhir Sync: {stats?.syncedAt ? new Date(stats.syncedAt).toLocaleTimeString('id-ID') : 'Baru saja'}</span>
        </p>
      </div>

      {/* Right: Actions & Theme Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Live USD Rate Ticker (Ortax) */}
        <UsdRateTicker
          kurs={kurs || stats?.kursUsd}
          loading={isRefreshingKurs}
          onRefresh={onRefreshKurs}
          isDark={isDark}
        />

        <div style={{ width: 1, height: 20, backgroundColor: borderColor, margin: '0 2px' }} />

        {/* Sync Button 2026 */}
        <Button
          className="smooth-clickable"
          icon={<AiOutlineSync style={{ animation: isSyncing ? 'antRotate 1s infinite linear' : 'none' }} />}
          onClick={onSync}
          loading={isSyncing}
          style={{ fontSize: 12, borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          Tarik Sheet 2026
        </Button>

        {/* Multi-OCR Action */}
        <Button
          type="default"
          className="smooth-clickable"
          icon={<AiOutlineScan />}
          onClick={onOpenOcrTab}
          style={{
            fontSize: 12,
            borderRadius: 8,
            borderColor: '#45828b',
            color: isDark ? '#1bd488' : '#055b65',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          Multi-OCR Input
        </Button>

        {/* Buat PO Baru (Formik Modal) */}
        <Button
          type="primary"
          className="smooth-clickable"
          icon={<AiOutlinePlus />}
          onClick={onOpenCreateModal}
          style={{
            fontSize: 12,
            borderRadius: 8,
            backgroundColor: isDark ? '#1bd488' : '#055b65',
            borderColor: isDark ? '#1bd488' : '#055b65',
            color: isDark ? '#05191d' : '#ffffff',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          + Tambah PO Manual
        </Button>

        <div style={{ width: 1, height: 20, backgroundColor: borderColor, margin: '0 4px' }} />

        {/* Theme Switcher */}
        <Tooltip title={isDark ? 'Beralih ke Light Mode' : 'Beralih ke Dark Mode'}>
          <Button
            type="text"
            className="smooth-clickable"
            icon={isDark ? <AiFillBulb style={{ color: '#fbbf24', fontSize: 16 }} /> : <AiOutlineBulb style={{ color: '#64748b', fontSize: 16 }} />}
            onClick={toggleTheme}
            style={{ borderRadius: 8, transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
          />
        </Tooltip>
      </div>
    </header>
  );
}
