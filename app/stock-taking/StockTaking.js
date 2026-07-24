"use client";

import { createClient } from "@/lib/supabase/client";
import {
  getSessionUser,
  sessionUserLabel,
} from "@/lib/supabase/browserSession";
import { useCallback, useEffect, useMemo, useState } from "react";


const COLUMN_HEADER_OVERRIDES = {
  expiry_date: "Expiry Date",
  nett: "Count On System",
};
const GRID_COLUMNS = ["id", "stock_code", "expiry_date", "nett", "counted"];
const EXPORT_COLUMNS = ["stock_code", "expiry_date", "nett", "counted"];
const NUMERIC_COLUMN_PATTERN =
  /(?:^|_)(qty|quantity|balance|count|price|amount|total|on_hand|available|reserved|ordered|unit|weight|cost)(?:_|$)/i;

const TABLE_BORDER = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

const TABLE_HEADER_ROW = 5;
const EXCEL_LAST_COLUMN = "D";
const EXCEL_COLUMN_COUNT = 4;
const EXCEL_COLUMN_WIDTHS = [40, 20, 20, 20];

const inputClassName =
  "w-full min-w-[5rem] rounded border border-zinc-300 bg-white px-2 py-1 text-center text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

const dateInputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

function normalizeColumnKey(key) {
  return String(key ?? "").trim().toLowerCase();
}

function isCountedColumn(column) {
  return normalizeColumnKey(column) === "counted";
}

function isHiddenGridColumn(column) {
  return normalizeColumnKey(column) === "id";
}

function formatReportDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function todayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseFloatValue(value) {
  if (value === "" || value == null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseIntegerValue(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseExpiryDateForRpc(value) {
  if (value == null || value === "") return null;

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function formatColumnHeader(key) {
  const normalized = key.trim().toLowerCase();
  if (COLUMN_HEADER_OVERRIDES[normalized]) {
    return COLUMN_HEADER_OVERRIDES[normalized];
  }
  if (normalized === "descr") return "Description";
  if (normalized === "stock_code") return "Stock Code";

  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getColumnKeys() {
  return GRID_COLUMNS;
}

function isExpiryDateColumn(column) {
  return normalizeColumnKey(column) === "expiry_date";
}

function isNumericColumn(column) {
  if (isCountedColumn(column)) return true;

  return NUMERIC_COLUMN_PATTERN.test(column);
}

function isDateColumn(column) {
  return isExpiryDateColumn(column);
}

function normalizeRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    rowKey: `stock-taking-row-${index}-${row.id ?? "no-id"}-${row.stock_code ?? "unknown"}`,
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

function getExcelCellAlignment(colIndex, column) {
  if (colIndex === 1 || colIndex === 2 || colIndex === 3) {
    return { horizontal: "center" };
  }

  if (isNumericColumn(column)) {
    return { horizontal: "right" };
  }

  return undefined;
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
    const alignment = getExcelCellAlignment(index, column);
    if (alignment) {
      cell.alignment = alignment;
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

      const alignment = getExcelCellAlignment(colIndex, column);
      if (alignment) {
        cell.alignment = alignment;
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

async function exportStockTakingToExcel(rows, columns) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Stock Taking Form");

  applyExcelColumnWidths(worksheet);

  worksheet.mergeCells(`A1:${EXCEL_LAST_COLUMN}1`);
  const titleCell = worksheet.getCell("A1");
  titleCell.value = "Stock Taking Form";
  titleCell.font = { name: "Aptos", size: 18 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  worksheet.getRow(2).height = 57;

  const stockTakingDateCell = worksheet.getCell("A3");
  stockTakingDateCell.value = `Stock Taking Date: ${formatReportDate()}`;
  stockTakingDateCell.alignment = { horizontal: "left", vertical: "middle" };

  applyHeaderRowsFont(worksheet);
  addFormattedTableToWorksheet(worksheet, rows, columns);

  await writeWorkbookToFile(workbook, "stock-taking.xlsx");
}

export function StockTaking() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [stockTakingDate, setStockTakingDate] = useState(todayIsoDate);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const columns = useMemo(() => getColumnKeys(), []);
  const exportColumns = useMemo(() => EXPORT_COLUMNS, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "pr_stock_taking_form"
      );
      if (rpcError) throw rpcError;
      setRows(normalizeRows(data));
    } catch (err) {
      setRows([]);
      setError(err.message ?? "Failed to load stock taking data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  async function handleExportToExcel() {
    if (rows.length === 0 || exportColumns.length === 0) return;

    setExporting(true);
    setError("");

    try {
      await exportStockTakingToExcel(rows, exportColumns);
    } catch (err) {
      setError(err.message ?? "Failed to export stock taking data");
    } finally {
      setExporting(false);
    }
  }

  function handleSaveClick() {
    setError("");
    setSuccess("");
    setConfirmOpen(true);
  }

  function handleConfirmNo() {
    setConfirmOpen(false);
  }

  async function saveCountedNumbers() {
    const supabase = createClient();
    const user = await getSessionUser(supabase);
    const username = sessionUserLabel(user).trim();

    if (!username) {
      throw new Error("Unable to determine the signed-in user.");
    }

    for (const row of rows) {
      const countedValue = parseFloatValue(row.counted);
      if (row.counted === "" || row.counted == null || countedValue == null) {
        continue;
      }

      const countOnSystem = parseFloatValue(row.nett);
      if (countOnSystem == null) {
        continue;
      }

      if (countedValue === countOnSystem) {
        continue;
      }

      const stockItemId = parseIntegerValue(row.id);
      if (stockItemId == null) {
        continue;
      }

      const payload = {
        p_stock_item_id: stockItemId,
        p_expiry_date: parseExpiryDateForRpc(row.expiry_date),
        p_count_on_system: countOnSystem,
        p_counted: countedValue,
        p_username: username,
      };

      const rpcName =
        countedValue > countOnSystem
          ? "pi_stock_taking_more"
          : "pi_stock_taking_less";

      const { error: rpcError } = await supabase.rpc(rpcName, payload);
      if (rpcError) throw rpcError;
    }
  }

  async function handleConfirmYes() {
    setConfirmOpen(false);
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await saveCountedNumbers();
      setSuccess("Counted numbers saved.");
      await loadRows();
    } catch (err) {
      setError(err.message ?? "Failed to save counted numbers");
    } finally {
      setSaving(false);
    }
  }

  function handleCountedChange(rowKey, column, value) {
    setRows((current) =>
      current.map((row) =>
        row.rowKey === rowKey ? { ...row, [column]: value } : row
      )
    );
  }

  function renderCell(row, column) {
    if (isCountedColumn(column)) {
      return (
        <input
          type="number"
          step="any"
          inputMode="decimal"
          value={row[column] ?? ""}
          onChange={(e) =>
            handleCountedChange(row.rowKey, column, e.target.value)
          }
          className={inputClassName}
          aria-label={`Counted for ${row.stock_code ?? row.rowKey}`}
        />
      );
    }

    return formatCellValue(row[column], column);
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

      {success ? (
        <p
          className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          role="status"
        >
          {success}
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
                      isHiddenGridColumn(column) ? "hidden" : ""
                    } ${
                      isCountedColumn(column)
                        ? "text-center"
                        : isNumericColumn(column)
                          ? "text-right"
                          : isExpiryDateColumn(column)
                            ? "text-center"
                            : ""
                    }`}
                  >
                    {formatColumnHeader(column)}
                  </th>
                ))
              ) : (
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  Stock Taking
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
                  No stock taking records found.
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
                      className={`${
                        isHiddenGridColumn(column) ? "hidden" : ""
                      } ${
                        isCountedColumn(column)
                          ? "px-4 py-2"
                          : isExpiryDateColumn(column)
                            ? "px-4 py-2 text-center text-zinc-800 dark:text-zinc-200"
                            : getCellClassName(column)
                      }`}
                    >
                      {renderCell(row, column)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex w-full items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleExportToExcel}
          disabled={loading || exporting || rows.length === 0}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "Export to Excel"}
        </button>

        <input
          type="date"
          value={stockTakingDate}
          onChange={(e) => setStockTakingDate(e.target.value)}
          className={dateInputClassName}
          aria-label="Stock taking date"
        />

        <button
          type="button"
          onClick={handleSaveClick}
          disabled={loading || saving || rows.length === 0}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Counted Numbers"}
        </button>
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="stock-taking-confirm-title"
            className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h3
              id="stock-taking-confirm-title"
              className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Confirm Save
            </h3>
            <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
              Please confirm to make changes to the stock numbers on the
              system.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleConfirmNo}
                className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                No
              </button>
              <button
                type="button"
                onClick={handleConfirmYes}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
