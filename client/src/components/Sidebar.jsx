import React from 'react';
import { Tag } from 'antd';
import {
  AiOutlineTable,
  AiOutlineScan,
  AiOutlineAppstore,
  AiOutlineShop,
  AiOutlineCluster,
  AiOutlineBarChart,
} from 'react-icons/ai';

export default function Sidebar({ activeNav, onNavigate, stats, isDark }) {
  const totalRows = stats?.totalRows || 0;

  const navItems = [
    {
      key: 'po2026',
      path: '/po-2026',
      label: 'Sheet: PO 2026',
      icon: <AiOutlineTable style={{ fontSize: 16 }} />,
      badge: <Tag color="green" style={{ margin: 0, fontFamily: 'monospace' }}>{totalRows} Baris</Tag>,
      sub: 'Data Transaksi (Kolom A - W)',
    },
    {
      key: 'analytics',
      path: '/statistik',
      label: 'Statistik Multi-Tahun',
      icon: <AiOutlineBarChart style={{ fontSize: 16, color: '#8b5cf6' }} />,
      badge: <Tag color="purple" style={{ margin: 0, fontWeight: 'bold' }}>2017-2026</Tag>,
      sub: 'Analisis Belanja & 10 Tahun PO',
      highlight: true,
    },
    {
      key: 'multi-ocr',
      path: '/multi-ocr',
      label: '⚡ Smart Multi-OCR',
      icon: <AiOutlineScan style={{ fontSize: 16, color: '#0ea5e9' }} />,
      badge: <Tag color="blue" style={{ margin: 0, fontWeight: 'bold' }}>MULTI-PAGE</Tag>,
      sub: 'Input Multi-PDF & Foto PO',
    },
    {
      key: 'material',
      path: '/database-material',
      label: 'database Material',
      icon: <AiOutlineAppstore style={{ fontSize: 16 }} />,
      badge: <Tag style={{ margin: 0, fontFamily: 'monospace' }}>1.506</Tag>,
      sub: 'Master Katalog & Harga',
    },
    {
      key: 'supplier',
      path: '/database-supplier',
      label: 'database Supplier Mat.',
      icon: <AiOutlineShop style={{ fontSize: 16 }} />,
      badge: <Tag style={{ margin: 0, fontFamily: 'monospace' }}>1.506</Tag>,
      sub: 'Rekomendasi Vendor & Qty',
    },
    {
      key: 'topology',
      path: '/status-sistem',
      label: 'Status Sistem & Bot WA',
      icon: <AiOutlineCluster style={{ fontSize: 16 }} />,
      badge: <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }}></span>,
      sub: 'OpenWA & Sheets Telemetry',
    },
  ];

  const bgColor = isDark ? '#0f172a' : '#ffffff';
  const borderColor = isDark ? '#1e293b' : '#e2e8f0';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';

  return (
    <aside
      style={{
        width: 270,
        backgroundColor: bgColor,
        borderRight: `1px solid ${borderColor}`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flexShrink: 0,
        userSelect: 'none',
        zIndex: 30,
      }}
    >
      <div>
        {/* Brand Header */}
        <div
          onClick={() => onNavigate && onNavigate('/po-2026')}
          style={{
            height: 64,
            padding: '0 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderBottom: `1px solid ${borderColor}`,
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              backgroundColor: '#047857',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 2px 6px rgba(4,120,87,0.3)',
            }}
          >
            <AiOutlineTable style={{ fontSize: 20 }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 'bold', fontSize: 15, color: textColor, letterSpacing: '-0.3px' }}>
                PO SheetView
              </span>
              <Tag color="cyan" style={{ fontSize: 10, padding: '0 4px', lineHeight: '18px', margin: 0 }}>
                CRUD v2
              </Tag>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: mutedColor }}>OpenWA x Google Sheets v4</p>
          </div>
        </div>

        {/* Navigation Menu */}
        <div style={{ padding: '14px 10px' }}>
          <p
            style={{
              padding: '0 10px',
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: mutedColor,
              marginBottom: 8,
            }}
          >
            Navigasi Halaman
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {navItems.map((item) => {
              const active = activeNav === item.key;
              let itemBg = 'transparent';
              let itemBorder = '1px solid transparent';
              let itemColor = isDark ? '#cbd5e1' : '#334155';

              if (active) {
                itemBg = isDark ? 'rgba(4, 120, 87, 0.25)' : '#ecfdf5';
                itemBorder = isDark ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid #a7f3d0';
                itemColor = isDark ? '#6ee7b7' : '#047857';
              } else if (item.highlight) {
                itemBg = isDark ? 'rgba(14, 165, 233, 0.12)' : 'rgba(14, 165, 233, 0.08)';
                itemBorder = isDark ? '1px solid rgba(14, 165, 233, 0.3)' : '1px solid rgba(14, 165, 233, 0.25)';
              }

              return (
                <div
                  key={item.key}
                  onClick={() => onNavigate && onNavigate(item.path)}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 10,
                    backgroundColor: itemBg,
                    border: itemBorder,
                    color: itemColor,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {item.icon}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: active || item.highlight ? 700 : 500 }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: 10, color: mutedColor }}>{item.sub}</div>
                    </div>
                  </div>
                  <div>{item.badge}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Architecture Status Card */}
      <div
        style={{
          margin: 12,
          padding: 12,
          borderRadius: 10,
          backgroundColor: isDark ? '#1e293b' : '#f8fafc',
          border: `1px solid ${borderColor}`,
          fontSize: 11,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontWeight: 'bold', color: textColor, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 6px #10b981',
              }}
            ></span>
            Sinkronisasi Otomatis
          </span>
          <span style={{ color: '#059669', fontWeight: 'bold', fontFamily: 'monospace' }}>Cron 30m</span>
        </div>
        <div style={{ borderTop: `1px solid ${borderColor}`, paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4, color: mutedColor }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>OpenWA Session:</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: textColor }}>997f4002-105</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Cache / Database:</span>
            <span style={{ color: '#059669', fontWeight: 'bold' }}>PostgreSQL / RAM</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Mode Integrasi:</span>
            <span style={{ color: '#2563eb', fontWeight: 600 }}>Full CRUD + Multi-OCR</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
