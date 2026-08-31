"use client";

import { useState } from "react";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

const ORDER_TYPE_IN = "orders-in";
const ORDER_TYPE_OUT = "orders-out";

function tomorrowIsoDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function threeMonthsBeforeTodayIsoDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 3);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ClosedOrders() {
  const [orderType, setOrderType] = useState(ORDER_TYPE_IN);
  const [filterFromDate, setFilterFromDate] = useState(
    threeMonthsBeforeTodayIsoDate
  );
  const [filterToDate, setFilterToDate] = useState(tomorrowIsoDate);
  const [orderNumber, setOrderNumber] = useState("");

  const isOrdersIn = orderType === ORDER_TYPE_IN;

  return (
    <div className="mt-4 w-full">
      <fieldset className="rounded-lg border border-zinc-300 px-4 py-3 dark:border-zinc-600">
        <legend className="sr-only">Closed order type</legend>
        <div
          role="radiogroup"
          aria-label="Closed order type"
          className="flex flex-wrap items-center gap-4"
        >
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="radio"
              name="closedOrderType"
              value={ORDER_TYPE_IN}
              checked={isOrdersIn}
              onChange={() => setOrderType(ORDER_TYPE_IN)}
              className="h-4 w-4 border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            Orders In
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="radio"
              name="closedOrderType"
              value={ORDER_TYPE_OUT}
              checked={!isOrdersIn}
              onChange={() => setOrderType(ORDER_TYPE_OUT)}
              className="h-4 w-4 border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            Orders Out
          </label>
        </div>
      </fieldset>

      <div className="mt-6">
        <p className="mb-2 text-sm font-bold text-zinc-800 dark:text-zinc-200">
          Grid Filtering:
        </p>
        <div className="rounded-lg border border-zinc-300 bg-zinc-100 p-4 dark:border-zinc-600 dark:bg-zinc-800/50">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 sm:w-48">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                From
              </span>
              <input
                type="date"
                value={filterFromDate}
                onChange={(e) => setFilterFromDate(e.target.value)}
                className={inputClassName}
              />
            </label>

            <label className="flex flex-col gap-1 sm:w-48">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                To
              </span>
              <input
                type="date"
                value={filterToDate}
                onChange={(e) => setFilterToDate(e.target.value)}
                className={inputClassName}
              />
            </label>

            <label className="flex flex-col gap-1 sm:w-40 sm:shrink-0">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Order Number
              </span>
              <input
                type="text"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className={inputClassName}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
