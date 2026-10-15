import React, { useState } from 'react';
import { Modal, Button, Input, InputNumber, AutoComplete, Table, Space, message, Tag } from 'antd';
import { Formik, FieldArray } from 'formik';
import * as Yup from 'yup';
import { AiOutlinePlus, AiOutlineDelete, AiOutlineCalculator } from 'react-icons/ai';
import { getMaterials } from '../services/api';

const PoSchema = Yup.object().shape({
  noPo: Yup.string().trim().required('Nomor PO wajib diisi'),
  supplier: Yup.string().trim().required('Nama Supplier wajib diisi'),
  date: Yup.string().trim().required('Tanggal PO wajib diisi'),
  items: Yup.array()
    .of(
      Yup.object().shape({
        nama: Yup.string().trim().required('Nama barang wajib diisi'),
        qty: Yup.number().positive('Qty harus > 0').required('Qty wajib'),
        harga: Yup.number().min(0, 'Harga tidak boleh minus').required('Harga wajib'),
      })
    )
    .min(1, 'Minimal 1 item barang harus dimasukkan'),
});

export default function CreatePoModal({ visible, onCancel, onSuccess, isDark }) {
  const [materialOptions, setMaterialOptions] = useState([]);

  const todayStr = () => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  const handleSearchMaterials = async (query) => {
    if (!query || query.length < 2) return;
    try {
      const res = await getMaterials({ q: query, limit: 10 });
      if (res.items) {
        setMaterialOptions(
          res.items.map((m) => ({
            value: m.kode,
            label: `[${m.kode}] ${m.nama}`,
            material: m,
          }))
        );
      }
    } catch (err) {
      console.warn('Gagal cari material:', err.message);
    }
  };

  const formatRupiah = (val) => 'Rp ' + Number(val || 0).toLocaleString('id-ID');

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>+ Input PO Baru ke Google Sheets 'PO 2026'</span>
          <Tag color="green">Multi-Item Supported</Tag>
        </div>
      }
      open={visible}
      onCancel={onCancel}
      width={860}
      footer={null}
      destroyOnClose
    >
      <Formik
        initialValues={{
          noPo: '',
          supplier: '',
          date: todayStr(),
          quotation: '',
          items: [
            {
              kode: '',
              nama: '',
              qty: 1,
              harga: 0,
              diskon: 0,
              ppn: 0,
              ket: '',
            },
          ],
        }}
        validationSchema={PoSchema}
        onSubmit={async (values, { setSubmitting, resetForm }) => {
          try {
            await onSuccess(values);
            message.success(`Berhasil menambahkan PO ${values.noPo} ke Google Sheets!`);
            resetForm();
            onCancel();
          } catch (err) {
            message.error(`Gagal menyimpan PO: ${err.message}`);
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {({ values, errors, touched, handleChange, handleBlur, handleSubmit, setFieldValue, isSubmitting }) => {
          // Compute summary totals
          let subTotal = 0;
          let totalPpn = 0;
          values.items.forEach((it) => {
            const itemSub = (it.qty || 0) * (it.harga || 0) * (1 - (it.diskon || 0));
            subTotal += itemSub;
            totalPpn += Number(it.ppn || 0);
          });
          const grandTotal = subTotal + totalPpn;

          return (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Header Fields (2 Kolom) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Nomor PO Resmi <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <Input
                    name="noPo"
                    placeholder="Contoh: 2600120 atau PO-2026-001"
                    value={values.noPo}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    status={touched.noPo && errors.noPo ? 'error' : ''}
                  />
                  {touched.noPo && errors.noPo && (
                    <div style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>{errors.noPo}</div>
                  )}
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Nama Supplier / Vendor <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <Input
                    name="supplier"
                    placeholder="Contoh: PT Buana Logam Perkasa"
                    value={values.supplier}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    status={touched.supplier && errors.supplier ? 'error' : ''}
                  />
                  {touched.supplier && errors.supplier && (
                    <div style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>{errors.supplier}</div>
                  )}
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Tanggal PO (DD/MM/YYYY) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <Input
                    name="date"
                    placeholder="15/10/2026"
                    value={values.date}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    status={touched.date && errors.date ? 'error' : ''}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Quotation / Ref Vendor (Opsional)
                  </label>
                  <Input
                    name="quotation"
                    placeholder="Contoh: QUOT-2026-BLP-01"
                    value={values.quotation}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
                </div>
              </div>

              {/* Items FieldArray */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, backgroundColor: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>
                    Daftar Barang Pesanan ({values.items.length} Item)
                  </span>
                </div>

                <FieldArray name="items">
                  {({ push, remove }) => (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {values.items.map((item, index) => {
                        const itemSub = (item.qty || 0) * (item.harga || 0) * (1 - (item.diskon || 0)) + Number(item.ppn || 0);

                        return (
                          <div
                            key={index}
                            style={{
                              backgroundColor: '#ffffff',
                              border: '1px solid #cbd5e1',
                              borderRadius: 8,
                              padding: 10,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 8,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: 700, fontSize: 12, color: '#047857' }}>
                                Item #{index + 1}
                              </span>
                              {values.items.length > 1 && (
                                <Button
                                  type="text"
                                  danger
                                  size="small"
                                  icon={<AiOutlineDelete />}
                                  onClick={() => remove(index)}
                                >
                                  Hapus
                                </Button>
                              )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8 }}>
                              <div>
                                <label style={{ fontSize: 11, color: '#64748b' }}>Kode Material</label>
                                <AutoComplete
                                  options={materialOptions}
                                  placeholder="RM00355"
                                  value={item.kode}
                                  onSearch={handleSearchMaterials}
                                  onSelect={(val, option) => {
                                    setFieldValue(`items.${index}.kode`, val);
                                    if (option.material?.nama) {
                                      setFieldValue(`items.${index}.nama`, option.material.nama);
                                    }
                                    if (option.material?.hargaTerakhir) {
                                      setFieldValue(`items.${index}.harga`, option.material.hargaTerakhir);
                                    }
                                  }}
                                  onChange={(val) => setFieldValue(`items.${index}.kode`, val.toUpperCase())}
                                  style={{ width: '100%' }}
                                />
                              </div>

                              <div>
                                <label style={{ fontSize: 11, color: '#64748b' }}>Nama Material / Spesifikasi *</label>
                                <Input
                                  placeholder="Hex Nipples 1/2 Stainless Steel 304"
                                  value={item.nama}
                                  onChange={(e) => setFieldValue(`items.${index}.nama`, e.target.value)}
                                />
                              </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '100px 150px 100px 120px 1fr', gap: 8 }}>
                              <div>
                                <label style={{ fontSize: 11, color: '#64748b' }}>Qty *</label>
                                <InputNumber
                                  min={0.01}
                                  value={item.qty}
                                  onChange={(val) => setFieldValue(`items.${index}.qty`, val || 0)}
                                  style={{ width: '100%' }}
                                />
                              </div>

                              <div>
                                <label style={{ fontSize: 11, color: '#64748b' }}>Harga Satuan (Rp) *</label>
                                <InputNumber
                                  min={0}
                                  step={1000}
                                  value={item.harga}
                                  onChange={(val) => {
                                    setFieldValue(`items.${index}.harga`, val || 0);
                                  }}
                                  formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                                  parser={(val) => val.replace(/\./g, '')}
                                  style={{ width: '100%' }}
                                />
                              </div>

                              <div>
                                <label style={{ fontSize: 11, color: '#64748b' }}>Diskon (%)</label>
                                <InputNumber
                                  min={0}
                                  max={100}
                                  value={(item.diskon || 0) * 100}
                                  onChange={(val) => setFieldValue(`items.${index}.diskon`, (val || 0) / 100)}
                                  style={{ width: '100%' }}
                                />
                              </div>

                              <div>
                                <label style={{ fontSize: 11, color: '#64748b' }}>PPN (Rp)</label>
                                <InputNumber
                                  min={0}
                                  value={item.ppn}
                                  onChange={(val) => setFieldValue(`items.${index}.ppn`, val || 0)}
                                  style={{ width: '100%' }}
                                />
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'right' }}>
                                <span style={{ fontSize: 10, color: '#64748b' }}>Subtotal Item:</span>
                                <span style={{ fontWeight: 700, color: '#2563eb', fontFamily: 'monospace', fontSize: 13 }}>
                                  {formatRupiah(itemSub)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      <Button
                        type="dashed"
                        icon={<AiOutlinePlus />}
                        onClick={() =>
                          push({
                            kode: '',
                            nama: '',
                            qty: 1,
                            harga: 0,
                            diskon: 0,
                            ppn: 0,
                            ket: '',
                          })
                        }
                        style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                      >
                        + Tambah Baris Barang Lagi
                      </Button>
                    </div>
                  )}
                </FieldArray>
              </div>

              {/* Rangkuman Nilai PO */}
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  borderRadius: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: '#047857' }}>Subtotal: {formatRupiah(subTotal)} | PPN: {formatRupiah(totalPpn)}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#047857' }}>
                    Grand Total Transaksi PO:
                  </div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#047857', fontFamily: 'monospace' }}>
                  {formatRupiah(grandTotal)}
                </div>
              </div>

              {/* Footer Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <Button onClick={onCancel}>Batal</Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={isSubmitting}
                  style={{ backgroundColor: '#047857', borderColor: '#047857', fontWeight: 600 }}
                >
                  ✓ Simpan ke Google Sheets
                </Button>
              </div>
            </form>
          );
        }}
      </Formik>
    </Modal>
  );
}
