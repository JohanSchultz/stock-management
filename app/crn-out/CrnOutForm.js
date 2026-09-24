"use client";

import { SupplierSelect } from "@/components/SupplierSelect";
import {
  formatGridQtyOrUnitPrice,
  isQtyOrUnitPriceColumnKey,
} from "@/lib/format/gridNumberFormat";
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
  const [supplierId, setSupplierId] = useState("");
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
  const [error, setError] = useState("");

  const showComments = Boolean(revenueAccountId && supplierId);
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

  const loadBookingsInGrid = useCallback(async (selectedSupplierId) => {
    const parsedSupplierId = parseInteger(selectedSupplierId);
    if (!selectedSupplierId || parsedSupplierId == null) {
      setBookingInRows([]);
      setCrnLineItems([]);
      clearBookingInDetailFields({
        setSelectedBookingInRowKey,
        setBookInNo,
        setProduct,
        setQty,
        setUnitPrice,
      });
      return;
    }

    setCrnLineItems([]);
    clearBookingInDetailFields({
      setSelectedBookingInRowKey,
      setBookInNo,
      setProduct,
      setQty,
      setUnitPrice,
    });
    setBookingsInGridLoading(true);

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc("pr__crn_booking_ins", {
        p_customer_id: parsedSupplierId,
      });
      if (rpcError) throw rpcError;

      setBookingInRows(normalizeBookingInRows(data));
    } catch (err) {
      setBookingInRows([]);
      setError(err.message ?? "Failed to load bookings in");
    } finally {
      setBookingsInGridLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRevenueAccounts();
  }, [loadRevenueAccounts]);

  useEffect(() => {
    if (!supplierId) {
      setBookingInRows([]);
      return;
    }

    loadBookingsInGrid(supplierId);
  }, [supplierId, loadBookingsInGrid]);

  function handleSupplierChange(nextSupplierId) {
    setSupplierId(nextSupplierId);
    setError("");
    if (!nextSupplierId) {
      setComments("");
      setBookingInRows([]);
      setCrnLineItems([]);
      clearBookingInDetailFields({
        setSelectedBookingInRowKey,
        setBookInNo,
        setProduct,
        setQty,
        setUnitPrice,
      });
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

      <SupplierSelect
        value={supplierId}
        onChange={handleSupplierChange}
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
          <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
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

          <div className="mt-4 flex max-w-5xl flex-wrap items-end gap-3">
            <label className="flex w-28 shrink-0 flex-col gap-1">
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
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1 sm:max-w-md">
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
            <label className="flex w-24 shrink-0 flex-col gap-1 sm:w-28">
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
            <label className="flex w-28 shrink-0 flex-col gap-1 sm:w-32">
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
            {showTopAddButton ? (
              <button
                type="button"
                onClick={handleAddBookingInLine}
                className={addButtonClassName}
              >
                Add
              </button>
            ) : null}
          </div>

          <div className="mt-3 flex max-w-5xl flex-wrap items-end gap-3">
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1 sm:max-w-2xl">
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
            <label className="flex w-28 shrink-0 flex-col gap-1 sm:w-32">
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
            {showBottomAddButton ? (
              <button
                type="button"
                onClick={handleAddOtherItemLine}
                className={addButtonClassName}
              >
                Add
              </button>
            ) : null}
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
        </>
      ) : null}
    </div>
  );
}
