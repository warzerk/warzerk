const RANGE_KEYS = [
  "vendorApplyRangeId",
  "vendorApplyRange_org",
  "vendorApplyRange_org_name",
  "org",
  "org_name",
  "stopstatus",
  "pubts",
];

export function asText(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if (typeof value.zh_CN === "string" && value.zh_CN.trim()) return value.zh_CN.trim();
    if (typeof value.zh_cn === "string" && value.zh_cn.trim()) return value.zh_cn.trim();
    if (typeof value.name === "string" && value.name.trim()) return value.name.trim();
  }
  return null;
}

function clip(value, max) {
  const text = asText(value);
  if (text == null) return null;
  return text.length > max ? text.slice(0, max) : text;
}

export function readStopped(raw) {
  const ext = raw?.vendorextends && typeof raw.vendorextends === "object" ? raw.vendorextends : {};
  const value = raw?.stopstatus ?? raw?.stop ?? ext.stopstatus ?? ext.stop;
  if (value == null || value === "") return 0;
  return value === true || value === "true" || value === 1 || value === "1" ? 1 : 0;
}

function rangeSnapshot(row) {
  const snap = {};
  for (const key of RANGE_KEYS) {
    if (row[key] != null && row[key] !== "") snap[key] = row[key];
  }
  return snap;
}

function rememberRange(ranges, snap) {
  if (!Object.keys(snap).length) return ranges;
  const id = snap.vendorApplyRangeId;
  if (id == null) {
    const signature = JSON.stringify(snap);
    if (ranges.some((item) => JSON.stringify(item) === signature)) return ranges;
  } else if (ranges.some((item) => item.vendorApplyRangeId === id)) {
    return ranges;
  }
  ranges.push(snap);
  return ranges;
}

export function absorb(base, extra) {
  if (!extra || typeof extra !== "object") return base || null;
  if (!base) {
    const created = { ...extra, applyRanges: [] };
    rememberRange(created.applyRanges, rangeSnapshot(extra));
    return created;
  }
  const merged = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (key === "applyRanges") continue;
    if (key === "vendorextends" || key === "customItems") {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        merged[key] = { ...value, ...(merged[key] && typeof merged[key] === "object" ? merged[key] : {}) };
      }
      continue;
    }
    if (Array.isArray(value)) {
      if (!Array.isArray(merged[key]) || value.length > merged[key].length) merged[key] = value;
      continue;
    }
    if (merged[key] == null || merged[key] === "") merged[key] = value;
  }
  merged.applyRanges = rememberRange([...(merged.applyRanges || [])], rangeSnapshot(extra));
  return merged;
}

export function mergeDetail(raw, detail) {
  const ranges = raw.applyRanges;
  const merged = absorb(raw, detail);
  if (ranges?.length && (!merged.applyRanges || !merged.applyRanges.length)) {
    merged.applyRanges = ranges;
  }
  merged.detailLoaded = true;
  delete merged.detailError;
  return merged;
}

export function normalizeVendor(raw) {
  if (!raw || typeof raw !== "object") return null;
  const ext = raw.vendorextends && typeof raw.vendorextends === "object" ? raw.vendorextends : {};
  const pick = (key) => raw[key] ?? ext[key];
  const vendorId = raw.id != null && raw.id !== "" ? String(raw.id) : null;
  if (!vendorId) return null;
  const payload = { ...raw };
  delete payload.detailLoaded;
  return {
    vendorId,
    code: clip(pick("code"), 128),
    name: clip(pick("name"), 500),
    simplename: clip(pick("simplename"), 256),
    helpcode: clip(pick("helpcode"), 128),
    orgName: clip(pick("org_name"), 256),
    vendorclassName: clip(pick("vendorclass_name"), 256),
    creditcode: clip(pick("creditcode"), 64),
    contactphone: clip(pick("contactphone") ?? pick("vendorphone"), 64),
    address: clip(pick("address") ?? pick("vendoraddress"), 1000),
    stopped: readStopped(raw),
    accessstatus: clip(pick("accessstatus"), 32),
    pubts: clip(pick("pubts"), 40),
    detailLoaded: raw.detailLoaded ? 1 : 0,
    detailError: asText(raw.detailError),
    payload,
  };
}

export function maxPubts(records) {
  let max = "";
  for (const record of records) {
    const value = record.pubts || "";
    if (value > max) max = value;
  }
  return max;
}
