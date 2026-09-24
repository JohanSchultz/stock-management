function parseGridNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number.parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Display format # ### ##0.00 (space thousands separator, 2 decimals). */
export function formatGridQtyOrUnitPrice(value) {
  const parsed = parseGridNumber(value);
  if (parsed == null) {
    if (value == null || value === "") return "";
    return String(value);
  }

  const fixed = parsed.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const isNegative = intPart.startsWith("-");
  const digits = isNegative ? intPart.slice(1) : intPart;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  return `${isNegative ? "-" : ""}${grouped}.${decPart}`;
}

export function isQtyColumnKey(columnKey) {
  const normalized = String(columnKey ?? "").trim().toLowerCase();
  return normalized === "qty" || normalized === "quantity";
}

export function isUnitPriceColumnKey(columnKey) {
  const normalized = String(columnKey ?? "").trim().toLowerCase();
  return normalized === "unit_price" || normalized === "unitprice";
}

export function isQtyOrUnitPriceColumnKey(columnKey) {
  return isQtyColumnKey(columnKey) || isUnitPriceColumnKey(columnKey);
}
