"use client";

import { prepareSupabaseClient } from "@/lib/supabase/useSupabaseIdleRecovery";
import { useCallback, useEffect, useMemo, useState } from "react";

const SELECT_PLACEHOLDER = " -SELECT- ";
const SAMPLE_INVOICE_NUMBER = "11092026_1";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

function optionLabel(option) {
  return (
    option.descr ?? option.customer ?? option.description ?? option.name ?? ""
  );
}

function optionValue(option) {
  const id = option.id ?? option.customer_id;
  return id != null ? String(id) : "";
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

function normalizeInvoiceGridRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    rowKey:
      row.id != null
        ? `invoice-all-ordered-${row.id}`
        : `invoice-all-ordered-row-${index}`,
  }));
}

function normalizeProductGridRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    rowKey:
      row.id != null
        ? `invoice-product-${row.id}`
        : `invoice-product-row-${index}`,
  }));
}

function getOrderNumberFromRow(row) {
  return row.id ?? row.orders_out_id ?? null;
}

function getProductTextFromRow(row) {
  const stockCode = row.stock_code ?? row.stockCode ?? "";
  const descr = row.descr ?? row.description ?? "";
  return `${stockCode} - ${descr}`;
}

function getQtyFromProductRow(row) {
  const qty = row.qty ?? row.Qty;
  if (qty == null || qty === "") return "";
  return String(qty);
}

function getStockItemIdFromProductRow(row) {
  const stockItemId = row.stock_item_id ?? row.stockItemId;
  if (stockItemId == null || stockItemId === "") return "";
  return String(stockItemId);
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

function formatColumnHeader(key, { renameIdAsOrderNumber = false } = {}) {
  if (renameIdAsOrderNumber && key === "id") return "Order Number";
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatCellValue(value) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function InvoiceOutForm() {
  const [revenueAccountId, setRevenueAccountId] = useState("");
  const [revenueAccountOptions, setRevenueAccountOptions] = useState([]);
  const [revenueAccountsLoading, setRevenueAccountsLoading] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [invoiceRows, setInvoiceRows] = useState([]);
  const [gridLoading, setGridLoading] = useState(false);
  const [selectedOrderRowKey, setSelectedOrderRowKey] = useState(null);
  const [selectedProductRowKey, setSelectedProductRowKey] = useState(null);
  const [productRows, setProductRows] = useState([]);
  const [productsGridLoading, setProductsGridLoading] = useState(false);
  const [product, setProduct] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [customerOptions, setCustomerOptions] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [error, setError] = useState("");
  const [printSampleLoading, setPrintSampleLoading] = useState(false);

  const columns = useMemo(() => getColumnKeys(invoiceRows), [invoiceRows]);
  const productColumns = useMemo(() => getColumnKeys(productRows), [productRows]);

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

  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true);
    setError("");

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc("pr_customer_active");
      if (rpcError) throw rpcError;
      setCustomerOptions(normalizeCustomerOptions(data));
    } catch (err) {
      setError(err.message ?? "Failed to load customers");
      setCustomerOptions([]);
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  const clearProductFields = useCallback(() => {
    setSelectedProductRowKey(null);
    setProduct("");
    setProductId("");
    setQuantity("");
  }, []);

  const clearProductsGrid = useCallback(() => {
    setSelectedOrderRowKey(null);
    setProductRows([]);
    clearProductFields();
  }, [clearProductFields]);

  const loadProductsGrid = useCallback(async (ordersOutId) => {
    const parsedOrdersOutId = Number.parseInt(String(ordersOutId ?? ""), 10);
    if (ordersOutId == null || Number.isNaN(parsedOrdersOutId)) {
      setProductRows([]);
      return;
    }

    clearProductFields();
    setProductsGridLoading(true);

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc(
        "pr_invoice_allordered_all_products",
        { p_orders_out_id: parsedOrdersOutId }
      );
      if (rpcError) throw rpcError;

      setProductRows(normalizeProductGridRows(data));
    } catch (err) {
      setProductRows([]);
      setError(err.message ?? "Failed to load products");
    } finally {
      setProductsGridLoading(false);
    }
  }, [clearProductFields]);

  const loadInvoiceGrid = useCallback(async (selectedCustomerId) => {
    const parsedCustomerId = Number.parseInt(selectedCustomerId, 10);
    if (!selectedCustomerId || Number.isNaN(parsedCustomerId)) {
      setInvoiceRows([]);
      clearProductsGrid();
      return;
    }

    clearProductsGrid();
    setGridLoading(true);

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc(
        "pr_invoice_allordered_all_orders",
        { p_customer_id: parsedCustomerId }
      );
      if (rpcError) throw rpcError;

      setInvoiceRows(normalizeInvoiceGridRows(data));
    } catch (err) {
      setInvoiceRows([]);
      setError(err.message ?? "Failed to load invoice orders");
    } finally {
      setGridLoading(false);
    }
  }, [clearProductsGrid]);

  useEffect(() => {
    loadRevenueAccounts();
    loadCustomers();
  }, [loadRevenueAccounts, loadCustomers]);

  useEffect(() => {
    if (!customerId) {
      setInvoiceRows([]);
      clearProductsGrid();
      return;
    }

    loadInvoiceGrid(customerId);
  }, [customerId, loadInvoiceGrid, clearProductsGrid]);

  function handleCustomerChange(nextCustomerId) {
    setCustomerId(nextCustomerId);
    setError("");
    if (!nextCustomerId) {
      setInvoiceRows([]);
      clearProductsGrid();
    }
  }

  function handleOrderRowClick(row) {
    setSelectedOrderRowKey(row.rowKey);
    setError("");
    const ordersOutId = getOrderNumberFromRow(row);
    loadProductsGrid(ordersOutId);
  }

  function handleProductRowClick(row) {
    setSelectedProductRowKey(row.rowKey);
    setProduct(getProductTextFromRow(row));
    setProductId(getStockItemIdFromProductRow(row));
    setQuantity(getQtyFromProductRow(row));
  }

  async function handlePrintSampleInvoice() {
    setPrintSampleLoading(true);
    setError("");

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const [headerResult, linesResult] = await Promise.all([
        supabase.rpc("pr_invoice_out_header_by_invno", {
          p_invoice_number: SAMPLE_INVOICE_NUMBER,
        }),
        supabase.rpc("pr_invoice_out_lines_by_invno", {
          p_invoice_number: SAMPLE_INVOICE_NUMBER,
        }),
      ]);

      if (headerResult.error) throw headerResult.error;
      if (linesResult.error) throw linesResult.error;

      const { generateSampleInvoicePdf } = await import(
        "@/lib/invoices/generateSampleInvoicePdf"
      );
      await generateSampleInvoicePdf(
        headerResult.data,
        linesResult.data,
        SAMPLE_INVOICE_NUMBER
      );
    } catch (err) {
      setError(err.message ?? "Failed to generate sample invoice PDF");
    } finally {
      setPrintSampleLoading(false);
    }
  }

  return (
    <div className="mt-6 max-w-6xl">
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

      <label className="mt-4 flex w-full max-w-xs flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Customer
        </span>
        <select
          value={customerId}
          onChange={(e) => handleCustomerChange(e.target.value)}
          disabled={customersLoading}
          className={`${inputClassName} w-full`}
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

      {error && (
        <p
          className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      )}

      <h2 className="mt-6 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Orders
      </h2>
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
                    {formatColumnHeader(column, { renameIdAsOrderNumber: true })}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {gridLoading ? (
              <tr key="invoice-grid-loading">
                <td
                  colSpan={Math.max(columns.length, 1)}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  Loading…
                </td>
              </tr>
            ) : !customerId ? (
              <tr key="invoice-grid-select-customer">
                <td
                  colSpan={Math.max(columns.length, 1)}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  Select a customer to load orders.
                </td>
              </tr>
            ) : invoiceRows.length === 0 ? (
              <tr key="invoice-grid-empty">
                <td
                  colSpan={Math.max(columns.length, 1)}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  No orders found.
                </td>
              </tr>
            ) : (
              invoiceRows.map((row) => (
                <tr
                  key={row.rowKey}
                  onClick={() => handleOrderRowClick(row)}
                  className={`cursor-pointer border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 ${
                    selectedOrderRowKey === row.rowKey
                      ? "bg-sky-50 dark:bg-sky-900/20"
                      : ""
                  }`}
                >
                  {columns.map((column) => (
                    <td
                      key={`${row.rowKey}-${column}`}
                      className="whitespace-nowrap px-4 py-2 text-zinc-800 dark:text-zinc-200"
                    >
                      {formatCellValue(row[column])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-6 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Products
      </h2>
      <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
            <tr>
              {productColumns.length === 0 ? (
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  &nbsp;
                </th>
              ) : (
                productColumns.map((column) => (
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
            {productsGridLoading ? (
              <tr key="products-grid-loading">
                <td
                  colSpan={Math.max(productColumns.length, 1)}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  Loading…
                </td>
              </tr>
            ) : !selectedOrderRowKey ? (
              <tr key="products-grid-select-order">
                <td
                  colSpan={Math.max(productColumns.length, 1)}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  Select an order to load products.
                </td>
              </tr>
            ) : productRows.length === 0 ? (
              <tr key="products-grid-empty">
                <td
                  colSpan={Math.max(productColumns.length, 1)}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  No products found.
                </td>
              </tr>
            ) : (
              productRows.map((row) => (
                <tr
                  key={row.rowKey}
                  onClick={() => handleProductRowClick(row)}
                  className={`cursor-pointer border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 ${
                    selectedProductRowKey === row.rowKey
                      ? "bg-sky-50 dark:bg-sky-900/20"
                      : ""
                  }`}
                >
                  {productColumns.map((column) => (
                    <td
                      key={`${row.rowKey}-${column}`}
                      className="whitespace-nowrap px-4 py-2 text-zinc-800 dark:text-zinc-200"
                    >
                      {formatCellValue(row[column])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:max-w-2xl">
        <input
          type="text"
          name="product_id"
          value={productId}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          className="hidden"
        />
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Product
          </span>
          <input
            type="text"
            name="product"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            className={`${inputClassName} w-full`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Quantity
          </span>
          <input
            type="number"
            name="quantity"
            step="any"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={`${inputClassName} w-full`}
          />
        </label>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={handlePrintSampleInvoice}
          disabled={printSampleLoading}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {printSampleLoading ? "Generating…" : "Print Sample Invoice"}
        </button>
      </div>
    </div>
  );
}
