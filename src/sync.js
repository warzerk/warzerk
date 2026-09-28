import { assertReady } from "./settings.js";
import { absorb, maxPubts, mergeDetail, normalizeVendor } from "./vendorModel.js";
import { detailLooksMissing } from "./yonsuite.js";

function idleStatus() {
  return {
    running: false,
    mode: "",
    phase: "idle",
    message: "",
    fetched: 0,
    detailDone: 0,
    detailTotal: 0,
    upserted: 0,
    removed: 0,
    startedAt: "",
    finishedAt: "",
    error: "",
  };
}

function formatStamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function withStopStatus(row, status) {
  const next = { ...row };
  if (next.stopstatus == null && next.stop == null) next.stopstatus = status === "true";
  return next;
}

export function createSyncService({ store, client, config }) {
  let current = idleStatus();
  let running = false;

  async function prepare(mode) {
    if (mode !== "full" && mode !== "incremental") {
      throw Object.assign(new Error("同步模式只能是 full 或 incremental"), { status: 400 });
    }
    const settings = await store.getSettings();
    assertReady(settings);
    if (mode === "incremental" && !(await store.getState("watermark_pubts"))) {
      throw Object.assign(new Error("还没有全量同步记录，请先执行一次全量同步"), { status: 400 });
    }
    if (running) {
      throw Object.assign(new Error("已有同步任务正在执行"), { status: 409 });
    }
    return settings;
  }

  function launch(mode, settings, { background = false } = {}) {
    if (running) {
      throw Object.assign(new Error("已有同步任务正在执行"), { status: 409 });
    }
    running = true;
    current = {
      ...idleStatus(),
      running: true,
      mode,
      phase: "prepare",
      message: "正在准备同步",
      startedAt: new Date().toISOString(),
    };
    const job = execute(settings, mode).finally(() => {
      running = false;
    });
    if (background) job.catch(() => {});
    return background ? { ...current } : job;
  }

  async function pullStatus(settings, status, pubts) {
    const collected = [];
    let pageIndex = 1;
    let previousFirstId;
    let guard = 0;
    while (guard < 10000) {
      guard += 1;
      const body = {
        pageIndex: String(pageIndex),
        pageSize: String(settings.pageSize),
        stopstatus: status,
      };
      if (settings.org) body.org = settings.org;
      if (settings.vendorOrg) body.vendororg = settings.vendorOrg;
      if (pubts) body.simple = { pubts };
      const page = await client.listVendors(settings, body);
      const rows = page.recordList || [];
      const firstId = rows[0]?.id == null ? undefined : String(rows[0].id);
      if (pageIndex > 1 && firstId != null && firstId === previousFirstId) break;
      previousFirstId = firstId;
      collected.push(...rows.map((row) => withStopStatus(row, status)));
      const loaded = collected.length;
      current.fetched = loaded;
      const label = status === "true" ? "停用" : "启用";
      current.message = `正在拉取${label}供应商，第 ${pageIndex}/${page.pageCount || "?"} 页，本状态已获取 ${loaded} 条`;
      if (!rows.length || pageIndex >= page.pageCount) break;
      pageIndex += 1;
    }
    return collected;
  }

  async function enrich(settings, rows) {
    let stopDetail = false;
    let note = "";
    const failureCount = new Map();
    current.detailTotal = rows.length;
    current.detailDone = 0;
    const batchSize = 24;
    const enriched = [];

    async function worker(row) {
      if (stopDetail || row?.id == null) return row;
      try {
        const detail = await client.getVendorDetail(settings, row.id);
        current.detailDone += 1;
        current.message = `正在补齐详情 ${current.detailDone}/${current.detailTotal}`;
        return detail ? mergeDetail(row, detail) : row;
      } catch (error) {
        current.detailDone += 1;
        const message = error.message || "详情拉取失败";
        if (detailLooksMissing(error)) {
          stopDetail = true;
          note = message;
          return row;
        }
        if (/没有查询到供应商|请检查id|429|调用频率/.test(message)) {
          return { ...row, detailError: message };
        }
        const count = (failureCount.get(message) || 0) + 1;
        failureCount.set(message, count);
        if (count >= 3) {
          stopDetail = true;
          note = message;
        }
        return { ...row, detailError: message };
      }
    }

    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const slice = rows.slice(offset, offset + batchSize);
      const part = await mapPool(slice, config.detailConcurrency || 4, worker);
      enriched.push(...part);
      const normalized = part.map((row) => normalizeVendor(row)).filter(Boolean);
      if (normalized.length) {
        current.phase = "save";
        current.message = `正在写入详情 ${Math.min(enriched.length, current.detailTotal)}/${current.detailTotal}`;
        await store.upsertMany(normalized);
        current.phase = "detail";
      }
      if (stopDetail) {
        enriched.push(...rows.slice(offset + slice.length));
        break;
      }
    }
    return { rows: enriched, note };
  }

  async function execute(settings, mode) {
    const startedAt = new Date();
    let runId = 0;
    try {
      runId = await store.startRun(mode);
      current.phase = "token";
      current.message = "正在获取用友访问令牌";
      await client.getAccessToken(settings, { force: true });
      const pubts = mode === "incremental" ? await store.getState("watermark_pubts") : "";
      current.phase = "list";
      const enabled = await pullStatus(settings, "false", pubts);
      const disabled = await pullStatus(settings, "true", pubts);
      const merged = new Map();
      for (const row of [...enabled, ...disabled]) {
        if (row?.id == null || row.id === "") continue;
        const id = String(row.id);
        merged.set(id, absorb(merged.get(id), row));
      }
      let records = [...merged.values()];
      current.fetched = records.length;
      let detailNote = "";
      const listed = records.map((row) => normalizeVendor(row)).filter(Boolean);
      if (listed.length) {
        current.phase = "save";
        current.message = `正在写入供应商列表，共 ${listed.length} 家`;
        await store.upsertMany(listed);
        current.upserted = listed.length;
      }
      if (settings.enrichDetail && records.length) {
        current.phase = "detail";
        current.message = `正在补齐详情 0/${records.length}`;
        const result = await enrich(settings, records);
        records = result.rows;
        detailNote = result.note;
      }
      const normalized = records.map((row) => normalizeVendor(row)).filter(Boolean);
      const upserted = normalized.length;
      current.phase = "save";
      current.message = `供应商已写入数据库，共 ${normalized.length} 家`;
      let removed = 0;
      if (mode === "full") {
        if (normalized.length > 0) {
          removed = await store.retainOnly(normalized.map((row) => row.vendorId));
        } else {
          detailNote = [detailNote, "用友返回 0 条，已保留本地已有数据"].filter(Boolean).join("；");
        }
      }
      let watermark = maxPubts(normalized);
      if (mode === "full") {
        await store.setState("watermark_pubts", watermark || formatStamp(startedAt));
      } else if (watermark) {
        const previous = (await store.getState("watermark_pubts")) || "";
        if (watermark > previous) await store.setState("watermark_pubts", watermark);
      }
      const message = [
        mode === "full" ? "全量同步完成" : "增量同步完成",
        `获取 ${normalized.length} 家`,
        `写入 ${upserted} 家`,
        removed ? `移除本地已不存在的 ${removed} 家` : "",
        detailNote && normalized.length ? `详情未全部补齐：${detailNote}` : detailNote,
      ]
        .filter(Boolean)
        .join("。");
      await store.finishRun(runId, {
        status: "success",
        fetched: normalized.length,
        upserted,
        removed,
        message,
      });
      current = {
        ...current,
        running: false,
        phase: "done",
        message,
        fetched: normalized.length,
        upserted,
        removed,
        finishedAt: new Date().toISOString(),
        error: "",
      };
      return { ...current };
    } catch (error) {
      if (!error.status) error.status = 502;
      const message = error.message || "同步失败";
      if (runId) {
        await store.finishRun(runId, {
          status: "failed",
          fetched: current.fetched,
          upserted: current.upserted,
          removed: current.removed,
          message,
        }).catch(() => {});
      }
      current = {
        ...current,
        running: false,
        phase: "failed",
        message,
        error: message,
        finishedAt: new Date().toISOString(),
      };
      throw error;
    }
  }

  return {
    status() {
      return { ...current };
    },
    prepare,
    launch,
    async run(mode) {
      const settings = await prepare(mode);
      return launch(mode, settings);
    },
  };
}
