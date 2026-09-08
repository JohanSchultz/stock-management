"use client";

import { prepareSupabaseClient } from "@/lib/supabase/useSupabaseIdleRecovery";
import { useCallback, useEffect, useState } from "react";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

function formatActive(value) {
  return value === true || value === "true" || value === 1 || value === "1"
    ? "Active"
    : "Inactive";
}

function parseAcctTypeId(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeAccountSubTypes(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    id: row.id ?? null,
    descr: row.descr ?? "",
    accountType: row.account_type ?? "",
    is_active: row.is_active,
    rowKey:
      row.id != null
        ? `account-subtype-${row.id}`
        : `account-subtype-row-${index}-${row.descr ?? "unknown"}`,
  }));
}

export function AccountSubTypesSection({ parentEditMode, acctTypeId }) {
  const [subType, setSubType] = useState("");
  const [active, setActive] = useState(true);
  const [subtypeid, setSubtypeid] = useState("");
  const [subTypes, setSubTypes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [gridLoading, setGridLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editMode, setEditMode] = useState(false);

  const loadAccountSubTypes = useCallback(async () => {
    const parsedAcctTypeId = parseAcctTypeId(acctTypeId);
    if (parsedAcctTypeId == null) {
      setSubTypes([]);
      return;
    }

    setGridLoading(true);
    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc("pr_account_subtypes", {
        p_acct_type_id: parsedAcctTypeId,
      });
      if (rpcError) throw rpcError;
      setSubTypes(normalizeAccountSubTypes(data));
    } catch (err) {
      setError(err.message ?? "Failed to load account sub-types");
    } finally {
      setGridLoading(false);
    }
  }, [acctTypeId]);

  useEffect(() => {
    if (!parentEditMode) {
      setSubType("");
      setActive(true);
      setSubtypeid("");
      setSelectedId(null);
      setEditMode(false);
      setError("");
      setSuccess("");
      setSubTypes([]);
      return;
    }

    loadAccountSubTypes();
  }, [parentEditMode, loadAccountSubTypes]);

  function initializeSubTypeForm() {
    setSubType("");
    setActive(true);
    setSubtypeid("");
    setSelectedId(null);
    setEditMode(false);
    setError("");
    setSuccess("");
  }

  async function refreshAfterAction(successMessage) {
    setSuccess(successMessage);
    initializeSubTypeForm();
    await loadAccountSubTypes();
  }

  async function handleSave() {
    const descr = subType.trim();
    const parsedAcctTypeId = parseAcctTypeId(acctTypeId);
    if (!descr || parsedAcctTypeId == null) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { error: rpcError } = await supabase.rpc("pi_account_subtypes", {
        p_acct_type_id: parsedAcctTypeId,
        p_descr: descr,
      });

      if (rpcError) throw rpcError;

      await refreshAfterAction("Account sub-type saved.");
    } catch (err) {
      setError(err.message ?? "Failed to save account sub-type");
    } finally {
      setLoading(false);
    }
  }

  function handleRowClick(row) {
    setSubtypeid(row.id != null ? String(row.id) : "");
    setSubType(row.descr ?? "");
    setActive(
      row.is_active === true ||
        row.is_active === "true" ||
        row.is_active === 1 ||
        row.is_active === "1"
    );
    setSelectedId(row.id ?? null);
    setEditMode(true);
    setError("");
    setSuccess("");
  }

  function handleNew() {
    initializeSubTypeForm();
  }

  async function handleChange() {
    const descr = subType.trim();
    const id = Number.parseInt(subtypeid, 10);
    const parsedAcctTypeId = parseAcctTypeId(acctTypeId);
    if (!descr || Number.isNaN(id) || parsedAcctTypeId == null) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { error: rpcError } = await supabase.rpc("pu_account_subtypes", {
        p_id: id,
        p_acct_type_id: parsedAcctTypeId,
        p_descr: descr,
        p_is_active: active,
      });

      if (rpcError) throw rpcError;

      await refreshAfterAction("Account sub-type updated.");
    } catch (err) {
      setError(err.message ?? "Failed to update account sub-type");
    } finally {
      setLoading(false);
    }
  }

  async function handleInactivate() {
    const id = Number.parseInt(subtypeid, 10);
    if (Number.isNaN(id)) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = await prepareSupabaseClient();
      if (!supabase) return;

      const { error: rpcError } = await supabase.rpc("pd_account_subtypes", {
        p_id: id,
      });

      if (rpcError) throw rpcError;

      await refreshAfterAction("Account sub-type inactivated.");
    } catch (err) {
      setError(err.message ?? "Failed to inactivate account sub-type");
    } finally {
      setLoading(false);
    }
  }

  if (!parentEditMode) {
    return (
      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex w-full items-center px-4 py-3 text-left text-sm font-medium text-zinc-500 dark:text-zinc-400">
          <span className="mr-2 inline-block text-xs" aria-hidden>
            ▶
          </span>
          Account Sub-types
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex w-full items-center px-4 py-3 text-left text-sm font-medium text-zinc-800 dark:text-zinc-200">
        <span className="mr-2 inline-block rotate-90 text-xs text-zinc-500 dark:text-zinc-400" aria-hidden>
          ▶
        </span>
        Account Sub-types
      </div>

      <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <input
          id="subtypeid"
          name="subtypeid"
          type="text"
          value={subtypeid}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          className="hidden"
        />

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Sub-type
          </span>
          <input
            type="text"
            value={subType}
            onChange={(e) => setSubType(e.target.value)}
            className={inputClassName}
          />
        </label>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Active
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
              disabled={loading || !subType.trim() || !acctTypeId}
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
                disabled={loading || !subType.trim() || !subtypeid}
                className="rounded bg-orange-200 px-4 py-2 text-sm font-medium text-orange-900 hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-900/40 dark:text-orange-100 dark:hover:bg-orange-900/60"
              >
                {loading ? "Saving…" : "Change"}
              </button>
              <button
                type="button"
                onClick={handleInactivate}
                disabled={loading || !subtypeid}
                className="rounded bg-red-200 px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-900/60"
              >
                {loading ? "Saving…" : "Inactivate"}
              </button>
            </>
          )}
        </div>

        <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
              <tr>
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  Account Type
                </th>
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  Sub-type
                </th>
                <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  ActIve
                </th>
              </tr>
            </thead>
            <tbody>
              {gridLoading ? (
                <tr key="account-subtypes-loading">
                  <td
                    colSpan={3}
                    className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                  >
                    Loading…
                  </td>
                </tr>
              ) : subTypes.length === 0 ? (
                <tr key="account-subtypes-empty">
                  <td
                    colSpan={3}
                    className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                  >
                    No account sub-types found.
                  </td>
                </tr>
              ) : (
                subTypes.map((row) => (
                  <tr
                    key={row.rowKey}
                    onClick={() => handleRowClick(row)}
                    className={`cursor-pointer border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 ${
                      selectedId === row.id ? "bg-sky-50 dark:bg-sky-900/20" : ""
                    }`}
                  >
                    <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                      {row.accountType}
                    </td>
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
    </div>
  );
}
