"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useState } from "react";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

const adjoinedButtonClassName =
  "shrink-0 rounded-r border border-l-0 border-zinc-300 bg-zinc-50 px-2 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700";

const SELECT_PLACEHOLDER = " -SELECT- ";

function RequiredMarker() {
  return (
    <span className="text-red-600 dark:text-red-400" aria-hidden="true">
      {" "}
      *
    </span>
  );
}

function toOptions(data) {
  return Array.isArray(data) ? data : [];
}

function optionLabel(option) {
  return (
    option.descr ??
    option.description ??
    option.subcategory ??
    option.category ??
    option.name ??
    ""
  );
}

function optionValue(option) {
  return option.id != null ? String(option.id) : "";
}

function isTruthyActive(value) {
  return (
    value === true || value === "true" || value === 1 || value === "1"
  );
}

function activeLabel(value) {
  return isTruthyActive(value) ? "Active" : "Inactive";
}

function parseInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseFloatValue(value) {
  if (value === "" || value == null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeStockItems(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    id: row.id ?? row.stock_item_id ?? null,
    stock_code: row.stock_code ?? "",
    stock_item: row.stock_item ?? "",
    unit_qty: row.unit_qty ?? null,
    is_active: row.is_active,
    rowKey:
      row.id != null
        ? `stock-item-${row.id}`
        : `stock-item-row-${index}-${row.stock_code ?? "unknown"}`,
  }));
}

export function StockItemForm() {
  const [stockCode, setStockCode] = useState("");
  const [description, setDescription] = useState("");
  const [unitTypeId, setUnitTypeId] = useState("");
  const [unitQuantity, setUnitQuantity] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [unitTypeOptions, setUnitTypeOptions] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [subcategoryOptions, setSubcategoryOptions] = useState([]);
  const [unitTypesLoading, setUnitTypesLoading] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [subcategoriesLoading, setSubcategoriesLoading] = useState(false);
  const [width, setWidth] = useState("");
  const [length, setLength] = useState("");
  const [depth, setDepth] = useState("");
  const [locationId, setLocationId] = useState("");
  const [locationOptions, setLocationOptions] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [unitPrice, setUnitPrice] = useState("");
  const [active, setActive] = useState(true);
  const [stockItemId, setStockItemId] = useState("");
  const [stockItems, setStockItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [gridLoading, setGridLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [itemLookupOpen, setItemLookupOpen] = useState(false);
  const [itemLookupRows, setItemLookupRows] = useState([]);
  const [itemLookupLoading, setItemLookupLoading] = useState(false);
  const [itemLookupError, setItemLookupError] = useState("");

  const loadUnitTypes = useCallback(async () => {
    setUnitTypesLoading(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("pr_unit_types_active");
      if (rpcError) throw rpcError;
      setUnitTypeOptions(toOptions(data));
    } catch (err) {
      setError(err.message ?? "Failed to load unit types");
    } finally {
      setUnitTypesLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "pr_stock_categories_active"
      );
      if (rpcError) throw rpcError;
      setCategoryOptions(toOptions(data));
    } catch (err) {
      setError(err.message ?? "Failed to load categories");
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  const loadSubcategories = useCallback(async (selectedCategoryId) => {
    const parsedCategoryId = Number.parseInt(selectedCategoryId, 10);
    if (!selectedCategoryId || Number.isNaN(parsedCategoryId)) {
      setSubcategoryOptions([]);
      return;
    }

    setSubcategoriesLoading(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "pr_stock_subcategories_active",
        { p_category_id: parsedCategoryId }
      );
      if (rpcError) throw rpcError;
      setSubcategoryOptions(toOptions(data));
    } catch (err) {
      setError(err.message ?? "Failed to load sub-categories");
      setSubcategoryOptions([]);
    } finally {
      setSubcategoriesLoading(false);
    }
  }, []);

  const loadLocations = useCallback(async () => {
    setLocationsLoading(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("pr_locations_active");
      if (rpcError) throw rpcError;
      setLocationOptions(toOptions(data));
    } catch (err) {
      setError(err.message ?? "Failed to load locations");
    } finally {
      setLocationsLoading(false);
    }
  }, []);

  const loadStockItems = useCallback(async () => {
    setGridLoading(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("pr_stock_item_all");
      if (rpcError) throw rpcError;
      setStockItems(normalizeStockItems(data));
    } catch (err) {
      setError(err.message ?? "Failed to load stock items");
    } finally {
      setGridLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUnitTypes();
    loadCategories();
    loadLocations();
    loadStockItems();
  }, [loadUnitTypes, loadCategories, loadLocations, loadStockItems]);

  function handleCategoryChange(nextCategoryId) {
    setCategoryId(nextCategoryId);
    setSubcategoryId("");
    loadSubcategories(nextCategoryId);
  }

  function initializeForm() {
    setStockCode("");
    setDescription("");
    setUnitTypeId("");
    setUnitQuantity("");
    setCategoryId("");
    setSubcategoryId("");
    setSubcategoryOptions([]);
    setWidth("");
    setLength("");
    setDepth("");
    setLocationId("");
    setUnitPrice("");
    setActive(true);
    setStockItemId("");
    setSelectedId(null);
    setEditMode(false);
    setError("");
    setSuccess("");
  }

  function buildInsertPayload() {
    return {
      p_stock_code: stockCode.trim(),
      p_descr: description.trim(),
      p_unit_type_id: parseInteger(unitTypeId),
      p_unit_qty: parseFloatValue(unitQuantity),
      p_stock_category_id: parseInteger(categoryId),
      p_stock_subcategory_id: parseInteger(subcategoryId),
      p_location_id: parseInteger(locationId),
      p_width: parseFloatValue(width),
      p_length: parseFloatValue(length),
      p_depth: parseFloatValue(depth),
      p_unit_price: parseFloatValue(unitPrice),
    };
  }

  function buildUpdatePayload() {
    return {
      p_id: parseInteger(stockItemId),
      ...buildInsertPayload(),
      p_is_active: active,
    };
  }

  function isInsertFormValid() {
    const payload = buildInsertPayload();
    return (
      payload.p_stock_code &&
      payload.p_descr &&
      payload.p_unit_type_id != null &&
      payload.p_unit_qty != null &&
      payload.p_stock_category_id != null &&
      payload.p_stock_subcategory_id != null &&
      payload.p_location_id != null &&
      payload.p_width != null &&
      payload.p_length != null &&
      payload.p_depth != null &&
      payload.p_unit_price != null
    );
  }

  async function refreshAfterAction(message) {
    setSuccess(message);
    initializeForm();
    await loadStockItems();
  }

  async function handleSave() {
    if (!isInsertFormValid()) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc(
        "pi_stock_item",
        buildInsertPayload()
      );
      if (rpcError) throw rpcError;
      await refreshAfterAction("Stock item saved.");
    } catch (err) {
      setError(err.message ?? "Failed to save stock item");
    } finally {
      setLoading(false);
    }
  }

  async function populateFormFromRow(row) {
    const nextCategoryId =
      row.stock_category_id != null ? String(row.stock_category_id) : "";

    setStockCode(row.stock_code ?? "");
    setDescription(row.stock_item ?? "");
    setUnitTypeId(row.unit_type_id != null ? String(row.unit_type_id) : "");
    setUnitQuantity(row.unit_qty != null ? String(row.unit_qty) : "");
    setCategoryId(nextCategoryId);
    setWidth(row.width != null ? String(row.width) : "");
    setLength(row.length != null ? String(row.length) : "");
    setDepth(row.depth != null ? String(row.depth) : "");
    setLocationId(row.location_id != null ? String(row.location_id) : "");
    setUnitPrice(row.unit_price != null ? String(row.unit_price) : "");
    setActive(isTruthyActive(row.is_active));
    setStockItemId(row.id != null ? String(row.id) : "");
    setSelectedId(row.id ?? null);
    setEditMode(true);
    setError("");
    setSuccess("");

    if (nextCategoryId) {
      await loadSubcategories(nextCategoryId);
      setSubcategoryId(
        row.stock_subcategory_id != null ? String(row.stock_subcategory_id) : ""
      );
    } else {
      setSubcategoryOptions([]);
      setSubcategoryId("");
    }
  }

  async function runItemLookup(loadRows, errorMessage) {
    setItemLookupOpen(true);
    setItemLookupLoading(true);
    setItemLookupError("");
    setItemLookupRows([]);

    try {
      const data = await loadRows();
      setItemLookupRows(normalizeStockItems(data));
    } catch (err) {
      setItemLookupError(err.message ?? errorMessage);
    } finally {
      setItemLookupLoading(false);
    }
  }

  async function handleStockCodeLookup() {
    const searchCode = stockCode.trim();
    if (!searchCode) return;

    const supabase = createClient();
    await runItemLookup(async () => {
      const { data, error: rpcError } = await supabase.rpc(
        "pr_stock_item_all_like_stockcode",
        { p_stock_code: searchCode }
      );
      if (rpcError) throw rpcError;
      return data;
    }, "Failed to search stock items by stock code");
  }

  async function handleDescriptionLookup() {
    const searchDescription = description.trim();
    if (!searchDescription) return;

    const supabase = createClient();
    await runItemLookup(async () => {
      const { data, error: rpcError } = await supabase.rpc(
        "pr_stock_item_all_like",
        { p_descr: searchDescription }
      );
      if (rpcError) throw rpcError;
      return data;
    }, "Failed to search stock items by description");
  }

  function closeItemLookup() {
    setItemLookupOpen(false);
    setItemLookupRows([]);
    setItemLookupError("");
    setItemLookupLoading(false);
  }

  async function handleItemLookupSelect(row) {
    await populateFormFromRow(row);
    closeItemLookup();
  }

  async function handleRowClick(row) {
    await populateFormFromRow(row);
  }

  function handleNew() {
    initializeForm();
  }

  async function handleChange() {
    const payload = buildUpdatePayload();
    if (!payload.p_id || !isInsertFormValid()) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("pu_stock_item", payload);
      if (rpcError) throw rpcError;
      await refreshAfterAction("Stock item updated.");
    } catch (err) {
      setError(err.message ?? "Failed to update stock item");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeactivate() {
    const id = parseInteger(stockItemId);
    if (id == null) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("pd_stock_item", {
        p_id: id,
      });
      if (rpcError) throw rpcError;
      await refreshAfterAction("Stock item deactivated.");
    } catch (err) {
      setError(err.message ?? "Failed to deactivate stock item");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-6 max-w-4xl">
      <input
        type="text"
        value={stockItemId}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
      />

      <div className="flex flex-col gap-4 sm:flex-row">
        <label className="flex w-full flex-col gap-1 sm:w-40 sm:shrink-0">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Stock Code
            <RequiredMarker />
          </span>
          <div className="flex">
            <input
              type="text"
              value={stockCode}
              onChange={(e) => setStockCode(e.target.value)}
              className={`${inputClassName} min-w-0 flex-1 rounded-r-none border-r-0`}
            />
            <button
              type="button"
              onClick={handleStockCodeLookup}
              className={adjoinedButtonClassName}
            >
              &gt;&gt;
            </button>
          </div>
        </label>

        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Description
            <RequiredMarker />
          </span>
          <div className="flex">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${inputClassName} min-w-0 flex-1 rounded-r-none border-r-0`}
            />
            <button
              type="button"
              onClick={handleDescriptionLookup}
              className={adjoinedButtonClassName}
            >
              &gt;&gt;
            </button>
          </div>
        </label>
      </div>

      {itemLookupOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="item-lookup-title"
            className="w-full max-w-2xl rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <h3
                id="item-lookup-title"
                className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
              >
                Select Stock Item
              </h3>
              <button
                type="button"
                onClick={closeItemLookup}
                className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Close
              </button>
            </div>

            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
                  <tr>
                    <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                      Stock Code
                    </th>
                    <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {itemLookupLoading ? (
                    <tr>
                      <td
                        colSpan={2}
                        className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                      >
                        Loading…
                      </td>
                    </tr>
                  ) : itemLookupError ? (
                    <tr>
                      <td
                        colSpan={2}
                        className="px-4 py-3 text-red-600 dark:text-red-400"
                      >
                        {itemLookupError}
                      </td>
                    </tr>
                  ) : itemLookupRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={2}
                        className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                      >
                        No matching stock items found.
                      </td>
                    </tr>
                  ) : (
                    itemLookupRows.map((row, index) => (
                      <tr
                        key={row.rowKey ?? `lookup-row-${index}`}
                        onClick={() => handleItemLookupSelect(row)}
                        className="cursor-pointer border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                      >
                        <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                          {row.stock_code}
                        </td>
                        <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                          {row.stock_item}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="flex gap-2">
          <label className="flex w-[45%] min-w-0 flex-col gap-1">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Unit Type
              <RequiredMarker />
            </span>
            <select
              value={unitTypeId}
              onChange={(e) => setUnitTypeId(e.target.value)}
              disabled={unitTypesLoading}
              className={inputClassName}
            >
              <option value="">
                {unitTypesLoading ? "Loading…" : SELECT_PLACEHOLDER}
              </option>
              {unitTypeOptions.map((option, index) => (
                <option
                  key={option.id ?? `unit-type-${index}`}
                  value={optionValue(option)}
                >
                  {optionLabel(option)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex w-[45%] min-w-0 flex-col gap-1">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Unit Quantity
              <RequiredMarker />
            </span>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={unitQuantity}
              onChange={(e) => setUnitQuantity(e.target.value)}
              className={inputClassName}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Category
            <RequiredMarker />
          </span>
          <select
            value={categoryId}
            onChange={(e) => handleCategoryChange(e.target.value)}
            disabled={categoriesLoading}
            className={inputClassName}
          >
            <option value="">
              {categoriesLoading ? "Loading…" : SELECT_PLACEHOLDER}
            </option>
            {categoryOptions.map((option, index) => (
              <option
                key={option.id ?? `category-${index}`}
                value={optionValue(option)}
              >
                {optionLabel(option)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Sub-category
            <RequiredMarker />
          </span>
          <select
            value={subcategoryId}
            onChange={(e) => setSubcategoryId(e.target.value)}
            disabled={!categoryId || subcategoriesLoading}
            className={inputClassName}
          >
            <option value="">
              {subcategoriesLoading ? "Loading…" : SELECT_PLACEHOLDER}
            </option>
            {subcategoryOptions.map((option, index) => (
              <option
                key={option.id ?? `subcategory-${index}`}
                value={optionValue(option)}
              >
                {optionLabel(option)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Width (cm)
            <RequiredMarker />
          </span>
          <input
            type="number"
            step="any"
            inputMode="decimal"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
            className={inputClassName}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Length (cm)
            <RequiredMarker />
          </span>
          <input
            type="number"
            step="any"
            inputMode="decimal"
            value={length}
            onChange={(e) => setLength(e.target.value)}
            className={inputClassName}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Height (cm)
            <RequiredMarker />
          </span>
          <input
            type="number"
            step="any"
            inputMode="decimal"
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
            className={inputClassName}
          />
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Location
            <RequiredMarker />
          </span>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            disabled={locationsLoading}
            className={inputClassName}
          >
            <option value="">
              {locationsLoading ? "Loading…" : SELECT_PLACEHOLDER}
            </option>
            {locationOptions.map((option, index) => (
              <option
                key={option.id ?? `location-${index}`}
                value={optionValue(option)}
              >
                {optionLabel(option)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Unit Price
            <RequiredMarker />
          </span>
          <input
            type="number"
            step="any"
            inputMode="decimal"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            className={inputClassName}
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Status
          </span>
          <div className="flex h-[42px] items-center gap-3">
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
        </div>
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

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!editMode ? (
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || !isInsertFormValid()}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save"}
          </button>
        ) : (
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
              disabled={loading || !isInsertFormValid() || !stockItemId}
              className="rounded bg-orange-200 px-4 py-2 text-sm font-medium text-orange-900 hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-900/40 dark:text-orange-100 dark:hover:bg-orange-900/60"
            >
              {loading ? "Saving…" : "Change"}
            </button>
            <button
              type="button"
              onClick={handleDeactivate}
              disabled={loading || !stockItemId}
              className="rounded bg-red-200 px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-900/60"
            >
              {loading ? "Saving…" : "Deactivate"}
            </button>
          </>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
            <tr>
              <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                Stock Code
              </th>
              <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                Description
              </th>
              <th className="hidden px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                unit_qty
              </th>
              <th className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                Active
              </th>
            </tr>
          </thead>
          <tbody>
            {gridLoading ? (
              <tr key="stock-items-loading">
                <td
                  colSpan={4}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  Loading…
                </td>
              </tr>
            ) : stockItems.length === 0 ? (
              <tr key="stock-items-empty">
                <td
                  colSpan={4}
                  className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                >
                  No stock items found.
                </td>
              </tr>
            ) : (
              stockItems.map((row) => (
                <tr
                  key={row.rowKey}
                  onClick={() => handleRowClick(row)}
                  className={`cursor-pointer border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 ${
                    selectedId === row.id
                      ? "bg-sky-50 dark:bg-sky-900/20"
                      : ""
                  }`}
                >
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.stock_code}
                  </td>
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.stock_item}
                  </td>
                  <td className="hidden px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {row.unit_qty ?? ""}
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
