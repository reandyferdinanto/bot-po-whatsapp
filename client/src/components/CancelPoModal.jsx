import React, { useState } from 'react';
import { Modal, Button, Input, message } from 'antd';
import { AiOutlineExclamationCircle } from 'react-icons/ai';

export default function CancelPoModal({ visible, poRow, onCancel, onSuccess }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  if (!poRow) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onSuccess(poRow.noPo, reason || 'Dibatalkan oleh Pengguna Dashboard');
      message.success(`PO ${poRow.noPo} berhasil dibatalkan (Soft Delete).`);
      setReason('');
      onCancel();
    } catch (err) {
      message.error(`Gagal membatalkan PO: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444' }}>
          <AiOutlineExclamationCircle style={{ fontSize: 18 }} />
          <span style={{ fontWeight: 700 }}>Batalkan Transaksi: PO {poRow.noPo}</span>
        </div>
      }
      open={visible}
      onCancel={onCancel}
      footer={[
        <Button key="back" onClick={onCancel} className="smooth-clickable">
          Batal
        </Button>,
        <Button key="submit" type="primary" danger loading={loading} onClick={handleConfirm} className="smooth-clickable">
          Ya, Batalkan PO
        </Button>,
      ]}
      destroyOnHidden
      width={460}
    >
      <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6 }}>
        <p>
          Anda akan mengubah status PO <strong>{poRow.noPo}</strong> ({poRow.supplier}) menjadi <strong>Cancelled</strong> pada sheet 'PO 2026'.
        </p>
        <p style={{ color: '#6b7280', fontSize: 12 }}>
          Baris data tetap tersimpan untuk audit trail dan nilai totalnya dikecualikan dari akumulasi aktif.
        </p>

        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginTop: 12, marginBottom: 4 }}>
          Alasan Pembatalan (Opsional):
        </label>
        <Input.TextArea
          rows={3}
          placeholder="Contoh: Salah jumlah order / pesanan dibatalkan supplier..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </Modal>
  );
}
