"use client";

import { SupplierSelect } from "@/components/SupplierSelect";
import { prepareSupabaseClient } from "@/lib/supabase/useSupabaseIdleRecovery";
import { useCallback, useEffect, useState } from "react";

const SELECT_PLACEHOLDER = " -SELECT- ";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

function normalizeRevenueAccountOptions(data) {
  if (!Array.isArray(data)) return [];

  return data
    .map((row, index) => ({
      id: row.id ?? null,
      acctNumber: row.acct_number ?? row.acctnumber ?? row.account_number ?? "",
      acctName: row.acct_name ?? row.acctname ?? row.account_name ?? "",
      finStatement:
        row.fin_statement ??
        row.finstatement ??
        row.financial_statement ??
        "",
      optionKey:
        row.id != null
          ? `revenue-account-${row.id}`
          : `revenue-account-row-${index}`,
    }))
    .filter((row) => row.id != null);
}

function revenueAccountOptionLabel(option) {
  return [option.acctNumber, option.acctName, option.finStatement]
    .map((part) => String(part ?? ""))
    .join(" - ");
}

export function CrnOutForm() {
  const [revenueAccountId, setRevenueAccountId] = useState("");
  const [revenueAccountOptions, setRevenueAccountOptions] = useState([]);
  const [revenueAccountsLoading, setRevenueAccountsLoading] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [comments, setComments] = useState("");
  const [error, setError] = useState("");

  const showComments = Boolean(revenueAccountId && supplierId);

  const loadRevenueAccounts = useCallback(async () => {
    setRevenueAccountsLoading(true);

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc("pr_revenue_accounts");
      if (rpcError) throw rpcError;
      setRevenueAccountOptions(normalizeRevenueAccountOptions(data));
    } catch (err) {
      setRevenueAccountOptions([]);
      setError(err.message ?? "Failed to load revenue accounts");
    } finally {
      setRevenueAccountsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRevenueAccounts();
  }, [loadRevenueAccounts]);

  function handleSupplierChange(nextSupplierId) {
    setSupplierId(nextSupplierId);
    setError("");
    if (!nextSupplierId) setComments("");
  }

  return (
    <div className="mt-6 max-w-6xl">
      <label className="flex w-full max-w-2xl flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Revenue Account
        </span>
        <select
          value={revenueAccountId}
          onChange={(e) => {
            setRevenueAccountId(e.target.value);
            if (!e.target.value) setComments("");
          }}
          disabled={revenueAccountsLoading}
          className={`${inputClassName} w-full`}
        >
          <option value="">
            {revenueAccountsLoading ? "Loading…" : SELECT_PLACEHOLDER}
          </option>
          {revenueAccountOptions.map((option) => (
            <option key={option.optionKey} value={String(option.id ?? "")}>
              {revenueAccountOptionLabel(option)}
            </option>
          ))}
        </select>
      </label>

      <SupplierSelect
        value={supplierId}
        onChange={handleSupplierChange}
        onLoadError={(message) => setError(message)}
      />

      {error ? (
        <p
          className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {showComments ? (
        <label className="mt-4 flex w-full flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Comments
          </span>
          <input
            type="text"
            name="comments"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            className={`${inputClassName} w-full`}
          />
        </label>
      ) : null}
    </div>
  );
}
