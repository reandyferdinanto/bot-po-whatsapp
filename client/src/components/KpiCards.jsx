import React from 'react';
import {
  AiOutlineTable,
  AiOutlineDollar,
  AiOutlineClockCircle,
  AiOutlineCheckCircle,
} from 'react-icons/ai';

export default function KpiCards({ stats, isDark }) {
  const formatRupiah = (val) => {
    return 'Rp ' + Number(val || 0).toLocaleString('id-ID');
  };

  const cardBg = isDark ? '#0f172a' : '#ffffff';
  const borderColor = isDark ? '#1e293b' : '#e2e8f0';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';

  const cards = [
    {
      title: 'TOTAL BARIS PO (2026)',
      mainVal: `${stats?.totalRows || 0} Baris`,
      subVal: `${stats?.totalPOs || 0} Dokumen PO`,
      subColor: '#059669',
      note: 'Kolom A s/d W (23 Atribut)',
      icon: <AiOutlineTable style={{ fontSize: 22, color: '#059669' }} />,
      iconBg: isDark ? 'rgba(5, 150, 105, 0.2)' : '#ecfdf5',
    },
    {
      title: 'TOTAL NILAI PO AKTIF',
      mainVal: formatRupiah(stats?.totalActiveSum || 0),
      subVal: 'Exclude Cancelled',
      subColor: '#2563eb',
      note: 'Akumulasi Kolom Q (Exclude Cancelled)',
      icon: <AiOutlineDollar style={{ fontSize: 22, color: '#2563eb' }} />,
      iconBg: isDark ? 'rgba(37, 99, 235, 0.2)' : '#eff6ff',
    },
    {
      title: 'STATUS OPEN & PENDING',
      mainVal: `${(stats?.countOpen || 0) + (stats?.countPending || 0)} Item`,
      subVal: `${stats?.countOpen || 0} Open • ${stats?.countPending || 0} Pending`,
      subColor: '#d97706',
      note: 'Menunggu GRPO / Bayar',
      icon: <AiOutlineClockCircle style={{ fontSize: 22, color: '#d97706' }} />,
      iconBg: isDark ? 'rgba(217, 119, 6, 0.2)' : '#fffbeb',
    },
    {
      title: 'SELESAI (CLOSE / LUNAS)',
      mainVal: `${stats?.countClose || 0} Item`,
      subVal: `${stats?.countCancelled || 0} Cancelled`,
      subColor: '#7c3aed',
      note: 'GRPO & Bayar Terisi',
      icon: <AiOutlineCheckCircle style={{ fontSize: 22, color: '#7c3aed' }} />,
      iconBg: isDark ? 'rgba(124, 58, 237, 0.2)' : '#f5f3ff',
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 14,
        flexShrink: 0,
      }}
    >
      {cards.map((c, idx) => (
        <div
          key={idx}
          style={{
            backgroundColor: cardBg,
            borderRadius: 12,
            border: `1px solid ${borderColor}`,
            padding: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
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
              }}
            >
              {c.title}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: textColor, fontFamily: 'monospace' }}>
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
            }}
          >
            {c.icon}
          </div>
        </div>
      ))}
    </div>
  );
}
