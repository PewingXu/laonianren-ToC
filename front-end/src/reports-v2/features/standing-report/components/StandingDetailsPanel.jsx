import {
  CheckCircle2,
  Crosshair,
  Footprints,
  Gauge,
  Info,
} from 'lucide-react';
import { copTrajectoryPath } from './standingCopVisuals';

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


function copDirectionSummary(cop) {
  if (!isAvailable(cop.lateralRange) || !isAvailable(cop.longitudinalRange)) return null;
  const subject = cop.metricScope === 'representative-foot' ? '代表侧单足 COP' : '整体 COP';
  if (cop.longitudinalRange > cop.lateralRange) {
    return `${subject} 的前后摆动大于左右摆动。`;
  }
  if (cop.lateralRange > cop.longitudinalRange) {
    return `${subject} 的左右摆动大于前后摆动。`;
  }
  return `${subject} 的前后与左右摆动范围相同。`;
}

function dominantPressureSummary(pressure) {
  const summaryForSide = (regions, label) => {
    const availableRegions = REGION_META
      .map((region) => ({ ...region, value: regions[region.key] }))
      .filter((region) => isAvailable(region.value));
    if (availableRegions.length === 0) return null;
    const dominant = availableRegions.reduce((current, region) => (
      region.value > current.value ? region : current
    ));
    return `${label}压力占比最高的是${dominant.summary}区域`;
  };
  const summaries = [
    summaryForSide(pressure.leftRegions, '左脚'),
    summaryForSide(pressure.rightRegions, '右脚'),
  ].filter(Boolean);

  return summaries.length ? `${summaries.join('；')}。` : null;
}

function archMarkerPosition(index) {
  if (!isAvailable(index)) return null;
  const ratio = (index - ARCH_SCALE_MIN) / (ARCH_SCALE_MAX - ARCH_SCALE_MIN);
  return Math.min(100, Math.max(0, ratio * 100));
}

function archSummary(arch) {
  const typeParts = [];
  if (arch.leftType === '正常足弓' && arch.rightType === '正常足弓') {
    typeParts.push('双脚足弓正常');
  } else {
    if (arch.leftType && arch.leftType !== '数据不足') {
      typeParts.push(`左足为${arch.leftType}`);
    }
    if (arch.rightType && arch.rightType !== '数据不足') {
      typeParts.push(`右足为${arch.rightType}`);
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
  const trajectoryPath = copTrajectoryPath(trajectory);
  const hasData = trajectory.length > 0 || [
    cop.pathLength,
    cop.area,
    cop.lateralRange,
    cop.longitudinalRange,
    cop.averageVelocity,
    cop.maxDisplacement,
    cop.rmsDisplacement,
    cop.majorAxis,
    cop.minorAxis,
  ].some(isAvailable);
  const directionSummary = copDirectionSummary(cop);
  const usesRepresentativeFoot = cop.metricScope === 'representative-foot';
  const metricSideLabel = cop.metricSide === 'left'
    ? '左足'
    : (cop.metricSide === 'right' ? '右足' : null);
  const metricPrefix = usesRepresentativeFoot
    ? `${metricSideLabel || '代表侧单足'} COP`
    : '整体 COP';
  const metricScopeDescription = metricSideLabel
    ? `算法代表侧（${metricSideLabel}）`
    : '算法代表侧单足';

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
        subtitle={usesRepresentativeFoot
          ? `双足轨迹，统计取${metricScopeDescription}`
          : '双足压力中心轨迹'}
        showInfo
      />
      {!hasData ? (
        <UnavailableNotice>暂无可用的压力中心轨迹或统计数据。</UnavailableNotice>
      ) : (
        <div className="standing-report__cop-layout">
          <div className="standing-report__cop-chart-column">
            <div className="standing-report__cop-visual">
              <svg viewBox="0 0 420 420" role="img" aria-label="双足压力中心移动轨迹">
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
              <span><i className="is-zone" />自动缩放参考区</span>
              <span><i className="is-center" />图示中心</span>
            </div>
          </div>
          <div className="standing-report__cop-data-column">
            <div className="standing-report__cop-metrics">
              <CopMetric label={`${metricPrefix} 轨迹总长`} value={cop.pathLength} unit="cm" />
              <CopMetric label={`${metricPrefix} 活动面积`} value={cop.area} unit="cm²" />
              <CopMetric label="左右最大摆动" value={cop.lateralRange} unit="cm" />
              <CopMetric label="前后最大摆动" value={cop.longitudinalRange} unit="cm" />
              <CopMetric label="平均移动速度" value={cop.averageVelocity} unit="cm/s" />
              <CopMetric label="最大偏移" value={cop.maxDisplacement} unit="cm" />
              <CopMetric label="RMS 偏移" value={cop.rmsDisplacement} unit="cm" />
              <CopMetric label="轨迹长轴" value={cop.majorAxis} unit="cm" />
              <CopMetric label="轨迹短轴" value={cop.minorAxis} unit="cm" />
            </div>
            {directionSummary && <ResultNotice>{directionSummary}</ResultNotice>}
            {cop.reference && (
              <div className="standing-report__analysis-help">
                <Info aria-hidden="true" />
                <p>{cop.reference}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function centerDirectionText(direction) {
  if (direction === 'left') return '偏左';
  if (direction === 'right') return '偏右';
  if (direction === 'centered') return '居中';
  return '方向未定';
}

function centerControlSummary(control) {
  const facts = [];
  if (isAvailable(control.lateralOffset)) {
    const direction = centerDirectionText(control.lateralDirection);
    facts.push(direction === '居中'
      ? '左右位置居中'
      : `受力中心${direction} ${formatNumber(Math.abs(control.lateralOffset))} cm`);
  }
  if (isAvailable(control.magnitude)) {
    facts.push(`合成偏移 ${formatNumber(control.magnitude)} cm`);
  }
  return facts.length ? `${facts.join('，')}。` : null;
}

function CenterControlAnalysis({ control }) {
  const hasData = control?.quality?.valid === true
    && [control.lateralOffset, control.longitudinalOffset, control.magnitude].some(isAvailable);
  const summary = hasData ? centerControlSummary(control) : null;

  return (
    <article
      className="standing-report__analysis-card standing-report__analysis-card--center-control"
      data-testid="standing-analysis-card"
    >
      <AnalysisHeading
        id="standing-center-control-detail"
        icon={Crosshair}
        tone="orange"
        title="重心控制推断"
        subtitle="本次足底受力中心偏移"
        showInfo
      />
      {!hasData ? (
        <UnavailableNotice>重心偏移数据不足，建议重新检测。</UnavailableNotice>
      ) : (
        <>
          <div className="standing-report__center-control-metrics">
            <CopMetric label={`左右偏移（${centerDirectionText(control.lateralDirection)}）`} value={control.lateralOffset} unit="cm" />
            <CopMetric label="前后偏移幅度" value={control.longitudinalOffset} unit="cm" />
            <CopMetric label="合成偏移幅度" value={control.magnitude} unit="cm" />
            <CopMetric label="峰值帧索引" value={control.frameIndex} unit="" />
          </div>
          {summary && <ResultNotice>{summary}</ResultNotice>}
          <div className="standing-report__analysis-help">
            <Info aria-hidden="true" />
            <p>由足底压力估算，仅作重心控制参考。</p>
          </div>
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
  const maskId = `standing-pressure-mask-${side}`;
  const cropId = `standing-pressure-crop-${side}`;
  const image = side === 'left'
    ? { x: -7, y: 7, size: 317, cropX: 4, cropWidth: 144 }
    : { x: -151, y: -42, size: 325, cropX: 10, cropWidth: 148 };
  const regionValues = {
    forefoot: formatPercent(regions.forefoot),
    midfoot: formatPercent(regions.midfoot),
    hindfoot: formatPercent(regions.hindfoot),
  };
  const readingPositions = side === 'left'
    ? {
        forefoot: { x: 80, y: 80 },
        midfoot: { x: 73, y: 161 },
        hindfoot: { x: 97, y: 240 },
      }
    : {
        forefoot: { x: 84, y: 81 },
        midfoot: { x: 88, y: 161 },
        hindfoot: { x: 54, y: 243 },
      };

  return (
    <figure className={`standing-report__pressure-foot standing-report__pressure-foot--${side}`}>
      <figcaption style={{ color }}>{sideLabel}脚</figcaption>
      <svg viewBox="0 0 170 300" role="img" aria-label={`${sideLabel}足足底压力分布`}>
        <defs>
          <clipPath id={cropId}>
            <rect x={image.cropX} y="0" width={image.cropWidth} height="286" />
          </clipPath>
          <mask
            id={maskId}
            x="0"
            y="0"
            width="170"
            height="286"
            maskUnits="userSpaceOnUse"
            maskContentUnits="userSpaceOnUse"
            style={{ maskType: 'alpha' }}
          >
            <g clipPath={`url(#${cropId})`}>
              <image
                href="/icons/footprint.png"
                x={image.x}
                y={image.y}
                width={image.size}
                height={image.size}
                preserveAspectRatio="none"
              />
            </g>
          </mask>
        </defs>

        <g className="standing-report__pressure-footprint" mask={`url(#${maskId})`}>
          <rect
            data-pressure-region="forefoot"
            x="0"
            y="0"
            width="170"
            height="118"
            fill={color}
            fillOpacity={pressureOpacity(regions.forefoot)}
          />
          <rect
            data-pressure-region="midfoot"
            x="0"
            y="118"
            width="170"
            height="82"
            fill={color}
            fillOpacity={pressureOpacity(regions.midfoot)}
          />
          <rect
            data-pressure-region="hindfoot"
            x="0"
            y="200"
            width="170"
            height="86"
            fill={color}
            fillOpacity={pressureOpacity(regions.hindfoot)}
          />
          <path className="standing-report__pressure-divider" d="M0 118H170M0 200H170" />
        </g>

        {Object.entries(readingPositions).map(([region, position]) => (
          <g className="standing-report__pressure-reading" key={region}>
            <rect x={position.x - 33} y={position.y - 19} width="66" height="28" rx="14" />
            <text x={position.x} y={position.y} textAnchor="middle">{regionValues[region]}</text>
          </g>
        ))}
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
  const hasMapData = hasRegionData(pressure.leftRegions) || hasRegionData(pressure.rightRegions);
  const leftForward = pressure.copDistances?.leftForward;
  const longitudinalOffsetStat = isAvailable(leftForward)
    ? [leftForward >= 0 ? '左足前移量' : '左足后移量', Math.abs(leftForward), 'cm']
    : ['左足前后错位', null, 'cm'];
  const stats = [
    ['左脚承重', pressure.leftPercent, '%'],
    ['右脚承重', pressure.rightPercent, '%'],
    ['左足 COP 至整体 COP', pressure.copDistances?.left, 'cm'],
    ['右足 COP 至整体 COP', pressure.copDistances?.right, 'cm'],
    longitudinalOffsetStat,
  ];
  const hasStats = stats.some(([, value]) => isAvailable(value));
  const hasData = hasMapData || hasStats;
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
        subtitle="前足、中足和后足压力占比"
      />
      {!hasData ? (
        <UnavailableNotice>暂无可用的足底压力区域数据。</UnavailableNotice>
      ) : (
        <>
          {hasMapData && (
            <div className="standing-report__pressure-map">
              <FootPressureMap side="left" regions={pressure.leftRegions} color="#397bd5" />
              <PressureRegionGuide />
              <FootPressureMap side="right" regions={pressure.rightRegions} color="#ee7b43" />
            </div>
          )}
          {hasStats && (
            <div className="standing-report__pressure-stats">
              {stats.map(([label, value, unit]) => (
                <CopMetric label={label} value={value} unit={unit} key={label} />
              ))}
            </div>
          )}
          {summary && <ResultNotice tone="blue">{summary}</ResultNotice>}
        </>
      )}
    </article>
  );
}

function ArchDetail({ label, value, unit = '' }) {
  return (
    <p>
      <span>{label}</span>
      <strong>{formatNumber(value)}{isAvailable(value) && unit ? <small>{unit}</small> : null}</strong>
    </p>
  );
}

function ArchScale({
  side,
  type,
  index,
  area,
  length,
  width,
  clarkeAngle,
  clarkeType,
  staheliRatio,
  color,
}) {
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
      <div className="standing-report__arch-detail-grid">
        <ArchDetail label="足长" value={length} unit="cm" />
        <ArchDetail label="足宽" value={width} unit="cm" />
        <ArchDetail label="Clarke 角" value={clarkeAngle} unit="°" />
        <ArchDetail label="Staheli 比值" value={staheliRatio} />
        <p className="standing-report__arch-detail-classification">
          <span>Clarke 分类</span>
          <strong>{clarkeType || '数据不足'}</strong>
        </p>
      </div>
    </div>
  );
}

function FootSupportAnalysis({ arch }) {
  const hasData = [
    arch.leftIndex,
    arch.rightIndex,
    arch.leftContactArea,
    arch.rightContactArea,
    arch.leftLength,
    arch.rightLength,
    arch.leftClarkeAngle,
    arch.rightClarkeAngle,
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
        subtitle="足弓、尺寸与接触面积"
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
              length={arch.leftLength}
              width={arch.leftWidth}
              clarkeAngle={arch.leftClarkeAngle}
              clarkeType={arch.leftClarkeType}
              staheliRatio={arch.leftStaheliRatio}
              color="#397bd5"
            />
            <ArchScale
              side="右"
              type={arch.rightType}
              index={arch.rightIndex}
              area={arch.rightContactArea}
              length={arch.rightLength}
              width={arch.rightWidth}
              clarkeAngle={arch.rightClarkeAngle}
              clarkeType={arch.rightClarkeType}
              staheliRatio={arch.rightStaheliRatio}
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
        <CenterControlAnalysis control={details.centerControl} />
        <PressureAnalysis pressure={details.pressure} />
        <FootSupportAnalysis arch={details.arch} />
      </div>
    </section>
  );
}
