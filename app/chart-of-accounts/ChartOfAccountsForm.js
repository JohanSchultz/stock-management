"use client";

import { AccountSubTypesSection } from "./AccountSubTypesSection";
import { prepareSupabaseClient } from "@/lib/supabase/useSupabaseIdleRecovery";
import { useCallback, useEffect, useState } from "react";

const FIN_STATEMENT_BALANCE_SHEET = "Balance Sheet";
const FIN_STATEMENT_INCOME_STATEMENT = "Income Statement";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

function normalizeAccountTypes(data) {
  const rows = Array.isArray(data) ? data : [];

  return rows
    .map((row, index) => ({
      id: row?.id ?? null,
      accountType: String(row?.account_type ?? ""),
      rowKey:
        row?.id != null
          ? `account-type-${row.id}`
          : `account-type-row-${index}-${row?.account_type ?? "unknown"}`,
    }))
    .filter((row) => row.id != null);
}

function normalizeChartOfAccounts(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    acctNumber: row.acct_number ?? row.acctnumber ?? row.account_number ?? "",
    acctType:
      row.acct_type ??
      row.accttype ??
      row.account_type ??
      row.acct_type_descr ??
      row.account_type_descr ??
      "",
    acctTypeId: row.acct_type_id ?? row.accttype_id ?? null,
    acctName: row.acct_name ?? row.acctname ?? row.account_name ?? "",
    finStatement:
      row.fin_statement ??
      row.finstatement ??
      row.financial_statement ??
      row.p_fin_statement ??
      "",
    rowKey:
      row.id != null
        ? `chart-of-account-${row.id}`
        : `chart-of-account-row-${index}-${row.acct_number ?? row.acct_name ?? "unknown"}`,
  }));
}

export function ChartOfAccountsForm({
  initialAccountTypes = null,
  initialAccounts = null,
  initialLoadError = "",
}) {
  const [accountNumber, setAccountNumber] = useState("");
  const [chartOfAccountId, setChartOfAccountId] = useState("");
  const [accountTypeId, setAccountTypeId] = useState("");
  const [accountTypes, setAccountTypes] = useState(() =>
    initialAccountTypes != null ? normalizeAccountTypes(initialAccountTypes) : []
  );
  const [accountTypesLoading, setAccountTypesLoading] = useState(
    initialAccountTypes == null
  );
  const [accountName, setAccountName] = useState("");
  const [financialStatement, setFinancialStatement] = useState(
    FIN_STATEMENT_BALANCE_SHEET
  );
  const [accounts, setAccounts] = useState(() =>
    initialAccounts != null ? normalizeChartOfAccounts(initialAccounts) : []
  );
  const [selectedRowKey, setSelectedRowKey] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gridLoading, setGridLoading] = useState(initialAccounts == null);
  const [error, setError] = useState(initialLoadError);
  const [success, setSuccess] = useState("");

  const loadAccountTypes = useCallback(async ({ replaceEmpty = false } = {}) => {
    setAccountTypesLoading(true);
    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc("pr_account_types", {});
      if (rpcError) throw rpcError;

      const normalized = normalizeAccountTypes(data);
      setAccountTypes((current) => {
        if (normalized.length === 0 && !replaceEmpty && current.length > 0) {
          return current;
        }
        return normalized;
      });
    } catch (err) {
      setError(err.message ?? "Failed to load account types");
    } finally {
      setAccountTypesLoading(false);
    }
  }, []);

  const loadChartOfAccounts = useCallback(async ({ replaceEmpty = false } = {}) => {
    setGridLoading(true);
    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc("pr_chart_of_accounts", {});
      if (rpcError) throw rpcError;

      const normalized = normalizeChartOfAccounts(data);
      setAccounts((current) => {
        if (normalized.length === 0 && !replaceEmpty && current.length > 0) {
          return current;
        }
        return normalized;
      });
    } catch (err) {
      setError(err.message ?? "Failed to load chart of accounts");
    } finally {
      setGridLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshAfterSessionReady() {
      const supabase = await prepareSupabaseClient();
      if (!supabase || cancelled) return;

      await Promise.all([
        loadAccountTypes(),
        loadChartOfAccounts(),
      ]);
    }

    refreshAfterSessionReady();

    return () => {
      cancelled = true;
    };
  }, [loadAccountTypes, loadChartOfAccounts]);

  function initializeForm() {
    setAccountNumber("");
    setChartOfAccountId("");
    setAccountTypeId("");
    setAccountName("");
    setFinancialStatement(FIN_STATEMENT_BALANCE_SHEET);
    setSelectedRowKey(null);
    setEditMode(false);
    setError("");
    setSuccess("");
  }

  function handleRowClick(row) {
    setChartOfAccountId(row.id != null ? String(row.id) : "");
    setAccountNumber(String(row.acctNumber ?? ""));
    setAccountTypeId(row.acctTypeId != null ? String(row.acctTypeId) : "");
    setAccountName(String(row.acctName ?? ""));

    const finStatement = String(row.finStatement ?? "").trim();
    if (finStatement === FIN_STATEMENT_INCOME_STATEMENT) {
      setFinancialStatement(FIN_STATEMENT_INCOME_STATEMENT);
    } else {
      setFinancialStatement(FIN_STATEMENT_BALANCE_SHEET);
    }

    setSelectedRowKey(row.rowKey);
    setEditMode(true);
    setError("");
    setSuccess("");
  }

  function handleNew() {
    initializeForm();
  }

  async function handleSave() {
    const acctTypeId = Number.parseInt(accountTypeId, 10);
    if (Number.isNaN(acctTypeId)) {
      setError("Please select an account type.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { error: rpcError } = await supabase.rpc("pi_chart_of_accounts", {
        p_acct_number: accountNumber,
        p_acct_type_id: acctTypeId,
        p_acct_name: accountName,
        p_fin_statement: financialStatement,
      });

      if (rpcError) throw rpcError;

      setSuccess("Chart of account saved.");
      initializeForm();
      await Promise.all([
        loadAccountTypes({ replaceEmpty: true }),
        loadChartOfAccounts({ replaceEmpty: true }),
      ]);
    } catch (err) {
      setError(err.message ?? "Failed to save chart of account");
    } finally {
      setLoading(false);
    }
  }

  async function handleChange() {
    const acctTypeId = Number.parseInt(accountTypeId, 10);
    const id = Number.parseInt(chartOfAccountId, 10);
    if (Number.isNaN(acctTypeId)) {
      setError("Please select an account type.");
      return;
    }
    if (Number.isNaN(id)) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { error: rpcError } = await supabase.rpc("pu_chart_of_accounts", {
        p_id: id,
        p_acct_number: accountNumber,
        p_acct_type_id: acctTypeId,
        p_acct_name: accountName,
        p_fin_statement: financialStatement,
      });

      if (rpcError) throw rpcError;

      setSuccess("Chart of account updated.");
      initializeForm();
      await Promise.all([
        loadAccountTypes({ replaceEmpty: true }),
        loadChartOfAccounts({ replaceEmpty: true }),
      ]);
    } catch (err) {
      setError(err.message ?? "Failed to update chart of account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 max-w-4xl">
      <input
        type="text"
        value={chartOfAccountId}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
      />

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Account Number
          </span>
          <input
            type="text"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            className={inputClassName}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Account Type
          </span>
          <select
            value={accountTypeId}
            onChange={(e) => setAccountTypeId(e.target.value)}
            disabled={accountTypesLoading}
            className={inputClassName}
          >
            <option value="">
              {accountTypesLoading ? "Loading…" : " - SELECT -"}
            </option>
            {accountTypes.map((option) => (
              <option key={option.rowKey} value={String(option.id ?? "")}>
                {option.accountType}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Account Name
          </span>
          <input
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            className={inputClassName}
          />
        </label>
      </div>

      <fieldset className="mt-4 rounded-lg border border-zinc-300 px-4 py-3 dark:border-zinc-600">
        <legend className="px-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Financial Statement
        </legend>
        <div
          role="radiogroup"
          aria-label="Financial Statement"
          className="flex flex-wrap items-center gap-4"
        >
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="radio"
              name="financialStatement"
              value={FIN_STATEMENT_BALANCE_SHEET}
              checked={financialStatement === FIN_STATEMENT_BALANCE_SHEET}
              onChange={() => setFinancialStatement(FIN_STATEMENT_BALANCE_SHEET)}
              className="h-4 w-4 border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            Balance Sheet
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="radio"
              name="financialStatement"
              value={FIN_STATEMENT_INCOME_STATEMENT}
              checked={financialStatement === FIN_STATEMENT_INCOME_STATEMENT}
              onChange={() =>
                setFinancialStatement(FIN_STATEMENT_INCOME_STATEMENT)
              }
              className="h-4 w-4 border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            Income Statement
          </label>
        </div>
      </fieldset>

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
              onClick={handleSave}
              disabled={loading || !accountTypeId}
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </>
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
              disabled={loading || !accountTypeId || !chartOfAccountId}
              className="rounded bg-orange-200 px-4 py-2 text-sm font-medium text-orange-900 hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-900/40 dark:text-orange-100 dark:hover:bg-orange-900/60"
            >
              {loading ? "Saving…" : "Change"}
            </button>
          </>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
            <tr>
              <th className="hidden px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                Account Type ID
              </th>
              <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                Account Number
              </th>
              <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                Account Type
              </th>
              <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                Account Name
              </th>
              <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                Financial Statement
              </th>
            </tr>
          </thead>
          <tbody>
            {gridLoading ? (
              <tr key="chart-of-accounts-loading">
                <td
                  colSpan={5}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  Loading…
                </td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr key="chart-of-accounts-empty">
                <td
                  colSpan={5}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  No chart of accounts found.
                </td>
              </tr>
            ) : (
              accounts.map((row) => (
                <tr
                  key={row.rowKey}
                  onClick={() => handleRowClick(row)}
                  className={`cursor-pointer border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 ${
                    selectedRowKey === row.rowKey
                      ? "bg-sky-50 dark:bg-sky-900/20"
                      : ""
                  }`}
                >
                  <td className="hidden px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.acctTypeId ?? ""}
                  </td>
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.acctNumber}
                  </td>
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.acctType}
                  </td>
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.acctName}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {row.finStatement}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AccountSubTypesSection
        parentEditMode={editMode}
        acctTypeId={accountTypeId}
      />
    </div>
  );
}
