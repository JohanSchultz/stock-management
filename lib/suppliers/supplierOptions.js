export function supplierOptionLabel(option) {
  return (
    option.descr ??
    option.supplier ??
    option.description ??
    option.name ??
    ""
  );
}

export function supplierOptionValue(option) {
  const id = option.id ?? option.supplier_id;
  return id != null ? String(id) : "";
}

export function normalizeSupplierOptions(data) {
  if (!Array.isArray(data)) return [];

  return data
    .map((row, index) => ({
      id: row.id ?? row.supplier_id ?? null,
      descr:
        row.descr ?? row.supplier ?? row.description ?? row.name ?? "",
      is_active: row.is_active,
      optionKey: `supplier-option-${index}`,
    }))
    .sort((left, right) =>
      supplierOptionLabel(left).localeCompare(supplierOptionLabel(right))
    );
}
