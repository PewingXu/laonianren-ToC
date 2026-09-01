import {
  ArrowRight,
  BarChart3,
  ChartNoAxesCombined,
  Compass,
  Footprints,
  HeartPulse,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

const CARD_META = {
  stability: {
    icon: ShieldCheck,
    title: '行走稳定性',
    tone: 'green',
    status: { '优秀': '身体控制能力很好' },
    attention: '转身、上下楼和日常行走时，身体支撑更容易保持稳定。',
  },
  coordination: {
    icon: Footprints,
    title: '双腿协调性',
    tone: 'blue',
    status: { '平衡': '左右脚配合均衡' },
    attention: '走路时双腿配合更自然，有助于减少单侧持续负担。',
  },
  rhythm: {
    icon: HeartPulse,
    title: '步频节奏',
    tone: 'orange',
    status: { '优秀': '行走节奏稳定自然' },
    attention: '连续行走时可继续关注节奏和步幅是否保持稳定。',
  },
  direction: {
    icon: Compass,
    title: '方向控制能力',
    tone: 'purple',
    status: { '良好': '行走路线控制良好' },
    attention: '在人群环境或转向移动时，可继续关注路线偏移和身体调整。',
  },
};

function textOr(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function interpretationStatus(ability, meta) {
  const status = textOr(ability?.status, '数据不足');
  return meta.status[status] || status;
}

function trendCopy(summary) {
  if (typeof summary?.changeScore !== 'number') {
    return '建议定期检测，持续关注步态和身体移动能力的变化。';
  }

  if (summary.changeScore === 0) {
    return '本次与上次评估持平，建议保持规律活动并持续观察。';
  }

  return `本次评估较上次${summary.changeScore > 0 ? '提高' : '降低'} ${Math.abs(summary.changeScore)} 分，建议结合后续检测观察变化。`;
}

function InterpretationCard({ ability, onShowAbility }) {
  const meta = CARD_META[ability?.id];
  if (!meta) return null;

  const Icon = meta.icon;

  return (
    <article className="gait-report__interpretation-card">
      <div className="gait-report__interpretation-card-main">
        <div className="gait-report__interpretation-card-heading">
          <span
            className={`gait-report__interpretation-bubble gait-report__interpretation-bubble--${meta.tone}`}
            aria-hidden="true"
          >
            <Icon />
          </span>
          <div>
            <h3>{meta.title}</h3>
            <p>{interpretationStatus(ability, meta)}</p>
          </div>
        </div>
        <div className="gait-report__interpretation-card-copy">
          <p>
            <strong>检测发现</strong>
            <span>{textOr(ability.note, '暂无可靠的能力解读数据。')}</span>
          </p>
          <p>
            <strong>更多关注</strong>
            <span>{meta.attention}</span>
          </p>
        </div>
      </div>
      <button type="button" onClick={() => onShowAbility(ability.id)}>
        <span>查看专业数据</span>
        <ArrowRight aria-hidden="true" />
      </button>
    </article>
  );
}

const SUMMARY_ROWS = [
  { id: 'overall', icon: HeartPulse, label: '整体评价' },
  { id: 'life', icon: Footprints, label: '生活影响' },
  { id: 'trend', icon: ChartNoAxesCombined, label: '未来趋势' },
  { id: 'notice', icon: ShieldCheck, label: '温馨提示' },
];

export function GaitBodyInterpretation({
  abilities,
  hero,
  summary,
  onShowAbility,
  onViewHistory,
  onBuildPlan,
}) {
  if (!Array.isArray(abilities) || abilities.length !== 4) return null;

  const rowCopy = {
    overall: textOr(summary?.body, '本次检测数据暂不足，请结合后续评估观察。'),
    life: '步态状态与日常行走、转身和上下楼等活动相关。',
    trend: trendCopy(summary),
    notice: '本次检测结果仅供参考，不能替代专业医疗建议。如有不适或疑虑，请及时咨询专业医生。',
  };

  return (
    <section
      id="gait-professional-analysis"
      className="gait-report__body-interpretation"
      aria-labelledby="gait-body-interpretation-title"
      tabIndex="-1"
    >
      <div className="gait-report__interpretation-overview">
        <div className="gait-report__interpretation-heading">
          <div>
            <h2 id="gait-body-interpretation-title">身体状态解读</h2>
            <p>基于检测数据，将专业指标转化为通俗解读，帮助您理解当前身体状态</p>
          </div>
        </div>
        <div className="gait-report__interpretation-grid">
          {abilities.map((ability) => (
            <InterpretationCard
              ability={ability}
              key={ability.id}
              onShowAbility={onShowAbility}
            />
          ))}
        </div>
      </div>

      <article className="gait-report__health-summary">
        <div className="gait-report__health-summary-title">
          <span aria-hidden="true"><Sparkles /></span>
          <h3>AI 健康总结</h3>
        </div>
        <div className="gait-report__health-summary-hero">
          <div className="gait-report__health-summary-copy">
            <h4>{textOr(hero?.title, '本次步态评估已完成')}</h4>
            <p>{textOr(hero?.lead, '请结合本次检测数据关注日常行走状态。')}</p>
          </div>
          <div className="gait-report__health-summary-image" aria-hidden="true">
            <img src="/images/gait-body-interpretation.jpg" alt="" />
          </div>
        </div>

        <div className="gait-report__health-summary-rows">
          {SUMMARY_ROWS.map((row) => {
            const Icon = row.icon;
            return (
              <div className="gait-report__health-summary-row" key={row.id}>
                <span aria-hidden="true"><Icon /></span>
                <strong>{row.label}</strong>
                <p>{rowCopy[row.id]}</p>
              </div>
            );
          })}
        </div>

        <div className="gait-report__interpretation-actions">
          <span className="gait-report__interpretation-actions-icon" aria-hidden="true">
            <BarChart3 />
          </span>
          <div>
            <strong>持续关注，掌握变化</strong>
            <p>建议定期进行步态检测，追踪身体能力变化趋势，及时调整生活方式。</p>
          </div>
          <div className="gait-report__interpretation-action-buttons">
            <button type="button" onClick={onViewHistory}>
              <span>查看历史报告</span>
              <ArrowRight aria-hidden="true" />
            </button>
            <button type="button" className="is-secondary" onClick={onBuildPlan}>
              <span>制定运动计划</span>
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </div>
      </article>
    </section>
  );
}
