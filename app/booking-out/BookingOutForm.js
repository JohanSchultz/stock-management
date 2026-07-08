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

function showsReturnReason(bookingOutTypeLabel) {
  const label = bookingOutTypeLabel.trim();
  return label === "Returned" || label === "Credit";
}

function reportBackgroundLoadError(context, err, setError) {
  if (isFetchFailure(err)) {
    console.warn(`${context}: network error after idle or offline`, err);
    return;
  }

  setError(err.message ?? context);
}

function normalizeBookingOutRows(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    id: row.id ?? row.booking_out_id ?? null,
    stock_item_id: row.stock_item_id ?? null,
    stock_code: row.stock_code ?? "",
    description: row.description ?? "",
    stock_item: row.stock_item ?? row.descr ?? "",
    qty: row.qty ?? row.quantity ?? null,
    unit_price: row.unit_price ?? row.unitPrice ?? null,
    booked_out_date: row.booked_out_date ?? row.booking_date ?? null,
    supplier_id: row.supplier_id ?? null,
    booking_out_type_id: row.booking_out_type_id ?? null,
    return_reason_id: row.return_reason_id ?? null,
    comments: row.comments ?? "",
    action_user: row.action_user ?? "",
    rowKey:
      row.id != null
        ? `booking-out-${row.id}`
        : `booking-out-row-${index}-${row.stock_code ?? "unknown"}`,
  }));
}

export function BookingOutForm() {
  useSupabaseIdleRecovery();

  const [stockCode, setStockCode] = useState("");
  const [description, setDescription] = useState("");
  const [stockItemId, setStockItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [bookingDate, setBookingDate] = useState(todayIsoDate);
  const [bookingOutTypeId, setBookingOutTypeId] = useState("");
  const [bookingOutTypeOptions, setBookingOutTypeOptions] = useState([]);
  const [bookingOutTypesLoading, setBookingOutTypesLoading] = useState(false);
  const [returnReasonId, setReturnReasonId] = useState("");
  const [returnReasonOptions, setReturnReasonOptions] = useState([]);
  const [returnReasonsLoading, setReturnReasonsLoading] = useState(false);
  const [comments, setComments] = useState("");
  const [bookingOutId, setBookingOutId] = useState("");
  const [bookingOutRows, setBookingOutRows] = useState([]);
  const [gridFilter, setGridFilter] = useState(GRID_FILTER_ALL);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [gridLoading, setGridLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [actionUser, setActionUser] = useState("");
  const [recordActionUser, setRecordActionUser] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const totalPrice = useMemo(
    () => computeTotalPrice(quantity, unitPrice),
    [quantity, unitPrice]
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
    loadBookingOutTypes();
    loadReturnReasons();
    loadActionUser();
  }, [loadBookingOutTypes, loadReturnReasons, loadActionUser]);

  useEffect(() => {
    if (
      gridFilter === GRID_FILTER_ALL ||
      gridFilter === GRID_FILTER_LAST_THREE_MONTHS
    ) {
      loadBookingOutRows({ filter: gridFilter });
    }
  }, [gridFilter, loadBookingOutRows]);

  useEffect(() => {
    if (gridFilter === GRID_FILTER_BY_STOCK_CODE) {
      loadBookingOutRows({ filter: gridFilter, stockCode });
    }
  }, [gridFilter, stockCode, loadBookingOutRows]);

  useEffect(() => {
    async function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;

      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      await loadBookingOutRows();
      await loadActionUser();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadBookingOutRows, loadActionUser]);

  const selectedBookingOutType = bookingOutTypeOptions.find(
    (option) => optionValue(option) === bookingOutTypeId
  );
  const selectedBookingOutTypeLabel = selectedBookingOutType
    ? optionLabel(selectedBookingOutType)
    : "";
  const returnReasonVisible = showsReturnReason(selectedBookingOutTypeLabel);

  function handleBookingOutTypeChange(nextBookingOutTypeId) {
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
    setUnitPrice("");
    setBookingDate(todayIsoDate());
    setBookingOutTypeId("");
    setReturnReasonId("");
    setComments("");
    setBookingOutId("");
    setSelectedId(null);
    setRecordActionUser("");
    setEditMode(false);
    setDeleteConfirmOpen(false);
    setError("");
    setSuccess("");
  }

  async function refreshAfterAction(successMessage) {
    const codeToReload = stockCode.trim();
    setSuccess(successMessage);
    initializeForm();
    await loadBookingOutRows({
      filter: gridFilter,
      stockCode:
        gridFilter === GRID_FILTER_BY_STOCK_CODE ? codeToReload : "",
    });
  }

  function buildBookingOutPayload() {
    return {
      p_stock_item_id: parseInteger(stockItemId),
      p_qty: parseFloatValue(quantity),
      p_booked_out_date: bookingDate,
      p_booking_out_type_id: parseInteger(bookingOutTypeId),
      p_return_reason_id: returnReasonVisible
        ? parseInteger(returnReasonId)
        : null,
      p_comments: comments.trim(),
      p_action_user: actionUser,
    };
  }

  function buildChangePayload() {
    const insertPayload = buildBookingOutPayload();

    return {
      p_id: parseInteger(bookingOutId),
      ...insertPayload,
    };
  }

  function isMandatoryFieldsValid() {
    if (!stockCode.trim()) return false;
    if (!isNonZeroInteger(stockItemId)) return false;
    if (parseFloatValue(quantity) == null) return false;
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

  async function handleSave() {
    if (!isSaveFormValid()) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc(
        "pi_booking_out",
        buildBookingOutPayload()
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
      const { error: rpcError } = await supabase.rpc(
        "pu_booking_out",
        buildChangePayload()
      );
      if (rpcError) throw rpcError;
      await refreshAfterAction("Booking out updated.");
    } catch (err) {
      setError(err.message ?? "Failed to update booking out");
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

  async function handleRowClick(row) {
    setStockCode(row.stock_code ?? "");
    setDescription(row.description ?? "");
    setStockItemId(
      row.stock_item_id != null ? String(row.stock_item_id) : ""
    );
    setQuantity(row.qty != null ? String(row.qty) : "");
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
      <input
        type="text"
        name="id"
        value={bookingOutId}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
      />
      <input
        type="text"
        name="stock_item_id"
        value={stockItemId}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
      />

      <form className="flex flex-col gap-4">
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

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-1">
            <label className="flex w-full flex-col gap-1 sm:max-w-xs sm:flex-1">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Book-out type
                <RequiredMarker />
              </span>
              <select
                value={bookingOutTypeId}
                onChange={(e) => handleBookingOutTypeChange(e.target.value)}
                disabled={bookingOutTypesLoading}
                className={`${inputClassName} w-full`}
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
              disabled={loading || !isChangeFormValid() || !bookingOutId}
              className="rounded bg-orange-200 px-4 py-2 text-sm font-medium text-orange-900 hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-900/40 dark:text-orange-100 dark:hover:bg-orange-900/60"
            >
              {loading ? "Saving…" : "Change"}
            </button>
            <button
              type="button"
              onClick={handleDeleteClick}
              disabled={loading || !bookingOutId}
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

      <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
            <tr>
              <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                Stock Code
              </th>
              <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                Description
              </th>
              <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                Quantity
              </th>
              <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                Date
              </th>
            </tr>
          </thead>
          <tbody>
            {gridLoading ? (
              <tr key="booking-out-loading">
                <td
                  colSpan={4}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  Loading…
                </td>
              </tr>
            ) : bookingOutRows.length === 0 ? (
              <tr key="booking-out-empty">
                <td
                  colSpan={4}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  No booking out records found.
                </td>
              </tr>
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
                    {row.stock_code}
                  </td>
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.description}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {row.qty}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {toIsoDate(row.booked_out_date)}
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
