export const CORRECTION_BOOKING_IN_ID_KEY = "bookingCorrectionBookingInId";
export const CORRECTION_BOOKING_OUT_ID_KEY = "bookingCorrectionBookingOutId";

export function storeCorrectionBookingInId(bookingInId) {
  sessionStorage.setItem(CORRECTION_BOOKING_IN_ID_KEY, String(bookingInId));
}

export function consumeCorrectionBookingInId() {
  const storedId = sessionStorage.getItem(CORRECTION_BOOKING_IN_ID_KEY);
  if (!storedId) return null;

  sessionStorage.removeItem(CORRECTION_BOOKING_IN_ID_KEY);
  return storedId;
}

export function storeCorrectionBookingOutId(bookingOutId) {
  sessionStorage.setItem(CORRECTION_BOOKING_OUT_ID_KEY, String(bookingOutId));
}

export function consumeCorrectionBookingOutId() {
  const storedId = sessionStorage.getItem(CORRECTION_BOOKING_OUT_ID_KEY);
  if (!storedId) return null;

  sessionStorage.removeItem(CORRECTION_BOOKING_OUT_ID_KEY);
  return storedId;
}
