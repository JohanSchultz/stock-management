export function customerOptionLabel(option) {
  return (
    option.descr ?? option.customer ?? option.description ?? option.name ?? ""
  );
}

export function customerOptionValue(option) {
  const id = option.id ?? option.customer_id;
  return id != null ? String(id) : "";
}

export function normalizeCustomerOptions(data) {
  if (!Array.isArray(data)) return [];

  return data
    .map((row, index) => ({
      id: row.id ?? row.customer_id ?? null,
      descr: row.descr ?? row.customer ?? row.description ?? row.name ?? "",
      is_active: row.is_active,
      optionKey: `customer-option-${index}`,
    }))
    .sort((left, right) =>
      customerOptionLabel(left).localeCompare(customerOptionLabel(right))
    );
}
