import React, { useState } from 'react';
import { Popover, Button, Tag, Divider, Spin } from 'antd';
import {
  AiOutlineArrowUp,
  AiOutlineArrowDown,
  AiOutlineMinus,
  AiOutlineSync,
  AiOutlineGlobal,
} from 'react-icons/ai';

export default function UsdRateTicker({
  kurs,
  loading = false,
  onRefresh,
  isDark = false,
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const isUp = kurs?.trend === 'up';
  const isDown = kurs?.trend === 'down';

  const trendColor = isUp ? '#10b981' : isDown ? '#ef4444' : '#64748b';
  const trendBg = isUp
    ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5')
    : isDown
    ? (isDark ? 'rgba(239, 68, 68, 0.15)' : '#fef2f2')
    : (isDark ? 'rgba(100, 116, 139, 0.15)' : '#f1f5f9');

  const pillBg = isDark ? '#1e293b' : '#f8fafc';
  const pillBorder = isDark ? '#334155' : '#e2e8f0';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';

  const popoverContent = (
    <div style={{ width: 280, padding: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 16 }}>🇺🇸</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: textColor }}>
            USD — Dolar AS
          </span>
        </div>
        <Tag color={isUp ? 'green' : isDown ? 'red' : 'default'} style={{ margin: 0, fontSize: 11, fontWeight: 600 }}>
          {isUp ? '▲ NAIK' : isDown ? '▼ TURUN' : '— STABIL'}
        </Tag>
      </div>

      <div style={{ fontSize: 11, color: mutedColor, marginBottom: 12 }}>
        Sumber: <b>Bank Indonesia</b> via Ortax Data Center
        <br />
        Tanggal Berlaku: <b style={{ color: textColor }}>{kurs?.tanggal || '-'}</b>
      </div>

      <div
        style={{
          backgroundColor: isDark ? '#0f172a' : '#f8fafc',
          borderRadius: 8,
          border: `1px solid ${pillBorder}`,
          padding: '10px 12px',
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 11, color: mutedColor, marginBottom: 2 }}>KURS TENGAH (ACUAN)</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: textColor,
              fontFamily: 'monospace',
              letterSpacing: '-0.5px',
            }}
          >
            Rp {kurs?.kursTengah || '0,00'}
          </span>
          {kurs?.selisih && kurs?.selisih !== '0,00' && (
            <span style={{ fontSize: 11, fontWeight: 700, color: trendColor }}>
              {isUp ? `+${kurs.selisih}` : isDown ? `-${kurs.selisih}` : kurs.selisih}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 6,
            backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : '#fff5f5',
            border: `1px solid ${isDark ? 'rgba(239,68,68,0.2)' : '#fed7d7'}`,
          }}
        >
          <div style={{ fontSize: 10, color: mutedColor, fontWeight: 600 }}>KURS JUAL</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: textColor, fontFamily: 'monospace', marginTop: 2 }}>
            Rp {kurs?.kursJual || '-'}
          </div>
        </div>

        <div
          style={{
            padding: '8px 10px',
            borderRadius: 6,
            backgroundColor: isDark ? 'rgba(16,185,129,0.08)' : '#f0fdf4',
            border: `1px solid ${isDark ? 'rgba(16,185,129,0.2)' : '#bbf7d0'}`,
          }}
        >
          <div style={{ fontSize: 10, color: mutedColor, fontWeight: 600 }}>KURS BELI</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: textColor, fontFamily: 'monospace', marginTop: 2 }}>
            Rp {kurs?.kursBeli || '-'}
          </div>
        </div>
      </div>

      {kurs?.trendText && (
        <div
          style={{
            fontSize: 10,
            color: mutedColor,
            fontStyle: 'italic',
            marginBottom: 10,
            lineHeight: 1.4,
          }}
        >
          ℹ️ {kurs.trendText}
        </div>
      )}

      <Divider style={{ margin: '8px 0' }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <Button
          size="small"
          type="text"
          icon={<AiOutlineGlobal />}
          href="https://datacenter.ortax.org/ortax/kursbi/list"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, padding: '0 6px', color: '#2563eb' }}
        >
          Buka Ortax ↗
        </Button>

        <Button
          size="small"
          type="primary"
          icon={<AiOutlineSync style={{ animation: loading ? 'antRotate 1s infinite linear' : 'none' }} />}
          loading={loading}
          onClick={async () => {
            if (onRefresh) await onRefresh();
          }}
          style={{
            fontSize: 11,
            borderRadius: 6,
            backgroundColor: '#047857',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          Refresh Kurs
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      content={popoverContent}
      title={null}
      trigger="click"
      open={popoverOpen}
      onOpenChange={setPopoverOpen}
      placement="bottom"
      overlayInnerStyle={{
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        border: `1px solid ${pillBorder}`,
        borderRadius: 12,
        boxShadow: isDark
          ? '0 10px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5)'
          : '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
      }}
    >
      <div
        role="button"
        tabIndex={0}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          backgroundColor: pillBg,
          border: `1px solid ${pillBorder}`,
          borderRadius: 20,
          padding: '4px 10px 4px 8px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: isDark
            ? '0 1px 3px rgba(0,0,0,0.2)'
            : '0 1px 2px rgba(0,0,0,0.03)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = isUp ? '#10b981' : isDown ? '#ef4444' : '#3b82f6';
          e.currentTarget.style.boxShadow = isDark
            ? '0 2px 8px rgba(0,0,0,0.3)'
            : '0 2px 8px rgba(0,0,0,0.06)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = pillBorder;
          e.currentTarget.style.boxShadow = isDark
            ? '0 1px 3px rgba(0,0,0,0.2)'
            : '0 1px 2px rgba(0,0,0,0.03)';
        }}
      >
        {/* Flag & Currency Tag */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 14, lineHeight: 1 }}>🇺🇸</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.04em',
              color: '#2563eb',
              backgroundColor: isDark ? 'rgba(37,99,235,0.2)' : '#eff6ff',
              padding: '1px 5px',
              borderRadius: 4,
            }}
          >
            USD/IDR
          </span>
        </div>

        {/* Value */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 11, color: mutedColor, fontWeight: 500 }}>
            Kurs Tengah:
          </span>
          {loading && !kurs ? (
            <Spin size="small" />
          ) : (
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: textColor,
                fontFamily: 'monospace',
              }}
            >
              Rp {kurs?.kursTengah || '—'}
            </span>
          )}
        </div>

        {/* Trend Indicator Pill */}
        {kurs && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              fontSize: 10,
              fontWeight: 700,
              color: trendColor,
              backgroundColor: trendBg,
              padding: '1px 6px',
              borderRadius: 10,
              fontFamily: 'monospace',
            }}
          >
            {isUp ? (
              <AiOutlineArrowUp style={{ fontSize: 10 }} />
            ) : isDown ? (
              <AiOutlineArrowDown style={{ fontSize: 10 }} />
            ) : (
              <AiOutlineMinus style={{ fontSize: 9 }} />
            )}
            {kurs.selisih && kurs.selisih !== '0,00' ? kurs.selisih : '0,00'}
          </span>
        )}
      </div>
    </Popover>
  );
}
