import {
  Bot,
  CircleCheckBig,
  LineChart,
  Sparkles,
  Sprout,
} from 'lucide-react';

export function GripAiHealthSummary({ healthSummary, pending = false }) {
  return (
    <section
      className="grip-report__ai-summary"
      aria-labelledby="grip-ai-summary-title"
      aria-busy={pending || undefined}
    >
      <article className="grip-report__ai-summary-card">
        <div className="grip-report__ai-summary-title-row">
          <span className="grip-report__ai-summary-icon" aria-hidden="true">
            <Bot />
          </span>
          <h2 id="grip-ai-summary-title">AI 健康总结</h2>
          {/* 生成中给个提示，否则用户会把兜底文案当成最终结果 */}
          {pending ? (
            <span className="grip-report__ai-summary-pending">正在生成…</span>
          ) : null}
        </div>

        <div className="grip-report__ai-summary-main">
          <div className="grip-report__ai-summary-copy">
            <span className="grip-report__ai-summary-icon" aria-hidden="true">
              <CircleCheckBig />
            </span>
            <div>
              <h3>{healthSummary.title}</h3>
              <p>{healthSummary.body}</p>
            </div>
          </div>

          <div className="grip-report__ai-summary-illustration" aria-hidden="true">
            <Sparkles className="grip-report__ai-summary-sparkle grip-report__ai-summary-sparkle--left" />
            <Sparkles className="grip-report__ai-summary-sparkle grip-report__ai-summary-sparkle--right" />
            <div className="grip-report__ai-summary-report">
              <LineChart className="grip-report__ai-summary-chart" />
              <span className="grip-report__ai-summary-report-line" />
              <span className="grip-report__ai-summary-report-line grip-report__ai-summary-report-line--long" />
              <span className="grip-report__ai-summary-report-line grip-report__ai-summary-report-line--short" />
              <i className="grip-report__ai-summary-report-check">
                <CircleCheckBig />
              </i>
            </div>
          </div>
        </div>

        <div className="grip-report__ai-summary-divider" />

        <div className="grip-report__ai-summary-focus">
          <span className="grip-report__ai-summary-icon" aria-hidden="true">
            <Sprout />
          </span>
          <div>
            <h3>{healthSummary.focusTitle}</h3>
            <p>{healthSummary.focusBody}</p>
          </div>
        </div>
      </article>
    </section>
  );
}
