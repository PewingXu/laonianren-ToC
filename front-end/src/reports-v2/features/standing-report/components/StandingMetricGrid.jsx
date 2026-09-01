import { ChevronRight, Footprints } from 'lucide-react';
import { standingReportImages } from '../assets';

function Value({ value, unit = '' }) {
  return value === null || value === undefined
    ? <strong className="standing-report__metric-unavailable">数据不足</strong>
    : <strong>{value}<small>{unit}</small></strong>;
}

function CenterGauge({ value }) {
  const needle = value === null ? 125 : Math.max(42, Math.min(208, 125 + value * 28));
  return (
    <svg className="standing-report__center-gauge" viewBox="0 0 250 172" role="img" aria-label="重心位置分布图">
      <defs>
        <linearGradient id="standingGaugeColor" x1="0" x2="1">
          <stop offset="0" stopColor="#4d8d54" />
          <stop offset=".47" stopColor="#cfe1d1" />
          <stop offset=".54" stopColor="#fce2d1" />
          <stop offset="1" stopColor="#f8a36d" />
        </linearGradient>
      </defs>
      <path className="standing-report__gauge-band" d="M31 134 A94 94 0 0 1 219 134" />
      <path className="standing-report__gauge-color" d="M31 134 A94 94 0 0 1 219 134" />
      <path className="standing-report__gauge-ticks" d="M31 134h10M58 68l8 8M125 40v11M192 68l-8 8M219 134h-10" />
      <g className="standing-report__gauge-labels">
        <text x="14" y="142">-2</text><text x="43" y="75">-1</text>
        <text x="121" y="33">0</text><text x="201" y="75">1</text><text x="226" y="142">2</text>
      </g>
      <path className="standing-report__gauge-needle" d={`M125 133 ${needle - 4} 64 129 133Z`} />
      <circle className="standing-report__gauge-pin" cx="125" cy="133" r="8" />
      <circle className="standing-report__gauge-pin-center" cx="125" cy="133" r="3" />
      <text className="standing-report__gauge-zero" x="125" y="160" textAnchor="middle">0</text>
      <text className="standing-report__gauge-unit" x="125" y="171" textAnchor="middle">cm</text>
    </svg>
  );
}

function WeightRing({ leftPercent, rightPercent }) {
  return (
    <>
      <svg className="standing-report__weight-ring" viewBox="0 0 210 190" role="img" aria-label="双脚承重分布图">
        <defs>
          <linearGradient id="standingLeftWeight" x1="0" x2="1"><stop offset="0" stopColor="#6e95d6" /><stop offset="1" stopColor="#bfd0ea" /></linearGradient>
          <linearGradient id="standingRightWeight" x1="0" x2="1"><stop offset="0" stopColor="#d0d9ed" /><stop offset="1" stopColor="#a689b5" /></linearGradient>
        </defs>
        <circle className="standing-report__ring-base" cx="105" cy="89" r="64" />
        <path className="standing-report__ring-left" d="M105 25 A64 64 0 0 0 101 153" />
        <path className="standing-report__ring-right" d="M105 25 A64 64 0 1 1 101 153" />
        <g className="standing-report__footprint">
          <ellipse cx="82" cy="83" rx="10" ry="25" transform="rotate(8 82 83)" />
          <ellipse cx="128" cy="83" rx="10" ry="25" transform="rotate(-8 128 83)" />
          <circle cx="69" cy="57" r="5" /><circle cx="75" cy="52" r="5" />
          <circle cx="141" cy="57" r="5" /><circle cx="135" cy="52" r="5" />
        </g>
      </svg>
      <div className="standing-report__weight-legend" aria-label={leftPercent === null ? '承重数据不足' : `左脚${leftPercent}%，右脚${rightPercent}%`}>
        <span><i />左脚</span><span><i />右脚</span>
      </div>
    </>
  );
}

function FootSupportSide({ label, type, index, area }) {
  return (
    <div className="standing-report__support-side">
      <p>{label}</p>
      <strong>{type}</strong>
      <span>{index === null ? '足弓指数 --' : `足弓指数 ${index}`}</span>
      <span>{area === null ? '接触面积 --' : `接触面积 ${area} cm²`}</span>
    </div>
  );
}

function FootSupportVisual({ metric }) {
  return (
    <div className="standing-report__support-layout">
      <Footprints role="img" aria-label="足底支撑状态示意" />
      <div className="standing-report__support-values">
        <FootSupportSide
          label="左足支撑"
          type={metric.leftType}
          index={metric.leftIndex}
          area={metric.leftContactArea}
        />
        <FootSupportSide
          label="右足支撑"
          type={metric.rightType}
          index={metric.rightIndex}
          area={metric.rightContactArea}
        />
      </div>
    </div>
  );
}

function MetricVisual({ metric }) {
  if (metric.id === 'stability') {
    return (
      <>
        <p className="standing-report__metric-caption">身体摇动范围</p>
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

export function StandingMetricGrid({ metrics, onShowDetail }) {
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
            <button type="button" aria-label="查看详情" onClick={() => onShowDetail(metric.detailTargetId)}>
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
