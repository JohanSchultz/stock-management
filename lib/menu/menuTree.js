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
      { id: "location", label: "Location", href: "/location" },
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
      { id: "stock-report", label: "Stock report", href: "/stock-report" },
    ],
  },
];
