import {
  CircleAlert,
  CircleCheckBig,
  CircleHelp,
  Heart,
  Ruler,
  Scale,
  ShieldCheck,
  Target,
  Timer,
} from 'lucide-react';
import { gaitReportImages } from '../assets';

const NOTE_ICONS = {
  stability: ShieldCheck,
  coordination: Scale,
  rhythm: Heart,
  direction: Target,
};

function statusAppearance(status) {
  const value = typeof status === 'string' ? status : '';
  if (/数据不足|暂无/.test(value)) return { Icon: CircleHelp, tone: 'muted' };
  if (/样本有限|需关注|较高|不对称|异常/.test(value)) {
    return { Icon: CircleAlert, tone: 'attention' };
  }
  if (/参考/.test(value)) return { Icon: CircleHelp, tone: 'reference' };
  return { Icon: CircleCheckBig, tone: 'positive' };
}

function displayValue(value, fallback = '--') {
  return value === null || value === undefined ? fallback : value;
}

function ProgressTrack({ value }) {
  return (
    <div className="gait-report__ability-progress" aria-hidden="true">
      {value === null ? null : <i style={{ width: `${value}%` }} />}
    </div>
  );
}

function StabilityMetrics({ ability }) {
  let metricLabel = '身体晃动范围';
  let unit = 'cm';
  let scaleMax = ability.swayScaleMaxCm;
  let metrics = [
    ['前后晃动', ability.foreAftSwayCm, ability.foreAftProgressPercent],
    ['左右晃动', ability.lateralSwayCm, ability.lateralProgressPercent],
  ];

  if (ability.metricMode === 'stepVariability') {
    metricLabel = '相邻落脚变异系数';
    unit = '%';
    scaleMax = ability.variabilityScaleMax;
    metrics = [
      ['步时变异', ability.stepTimeCvPercent, ability.stepTimeProgressPercent],
      ['落脚间距变异', ability.stepDistanceCvPercent, ability.stepDistanceProgressPercent],
    ];
  }
  const hasMeasuredValue = metrics.some(([, value]) => value !== null);

  return (
    <div className="gait-report__ability-visual">
      <div className="gait-report__ability-image-wrap">
        <img
          src={gaitReportImages.stability}
          alt={hasMeasuredValue ? '行走落脚一致性示意图' : '行走稳定性数据不足'}
        />
      </div>
      <div className="gait-report__ability-metrics">
        <p className="gait-report__ability-metric-label">
          {metricLabel} <span>(越小越一致)</span>
        </p>
        {metrics.map(([label, value, progress]) => (
          <div className="gait-report__ability-measure" key={label}>
            <div>
              <span>{label}</span>
              <strong>
                {displayValue(value)}
                {value === null ? null : <small>{unit}</small>}
              </strong>
            </div>
            <ProgressTrack value={progress} />
            <p className="gait-report__ability-range">
              <span>0</span>
              <span>{scaleMax === null ? '--' : `${scaleMax}${unit}`}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CoordinationMetrics({ ability }) {
  const hasLoadData = ability.leftLoadPercent !== null && ability.rightLoadPercent !== null;

  return (
    <div className="gait-report__ability-visual">
      <div className="gait-report__ability-image-wrap">
        <img
          src={gaitReportImages.coordination}
          alt={hasLoadData ? '足底压力分布分析图' : '累计足底负荷占比数据不足'}
        />
      </div>
      <div className="gait-report__ability-metrics">
        <p className="gait-report__ability-metric-label">累计足底负荷占比</p>
        <div className="gait-report__ability-load-row gait-report__ability-load-row--left">
          <span>左脚占比</span>
          <strong>{hasLoadData ? `${ability.leftLoadPercent}%` : '--'}</strong>
        </div>
        <div className="gait-report__ability-load-row gait-report__ability-load-row--right">
          <span>右脚占比</span>
          <strong>{hasLoadData ? `${ability.rightLoadPercent}%` : '--'}</strong>
        </div>
        <div className="gait-report__load-balance" aria-hidden="true">
          <div>
            {hasLoadData ? (
              <>
                <i style={{ width: `${ability.leftLoadPercent}%` }} />
                <b style={{ width: `${ability.rightLoadPercent}%` }} />
              </>
            ) : null}
          </div>
          <span><i />50%</span>
        </div>
      </div>
    </div>
  );
}

function RhythmMeasure({ icon: Icon, label, value, unit, range, bandClassName }) {
  return (
    <div className="gait-report__rhythm-measure">
      <div className="gait-report__rhythm-label">
        <Icon aria-hidden="true" />
        <span>{label}</span>
      </div>
      <strong>
        {displayValue(value)}
        {value === null ? null : <small>{unit}</small>}
      </strong>
      <div className="gait-report__rhythm-track" aria-hidden="true">
        {range === null ? null : <i className={bandClassName} />}
      </div>
      <p className="gait-report__ability-range">
        {range === null || range === undefined ? (
          <span>暂无参考范围</span>
        ) : (
          <>
            <span>{range.min}</span>
            <span>{range.max}</span>
          </>
        )}
      </p>
    </div>
  );
}

function RhythmMetrics({ ability }) {
  return (
    <div className="gait-report__ability-visual">
      <div className="gait-report__ability-image-wrap">
        <img
          src={gaitReportImages.rhythm}
          alt={ability.cadenceStepsPerMinute === null && ability.stepLengthM === null
            ? '步频与同脚步幅数据不足'
            : '步频分析示意图'}
        />
      </div>
      <div className="gait-report__ability-metrics">
        <RhythmMeasure
          icon={Timer}
          label="步频"
          value={ability.cadenceStepsPerMinute}
          unit="步/分钟"
          range={ability.cadenceRange}
          bandClassName="gait-report__rhythm-band--cadence"
        />
        <RhythmMeasure
          icon={Ruler}
          label="同脚步幅"
          value={ability.stepLengthM}
          unit="m"
          range={ability.stepLengthRange}
          bandClassName="gait-report__rhythm-band--step"
        />
      </div>
    </div>
  );
}

function DirectionMetrics({ ability }) {
  return (
    <div className="gait-report__ability-visual">
      <div className="gait-report__ability-image-wrap">
        <img
          src={gaitReportImages.direction}
          alt={ability.pathDeviationCm === null ? '步态路径数据不足' : '步态路径分析图'}
        />
      </div>
      <div className="gait-report__ability-metrics">
        <div className="gait-report__direction-measure">
          <p className="gait-report__ability-metric-label">
            步迹偏移（均方根） <span>(越小越接近路线)</span>
          </p>
          <strong>
            {displayValue(ability.pathDeviationCm)}
            {ability.pathDeviationCm === null ? null : <small>cm</small>}
          </strong>
          <ProgressTrack value={ability.deviationProgressPercent} />
          <p className="gait-report__ability-range">
            <span>0</span>
            <span>
              {ability.deviationScaleMaxCm === null ? '--' : `${ability.deviationScaleMaxCm}cm`}
            </span>
          </p>
        </div>
        <div className="gait-report__direction-sway">
          <p>最大步迹偏移</p>
          <strong>
            {displayValue(ability.maxPathDeviationCm)}
            {ability.maxPathDeviationCm === null ? null : <small>cm</small>}
          </strong>
          <span>
            {ability.validStepCount === null
              ? '有效落脚数据不足'
              : `${ability.validStepCount} 次有效落脚`}
          </span>
        </div>
      </div>
    </div>
  );
}

function AbilityMetrics({ ability }) {
  if (ability.id === 'stability') return <StabilityMetrics ability={ability} />;
  if (ability.id === 'coordination') return <CoordinationMetrics ability={ability} />;
  if (ability.id === 'rhythm') return <RhythmMetrics ability={ability} />;
  return <DirectionMetrics ability={ability} />;
}

export function GaitAbilityCard({ ability }) {
  const NoteIcon = NOTE_ICONS[ability.id] || ShieldCheck;
  const { Icon: StatusIcon, tone: statusTone } = statusAppearance(ability.status);
  const subtitleId = `gait-ability-${ability.id}-subtitle`;
  const noteId = `gait-ability-${ability.id}-note`;

  return (
    <article
      id={`gait-ability-${ability.id}`}
      className={`gait-report__ability-card gait-report__ability-card--${ability.id}`}
      aria-label={ability.title}
      aria-describedby={`${subtitleId} ${noteId}`}
    >
      <div className="gait-report__ability-header">
        <div>
          <span className="gait-report__ability-index" data-testid="gait-ability-index">
            {ability.index}
          </span>
          <h4>{ability.title}</h4>
        </div>
        <span className={`gait-report__ability-status gait-report__ability-status--${statusTone}`}>
          <StatusIcon aria-hidden="true" />
          {ability.status}
        </span>
      </div>
      <p id={subtitleId} className="gait-report__ability-subtitle">{ability.subtitle}</p>
      <AbilityMetrics ability={ability} />
      <div className="gait-report__ability-note">
        <NoteIcon aria-hidden="true" />
        <p id={noteId}>{ability.note}</p>
      </div>
    </article>
  );
}
