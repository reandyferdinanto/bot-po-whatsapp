import React from 'react';
import { Button, Tag, Tooltip } from 'antd';
import {
  AiOutlineSync,
  AiOutlinePlus,
  AiOutlineScan,
  AiOutlineBulb,
  AiFillBulb,
  AiOutlineTable,
  AiOutlineThunderbolt,
  AiOutlineBarChart,
} from 'react-icons/ai';
import UsdRateTicker from './UsdRateTicker';

export default function Header({
  activeNav,
  stats,
  isSyncing,
  isSyncingAll,
  onSync,
  onSyncAll,
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
      title: 'Data Transaksi: Sheet "PO 2026"',
      tag: 'Live CRUD Active',
      tagColor: 'green',
      icon: <AiOutlineTable style={{ color: '#059669' }} />,
    },
    analytics: {
      title: 'Statistik & Analisis Multi-Tahun (PO 2017 s/d PO 2026)',
      tag: '10 Tahun Historis',
      tagColor: 'purple',
      icon: <AiOutlineBarChart style={{ color: '#7c3aed' }} />,
    },
    'multi-ocr': {
      title: '⚡ Smart Multi-OCR: Ekstraksi Dokumen PO Multi-Page & Multi-File',
      tag: 'High-Precision OCR',
      tagColor: 'blue',
      icon: <AiOutlineScan style={{ color: '#0284c7' }} />,
    },
    material: {
      title: 'Katalog Master Material: Sheet "database Material"',
      tag: '1.506 Master Items',
      tagColor: 'purple',
      icon: <AiOutlineTable style={{ color: '#7c3aed' }} />,
    },
    supplier: {
      title: 'Rekomendasi Vendor: Sheet "database Supplier Material"',
      tag: '1.506 Vendor History',
      tagColor: 'orange',
      icon: <AiOutlineTable style={{ color: '#ea580c' }} />,
    },
    topology: {
      title: 'Status Infrastruktur: OpenWA WhatsApp & Google Sheets API v4',
      tag: 'System Healthy',
      tagColor: 'success',
      icon: <AiOutlineTable style={{ color: '#16a34a' }} />,
    },
  };

  const current = titles[activeNav] || titles.po2026;
  const bgColor = isDark ? '#0f172a' : '#ffffff';
  const borderColor = isDark ? '#1e293b' : '#e2e8f0';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';

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
          <Tag color={current.tagColor} style={{ fontWeight: 600, fontSize: 11, margin: 0 }}>
            {current.tag}
          </Tag>
        </div>
        <p style={{ margin: '2px 0 0 0', fontSize: 11, color: mutedColor, fontFamily: 'monospace' }}>
          Spreadsheet ID: <span style={{ color: textColor }}>15n9joeQAoic8FvP5V_-bChqjHKjFeMG0WGHzQ4xHGPk</span> • Terakhir Sync: {stats?.syncedAt ? new Date(stats.syncedAt).toLocaleTimeString('id-ID') : 'Baru saja'}
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

        {/* Sync All Multi-Year Button */}
        <Button
          type="primary"
          icon={<AiOutlineThunderbolt style={{ animation: isSyncingAll ? 'antRotate 1s infinite linear' : 'none' }} />}
          onClick={onSyncAll}
          loading={isSyncingAll}
          style={{
            fontSize: 12,
            borderRadius: 8,
            backgroundColor: '#7c3aed',
            borderColor: '#7c3aed',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            boxShadow: '0 2px 6px rgba(124, 58, 237, 0.25)',
          }}
        >
          ⚡ Sync Semua Sheet (2017-2026)
        </Button>

        {/* Sync Button 2026 */}
        <Button
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
          icon={<AiOutlineScan />}
          onClick={onOpenOcrTab}
          style={{
            fontSize: 12,
            borderRadius: 8,
            borderColor: '#0284c7',
            color: '#0284c7',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          ⚡ Multi-OCR Input
        </Button>

        {/* Buat PO Baru (Formik Modal) */}
        <Button
          type="primary"
          icon={<AiOutlinePlus />}
          onClick={onOpenCreateModal}
          style={{
            fontSize: 12,
            borderRadius: 8,
            backgroundColor: '#047857',
            borderColor: '#047857',
            fontWeight: 600,
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
            icon={isDark ? <AiFillBulb style={{ color: '#fbbf24', fontSize: 16 }} /> : <AiOutlineBulb style={{ color: '#64748b', fontSize: 16 }} />}
            onClick={toggleTheme}
            style={{ borderRadius: 8 }}
          />
        </Tooltip>
      </div>
    </header>
  );
}
