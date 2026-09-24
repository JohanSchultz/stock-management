"use client";

import { CustomerSelect } from "@/components/CustomerSelect";
import {
  formatGridQtyOrUnitPrice,
  isQtyOrUnitPriceColumnKey,
} from "@/lib/format/gridNumberFormat";
import { prepareSupabaseClient } from "@/lib/supabase/useSupabaseIdleRecovery";
import { useCallback, useEffect, useMemo, useState } from "react";

const SELECT_PLACEHOLDER = " -SELECT- ";

const BOOK_OUT_DATE_COLUMN_KEYS = new Set([
  "date_placed",
  "book_out_date",
  "order_placed_date",
  "booked_out_date",
]);

const BOOK_OUT_MONTH_NAMES = [
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

function normalizeInvoiceGridRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => {
    const orderKey = row.booking_out_id ?? row.id;
    return {
      ...row,
      rowKey:
        orderKey != null
          ? `invoice-all-ordered-${orderKey}`
          : `invoice-all-ordered-row-${index}`,
    };
  });
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
  return row.booking_out_id ?? row.id ?? null;
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

function getUnitPriceFromProductRow(row) {
  const unitPrice = row.unit_price ?? row.unitPrice;
  if (unitPrice == null || unitPrice === "") return "";
  return String(unitPrice);
}

function isStockItemInInvoiceLines(stockItemId, invoiceLineItems) {
  const normalizedId =
    stockItemId != null && stockItemId !== "" ? String(stockItemId) : "";
  if (!normalizedId) return false;

  return invoiceLineItems.some(
    (line) => String(line.stock_item_id ?? "") === normalizedId
  );
}

const INVOICE_LINE_GRID_COLUMNS = [
  { key: "stock_item_id", header: "stock_item_id", hidden: true },
  { key: "product", header: "Product" },
  { key: "quantity", header: "Quantity" },
  { key: "unit_price", header: "Unit Price" },
];

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

function formatColumnHeader(key, { invoiceBookingsOutGrid = false } = {}) {
  if (invoiceBookingsOutGrid) {
    if (key === "id" || key === "booking_out_id") return "Book Out Number";
    if (BOOK_OUT_DATE_COLUMN_KEYS.has(key)) return "Book Out Date";
  }
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatBookOutDate(value) {
  if (value == null || value === "") return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = BOOK_OUT_MONTH_NAMES[parsed.getMonth()] ?? "";
  const year = parsed.getFullYear();
  return `${day} ${month} ${year}`;
}

function formatCellValue(value) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function formatBookingsOutGridCell(column, value) {
  if (BOOK_OUT_DATE_COLUMN_KEYS.has(column)) {
    return formatBookOutDate(value);
  }
  if (isQtyOrUnitPriceColumnKey(column)) {
    return formatGridQtyOrUnitPrice(value);
  }
  return formatCellValue(value);
}

function formatProductOrLineGridCell(column, value) {
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

function parseNumeric(value) {
  if (value == null || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSingleRpcRow(data) {
  if (Array.isArray(data)) return data[0] ?? null;
  if (data && typeof data === "object") return data;
  return null;
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
  const [error, setError] = useState("");
  const [printSampleLoading, setPrintSampleLoading] = useState(false);
  const [invoiceLineItems, setInvoiceLineItems] = useState([]);
  const [comments, setComments] = useState("");
  const [createConfirmOpen, setCreateConfirmOpen] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [createSuccessOpen, setCreateSuccessOpen] = useState(false);
  const [createSuccessInvoiceNumber, setCreateSuccessInvoiceNumber] =
    useState("");

  const columns = useMemo(() => getColumnKeys(invoiceRows), [invoiceRows]);
  const selectedOrderRow = useMemo(
    () => invoiceRows.find((row) => row.rowKey === selectedOrderRowKey) ?? null,
    [invoiceRows, selectedOrderRowKey]
  );
  const selectedProductRow = useMemo(
    () => productRows.find((row) => row.rowKey === selectedProductRowKey) ?? null,
    [productRows, selectedProductRowKey]
  );
  const selectedProductMaxQty = useMemo(() => {
    if (!selectedProductRow) return null;
    return parseNumeric(getQtyFromProductRow(selectedProductRow));
  }, [selectedProductRow]);
  const productColumns = useMemo(() => getColumnKeys(productRows), [productRows]);
  const canShowAddButton = Boolean(
    revenueAccountId && customerId && selectedProductRowKey
  );
  const canShowCreateInvoiceButton = Boolean(
    revenueAccountId && customerId && invoiceLineItems.length > 0
  );
  const showCommentsAndOrders = Boolean(revenueAccountId && customerId);
  const showProductsSection = Boolean(selectedOrderRowKey);
  const showProductQuantityInputs = Boolean(selectedProductRowKey);
  const showInvoiceLineItemsSection = invoiceLineItems.length > 0;

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
    setInvoiceLineItems([]);
  }, [clearProductFields]);

  const initializePage = useCallback(() => {
    setRevenueAccountId("");
    setCustomerId("");
    setInvoiceRows([]);
    setGridLoading(false);
    setProductsGridLoading(false);
    setComments("");
    setError("");
    clearProductsGrid();
  }, [clearProductsGrid]);

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
        { p_booking_out_id: parsedOrdersOutId }
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
  }, [loadRevenueAccounts]);

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
    const stockItemId = getStockItemIdFromProductRow(row);
    if (isStockItemInInvoiceLines(stockItemId, invoiceLineItems)) {
      return;
    }

    setSelectedProductRowKey(row.rowKey);
    setProduct(getProductTextFromRow(row));
    setProductId(stockItemId);
    setQuantity(getQtyFromProductRow(row));
  }

  function handleQuantityChange(nextValue) {
    if (nextValue === "" || nextValue === "-" || nextValue.endsWith(".")) {
      setQuantity(nextValue);
      return;
    }

    const parsed = parseNumeric(nextValue);
    if (parsed == null) {
      setQuantity(nextValue);
      return;
    }

    if (selectedProductMaxQty != null && parsed > selectedProductMaxQty) {
      setQuantity(String(selectedProductMaxQty));
      return;
    }

    setQuantity(nextValue);
  }

  function handleAddInvoiceLine() {
    const selectedProductRow =
      productRows.find((row) => row.rowKey === selectedProductRowKey) ?? null;

    setInvoiceLineItems((current) => [
      ...current,
      {
        rowKey: `invoice-line-${current.length}-${Date.now()}`,
        stock_item_id: productId,
        product,
        quantity,
        unit_price: selectedProductRow
          ? getUnitPriceFromProductRow(selectedProductRow)
          : "",
      },
    ]);
    setSelectedProductRowKey(null);
    setProductId("");
    setProduct("");
    setQuantity("");
  }

  function handleRemoveInvoiceLine(rowKey) {
    setInvoiceLineItems((current) =>
      current.filter((row) => row.rowKey !== rowKey)
    );
  }

  function handleCreateInvoiceClick() {
    setError("");
    setCreateConfirmOpen(true);
  }

  function handleCreateConfirmNo() {
    setCreateConfirmOpen(false);
  }

  function handleCloseCreateSuccess() {
    setCreateSuccessOpen(false);
  }

  async function printInvoiceByNumber(invoiceNumberParam, { managePrintLoading = true } = {}) {
    const normalizedInvoiceNumber = String(invoiceNumberParam ?? "").trim();
    if (!normalizedInvoiceNumber) {
      throw new Error(
        "Enter or create an invoice to get an invoice number before printing."
      );
    }

    if (managePrintLoading) {
      setPrintSampleLoading(true);
    }

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const [headerResult, linesResult] = await Promise.all([
        supabase.rpc("pr_invoice_out_header_by_invno", {
          p_invoice_number: normalizedInvoiceNumber,
        }),
        supabase.rpc("pr_invoice_out_lines_by_invno", {
          p_invoice_number: normalizedInvoiceNumber,
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
        normalizedInvoiceNumber
      );
    } finally {
      if (managePrintLoading) {
        setPrintSampleLoading(false);
      }
    }
  }

  async function submitInvoiceCreation({ printAfterCreate = false } = {}) {
    setCreatingInvoice(true);
    setError("");

    const parsedCustomerId = parseInteger(customerId);
    const orderOutId = selectedOrderRow
      ? parseInteger(getOrderNumberFromRow(selectedOrderRow))
      : null;

    if (parsedCustomerId == null) {
      setError("Select a customer before creating an invoice.");
      setCreatingInvoice(false);
      return;
    }

    if (!revenueAccountId) {
      setError("Select a revenue account before creating an invoice.");
      setCreatingInvoice(false);
      return;
    }

    if (orderOutId == null) {
      setError("Select an order before creating an invoice.");
      setCreatingInvoice(false);
      return;
    }

    if (invoiceLineItems.length === 0) {
      setError("Add at least one invoice line item.");
      setCreatingInvoice(false);
      return;
    }

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data: headerData, error: headerError } = await supabase.rpc(
        "pi_invoice_out_header",
        {
          p_customer_id: parsedCustomerId,
          p_account_number: String(revenueAccountId),
          p_comments: comments,
        }
      );
      if (headerError) throw headerError;

      const headerRow = normalizeSingleRpcRow(headerData);
      if (!headerRow) {
        throw new Error("Invoice header was not created.");
      }

      const newInvoiceHeaderId = parseInteger(headerRow.id);
      if (newInvoiceHeaderId == null) {
        throw new Error("Invoice header id was not returned.");
      }

      const createdInvoiceNumber =
        headerRow.invoice_number != null ? String(headerRow.invoice_number) : "";

      for (const line of invoiceLineItems) {
        const stockItemId = parseInteger(line.stock_item_id);
        const unitPrice = parseNumeric(line.unit_price);
        const qty = parseNumeric(line.quantity);

        if (stockItemId == null || unitPrice == null || qty == null) {
          throw new Error("Invoice line items have invalid stock item, price, or quantity.");
        }

        const { error: lineError } = await supabase.rpc("pi_invoice_out_line", {
          p_invoice_header_id: newInvoiceHeaderId,
          p_booking_out_id: orderOutId,
          p_stock_item_id: stockItemId,
          p_unit_price: unitPrice,
          p_qty: qty,
        });
        if (lineError) throw lineError;
      }

      setCreateConfirmOpen(false);

      if (printAfterCreate) {
        let printErrorMessage = "";
        try {
          await printInvoiceByNumber(createdInvoiceNumber, {
            managePrintLoading: false,
          });
        } catch (printErr) {
          printErrorMessage =
            printErr.message ?? "Failed to generate invoice PDF";
        }
        initializePage();
        if (printErrorMessage) {
          setError(printErrorMessage);
        }
      } else {
        setCreateSuccessInvoiceNumber(createdInvoiceNumber);
        initializePage();
        setCreateSuccessOpen(true);
      }
    } catch (err) {
      setError(err.message ?? "Failed to create invoice");
    } finally {
      setCreatingInvoice(false);
    }
  }

  function handleCreateOnly() {
    submitInvoiceCreation({ printAfterCreate: false });
  }

  function handleCreateAndPrint() {
    submitInvoiceCreation({ printAfterCreate: true });
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

      <CustomerSelect
        value={customerId}
        onChange={handleCustomerChange}
        onLoadError={(message) => setError(message)}
      />

      {error ? (
        <p
          className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {showCommentsAndOrders ? (
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
      ) : null}

      {showCommentsAndOrders ? (
        <>
      <h2 className="mt-6 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Bookings Out
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
                    {formatColumnHeader(column, { invoiceBookingsOutGrid: true })}
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
                  Select a customer to load bookings out.
                </td>
              </tr>
            ) : invoiceRows.length === 0 ? (
              <tr key="invoice-grid-empty">
                <td
                  colSpan={Math.max(columns.length, 1)}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  No bookings out found.
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
                      {formatBookingsOutGridCell(column, row[column])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
        </>
      ) : null}

      {showProductsSection ? (
        <>
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
              productRows.map((row) => {
                const stockItemId = getStockItemIdFromProductRow(row);
                const alreadyOnInvoice = isStockItemInInvoiceLines(
                  stockItemId,
                  invoiceLineItems
                );

                return (
                <tr
                  key={row.rowKey}
                  onClick={() => {
                    if (!alreadyOnInvoice) handleProductRowClick(row);
                  }}
                  className={`border-b border-zinc-100 last:border-b-0 dark:border-zinc-800 ${
                    alreadyOnInvoice
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  } ${
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
                      {formatProductOrLineGridCell(column, row[column])}
                    </td>
                  ))}
                </tr>
              );
              })
            )}
          </tbody>
        </table>
      </div>
        </>
      ) : null}

      <input
        type="text"
        name="product_id"
        value={productId}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
      />
      {showProductQuantityInputs ? (
      <div className="mt-4 flex max-w-3xl flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Product
          </span>
          <input
            type="text"
            name="product"
            value={product}
            readOnly
            tabIndex={-1}
            className={`${inputClassName} w-full`}
          />
        </label>
        <label className="flex w-full flex-col gap-1 sm:w-36">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Quantity
          </span>
          <input
            type="number"
            name="quantity"
            step="any"
            inputMode="decimal"
            min={0}
            max={
              selectedProductMaxQty != null ? selectedProductMaxQty : undefined
            }
            value={quantity}
            onChange={(e) => handleQuantityChange(e.target.value)}
            className={`${inputClassName} w-full`}
          />
        </label>
        {canShowAddButton ? (
          <button
            type="button"
            onClick={handleAddInvoiceLine}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Add
          </button>
        ) : null}
      </div>
      ) : null}

      {showInvoiceLineItemsSection ? (
        <>
      <h2 className="mt-6 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Invoice Line Items
      </h2>
      <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
            <tr>
              {INVOICE_LINE_GRID_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className={`whitespace-nowrap px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300 ${
                    column.hidden ? "hidden" : ""
                  }`}
                >
                  {column.header}
                </th>
              ))}
              <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                &nbsp;
              </th>
            </tr>
          </thead>
          <tbody>
            {invoiceLineItems.length === 0 ? (
              <tr key="invoice-lines-empty">
                <td
                  colSpan={INVOICE_LINE_GRID_COLUMNS.length + 1}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  No lines added yet.
                </td>
              </tr>
            ) : (
              invoiceLineItems.map((row) => (
                <tr
                  key={row.rowKey}
                  className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                >
                  {INVOICE_LINE_GRID_COLUMNS.map((column) => (
                    <td
                      key={`${row.rowKey}-${column.key}`}
                      className={`whitespace-nowrap px-4 py-2 text-zinc-800 dark:text-zinc-200 ${
                        column.hidden ? "hidden" : ""
                      }`}
                    >
                      {formatProductOrLineGridCell(column.key, row[column.key])}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-4 py-2">
                    <button
                      type="button"
                      onClick={() => handleRemoveInvoiceLine(row.rowKey)}
                      className="rounded bg-red-200 px-3 py-1 text-sm font-medium text-red-900 hover:bg-red-300 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-900/60"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
        </>
      ) : null}

      <div className="mt-4">
        {canShowCreateInvoiceButton ? (
          <button
            type="button"
            onClick={handleCreateInvoiceClick}
            disabled={creatingInvoice}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            CREATE INVOICE
          </button>
        ) : null}
      </div>

      {createConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-invoice-confirm-title"
            className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h3
              id="create-invoice-confirm-title"
              className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Confirm that the Details are correct..
            </h3>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={handleCreateConfirmNo}
                disabled={creatingInvoice}
                className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                No, Wait
              </button>
              <button
                type="button"
                onClick={handleCreateOnly}
                disabled={creatingInvoice}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creatingInvoice ? "Creating…" : "Create Only"}
              </button>
              <button
                type="button"
                onClick={handleCreateAndPrint}
                disabled={creatingInvoice}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creatingInvoice ? "Creating…" : "Create and Print"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createSuccessOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-invoice-success-title"
            className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
          >
            <p
              id="create-invoice-success-title"
              className="text-sm text-zinc-800 dark:text-zinc-200"
            >
              Invoice Number {createSuccessInvoiceNumber} has been created
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleCloseCreateSuccess}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
