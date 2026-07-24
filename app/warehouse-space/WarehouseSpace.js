"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useState } from "react";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

function parseFloatValue(value) {
  if (value === "" || value == null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatDecimalInputValue(value) {
  if (value == null || value === "") return "";
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? "" : String(parsed);
}

export function WarehouseSpace() {
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadWarehouseSpace = useCallback(async () => {
    setInitialLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("pr_warehouse_space");
      if (rpcError) throw rpcError;

      const rows = Array.isArray(data) ? data : [];
      if (rows.length === 1) {
        const row = rows[0];
        setLength(formatDecimalInputValue(row.length));
        setWidth(formatDecimalInputValue(row.width));
        setHeight(formatDecimalInputValue(row.height));
      }
    } catch (err) {
      setError(err.message ?? "Failed to load warehouse space");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWarehouseSpace();
  }, [loadWarehouseSpace]);

  const lengthValue = parseFloatValue(length);
  const widthValue = parseFloatValue(width);
  const heightValue = parseFloatValue(height);
  const cubicMeters =
    lengthValue != null && widthValue != null && heightValue != null
      ? formatDecimalInputValue(lengthValue * widthValue * heightValue)
      : "";
  const canSave =
    lengthValue != null && widthValue != null && heightValue != null;

  async function handleSave() {
    if (!canSave) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("piu_warehouse_space", {
        p_width: widthValue,
        p_length: lengthValue,
        p_height: heightValue,
      });

      if (rpcError) throw rpcError;

      setSuccess("Warehouse space saved.");
    } catch (err) {
      setError(err.message ?? "Failed to save warehouse space");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {initialLoading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      ) : null}

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Length
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              disabled={initialLoading}
              className={`${inputClassName} min-w-0 flex-1`}
            />
            <span className="shrink-0 text-sm text-zinc-600 dark:text-zinc-400">
              meters
            </span>
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Width
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              disabled={initialLoading}
              className={`${inputClassName} min-w-0 flex-1`}
            />
            <span className="shrink-0 text-sm text-zinc-600 dark:text-zinc-400">
              meters
            </span>
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Height
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              disabled={initialLoading}
              className={`${inputClassName} min-w-0 flex-1`}
            />
            <span className="shrink-0 text-sm text-zinc-600 dark:text-zinc-400">
              meters
            </span>
          </div>
        </label>

        <div className="flex items-center gap-2">
          <input
            type="number"
            step="any"
            inputMode="decimal"
            readOnly
            tabIndex={-1}
            value={cubicMeters}
            aria-label="Cubic meters"
            className={`${inputClassName} min-w-0 flex-1`}
          />
          <span className="shrink-0 text-sm text-zinc-600 dark:text-zinc-400">
            cubic meters
          </span>
        </div>
      </div>

      {error ? (
        <p
          className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {success ? (
        <p
          className="mt-4 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          role="status"
        >
          {success}
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleSave}
        disabled={loading || initialLoading || !canSave}
        className="mt-6 rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
