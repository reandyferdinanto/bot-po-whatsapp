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
    finance: true,
  });

  const toggleSection = (key) => {
    setExpandedSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const bgColor = isDark ? '#071f24' : '#ffffff';
  const borderColor = isDark ? '#133e46' : '#e0e5e9';
  const textColor = isDark ? '#fbfcfc' : '#055b65';
  const mutedColor = isDark ? '#8ea8ab' : '#5c7e84';

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

  // Submenu Finance: Kasbon & Kas Kecil
  const financeSubItems = [
    {
      key: 'finance-kasbon',
      path: '/finance/kasbon',
      label: 'Kasbon',
      icon: <AiOutlineDollar style={{ fontSize: 15 }} />,
      badge: <Tag color="orange" style={{ margin: 0, fontWeight: 700, fontSize: 10 }}>Kasbon</Tag>,
      sub: 'Form Permintaan & Nota',
    },
    {
      key: 'finance-kaskecil',
      path: '/finance/kas-kecil',
      label: 'Kas Kecil (Petty Cash)',
      icon: <AiOutlineFileText style={{ fontSize: 15 }} />,
      badge: <Tag color="cyan" style={{ margin: 0, fontWeight: 700, fontSize: 10 }}>12 Bln</Tag>,
      sub: 'Buku Kas & Draft Voucher',
    },
  ];

  // Standalone Main Menus
  const standaloneWarehouse = {
    key: 'warehouse',
    path: '/warehouse',
    label: 'Warehouse',
    sub: 'Penerimaan & Stok Fisik',
    icon: <AiOutlineInbox style={{ fontSize: 18, color: '#059669' }} />,
    badge: <Tag color="default" style={{ margin: 0, fontSize: 10 }}>Update</Tag>,
  };

  const standaloneMaintenance = {
    key: 'maintenance',
    path: '/maintenance',
    label: 'Maintenance',
    sub: 'Permintaan Sparepart',
    icon: <AiOutlineTool style={{ fontSize: 18, color: '#0d9488' }} />,
    badge: <Tag color="default" style={{ margin: 0, fontSize: 10 }}>Update</Tag>,
  };

  // Helper active status
  const isOcrActive = activeNav === 'multi-ocr' || activeNav?.startsWith('ocr-');
  const isPurchasingActive = ['po2026', 'material', 'supplier', 'analytics'].includes(activeNav);
  const isFinanceActive = activeNav === 'finance' || activeNav === 'finance-kasbon' || activeNav === 'finance-kaskecil';

  return (
    <aside
      style={{
        width: isCollapsed ? 72 : 270,
        transition: 'width 0.22s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease-out, border-color 0.2s ease-out',
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
                backgroundColor: '#055b65',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 2px 6px rgba(5,91,101,0.3)',
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
                    backgroundColor: isOcrActive ? (isDark ? 'rgba(69, 130, 139, 0.25)' : 'rgba(178, 201, 197, 0.3)') : 'transparent',
                    color: isOcrActive ? (isDark ? '#1bd488' : '#055b65') : textColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: isOcrActive ? `1px solid ${isDark ? 'rgba(27, 212, 136, 0.4)' : '#b2c9c5'}` : '1px solid transparent',
                  }}
                >
                  <AiOutlineScan style={{ fontSize: 18, color: isOcrActive ? (isDark ? '#1bd488' : '#055b65') : '#45828b' }} />
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
                    backgroundColor: isOcrActive ? (isDark ? 'rgba(69, 130, 139, 0.2)' : 'rgba(178, 201, 197, 0.25)') : 'transparent',
                    border: isOcrActive ? `1px solid ${isDark ? 'rgba(27, 212, 136, 0.35)' : '#b2c9c5'}` : '1px solid transparent',
                    color: isOcrActive ? (isDark ? '#1bd488' : '#055b65') : textColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AiOutlineScan style={{ fontSize: 18, color: isOcrActive ? (isDark ? '#1bd488' : '#055b65') : '#45828b' }} />
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
                    backgroundColor: isPurchasingActive ? (isDark ? 'rgba(27, 212, 136, 0.22)' : 'rgba(27, 212, 136, 0.12)') : 'transparent',
                    color: isPurchasingActive ? (isDark ? '#1bd488' : '#055b65') : textColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: isPurchasingActive ? `1px solid ${isDark ? 'rgba(27, 212, 136, 0.4)' : '#b2c9c5'}` : '1px solid transparent',
                  }}
                >
                  <AiOutlineShopping style={{ fontSize: 18, color: isPurchasingActive ? (isDark ? '#1bd488' : '#055b65') : '#45828b' }} />
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
                    backgroundColor: isPurchasingActive ? (isDark ? 'rgba(27, 212, 136, 0.18)' : 'rgba(27, 212, 136, 0.12)') : 'transparent',
                    border: isPurchasingActive ? `1px solid ${isDark ? 'rgba(27, 212, 136, 0.4)' : '#b2c9c5'}` : '1px solid transparent',
                    color: isPurchasingActive ? (isDark ? '#1bd488' : '#055b65') : textColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AiOutlineShopping style={{ fontSize: 18, color: isPurchasingActive ? (isDark ? '#1bd488' : '#055b65') : '#055b65' }} />
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
                            color: active ? (isDark ? '#1bd488' : '#055b65') : textColor,
                            backgroundColor: active ? (isDark ? 'rgba(27, 212, 136, 0.2)' : 'rgba(178, 201, 197, 0.35)') : 'transparent',
                            fontWeight: active ? 700 : 500,
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            if (!active) e.currentTarget.style.backgroundColor = isDark ? '#0a252a' : '#f2f6f7';
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
          {/* 3. MENU UTAMA: WAREHOUSE (STANDALONE)                          */}
          {/* ============================================================== */}
          <div>
            {isCollapsed ? (
              <Tooltip placement="right" title={`${standaloneWarehouse.label} (${standaloneWarehouse.sub})`}>
                <div
                  onClick={() => onNavigate && onNavigate(standaloneWarehouse.path)}
                  style={{
                    padding: '10px 0',
                    borderRadius: 10,
                    backgroundColor: activeNav === 'warehouse' ? (isDark ? 'rgba(27, 212, 136, 0.2)' : 'rgba(27, 212, 136, 0.12)') : 'transparent',
                    border: activeNav === 'warehouse' ? `1px solid ${isDark ? 'rgba(27, 212, 136, 0.4)' : '#b2c9c5'}` : '1px solid transparent',
                    color: activeNav === 'warehouse' ? (isDark ? '#1bd488' : '#055b65') : textColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {standaloneWarehouse.icon}
                </div>
              </Tooltip>
            ) : (
              <div
                onClick={() => onNavigate && onNavigate(standaloneWarehouse.path)}
                style={{
                  padding: '9px 12px',
                  borderRadius: 10,
                  backgroundColor: activeNav === 'warehouse' ? (isDark ? 'rgba(27, 212, 136, 0.2)' : 'rgba(27, 212, 136, 0.12)') : 'transparent',
                  border: activeNav === 'warehouse' ? `1px solid ${isDark ? 'rgba(27, 212, 136, 0.4)' : '#b2c9c5'}` : '1px solid transparent',
                  color: activeNav === 'warehouse' ? (isDark ? '#1bd488' : '#055b65') : textColor,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {standaloneWarehouse.icon}
                  </div>
                  <div style={{ whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 13, fontWeight: activeNav === 'warehouse' ? 700 : 600 }}>
                      {standaloneWarehouse.label}
                    </div>
                    <div style={{ fontSize: 10, color: mutedColor }}>{standaloneWarehouse.sub}</div>
                  </div>
                </div>
                <div>{standaloneWarehouse.badge}</div>
              </div>
            )}
          </div>

          {/* ============================================================== */}
          {/* 4. MENU UTAMA: FINANCE (DENGAN 2 SUBMENU: KASBON & KAS KECIL)  */}
          {/* ============================================================== */}
          <div>
            {isCollapsed ? (
              <Tooltip placement="right" title="Finance (Kasbon & Kas Kecil 12 Bulan)">
                <div
                  onClick={() => onNavigate && onNavigate('/finance/kasbon')}
                  style={{
                    padding: '10px 0',
                    borderRadius: 10,
                    backgroundColor: isFinanceActive ? (isDark ? 'rgba(69, 130, 139, 0.25)' : 'rgba(178, 201, 197, 0.3)') : 'transparent',
                    color: isFinanceActive ? (isDark ? '#1bd488' : '#055b65') : textColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: isFinanceActive ? `1px solid ${isDark ? 'rgba(27, 212, 136, 0.4)' : '#b2c9c5'}` : '1px solid transparent',
                  }}
                >
                  <AiOutlineDollar style={{ fontSize: 18, color: isFinanceActive ? (isDark ? '#1bd488' : '#055b65') : '#45828b' }} />
                </div>
              </Tooltip>
            ) : (
              <div>
                <div
                  onClick={() => {
                    toggleSection('finance');
                    onNavigate && onNavigate('/finance/kasbon');
                  }}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 10,
                    backgroundColor: isFinanceActive ? (isDark ? 'rgba(69, 130, 139, 0.2)' : 'rgba(178, 201, 197, 0.25)') : 'transparent',
                    border: isFinanceActive ? `1px solid ${isDark ? 'rgba(27, 212, 136, 0.35)' : '#b2c9c5'}` : '1px solid transparent',
                    color: isFinanceActive ? (isDark ? '#1bd488' : '#055b65') : textColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AiOutlineDollar style={{ fontSize: 18, color: isFinanceActive ? (isDark ? '#1bd488' : '#055b65') : '#45828b' }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        Finance
                      </div>
                      <div style={{ fontSize: 10, color: mutedColor }}>
                        Kasbon &amp; Kas Kecil
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tag color="cyan" style={{ margin: 0, fontSize: 10, fontWeight: 700 }}>2 Menu</Tag>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSection('finance');
                      }}
                      style={{ color: mutedColor, fontSize: 12, padding: '2px 4px' }}
                    >
                      {expandedSections.finance ? <AiOutlineDown /> : <AiOutlineRight />}
                    </span>
                  </div>
                </div>

                {/* Submenu Finance */}
                {expandedSections.finance && (
                  <div style={{ marginTop: 4, marginLeft: 16, paddingLeft: 12, borderLeft: `1.5px solid ${isDark ? '#133e46' : '#e0e5e9'}`, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {financeSubItems.map((sub) => {
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
                            color: active ? (isDark ? '#1bd488' : '#055b65') : textColor,
                            backgroundColor: active ? (isDark ? 'rgba(27, 212, 136, 0.2)' : 'rgba(178, 201, 197, 0.35)') : 'transparent',
                            fontWeight: active ? 700 : 500,
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            if (!active) e.currentTarget.style.backgroundColor = isDark ? '#0a252a' : '#f2f6f7';
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
          {/* 5. MENU UTAMA: MAINTENANCE (STANDALONE)                        */}
          {/* ============================================================== */}
          <div>
            {isCollapsed ? (
              <Tooltip placement="right" title={`${standaloneMaintenance.label} (${standaloneMaintenance.sub})`}>
                <div
                  onClick={() => onNavigate && onNavigate(standaloneMaintenance.path)}
                  style={{
                    padding: '10px 0',
                    borderRadius: 10,
                    backgroundColor: activeNav === 'maintenance' ? (isDark ? 'rgba(27, 212, 136, 0.2)' : 'rgba(27, 212, 136, 0.12)') : 'transparent',
                    border: activeNav === 'maintenance' ? `1px solid ${isDark ? 'rgba(27, 212, 136, 0.4)' : '#b2c9c5'}` : '1px solid transparent',
                    color: activeNav === 'maintenance' ? (isDark ? '#1bd488' : '#055b65') : textColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {standaloneMaintenance.icon}
                </div>
              </Tooltip>
            ) : (
              <div
                onClick={() => onNavigate && onNavigate(standaloneMaintenance.path)}
                style={{
                  padding: '9px 12px',
                  borderRadius: 10,
                  backgroundColor: activeNav === 'maintenance' ? (isDark ? 'rgba(27, 212, 136, 0.2)' : 'rgba(27, 212, 136, 0.12)') : 'transparent',
                  border: activeNav === 'maintenance' ? `1px solid ${isDark ? 'rgba(27, 212, 136, 0.4)' : '#b2c9c5'}` : '1px solid transparent',
                  color: activeNav === 'maintenance' ? (isDark ? '#1bd488' : '#055b65') : textColor,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {standaloneMaintenance.icon}
                  </div>
                  <div style={{ whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 13, fontWeight: activeNav === 'maintenance' ? 700 : 600 }}>
                      {standaloneMaintenance.label}
                    </div>
                    <div style={{ fontSize: 10, color: mutedColor }}>{standaloneMaintenance.sub}</div>
                  </div>
                </div>
                <div>{standaloneMaintenance.badge}</div>
              </div>
            )}
          </div>

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
                    backgroundColor: activeNav === 'topology' ? (isDark ? 'rgba(27, 212, 136, 0.25)' : 'rgba(27, 212, 136, 0.12)') : 'transparent',
                    color: activeNav === 'topology' ? (isDark ? '#1bd488' : '#055b65') : textColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: activeNav === 'topology' ? `1px solid ${isDark ? 'rgba(27, 212, 136, 0.4)' : '#b2c9c5'}` : '1px solid transparent',
                  }}
                >
                  <AiOutlineCluster style={{ fontSize: 18, color: '#1bd488' }} />
                </div>
              </Tooltip>
            ) : (
              <div
                onClick={() => onNavigate && onNavigate('/status-sistem')}
                style={{
                  padding: '9px 12px',
                  borderRadius: 10,
                  backgroundColor: activeNav === 'topology' ? (isDark ? 'rgba(27, 212, 136, 0.22)' : 'rgba(27, 212, 136, 0.12)') : 'transparent',
                  border: activeNav === 'topology' ? `1px solid ${isDark ? 'rgba(27, 212, 136, 0.4)' : '#b2c9c5'}` : '1px solid transparent',
                  color: activeNav === 'topology' ? (isDark ? '#1bd488' : '#055b65') : textColor,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s ease',
                  marginTop: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AiOutlineCluster style={{ fontSize: 18, color: '#1bd488' }} />
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
                  <span className="live-dot-green" />
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
            <span className="live-dot-green" />
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
            <span style={{ fontWeight: 'bold', color: textColor, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="live-dot-green" />
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
