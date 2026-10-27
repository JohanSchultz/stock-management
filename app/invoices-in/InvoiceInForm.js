"use client";

import { SupplierSelect } from "@/components/SupplierSelect";
import {
  daysBeforeIsoDate,
  todayIsoDate,
} from "@/lib/date/isoMonthRange";
import {
  formatGridQtyOrUnitPrice,
  isQtyOrUnitPriceColumnKey,
  parseGridNumber,
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

const readOnlyInputClassName =
  "rounded border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 read-only:cursor-default dark:border-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-200";

const addButtonClassName =
  "shrink-0 rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500";

/** Aligns booked-in and ad-hoc entry rows (date/code/desc | unit price | qty | Add). */
const INVOICE_ITEM_ENTRY_GRID_CLASS =
  "grid w-full max-w-6xl grid-cols-[9rem_7rem_minmax(12rem,1fr)_7rem_6rem_auto] gap-x-2 items-end";

const numericInputProps = {
  type: "number",
  step: "any",
  inputMode: "decimal",
  min: 0,
};

function handleDecimalInputChange(nextValue, setter) {
  if (nextValue === "" || nextValue === "-" || nextValue.endsWith(".")) {
    setter(nextValue);
    return;
  }
  const parsed = parseGridNumber(nextValue);
  if (parsed == null) {
    setter(nextValue);
    return;
  }
  setter(nextValue);
}

const BOOKED_IN_GRID_HIDDEN_COLUMN_KEYS = new Set([
  "id",
  "book_in_id",
  "bookinid",
  "stock_item_id",
  "stockitemid",
  "action_user",
  "actionuser",
]);

const INVOICE_ITEMS_HIDDEN_COLUMN_KEYS = new Set(["id", "stock_item_id"]);

const INVOICE_ITEMS_GRID_COLUMNS = [
  { key: "id", header: "id" },
  { key: "stock_item_id", header: "stock_item_id" },
  { key: "booked_in_date", header: "Booked In Date" },
  { key: "stock_code", header: "Stock Code" },
  { key: "item_description", header: "Item Description" },
  { key: "unit_price", header: "Unit Price" },
  { key: "quantity", header: "Qty" },
];

function isHiddenInvoiceItemsGridColumn(columnKey) {
  return INVOICE_ITEMS_HIDDEN_COLUMN_KEYS.has(
    String(columnKey ?? "").trim().toLowerCase()
  );
}

const BOOKED_IN_GRID_COLUMN_ORDER = [
  "book_in_date",
  "booked_in_date",
  "created_at",
  "stock_code",
  "descr",
  "description",
  "unit_price",
  "qty",
  "quantity",
];

function parseInteger(value) {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeSingleRpcRow(data) {
  if (Array.isArray(data)) return data[0] ?? null;
  if (data && typeof data === "object") return data;
  return null;
}

function isValidDateRange(from, to) {
  if (!from || !to) return false;
  return from <= to;
}

function normalizeInvoiceInAccountOptions(data) {
  if (!Array.isArray(data)) return [];

  return data
    .map((row, index) => ({
      id: row.id ?? null,
      acctName: row.acct_name ?? row.acctname ?? "",
      optionKey:
        row.id != null
          ? `invoice-in-account-${row.id}`
          : `invoice-in-account-row-${index}`,
    }))
    .filter((row) => row.id != null);
}

function invoiceInAccountOptionLabel(option) {
  return String(option.acctName ?? "");
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

function normalizeColumnKey(key) {
  return String(key ?? "").trim().toLowerCase();
}

function isHiddenBookedInGridColumn(key) {
  return BOOKED_IN_GRID_HIDDEN_COLUMN_KEYS.has(normalizeColumnKey(key));
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

function getVisibleBookedInColumnKeys(rows) {
  return getColumnKeys(rows).filter((key) => !isHiddenBookedInGridColumn(key));
}

function mergeBookedInColumnKeys(rows) {
  const fromRows = getVisibleBookedInColumnKeys(rows);
  if (fromRows.length === 0) return fromRows;

  const seen = new Set();
  const keys = [];
  for (const key of BOOKED_IN_GRID_COLUMN_ORDER) {
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

function formatColumnHeader(key) {
  const normalized = normalizeColumnKey(key);
  if (normalized === "descr" || normalized === "description") {
    return "Item Description";
  }
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

function formatInvoiceItemGridCell(columnKey, value) {
  if (columnKey === "booked_in_date") {
    return formatBookInDate(value) || formatCellValue(value);
  }
  if (isQtyOrUnitPriceColumnKey(columnKey)) {
    return formatGridQtyOrUnitPrice(value);
  }
  return formatCellValue(value);
}

function toIsoDateInputValue(value) {
  if (value == null || value === "") return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getBookInNumberFromRow(row) {
  const value = row.id ?? row.book_in_id ?? row.bookInId;
  if (value == null || value === "") return "";
  return String(value);
}

function getStockItemIdFromRow(row) {
  const value = row.stock_item_id ?? row.stockItemId;
  if (value == null || value === "") return "";
  return String(value);
}

function getBookedInDateFromRow(row) {
  for (const key of [
    "book_in_date",
    "booked_in_date",
    "created_at",
    "date_placed",
    "order_placed_date",
  ]) {
    if (row[key] != null && row[key] !== "") {
      return toIsoDateInputValue(row[key]);
    }
  }
  return "";
}

function getStockCodeFromRow(row) {
  const value = row.stock_code ?? row.stockCode;
  if (value == null || value === "") return "";
  return String(value);
}

function getItemDescriptionFromRow(row) {
  const value = row.descr ?? row.description;
  if (value == null || value === "") return "";
  return String(value);
}

function getUnitPriceFromRow(row) {
  const value = row.unit_price ?? row.unitPrice;
  if (value == null || value === "") return "";
  return String(value);
}

function getQtyFromRow(row) {
  const value = row.qty ?? row.quantity ?? row.Qty;
  if (value == null || value === "") return "";
  return String(value);
}

function clearBookedInLineFields(setters) {
  setters.setSelectedBookedInRowKey(null);
  setters.setLineBookInId("");
  setters.setLineStockItemId("");
  setters.setLineBookedInDate("");
  setters.setLineStockCode("");
  setters.setLineItemDescription("");
  setters.setLineUnitPrice("");
  setters.setLineQty("");
}

export function InvoiceInForm() {
  const [accountId, setAccountId] = useState("");
  const [accountOptions, setAccountOptions] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
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
  const [selectedBookedInRowKey, setSelectedBookedInRowKey] = useState(null);
  const [lineBookInId, setLineBookInId] = useState("");
  const [lineStockItemId, setLineStockItemId] = useState("");
  const [lineBookedInDate, setLineBookedInDate] = useState("");
  const [lineStockCode, setLineStockCode] = useState("");
  const [lineItemDescription, setLineItemDescription] = useState("");
  const [lineUnitPrice, setLineUnitPrice] = useState("");
  const [lineQty, setLineQty] = useState("");
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [adHocDescription, setAdHocDescription] = useState("");
  const [adHocUnitPrice, setAdHocUnitPrice] = useState("");
  const [adHocQty, setAdHocQty] = useState("1");
  const [createConfirmOpen, setCreateConfirmOpen] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [createSuccessOpen, setCreateSuccessOpen] = useState(false);
  const [createSuccessInvoiceNumber, setCreateSuccessInvoiceNumber] =
    useState("");
  const [error, setError] = useState("");

  const bookedInColumns = useMemo(
    () => mergeBookedInColumnKeys(bookedInRows),
    [bookedInRows]
  );

  const canShowAddButton = Boolean(
    selectedBookedInRowKey &&
      lineBookInId &&
      parseGridNumber(lineUnitPrice) != null &&
      parseGridNumber(lineQty) != null
  );
  const canShowAdHocAddButton = Boolean(
    String(adHocDescription ?? "").trim() &&
      parseGridNumber(adHocUnitPrice) != null &&
      parseGridNumber(adHocQty) != null
  );
  const canShowCreateInvoiceButton = Boolean(
    accountId &&
      String(invoiceNumber ?? "").trim() &&
      invoiceItems.length > 0
  );

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc(
        "pr_invoice_in_accounts"
      );
      if (rpcError) throw rpcError;
      setAccountOptions(normalizeInvoiceInAccountOptions(data));
    } catch (err) {
      setAccountOptions([]);
      setError(err.message ?? "Failed to load accounts");
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  const loadBookedInGrid = useCallback(async () => {
    const parsedSupplierId = parseInteger(supplierId);
    if (parsedSupplierId == null) {
      setBookedInRows([]);
      clearBookedInLineFields({
        setSelectedBookedInRowKey,
        setLineBookInId,
        setLineStockItemId,
        setLineBookedInDate,
        setLineStockCode,
        setLineItemDescription,
        setLineUnitPrice,
        setLineQty,
      });
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
      clearBookedInLineFields({
        setSelectedBookedInRowKey,
        setLineBookInId,
        setLineStockItemId,
        setLineBookedInDate,
        setLineStockCode,
        setLineItemDescription,
        setLineUnitPrice,
        setLineQty,
      });
    } catch (err) {
      setBookedInRows([]);
      setError(err.message ?? "Failed to load booked in records");
    } finally {
      setBookedInGridLoading(false);
    }
  }, [supplierId, bookedInFromDate, bookedInToDate]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

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

  function handleBookedInRowClick(row) {
    setSelectedBookedInRowKey(row.rowKey);
    setLineBookInId(getBookInNumberFromRow(row));
    setLineStockItemId(getStockItemIdFromRow(row));
    setLineBookedInDate(getBookedInDateFromRow(row));
    setLineStockCode(getStockCodeFromRow(row));
    setLineItemDescription(getItemDescriptionFromRow(row));
    setLineUnitPrice(getUnitPriceFromRow(row));
    setLineQty(getQtyFromRow(row));
  }

  function handleAddBookedInLine() {
    if (!lineBookInId) {
      setError("Select a booked in row before adding.");
      return;
    }
    if (
      parseGridNumber(lineUnitPrice) == null ||
      parseGridNumber(lineQty) == null
    ) {
      setError("Enter valid unit price and qty.");
      return;
    }
    setError("");
    setInvoiceItems((current) => [
      ...current,
      {
        rowKey: `invoice-item-${current.length}-${Date.now()}`,
        id: lineBookInId,
        stock_item_id: lineStockItemId,
        booked_in_date: lineBookedInDate,
        stock_code: lineStockCode,
        item_description: lineItemDescription,
        unit_price: lineUnitPrice,
        quantity: lineQty,
      },
    ]);
    clearBookedInLineFields({
      setSelectedBookedInRowKey,
      setLineBookInId,
      setLineStockItemId,
      setLineBookedInDate,
      setLineStockCode,
      setLineItemDescription,
      setLineUnitPrice,
      setLineQty,
    });
  }

  function handleRemoveInvoiceItem(rowKey) {
    setInvoiceItems((current) => current.filter((row) => row.rowKey !== rowKey));
  }

  function handleAddAdHocLine() {
    const description = String(adHocDescription ?? "").trim();
    const unitPrice = String(adHocUnitPrice ?? "").trim();
    const qty = String(adHocQty ?? "").trim();
    if (!description || !unitPrice || !qty) {
      setError("Enter description, unit price, and qty for an ad hoc item.");
      return;
    }
    setError("");
    setInvoiceItems((current) => [
      ...current,
      {
        rowKey: `invoice-item-adhoc-${current.length}-${Date.now()}`,
        id: 0,
        stock_item_id: 0,
        booked_in_date: "",
        stock_code: "",
        item_description: description,
        unit_price: unitPrice,
        quantity: qty,
      },
    ]);
    setAdHocDescription("");
    setAdHocUnitPrice("");
    setAdHocQty("1");
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

  const initializePage = useCallback(() => {
    setAccountId("");
    setSupplierId("");
    setInvoiceNumber("");
    setInvoiceDate(todayIsoDate());
    setComments("");
    setBookedInRows([]);
    setInvoiceItems([]);
    clearBookedInLineFields({
      setSelectedBookedInRowKey,
      setLineBookInId,
      setLineStockItemId,
      setLineBookedInDate,
      setLineStockCode,
      setLineItemDescription,
      setLineUnitPrice,
      setLineQty,
    });
    setAdHocDescription("");
    setAdHocUnitPrice("");
    setAdHocQty("1");
    setError("");
  }, []);

  async function submitInvoiceCreation() {
    setCreatingInvoice(true);
    setError("");

    const parsedSupplierId = parseInteger(supplierId);
    const parsedAccountId = parseInteger(accountId);
    const normalizedInvoiceNumber = String(invoiceNumber ?? "").trim();

    if (parsedAccountId == null) {
      setError("Select an account before creating an invoice.");
      setCreatingInvoice(false);
      return;
    }

    if (!normalizedInvoiceNumber) {
      setError("Enter an invoice number before creating an invoice.");
      setCreatingInvoice(false);
      return;
    }

    if (parsedSupplierId == null) {
      setError("Select a supplier before creating an invoice.");
      setCreatingInvoice(false);
      return;
    }

    if (!invoiceDate) {
      setError("Select an invoice date before creating an invoice.");
      setCreatingInvoice(false);
      return;
    }

    if (invoiceItems.length === 0) {
      setError("Add at least one invoice item.");
      setCreatingInvoice(false);
      return;
    }

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data: headerData, error: headerError } = await supabase.rpc(
        "pi_invoice_in_header",
        {
          p_supplier: parsedSupplierId,
          p_account_type_id: parsedAccountId,
          p_comments: comments,
          p_invoice_number: normalizedInvoiceNumber,
          p_invoice_date: invoiceDate,
        }
      );
      if (headerError) throw headerError;

      const headerRow = normalizeSingleRpcRow(headerData);
      if (!headerRow && headerData == null) {
        throw new Error("Invoice header was not created.");
      }

      const newInvoiceHeaderId =
        parseInteger(headerRow?.id) ?? parseInteger(headerData);
      if (newInvoiceHeaderId == null) {
        throw new Error("Invoice header id was not returned.");
      }

      const createdInvoiceNumber =
        headerRow?.invoice_number != null
          ? String(headerRow.invoice_number)
          : normalizedInvoiceNumber;

      for (const line of invoiceItems) {
        const bookingInId = parseInteger(line.id) ?? 0;
        const stockItemId = parseInteger(line.stock_item_id) ?? 0;
        const unitPrice = parseGridNumber(line.unit_price);
        const qty = parseGridNumber(line.quantity);

        if (unitPrice == null || qty == null) {
          throw new Error(
            "Invoice line items have invalid unit price or quantity."
          );
        }

        const { error: lineError } = await supabase.rpc("pi_invoice_in_line", {
          p_invoice_in_header_id: newInvoiceHeaderId,
          p_booking_in_id: bookingInId,
          p_stock_item_id: stockItemId,
          p_unit_price: unitPrice,
          p_qty: qty,
        });
        if (lineError) throw lineError;
      }

      setCreateConfirmOpen(false);
      setCreateSuccessInvoiceNumber(createdInvoiceNumber);
      initializePage();
      setCreateSuccessOpen(true);
    } catch (err) {
      setError(err.message ?? "Failed to create invoice");
    } finally {
      setCreatingInvoice(false);
    }
  }

  function handleCreateOnly() {
    void submitInvoiceCreation();
  }

  return (
    <div className="mt-6 w-full max-w-6xl">
      <label className="flex w-full max-w-2xl flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Account
        </span>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          disabled={accountsLoading}
          className={`${inputClassName} w-full`}
        >
          <option value="">
            {accountsLoading ? "Loading…" : SELECT_PLACEHOLDER}
          </option>
          {accountOptions.map((option) => (
            <option key={option.optionKey} value={String(option.id ?? "")}>
              {invoiceInAccountOptionLabel(option)}
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
                    onClick={() => handleBookedInRowClick(row)}
                    className={`cursor-pointer border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 ${
                      selectedBookedInRowKey === row.rowKey
                        ? "bg-sky-50 dark:bg-sky-900/20"
                        : ""
                    }`}
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

      <input
        type="text"
        name="id"
        value={lineBookInId}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
      />
      <input
        type="text"
        name="stock_item_id"
        value={lineStockItemId}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
      />

      <div className={`mt-4 ${INVOICE_ITEM_ENTRY_GRID_CLASS}`}>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Booked In Date
          </span>
          <input
            type="text"
            name="booked_in_date"
            value={lineBookedInDate}
            readOnly
            tabIndex={-1}
            className={`${readOnlyInputClassName} w-full`}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Stock Code
          </span>
          <input
            type="text"
            name="stock_code"
            value={lineStockCode}
            readOnly
            tabIndex={-1}
            className={`${readOnlyInputClassName} w-full`}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Item Description
          </span>
          <input
            type="text"
            name="item_description"
            value={lineItemDescription}
            readOnly
            tabIndex={-1}
            className={`${readOnlyInputClassName} w-full`}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Unit Price
          </span>
          <input
            {...numericInputProps}
            name="unit_price"
            value={lineUnitPrice}
            onChange={(e) =>
              handleDecimalInputChange(e.target.value, setLineUnitPrice)
            }
            className={`${inputClassName} w-full`}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Qty
          </span>
          <input
            {...numericInputProps}
            name="qty"
            value={lineQty}
            onChange={(e) => handleDecimalInputChange(e.target.value, setLineQty)}
            className={`${inputClassName} w-full`}
          />
        </label>
        <button
          type="button"
          onClick={handleAddBookedInLine}
          disabled={!canShowAddButton}
          className={`${addButtonClassName} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Add
        </button>
      </div>

      <h2 className="mt-6 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Ad Hoc Items
      </h2>
      <div className={`mt-2 ${INVOICE_ITEM_ENTRY_GRID_CLASS}`}>
        <label className="col-span-3 flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Description
          </span>
          <input
            type="text"
            name="ad_hoc_description"
            value={adHocDescription}
            onChange={(e) => setAdHocDescription(e.target.value)}
            className={`${inputClassName} w-full`}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Unit Price
          </span>
          <input
            {...numericInputProps}
            name="ad_hoc_unit_price"
            value={adHocUnitPrice}
            onChange={(e) =>
              handleDecimalInputChange(e.target.value, setAdHocUnitPrice)
            }
            className={`${inputClassName} w-full`}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Qty
          </span>
          <input
            {...numericInputProps}
            name="ad_hoc_qty"
            value={adHocQty}
            onChange={(e) => handleDecimalInputChange(e.target.value, setAdHocQty)}
            className={`${inputClassName} w-full`}
          />
        </label>
        <button
          type="button"
          onClick={handleAddAdHocLine}
          disabled={!canShowAdHocAddButton}
          className={`${addButtonClassName} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Add
        </button>
      </div>

      <h2 className="mt-6 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Invoice Items
      </h2>
      <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
            <tr>
              {INVOICE_ITEMS_GRID_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className={`whitespace-nowrap px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300 ${
                    isHiddenInvoiceItemsGridColumn(column.key) ? "hidden" : ""
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
            {invoiceItems.length === 0 ? (
              <tr>
                <td
                  colSpan={INVOICE_ITEMS_GRID_COLUMNS.length + 1}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  No invoice items added yet.
                </td>
              </tr>
            ) : (
              invoiceItems.map((row) => (
                <tr
                  key={row.rowKey}
                  className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                >
                  {INVOICE_ITEMS_GRID_COLUMNS.map((column) => (
                    <td
                      key={`${row.rowKey}-${column.key}`}
                      className={`whitespace-nowrap px-4 py-2 text-zinc-800 dark:text-zinc-200 ${
                        isHiddenInvoiceItemsGridColumn(column.key)
                          ? "hidden"
                          : ""
                      }`}
                    >
                      {formatInvoiceItemGridCell(
                        column.key,
                        row[column.key]
                      )}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-4 py-2">
                    <button
                      type="button"
                      onClick={() => handleRemoveInvoiceItem(row.rowKey)}
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

      {error ? (
        <p
          className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
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
