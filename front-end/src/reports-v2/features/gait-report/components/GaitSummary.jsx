import { ArrowRight, ArrowUp, Hospital } from 'lucide-react';

export function GaitSummary({ summary, onShowStandards }) {
  return (
    <section
      className="gait-report__summary-grid"
      aria-label="今日评估摘要与评分说明"
    >
      <article className="gait-report__summary-card">
        <h3>今日评估摘要</h3>
        <p>{summary.body}</p>
        <div className="gait-report__summary-facts">
          <div>
            <span>较上次评估</span>
            <strong>
              {summary.changeScore === null ? null : <ArrowUp aria-hidden="true" />}
              {summary.changeScore === null ? '数据不足' : `${summary.changeScore} 分`}
            </strong>
          </div>
          <i aria-hidden="true" />
          <div>
            <span>核心优势</span>
            <strong>{summary.strength}</strong>
          </div>
        </div>
      </article>

      <article className="gait-report__explanation-card">
        <Hospital aria-hidden="true" className="gait-report__explanation-mark" />
        <h3>为什么是这个分数？</h3>
        <p>{summary.explanation}</p>
        {typeof onShowStandards === 'function' ? (
          <button type="button" onClick={onShowStandards}>
            <span>了解评分标准</span>
            <ArrowRight aria-hidden="true" />
          </button>
        ) : null}
      </article>
    </section>
  );
}
