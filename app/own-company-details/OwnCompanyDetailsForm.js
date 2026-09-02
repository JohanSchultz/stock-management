"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useState } from "react";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

function normalizeOwnCompanyDetails(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;

  return {
    address1: row.address1 ?? row.address_1 ?? "",
    address2: row.address2 ?? row.address_2 ?? "",
    address3: row.address3 ?? row.address_3 ?? "",
    postalCode: row.postalcode ?? row.postal_code ?? "",
    vatRegistrationNo: row.vatregno ?? row.vat_reg_no ?? "",
    telNo: row.telno ?? row.tel_no ?? "",
    email: row.email ?? "",
  };
}

function applyOwnCompanyDetails(details, setters) {
  if (!details) return;

  setters.setAddress1(String(details.address1 ?? ""));
  setters.setAddress2(String(details.address2 ?? ""));
  setters.setAddress3(String(details.address3 ?? ""));
  setters.setPostalCode(String(details.postalCode ?? ""));
  setters.setVatRegistrationNo(String(details.vatRegistrationNo ?? ""));
  setters.setTelNo(String(details.telNo ?? ""));
  setters.setEmail(String(details.email ?? ""));
}

export function OwnCompanyDetailsForm() {
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [address3, setAddress3] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [vatRegistrationNo, setVatRegistrationNo] = useState("");
  const [telNo, setTelNo] = useState("");
  const [email, setEmail] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadOwnCompanyDetails = useCallback(async () => {
    setPageLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("pr_own_company_details");
      if (rpcError) throw rpcError;

      applyOwnCompanyDetails(normalizeOwnCompanyDetails(data), {
        setAddress1,
        setAddress2,
        setAddress3,
        setPostalCode,
        setVatRegistrationNo,
        setTelNo,
        setEmail,
      });
    } catch (err) {
      setError(err.message ?? "Failed to load own company details");
    } finally {
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOwnCompanyDetails();
  }, [loadOwnCompanyDetails]);

  async function handleSave() {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("piu_own_company_details", {
        p_address1: address1,
        p_address2: address2,
        p_address3: address3,
        p_postalcode: postalCode,
        p_vatregno: vatRegistrationNo,
        p_telno: telNo,
        p_email: email,
      });

      if (rpcError) throw rpcError;

      setSuccess("Own company details saved.");
      await loadOwnCompanyDetails();
    } catch (err) {
      setError(err.message ?? "Failed to save own company details");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 max-w-3xl">
      {pageLoading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      ) : null}

      <div className={`flex flex-col gap-4 ${pageLoading ? "hidden" : ""}`}>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Address 1
          </span>
          <input
            type="text"
            value={address1}
            onChange={(e) => setAddress1(e.target.value)}
            className={inputClassName}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Address 2
          </span>
          <input
            type="text"
            value={address2}
            onChange={(e) => setAddress2(e.target.value)}
            className={inputClassName}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Address 3
          </span>
          <input
            type="text"
            value={address3}
            onChange={(e) => setAddress3(e.target.value)}
            className={inputClassName}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Postal Code
          </span>
          <input
            type="text"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            className={inputClassName}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Vat Registration No
          </span>
          <input
            type="text"
            value={vatRegistrationNo}
            onChange={(e) => setVatRegistrationNo(e.target.value)}
            className={inputClassName}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Tel No
          </span>
          <input
            type="text"
            value={telNo}
            onChange={(e) => setTelNo(e.target.value)}
            className={inputClassName}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Email
          </span>
          <input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClassName}
          />
        </label>
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

      <div className={`mt-6 ${pageLoading ? "hidden" : ""}`}>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || pageLoading}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
