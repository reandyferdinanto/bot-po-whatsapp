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
import PlaceholderModuleView from './components/PlaceholderModuleView';
import FinanceDashboardView from './components/FinanceDashboardView';
import FinanceBudgetPublicForm from './components/FinanceBudgetPublicForm';
import GoogleDriveSettingsView from './components/GoogleDriveSettingsView';
import { getStats, getPOs, createPO, updatePO, cancelPO, triggerSync, getKursUsd, refreshKursUsd } from './services/api';

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const [isDark, setIsDark] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  // Data states
  const [stats, setStats] = useState(null);
  const [kurs, setKurs] = useState(null);
  const [isRefreshingKurs, setIsRefreshingKurs] = useState(false);
  const [rows, setRows] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [targetPoRow, setTargetPoRow] = useState(null);

  // Derive activeNav based on current URL path
  const getActiveNavFromPath = (pathname) => {
    if (pathname.startsWith('/multi-ocr')) return 'multi-ocr';
    if (pathname === '/statistik' || pathname === '/analytics') return 'analytics';
    if (pathname === '/database-material' || pathname === '/material') return 'material';
    if (pathname === '/database-supplier' || pathname === '/supplier') return 'supplier';
    if (pathname === '/warehouse') return 'warehouse';
    if (pathname === '/finance') return 'finance';
    if (pathname === '/maintenance') return 'maintenance';
    if (pathname === '/status-sistem' || pathname === '/topology') return 'topology';
    if (pathname === '/settings/drive' || pathname === '/drive') return 'drive-settings';
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
  const isPublicForm = location.pathname === '/form-budget' || location.pathname === '/form-lpj';

  if (isPublicForm) {
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
        <Routes>
          <Route path="/form-budget" element={<FinanceBudgetPublicForm mode="request" isDark={isDark} />} />
          <Route path="/form-lpj" element={<FinanceBudgetPublicForm mode="lpj" isDark={isDark} />} />
        </Routes>
      </ConfigProvider>
    );
  }

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
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
        />

        {/* Main Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <Header
            activeNav={activeNav}
            stats={stats}
            isSyncing={isSyncing}
            onSync={handleManualSync}
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
                      onStatusFilterChange={setStatusFilter}
                      activeStatusFilter={statusFilter}
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
                      onStatusFilterChange={setStatusFilter}
                      activeStatusFilter={statusFilter}
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

              {/* Modul Standalone: Warehouse, Finance, Maintenance */}
              <Route
                path="/warehouse"
                element={<PlaceholderModuleView module="warehouse" isDark={isDark} />}
              />
              <Route
                path="/finance"
                element={<FinanceDashboardView isDark={isDark} />}
              />
              <Route
                path="/maintenance"
                element={<PlaceholderModuleView module="maintenance" isDark={isDark} />}
              />
              <Route
                path="/form-budget"
                element={<FinanceBudgetPublicForm mode="request" isDark={isDark} />}
              />
              <Route
                path="/form-lpj"
                element={<FinanceBudgetPublicForm mode="lpj" isDark={isDark} />}
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

              {/* Halaman 6: Pengaturan Google Drive */}
              <Route
                path="/settings/drive"
                element={<GoogleDriveSettingsView isDark={isDark} />}
              />
              <Route
                path="/drive"
                element={<Navigate to="/settings/drive" replace />}
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
