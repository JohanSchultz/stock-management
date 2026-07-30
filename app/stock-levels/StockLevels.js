"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useMemo, useState } from "react";

const HIDDEN_COLUMN_KEYS = new Set(["stock_item_id"]);

const PREFERRED_COLUMN_ORDER = [
  "stock_code",
  "descr",
  "unit_price",
  "qty_in",
  "value_in",
  "qty_out",
  "value_out",
  "qty_reserved",
  "value_reserved",
  "qty_on_order",
  "value_on_order",
  "qty_available",
  "value_available",
  "expiry_date",
];

const TEXT_COLUMN_KEYS = new Set(["stock_code", "descr"]);

const TOTAL_COLUMN_KEYS = new Set([
  "qty_in",
  "value_in",
  "qty_out",
  "value_out",
  "qty_reserved",
  "value_reserved",
  "qty_on_order",
  "value_on_order",
  "qty_available",
  "value_available",
]);

const TABLE_BORDER = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

const TABLE_HEADER_ROW = 5;
const EXCEL_NUMBER_FORMAT = "#,##0.00";

const numberFormatter = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatReportDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatColumnHeader(key) {
  const normalized = key.trim().toLowerCase();
  if (normalized === "descr") return "Description";
  if (normalized === "stock_code") return "Stock Code";
  if (normalized === "expiry_date") return "Expiry Date";

  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getColumnKeys(rows) {
  const keys = new Set();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key === "rowKey") continue;
      if (HIDDEN_COLUMN_KEYS.has(key)) continue;
      keys.add(key);
    }
  }

  const preferred = PREFERRED_COLUMN_ORDER.filter((key) => keys.has(key));
  const remaining = Array.from(keys)
    .filter((key) => !PREFERRED_COLUMN_ORDER.includes(key))
    .sort((left, right) => left.localeCompare(right));

  return [...preferred, ...remaining];
}

function isDateColumn(columnKey) {
  return columnKey.trim().toLowerCase().includes("date");
}

function isTextColumn(columnKey) {
  return TEXT_COLUMN_KEYS.has(columnKey.trim().toLowerCase());
}

function isNumericValue(value) {
  if (value == null || value === "") return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return false;

  const parsed = Number.parseFloat(value);
  return !Number.isNaN(parsed);
}

function shouldRightAlignColumn(columnKey) {
  return !isTextColumn(columnKey);
}

function formatNumberWithSeparators(value) {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) return String(value);
  return numberFormatter.format(parsed);
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
  const normalized = columnKey.trim().toLowerCase();
  if (normalized === "descr") return 50;
  if (normalized === "stock_code") return 18;
  if (isDateColumn(columnKey)) return 14;
  return 14;
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

function getExportCellValue(value, columnKey) {
  if (value == null || value === "") return "";

  if (
    isDateColumn(columnKey) &&
    (typeof value === "string" || value instanceof Date)
  ) {
    const parsed = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    return String(value).slice(0, 10);
  }

  if (!isTextColumn(columnKey) && isNumericValue(value)) {
    const rounded = parseRoundedNumber(value);
    return rounded ?? value;
  }

  return value;
}

function getExportTotalCellValue(columnKey, columnTotals) {
  if (columnKey === "stock_code") return "Total";
  if (!TOTAL_COLUMN_KEYS.has(columnKey)) return "";
  return parseRoundedNumber(columnTotals[columnKey] ?? 0) ?? 0;
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
      const value = getExportCellValue(row[columnKey], columnKey);

      cell.value = value;
      cell.font = { name: "Aptos", size: 11 };
      cell.border = TABLE_BORDER;

      if (!isTextColumn(columnKey) && typeof value === "number") {
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

      if (TOTAL_COLUMN_KEYS.has(columnKey) && typeof value === "number") {
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

async function exportStockLevelsToExcel(rows, columns, columnTotals) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Stock Levels");
  const lastColumnLetter = columnIndexToLetter(Math.max(columns.length - 1, 0));

  applyExcelColumnWidths(worksheet, columns);

  worksheet.mergeCells(`A1:${lastColumnLetter}1`);
  const titleCell = worksheet.getCell("A1");
  titleCell.value = "Stock Levels";
  titleCell.font = { name: "Aptos", size: 18 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  worksheet.getRow(2).height = 57;

  worksheet.mergeCells(`A3:${lastColumnLetter}3`);
  const reportDateCell = worksheet.getCell("A3");
  reportDateCell.value = `Report Date: ${formatReportDate()}`;
  reportDateCell.alignment = { horizontal: "left", vertical: "middle" };

  applyHeaderRowsFont(worksheet, columns.length);
  addFormattedTableToWorksheet(worksheet, rows, columns, columnTotals);

  await writeWorkbookToFile(workbook, "stock-levels.xlsx");
}

function normalizeStockLevelsRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    rowKey:
      row.stock_item_id != null
        ? `stock-levels-${row.stock_item_id}`
        : `stock-levels-row-${index}-${row.stock_code ?? "unknown"}`,
  }));
}

function formatCellValue(value, columnKey) {
  if (value == null || value === "") return "";

  if (
    isDateColumn(columnKey) &&
    (typeof value === "string" || value instanceof Date)
  ) {
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return String(value).slice(0, 10);
    }
    return formatReportDate(parsed);
  }

  if (isTextColumn(columnKey)) {
    return String(value);
  }

  if (isNumericValue(value)) {
    return formatNumberWithSeparators(value);
  }

  return String(value);
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
    if (!TOTAL_COLUMN_KEYS.has(columnKey)) continue;

    totals[columnKey] = rows.reduce((sum, row) => {
      const value = row[columnKey];
      if (!isNumericValue(value)) return sum;
      return sum + Number.parseFloat(value);
    }, 0);
  }

  return totals;
}

function formatTotalCellValue(columnKey, columnTotals) {
  if (columnKey === "stock_code") return "Total";
  if (!TOTAL_COLUMN_KEYS.has(columnKey)) return "";
  return formatNumberWithSeparators(columnTotals[columnKey] ?? 0);
}

export function StockLevels() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const columns = useMemo(() => getColumnKeys(rows), [rows]);
  const columnTotals = useMemo(
    () => computeColumnTotals(rows, columns),
    [rows, columns]
  );

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "pr_rpt_stock_levels_unit_price"
      );
      if (rpcError) throw rpcError;
      setRows(normalizeStockLevelsRows(data));
    } catch (err) {
      setRows([]);
      setError(err.message ?? "Failed to load stock levels report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  async function handleExportToExcel() {
    if (rows.length === 0) return;

    setExporting(true);
    setError("");

    try {
      await exportStockLevelsToExcel(rows, columns, columnTotals);
    } catch (err) {
      setError(err.message ?? "Failed to export stock levels report");
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
              {columns.map((columnKey) => (
                <th
                  key={columnKey}
                  className={`whitespace-nowrap px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300 ${
                    shouldRightAlignColumn(columnKey) ? "text-right" : ""
                  }`}
                >
                  {formatColumnHeader(columnKey)}
                </th>
              ))}
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
                  No stock levels records found.
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
                        {formatCellValue(row[columnKey], columnKey)}
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
