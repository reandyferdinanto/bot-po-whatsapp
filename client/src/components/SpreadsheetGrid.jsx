import React, { useRef } from 'react';
import { Tag, Button, Input } from 'antd';
import {
  AiOutlineSearch,
  AiOutlineMenuUnfold,
  AiOutlineMenuFold,
} from 'react-icons/ai';

const COLUMNS_DEF = [
  { letter: 'A', name: 'NO.', width: 48, align: 'center', key: 'no' },
  { letter: 'B', name: 'STATUS', width: 92, align: 'left', key: 'status' },
  { letter: 'C', name: 'DATE', width: 95, align: 'left', key: 'date' },
  { letter: 'D', name: 'NO. PO', width: 130, align: 'left', key: 'noPo' },
  { letter: 'E', name: 'SUPPLIER', width: 210, align: 'left', key: 'supplier' },
  { letter: 'F', name: 'QUOT. / Vendor Reff', width: 135, align: 'left', key: 'quotation' },
  { letter: 'G', name: 'Kode Item Material', width: 120, align: 'left', key: 'kode', highlight: 'emerald' },
  { letter: 'H', name: 'Nama Material', width: 230, align: 'left', key: 'nama', highlight: 'emerald' },
  { letter: 'I', name: 'Quantity', width: 75, align: 'right', key: 'qty' },
  { letter: 'J', name: 'TTD P Endik / P Adhis', width: 135, align: 'center', key: 'ttd' },
  { letter: 'K', name: 'Em', width: 65, align: 'center', key: 'em' },
  { letter: 'L', name: 'DO', width: 110, align: 'left', key: 'doNum' },
  { letter: 'M', name: 'Fkt/Inv', width: 110, align: 'left', key: 'fktInv' },
  { letter: 'N', name: 'Price Unit', width: 115, align: 'right', key: 'priceUnit' },
  { letter: 'O', name: 'Discount', width: 80, align: 'right', key: 'discount' },
  { letter: 'P', name: 'PPN', width: 105, align: 'right', key: 'ppn' },
  { letter: 'Q', name: 'TOTAL', width: 135, align: 'right', key: 'total', highlight: 'blue' },
  { letter: 'R', name: 'No. GRPO', width: 120, align: 'left', key: 'grpo', highlight: 'amber' },
  { letter: 'S', name: 'LAST DATE OF GRPO', width: 145, align: 'left', key: 'lastGrpoDate', highlight: 'amber' },
  { letter: 'T', name: 'TANGGAL BAYAR', width: 120, align: 'left', key: 'tglBayar', highlight: 'cyan' },
  { letter: 'U', name: 'TANGGAL INVOICE', width: 120, align: 'left', key: 'tglInvoice', highlight: 'cyan' },
  { letter: 'V', name: 'NO. INVOICE', width: 135, align: 'left', key: 'noInvoice', highlight: 'cyan' },
  { letter: 'W', name: 'KET', width: 210, align: 'left', key: 'ket' },
];

export default function SpreadsheetGrid({
  rows = [],
  selectedRow,
  onSelectRow,
  onEditPo,
  onCancelPo,
  statusFilter,
  onStatusFilterChange,
  searchQuery,
  onSearchChange,
  isDrawerOpen,
  onToggleDrawer,
  isDark,
}) {
  const scrollContainerRef = useRef(null);
  const [pipelineFilter, setPipelineFilter] = React.useState('ALL');

  const formatRupiah = (val) => {
    return 'Rp ' + Number(val || 0).toLocaleString('id-ID');
  };

  const scrollGrid = (pos) => {
    if (!scrollContainerRef.current) return;
    if (pos === 'start') {
      scrollContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    } else if (pos === 'middle') {
      scrollContainerRef.current.scrollTo({ left: 750, behavior: 'smooth' });
    } else if (pos === 'end') {
      scrollContainerRef.current.scrollTo({ left: 1600, behavior: 'smooth' });
    }
  };

  const getStatusBadge = (status) => {
    const s = (status || '').toLowerCase().trim();
    if (s.startsWith('clos') || s === 'lunas' || s === 'done' || s === 'selesai') return <Tag color="green">Close</Tag>;
    if (s.startsWith('pend') || s === 'hold' || s === 'menunggu') return <Tag color="orange">Pending</Tag>;
    if (s.startsWith('cancel') || s === 'batal') return <Tag color="red">Cancelled</Tag>;
    return <Tag color="blue">Open</Tag>;
  };

  // Pipeline Filter calculation
  const filteredRows = React.useMemo(() => {
    if (pipelineFilter === 'ALL') return rows;
    return rows.filter((r) => {
      const isCancelled = (r.status || '').toLowerCase().includes('cancel');
      if (pipelineFilter === 'BELUM_GRPO') {
        if (isCancelled) return false;
        const grpo = (r.grpo || '').trim().toLowerCase();
        return !grpo || grpo === '-' || grpo.includes('belum');
      }
      if (pipelineFilter === 'BELUM_BAYAR') {
        if (isCancelled) return false;
        const tglBayar = (r.tglBayar || '').trim().toLowerCase();
        return !tglBayar || tglBayar === '-' || tglBayar.includes('belum');
      }
      if (pipelineFilter === 'LUNAS') {
        const s = (r.status || '').toLowerCase();
        const tglBayar = (r.tglBayar || '').trim().toLowerCase();
        const hasBayar = tglBayar && tglBayar !== '-' && !tglBayar.includes('belum');
        return s.startsWith('clos') || s === 'lunas' || hasBayar;
      }
      return true;
    });
  }, [rows, pipelineFilter]);

  const totalSumQ = filteredRows.reduce((acc, r) => acc + (!r.status?.toLowerCase().includes('cancel') ? (r.total || 0) : 0), 0);

  const cardBg = isDark ? '#0a252a' : '#ffffff';
  const borderColor = isDark ? '#133e46' : '#e0e5e9';
  const textColor = isDark ? '#fbfcfc' : '#055b65';
  const headerBg = isDark ? '#071f24' : '#f2f6f7';
  const mutedColor = isDark ? '#8ea8ab' : '#5c7e84';

  // Counts for pipeline filters
  const pipelineCounts = React.useMemo(() => {
    let belumGrpo = 0;
    let belumBayar = 0;
    let lunas = 0;
    rows.forEach((r) => {
      const isCancelled = (r.status || '').toLowerCase().includes('cancel');
      if (!isCancelled) {
        const grpo = (r.grpo || '').trim().toLowerCase();
        if (!grpo || grpo === '-' || grpo.includes('belum')) belumGrpo++;
        const tglBayar = (r.tglBayar || '').trim().toLowerCase();
        if (!tglBayar || tglBayar === '-' || tglBayar.includes('belum')) belumBayar++;
      }
      const s = (r.status || '').toLowerCase();
      const tglBayar = (r.tglBayar || '').trim().toLowerCase();
      if (s.startsWith('clos') || s === 'lunas' || (tglBayar && tglBayar !== '-' && !tglBayar.includes('belum'))) {
        lunas++;
      }
    });
    return { belumGrpo, belumBayar, lunas };
  }, [rows]);

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: cardBg,
        borderRadius: 12,
        border: `1px solid ${borderColor}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      }}
    >
      {/* Toolbar: Search, Status Filter & Pipeline Filter */}
      <div
        style={{
          padding: '10px 16px',
          borderBottom: `1px solid ${borderColor}`,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.6)' : '#fafafa',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Input
            prefix={<AiOutlineSearch style={{ color: '#94a3b8' }} />}
            placeholder="Cari No PO, Supplier, Material, GRPO..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            allowClear
            style={{ width: 240, borderRadius: 8, fontSize: 12 }}
          />

          {/* Status Filter */}
          <div
            style={{
              display: 'flex',
              backgroundColor: isDark ? '#071f24' : '#f2f6f7',
              padding: 3,
              borderRadius: 8,
              border: `1px solid ${borderColor}`,
            }}
          >
            {['ALL', 'Open', 'Close', 'Pending', 'Cancelled'].map((st) => (
              <button
                key={st}
                onClick={() => onStatusFilterChange(st)}
                style={{
                  padding: '4px 9px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 11,
                  fontWeight: statusFilter === st ? 700 : 500,
                  backgroundColor: statusFilter === st ? (isDark ? '#133e46' : '#ffffff') : 'transparent',
                  color: statusFilter === st ? (isDark ? '#1bd488' : '#055b65') : mutedColor,
                  cursor: 'pointer',
                  boxShadow: statusFilter === st ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {st === 'ALL' ? 'Semua' : st}
              </button>
            ))}
          </div>

          {/* Quick Pipeline Filter (Operational Stages) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: isDark ? 'rgba(7, 31, 36, 0.7)' : '#f8fafc',
              padding: 2,
              borderRadius: 8,
              border: `1px solid ${borderColor}`,
              gap: 2,
            }}
          >
            {[
              { id: 'ALL', label: 'Semua Tahap', count: rows.length },
              { id: 'BELUM_GRPO', label: 'Belum GRPO', count: pipelineCounts.belumGrpo },
              { id: 'BELUM_BAYAR', label: 'Belum Bayar', count: pipelineCounts.belumBayar },
              { id: 'LUNAS', label: 'Lunas', count: pipelineCounts.lunas },
            ].map((p) => {
              const isActive = pipelineFilter === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setPipelineFilter(p.id)}
                  className="smooth-clickable"
                  style={{
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: 'none',
                    fontSize: 11,
                    fontWeight: isActive ? 700 : 500,
                    backgroundColor: isActive
                      ? (isDark ? '#1bd488' : '#055b65')
                      : 'transparent',
                    color: isActive
                      ? (isDark ? '#05191d' : '#ffffff')
                      : mutedColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                >
                  <span>{p.label}</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "'JetBrains Mono', monospace",
                      padding: '0 4px',
                      borderRadius: 4,
                      backgroundColor: isActive
                        ? (isDark ? 'rgba(5, 25, 29, 0.25)' : '#45828b')
                        : (isDark ? '#133e46' : '#e0e5e9'),
                      color: isActive ? '#ffffff' : mutedColor,
                    }}
                  >
                    {p.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Toolbar: Column Jumper & Row Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ color: mutedColor, fontSize: 11, fontWeight: 600 }}>Navigasi Kolom:</span>
          <div style={{ display: 'flex', border: `1px solid ${borderColor}`, borderRadius: 8, overflow: 'hidden' }}>
            <button
              onClick={() => scrollGrid('start')}
              style={{
                padding: '4px 8px',
                border: 'none',
                backgroundColor: cardBg,
                color: textColor,
                fontSize: 11,
                cursor: 'pointer',
                borderRight: `1px solid ${borderColor}`,
              }}
            >
              A-I: Barang
            </button>
            <button
              onClick={() => scrollGrid('middle')}
              style={{
                padding: '4px 8px',
                border: 'none',
                backgroundColor: cardBg,
                color: textColor,
                fontSize: 11,
                cursor: 'pointer',
                borderRight: `1px solid ${borderColor}`,
              }}
            >
              J-Q: Total
            </button>
            <button
              onClick={() => scrollGrid('end')}
              style={{
                padding: '4px 8px',
                border: 'none',
                backgroundColor: cardBg,
                color: textColor,
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              R-W: GRPO
            </button>
          </div>

          <Button
            size="small"
            icon={isDrawerOpen ? <AiOutlineMenuFold /> : <AiOutlineMenuUnfold />}
            onClick={onToggleDrawer}
            style={{ fontSize: 11, borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            {isDrawerOpen ? 'Tutup Detail' : 'Buka Detail'}
          </Button>
        </div>
      </div>

      {/* 23-Column Google Sheet Grid */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          userSelect: 'none',
        }}
      >
        <table className="gsheet-table" style={{ width: '100%', fontSize: 11 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 30 }}>
            {/* Row 0: Column Letters (A - W) */}
            <tr>
              <th className="col-letter sticky-col-0" style={{ backgroundColor: headerBg, width: 40 }}></th>
              {COLUMNS_DEF.map((col) => (
                <th
                  key={col.letter}
                  className={`col-letter ${col.sticky ? 'sticky-col-2 freeze-border' : ''}`}
                  style={{
                    backgroundColor: headerBg,
                    width: col.width,
                    minWidth: col.width,
                    color: mutedColor,
                    borderColor: borderColor,
                  }}
                >
                  {col.letter}
                </th>
              ))}
            </tr>
            {/* Row 1: Header Titles */}
            <tr style={{ backgroundColor: isDark ? '#1e293b' : '#f1f5f9', color: textColor, fontWeight: 700 }}>
              <th className="row-number sticky-col-0" style={{ backgroundColor: isDark ? '#1e293b' : '#f1f5f9', borderColor }}>
                1
              </th>
              {COLUMNS_DEF.map((col) => {
                let colBg = isDark ? '#1e293b' : '#f1f5f9';
                if (col.highlight === 'emerald') colBg = isDark ? 'rgba(5, 150, 105, 0.25)' : '#ecfdf5';
                if (col.highlight === 'blue') colBg = isDark ? 'rgba(37, 99, 235, 0.25)' : '#eff6ff';
                if (col.highlight === 'amber') colBg = isDark ? 'rgba(217, 119, 6, 0.2)' : '#fffbeb';
                if (col.highlight === 'cyan') colBg = isDark ? 'rgba(8, 145, 178, 0.18)' : '#ecfeff';

                return (
                  <th
                    key={col.name}
                    className={col.sticky ? 'sticky-col-2 freeze-border' : ''}
                    style={{
                      padding: '7px 8px',
                      textAlign: col.align,
                      backgroundColor: colBg,
                      width: col.width,
                      minWidth: col.width,
                      borderColor,
                    }}
                  >
                    {col.name}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={24} style={{ textAlign: 'center', padding: '40px 0', color: mutedColor }}>
                  Tidak ada baris transaksi yang cocok dengan filter.
                </td>
              </tr>
            ) : (
              filteredRows.map((r, rowIdx) => {
                const isRowSelected = selectedRow?.rowIndex === r.rowIndex;
                const rNumber = r.rowIndex || rowIdx + 2;
                return (
                  <tr
                    key={rNumber}
                    onClick={() => onSelectRow(r)}
                    className={`gsheet-row ${isRowSelected ? 'row-selected' : ''}`}
                    style={{
                      backgroundColor: isRowSelected
                        ? (isDark ? 'rgba(37, 99, 235, 0.18)' : '#edf5ff')
                        : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    {/* Row Index Coordinate Header */}
                    <td
                      className="row-number sticky-col-0"
                      style={{
                        backgroundColor: isRowSelected
                          ? (isDark ? 'rgba(37, 99, 235, 0.35)' : '#dbeafe')
                          : headerBg,
                        color: isRowSelected
                          ? (isDark ? '#93c5fd' : '#1d4ed8')
                          : mutedColor,
                        fontWeight: isRowSelected ? 700 : 600,
                        fontFamily: "'JetBrains Mono', monospace",
                        borderLeft: isRowSelected ? '3px solid #2563eb' : undefined,
                        borderTop: isRowSelected ? '1.5px solid #2563eb' : `1px solid ${borderColor}`,
                        borderBottom: isRowSelected ? '1.5px solid #2563eb' : `1px solid ${borderColor}`,
                      }}
                    >
                      {rNumber}
                    </td>

                    {/* 23 Columns */}
                    {COLUMNS_DEF.map((col, cIdx) => {
                      let cellContent = r[col.key];

                      if (col.key === 'status') {
                        cellContent = getStatusBadge(r.status);
                      } else if (col.key === 'priceUnit') {
                        cellContent = formatRupiah(r.priceUnit);
                      } else if (col.key === 'total') {
                        cellContent = <strong style={{ color: '#2563eb' }}>{formatRupiah(r.total)}</strong>;
                      } else if (col.key === 'discount' && r.discount > 0) {
                        cellContent = `${(r.discount * 100).toFixed(0)}%`;
                      } else if (col.key === 'ppn' && r.ppn > 0) {
                        cellContent = formatRupiah(r.ppn);
                      }

                      const isLastCol = cIdx === COLUMNS_DEF.length - 1;
                      const isMonospace = col.align === 'right' || ['noPo', 'date', 'lastGrpoDate', 'tglBayar', 'tglInvoice', 'kode'].includes(col.key);

                      return (
                        <td
                          key={col.letter}
                          onClick={() => onSelectRow(r)}
                          className={col.sticky ? 'sticky-col-2 freeze-border' : ''}
                          style={{
                            padding: '6px 8px',
                            textAlign: col.align,
                            fontFamily: isMonospace ? "'JetBrains Mono', monospace" : 'inherit',
                            backgroundColor: isRowSelected
                              ? (isDark ? 'rgba(37, 99, 235, 0.16)' : '#edf5ff')
                              : undefined,
                            borderTop: isRowSelected ? '1.5px solid #2563eb' : `1px solid ${borderColor}`,
                            borderBottom: isRowSelected ? '1.5px solid #2563eb' : `1px solid ${borderColor}`,
                            borderRight: isRowSelected && isLastCol ? '1.5px solid #2563eb' : `1px solid ${borderColor}`,
                            color: textColor,
                          }}
                        >
                          {cellContent || '-'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Card Bottom Summary Bar (Google Sheets Style) */}
      <div
        style={{
          height: 32,
          padding: '0 16px',
          borderTop: `1px solid ${borderColor}`,
          backgroundColor: isDark ? '#0b1120' : '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          color: mutedColor,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="live-dot-green" style={{ width: 6, height: 6 }} />
          <span style={{ fontWeight: 'bold', color: '#059669' }}>Google Sheets API v4 (Live CRUD)</span>
          <span>•</span>
          <span>Klik baris untuk melihat ringkasan di panel samping</span>
        </div>
        <div className="tabular-nums" style={{ display: 'flex', alignItems: 'center', gap: 16, fontFamily: "'JetBrains Mono', monospace" }}>
          <span>
            BARIS: <strong style={{ color: textColor }}>{filteredRows.length}</strong>
            {filteredRows.length !== rows.length && (
              <span style={{ color: mutedColor }}> / {rows.length}</span>
            )}
          </span>
          <span>
            SUM (Q): <strong style={{ color: textColor }}>{formatRupiah(totalSumQ)}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
