function formatLocalIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** First calendar day of the month (local time), `YYYY-MM-DD`. */
export function currentMonthStartIsoDate(referenceDate = new Date()) {
  const date = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    1
  );
  return formatLocalIsoDate(date);
}

/** Last calendar day of the month (local time), `YYYY-MM-DD`. */
export function currentMonthEndIsoDate(referenceDate = new Date()) {
  const date = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
    0
  );
  return formatLocalIsoDate(date);
}

/** Today (local time), `YYYY-MM-DD`. */
export function todayIsoDate(referenceDate = new Date()) {
  return formatLocalIsoDate(referenceDate);
}

/** Same calendar day one month earlier (local time), `YYYY-MM-DD`. */
export function oneMonthBeforeIsoDate(referenceDate = new Date()) {
  const date = new Date(referenceDate);
  date.setMonth(date.getMonth() - 1);
  return formatLocalIsoDate(date);
}

/** `days` calendar days before `referenceDate` (local time), `YYYY-MM-DD`. */
export function daysBeforeIsoDate(days, referenceDate = new Date()) {
  const date = new Date(referenceDate);
  date.setDate(date.getDate() - days);
  return formatLocalIsoDate(date);
}
