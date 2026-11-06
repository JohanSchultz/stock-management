"use client";

import { SupplierSelect } from "@/components/SupplierSelect";
import {
  formatGridQtyOrUnitPrice,
  isQtyOrUnitPriceColumnKey,
} from "@/lib/format/gridNumberFormat";
import {
  oneMonthBeforeIsoDate,
  tomorrowIsoDate,
} from "@/lib/date/isoMonthRange";
import {
  getDbnNumberFromReportRow,
  printDebitNoteByNumber,
} from "@/lib/debitNotes/printDebitNotePdf";
import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useMemo, useState } from "react";

const GRID_HIDDEN_COLUMN_KEYS = new Set([
  "id",
  "supplier_id",
  "supplierid",
  "account_number",
  "accountnumber",
  "account_type_id",
  "accounttypeid",
]);

const showButtonClassName =
  "whitespace-nowrap rounded border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

const REPORT_DATE_COLUMN_KEYS = new Set([
  "created_at",
  "invoice_date",
  "date_placed",
  "book_in_date",
  "dbn_date",
]);

const DEBIT_NOTE_REPORT_COLUMN_KEYS = [
  "created_at",
  "dbn_date",
  "dbn_number",
  "supplier",
  "comments",
];

const REPORT_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function parseInteger(value) {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function isValidDateRange(from, to) {
  if (!from || !to) return false;
  return from <= to;
}

function normalizeDbnHeaderRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => {
    const dbnNumber = row.dbn_number ?? row.dbnNumber;
    const rowId = row.id ?? dbnNumber;
    return {
      ...row,
      id: row.id ?? null,
      supplier_id: row.supplier_id ?? row.supplierId ?? null,
      supplier:
        row.supplier ??
        row.supplier_name ??
        row.supplierName ??
        row.descr ??
        null,
      dbn_number: dbnNumber ?? null,
      rowKey:
        rowId != null ? `dbn-in-header-${rowId}` : `dbn-in-header-${index}`,
    };
  });
}

function getColumnKeys(rows) {
  const keys = [];
  const seen = new Set();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key === "rowKey") continue;
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }

  return keys;
}

function normalizeColumnKey(key) {
  return String(key ?? "").trim().toLowerCase();
}

function isHiddenGridColumn(key) {
  return GRID_HIDDEN_COLUMN_KEYS.has(normalizeColumnKey(key));
}

function getVisibleColumnKeys(rows) {
  return getColumnKeys(rows).filter((key) => !isHiddenGridColumn(key));
}

function mergeDebitNoteReportColumnKeys(rows) {
  const fromRows = getVisibleColumnKeys(rows);
  if (fromRows.length === 0) return fromRows;

  const seen = new Set();
  const keys = [];
  for (const key of DEBIT_NOTE_REPORT_COLUMN_KEYS) {
    if (fromRows.includes(key)) {
      keys.push(key);
      seen.add(key);
    }
  }
  for (const key of fromRows) {
    if (seen.has(key)) continue;
    keys.push(key);
    seen.add(key);
  }
  return keys;
}

function isLineTotalColumnKey(columnKey) {
  const normalized = normalizeColumnKey(columnKey);
  return normalized === "linetotal" || normalized === "line_total";
}

function formatColumnHeader(key) {
  if (key === "dbn_number") return "Debit Note Number";
  if (normalizeColumnKey(key) === "supplier") return "Supplier";
  if (isLineTotalColumnKey(key)) return "Total Price";
  if (REPORT_DATE_COLUMN_KEYS.has(key)) {
    return key === "created_at"
      ? "Date"
      : key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatReportDate(value) {
  if (value == null || value === "") return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = REPORT_MONTH_NAMES[parsed.getMonth()] ?? "";
  const year = parsed.getFullYear();
  return `${day} ${month} ${year}`;
}

function formatCellValue(value) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function formatGridCell(column, value) {
  if (REPORT_DATE_COLUMN_KEYS.has(column)) {
    return formatReportDate(value);
  }
  if (isQtyOrUnitPriceColumnKey(column) || isLineTotalColumnKey(column)) {
    return formatGridQtyOrUnitPrice(value);
  }
  return formatCellValue(value);
}

function DebitNoteInReportGrid({
  rows,
  columns,
  loading,
  emptyMessage,
  printingRowKey,
  onShowDebitNote,
}) {
  const columnCount = Math.max(columns.length + 1, 1);

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <table className="w-full min-w-max text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
          <tr>
            {columns.length === 0 ? (
              <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                &nbsp;
              </th>
            ) : (
              columns.map((column) => (
                <th
                  key={column}
                  className="whitespace-normal px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300"
                >
                  {formatColumnHeader(column)}
                </th>
              ))
            )}
            <th className="whitespace-normal px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
              &nbsp;
            </th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td
                colSpan={columnCount}
                className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
              >
                Loading…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={columnCount}
                className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
              >
                {emptyMessage}
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
                    className="whitespace-normal break-words px-4 py-2 text-zinc-800 dark:text-zinc-200"
                  >
                    {formatGridCell(column, row[column])}
                  </td>
                ))}
                <td className="whitespace-normal px-4 py-2">
                  <button
                    type="button"
                    onClick={() => onShowDebitNote(row)}
                    disabled={printingRowKey != null}
                    className={showButtonClassName}
                  >
                    {printingRowKey === row.rowKey ? "Loading…" : "Show"}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function DebitNoteInReport() {
  const [fromDate, setFromDate] = useState(() => oneMonthBeforeIsoDate());
  const [toDate, setToDate] = useState(() => tomorrowIsoDate());
  const [supplierId, setSupplierId] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [printingRowKey, setPrintingRowKey] = useState(null);
  const [error, setError] = useState("");

  const columns = useMemo(() => mergeDebitNoteReportColumnKeys(rows), [rows]);

  const loadReport = useCallback(async () => {
    if (!isValidDateRange(fromDate, toDate)) {
      setError("From date must be on or before To date.");
      setRows([]);
      return;
    }

    const pSupplierId = parseInteger(supplierId) ?? 0;

    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("pr_dbn_in_header", {
        p_supplier_id: pSupplierId,
        p_from: fromDate,
        p_to: toDate,
      });
      if (rpcError) throw rpcError;
      setRows(normalizeDbnHeaderRows(data));
    } catch (err) {
      setRows([]);
      setError(err.message ?? "Failed to load debit note in report");
    } finally {
      setLoading(false);
    }
  }, [supplierId, fromDate, toDate]);

  useEffect(() => {
    if (!isValidDateRange(fromDate, toDate)) {
      setRows([]);
      return;
    }
    void loadReport();
  }, [supplierId, fromDate, toDate, loadReport]);

  const handleShowDebitNote = useCallback(async (row) => {
    const normalizedDbnNumber = getDbnNumberFromReportRow(row);
    if (!normalizedDbnNumber) {
      setError("Debit note number is missing for this row.");
      return;
    }

    setPrintingRowKey(row.rowKey);
    setError("");

    try {
      await printDebitNoteByNumber(normalizedDbnNumber);
    } catch (err) {
      setError(err.message ?? "Failed to generate debit note PDF");
    } finally {
      setPrintingRowKey(null);
    }
  }, []);

  return (
    <div className="mt-4 w-full">
      {error ? (
        <p
          className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            From
          </span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className={inputClassName}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            To
          </span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className={inputClassName}
          />
        </label>

        <SupplierSelect
          value={supplierId}
          onChange={setSupplierId}
          onLoadError={(message) => setError(message)}
          className="flex flex-col gap-1"
        />
      </div>

      <div className="mt-4">
        <DebitNoteInReportGrid
          rows={rows}
          columns={columns}
          loading={loading}
          printingRowKey={printingRowKey}
          onShowDebitNote={handleShowDebitNote}
          emptyMessage="No debit notes found for the selected filters."
        />
      </div>
    </div>
  );
}
