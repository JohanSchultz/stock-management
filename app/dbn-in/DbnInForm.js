"use client";

import { CustomerSelect } from "@/components/CustomerSelect";
import { SupplierSelect } from "@/components/SupplierSelect";
import { ShowSupplierInvoicesModal } from "./ShowSupplierInvoicesModal";
import {
  formatGridQtyOrUnitPrice,
  isQtyOrUnitPriceColumnKey,
  parseGridNumber,
} from "@/lib/format/gridNumberFormat";
import {
  currentMonthEndIsoDate,
  currentMonthStartIsoDate,
} from "@/lib/date/isoMonthRange";
import {
  getDbnNumberFromHeaderData,
  printDebitNoteByNumber,
} from "@/lib/debitNotes/printDebitNotePdf";
import { prepareSupabaseClient } from "@/lib/supabase/useSupabaseIdleRecovery";
import { useCallback, useEffect, useMemo, useState } from "react";

const SELECT_PLACEHOLDER = " -SELECT- ";

const BOOK_OUT_DATE_COLUMN_KEYS = new Set([
  "date_placed",
  "book_out_date",
  "order_placed_date",
  "booked_out_date",
  "created_at",
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

const readOnlyInputClassName =
  "rounded border border-zinc-300 bg-zinc-50 px-3 py-2 text-zinc-800 read-only:cursor-default dark:border-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-200";

const addButtonClassName =
  "shrink-0 rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500";

const bookingsOutFilterLabelClassName =
  "text-xs font-medium text-zinc-700 dark:text-zinc-300";

const bookingsOutFilterInputClassName =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

const bookingsOutFilterSearchLinkClassName =
  "shrink-0 self-end pb-1 text-xs font-medium text-sky-700 underline hover:text-sky-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-sky-400 dark:hover:text-sky-300";

const showInvoicesButtonClassName =
  "shrink-0 rounded bg-sky-100 px-4 py-2 text-sm font-medium text-sky-900 hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-900/40 dark:text-sky-100 dark:hover:bg-sky-900/60";

const BOOKINGS_OUT_HIDDEN_COLUMN_KEYS = new Set(["stock_item_id"]);
const DBN_ITEM_HIDDEN_COLUMN_KEYS = new Set(["invoice_id", "item_id"]);

function normalizeInvoiceInAccountOptions(data) {
  if (!Array.isArray(data)) return [];

  return data
    .map((row, index) => ({
      id: row.id ?? null,
      acctName: row.acct_name ?? row.acctname ?? "",
      optionKey:
        row.id != null
          ? `dbn-in-account-${row.id}`
          : `dbn-in-account-row-${index}`,
    }))
    .filter((row) => row.id != null);
}

function accountOptionLabel(option) {
  return String(option.acctName ?? "");
}

function normalizeBookingOutRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => {
    const bookingKey = row.booking_out_id ?? row.id;
    return {
      ...row,
      rowKey:
        bookingKey != null
          ? `dbn-booking-out-${bookingKey}`
          : `dbn-booking-out-row-${index}`,
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
  if (key === "id" || key === "booking_out_id") return "Book Out Number";
  if (key === "customer") return "Customer";
  if (key === "stock_item_id") return "Stock Item Id";
  if (BOOK_OUT_DATE_COLUMN_KEYS.has(key)) return "Book Out Date";
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

const DBN_ITEM_COLUMN_KEYS = [
  "book_out_no",
  "invoice_no",
  "description",
  "qty",
  "unit_price",
];

function mergeDbnItemColumnKeys(rows) {
  const fromRows = getColumnKeys(rows);
  if (fromRows.length === 0) return [...DBN_ITEM_COLUMN_KEYS];

  const seen = new Set();
  const keys = [];
  for (const key of DBN_ITEM_COLUMN_KEYS) {
    if (fromRows.includes(key)) {
      keys.push(key);
      seen.add(key);
    }
  }
  for (const key of fromRows) {
    if (!seen.has(key)) {
      keys.push(key);
    }
  }
  return keys;
}

function formatDbnItemColumnHeader(key) {
  if (key === "item_id") return "Item Id";
  if (key === "book_out_no") return "Book Out No.";
  if (key === "invoice_no") return "Invoice No.";
  if (key === "unit_price") return "(Unit) Price";
  return formatColumnHeader(key);
}

function formatDbnItemGridCell(column, row) {
  const value = row[column];
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
  return parseGridNumber(value);
}

function normalizeSingleRpcRow(data) {
  if (Array.isArray(data)) return data[0] ?? null;
  if (data && typeof data === "object") return data;
  return null;
}

function parseRpcIntegerReturn(data) {
  if (typeof data === "number" && Number.isFinite(data)) {
    return Math.trunc(data);
  }
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (/^-?\d+$/.test(trimmed)) {
      return Number.parseInt(trimmed, 10);
    }
  }
  const row = normalizeSingleRpcRow(data);
  if (row && typeof row === "object") {
    const fromRow =
      row.id ?? row.dbn_id ?? row.dbn_header_id ?? row.dbn_in_header_id;
    if (fromRow != null) return parseInteger(fromRow);
  }
  return parseInteger(data);
}

function getDbnLineBookOutOrInvoiceNoValue(row) {
  return String(row.book_out_no || row.invoice_no || "").trim();
}

function buildDbnInLineRpcParams(dbnHeaderId, row) {
  const invoiceInIdText = String(row.invoice_id ?? "").trim();
  const hasInvoiceInId = invoiceInIdText !== "";
  const bookOutOrInvoiceNo = getDbnLineBookOutOrInvoiceNoValue(row);
  const qtyText = String(row.qty ?? "").trim();

  return {
    p_dbn_in_header_id: dbnHeaderId,
    p_booking_out_id: hasInvoiceInId
      ? 0
      : (parseInteger(bookOutOrInvoiceNo) ?? 0),
    p_stock_item_id: parseInteger(row.item_id) ?? 0,
    p_invoice_in_id: parseInteger(invoiceInIdText) ?? 0,
    p_unit_price: parseNumeric(row.unit_price) ?? 0,
    p_qty: qtyText === "" ? 1 : (parseNumeric(qtyText) ?? 1),
    p_descr: String(row.description ?? ""),
  };
}

function parseBookingOutIdParam(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getBookOutNumberFromRow(row) {
  const value = row.booking_out_id ?? row.id;
  if (value == null || value === "") return "";
  return String(value);
}

function getStockItemIdFromRow(row) {
  const value = row.stock_item_id ?? row.stockItemId;
  if (value == null || value === "") return "";
  return String(value);
}

function getProductTextFromRow(row) {
  if (row.item != null && row.item !== "") return String(row.item);
  if (row.product != null && row.product !== "") return String(row.product);
  const stockCode = row.stock_code ?? row.stockCode ?? "";
  const descr = row.descr ?? row.description ?? "";
  if (stockCode && descr) return `${stockCode} - ${descr}`;
  return String(stockCode || descr || "");
}

function getQtyFromRow(row) {
  const qty = row.qty ?? row.quantity ?? row.Qty;
  if (qty == null || qty === "") return "";
  return String(qty);
}

function getUnitPriceFromRow(row) {
  const unitPrice = row.unit_price ?? row.unitPrice;
  if (unitPrice == null || unitPrice === "") return "";
  return String(unitPrice);
}

function clearBookingOutDetailFields(setters) {
  setters.setSelectedBookingOutRowKey(null);
  setters.setStockItemId("");
  setters.setBookOutNo("");
  setters.setProduct("");
  setters.setQty("");
  setters.setUnitPrice("");
}

export function DbnInForm() {
  const [accountId, setAccountId] = useState("");
  const [accountOptions, setAccountOptions] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [supplierLabel, setSupplierLabel] = useState("");
  const [showInvoicesOpen, setShowInvoicesOpen] = useState(false);
  const [filterCustomerId, setFilterCustomerId] = useState("");
  const [filterFromDate, setFilterFromDate] = useState(() =>
    currentMonthStartIsoDate()
  );
  const [filterToDate, setFilterToDate] = useState(() =>
    currentMonthEndIsoDate()
  );
  const [filterBookingOutNumber, setFilterBookingOutNumber] = useState("");
  const [bookingOutRows, setBookingOutRows] = useState([]);
  const [bookingsOutGridLoading, setBookingsOutGridLoading] = useState(false);
  const [comments, setComments] = useState("");
  const [selectedBookingOutRowKey, setSelectedBookingOutRowKey] = useState(null);
  const [stockItemId, setStockItemId] = useState("");
  const [bookOutNo, setBookOutNo] = useState("");
  const [product, setProduct] = useState("");
  const [qty, setQty] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [itemId, setItemId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [otherItemQty, setOtherItemQty] = useState("");
  const [otherItemQtyDisabled, setOtherItemQtyDisabled] = useState(false);
  const [otherItem, setOtherItem] = useState("");
  const [otherItemPrice, setOtherItemPrice] = useState("");
  const [dbnLineItems, setDbnLineItems] = useState([]);
  const [createConfirmOpen, setCreateConfirmOpen] = useState(false);
  const [creatingDebitNote, setCreatingDebitNote] = useState(false);
  const [dbnId, setDbnId] = useState("");
  const [dbnNo, setDbnNo] = useState("");
  const [error, setError] = useState("");

  const showAfterAccount = Boolean(accountId);
  const showComments = showAfterAccount;
  const showBookingsOutGrid = showAfterAccount;
  const showTopAddButton = String(bookOutNo ?? "").trim() !== "";
  const showBottomAddButton =
    String(otherItem ?? "").trim() !== "" &&
    String(otherItemPrice ?? "").trim() !== "";

  const bookingOutColumns = useMemo(
    () =>
      getColumnKeys(bookingOutRows).filter(
        (key) => !BOOKINGS_OUT_HIDDEN_COLUMN_KEYS.has(key)
      ),
    [bookingOutRows]
  );

  const dbnItemColumns = useMemo(
    () =>
      mergeDbnItemColumnKeys(dbnLineItems).filter(
        (key) => !DBN_ITEM_HIDDEN_COLUMN_KEYS.has(key)
      ),
    [dbnLineItems]
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

  const loadBookingsOutGrid = useCallback(async () => {
    clearBookingOutDetailFields({
      setSelectedBookingOutRowKey,
      setStockItemId,
      setBookOutNo,
      setProduct,
      setQty,
      setUnitPrice,
    });
    setBookingsOutGridLoading(true);
    setError("");

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const pCustomerId = parseInteger(filterCustomerId) ?? 0;

      const { data, error: rpcError } = await supabase.rpc(
        "pr_dbn_booking_outs",
        {
          p_customer_id: pCustomerId,
          p_from: filterFromDate || null,
          p_to: filterToDate || null,
          p_booking_out_id: parseBookingOutIdParam(filterBookingOutNumber),
        }
      );
      if (rpcError) throw rpcError;

      setBookingOutRows(normalizeBookingOutRows(data));
    } catch (err) {
      setBookingOutRows([]);
      setError(err.message ?? "Failed to load bookings out");
    } finally {
      setBookingsOutGridLoading(false);
    }
  }, [
    filterCustomerId,
    filterFromDate,
    filterToDate,
    filterBookingOutNumber,
  ]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  function handleSearchBookingsOutClick() {
    loadBookingsOutGrid();
  }

  function handleSupplierChange(nextCustomerId) {
    setSupplierId(nextCustomerId);
    setError("");
    if (!nextCustomerId) {
      setSupplierLabel("");
      setShowInvoicesOpen(false);
      setComments("");
      setBookingOutRows([]);
      setDbnLineItems([]);
      setFilterCustomerId("");
      setFilterFromDate(currentMonthStartIsoDate());
      setFilterToDate(currentMonthEndIsoDate());
      setFilterBookingOutNumber("");
      clearBookingOutDetailFields({
        setSelectedBookingOutRowKey,
        setStockItemId,
        setBookOutNo,
        setProduct,
        setQty,
        setUnitPrice,
      });
    }
  }

  function handleBookingOutRowClick(row) {
    setSelectedBookingOutRowKey(row.rowKey);
    setStockItemId(getStockItemIdFromRow(row));
    setBookOutNo(getBookOutNumberFromRow(row));
    setProduct(getProductTextFromRow(row));
    setQty(getQtyFromRow(row));
    setUnitPrice(formatGridQtyOrUnitPrice(getUnitPriceFromRow(row)));
    setError("");
  }

  function handleAddBookingOutLine() {
    const normalizedBookInNo = String(bookOutNo ?? "").trim();
    if (!normalizedBookInNo) return;

    setDbnLineItems((current) => [
      ...current,
      {
        rowKey: `dbn-line-${current.length}-${Date.now()}`,
        invoice_id: "",
        item_id: String(stockItemId ?? "").trim(),
        book_out_no: normalizedBookInNo,
        invoice_no: "",
        description: product,
        qty,
        unit_price: unitPrice,
      },
    ]);

    clearBookingOutDetailFields({
      setSelectedBookingOutRowKey,
      setStockItemId,
      setBookOutNo,
      setProduct,
      setQty,
      setUnitPrice,
    });
    setError("");
  }

  function handleRemoveDbnLine(rowKey) {
    setDbnLineItems((current) => current.filter((row) => row.rowKey !== rowKey));
  }

  function handleCreateDebitNoteClick() {
    setError("");
    setCreateConfirmOpen(true);
  }

  function handleCreateConfirmNo() {
    setCreateConfirmOpen(false);
  }

  function initializePage() {
    setAccountId("");
    setSupplierId("");
    setSupplierLabel("");
    setShowInvoicesOpen(false);
    setFilterCustomerId("");
    setFilterFromDate(currentMonthStartIsoDate());
    setFilterToDate(currentMonthEndIsoDate());
    setFilterBookingOutNumber("");
    setBookingOutRows([]);
    setBookingsOutGridLoading(false);
    setComments("");
    clearBookingOutDetailFields({
      setSelectedBookingOutRowKey,
      setStockItemId,
      setBookOutNo,
      setProduct,
      setQty,
      setUnitPrice,
    });
    setInvoiceId("");
    setItemId("");
    setInvoiceNo("");
    setOtherItem("");
    setOtherItemQty("");
    setOtherItemQtyDisabled(false);
    setOtherItemPrice("");
    setDbnLineItems([]);
    setDbnId("");
    setDbnNo("");
    setCreateConfirmOpen(false);
    setError("");
  }

  async function submitDebitNoteCreation({
    generatePdfAfterCreate = false,
  } = {}) {
    setCreatingDebitNote(true);
    setError("");

    const parsedSupplierId = parseInteger(supplierId);
    if (parsedSupplierId == null) {
      setError("Select a supplier before creating a debit note.");
      setCreatingDebitNote(false);
      return;
    }

    const parsedAccountId = parseInteger(accountId);
    if (parsedAccountId == null) {
      setError("Select an account before creating a debit note.");
      setCreatingDebitNote(false);
      return;
    }

    if (dbnLineItems.length === 0) {
      setError("Add at least one item before creating a debit note.");
      setCreatingDebitNote(false);
      return;
    }

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data: headerData, error: headerError } = await supabase.rpc(
        "pi_dbn_in_header",
        {
          p_supplier_id: parsedSupplierId,
          p_account_type_id: parsedAccountId,
          p_comments: comments,
        }
      );
      if (headerError) throw headerError;

      const newDbnHeaderId = parseRpcIntegerReturn(headerData);
      if (newDbnHeaderId == null) {
        throw new Error("Debit note header id was not returned.");
      }

      const createdDbnNumber = getDbnNumberFromHeaderData(headerData);

      setDbnId(String(newDbnHeaderId));
      setDbnNo(createdDbnNumber);

      for (const line of dbnLineItems) {
        const { error: lineError } = await supabase.rpc(
          "pi_dbn_in_line",
          buildDbnInLineRpcParams(newDbnHeaderId, line)
        );
        if (lineError) throw lineError;
      }

      setCreateConfirmOpen(false);

      let printErrorMessage = "";
      if (generatePdfAfterCreate) {
        try {
          await printDebitNoteByNumber(createdDbnNumber);
        } catch (printErr) {
          printErrorMessage =
            printErr.message ?? "Failed to generate debit note PDF";
        }
      }

      initializePage();
      if (printErrorMessage) {
        setError(printErrorMessage);
      }
    } catch (err) {
      setError(err.message ?? "Failed to create debit note");
    } finally {
      setCreatingDebitNote(false);
    }
  }

  function handleCreateDebitNoteOnly() {
    void submitDebitNoteCreation();
  }

  function handleCreateDebitNoteAndPrint() {
    void submitDebitNoteCreation({ generatePdfAfterCreate: true });
  }

  function handleCreditEntireInvoiceFromModal({
    invoiceId: nextInvoiceId,
    invoiceNumber,
    lineTotalSum,
  }) {
    setInvoiceId(String(nextInvoiceId ?? ""));
    setInvoiceNo(String(invoiceNumber ?? ""));
    setOtherItem(`Debited invoice ${String(invoiceNumber ?? "").trim()}`);
    setOtherItemPrice(
      Number.isFinite(lineTotalSum) ? String(lineTotalSum) : ""
    );
    setOtherItemQty("");
    setOtherItemQtyDisabled(true);
    setShowInvoicesOpen(false);
    setError("");
  }

  function handleCreditLineItemFromModal({
    invoiceId: nextInvoiceId,
    itemId: nextItemId,
    invoiceNumber,
    item,
    qty,
    linePrice,
  }) {
    setInvoiceId(String(nextInvoiceId ?? ""));
    setItemId(String(nextItemId ?? ""));
    setInvoiceNo(String(invoiceNumber ?? ""));
    setOtherItem(
      `Debited invoice ${String(invoiceNumber ?? "").trim()}: ${String(item ?? "").trim()}`
    );
    setOtherItemQty(String(qty ?? ""));
    setOtherItemPrice(Number.isFinite(linePrice) ? String(linePrice) : "");
    setOtherItemQtyDisabled(false);
    setShowInvoicesOpen(false);
    setError("");
  }

  function handleAddOtherItemLine() {
    const description = String(otherItem ?? "").trim();
    const priceValue = String(otherItemPrice ?? "").trim();
    if (!description || !priceValue) return;

    setDbnLineItems((current) => [
      ...current,
      {
        rowKey: `dbn-line-${current.length}-${Date.now()}`,
        invoice_id: String(invoiceId ?? "").trim(),
        item_id: String(itemId ?? "").trim(),
        book_out_no: "",
        invoice_no: String(invoiceNo ?? "").trim(),
        description,
        qty: otherItemQty,
        unit_price: formatGridQtyOrUnitPrice(priceValue),
      },
    ]);

    setInvoiceId("");
    setItemId("");
    setInvoiceNo("");
    setOtherItem("");
    setOtherItemQty("");
    setOtherItemQtyDisabled(false);
    setOtherItemPrice("");
    setError("");
  }

  return (
    <div className="mt-6 max-w-6xl">
      <label className="flex w-full max-w-2xl flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Account
        </span>
        <select
          value={accountId}
          onChange={(e) => {
            setAccountId(e.target.value);
            if (!e.target.value) setComments("");
          }}
          disabled={accountsLoading}
          className={`${inputClassName} w-full`}
        >
          <option value="">
            {accountsLoading ? "Loading…" : SELECT_PLACEHOLDER}
          </option>
          {accountOptions.map((option) => (
            <option key={option.optionKey} value={String(option.id ?? "")}>
              {accountOptionLabel(option)}
            </option>
          ))}
        </select>
      </label>

      <ShowSupplierInvoicesModal
        open={showInvoicesOpen}
        onClose={() => setShowInvoicesOpen(false)}
        supplierId={supplierId}
        supplierLabel={supplierLabel}
        onError={(message) => setError(message)}
        onCreditEntireInvoice={handleCreditEntireInvoiceFromModal}
        onCreditLineItem={handleCreditLineItemFromModal}
      />

      {error ? (
        <p
          className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {showAfterAccount ? (
        <>
          {showComments ? (
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

          {showBookingsOutGrid ? (
            <>
          <h2 className="mt-6 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Bookings Out
          </h2>
          <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-end gap-2 p-2">
              <div className="flex flex-1 flex-wrap items-end gap-2 rounded-md bg-zinc-100 p-2 dark:bg-zinc-800/60">
                <CustomerSelect
                  value={filterCustomerId}
                  onChange={setFilterCustomerId}
                  className="flex w-full min-w-[7rem] max-w-[14rem] flex-col gap-0.5 [&_span]:text-xs [&_span]:font-medium [&_select]:rounded [&_select]:border [&_select]:border-zinc-300 [&_select]:bg-white [&_select]:px-2 [&_select]:py-1 [&_select]:text-xs dark:[&_select]:border-zinc-600 dark:[&_select]:bg-zinc-800"
                />
                <label className="flex flex-col gap-0.5">
                  <span className={bookingsOutFilterLabelClassName}>From</span>
                  <input
                    type="date"
                    name="bookings_in_from"
                    value={filterFromDate}
                    onChange={(e) => setFilterFromDate(e.target.value)}
                    className={bookingsOutFilterInputClassName}
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className={bookingsOutFilterLabelClassName}>To</span>
                  <input
                    type="date"
                    name="bookings_in_to"
                    value={filterToDate}
                    onChange={(e) => setFilterToDate(e.target.value)}
                    className={bookingsOutFilterInputClassName}
                  />
                </label>
                <label className="flex w-[7.5rem] flex-col gap-0.5 sm:w-[7.875rem]">
                  <span className={bookingsOutFilterLabelClassName}>
                    Booking Out No.
                  </span>
                  <input
                    type="text"
                    name="filter_booking_out_number"
                    inputMode="numeric"
                    value={filterBookingOutNumber}
                    onChange={(e) => setFilterBookingOutNumber(e.target.value)}
                    className={`${bookingsOutFilterInputClassName} w-full`}
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={handleSearchBookingsOutClick}
                disabled={bookingsOutGridLoading}
                className={bookingsOutFilterSearchLinkClassName}
                aria-label="Search bookings out"
              >
                {">>"}
              </button>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
                <tr>
                  {bookingOutColumns.length === 0 ? (
                    <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                      &nbsp;
                    </th>
                  ) : (
                    bookingOutColumns.map((column) => (
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
                {bookingsOutGridLoading ? (
                  <tr key="dbn-bookings-out-loading">
                    <td
                      colSpan={Math.max(bookingOutColumns.length, 1)}
                      className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : bookingOutRows.length === 0 ? (
                  <tr key="dbn-bookings-out-empty">
                    <td
                      colSpan={Math.max(bookingOutColumns.length, 1)}
                      className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                    >
                      No bookings out found.
                    </td>
                  </tr>
                ) : (
                  bookingOutRows.map((row) => (
                    <tr
                      key={row.rowKey}
                      onClick={() => handleBookingOutRowClick(row)}
                      className={`cursor-pointer border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 ${
                        selectedBookingOutRowKey === row.rowKey
                          ? "bg-sky-50 dark:bg-sky-900/20"
                          : ""
                      }`}
                    >
                      {bookingOutColumns.map((column) => (
                        <td
                          key={`${row.rowKey}-${column}`}
                          className="whitespace-normal break-words px-4 py-2 text-zinc-800 dark:text-zinc-200"
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
          </div>

          <div className="mt-4 grid max-w-5xl grid-cols-1 items-end gap-3 sm:grid-cols-[7rem_minmax(10rem,1fr)_7rem_8rem_auto] sm:gap-x-3 sm:gap-y-3">
            <label className="flex w-full flex-col gap-1 sm:w-auto">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Book Out No.
              </span>
              <input
                type="text"
                name="book_out_no"
                value={bookOutNo}
                readOnly
                tabIndex={-1}
                className={`${readOnlyInputClassName} w-full`}
              />
            </label>
            <label className="flex w-full min-w-0 flex-col gap-1 sm:max-w-md">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Product
              </span>
              <input
                type="text"
                name="product"
                value={product}
                readOnly
                tabIndex={-1}
                className={`${readOnlyInputClassName} w-full`}
              />
            </label>
            <label className="flex w-full flex-col gap-1 sm:w-auto">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Qty
              </span>
              <input
                type="number"
                name="qty"
                step="any"
                inputMode="decimal"
                min={0}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className={`${inputClassName} w-full`}
              />
            </label>
            <label className="flex w-full flex-col gap-1 sm:w-auto">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Unit Price
              </span>
              <input
                type="text"
                name="unit_price"
                value={unitPrice}
                readOnly
                tabIndex={-1}
                className={`${readOnlyInputClassName} w-full`}
              />
            </label>
            <div className="flex w-full items-end sm:w-auto sm:justify-self-start">
              {showTopAddButton ? (
                <button
                  type="button"
                  onClick={handleAddBookingOutLine}
                  className={addButtonClassName}
                >
                  Add
                </button>
              ) : (
                <span
                  className="hidden min-h-[2.5rem] sm:inline-block sm:min-w-[4.5rem]"
                  aria-hidden
                />
              )}
            </div>

          </div>
            </>
          ) : null}

          <h2 className="mt-6 text-sm font-bold text-zinc-700 dark:text-zinc-300">
            Diverse Items
          </h2>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <SupplierSelect
              value={supplierId}
              onChange={handleSupplierChange}
              onLoadError={(message) => setError(message)}
              className="flex w-full min-w-[12rem] max-w-xs flex-col gap-1"
            />
            <button
              type="button"
              onClick={() => setShowInvoicesOpen(true)}
              disabled={!supplierId}
              className={showInvoicesButtonClassName}
            >
              Show Invoices
            </button>
          </div>
          <div className="mt-3 flex max-w-5xl flex-wrap items-end gap-3">
            <label className="flex w-full flex-col gap-1 sm:w-36">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Invoice Number
              </span>
              <input
                type="text"
                name="invoice_no"
                value={invoiceNo}
                readOnly
                tabIndex={-1}
                className={`${readOnlyInputClassName} w-full`}
              />
            </label>
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Other item
              </span>
              <input
                type="text"
                name="other_item"
                value={otherItem}
                onChange={(e) => setOtherItem(e.target.value)}
                className={`${inputClassName} w-full`}
              />
            </label>
            <label className="flex w-full flex-col gap-1 sm:w-28">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Qty
              </span>
              <input
                type="number"
                name="other_item_qty"
                step="any"
                inputMode="decimal"
                min={0}
                value={otherItemQty}
                disabled={otherItemQtyDisabled}
                onChange={(e) => setOtherItemQty(e.target.value)}
                className={`${
                  otherItemQtyDisabled ? readOnlyInputClassName : inputClassName
                } w-full disabled:cursor-not-allowed`}
              />
            </label>
            <label className="flex w-full flex-col gap-1 sm:w-32">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Price
              </span>
              <input
                type="number"
                name="other_item_price"
                step="any"
                inputMode="decimal"
                min={0}
                value={otherItemPrice}
                onChange={(e) => setOtherItemPrice(e.target.value)}
                className={`${inputClassName} w-full`}
              />
            </label>
            <div className="flex w-full items-end sm:w-auto">
              {showBottomAddButton ? (
                <button
                  type="button"
                  onClick={handleAddOtherItemLine}
                  className={addButtonClassName}
                >
                  Add
                </button>
              ) : (
                <span
                  className="hidden min-h-[2.5rem] sm:inline-block sm:min-w-[4.5rem]"
                  aria-hidden
                />
              )}
            </div>
          </div>

          <h2 className="mt-6 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Items
          </h2>
          <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full min-w-max table-auto text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
                <tr>
                  {dbnItemColumns.map((column) => (
                    <th
                      key={column}
                      className="whitespace-normal px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      {formatDbnItemColumnHeader(column)}
                    </th>
                  ))}
                  <th className="whitespace-normal px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                    &nbsp;
                  </th>
                </tr>
              </thead>
              <tbody>
                {dbnLineItems.length === 0 ? (
                  <tr key="dbn-items-empty">
                    <td
                      colSpan={Math.max(dbnItemColumns.length, 1) + 1}
                      className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                    >
                      No items added yet.
                    </td>
                  </tr>
                ) : (
                  dbnLineItems.map((row) => (
                    <tr
                      key={row.rowKey}
                      className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                    >
                      {dbnItemColumns.map((column) => (
                        <td
                          key={`${row.rowKey}-${column}`}
                          className="whitespace-normal break-words px-3 py-2 text-zinc-800 dark:text-zinc-200"
                        >
                          {formatDbnItemGridCell(column, row)}
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-3 py-2">
                        <button
                          type="button"
                          onClick={() => handleRemoveDbnLine(row.rowKey)}
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

          <div className="mt-4">
            <button
              type="button"
              onClick={handleCreateDebitNoteClick}
              disabled={creatingDebitNote || dbnLineItems.length === 0}
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              CREATE DEBIT NOTE
            </button>
          </div>
        </>
      ) : null}

      {createConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-debit-note-confirm-title"
            className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h3
              id="create-debit-note-confirm-title"
              className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Confirm that the Details are correct..
            </h3>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={handleCreateConfirmNo}
                disabled={creatingDebitNote}
                className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                No, Wait
              </button>
              <button
                type="button"
                onClick={handleCreateDebitNoteOnly}
                disabled={creatingDebitNote}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creatingDebitNote ? "Creating…" : "Create Only"}
              </button>
              <button
                type="button"
                onClick={handleCreateDebitNoteAndPrint}
                disabled={creatingDebitNote}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creatingDebitNote ? "Creating…" : "Create and Print"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
