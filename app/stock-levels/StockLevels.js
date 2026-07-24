"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useState } from "react";

const COLUMNS = [
  { dataKey: "stock_code", label: "Stock Code" },
  { dataKey: "descr", label: "Description" },
  { dataKey: "qty_in", label: "Qty In" },
  { dataKey: "qty_out", label: "Qty Out" },
  { dataKey: "qty_reserved", label: "Qty Reserved" },
  { dataKey: "qty_on_order", label: "Qty On Order" },
  { dataKey: "qty_available", label: "Qty Available" },
  { dataKey: "expiry_date", label: "Expiry Date" },
];

const NUMERIC_COLUMN_KEYS = new Set([
  "qty_in",
  "qty_out",
  "qty_reserved",
  "qty_on_order",
  "qty_available",
]);

const TABLE_BORDER = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

const TABLE_HEADER_ROW = 5;
const EXCEL_COLUMN_WIDTHS = [18, 50, 12, 12, 14, 14, 14, 14];

function formatReportDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
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

function getExportCellValue(value, column) {
  if (value == null || value === "") return "";

  if (column.dataKey === "expiry_date") {
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    return String(value).slice(0, 10);
  }

  if (NUMERIC_COLUMN_KEYS.has(column.dataKey)) {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? value : parsed;
  }

  return value;
}

function isNumericColumn(column) {
  return NUMERIC_COLUMN_KEYS.has(column.dataKey);
}

function isDateColumn(column) {
  return column.dataKey === "expiry_date";
}

function addFormattedTableToWorksheet(worksheet, rows) {
  const headerRow = worksheet.getRow(TABLE_HEADER_ROW);
  COLUMNS.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.label;
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
    COLUMNS.forEach((column, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1);
      const value = getExportCellValue(row[column.dataKey], column);

      cell.value = value;
      cell.font = { name: "Aptos", size: 11 };
      cell.border = TABLE_BORDER;

      if (isNumericColumn(column) && typeof value === "number") {
        cell.numFmt = "0.00";
      }

      if (column.dataKey === "expiry_date" && value instanceof Date) {
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
    for (let columnIndex = 1; columnIndex <= COLUMNS.length; columnIndex += 1) {
      row.getCell(columnIndex).font = { name: "Aptos", size: 14 };
    }
  }
}

async function exportStockLevelsToExcel(rows) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Stock Levels");

  applyExcelColumnWidths(worksheet);

  worksheet.mergeCells("A1:H1");
  const titleCell = worksheet.getCell("A1");
  titleCell.value = "Stock Levels";
  titleCell.font = { name: "Aptos", size: 18 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  worksheet.getRow(2).height = 57;

  worksheet.mergeCells("A3:H3");
  const reportDateCell = worksheet.getCell("A3");
  reportDateCell.value = `Report Date: ${formatReportDate()}`;
  reportDateCell.alignment = { horizontal: "left", vertical: "middle" };

  applyHeaderRowsFont(worksheet);

  addFormattedTableToWorksheet(worksheet, rows);

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

function formatCellValue(value, column) {
  if (value == null || value === "") return "";

  if (
    isDateColumn(column) &&
    (typeof value === "string" || value instanceof Date)
  ) {
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return String(value).slice(0, 10);
    }
    return formatReportDate(parsed);
  }

  if (isNumericColumn(column)) {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) {
      return parsed.toFixed(2);
    }
  }

  return String(value);
}

function getCellClassName(column) {
  return isNumericColumn(column)
    ? "px-4 py-2 text-right text-zinc-800 dark:text-zinc-200"
    : "px-4 py-2 text-zinc-800 dark:text-zinc-200";
}

export function StockLevels() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "pr_rpt_stock_levels"
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
      await exportStockLevelsToExcel(rows);
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
              {COLUMNS.map((column) => (
                <th
                  key={column.dataKey}
                  className={`whitespace-nowrap px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300 ${
                    isNumericColumn(column) ? "text-right" : ""
                  }`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  No stock levels records found.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.rowKey}
                  className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                >
                  {COLUMNS.map((column) => (
                    <td
                      key={`${row.rowKey}-${column.dataKey}`}
                      className={getCellClassName(column)}
                    >
                      {formatCellValue(row[column.dataKey], column)}
                    </td>
                  ))}
                </tr>
              ))
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
