import { menuTree } from "./menuTree";

function buildHrefToLabelLookup() {
  const lookup = new Map();

  for (const parent of menuTree) {
    for (const child of parent.children ?? []) {
      if (!child.href) continue;
      lookup.set(child.href, child.label.trim().toLowerCase());
    }
  }

  lookup.set("/orders-in", "orders in");
  lookup.set("/orders-out", "orders out");
  lookup.set("/stock-taking", "stock taking");
  lookup.set("/order-reports", "order reports");
  lookup.set("/expiry-date-report", "expiry date report");
  lookup.set("/stock-ageing", "stock ageing");
  lookup.set("/stock-levels", "stock levels");
  lookup.set("/warehouse-space", "warehouse space");
  lookup.set("/warehouse-space-utilisation", "warehouse space utilisation");

  return lookup;
}

const hrefToLabel = buildHrefToLabelLookup();

const hrefPermissionAliases = new Map([
  ["/stock-report", ["stock report", "stock balance report"]],
  [
    "/warehouse-space-utilisation",
    ["warehouse space utilisation", "warehouse space utilization"],
  ],
]);

export const protectedMenuPaths = new Set(hrefToLabel.keys());

export function normalizePathname(pathname) {
  if (!pathname || pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function getAllowedMenuPaths(permissions) {
  const allowedDescrs = new Set();

  for (const row of Array.isArray(permissions) ? permissions : []) {
    for (const value of [row.descr, row.menu_section]) {
      const normalized = String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
      if (normalized) allowedDescrs.add(normalized);
    }
  }

  const allowedPaths = new Set();

  for (const [href, label] of hrefToLabel) {
    const aliases = hrefPermissionAliases.get(href) ?? [label];
    if (aliases.some((alias) => allowedDescrs.has(alias))) {
      allowedPaths.add(href);
    }
  }

  return allowedPaths;
}

export function isProtectedMenuPath(pathname) {
  return protectedMenuPaths.has(normalizePathname(pathname));
}

export function isMenuPathAllowed(pathname, permissions) {
  const normalizedPath = normalizePathname(pathname);

  if (!protectedMenuPaths.has(normalizedPath)) {
    return true;
  }

  return getAllowedMenuPaths(permissions).has(normalizedPath);
}
