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

  return lookup;
}

const hrefToLabel = buildHrefToLabelLookup();

export const protectedMenuPaths = new Set(hrefToLabel.keys());

export function normalizePathname(pathname) {
  if (!pathname || pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function getAllowedMenuPaths(permissions) {
  const allowedDescrs = new Set(
    (Array.isArray(permissions) ? permissions : [])
      .map((row) => String(row.descr ?? "").trim().toLowerCase())
      .filter(Boolean)
  );

  const allowedPaths = new Set();

  for (const [href, label] of hrefToLabel) {
    if (allowedDescrs.has(label)) {
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
