import { MaterialSymbol } from './MaterialSymbol';

const METRIC_SYMBOLS = {
  'chart-no-axes-combined': 'show_chart',
  dumbbell: 'fitness_center',
  footprints: 'directions_walk',
  gauge: 'speed',
  hand: 'back_hand',
  ruler: 'straighten',
  scale: 'balance',
  timer: 'timer',
  waves: 'waves',
};

export function MetricItem({ metric, compact = false, tone = '#4D8D54', valueClassName = '' }) {
  const symbol = METRIC_SYMBOLS[metric.icon] || metric.icon || 'show_chart';
  const valueClass = valueClassName || (compact ? 'text-3xl' : 'text-4xl');

  return (
    <div
      className="health-overview__metric flex flex-col items-center p-6 rounded-xl"
      data-compact={compact || undefined}
    >
      <div className="health-overview__metric-label flex items-center justify-center">
        <MaterialSymbol
          name={symbol}
          className={compact ? 'text-[18px]' : 'text-xl'}
        />
        <span>{metric.label}</span>
      </div>
      <div className="health-overview__metric-value flex items-baseline justify-center gap-0.5">
        <strong className={`font-bold ${valueClass}`} style={{ color: valueClassName ? tone : undefined }}>
          {metric.value}
        </strong>
        {metric.unit ? <span>{metric.unit}</span> : null}
      </div>
      {metric.reference ? <small>{metric.reference}</small> : null}
    </div>
  );
}
