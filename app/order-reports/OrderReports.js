"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useMemo, useState } from "react";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

const SELECT_PLACEHOLDER = " -SELECT- ";

const ORDER_TYPE_INCOMING = "incoming";
const ORDER_TYPE_OUTGOING = "outgoing";

function todayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toOptions(data) {
  return Array.isArray(data) ? data : [];
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
      is_active: row.is_active,
      optionKey: `customer-option-${index}`,
    }))
    .sort((left, right) => optionLabel(left).localeCompare(optionLabel(right)));
}

function parseInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
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
  const normalized = key.trim().toLowerCase();
  if (normalized === "id") return "No.";

  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getColumnKeys(rows) {
  const keys = new Set();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key !== "rowKey") {
        keys.add(key);
      }
    }
  }

  return Array.from(keys);
}

function formatCellValue(value, column) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (
    column.toLowerCase().includes("date") &&
    (typeof value === "string" || value instanceof Date)
  ) {
    return String(value).slice(0, 10);
  }
  return String(value);
}

function getFirstColumnValue(row, columns) {
  if (columns.length === 0) return null;
  return row[columns[0]];
}

function ReportGrid({
  rows,
  columns,
  loading,
  emptyMessage,
  selectedRowKey,
  onRowClick,
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <table className="w-full min-w-max text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                className="whitespace-nowrap px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300"
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
                    {formatCellValue(row[column], column)}
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

export function OrderReports() {
  const [orderType, setOrderType] = useState(ORDER_TYPE_INCOMING);
  const [fromDate, setFromDate] = useState(todayIsoDate());
  const [toDate, setToDate] = useState(todayIsoDate());
  const [supplierId, setSupplierId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [lineRows, setLineRows] = useState([]);
  const [selectedRowKey, setSelectedRowKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [linesLoading, setLinesLoading] = useState(false);
  const [error, setError] = useState("");

  const loadSuppliers = useCallback(async () => {
    setSuppliersLoading(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("pr_suppliers_active");
      if (rpcError) throw rpcError;
      setSupplierOptions(toOptions(data));
    } catch (err) {
      setSupplierOptions([]);
      setError(err.message ?? "Failed to load suppliers");
    } finally {
      setSuppliersLoading(false);
    }
  }, []);

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

  useEffect(() => {
    loadSuppliers();
    loadCustomers();
  }, [loadSuppliers, loadCustomers]);

  const columns = useMemo(() => getColumnKeys(rows), [rows]);
  const lineColumns = useMemo(() => getColumnKeys(lineRows), [lineRows]);
  const isIncoming = orderType === ORDER_TYPE_INCOMING;

  function clearGrids() {
    setRows([]);
    setLineRows([]);
    setSelectedRowKey(null);
  }

  function handleOrderTypeChange(nextOrderType) {
    clearGrids();
    setOrderType(nextOrderType);
  }

  function handleFromDateChange(value) {
    clearGrids();
    setFromDate(value);
  }

  function handleToDateChange(value) {
    clearGrids();
    setToDate(value);
  }

  function handleSupplierChange(value) {
    clearGrids();
    setSupplierId(value);
  }

  function handleCustomerChange(value) {
    clearGrids();
    setCustomerId(value);
  }

  async function handleShowReport() {
    setLoading(true);
    setError("");
    clearGrids();

    try {
      const supabase = createClient();

      if (isIncoming) {
        const { data, error: rpcError } = await supabase.rpc(
          "pr_rpt_orders_in_headers",
          {
            p_from: fromDate,
            p_to: toDate,
            p_supplier_id: parseInteger(supplierId) ?? 0,
          }
        );
        if (rpcError) throw rpcError;
        setRows(normalizeReportRows(data, "order-report-header"));
      } else {
        const { data, error: rpcError } = await supabase.rpc(
          "pr_rpt_orders_out_headers",
          {
            p_from: fromDate,
            p_to: toDate,
            p_customer_id: parseInteger(customerId) ?? 0,
          }
        );
        if (rpcError) throw rpcError;
        setRows(normalizeReportRows(data, "order-report-header"));
      }
    } catch (err) {
      setRows([]);
      setError(err.message ?? "Failed to load order report");
    } finally {
      setLoading(false);
    }
  }

  async function handleHeaderRowClick(row) {
    const orderId = parseInteger(getFirstColumnValue(row, columns));
    if (orderId == null) return;

    setSelectedRowKey(row.rowKey);
    setLinesLoading(true);
    setError("");
    setLineRows([]);

    try {
      const supabase = createClient();

      if (isIncoming) {
        const { data, error: rpcError } = await supabase.rpc(
          "pr_rpt_orders_in_lines",
          { p_order_in: orderId }
        );
        if (rpcError) throw rpcError;
        setLineRows(normalizeReportRows(data, "order-report-line"));
      } else {
        const { data, error: rpcError } = await supabase.rpc(
          "pr_rpt_orders_out_lines",
          { p_order_out: orderId }
        );
        if (rpcError) throw rpcError;
        setLineRows(normalizeReportRows(data, "order-report-line"));
      }
    } catch (err) {
      setLineRows([]);
      setError(err.message ?? "Failed to load order report lines");
    } finally {
      setLinesLoading(false);
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
        <legend className="sr-only">Order report type</legend>
        <div
          role="radiogroup"
          aria-label="Order report type"
          className="flex flex-wrap items-center gap-4"
        >
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="radio"
              name="orderReportType"
              value={ORDER_TYPE_INCOMING}
              checked={isIncoming}
              onChange={() => handleOrderTypeChange(ORDER_TYPE_INCOMING)}
              className="h-4 w-4 border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            Incoming Orders
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="radio"
              name="orderReportType"
              value={ORDER_TYPE_OUTGOING}
              checked={!isIncoming}
              onChange={() => handleOrderTypeChange(ORDER_TYPE_OUTGOING)}
              className="h-4 w-4 border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            Outgoing Orders
          </label>
        </div>
      </fieldset>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

        {isIncoming ? (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Supplier
            </span>
            <select
              value={supplierId}
              onChange={(e) => handleSupplierChange(e.target.value)}
              disabled={suppliersLoading}
              className={inputClassName}
            >
              <option value="">
                {suppliersLoading ? "Loading…" : SELECT_PLACEHOLDER}
              </option>
              {supplierOptions.map((option, index) => (
                <option
                  key={option.id ?? `supplier-${index}`}
                  value={optionValue(option)}
                >
                  {optionLabel(option)}
                </option>
              ))}
            </select>
          </label>
        ) : (
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
              {customerOptions.map((option, index) => (
                <option
                  key={option.optionKey ?? `customer-${index}`}
                  value={optionValue(option)}
                >
                  {optionLabel(option)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={handleShowReport}
          disabled={loading}
          className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          {loading ? "Loading…" : "Show Report"}
        </button>
      </div>

      <div className="mt-4">
        <ReportGrid
          rows={rows}
          columns={columns}
          loading={loading}
          emptyMessage="No order report records found."
          selectedRowKey={selectedRowKey}
          onRowClick={rows.length > 0 && !loading ? handleHeaderRowClick : undefined}
        />
      </div>

      <div className="mt-4">
        <ReportGrid
          rows={lineRows}
          columns={lineColumns}
          loading={linesLoading}
          emptyMessage="No order line records found."
        />
      </div>
    </div>
  );
}
