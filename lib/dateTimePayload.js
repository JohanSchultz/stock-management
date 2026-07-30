function todayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toDateTimePayloadValue(isoDate) {
  const datePart =
    typeof isoDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(isoDate)
      ? isoDate.slice(0, 10)
      : todayIsoDate();
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${datePart}T${hours}:${minutes}:${seconds}`;
}

export function toStoredDateTimeValue(value) {
  if (!value) return toDateTimePayloadValue(todayIsoDate());
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)
  ) {
    return value.slice(0, 19);
  }

  const datePart =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
      ? value.slice(0, 10)
      : todayIsoDate();
  return toDateTimePayloadValue(datePart);
}
