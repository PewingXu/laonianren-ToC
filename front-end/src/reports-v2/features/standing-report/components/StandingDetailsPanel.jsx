import {
  CheckCircle2,
  Footprints,
  Gauge,
  Info,
} from 'lucide-react';

const ARCH_SCALE_MIN = 0.15;
const ARCH_SCALE_MAX = 0.31;
const REGION_META = [
  { key: 'forefoot', label: '前足', summary: '前脚掌' },
  { key: 'midfoot', label: '中足', summary: '足弓中部' },
  { key: 'hindfoot', label: '后足', summary: '足跟' },
];

function isAvailable(value) {
  return value !== null && value !== undefined;
}

function formatNumber(value) {
  if (!isAvailable(value)) return '--';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function formatPercent(value) {
  return isAvailable(value) ? `${formatNumber(value)}%` : '--';
}

function pathFor(points) {
  if (points.length === 0) return '';

  const allX = points.map((point) => point.x);
  const allY = points.map((point) => point.y);
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);
  const xRange = maxX - minX || 1;
  const yRange = maxY - minY || 1;

  const mapped = points.map((point) => ({
    x: 145 + ((point.x - minX) / xRange) * 130,
    y: 145 + ((point.y - minY) / yRange) * 130,
  }));

  if (mapped.length === 1) {
    return `M${mapped[0].x.toFixed(1)} ${mapped[0].y.toFixed(1)}`;
  }

  return mapped.slice(0, -1).reduce((path, point, index) => {
    const previous = mapped[index - 1] || point;
    const next = mapped[index + 1];
    const following = mapped[index + 2] || next;
    const controlOne = {
      x: point.x + (next.x - previous.x) / 6,
      y: point.y + (next.y - previous.y) / 6,
    };
    const controlTwo = {
      x: next.x - (following.x - point.x) / 6,
      y: next.y - (following.y - point.y) / 6,
    };

    return `${path} C${controlOne.x.toFixed(1)} ${controlOne.y.toFixed(1)} ${controlTwo.x.toFixed(1)} ${controlTwo.y.toFixed(1)} ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
  }, `M${mapped[0].x.toFixed(1)} ${mapped[0].y.toFixed(1)}`);
}

function copDirectionSummary(cop) {
  if (!isAvailable(cop.lateralRange) || !isAvailable(cop.longitudinalRange)) return null;
  if (cop.longitudinalRange > cop.lateralRange) {
    return '本次站立时前后晃动大于左右晃动。';
  }
  if (cop.lateralRange > cop.longitudinalRange) {
    return '本次站立时左右晃动大于前后晃动。';
  }
  return '本次站立时前后与左右晃动范围相同。';
}

function dominantPressureSummary(pressure) {
  const regionTotals = REGION_META.map((region) => {
    const values = [
      pressure.leftRegions[region.key],
      pressure.rightRegions[region.key],
    ].filter(isAvailable);
    if (values.length === 0) return null;
    return {
      ...region,
      average: values.reduce((total, value) => total + value, 0) / values.length,
    };
  }).filter(Boolean);

  if (regionTotals.length === 0) return null;
  const dominant = regionTotals.reduce((current, region) => (
    region.average > current.average ? region : current
  ));
  return `双脚压力主要集中在${dominant.summary}区域。`;
}

function archMarkerPosition(index) {
  if (!isAvailable(index)) return null;
  const ratio = (index - ARCH_SCALE_MIN) / (ARCH_SCALE_MAX - ARCH_SCALE_MIN);
  return Math.min(100, Math.max(0, ratio * 100));
}

function archSummary(arch) {
  const typeParts = [];
  if (arch.leftType === '正常' && arch.rightType === '正常') {
    typeParts.push('双脚足弓均处于正常范围');
  } else {
    if (arch.leftType && arch.leftType !== '数据不足') {
      typeParts.push(`左足足弓状态${arch.leftType}`);
    }
    if (arch.rightType && arch.rightType !== '数据不足') {
      typeParts.push(`右足足弓状态${arch.rightType}`);
    }
  }

  const leftArea = arch.leftContactArea;
  const rightArea = arch.rightContactArea;
  if (isAvailable(leftArea) && isAvailable(rightArea)) {
    const difference = Number(Math.abs(leftArea - rightArea).toFixed(2));
    if (difference === 0) {
      typeParts.push('双脚接触面积相同');
    } else {
      const largerSide = leftArea > rightArea ? '左足' : '右足';
      const smallerSide = leftArea > rightArea ? '右足' : '左足';
      typeParts.push(`${largerSide}接触面积比${smallerSide}大 ${formatNumber(difference)} cm²`);
    }
  }

  return typeParts.length > 0 ? `${typeParts.join('，')}。` : null;
}

function CopTargetIcon() {
  return (
    <svg
      data-testid="standing-cop-target-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="6.5" />
    </svg>
  );
}

function AnalysisHeading({ id, icon: Icon, tone, title, subtitle, showInfo = false }) {
  return (
    <div className="standing-report__analysis-heading">
      <span className={`standing-report__analysis-icon standing-report__analysis-icon--${tone}`}>
        <Icon aria-hidden="true" />
      </span>
      <div>
        <h3 id={id} tabIndex="-1">
          {title}
          {showInfo && (
            <span className="standing-report__analysis-title-info">
              <Info aria-hidden="true" />
            </span>
          )}
        </h3>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function ResultNotice({ children, tone = 'green' }) {
  return (
    <div className={`standing-report__analysis-notice standing-report__analysis-notice--${tone}`}>
      <CheckCircle2 aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

function UnavailableNotice({ children }) {
  return (
    <div className="standing-report__analysis-unavailable" role="status">
      <Info aria-hidden="true" />
      <p>
        <strong>数据不足</strong>
        <span>{children}</span>
      </p>
      <b>--</b>
    </div>
  );
}

function CopMetric({ label, value, unit }) {
  return (
    <div className="standing-report__cop-metric">
      <span>{label}</span>
      <p>
        <strong>{formatNumber(value)}</strong>
        {isAvailable(value) && <small>{unit}</small>}
      </p>
    </div>
  );
}

function CopAnalysis({ cop }) {
  const trajectory = Array.isArray(cop.trajectory) ? cop.trajectory : [];
  const trajectoryPath = pathFor(trajectory);
  const hasData = trajectory.length > 0 || [
    cop.pathLength,
    cop.area,
    cop.lateralRange,
    cop.longitudinalRange,
  ].some(isAvailable);
  const directionSummary = copDirectionSummary(cop);

  return (
    <article
      className="standing-report__analysis-card standing-report__analysis-card--cop"
      data-testid="standing-analysis-card"
    >
      <AnalysisHeading
        id="standing-cop-detail"
        icon={CopTargetIcon}
        tone="green"
        title="站立稳定轨迹"
        subtitle="压力中心（COP）在站立过程中的移动情况"
        showInfo
      />
      {!hasData ? (
        <UnavailableNotice>站立时间过短或信号不稳定，轨迹数据无法生成。</UnavailableNotice>
      ) : (
        <>
          <div className="standing-report__cop-visual">
            <svg viewBox="0 0 420 420" role="img" aria-label="压力中心移动轨迹">
              <circle className="standing-report__cop-boundary" cx="210" cy="210" r="185" />
              <circle className="standing-report__cop-stability-zone" cx="210" cy="210" r="65" />
              <path className="standing-report__cop-axis" d="M210 18V402M18 210H402" />
              <text x="210" y="16" textAnchor="middle">前</text>
              <text x="210" y="417" textAnchor="middle">后</text>
              <text x="9" y="215" textAnchor="middle">左</text>
              <text x="411" y="215" textAnchor="middle">右</text>
              {trajectoryPath && <path className="standing-report__cop-path" d={trajectoryPath} />}
              {!trajectoryPath && <text className="standing-report__cop-empty" x="210" y="217" textAnchor="middle">暂无轨迹点</text>}
              {trajectoryPath && <circle className="standing-report__cop-center" cx="210" cy="210" r="5" />}
            </svg>
          </div>
          <div className="standing-report__cop-legend" aria-label="轨迹图例">
            <span><i className="is-path" />压力中心轨迹</span>
            <span><i className="is-zone" />稳定参考区（直径24 cm）</span>
            <span><i className="is-center" />中心点</span>
          </div>
          <div className="standing-report__cop-metrics">
            <CopMetric label="重心移动总路径" value={cop.pathLength} unit="cm" />
            <CopMetric label="重心活动面积" value={cop.area} unit="cm²" />
            <CopMetric label="左右最大晃动" value={cop.lateralRange} unit="cm" />
            <CopMetric label="前后最大晃动" value={cop.longitudinalRange} unit="cm" />
          </div>
          {directionSummary && <ResultNotice>{directionSummary}</ResultNotice>}
          {cop.reference && (
            <div className="standing-report__analysis-help">
              <Info aria-hidden="true" />
              <p>{cop.reference}</p>
            </div>
          )}
        </>
      )}
    </article>
  );
}

function pressureOpacity(value) {
  if (!isAvailable(value)) return 0.12;
  return Math.min(0.96, 0.34 + (value / 100) * 1.32);
}

function FootPressureMap({ side, regions, color }) {
  const sideLabel = side === 'left' ? '左' : '右';
  const mirror = side === 'left' ? 'translate(160 0) scale(-1 1)' : undefined;
  const regionValues = {
    forefoot: formatPercent(regions.forefoot),
    midfoot: formatPercent(regions.midfoot),
    hindfoot: formatPercent(regions.hindfoot),
  };

  return (
    <figure className={`standing-report__pressure-foot standing-report__pressure-foot--${side}`}>
      <figcaption style={{ color }}>{sideLabel}脚</figcaption>
      <svg viewBox="0 0 160 290" role="img" aria-label={`${sideLabel}足足底压力分布`}>
        <g className="standing-report__pressure-footprint" transform={mirror}>
          <circle data-pressure-part="toe" cx="31" cy="31" r="19" fill={color} fillOpacity={pressureOpacity(regions.forefoot)} />
          <ellipse data-pressure-part="toe" cx="61" cy="28" rx="14" ry="19" fill={color} fillOpacity={pressureOpacity(regions.forefoot)} />
          <ellipse data-pressure-part="toe" cx="88" cy="34" rx="13" ry="18" fill={color} fillOpacity={pressureOpacity(regions.forefoot)} />
          <ellipse data-pressure-part="toe" cx="112" cy="44" rx="11" ry="16" fill={color} fillOpacity={pressureOpacity(regions.forefoot)} />
          <ellipse data-pressure-part="toe" cx="132" cy="57" rx="9" ry="13" fill={color} fillOpacity={pressureOpacity(regions.forefoot)} />
          <path
            data-pressure-region="forefoot"
            className="standing-report__pressure-region"
            d="M31 59C47 45 93 44 119 60c19 12 23 41 14 66-22 11-75 11-107 0-6-25-8-50 5-67Z"
            fill={color}
            fillOpacity={pressureOpacity(regions.forefoot)}
          />
          <path
            data-pressure-region="midfoot"
            className="standing-report__pressure-region"
            d="M26 126c23 9 84 11 107 0-7 20-12 39-14 57-2 16-1 28 1 37-22-10-57-10-80 0 4-18 4-36 1-54-3-15-9-29-15-40Z"
            fill={color}
            fillOpacity={pressureOpacity(regions.midfoot)}
          />
          <path
            data-pressure-region="hindfoot"
            className="standing-report__pressure-region"
            d="M40 220c21-10 59-10 80 0 6 24-1 50-21 62-21 11-49 2-59-19-6-13-5-30 0-43Z"
            fill={color}
            fillOpacity={pressureOpacity(regions.hindfoot)}
          />
        </g>
        <text className="standing-report__pressure-value standing-report__pressure-value--light" x="80" y="105" textAnchor="middle">
          {regionValues.forefoot}
        </text>
        <text className="standing-report__pressure-value" x="80" y="180" textAnchor="middle" style={{ fill: color }}>
          {regionValues.midfoot}
        </text>
        <text className="standing-report__pressure-value standing-report__pressure-value--light" x="80" y="260" textAnchor="middle">
          {regionValues.hindfoot}
        </text>
      </svg>
    </figure>
  );
}

function PressureRegionGuide() {
  return (
    <div
      className="standing-report__pressure-region-guide"
      data-testid="standing-pressure-region-guide"
      aria-label="足底压力区域"
    >
      {REGION_META.map((region) => (
        <span key={region.key}>{region.label}</span>
      ))}
    </div>
  );
}

function hasRegionData(regions) {
  return REGION_META.some((region) => isAvailable(regions[region.key]));
}

function PressureAnalysis({ pressure }) {
  const hasData = hasRegionData(pressure.leftRegions) || hasRegionData(pressure.rightRegions);
  const summary = dominantPressureSummary(pressure);

  return (
    <article
      className="standing-report__analysis-card standing-report__analysis-card--pressure"
      data-testid="standing-analysis-card"
    >
      <AnalysisHeading
        id="standing-pressure-detail"
        icon={Footprints}
        tone="blue"
        title="足底压力分布"
        subtitle="左右足前足、中足和后足的压力占比"
      />
      {!hasData ? (
        <UnavailableNotice>足底压力采集时间过短，区域数据无法生成。</UnavailableNotice>
      ) : (
        <>
          <div className="standing-report__pressure-map">
            <FootPressureMap side="left" regions={pressure.leftRegions} color="#397bd5" />
            <PressureRegionGuide />
            <FootPressureMap side="right" regions={pressure.rightRegions} color="#ee7b43" />
          </div>
          {summary && <ResultNotice tone="blue">{summary}</ResultNotice>}
        </>
      )}
    </article>
  );
}

function ArchScale({ side, type, index, area, color }) {
  const markerPosition = archMarkerPosition(index);
  return (
    <div className="standing-report__arch-side">
      <div className="standing-report__arch-side-heading">
        <i style={{ backgroundColor: color }} />
        <strong>{side}足</strong>
        <span>{type || '数据不足'}</span>
      </div>
      <div className="standing-report__arch-range-labels">
        <span>指数偏低</span>
        <b>正常范围</b>
        <span>指数偏高</span>
      </div>
      <div className="standing-report__arch-track">
        <span className="standing-report__arch-normal-band" />
        {markerPosition !== null && (
          <i
            className="standing-report__arch-marker"
            style={{ left: `${markerPosition}%`, backgroundColor: color }}
          />
        )}
      </div>
      <div className="standing-report__arch-ticks">
        <span>0.15</span><span>0.21</span><span>0.26</span><span>0.31</span>
      </div>
      <p className="standing-report__arch-index">
        <span>足弓指数</span>
        <strong style={{ color }}>{formatNumber(index)}</strong>
      </p>
      <p className="standing-report__arch-area">
        <span>{side}足接触面积</span>
        <strong>{formatNumber(area)}</strong>
        {isAvailable(area) && <small>cm²</small>}
      </p>
    </div>
  );
}

function FootSupportAnalysis({ arch }) {
  const hasData = [
    arch.leftIndex,
    arch.rightIndex,
    arch.leftContactArea,
    arch.rightContactArea,
  ].some(isAvailable);
  const summary = archSummary(arch);

  return (
    <article
      className="standing-report__analysis-card standing-report__analysis-card--support"
      data-testid="standing-analysis-card"
    >
      <AnalysisHeading
        id="standing-foot-support-detail"
        icon={Gauge}
        tone="lime"
        title="足弓与支撑状态"
        subtitle="足弓指数及足底接触面积"
      />
      {!hasData ? (
        <UnavailableNotice>足弓或接触面积数据不完整，无法进行分析。</UnavailableNotice>
      ) : (
        <>
          <div className="standing-report__arch-grid">
            <ArchScale
              side="左"
              type={arch.leftType}
              index={arch.leftIndex}
              area={arch.leftContactArea}
              color="#397bd5"
            />
            <ArchScale
              side="右"
              type={arch.rightType}
              index={arch.rightIndex}
              area={arch.rightContactArea}
              color="#ee7b43"
            />
          </div>
          {summary && <ResultNotice>{summary}</ResultNotice>}
        </>
      )}
    </article>
  );
}

export function StandingDetailsPanel({ details }) {
  return (
    <section className="standing-report__details" aria-label="详细数据分析">
      <h2><span />详细数据分析</h2>
      <div className="standing-report__analysis-grid">
        <CopAnalysis cop={details.cop} />
        <PressureAnalysis pressure={details.pressure} />
        <FootSupportAnalysis arch={details.arch} />
      </div>
    </section>
  );
}
