"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useState } from "react";

const SELECT_PLACEHOLDER = " -SELECT- ";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

function normalizeFunctions(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    id: row.id ?? null,
    descr: row.descr ?? "",
    rowKey:
      row.id != null
        ? `function-${row.id}`
        : `function-row-${index}-${row.descr ?? "unknown"}`,
  }));
}

function normalizeUsers(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    user_id: row.user_id ?? row.id ?? null,
    email: row.email ?? "",
    rowKey:
      row.user_id != null
        ? `user-${row.user_id}`
        : `user-row-${index}-${row.email ?? "unknown"}`,
  }));
}

function parseInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function PermissionsForm() {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [functions, setFunctions] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [usersLoading, setUsersLoading] = useState(false);
  const [functionsLoading, setFunctionsLoading] = useState(false);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "pr_users_for_this_tenant"
      );
      if (rpcError) throw rpcError;
      setUsers(normalizeUsers(data));
    } catch (err) {
      setUsers([]);
      setError(err.message ?? "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const loadFunctions = useCallback(async () => {
    setFunctionsLoading(true);

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("pr_functions");
      if (rpcError) throw rpcError;
      setFunctions(normalizeFunctions(data));
    } catch (err) {
      setFunctions([]);
      setError(err.message ?? "Failed to load functions");
    } finally {
      setFunctionsLoading(false);
    }
  }, []);

  useEffect(() => {
    setError("");
    loadUsers();
    loadFunctions();
  }, [loadUsers, loadFunctions]);

  const applyPermissionsForUser = useCallback(
    async (userId) => {
      setSelectedIds(new Set());

      if (!userId) return;

      setPermissionsLoading(true);
      setError("");

      try {
        const supabase = createClient();
        const { data, error: rpcError } = await supabase.rpc(
          "get_permissions_by_specific_user",
          { p_user_id: userId }
        );
        if (rpcError) throw rpcError;

        const permittedDescrs = new Set(
          (Array.isArray(data) ? data : [])
            .map((row) => String(row.descr ?? "").trim().toLowerCase())
            .filter(Boolean)
        );

        const checkedIds = new Set(
          functions
            .filter((item) =>
              permittedDescrs.has(item.descr.trim().toLowerCase())
            )
            .map((item) => String(item.id))
        );

        setSelectedIds(checkedIds);
      } catch (err) {
        setSelectedIds(new Set());
        setError(err.message ?? "Failed to load user permissions");
      } finally {
        setPermissionsLoading(false);
      }
    },
    [functions]
  );

  function handleUserChange(userId) {
    setSelectedUserId(userId);
  }

  useEffect(() => {
    if (functionsLoading) return;
    applyPermissionsForUser(selectedUserId);
  }, [selectedUserId, functionsLoading, applyPermissionsForUser]);

  function handleCheckboxChange(functionId, checked) {
    const id = String(functionId);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  function handleSelectAll() {
    setSelectedIds(new Set(functions.map((item) => String(item.id))));
  }

  function handleSelectNone() {
    setSelectedIds(new Set());
  }

  async function handleSave() {
    if (!selectedUserId) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();

      const { error: deleteError } = await supabase.rpc(
        "pd_permissions_by_specific_user",
        { p_user_id: selectedUserId }
      );
      if (deleteError) throw deleteError;

      for (const functionId of selectedIds) {
        const parsedFunctionId = parseInteger(functionId);
        if (parsedFunctionId == null) continue;

        const { error: insertError } = await supabase.rpc(
          "pi_permissions_by_specific_user",
          {
            p_user_id: selectedUserId,
            p_function_id: parsedFunctionId,
          }
        );
        if (insertError) throw insertError;
      }

      setSuccess("Permissions saved.");
    } catch (err) {
      setError(err.message ?? "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      {error ? (
        <p
          className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {success ? (
        <p
          className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          role="status"
        >
          {success}
        </p>
      ) : null}

      <label className="flex w-full max-w-md flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Users
        </span>
        <select
          value={selectedUserId}
          onChange={(e) => handleUserChange(e.target.value)}
          disabled={usersLoading || permissionsLoading || saving}
          className={`${inputClassName} w-full`}
        >
          <option value="">
            {usersLoading ? "Loading…" : SELECT_PLACEHOLDER}
          </option>
          {users.map((user) => (
            <option key={user.rowKey} value={String(user.user_id)}>
              {user.email}
            </option>
          ))}
        </select>
      </label>

      {functionsLoading || permissionsLoading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {functionsLoading ? "Loading…" : "Loading permissions…"}
        </p>
      ) : functions.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No functions found.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            {functions.map((item) => {
              const functionId = String(item.id);

              return (
                <li key={item.rowKey}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      value={functionId}
                      checked={selectedIds.has(functionId)}
                      onChange={(e) =>
                        handleCheckboxChange(item.id, e.target.checked)
                      }
                      disabled={permissionsLoading || saving}
                      className="h-4 w-4 rounded border-zinc-300 text-zinc-800 focus:ring-zinc-500 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800"
                    />
                    <span>{item.descr}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSelectAll}
              disabled={permissionsLoading || saving}
              className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={handleSelectNone}
              disabled={permissionsLoading || saving}
              className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              Select None
            </button>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={
              !selectedUserId ||
              saving ||
              permissionsLoading ||
              functionsLoading
            }
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      )}
    </div>
  );
}
