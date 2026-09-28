import ExcelJS from "exceljs";
import { formatCell, labelFor, preferredIndex } from "./fields.js";
import { ADDRESS_PATHS, BANK_PATHS, CONTACT_PATHS, ORG_PATHS, firstArray, flattenScalars, tableFromRows } from "./present.js";

function sortKeys(keys) {
  return [...keys].sort((a, b) => preferredIndex(a) - preferredIndex(b) || a.localeCompare(b, "zh-CN"));
}

function styleHeader(sheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Microsoft YaHei" };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C6B62" } };
  header.alignment = { vertical: "middle", wrapText: true };
  header.height = 22;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  if (sheet.columnCount > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columnCount },
    };
  }
}

function autosize(sheet) {
  sheet.columns.forEach((column) => {
    let width = 12;
    column.eachCell({ includeEmpty: false }, (cell) => {
      const text = cell.value == null ? "" : String(cell.value);
      const weighted = [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
      width = Math.max(width, Math.min(weighted + 2, 42));
    });
    column.width = width;
  });
}

function addChildSheet(workbook, title, records, paths) {
  const entries = [];
  for (const record of records) {
    for (const child of firstArray(record.payload || {}, paths)) {
      if (child && typeof child === "object") entries.push({ record, child });
    }
  }
  if (!entries.length) return;
  const table = tableFromRows(entries.map((entry) => entry.child));
  const sheet = workbook.addWorksheet(title);
  sheet.addRow(["供应商ID", "供应商编码", "供应商名称", ...table.columns.map((column) => `${column.label} (${column.key})`)]);
  entries.forEach((entry, index) => {
    sheet.addRow([
      entry.record.vendorId,
      entry.record.code || "",
      entry.record.name || "",
      ...table.columns.map((column) => table.rows[index][column.key] ?? ""),
    ]);
  });
  styleHeader(sheet);
  autosize(sheet);
}

export async function buildVendorWorkbook(records) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "yonsuite-vendor-hub";
  workbook.created = new Date();
  const flats = records.map((record) => flattenScalars(record.payload || {}));
  const seen = new Set();
  const keys = [];
  for (const flat of flats) {
    for (const key of Object.keys(flat)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  const ordered = sortKeys(keys);
  const sheet = workbook.addWorksheet("供应商");
  sheet.addRow(ordered.map((key) => `${labelFor(key)} (${key})`));
  for (const flat of flats) {
    sheet.addRow(ordered.map((key) => formatCell(key, flat[key])));
  }
  styleHeader(sheet);
  autosize(sheet);
  addChildSheet(workbook, "联系人", records, CONTACT_PATHS);
  addChildSheet(workbook, "银行账户", records, BANK_PATHS);
  addChildSheet(workbook, "地址", records, ADDRESS_PATHS);
  addChildSheet(workbook, "适用组织", records, ORG_PATHS);
  const ranges = [];
  for (const record of records) {
    const rows = Array.isArray(record.payload?.applyRanges) ? record.payload.applyRanges : [];
    for (const row of rows) ranges.push({ record, child: row });
  }
  if (ranges.length) {
    const table = tableFromRows(ranges.map((entry) => entry.child));
    const rangeSheet = workbook.addWorksheet("适用范围");
    rangeSheet.addRow(["供应商ID", "供应商编码", "供应商名称", ...table.columns.map((column) => `${column.label} (${column.key})`)]);
    ranges.forEach((entry, index) => {
      rangeSheet.addRow([
        entry.record.vendorId,
        entry.record.code || "",
        entry.record.name || "",
        ...table.columns.map((column) => table.rows[index][column.key] ?? ""),
      ]);
    });
    styleHeader(rangeSheet);
    autosize(rangeSheet);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function exportFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `供应商档案-${stamp}.xlsx`;
}
