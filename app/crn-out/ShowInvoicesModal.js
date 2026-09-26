"use client";

import {
  formatGridQtyOrUnitPrice,
  isQtyOrUnitPriceColumnKey,
} from "@/lib/format/gridNumberFormat";
import { prepareSupabaseClient } from "@/lib/supabase/useSupabaseIdleRecovery";
import { useCallback, useEffect, useMemo, useState } from "react";

const INVOICE_DATE_COLUMN_KEYS = new Set([
  "created_at",
  "invoice_date",
  "date_placed",
  "book_out_date",
]);

const INVOICE_MONTH_NAMES = [
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

const filterLabelClassName =
  "text-xs font-medium text-zinc-700 dark:text-zinc-300";

const filterInputClassName =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

const filterSearchLinkClassName =
  "shrink-0 self-end pb-1 text-xs font-medium text-sky-700 underline hover:text-sky-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-sky-400 dark:hover:text-sky-300";

function normalizeGridRows(data, rowKeyPrefix) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => {
    const invoiceNumber = row.invoice_number ?? row.invoiceNumber;
    const rowId = row.id ?? invoiceNumber;
    return {
      ...row,
      rowKey:
        rowId != null
          ? `${rowKeyPrefix}-${rowId}`
          : `${rowKeyPrefix}-row-${index}`,
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

function formatColumnHeader(key) {
  if (key === "invoice_number") return "Invoice Number";
  if (INVOICE_DATE_COLUMN_KEYS.has(key)) {
    return key === "created_at" ? "Date" : key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatInvoiceDate(value) {
  if (value == null || value === "") return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = INVOICE_MONTH_NAMES[parsed.getMonth()] ?? "";
  const year = parsed.getFullYear();
  return `${day} ${month} ${year}`;
}

function formatCellValue(value) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function formatGridCell(column, value) {
  if (INVOICE_DATE_COLUMN_KEYS.has(column)) {
    return formatInvoiceDate(value);
  }
  if (isQtyOrUnitPriceColumnKey(column)) {
    return formatGridQtyOrUnitPrice(value);
  }
  return formatCellValue(value);
}

function parseInteger(value) {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function getInvoiceNumberFromRow(row) {
  const value = row.invoice_number ?? row.invoiceNumber;
  if (value == null || value === "") return "";
  return String(value);
}

function DataGrid({
  title,
  columns,
  rows,
  loading,
  emptyMessage,
  selectedRowKey,
  onRowClick,
}) {
  return (
    <>
      <h3 className="mt-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {title}
      </h3>
      <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
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
                    className="whitespace-nowrap px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    {formatColumnHeader(column)}
                  </th>
                ))
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
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.rowKey}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-zinc-100 last:border-b-0 dark:border-zinc-800 ${
                    onRowClick
                      ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                      : ""
                  } ${
                    selectedRowKey === row.rowKey
                      ? "bg-sky-50 dark:bg-sky-900/20"
                      : ""
                  }`}
                >
                  {columns.map((column) => (
                    <td
                      key={`${row.rowKey}-${column}`}
                      className="whitespace-nowrap px-4 py-2 text-zinc-800 dark:text-zinc-200"
                    >
                      {formatGridCell(column, row[column])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function ShowInvoicesModal({
  open,
  onClose,
  customerId,
  customerLabel,
  onError,
}) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [invoiceRows, setInvoiceRows] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [selectedInvoiceRowKey, setSelectedInvoiceRowKey] = useState(null);
  const [lineRows, setLineRows] = useState([]);
  const [linesLoading, setLinesLoading] = useState(false);

  const invoiceColumns = useMemo(() => getColumnKeys(invoiceRows), [invoiceRows]);
  const lineColumns = useMemo(() => getColumnKeys(lineRows), [lineRows]);

  const resetModalData = useCallback(() => {
    setFromDate("");
    setToDate("");
    setInvoiceRows([]);
    setSelectedInvoiceRowKey(null);
    setLineRows([]);
    setInvoicesLoading(false);
    setLinesLoading(false);
  }, []);

  useEffect(() => {
    if (!open) {
      resetModalData();
    }
  }, [open, resetModalData]);

  const loadInvoiceLines = useCallback(async (invoiceNumber) => {
    const normalizedInvoiceNumber = String(invoiceNumber ?? "").trim();
    if (!normalizedInvoiceNumber) {
      setLineRows([]);
      return;
    }

    setLinesLoading(true);

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc(
        "pr_invoice_out_lines_by_invno",
        { p_invoice_number: normalizedInvoiceNumber }
      );
      if (rpcError) throw rpcError;

      setLineRows(normalizeGridRows(data, "invoice-line"));
    } catch (err) {
      setLineRows([]);
      onError?.(err.message ?? "Failed to load invoice line items");
    } finally {
      setLinesLoading(false);
    }
  }, [onError]);

  const loadInvoices = useCallback(async () => {
    const parsedCustomerId = parseInteger(customerId);
    if (parsedCustomerId == null) {
      onError?.("Select a customer before loading invoices.");
      return;
    }

    setSelectedInvoiceRowKey(null);
    setLineRows([]);
    setInvoicesLoading(true);

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc(
        "pr_invoice_out_header",
        {
          p_customer_id: parsedCustomerId,
          p_from: fromDate || null,
          p_to: toDate || null,
        }
      );
      if (rpcError) throw rpcError;

      setInvoiceRows(normalizeGridRows(data, "customer-invoice"));
    } catch (err) {
      setInvoiceRows([]);
      onError?.(err.message ?? "Failed to load invoices");
    } finally {
      setInvoicesLoading(false);
    }
  }, [customerId, fromDate, toDate, onError]);

  function handleInvoiceRowClick(row) {
    setSelectedInvoiceRowKey(row.rowKey);
    loadInvoiceLines(getInvoiceNumberFromRow(row));
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="show-invoices-title"
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2
            id="show-invoices-title"
            className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Invoices for {customerLabel || "Customer"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4">
          <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <div className="flex flex-wrap items-end gap-2 p-2">
              <div className="flex flex-wrap items-end gap-2 rounded-md bg-zinc-100 p-2 dark:bg-zinc-800/60">
                <label className="flex flex-col gap-0.5">
                  <span className={filterLabelClassName}>From</span>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className={filterInputClassName}
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className={filterLabelClassName}>To</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className={filterInputClassName}
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={loadInvoices}
                disabled={invoicesLoading}
                className={filterSearchLinkClassName}
                aria-label="Search invoices"
              >
                {">>"}
              </button>
            </div>

            <div className="border-t border-zinc-200 px-4 pb-4 dark:border-zinc-800">
              <DataGrid
                title="Invoices"
                columns={invoiceColumns}
                rows={invoiceRows}
                loading={invoicesLoading}
                emptyMessage="No invoices found."
                selectedRowKey={selectedInvoiceRowKey}
                onRowClick={handleInvoiceRowClick}
              />
              <DataGrid
                title="Line Items"
                columns={lineColumns}
                rows={lineRows}
                loading={linesLoading}
                emptyMessage="Select an invoice to load line items."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
