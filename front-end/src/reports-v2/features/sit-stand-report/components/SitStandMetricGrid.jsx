import { SitStandMetricCard } from './SitStandMetricCard';

export function SitStandMetricGrid({ metrics }) {
  return (
    <section className="sit-stand-report__metrics-grid" aria-label="起身核心指标">
      {metrics.map((metric) => (
        <SitStandMetricCard key={metric.id} metric={metric} />
      ))}
    </section>
  );
}
