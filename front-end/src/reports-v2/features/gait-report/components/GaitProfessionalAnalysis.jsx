import {
  Activity,
  ChevronDown,
  FlaskConical,
  HeartPulse,
  RefreshCcw,
} from 'lucide-react';

const ANALYSIS_ICONS = {
  stability: Activity,
  pressure: HeartPulse,
  symmetry: RefreshCcw,
};

export function GaitProfessionalAnalysis({ analysis }) {
  if (!Array.isArray(analysis) || analysis.length !== 3) return null;

  return (
    <section
      id="gait-professional-analysis"
      className="gait-report__professional-analysis"
      aria-label="数据依据与详细分析（专业分析）"
      tabIndex="-1"
    >
      <h3 className="gait-report__professional-title">
        <FlaskConical aria-hidden="true" />
        <span>数据依据与详细分析</span>
        <small>(专业分析)</small>
      </h3>
      <div className="gait-report__analysis-list">
        {analysis.map((item) => {
          const Icon = ANALYSIS_ICONS[item.icon];
          const titleId = `gait-analysis-${item.id}-title`;

          return (
            <details
              className={`gait-report__analysis-item gait-report__analysis-item--${item.tone}`}
              aria-labelledby={titleId}
              key={item.id}
            >
              <summary>
                <span className="gait-report__analysis-leading">
                  <span className="gait-report__analysis-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="gait-report__analysis-copy">
                    <span
                      id={titleId}
                      className="gait-report__analysis-heading"
                      role="heading"
                      aria-level="4"
                    >
                      {item.title}
                    </span>
                    <span>{item.description}</span>
                  </span>
                </span>
                <span className="gait-report__analysis-result">
                  <strong>{item.status}</strong>
                  <ChevronDown aria-hidden="true" />
                </span>
              </summary>
              <div className="gait-report__analysis-detail">{item.detail}</div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
