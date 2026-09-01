import { ArrowRight, CalendarCheck2 } from 'lucide-react';

export function NextAssessment({ assessment, onSaveReminder }) {
  return (
    <section className="health-overview__next" id="next-assessment" data-testid="next-assessment" aria-labelledby="next-title">
      <div>
        <h2 id="next-title">{assessment.title}</h2>
        <div className="health-overview__next-copy">
          <span className="health-overview__next-icon"><CalendarCheck2 aria-hidden="true" size={24} /></span>
          <div>
            <h3>{assessment.heading}</h3>
            <p>{assessment.content}</p>
          </div>
        </div>
      </div>
      <button type="button" onClick={onSaveReminder}>
        <span>记下这个约定</span>
        <ArrowRight aria-hidden="true" size={20} />
      </button>
    </section>
  );
}
