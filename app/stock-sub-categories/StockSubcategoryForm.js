"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useState } from "react";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

function isTruthyActive(value) {
  return (
    value === true || value === "true" || value === 1 || value === "1"
  );
}

function activeLabel(value) {
  return isTruthyActive(value) ? "Active" : "Inactive";
}

function toRowList(data) {
  return Array.isArray(data) ? data : [];
}

function buildRowKey(row, index) {
  if (row.id != null) return `subcategory-${row.id}`;
  return `subcategory-fallback-${index}-${row.descr ?? ""}`;
}

export function StockSubcategoryForm() {
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [subcategoryName, setSubcategoryName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [recordId, setRecordId] = useState("");
  const [gridRows, setGridRows] = useState([]);
  const [highlightedId, setHighlightedId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGridBusy, setIsGridBusy] = useState(false);
  const [categoriesBusy, setCategoriesBusy] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackSuccess, setFeedbackSuccess] = useState("");

  const fetchCategoryOptions = useCallback(async () => {
    setCategoriesBusy(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("pr_stock_categories_active");
      if (error) throw error;
      setCategoryOptions(toRowList(data));
    } catch (err) {
      setFeedbackError(err.message ?? "Failed to load stock categories");
    } finally {
      setCategoriesBusy(false);
    }
  }, []);

  const fetchSubcategoryRows = useCallback(async () => {
    setIsGridBusy(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("pr_stock_subcategories");
      if (error) throw error;
      setGridRows(toRowList(data));
    } catch (err) {
      setFeedbackError(err.message ?? "Failed to load stock subcategories");
    } finally {
      setIsGridBusy(false);
    }
  }, []);

  useEffect(() => {
    fetchCategoryOptions();
    fetchSubcategoryRows();
  }, [fetchCategoryOptions, fetchSubcategoryRows]);

  function resetForm() {
    setSelectedCategoryId("");
    setSubcategoryName("");
    setIsActive(true);
    setRecordId("");
    setHighlightedId(null);
    setIsEditing(false);
    setFeedbackError("");
    setFeedbackSuccess("");
  }

  async function afterMutation(message) {
    setFeedbackSuccess(message);
    resetForm();
    await fetchSubcategoryRows();
  }

  async function onSave() {
    const name = subcategoryName.trim();
    const categoryId = Number.parseInt(selectedCategoryId, 10);
    if (!name || Number.isNaN(categoryId)) return;

    setIsSaving(true);
    setFeedbackError("");
    setFeedbackSuccess("");

    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("pi_stock_subcategories", {
        p_stock_category_id: categoryId,
        p_stock_subcategories: name,
      });
      if (error) throw error;
      await afterMutation("Stock subcategory saved.");
    } catch (err) {
      setFeedbackError(err.message ?? "Failed to save stock subcategory");
    } finally {
      setIsSaving(false);
    }
  }

  async function onChange() {
    const name = subcategoryName.trim();
    const id = Number.parseInt(recordId, 10);
    const categoryId = Number.parseInt(selectedCategoryId, 10);
    if (!name || Number.isNaN(id) || Number.isNaN(categoryId)) return;

    setIsSaving(true);
    setFeedbackError("");
    setFeedbackSuccess("");

    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("pu_stock_subcategories", {
        p_id: id,
        p_stock_category_id: categoryId,
        p_stock_subcategories: name,
        p_is_active: isActive,
      });
      if (error) throw error;
      await afterMutation("Stock subcategory updated.");
    } catch (err) {
      setFeedbackError(err.message ?? "Failed to update stock subcategory");
    } finally {
      setIsSaving(false);
    }
  }

  async function onDeactivate() {
    const id = Number.parseInt(recordId, 10);
    if (Number.isNaN(id)) return;

    setIsSaving(true);
    setFeedbackError("");
    setFeedbackSuccess("");

    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("pd_stock_subcategories", { p_id: id });
      if (error) throw error;
      await afterMutation("Stock subcategory deactivated.");
    } catch (err) {
      setFeedbackError(err.message ?? "Failed to deactivate stock subcategory");
    } finally {
      setIsSaving(false);
    }
  }

  function onRowSelect(row) {
    setSubcategoryName(row.subcategory ?? "");
    setIsActive(isTruthyActive(row.is_active));
    setRecordId(row.id != null ? String(row.id) : "");
    setHighlightedId(row.id ?? null);

    if (row.stock_category_id != null) {
      setSelectedCategoryId(String(row.stock_category_id));
    } else {
      const matchedCategory = categoryOptions.find(
        (option) => option.descr === row.category
      );
      setSelectedCategoryId(
        matchedCategory?.id != null ? String(matchedCategory.id) : ""
      );
    }

    setIsEditing(true);
    setFeedbackError("");
    setFeedbackSuccess("");
  }

  const canSave =
    !isSaving && subcategoryName.trim().length > 0 && selectedCategoryId !== "";

  return (
    <section className="mt-6 max-w-3xl">
      <input type="hidden" value={recordId} readOnly aria-hidden="true" />

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Stock Categories
        </span>
        <select
          value={selectedCategoryId}
          onChange={(e) => setSelectedCategoryId(e.target.value)}
          disabled={categoriesBusy}
          className={inputClassName}
        >
          <option value="">
            {categoriesBusy ? "Loading categories…" : " -SELECT- "}
          </option>
          {categoryOptions.map((option) => (
            <option key={option.id ?? option.descr} value={String(option.id ?? "")}>
              {option.descr}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Stock Subcategory
        </span>
        <input
          type="text"
          value={subcategoryName}
          onChange={(e) => setSubcategoryName(e.target.value)}
          className={inputClassName}
        />
      </label>

      <div className="mt-4 flex items-center gap-3">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Status
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={isActive}
          aria-label={isActive ? "Active" : "Inactive"}
          onClick={() => setIsActive((current) => !current)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            isActive ? "bg-emerald-600" : "bg-zinc-400 dark:bg-zinc-600"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              isActive ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {isActive ? "Active" : "Inactive"}
        </span>
      </div>

      {feedbackError ? (
        <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300" role="alert">
          {feedbackError}
        </p>
      ) : null}

      {feedbackSuccess ? (
        <p className="mt-4 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" role="status">
          {feedbackSuccess}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!isEditing ? (
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={resetForm}
              className="rounded bg-sky-200 px-4 py-2 text-sm font-medium text-sky-900 hover:bg-sky-300 dark:bg-sky-900/40 dark:text-sky-100 dark:hover:bg-sky-900/60"
            >
              New
            </button>
            <button
              type="button"
              onClick={onChange}
              disabled={isSaving || !canSave || !recordId}
              className="rounded bg-orange-200 px-4 py-2 text-sm font-medium text-orange-900 hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-900/40 dark:text-orange-100 dark:hover:bg-orange-900/60"
            >
              {isSaving ? "Saving…" : "Change"}
            </button>
            <button
              type="button"
              onClick={onDeactivate}
              disabled={isSaving || !recordId}
              className="rounded bg-red-200 px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-900/60"
            >
              {isSaving ? "Saving…" : "Deactivate"}
            </button>
          </>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
            <tr>
              <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                Category
              </th>
              <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                Stock Subcategory
              </th>
              <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                ActIve
              </th>
            </tr>
          </thead>
          <tbody>
            {isGridBusy ? (
              <tr key="subcategories-loading">
                <td colSpan={3} className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                  Loading…
                </td>
              </tr>
            ) : gridRows.length === 0 ? (
              <tr key="subcategories-empty">
                <td colSpan={3} className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                  No stock subcategories found.
                </td>
              </tr>
            ) : (
              gridRows.map((row, index) => (
                <tr
                  key={buildRowKey(row, index)}
                  onClick={() => onRowSelect(row)}
                  className={`cursor-pointer border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 ${
                    highlightedId === row.id ? "bg-sky-50 dark:bg-sky-900/20" : ""
                  }`}
                >
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.category}
                  </td>
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.subcategory}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {activeLabel(row.is_active)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
