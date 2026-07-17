"use client";

import { StockItemLookupFields } from "@/components/StockItemLookupFields";
import {
  getSessionUser,
  isFetchFailure,
  redirectToLogin,
  refreshSupabaseSession,
  sessionUserLabel,
} from "@/lib/supabase/browserSession";
import { createClient } from "@/lib/supabase/client";
import {
  prepareSupabaseClient,
  useSupabaseIdleRecovery,
} from "@/lib/supabase/useSupabaseIdleRecovery";
import { consumeCorrectionBookingInId, storeCorrectionBookingOutId } from "@/lib/bookingCorrection";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

const readOnlyInputClassName =
  "rounded border border-zinc-300 bg-zinc-50 px-3 py-2 text-zinc-800 read-only:cursor-default dark:border-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-200";

const ordersNotFullyDeliveredHighlightInputClassName =
  "rounded border border-zinc-300 bg-yellow-100 px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-yellow-900/30 dark:text-zinc-200";

const ordersNotFullyDeliveredHighlightReadOnlyInputClassName =
  "rounded border border-zinc-300 bg-yellow-100 px-3 py-2 text-zinc-800 read-only:cursor-default dark:border-zinc-600 dark:bg-yellow-900/30 dark:text-zinc-200";

const correctionHighlightInputClassName =
  "rounded border border-zinc-300 bg-orange-100 px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-orange-900/30 dark:text-zinc-200";

const correctionHighlightReadOnlyInputClassName =
  "rounded border border-zinc-300 bg-orange-100 px-3 py-2 text-zinc-800 read-only:cursor-default dark:border-zinc-600 dark:bg-orange-900/30 dark:text-zinc-200";

const SELECT_PLACEHOLDER = " -SELECT- ";
const DELETE_CONFIRM_MESSAGE = "Please Confirn To Delete The Selected Entry";

const ORDERS_NOT_FULLY_DELIVERED_HIDDEN_COLUMNS = new Set([
  "customer_id",
  "stock_item_id",
  "qty_on_hand",
  "qty_reserved",
  "unit_price",
  "comments",
  "booking_out_type_id",
  "return_reason_id",
]);

const GRID_FILTER_ALL = "all";
const GRID_FILTER_BY_STOCK_CODE = "byStockCode";
const GRID_FILTER_LAST_THREE_MONTHS = "lastThreeMonths";

function todayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toIsoDate(value) {
  if (!value) return todayIsoDate();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return todayIsoDate();
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toOptions(data) {
  return Array.isArray(data) ? data : [];
}

function optionLabel(option) {
  return (
    option.descr ?? option.customer ?? option.description ?? option.name ?? ""
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

function parseFloatValue(value) {
  if (value === "" || value == null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function computeTotalPrice(quantityValue, unitPriceValue) {
  const qty = parseFloatValue(quantityValue);
  const unitPrice = parseFloatValue(unitPriceValue);
  if (qty == null || unitPrice == null) return "";
  return (qty * unitPrice).toFixed(2);
}

function computeOrderItemTotalPrice(qtyReserved, qtyDelivered, unitPriceValue) {
  const unitPrice = parseFloatValue(unitPriceValue);
  if (unitPrice == null) return "";
  const reserved = parseFloatValue(qtyReserved) ?? 0;
  const delivered = parseFloatValue(qtyDelivered) ?? 0;
  if (
    reserved === 0 &&
    delivered === 0 &&
    (qtyReserved === "" || qtyReserved == null) &&
    (qtyDelivered === "" || qtyDelivered == null)
  ) {
    return "";
  }
  return ((reserved + delivered) * unitPrice).toFixed(2);
}

function computeOrdersNotFullyDeliveredTotalPrice(
  quantityValue,
  qtyReservedValue,
  unitPriceValue
) {
  const unitPrice = parseFloatValue(unitPriceValue);
  if (unitPrice == null) return "";
  const qty =
    quantityValue === "" || quantityValue == null
      ? 0
      : (parseFloatValue(quantityValue) ?? 0);
  const qtyReserved = parseFloatValue(qtyReservedValue) ?? 0;
  return ((qty + qtyReserved) * unitPrice).toFixed(2);
}

function formatUnitPrice(value) {
  if (value == null || value === "") return "";
  return String(value);
}

function formatGridQtyToBookOut(value) {
  if (value == null || value === "") return "0";
  return String(value);
}

function isSameStockItemId(left, right) {
  if (left == null || right == null) return false;
  return String(left) === String(right);
}

async function resolveUnitPriceForStockItem(supabase, row) {
  if (row.unit_price != null) {
    return formatUnitPrice(row.unit_price);
  }

  const stockId = row.id ?? row.stock_item_id;
  if (stockId == null) return "";

  const { data, error } = await supabase.rpc("pr_stock_item_all");
  if (error) throw error;

  const match = (Array.isArray(data) ? data : []).find((item) =>
    isSameStockItemId(item.id ?? item.stock_item_id, stockId)
  );

  return formatUnitPrice(match?.unit_price);
}

function isNonZeroInteger(value) {
  const parsed = parseInteger(value);
  return parsed != null && parsed !== 0;
}

function RequiredMarker() {
  return (
    <span className="text-red-600 dark:text-red-400" aria-hidden="true">
      {" "}
      *
    </span>
  );
}

function showsReturnReason(bookingOutTypeLabel) {
  const label = bookingOutTypeLabel.trim();
  return label === "Returned" || label === "Credit";
}

function findBookingOutTypeIdByLabel(options, label) {
  const normalizedLabel = label.trim().toLowerCase();
  const match = options.find(
    (option) => optionLabel(option).trim().toLowerCase() === normalizedLabel
  );
  return match ? optionValue(match) : "";
}

function subtractFloatValues(minuend, subtrahend) {
  const left = parseFloatValue(minuend) ?? 0;
  const right = parseFloatValue(subtrahend) ?? 0;
  return left - right;
}

const BOOKING_OUT_GRID_COLUMN_COUNT = 8;

const ORDER_BOOKING_OUT_VISIBLE_COLUMNS = [
  "stock_code",
  "descr",
  "qty_reserved",
  "qty_delivered",
];

function formatBookingOutColumnHeader(key) {
  const normalized = key.trim().toLowerCase();
  if (normalized === "id") return "No.";
  if (normalized === "qty") return "Qty Booked Out";
  if (normalized === "booked_out_date") return "Date";
  if (normalized === "has_corrections") return "Has Corrections";

  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatBookingOutCellValue(value, column, row = null) {
  if (column.trim().toLowerCase() === "has_corrections") {
    return formatHasCorrectionsValue(row?.contra_id);
  }
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (
    column.toLowerCase().includes("date") &&
    (typeof value === "string" || value instanceof Date)
  ) {
    return toIsoDate(value);
  }
  return String(value);
}

function getOrderBookingOutColumnKeys(rows) {
  const keys = new Set();
  const keyByLower = new Map();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key !== "rowKey") {
        keys.add(key);
        keyByLower.set(key.trim().toLowerCase(), key);
      }
    }
  }

  const ordered = [];
  for (const column of ORDER_BOOKING_OUT_VISIBLE_COLUMNS) {
    const actualKey = keyByLower.get(column);
    if (actualKey) {
      ordered.push(actualKey);
      keys.delete(actualKey);
    }
  }

  return [...ordered, ...Array.from(keys)];
}

function isOrderBookingOutHiddenColumn(column) {
  return !ORDER_BOOKING_OUT_VISIBLE_COLUMNS.includes(
    column.trim().toLowerCase()
  );
}

function formatOrderBookingOutColumnHeader(key) {
  const normalized = key.trim().toLowerCase();
  if (normalized === "stock_code") return "Stock Code";
  if (normalized === "descr") return "Description";
  if (normalized === "qty_reserved") return "Qty Reserved";
  if (normalized === "qty_delivered") return "Qty Delivered";

  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatOrderBookingOutCellValue(value, column) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (
    column.toLowerCase().includes("date") &&
    (typeof value === "string" || value instanceof Date)
  ) {
    return toIsoDate(value);
  }
  return String(value);
}

function reportBackgroundLoadError(context, err, setError) {
  if (isFetchFailure(err)) {
    console.warn(`${context}: network error after idle or offline`, err);
    return;
  }

  setError(err.message ?? context);
}

function normalizeOrderBookingOutRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    id: row.id ?? null,
    stock_item_id: row.stock_item_id ?? null,
    stock_code: row.stock_code ?? "",
    descr: row.descr ?? row.description ?? "",
    qty_reserved: row.qty_reserved ?? null,
    qty_delivered: row.qty_delivered ?? null,
    unit_price: row.unit_price ?? null,
    rowKey:
      row.id != null
        ? `order-booking-out-${row.id}`
        : `order-booking-out-row-${index}-${row.stock_code ?? "unknown"}`,
  }));
}

function normalizeOrdersNotFullyDeliveredRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    book_out_id: row.book_out_id ?? row.book_in_id ?? row.id ?? null,
    stock_code: row.stock_code ?? "",
    description: row.description ?? row.descr ?? "",
    order_out_id: row.order_out_id ?? row.order_in_id ?? null,
    customer_id: row.customer_id ?? row.supplier_id ?? null,
    customer: row.customer ?? row.supplier ?? "",
    date_placed: row.date_placed ?? null,
    action_user: row.action_user ?? "",
    qty_on_hand: row.qty_on_hand ?? null,
    qty_reserved: row.qty_reserved ?? row.qty_on_order ?? null,
    unit_price: row.unit_price ?? null,
    stock_item_id: row.stock_item_id ?? null,
    booking_out_type_id:
      row.booking_out_type_id ?? row.booking_in_type_id ?? null,
    return_reason_id: row.return_reason_id ?? null,
    comments: row.comments ?? "",
    rowKey:
      row.book_out_id != null
        ? `orders-not-fully-delivered-${row.book_out_id}`
        : row.id != null
          ? `orders-not-fully-delivered-${row.id}`
          : `orders-not-fully-delivered-row-${index}`,
  }));
}

function getOrdersNotFullyDeliveredColumnKeys(rows) {
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

function isOrdersNotFullyDeliveredHiddenColumn(column) {
  return ORDERS_NOT_FULLY_DELIVERED_HIDDEN_COLUMNS.has(
    column.trim().toLowerCase()
  );
}

function formatOrdersNotFullyDeliveredColumnHeader(key) {
  const normalized = key.trim().toLowerCase();
  if (normalized === "book_out_id") return "Book Out No.";
  if (normalized === "order_out_id") return "Order Out No.";

  return formatBookingOutColumnHeader(key);
}

function formatOrdersNotFullyDeliveredCellValue(value, column) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (
    column.toLowerCase().includes("date") &&
    (typeof value === "string" || value instanceof Date)
  ) {
    return toIsoDate(value);
  }
  return String(value);
}

function normalizeOrdersOutRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    id: row.id ?? null,
    customer_id: row.customer_id ?? null,
    customer: row.customer ?? "",
    date_placed: row.date_placed ?? null,
    order_status_id: row.order_status_id ?? null,
    status: row.status ?? "",
    comments: row.comments ?? "",
    action_user: row.action_user ?? "",
    rowKey:
      row.id != null
        ? `orders-out-${row.id}`
        : `orders-out-row-${index}-${row.customer ?? "unknown"}`,
  }));
}

function formatHasCorrectionsValue(contraId) {
  return contraId == null ? "No" : "Yes";
}

function normalizeOrderOutCorrectionsRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    rowKey:
      row.id != null
        ? `order-out-correction-${row.id}`
        : `order-out-correction-row-${index}`,
  }));
}

function getOrderOutCorrectionsColumnKeys(rows) {
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

function formatOrderOutCorrectionsCellValue(value, column) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (
    column.toLowerCase().includes("date") &&
    (typeof value === "string" || value instanceof Date)
  ) {
    return toIsoDate(value);
  }
  return String(value);
}

function formatOrderOutCorrectionsColumnHeader(key) {
  const normalized = key.trim().toLowerCase();
  if (normalized === "id") return "Booking In No";
  if (normalized === "contra_id") return "Booking Out No";

  return formatBookingOutColumnHeader(key);
}

function normalizeBookingOutRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    id: row.id ?? row.booking_out_id ?? null,
    stock_item_id: row.stock_item_id ?? null,
    stock_code: row.stock_code ?? "",
    description: row.description ?? row.descr ?? "",
    stock_item: row.stock_item ?? row.descr ?? "",
    qty: row.qty ?? row.quantity ?? null,
    qty_reserved: row.qty_reserved ?? null,
    booked_out_type:
      row.booked_out_type ??
      row.booking_out_type ??
      row.booking_out_type_descr ??
      "",
    unit_price: row.unit_price ?? row.unitPrice ?? null,
    booked_out_date: row.booked_out_date ?? row.booking_date ?? null,
    supplier_id: row.supplier_id ?? null,
    booking_out_type_id: row.booking_out_type_id ?? null,
    return_reason_id: row.return_reason_id ?? null,
    comments: row.comments ?? "",
    action_user: row.action_user ?? "",
    contra_id: row.contra_id ?? null,
    has_corrections: formatHasCorrectionsValue(row.contra_id),
    rowKey:
      row.id != null
        ? `booking-out-${row.id}`
        : `booking-out-row-${index}-${row.stock_code ?? "unknown"}`,
  }));
}

export function BookingOutForm({ variant = "booking-out" } = {}) {
  useSupabaseIdleRecovery();
  const router = useRouter();

  const isOrdersOut = variant === "orders-out";
  const numberFieldLabel = isOrdersOut ? "Order Out Number" : "Book Out Number";

  const [stockCode, setStockCode] = useState("");
  const [description, setDescription] = useState("");
  const [stockItemId, setStockItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [qtyReserved, setQtyReserved] = useState("");
  const [qtyDelivered, setQtyDelivered] = useState("");
  const [orderItemId, setOrderItemId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [bookingDate, setBookingDate] = useState(todayIsoDate);
  const [bookingOutTypeId, setBookingOutTypeId] = useState("");
  const [bookingOutTypeOptions, setBookingOutTypeOptions] = useState([]);
  const [bookingOutTypesLoading, setBookingOutTypesLoading] = useState(false);
  const [formCustomerId, setFormCustomerId] = useState("");
  const [customerOptions, setCustomerOptions] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [orderStatusId, setOrderStatusId] = useState("");
  const [orderStatusOptions, setOrderStatusOptions] = useState([]);
  const [orderStatusesLoading, setOrderStatusesLoading] = useState(false);
  const [returnReasonId, setReturnReasonId] = useState("");
  const [returnReasonOptions, setReturnReasonOptions] = useState([]);
  const [returnReasonsLoading, setReturnReasonsLoading] = useState(false);
  const [comments, setComments] = useState("");
  const [bookingOutId, setBookingOutId] = useState("");
  const [bookingOutRows, setBookingOutRows] = useState([]);
  const [orderBookingOutRows, setOrderBookingOutRows] = useState([]);
  const [selectedOrderItemId, setSelectedOrderItemId] = useState(null);
  const [
    ordersNotFullyDeliveredExpanded,
    setOrdersNotFullyDeliveredExpanded,
  ] = useState(false);
  const [ordersNotFullyDeliveredRows, setOrdersNotFullyDeliveredRows] =
    useState([]);
  const [
    ordersNotFullyDeliveredGridLoading,
    setOrdersNotFullyDeliveredGridLoading,
  ] = useState(false);
  const [ordersNotFullyDeliveredSelected, setOrdersNotFullyDeliveredSelected] =
    useState(false);
  const [
    selectedOrdersNotFullyDeliveredRowKey,
    setSelectedOrdersNotFullyDeliveredRowKey,
  ] = useState(null);
  const [orderNumber, setOrderNumber] = useState("");
  const [correctionMode, setCorrectionMode] = useState(false);
  const [correctionBookingInId, setCorrectionBookingInId] = useState("");
  const [correctionOriginalQty, setCorrectionOriginalQty] = useState("");
  const [correctionOriginalQtyOnOrder, setCorrectionOriginalQtyOnOrder] =
    useState("");
  const [formSupplierId, setFormSupplierId] = useState("");
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [gridFilter, setGridFilter] = useState(GRID_FILTER_ALL);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [gridLoading, setGridLoading] = useState(false);
  const [orderItemsGridLoading, setOrderItemsGridLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [itemsExpanded, setItemsExpanded] = useState(false);
  const [orderItemEditMode, setOrderItemEditMode] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [correctionsOpen, setCorrectionsOpen] = useState(false);
  const [correctionsBookingOutId, setCorrectionsBookingOutId] = useState(null);
  const [correctionsRows, setCorrectionsRows] = useState([]);
  const [correctionsLoading, setCorrectionsLoading] = useState(false);
  const [correctionsError, setCorrectionsError] = useState("");
  const [actionUser, setActionUser] = useState("");
  const [recordActionUser, setRecordActionUser] = useState("");
  const [selectedBookedOutTypeLabel, setSelectedBookedOutTypeLabel] =
    useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const totalPrice = useMemo(() => {
    if (isOrdersOut) {
      return computeOrderItemTotalPrice(quantity, qtyDelivered, unitPrice);
    }
    if (ordersNotFullyDeliveredSelected || correctionMode) {
      return computeOrdersNotFullyDeliveredTotalPrice(
        quantity,
        qtyReserved,
        unitPrice
      );
    }
    return computeTotalPrice(quantity, unitPrice);
  }, [
    isOrdersOut,
    ordersNotFullyDeliveredSelected,
    correctionMode,
    quantity,
    qtyReserved,
    qtyDelivered,
    unitPrice,
  ]);

  const orderBookingOutColumns = useMemo(
    () => getOrderBookingOutColumnKeys(orderBookingOutRows),
    [orderBookingOutRows]
  );

  const ordersNotFullyDeliveredColumns = useMemo(
    () => getOrdersNotFullyDeliveredColumnKeys(ordersNotFullyDeliveredRows),
    [ordersNotFullyDeliveredRows]
  );

  const orderOutCorrectionsColumns = useMemo(
    () => getOrderOutCorrectionsColumnKeys(correctionsRows),
    [correctionsRows]
  );

  const loadBookingOutTypes = useCallback(async () => {
    setBookingOutTypesLoading(true);
    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc(
        "pr_booking_out_types_active"
      );
      if (rpcError) throw rpcError;
      setBookingOutTypeOptions(toOptions(data));
    } catch (err) {
      reportBackgroundLoadError("Failed to load book-out types", err, setError);
    } finally {
      setBookingOutTypesLoading(false);
    }
  }, []);

  const loadOrderStatuses = useCallback(async () => {
    setOrderStatusesLoading(true);
    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const user = await getSessionUser(supabase);
      if (!user?.id) {
        setOrderStatusOptions([]);
        return;
      }

      const { data, error: rpcError } = await supabase.rpc("pr_order_status", {
        p_user_id: user.id,
      });
      if (rpcError) throw rpcError;
      setOrderStatusOptions(toOptions(data));
    } catch (err) {
      reportBackgroundLoadError("Failed to load order statuses", err, setError);
      setOrderStatusOptions([]);
    } finally {
      setOrderStatusesLoading(false);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true);
    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc("pr_customer_active");
      if (rpcError) throw rpcError;
      setCustomerOptions(normalizeCustomerOptions(data));
    } catch (err) {
      reportBackgroundLoadError("Failed to load customers", err, setError);
      setCustomerOptions([]);
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  const loadReturnReasons = useCallback(async () => {
    setReturnReasonsLoading(true);
    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc(
        "pr_return_reasons_active"
      );
      if (rpcError) throw rpcError;
      setReturnReasonOptions(toOptions(data));
    } catch (err) {
      reportBackgroundLoadError("Failed to load return reasons", err, setError);
    } finally {
      setReturnReasonsLoading(false);
    }
  }, []);

  const loadBookingOutRows = useCallback(async (override = {}) => {
    const filter = override.filter ?? gridFilter;
    const searchCode = (
      override.stockCode !== undefined ? override.stockCode : stockCode
    ).trim();
    setGridLoading(true);

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      let data;
      let rpcError;

      if (filter === GRID_FILTER_BY_STOCK_CODE) {
        if (!searchCode) {
          setBookingOutRows([]);
          return;
        }

        ({ data, error: rpcError } = await supabase.rpc(
          "pr_booking_out_by_stock_code",
          { p_stock_code: searchCode }
        ));
      } else if (filter === GRID_FILTER_LAST_THREE_MONTHS) {
        ({ data, error: rpcError } = await supabase.rpc(
          "pr_booking_out_last_three_months"
        ));
      } else {
        ({ data, error: rpcError } = await supabase.rpc("pr_booking_out_all"));
      }

      if (rpcError) throw rpcError;
      setBookingOutRows(normalizeBookingOutRows(data));
    } catch (err) {
      reportBackgroundLoadError(
        "Failed to load booking out records",
        err,
        setError
      );
      setBookingOutRows([]);
    } finally {
      setGridLoading(false);
    }
  }, [gridFilter, stockCode]);

  const loadOrdersOutRows = useCallback(async (overrideCustomerId) => {
    setGridLoading(true);

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const customerParam =
        overrideCustomerId !== undefined ? overrideCustomerId : formCustomerId;
      const pCustomerId = parseInteger(customerParam) ?? 0;

      const { data, error: rpcError } = await supabase.rpc(
        "pr_orders_out_by_customer",
        { p_customer_id: pCustomerId }
      );
      if (rpcError) throw rpcError;
      setBookingOutRows(normalizeOrdersOutRows(data));
    } catch (err) {
      reportBackgroundLoadError("Failed to load orders out records", err, setError);
      setBookingOutRows([]);
    } finally {
      setGridLoading(false);
    }
  }, [formCustomerId]);

  const loadOrderBookingOutRows = useCallback(async (ordersOutId) => {
    const id = parseInteger(ordersOutId);
    if (id == null) {
      setOrderBookingOutRows([]);
      setOrderItemEditMode(false);
      return;
    }

    setOrderItemsGridLoading(true);

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc(
        "pr_order_booking_out",
        { p_orders_out_id: id }
      );
      if (rpcError) throw rpcError;
      setOrderBookingOutRows(normalizeOrderBookingOutRows(data));
      setOrderItemEditMode(false);
    } catch (err) {
      reportBackgroundLoadError("Failed to load order items", err, setError);
      setOrderBookingOutRows([]);
      setOrderItemEditMode(false);
    } finally {
      setOrderItemsGridLoading(false);
    }
  }, []);

  const loadOrdersNotFullyDeliveredRows = useCallback(async () => {
    setOrdersNotFullyDeliveredGridLoading(true);

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc(
        "pr_orders_not_fully_delivered"
      );
      if (rpcError) throw rpcError;
      setOrdersNotFullyDeliveredRows(
        normalizeOrdersNotFullyDeliveredRows(data)
      );
    } catch (err) {
      reportBackgroundLoadError(
        "Failed to load orders not fully delivered",
        err,
        setError
      );
      setOrdersNotFullyDeliveredRows([]);
    } finally {
      setOrdersNotFullyDeliveredGridLoading(false);
    }
  }, []);

  const loadActionUser = useCallback(async () => {
    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const user = await getSessionUser(supabase);
      const label = sessionUserLabel(user);
      setActionUser(label);
      setRecordActionUser((current) => (current === "" ? label : current));
    } catch (err) {
      reportBackgroundLoadError("Failed to load signed-in user", err, setError);
    }
  }, []);

  useEffect(() => {
    if (!isOrdersOut || editMode || !actionUser) return;
    setRecordActionUser(actionUser);
  }, [isOrdersOut, editMode, actionUser]);

  useEffect(() => {
    if (isOrdersOut) {
      loadOrderStatuses();
    } else {
      loadBookingOutTypes();
      loadReturnReasons();
    }
    loadCustomers();
    loadActionUser();
  }, [
    isOrdersOut,
    loadBookingOutTypes,
    loadOrderStatuses,
    loadCustomers,
    loadReturnReasons,
    loadActionUser,
  ]);

  useEffect(() => {
    if (isOrdersOut) return;
    if (
      gridFilter === GRID_FILTER_ALL ||
      gridFilter === GRID_FILTER_LAST_THREE_MONTHS
    ) {
      loadBookingOutRows({ filter: gridFilter });
    }
  }, [gridFilter, loadBookingOutRows, isOrdersOut]);

  useEffect(() => {
    if (isOrdersOut) return;
    if (gridFilter === GRID_FILTER_BY_STOCK_CODE) {
      loadBookingOutRows({ filter: gridFilter, stockCode });
    }
  }, [gridFilter, stockCode, loadBookingOutRows, isOrdersOut]);

  useEffect(() => {
    if (isOrdersOut) return;
    loadOrdersNotFullyDeliveredRows();
  }, [isOrdersOut, loadOrdersNotFullyDeliveredRows]);

  useEffect(() => {
    if (isOrdersOut) return;

    const storedId = consumeCorrectionBookingInId();
    if (!storedId) return;

    const bookInId = parseInteger(storedId);
    if (bookInId == null) return;

    loadCorrectionData(bookInId);
  }, [isOrdersOut]);

  useEffect(() => {
    if (!isOrdersOut) return;
    loadOrdersOutRows();
  }, [isOrdersOut, formCustomerId, loadOrdersOutRows]);

  useEffect(() => {
    async function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;

      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      if (isOrdersOut) {
        await loadOrdersOutRows();
      } else {
        await loadBookingOutRows();
        await loadOrdersNotFullyDeliveredRows();
      }
      await loadActionUser();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    isOrdersOut,
    loadBookingOutRows,
    loadOrdersOutRows,
    loadOrdersNotFullyDeliveredRows,
    loadActionUser,
  ]);

  const selectedBookingOutType = bookingOutTypeOptions.find(
    (option) => optionValue(option) === bookingOutTypeId
  );
  const selectedBookingOutTypeLabel = selectedBookingOutType
    ? optionLabel(selectedBookingOutType)
    : "";
  const returnReasonVisible =
    !isOrdersOut && showsReturnReason(selectedBookingOutTypeLabel);

  function clearOrdersNotFullyDeliveredSelection() {
    setOrdersNotFullyDeliveredSelected(false);
    setSelectedOrdersNotFullyDeliveredRowKey(null);
    setOrderNumber("");
    setQtyReserved("");
  }

  function handleOrdersNotFullyDeliveredRowClick(row) {
    setCorrectionMode(false);
    setCorrectionBookingInId("");
    setCorrectionOriginalQty("");
    setCorrectionOriginalQtyOnOrder("");
    setFormSupplierId("");

    const bookOutId = row.book_out_id ?? row.id;
    const matchingBookingOutRow = bookingOutRows.find(
      (gridRow) =>
        gridRow.id != null && String(gridRow.id) === String(bookOutId)
    );

    setBookingOutId(bookOutId != null ? String(bookOutId) : "");
    setStockItemId(
      row.stock_item_id != null ? String(row.stock_item_id) : ""
    );
    setStockCode(row.stock_code ?? "");
    setDescription(row.description ?? "");
    setOrderNumber(row.order_out_id != null ? String(row.order_out_id) : "");
    setFormCustomerId(
      row.customer_id != null ? String(row.customer_id) : ""
    );
    setBookingDate(toIsoDate(row.date_placed));
    setRecordActionUser(row.action_user ?? "");
    setQuantity(formatGridQtyToBookOut(row.qty_on_hand));
    setQtyReserved(row.qty_reserved != null ? String(row.qty_reserved) : "");
    setUnitPrice(formatUnitPrice(row.unit_price));
    setBookingOutTypeId(
      row.booking_out_type_id != null
        ? String(row.booking_out_type_id)
        : matchingBookingOutRow?.booking_out_type_id != null
          ? String(matchingBookingOutRow.booking_out_type_id)
          : ""
    );
    setReturnReasonId(
      row.return_reason_id != null
        ? String(row.return_reason_id)
        : matchingBookingOutRow?.return_reason_id != null
          ? String(matchingBookingOutRow.return_reason_id)
          : ""
    );
    setComments(row.comments ?? "");
    setSelectedId(bookOutId ?? null);
    setSelectedBookedOutTypeLabel("");
    setEditMode(true);
    setOrdersNotFullyDeliveredSelected(true);
    setSelectedOrdersNotFullyDeliveredRowKey(row.rowKey);
    setError("");
    setSuccess("");
  }

  async function loadCorrectionData(bookInId) {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data: supplierData, error: supplierError } = await supabase.rpc(
        "pr_suppliers_active"
      );
      if (supplierError) throw supplierError;
      setSupplierOptions(toOptions(supplierData));

      const { data: typeData, error: typeError } = await supabase.rpc(
        "pr_booking_out_types_active"
      );
      if (typeError) throw typeError;
      const bookingOutTypes = toOptions(typeData);
      setBookingOutTypeOptions(bookingOutTypes);

      const { data, error: rpcError } = await supabase.rpc("pr_correction_data", {
        p_booking_in_id: bookInId,
      });
      if (rpcError) throw rpcError;

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        throw new Error("No correction data found.");
      }

      clearOrdersNotFullyDeliveredSelection();
      setCorrectionMode(true);
      setCorrectionBookingInId(
        row.booking_in_id != null ? String(row.booking_in_id) : String(bookInId)
      );
      setOrderNumber(row.order_id != null ? String(row.order_id) : "");
      setStockItemId(
        row.stock_item_id != null ? String(row.stock_item_id) : ""
      );
      setStockCode(row.stock_code ?? "");
      setDescription(row.stock_item ?? row.descr ?? row.description ?? "");
      setQuantity(formatGridQtyToBookOut(row.qty));
      setQtyReserved(row.qty_on_order != null ? String(row.qty_on_order) : "");
      setCorrectionOriginalQty(row.qty != null ? String(row.qty) : "0");
      setCorrectionOriginalQtyOnOrder(
        row.qty_on_order != null ? String(row.qty_on_order) : ""
      );
      setBookingDate(todayIsoDate());
      setUnitPrice(formatUnitPrice(row.unit_price));
      setFormSupplierId(
        row.supplier_id != null ? String(row.supplier_id) : ""
      );
      setBookingOutId("");
      setFormCustomerId("");
      setComments("");
      setBookingOutTypeId(findBookingOutTypeIdByLabel(bookingOutTypes, "Correction"));
      setReturnReasonId("");
      setSelectedId(null);
      setSelectedBookedOutTypeLabel("");
      setEditMode(false);
    } catch (err) {
      setCorrectionMode(false);
      setCorrectionBookingInId("");
      setCorrectionOriginalQty("");
      setCorrectionOriginalQtyOnOrder("");
      setError(err.message ?? "Failed to load correction data");
    } finally {
      setLoading(false);
    }
  }

  function handleBookingOutQuantityChange(nextQuantity) {
    if (!ordersNotFullyDeliveredSelected) {
      setQuantity(nextQuantity);
      return;
    }

    const previousQty = parseFloatValue(quantity);

    if (nextQuantity === "") {
      if (previousQty == null) {
        setQuantity("0");
        return;
      }

      const previousQtyReserved = parseFloatValue(qtyReserved) ?? 0;
      const delta = 0 - previousQty;
      setQuantity("0");
      setQtyReserved(String(previousQtyReserved - delta));
      return;
    }

    const nextQty = parseFloatValue(nextQuantity);

    if (previousQty == null || nextQty == null) {
      setQuantity(nextQuantity);
      return;
    }

    const previousQtyReserved = parseFloatValue(qtyReserved) ?? 0;
    const maxQty = previousQty + previousQtyReserved;
    const clampedQty = Math.min(Math.max(nextQty, 0), maxQty);
    const delta = clampedQty - previousQty;
    const nextQtyReserved = previousQtyReserved - delta;

    setQuantity(clampedQty !== nextQty ? String(clampedQty) : nextQuantity);
    setQtyReserved(String(nextQtyReserved));
  }

  const ordersNotFullyDeliveredMaxQuantity = useMemo(() => {
    if (!ordersNotFullyDeliveredSelected) return undefined;
    const qty = parseFloatValue(quantity);
    const reserved = parseFloatValue(qtyReserved);
    if (qty == null && reserved == null) return undefined;
    return (qty ?? 0) + (reserved ?? 0);
  }, [ordersNotFullyDeliveredSelected, quantity, qtyReserved]);

  const bookingOutHighlightActive =
    !isOrdersOut && ordersNotFullyDeliveredSelected && !correctionMode;
  const correctionHighlightActive = !isOrdersOut && correctionMode;
  const showOrderNumberAndQtyReserved =
    ordersNotFullyDeliveredSelected || correctionMode;
  const bookingOutInputClassName = correctionHighlightActive
    ? correctionHighlightInputClassName
    : bookingOutHighlightActive
      ? ordersNotFullyDeliveredHighlightInputClassName
      : inputClassName;
  const bookingOutReadOnlyInputClassName = correctionHighlightActive
    ? correctionHighlightReadOnlyInputClassName
    : bookingOutHighlightActive
      ? ordersNotFullyDeliveredHighlightReadOnlyInputClassName
      : readOnlyInputClassName;

  const isMainGridOrderBookingOutSelected =
    !isOrdersOut &&
    editMode &&
    !ordersNotFullyDeliveredSelected &&
    selectedBookedOutTypeLabel.trim() === "Order" &&
    (parseFloatValue(qtyReserved) ?? 0) > 0;

  function handleBookingOutTypeChange(nextBookingOutTypeId) {
    if (correctionMode) return;

    setBookingOutTypeId(nextBookingOutTypeId);

    const nextBookingOutType = bookingOutTypeOptions.find(
      (option) => optionValue(option) === nextBookingOutTypeId
    );
    const nextLabel = nextBookingOutType ? optionLabel(nextBookingOutType) : "";

    if (!showsReturnReason(nextLabel)) {
      setReturnReasonId("");
    }
  }

  async function handleStockItemSelect(row) {
    setStockCode(row.stock_code ?? "");
    setDescription(row.stock_item ?? row.descr ?? "");
    setStockItemId(row.id != null ? String(row.id) : "");
    setUnitPrice(formatUnitPrice(row.unit_price));

    if (row.unit_price != null) return;

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const price = await resolveUnitPriceForStockItem(supabase, row);
      setUnitPrice(price);
    } catch (err) {
      reportBackgroundLoadError("Failed to load unit price", err, setError);
    }
  }

  function initializeForm() {
    setStockCode("");
    setDescription("");
    setStockItemId("");
    setQuantity("");
    setQtyReserved("");
    setQtyDelivered("");
    setOrderItemId("");
    setUnitPrice("");
    setBookingDate(todayIsoDate());
    setBookingOutTypeId("");
    setFormCustomerId("");
    setOrderStatusId("");
    setReturnReasonId("");
    setComments("");
    setBookingOutId("");
    setSelectedId(null);
    setSelectedBookedOutTypeLabel("");
    setOrderBookingOutRows([]);
    setSelectedOrderItemId(null);
    setRecordActionUser(isOrdersOut ? actionUser : "");
    setItemsExpanded(false);
    setOrderItemEditMode(false);
    clearOrdersNotFullyDeliveredSelection();
    setCorrectionMode(false);
    setCorrectionBookingInId("");
    setCorrectionOriginalQty("");
    setCorrectionOriginalQtyOnOrder("");
    setFormSupplierId("");
    setEditMode(false);
    setDeleteConfirmOpen(false);
    setError("");
    setSuccess("");
  }

  async function refreshMainBookingOutGrid(override = {}) {
    const filterToReload = override.filter ?? gridFilter;
    const codeToReload =
      override.stockCode !== undefined ? override.stockCode : stockCode.trim();

    await loadBookingOutRows({
      filter: filterToReload,
      stockCode:
        filterToReload === GRID_FILTER_BY_STOCK_CODE ? codeToReload : "",
    });
  }

  async function refreshAfterAction(successMessage) {
    const codeToReload = stockCode.trim();
    const customerToReload = formCustomerId;
    const filterToReload = gridFilter;
    initializeForm();
    setSuccess(successMessage);
    if (isOrdersOut) {
      await loadOrdersOutRows(customerToReload);
    } else {
      await refreshMainBookingOutGrid({
        filter: filterToReload,
        stockCode: codeToReload,
      });
      await loadOrdersNotFullyDeliveredRows();
    }
  }

  async function refreshAfterCorrectionAction(successMessage) {
    const codeToReload = stockCode.trim();
    const filterToReload = gridFilter;
    initializeForm();
    setSuccess(successMessage);
    await refreshMainBookingOutGrid({
      filter: filterToReload,
      stockCode: codeToReload,
    });
  }

  function buildOrderBookingOutPayload() {
    return {
      p_stock_item_id: parseInteger(stockItemId),
      p_qty: parseFloatValue(qtyDelivered),
      p_booked_out_date: bookingDate,
      p_customer_id: parseInteger(formCustomerId),
      p_booking_out_type_id: 6,
      p_action_user: recordActionUser.trim(),
      p_orders_out_id: parseInteger(bookingOutId),
      p_unit_price: parseFloatValue(unitPrice),
      p_qty_reserved: parseFloatValue(quantity),
    };
  }

  function buildOrderBookingOutAmendPayload() {
    return {
      p_id: parseInteger(orderItemId),
      ...buildOrderBookingOutPayload(),
    };
  }

  function buildOrderOutPayload() {
    return {
      p_customer_id: parseInteger(formCustomerId),
      p_date_placed: bookingDate,
      p_action_user: recordActionUser.trim(),
      p_comments: comments.trim(),
    };
  }

  function buildOrderOutChangePayload() {
    return {
      p_id: parseInteger(bookingOutId),
      p_customer_id: parseInteger(formCustomerId),
      p_date_placed: bookingDate,
      p_date_delivered: "1900-01-01",
      p_order_status_id: parseInteger(orderStatusId),
      p_comments: comments.trim(),
    };
  }

  function buildBookingOutMutationPayload() {
    return {
      p_stock_item_id: parseInteger(stockItemId),
      p_qty: parseFloatValue(quantity),
      p_booked_out_date: bookingDate,
      p_booking_out_type_id: parseInteger(bookingOutTypeId),
      p_return_reason_id: parseInteger(returnReasonId),
      p_comments: comments.trim(),
      p_action_user: recordActionUser.trim(),
      p_customer_id: parseInteger(formCustomerId),
      p_orders_out_id: 0,
      p_unit_price: parseFloatValue(unitPrice),
      p_qty_reserved: parseFloatValue(qtyReserved) ?? 0,
    };
  }

  function buildBookingOutInsertPayload() {
    return buildBookingOutMutationPayload();
  }

  function buildChangePayload() {
    return {
      p_id: parseInteger(bookingOutId),
      ...buildBookingOutMutationPayload(),
    };
  }

  function buildOrdersNotFullyDeliveredChangePayload() {
    return {
      p_id: parseInteger(bookingOutId),
      p_stock_item_id: parseInteger(stockItemId),
      p_qty: parseFloatValue(quantity),
      p_booked_out_date: bookingDate,
      p_customer_id: parseInteger(formCustomerId),
      p_booking_out_type_id: 6,
      p_return_reason_id: 0,
      p_comments: comments.trim(),
      p_action_user: recordActionUser.trim(),
      p_unit_price: parseFloatValue(unitPrice),
      p_orders_out_id: parseInteger(orderNumber),
      p_qty_reserved: parseFloatValue(qtyReserved),
    };
  }

  function buildBookingOutCorrectionPayload() {
    return {
      p_stock_item_id: parseInteger(stockItemId),
      p_qty: subtractFloatValues(correctionOriginalQty, quantity),
      p_booked_out_date: bookingDate,
      p_booking_out_type_id: parseInteger(bookingOutTypeId),
      p_return_reason_id: 0,
      p_comments: comments.trim(),
      p_action_user: recordActionUser.trim(),
      p_customer_id: parseInteger(formSupplierId),
      p_orders_out_id: parseInteger(orderNumber),
      p_unit_price: parseFloatValue(unitPrice),
      p_qty_reserved: subtractFloatValues(
        correctionOriginalQtyOnOrder,
        qtyReserved
      ),
      p_contra_id: parseInteger(correctionBookingInId),
    };
  }

  function isMandatoryFieldsValid() {
    if (isOrdersOut) {
      return isNonZeroInteger(formCustomerId);
    }

    if (!stockCode.trim()) return false;
    if (!isNonZeroInteger(stockItemId)) return false;
    if (parseFloatValue(quantity) == null) return false;
    if (correctionMode) {
      if (!parseInteger(bookingOutTypeId)) return false;
      if (!comments.trim()) return false;
      return true;
    }
    if (ordersNotFullyDeliveredSelected) return true;
    if (!parseInteger(bookingOutTypeId)) return false;
    return true;
  }

  function isChangeFormValid() {
    if (parseInteger(bookingOutId) == null) return false;
    return isMandatoryFieldsValid();
  }

  function isSaveFormValid() {
    return isMandatoryFieldsValid();
  }

  function isAddOrderItemFormValid() {
    return (
      isNonZeroInteger(stockItemId) &&
      isNonZeroInteger(bookingOutId) &&
      parseFloatValue(quantity) != null
    );
  }

  function isAmendOrderItemFormValid() {
    return (
      isNonZeroInteger(orderItemId) &&
      isNonZeroInteger(stockItemId) &&
      parseFloatValue(quantity) != null
    );
  }

  function isRemoveOrderItemFormValid() {
    return isNonZeroInteger(orderItemId);
  }

  function clearOrderItemFields() {
    setStockCode("");
    setDescription("");
    setStockItemId("");
    setQuantity("");
    setQtyReserved("");
    setQtyDelivered("");
    setOrderItemId("");
    setUnitPrice("");
    setSelectedOrderItemId(null);
  }

  function handleNewOrderItem() {
    clearOrderItemFields();
    setOrderItemEditMode(false);
  }

  function handleOrderItemRowClick(row) {
    setOrderItemId(row.id != null ? String(row.id) : "");
    setStockItemId(
      row.stock_item_id != null ? String(row.stock_item_id) : ""
    );
    setStockCode(row.stock_code ?? "");
    setDescription(row.descr ?? "");
    setQtyDelivered(
      row.qty_delivered != null ? String(row.qty_delivered) : ""
    );
    setQuantity(row.qty_reserved != null ? String(row.qty_reserved) : "");
    setUnitPrice(formatUnitPrice(row.unit_price));
    setSelectedOrderItemId(row.id ?? null);
    setOrderItemEditMode(true);
    setError("");
    setSuccess("");
  }

  async function handleAddOrderItem() {
    if (!isAddOrderItemFormValid()) {
      setError("Stock item, order out number, and qty reserved are required.");
      setSuccess("");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc(
        "pi_order_booking_out",
        buildOrderBookingOutPayload()
      );
      if (rpcError) throw rpcError;
      setSuccess("Order booking out saved.");
      clearOrderItemFields();
      setOrderItemEditMode(false);
      await loadOrderBookingOutRows(bookingOutId);
    } catch (err) {
      setError(err.message ?? "Failed to add order booking out");
    } finally {
      setLoading(false);
    }
  }

  async function handleAmendOrderItem() {
    if (!isAmendOrderItemFormValid()) {
      setError("Select an order item to amend and enter qty reserved.");
      setSuccess("");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc(
        "pu_order_booking_out",
        buildOrderBookingOutAmendPayload()
      );
      if (rpcError) throw rpcError;
      setSuccess("Order item updated.");
      clearOrderItemFields();
      setOrderItemEditMode(false);
      await loadOrderBookingOutRows(bookingOutId);
    } catch (err) {
      setError(err.message ?? "Failed to amend order item");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveOrderItem() {
    if (!isRemoveOrderItemFormValid()) {
      setError("Select an order item to remove.");
      setSuccess("");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("pd_order_booking_out", {
        p_id: parseInteger(orderItemId),
      });
      if (rpcError) throw rpcError;
      setSuccess("Order item removed.");
      clearOrderItemFields();
      setOrderItemEditMode(false);
      await loadOrderBookingOutRows(bookingOutId);
    } catch (err) {
      setError(err.message ?? "Failed to remove order item");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!isSaveFormValid()) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc(
        "pi_order_out",
        buildOrderOutPayload()
      );
      if (rpcError) throw rpcError;
      await refreshAfterAction("Order out saved.");
    } catch (err) {
      setError(err.message ?? "Failed to add order out");
    } finally {
      setLoading(false);
    }
  }

  async function handleApplyCorrectionSubmit() {
    if (!comments.trim()) {
      setError("Comments are required to apply a correction.");
      setSuccess("");
      return;
    }

    if (!isSaveFormValid()) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc(
        "pi_booking_out_correction",
        buildBookingOutCorrectionPayload()
      );
      if (rpcError) throw rpcError;
      await refreshAfterCorrectionAction("Booking out correction applied.");
    } catch (err) {
      setError(err.message ?? "Failed to apply booking out correction");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!isSaveFormValid()) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc(
        "pi_booking_out",
        buildBookingOutInsertPayload()
      );
      if (rpcError) throw rpcError;
      await refreshAfterAction("Booking out saved.");
    } catch (err) {
      setError(err.message ?? "Failed to save booking out");
    } finally {
      setLoading(false);
    }
  }

  async function handleChange() {
    if (!isChangeFormValid()) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      if (isOrdersOut) {
        const { error: rpcError } = await supabase.rpc(
          "pu_order_out",
          buildOrderOutChangePayload()
        );
        if (rpcError) throw rpcError;
        await refreshAfterAction("Order out updated.");
      } else {
        const { error: rpcError } = await supabase.rpc(
          "pu_booking_out",
          ordersNotFullyDeliveredSelected
            ? buildOrdersNotFullyDeliveredChangePayload()
            : buildChangePayload()
        );
        if (rpcError) throw rpcError;
        await refreshAfterAction("Booking out updated.");
      }
    } catch (err) {
      setError(
        err.message ??
          (isOrdersOut ? "Failed to update order out" : "Failed to update booking out")
      );
    } finally {
      setLoading(false);
    }
  }

  function handleDeleteClick() {
    if (!bookingOutId) return;
    setDeleteConfirmOpen(true);
  }

  async function handleDeleteConfirm() {
    const id = parseInteger(bookingOutId);
    if (id == null) return;

    setLoading(true);
    setError("");
    setSuccess("");
    setDeleteConfirmOpen(false);

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("pd_booking_out", {
        p_id: id,
      });
      if (rpcError) throw rpcError;
      await refreshAfterAction("Booking out deleted.");
    } catch (err) {
      setError(err.message ?? "Failed to delete booking out");
    } finally {
      setLoading(false);
    }
  }

  async function handleCorrectionsButtonClick(event, bookingOutId) {
    event.stopPropagation();

    const id = parseInteger(bookingOutId);
    if (id == null) return;

    setCorrectionsOpen(true);
    setCorrectionsBookingOutId(id);
    setCorrectionsLoading(true);
    setCorrectionsError("");
    setCorrectionsRows([]);

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc(
        "pr_order_out_corrections",
        { p_booking_out_id: id }
      );
      if (rpcError) throw rpcError;
      setCorrectionsRows(normalizeOrderOutCorrectionsRows(data));
    } catch (err) {
      setCorrectionsRows([]);
      setCorrectionsError(err.message ?? "Failed to load order out corrections");
    } finally {
      setCorrectionsLoading(false);
    }
  }

  function handleCloseCorrections() {
    setCorrectionsOpen(false);
    setCorrectionsBookingOutId(null);
    setCorrectionsRows([]);
    setCorrectionsError("");
  }

  async function handleRowClick(row) {
    if (isOrdersOut) {
      setOrderStatusId(
        row.order_status_id != null ? String(row.order_status_id) : ""
      );
      setFormCustomerId(
        row.customer_id != null ? String(row.customer_id) : ""
      );
      setBookingDate(
        toIsoDate(row.date_placed ?? row.order_placed_date ?? row.booked_out_date)
      );
      setComments(row.comments ?? "");
      setBookingOutId(row.id != null ? String(row.id) : "");
      setRecordActionUser(row.action_user ?? "");
      setSelectedId(row.id ?? null);
      setEditMode(true);
      setError("");
      setSuccess("");
      if (row.id != null && isNonZeroInteger(String(row.id))) {
        setItemsExpanded(true);
      }
      clearOrderItemFields();
      await loadOrderBookingOutRows(row.id);
      return;
    }

    setStockCode(row.stock_code ?? "");
    setDescription(row.description ?? "");
    setStockItemId(
      row.stock_item_id != null ? String(row.stock_item_id) : ""
    );

    clearOrdersNotFullyDeliveredSelection();
    setCorrectionMode(false);
    setCorrectionBookingInId("");
    setCorrectionOriginalQty("");
    setCorrectionOriginalQtyOnOrder("");
    setFormSupplierId("");
    setQuantity(formatGridQtyToBookOut(row.qty));
    setQtyReserved(
      row.qty_reserved != null ? String(row.qty_reserved) : ""
    );
    setUnitPrice(formatUnitPrice(row.unit_price));
    setBookingDate(toIsoDate(row.booked_out_date));
    setBookingOutTypeId(
      row.booking_out_type_id != null ? String(row.booking_out_type_id) : ""
    );
    setReturnReasonId(
      row.return_reason_id != null ? String(row.return_reason_id) : ""
    );
    setComments(row.comments ?? "");
    setBookingOutId(row.id != null ? String(row.id) : "");
    setRecordActionUser(row.action_user ?? "");
    setSelectedId(row.id ?? null);
    setSelectedBookedOutTypeLabel(row.booked_out_type ?? "");
    setEditMode(true);
    setError("");
    setSuccess("");

    if (row.unit_price != null) return;

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const price = await resolveUnitPriceForStockItem(supabase, {
        id: row.stock_item_id,
        stock_item_id: row.stock_item_id,
        unit_price: row.unit_price,
      });
      setUnitPrice(price);
    } catch (err) {
      reportBackgroundLoadError("Failed to load unit price", err, setError);
    }
  }

  function handleNew() {
    initializeForm();
  }

  function handleOrdersNotFullyDeliveredToggle() {
    setOrdersNotFullyDeliveredExpanded((expanded) => !expanded);
  }

  function handleApplyCorrection() {
    const bookOutId = parseInteger(bookingOutId);
    if (bookOutId == null) return;

    storeCorrectionBookingOutId(bookOutId);
    router.push("/booking-in");
  }

  function handleItemsSectionToggle() {
    setItemsExpanded((current) => !current);
  }

  return (
    <div className="mt-4 w-full">
      {!isOrdersOut ? (
        <>
          <input
            type="text"
            name="stock_item_id"
            value={stockItemId}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="hidden"
          />
          {correctionMode ? (
            <>
              <input
                type="text"
                name="booking_in_id"
                value={correctionBookingInId}
                readOnly
                tabIndex={-1}
                aria-hidden="true"
                className="hidden"
              />
              <input
                type="text"
                name="qty"
                value={correctionOriginalQty}
                readOnly
                tabIndex={-1}
                aria-hidden="true"
                className="hidden"
              />
              <input
                type="text"
                name="qty_on_order"
                value={correctionOriginalQtyOnOrder}
                readOnly
                tabIndex={-1}
                aria-hidden="true"
                className="hidden"
              />
            </>
          ) : null}
        </>
      ) : null}

      <form className="flex flex-col gap-4">
        {!isOrdersOut ? (
          <div
            className={`grid grid-cols-1 gap-4 sm:max-w-2xl ${
              showOrderNumberAndQtyReserved ? "sm:grid-cols-2" : ""
            }`}
          >
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {numberFieldLabel}
              </span>
              <input
                type="text"
                name="id"
                value={bookingOutId}
                readOnly
                tabIndex={-1}
                className={`${bookingOutReadOnlyInputClassName} w-full`}
              />
            </label>
            {showOrderNumberAndQtyReserved ? (
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {correctionMode ? "Order In Number" : "Order Number"}
                </span>
                <input
                  type="text"
                  name={correctionMode ? "order_in_id" : "order_out_id"}
                  value={orderNumber}
                  readOnly
                  tabIndex={-1}
                  className={`${bookingOutReadOnlyInputClassName} w-full`}
                />
              </label>
            ) : null}
          </div>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {numberFieldLabel}
            </span>
            <input
              type="text"
              name="id"
              value={bookingOutId}
              readOnly
              tabIndex={-1}
              className={`${readOnlyInputClassName} w-full sm:max-w-xs`}
            />
          </label>
        )}

        {!isOrdersOut ? (
          <StockItemLookupFields
            stockCode={stockCode}
            description={description}
            onStockCodeChange={setStockCode}
            onDescriptionChange={setDescription}
            onSelect={handleStockItemSelect}
            onClear={() => {
              setStockItemId("");
              setUnitPrice("");
            }}
            stockCodeRequired
            inputClassName={bookingOutInputClassName}
          />
        ) : null}

        {!isOrdersOut ? (
          <div
            className={`grid grid-cols-1 gap-4 ${
              showOrderNumberAndQtyReserved ? "sm:grid-cols-4" : "sm:grid-cols-3"
            }`}
          >
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Qty To Book Out
                <RequiredMarker />
              </span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={quantity}
                max={ordersNotFullyDeliveredMaxQuantity}
                onChange={(e) => handleBookingOutQuantityChange(e.target.value)}
                className={`${bookingOutInputClassName} w-full`}
              />
            </label>

            {showOrderNumberAndQtyReserved ? (
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Qty Reserved
                </span>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={qtyReserved}
                  readOnly={ordersNotFullyDeliveredSelected}
                  tabIndex={ordersNotFullyDeliveredSelected ? -1 : undefined}
                  onChange={(e) => setQtyReserved(e.target.value)}
                  className={`${
                    ordersNotFullyDeliveredSelected
                      ? bookingOutReadOnlyInputClassName
                      : bookingOutInputClassName
                  } w-full`}
                />
              </label>
            ) : null}

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Unit Price
              </span>
              <input
                type={
                  ordersNotFullyDeliveredSelected || correctionMode
                    ? "number"
                    : "text"
                }
                step={
                  ordersNotFullyDeliveredSelected || correctionMode
                    ? "any"
                    : undefined
                }
                inputMode={
                  ordersNotFullyDeliveredSelected || correctionMode
                    ? "decimal"
                    : undefined
                }
                value={unitPrice}
                readOnly={
                  !ordersNotFullyDeliveredSelected && !correctionMode
                }
                tabIndex={
                  ordersNotFullyDeliveredSelected || correctionMode
                    ? undefined
                    : -1
                }
                onChange={
                  ordersNotFullyDeliveredSelected || correctionMode
                    ? (e) => setUnitPrice(e.target.value)
                    : undefined
                }
                className={`${
                  ordersNotFullyDeliveredSelected || correctionMode
                    ? bookingOutInputClassName
                    : bookingOutReadOnlyInputClassName
                } w-full`}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Total Price
              </span>
              <input
                type="text"
                value={totalPrice}
                readOnly
                tabIndex={-1}
                className={`${bookingOutReadOnlyInputClassName} w-full`}
              />
            </label>
          </div>
        ) : null}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-1 sm:items-start">
            <div className="flex w-full flex-col gap-4 sm:max-w-xs sm:flex-1">
              {isOrdersOut ? (
                <label className="flex w-full flex-col gap-1">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Customer
                    <RequiredMarker />
                  </span>
                  <select
                    value={formCustomerId}
                    onChange={(e) => setFormCustomerId(e.target.value)}
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
              ) : (
                !ordersNotFullyDeliveredSelected || correctionMode ? (
                  <label className="flex w-full flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Book-out type
                      <RequiredMarker />
                    </span>
                    <select
                      value={bookingOutTypeId}
                      onChange={(e) =>
                        handleBookingOutTypeChange(e.target.value)
                      }
                      disabled={bookingOutTypesLoading || correctionMode}
                      className={`${
                        correctionMode
                          ? bookingOutReadOnlyInputClassName
                          : bookingOutInputClassName
                      } w-full`}
                    >
                      <option value="">
                        {bookingOutTypesLoading ? "Loading…" : SELECT_PLACEHOLDER}
                      </option>
                      {bookingOutTypeOptions.map((option, index) => (
                        <option
                          key={option.id ?? `booking-out-type-${index}`}
                          value={optionValue(option)}
                        >
                          {optionLabel(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null
              )}

              {isOrdersOut ? (
                <label className="flex w-full flex-col gap-1">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Order Placed Date
                  </span>
                  <input
                    type="date"
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className={inputClassName}
                  />
                </label>
              ) : correctionMode ? (
                <label className="flex w-full flex-col gap-1">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Supplier
                  </span>
                  <select
                    value={formSupplierId}
                    onChange={(e) => setFormSupplierId(e.target.value)}
                    disabled={suppliersLoading}
                    className={`${bookingOutInputClassName} w-full`}
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
                <label className="flex w-full flex-col gap-1">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Customer
                  </span>
                  <select
                    value={formCustomerId}
                    onChange={(e) => setFormCustomerId(e.target.value)}
                    disabled={customersLoading}
                    className={`${bookingOutInputClassName} w-full`}
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

            {returnReasonVisible ? (
              <label className="flex w-full flex-col gap-1 sm:max-w-xs sm:flex-1">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Return Reason
                </span>
                <select
                  value={returnReasonId}
                  onChange={(e) => setReturnReasonId(e.target.value)}
                  disabled={returnReasonsLoading}
                  className={bookingOutInputClassName}
                >
                  <option value="">
                    {returnReasonsLoading ? "Loading…" : SELECT_PLACEHOLDER}
                  </option>
                  {returnReasonOptions.map((option, index) => (
                    <option
                      key={option.id ?? `return-reason-${index}`}
                      value={optionValue(option)}
                    >
                      {optionLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="flex w-full flex-col gap-4 sm:max-w-xs lg:w-48 lg:shrink-0">
            {isOrdersOut ? (
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Order Status
                </span>
                <select
                  value={orderStatusId}
                  onChange={(e) => setOrderStatusId(e.target.value)}
                  disabled={orderStatusesLoading}
                  className={`${inputClassName} w-full`}
                >
                  <option value="">
                    {orderStatusesLoading ? "Loading…" : SELECT_PLACEHOLDER}
                  </option>
                  {orderStatusOptions.map((option, index) => (
                    <option
                      key={option.id ?? `order-status-${index}`}
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
                  Date
                </span>
                <input
                  type="date"
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  className={bookingOutInputClassName}
                />
              </label>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Action User
              </span>
              <input
                type="text"
                value={recordActionUser}
                readOnly
                tabIndex={-1}
                className={bookingOutReadOnlyInputClassName}
              />
            </label>
          </div>
        </div>

        {isOrdersOut ? (
          <div className="overflow-hidden rounded-lg border border-zinc-300 bg-zinc-300 dark:border-zinc-700 dark:bg-zinc-900">
            <button
              type="button"
              onClick={handleItemsSectionToggle}
              aria-expanded={itemsExpanded}
              className="flex w-full items-center rounded-t-lg bg-zinc-300 px-3 py-2 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-400 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <span
                className={`mr-2 inline-block text-xs text-zinc-500 transition-transform dark:text-zinc-400 ${
                  itemsExpanded ? "rotate-90" : ""
                }`}
                aria-hidden
              >
                ▶
              </span>
              Items
            </button>
            {itemsExpanded ? (
              <div className="flex flex-col gap-4 border-t border-zinc-300 bg-zinc-300 p-4 dark:border-zinc-700 dark:bg-zinc-900">
                <input
                  type="text"
                  name="stock_item_id"
                  value={stockItemId}
                  readOnly
                  tabIndex={-1}
                  aria-hidden="true"
                  className="hidden"
                />
                <input
                  type="text"
                  name="order_item_id"
                  value={orderItemId}
                  readOnly
                  tabIndex={-1}
                  aria-hidden="true"
                  className="hidden"
                />

                <StockItemLookupFields
                  stockCode={stockCode}
                  description={description}
                  onStockCodeChange={setStockCode}
                  onDescriptionChange={setDescription}
                  onSelect={handleStockItemSelect}
                  onClear={() => {
                    setStockItemId("");
                    setUnitPrice("");
                  }}
                  stockCodeRequired
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Qty Delivered
                    </span>
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={qtyDelivered}
                      readOnly
                      tabIndex={-1}
                      className={`${readOnlyInputClassName} w-full`}
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Qty Reserved
                      <RequiredMarker />
                    </span>
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className={`${inputClassName} w-full`}
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Unit Price
                    </span>
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(e.target.value)}
                      className={`${inputClassName} w-full`}
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Total Price
                    </span>
                    <input
                      type="text"
                      value={totalPrice}
                      readOnly
                      tabIndex={-1}
                      className={`${readOnlyInputClassName} w-full`}
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleNewOrderItem}
                    className="rounded bg-sky-200 px-4 py-2 text-sm font-medium text-sky-900 hover:bg-sky-300 dark:bg-sky-900/40 dark:text-sky-100 dark:hover:bg-sky-900/60"
                  >
                    New
                  </button>
                  {!orderItemEditMode && (
                    <button
                      type="button"
                      onClick={handleAddOrderItem}
                      disabled={loading || !isAddOrderItemFormValid()}
                      className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Add
                    </button>
                  )}
                  {orderItemEditMode && (
                    <>
                      <button
                        type="button"
                        onClick={handleAmendOrderItem}
                        disabled={loading || !isAmendOrderItemFormValid()}
                        className="rounded bg-orange-200 px-4 py-2 text-sm font-medium text-orange-900 hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-900/40 dark:text-orange-100 dark:hover:bg-orange-900/60"
                      >
                        Amend
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveOrderItem}
                        disabled={loading}
                        className="rounded bg-red-200 px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-900/60"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>

                <div className="overflow-hidden rounded-lg border border-zinc-200 bg-sky-50 dark:border-zinc-800 dark:bg-sky-900/20">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-zinc-200 bg-sky-100 dark:border-zinc-800 dark:bg-sky-900/30">
                      <tr>
                        {orderBookingOutColumns.map((column) => (
                          <th
                            key={column}
                            className={`px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300 ${
                              isOrderBookingOutHiddenColumn(column)
                                ? "hidden"
                                : ""
                            }`}
                          >
                            {formatOrderBookingOutColumnHeader(column)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orderItemsGridLoading ? (
                        <tr>
                          <td
                            colSpan={Math.max(orderBookingOutColumns.length, 1)}
                            className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                          >
                            Loading…
                          </td>
                        </tr>
                      ) : orderBookingOutRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={Math.max(orderBookingOutColumns.length, 1)}
                            className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                          >
                            No order items found.
                          </td>
                        </tr>
                      ) : (
                        orderBookingOutRows.map((row) => (
                          <tr
                            key={row.rowKey}
                            onClick={() => handleOrderItemRowClick(row)}
                            className={`cursor-pointer border-b border-zinc-100 bg-sky-50 last:border-b-0 hover:bg-sky-100 dark:border-zinc-800 dark:bg-sky-900/20 dark:hover:bg-sky-900/30 ${
                              selectedOrderItemId === row.id
                                ? "bg-sky-100 dark:bg-sky-900/30"
                                : ""
                            }`}
                          >
                            {orderBookingOutColumns.map((column) => (
                              <td
                                key={`${row.rowKey}-${column}`}
                                className={`px-4 py-2 text-zinc-800 dark:text-zinc-200 ${
                                  isOrderBookingOutHiddenColumn(column)
                                    ? "hidden"
                                    : ""
                                }`}
                              >
                                {formatOrderBookingOutCellValue(
                                  row[column],
                                  column
                                )}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Comments
            {correctionMode ? <RequiredMarker /> : null}
          </span>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={3}
            className={
              !isOrdersOut ? bookingOutInputClassName : inputClassName
            }
          />
        </label>
      </form>

      {error && (
        <p
          className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      )}
      {success && (
        <p
          className="mt-4 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          role="status"
        >
          {success}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!editMode && !correctionMode && (
          <button
            type="button"
            onClick={isOrdersOut ? handleAdd : handleSave}
            disabled={loading || !isSaveFormValid()}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save"}
          </button>
        )}

        {!editMode && correctionMode ? (
          <button
            type="button"
            onClick={handleApplyCorrectionSubmit}
            disabled={loading || !isSaveFormValid()}
            className="rounded bg-yellow-200 px-4 py-2 text-sm font-medium text-yellow-900 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-yellow-900/40 dark:text-yellow-100 dark:hover:bg-yellow-900/60"
          >
            {loading ? "Saving…" : "Apply Correction"}
          </button>
        ) : null}

        {editMode && (
          <>
            <button
              type="button"
              onClick={handleNew}
              className="rounded bg-sky-200 px-4 py-2 text-sm font-medium text-sky-900 hover:bg-sky-300 dark:bg-sky-900/40 dark:text-sky-100 dark:hover:bg-sky-900/60"
            >
              New
            </button>
            {isMainGridOrderBookingOutSelected ? (
              <button
                type="button"
                onClick={handleApplyCorrection}
                disabled={loading}
                className="rounded bg-yellow-200 px-4 py-2 text-sm font-medium text-yellow-900 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-yellow-900/40 dark:text-yellow-100 dark:hover:bg-yellow-900/60"
              >
                Make a Correction
              </button>
            ) : correctionMode ? (
              <button
                type="button"
                onClick={handleApplyCorrectionSubmit}
                disabled={loading || !isSaveFormValid()}
                className="rounded bg-yellow-200 px-4 py-2 text-sm font-medium text-yellow-900 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-yellow-900/40 dark:text-yellow-100 dark:hover:bg-yellow-900/60"
              >
                {loading ? "Saving…" : "Apply Correction"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleChange}
                  disabled={loading || !isChangeFormValid() || !bookingOutId}
                  className="rounded bg-orange-200 px-4 py-2 text-sm font-medium text-orange-900 hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-900/40 dark:text-orange-100 dark:hover:bg-orange-900/60"
                >
                  {loading ? "Saving…" : "Change"}
                </button>
                {!ordersNotFullyDeliveredSelected || isOrdersOut ? (
                  <button
                    type="button"
                    onClick={handleDeleteClick}
                    disabled={loading || !bookingOutId}
                    className="rounded bg-red-200 px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-900/60"
                  >
                    {loading ? "Saving…" : "Delete"}
                  </button>
                ) : null}
              </>
            )}
          </>
        )}
      </div>

      {deleteConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h3
              id="delete-confirm-title"
              className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              {DELETE_CONFIRM_MESSAGE}
            </h3>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              >
                No
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={loading}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {correctionsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-out-corrections-title"
            className="flex max-h-[90vh] w-full max-w-[76.8rem] flex-col rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <h3
                id="order-out-corrections-title"
                className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
              >
                Order Out Corrections
                {correctionsBookingOutId != null
                  ? ` — No. ${correctionsBookingOutId}`
                  : ""}
              </h3>
              <button
                type="button"
                onClick={handleCloseCorrections}
                className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              >
                Close
              </button>
            </div>

            <div className="overflow-auto p-4">
              {correctionsError ? (
                <p
                  className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
                  role="alert"
                >
                  {correctionsError}
                </p>
              ) : null}

              <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <table className="w-full min-w-max text-left text-sm">
                  <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <tr>
                      {orderOutCorrectionsColumns.map((column) => (
                        <th
                          key={column}
                          className="whitespace-nowrap px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300"
                        >
                          {formatOrderOutCorrectionsColumnHeader(column)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {correctionsLoading ? (
                      <tr>
                        <td
                          colSpan={Math.max(orderOutCorrectionsColumns.length, 1)}
                          className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                        >
                          Loading…
                        </td>
                      </tr>
                    ) : correctionsRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={Math.max(orderOutCorrectionsColumns.length, 1)}
                          className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                        >
                          No correction records found.
                        </td>
                      </tr>
                    ) : (
                      correctionsRows.map((row) => (
                        <tr
                          key={row.rowKey}
                          className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                        >
                          {orderOutCorrectionsColumns.map((column) => (
                            <td
                              key={`${row.rowKey}-${column}`}
                              className="whitespace-nowrap px-4 py-2 text-zinc-800 dark:text-zinc-200"
                            >
                              {formatOrderOutCorrectionsCellValue(
                                row[column],
                                column
                              )}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!isOrdersOut ? (
          <>
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Grid Filtered By:
            </span>
            <fieldset className="rounded-lg border border-zinc-300 px-4 py-3 dark:border-zinc-600">
              <legend className="sr-only">Grid filter</legend>
              <div
                role="radiogroup"
                aria-label="Grid filter"
                className="flex flex-wrap items-center gap-4"
              >
                <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="radio"
                    name="gridFilter"
                    value={GRID_FILTER_ALL}
                    checked={gridFilter === GRID_FILTER_ALL}
                    onChange={() => setGridFilter(GRID_FILTER_ALL)}
                    className="h-4 w-4 border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  All
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="radio"
                    name="gridFilter"
                    value={GRID_FILTER_BY_STOCK_CODE}
                    checked={gridFilter === GRID_FILTER_BY_STOCK_CODE}
                    onChange={() => setGridFilter(GRID_FILTER_BY_STOCK_CODE)}
                    className="h-4 w-4 border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  By Stock Code
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="radio"
                    name="gridFilter"
                    value={GRID_FILTER_LAST_THREE_MONTHS}
                    checked={gridFilter === GRID_FILTER_LAST_THREE_MONTHS}
                    onChange={() => setGridFilter(GRID_FILTER_LAST_THREE_MONTHS)}
                    className="h-4 w-4 border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Last 3 Months
                </label>
              </div>
            </fieldset>
          </>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
            {isOrdersOut ? (
              <tr>
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  No.
                </th>
                <th className="hidden px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  customer_id
                </th>
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  Customer
                </th>
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  Date Placed
                </th>
                <th className="hidden px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  order_status_id
                </th>
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  Status
                </th>
                <th className="hidden px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  action_user
                </th>
                <th className="hidden px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  comments
                </th>
              </tr>
            ) : (
              <tr>
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  No.
                </th>
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  Stock Code
                </th>
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  Description
                </th>
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  Qty Booked Out
                </th>
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  Qty Reserved
                </th>
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  Booked Out Type
                </th>
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  Date
                </th>
                <th className="whitespace-nowrap px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  Has Corrections
                </th>
              </tr>
            )}
          </thead>
          <tbody>
            {gridLoading ? (
              <tr key={isOrdersOut ? "orders-out-loading" : "booking-out-loading"}>
                <td
                  colSpan={
                    isOrdersOut ? 8 : BOOKING_OUT_GRID_COLUMN_COUNT
                  }
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  Loading…
                </td>
              </tr>
            ) : bookingOutRows.length === 0 ? (
              <tr key={isOrdersOut ? "orders-out-empty" : "booking-out-empty"}>
                <td
                  colSpan={
                    isOrdersOut ? 8 : BOOKING_OUT_GRID_COLUMN_COUNT
                  }
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  {isOrdersOut
                    ? "No orders out records found."
                    : "No booking out records found."}
                </td>
              </tr>
            ) : isOrdersOut ? (
              bookingOutRows.map((row) => (
                <tr
                  key={row.rowKey}
                  onClick={() => handleRowClick(row)}
                  className={`cursor-pointer border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 ${
                    selectedId === row.id ? "bg-sky-50 dark:bg-sky-900/20" : ""
                  }`}
                >
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.id ?? ""}
                  </td>
                  <td className="hidden px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.customer_id ?? ""}
                  </td>
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.customer}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {toIsoDate(row.date_placed)}
                  </td>
                  <td className="hidden px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.order_status_id ?? ""}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {row.status}
                  </td>
                  <td className="hidden px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.action_user}
                  </td>
                  <td className="hidden px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.comments}
                  </td>
                </tr>
              ))
            ) : (
              bookingOutRows.map((row) => (
                <tr
                  key={row.rowKey}
                  onClick={() => handleRowClick(row)}
                  className={`cursor-pointer border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 ${
                    selectedId === row.id ? "bg-sky-50 dark:bg-sky-900/20" : ""
                  }`}
                >
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.id ?? ""}
                  </td>
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.stock_code ?? ""}
                  </td>
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.description ?? row.stock_item ?? ""}
                  </td>
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {formatBookingOutCellValue(row.qty, "qty")}
                  </td>
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {formatBookingOutCellValue(row.qty_reserved, "qty_reserved")}
                  </td>
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.booked_out_type ?? ""}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {formatBookingOutCellValue(row.booked_out_date, "booked_out_date")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.contra_id == null ? (
                      "No"
                    ) : (
                      <button
                        type="button"
                        onClick={(event) =>
                          handleCorrectionsButtonClick(event, row.id)
                        }
                        className="rounded bg-sky-200 px-2 py-0.5 text-xs font-medium text-sky-900 hover:bg-sky-300 dark:bg-sky-900/40 dark:text-sky-100 dark:hover:bg-sky-900/60"
                      >
                        Yes
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!isOrdersOut ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-yellow-100 dark:border-zinc-800 dark:bg-yellow-900/30">
          <button
            type="button"
            onClick={handleOrdersNotFullyDeliveredToggle}
            aria-expanded={ordersNotFullyDeliveredExpanded}
            className="flex w-full items-center rounded-t-lg bg-yellow-100 px-3 py-2 text-left text-sm font-medium text-zinc-800 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-zinc-200 dark:hover:bg-yellow-900/40"
          >
            <span
              className={`mr-2 inline-block text-xs text-zinc-500 transition-transform dark:text-zinc-400 ${
                ordersNotFullyDeliveredExpanded ? "rotate-90" : ""
              }`}
              aria-hidden
            >
              ▶
            </span>
            Orders Not Fully Delivered
          </button>
          {ordersNotFullyDeliveredExpanded ? (
            <div className="border-t border-zinc-200 bg-yellow-100 p-4 dark:border-zinc-800 dark:bg-yellow-900/30">
              <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-sky-50 dark:border-zinc-800 dark:bg-sky-900/20">
                <table className="w-full min-w-max text-left text-sm">
                  <thead className="border-b border-zinc-200 bg-sky-100 dark:border-zinc-800 dark:bg-sky-900/30">
                    <tr>
                      {ordersNotFullyDeliveredColumns.map((column) => (
                        <th
                          key={column}
                          className={`px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300 ${
                            isOrdersNotFullyDeliveredHiddenColumn(column)
                              ? "hidden"
                              : ""
                          }`}
                        >
                          {formatOrdersNotFullyDeliveredColumnHeader(column)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ordersNotFullyDeliveredGridLoading ? (
                      <tr>
                        <td
                          colSpan={Math.max(
                            ordersNotFullyDeliveredColumns.length,
                            1
                          )}
                          className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                        >
                          Loading…
                        </td>
                      </tr>
                    ) : ordersNotFullyDeliveredRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={Math.max(
                            ordersNotFullyDeliveredColumns.length,
                            1
                          )}
                          className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                        >
                          No orders not fully delivered found.
                        </td>
                      </tr>
                    ) : (
                      ordersNotFullyDeliveredRows.map((row) => (
                        <tr
                          key={row.rowKey}
                          onClick={() =>
                            handleOrdersNotFullyDeliveredRowClick(row)
                          }
                          className={`cursor-pointer border-b border-zinc-100 bg-sky-50 last:border-b-0 hover:bg-sky-100 dark:border-zinc-800 dark:bg-sky-900/20 dark:hover:bg-sky-900/30 ${
                            selectedOrdersNotFullyDeliveredRowKey === row.rowKey
                              ? "bg-sky-100 dark:bg-sky-900/30"
                              : ""
                          }`}
                        >
                          {ordersNotFullyDeliveredColumns.map((column) => (
                            <td
                              key={`${row.rowKey}-${column}`}
                              className={`px-4 py-2 text-zinc-800 dark:text-zinc-200 ${
                                isOrdersNotFullyDeliveredHiddenColumn(column)
                                  ? "hidden"
                                  : ""
                              }`}
                            >
                              {formatOrdersNotFullyDeliveredCellValue(
                                row[column],
                                column
                              )}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
