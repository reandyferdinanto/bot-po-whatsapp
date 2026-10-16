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

export default api;
