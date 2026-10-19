import React, { useState } from 'react';
import { Tag, Tooltip } from 'antd';
import {
  AiOutlineScan,
  AiOutlineShopping,
  AiOutlineTable,
  AiOutlineAppstore,
  AiOutlineShop,
  AiOutlineBarChart,
  AiOutlineInbox,
  AiOutlineDollar,
  AiOutlineTool,
  AiOutlineCluster,
  AiOutlineMenuFold,
  AiOutlineMenuUnfold,
  AiOutlineDown,
  AiOutlineRight,
  AiOutlineFileText,
  AiOutlineFileDone,
  AiOutlineGoogle,
} from 'react-icons/ai';

export default function Sidebar({
  activeNav,
  onNavigate,
  stats,
  isDark,
  isCollapsed = false,
  onToggleCollapse,
}) {
  const totalRows = stats?.totalRows || 0;

  // Track accordion expand/collapse for menus with submenus
  const [expandedSections, setExpandedSections] = useState({
    ocr: true,
    purchasing: true,
  });

  const toggleSection = (key) => {
    setExpandedSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const bgColor = isDark ? '#0f172a' : '#ffffff';
  const borderColor = isDark ? '#1e293b' : '#e2e8f0';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';

  // Submenu items
  const ocrSubItems = [
    {
      key: 'ocr-purchasing',
      path: '/multi-ocr?dept=purchasing',
      label: 'Purchasing',
    },
    {
      key: 'ocr-finance',
      path: '/multi-ocr?dept=finance',
      label: 'Finance',
    },
    {
      key: 'ocr-warehouse',
      path: '/multi-ocr?dept=warehouse',
      label: 'Warehouse',
    },
  ];

  const purchasingSubItems = [
    {
      key: 'po2026',
      path: '/po-2026',
      label: 'Sheet: PO 2026',
      icon: <AiOutlineTable style={{ fontSize: 15 }} />,
      badge: <Tag color="green" style={{ margin: 0, fontFamily: 'monospace', fontSize: 10 }}>{totalRows} Baris</Tag>,
      sub: 'Track PO • GRPO • Bayar',
    },
    {
      key: 'material',
      path: '/database-material',
      label: 'database Material',
      icon: <AiOutlineAppstore style={{ fontSize: 15 }} />,
      badge: <Tag style={{ margin: 0, fontFamily: 'monospace', fontSize: 10 }}>1.506</Tag>,
      sub: 'Katalog & Riwayat Harga',
    },
    {
      key: 'supplier',
      path: '/database-supplier',
      label: 'database Supplier Mat.',
      icon: <AiOutlineShop style={{ fontSize: 15 }} />,
      badge: <Tag style={{ margin: 0, fontFamily: 'monospace', fontSize: 10 }}>1.506</Tag>,
      sub: 'Rekomendasi Vendor',
    },
    {
      key: 'analytics',
      path: '/statistik',
      label: 'Statistik Multi-Tahun',
      icon: <AiOutlineBarChart style={{ fontSize: 15, color: '#0284c7' }} />,
      badge: <Tag color="blue" style={{ margin: 0, fontWeight: 700, fontSize: 10 }}>2017-2026</Tag>,
      sub: 'Analisis Belanja 10 Tahun',
    },
  ];

  // Standalone Main Menus
  const standaloneMenus = [
    {
      key: 'warehouse',
      path: '/warehouse',
      label: 'Warehouse',
      sub: 'Penerimaan & Stok Fisik',
      icon: <AiOutlineInbox style={{ fontSize: 18, color: '#059669' }} />,
      badge: <Tag color="default" style={{ margin: 0, fontSize: 10 }}>Update</Tag>,
    },
    {
      key: 'finance',
      path: '/finance',
      label: 'Finance',
      sub: 'Faktur & Pelunasan',
      icon: <AiOutlineDollar style={{ fontSize: 18, color: '#0284c7' }} />,
      badge: <Tag color="default" style={{ margin: 0, fontSize: 10 }}>Update</Tag>,
    },
    {
      key: 'maintenance',
      path: '/maintenance',
      label: 'Maintenance',
      sub: 'Permintaan Sparepart',
      icon: <AiOutlineTool style={{ fontSize: 18, color: '#0d9488' }} />,
      badge: <Tag color="default" style={{ margin: 0, fontSize: 10 }}>Update</Tag>,
    },
  ];

  // Helper active status
  const isOcrActive = activeNav === 'multi-ocr' || activeNav?.startsWith('ocr-');
  const isPurchasingActive = ['po2026', 'material', 'supplier', 'analytics'].includes(activeNav);

  return (
    <aside
      style={{
        width: isCollapsed ? 72 : 270,
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        backgroundColor: bgColor,
        borderRight: `1px solid ${borderColor}`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flexShrink: 0,
        userSelect: 'none',
        zIndex: 30,
        overflowX: 'hidden',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
        {/* Brand Header */}
        <div
          style={{
            height: 64,
            padding: isCollapsed ? '0 16px' : '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'space-between',
            borderBottom: `1px solid ${borderColor}`,
            flexShrink: 0,
          }}
        >
          <div
            onClick={() => onNavigate && onNavigate('/po-2026')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              overflow: 'hidden',
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
                flexShrink: 0,
              }}
            >
              <AiOutlineTable style={{ fontSize: 20 }} />
            </div>

            {!isCollapsed && (
              <div style={{ whiteSpace: 'nowrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 'bold', fontSize: 15, color: textColor, letterSpacing: '-0.3px' }}>
                    PO SheetView
                  </span>
                  <Tag color="cyan" style={{ fontSize: 10, padding: '0 4px', lineHeight: '18px', margin: 0 }}>
                    HUB
                  </Tag>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: mutedColor }}>Purchasing • Whs • Finance</p>
              </div>
            )}
          </div>

          {!isCollapsed && onToggleCollapse && (
            <Tooltip title="Sembunyikan Sidebar (Fokus Spreadsheet)">
              <button
                onClick={onToggleCollapse}
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  padding: 6,
                  color: mutedColor,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AiOutlineMenuFold style={{ fontSize: 18 }} />
              </button>
            </Tooltip>
          )}
        </div>

        {/* Navigation Body */}
        <div style={{ padding: isCollapsed ? '12px 8px' : '12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          
          {/* ============================================================== */}
          {/* 1. MENU UTAMA PALING ATAS: SMART MULTI-OCR (DENGAN 3 SUBMENU) */}
          {/* ============================================================== */}
          <div>
            {isCollapsed ? (
              <Tooltip placement="right" title="Smart Multi-OCR (Purchasing, Finance, Warehouse)">
                <div
                  onClick={() => onNavigate && onNavigate('/multi-ocr')}
                  style={{
                    padding: '10px 0',
                    borderRadius: 10,
                    backgroundColor: isOcrActive ? (isDark ? 'rgba(14, 165, 233, 0.25)' : '#e0f2fe') : 'transparent',
                    color: isOcrActive ? '#0284c7' : textColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: isOcrActive ? `1px solid ${isDark ? 'rgba(14, 165, 233, 0.4)' : '#bae6fd'}` : '1px solid transparent',
                  }}
                >
                  <AiOutlineScan style={{ fontSize: 18, color: '#0284c7' }} />
                </div>
              </Tooltip>
            ) : (
              <div>
                <div
                  onClick={() => {
                    toggleSection('ocr');
                    onNavigate && onNavigate('/multi-ocr');
                  }}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 10,
                    backgroundColor: isOcrActive ? (isDark ? 'rgba(14, 165, 233, 0.18)' : '#f0f9ff') : 'transparent',
                    border: isOcrActive ? `1px solid ${isDark ? 'rgba(14, 165, 233, 0.35)' : '#bae6fd'}` : '1px solid transparent',
                    color: isOcrActive ? (isDark ? '#38bdf8' : '#0284c7') : textColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AiOutlineScan style={{ fontSize: 18, color: '#0284c7' }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        Smart Multi-OCR
                      </div>
                      <div style={{ fontSize: 10, color: mutedColor }}>
                        Scan AI Lintas Departemen
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tag color="blue" style={{ margin: 0, fontSize: 10, fontWeight: 700 }}>AI</Tag>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSection('ocr');
                      }}
                      style={{ color: mutedColor, fontSize: 12, padding: '2px 4px' }}
                    >
                      {expandedSections.ocr ? <AiOutlineDown /> : <AiOutlineRight />}
                    </span>
                  </div>
                </div>

                {/* Submenu Smart Multi-OCR */}
                {expandedSections.ocr && (
                  <div style={{ marginTop: 4, marginLeft: 16, paddingLeft: 12, borderLeft: `1.5px solid ${isDark ? '#334155' : '#e2e8f0'}`, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {ocrSubItems.map((sub) => {
                      const active = activeNav === 'multi-ocr';
                      return (
                        <div
                          key={sub.key}
                          onClick={() => onNavigate && onNavigate(sub.path)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 12,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            color: textColor,
                            backgroundColor: 'transparent',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = isDark ? '#1e293b' : '#f8fafc')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <span style={{ fontSize: 12, fontWeight: 500 }}>
                            {sub.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ============================================================== */}
          {/* 2. MENU UTAMA: PURCHASING (DENGAN 4 SUBMENU)                  */}
          {/* ============================================================== */}
          <div>
            {isCollapsed ? (
              <Tooltip placement="right" title="Purchasing (Sheet PO 2026, Material, Supplier, Statistik)">
                <div
                  onClick={() => onNavigate && onNavigate('/po-2026')}
                  style={{
                    padding: '10px 0',
                    borderRadius: 10,
                    backgroundColor: isPurchasingActive ? (isDark ? 'rgba(4, 120, 87, 0.25)' : '#ecfdf5') : 'transparent',
                    color: isPurchasingActive ? '#059669' : textColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: isPurchasingActive ? `1px solid ${isDark ? 'rgba(16, 185, 129, 0.4)' : '#a7f3d0'}` : '1px solid transparent',
                  }}
                >
                  <AiOutlineShopping style={{ fontSize: 18, color: '#059669' }} />
                </div>
              </Tooltip>
            ) : (
              <div>
                <div
                  onClick={() => {
                    toggleSection('purchasing');
                    onNavigate && onNavigate('/po-2026');
                  }}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 10,
                    backgroundColor: isPurchasingActive ? (isDark ? 'rgba(4, 120, 87, 0.22)' : '#ecfdf5') : 'transparent',
                    border: isPurchasingActive ? `1px solid ${isDark ? 'rgba(16, 185, 129, 0.4)' : '#a7f3d0'}` : '1px solid transparent',
                    color: isPurchasingActive ? (isDark ? '#6ee7b7' : '#047857') : textColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AiOutlineShopping style={{ fontSize: 18, color: '#047857' }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        Purchasing
                      </div>
                      <div style={{ fontSize: 10, color: mutedColor }}>
                        Pengadaan &amp; Tracking PO
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tag color="green" style={{ margin: 0, fontSize: 10, fontWeight: 700 }}>4 Fitur</Tag>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSection('purchasing');
                      }}
                      style={{ color: mutedColor, fontSize: 12, padding: '2px 4px' }}
                    >
                      {expandedSections.purchasing ? <AiOutlineDown /> : <AiOutlineRight />}
                    </span>
                  </div>
                </div>

                {/* Submenu Purchasing */}
                {expandedSections.purchasing && (
                  <div style={{ marginTop: 4, marginLeft: 16, paddingLeft: 12, borderLeft: `1.5px solid ${isDark ? '#334155' : '#e2e8f0'}`, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {purchasingSubItems.map((sub) => {
                      const active = activeNav === sub.key;
                      return (
                        <div
                          key={sub.key}
                          onClick={() => onNavigate && onNavigate(sub.path)}
                          style={{
                            padding: '7px 10px',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontSize: 12,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            color: active ? (isDark ? '#6ee7b7' : '#047857') : textColor,
                            backgroundColor: active ? (isDark ? 'rgba(4, 120, 87, 0.25)' : '#f0fdf4') : 'transparent',
                            fontWeight: active ? 700 : 500,
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            if (!active) e.currentTarget.style.backgroundColor = isDark ? '#1e293b' : '#f8fafc';
                          }}
                          onMouseLeave={(e) => {
                            if (!active) e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {sub.icon}
                            <div>
                              <div>{sub.label}</div>
                              <div style={{ fontSize: 10, color: mutedColor }}>{sub.sub}</div>
                            </div>
                          </div>
                          <div>{sub.badge}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ============================================================== */}
          {/* 3, 4, 5. MENU UTAMA SETARA: WAREHOUSE, FINANCE, MAINTENANCE   */}
          {/* ============================================================== */}
          {standaloneMenus.map((m) => {
            const active = activeNav === m.key;
            const content = (
              <div
                key={m.key}
                onClick={() => onNavigate && onNavigate(m.path)}
                style={{
                  padding: isCollapsed ? '10px 0' : '9px 12px',
                  borderRadius: 10,
                  backgroundColor: active ? (isDark ? 'rgba(4, 120, 87, 0.25)' : '#ecfdf5') : 'transparent',
                  border: active ? `1px solid ${isDark ? 'rgba(16, 185, 129, 0.4)' : '#a7f3d0'}` : '1px solid transparent',
                  color: active ? (isDark ? '#6ee7b7' : '#047857') : textColor,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: isCollapsed ? 'center' : 'space-between',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: isCollapsed ? 0 : 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {m.icon}
                  </div>
                  {!isCollapsed && (
                    <div style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 13, fontWeight: active ? 700 : 600 }}>
                        {m.label}
                      </div>
                      <div style={{ fontSize: 10, color: mutedColor }}>{m.sub}</div>
                    </div>
                  )}
                </div>
                {!isCollapsed && <div>{m.badge}</div>}
              </div>
            );

            if (isCollapsed) {
              return (
                <Tooltip key={m.key} placement="right" title={`${m.label} (${m.sub})`}>
                  {content}
                </Tooltip>
              );
            }

            return content;
          })}

          {/* ============================================================== */}
          {/* 6. MENU UTAMA PALING BAWAH: STATUS BOT & SISTEM                */}
          {/* ============================================================== */}
          <div>
            {isCollapsed ? (
              <Tooltip placement="right" title="Status Sistem & Bot WA">
                <div
                  onClick={() => onNavigate && onNavigate('/status-sistem')}
                  style={{
                    padding: '10px 0',
                    borderRadius: 10,
                    backgroundColor: activeNav === 'topology' ? (isDark ? 'rgba(16, 185, 129, 0.25)' : '#ecfdf5') : 'transparent',
                    color: activeNav === 'topology' ? '#059669' : textColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: activeNav === 'topology' ? `1px solid ${isDark ? 'rgba(16, 185, 129, 0.4)' : '#a7f3d0'}` : '1px solid transparent',
                  }}
                >
                  <AiOutlineCluster style={{ fontSize: 18, color: '#10b981' }} />
                </div>
              </Tooltip>
            ) : (
              <div
                onClick={() => onNavigate && onNavigate('/status-sistem')}
                style={{
                  padding: '9px 12px',
                  borderRadius: 10,
                  backgroundColor: activeNav === 'topology' ? (isDark ? 'rgba(16, 185, 129, 0.25)' : '#ecfdf5') : 'transparent',
                  border: activeNav === 'topology' ? `1px solid ${isDark ? 'rgba(16, 185, 129, 0.4)' : '#a7f3d0'}` : '1px solid transparent',
                  color: activeNav === 'topology' ? (isDark ? '#6ee7b7' : '#047857') : textColor,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s ease',
                  marginTop: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AiOutlineCluster style={{ fontSize: 18, color: '#10b981' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: activeNav === 'topology' ? 700 : 600 }}>
                      Status Bot &amp; Sistem
                    </div>
                    <div style={{ fontSize: 10, color: mutedColor }}>
                      OpenWA &amp; Sheets Telemetry
                    </div>
                  </div>
                </div>
                <div>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }}></span>
                </div>
              </div>
            )}

            {/* Menu Pengaturan Google Drive */}
            {isCollapsed ? (
              <Tooltip placement="right" title="Pengaturan Google Drive">
                <div
                  onClick={() => onNavigate && onNavigate('/settings/drive')}
                  style={{
                    padding: '10px 0',
                    borderRadius: 10,
                    backgroundColor: activeNav === 'drive-settings' ? (isDark ? 'rgba(66, 133, 244, 0.25)' : '#e8f0fe') : 'transparent',
                    color: activeNav === 'drive-settings' ? '#4285F4' : textColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: activeNav === 'drive-settings' ? `1px solid ${isDark ? 'rgba(66, 133, 244, 0.4)' : '#d2e3fc'}` : '1px solid transparent',
                    marginTop: 4,
                  }}
                >
                  <AiOutlineGoogle style={{ fontSize: 18, color: '#4285F4' }} />
                </div>
              </Tooltip>
            ) : (
              <div
                onClick={() => onNavigate && onNavigate('/settings/drive')}
                style={{
                  padding: '9px 12px',
                  borderRadius: 10,
                  backgroundColor: activeNav === 'drive-settings' ? (isDark ? 'rgba(66, 133, 244, 0.25)' : '#e8f0fe') : 'transparent',
                  border: activeNav === 'drive-settings' ? `1px solid ${isDark ? 'rgba(66, 133, 244, 0.4)' : '#d2e3fc'}` : '1px solid transparent',
                  color: activeNav === 'drive-settings' ? (isDark ? '#93bbfb' : '#1a73e8') : textColor,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s ease',
                  marginTop: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AiOutlineGoogle style={{ fontSize: 18, color: '#4285F4' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: activeNav === 'drive-settings' ? 700 : 600 }}>
                      Google Drive
                    </div>
                    <div style={{ fontSize: 10, color: mutedColor }}>
                      Arsip OCR &amp; Folder Target
                    </div>
                  </div>
                </div>
                <div>
                  <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 4px' }}>Drive</Tag>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Architecture Status Card / Toggle Button */}
      {isCollapsed ? (
        <div style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, borderTop: `1px solid ${borderColor}`, flexShrink: 0 }}>
          <Tooltip placement="right" title="Buka Sidebar penuh">
            <button
              onClick={onToggleCollapse}
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                border: `1px solid ${borderColor}`,
                backgroundColor: isDark ? '#1e293b' : '#f8fafc',
                color: textColor,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AiOutlineMenuUnfold style={{ fontSize: 18 }} />
            </button>
          </Tooltip>

          <Tooltip placement="right" title="Cron 30m • PostgreSQL / RAM">
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 6px #10b981',
              }}
            />
          </Tooltip>
        </div>
      ) : (
        <div
          style={{
            margin: 12,
            padding: 12,
            borderRadius: 10,
            backgroundColor: isDark ? '#1e293b' : '#f8fafc',
            border: `1px solid ${borderColor}`,
            fontSize: 11,
            flexShrink: 0,
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
              <span>Integrasi:</span>
              <span style={{ color: '#0284c7', fontWeight: 600 }}>Purchasing • Whs • Fin</span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
