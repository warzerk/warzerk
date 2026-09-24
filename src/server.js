import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { buildVendorWorkbook, exportFilename } from "./exportExcel.js";
import { labelFor, preferredIndex } from "./fields.js";
import { presentVendor, summaryVendor } from "./present.js";
import { startScheduler } from "./scheduler.js";
import { assertReady, mergeDraft, publicSettings } from "./settings.js";
import { createStore } from "./store.js";
import { createSyncService } from "./sync.js";
import { YonSuiteClient } from "./yonsuite.js";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public");
const EXPORT_LIMIT = 50000;

function filterFromQuery(query) {
  return {
    q: query.q || "",
    stopped: query.stopped,
  };
}

function route(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function createApp({ config, store, client, syncService }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/status", route(async (_req, res) => {
    const settings = await store.getSettings();
    res.json({
      dbDriver: store.driver,
      database: store.describe(),
      vendorCount: await store.countVendors({}),
      watermark: await store.getState("watermark_pubts"),
      scheduler: {
        enabled: config.syncDailyHour != null,
        hour: config.syncDailyHour,
        lastAutoDay: await store.getState("auto_sync_day"),
      },
      sync: syncService.status(),
      credentialsConfigured: Boolean(settings.gatewayHost && settings.appKey && settings.appSecret),
    });
  }));

  app.get("/api/settings", route(async (_req, res) => {
    res.json(publicSettings(await store.getSettings()));
  }));

  app.put("/api/settings", route(async (req, res) => {
    const saved = await store.saveSettings(req.body || {});
    client.invalidate();
    res.json(publicSettings(saved));
  }));

  app.post("/api/settings/test", route(async (req, res) => {
    const current = await store.getSettings();
    const draft = mergeDraft(current, req.body || {});
    assertReady(draft);
    client.invalidate();
    await client.getAccessToken(draft, { force: true });
    const page = await client.listVendors(draft, {
      pageIndex: "1",
      pageSize: "1",
      stopstatus: "false",
    });
    res.json({
      ok: true,
      message: `连接成功。启用供应商接口返回约 ${page.recordCount} 条，停用供应商会在同步时另行拉取。`,
    });
  }));

  app.post("/api/sync", route(async (req, res) => {
    const mode = req.body?.mode;
    const settings = await syncService.prepare(mode);
    res.status(202).json(syncService.launch(mode, settings, { background: true }));
  }));

  app.get("/api/sync/status", (_req, res) => {
    res.json(syncService.status());
  });

  app.get("/api/sync/history", route(async (_req, res) => {
    res.json({ items: await store.listRuns() });
  }));

  app.get("/api/vendors", route(async (req, res) => {
    const full = req.query.view === "full";
    const result = await store.queryVendors({
      ...filterFromQuery(req.query),
      page: req.query.page,
      pageSize: req.query.pageSize,
      includePayload: full,
    });
    const items = result.items.map((row) => summaryVendor(row, { includeFlat: full }));
    let columns = [];
    if (full) {
      const seen = new Set();
      const keys = [];
      for (const item of items) {
        for (const key of Object.keys(item.flat || {})) {
          if (!seen.has(key)) {
            seen.add(key);
            keys.push(key);
          }
        }
      }
      keys.sort((a, b) => preferredIndex(a) - preferredIndex(b) || a.localeCompare(b, "zh-CN"));
      columns = keys.map((key) => ({ key, label: labelFor(key) }));
    }
    res.json({
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      columns,
      items,
    });
  }));

  app.get("/api/vendors/:vendorId", route(async (req, res) => {
    const record = await store.getVendor(req.params.vendorId);
    if (!record) {
      res.status(404).json({ error: "本地库里没有这家供应商，请先同步" });
      return;
    }
    res.json(presentVendor(record));
  }));

  app.get("/api/export/vendors.xlsx", route(async (req, res) => {
    const filter = filterFromQuery(req.query);
    const total = await store.countVendors(filter);
    if (total > EXPORT_LIMIT) {
      throw Object.assign(new Error("筛选结果超过 5 万条，请缩小条件后再导出"), { status: 400 });
    }
    const rows = await store.listVendorsForExport(filter);
    const buffer = await buildVendorWorkbook(rows);
    const filename = exportFilename();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buffer);
  }));

  app.use(express.static(publicDir));

  app.use((error, _req, res, _next) => {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error(error);
    if (!res.headersSent) res.status(status).json({ error: error.message || "服务器错误" });
  });

  return app;
}

export async function start(config = loadConfig()) {
  const store = await createStore(config);
  await store.init();
  const client = new YonSuiteClient({
    detailPath: config.detailPath,
    detailMethod: config.detailMethod,
    debug: config.debug,
  });
  const syncService = createSyncService({ store, client, config });
  const app = createApp({ config, store, client, syncService });
  const scheduler = startScheduler({
    config,
    store,
    run: (mode) => syncService.run(mode),
  });
  const server = await new Promise((resolve) => {
    const listening = app.listen(config.port, () => resolve(listening));
  });
  server.requestTimeout = 0;
  console.info(`供应商档案已启动 http://localhost:${config.port}  数据库：${store.describe()}`);
  if (scheduler.enabled) console.info(`每日增量同步：服务器本地时间 ${scheduler.hour}:00`);
  return { server, store, scheduler, syncService, client };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  start().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
