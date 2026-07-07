"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useState } from "react";

function formatActive(value) {
  return value === true || value === "true" || value === 1 || value === "1"
    ? "Active"
    : "Inactive";
}

function normalizeBookingOutTypes(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    id: row.id ?? row.booking_out_type_id ?? null,
    descr: row.descr ?? "",
    is_active: row.is_active,
    rowKey:
      row.id != null
        ? `booking-out-type-${row.id}`
        : `booking-out-type-row-${index}-${row.descr ?? "unknown"}`,
  }));
}

export function BookingOutTypeForm() {
  const [bookingOutType, setBookingOutType] = useState("");
  const [active, setActive] = useState(true);
  const [bookingOutTypeId, setBookingOutTypeId] = useState("");
  const [bookingOutTypes, setBookingOutTypes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [gridLoading, setGridLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editMode, setEditMode] = useState(false);

  const loadBookingOutTypes = useCallback(async () => {
    setGridLoading(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("pr_booking_out_types");
      if (rpcError) throw rpcError;
      setBookingOutTypes(normalizeBookingOutTypes(data));
    } catch (err) {
      setError(err.message ?? "Failed to load booking out types");
    } finally {
      setGridLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBookingOutTypes();
  }, [loadBookingOutTypes]);

  function initializeForm() {
    setBookingOutType("");
    setActive(true);
    setBookingOutTypeId("");
    setSelectedId(null);
    setEditMode(false);
    setError("");
    setSuccess("");
  }

  async function refreshAfterAction(successMessage) {
    setSuccess(successMessage);
    initializeForm();
    await loadBookingOutTypes();
  }

  async function handleSave() {
    const bookingOutTypeName = bookingOutType.trim();
    if (!bookingOutTypeName) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("pi_booking_out_types", {
        p_booking_out_types: bookingOutTypeName,
      });

      if (rpcError) throw rpcError;

      setSuccess("Booking out type saved.");
      initializeForm();
      await loadBookingOutTypes();
    } catch (err) {
      setError(err.message ?? "Failed to save booking out type");
    } finally {
      setLoading(false);
    }
  }

  function handleRowClick(row) {
    setBookingOutType(row.descr ?? "");
    setActive(
      row.is_active === true ||
        row.is_active === "true" ||
        row.is_active === 1 ||
        row.is_active === "1"
    );
    setBookingOutTypeId(row.id != null ? String(row.id) : "");
    setSelectedId(row.id ?? null);
    setEditMode(true);
    setError("");
    setSuccess("");
  }

  function handleNew() {
    initializeForm();
  }

  async function handleChange() {
    const bookingOutTypeName = bookingOutType.trim();
    const id = Number.parseInt(bookingOutTypeId, 10);
    if (!bookingOutTypeName || Number.isNaN(id)) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("pu_booking_out_types", {
        p_id: id,
        p_booking_out_types: bookingOutTypeName,
        p_is_active: active,
      });

      if (rpcError) throw rpcError;

      await refreshAfterAction("Booking out type updated.");
    } catch (err) {
      setError(err.message ?? "Failed to update booking out type");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeactivate() {
    const id = Number.parseInt(bookingOutTypeId, 10);
    if (Number.isNaN(id)) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("pd_booking_out_types", {
        p_id: id,
      });

      if (rpcError) throw rpcError;

      await refreshAfterAction("Booking out type deactivated.");
    } catch (err) {
      setError(err.message ?? "Failed to deactivate booking out type");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 max-w-3xl">
      <input
        type="text"
        value={bookingOutTypeId}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
      />

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Booking Out Type
        </span>
        <input
          type="text"
          value={bookingOutType}
          onChange={(e) => setBookingOutType(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
        />
      </label>

      <div className="mt-4 flex items-center gap-3">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Status
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-label={active ? "Active" : "Inactive"}
          onClick={() => setActive((value) => !value)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            active ? "bg-emerald-600" : "bg-zinc-400 dark:bg-zinc-600"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              active ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {active ? "Active" : "Inactive"}
        </span>
      </div>

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
            disabled={loading || !bookingOutType.trim()}
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
              disabled={loading || !bookingOutType.trim() || !bookingOutTypeId}
              className="rounded bg-orange-200 px-4 py-2 text-sm font-medium text-orange-900 hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-900/40 dark:text-orange-100 dark:hover:bg-orange-900/60"
            >
              {loading ? "Saving…" : "Change"}
            </button>
            <button
              type="button"
              onClick={handleDeactivate}
              disabled={loading || !bookingOutTypeId}
              className="rounded bg-red-200 px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-900/60"
            >
              {loading ? "Saving…" : "Deactivate"}
            </button>
          </>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
            <tr>
              <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                Booking Out Type
              </th>
              <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                ActIve
              </th>
            </tr>
          </thead>
          <tbody>
            {gridLoading ? (
              <tr key="booking-out-types-loading">
                <td
                  colSpan={2}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  Loading…
                </td>
              </tr>
            ) : bookingOutTypes.length === 0 ? (
              <tr key="booking-out-types-empty">
                <td
                  colSpan={2}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  No booking out types found.
                </td>
              </tr>
            ) : (
              bookingOutTypes.map((row) => (
                <tr
                  key={row.rowKey}
                  onClick={() => handleRowClick(row)}
                  className={`cursor-pointer border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 ${
                    selectedId === row.id
                      ? "bg-sky-50 dark:bg-sky-900/20"
                      : ""
                  }`}
                >
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.descr}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {formatActive(row.is_active)}
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
