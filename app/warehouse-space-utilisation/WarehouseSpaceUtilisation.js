"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useMemo, useState } from "react";

const HIDDEN_COLUMN_KEYS = new Set(["id", "stock_item_id"]);
const COLUMN_HEADER_OVERRIDES = {
  space: "Space Used",
  avail: "Warehouse Size",
  perc: "Percentage Used",
};
const NUMERIC_COLUMN_PATTERN =
  /(?:^|_)(qty|quantity|volume|cubic|space|length|width|height|depth|percent|pct|utilisation|utilization|balance|total|amount|price|weight|size|capacity|used|available)(?:_|$)/i;

const TABLE_BORDER = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

const TABLE_HEADER_ROW = 5;
const EXCEL_LAST_COLUMN = "E";
const EXCEL_COLUMN_COUNT = 5;
const EXCEL_COLUMN_WIDTHS = [18, 50, 18, 18, 18];

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

function normalizeColumnKey(key) {
  return String(key ?? "").trim().toLowerCase();
}

function findColumn(columns, name) {
  return columns.find((column) => normalizeColumnKey(column) === name);
}

function sumColumnValues(rows, column) {
  if (!column) return null;

  return rows.reduce((sum, row) => {
    const parsed = Number.parseFloat(row[column]);
    return Number.isNaN(parsed) ? sum : sum + parsed;
  }, 0);
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
  const keys = new Set();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key === "rowKey") continue;
      if (HIDDEN_COLUMN_KEYS.has(key.toLowerCase())) continue;
      keys.add(key);
    }
  }

  return Array.from(keys);
}

function isNumericColumn(column) {
  const normalized = normalizeColumnKey(column);
  if (
    normalized === "space" ||
    normalized === "avail" ||
    normalized === "perc"
  ) {
    return true;
  }

  return NUMERIC_COLUMN_PATTERN.test(column);
}

function isDateColumn(column) {
  return /(?:^|_)(date|max|expiry)(?:_|$)/i.test(column);
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

function formatCellValue(value, column) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (isDateColumn(column)) {
    const parsed = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return formatReportDate(parsed);
    }
    return String(value).slice(0, 10);
  }

  if (isNumericColumn(column)) {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) {
      return parsed.toFixed(2);
    }
  }

  return String(value);
}

function getExportCellValue(value, column) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (isDateColumn(column)) {
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    return String(value).slice(0, 10);
  }

  if (isNumericColumn(column)) {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? value : parsed;
  }

  return value;
}

function getCellClassName(column) {
  return isNumericColumn(column)
    ? "px-4 py-2 text-right text-zinc-800 dark:text-zinc-200"
    : "px-4 py-2 text-zinc-800 dark:text-zinc-200";
}

function applyExcelColumnWidths(worksheet) {
  EXCEL_COLUMN_WIDTHS.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
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

function addFormattedTableToWorksheet(worksheet, rows, columns) {
  const headerRow = worksheet.getRow(TABLE_HEADER_ROW);
  columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = formatColumnHeader(column);
    cell.font = { name: "Aptos", size: 11, bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF00" },
    };
    cell.border = TABLE_BORDER;
    if (isNumericColumn(column)) {
      cell.alignment = { horizontal: "right" };
    }
  });

  rows.forEach((row, rowIndex) => {
    const excelRow = worksheet.getRow(TABLE_HEADER_ROW + 1 + rowIndex);
    columns.forEach((column, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1);
      const value = getExportCellValue(row[column], column);

      cell.value = value;
      cell.font = { name: "Aptos", size: 11 };
      cell.border = TABLE_BORDER;

      if (isNumericColumn(column) && typeof value === "number") {
        cell.numFmt = "0.00";
      }

      if (isDateColumn(column) && value instanceof Date) {
        cell.numFmt = "dd mmm yyyy";
      }

      if (isNumericColumn(column)) {
        cell.alignment = { horizontal: "right" };
      }
    });
  });
}

function applyHeaderRowsFont(worksheet) {
  for (let rowNumber = 3; rowNumber <= 7; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    for (let columnIndex = 1; columnIndex <= EXCEL_COLUMN_COUNT; columnIndex += 1) {
      row.getCell(columnIndex).font = { name: "Aptos", size: 14 };
    }
  }
}

async function exportWarehouseSpaceUtilisationToExcel(rows, columns) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Warehouse Space Utilisation");

  applyExcelColumnWidths(worksheet);

  worksheet.mergeCells(`A1:${EXCEL_LAST_COLUMN}1`);
  const titleCell = worksheet.getCell("A1");
  titleCell.value = "Warehouse Space Utilisation";
  titleCell.font = { name: "Aptos", size: 18 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  worksheet.getRow(2).height = 57;

  const reportDateCell = worksheet.getCell("A3");
  reportDateCell.value = `Report Date: ${formatReportDate()}`;
  reportDateCell.alignment = { horizontal: "left", vertical: "middle" };

  applyHeaderRowsFont(worksheet);
  addFormattedTableToWorksheet(worksheet, rows, columns);

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

  const columns = useMemo(() => getColumnKeys(rows), [rows]);
  const spaceUsedColumn = useMemo(() => findColumn(columns, "space"), [columns]);
  const percentageUsedColumn = useMemo(
    () => findColumn(columns, "perc"),
    [columns]
  );
  const totalSpaceUsed = useMemo(() => {
    const total = sumColumnValues(rows, spaceUsedColumn);
    return total == null ? "" : total.toFixed(2);
  }, [rows, spaceUsedColumn]);
  const totalPercentageUsed = useMemo(() => {
    const total = sumColumnValues(rows, percentageUsedColumn);
    return total == null ? "" : total.toFixed(2);
  }, [rows, percentageUsedColumn]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "pr_rpt_warehouse_space"
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
      await exportWarehouseSpaceUtilisationToExcel(rows, columns);
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
                columns.map((column) => (
                  <th
                    key={column}
                    className={`whitespace-nowrap px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300 ${
                      isNumericColumn(column) ? "text-right" : ""
                    }`}
                  >
                    {formatColumnHeader(column)}
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
              rows.map((row) => (
                <tr
                  key={row.rowKey}
                  className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                >
                  {columns.map((column) => (
                    <td
                      key={`${row.rowKey}-${column}`}
                      className={getCellClassName(column)}
                    >
                      {formatCellValue(row[column], column)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="grid max-w-md gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Total Space Used
          </span>
          <input
            type="text"
            readOnly
            value={totalSpaceUsed}
            className={inputClassName}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Percentage Used
          </span>
          <input
            type="text"
            readOnly
            value={totalPercentageUsed}
            className={inputClassName}
          />
        </label>
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
