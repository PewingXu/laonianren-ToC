export function GripTrialBars({ metric }) {
  const maximum = metric.chartValues.length > 0 ? Math.max(...metric.chartValues) : null;

  return (
    <div className="grip-report__trial-bars" role="img" aria-label="三次平均握力">
      {metric.chartLabels.map((label, index) => {
        const value = metric.chartValues[index] ?? null;
        const height = value !== null && maximum ? `${Math.max(18, (value / maximum) * 72)}px` : '0px';
        return (
          <div className="grip-report__trial-bar" key={label}>
            <span>{value ?? '--'}</span>
            <i style={{ height }} aria-hidden="true" />
            <small>{label}</small>
          </div>
        );
      })}
    </div>
  );
}
