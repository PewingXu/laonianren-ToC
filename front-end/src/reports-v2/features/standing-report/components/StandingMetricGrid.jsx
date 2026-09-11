import { Footprints } from 'lucide-react';
import { standingReportImages } from '../assets';
import {
  buildCenterGaugeModel,
  buildWeightRingModel,
} from '../standingVisualMath.js';

function Value({ value, unit = '' }) {
  return value === null || value === undefined
    ? <strong className="standing-report__metric-unavailable">--</strong>
    : <strong>{value}<small>{unit}</small></strong>;
}

function formatNumber(value) {
  if (value === null || value === undefined) return '--';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function CenterGauge({ value }) {
  const gauge = buildCenterGaugeModel(value);
  const tickPositions = [
    { x: 14, y: 142 },
    { x: 43, y: 75 },
    { x: 121, y: 33 },
    { x: 201, y: 75 },
    { x: 226, y: 142 },
  ];
  const accessibleLabel = gauge.hasValue
    ? `重心左右偏移 ${formatNumber(value)} cm，显示范围负 ${formatNumber(gauge.limit)} 至正 ${formatNumber(gauge.limit)} cm`
    : '重心左右偏移数据不足';

  return (
    <svg className="standing-report__center-gauge" viewBox="0 0 250 172" role="img" aria-label={accessibleLabel}>
      <defs>
        <linearGradient id="standingGaugeColor" x1="0" x2="1">
          <stop offset="0" stopColor="#7da8d8" />
          <stop offset=".5" stopColor="#c8d5e1" />
          <stop offset="1" stopColor="#7da8d8" />
        </linearGradient>
      </defs>
      <path className="standing-report__gauge-band" d="M31 134 A94 94 0 0 1 219 134" />
      <path className="standing-report__gauge-color" d="M31 134 A94 94 0 0 1 219 134" />
      <path className="standing-report__gauge-ticks" d="M31 134h10M58 68l8 8M125 40v11M192 68l-8 8M219 134h-10" />
      <g className="standing-report__gauge-labels">
        {gauge.ticks.map((tick, index) => (
          <text x={tickPositions[index].x} y={tickPositions[index].y} key={`${tick}-${index}`}>
            {formatNumber(tick)}
          </text>
        ))}
      </g>
      {gauge.hasValue && (
        <>
          <path className="standing-report__gauge-needle" d={gauge.needlePath} />
          <circle className="standing-report__gauge-pin" cx="125" cy="133" r="8" />
          <circle className="standing-report__gauge-pin-center" cx="125" cy="133" r="3" />
        </>
      )}
      <text className="standing-report__gauge-zero" x="125" y="160" textAnchor="middle">
        {gauge.hasValue ? formatNumber(value) : '--'}
      </text>
      <text className="standing-report__gauge-unit" x="125" y="171" textAnchor="middle">cm</text>
    </svg>
  );
}

function WeightRing({ leftPercent, rightPercent }) {
  const ring = buildWeightRingModel(leftPercent, rightPercent);
  const {
    leftShare, rightShare, leftDashoffset, rightDashoffset,
  } = ring;

  return (
    <>
      <svg
        className="standing-report__weight-ring"
        viewBox="0 0 210 190"
        role="img"
        aria-label={ring.hasValue ? `左脚${leftShare}%，右脚${rightShare}%` : '承重数据不足'}
      >
        <defs>
          <linearGradient id="standingLeftWeight" x1="0" x2="1"><stop offset="0" stopColor="#6e95d6" /><stop offset="1" stopColor="#bfd0ea" /></linearGradient>
          <linearGradient id="standingRightWeight" x1="0" x2="1"><stop offset="0" stopColor="#d0d9ed" /><stop offset="1" stopColor="#a689b5" /></linearGradient>
        </defs>
        <circle className="standing-report__ring-base" cx="105" cy="89" r="64" />
        <circle
          className="standing-report__ring-left"
          cx="105"
          cy="89"
          r="64"
          pathLength="100"
          strokeDasharray={`${leftShare} ${100 - leftShare}`}
          strokeDashoffset={leftDashoffset}
          transform="rotate(-90 105 89)"
        />
        <circle
          className="standing-report__ring-right"
          cx="105"
          cy="89"
          r="64"
          pathLength="100"
          strokeDasharray={`${rightShare} ${100 - rightShare}`}
          strokeDashoffset={rightDashoffset}
          transform="rotate(-90 105 89)"
        />
        <g className="standing-report__footprint standing-report__footprint--left">
          <ellipse cx="82" cy="83" rx="10" ry="25" transform="rotate(8 82 83)" />
          <circle cx="69" cy="57" r="5" /><circle cx="75" cy="52" r="5" />
        </g>
        <g className="standing-report__footprint standing-report__footprint--right">
          <ellipse cx="128" cy="83" rx="10" ry="25" transform="rotate(-8 128 83)" />
          <circle cx="141" cy="57" r="5" /><circle cx="135" cy="52" r="5" />
        </g>
        <g className="standing-report__ring-side-labels" aria-hidden="true">
          <circle className="is-left" cx="82" cy="126" r="12" />
          <circle className="is-right" cx="128" cy="126" r="12" />
          <text className="is-left" x="82" y="131" textAnchor="middle">左</text>
          <text className="is-right" x="128" y="131" textAnchor="middle">右</text>
        </g>
      </svg>
      <div className="standing-report__weight-legend" aria-hidden="true">
        <span><i />左脚</span><span><i />右脚</span>
      </div>
    </>
  );
}

function FootSupportVisual({ metric }) {
  return (
    <div className="standing-report__support-layout">
      <div className="standing-report__support-comparison" aria-label="左右足底支撑对比">
        <span className="standing-report__support-side-label" data-side="left"><i />左足</span>
        <span className="standing-report__support-mark">
          <Footprints aria-hidden="true" />
        </span>
        <span className="standing-report__support-side-label" data-side="right">右足<i /></span>

        <strong className="standing-report__support-value" data-side="left" data-kind="type">
          {metric.leftType || '数据不足'}
        </strong>
        <span className="standing-report__support-row-label" data-kind="type">足弓类型</span>
        <strong className="standing-report__support-value" data-side="right" data-kind="type">
          {metric.rightType || '数据不足'}
        </strong>

        <strong className="standing-report__support-value" data-side="left" data-kind="index">
          {formatNumber(metric.leftIndex)}
        </strong>
        <span className="standing-report__support-row-label" data-kind="index">足弓指数</span>
        <strong className="standing-report__support-value" data-side="right" data-kind="index">
          {formatNumber(metric.rightIndex)}
        </strong>

        <strong className="standing-report__support-value" data-side="left" data-kind="area">
          {formatNumber(metric.leftContactArea)}
          {metric.leftContactArea === null || metric.leftContactArea === undefined
            ? null
            : <small>cm²</small>}
        </strong>
        <span className="standing-report__support-row-label" data-kind="area">接触面积</span>
        <strong className="standing-report__support-value" data-side="right" data-kind="area">
          {formatNumber(metric.rightContactArea)}
          {metric.rightContactArea === null || metric.rightContactArea === undefined
            ? null
            : <small>cm²</small>}
        </strong>
      </div>
    </div>
  );
}

function MetricVisual({ metric }) {
  if (metric.id === 'stability') {
    return (
      <>
        <p className="standing-report__metric-caption">{metric.caption || 'COP 轨迹总长'}</p>
        <div className="standing-report__metric-primary"><Value value={metric.value} unit={metric.unit} /></div>
        <p className="standing-report__figure-label">稳定区域示意图</p>
        <img src={standingReportImages.stability} alt="站立稳定区域示意" />
      </>
    );
  }

  if (metric.id === 'center') {
    return (
      <>
        <div className="standing-report__dual-values">
          <div><p>左右偏移</p><Value value={metric.lateralOffset} unit="cm" /></div>
          <div><p>前后偏移</p><Value value={metric.longitudinalOffset} unit="cm" /></div>
        </div>
        <p className="standing-report__figure-label">重心位置分布图</p>
        <CenterGauge value={metric.lateralOffset} />
      </>
    );
  }

  if (metric.id === 'weight') {
    return (
      <>
        <div className="standing-report__dual-values standing-report__dual-values--weight">
          <div><p>左脚承重</p><Value value={metric.leftPercent} unit="%" /></div>
          <div><p>右脚承重</p><Value value={metric.rightPercent} unit="%" /></div>
        </div>
        <p className="standing-report__figure-label">双脚承重分布图</p>
        <WeightRing leftPercent={metric.leftPercent} rightPercent={metric.rightPercent} />
      </>
    );
  }

  return <FootSupportVisual metric={metric} />;
}

export function StandingMetricGrid({ metrics }) {
  return (
    <section className="standing-report__metrics" aria-label="四项核心能力指标">
      {metrics.map((metric) => (
        <article
          className={`standing-report__metric-card standing-report__metric-card--${metric.id}`}
          data-testid="standing-metric-card"
          key={metric.id}
        >
          <div className="standing-report__metric-heading">
            <span>{metric.index}</span>
            <div><h2>{metric.title}</h2><p>{metric.description}</p></div>
          </div>
          <div className="standing-report__metric-body"><MetricVisual metric={metric} /></div>
          <div className="standing-report__metric-result">
            <p>{metric.summary || '数据不足'}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
