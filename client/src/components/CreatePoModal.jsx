import React, { useState } from 'react';
import { Modal, Button, Input, InputNumber, AutoComplete, Table, Space, message, Tag, Checkbox } from 'antd';
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
    if (!query || query.trim().length === 0) return;
    try {
      const res = await getMaterials({ q: query.trim(), limit: 15 });
      if (res && res.items) {
        setMaterialOptions(
          res.items.map((m) => {
            const lastPrice = Number(m.hargaTerakhir || m.hargaTerbaru || 0);
            return {
              value: m.kode,
              label: (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    padding: '4px 2px',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, overflow: 'hidden' }}>
                    <Tag color="cyan" style={{ fontFamily: 'monospace', fontWeight: 700, margin: 0, flexShrink: 0 }}>
                      {m.kode}
                    </Tag>
                    <span style={{ fontWeight: 600, color: '#1e293b', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.35 }}>
                      {m.nama}
                    </span>
                  </div>
                  {lastPrice > 0 ? (
                    <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: 8 }}>
                      <span style={{ fontSize: 10, color: '#64748b', display: 'block', lineHeight: 1 }}>Harga Terakhir</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#059669', fontFamily: 'monospace' }}>
                        Rp {lastPrice.toLocaleString('id-ID')}
                      </span>
                    </div>
                  ) : (
                    <Tag style={{ margin: 0, color: '#94a3b8', fontSize: 10 }}>Belum ada histori</Tag>
                  )}
                </div>
              ),
              material: m,
            };
          })
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
          <span style={{ fontSize: 16, fontWeight: 700 }}>Input PO Baru ke Google Sheets 'PO 2026'</span>
          <Tag color="green">Multi-Item Supported</Tag>
        </div>
      }
      open={visible}
      onCancel={onCancel}
      width={920}
      footer={null}
      destroyOnHidden
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
              usePpn: false,
              ppn: 0,
              ket: '',
            },
          ],
        }}
        validationSchema={PoSchema}
        onSubmit={async (values, { setSubmitting, resetForm }) => {
          try {
            const payload = {
              ...values,
              items: values.items.map((it) => {
                const itemSub = (it.qty || 0) * (it.harga || 0) * (1 - (it.diskon || 0));
                const finalPpn = it.usePpn ? Math.round(itemSub * 0.11) : Number(it.ppn || 0);
                return {
                  ...it,
                  ppn: finalPpn,
                  total: Math.round(itemSub + finalPpn),
                };
              }),
            };
            await onSuccess(payload);
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
            const currentPpn = it.usePpn ? Math.round(itemSub * 0.11) : Number(it.ppn || 0);
            totalPpn += currentPpn;
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
                        const itemSubBase = (item.qty || 0) * (item.harga || 0) * (1 - (item.diskon || 0));
                        const itemPpn = item.usePpn ? Math.round(itemSubBase * 0.11) : Number(item.ppn || 0);
                        const itemTotal = itemSubBase + itemPpn;

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

                            {/* Baris 1: Kode Material (Dropdown Diperlebar & Auto-fill Harga) + Nama Material */}
                            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 10 }}>
                              <div>
                                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 2 }}>
                                  Kode Material
                                </label>
                                <AutoComplete
                                  options={materialOptions}
                                  placeholder="Ketik kode/nama..."
                                  value={item.kode}
                                  onSearch={handleSearchMaterials}
                                  popupMatchSelectWidth={false}
                                  dropdownMatchSelectWidth={false}
                                  popupStyle={{ minWidth: 550, maxWidth: 750 }}
                                  dropdownStyle={{ minWidth: 550, maxWidth: 750 }}
                                  onSelect={(val, option) => {
                                    setFieldValue(`items.${index}.kode`, val);
                                    if (option.material?.nama) {
                                      setFieldValue(`items.${index}.nama`, option.material.nama);
                                    }
                                    const lastPrice = Number(option.material?.hargaTerakhir || option.material?.hargaTerbaru || 0);
                                    if (lastPrice > 0) {
                                      setFieldValue(`items.${index}.harga`, lastPrice);
                                      if (item.usePpn) {
                                        const sub = (item.qty || 1) * lastPrice * (1 - (item.diskon || 0));
                                        setFieldValue(`items.${index}.ppn`, Math.round(sub * 0.11));
                                      }
                                      message.success({
                                        content: `Harga terakhir [${val}] otomatis terisi: Rp ${lastPrice.toLocaleString('id-ID')}`,
                                        key: `price-${index}`,
                                        duration: 2.5,
                                      });
                                    }
                                  }}
                                  onChange={(val) => setFieldValue(`items.${index}.kode`, val.toUpperCase())}
                                  style={{ width: '100%' }}
                                />
                              </div>

                              <div>
                                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 2 }}>
                                  Nama Material / Spesifikasi *
                                </label>
                                <Input
                                  placeholder="Hex Nipples 1/2 Stainless Steel 304"
                                  value={item.nama}
                                  onChange={(e) => setFieldValue(`items.${index}.nama`, e.target.value)}
                                />
                              </div>
                            </div>

                            {/* Baris 2: Qty, Harga Satuan, Diskon, Checklist PPN 11%, Subtotal */}
                            <div style={{ display: 'grid', gridTemplateColumns: '95px 170px 95px 135px 1fr', gap: 10, alignItems: 'center' }}>
                              <div>
                                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 2 }}>
                                  Qty *
                                </label>
                                <InputNumber
                                  min={0.01}
                                  value={item.qty}
                                  onChange={(val) => {
                                    const q = val || 0;
                                    setFieldValue(`items.${index}.qty`, q);
                                    if (item.usePpn) {
                                      const sub = q * (item.harga || 0) * (1 - (item.diskon || 0));
                                      setFieldValue(`items.${index}.ppn`, Math.round(sub * 0.11));
                                    }
                                  }}
                                  style={{ width: '100%' }}
                                />
                              </div>

                              <div>
                                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 2 }}>
                                  Harga Satuan (Rp) *
                                </label>
                                <InputNumber
                                  min={0}
                                  step={1000}
                                  value={item.harga}
                                  onChange={(val) => {
                                    const h = val || 0;
                                    setFieldValue(`items.${index}.harga`, h);
                                    if (item.usePpn) {
                                      const sub = (item.qty || 0) * h * (1 - (item.diskon || 0));
                                      setFieldValue(`items.${index}.ppn`, Math.round(sub * 0.11));
                                    }
                                  }}
                                  formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                                  parser={(val) => val.replace(/\./g, '')}
                                  style={{ width: '100%' }}
                                />
                              </div>

                              <div>
                                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 2 }}>
                                  Diskon (%)
                                </label>
                                <InputNumber
                                  min={0}
                                  max={100}
                                  value={(item.diskon || 0) * 100}
                                  onChange={(val) => {
                                    const d = (val || 0) / 100;
                                    setFieldValue(`items.${index}.diskon`, d);
                                    if (item.usePpn) {
                                      const sub = (item.qty || 0) * (item.harga || 0) * (1 - d);
                                      setFieldValue(`items.${index}.ppn`, Math.round(sub * 0.11));
                                    }
                                  }}
                                  style={{ width: '100%' }}
                                />
                              </div>

                              <div>
                                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 2 }}>
                                  PPN (11%)
                                </label>
                                <div style={{ height: 32, display: 'flex', alignItems: 'center' }}>
                                  <Checkbox
                                    checked={item.usePpn}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setFieldValue(`items.${index}.usePpn`, checked);
                                      const sub = (item.qty || 0) * (item.harga || 0) * (1 - (item.diskon || 0));
                                      setFieldValue(`items.${index}.ppn`, checked ? Math.round(sub * 0.11) : 0);
                                    }}
                                  >
                                    <span style={{ fontSize: 12, fontWeight: 600, color: item.usePpn ? '#047857' : '#64748b' }}>
                                      {item.usePpn ? 'PPN 11%' : 'Tanpa PPN'}
                                    </span>
                                  </Checkbox>
                                </div>
                                {item.usePpn && (
                                  <div style={{ fontSize: 10, color: '#047857', fontFamily: 'monospace', marginTop: -2 }}>
                                    +{formatRupiah(itemPpn)}
                                  </div>
                                )}
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'right' }}>
                                <span style={{ fontSize: 10, color: '#64748b' }}>Subtotal Item:</span>
                                <span style={{ fontWeight: 700, color: '#2563eb', fontFamily: 'monospace', fontSize: 13 }}>
                                  {formatRupiah(itemTotal)}
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
                            usePpn: false,
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
                  <div className="tabular-nums" style={{ fontSize: 11, color: '#047857' }}>Subtotal: {formatRupiah(subTotal)} | PPN: {formatRupiah(totalPpn)}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#047857' }}>
                    Grand Total Transaksi PO:
                  </div>
                </div>
                <div className="tabular-nums" style={{ fontSize: 20, fontWeight: 700, color: '#047857', fontFamily: 'monospace' }}>
                  {formatRupiah(grandTotal)}
                </div>
              </div>

              {/* Footer Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <Button onClick={onCancel} className="smooth-clickable">Batal</Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={isSubmitting}
                  className="smooth-clickable"
                  style={{ backgroundColor: isDark ? '#1bd488' : '#055b65', borderColor: isDark ? '#1bd488' : '#055b65', color: isDark ? '#05191d' : '#ffffff', fontWeight: 600 }}
                >
                  Simpan ke Google Sheets
                </Button>
              </div>
            </form>
          );
        }}
      </Formik>
    </Modal>
  );
}
