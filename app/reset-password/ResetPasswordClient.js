"use client";

import { getAuthCallbackUrl } from "@/lib/auth/getAuthCallbackUrl";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash;
    const hashParams = new URLSearchParams(
      hash.startsWith("#") ? hash.slice(1) : hash
    );
    const hashType = hashParams.get("type");

    const errParam = searchParams?.get("error");
    if (errParam === "session_expired" || errParam === "auth_error") {
      setError(
        "This reset link could not be verified. Please request a new password reset email and use the latest link."
      );
      router.replace("/reset-password");
      return;
    }

    if (hashType === "recovery") {
      setMode("set");
      return;
    }

    createClient()
      .auth.getSession()
      .then(({ data: { session } }) => {
        if (session) setMode("set");
      });
  }, [router, searchParams]);

  async function handleRequestReset(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: getAuthCallbackUrl("/reset-password") }
      );
      if (resetError) throw resetError;
      setMessage(
        "If an account exists for that email, you will receive a password reset link."
      );
      setEmail("");
    } catch (err) {
      setError(err?.message ?? "Failed to send reset link");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPassword(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!password) {
      setError("Please enter a new password.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setMessage("Password updated. Redirecting…");
      router.push("/login");
      router.refresh();
    } catch (err) {
      setError(err?.message ?? "Failed to update password");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="w-full max-w-sm px-6">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Reset password
        </h1>
        <div className="mt-8 flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {error && (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" role="status">
              {message}
            </p>
          )}

          {mode === "request" ? (
            <form onSubmit={handleRequestReset} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="rounded bg-zinc-800 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-700 dark:hover:bg-zinc-600"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSetPassword} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">New password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Confirm password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className={inputClass}
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="rounded bg-zinc-800 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-700 dark:hover:bg-zinc-600"
              >
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          )}

          <Link
            href="/login"
            className="mt-2 text-center text-sm text-zinc-600 hover:text-zinc-900 underline dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Back to sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
