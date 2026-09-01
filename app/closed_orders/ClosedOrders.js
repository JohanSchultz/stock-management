"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useMemo, useState } from "react";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

const ORDER_TYPE_IN = "orders-in";
const ORDER_TYPE_OUT = "orders-out";

const TEXT_COLUMN_KEYS = new Set([
  "stock_code",
  "descr",
  "description",
  "supplier",
  "customer",
  "comments",
]);

const decimalFormatter = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function tomorrowIsoDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function threeMonthsBeforeTodayIsoDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 3);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseInteger(value) {
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseFloatValue(value) {
  if (value == null || value === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeColumnKey(key) {
  return String(key ?? "").trim().toLowerCase();
}

function isTextColumn(columnKey) {
  return TEXT_COLUMN_KEYS.has(normalizeColumnKey(columnKey));
}

function isDateColumn(columnKey) {
  return normalizeColumnKey(columnKey).includes("date");
}

function isNumericValue(value) {
  if (value == null || value === "") return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return false;

  const parsed = Number.parseFloat(value);
  return !Number.isNaN(parsed);
}

function formatNumberWithSeparators(value) {
  const parsed = parseFloatValue(value);
  if (parsed == null) return String(value);
  return decimalFormatter.format(parsed);
}

function normalizeReportRows(data, keyPrefix) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    rowKey:
      row.id != null
        ? `${keyPrefix}-${row.id}`
        : `${keyPrefix}-row-${index}`,
  }));
}

function formatColumnHeader(key) {
  const normalized = normalizeColumnKey(key);
  if (normalized === "id") return "No.";

  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

function formatCellValue(value, column) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (
    isDateColumn(column) &&
    (typeof value === "string" || value instanceof Date)
  ) {
    return String(value).slice(0, 10);
  }
  if (!isTextColumn(column) && isNumericValue(value)) {
    if (normalizeColumnKey(column) === "id") {
      return String(value);
    }
    return formatNumberWithSeparators(value);
  }
  return String(value);
}

function isNumericColumn(column) {
  if (isTextColumn(column) || isDateColumn(column)) return false;

  const normalized = normalizeColumnKey(column);
  return (
    normalized === "id" ||
    /(?:^|_)(qty|quantity|price|value|amount|total|unit_price|qty_on_order)(?:_|$)/i.test(
      column
    )
  );
}

function ClosedOrdersGrid({
  rows,
  columns,
  loading,
  emptyMessage,
  onReopenOrder,
  reopeningOrderId,
}) {
  const columnCount = Math.max(columns.length, 1) + 1;

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <table className="w-full min-w-max text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                className={`whitespace-nowrap px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300 ${
                  isNumericColumn(column) ? "text-right" : ""
                }`}
              >
                {formatColumnHeader(column)}
              </th>
            ))}
            <th className="whitespace-nowrap px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
              {" "}
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
            rows.map((row) => {
              const orderId = parseInteger(row.id);
              const isReopening =
                reopeningOrderId != null && reopeningOrderId === orderId;

              return (
                <tr
                  key={row.rowKey}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  {columns.map((column) => (
                    <td
                      key={`${row.rowKey}-${column}`}
                      className={`whitespace-nowrap px-4 py-2 text-zinc-800 dark:text-zinc-200 ${
                        isNumericColumn(column) ? "text-right" : ""
                      }`}
                    >
                      {formatCellValue(row[column], column)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    <button
                      type="button"
                      onClick={() => onReopenOrder?.(row)}
                      disabled={loading || isReopening}
                      className="rounded bg-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-900 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-900/40 dark:text-emerald-100 dark:hover:bg-emerald-900/60"
                    >
                      {isReopening ? "Re-opening…" : "Re-open Order"}
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ClosedOrders() {
  const [orderType, setOrderType] = useState(ORDER_TYPE_IN);
  const [filterFromDate, setFilterFromDate] = useState(
    threeMonthsBeforeTodayIsoDate
  );
  const [filterToDate, setFilterToDate] = useState(tomorrowIsoDate);
  const [orderNumber, setOrderNumber] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reopeningOrderId, setReopeningOrderId] = useState(null);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const isOrdersIn = orderType === ORDER_TYPE_IN;
  const columns = useMemo(() => getColumnKeys(rows), [rows]);

  const loadClosedOrders = useCallback(async () => {
    const orderId = parseInteger(orderNumber) ?? 0;
    const supabase = createClient();
    const { data, error: rpcError } = isOrdersIn
      ? await supabase.rpc("pr_closed_orders_in", {
          p_id: orderId,
          p_from: filterFromDate,
          p_to: filterToDate,
        })
      : await supabase.rpc("pr_closed_orders_out", {
          p_from: filterFromDate,
          p_to: filterToDate,
          p_id: orderId,
        });

    if (rpcError) throw rpcError;

    setRows(
      normalizeReportRows(
        data,
        isOrdersIn ? "closed-order-in" : "closed-order-out"
      )
    );
  }, [filterFromDate, filterToDate, isOrdersIn, orderNumber]);

  function handleOrderTypeChange(nextOrderType) {
    setOrderType(nextOrderType);
    setRows([]);
    setHasSearched(false);
    setError("");
  }

  async function handleSearch() {
    setLoading(true);
    setError("");
    setHasSearched(true);

    try {
      await loadClosedOrders();
    } catch (err) {
      setRows([]);
      setError(err.message ?? "Failed to load closed orders");
    } finally {
      setLoading(false);
    }
  }

  async function handleReopenOrder(row) {
    const orderId = parseInteger(row.id);
    if (orderId == null) {
      setError("Order id is missing.");
      return;
    }

    setReopeningOrderId(orderId);
    setError("");

    try {
      const supabase = createClient();
      const { error: rpcError } = isOrdersIn
        ? await supabase.rpc("pr_reopen_order_in", { p_id: orderId })
        : await supabase.rpc("pr_reopen_order_out", { p_id: orderId });
      if (rpcError) throw rpcError;

      setLoading(true);
      await loadClosedOrders();
    } catch (err) {
      setError(err.message ?? "Failed to re-open order");
    } finally {
      setReopeningOrderId(null);
      setLoading(false);
    }
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

      <fieldset className="rounded-lg border border-zinc-300 px-4 py-3 dark:border-zinc-600">
        <legend className="sr-only">Closed order type</legend>
        <div
          role="radiogroup"
          aria-label="Closed order type"
          className="flex flex-wrap items-center gap-4"
        >
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="radio"
              name="closedOrderType"
              value={ORDER_TYPE_IN}
              checked={isOrdersIn}
              onChange={() => handleOrderTypeChange(ORDER_TYPE_IN)}
              className="h-4 w-4 border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            Orders In
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="radio"
              name="closedOrderType"
              value={ORDER_TYPE_OUT}
              checked={!isOrdersIn}
              onChange={() => handleOrderTypeChange(ORDER_TYPE_OUT)}
              className="h-4 w-4 border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            Orders Out
          </label>
        </div>
      </fieldset>

      <div className="mt-6">
        <p className="mb-2 text-sm font-bold text-zinc-800 dark:text-zinc-200">
          Grid Filtering:
        </p>
        <div className="rounded-lg border border-zinc-300 bg-zinc-100 p-4 dark:border-zinc-600 dark:bg-zinc-800/50">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 sm:w-48">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                From
              </span>
              <input
                type="date"
                value={filterFromDate}
                onChange={(e) => setFilterFromDate(e.target.value)}
                className={inputClassName}
              />
            </label>

            <label className="flex flex-col gap-1 sm:w-48">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                To
              </span>
              <input
                type="date"
                value={filterToDate}
                onChange={(e) => setFilterToDate(e.target.value)}
                className={inputClassName}
              />
            </label>

            <label className="flex flex-col gap-1 sm:w-40 sm:shrink-0">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Order Number
              </span>
              <input
                type="text"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className={inputClassName}
              />
            </label>

            <button
              type="button"
              onClick={handleSearch}
              disabled={loading}
              className="ml-auto rounded bg-sky-200 px-4 py-2 text-sm font-medium text-sky-900 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-900/40 dark:text-sky-100 dark:hover:bg-sky-900/60"
            >
              {loading ? "Searching…" : "Search >>"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <ClosedOrdersGrid
          rows={rows}
          columns={columns}
          loading={loading}
          emptyMessage={
            hasSearched
              ? "No closed orders found."
              : "Use Search to load closed orders."
          }
          onReopenOrder={handleReopenOrder}
          reopeningOrderId={reopeningOrderId}
        />
      </div>
    </div>
  );
}
