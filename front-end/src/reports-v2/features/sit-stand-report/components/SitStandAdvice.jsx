import {
  Activity,
  Armchair,
  ClipboardList,
  Droplets,
  Dumbbell,
} from 'lucide-react';

const ADVICE_ICONS = {
  activity: Activity,
  armchair: Armchair,
  droplets: Droplets,
  dumbbell: Dumbbell,
};

export function SitStandAdvice({ advice }) {
  return (
    <article
      className="sit-stand-report__advice-panel"
      aria-labelledby="sit-stand-advice-title"
    >
      <div className="sit-stand-report__advice-header">
        <span className="sit-stand-report__summary-icon" aria-hidden="true">
          <ClipboardList />
        </span>
        <h2 id="sit-stand-advice-title">个性化建议</h2>
      </div>
      <ul className="sit-stand-report__advice-list">
        {advice.slice(0, 3).map((item) => {
          const Icon = ADVICE_ICONS[item.icon] || Activity;
          return (
            <li className="sit-stand-report__advice-item" key={item.title}>
              <span className="sit-stand-report__summary-icon" aria-hidden="true">
                <Icon />
              </span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
