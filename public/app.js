const state = {
  page: 1,
  pageSize: 20,
  q: "",
  stopped: "",
  full: false,
  total: 0,
  items: [],
  columns: [],
  status: null,
  polling: false,
};

const SUMMARY = [
  ["code", "供应商编码"],
  ["name", "供应商名称"],
  ["simplename", "简称"],
  ["vendorclassName", "分类"],
  ["orgName", "管理组织"],
  ["creditcode", "统一社会信用代码"],
  ["contactphone", "电话"],
  ["address", "地址"],
  ["stopped", "状态"],
  ["accessstatusText", "准入状态"],
  ["pubts", "时间戳"],
];

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value != null && value !== false) node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 200) };
    }
  }
  if (!response.ok) throw new Error(data?.error || `请求失败（${response.status}）`);
  return data;
}

function showBanner(text, kind = "") {
  const banner = $("banner");
  banner.hidden = !text;
  banner.className = `banner ${kind}`.trim();
  banner.textContent = text || "";
}

function exportHref() {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.stopped !== "") params.set("stopped", state.stopped);
  const query = params.toString();
  return query ? `/api/export/vendors.xlsx?${query}` : "/api/export/vendors.xlsx";
}

function renderStats() {
  const status = state.status;
  const sync = status?.sync;
  const bits = [
    ["本地供应商", `${status?.vendorCount ?? "—"} 家`],
    ["数据库", status ? (status.dbDriver === "mssql" ? "SQL Server" : "SQLite 本地演示") : "—"],
    ["增量水位", status?.watermark || "尚未全量同步"],
  ];
  if (status?.scheduler?.enabled) bits.push(["定时增量", `每天 ${status.scheduler.hour}:00`]);
  $("stats").replaceChildren(
    ...bits.map(([label, value]) => el("div", { class: "stat" }, [el("span", {}, [`${label} `]), el("b", {}, [value])])),
  );
  const running = Boolean(sync?.running);
  $("sync-full").disabled = running;
  $("sync-incremental").disabled = running || !status?.watermark;
  $("export-link").href = exportHref();
  if (running) showBanner(sync.message || "正在同步……");
  else if (sync?.error) showBanner(sync.error, "error");
  else if (sync?.phase === "done" && sync.message) showBanner(sync.message);
}

function cellValue(item, key) {
  if (key === "stopped") {
    return el("span", { class: item.stopped ? "badge off" : "badge on" }, [item.stopped ? "停用" : "启用"]);
  }
  const value = state.full ? (item.flat?.[key] ?? item[key] ?? "") : (item[key] ?? "");
  return value === "" || value == null ? "—" : String(value);
}

function renderTable() {
  const columns = state.full && state.columns.length
    ? state.columns.map((column) => [column.key, column.label])
    : SUMMARY;
  $("vendor-table").querySelector("thead").replaceChildren(
    el("tr", {}, [
      ...columns.map(([, label]) => el("th", {}, [label])),
      el("th", {}, ["操作"]),
    ]),
  );
  const tbody = $("vendor-table").querySelector("tbody");
  if (!state.items.length) {
    tbody.replaceChildren(
      el("tr", {}, [
        el("td", { class: "empty", colspan: String(columns.length + 1) }, [
          state.status?.credentialsConfigured
            ? "本地还没有供应商。点「全量同步」从用友拉取。"
            : "请先到「连接设置」填写用友 AppKey，再执行全量同步。",
        ]),
      ]),
    );
  } else {
    tbody.replaceChildren(
      ...state.items.map((item) =>
        el("tr", { onClick: () => openVendor(item.vendorId) }, [
          ...columns.map(([key]) => el("td", { class: key === "address" || key === "name" ? "wrap" : "" }, [cellValue(item, key)])),
          el("td", {}, [
            el("button", {
              type: "button",
              class: "ghost",
              onClick: (event) => {
                event.stopPropagation();
                openVendor(item.vendorId);
              },
            }, ["全部字段"]),
          ]),
        ]),
      ),
    );
  }
  const pages = Math.max(1, Math.ceil(state.total / state.pageSize));
  $("page-label").textContent = `第 ${state.page} / ${pages} 页，共 ${state.total} 家`;
  $("prev-page").disabled = state.page <= 1;
  $("next-page").disabled = state.page >= pages;
  $("column-mode").textContent = state.full ? "表格常用列" : "表格全部列";
}

function renderHistory(items) {
  const list = $("history");
  if (!items.length) {
    list.replaceChildren(el("li", {}, ["还没有同步记录"]));
    return;
  }
  const modeText = { full: "全量", incremental: "增量" };
  list.replaceChildren(
    ...items.map((item) =>
      el("li", {}, [
        el("strong", { class: item.status === "failed" ? "failed" : "" }, [
          `${modeText[item.mode] || item.mode} · ${item.status === "success" ? "成功" : item.status === "failed" ? "失败" : "进行中"}`,
        ]),
        el("div", {}, [item.message || ""]),
        el("small", {}, [`${item.startedAt || ""}  获取 ${item.fetched} · 写入 ${item.upserted}`]),
      ]),
    ),
  );
}

function renderSubtable(title, table) {
  if (!table?.rows?.length) return null;
  return el("section", {}, [
    el("h3", { class: "subhead" }, [title]),
    el("div", { class: "table-wrap" }, [
      el("table", { class: "subtable" }, [
        el("thead", {}, [el("tr", {}, table.columns.map((column) => el("th", {}, [`${column.label}`])))]),
        el("tbody", {}, table.rows.map((row) => el("tr", {}, table.columns.map((column) => el("td", { class: "wrap" }, [row[column.key] || "—"]))))),
      ]),
    ]),
  ]);
}

async function openVendor(vendorId) {
  const drawer = $("drawer");
  drawer.hidden = false;
  $("drawer-title").textContent = "正在读取";
  $("drawer-kicker").textContent = vendorId;
  $("drawer-body").replaceChildren(el("p", {}, ["正在读取全部字段……"]));
  try {
    const vendor = await api(`/api/vendors/${encodeURIComponent(vendorId)}`);
    $("drawer-kicker").textContent = vendor.code || vendor.vendorId;
    $("drawer-title").textContent = vendor.name || "未命名供应商";
    const body = [];
    if (vendor.detailError) body.push(el("div", { class: "banner warn" }, [vendor.detailError]));
    body.push(el("p", { class: "lede" }, [
      `共 ${vendor.fieldCount} 个字段 · ${vendor.detailLoaded ? "已补齐详情" : "目前是列表接口返回的字段"} · 同步于 ${vendor.syncedAt || "—"}`,
    ]));
    body.push(el("div", { class: "fields" }, vendor.fields.map((field) =>
      el("article", {}, [
        el("h3", {}, [`${field.label} · ${field.key}`]),
        el("p", {}, [field.display === "" ? "—" : field.display]),
      ]),
    )));
    body.push(renderSubtable("联系人", vendor.contacts));
    body.push(renderSubtable("银行账户", vendor.banks));
    body.push(renderSubtable("地址", vendor.addresses));
    body.push(renderSubtable("适用组织", vendor.vendorOrgs));
    body.push(renderSubtable("适用范围", vendor.applyRanges));
    body.push(el("h3", { class: "subhead" }, ["原始 JSON"]));
    body.push(el("pre", { class: "raw" }, [JSON.stringify(vendor.raw, null, 2)]));
    $("drawer-body").replaceChildren(...body.filter(Boolean));
  } catch (error) {
    $("drawer-body").replaceChildren(el("div", { class: "banner error" }, [error.message]));
  }
}

function closeDrawer() {
  $("drawer").hidden = true;
}

async function loadVendors() {
  const params = new URLSearchParams({
    page: String(state.page),
    pageSize: String(state.pageSize),
  });
  if (state.q) params.set("q", state.q);
  if (state.stopped !== "") params.set("stopped", state.stopped);
  if (state.full) params.set("view", "full");
  const data = await api(`/api/vendors?${params}`);
  state.total = data.total;
  state.items = data.items;
  state.columns = data.columns || [];
  renderTable();
  renderStats();
}

async function loadStatus() {
  state.status = await api("/api/status");
  renderStats();
  const db = $("db-line");
  if (db) {
    db.textContent = state.status.dbDriver === "mssql"
      ? `当前连接的是 SQL Server：${state.status.database}。供应商读写都走这套库。`
      : `当前是 SQLite 演示库（${state.status.database}）。接到公司 SQL Server 时，把 DB_DRIVER 设为 mssql 并填写连接信息后重启。`;
  }
  const schedule = $("schedule-line");
  if (schedule) {
    schedule.textContent = state.status.scheduler.enabled
      ? `已开启定时增量：每天服务器本地时间 ${state.status.scheduler.hour}:00 跑一次。最近自动执行日期：${state.status.scheduler.lastAutoDay || "还没有"}。`
      : "还没有开启每天自动增量。在服务器环境变量里设置 SYNC_DAILY_HOUR（0-23）并建议 TZ=Asia/Shanghai。";
  }
}

async function loadHistory() {
  const data = await api("/api/sync/history");
  renderHistory(data.items || []);
}

async function refreshAll() {
  await Promise.all([loadStatus(), loadVendors(), loadHistory()]);
}

async function pollSync() {
  if (state.polling) return;
  state.polling = true;
  try {
    let guard = 0;
    while (guard < 3600) {
      guard += 1;
      const sync = await api("/api/sync/status");
      state.status = { ...(state.status || {}), sync };
      renderStats();
      if (!sync.running) break;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    await refreshAll();
  } finally {
    state.polling = false;
  }
}

async function startSync(mode) {
  showBanner(mode === "full" ? "开始全量同步……" : "开始增量同步……");
  try {
    await api("/api/sync", { method: "POST", body: JSON.stringify({ mode }) });
    await pollSync();
  } catch (error) {
    showBanner(error.message, "error");
  }
}

function switchView(name) {
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === name);
  });
  $("view-vendors").hidden = name !== "vendors";
  $("view-settings").hidden = name !== "settings";
}

async function loadSettingsForm() {
  const settings = await api("/api/settings");
  const form = $("settings-form");
  form.gatewayHost.value = settings.gatewayHost || "";
  form.appKey.value = settings.appKey || "";
  form.appSecret.value = "";
  form.pageSize.value = settings.pageSize || 100;
  form.enrichDetail.checked = Boolean(settings.enrichDetail);
  form.org.value = settings.org || "";
  form.vendorOrg.value = settings.vendorOrg || "";
  $("secret-hint").textContent = settings.appSecretSet ? settings.appSecretMask : "尚未保存 AppSecret";
}

function formPayload() {
  const form = $("settings-form");
  const payload = {
    gatewayHost: form.gatewayHost.value,
    appKey: form.appKey.value,
    pageSize: Number(form.pageSize.value),
    enrichDetail: form.enrichDetail.checked,
    org: form.org.value,
    vendorOrg: form.vendorOrg.value,
  };
  if (form.appSecret.value) payload.appSecret = form.appSecret.value;
  return payload;
}

function showSettingsMessage(text, isError = false) {
  const node = $("settings-message");
  node.hidden = !text;
  node.className = isError ? "form-message banner error" : "form-message banner";
  node.textContent = text || "";
}

document.querySelectorAll(".nav-btn").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

let searchTimer = 0;
$("keyword").addEventListener("input", (event) => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    state.q = event.target.value.trim();
    state.page = 1;
    loadVendors().catch((error) => showBanner(error.message, "error"));
  }, 250);
});
$("stopped").addEventListener("change", (event) => {
  state.stopped = event.target.value;
  state.page = 1;
  loadVendors().catch((error) => showBanner(error.message, "error"));
});
$("page-size").addEventListener("change", (event) => {
  state.pageSize = Number(event.target.value);
  state.page = 1;
  loadVendors().catch((error) => showBanner(error.message, "error"));
});
$("column-mode").addEventListener("click", () => {
  state.full = !state.full;
  loadVendors().catch((error) => showBanner(error.message, "error"));
});
$("prev-page").addEventListener("click", () => {
  if (state.page > 1) {
    state.page -= 1;
    loadVendors().catch((error) => showBanner(error.message, "error"));
  }
});
$("next-page").addEventListener("click", () => {
  const pages = Math.max(1, Math.ceil(state.total / state.pageSize));
  if (state.page < pages) {
    state.page += 1;
    loadVendors().catch((error) => showBanner(error.message, "error"));
  }
});
$("sync-full").addEventListener("click", () => startSync("full"));
$("sync-incremental").addEventListener("click", () => startSync("incremental"));
$("drawer-close").addEventListener("click", closeDrawer);
document.querySelector(".drawer-backdrop").addEventListener("click", closeDrawer);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDrawer();
});

$("settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  showSettingsMessage("正在保存……");
  try {
    await api("/api/settings", { method: "PUT", body: JSON.stringify(formPayload()) });
    await loadSettingsForm();
    await loadStatus();
    showSettingsMessage("已保存。可以测试连接，或回到查询页做全量同步。");
  } catch (error) {
    showSettingsMessage(error.message, true);
  }
});

$("test-connection").addEventListener("click", async () => {
  showSettingsMessage("正在向用友获取令牌并读取一页供应商……");
  try {
    const result = await api("/api/settings/test", { method: "POST", body: JSON.stringify(formPayload()) });
    showSettingsMessage(result.message);
  } catch (error) {
    showSettingsMessage(error.message, true);
  }
});

refreshAll().catch((error) => showBanner(error.message, "error"));
loadSettingsForm().catch((error) => showSettingsMessage(error.message, true));
