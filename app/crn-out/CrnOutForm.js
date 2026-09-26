"use client";

import { CustomerSelect } from "@/components/CustomerSelect";
import { SupplierSelect } from "@/components/SupplierSelect";
import { ShowInvoicesModal } from "./ShowInvoicesModal";
import {
  formatGridQtyOrUnitPrice,
  isQtyOrUnitPriceColumnKey,
} from "@/lib/format/gridNumberFormat";
import {
  currentMonthEndIsoDate,
  currentMonthStartIsoDate,
} from "@/lib/date/isoMonthRange";
import { prepareSupabaseClient } from "@/lib/supabase/useSupabaseIdleRecovery";
import { useCallback, useEffect, useMemo, useState } from "react";

const SELECT_PLACEHOLDER = " -SELECT- ";

const BOOK_IN_DATE_COLUMN_KEYS = new Set([
  "date_placed",
  "book_in_date",
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

const readOnlyInputClassName =
  "rounded border border-zinc-300 bg-zinc-50 px-3 py-2 text-zinc-800 read-only:cursor-default dark:border-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-200";

const addButtonClassName =
  "shrink-0 rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500";

const bookingsInFilterLabelClassName =
  "text-xs font-medium text-zinc-700 dark:text-zinc-300";

const bookingsInFilterInputClassName =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

const bookingsInFilterSearchLinkClassName =
  "shrink-0 self-end pb-1 text-xs font-medium text-sky-700 underline hover:text-sky-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-sky-400 dark:hover:text-sky-300";

const showInvoicesButtonClassName =
  "shrink-0 rounded bg-sky-100 px-4 py-2 text-sm font-medium text-sky-900 hover:bg-sky-200 dark:bg-sky-900/40 dark:text-sky-100 dark:hover:bg-sky-900/60";

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

function normalizeBookingInRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => {
    const bookingKey = row.booking_in_id ?? row.id;
    return {
      ...row,
      rowKey:
        bookingKey != null
          ? `crn-booking-in-${bookingKey}`
          : `crn-booking-in-row-${index}`,
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
  if (key === "id" || key === "booking_in_id") return "Book In Number";
  if (key === "supplier") return "Supplier";
  if (BOOK_IN_DATE_COLUMN_KEYS.has(key)) return "Book In Date";
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

function formatBookingsInGridCell(column, value) {
  if (BOOK_IN_DATE_COLUMN_KEYS.has(column)) {
    return formatBookInDate(value);
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

function parseBookingInIdParam(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getBookInNumberFromRow(row) {
  const value = row.booking_in_id ?? row.id;
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

function clearBookingInDetailFields(setters) {
  setters.setSelectedBookingInRowKey(null);
  setters.setBookInNo("");
  setters.setProduct("");
  setters.setQty("");
  setters.setUnitPrice("");
}

export function CrnOutForm() {
  const [revenueAccountId, setRevenueAccountId] = useState("");
  const [revenueAccountOptions, setRevenueAccountOptions] = useState([]);
  const [revenueAccountsLoading, setRevenueAccountsLoading] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");
  const [showInvoicesOpen, setShowInvoicesOpen] = useState(false);
  const [filterSupplierId, setFilterSupplierId] = useState("");
  const [filterFromDate, setFilterFromDate] = useState(() =>
    currentMonthStartIsoDate()
  );
  const [filterToDate, setFilterToDate] = useState(() =>
    currentMonthEndIsoDate()
  );
  const [filterBookingInNumber, setFilterBookingInNumber] = useState("");
  const [bookingInRows, setBookingInRows] = useState([]);
  const [bookingsInGridLoading, setBookingsInGridLoading] = useState(false);
  const [comments, setComments] = useState("");
  const [selectedBookingInRowKey, setSelectedBookingInRowKey] = useState(null);
  const [bookInNo, setBookInNo] = useState("");
  const [product, setProduct] = useState("");
  const [qty, setQty] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [otherItem, setOtherItem] = useState("");
  const [otherItemPrice, setOtherItemPrice] = useState("");
  const [crnLineItems, setCrnLineItems] = useState([]);
  const [createConfirmOpen, setCreateConfirmOpen] = useState(false);
  const [creatingCreditNote, setCreatingCreditNote] = useState(false);
  const [error, setError] = useState("");

  const showComments = Boolean(revenueAccountId && customerId);
  const showBookingsInGrid = showComments;
  const showTopAddButton = String(bookInNo ?? "").trim() !== "";
  const showBottomAddButton =
    String(otherItem ?? "").trim() !== "" &&
    String(otherItemPrice ?? "").trim() !== "";

  const bookingInColumns = useMemo(
    () => getColumnKeys(bookingInRows),
    [bookingInRows]
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

  const loadBookingsInGrid = useCallback(async () => {
    setCrnLineItems([]);
    clearBookingInDetailFields({
      setSelectedBookingInRowKey,
      setBookInNo,
      setProduct,
      setQty,
      setUnitPrice,
    });
    setBookingsInGridLoading(true);
    setError("");

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const pSupplierId = parseInteger(filterSupplierId) ?? 0;

      const { data, error: rpcError } = await supabase.rpc("pr__crn_booking_ins", {
        p_supplier_id: pSupplierId,
        p_from: filterFromDate || null,
        p_to: filterToDate || null,
        p_booking_in_id: parseBookingInIdParam(filterBookingInNumber),
      });
      if (rpcError) throw rpcError;

      setBookingInRows(normalizeBookingInRows(data));
    } catch (err) {
      setBookingInRows([]);
      setError(err.message ?? "Failed to load bookings in");
    } finally {
      setBookingsInGridLoading(false);
    }
  }, [
    filterSupplierId,
    filterFromDate,
    filterToDate,
    filterBookingInNumber,
  ]);

  useEffect(() => {
    loadRevenueAccounts();
  }, [loadRevenueAccounts]);

  function handleSearchBookingsInClick() {
    loadBookingsInGrid();
  }

  function handleCustomerChange(nextCustomerId) {
    setCustomerId(nextCustomerId);
    setError("");
    if (!nextCustomerId) {
      setCustomerLabel("");
      setShowInvoicesOpen(false);
      setComments("");
      setBookingInRows([]);
      setCrnLineItems([]);
      setFilterSupplierId("");
      setFilterFromDate(currentMonthStartIsoDate());
      setFilterToDate(currentMonthEndIsoDate());
      setFilterBookingInNumber("");
      clearBookingInDetailFields({
        setSelectedBookingInRowKey,
        setBookInNo,
        setProduct,
        setQty,
        setUnitPrice,
      });
    }
  }

  function handleCustomerSelectionChange(nextCustomerId, nextCustomerLabel) {
    setCustomerLabel(nextCustomerLabel);
    if (!nextCustomerId) {
      setCustomerLabel("");
    }
  }

  function handleBookingInRowClick(row) {
    setSelectedBookingInRowKey(row.rowKey);
    setBookInNo(getBookInNumberFromRow(row));
    setProduct(getProductTextFromRow(row));
    setQty(getQtyFromRow(row));
    setUnitPrice(formatGridQtyOrUnitPrice(getUnitPriceFromRow(row)));
    setError("");
  }

  function handleAddBookingInLine() {
    const normalizedBookInNo = String(bookInNo ?? "").trim();
    if (!normalizedBookInNo) return;

    setCrnLineItems((current) => [
      ...current,
      {
        rowKey: `crn-line-${current.length}-${Date.now()}`,
        book_in_no: normalizedBookInNo,
        description: product,
        qty,
        unit_price: unitPrice,
      },
    ]);

    clearBookingInDetailFields({
      setSelectedBookingInRowKey,
      setBookInNo,
      setProduct,
      setQty,
      setUnitPrice,
    });
    setError("");
  }

  function handleRemoveCrnLine(rowKey) {
    setCrnLineItems((current) => current.filter((row) => row.rowKey !== rowKey));
  }

  function handleCreateCreditNoteClick() {
    setError("");
    setCreateConfirmOpen(true);
  }

  function handleCreateConfirmNo() {
    setCreateConfirmOpen(false);
  }

  function handleCreateCreditNoteOnly() {
    setCreatingCreditNote(true);
    setCreateConfirmOpen(false);
    setCreatingCreditNote(false);
  }

  function handleCreateCreditNoteAndPrint() {
    setCreatingCreditNote(true);
    setCreateConfirmOpen(false);
    setCreatingCreditNote(false);
  }

  function handleAddOtherItemLine() {
    const description = String(otherItem ?? "").trim();
    const priceValue = String(otherItemPrice ?? "").trim();
    if (!description || !priceValue) return;

    setCrnLineItems((current) => [
      ...current,
      {
        rowKey: `crn-line-${current.length}-${Date.now()}`,
        book_in_no: "",
        description,
        qty: "",
        unit_price: formatGridQtyOrUnitPrice(priceValue),
      },
    ]);

    setOtherItem("");
    setOtherItemPrice("");
    setError("");
  }

  return (
    <div className="mt-6 max-w-6xl">
      <label className="flex w-full max-w-2xl flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Revenue Account
        </span>
        <select
          value={revenueAccountId}
          onChange={(e) => {
            setRevenueAccountId(e.target.value);
            if (!e.target.value) setComments("");
          }}
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

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <CustomerSelect
          value={customerId}
          onChange={handleCustomerChange}
          onSelectionLabelChange={handleCustomerSelectionChange}
          onLoadError={(message) => setError(message)}
          className="flex w-full min-w-[12rem] max-w-xs flex-col gap-1"
        />
        {customerId ? (
          <button
            type="button"
            onClick={() => setShowInvoicesOpen(true)}
            className={showInvoicesButtonClassName}
          >
            Show Invoices
          </button>
        ) : null}
      </div>

      <ShowInvoicesModal
        open={showInvoicesOpen}
        onClose={() => setShowInvoicesOpen(false)}
        customerId={customerId}
        customerLabel={customerLabel}
        onError={(message) => setError(message)}
      />

      {error ? (
        <p
          className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}

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

      {showBookingsInGrid ? (
        <>
          <h2 className="mt-6 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Bookings In
          </h2>
          <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-end gap-2 p-2">
              <div className="flex flex-1 flex-wrap items-end gap-2 rounded-md bg-zinc-100 p-2 dark:bg-zinc-800/60">
                <SupplierSelect
                  value={filterSupplierId}
                  onChange={setFilterSupplierId}
                  className="flex w-full min-w-[7rem] max-w-[14rem] flex-col gap-0.5"
                  labelClassName={bookingsInFilterLabelClassName}
                  selectClassName={bookingsInFilterInputClassName}
                />
                <label className="flex flex-col gap-0.5">
                  <span className={bookingsInFilterLabelClassName}>From</span>
                  <input
                    type="date"
                    name="bookings_in_from"
                    value={filterFromDate}
                    onChange={(e) => setFilterFromDate(e.target.value)}
                    className={bookingsInFilterInputClassName}
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className={bookingsInFilterLabelClassName}>To</span>
                  <input
                    type="date"
                    name="bookings_in_to"
                    value={filterToDate}
                    onChange={(e) => setFilterToDate(e.target.value)}
                    className={bookingsInFilterInputClassName}
                  />
                </label>
                <label className="flex w-[7.5rem] flex-col gap-0.5 sm:w-[7.875rem]">
                  <span className={bookingsInFilterLabelClassName}>
                    Booking In No.
                  </span>
                  <input
                    type="text"
                    name="filter_booking_in_number"
                    inputMode="numeric"
                    value={filterBookingInNumber}
                    onChange={(e) => setFilterBookingInNumber(e.target.value)}
                    className={`${bookingsInFilterInputClassName} w-full`}
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={handleSearchBookingsInClick}
                disabled={bookingsInGridLoading}
                className={bookingsInFilterSearchLinkClassName}
                aria-label="Search bookings in"
              >
                {">>"}
              </button>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
                <tr>
                  {bookingInColumns.length === 0 ? (
                    <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                      &nbsp;
                    </th>
                  ) : (
                    bookingInColumns.map((column) => (
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
                {bookingsInGridLoading ? (
                  <tr key="crn-bookings-in-loading">
                    <td
                      colSpan={Math.max(bookingInColumns.length, 1)}
                      className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : bookingInRows.length === 0 ? (
                  <tr key="crn-bookings-in-empty">
                    <td
                      colSpan={Math.max(bookingInColumns.length, 1)}
                      className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                    >
                      No bookings in found.
                    </td>
                  </tr>
                ) : (
                  bookingInRows.map((row) => (
                    <tr
                      key={row.rowKey}
                      onClick={() => handleBookingInRowClick(row)}
                      className={`cursor-pointer border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 ${
                        selectedBookingInRowKey === row.rowKey
                          ? "bg-sky-50 dark:bg-sky-900/20"
                          : ""
                      }`}
                    >
                      {bookingInColumns.map((column) => (
                        <td
                          key={`${row.rowKey}-${column}`}
                          className="whitespace-nowrap px-4 py-2 text-zinc-800 dark:text-zinc-200"
                        >
                          {formatBookingsInGridCell(column, row[column])}
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
                Book In No.
              </span>
              <input
                type="text"
                name="book_in_no"
                value={bookInNo}
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
                  onClick={handleAddBookingInLine}
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

            <label className="flex w-full flex-col gap-1 sm:col-span-3 sm:max-w-none">
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
            <label className="flex w-full flex-col gap-1 sm:w-auto">
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
            <div className="flex w-full items-end sm:w-auto sm:justify-self-start">
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
            <table className="w-full min-w-max text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                    Book In No.
                  </th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                    Description
                  </th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                    Qty
                  </th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                    (Unit) Price
                  </th>
                  <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                    &nbsp;
                  </th>
                </tr>
              </thead>
              <tbody>
                {crnLineItems.length === 0 ? (
                  <tr key="crn-items-empty">
                    <td
                      colSpan={5}
                      className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                    >
                      No items added yet.
                    </td>
                  </tr>
                ) : (
                  crnLineItems.map((row) => (
                    <tr
                      key={row.rowKey}
                      className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                    >
                      <td className="whitespace-nowrap px-4 py-2 text-zinc-800 dark:text-zinc-200">
                        {row.book_in_no}
                      </td>
                      <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                        {row.description}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-zinc-800 dark:text-zinc-200">
                        {formatGridQtyOrUnitPrice(row.qty)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-zinc-800 dark:text-zinc-200">
                        {row.unit_price}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <button
                          type="button"
                          onClick={() => handleRemoveCrnLine(row.rowKey)}
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
              onClick={handleCreateCreditNoteClick}
              disabled={creatingCreditNote}
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              CREATE CREDIT NOTE
            </button>
          </div>
        </>
      ) : null}

      {createConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-credit-note-confirm-title"
            className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h3
              id="create-credit-note-confirm-title"
              className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Confirm that the Details are correct..
            </h3>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={handleCreateConfirmNo}
                disabled={creatingCreditNote}
                className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                No, Wait
              </button>
              <button
                type="button"
                onClick={handleCreateCreditNoteOnly}
                disabled={creatingCreditNote}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creatingCreditNote ? "Creating…" : "Create Only"}
              </button>
              <button
                type="button"
                onClick={handleCreateCreditNoteAndPrint}
                disabled={creatingCreditNote}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creatingCreditNote ? "Creating…" : "Create and Print"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
