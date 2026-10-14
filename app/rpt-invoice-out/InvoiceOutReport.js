"use client";

import {
  formatGridQtyOrUnitPrice,
  isQtyOrUnitPriceColumnKey,
} from "@/lib/format/gridNumberFormat";
import {
  oneMonthBeforeIsoDate,
  todayIsoDate,
} from "@/lib/date/isoMonthRange";
import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useMemo, useState } from "react";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

const SELECT_PLACEHOLDER = " -SELECT- ";

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

function parseInteger(value) {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function isValidDateRange(from, to) {
  if (!from || !to) return false;
  return from <= to;
}

function normalizeInvoiceHeaderRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => {
    const invoiceNumber = row.invoice_number ?? row.invoiceNumber;
    const rowId = row.id ?? invoiceNumber;
    return {
      ...row,
      id: row.id ?? null,
      customer_id: row.customer_id ?? row.customerId ?? null,
      invoice_number: row.invoice_number ?? row.invoiceNumber ?? null,
      rowKey:
        rowId != null ? `invoice-out-header-${rowId}` : `invoice-out-header-${index}`,
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

function isLineTotalColumnKey(columnKey) {
  const normalized = normalizeColumnKey(columnKey);
  return normalized === "linetotal" || normalized === "line_total";
}

function formatColumnHeader(key) {
  if (key === "invoice_number") return "Invoice Number";
  if (isLineTotalColumnKey(key)) return "Total Price";
  if (INVOICE_DATE_COLUMN_KEYS.has(key)) {
    return key === "created_at"
      ? "Date"
      : key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
  if (isQtyOrUnitPriceColumnKey(column) || isLineTotalColumnKey(column)) {
    return formatGridQtyOrUnitPrice(value);
  }
  return formatCellValue(value);
}

function optionLabel(option) {
  return (
    option.descr ??
    option.customer ??
    option.description ??
    option.name ??
    ""
  );
}

function optionValue(option) {
  const id = option.id ?? option.customer_id;
  return id != null ? String(id) : "";
}

function normalizeCustomerOptions(data) {
  if (!Array.isArray(data)) return [];

  return data
    .map((row, index) => ({
      id: row.id ?? row.customer_id ?? null,
      descr: row.descr ?? row.customer ?? row.description ?? row.name ?? "",
      optionKey: `customer-option-${index}`,
    }))
    .sort((left, right) => optionLabel(left).localeCompare(optionLabel(right)));
}

function InvoiceOutReportGrid({ rows, columns, loading, emptyMessage }) {
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
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function InvoiceOutReport() {
  const [fromDate, setFromDate] = useState(() => oneMonthBeforeIsoDate());
  const [toDate, setToDate] = useState(() => todayIsoDate());
  const [customerId, setCustomerId] = useState("");
  const [customerOptions, setCustomerOptions] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const columns = useMemo(() => getColumnKeys(rows), [rows]);

  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("pr_customer_active");
      if (rpcError) throw rpcError;
      setCustomerOptions(normalizeCustomerOptions(data));
    } catch (err) {
      setCustomerOptions([]);
      setError(err.message ?? "Failed to load customers");
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  const loadReport = useCallback(async () => {
    const parsedCustomerId = parseInteger(customerId);
    if (parsedCustomerId == null) {
      setError("Select a customer.");
      setRows([]);
      return;
    }
    if (!isValidDateRange(fromDate, toDate)) {
      setError("From date must be on or before To date.");
      setRows([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "pr_invoice_out_header",
        {
          p_customer_id: parsedCustomerId,
          p_from: fromDate,
          p_to: toDate,
        }
      );
      if (rpcError) throw rpcError;
      setRows(normalizeInvoiceHeaderRows(data));
    } catch (err) {
      setRows([]);
      setError(err.message ?? "Failed to load invoice out report");
    } finally {
      setLoading(false);
    }
  }, [customerId, fromDate, toDate]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    if (!customerId || !isValidDateRange(fromDate, toDate)) {
      setRows([]);
      return;
    }
    void loadReport();
  }, [customerId, fromDate, toDate, loadReport]);

  function handleFromDateChange(value) {
    setFromDate(value);
  }

  function handleToDateChange(value) {
    setToDate(value);
  }

  function handleCustomerChange(value) {
    setCustomerId(value);
  }

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
            onChange={(e) => handleFromDateChange(e.target.value)}
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
            onChange={(e) => handleToDateChange(e.target.value)}
            className={inputClassName}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Customer
          </span>
          <select
            value={customerId}
            onChange={(e) => handleCustomerChange(e.target.value)}
            disabled={customersLoading}
            className={inputClassName}
          >
            <option value="">
              {customersLoading ? "Loading…" : SELECT_PLACEHOLDER}
            </option>
            {customerOptions.map((option) => (
              <option key={option.optionKey} value={optionValue(option)}>
                {optionLabel(option)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <InvoiceOutReportGrid
          rows={rows}
          columns={columns}
          loading={loading}
          emptyMessage={
            customerId
              ? "No invoices found for the selected customer and date range."
              : "Select a customer to load invoices."
          }
        />
      </div>
    </div>
  );
}
