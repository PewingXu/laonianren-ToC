import { isCalendarDate } from './validators';

const REMINDER_STORAGE_KEY = 'health-overview:reminders';

function isReminderDate(value) {
  return isCalendarDate(value);
}

function assertReminder(recordId, date) {
  if (typeof recordId !== 'string' || !recordId.trim() || !isReminderDate(date)) {
    throw new TypeError('Invalid reminder');
  }
}

function parseReminders(raw) {
  const safeReminders = Object.create(null);
  if (!raw) return safeReminders;

  try {
    const reminders = JSON.parse(raw);
    if (!reminders || Array.isArray(reminders) || typeof reminders !== 'object') return safeReminders;
    for (const [recordId, date] of Object.entries(reminders)) {
      if (isReminderDate(date)) safeReminders[recordId] = date;
    }
    return safeReminders;
  } catch (_error) {
    return safeReminders;
  }
}

export function createReminderRepository(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new TypeError('Invalid reminder storage');
  }

  function read() {
    return parseReminders(storage.getItem(REMINDER_STORAGE_KEY));
  }

  return {
    save(recordId, date) {
      assertReminder(recordId, date);
      const reminders = read();
      reminders[recordId] = date;
      storage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(reminders));
      return date;
    },
    get(recordId) {
      if (typeof recordId !== 'string' || !recordId.trim()) return null;
      const reminders = read();
      const value = Object.hasOwn(reminders, recordId) ? reminders[recordId] : null;
      return isReminderDate(value) ? value : null;
    },
  };
}
