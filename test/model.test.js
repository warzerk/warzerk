import assert from "node:assert/strict";
import test from "node:test";
import { formatCell, labelFor } from "../src/fields.js";
import { mergeDraft, normalizeHost } from "../src/settings.js";
import { absorb, normalizeVendor } from "../src/vendorModel.js";
import { buildTokenUrl, parseYonJson, sign } from "../src/yonsuite.js";

test("用友签名只编码一次", () => {
  const secret = "top-secret";
  const raw = sign({ appKey: "demo", timestamp: "1547192727928" }, secret);
  const url = new URL(buildTokenUrl("https://c1.yonyoucloud.com/iuap-api-gateway/", "demo", secret, "1547192727928"));
  assert.equal(url.searchParams.get("signature"), raw);
  assert.equal(url.pathname, "/iuap-api-auth/open-auth/selfAppAuth/getAccessToken");
  assert.doesNotMatch(url.search, /%25/);
});

test("同一供应商的多个适用范围会合并，多语名称取中文", () => {
  const merged = absorb(
    absorb(null, {
      id: 100,
      code: "V100",
      name: { zh_CN: "苏州示例电子有限公司" },
      vendorApplyRangeId: "a",
      vendorApplyRange_org_name: "苏州公司",
    }),
    {
      id: 100,
      vendorApplyRangeId: "b",
      vendorApplyRange_org_name: "上海公司",
      vendorextends: { taxrate: "13" },
    },
  );
  assert.equal(merged.applyRanges.length, 2);
  const row = normalizeVendor(merged);
  assert.equal(row.vendorId, "100");
  assert.equal(row.name, "苏州示例电子有限公司");
  assert.equal(row.payload.vendorextends.taxrate, "13");
});

test("枚举和嵌套字段显示成中文", () => {
  assert.equal(formatCell("accessstatus", "1"), "合格准入");
  assert.equal(formatCell("stopstatus", true), "停用");
  assert.equal(formatCell("freezestatus", "0"), "正常");
  assert.equal(formatCell("supplyType", 0), "企业");
  assert.equal(labelFor("vendorextends.taxrate"), "业务信息 · 进项税率");
});

test("超过安全整数的供应商 ID 按字符串保留", () => {
  const parsed = parseYonJson('{"id":2639529439088607232,"taxrate":13,"name":"编号 913205000000000000 不变"}');
  assert.equal(parsed.id, "2639529439088607232");
  assert.equal(parsed.taxrate, 13);
  assert.equal(parsed.name, "编号 913205000000000000 不变");
});

test("数据中心地址会去掉网关后缀", () => {
  const next = mergeDraft(
    { gatewayHost: "", appKey: "", appSecret: "", pageSize: 100, enrichDetail: true, org: "", vendorOrg: "" },
    { gatewayHost: "https://c2.yonyoucloud.com/iuap-api-gateway" },
  );
  assert.equal(next.gatewayHost, "https://c2.yonyoucloud.com");
  assert.equal(normalizeHost("https://c1.yonyoucloud.com/"), "https://c1.yonyoucloud.com");
  assert.throws(() => mergeDraft(next, { gatewayHost: "https://c1.yonyoucloud.com/yonbip" }), /根地址/);
});
