import { Bed, CheckCircle2, Dumbbell, Utensils } from 'lucide-react';

const ADVICE_ICONS = {
  dumbbell: Dumbbell,
  utensils: Utensils,
  bed: Bed,
};

export function GripAdvice({ advice }) {
  return (
    <section className="grip-report__advice-section" aria-labelledby="grip-advice-title">
      <h2 id="grip-advice-title">个性化改善建议</h2>
      <div className="grip-report__advice-grid">
        {advice.map((group) => {
          const Icon = ADVICE_ICONS[group.icon];
          return (
            <article className={`grip-report__advice-card grip-report__advice-card--${group.tone}`} key={group.id}>
              <div className="grip-report__advice-heading">
                <Icon aria-hidden="true" />
                <h3>{group.title}</h3>
              </div>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>
                    <CheckCircle2 aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
