import { ChevronDown } from 'lucide-react';
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

function StandardValue({ metric }) {
  return (
    <div className={`sit-stand-report__metric-value sit-stand-report__metric-value--${metric.id}`}>
      <strong className="sit-stand-report__metric-number">{metric.value ?? '--'}</strong>
      <span>{metric.unit}</span>
      <em>{metric.status}</em>
    </div>
  );
}

function BalanceValue({ metric }) {
  return (
    <div className="sit-stand-report__split-score">
      <span>左 <b>{metric.leftPercent === null ? '--' : `${metric.leftPercent}%`}</b></span>
      <i>/</i>
      <span>右 <b>{metric.rightPercent === null ? '--' : `${metric.rightPercent}%`}</b></span>
      <em>{metric.status}</em>
    </div>
  );
}

function MetricSummary({ metric }) {
  if (metric.id === 'speed' && metric.peerPercentile !== null) {
    return (
      <p className="sit-stand-report__metric-summary">
        超过了 <b>{metric.peerPercentile}%</b> 的同龄人
      </p>
    );
  }
  return <p className="sit-stand-report__metric-summary">{metric.summary}</p>;
}

export function SitStandMetricCard({ metric, onShowDetail }) {
  const Chart = CHARTS[metric.id];
  return (
    <article
      className={`sit-stand-report__metric-card sit-stand-report__metric-card--${metric.id}`}
      data-metric={metric.id}
    >
      <div className="sit-stand-report__metric-header">
        <span className="sit-stand-report__metric-index" data-testid="metric-index">
          {metric.index}
        </span>
        <h2 className="sit-stand-report__metric-title">{metric.title}</h2>
      </div>
      {metric.id === 'balance' ? <BalanceValue metric={metric} /> : <StandardValue metric={metric} />}
      <MetricSummary metric={metric} />
      <Chart metric={metric} />
      <p className="sit-stand-report__metric-range">{metric.reference}</p>
      <button
        className="sit-stand-report__detail-button"
        type="button"
        aria-label="查看详情"
        aria-controls={metric.detailTargetId}
        data-detail-target={metric.detailTargetId}
        onClick={() => onShowDetail(metric.detailTargetId)}
      >
        <span>查看详情</span>
        <ChevronDown aria-hidden="true" />
      </button>
    </article>
  );
}
