import {
  Activity,
  Armchair,
  Bot,
  CheckCircle2,
  CircleCheckBig,
  Droplets,
  Footprints,
  LineChart,
  PersonStanding,
  ShieldCheck,
  Sparkles,
  Sprout,
} from 'lucide-react';
import '../styles/assessment-ai-guidance.css';

const ADVICE_ICONS = {
  activity: Activity,
  posture: ShieldCheck,
  strength: Armchair,
  walking: Footprints,
  stretch: PersonStanding,
  water: Droplets,
};

export function AssessmentAiGuidance({
  idPrefix,
  healthSummary,
  advice = [],
  pending = false,
}) {
  const titleId = `${idPrefix}-ai-summary-title`;
  const adviceTitleId = `${idPrefix}-ai-advice-title`;
  const groups = Array.isArray(advice) ? advice.slice(0, 3) : [];

  return (
    <section
      className="assessment-ai-guidance"
      aria-label="AI 健康总结与个性化改善建议"
      aria-busy={pending || undefined}
    >
      <article className="assessment-ai-guidance__summary-card">
        <div className="assessment-ai-guidance__title-row">
          <span className="assessment-ai-guidance__round-icon" aria-hidden="true">
            <Bot />
          </span>
          <h2 id={titleId}>AI 健康总结</h2>
          {pending ? (
            <span className="assessment-ai-guidance__pending">正在生成...</span>
          ) : null}
        </div>

        <div className="assessment-ai-guidance__summary-main">
          <div className="assessment-ai-guidance__summary-copy">
            <span className="assessment-ai-guidance__round-icon" aria-hidden="true">
              <CircleCheckBig />
            </span>
            <div>
              <h3>{healthSummary.title}</h3>
              <p>{healthSummary.body}</p>
            </div>
          </div>

          <div className="assessment-ai-guidance__illustration" aria-hidden="true">
            <Sparkles className="assessment-ai-guidance__sparkle assessment-ai-guidance__sparkle--left" />
            <Sparkles className="assessment-ai-guidance__sparkle assessment-ai-guidance__sparkle--right" />
            <div className="assessment-ai-guidance__report-sheet">
              <LineChart className="assessment-ai-guidance__chart" />
              <span className="assessment-ai-guidance__report-line" />
              <span className="assessment-ai-guidance__report-line assessment-ai-guidance__report-line--long" />
              <span className="assessment-ai-guidance__report-line assessment-ai-guidance__report-line--short" />
              <i className="assessment-ai-guidance__report-check">
                <CircleCheckBig />
              </i>
            </div>
          </div>
        </div>

        <div className="assessment-ai-guidance__divider" />

        <div className="assessment-ai-guidance__focus">
          <span className="assessment-ai-guidance__round-icon" aria-hidden="true">
            <Sprout />
          </span>
          <div>
            <h3>{healthSummary.focusTitle}</h3>
            <p>{healthSummary.focusBody}</p>
          </div>
        </div>
      </article>

      {groups.length > 0 ? (
        <section
          className="assessment-ai-guidance__advice-section"
          aria-labelledby={adviceTitleId}
        >
          <h2 id={adviceTitleId}>个性化改善建议</h2>
          <div className="assessment-ai-guidance__advice-grid">
            {groups.map((group) => {
              const Icon = ADVICE_ICONS[group.icon] || Activity;
              const items = Array.isArray(group.items) ? group.items.filter(Boolean) : [];
              return (
                <article
                  className={`assessment-ai-guidance__advice-card assessment-ai-guidance__advice-card--${group.tone}`}
                  key={group.id}
                >
                  <div className="assessment-ai-guidance__advice-heading">
                    <Icon aria-hidden="true" />
                    <h3>{group.title}</h3>
                  </div>
                  <ul>
                    {items.map((item) => (
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
      ) : null}
    </section>
  );
}
