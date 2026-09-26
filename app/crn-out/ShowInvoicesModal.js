"use client";

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

const filterLabelClassName =
  "text-xs font-medium text-zinc-700 dark:text-zinc-300";

const filterInputClassName =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

const filterSearchLinkClassName =
  "shrink-0 self-end pb-1 text-xs font-medium text-sky-700 underline hover:text-sky-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-sky-400 dark:hover:text-sky-300";

const readOnlyInputClassName =
  "rounded border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-800 read-only:cursor-default dark:border-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-200";

const editableInputClassName =
  "rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

const addButtonClassName =
  "shrink-0 rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500";

const creditButtonClassName =
  "shrink-0 rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-400 dark:bg-orange-600 dark:hover:bg-orange-500";

const creditEntireInvoiceButtonClassName =
  "whitespace-nowrap rounded bg-orange-500 px-2 py-1 text-xs font-medium text-white hover:bg-orange-400 dark:bg-orange-600 dark:hover:bg-orange-500";

/** Scroll body heights (~py-2 data rows; header stays fixed above scroll). */
const INVOICES_SCROLL_BODY_MAX_HEIGHT = "max-h-[8rem]";
const LINE_ITEMS_SCROLL_BODY_MAX_HEIGHT = "max-h-[5.25rem]";

function normalizeGridRows(data, rowKeyPrefix) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => {
    const invoiceNumber = row.invoice_number ?? row.invoiceNumber;
    const rowId = row.id ?? invoiceNumber;
    return {
      ...row,
      rowKey:
        rowId != null
          ? `${rowKeyPrefix}-${rowId}`
          : `${rowKeyPrefix}-row-${index}`,
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
  if (key === "invoice_number") return "Invoice Number";
  if (INVOICE_DATE_COLUMN_KEYS.has(key)) {
    return key === "created_at" ? "Date" : key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

function getInvoiceNumberFromRow(row) {
  const value = row.invoice_number ?? row.invoiceNumber;
  if (value == null || value === "") return "";
  return String(value);
}

function getInvoiceHeaderIdFromRow(row) {
  if (row.id == null || row.id === "") return "";
  return String(row.id);
}

function parseAmount(value) {
  if (value == null || value === "") return 0;
  const parsed = Number.parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getLineTotalFromRow(row) {
  return row.linetotal ?? row.line_total ?? row.lineTotal;
}

function sumInvoiceLineTotals(lines) {
  return lines.reduce(
    (sum, row) => sum + parseAmount(getLineTotalFromRow(row)),
    0
  );
}

function getLineIdFromRow(row) {
  const value = row.id ?? row.stock_item_id ?? row.stockItemId;
  if (value == null || value === "") return "";
  return String(value);
}

function getLineItemFromRow(row) {
  const value = row.item ?? row.product ?? row.descr ?? row.description;
  if (value == null || value === "") return "";
  return String(value);
}

function getLineQtyRawFromRow(row) {
  const value = row.qty ?? row.quantity ?? row.Qty;
  if (value == null || value === "") return "";
  return String(value);
}

function getLineUnitPriceFromRow(row) {
  const value = row.unit_price ?? row.unitPrice;
  if (value == null || value === "") return "";
  return formatGridCell("unit_price", value);
}

function clearLineDetailFields(setters) {
  setters.setSelectedLineRowKey(null);
  setters.setLineId("");
  setters.setLineInvoiceNumber("");
  setters.setLineItem("");
  setters.setLineQty("");
  setters.setLineUnitPrice("");
}

function getLineInvoiceNumberFromRow(row, fallbackInvoiceNumber = "") {
  const fromRow = getInvoiceNumberFromRow(row);
  if (fromRow) return fromRow;
  return String(fallbackInvoiceNumber ?? "").trim();
}

function DataGrid({
  title,
  columns,
  rows,
  loading,
  emptyMessage,
  selectedRowKey,
  onRowClick,
  scrollBody = false,
  scrollBodyMaxHeight = INVOICES_SCROLL_BODY_MAX_HEIGHT,
  trailingColumn = null,
}) {
  const columnCount = Math.max(columns.length + (trailingColumn ? 1 : 0), 1);

  const headerCells =
    columns.length === 0 && !trailingColumn ? (
      <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
        &nbsp;
      </th>
    ) : (
      <>
        {columns.map((column) => (
          <th
            key={column}
            className="whitespace-nowrap px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300"
          >
            {formatColumnHeader(column)}
          </th>
        ))}
        {trailingColumn ? (
          <th className="whitespace-nowrap px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
            {trailingColumn.header}
          </th>
        ) : null}
      </>
    );

  const tableBody = (
    <tbody>
      {loading ? (
        <tr>
          <td
            colSpan={columnCount}
            className="px-4 py-2 text-zinc-500 dark:text-zinc-400"
          >
            Loading…
          </td>
        </tr>
      ) : rows.length === 0 ? (
        <tr>
          <td
            colSpan={columnCount}
            className="px-4 py-2 text-zinc-500 dark:text-zinc-400"
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
                {formatGridCell(column, row[column])}
              </td>
            ))}
            {trailingColumn ? (
              <td className="whitespace-nowrap px-4 py-2">
                {trailingColumn.render(row)}
              </td>
            ) : null}
          </tr>
        ))
      )}
    </tbody>
  );

  return (
    <>
      <h3 className="mt-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {title}
      </h3>
      <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {scrollBody ? (
          <>
            <table className="w-full min-w-max text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
                <tr>{headerCells}</tr>
              </thead>
            </table>
            <div className={`overflow-y-auto ${scrollBodyMaxHeight}`}>
              <table className="w-full min-w-max text-left text-sm">
                {tableBody}
              </table>
            </div>
          </>
        ) : (
          <table className="w-full min-w-max text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
              <tr>{headerCells}</tr>
            </thead>
            {tableBody}
          </table>
        )}
      </div>
    </>
  );
}

export function ShowInvoicesModal({
  open,
  onClose,
  customerId,
  customerLabel,
  onError,
  onCreditEntireInvoice,
  onCreditLineItem,
}) {
  const [fromDate, setFromDate] = useState(() => currentMonthStartIsoDate());
  const [toDate, setToDate] = useState(() => currentMonthEndIsoDate());
  const [invoiceRows, setInvoiceRows] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [selectedInvoiceRowKey, setSelectedInvoiceRowKey] = useState(null);
  const [selectedInvoiceNumber, setSelectedInvoiceNumber] = useState("");
  const [lineRows, setLineRows] = useState([]);
  const [linesLoading, setLinesLoading] = useState(false);
  const [selectedLineRowKey, setSelectedLineRowKey] = useState(null);
  const [lineId, setLineId] = useState("");
  const [lineInvoiceNumber, setLineInvoiceNumber] = useState("");
  const [lineItem, setLineItem] = useState("");
  const [lineQty, setLineQty] = useState("");
  const [lineUnitPrice, setLineUnitPrice] = useState("");

  const invoiceColumns = useMemo(() => getColumnKeys(invoiceRows), [invoiceRows]);
  const lineColumns = useMemo(() => getColumnKeys(lineRows), [lineRows]);

  const resetModalData = useCallback(() => {
    setFromDate(currentMonthStartIsoDate());
    setToDate(currentMonthEndIsoDate());
    setInvoiceRows([]);
    setSelectedInvoiceRowKey(null);
    setSelectedInvoiceNumber("");
    setLineRows([]);
    setInvoicesLoading(false);
    setLinesLoading(false);
    clearLineDetailFields({
      setSelectedLineRowKey,
      setLineId,
      setLineInvoiceNumber,
      setLineItem,
      setLineQty,
      setLineUnitPrice,
    });
  }, []);

  useEffect(() => {
    if (!open) {
      resetModalData();
    }
  }, [open, resetModalData]);

  const loadInvoiceLines = useCallback(async (invoiceNumber) => {
    const normalizedInvoiceNumber = String(invoiceNumber ?? "").trim();
    if (!normalizedInvoiceNumber) {
      setLineRows([]);
      return [];
    }

    clearLineDetailFields({
      setSelectedLineRowKey,
      setLineId,
      setLineInvoiceNumber,
      setLineItem,
      setLineQty,
      setLineUnitPrice,
    });
    setLinesLoading(true);

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return [];

      const { data, error: rpcError } = await supabase.rpc(
        "pr_invoice_out_lines_by_invno",
        { p_invoice_number: normalizedInvoiceNumber }
      );
      if (rpcError) throw rpcError;

      const lines = normalizeGridRows(data, "invoice-line");
      setLineRows(lines);
      return lines;
    } catch (err) {
      setLineRows([]);
      onError?.(err.message ?? "Failed to load invoice line items");
      return [];
    } finally {
      setLinesLoading(false);
    }
  }, [onError]);

  const loadInvoices = useCallback(async () => {
    const parsedCustomerId = parseInteger(customerId);
    if (parsedCustomerId == null) {
      onError?.("Select a customer before loading invoices.");
      return;
    }

    setSelectedInvoiceRowKey(null);
    setSelectedInvoiceNumber("");
    setLineRows([]);
    clearLineDetailFields({
      setSelectedLineRowKey,
      setLineId,
      setLineInvoiceNumber,
      setLineItem,
      setLineQty,
      setLineUnitPrice,
    });
    setInvoicesLoading(true);

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc(
        "pr_invoice_out_header",
        {
          p_customer_id: parsedCustomerId,
          p_from: fromDate || null,
          p_to: toDate || null,
        }
      );
      if (rpcError) throw rpcError;

      setInvoiceRows(normalizeGridRows(data, "customer-invoice"));
    } catch (err) {
      setInvoiceRows([]);
      onError?.(err.message ?? "Failed to load invoices");
    } finally {
      setInvoicesLoading(false);
    }
  }, [customerId, fromDate, toDate, onError]);

  function handleInvoiceRowClick(row) {
    const invoiceNumber = getInvoiceNumberFromRow(row);
    setSelectedInvoiceRowKey(row.rowKey);
    setSelectedInvoiceNumber(invoiceNumber);
    loadInvoiceLines(invoiceNumber);
  }

  function handleLineRowClick(row) {
    setSelectedLineRowKey(row.rowKey);
    setLineId(getLineIdFromRow(row));
    setLineInvoiceNumber(
      getLineInvoiceNumberFromRow(row, selectedInvoiceNumber)
    );
    setLineItem(getLineItemFromRow(row));
    setLineQty(getLineQtyRawFromRow(row));
    setLineUnitPrice(getLineUnitPriceFromRow(row));
  }

  function handleAddCreditItem() {
    const normalizedInvoiceNumber = String(lineInvoiceNumber ?? "").trim();
    const normalizedId = String(lineId ?? "").trim();
    const normalizedItem = String(lineItem ?? "").trim();
    const normalizedQty = String(lineQty ?? "").trim();
    const normalizedUnitPrice = String(lineUnitPrice ?? "").trim();

    if (!normalizedId && !normalizedItem) {
      onError?.("Select a line item before adding.");
      return;
    }
    if (!normalizedQty) {
      onError?.("Enter a quantity.");
      return;
    }

    const qtyNum = parseAmount(normalizedQty);
    const unitPriceNum = parseAmount(normalizedUnitPrice);
    const linePrice = qtyNum * unitPriceNum;

    onCreditLineItem?.({
      itemId: normalizedId,
      invoiceNumber: normalizedInvoiceNumber,
      item: normalizedItem,
      qty: normalizedQty,
      linePrice,
    });
    onClose?.();
  }

  const handleCreditEntireInvoice = useCallback(
    async (row) => {
      const invoiceNumber = getInvoiceNumberFromRow(row);
      const invoiceHeaderId = getInvoiceHeaderIdFromRow(row);

      if (!invoiceNumber) {
        onError?.("Invoice number is missing for this row.");
        return;
      }

      setSelectedInvoiceRowKey(row.rowKey);
      setSelectedInvoiceNumber(invoiceNumber);

      const lines = await loadInvoiceLines(invoiceNumber);
      if (lines.length === 0) {
        onError?.("No line items on this invoice.");
        return;
      }

      const lineTotalSum = sumInvoiceLineTotals(lines);

      onCreditEntireInvoice?.({
        invoiceId: invoiceHeaderId,
        invoiceNumber,
        lineTotalSum,
      });
      onClose?.();
    },
    [loadInvoiceLines, onClose, onCreditEntireInvoice, onError]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="show-invoices-title"
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2
            id="show-invoices-title"
            className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Invoices for {customerLabel || "Customer"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4">
          <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <div className="flex flex-wrap items-end gap-2 p-2">
              <div className="flex flex-wrap items-end gap-2 rounded-md bg-zinc-100 p-2 dark:bg-zinc-800/60">
                <label className="flex flex-col gap-0.5">
                  <span className={filterLabelClassName}>From</span>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className={filterInputClassName}
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className={filterLabelClassName}>To</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className={filterInputClassName}
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={loadInvoices}
                disabled={invoicesLoading}
                className={filterSearchLinkClassName}
                aria-label="Search invoices"
              >
                {">>"}
              </button>
            </div>

            <div className="border-t border-zinc-200 px-4 pb-4 dark:border-zinc-800">
              <DataGrid
                title="Invoices"
                columns={invoiceColumns}
                rows={invoiceRows}
                loading={invoicesLoading}
                emptyMessage="No invoices found."
                selectedRowKey={selectedInvoiceRowKey}
                onRowClick={handleInvoiceRowClick}
                scrollBody
                trailingColumn={{
                  header: "",
                  render: (row) => (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleCreditEntireInvoice(row);
                      }}
                      className={creditEntireInvoiceButtonClassName}
                    >
                      Credit Entire Invoice
                    </button>
                  ),
                }}
              />
              <DataGrid
                title="Line Items"
                columns={lineColumns}
                rows={lineRows}
                loading={linesLoading}
                emptyMessage="Select an invoice to load line items."
                selectedRowKey={selectedLineRowKey}
                onRowClick={handleLineRowClick}
                scrollBody
                scrollBodyMaxHeight={LINE_ITEMS_SCROLL_BODY_MAX_HEIGHT}
              />
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="flex w-20 flex-col gap-1">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    id
                  </span>
                  <input
                    type="text"
                    name="line_item_id"
                    value={lineId}
                    readOnly
                    tabIndex={-1}
                    className={`${readOnlyInputClassName} w-full`}
                  />
                </label>
                <label className="flex w-28 flex-col gap-1">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Invoice Number
                  </span>
                  <input
                    type="text"
                    name="line_invoice_number"
                    value={lineInvoiceNumber}
                    readOnly
                    tabIndex={-1}
                    className={`${readOnlyInputClassName} w-full`}
                  />
                </label>
                <label className="flex min-w-[8rem] flex-1 flex-col gap-1 sm:max-w-xs">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Item
                  </span>
                  <input
                    type="text"
                    name="line_item"
                    value={lineItem}
                    readOnly
                    tabIndex={-1}
                    className={`${readOnlyInputClassName} w-full`}
                  />
                </label>
                <label className="flex w-24 flex-col gap-1">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Qty
                  </span>
                  <input
                    type="number"
                    name="line_qty"
                    step="any"
                    inputMode="decimal"
                    min={0}
                    value={lineQty}
                    onChange={(e) => setLineQty(e.target.value)}
                    className={`${editableInputClassName} w-full`}
                  />
                </label>
                <label className="flex w-28 flex-col gap-1">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Unit Price
                  </span>
                  <input
                    type="text"
                    name="line_unit_price"
                    value={lineUnitPrice}
                    readOnly
                    tabIndex={-1}
                    className={`${readOnlyInputClassName} w-full`}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleAddCreditItem}
                  className={`${addButtonClassName} invisible`}
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={handleAddCreditItem}
                  className={creditButtonClassName}
                >
                  Credit
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
