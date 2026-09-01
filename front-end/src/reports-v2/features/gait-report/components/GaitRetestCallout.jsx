import { ArrowRight, CalendarDays } from 'lucide-react';

export function GaitRetestCallout({ reminder, onSaveReminder }) {
  if (!reminder) return null;

  return (
    <section className="gait-report__retest" aria-label="步态复测提醒">
      <div className="gait-report__retest-copy">
        <span className="gait-report__retest-icon" aria-hidden="true">
          <CalendarDays />
        </span>
        <div>
          <h3>{reminder.title}</h3>
          <p>{reminder.description}</p>
        </div>
      </div>
      <button type="button" onClick={onSaveReminder}>
        <span>{reminder.actionLabel}</span>
        <ArrowRight aria-hidden="true" />
      </button>
    </section>
  );
}
