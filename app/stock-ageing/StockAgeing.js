"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useState } from "react";

const COLUMNS = [
  { dataKey: "stock_code", label: "Stock Code" },
  { dataKey: "item", label: "Description" },
  { dataKey: "max", label: "Last Book-out Date" },
  { dataKey: "days_since", label: "Days Since Last Book-out" },
  { dataKey: "balance", label: "Item Balance On Hand" },
];

const TABLE_BORDER = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

const TABLE_HEADER_ROW = 5;
const EXCEL_COLUMN_WIDTHS = [18, 50, 18, 24, 22];

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

  if (column.dataKey === "max") {
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    return String(value).slice(0, 10);
  }

  if (column.dataKey === "days_since") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? value : parsed;
  }

  if (column.dataKey === "balance") {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? value : parsed;
  }

  return value;
}

function shouldRightAlignExportColumn(column) {
  return column.dataKey === "days_since" || column.dataKey === "balance";
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
    if (shouldRightAlignExportColumn(column)) {
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

      if (column.dataKey === "balance" && typeof value === "number") {
        cell.numFmt = "0.00";
      }

      if (column.dataKey === "max" && value instanceof Date) {
        cell.numFmt = "dd mmm yyyy";
      }

      if (shouldRightAlignExportColumn(column)) {
        cell.alignment = { horizontal: "right" };
      }
    });
  });
}

async function exportStockAgeingToExcel(rows) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Stock Ageing");

  applyExcelColumnWidths(worksheet);

  worksheet.mergeCells("A1:E1");
  const titleCell = worksheet.getCell("A1");
  titleCell.value = "Stock Ageing";
  titleCell.font = { name: "Aptos", size: 18 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  worksheet.getRow(2).height = 57;

  worksheet.mergeCells("A3:E3");
  const reportDateCell = worksheet.getCell("A3");
  reportDateCell.value = `Report Date: ${formatReportDate()}`;
  reportDateCell.font = { name: "Aptos", size: 14 };
  reportDateCell.alignment = { horizontal: "left", vertical: "middle" };

  addFormattedTableToWorksheet(worksheet, rows);

  await writeWorkbookToFile(workbook, "stock-ageing.xlsx");
}

function normalizeStockAgeingRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    rowKey:
      row.id != null
        ? `stock-ageing-${row.id}`
        : `stock-ageing-row-${index}-${row.stock_code ?? "unknown"}`,
  }));
}

function isDateColumn(label) {
  return label === "Last Book-out Date";
}

function isNumericColumn(label) {
  return (
    label === "Days Since Last Book-out" ||
    label === "Item Balance On Hand"
  );
}

function formatCellValue(value, columnLabel) {
  if (value == null || value === "") return "";

  if (
    isDateColumn(columnLabel) &&
    (typeof value === "string" || value instanceof Date)
  ) {
    return String(value).slice(0, 10);
  }

  if (isNumericColumn(columnLabel)) {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) {
      return columnLabel === "Days Since Last Book-out"
        ? String(Math.trunc(parsed))
        : parsed.toFixed(2);
    }
  }

  return String(value);
}

function getCellClassName(columnLabel) {
  return isNumericColumn(columnLabel)
    ? "px-4 py-2 text-right text-zinc-800 dark:text-zinc-200"
    : "px-4 py-2 text-zinc-800 dark:text-zinc-200";
}

export function StockAgeing() {
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
        "pr_rpt_stock_ageing"
      );
      if (rpcError) throw rpcError;
      setRows(normalizeStockAgeingRows(data));
    } catch (err) {
      setRows([]);
      setError(err.message ?? "Failed to load stock ageing report");
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
      await exportStockAgeingToExcel(rows);
    } catch (err) {
      setError(err.message ?? "Failed to export stock ageing report");
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
                    isNumericColumn(column.label) ? "text-right" : ""
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
                  No stock ageing records found.
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
                      className={getCellClassName(column.label)}
                    >
                      {formatCellValue(row[column.dataKey], column.label)}
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
