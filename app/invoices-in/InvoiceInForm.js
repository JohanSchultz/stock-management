"use client";

import { SupplierSelect } from "@/components/SupplierSelect";
import {
  daysBeforeIsoDate,
  todayIsoDate,
} from "@/lib/date/isoMonthRange";
import {
  formatGridQtyOrUnitPrice,
  isQtyOrUnitPriceColumnKey,
} from "@/lib/format/gridNumberFormat";
import { prepareSupabaseClient } from "@/lib/supabase/useSupabaseIdleRecovery";
import { useCallback, useEffect, useMemo, useState } from "react";

const SELECT_PLACEHOLDER = " -SELECT- ";

const BOOK_IN_DATE_COLUMN_KEYS = new Set([
  "created_at",
  "book_in_date",
  "date_placed",
  "order_placed_date",
  "booked_in_date",
]);

const BOOK_IN_MONTH_NAMES = [
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

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

const frameClassName =
  "rounded-lg border border-zinc-300 px-4 py-4 dark:border-zinc-600";

function parseInteger(value) {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function isValidDateRange(from, to) {
  if (!from || !to) return false;
  return from <= to;
}

function normalizeRevenueAccountOptions(data) {
  if (!Array.isArray(data)) return [];

  return data
    .map((row, index) => ({
      id: row.id ?? null,
      acctNumber: row.acct_number ?? row.acctnumber ?? row.account_number ?? "",
      acctName: row.acct_name ?? row.acctname ?? row.account_name ?? "",
      finStatement:
        row.fin_statement ??
        row.finstatement ??
        row.financial_statement ??
        "",
      optionKey:
        row.id != null
          ? `revenue-account-${row.id}`
          : `revenue-account-row-${index}`,
    }))
    .filter((row) => row.id != null);
}

function revenueAccountOptionLabel(option) {
  return [option.acctNumber, option.acctName, option.finStatement]
    .map((part) => String(part ?? ""))
    .join(" - ");
}

function normalizeBookedInGridRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => {
    const rowId = row.id ?? row.book_in_id ?? row.bookInId;
    return {
      ...row,
      rowKey:
        rowId != null
          ? `invoice-in-booked-in-${rowId}`
          : `invoice-in-booked-in-row-${index}`,
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
  if (key === "id" || key === "book_in_id") return "Book In Number";
  if (BOOK_IN_DATE_COLUMN_KEYS.has(key)) {
    if (key === "created_at") return "Date";
    return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatBookInDate(value) {
  if (value == null || value === "") return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = BOOK_IN_MONTH_NAMES[parsed.getMonth()] ?? "";
  const year = parsed.getFullYear();
  return `${day} ${month} ${year}`;
}

function formatCellValue(value) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function formatBookedInGridCell(column, value) {
  if (BOOK_IN_DATE_COLUMN_KEYS.has(column)) {
    return formatBookInDate(value);
  }
  if (isQtyOrUnitPriceColumnKey(column)) {
    return formatGridQtyOrUnitPrice(value);
  }
  return formatCellValue(value);
}

export function InvoiceInForm() {
  const [revenueAccountId, setRevenueAccountId] = useState("");
  const [revenueAccountOptions, setRevenueAccountOptions] = useState([]);
  const [revenueAccountsLoading, setRevenueAccountsLoading] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => todayIsoDate());
  const [comments, setComments] = useState("");
  const [bookedInFromDate, setBookedInFromDate] = useState(() =>
    daysBeforeIsoDate(30)
  );
  const [bookedInToDate, setBookedInToDate] = useState(() => todayIsoDate());
  const [bookedInRows, setBookedInRows] = useState([]);
  const [bookedInGridLoading, setBookedInGridLoading] = useState(false);
  const [error, setError] = useState("");

  const bookedInColumns = useMemo(
    () => getColumnKeys(bookedInRows),
    [bookedInRows]
  );

  const loadRevenueAccounts = useCallback(async () => {
    setRevenueAccountsLoading(true);

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc("pr_revenue_accounts");
      if (rpcError) throw rpcError;
      setRevenueAccountOptions(normalizeRevenueAccountOptions(data));
    } catch (err) {
      setRevenueAccountOptions([]);
      setError(err.message ?? "Failed to load revenue accounts");
    } finally {
      setRevenueAccountsLoading(false);
    }
  }, []);

  const loadBookedInGrid = useCallback(async () => {
    const parsedSupplierId = parseInteger(supplierId);
    if (parsedSupplierId == null) {
      setBookedInRows([]);
      return;
    }

    if (!isValidDateRange(bookedInFromDate, bookedInToDate)) {
      setError("From date must be on or before To date.");
      setBookedInRows([]);
      return;
    }

    setBookedInGridLoading(true);
    setError("");

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc(
        "pr_booking_in_by_supplier_id",
        {
          p_from: bookedInFromDate,
          p_to: bookedInToDate,
          p_supplier_id: parsedSupplierId,
        }
      );
      if (rpcError) throw rpcError;
      setBookedInRows(normalizeBookedInGridRows(data));
    } catch (err) {
      setBookedInRows([]);
      setError(err.message ?? "Failed to load booked in records");
    } finally {
      setBookedInGridLoading(false);
    }
  }, [supplierId, bookedInFromDate, bookedInToDate]);

  useEffect(() => {
    loadRevenueAccounts();
  }, [loadRevenueAccounts]);

  useEffect(() => {
    if (!supplierId) {
      setBookedInRows([]);
      return;
    }
    if (!isValidDateRange(bookedInFromDate, bookedInToDate)) {
      setBookedInRows([]);
      return;
    }
    void loadBookedInGrid();
  }, [supplierId, bookedInFromDate, bookedInToDate, loadBookedInGrid]);

  return (
    <div className="mt-6 w-full max-w-6xl">
      <label className="flex w-full max-w-2xl flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Revenue Account
        </span>
        <select
          value={revenueAccountId}
          onChange={(e) => setRevenueAccountId(e.target.value)}
          disabled={revenueAccountsLoading}
          className={`${inputClassName} w-full`}
        >
          <option value="">
            {revenueAccountsLoading ? "Loading…" : SELECT_PLACEHOLDER}
          </option>
          {revenueAccountOptions.map((option) => (
            <option key={option.optionKey} value={String(option.id ?? "")}>
              {revenueAccountOptionLabel(option)}
            </option>
          ))}
        </select>
      </label>

      <SupplierSelect
        value={supplierId}
        onChange={setSupplierId}
        onLoadError={(message) => setError(message)}
        className="mt-4 flex w-full max-w-2xl flex-col gap-1"
      />

      <div className="mt-4 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Invoice Number
          </span>
          <input
            type="text"
            name="invoice_number"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            className={`${inputClassName} w-full`}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Invoice Date
          </span>
          <input
            type="date"
            name="invoice_date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            className={`${inputClassName} w-full`}
          />
        </label>
      </div>

      <label className="mt-4 flex w-full flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Comments
        </span>
        <input
          type="text"
          name="comments"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          className={`${inputClassName} w-full`}
        />
      </label>

      <h2 className="mt-6 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Booked In
      </h2>
      <div className={`mt-2 ${frameClassName}`}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-xl">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              From
            </span>
            <input
              type="date"
              value={bookedInFromDate}
              onChange={(e) => setBookedInFromDate(e.target.value)}
              className={inputClassName}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              To
            </span>
            <input
              type="date"
              value={bookedInToDate}
              onChange={(e) => setBookedInToDate(e.target.value)}
              className={inputClassName}
            />
          </label>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-max text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
              <tr>
                {bookedInColumns.length === 0 ? (
                  <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                    &nbsp;
                  </th>
                ) : (
                  bookedInColumns.map((column) => (
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
              {bookedInGridLoading ? (
                <tr>
                  <td
                    colSpan={Math.max(bookedInColumns.length, 1)}
                    className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                  >
                    Loading…
                  </td>
                </tr>
              ) : !supplierId ? (
                <tr>
                  <td
                    colSpan={Math.max(bookedInColumns.length, 1)}
                    className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                  >
                    Select a supplier to load booked in records.
                  </td>
                </tr>
              ) : bookedInRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={Math.max(bookedInColumns.length, 1)}
                    className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                  >
                    No booked in records found.
                  </td>
                </tr>
              ) : (
                bookedInRows.map((row) => (
                  <tr
                    key={row.rowKey}
                    className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                  >
                    {bookedInColumns.map((column) => (
                      <td
                        key={`${row.rowKey}-${column}`}
                        className="whitespace-nowrap px-4 py-2 text-zinc-800 dark:text-zinc-200"
                      >
                        {formatBookedInGridCell(column, row[column])}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {error ? (
        <p
          className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
