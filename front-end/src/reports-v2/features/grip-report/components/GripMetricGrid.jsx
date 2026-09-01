import { GripMetricCard } from './GripMetricCard';

export function GripMetricGrid({ metrics, onShowDetail }) {
  return (
    <section className="grip-report__metrics-section" aria-labelledby="grip-metrics-title">
      <h3 id="grip-metrics-title">核心指标</h3>
      <div className="grip-report__metrics-grid">
        {metrics.map((metric) => (
          <GripMetricCard key={metric.id} metric={metric} onShowDetail={onShowDetail} />
        ))}
      </div>
    </section>
  );
}
