import { SitStandMetricCard } from './SitStandMetricCard';

/** 照握力：区标题 h3 + 四列网格。 */
export function SitStandMetricGrid({ metrics }) {
  return (
    <section className="sit-stand-report__metrics-section" aria-labelledby="sit-stand-metrics-title">
      <h3 id="sit-stand-metrics-title">核心指标</h3>
      <div className="sit-stand-report__metrics-grid">
        {metrics.map((metric) => (
          <SitStandMetricCard key={metric.id} metric={metric} />
        ))}
      </div>
    </section>
  );
}
