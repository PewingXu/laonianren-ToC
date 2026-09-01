/** Returns a finite number for numeric input, otherwise null. */
export function finiteOrNull(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

/** Keeps progress values within the range the UI can render. */
export function clampPercent(value) {
  const numericValue = finiteOrNull(value);

  if (numericValue === null) {
    return 0;
  }

  return Math.min(100, Math.max(0, numericValue));
}

function daysInMonth(year, month) {
  if (month === 2) {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leapYear ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Parses a complete ISO-like calendar value only when its date and optional time are possible. */
export function parseCalendarDate(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z|[+-](\d{2}):(\d{2}))?)?$/,
  );
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = hourText === undefined ? null : Number(hourText);
  const minute = minuteText === undefined ? null : Number(minuteText);
  const second = secondText === undefined ? 0 : Number(secondText);
  const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText);
  const offsetMinute = offsetMinuteText === undefined ? 0 : Number(offsetMinuteText);

  if (
    year < 1
    || month < 1
    || month > 12
    || day < 1
    || day > daysInMonth(year, month)
    || (hour !== null && (hour > 23 || minute > 59 || second > 59))
    || offsetHour > 23
    || offsetMinute > 59
  ) return null;

  return { year, month, day, hour, minute };
}

export function isCalendarDate(value) {
  return typeof value === 'string' && value.length === 10 && parseCalendarDate(value) !== null;
}
