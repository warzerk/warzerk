import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createStore } from "../src/store.js";
import { createSyncService } from "../src/sync.js";

async function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vendor-hub-"));
  const store = await createStore({ dbDriver: "sqlite", sqlitePath: path.join(dir, "vendors.db") });
  await store.init();
  return { store, dir };
}

test("用友返回 0 条时不全量清空本地供应商", async () => {
  const { store, dir } = await tempStore();
  try {
    await store.saveSettings({
      gatewayHost: "https://c1.yonyoucloud.com",
      appKey: "demo",
      appSecret: "demo-secret",
      enrichDetail: true,
      pageSize: 50,
    });
    await store.upsertMany([
      {
        vendorId: "1",
        code: "KEEP",
        name: "应保留的供应商",
        simplename: "",
        helpcode: "",
        orgName: "",
        vendorclassName: "",
        creditcode: "",
        contactphone: "",
        address: "",
        stopped: 0,
        accessstatus: "",
        pubts: "2024-01-01 00:00:00",
        detailLoaded: 0,
        detailError: "",
        payload: { id: "1", code: "KEEP", name: "应保留的供应商" },
      },
    ]);
    const client = {
      async getAccessToken() {
        return "token";
      },
      async listVendors() {
        return { recordList: [], recordCount: 0, pageCount: 0, pageIndex: 1 };
      },
      async getVendorDetail() {
        throw new Error("不应该请求详情");
      },
    };
    const sync = createSyncService({ store, client, config: { detailConcurrency: 1 } });
    const result = await sync.run("full");
    assert.match(result.message, /0 条/);
    assert.equal((await store.getVendor("1")).name, "应保留的供应商");
    assert.ok(await store.getState("watermark_pubts"));
  } finally {
    await store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
