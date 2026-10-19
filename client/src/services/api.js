import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
});

export async function getStats() {
  const res = await api.get('/stats');
  return res.data;
}

export async function getPOs(params = {}) {
  const res = await api.get('/pos', { params });
  return res.data;
}

export async function getPODetail(noPo) {
  const res = await api.get(`/pos/${encodeURIComponent(noPo)}`);
  return res.data;
}

export async function createPO(poData) {
  const res = await api.post('/pos', poData);
  return res.data;
}

export async function updatePO(noPo, updateData) {
  const res = await api.patch(`/pos/${encodeURIComponent(noPo)}`, updateData);
  return res.data;
}

export async function cancelPO(noPo, reason) {
  const res = await api.delete(`/pos/${encodeURIComponent(noPo)}`, {
    data: { reason },
  });
  return res.data;
}

export async function getMaterials(params = {}) {
  const res = await api.get('/materials', { params });
  return res.data;
}

export async function getSuppliers(params = {}) {
  const res = await api.get('/suppliers', { params });
  return res.data;
}

export async function triggerSync() {
  const res = await api.post('/sync');
  return res.data;
}

export async function syncAllSheets() {
  const res = await api.post('/sync-all', {}, { timeout: 300000 }); // allow up to 5 mins for all sheets
  return res.data;
}

export async function getHistoricalStats() {
  const res = await api.get('/stats/historical');
  return res.data;
}

export async function getHistoricalPOs(params = {}) {
  const res = await api.get('/pos/historical', { params });
  return res.data;
}

export async function parseOcrFiles(files) {
  const formData = new FormData();
  for (const f of files) {
    formData.append('files', f);
  }
  const res = await api.post('/ocr/parse', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 180000, // OCR might take up to 3 mins for multiple large PDFs
  });
  return res.data;
}

export async function commitBatchOCR(pos) {
  const res = await api.post('/ocr/batch-commit', { pos });
  return res.data;
}

export async function sendTestWhatsApp(chatId, text) {
  const res = await api.post('/openwa/send-test', { chatId, text });
  return res.data;
}

export async function getKursUsd(refresh = false) {
  const res = await api.get('/kurs/usd', { params: { refresh: !!refresh } });
  return res.data;
}

export async function refreshKursUsd() {
  const res = await api.post('/kurs/usd/refresh');
  return res.data;
}

// ==========================================
// Finance / Kasbon & Budget Request APIs
// ==========================================

export async function getBudgets(params = {}) {
  const res = await api.get('/finance/budgets', { params });
  return res.data;
}

export async function getBudgetDetail(noBudget) {
  const res = await api.get(`/finance/budgets/${encodeURIComponent(noBudget)}`);
  return res.data;
}

export async function createBudget(data) {
  const res = await api.post('/finance/budgets', data);
  return res.data;
}

export async function approveBudget(noBudget, data = {}) {
  const res = await api.post(`/finance/budgets/${encodeURIComponent(noBudget)}/approve`, data);
  return res.data;
}

export async function rejectBudget(noBudget, data = {}) {
  const res = await api.post(`/finance/budgets/${encodeURIComponent(noBudget)}/reject`, data);
  return res.data;
}

export async function submitBudgetLpj(noBudget, data) {
  const res = await api.post(`/finance/budgets/${encodeURIComponent(noBudget)}/lpj`, data);
  return res.data;
}

export async function closeBudget(noBudget, data = {}) {
  const res = await api.post(`/finance/budgets/${encodeURIComponent(noBudget)}/close`, data);
  return res.data;
}

export async function syncBudgets() {
  const res = await api.post('/finance/budgets/sync');
  return res.data;
}

export async function uploadNotaFiles(files) {
  const formData = new FormData();
  for (const f of files) {
    formData.append('files', f);
  }
  const res = await api.post('/finance/upload-nota', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });
  return res.data;
}

// Google Drive Settings & Documents
export async function getDriveSettings() {
  const res = await api.get('/settings/drive');
  return res.data;
}

export async function saveDriveSettings(data) {
  const res = await api.post('/settings/drive', data);
  return res.data;
}

export async function testDriveAccess(folderUrlOrId) {
  const res = await api.post('/settings/drive/test', { folderUrlOrId });
  return res.data;
}

export async function getPoDocuments(noPo, docType) {
  const res = await api.get(`/documents/po/${encodeURIComponent(noPo)}`, {
    params: { docType },
  });
  return res.data;
}

export async function uploadPoDocument(noPo, docType, file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('noPo', noPo);
  if (docType) formData.append('docType', docType);
  const res = await api.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function getGoogleAuthUrl(redirectUri) {
  const res = await api.get('/auth/google/url', { params: { redirectUri } });
  return res.data;
}

export async function exchangeGoogleCode(code, redirectUri) {
  const res = await api.post('/auth/google/exchange', { code, redirectUri });
  return res.data;
}

export default api;

