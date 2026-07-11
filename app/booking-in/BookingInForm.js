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
import { useCallback, useEffect, useMemo, useState } from "react";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

const readOnlyInputClassName =
  "rounded border border-zinc-300 bg-zinc-50 px-3 py-2 text-zinc-800 read-only:cursor-default dark:border-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-200";

const SELECT_PLACEHOLDER = " -SELECT- ";
const DELETE_CONFIRM_MESSAGE = "Please Confirn To Delete The Selected Entry";
const ORDER_IN_DELETE_CONFIRM_MESSAGE =
  "Do you really want to delete this order with all its items ?";

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
  return option.descr ?? option.description ?? option.name ?? "";
}

function optionValue(option) {
  return option.id != null ? String(option.id) : "";
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

function formatUnitPrice(value) {
  if (value == null || value === "") return "";
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

function showsReturnReason(bookingInTypeLabel) {
  const label = bookingInTypeLabel.trim();
  return label === "Returned" || label === "Credit";
}

function reportBackgroundLoadError(context, err, setError) {
  if (isFetchFailure(err)) {
    console.warn(`${context}: network error after idle or offline`, err);
    return;
  }

  setError(err.message ?? context);
}

function normalizeBookingInRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    id: row.id ?? row.booking_in_id ?? null,
    stock_item_id: row.stock_item_id ?? null,
    stock_code: row.stock_code ?? "",
    description: row.description ?? "",
    stock_item: row.stock_item ?? row.descr ?? "",
    qty: row.qty ?? row.quantity ?? null,
    qty_reserved: row.qty_reserved ?? null,
    unit_price: row.unit_price ?? row.unitPrice ?? null,
    booked_in_date: row.booked_in_date ?? row.booking_date ?? null,
    supplier_id: row.supplier_id ?? null,
    booking_in_type_id: row.booking_in_type_id ?? null,
    booked_in_type:
      row.booked_in_type ?? row.booking_in_type ?? row.booking_in_type_descr ?? "",
    return_reason_id: row.return_reason_id ?? null,
    comments: row.comments ?? "",
    action_user: row.action_user ?? "",
    rowKey:
      row.id != null
        ? `booking-in-${row.id}`
        : `booking-in-row-${index}-${row.stock_code ?? "unknown"}`,
  }));
}

function normalizeOrderBookingInRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    id: row.id ?? null,
    stock_item_id: row.stock_item_id ?? null,
    stock_code: row.stock_code ?? "",
    descr: row.descr ?? row.description ?? "",
    qty_delivered: row.qty_delivered ?? null,
    qty_reserved: row.qty_reserved ?? null,
    unit_price: row.unit_price ?? null,
    rowKey:
      row.id != null
        ? `order-booking-in-${row.id}`
        : `order-booking-in-row-${index}-${row.stock_code ?? "unknown"}`,
  }));
}

function normalizeOrdersInRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    id: row.id ?? null,
    supplier_id: row.supplier_id ?? null,
    supplier: row.supplier ?? "",
    date_placed: row.date_placed ?? null,
    order_status_id: row.order_status_id ?? null,
    status: row.status ?? "",
    action_user: row.action_user ?? "",
    comments: row.comments ?? "",
    rowKey:
      row.id != null
        ? `orders-in-${row.id}`
        : `orders-in-row-${index}-${row.supplier ?? "unknown"}`,
  }));
}

export function BookingInForm({ variant = "booking-in" } = {}) {
  useSupabaseIdleRecovery();

  const isOrdersIn = variant === "orders-in";
  const numberFieldLabel = isOrdersIn ? "Order In Number" : "Book In Number";

  const [stockCode, setStockCode] = useState("");
  const [description, setDescription] = useState("");
  const [stockItemId, setStockItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [qtyDelivered, setQtyDelivered] = useState("");
  const [orderItemId, setOrderItemId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [bookingDate, setBookingDate] = useState(todayIsoDate);
  const [bookingInTypeId, setBookingInTypeId] = useState("");
  const [bookingInTypeOptions, setBookingInTypeOptions] = useState([]);
  const [bookingInTypesLoading, setBookingInTypesLoading] = useState(false);
  const [returnReasonId, setReturnReasonId] = useState("");
  const [returnReasonOptions, setReturnReasonOptions] = useState([]);
  const [returnReasonsLoading, setReturnReasonsLoading] = useState(false);
  const [formSupplierId, setFormSupplierId] = useState("");
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [orderStatusId, setOrderStatusId] = useState("");
  const [orderStatusOptions, setOrderStatusOptions] = useState([]);
  const [orderStatusesLoading, setOrderStatusesLoading] = useState(false);
  const [orderPlacedDate, setOrderPlacedDate] = useState(todayIsoDate);
  const [itemsExpanded, setItemsExpanded] = useState(false);
  const [comments, setComments] = useState("");
  const [bookingInId, setBookingInId] = useState("");
  const [bookingInRows, setBookingInRows] = useState([]);
  const [orderBookingInRows, setOrderBookingInRows] = useState([]);
  const [selectedOrderItemId, setSelectedOrderItemId] = useState(null);
  const [gridFilter, setGridFilter] = useState(GRID_FILTER_ALL);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [gridLoading, setGridLoading] = useState(false);
  const [orderItemsGridLoading, setOrderItemsGridLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [actionUser, setActionUser] = useState("");
  const [recordActionUser, setRecordActionUser] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const totalPrice = useMemo(() => {
    if (isOrdersIn) {
      return computeOrderItemTotalPrice(quantity, qtyDelivered, unitPrice);
    }
    return computeTotalPrice(quantity, unitPrice);
  }, [isOrdersIn, quantity, qtyDelivered, unitPrice]);

  const canExpandItemsSection = useMemo(() => {
    if (!isOrdersIn) return false;
    return selectedId != null && isNonZeroInteger(bookingInId);
  }, [isOrdersIn, selectedId, bookingInId]);

  useEffect(() => {
    if (!isOrdersIn) return;
    if (!canExpandItemsSection) {
      setItemsExpanded(false);
    }
  }, [isOrdersIn, canExpandItemsSection]);

  function handleItemsSectionToggle() {
    if (itemsExpanded) {
      setItemsExpanded(false);
      return;
    }

    if (canExpandItemsSection) {
      setItemsExpanded(true);
    }
  }

  const loadBookingInTypes = useCallback(async () => {
    setBookingInTypesLoading(true);
    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc(
        "pr_booking_in_types_active"
      );
      if (rpcError) throw rpcError;
      setBookingInTypeOptions(toOptions(data));
    } catch (err) {
      reportBackgroundLoadError("Failed to load book-in types", err, setError);
    } finally {
      setBookingInTypesLoading(false);
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

  const loadSuppliers = useCallback(async () => {
    setSuppliersLoading(true);
    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc(
        "pr_suppliers_active"
      );
      if (rpcError) throw rpcError;
      setSupplierOptions(toOptions(data));
    } catch (err) {
      reportBackgroundLoadError("Failed to load suppliers", err, setError);
    } finally {
      setSuppliersLoading(false);
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

  const loadBookingInRows = useCallback(async (override = {}) => {
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
          setBookingInRows([]);
          return;
        }

        ({ data, error: rpcError } = await supabase.rpc(
          "pr_booking_in_by_stock_code",
          { p_stock_code: searchCode }
        ));
      } else if (filter === GRID_FILTER_LAST_THREE_MONTHS) {
        ({ data, error: rpcError } = await supabase.rpc(
          "pr_booking_in_last_three_months"
        ));
      } else {
        ({ data, error: rpcError } = await supabase.rpc("pr_booking_in_all"));
      }

      if (rpcError) throw rpcError;
      setBookingInRows(normalizeBookingInRows(data));
    } catch (err) {
      reportBackgroundLoadError(
        "Failed to load booking in records",
        err,
        setError
      );
      setBookingInRows([]);
    } finally {
      setGridLoading(false);
    }
  }, [gridFilter, stockCode]);

  const loadOrdersInRows = useCallback(async (overrideSupplierId) => {
    setGridLoading(true);

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const supplierParam =
        overrideSupplierId !== undefined ? overrideSupplierId : formSupplierId;
      const pSupplierId = parseInteger(supplierParam) ?? 0;

      const { data, error: rpcError } = await supabase.rpc(
        "pr_orders_in_by_supplier",
        { p_supplier_id: pSupplierId }
      );
      if (rpcError) throw rpcError;
      setBookingInRows(normalizeOrdersInRows(data));
    } catch (err) {
      reportBackgroundLoadError("Failed to load orders in records", err, setError);
      setBookingInRows([]);
    } finally {
      setGridLoading(false);
    }
  }, [formSupplierId]);

  const loadOrderBookingInRows = useCallback(async (ordersInId) => {
    const id = parseInteger(ordersInId);
    if (id == null) {
      setOrderBookingInRows([]);
      return;
    }

    setOrderItemsGridLoading(true);

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc(
        "pr_order_booking_in",
        { p_orders_in_id: id }
      );
      if (rpcError) throw rpcError;
      setOrderBookingInRows(normalizeOrderBookingInRows(data));
    } catch (err) {
      reportBackgroundLoadError("Failed to load order items", err, setError);
      setOrderBookingInRows([]);
    } finally {
      setOrderItemsGridLoading(false);
    }
  }, []);

  const loadActionUser = useCallback(async () => {
    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const user = await getSessionUser(supabase);
      setActionUser(sessionUserLabel(user));
    } catch (err) {
      reportBackgroundLoadError("Failed to load signed-in user", err, setError);
    }
  }, []);

  useEffect(() => {
    if (!isOrdersIn) {
      loadBookingInTypes();
    }
    loadReturnReasons();
    loadSuppliers();
    loadActionUser();
    if (isOrdersIn) {
      loadOrderStatuses();
    }
  }, [
    loadBookingInTypes,
    loadReturnReasons,
    loadSuppliers,
    loadActionUser,
    loadOrderStatuses,
    isOrdersIn,
  ]);

  useEffect(() => {
    if (isOrdersIn) return;

    if (
      gridFilter === GRID_FILTER_ALL ||
      gridFilter === GRID_FILTER_LAST_THREE_MONTHS
    ) {
      loadBookingInRows({ filter: gridFilter });
    }
  }, [gridFilter, loadBookingInRows, isOrdersIn]);

  useEffect(() => {
    if (isOrdersIn) return;

    if (gridFilter === GRID_FILTER_BY_STOCK_CODE) {
      loadBookingInRows({ filter: gridFilter, stockCode });
    }
  }, [gridFilter, stockCode, loadBookingInRows, isOrdersIn]);

  useEffect(() => {
    if (!isOrdersIn) return;
    loadOrdersInRows();
  }, [isOrdersIn, formSupplierId, loadOrdersInRows]);

  useEffect(() => {
    async function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;

      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      if (isOrdersIn) {
        await loadOrdersInRows();
      } else {
        await loadBookingInRows();
      }
      await loadActionUser();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadBookingInRows, loadOrdersInRows, loadActionUser, isOrdersIn]);

  const selectedBookingInType = bookingInTypeOptions.find(
    (option) => optionValue(option) === bookingInTypeId
  );
  const selectedBookingInTypeLabel = selectedBookingInType
    ? optionLabel(selectedBookingInType)
    : "";
  const returnReasonVisible = showsReturnReason(selectedBookingInTypeLabel);

  function handleBookingInTypeChange(nextBookingInTypeId) {
    setBookingInTypeId(nextBookingInTypeId);

    const nextBookingInType = bookingInTypeOptions.find(
      (option) => optionValue(option) === nextBookingInTypeId
    );
    const nextLabel = nextBookingInType ? optionLabel(nextBookingInType) : "";

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
    setQtyDelivered("");
    setOrderItemId("");
    setUnitPrice("");
    setBookingDate(todayIsoDate());
    setBookingInTypeId("");
    setReturnReasonId("");
    setFormSupplierId("");
    setOrderStatusId("");
    setOrderPlacedDate(todayIsoDate());
    setComments("");
    setBookingInId("");
    setSelectedId(null);
    setSelectedOrderItemId(null);
    setOrderBookingInRows([]);
    setRecordActionUser("");
    setEditMode(false);
    setDeleteConfirmOpen(false);
    setError("");
    setSuccess("");
  }

  async function refreshAfterAction(successMessage) {
    setSuccess(successMessage);
    initializeForm();
    if (isOrdersIn) {
      await loadOrdersInRows("");
    } else {
      const codeToReload = stockCode.trim();
      await loadBookingInRows({
        filter: gridFilter,
        stockCode:
          gridFilter === GRID_FILTER_BY_STOCK_CODE ? codeToReload : "",
      });
    }
  }

  function buildOrderBookingInPayload() {
    return {
      p_stock_item_id: parseInteger(stockItemId),
      p_qty: 0,
      p_booked_in_date: orderPlacedDate,
      p_supplier_id: parseInteger(formSupplierId),
      p_booking_in_type_id: 5,
      p_action_user: actionUser.trim(),
      p_orders_in_id: parseInteger(bookingInId),
      p_unit_price: parseFloatValue(unitPrice),
      p_qty_reserved: parseInteger(quantity),
    };
  }

  function buildOrderBookingInAmendPayload() {
    return {
      p_id: parseInteger(orderItemId),
      p_stock_item_id: parseInteger(stockItemId),
      p_qty: parseFloatValue(qtyDelivered),
      p_booked_in_date: orderPlacedDate,
      p_supplier_id: parseInteger(formSupplierId),
      p_booking_in_type_id: 5,
      p_action_user: actionUser.trim(),
      p_orders_in_id: parseInteger(bookingInId),
      p_unit_price: parseFloatValue(unitPrice),
      p_qty_reserved: parseFloatValue(quantity),
    };
  }

  function buildOrderInPayload() {
    return {
      p_supplier_id: parseInteger(formSupplierId),
      p_date_placed: orderPlacedDate,
      p_action_user: actionUser.trim(),
      p_comments: comments.trim(),
    };
  }

  function buildBookingInPayload() {
    return {
      p_stock_item_id: parseInteger(stockItemId),
      p_qty: parseFloatValue(quantity),
      p_booked_in_date: isOrdersIn ? orderPlacedDate : bookingDate,
      p_supplier_id: parseInteger(formSupplierId),
      p_booking_in_type_id: parseInteger(bookingInTypeId),
      p_return_reason_id: returnReasonVisible
        ? parseInteger(returnReasonId)
        : null,
      p_comments: comments.trim(),
      p_action_user: actionUser,
      p_unit_price: parseFloatValue(unitPrice),
    };
  }

  function buildOrderInChangePayload() {
    return {
      p_id: parseInteger(bookingInId),
      p_supplier_id: parseInteger(formSupplierId),
      p_date_placed: orderPlacedDate,
      p_date_delivered: orderPlacedDate,
      p_order_status_id: parseInteger(orderStatusId),
      p_comments: comments.trim(),
    };
  }

  function buildChangePayload() {
    const insertPayload = buildBookingInPayload();

    return {
      p_id: parseInteger(bookingInId),
      ...insertPayload,
    };
  }

  function isMandatoryFieldsValid() {
    if (isOrdersIn) {
      return isNonZeroInteger(formSupplierId);
    }

    if (!stockCode.trim()) return false;
    if (!isNonZeroInteger(stockItemId)) return false;
    if (parseFloatValue(quantity) == null) return false;
    if (!parseInteger(bookingInTypeId)) return false;
    return true;
  }

  function isChangeFormValid() {
    if (parseInteger(bookingInId) == null) return false;
    return isMandatoryFieldsValid();
  }

  function isAddFormValid() {
    return isNonZeroInteger(stockItemId);
  }

  function isAmendFormValid() {
    return isNonZeroInteger(orderItemId) && isNonZeroInteger(stockItemId);
  }

  function isRemoveOrderItemValid() {
    return isNonZeroInteger(orderItemId);
  }

  function isSaveFormValid() {
    return isMandatoryFieldsValid();
  }

  function clearOrderItemFields() {
    setStockCode("");
    setDescription("");
    setStockItemId("");
    setQuantity("");
    setQtyDelivered("");
    setOrderItemId("");
    setUnitPrice("");
    setSelectedOrderItemId(null);
  }

  function handleNewOrderItem() {
    clearOrderItemFields();
  }

  function handleOrderItemRowClick(row) {
    setOrderItemId(row.id != null ? String(row.id) : "");
    setStockItemId(
      row.stock_item_id != null ? String(row.stock_item_id) : ""
    );
    setStockCode(row.stock_code ?? "");
    setDescription(row.descr ?? "");
    setQuantity(row.qty_reserved != null ? String(row.qty_reserved) : "");
    setQtyDelivered(
      row.qty_delivered != null ? String(row.qty_delivered) : ""
    );
    setUnitPrice(formatUnitPrice(row.unit_price));
    setSelectedOrderItemId(row.id ?? null);
    setError("");
    setSuccess("");
  }

  async function handleAdd() {
    if (!isAddFormValid()) {
      setError("Stock item is required.");
      setSuccess("");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc(
        "pi_order_booking_in",
        buildOrderBookingInPayload()
      );
      if (rpcError) throw rpcError;
      setSuccess("Order booking in saved.");
      clearOrderItemFields();
      await loadOrderBookingInRows(bookingInId);
    } catch (err) {
      setError(err.message ?? "Failed to add order booking in");
    } finally {
      setLoading(false);
    }
  }

  async function handleAmend() {
    if (!isAmendFormValid()) {
      setError("Select an order item to amend.");
      setSuccess("");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc(
        "pu_order_booking_in",
        buildOrderBookingInAmendPayload()
      );
      if (rpcError) throw rpcError;
      setSuccess("Order item updated.");
      await loadOrderBookingInRows(bookingInId);
    } catch (err) {
      setError(err.message ?? "Failed to amend order item");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveOrderItem() {
    if (!isRemoveOrderItemValid()) {
      setError("Select an order item to remove.");
      setSuccess("");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("pd_order_booking_in", {
        p_id: parseInteger(orderItemId),
      });
      if (rpcError) throw rpcError;
      setSuccess("Order item removed.");
      clearOrderItemFields();
      await loadOrderBookingInRows(bookingInId);
    } catch (err) {
      setError(err.message ?? "Failed to remove order item");
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
      if (isOrdersIn) {
        const { error: rpcError } = await supabase.rpc(
          "pi_order_in",
          buildOrderInPayload()
        );
        if (rpcError) throw rpcError;
        await refreshAfterAction("Order in saved.");
      } else {
        const { error: rpcError } = await supabase.rpc(
          "pi_booking_in",
          buildBookingInPayload()
        );
        if (rpcError) throw rpcError;
        await refreshAfterAction("Booking in saved.");
      }
    } catch (err) {
      setError(
        err.message ??
          (isOrdersIn ? "Failed to save order in" : "Failed to save booking in")
      );
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
      if (isOrdersIn) {
        const { error: rpcError } = await supabase.rpc(
          "pu_order_in",
          buildOrderInChangePayload()
        );
        if (rpcError) throw rpcError;
        await refreshAfterAction("Order in updated.");
      } else {
        const { error: rpcError } = await supabase.rpc(
          "pu_booking_in",
          buildChangePayload()
        );
        if (rpcError) throw rpcError;
        await refreshAfterAction("Booking in updated.");
      }
    } catch (err) {
      setError(
        err.message ??
          (isOrdersIn
            ? "Failed to update order in"
            : "Failed to update booking in")
      );
    } finally {
      setLoading(false);
    }
  }

  function handleDeleteClick() {
    if (!bookingInId) return;
    setDeleteConfirmOpen(true);
  }

  async function handleDeleteConfirm() {
    const id = parseInteger(bookingInId);
    if (id == null) return;

    setLoading(true);
    setError("");
    setSuccess("");
    setDeleteConfirmOpen(false);

    try {
      const supabase = createClient();
      if (isOrdersIn) {
        const { error: rpcError } = await supabase.rpc("pd_order_in", {
          p_id: id,
        });
        if (rpcError) throw rpcError;
        await refreshAfterAction("Order in deleted.");
      } else {
        const { error: rpcError } = await supabase.rpc("pd_booking_in", {
          p_id: id,
        });
        if (rpcError) throw rpcError;
        await refreshAfterAction("Booking in deleted.");
      }
    } catch (err) {
      setError(
        err.message ??
          (isOrdersIn ? "Failed to delete order in" : "Failed to delete booking in")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRowClick(row) {
    if (isOrdersIn) {
      setFormSupplierId(row.supplier_id != null ? String(row.supplier_id) : "");
      setOrderStatusId(
        row.order_status_id != null ? String(row.order_status_id) : ""
      );
      setOrderPlacedDate(toIsoDate(row.date_placed));
      setBookingInId(row.id != null ? String(row.id) : "");
      setRecordActionUser(row.action_user ?? "");
      setComments(row.comments ?? "");
      setSelectedId(row.id ?? null);
      setEditMode(true);
      setError("");
      setSuccess("");
      clearOrderItemFields();
      await loadOrderBookingInRows(row.id);
      return;
    }

    setStockCode(row.stock_code ?? "");
    setDescription(row.description ?? "");
    setStockItemId(
      row.stock_item_id != null ? String(row.stock_item_id) : ""
    );
    setQuantity(row.qty != null ? String(row.qty) : "");
    setUnitPrice(formatUnitPrice(row.unit_price));
    setBookingDate(toIsoDate(row.booked_in_date));
    setBookingInTypeId(
      row.booking_in_type_id != null ? String(row.booking_in_type_id) : ""
    );
    setReturnReasonId(
      row.return_reason_id != null ? String(row.return_reason_id) : ""
    );
    setFormSupplierId(row.supplier_id != null ? String(row.supplier_id) : "");
    setOrderStatusId(
      row.order_status_id != null ? String(row.order_status_id) : ""
    );
    setOrderPlacedDate(
      toIsoDate(row.order_placed_date ?? row.placed_date ?? row.booked_in_date)
    );
    setComments(row.comments ?? "");
    setBookingInId(row.id != null ? String(row.id) : "");
    setRecordActionUser(row.action_user ?? "");
    setSelectedId(row.id ?? null);
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

  return (
    <div className="mt-4 w-full">
      {!isOrdersIn ? (
        <input
          type="text"
          name="stock_item_id"
          value={stockItemId}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          className="hidden"
        />
      ) : null}
      {isOrdersIn ? (
        <input
          type="text"
          name="order_status_id"
          value={orderStatusId}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          className="hidden"
        />
      ) : null}

      <form className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {numberFieldLabel}
          </span>
          <input
            type="text"
            name="id"
            value={bookingInId}
            readOnly
            tabIndex={-1}
            className={`${readOnlyInputClassName} w-full sm:max-w-xs`}
          />
        </label>

        {isOrdersIn ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Supplier
                  <RequiredMarker />
                </span>
                <select
                  value={formSupplierId}
                  onChange={(e) => setFormSupplierId(e.target.value)}
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

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Order Status
                </span>
                <select
                  value={orderStatusId}
                  onChange={(e) => setOrderStatusId(e.target.value)}
                  disabled={orderStatusesLoading}
                  className={inputClassName}
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
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Order Placed Date
                </span>
                <input
                  type="date"
                  value={orderPlacedDate}
                  onChange={(e) => setOrderPlacedDate(e.target.value)}
                  className={inputClassName}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Action User
                </span>
                <input
                  type="text"
                  value={recordActionUser}
                  readOnly
                  tabIndex={-1}
                  className={readOnlyInputClassName}
                />
              </label>
            </div>
          </>
        ) : null}

        {isOrdersIn ? (
          <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleItemsSectionToggle}
              aria-expanded={itemsExpanded}
              disabled={!canExpandItemsSection && !itemsExpanded}
              className={`flex w-full items-center rounded-t-lg px-3 py-2 text-left text-sm font-medium text-zinc-800 dark:text-zinc-200 ${
                canExpandItemsSection || itemsExpanded
                  ? "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  : "cursor-not-allowed opacity-60"
              }`}
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
              <div className="flex flex-col gap-4 border-t border-zinc-200 p-4 dark:border-zinc-800">
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
                  stockCodeRequired={!isOrdersIn}
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Qty Ordered
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
                      Qty Delivered
                    </span>
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={qtyDelivered}
                      onChange={(e) => setQtyDelivered(e.target.value)}
                      className={`${inputClassName} w-full`}
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Unit Price
                    </span>
                    <input
                      type="text"
                      value={unitPrice}
                      readOnly
                      tabIndex={-1}
                      className={`${readOnlyInputClassName} w-full`}
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
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={loading}
                    className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={handleAmend}
                    disabled={loading}
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
                </div>

                <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
                      <tr>
                        <th className="hidden px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                          id
                        </th>
                        <th className="hidden px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                          stock_item_id
                        </th>
                        <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                          Stock Code
                        </th>
                        <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                          Description
                        </th>
                        <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                          Qty Delivered
                        </th>
                        <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                          Qty Ordered
                        </th>
                        <th className="hidden px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                          unit_price
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderItemsGridLoading ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                          >
                            Loading…
                          </td>
                        </tr>
                      ) : orderBookingInRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                          >
                            No order items found.
                          </td>
                        </tr>
                      ) : (
                        orderBookingInRows.map((row) => (
                          <tr
                            key={row.rowKey}
                            onClick={() => handleOrderItemRowClick(row)}
                            className={`cursor-pointer border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 ${
                              selectedOrderItemId === row.id
                                ? "bg-sky-50 dark:bg-sky-900/20"
                                : ""
                            }`}
                          >
                            <td className="hidden px-4 py-2 text-zinc-800 dark:text-zinc-200">
                              {row.id ?? ""}
                            </td>
                            <td className="hidden px-4 py-2 text-zinc-800 dark:text-zinc-200">
                              {row.stock_item_id ?? ""}
                            </td>
                            <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                              {row.stock_code}
                            </td>
                            <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                              {row.descr}
                            </td>
                            <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                              {row.qty_delivered ?? ""}
                            </td>
                            <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                              {row.qty_reserved ?? ""}
                            </td>
                            <td className="hidden px-4 py-2 text-zinc-800 dark:text-zinc-200">
                              {row.unit_price ?? ""}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <>
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Quantity
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
                  type="text"
                  value={unitPrice}
                  readOnly
                  tabIndex={-1}
                  className={`${readOnlyInputClassName} w-full`}
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
          </>
        )}

        {!isOrdersIn ? (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-1">
              <label className="flex w-full flex-col gap-1 sm:max-w-xs sm:flex-1">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Book-in type
                  <RequiredMarker />
                </span>
                <select
                  value={bookingInTypeId}
                  onChange={(e) => handleBookingInTypeChange(e.target.value)}
                  disabled={bookingInTypesLoading}
                  className={`${inputClassName} w-full`}
                >
                  <option value="">
                    {bookingInTypesLoading ? "Loading…" : SELECT_PLACEHOLDER}
                  </option>
                  {bookingInTypeOptions.map((option, index) => (
                    <option
                      key={option.id ?? `booking-in-type-${index}`}
                      value={optionValue(option)}
                    >
                      {optionLabel(option)}
                    </option>
                  ))}
                </select>
              </label>

              {returnReasonVisible ? (
                <label className="flex w-full flex-col gap-1 sm:max-w-xs sm:flex-1">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Return Reason
                  </span>
                  <select
                    value={returnReasonId}
                    onChange={(e) => setReturnReasonId(e.target.value)}
                    disabled={returnReasonsLoading}
                    className={inputClassName}
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
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Date
                </span>
                <input
                  type="date"
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  className={inputClassName}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Action User
                </span>
                <input
                  type="text"
                  value={recordActionUser}
                  readOnly
                  tabIndex={-1}
                  className={readOnlyInputClassName}
                />
              </label>
            </div>
          </div>
        ) : null}

        {!isOrdersIn ? (
          <label className="flex w-full flex-col gap-1 sm:max-w-xs">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Supplier
            </span>
            <select
              value={formSupplierId}
              onChange={(e) => setFormSupplierId(e.target.value)}
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
        ) : null}

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Comments
          </span>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={3}
            className={inputClassName}
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
        {!editMode && (
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || !isSaveFormValid()}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save"}
          </button>
        )}

        {editMode && (
          <>
            <button
              type="button"
              onClick={handleNew}
              className="rounded bg-sky-200 px-4 py-2 text-sm font-medium text-sky-900 hover:bg-sky-300 dark:bg-sky-900/40 dark:text-sky-100 dark:hover:bg-sky-900/60"
            >
              New
            </button>
            <button
              type="button"
              onClick={handleChange}
              disabled={loading || !isChangeFormValid() || !bookingInId}
              className="rounded bg-orange-200 px-4 py-2 text-sm font-medium text-orange-900 hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-900/40 dark:text-orange-100 dark:hover:bg-orange-900/60"
            >
              {loading ? "Saving…" : "Change"}
            </button>
            <button
              type="button"
              onClick={handleDeleteClick}
              disabled={loading || !bookingInId}
              className="rounded bg-red-200 px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-900/60"
            >
              {loading ? "Saving…" : "Delete"}
            </button>
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
              {isOrdersIn
                ? ORDER_IN_DELETE_CONFIRM_MESSAGE
                : DELETE_CONFIRM_MESSAGE}
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

      {!isOrdersIn ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
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
        </div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
            {isOrdersIn ? (
              <tr>
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  No.
                </th>
                <th className="hidden px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  supplier_id
                </th>
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  Supplier
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
                  Qty On Hand
                </th>
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  Qty Reserved
                </th>
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  Booked In Type
                </th>
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  Date
                </th>
              </tr>
            )}
          </thead>
          <tbody>
            {gridLoading ? (
              <tr key={isOrdersIn ? "orders-in-loading" : "booking-in-loading"}>
                <td
                  colSpan={isOrdersIn ? 8 : 7}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  Loading…
                </td>
              </tr>
            ) : bookingInRows.length === 0 ? (
              <tr key={isOrdersIn ? "orders-in-empty" : "booking-in-empty"}>
                <td
                  colSpan={isOrdersIn ? 8 : 7}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  {isOrdersIn
                    ? "No orders in records found."
                    : "No booking in records found."}
                </td>
              </tr>
            ) : isOrdersIn ? (
              bookingInRows.map((row) => (
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
                    {row.supplier_id ?? ""}
                  </td>
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.supplier}
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
              bookingInRows.map((row) => (
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
                    {row.stock_code}
                  </td>
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.description}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {row.qty}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {row.qty_reserved ?? ""}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {row.booked_in_type}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {toIsoDate(row.booked_in_date)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
