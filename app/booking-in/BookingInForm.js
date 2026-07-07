"use client";

import { StockItemLookupFields } from "@/components/StockItemLookupFields";
import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useState } from "react";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

const SELECT_PLACEHOLDER = " -SELECT- ";
const DELETE_CONFIRM_MESSAGE = "Please Confirn To Delete The Selected Entry";

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

function showsReturnReason(bookingInTypeLabel) {
  const label = bookingInTypeLabel.trim();
  return label === "Returned" || label === "Credit";
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
    booked_in_date: row.booked_in_date ?? row.booking_date ?? null,
    supplier_id: row.supplier_id ?? null,
    booking_in_type_id: row.booking_in_type_id ?? null,
    return_reason_id: row.return_reason_id ?? null,
    comments: row.comments ?? "",
    rowKey:
      row.id != null
        ? `booking-in-${row.id}`
        : `booking-in-row-${index}-${row.stock_code ?? "unknown"}`,
  }));
}

export function BookingInForm() {
  const [stockCode, setStockCode] = useState("");
  const [description, setDescription] = useState("");
  const [stockItemId, setStockItemId] = useState("");
  const [quantity, setQuantity] = useState("");
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
  const [comments, setComments] = useState("");
  const [bookingInId, setBookingInId] = useState("");
  const [bookingInRows, setBookingInRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [gridLoading, setGridLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [actionUser, setActionUser] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadBookingInTypes = useCallback(async () => {
    setBookingInTypesLoading(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "pr_booking_in_types_active"
      );
      if (rpcError) throw rpcError;
      setBookingInTypeOptions(toOptions(data));
    } catch (err) {
      setError(err.message ?? "Failed to load book-in types");
    } finally {
      setBookingInTypesLoading(false);
    }
  }, []);

  const loadReturnReasons = useCallback(async () => {
    setReturnReasonsLoading(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "pr_return_reasons_active"
      );
      if (rpcError) throw rpcError;
      setReturnReasonOptions(toOptions(data));
    } catch (err) {
      setError(err.message ?? "Failed to load return reasons");
    } finally {
      setReturnReasonsLoading(false);
    }
  }, []);

  const loadSuppliers = useCallback(async () => {
    setSuppliersLoading(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "pr_suppliers_active"
      );
      if (rpcError) throw rpcError;
      setSupplierOptions(toOptions(data));
    } catch (err) {
      setError(err.message ?? "Failed to load suppliers");
    } finally {
      setSuppliersLoading(false);
    }
  }, []);

  const loadBookingInRows = useCallback(async (stockCodeParam) => {
    const searchCode = (stockCodeParam ?? stockCode).trim();
    setGridLoading(true);

    try {
      if (!searchCode) {
        setBookingInRows([]);
        return;
      }

      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "pr_booking_in_by_stock_code",
        { p_stock_code: searchCode }
      );
      if (rpcError) throw rpcError;
      setBookingInRows(normalizeBookingInRows(data));
    } catch (err) {
      setError(err.message ?? "Failed to load booking in records");
      setBookingInRows([]);
    } finally {
      setGridLoading(false);
    }
  }, [stockCode]);

  const loadActionUser = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setActionUser(
      user?.email ??
        user?.user_metadata?.username ??
        user?.user_metadata?.user_name ??
        ""
    );
  }, []);

  useEffect(() => {
    loadBookingInTypes();
    loadReturnReasons();
    loadSuppliers();
    loadActionUser();
  }, [loadBookingInTypes, loadReturnReasons, loadSuppliers, loadActionUser]);

  useEffect(() => {
    loadBookingInRows();
  }, [loadBookingInRows]);

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

  function handleStockItemSelect(row) {
    setStockCode(row.stock_code ?? "");
    setDescription(row.stock_item ?? "");
    setStockItemId(row.id != null ? String(row.id) : "");
  }

  function initializeForm() {
    setStockCode("");
    setDescription("");
    setStockItemId("");
    setQuantity("");
    setBookingDate(todayIsoDate());
    setBookingInTypeId("");
    setReturnReasonId("");
    setFormSupplierId("");
    setComments("");
    setBookingInId("");
    setSelectedId(null);
    setEditMode(false);
    setDeleteConfirmOpen(false);
    setError("");
    setSuccess("");
  }

  async function refreshAfterAction(successMessage) {
    const codeToReload = stockCode.trim();
    setSuccess(successMessage);
    initializeForm();
    await loadBookingInRows(codeToReload);
  }

  function buildBookingInPayload() {
    return {
      p_stock_item_id: parseInteger(stockItemId),
      p_qty: parseFloatValue(quantity),
      p_booked_in_date: bookingDate,
      p_supplier_id: parseInteger(formSupplierId),
      p_booking_in_type_id: parseInteger(bookingInTypeId),
      p_return_reason_id: returnReasonVisible
        ? parseInteger(returnReasonId)
        : null,
      p_comments: comments.trim(),
      p_action_user: actionUser,
    };
  }

  function buildChangePayload() {
    const insertPayload = buildBookingInPayload();

    return {
      p_id: insertPayload.p_stock_item_id,
      ...insertPayload,
    };
  }

  function isChangeFormValid() {
    const payload = buildChangePayload();
    if (!payload.p_id || !payload.p_stock_item_id || payload.p_qty == null || !bookingDate) {
      return false;
    }
    if (!payload.p_supplier_id || !payload.p_booking_in_type_id) {
      return false;
    }
    if (returnReasonVisible && !payload.p_return_reason_id) {
      return false;
    }
    if (!payload.p_action_user) {
      return false;
    }
    return true;
  }

  function isSaveFormValid() {
    const payload = buildBookingInPayload();
    if (!payload.p_stock_item_id || payload.p_qty == null || !bookingDate) {
      return false;
    }
    if (!payload.p_supplier_id || !payload.p_booking_in_type_id) {
      return false;
    }
    if (returnReasonVisible && !payload.p_return_reason_id) {
      return false;
    }
    if (!payload.p_action_user) {
      return false;
    }
    return true;
  }

  async function handleSave() {
    if (!isSaveFormValid()) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc(
        "pi_booking_in",
        buildBookingInPayload()
      );
      if (rpcError) throw rpcError;
      await refreshAfterAction("Booking in saved.");
    } catch (err) {
      setError(err.message ?? "Failed to save booking in");
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
        "pu_booking_in",
        buildChangePayload()
      );
      if (rpcError) throw rpcError;
      await refreshAfterAction("Booking in updated.");
    } catch (err) {
      setError(err.message ?? "Failed to update booking in");
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
      const { error: rpcError } = await supabase.rpc("pd_booking_in", {
        p_id: id,
      });
      if (rpcError) throw rpcError;
      await refreshAfterAction("Booking in deleted.");
    } catch (err) {
      setError(err.message ?? "Failed to delete booking in");
    } finally {
      setLoading(false);
    }
  }

  function handleRowClick(row) {
    setStockCode(row.stock_code ?? "");
    setDescription(row.description ?? "");
    setStockItemId(
      row.stock_item_id != null ? String(row.stock_item_id) : ""
    );
    setQuantity(row.qty != null ? String(row.qty) : "");
    setBookingDate(toIsoDate(row.booked_in_date));
    setBookingInTypeId(
      row.booking_in_type_id != null ? String(row.booking_in_type_id) : ""
    );
    setReturnReasonId(
      row.return_reason_id != null ? String(row.return_reason_id) : ""
    );
    setFormSupplierId(row.supplier_id != null ? String(row.supplier_id) : "");
    setComments(row.comments ?? "");
    setBookingInId(row.id != null ? String(row.id) : "");
    setSelectedId(row.id ?? null);
    setEditMode(true);
    setError("");
    setSuccess("");
  }

  function handleNew() {
    initializeForm();
  }

  return (
    <div className="mt-4 max-w-5xl">
      <input
        type="text"
        value={bookingInId}
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
        />

        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex w-full flex-col gap-4">
            <label className="flex w-full flex-col gap-1 sm:w-40 sm:shrink-0">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Quantity
              </span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={inputClassName}
              />
            </label>

            <div className="flex flex-col gap-4 sm:w-80 sm:flex-row">
              <label className="flex w-full flex-col gap-1 sm:w-40 sm:shrink-0">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Book-in type
                </span>
                <select
                  value={bookingInTypeId}
                  onChange={(e) => handleBookingInTypeChange(e.target.value)}
                  disabled={bookingInTypesLoading}
                  className={inputClassName}
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
                <label className="flex w-full flex-col gap-1 sm:w-40 sm:shrink-0">
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

            <label className="flex w-full flex-col gap-1 sm:w-80 sm:shrink-0">
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
          </div>

          <label className="flex w-full flex-col gap-1 sm:w-48 sm:shrink-0">
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

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
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
              <tr key="booking-in-loading">
                <td
                  colSpan={4}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  Loading…
                </td>
              </tr>
            ) : bookingInRows.length === 0 ? (
              <tr key="booking-in-empty">
                <td
                  colSpan={4}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  No booking in records found.
                </td>
              </tr>
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
                    {row.stock_code}
                  </td>
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.description}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {row.qty}
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
