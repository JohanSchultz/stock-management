"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useMemo, useState } from "react";

const HIDDEN_COLUMN_KEYS = new Set(["id", "stock_item_id"]);

const TEXT_COLUMN_KEYS = new Set(["stock_code", "descr"]);

const TOTAL_COLUMN_KEYS = new Set(["perc", "space", "total_value"]);

const VALUE_PER_CUBIC_METER_COLUMN = "value_per_cubic_meter";

const COLUMN_HEADER_OVERRIDES = {
  space: "Space Used",
  avail: "Warehouse Size",
  perc: "Percentage Used",
  total_value: "Total Value",
  value_per_cubic_meter: "Value per Cubic Meter",
};

const TABLE_BORDER = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

const TABLE_HEADER_ROW = 5;
const EXCEL_NUMBER_FORMAT = "#,##0.00";

const decimalFormatter = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function normalizeColumnKey(key) {
  return String(key ?? "").trim().toLowerCase();
}

function formatReportDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatColumnHeader(key) {
  const normalized = normalizeColumnKey(key);
  if (COLUMN_HEADER_OVERRIDES[normalized]) {
    return COLUMN_HEADER_OVERRIDES[normalized];
  }
  if (normalized === "descr") return "Description";
  if (normalized === "stock_code") return "Stock Code";

  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getColumnKeys(rows) {
  const keys = [];
  const seen = new Set();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key === "rowKey") continue;
      if (HIDDEN_COLUMN_KEYS.has(normalizeColumnKey(key))) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }

  return keys;
}

function getDisplayColumns(dataColumns) {
  if (dataColumns.length === 0) return dataColumns;
  if (dataColumns.includes(VALUE_PER_CUBIC_METER_COLUMN)) {
    return dataColumns;
  }
  return [...dataColumns, VALUE_PER_CUBIC_METER_COLUMN];
}

function findRowColumnKey(row, name) {
  return Object.keys(row).find((key) => normalizeColumnKey(key) === name);
}

function computeValuePerCubicMeter(row) {
  const spaceKey = findRowColumnKey(row, "space");
  const totalValueKey = findRowColumnKey(row, "total_value");
  if (!spaceKey || !totalValueKey) return null;

  const space = Number.parseFloat(row[spaceKey]);
  const totalValue = Number.parseFloat(row[totalValueKey]);
  if (Number.isNaN(space) || Number.isNaN(totalValue) || space === 0) {
    return null;
  }

  return totalValue / space;
}

function getRowColumnValue(row, columnKey) {
  if (normalizeColumnKey(columnKey) === VALUE_PER_CUBIC_METER_COLUMN) {
    return computeValuePerCubicMeter(row);
  }
  return row[columnKey];
}

function isTextColumn(columnKey) {
  return TEXT_COLUMN_KEYS.has(normalizeColumnKey(columnKey));
}

function isDateColumn(columnKey) {
  return /(?:^|_)(date|max|expiry)(?:_|$)/i.test(columnKey);
}

function isNumericValue(value) {
  if (value == null || value === "") return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return false;

  const parsed = Number.parseFloat(value);
  return !Number.isNaN(parsed);
}

function isNumericColumn(columnKey) {
  if (isTextColumn(columnKey) || isDateColumn(columnKey)) return false;

  const normalized = normalizeColumnKey(columnKey);
  return (
    normalized === "space" ||
    normalized === "avail" ||
    normalized === "perc" ||
    normalized === "total_value" ||
    normalized === VALUE_PER_CUBIC_METER_COLUMN ||
    /(?:^|_)(qty|quantity|volume|cubic|space|length|width|height|depth|percent|pct|utilisation|utilization|balance|total|amount|price|weight|size|capacity|used|available|value)(?:_|$)/i.test(
      columnKey
    )
  );
}

function shouldRightAlignColumn(columnKey) {
  return isNumericColumn(columnKey);
}

function formatNumberWithSeparators(value) {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) return String(value);
  return decimalFormatter.format(parsed);
}

function parseRoundedNumber(value) {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) return null;
  return Number.parseFloat(parsed.toFixed(2));
}

function columnIndexToLetter(index) {
  let columnNumber = index + 1;
  let letter = "";

  while (columnNumber > 0) {
    const remainder = (columnNumber - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    columnNumber = Math.floor((columnNumber - 1) / 26);
  }

  return letter;
}

function getExcelColumnWidth(columnKey) {
  const normalized = normalizeColumnKey(columnKey);
  if (normalized === "descr") return 50;
  if (normalized === "stock_code") return 18;
  if (normalized === VALUE_PER_CUBIC_METER_COLUMN) return 22;
  if (isDateColumn(columnKey)) return 18;
  return 18;
}

function normalizeRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    rowKey:
      row.stock_item_id != null
        ? `warehouse-space-utilisation-${row.stock_item_id}`
        : row.id != null
          ? `warehouse-space-utilisation-${row.id}`
          : `warehouse-space-utilisation-row-${index}-${row.stock_code ?? "unknown"}`,
  }));
}

function formatCellValue(value, columnKey) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (isDateColumn(columnKey)) {
    const parsed = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return formatReportDate(parsed);
    }
    return String(value).slice(0, 10);
  }

  if (isNumericColumn(columnKey) && isNumericValue(value)) {
    return formatNumberWithSeparators(value);
  }

  return String(value);
}

function getExportCellValue(value, columnKey) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (isDateColumn(columnKey)) {
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    return String(value).slice(0, 10);
  }

  if (isNumericColumn(columnKey) && isNumericValue(value)) {
    return parseRoundedNumber(value) ?? value;
  }

  return value;
}

function getExportTotalCellValue(columnKey, columnTotals) {
  if (normalizeColumnKey(columnKey) === "stock_code") return "Total";
  if (!TOTAL_COLUMN_KEYS.has(normalizeColumnKey(columnKey))) return "";
  return columnTotals[columnKey] ?? 0;
}

function getCellClassName(columnKey, { bold = false } = {}) {
  const alignment = shouldRightAlignColumn(columnKey)
    ? "px-4 py-2 text-right text-zinc-800 dark:text-zinc-200"
    : "px-4 py-2 text-zinc-800 dark:text-zinc-200";
  return bold ? `${alignment} font-bold` : alignment;
}

function computeColumnTotals(rows, columns) {
  const totals = {};

  for (const columnKey of columns) {
    if (!TOTAL_COLUMN_KEYS.has(normalizeColumnKey(columnKey))) continue;

    totals[columnKey] = rows.reduce((sum, row) => {
      const value = row[columnKey];
      if (!isNumericValue(value)) return sum;
      return sum + Number.parseFloat(value);
    }, 0);
  }

  return totals;
}

function formatTotalCellValue(columnKey, columnTotals) {
  if (normalizeColumnKey(columnKey) === "stock_code") return "Total";
  if (!TOTAL_COLUMN_KEYS.has(normalizeColumnKey(columnKey))) return "";
  return formatNumberWithSeparators(columnTotals[columnKey] ?? 0);
}

function applyExcelColumnWidths(worksheet, columns) {
  columns.forEach((columnKey, index) => {
    worksheet.getColumn(index + 1).width = getExcelColumnWidth(columnKey);
  });
}

async function writeWorkbookToFile(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function addFormattedTableToWorksheet(worksheet, rows, columns, columnTotals) {
  const headerRow = worksheet.getRow(TABLE_HEADER_ROW);
  columns.forEach((columnKey, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = formatColumnHeader(columnKey);
    cell.font = { name: "Aptos", size: 11, bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF00" },
    };
    cell.border = TABLE_BORDER;
    if (shouldRightAlignColumn(columnKey)) {
      cell.alignment = { horizontal: "right" };
    }
  });

  rows.forEach((row, rowIndex) => {
    const excelRow = worksheet.getRow(TABLE_HEADER_ROW + 1 + rowIndex);
    columns.forEach((columnKey, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1);
      const value = getExportCellValue(
        getRowColumnValue(row, columnKey),
        columnKey
      );

      cell.value = value;
      cell.font = { name: "Aptos", size: 11 };
      cell.border = TABLE_BORDER;

      if (isNumericColumn(columnKey) && typeof value === "number") {
        cell.numFmt = EXCEL_NUMBER_FORMAT;
      }

      if (isDateColumn(columnKey) && value instanceof Date) {
        cell.numFmt = "dd mmm yyyy";
      }

      if (shouldRightAlignColumn(columnKey)) {
        cell.alignment = { horizontal: "right" };
      }
    });
  });

  if (rows.length > 0) {
    const totalsRow = worksheet.getRow(TABLE_HEADER_ROW + 1 + rows.length);
    columns.forEach((columnKey, colIndex) => {
      const cell = totalsRow.getCell(colIndex + 1);
      const value = getExportTotalCellValue(columnKey, columnTotals);

      cell.value = value;
      cell.font = { name: "Aptos", size: 11, bold: true };
      cell.border = TABLE_BORDER;

      if (
        TOTAL_COLUMN_KEYS.has(normalizeColumnKey(columnKey)) &&
        typeof value === "number"
      ) {
        cell.numFmt = EXCEL_NUMBER_FORMAT;
      }

      if (shouldRightAlignColumn(columnKey)) {
        cell.alignment = { horizontal: "right" };
      }
    });
  }
}

function applyHeaderRowsFont(worksheet, columnCount) {
  for (let rowNumber = 3; rowNumber <= 7; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    for (let columnIndex = 1; columnIndex <= columnCount; columnIndex += 1) {
      row.getCell(columnIndex).font = { name: "Aptos", size: 14 };
    }
  }
}

async function exportWarehouseSpaceUtilisationToExcel(
  rows,
  columns,
  columnTotals
) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Warehouse Space Utilisation");
  const lastColumnLetter = columnIndexToLetter(Math.max(columns.length - 1, 0));

  applyExcelColumnWidths(worksheet, columns);

  worksheet.mergeCells(`A1:${lastColumnLetter}1`);
  const titleCell = worksheet.getCell("A1");
  titleCell.value = "Warehouse Space Utilisation";
  titleCell.font = { name: "Aptos", size: 18 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  worksheet.getRow(2).height = 57;

  worksheet.mergeCells(`A3:${lastColumnLetter}3`);
  const reportDateCell = worksheet.getCell("A3");
  reportDateCell.value = `Report Date: ${formatReportDate()}`;
  reportDateCell.alignment = { horizontal: "left", vertical: "middle" };

  applyHeaderRowsFont(worksheet, columns.length);
  addFormattedTableToWorksheet(worksheet, rows, columns, columnTotals);

  await writeWorkbookToFile(
    workbook,
    "warehouse-space-utilisation.xlsx"
  );
}

export function WarehouseSpaceUtilisation() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const dataColumns = useMemo(() => getColumnKeys(rows), [rows]);
  const columns = useMemo(() => getDisplayColumns(dataColumns), [dataColumns]);
  const columnTotals = useMemo(
    () => computeColumnTotals(rows, dataColumns),
    [rows, dataColumns]
  );

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "pr_rpt_warehouse_space_used"
      );
      if (rpcError) throw rpcError;
      setRows(normalizeRows(data));
    } catch (err) {
      setRows([]);
      setError(err.message ?? "Failed to load warehouse space utilisation report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  async function handleExportToExcel() {
    if (rows.length === 0 || columns.length === 0) return;

    setExporting(true);
    setError("");

    try {
      await exportWarehouseSpaceUtilisationToExcel(rows, columns, columnTotals);
    } catch (err) {
      setError(
        err.message ?? "Failed to export warehouse space utilisation report"
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      {error ? (
        <p
          className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
            <tr>
              {columns.length > 0 ? (
                columns.map((columnKey) => (
                  <th
                    key={columnKey}
                    className={`whitespace-nowrap px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300 ${
                      shouldRightAlignColumn(columnKey) ? "text-right" : ""
                    }`}
                  >
                    {formatColumnHeader(columnKey)}
                  </th>
                ))
              ) : (
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  Report
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={Math.max(columns.length, 1)}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(columns.length, 1)}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  No warehouse space utilisation records found.
                </td>
              </tr>
            ) : (
              <>
                {rows.map((row) => (
                  <tr
                    key={row.rowKey}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    {columns.map((columnKey) => (
                      <td
                        key={`${row.rowKey}-${columnKey}`}
                        className={getCellClassName(columnKey)}
                      >
                        {formatCellValue(
                          getRowColumnValue(row, columnKey),
                          columnKey
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
                  {columns.map((columnKey) => (
                    <td
                      key={`total-${columnKey}`}
                      className={getCellClassName(columnKey, { bold: true })}
                    >
                      {formatTotalCellValue(columnKey, columnTotals)}
                    </td>
                  ))}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      <div>
        <button
          type="button"
          onClick={handleExportToExcel}
          disabled={loading || exporting || rows.length === 0}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "Export to Excel"}
        </button>
      </div>
    </div>
  );
}
