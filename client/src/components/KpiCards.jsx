import React from 'react';
import { Tooltip } from 'antd';
import {
  AiOutlineTable,
  AiOutlineDollar,
  AiOutlineClockCircle,
  AiOutlineCheckCircle,
  AiOutlineRise,
  AiOutlineFall,
} from 'react-icons/ai';

export default function KpiCards({
  stats,
  isDark,
  kurs,
  onRefreshKurs,
  isRefreshingKurs,
  onStatusFilterChange,
  activeStatusFilter,
}) {
  const formatRupiah = (val) => {
    return 'Rp ' + Number(val || 0).toLocaleString('id-ID');
  };

  const cardBg = isDark ? '#0f172a' : '#ffffff';
  const borderColor = isDark ? '#1e293b' : '#e2e8f0';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';

  const kursData = kurs || stats?.kursUsd;
  const isUp = kursData?.trend === 'up';
  const isDown = kursData?.trend === 'down';
  const kursTrendColor = isUp ? '#10b981' : isDown ? '#ef4444' : '#64748b';

  const cards = [
    {
      title: 'TOTAL BARIS PO (2026)',
      mainVal: `${stats?.totalRows || 0} Baris`,
      subVal: `${stats?.totalPOs || 0} Dokumen PO`,
      subColor: '#059669',
      note: 'Kolom A s/d W (23 Atribut)',
      icon: <AiOutlineTable style={{ fontSize: 22, color: '#059669' }} />,
      iconBg: isDark ? 'rgba(5, 150, 105, 0.2)' : '#ecfdf5',
      filterTarget: 'ALL',
      actionHint: 'Tampilkan Semua Data',
    },
    {
      title: 'TOTAL NILAI PO AKTIF',
      mainVal: formatRupiah(stats?.totalActiveSum || 0),
      subVal: 'Exclude Cancelled',
      subColor: '#2563eb',
      note: 'Akumulasi Nilai PO 2026',
      icon: <AiOutlineDollar style={{ fontSize: 22, color: '#2563eb' }} />,
      iconBg: isDark ? 'rgba(37, 99, 235, 0.2)' : '#eff6ff',
      filterTarget: 'ALL',
    },
    {
      title: 'STATUS OPEN & PENDING',
      mainVal: `${(stats?.countOpen || 0) + (stats?.countPending || 0)} Item`,
      subVal: `${stats?.countOpen || 0} Open • ${stats?.countPending || 0} Pending`,
      subColor: '#d97706',
      note: 'Klik untuk filter Open',
      icon: <AiOutlineClockCircle style={{ fontSize: 22, color: '#d97706' }} />,
      iconBg: isDark ? 'rgba(217, 119, 6, 0.2)' : '#fffbeb',
      filterTarget: 'Open',
      actionHint: 'Filter Status Open',
    },
    {
      title: 'SELESAI (CLOSE / LUNAS)',
      mainVal: `${stats?.countClose || 0} Item`,
      subVal: `${stats?.countCancelled || 0} Cancelled`,
      subColor: '#059669',
      note: 'Klik untuk filter Close',
      icon: <AiOutlineCheckCircle style={{ fontSize: 22, color: '#059669' }} />,
      iconBg: isDark ? 'rgba(5, 150, 105, 0.2)' : '#ecfdf5',
      filterTarget: 'Close',
      actionHint: 'Filter Status Close',
    },
    {
      title: 'KURS TENGAH BI (USD)',
      mainVal: kursData?.kursTengah ? `Rp ${kursData.kursTengah}` : 'Memuat...',
      subVal: kursData ? (
        isUp ? `▲ +${kursData.selisih || '0,00'} • Jual ${kursData.kursJual || '-'}` :
        isDown ? `▼ -${kursData.selisih || '0,00'} • Jual ${kursData.kursJual || '-'}` :
        `— ${kursData.selisih || '0,00'} • Jual ${kursData.kursJual || '-'}`
      ) : 'Bank Indonesia',
      subColor: kursTrendColor,
      note: `Dolar AS • ${kursData?.tanggal || 'Ortax Data Center'}`,
      icon: isDown ? (
        <AiOutlineFall style={{ fontSize: 22, color: '#ef4444' }} />
      ) : (
        <AiOutlineRise style={{ fontSize: 22, color: isUp ? '#10b981' : '#0284c7' }} />
      ),
      iconBg: isDark
        ? (isUp ? 'rgba(16, 185, 129, 0.2)' : isDown ? 'rgba(239, 68, 68, 0.2)' : 'rgba(2, 132, 199, 0.2)')
        : (isUp ? '#ecfdf5' : isDown ? '#fef2f2' : '#f0f9ff'),
      tooltip: kursData
        ? `Kurs Transaksi BI (${kursData.tanggal})\nTengah: Rp ${kursData.kursTengah}\nJual: Rp ${kursData.kursJual}\nBeli: Rp ${kursData.kursBeli}\n(Klik untuk perbarui)`
        : 'Klik untuk perbarui data kurs...',
      onClick: onRefreshKurs,
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 14,
        flexShrink: 0,
      }}
    >
      {cards.map((c, idx) => {
        const isFilterActive = c.filterTarget && activeStatusFilter === c.filterTarget;
        const isClickable = Boolean(c.filterTarget || c.onClick);

        const handleClick = () => {
          if (c.onClick) {
            c.onClick();
          } else if (c.filterTarget && onStatusFilterChange) {
            onStatusFilterChange(c.filterTarget);
          }
        };

        const cardElement = (
          <div
            key={idx}
            onClick={handleClick}
            style={{
              backgroundColor: cardBg,
              borderRadius: 12,
              border: isFilterActive
                ? `2px solid ${c.subColor}`
                : `1px solid ${borderColor}`,
              padding: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: isFilterActive
                ? `0 4px 12px ${c.subColor}25`
                : '0 1px 3px rgba(0,0,0,0.03)',
              cursor: isClickable ? 'pointer' : 'default',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              position: 'relative',
              overflow: 'hidden',
            }}
            onMouseEnter={(e) => {
              if (isClickable && !isFilterActive) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.08)';
              }
            }}
            onMouseLeave={(e) => {
              if (isClickable && !isFilterActive) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';
              }
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: mutedColor,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {c.title}
                {isFilterActive && (
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: c.subColor,
                      display: 'inline-block',
                    }}
                  />
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: textColor,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {c.mainVal}
                </span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: c.subColor, marginTop: 2 }}>
                {c.subVal}
              </div>
              <div style={{ fontSize: 10, color: mutedColor, marginTop: 2 }}>
                {c.note}
              </div>
            </div>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: c.iconBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {c.icon}
            </div>
          </div>
        );

        const tooltipContent = c.tooltip || (c.actionHint ? `${c.actionHint} (Klik)` : null);

        return tooltipContent ? (
          <Tooltip key={idx} title={<div style={{ whiteSpace: 'pre-line' }}>{tooltipContent}</div>}>
            {cardElement}
          </Tooltip>
        ) : (
          cardElement
        );
      })}
    </div>
  );
}
