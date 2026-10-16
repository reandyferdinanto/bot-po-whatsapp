import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, theme as antTheme, message } from 'antd';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import KpiCards from './components/KpiCards';
import SpreadsheetGrid from './components/SpreadsheetGrid';
import RowInspectorDrawer from './components/RowInspectorDrawer';
import CreatePoModal from './components/CreatePoModal';
import EditPoModal from './components/EditPoModal';
import CancelPoModal from './components/CancelPoModal';
import MultiOcrPanel from './components/MultiOcrPanel';
import MaterialsTable from './components/MaterialsTable';
import SuppliersTable from './components/SuppliersTable';
import SystemTopologyPanel from './components/SystemTopologyPanel';
import HistoricalStatsView from './components/HistoricalStatsView';
import { getStats, getPOs, createPO, updatePO, cancelPO, triggerSync, syncAllSheets, getKursUsd, refreshKursUsd } from './services/api';

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const [isDark, setIsDark] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);

  // Data states
  const [stats, setStats] = useState(null);
  const [kurs, setKurs] = useState(null);
  const [isRefreshingKurs, setIsRefreshingKurs] = useState(false);
  const [rows, setRows] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [targetPoRow, setTargetPoRow] = useState(null);

  // Derive activeNav based on current URL path
  const getActiveNavFromPath = (pathname) => {
    if (pathname === '/statistik' || pathname === '/analytics') return 'analytics';
    if (pathname === '/multi-ocr') return 'multi-ocr';
    if (pathname === '/database-material' || pathname === '/material') return 'material';
    if (pathname === '/database-supplier' || pathname === '/supplier') return 'supplier';
    if (pathname === '/status-sistem' || pathname === '/topology') return 'topology';
    return 'po2026';
  };

  const activeNav = getActiveNavFromPath(location.pathname);

  const loadData = async () => {
    setIsSyncing(true);
    try {
      const [statsRes, poRes, kursRes] = await Promise.all([
        getStats().catch(() => ({ stats: {} })),
        getPOs({ status: statusFilter, search: searchQuery }).catch(() => ({ rows: [] })),
        getKursUsd().catch(() => ({ success: false })),
      ]);

      if (statsRes?.stats) setStats(statsRes.stats);
      if (kursRes?.data) {
        setKurs(kursRes.data);
      } else if (statsRes?.stats?.kursUsd) {
        setKurs(statsRes.stats.kursUsd);
      }

      if (poRes?.rows) {
        setRows(poRes.rows);
        if (poRes.rows.length > 0 && !selectedRow) {
          setSelectedRow(poRes.rows[0]);
        }
      }
    } catch (err) {
      console.warn('Gagal memuat data:', err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRefreshKurs = async () => {
    setIsRefreshingKurs(true);
    try {
      const res = await refreshKursUsd();
      if (res?.success && res.data) {
        setKurs(res.data);
        message.success(`Kurs USD diperbarui: Rp ${res.data.kursTengah} (${res.data.tanggal})`);
      }
    } catch (err) {
      message.error(`Gagal memperbarui kurs USD: ${err.message}`);
    } finally {
      setIsRefreshingKurs(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, searchQuery]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await triggerSync();
      message.success('Master data & transaksi berhasil disinkronkan dengan Google Sheets!');
      await loadData();
    } catch (err) {
      message.error(`Gagal sinkronisasi: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncAll = async () => {
    setIsSyncingAll(true);
    message.loading({
      content: 'Sedang menyinkronkan seluruh sheet (PO 2017 s/d PO 2026)...',
      key: 'sync-all-header',
      duration: 0,
    });
    try {
      const res = await syncAllSheets();
      message.destroy('sync-all-header');
      if (res.success) {
        message.success(`Berhasil menyinkronkan ${res.totalSheets} tab sheet (${res.totalAllRows} baris)!`);
        await loadData();
      }
    } catch (err) {
      message.destroy('sync-all-header');
      message.error(`Gagal sinkronisasi seluruh sheet: ${err.message}`);
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleCreatePoSuccess = async (values) => {
    await createPO(values);
    await loadData();
    navigate('/po-2026');
  };

  const handleEditPoSuccess = async (noPo, values) => {
    await updatePO(noPo, values);
    await loadData();
  };

  const handleCancelPoSuccess = async (noPo, reason) => {
    await cancelPO(noPo, reason);
    await loadData();
  };

  const openEditModal = (row) => {
    setTargetPoRow(row);
    setEditModalOpen(true);
  };

  const openCancelModal = (row) => {
    setTargetPoRow(row);
    setCancelModalOpen(true);
  };

  const toggleTheme = () => {
    setIsDark((prev) => !prev);
  };

  const mainBg = isDark ? '#090d16' : '#f1f5f9';

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#047857',
          borderRadius: 8,
          fontFamily: "'Calibri', 'Carlito', sans-serif",
        },
      }}
    >
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          overflow: 'hidden',
          backgroundColor: mainBg,
          color: isDark ? '#f8fafc' : '#0f172a',
        }}
      >
        {/* Sidebar with Route Navigation */}
        <Sidebar
          activeNav={activeNav}
          onNavigate={(path) => navigate(path)}
          stats={stats}
          isDark={isDark}
        />

        {/* Main Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <Header
            activeNav={activeNav}
            stats={stats}
            isSyncing={isSyncing}
            isSyncingAll={isSyncingAll}
            onSync={handleManualSync}
            onSyncAll={handleSyncAll}
            onOpenCreateModal={() => setCreateModalOpen(true)}
            onOpenOcrTab={() => navigate('/multi-ocr')}
            isDark={isDark}
            toggleTheme={toggleTheme}
            kurs={kurs}
            isRefreshingKurs={isRefreshingKurs}
            onRefreshKurs={handleRefreshKurs}
          />

          {/* Main Body Routed Views */}
          <main
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              padding: 16,
              gap: 14,
            }}
          >
            <Routes>
              {/* Halaman 1: PO 2026 (Root & /po-2026) */}
              <Route
                path="/"
                element={
                  <>
                    <KpiCards
                      stats={stats}
                      isDark={isDark}
                      kurs={kurs}
                      onRefreshKurs={handleRefreshKurs}
                      isRefreshingKurs={isRefreshingKurs}
                    />
                    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', gap: 12 }}>
                      <SpreadsheetGrid
                        rows={rows}
                        selectedRow={selectedRow}
                        onSelectRow={setSelectedRow}
                        onEditPo={openEditModal}
                        onCancelPo={openCancelModal}
                        statusFilter={statusFilter}
                        onStatusFilterChange={setStatusFilter}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        isDrawerOpen={isDrawerOpen}
                        onToggleDrawer={() => setIsDrawerOpen((prev) => !prev)}
                        isDark={isDark}
                      />

                      {isDrawerOpen && (
                        <RowInspectorDrawer
                          selectedRow={selectedRow}
                          allRows={rows}
                          onEditPo={openEditModal}
                          onCancelPo={openCancelModal}
                          onClose={() => setIsDrawerOpen(false)}
                          isDark={isDark}
                        />
                      )}
                    </div>
                  </>
                }
              />
              <Route
                path="/po-2026"
                element={
                  <>
                    <KpiCards
                      stats={stats}
                      isDark={isDark}
                      kurs={kurs}
                      onRefreshKurs={handleRefreshKurs}
                      isRefreshingKurs={isRefreshingKurs}
                    />
                    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', gap: 12 }}>
                      <SpreadsheetGrid
                        rows={rows}
                        selectedRow={selectedRow}
                        onSelectRow={setSelectedRow}
                        onEditPo={openEditModal}
                        onCancelPo={openCancelModal}
                        statusFilter={statusFilter}
                        onStatusFilterChange={setStatusFilter}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        isDrawerOpen={isDrawerOpen}
                        onToggleDrawer={() => setIsDrawerOpen((prev) => !prev)}
                        isDark={isDark}
                      />

                      {isDrawerOpen && (
                        <RowInspectorDrawer
                          selectedRow={selectedRow}
                          allRows={rows}
                          onEditPo={openEditModal}
                          onCancelPo={openCancelModal}
                          onClose={() => setIsDrawerOpen(false)}
                          isDark={isDark}
                        />
                      )}
                    </div>
                  </>
                }
              />

              {/* Halaman Statistik Multi-Tahun (2017 - 2026) */}
              <Route
                path="/statistik"
                element={<HistoricalStatsView isDark={isDark} />}
              />
              <Route
                path="/analytics"
                element={<Navigate to="/statistik" replace />}
              />

              {/* Halaman 2: Smart Multi-OCR */}
              <Route
                path="/multi-ocr"
                element={
                  <MultiOcrPanel
                    onPoCommitted={() => {
                      loadData();
                    }}
                    isDark={isDark}
                  />
                }
              />

              {/* Halaman 3: database Material */}
              <Route
                path="/database-material"
                element={<MaterialsTable isDark={isDark} />}
              />
              <Route
                path="/material"
                element={<Navigate to="/database-material" replace />}
              />

              {/* Halaman 4: database Supplier Material */}
              <Route
                path="/database-supplier"
                element={<SuppliersTable isDark={isDark} />}
              />
              <Route
                path="/supplier"
                element={<Navigate to="/database-supplier" replace />}
              />

              {/* Halaman 5: Status Sistem & Bot WA */}
              <Route
                path="/status-sistem"
                element={
                  <SystemTopologyPanel
                    stats={stats}
                    onRefresh={loadData}
                    isDark={isDark}
                    kurs={kurs}
                    onRefreshKurs={handleRefreshKurs}
                    isRefreshingKurs={isRefreshingKurs}
                  />
                }
              />
              <Route
                path="/topology"
                element={<Navigate to="/status-sistem" replace />}
              />

              {/* Fallback to /po-2026 */}
              <Route path="*" element={<Navigate to="/po-2026" replace />} />
            </Routes>
          </main>
        </div>

        {/* Modals */}
        <CreatePoModal
          visible={createModalOpen}
          onCancel={() => setCreateModalOpen(false)}
          onSuccess={handleCreatePoSuccess}
          isDark={isDark}
        />

        <EditPoModal
          visible={editModalOpen}
          poRow={targetPoRow}
          allRows={rows}
          onCancel={() => setEditModalOpen(false)}
          onSuccess={handleEditPoSuccess}
          isDark={isDark}
        />

        <CancelPoModal
          visible={cancelModalOpen}
          poRow={targetPoRow}
          onCancel={() => setCancelModalOpen(false)}
          onSuccess={handleCancelPoSuccess}
        />
      </div>
    </ConfigProvider>
  );
}
