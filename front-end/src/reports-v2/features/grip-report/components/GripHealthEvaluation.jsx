import { Award, ShieldCheck, Users } from 'lucide-react';

const EVALUATION_ICONS = {
  'health-and-safety': ShieldCheck,
  users: Users,
  award: Award,
};

export function GripHealthEvaluation({ evaluation }) {
  return (
    <section
      className="grip-report__evaluation-section"
      aria-labelledby="grip-health-evaluation-title"
    >
      <h2 id="grip-health-evaluation-title">健康状况评估</h2>
      <div className="grip-report__evaluation-grid">
        {evaluation.map((item) => {
          const Icon = EVALUATION_ICONS[item.icon];
          return (
            <article className={`grip-report__evaluation-card grip-report__evaluation-card--${item.tone}`} key={item.id}>
              <div className="grip-report__evaluation-heading">
                <span aria-hidden="true"><Icon /></span>
                <h3>{item.title}</h3>
              </div>
              {item.label ? (
                <div className="grip-report__grade-wrap">
                  <strong className="grip-report__grade-badge">{item.label}</strong>
                </div>
              ) : <p>{item.body}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
