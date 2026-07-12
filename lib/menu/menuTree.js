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
    ],
  },
  {
    id: "reports",
    label: "Reports",
    children: [
      { id: "stock-report", label: "Stock Balance Report", href: "/stock-report" },
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
  lookup.set("stock report", { id: "stock-report", href: "/stock-report" });

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

  return false;
}

export function buildMenuDynamicTree(permissions) {
  const rows = Array.isArray(permissions) ? permissions : [];

  return menuDynamicTree.map((parent) => {
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
      });

    return {
      ...parent,
      children,
    };
  });
}
