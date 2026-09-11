import {
  Compass,
  Footprints,
  Gauge,
  MoveHorizontal,
  Ruler,
  Timer,
} from 'lucide-react';

const ICONS = {
  speed: Gauge,
  cadence: Footprints,
  cycleTime: Timer,
  stepLength: Ruler,
  stepWidth: MoveHorizontal,
  doubleContactTime: Timer,
  fpa: Compass,
};

function Reading({ value, unit }) {
  if (value === null || value === undefined) {
    return <span className="gait-report__key-metric-missing">未测</span>;
  }

  return (
    <span className="gait-report__key-metric-value">
      <strong>{value}</strong>
      {unit ? <small>{unit}</small> : null}
    </span>
  );
}

function Supplement({ value }) {
  if (!value) return null;

  return (
    <p>
      {value.label}：
      {value.value === null || value.value === undefined
        ? '未测'
        : `${value.value}${value.unit ? ` ${value.unit}` : ''}`}
    </p>
  );
}

function MetricCard({ metric }) {
  const Icon = ICONS[metric.id] || Gauge;
  const bilateral = metric.left !== undefined || metric.right !== undefined;

  return (
    <article
      className="gait-report__key-metric-card"
      data-tone={metric.tone}
      data-metric={metric.id}
    >
      <div className="gait-report__key-metric-head">
        <span className="gait-report__key-metric-icon" aria-hidden="true">
          <Icon />
        </span>
        <h4>{metric.label}</h4>
      </div>

      {bilateral ? (
        <div className="gait-report__key-metric-sides">
          <div data-side="left">
            <span>左脚</span>
            <Reading value={metric.left} unit={metric.unit} />
          </div>
          <div data-side="right">
            <span>右脚</span>
            <Reading value={metric.right} unit={metric.unit} />
          </div>
        </div>
      ) : (
        <div className="gait-report__key-metric-reading">
          <Reading value={metric.value} unit={metric.unit} />
        </div>
      )}

      <Supplement value={metric.supplement} />
      {metric.note ? <p>{metric.note}</p> : null}
    </article>
  );
}

export function GaitKeyMetrics({ metrics }) {
  const items = Array.isArray(metrics) ? metrics : [];
  if (items.length === 0) return null;

  return (
    <section
      className="gait-report__key-metrics"
      aria-labelledby="gait-key-metrics-title"
    >
      <h3 id="gait-key-metrics-title" className="gait-report__section-title">
        <Footprints aria-hidden="true" />
        <span>步态时空参数</span>
      </h3>
      <div className="gait-report__key-metrics-grid">
        {items.map((metric) => <MetricCard key={metric.id} metric={metric} />)}
      </div>
    </section>
  );
}
