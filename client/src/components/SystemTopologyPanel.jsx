import React, { useState } from 'react';
import { Card, Tag, Button, Input, message, Alert } from 'antd';
import {
  AiOutlineCluster,
  AiOutlineSend,
  AiOutlineSync,
  AiOutlineCheckCircle,
  AiOutlineCloudServer,
  AiOutlineDatabase,
  AiOutlineApi,
} from 'react-icons/ai';
import { sendTestWhatsApp, triggerSync } from '../services/api';

export default function SystemTopologyPanel({ stats, onRefresh, isDark }) {
  const [chatId, setChatId] = useState('');
  const [testMessage, setTestMessage] = useState('Halo! Ini pesan tes integrasi Bot PO WhatsApp x Google Sheets.');
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleSendTestWa = async () => {
    if (!chatId.trim()) {
      message.warning('Masukkan nomor WhatsApp (contoh: 628123456789@c.us).');
      return;
    }
    setSending(true);
    try {
      let target = chatId.trim();
      if (!target.includes('@')) {
        target = `${target.replace(/[^0-9]/g, '')}@c.us`;
      }
      await sendTestWhatsApp(target, testMessage);
      message.success(`Pesan berhasil dikirim via OpenWA ke ${target}!`);
    } catch (err) {
      message.error(`Gagal kirim pesan WhatsApp: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const res = await triggerSync();
      message.success(`Sinkronisasi selesai! ${res.result?.totalMaterials} Material & ${res.result?.totalSuppliers} Supplier diperbarui.`);
      if (onRefresh) onRefresh();
    } catch (err) {
      message.error(`Gagal sync: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const cardBg = isDark ? '#0f172a' : '#ffffff';
  const borderColor = isDark ? '#1e293b' : '#e2e8f0';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
      {/* Top Topology Status Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        {/* OpenWA Gateway */}
        <div
          style={{
            backgroundColor: cardBg,
            borderRadius: 12,
            border: `1px solid ${borderColor}`,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, color: textColor, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AiOutlineApi style={{ color: '#059669', fontSize: 16 }} /> 1. OpenWA Gateway
            </span>
            <Tag color="success">ONLINE</Tag>
          </div>
          <div style={{ fontSize: 11, color: mutedColor, fontFamily: 'monospace' }}>
            Host: https://openwa.ebite.biz.id
          </div>
          <div style={{ fontSize: 11, color: textColor }}>
            Session ID: <code>997f4002-105</code>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: mutedColor }}>
            Menerima webhook pesan masuk, foto dokumen &amp; PDF via <code>POST /webhook</code>.
          </p>
        </div>

        {/* Google Sheets API v4 */}
        <div
          style={{
            backgroundColor: cardBg,
            borderRadius: 12,
            border: `1px solid ${borderColor}`,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, color: textColor, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AiOutlineCloudServer style={{ color: '#2563eb', fontSize: 16 }} /> 2. Google Sheets API v4
            </span>
            <Tag color="blue">CONNECTED</Tag>
          </div>
          <div style={{ fontSize: 11, color: mutedColor, fontFamily: 'monospace' }}>
            ID: 15n9joeQAoic8FvP5V_-bChqjHKjFeMG0WGHzQ4xHGPk
          </div>
          <div style={{ fontSize: 11, color: textColor }}>
            OAuth2 Token: <code>token.json (Active)</code>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: mutedColor }}>
            Penyimpanan utama transaksi PO 2026, database Material, dan database Supplier Material.
          </p>
        </div>

        {/* Database & Cache */}
        <div
          style={{
            backgroundColor: cardBg,
            borderRadius: 12,
            border: `1px solid ${borderColor}`,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, color: textColor, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AiOutlineDatabase style={{ color: '#7c3aed', fontSize: 16 }} /> 3. Database &amp; Cache
            </span>
            <Tag color="purple">HYBRID</Tag>
          </div>
          <div style={{ fontSize: 11, color: mutedColor }}>
            Mode: PostgreSQL VPS Cache + In-Memory Fuse.js
          </div>
          <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
            Query Speed: &lt;5ms response time
          </div>
          <p style={{ margin: 0, fontSize: 11, color: mutedColor }}>
            Mempercepat pencarian fuzzy ribuan material tanpa jeda kuota API.
          </p>
        </div>

        {/* Cron Job */}
        <div
          style={{
            backgroundColor: cardBg,
            borderRadius: 12,
            border: `1px solid ${borderColor}`,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, color: textColor, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AiOutlineSync style={{ color: '#d97706', fontSize: 16 }} /> 4. Cron Auto-Sync
            </span>
            <Tag color="orange">CRON 30M</Tag>
          </div>
          <div style={{ fontSize: 11, color: mutedColor }}>
            Jadwal: Setiap 30 Menit (Auto-Fetch)
          </div>
          <Button
            size="small"
            type="primary"
            icon={<AiOutlineSync style={{ animation: syncing ? 'antRotate 1s infinite linear' : 'none' }} />}
            loading={syncing}
            onClick={handleManualSync}
            style={{ marginTop: 4, borderRadius: 6, backgroundColor: '#047857', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            Sinkronkan Sekarang
          </Button>
        </div>
      </div>

      {/* WhatsApp Interactive Test Box */}
      <div
        style={{
          backgroundColor: cardBg,
          borderRadius: 12,
          border: `1px solid ${borderColor}`,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: textColor }}>
            📲 WhatsApp Direct Test Notification
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 12, color: mutedColor }}>
            Uji kirim pesan instan langsung dari dashboard ke WhatsApp penerima via OpenWA Gateway.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 140px', gap: 10, alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: mutedColor, display: 'block', marginBottom: 4 }}>
              Nomor WhatsApp Penerima
            </label>
            <Input
              placeholder="Contoh: 6281234567890"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: mutedColor, display: 'block', marginBottom: 4 }}>
              Isi Pesan
            </label>
            <Input
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%' }}>
            <Button
              type="primary"
              icon={<AiOutlineSend />}
              loading={sending}
              onClick={handleSendTestWa}
              style={{
                width: '100%',
                backgroundColor: '#047857',
                borderColor: '#047857',
                fontWeight: 600,
                borderRadius: 8,
                marginTop: 20,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              Kirim Pesan
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
