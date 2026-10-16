import React, { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Input,
  InputNumber,
  Select,
  AutoComplete,
  Tabs,
  Tag,
  Divider,
  message,
  Spin,
  Tooltip,
} from 'antd';
import {
  AiOutlinePlus,
  AiOutlineDelete,
  AiOutlineCheck,
  AiOutlineFileText,
  AiOutlineInbox,
  AiOutlineDollar,
  AiOutlineAppstore,
  AiOutlineSync,
} from 'react-icons/ai';
import { getPODetail, getMaterials } from '../services/api';

export default function EditPoModal({
  visible,
  poRow,
  allRows = [],
  onCancel,
  onSuccess,
  isDark = false,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('items');
  const [materialOptions, setMaterialOptions] = useState([]);

  // Form State
  const [header, setHeader] = useState({
    noPo: '',
    status: 'Open',
    date: '',
    supplier: '',
    quotation: '',
    ttd: '',
    em: '',
    doNum: '',
    fktInv: '',
    grpo: '',
    lastGrpoDate: '',
    tglBayar: '',
    tglInvoice: '',
    noInvoice: '',
    ket: '',
  });

  const [items, setItems] = useState([]);

  // Auto-fill nama material saat kode dipilih/diketik
  const handleSearchMaterials = async (query) => {
    if (!query || query.length < 2) return;
    try {
      const res = await getMaterials({ q: query, limit: 10 });
      if (res?.items) {
        setMaterialOptions(
          res.items.map((m) => ({
            value: m.kode,
            label: `[${m.kode}] ${m.nama}`,
            material: m,
          }))
        );
      }
    } catch (err) {
      console.warn('Gagal cari master material:', err.message);
    }
  };

  // Muat data lengkap PO saat modal terbuka
  useEffect(() => {
    if (!visible || !poRow) return;

    const noPoClean = (poRow.noPo || '').trim();

    // 1. Ambil data awal dari allRows jika cocok
    const localMatches = allRows.filter(
      (r) => (r.noPo || '').trim().toUpperCase() === noPoClean.toUpperCase()
    );

    const initialHeader = {
      noPo: poRow.noPo || '',
      status: poRow.status || 'Open',
      date: poRow.date || '',
      supplier: poRow.supplier || '',
      quotation: poRow.quotation || '',
      ttd: poRow.ttd || '',
      em: poRow.em || '',
      doNum: poRow.doNum || '',
      fktInv: poRow.fktInv || '',
      grpo: poRow.grpo || '',
      lastGrpoDate: poRow.lastGrpoDate || '',
      tglBayar: poRow.tglBayar || '',
      tglInvoice: poRow.tglInvoice || '',
      noInvoice: poRow.noInvoice || '',
      ket: poRow.ket || '',
    };

    const initialItems = (localMatches.length > 0 ? localMatches : [poRow]).map(
      (it, idx) => ({
        id: `it-${Date.now()}-${idx}-${Math.random()}`,
        rowIndex: it.rowIndex || 0,
        no: it.no || idx + 1,
        kode: it.kode || '',
        nama: it.nama || '',
        qty: parseFloat(it.qty) || 0,
        priceUnit: parseFloat(it.priceUnit) || 0,
        discount: parseFloat(it.discount) || 0,
        ppn: parseFloat(it.ppn) || 0,
        total: parseFloat(it.total) || 0,
        ket: it.ket || '',
      })
    );

    setHeader(initialHeader);
    setItems(initialItems);

    // 2. Fetch fresh detail dari server untuk menjamin seluruh kolom akurat
    setLoading(true);
    getPODetail(noPoClean)
      .then((res) => {
        if (res?.success && res.po) {
          const p = res.po;
          setHeader((prev) => ({
            ...prev,
            noPo: p.noPo || prev.noPo,
            status: p.status || prev.status,
            date: p.date || prev.date,
            supplier: p.supplier || prev.supplier,
            quotation: p.quotation !== undefined ? p.quotation : prev.quotation,
            ttd: p.ttd !== undefined ? p.ttd : prev.ttd,
            em: p.em !== undefined ? p.em : prev.em,
            doNum: p.doNum !== undefined ? p.doNum : prev.doNum,
            fktInv: p.fktInv !== undefined ? p.fktInv : prev.fktInv,
            grpo: p.grpo !== undefined ? p.grpo : prev.grpo,
            lastGrpoDate: p.lastGrpoDate !== undefined ? p.lastGrpoDate : prev.lastGrpoDate,
            tglBayar: p.tglBayar !== undefined ? p.tglBayar : prev.tglBayar,
            tglInvoice: p.tglInvoice !== undefined ? p.tglInvoice : prev.tglInvoice,
            noInvoice: p.noInvoice !== undefined ? p.noInvoice : prev.noInvoice,
            ket: p.ket !== undefined ? p.ket : prev.ket,
          }));

          if (Array.isArray(p.items) && p.items.length > 0) {
            setItems(
              p.items.map((it, idx) => ({
                id: `it-${Date.now()}-${idx}-${Math.random()}`,
                rowIndex: it.rowIndex || 0,
                no: it.no || idx + 1,
                kode: it.kode || '',
                nama: it.nama || '',
                qty: parseFloat(it.qty) || 0,
                priceUnit: parseFloat(it.priceUnit) || 0,
                discount: parseFloat(it.discount) || 0,
                ppn: parseFloat(it.ppn) || 0,
                total: parseFloat(it.total) || 0,
                ket: it.ket || '',
              }))
            );
          }
        }
      })
      .catch((err) => {
        console.warn('Gagal ambil data segar PO:', err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [visible, poRow]);

  // Handler update field header
  const handleHeaderChange = (field, value) => {
    setHeader((prev) => ({ ...prev, [field]: value }));
  };

  // Handler update field item material
  const handleItemChange = (index, field, value) => {
    setItems((prev) => {
      const updated = [...prev];
      const current = { ...updated[index], [field]: value };

      // Kalkulasi otomatis subtotal jika qty, priceUnit, discount, atau ppn berubah
      if (['qty', 'priceUnit', 'discount', 'ppn'].includes(field)) {
        const q = parseFloat(field === 'qty' ? value : current.qty) || 0;
        const p = parseFloat(field === 'priceUnit' ? value : current.priceUnit) || 0;
        const d = parseFloat(field === 'discount' ? value : current.discount) || 0;
        const pp = parseFloat(field === 'ppn' ? value : current.ppn) || 0;
        current.total = Math.round((q * p) * (1 - d) + pp);
      }

      updated[index] = current;
      return updated;
    });
  };

  // Tambah item material baru
  const handleAddItem = () => {
    const newItem = {
      id: `it-${Date.now()}-${Math.random()}`,
      rowIndex: 0,
      no: items.length + 1,
      kode: '',
      nama: '',
      qty: 1,
      priceUnit: 0,
      discount: 0,
      ppn: 0,
      total: 0,
      ket: '',
    };
    setItems((prev) => [...prev, newItem]);
  };

  // Hapus item material
  const handleDeleteItem = (index) => {
    if (items.length <= 1) {
      message.warning('Minimal harus ada 1 item material dalam PO.');
      return;
    }
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Perhitungan total PO
  const totalQty = items.reduce((sum, it) => sum + (parseFloat(it.qty) || 0), 0);
  const grandTotal = items.reduce((sum, it) => {
    const q = parseFloat(it.qty) || 0;
    const p = parseFloat(it.priceUnit) || 0;
    const d = parseFloat(it.discount) || 0;
    const pp = parseFloat(it.ppn) || 0;
    return sum + (it.total || Math.round((q * p) * (1 - d) + pp));
  }, 0);

  // Submit Handler
  const handleSave = async () => {
    if (!header.noPo.trim()) {
      message.error('Nomor PO tidak boleh kosong.');
      return;
    }
    if (!header.supplier.trim()) {
      message.error('Nama supplier tidak boleh kosong.');
      return;
    }
    if (items.length === 0) {
      message.error('Harap masukkan minimal 1 item material.');
      return;
    }

    // Validasi setiap item memiliki nama atau kode
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.kode.trim() && !it.nama.trim()) {
        message.error(`Item baris ke-${i + 1} wajib memiliki Kode atau Nama Material.`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        header,
        items,
        isFullUpdate: true,
      };

      await onSuccess(poRow.noPo, payload);
      message.success(`Berhasil memperbarui PO ${header.noPo} (${items.length} material item)!`);
      onCancel();
    } catch (err) {
      message.error(`Gagal menyimpan perubahan: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const formatRupiah = (val) => 'Rp ' + Number(val || 0).toLocaleString('id-ID');

  const cardBg = isDark ? '#1e293b' : '#f8fafc';
  const borderColor = isDark ? '#334155' : '#e2e8f0';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: textColor }}>
              ✏️ Edit Transaksi PO: {header.noPo || poRow?.noPo}
            </span>
            <Tag color={header.status === 'Close' ? 'green' : header.status === 'Cancelled' ? 'red' : 'blue'}>
              {header.status}
            </Tag>
            <Tag color="cyan">{header.supplier || 'Vendor'}</Tag>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2563eb', fontFamily: 'monospace' }}>
            Grand Total: {formatRupiah(grandTotal)}
          </div>
        </div>
      }
      open={visible}
      onCancel={onCancel}
      width={1000}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 11, color: mutedColor }}>
            *Semua perubahan 23 kolom &amp; multi-item material disinkronkan langsung ke Google Sheets.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={onCancel} disabled={saving}>
              Batal
            </Button>
            <Button
              type="primary"
              icon={<AiOutlineCheck />}
              loading={saving}
              onClick={handleSave}
              style={{ backgroundColor: '#2563eb', fontWeight: 600 }}
            >
              Simpan Semua Kolom ({items.length} Material)
            </Button>
          </div>
        </div>
      }
      destroyOnClose
    >
      <Spin spinning={loading} tip="Memuat detail seluruh material PO...">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'items',
              label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  <AiOutlineAppstore /> Daftar Material ({items.length} Item)
                </span>
              ),
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: cardBg,
                      border: `1px solid ${borderColor}`,
                      padding: '8px 12px',
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ fontSize: 12, color: mutedColor }}>
                      Koreksi kesalahan OCR pada kode barang, nama, kuantitas, harga, diskon, atau tambah/hapus item.
                    </div>
                    <Button
                      size="small"
                      type="primary"
                      icon={<AiOutlinePlus />}
                      onClick={handleAddItem}
                      style={{ backgroundColor: '#059669', fontSize: 12, fontWeight: 600 }}
                    >
                      + Tambah Material
                    </Button>
                  </div>

                  {/* List / Table of Items */}
                  <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map((it, idx) => (
                      <div
                        key={it.id || idx}
                        style={{
                          backgroundColor: cardBg,
                          border: `1px solid ${borderColor}`,
                          borderRadius: 8,
                          padding: 10,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 700, fontSize: 12, color: textColor }}>
                            Material #{idx + 1} {it.rowIndex ? `(Baris Sheet #${it.rowIndex})` : '(Item Baru)'}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: '#2563eb' }}>
                              Subtotal: {formatRupiah(it.total)}
                            </span>
                            <Tooltip title="Hapus baris material ini">
                              <Button
                                size="small"
                                danger
                                type="text"
                                icon={<AiOutlineDelete style={{ fontSize: 15 }} />}
                                onClick={() => handleDeleteItem(idx)}
                              />
                            </Tooltip>
                          </div>
                        </div>

                        {/* Grid Form Fields for this Item */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '160px 1fr 90px 130px 80px 100px',
                            gap: 8,
                            alignItems: 'center',
                          }}
                        >
                          {/* Kode Material */}
                          <div>
                            <label style={{ fontSize: 10, fontWeight: 700, color: mutedColor, display: 'block', marginBottom: 2 }}>
                              Kode Material (Kolom G)
                            </label>
                            <AutoComplete
                              value={it.kode}
                              options={materialOptions}
                              onSearch={handleSearchMaterials}
                              onSelect={(val, option) => {
                                handleItemChange(idx, 'kode', val);
                                if (option?.material?.nama) {
                                  handleItemChange(idx, 'nama', option.material.nama);
                                }
                              }}
                              onChange={(val) => handleItemChange(idx, 'kode', val ? val.toUpperCase() : '')}
                              placeholder="RM00355"
                              style={{ width: '100%' }}
                            />
                          </div>

                          {/* Nama Material */}
                          <div>
                            <label style={{ fontSize: 10, fontWeight: 700, color: mutedColor, display: 'block', marginBottom: 2 }}>
                              Nama Material (Kolom H)
                            </label>
                            <Input
                              value={it.nama}
                              onChange={(e) => handleItemChange(idx, 'nama', e.target.value)}
                              placeholder="Nama & spesifikasi teknis barang"
                            />
                          </div>

                          {/* Quantity */}
                          <div>
                            <label style={{ fontSize: 10, fontWeight: 700, color: mutedColor, display: 'block', marginBottom: 2 }}>
                              Qty (Kolom I)
                            </label>
                            <InputNumber
                              value={it.qty}
                              min={0}
                              onChange={(val) => handleItemChange(idx, 'qty', val || 0)}
                              style={{ width: '100%' }}
                            />
                          </div>

                          {/* Price Unit */}
                          <div>
                            <label style={{ fontSize: 10, fontWeight: 700, color: mutedColor, display: 'block', marginBottom: 2 }}>
                              Harga Satuan (Kolom N)
                            </label>
                            <InputNumber
                              value={it.priceUnit}
                              min={0}
                              formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                              parser={(val) => val.replace(/\./g, '')}
                              onChange={(val) => handleItemChange(idx, 'priceUnit', val || 0)}
                              style={{ width: '100%' }}
                            />
                          </div>

                          {/* Diskon */}
                          <div>
                            <label style={{ fontSize: 10, fontWeight: 700, color: mutedColor, display: 'block', marginBottom: 2 }}>
                              Diskon (O)
                            </label>
                            <InputNumber
                              value={it.discount}
                              min={0}
                              max={1}
                              step={0.05}
                              onChange={(val) => handleItemChange(idx, 'discount', val || 0)}
                              style={{ width: '100%' }}
                            />
                          </div>

                          {/* PPN */}
                          <div>
                            <label style={{ fontSize: 10, fontWeight: 700, color: mutedColor, display: 'block', marginBottom: 2 }}>
                              PPN (Kolom P)
                            </label>
                            <InputNumber
                              value={it.ppn}
                              min={0}
                              formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                              parser={(val) => val.replace(/\./g, '')}
                              onChange={(val) => handleItemChange(idx, 'ppn', val || 0)}
                              style={{ width: '100%' }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Summary Footer */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: cardBg,
                      border: `1px solid ${borderColor}`,
                      padding: '10px 16px',
                      borderRadius: 8,
                      fontWeight: 700,
                    }}
                  >
                    <span style={{ color: mutedColor }}>
                      Total: <b style={{ color: textColor }}>{items.length} Barang</b> ({totalQty} unit)
                    </span>
                    <span style={{ fontSize: 14, color: '#2563eb', fontFamily: 'monospace' }}>
                      Grand Total PO: {formatRupiah(grandTotal)}
                    </span>
                  </div>
                </div>
              ),
            },
            {
              key: 'identity',
              label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  <AiOutlineFileText /> Identitas &amp; Verifikasi (Kolom A-F, J-M)
                </span>
              ),
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: textColor, display: 'block', marginBottom: 4 }}>
                        Nomor PO (Kolom D) <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <Input
                        value={header.noPo}
                        onChange={(e) => handleHeaderChange('noPo', e.target.value)}
                        placeholder="PO-2026-001"
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: textColor, display: 'block', marginBottom: 4 }}>
                        Status PO (Kolom B) <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <Select
                        value={header.status}
                        onChange={(val) => handleHeaderChange('status', val)}
                        style={{ width: '100%' }}
                        options={[
                          { value: 'Open', label: 'Open (Dalam Proses Order)' },
                          { value: 'Close', label: 'Close (Selesai & Lunas)' },
                          { value: 'Pending', label: 'Pending (Menunggu Gudang/Finance)' },
                          { value: 'Cancelled', label: 'Cancelled (Dibatalkan)' },
                        ]}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: textColor, display: 'block', marginBottom: 4 }}>
                        Tanggal PO (Kolom C)
                      </label>
                      <Input
                        value={header.date}
                        onChange={(e) => handleHeaderChange('date', e.target.value)}
                        placeholder="DD/MM/YYYY"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: textColor, display: 'block', marginBottom: 4 }}>
                        Nama Supplier / Vendor (Kolom E) <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <Input
                        value={header.supplier}
                        onChange={(e) => handleHeaderChange('supplier', e.target.value)}
                        placeholder="PT Buana Logam Perkasa"
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: textColor, display: 'block', marginBottom: 4 }}>
                        QUOT. / Vendor Reff (Kolom F)
                      </label>
                      <Input
                        value={header.quotation}
                        onChange={(e) => handleHeaderChange('quotation', e.target.value)}
                        placeholder="QUOT-2026-088"
                      />
                    </div>
                  </div>

                  <Divider style={{ margin: '6px 0' }} />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: textColor, display: 'block', marginBottom: 4 }}>
                        TTD P Endik/P Adhis (Kolom J)
                      </label>
                      <Input
                        value={header.ttd}
                        onChange={(e) => handleHeaderChange('ttd', e.target.value)}
                        placeholder="Verified"
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: textColor, display: 'block', marginBottom: 4 }}>
                        Status Email (Kolom K - Em)
                      </label>
                      <Input
                        value={header.em}
                        onChange={(e) => handleHeaderChange('em', e.target.value)}
                        placeholder="Sent / Done"
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: textColor, display: 'block', marginBottom: 4 }}>
                        Surat Jalan DO (Kolom L)
                      </label>
                      <Input
                        value={header.doNum}
                        onChange={(e) => handleHeaderChange('doNum', e.target.value)}
                        placeholder="DO-12345"
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: textColor, display: 'block', marginBottom: 4 }}>
                        Faktur Pajak / Inv (Kolom M)
                      </label>
                      <Input
                        value={header.fktInv}
                        onChange={(e) => handleHeaderChange('fktInv', e.target.value)}
                        placeholder="010.000-26.0000001"
                      />
                    </div>
                  </div>
                </div>
              ),
            },
            {
              key: 'logistics',
              label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  <AiOutlineInbox /> Gudang &amp; Keuangan (Kolom R-W)
                </span>
              ),
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: textColor, display: 'block', marginBottom: 4 }}>
                        No. GRPO Gudang (Kolom R)
                      </label>
                      <Input
                        value={header.grpo}
                        onChange={(e) => handleHeaderChange('grpo', e.target.value)}
                        placeholder="2600012"
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: textColor, display: 'block', marginBottom: 4 }}>
                        Tgl Selesai GRPO (Kolom S)
                      </label>
                      <Input
                        value={header.lastGrpoDate}
                        onChange={(e) => handleHeaderChange('lastGrpoDate', e.target.value)}
                        placeholder="DD/MM/YYYY"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: textColor, display: 'block', marginBottom: 4 }}>
                        Tanggal Bayar Finance (Kolom T)
                      </label>
                      <Input
                        value={header.tglBayar}
                        onChange={(e) => handleHeaderChange('tglBayar', e.target.value)}
                        placeholder="DD/MM/YYYY"
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: textColor, display: 'block', marginBottom: 4 }}>
                        No. Invoice Vendor (Kolom V)
                      </label>
                      <Input
                        value={header.noInvoice}
                        onChange={(e) => handleHeaderChange('noInvoice', e.target.value)}
                        placeholder="INV-2026/089"
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: textColor, display: 'block', marginBottom: 4 }}>
                        Tanggal Invoice Vendor (Kolom U)
                      </label>
                      <Input
                        value={header.tglInvoice}
                        onChange={(e) => handleHeaderChange('tglInvoice', e.target.value)}
                        placeholder="DD/MM/YYYY"
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: textColor, display: 'block', marginBottom: 4 }}>
                      Catatan Operasional (Kolom W - KET)
                    </label>
                    <Input.TextArea
                      rows={3}
                      value={header.ket}
                      onChange={(e) => handleHeaderChange('ket', e.target.value)}
                      placeholder="Catatan penerimaan, kendala, atau keterangan khusus..."
                    />
                  </div>
                </div>
              ),
            },
          ]}
        />
      </Spin>
    </Modal>
  );
}
