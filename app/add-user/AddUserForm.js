"use client";

import { useState } from "react";
import { createAuthUser } from "./actions";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

export function AddUserForm() {
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSave() {
    const trimmedUserName = userName.trim();
    if (!trimmedUserName || !password) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const result = await createAuthUser(trimmedUserName, password);
      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccess("User saved.");
      setUserName("");
      setPassword("");
    } catch (err) {
      setError(err.message ?? "Failed to save user");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 max-w-3xl">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          User Name
        </span>
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          className={inputClassName}
        />
      </label>

      <label className="mt-4 flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Password
        </span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClassName}
        />
      </label>

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

      <div className="mt-6">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !userName.trim() || !password}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
