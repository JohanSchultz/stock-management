"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

const adjoinedButtonClassName =
  "shrink-0 rounded-r border border-l-0 border-zinc-300 bg-zinc-50 px-2 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700";

function normalizeStockItems(data) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    id: row.id ?? row.stock_item_id ?? null,
    stock_code: row.stock_code ?? "",
    stock_item: row.stock_item ?? "",
    is_active: row.is_active,
    rowKey:
      row.id != null
        ? `stock-item-${row.id}`
        : `stock-item-row-${index}-${row.stock_code ?? "unknown"}`,
  }));
}

export function StockItemLookupFields({
  stockCode,
  description,
  onStockCodeChange,
  onDescriptionChange,
  onSelect,
}) {
  const [itemLookupOpen, setItemLookupOpen] = useState(false);
  const [itemLookupRows, setItemLookupRows] = useState([]);
  const [itemLookupLoading, setItemLookupLoading] = useState(false);
  const [itemLookupError, setItemLookupError] = useState("");

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

  function handleItemLookupSelect(row) {
    onSelect?.(row);
    closeItemLookup();
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row">
        <label className="flex w-full flex-col gap-1 sm:w-40 sm:shrink-0">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Stock Code
          </span>
          <div className="flex">
            <input
              type="text"
              value={stockCode}
              onChange={(e) => onStockCodeChange(e.target.value)}
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
          </span>
          <div className="flex">
            <input
              type="text"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
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
    </>
  );
}
