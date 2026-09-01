import {
  ArrowLeftRight,
  BarChart3,
  ChevronDown,
  History,
  Scale,
} from 'lucide-react';
import { GripDifferenceRing } from './charts/GripDifferenceRing';
import { GripEnduranceLine } from './charts/GripEnduranceLine';
import { GripGauge } from './charts/GripGauge';
import { GripTrialBars } from './charts/GripTrialBars';

const CHARTS = {
  maximum: GripGauge,
  average: GripTrialBars,
  difference: GripDifferenceRing,
  endurance: GripEnduranceLine,
};

const ICONS = {
  maximum: ArrowLeftRight,
  average: BarChart3,
  difference: Scale,
  endurance: History,
};

function MetricSummary({ metric }) {
  if (metric.peerPercentile === null) {
    return <p className="grip-report__metric-summary">{metric.summary}</p>;
  }

  return (
    <p className="grip-report__metric-summary">
      超过了 <strong>{metric.peerPercentile}%</strong> 的同龄人
    </p>
  );
}

export function GripMetricCard({ metric, onShowDetail }) {
  const Chart = CHARTS[metric.id];
  const MetricIcon = ICONS[metric.id];

  return (
    <article
      className={`grip-report__metric-card grip-report__metric-card--${metric.id}`}
      data-metric={metric.id}
    >
      <div className="grip-report__metric-main">
        <div className="grip-report__metric-header">
          <span><MetricIcon aria-hidden="true" /></span>
          <h4>{metric.title}</h4>
        </div>
        <div className="grip-report__metric-value">
          <strong>{metric.value ?? '--'}</strong>
          <span>{metric.unit}</span>
          <em>{metric.status}</em>
        </div>
        <MetricSummary metric={metric} />
        <Chart metric={metric} />
      </div>

      <div className="grip-report__metric-footer">
        <div className="grip-report__metric-reference">
          {metric.referenceLines.map((line) => <p key={line}>{line}</p>)}
        </div>
        {/*
          没有可跳转的详情区块时不渲染按钮 —— 原来无论如何都渲染，
          而锚点所在的卡片可能因数据缺失根本没渲染，点了没反应。
        */}
        {metric.detailTargetId ? (
          <button
            type="button"
            aria-label="查看详情"
            aria-controls={metric.detailTargetId}
            data-detail-target={metric.detailTargetId}
            onClick={() => onShowDetail(metric.detailTargetId)}
          >
            <span>查看详情</span>
            <ChevronDown aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </article>
  );
}
