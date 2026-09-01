import { AlertTriangle } from 'lucide-react';

/**
 * V3 握力评分明细。
 *
 * toB 报告里有这一块（核心 18 分 + 增强 7 分的逐项拆解），交付包的
 * toC 页面原本没有 —— 但用户明确要求「toB 上有的指标要体现在这个版本里」。
 *
 * 数据来自 assessmentScoring.scoreGrip 的 breakdown，经 mapGripReport
 * 的 mapBreakdown 校验（score/max 必须齐全且 score ≤ max）后传入。
 * 这里只负责展示，不做任何计算 —— 分数口径全系统只有一处。
 */
export function GripScoreBreakdown({ breakdown, scoreSummary, redFlags }) {
  if (!Array.isArray(breakdown) || breakdown.length === 0) return null;

  const core = breakdown.filter((item) => item.group === 'core');
  const enhanced = breakdown.filter((item) => item.group === 'enhanced');
  const flags = Array.isArray(redFlags) ? redFlags : [];

  return (
    <article className="grip-report__analysis-card grip-report__breakdown-card">
      <h3 id="grip-score-breakdown" tabIndex={-1}>评分是怎么算出来的</h3>

      {scoreSummary ? (
        <div className="grip-report__breakdown-total">
          <div className="grip-report__breakdown-total-main">
            <strong>{scoreSummary.total}</strong>
            <span>/ {scoreSummary.max} 分</span>
          </div>
          <p className="grip-report__breakdown-total-split">
            {scoreSummary.core !== null && scoreSummary.coreMax !== null
              ? `力量本身 ${scoreSummary.core}/${scoreSummary.coreMax}`
              : null}
            {scoreSummary.enhanced !== null && scoreSummary.enhancedMax !== null
              ? ` ＋ 抓握质量 ${scoreSummary.enhanced}/${scoreSummary.enhancedMax}`
              : null}
          </p>
          {scoreSummary.thresholdN !== null && scoreSummary.ratio !== null ? (
            <p className="grip-report__breakdown-total-ratio">
              你的最大握力是参考线（{scoreSummary.thresholdN} N）的
              {' '}<strong>{scoreSummary.ratio}</strong> 倍
            </p>
          ) : null}
        </div>
      ) : null}

      <BreakdownGroup title="力量本身" items={core} />
      <BreakdownGroup title="抓握质量" items={enhanced} />

      {flags.length > 0 ? (
        <div className="grip-report__breakdown-flags">
          <p className="grip-report__breakdown-flags-title">
            <AlertTriangle aria-hidden="true" />
            需要留意
          </p>
          <ul>
            {flags.map((flag) => <li key={flag}>{flag}</li>)}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function BreakdownGroup({ title, items }) {
  if (!items.length) return null;

  return (
    <div className="grip-report__breakdown-group">
      <p className="grip-report__breakdown-group-title">{title}</p>
      <ul>
        {items.map((item) => (
          <li key={item.label}>
            <div className="grip-report__breakdown-row">
              <span className="grip-report__breakdown-label" title={item.help || undefined}>
                {item.label}
              </span>
              <span className="grip-report__breakdown-score">
                <strong>{item.score}</strong>/{item.max}
              </span>
            </div>
            <div className="grip-report__breakdown-track" aria-hidden="true">
              <i style={{ width: `${item.percent}%` }} />
            </div>
            {item.desc ? <small>{item.desc}</small> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
