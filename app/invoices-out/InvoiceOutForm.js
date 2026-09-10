"use client";

import { prepareSupabaseClient } from "@/lib/supabase/useSupabaseIdleRecovery";
import { useCallback, useEffect, useState } from "react";

const SELECT_PLACEHOLDER = " -SELECT- ";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

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

export function InvoiceOutForm() {
  const [customerId, setCustomerId] = useState("");
  const [customerOptions, setCustomerOptions] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [error, setError] = useState("");

  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true);
    setError("");

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc("pr_customer_active");
      if (rpcError) throw rpcError;
      setCustomerOptions(normalizeCustomerOptions(data));
    } catch (err) {
      setError(err.message ?? "Failed to load customers");
      setCustomerOptions([]);
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  return (
    <div className="mt-6 max-w-3xl">
      <label className="flex w-full max-w-xs flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Customer
        </span>
        <select
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
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

      {error && (
        <p
          className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
