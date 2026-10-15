import React from 'react';
import { Modal, Button, Input, Select, message, Tag } from 'antd';
import { Formik } from 'formik';
import * as Yup from 'yup';

const EditSchema = Yup.object().shape({
  status: Yup.string().required('Status wajib dipilih'),
});

export default function EditPoModal({ visible, poRow, onCancel, onSuccess, isDark }) {
  if (!poRow) return null;

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Perbarui Transaksi: PO {poRow.noPo}</span>
          <Tag color="blue">{poRow.supplier}</Tag>
        </div>
      }
      open={visible}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
      width={560}
    >
      <Formik
        initialValues={{
          status: poRow.status || 'Open',
          grpo: poRow.grpo || '',
          lastGrpoDate: poRow.lastGrpoDate || '',
          tglBayar: poRow.tglBayar || '',
          noInvoice: poRow.noInvoice || '',
          tglInvoice: poRow.tglInvoice || '',
          ket: poRow.ket || '',
        }}
        validationSchema={EditSchema}
        onSubmit={async (values, { setSubmitting }) => {
          try {
            await onSuccess(poRow.noPo, values);
            message.success(`Status PO ${poRow.noPo} berhasil diperbarui di Google Sheets!`);
            onCancel();
          } catch (err) {
            message.error(`Gagal update: ${err.message}`);
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {({ values, errors, touched, handleChange, handleBlur, handleSubmit, setFieldValue, isSubmitting }) => (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Status Transaksi PO <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <Select
                value={values.status}
                onChange={(val) => setFieldValue('status', val)}
                style={{ width: '100%' }}
                options={[
                  { value: 'Open', label: 'Open (Dalam Proses Order)' },
                  { value: 'Close', label: 'Close (Selesai Terima & Lunas)' },
                  { value: 'Pending', label: 'Pending (Menunggu Gudang / Finance)' },
                  { value: 'Cancelled', label: 'Cancelled (Dibatalkan)' },
                ]}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  No. GRPO Gudang
                </label>
                <Input
                  name="grpo"
                  placeholder="2600055"
                  value={values.grpo}
                  onChange={handleChange}
                  onBlur={handleBlur}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Tgl Selesai GRPO
                </label>
                <Input
                  name="lastGrpoDate"
                  placeholder="DD/MM/YYYY"
                  value={values.lastGrpoDate}
                  onChange={handleChange}
                  onBlur={handleBlur}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  No. Invoice Vendor
                </label>
                <Input
                  name="noInvoice"
                  placeholder="INV-2026/089"
                  value={values.noInvoice}
                  onChange={handleChange}
                  onBlur={handleBlur}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Tanggal Bayar (Finance)
                </label>
                <Input
                  name="tglBayar"
                  placeholder="DD/MM/YYYY"
                  value={values.tglBayar}
                  onChange={handleChange}
                  onBlur={handleBlur}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Catatan Operasional (Kolom W - KET)
              </label>
              <Input.TextArea
                name="ket"
                rows={3}
                placeholder="Catatan penerimaan, kendala, atau keterangan khusus..."
                value={values.ket}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button onClick={onCancel}>Batal</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={isSubmitting}
                style={{ backgroundColor: '#2563eb' }}
              >
                Simpan Perubahan
              </Button>
            </div>
          </form>
        )}
      </Formik>
    </Modal>
  );
}
