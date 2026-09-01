import {
  Accessibility,
  Bot,
  ClipboardCheck,
  Heart,
  Scale,
  ShieldCheck,
} from 'lucide-react';

const FINDING_ICONS = {
  accessibility: Accessibility,
  scale: Scale,
  shield: ShieldCheck,
  'briefcase-medical': ClipboardCheck,
};

function SummaryIcon({ children, className = '' }) {
  return (
    <span
      className={`sit-stand-report__summary-icon ${className}`.trim()}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

function OverallSummary({ health }) {
  return (
    <section className="sit-stand-report__summary-overview">
      <h3>总体评价</h3>
      <strong>{health.preface}{health.result}</strong>
      <p>{health.details.join('')}</p>
    </section>
  );
}

function FindingsSummary({ findings }) {
  return (
    <section className="sit-stand-report__summary-findings">
      <h3>本次检测发现</h3>
      <ul>
        {findings.slice(0, 3).map((finding) => {
          const Icon = FINDING_ICONS[finding.icon] || ClipboardCheck;
          return (
            <li key={`${finding.title}-${finding.detail}`}>
              <SummaryIcon><Icon /></SummaryIcon>
              <div>
                <h4>{finding.title}</h4>
                <p>{finding.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function HealthAttention() {
  return (
    <section className="sit-stand-report__summary-attention">
      <h3>健康关注</h3>
      <SummaryIcon className="sit-stand-report__summary-heart"><Heart /></SummaryIcon>
      <p>当前状态良好，但随着年龄增长，下肢力量和身体稳定能力是保持独立活动能力的重要基础。</p>
      <hr />
      <p>建议保持规律训练，持续关注身体能力变化。</p>
    </section>
  );
}

export function SitStandEvaluation({ evaluation, findings }) {
  return (
    <article
      className="sit-stand-report__evaluation-panel"
      aria-labelledby="sit-stand-ai-summary-title"
    >
      <div className="sit-stand-report__summary-header">
        <SummaryIcon className="sit-stand-report__summary-header-icon"><Bot /></SummaryIcon>
        <h2 id="sit-stand-ai-summary-title">AI健康总结</h2>
      </div>
      <div className="sit-stand-report__summary-grid">
        <OverallSummary health={evaluation.health} />
        <FindingsSummary findings={findings} />
        <HealthAttention />
      </div>
    </article>
  );
}
