import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ExcelJS from "exceljs";
import { createApp } from "../src/server.js";
import { createStore } from "../src/store.js";
import { createSyncService } from "../src/sync.js";
import { YonSuiteClient } from "../src/yonsuite.js";

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("error", reject);
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function send(res, payload, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function vendor100(rangeId, orgName) {
  return {
    id: "100",
    code: "V100",
    name: { zh_CN: "苏州示例电子有限公司" },
    simplename: "苏示例",
    helpcode: "SZSL",
    vendorclass_name: "电子元件",
    org_name: "示例采购组织",
    creditcode: "91320500MA1EXAMPLE",
    contactphone: "0512-60000000",
    address: "苏州工业园区示例路 8 号",
    stopstatus: false,
    accessstatus: "1",
    supplyType: "0",
    pubts: "2024-01-01 00:00:00",
    vendorApplyRangeId: rangeId,
    vendorApplyRange_org_name: orgName,
    contactsList: [{ contactname: "李工", contactmobile: "13800000000", defaultcontact: true }],
    vendorextends: { remark: "月结 30 天", taxrate: "13" },
    customItems: { define1: "A级" },
  };
}

function pageSlice(list, pageIndex, pageSize) {
  const start = (Number(pageIndex) - 1) * pageSize;
  return {
    recordList: list.slice(start, start + pageSize),
    recordCount: list.length,
    pageCount: Math.max(1, Math.ceil(list.length / pageSize)),
    pageIndex: Number(pageIndex),
    pageSize,
  };
}

function startMock() {
  const enabled = [vendor100("range-a", "苏州公司"), vendor100("range-b", "上海公司"), {
    id: "200",
    code: "V200",
    name: "上海示例金属材料有限公司",
    simplename: "沪金属",
    vendorclass_name: "原材料",
    org_name: "示例采购组织",
    creditcode: "91310000MA1METAL01",
    contactphone: "021-60000000",
    address: "上海市浦东新区示例路 1 号",
    stopstatus: false,
    accessstatus: "2",
    supplyType: "0",
    pubts: "2024-06-01 08:00:00",
    vendorApplyRangeId: "range-sh",
    vendorApplyRange_org_name: "上海公司",
  }];
  const disabled = [{
    id: "300",
    code: "V300",
    name: "停用示例贸易商",
    simplename: "停用贸易",
    vendorclass_name: "贸易",
    org_name: "示例采购组织",
    creditcode: "91330000MA1STOP001",
    contactphone: "0571-60000000",
    address: "杭州市示例路 3 号",
    stopstatus: true,
    accessstatus: "3",
    supplyType: "0",
    pubts: "2024-03-01 00:00:00",
    vendorApplyRangeId: "range-hz",
    vendorApplyRange_org_name: "杭州公司",
  }];
  const calls = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    try {
      if (url.pathname.endsWith("/getAccessToken")) {
        assert.ok(url.searchParams.get("signature"));
        send(res, { code: "00000", data: { access_token: "token-demo", expire: 7200 } });
        return;
      }
      if (!url.searchParams.get("access_token")) {
        send(res, { code: "310036", message: "access_token 无效" }, 401);
        return;
      }
      if (req.method === "POST" && url.pathname.endsWith("/vendor/list")) {
        const body = await readBody(req);
        calls.push(body);
        const pageSize = Number(body.pageSize || 10);
        let source = body.stopstatus === "true" ? disabled : enabled;
        if (body.simple?.pubts) source = body.stopstatus === "true" ? [] : [{
          id: "400",
          code: "V400",
          name: "增量示例供应商",
          simplename: "增量",
          vendorclass_name: "服务",
          org_name: "示例采购组织",
          creditcode: "91350000MA1NEW0001",
          contactphone: "0591-60000000",
          address: "福州市示例路 9 号",
          stopstatus: false,
          accessstatus: "1",
          pubts: "2026-01-02 00:00:00",
          vendorApplyRangeId: "range-fz",
          vendorApplyRange_org_name: "福州公司",
        }];
        send(res, { code: "200", data: pageSlice(source, body.pageIndex, pageSize) });
        return;
      }
      if (url.pathname.endsWith("/vendor/detail")) {
        const id = url.searchParams.get("id");
        send(res, {
          code: "200",
          data: {
            id,
            legalBody: id === "100" ? "张三" : "李四",
            vendorbanks: [{ bank_name: "工商银行示例支行", account: `6222${id}`, defaultbank: true }],
          },
        });
        return;
      }
      send(res, { code: "404", message: "接口不存在" }, 404);
    } catch (error) {
      send(res, { message: error.message }, 500);
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        calls,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

async function startApp(baseUrl) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vendor-hub-app-"));
  const config = {
    port: 0,
    dbDriver: "sqlite",
    sqlitePath: path.join(dir, "vendors.db"),
    detailPath: "/yonbip/digitalModel/vendor/detail",
    detailMethod: "GET",
    detailConcurrency: 2,
    syncDailyHour: null,
    debug: false,
  };
  const store = await createStore(config);
  await store.init();
  const client = new YonSuiteClient(config);
  const syncService = createSyncService({ store, client, config });
  const app = createApp({ config, store, client, syncService });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const port = server.address().port;
  return {
    store,
    dir,
    server,
    base: `http://127.0.0.1:${port}`,
    gateway: baseUrl,
  };
}

async function request(base, urlPath, options = {}) {
  const response = await fetch(`${base}${urlPath}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const type = response.headers.get("content-type") || "";
  if (type.includes("spreadsheet") || type.includes("octet-stream")) {
    return { status: response.status, buffer: Buffer.from(await response.arrayBuffer()), headers: response.headers };
  }
  const data = await response.json();
  return { status: response.status, data, headers: response.headers };
}

async function waitUntilDone(base) {
  for (let i = 0; i < 50; i += 1) {
    const { data } = await request(base, "/api/sync/status");
    if (!data.running) return data;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("同步超时");
}

test("查询、同步、详情和 Excel 导出", async () => {
  const mock = await startMock();
  const app = await startApp(mock.baseUrl);
  try {
    const saved = await request(app.base, "/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        gatewayHost: mock.baseUrl,
        appKey: "demo-key",
        appSecret: "demo-secret",
        pageSize: 2,
        enrichDetail: true,
      }),
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.appSecret, undefined);
    assert.equal(saved.data.appSecretSet, true);
    assert.doesNotMatch(JSON.stringify(saved.data), /demo-secret/);

    const tooSoon = await request(app.base, "/api/sync", {
      method: "POST",
      body: JSON.stringify({ mode: "incremental" }),
    });
    assert.equal(tooSoon.status, 400);

    const tested = await request(app.base, "/api/settings/test", {
      method: "POST",
      body: JSON.stringify({ gatewayHost: mock.baseUrl, appKey: "demo-key", appSecret: "demo-secret" }),
    });
    assert.equal(tested.status, 200, tested.data?.error);
    assert.match(tested.data.message, /3/);

    await app.store.upsertMany([{
      vendorId: "999",
      code: "GONE",
      name: "应被全量同步移除",
      simplename: "",
      helpcode: "",
      orgName: "",
      vendorclassName: "",
      creditcode: "",
      contactphone: "",
      address: "",
      stopped: 0,
      accessstatus: "",
      pubts: "",
      detailLoaded: 0,
      detailError: "",
      payload: { id: "999", name: "应被全量同步移除" },
    }]);

    const started = await request(app.base, "/api/sync", {
      method: "POST",
      body: JSON.stringify({ mode: "full" }),
    });
    assert.equal(started.status, 202);
    const done = await waitUntilDone(app.base);
    assert.equal(done.error, "", done.message);
    assert.equal(done.phase, "done");

    const list = await request(app.base, "/api/vendors?pageSize=20");
    assert.equal(list.data.total, 3);
    assert.equal(list.data.items.map((item) => item.code).sort().join(","), "V100,V200,V300");
    const suzhou = list.data.items.find((item) => item.code === "V100");
    assert.equal(suzhou.name, "苏州示例电子有限公司");
    assert.equal(suzhou.accessstatusText, "合格准入");
    const removed = await request(app.base, "/api/vendors/999");
    assert.equal(removed.status, 404);

    const stopped = await request(app.base, "/api/vendors?stopped=1");
    assert.equal(stopped.data.total, 1);
    assert.equal(stopped.data.items[0].name, "停用示例贸易商");

    const found = await request(app.base, `/api/vendors?q=${encodeURIComponent("苏州")}`);
    assert.equal(found.data.total, 1);

    const detail = await request(app.base, "/api/vendors/100");
    assert.equal(detail.data.fieldCount > 8, true);
    assert.equal(detail.data.banks.rows.length, 1);
    assert.match(detail.data.banks.rows[0].account, /6222100/);
    assert.equal(detail.data.contacts.rows[0].contactname, "李工");
    assert.equal(detail.data.applyRanges.rows.length, 2);
    assert.ok(detail.data.fields.some((field) => field.key === "legalBody" && field.display === "张三"));

    const full = await request(app.base, "/api/vendors?view=full&pageSize=20");
    assert.ok(full.data.columns.some((column) => column.key === "creditcode"));

    const incremental = await request(app.base, "/api/sync", {
      method: "POST",
      body: JSON.stringify({ mode: "incremental" }),
    });
    assert.equal(incremental.status, 202);
    const second = await waitUntilDone(app.base);
    assert.equal(second.phase, "done", second.message);
    const after = await request(app.base, "/api/vendors?q=V400");
    assert.equal(after.data.total, 1);
    assert.equal(after.data.items[0].name, "增量示例供应商");

    const statuses = mock.calls.filter((call) => !call.simple).map((call) => call.stopstatus);
    assert.ok(statuses.includes("false"));
    assert.ok(statuses.includes("true"));

    const exported = await request(app.base, `/api/export/vendors.xlsx?q=${encodeURIComponent("苏州")}`);
    assert.equal(exported.status, 200);
    assert.equal(exported.buffer.subarray(0, 2).toString(), "PK");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.buffer);
    const sheet = workbook.getWorksheet("供应商");
    assert.ok(sheet);
    assert.ok(workbook.getWorksheet("联系人"));
    assert.ok(workbook.getWorksheet("银行账户"));
    const text = sheet.getSheetValues().flat().join(" ");
    assert.match(text, /苏州示例电子有限公司/);
    assert.match(text, /统一社会信用代码/);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
    await new Promise((resolve) => mock.server.close(resolve));
    await app.store.close();
    fs.rmSync(app.dir, { recursive: true, force: true });
  }
});
