"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useState } from "react";

function formatActive(value) {
  return value === true || value === "true" || value === 1 || value === "1"
    ? "Active"
    : "Inactive";
}

function normalizeBookingInTypes(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    id: row.id ?? row.booking_in_type_id ?? null,
    descr: row.descr ?? "",
    is_active: row.is_active,
    rowKey:
      row.id != null
        ? `booking-in-type-${row.id}`
        : `booking-in-type-row-${index}-${row.descr ?? "unknown"}`,
  }));
}

export function BookingInTypeForm() {
  const [bookingInType, setBookingInType] = useState("");
  const [active, setActive] = useState(true);
  const [bookingInTypeId, setBookingInTypeId] = useState("");
  const [bookingInTypes, setBookingInTypes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [gridLoading, setGridLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editMode, setEditMode] = useState(false);

  const loadBookingInTypes = useCallback(async () => {
    setGridLoading(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("pr_booking_in_types");
      if (rpcError) throw rpcError;
      setBookingInTypes(normalizeBookingInTypes(data));
    } catch (err) {
      setError(err.message ?? "Failed to load booking in types");
    } finally {
      setGridLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBookingInTypes();
  }, [loadBookingInTypes]);

  function initializeForm() {
    setBookingInType("");
    setActive(true);
    setBookingInTypeId("");
    setSelectedId(null);
    setEditMode(false);
    setError("");
    setSuccess("");
  }

  async function refreshAfterAction(successMessage) {
    setSuccess(successMessage);
    initializeForm();
    await loadBookingInTypes();
  }

  async function handleSave() {
    const bookingInTypeName = bookingInType.trim();
    if (!bookingInTypeName) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("pi_booking_in_types", {
        p_booking_in_types: bookingInTypeName,
      });

      if (rpcError) throw rpcError;

      setSuccess("Booking in type saved.");
      initializeForm();
      await loadBookingInTypes();
    } catch (err) {
      setError(err.message ?? "Failed to save booking in type");
    } finally {
      setLoading(false);
    }
  }

  function handleRowClick(row) {
    setBookingInType(row.descr ?? "");
    setActive(
      row.is_active === true ||
        row.is_active === "true" ||
        row.is_active === 1 ||
        row.is_active === "1"
    );
    setBookingInTypeId(row.id != null ? String(row.id) : "");
    setSelectedId(row.id ?? null);
    setEditMode(true);
    setError("");
    setSuccess("");
  }

  function handleNew() {
    initializeForm();
  }

  async function handleChange() {
    const bookingInTypeName = bookingInType.trim();
    const id = Number.parseInt(bookingInTypeId, 10);
    if (!bookingInTypeName || Number.isNaN(id)) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("pu_booking_in_types", {
        p_id: id,
        p_booking_in_types: bookingInTypeName,
        p_is_active: active,
      });

      if (rpcError) throw rpcError;

      await refreshAfterAction("Booking in type updated.");
    } catch (err) {
      setError(err.message ?? "Failed to update booking in type");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeactivate() {
    const id = Number.parseInt(bookingInTypeId, 10);
    if (Number.isNaN(id)) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("pd_booking_in_types", {
        p_id: id,
      });

      if (rpcError) throw rpcError;

      await refreshAfterAction("Booking in type deactivated.");
    } catch (err) {
      setError(err.message ?? "Failed to deactivate booking in type");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 max-w-3xl">
      <input
        type="text"
        value={bookingInTypeId}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
      />

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Booking In Type
        </span>
        <input
          type="text"
          value={bookingInType}
          onChange={(e) => setBookingInType(e.target.value)}
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
            disabled={loading || !bookingInType.trim()}
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
              disabled={loading || !bookingInType.trim() || !bookingInTypeId}
              className="rounded bg-orange-200 px-4 py-2 text-sm font-medium text-orange-900 hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-900/40 dark:text-orange-100 dark:hover:bg-orange-900/60"
            >
              {loading ? "Saving…" : "Change"}
            </button>
            <button
              type="button"
              onClick={handleDeactivate}
              disabled={loading || !bookingInTypeId}
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
                Booking In Type
              </th>
              <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                ActIve
              </th>
            </tr>
          </thead>
          <tbody>
            {gridLoading ? (
              <tr key="booking-in-types-loading">
                <td
                  colSpan={2}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  Loading…
                </td>
              </tr>
            ) : bookingInTypes.length === 0 ? (
              <tr key="booking-in-types-empty">
                <td
                  colSpan={2}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  No booking in types found.
                </td>
              </tr>
            ) : (
              bookingInTypes.map((row) => (
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
