import { finiteOrNull, parseCalendarDate } from './validators';

/** Formats a numeric measurement without leaking invalid values into the UI. */
export function formatMetric(value, fractionDigits = 2) {
  const numericValue = finiteOrNull(value);
  if (numericValue === null) {
    return '--';
  }

  const digits = Number.isInteger(fractionDigits)
    ? Math.min(6, Math.max(0, fractionDigits))
    : 2;

  return numericValue.toFixed(digits);
}

/** Formats ISO-like dates without timezone-dependent date shifts. */
export function formatRecordedAt(value) {
  const parsed = parseCalendarDate(value);
  if (!parsed) return '';

  const date = `${parsed.year}年${parsed.month}月${parsed.day}日`;
  return parsed.hour !== null
    ? `${date} ${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`
    : date;
}
