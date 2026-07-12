"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useMemo, useState } from "react";

const TABLE_BORDER = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

function normalizeStockBalanceRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    rowKey:
      row.id != null
        ? `stock-balance-${row.id}`
        : `stock-balance-row-${index}`,
  }));
}

function formatColumnHeader(key) {
  const normalized = key.trim().toLowerCase();
  if (normalized === "totalprice" || normalized === "total_price") {
    return "Total Price";
  }

  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getColumnKeys(rows, { excludeId = true } = {}) {
  const keys = new Set();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key === "rowKey") continue;
      if (excludeId && key.toLowerCase() === "id") continue;
      keys.add(key);
    }
  }

  return Array.from(keys);
}

function normalizeStockMovementRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    rowKey:
      row.id != null
        ? `stock-movement-${row.id}`
        : `stock-movement-row-${index}`,
  }));
}

function parseInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function isUnitPriceColumn(column) {
  const key = column.trim().toLowerCase();
  const header = formatColumnHeader(column).toLowerCase();
  return key === "unit_price" || key === "unitprice" || header === "unit price";
}

function isTotalPriceColumn(column) {
  const key = column.trim().toLowerCase();
  const header = formatColumnHeader(column).toLowerCase();
  return (
    key === "totalprice" ||
    key === "total_price" ||
    header === "totalprice" ||
    header === "total price"
  );
}

function shouldRoundToTwoDecimals(column) {
  const key = column.trim().toLowerCase();
  if (key === "on_hand" || key === "available") return true;
  if (isUnitPriceColumn(column) || isTotalPriceColumn(column)) return true;

  const header = formatColumnHeader(column).toLowerCase();
  return header === "on hand" || header === "available";
}

function shouldRightAlignColumn(column) {
  return isUnitPriceColumn(column) || isTotalPriceColumn(column);
}

function getMovementCellClassName(column) {
  return shouldRightAlignColumn(column)
    ? "px-4 py-2 text-right text-zinc-800 dark:text-zinc-200"
    : "px-4 py-2 text-zinc-800 dark:text-zinc-200";
}

function formatCellValue(value, column) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (shouldRoundToTwoDecimals(column)) {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) return parsed.toFixed(2);
  }

  return String(value);
}

function getExportCellValue(value, column) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (shouldRoundToTwoDecimals(column)) {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return value;
}

function formatReportDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

const TABLE_HEADER_ROW = 5;
const EXCEL_COLUMN_WIDTHS = [18, 80, 12, 15, 18, 26, 20, 15, 15];

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

function addFormattedTableToWorksheet(worksheet, rows, columns, startHeaderRow) {
  const headerRow = worksheet.getRow(startHeaderRow);
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
    if (shouldRightAlignColumn(column)) {
      cell.alignment = { horizontal: "right" };
    }
  });

  rows.forEach((row, rowIndex) => {
    const excelRow = worksheet.getRow(startHeaderRow + 1 + rowIndex);
    columns.forEach((column, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1);
      const value = getExportCellValue(row[column], column);

      cell.value = value;
      cell.font = { name: "Aptos", size: 11 };
      cell.border = TABLE_BORDER;

      if (shouldRoundToTwoDecimals(column) && typeof value === "number") {
        cell.numFmt = "0.00";
      }

      if (shouldRightAlignColumn(column)) {
        cell.alignment = { horizontal: "right" };
      }
    });
  });
}

async function exportStockBalanceToExcel(rows, columns) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Stock Balances");

  applyExcelColumnWidths(worksheet);

  worksheet.mergeCells("A1:D1");
  const titleCell = worksheet.getCell("A1");
  titleCell.value = "Stock Balances";
  titleCell.font = { name: "Aptos", size: 18 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  worksheet.getRow(2).height = 57;

  const reportDateCell = worksheet.getCell("A3");
  reportDateCell.value = `Report Date: ${formatReportDate()}`;
  reportDateCell.font = { name: "Aptos", size: 11 };

  addFormattedTableToWorksheet(worksheet, rows, columns, TABLE_HEADER_ROW);

  await writeWorkbookToFile(workbook, "stock-balances.xlsx");
}

async function exportStockMovementToExcel(rows, columns) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Stock Movement");

  applyExcelColumnWidths(worksheet);

  worksheet.mergeCells("A1:I1");
  const titleCell = worksheet.getCell("A1");
  titleCell.value = "Stock Movement";
  titleCell.font = { name: "Aptos", size: 18 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  const reportDateCell = worksheet.getCell("A3");
  reportDateCell.value = `Report Date: ${formatReportDate()}`;
  reportDateCell.font = { name: "Aptos", size: 11 };

  addFormattedTableToWorksheet(worksheet, rows, columns, TABLE_HEADER_ROW);

  await writeWorkbookToFile(workbook, "stock-movement.xlsx");
}

export function StockBalanceReport() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [selectedRowKey, setSelectedRowKey] = useState(null);
  const [movementOpen, setMovementOpen] = useState(false);
  const [movementRows, setMovementRows] = useState([]);
  const [movementLoading, setMovementLoading] = useState(false);
  const [movementError, setMovementError] = useState("");
  const [movementExporting, setMovementExporting] = useState(false);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("pr_stock_balance");
      if (rpcError) throw rpcError;
      setRows(normalizeStockBalanceRows(data));
    } catch (err) {
      setRows([]);
      setError(err.message ?? "Failed to load stock balance report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const columns = useMemo(() => getColumnKeys(rows), [rows]);
  const movementColumns = useMemo(
    () => getColumnKeys(movementRows),
    [movementRows]
  );

  async function handleRowClick(row) {
    const stockItemId = parseInteger(row.id);
    if (stockItemId == null) return;

    setSelectedRowKey(row.rowKey);
    setMovementOpen(true);
    setMovementLoading(true);
    setMovementError("");
    setMovementRows([]);

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("pr_stock_movement", {
        p_stock_item_id: stockItemId,
      });
      if (rpcError) throw rpcError;
      setMovementRows(normalizeStockMovementRows(data));
    } catch (err) {
      setMovementRows([]);
      setMovementError(err.message ?? "Failed to load stock movement");
    } finally {
      setMovementLoading(false);
    }
  }

  function handleCloseMovement() {
    setMovementOpen(false);
    setMovementRows([]);
    setMovementError("");
    setMovementExporting(false);
  }

  async function handleExportMovementToExcel() {
    if (movementRows.length === 0 || movementColumns.length === 0) return;

    setMovementExporting(true);
    setMovementError("");

    try {
      await exportStockMovementToExcel(movementRows, movementColumns);
    } catch (err) {
      setMovementError(err.message ?? "Failed to export stock movement report");
    } finally {
      setMovementExporting(false);
    }
  }

  async function handleExportToExcel() {
    if (rows.length === 0 || columns.length === 0) return;

    setExporting(true);
    setError("");

    try {
      await exportStockBalanceToExcel(rows, columns);
    } catch (err) {
      setError(err.message ?? "Failed to export stock balance report");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mt-4 w-full">
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        Select an item to see the movement report
      </p>

      {error ? (
        <p
          className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300"
                >
                  {formatColumnHeader(column)}
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
                  No stock balance records found.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.rowKey}
                  onClick={() => handleRowClick(row)}
                  className={`cursor-pointer border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 ${
                    selectedRowKey === row.rowKey
                      ? "bg-sky-50 dark:bg-sky-900/20"
                      : ""
                  }`}
                >
                  {columns.map((column) => (
                    <td
                      key={`${row.rowKey}-${column}`}
                      className="px-4 py-2 text-zinc-800 dark:text-zinc-200"
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

      <div className="mt-4">
        <button
          type="button"
          onClick={handleExportToExcel}
          disabled={loading || exporting || rows.length === 0}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "Export to Excel"}
        </button>
      </div>

      {movementOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="stock-movement-title"
            className="flex max-h-[90vh] w-full max-w-[76.8rem] flex-col rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <h3
                id="stock-movement-title"
                className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
              >
                Stock Movement
              </h3>
              <button
                type="button"
                onClick={handleCloseMovement}
                className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              >
                Close
              </button>
            </div>

            <div className="overflow-auto p-4">
              {movementError ? (
                <p
                  className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
                  role="alert"
                >
                  {movementError}
                </p>
              ) : null}

              <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <table className="w-full min-w-max text-left text-sm">
                  <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <tr>
                      {movementColumns.map((column) => (
                        <th
                          key={column}
                          className={`px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300 ${
                            shouldRightAlignColumn(column) ? "text-right" : ""
                          }`}
                        >
                          {formatColumnHeader(column)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movementLoading ? (
                      <tr>
                        <td
                          colSpan={Math.max(movementColumns.length, 1)}
                          className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                        >
                          Loading…
                        </td>
                      </tr>
                    ) : movementRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={Math.max(movementColumns.length, 1)}
                          className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                        >
                          No stock movement records found.
                        </td>
                      </tr>
                    ) : (
                      movementRows.map((movementRow) => (
                        <tr
                          key={movementRow.rowKey}
                          className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                        >
                          {movementColumns.map((column) => (
                            <td
                              key={`${movementRow.rowKey}-${column}`}
                              className={getMovementCellClassName(column)}
                            >
                              {formatCellValue(movementRow[column], column)}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleExportMovementToExcel}
                  disabled={
                    movementLoading ||
                    movementExporting ||
                    movementRows.length === 0
                  }
                  className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {movementExporting ? "Exporting…" : "Export to Excel"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
