"use client";

import {
  customerOptionLabel,
  customerOptionValue,
  normalizeCustomerOptions,
} from "@/lib/customers/customerOptions";
import { prepareSupabaseClient } from "@/lib/supabase/useSupabaseIdleRecovery";
import { useCallback, useEffect, useRef, useState } from "react";

const SELECT_PLACEHOLDER = " -SELECT- ";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

export function CustomerSelect({
  value,
  onChange,
  onSelectionLabelChange,
  onLoadError,
  disabled = false,
  className = "mt-4 flex w-full max-w-xs flex-col gap-1",
  id,
  name = "customer",
}) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;

  const loadCustomers = useCallback(async () => {
    setLoading(true);

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc("pr_customer_active");
      if (rpcError) throw rpcError;
      setOptions(normalizeCustomerOptions(data));
    } catch (err) {
      setOptions([]);
      onLoadErrorRef.current?.(err.message ?? "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  return (
    <label className={className} htmlFor={id}>
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Customer
      </span>
      <select
        id={id}
        name={name}
        value={value}
        onChange={(e) => {
          const nextValue = e.target.value;
          onChange(nextValue);
          if (onSelectionLabelChange) {
            const selectedOption = options.find(
              (option) => customerOptionValue(option) === nextValue
            );
            onSelectionLabelChange(
              nextValue,
              selectedOption ? customerOptionLabel(selectedOption) : ""
            );
          }
        }}
        disabled={disabled || loading}
        className={`${inputClassName} w-full`}
      >
        <option value="">{loading ? "Loading…" : SELECT_PLACEHOLDER}</option>
        {options.map((option, index) => (
          <option
            key={option.optionKey ?? `customer-${index}`}
            value={customerOptionValue(option)}
          >
            {customerOptionLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
