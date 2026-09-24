import { formatCell, labelFor, preferredIndex } from "./fields.js";

export const CONTACT_PATHS = [
  "contactsList",
  "vendorcontactss",
  "vendorContacts",
  "contacts",
  "vendorextends.contactsList",
];

export const BANK_PATHS = [
  "vendorbanks",
  "vendorBanks",
  "banks",
  "vendorextends.vendorbanks",
];

export const ADDRESS_PATHS = [
  "vendorAddresses",
  "vendoraddresses",
  "addresses",
  "vendorextends.vendorAddresses",
];

export function flattenScalars(value, prefix = "", out = {}) {
  if (Array.isArray(value)) return out;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([key]) => key !== "detailLoaded");
    if (!entries.length && prefix) out[prefix] = "";
    for (const [key, child] of entries) {
      const next = prefix ? `${prefix}.${key}` : key;
      flattenScalars(child, next, out);
    }
    return out;
  }
  if (prefix) out[prefix] = value == null ? "" : value;
  return out;
}

function getPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

export function firstArray(payload, paths) {
  for (const path of paths) {
    const value = getPath(payload, path);
    if (Array.isArray(value) && value.length) return value;
  }
  return [];
}

function sortKeys(keys) {
  return [...keys].sort((a, b) => preferredIndex(a) - preferredIndex(b) || a.localeCompare(b, "zh-CN"));
}

export function tableFromRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return { columns: [], rows: [] };
  const keys = [];
  const seen = new Set();
  const flats = rows.map((row) => {
    if (!row || typeof row !== "object") return {};
    const flat = flattenScalars(row);
    for (const key of Object.keys(flat)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
    return flat;
  });
  const ordered = sortKeys(keys);
  return {
    columns: ordered.map((key) => ({ key, label: labelFor(key) })),
    rows: flats.map((flat) => {
      const out = {};
      for (const key of ordered) out[key] = formatCell(key, flat[key]);
      return out;
    }),
  };
}

export function scalarFields(payload) {
  const flat = flattenScalars(payload || {});
  const keys = sortKeys(Object.keys(flat));
  return keys.map((key) => ({
    key,
    label: labelFor(key),
    value: flat[key] == null ? "" : flat[key],
    display: String(formatCell(key, flat[key]) ?? ""),
  }));
}

export function presentVendor(record) {
  const payload = record.payload || {};
  return {
    vendorId: record.vendorId,
    code: record.code,
    name: record.name,
    simplename: record.simplename,
    helpcode: record.helpcode,
    orgName: record.orgName,
    vendorclassName: record.vendorclassName,
    creditcode: record.creditcode,
    contactphone: record.contactphone,
    address: record.address,
    stopped: record.stopped,
    accessstatus: record.accessstatus,
    pubts: record.pubts,
    detailLoaded: record.detailLoaded,
    detailError: record.detailError || payload.detailError || "",
    syncedAt: record.syncedAt,
    fieldCount: scalarFields(payload).length,
    fields: scalarFields(payload),
    contacts: tableFromRows(firstArray(payload, CONTACT_PATHS)),
    banks: tableFromRows(firstArray(payload, BANK_PATHS)),
    addresses: tableFromRows(firstArray(payload, ADDRESS_PATHS)),
    applyRanges: tableFromRows(Array.isArray(payload.applyRanges) ? payload.applyRanges : []),
    raw: payload,
  };
}

export function summaryVendor(record, { includeFlat = false } = {}) {
  const item = {
    vendorId: record.vendorId,
    code: record.code || "",
    name: record.name || "",
    simplename: record.simplename || "",
    helpcode: record.helpcode || "",
    orgName: record.orgName || "",
    vendorclassName: record.vendorclassName || "",
    creditcode: record.creditcode || "",
    contactphone: record.contactphone || "",
    address: record.address || "",
    stopped: record.stopped ? 1 : 0,
    accessstatus: record.accessstatus || "",
    accessstatusText: String(formatCell("accessstatus", record.accessstatus) ?? ""),
    pubts: record.pubts || "",
    detailLoaded: record.detailLoaded ? 1 : 0,
    syncedAt: record.syncedAt || "",
  };
  if (includeFlat) {
    const fields = scalarFields(record.payload || {});
    item.fieldCount = fields.length;
    item.flat = Object.fromEntries(fields.map((field) => [field.key, field.display]));
  }
  return item;
}
