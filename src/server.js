import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { config, connectionState } from './config.js';
import { demoSuppliers } from './demo.js';
import { fetchAllSuppliers } from './yonsuite.js';
import { listSuppliers, upsertSuppliers } from './repository.js';

const app = express();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
app.use(express.json());
app.use(express.static(path.join(root, 'public')));

function demoList(query) {
  const term = String(query.search || '').toLowerCase();
  const status = String(query.status || '');
  const filtered = demoSuppliers.filter(x => (!status || x.status === status) && (!term || [x.code,x.name,x.contact,x.taxNumber].some(v => v.toLowerCase().includes(term))));
  return { items: filtered, total: filtered.length };
}

app.get('/api/status', (_req, res) => res.json({ ...connectionState(), lastSync: config.demoMode ? '2026-09-28T08:32:16Z' : null }));
app.get('/api/suppliers', async (req, res, next) => {
  try { res.json(config.demoMode ? demoList(req.query) : await listSuppliers(req.query)); } catch (e) { next(e); }
});
app.post('/api/sync', async (_req, res, next) => {
  try {
    if (config.demoMode) return res.json({ count: demoSuppliers.length, demo: true });
    const suppliers = await fetchAllSuppliers();
    await upsertSuppliers(suppliers);
    res.json({ count: suppliers.length });
  } catch (e) { next(e); }
});
app.get('/api/export', async (req, res, next) => {
  try {
    const result = config.demoMode ? demoList(req.query) : await listSuppliers({ ...req.query, pageSize: 100000 });
    const rows = result.items.map(({ raw, ...item }) => ({ '供应商编码':item.code,'供应商名称':item.name,'状态':item.status,'分类':item.category,'联系人':item.contact,'联系电话':item.phone,'统一社会信用代码':item.taxNumber,'地址':item.address,'更新时间':item.updatedAt, ...raw }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), '供应商');
    const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
    res.set({ 'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition':`attachment; filename="suppliers-${new Date().toISOString().slice(0,10)}.xlsx"` }).send(buffer);
  } catch (e) { next(e); }
});
app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ message: error.message || '服务器内部错误' }); });

if (process.env.NODE_ENV !== 'test') app.listen(config.port, () => console.log(`Supplier Hub: http://localhost:${config.port}`));
export default app;
