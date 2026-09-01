import {
  Activity,
  Armchair,
  Bot,
  ClipboardList,
  Heart,
  ShieldCheck,
} from 'lucide-react';

const ADVICE_ICONS = {
  activity: Activity,
  strength: Armchair,
  posture: ShieldCheck,
};

function SummaryIcon({ children, className = '' }) {
  return (
    <span
      className={`standing-report__summary-icon ${className}`.trim()}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

function overallTitle(hero) {
  if (!hero || hero.status === '数据不足') return '本次站立能力数据不足';
  if (hero.status === '已完成') return '本次站立能力评估已完成';
  return `您的站立能力处于${hero.status}范围`;
}

function OverallSummary({ hero, summary }) {
  return (
    <section className="standing-report__summary-overview">
      <h3>总体评价</h3>
      <strong>{overallTitle(hero)}</strong>
      <p>{summary?.evaluation || '本次可用数据不足，暂无法生成完整评价。'}</p>
    </section>
  );
}

function HealthAttention({ hasData }) {
  return (
    <section className="standing-report__summary-attention">
      <h3>健康关注</h3>
      <SummaryIcon className="standing-report__summary-heart"><Heart /></SummaryIcon>
      <p>
        {hasData
          ? '当前站立状态良好，但随着年龄增长，下肢力量和身体稳定能力是保持独立活动能力的重要基础。'
          : '站立数据尚不完整，暂不能判断当前状态。下肢力量和身体稳定能力是保持独立活动能力的重要基础。'}
      </p>
      <hr />
      <p>建议保持规律训练，持续关注身体能力变化。</p>
    </section>
  );
}

function StandingAdvice({ advice }) {
  return (
    <article
      className="standing-report__advice-panel"
      aria-labelledby="standing-advice-title"
    >
      <div className="standing-report__advice-header">
        <SummaryIcon><ClipboardList /></SummaryIcon>
        <h2 id="standing-advice-title">个性化建议</h2>
      </div>
      {advice.length > 0 ? (
        <ul className="standing-report__advice-list">
          {advice.slice(0, 3).map((item) => {
            const Icon = ADVICE_ICONS[item.id] || Activity;
            return (
              <li data-testid="standing-advice-item" key={item.id}>
                <SummaryIcon><Icon /></SummaryIcon>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="standing-report__advice-empty">数据不足</p>
      )}
    </article>
  );
}

export function StandingSummary({ hero, summary, advice = [] }) {
  const hasData = hero?.status !== '数据不足';

  return (
    <section
      className="standing-report__summary"
      aria-label="AI健康总结与个性化建议"
    >
      <article
        className="standing-report__evaluation-panel"
        aria-labelledby="standing-ai-summary-title"
      >
        <div className="standing-report__summary-header">
          <SummaryIcon className="standing-report__summary-header-icon"><Bot /></SummaryIcon>
          <h2 id="standing-ai-summary-title">AI健康总结</h2>
        </div>
        <div className="standing-report__summary-grid">
          <OverallSummary hero={hero} summary={summary} />
          <HealthAttention hasData={hasData} />
        </div>
      </article>
      <StandingAdvice advice={advice} />
    </section>
  );
}
