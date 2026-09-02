import {
  ArrowLeftRight,
  BarChart3,
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

export function GripMetricCard({ metric }) {
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

      {/*
        原来这里还有个「查看详情」按钮，作用只是滚动到同一页下方的
        「专业数据分析」区 —— 没有展开更多内容，也不跳新页面。
        对读报告的人没有实际价值，已移除。
      */}
      <div className="grip-report__metric-footer">
        <div className="grip-report__metric-reference">
          {metric.referenceLines.map((line) => <p key={line}>{line}</p>)}
        </div>
      </div>
    </article>
  );
}
