import { Activity, Gauge, ListChecks, Scale } from 'lucide-react';
import { CompletionBars } from './charts/CompletionBars';
import { ForceBalance } from './charts/ForceBalance';
import { SpeedGauge } from './charts/SpeedGauge';
import { StabilitySparkline } from './charts/StabilitySparkline';

const CHARTS = {
  speed: SpeedGauge,
  balance: ForceBalance,
  stability: StabilitySparkline,
  completion: CompletionBars,
};

const ICONS = {
  speed: Gauge,
  balance: Scale,
  stability: Activity,
  completion: ListChecks,
};

/**
 * 核心指标卡。DOM 结构照握力（GripMetricCard）：
 *   metric-main   = header（圆形图标 + h4）/ value（大数 + 单位 + 状态胶片）/ summary / chart
 *   metric-footer = 参考线
 * 这样 CSS 可以逐字复用握力的字号、行高、行距，四张卡逐行对齐。
 *
 * 之前是「序号圆点 + h2 + 绝对定位的参考线」，卡片写死 397px 高，
 * 数值 39px/Arial，跟握力（40px/Be Vietnam Pro，行高 48px）不是一套。
 *
 * 双脚平衡这张卡没有单一数值：左右占比已经在图表里画出来了（两条对向的
 * 进度条 + 两只脚），value 槽位只放状态胶片，不再重复一遍「左 xx% / 右 xx%」。
 */
function MetricValue({ metric }) {
  if (metric.id === 'balance') {
    return (
      <div className="sit-stand-report__metric-value sit-stand-report__metric-value--balance">
        <em>{metric.status}</em>
      </div>
    );
  }

  return (
    <div className="sit-stand-report__metric-value">
      <strong>{metric.value ?? '--'}</strong>
      <span>{metric.unit}</span>
      <em>{metric.status}</em>
    </div>
  );
}

function MetricSummary({ metric }) {
  if (metric.id === 'speed' && metric.peerPercentile !== null) {
    return (
      <p className="sit-stand-report__metric-summary">
        超过了 <strong>{metric.peerPercentile}%</strong> 的同龄人
      </p>
    );
  }
  return <p className="sit-stand-report__metric-summary">{metric.summary}</p>;
}

export function SitStandMetricCard({ metric }) {
  const Chart = CHARTS[metric.id];
  const MetricIcon = ICONS[metric.id] || Activity;

  return (
    <article
      className={`sit-stand-report__metric-card sit-stand-report__metric-card--${metric.id}`}
      data-metric={metric.id}
    >
      <div className="sit-stand-report__metric-main">
        <div className="sit-stand-report__metric-header">
          <span><MetricIcon aria-hidden="true" /></span>
          <h4>{metric.title}</h4>
        </div>
        <MetricValue metric={metric} />
        <MetricSummary metric={metric} />
        <Chart metric={metric} />
      </div>

      <div className="sit-stand-report__metric-footer">
        <div className="sit-stand-report__metric-reference">
          <p>{metric.reference}</p>
        </div>
      </div>
    </article>
  );
}
