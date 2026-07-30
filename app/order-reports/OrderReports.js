"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useMemo, useState } from "react";

const inputClassName =
  "rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

const SELECT_PLACEHOLDER = " -SELECT- ";

const ORDER_TYPE_INCOMING = "incoming";
const ORDER_TYPE_OUTGOING = "outgoing";

const TOTAL_VALUE_COLUMN = "total_value";

const TEXT_COLUMN_KEYS = new Set([
  "stock_code",
  "descr",
  "description",
  "item",
  "supplier",
  "customer",
  "comments",
]);

const decimalFormatter = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const TABLE_BORDER = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

const EXCEL_MERGE_LAST_COLUMN = "I";
const EXCEL_NUMBER_FORMAT = "#,##0.00";
const EXCEL_TABLE_START_ROW = 5;
const EXCEL_COLUMN_WIDTHS = [14, 22, 17, 27, 35, 20, 11, 20, 14];
const EXCEL_HEADER_DATA_ROW = EXCEL_TABLE_START_ROW + 1;

function formatReportDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function parseRoundedNumber(value) {
  const parsed = parseFloatValue(value);
  if (parsed == null) return null;
  return Number.parseFloat(parsed.toFixed(2));
}

function getExportCellValue(value, columnKey) {
  if (value == null || value === "") return "";

  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (
    isDateColumn(columnKey) &&
    (typeof value === "string" || value instanceof Date)
  ) {
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    return String(value).slice(0, 10);
  }

  if (!isTextColumn(columnKey) && isNumericValue(value)) {
    if (normalizeColumnKey(columnKey) === "id") {
      const parsed = parseInteger(value);
      return parsed ?? value;
    }
    return parseRoundedNumber(value) ?? value;
  }

  return value;
}

async function writeWorkbookToFile(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function applyExcelColumnWidths(worksheet) {
  EXCEL_COLUMN_WIDTHS.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });
}

function centerColumnA(worksheet, lastRow) {
  for (let rowNumber = 1; rowNumber <= lastRow; rowNumber += 1) {
    const cell = worksheet.getCell(rowNumber, 1);
    cell.alignment = {
      ...(cell.alignment ?? {}),
      horizontal: "center",
    };
  }
}

function writeGridSection(
  worksheet,
  startRow,
  rows,
  columns,
  { includeTotalValueFooter = false, totalValueSum = 0, useLineValues = false } = {}
) {
  const headerRow = worksheet.getRow(startRow);
  columns.forEach((columnKey, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = formatColumnHeader(columnKey);
    cell.font = { name: "Aptos", size: 11, bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF00" },
    };
    cell.border = TABLE_BORDER;
    if (isNumericColumn(columnKey)) {
      cell.alignment = { horizontal: "right" };
    }
  });

  rows.forEach((row, rowIndex) => {
    const excelRow = worksheet.getRow(startRow + 1 + rowIndex);
    columns.forEach((columnKey, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1);
      const rawValue = useLineValues
        ? getRowCellValue(row, columnKey)
        : row[columnKey];
      const value = getExportCellValue(rawValue, columnKey);

      cell.value = value;
      cell.font = { name: "Aptos", size: 11 };
      cell.border = TABLE_BORDER;

      if (isNumericColumn(columnKey) && typeof value === "number") {
        cell.numFmt = EXCEL_NUMBER_FORMAT;
      }

      if (isDateColumn(columnKey) && value instanceof Date) {
        cell.numFmt = "dd mmm yyyy";
      }

      if (isNumericColumn(columnKey)) {
        cell.alignment = { horizontal: "right" };
      }
    });
  });

  if (!includeTotalValueFooter || rows.length === 0) {
    return startRow + rows.length;
  }

  const totalsRowNumber = startRow + 1 + rows.length;
  const totalsRow = worksheet.getRow(totalsRowNumber);
  columns.forEach((columnKey, colIndex) => {
    const cell = totalsRow.getCell(colIndex + 1);
    let value = "";

    if (colIndex === 0) {
      value = "Total";
    } else if (normalizeColumnKey(columnKey) === TOTAL_VALUE_COLUMN) {
      value = parseRoundedNumber(totalValueSum) ?? 0;
    }

    cell.value = value;
    cell.font = { name: "Aptos", size: 11, bold: true };
    cell.border = TABLE_BORDER;

    if (
      normalizeColumnKey(columnKey) === TOTAL_VALUE_COLUMN &&
      typeof value === "number"
    ) {
      cell.numFmt = EXCEL_NUMBER_FORMAT;
      cell.alignment = { horizontal: "right" };
    }
  });

  return totalsRowNumber;
}

async function exportOrderReportsToExcel({
  headerRows,
  headerColumns,
  lineRows,
  lineColumns,
  lineTotalValueSum,
}) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Order Details");

  worksheet.mergeCells(`A1:${EXCEL_MERGE_LAST_COLUMN}1`);
  const titleCell = worksheet.getCell("A1");
  titleCell.value = "Order Details";
  titleCell.font = { name: "Aptos", size: 18 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  worksheet.getRow(2).height = 57;

  const reportDateCell = worksheet.getCell("A3");
  reportDateCell.value = `Report Date: ${formatReportDate()}`;
  reportDateCell.font = { name: "Aptos", size: 14 };

  let nextRow = EXCEL_TABLE_START_ROW;
  nextRow = writeGridSection(worksheet, nextRow, headerRows, headerColumns);
  nextRow += 2;
  const lastRow = writeGridSection(worksheet, nextRow, lineRows, lineColumns, {
    useLineValues: true,
    includeTotalValueFooter: true,
    totalValueSum: lineTotalValueSum,
  });

  applyExcelColumnWidths(worksheet);
  centerColumnA(worksheet, lastRow);

  const headerDataCell = worksheet.getCell(EXCEL_HEADER_DATA_ROW, 3);
  headerDataCell.alignment = {
    ...(headerDataCell.alignment ?? {}),
    horizontal: "left",
  };

  await writeWorkbookToFile(workbook, "order-details.xlsx");
}

function todayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toOptions(data) {
  return Array.isArray(data) ? data : [];
}

function optionLabel(option) {
  return (
    option.descr ??
    option.customer ??
    option.description ??
    option.name ??
    ""
  );
}

function optionValue(option) {
  const id = option.id ?? option.customer_id;
  return id != null ? String(id) : "";
}

function normalizeCustomerOptions(data) {
  if (!Array.isArray(data)) return [];

  return data
    .map((row, index) => ({
      id: row.id ?? row.customer_id ?? null,
      descr: row.descr ?? row.customer ?? row.description ?? row.name ?? "",
      is_active: row.is_active,
      optionKey: `customer-option-${index}`,
    }))
    .sort((left, right) => optionLabel(left).localeCompare(optionLabel(right)));
}

function parseInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseFloatValue(value) {
  if (value == null || value === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeColumnKey(key) {
  return String(key ?? "").trim().toLowerCase();
}

function isTextColumn(columnKey) {
  return TEXT_COLUMN_KEYS.has(normalizeColumnKey(columnKey));
}

function isDateColumn(columnKey) {
  return normalizeColumnKey(columnKey).includes("date");
}

function isNumericValue(value) {
  if (value == null || value === "") return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return false;

  const parsed = Number.parseFloat(value);
  return !Number.isNaN(parsed);
}

function formatNumberWithSeparators(value) {
  const parsed = parseFloatValue(value);
  if (parsed == null) return String(value);
  return decimalFormatter.format(parsed);
}

function findRowColumnKey(row, name) {
  return Object.keys(row).find((key) => normalizeColumnKey(key) === name);
}

function computeTotalValue(row) {
  const qtyKey = findRowColumnKey(row, "qty");
  const qtyOnOrderKey = findRowColumnKey(row, "qty_on_order");
  const unitPriceKey = findRowColumnKey(row, "unit_price");
  if (!unitPriceKey) return null;

  const qty = qtyKey ? (parseFloatValue(row[qtyKey]) ?? 0) : 0;
  const qtyOnOrder = qtyOnOrderKey ? (parseFloatValue(row[qtyOnOrderKey]) ?? 0) : 0;
  const unitPrice = parseFloatValue(row[unitPriceKey]);
  if (unitPrice == null) return null;

  return (qty + qtyOnOrder) * unitPrice;
}

function getRowCellValue(row, columnKey) {
  if (normalizeColumnKey(columnKey) === TOTAL_VALUE_COLUMN) {
    return computeTotalValue(row);
  }
  return row[columnKey];
}

function normalizeReportRows(data, keyPrefix) {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    ...row,
    rowKey:
      row.id != null
        ? `${keyPrefix}-${row.id}`
        : `${keyPrefix}-row-${index}`,
  }));
}

function formatColumnHeader(key) {
  const normalized = normalizeColumnKey(key);
  if (normalized === "id") return "No.";
  if (normalized === TOTAL_VALUE_COLUMN) return "Total Value";

  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getColumnKeys(rows) {
  const keys = [];
  const seen = new Set();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key === "rowKey") continue;
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }

  return keys;
}

function getLineDisplayColumns(dataColumns) {
  if (dataColumns.length === 0) return dataColumns;
  if (dataColumns.includes(TOTAL_VALUE_COLUMN)) return dataColumns;
  return [...dataColumns, TOTAL_VALUE_COLUMN];
}

function formatCellValue(value, column) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (
    isDateColumn(column) &&
    (typeof value === "string" || value instanceof Date)
  ) {
    return String(value).slice(0, 10);
  }
  if (!isTextColumn(column) && isNumericValue(value)) {
    if (normalizeColumnKey(column) === "id") {
      return String(value);
    }
    return formatNumberWithSeparators(value);
  }
  return String(value);
}

function isNumericColumn(column) {
  if (isTextColumn(column) || isDateColumn(column)) return false;

  const normalized = normalizeColumnKey(column);
  return (
    normalized === TOTAL_VALUE_COLUMN ||
    normalized === "id" ||
    /(?:^|_)(qty|quantity|price|value|amount|total|perc|space|balance|unit_price|qty_on_order)(?:_|$)/i.test(
      column
    )
  );
}

function getFirstColumnValue(row, columns) {
  if (columns.length === 0) return null;
  return row[columns[0]];
}

function computeTotalValueSum(rows) {
  return rows.reduce((sum, row) => {
    const value = computeTotalValue(row);
    return value == null ? sum : sum + value;
  }, 0);
}

function formatTotalCellValue(column, columns, totalValueSum) {
  if (columns.length === 0) return "";
  if (column === columns[0]) return "Total";
  if (normalizeColumnKey(column) === TOTAL_VALUE_COLUMN) {
    return formatNumberWithSeparators(totalValueSum);
  }
  return "";
}

function ReportGrid({
  rows,
  columns,
  loading,
  emptyMessage,
  selectedRowKey,
  onRowClick,
  showTotalValueFooter = false,
  totalValueSum = 0,
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <table className="w-full min-w-max text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                className={`whitespace-nowrap px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300 ${
                  isNumericColumn(column) ? "text-right" : ""
                }`}
              >
                {formatColumnHeader(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td
                colSpan={Math.max(columns.length, 1)}
                className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
              >
                Loading…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={Math.max(columns.length, 1)}
                className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            <>
              {rows.map((row) => (
                <tr
                  key={row.rowKey}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-zinc-100 dark:border-zinc-800 ${
                    onRowClick
                      ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                      : ""
                  } ${
                    selectedRowKey === row.rowKey
                      ? "bg-sky-50 dark:bg-sky-900/20"
                      : ""
                  }`}
                >
                  {columns.map((column) => (
                    <td
                      key={`${row.rowKey}-${column}`}
                      className={`whitespace-nowrap px-4 py-2 text-zinc-800 dark:text-zinc-200 ${
                        isNumericColumn(column) ? "text-right" : ""
                      }`}
                    >
                      {formatCellValue(getRowCellValue(row, column), column)}
                    </td>
                  ))}
                </tr>
              ))}
              {showTotalValueFooter ? (
                <tr className="border-t border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
                  {columns.map((column) => (
                    <td
                      key={`total-${column}`}
                      className={`whitespace-nowrap px-4 py-2 font-bold text-zinc-800 dark:text-zinc-200 ${
                        isNumericColumn(column) ? "text-right" : ""
                      }`}
                    >
                      {formatTotalCellValue(column, columns, totalValueSum)}
                    </td>
                  ))}
                </tr>
              ) : null}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function OrderReports() {
  const [orderType, setOrderType] = useState(ORDER_TYPE_INCOMING);
  const [fromDate, setFromDate] = useState(todayIsoDate());
  const [toDate, setToDate] = useState(todayIsoDate());
  const [supplierId, setSupplierId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [lineRows, setLineRows] = useState([]);
  const [selectedRowKey, setSelectedRowKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [linesLoading, setLinesLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const loadSuppliers = useCallback(async () => {
    setSuppliersLoading(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("pr_suppliers_active");
      if (rpcError) throw rpcError;
      setSupplierOptions(toOptions(data));
    } catch (err) {
      setSupplierOptions([]);
      setError(err.message ?? "Failed to load suppliers");
    } finally {
      setSuppliersLoading(false);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("pr_customer_active");
      if (rpcError) throw rpcError;
      setCustomerOptions(normalizeCustomerOptions(data));
    } catch (err) {
      setCustomerOptions([]);
      setError(err.message ?? "Failed to load customers");
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuppliers();
    loadCustomers();
  }, [loadSuppliers, loadCustomers]);

  const columns = useMemo(() => getColumnKeys(rows), [rows]);
  const lineDataColumns = useMemo(() => getColumnKeys(lineRows), [lineRows]);
  const lineColumns = useMemo(
    () => getLineDisplayColumns(lineDataColumns),
    [lineDataColumns]
  );
  const lineTotalValueSum = useMemo(
    () => computeTotalValueSum(lineRows),
    [lineRows]
  );
  const selectedHeaderRow = useMemo(
    () => rows.find((row) => row.rowKey === selectedRowKey) ?? null,
    [rows, selectedRowKey]
  );
  const isIncoming = orderType === ORDER_TYPE_INCOMING;

  function clearGrids() {
    setRows([]);
    setLineRows([]);
    setSelectedRowKey(null);
  }

  function handleOrderTypeChange(nextOrderType) {
    clearGrids();
    setOrderType(nextOrderType);
  }

  function handleFromDateChange(value) {
    clearGrids();
    setFromDate(value);
  }

  function handleToDateChange(value) {
    clearGrids();
    setToDate(value);
  }

  function handleSupplierChange(value) {
    clearGrids();
    setSupplierId(value);
  }

  function handleCustomerChange(value) {
    clearGrids();
    setCustomerId(value);
  }

  async function handleShowReport() {
    setLoading(true);
    setError("");
    clearGrids();

    try {
      const supabase = createClient();

      if (isIncoming) {
        const { data, error: rpcError } = await supabase.rpc(
          "pr_rpt_orders_in_headers",
          {
            p_from: fromDate,
            p_to: toDate,
            p_supplier_id: parseInteger(supplierId) ?? 0,
          }
        );
        if (rpcError) throw rpcError;
        setRows(normalizeReportRows(data, "order-report-header"));
      } else {
        const { data, error: rpcError } = await supabase.rpc(
          "pr_rpt_orders_out_headers",
          {
            p_from: fromDate,
            p_to: toDate,
            p_customer_id: parseInteger(customerId) ?? 0,
          }
        );
        if (rpcError) throw rpcError;
        setRows(normalizeReportRows(data, "order-report-header"));
      }
    } catch (err) {
      setRows([]);
      setError(err.message ?? "Failed to load order report");
    } finally {
      setLoading(false);
    }
  }

  async function handleHeaderRowClick(row) {
    const orderId = parseInteger(getFirstColumnValue(row, columns));
    if (orderId == null) return;

    setSelectedRowKey(row.rowKey);
    setLinesLoading(true);
    setError("");
    setLineRows([]);

    try {
      const supabase = createClient();

      if (isIncoming) {
        const { data, error: rpcError } = await supabase.rpc(
          "pr_rpt_orders_in_lines",
          { p_order_in: orderId }
        );
        if (rpcError) throw rpcError;
        setLineRows(normalizeReportRows(data, "order-report-line"));
      } else {
        const { data, error: rpcError } = await supabase.rpc(
          "pr_rpt_orders_out_lines",
          { p_order_out: orderId }
        );
        if (rpcError) throw rpcError;
        setLineRows(normalizeReportRows(data, "order-report-line"));
      }
    } catch (err) {
      setLineRows([]);
      setError(err.message ?? "Failed to load order report lines");
    } finally {
      setLinesLoading(false);
    }
  }

  async function handleExportToExcel() {
    if (lineRows.length === 0 || !selectedHeaderRow) return;

    setExporting(true);
    setError("");

    try {
      await exportOrderReportsToExcel({
        headerRows: [selectedHeaderRow],
        headerColumns: columns,
        lineRows,
        lineColumns,
        lineTotalValueSum,
      });
    } catch (err) {
      setError(err.message ?? "Failed to export order report");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mt-4 w-full">
      {error ? (
        <p
          className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <fieldset className="rounded-lg border border-zinc-300 px-4 py-3 dark:border-zinc-600">
        <legend className="sr-only">Order report type</legend>
        <div
          role="radiogroup"
          aria-label="Order report type"
          className="flex flex-wrap items-center gap-4"
        >
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="radio"
              name="orderReportType"
              value={ORDER_TYPE_INCOMING}
              checked={isIncoming}
              onChange={() => handleOrderTypeChange(ORDER_TYPE_INCOMING)}
              className="h-4 w-4 border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            Incoming Orders
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="radio"
              name="orderReportType"
              value={ORDER_TYPE_OUTGOING}
              checked={!isIncoming}
              onChange={() => handleOrderTypeChange(ORDER_TYPE_OUTGOING)}
              className="h-4 w-4 border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            Outgoing Orders
          </label>
        </div>
      </fieldset>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            From
          </span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => handleFromDateChange(e.target.value)}
            className={inputClassName}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            To
          </span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => handleToDateChange(e.target.value)}
            className={inputClassName}
          />
        </label>

        {isIncoming ? (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Supplier
            </span>
            <select
              value={supplierId}
              onChange={(e) => handleSupplierChange(e.target.value)}
              disabled={suppliersLoading}
              className={inputClassName}
            >
              <option value="">
                {suppliersLoading ? "Loading…" : SELECT_PLACEHOLDER}
              </option>
              {supplierOptions.map((option, index) => (
                <option
                  key={option.id ?? `supplier-${index}`}
                  value={optionValue(option)}
                >
                  {optionLabel(option)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Customer
            </span>
            <select
              value={customerId}
              onChange={(e) => handleCustomerChange(e.target.value)}
              disabled={customersLoading}
              className={inputClassName}
            >
              <option value="">
                {customersLoading ? "Loading…" : SELECT_PLACEHOLDER}
              </option>
              {customerOptions.map((option, index) => (
                <option
                  key={option.optionKey ?? `customer-${index}`}
                  value={optionValue(option)}
                >
                  {optionLabel(option)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={handleShowReport}
          disabled={loading}
          className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          {loading ? "Loading…" : "Show Report"}
        </button>
      </div>

      <div className="mt-4">
        <ReportGrid
          rows={rows}
          columns={columns}
          loading={loading}
          emptyMessage="No order report records found."
          selectedRowKey={selectedRowKey}
          onRowClick={rows.length > 0 && !loading ? handleHeaderRowClick : undefined}
        />
      </div>

      {!loading && rows.length > 0 ? (
        <p className="mt-2 text-sm text-blue-600 dark:text-blue-400">
          Click an item in the grid above to see the items of the order.
        </p>
      ) : null}

      <div className="mt-4">
        <ReportGrid
          rows={lineRows}
          columns={lineColumns}
          loading={linesLoading}
          emptyMessage="No order line records found."
          showTotalValueFooter={lineRows.length > 0}
          totalValueSum={lineTotalValueSum}
        />
      </div>

      {lineRows.length > 0 ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={handleExportToExcel}
            disabled={exporting || linesLoading}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? "Exporting…" : "Export to Excel"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
