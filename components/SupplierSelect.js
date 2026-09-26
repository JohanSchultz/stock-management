"use client";

import { prepareSupabaseClient } from "@/lib/supabase/useSupabaseIdleRecovery";
import {
  normalizeSupplierOptions,
  supplierOptionLabel,
  supplierOptionValue,
} from "@/lib/suppliers/supplierOptions";
import { useCallback, useEffect, useRef, useState } from "react";

const SELECT_PLACEHOLDER = " -SELECT- ";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

export function SupplierSelect({
  value,
  onChange,
  onLoadError,
  disabled = false,
  className = "mt-4 flex w-full max-w-xs flex-col gap-1",
  labelClassName = "text-sm font-medium text-zinc-700 dark:text-zinc-300",
  selectClassName = inputClassName,
  id,
  name = "supplier",
}) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;

  const loadSuppliers = useCallback(async () => {
    setLoading(true);

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc(
        "pr_suppliers_active"
      );
      if (rpcError) throw rpcError;
      setOptions(normalizeSupplierOptions(data));
    } catch (err) {
      setOptions([]);
      onLoadErrorRef.current?.(err.message ?? "Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  return (
    <label className={className} htmlFor={id}>
      <span className={labelClassName}>Supplier</span>
      <select
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || loading}
        className={`${selectClassName} w-full`}
      >
        <option value="">{loading ? "Loading…" : SELECT_PLACEHOLDER}</option>
        {options.map((option, index) => (
          <option
            key={option.optionKey ?? option.id ?? `supplier-${index}`}
            value={supplierOptionValue(option)}
          >
            {supplierOptionLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
