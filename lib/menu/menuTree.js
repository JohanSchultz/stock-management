export const menuTree = [
  {
    id: "administration",
    label: "Administration",
    children: [
      {
        id: "booking-in-types",
        label: "Booking In Types",
        href: "/booking-in-types",
      },
      {
        id: "booking-out-types",
        label: "Booking Out Types",
        href: "/booking-out-types",
      },
      { id: "customers", label: "Customers", href: "/customers" },
      { id: "location", label: "Locations", href: "/location" },
      { id: "permissions", label: "Permissions", href: "/permissions" },
      { id: "return-reasons", label: "Return Reasons", href: "/return-reasons" },
      {
        id: "stock-categories",
        label: "Stock Categories",
        href: "/stock-categories",
      },
      { id: "stock-items", label: "Stock Items", href: "/stock-items" },
      {
        id: "stock-sub-categories",
        label: "Stock Sub-categories",
        href: "/stock-sub-categories",
      },
      { id: "suppliers", label: "Suppliers", href: "/suppliers" },
    ],
  },
  {
    id: "function",
    label: "Function",
    children: [
      { id: "booking-in", label: "Booking In", href: "/booking-in" },
      { id: "booking-out", label: "Booking Out", href: "/booking-out" },
      { id: "stock-taking", label: "Stock Taking", href: "/stock-taking" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    children: [
      { id: "stock-report", label: "Stock Balance Report", href: "/stock-report" },
      { id: "order-reports", label: "Order Reports", href: "/order-reports" },
      {
        id: "expiry-date-report",
        label: "Expiry Date Report",
        href: "/expiry-date-report",
      },
      { id: "stock-ageing", label: "Stock Ageing", href: "/stock-ageing" },
      { id: "stock-levels", label: "Stock Levels", href: "/stock-levels" },
    ],
  },
];

export const menuDynamicTree = menuTree.map((node) => ({
  ...node,
  label: node.id === "function" ? "Functions" : node.label,
  children: [],
}));

function slugifyMenuLabel(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "item";
}

function buildMenuHrefLookup() {
  const lookup = new Map();

  for (const parent of menuTree) {
    for (const child of parent.children ?? []) {
      if (!child.href) continue;
      lookup.set(child.label.trim().toLowerCase(), {
        id: child.id,
        href: child.href,
      });
    }
  }

  lookup.set("orders in", { id: "orders-in", href: "/orders-in" });
  lookup.set("orders out", { id: "orders-out", href: "/orders-out" });
  lookup.set("stock taking", { id: "stock-taking", href: "/stock-taking" });
  lookup.set("stock report", { id: "stock-report", href: "/stock-report" });
  lookup.set("order reports", { id: "order-reports", href: "/order-reports" });
  lookup.set("expiry date report", {
    id: "expiry-date-report",
    href: "/expiry-date-report",
  });
  lookup.set("stock ageing", { id: "stock-ageing", href: "/stock-ageing" });
  lookup.set("stock levels", { id: "stock-levels", href: "/stock-levels" });

  return lookup;
}

const menuHrefLookup = buildMenuHrefLookup();

function menuSectionMatchesParent(parent, menuSection) {
  const section = String(menuSection ?? "").trim();
  const label = parent.label.trim();

  if (section === label) return true;
  if (parent.id === "function") {
    const sectionLower = section.toLowerCase();
    if (
      sectionLower === "function" ||
      sectionLower === "functions" ||
      sectionLower === "orders in" ||
      sectionLower === "orders out"
    ) {
      return true;
    }
  }
  if (parent.id === "reports") {
    const sectionLower = section.toLowerCase();
    if (
      sectionLower === "reports" ||
      sectionLower === "order reports" ||
      sectionLower === "expiry date report" ||
      sectionLower === "stock ageing" ||
      sectionLower === "stock levels"
    ) {
      return true;
    }
  }

  return false;
}

function normalizePermissionRow(row) {
  const section = String(row.menu_section ?? "").trim();
  const descr = String(row.descr ?? "").trim();
  const sectionLower = section.toLowerCase();

  if (sectionLower === "order reports") {
    return {
      menu_section: "Reports",
      descr: descr || "Order Reports",
    };
  }

  if (sectionLower === "expiry date report") {
    return {
      menu_section: "Reports",
      descr: descr || "Expiry Date Report",
    };
  }

  if (sectionLower === "stock ageing") {
    return {
      menu_section: "Reports",
      descr: descr || "Stock Ageing",
    };
  }

  if (sectionLower === "stock levels") {
    return {
      menu_section: "Reports",
      descr: descr || "Stock Levels",
    };
  }

  return { menu_section: section, descr };
}

export function buildMenuDynamicTree(permissions) {
  const rows = Array.isArray(permissions)
    ? permissions.map(normalizePermissionRow)
    : [];

  return menuDynamicTree.map((parent) => {
    const seenChildLabels = new Set();
    const children = rows
      .filter((row) => menuSectionMatchesParent(parent, row.menu_section))
      .map((row, index) => {
        const label = row.descr ?? "";
        const match = menuHrefLookup.get(label.trim().toLowerCase());
        const displayLabel =
          match?.id === "stock-report" ? "Stock Balance Report" : label;

        return {
          id: match?.id ?? `${parent.id}-${index}-${slugifyMenuLabel(label)}`,
          label: displayLabel,
          ...(match?.href ? { href: match.href } : {}),
        };
      })
      .filter((child) => {
        const key = child.label.trim().toLowerCase();
        if (!key || seenChildLabels.has(key)) return false;
        seenChildLabels.add(key);
        return true;
      });

    return {
      ...parent,
      children,
    };
  });
}
