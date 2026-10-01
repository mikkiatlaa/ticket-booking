// Danish phone numbers only: eight digits starting with 2-9, optionally written
// with +45 or 0045 in front, and with spaces, dots, dashes or brackets in between.
// Stored in one format, +45XXXXXXXX, so the guest list always looks the same.
const DANISH = /^(?:\+45|0045)?([2-9]\d{7})$/;

/** "42 12 34 56" -> "+4542123456", or null when it is not a Danish number. */
export function normalizeDanishPhone(input: string) {
  const compact = input.replace(/[\s.\-()]/g, "");
  const match = compact.match(DANISH);
  return match ? `+45${match[1]}` : null;
}

/** "+4542123456" -> "+45 42 12 34 56" */
export function formatPhone(stored: string | null) {
  if (!stored) return "";
  const m = stored.match(/^\+45(\d{2})(\d{2})(\d{2})(\d{2})$/);
  return m ? `+45 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : stored;
}
