function pointCoordinates(trend) {
  const values = trend.map((point) => point.force);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;

  return trend.map((point, index) => ({
    x: index * 20,
    y: 35 - ((point.force - minimum) / range) * 20,
    label: point.label,
  }));
}

export function GripTrend({ trend }) {
  if (trend.length !== 6) return null;

  const points = pointCoordinates(trend);
  const polyline = points.map(({ x, y }) => `${x},${y}`).join(' ');

  return (
    <article className="grip-report__analysis-card grip-report__trend-card">
      <h3>近半年握力趋势</h3>
      <svg
        className="grip-report__trend-chart"
        viewBox="0 0 100 55"
        preserveAspectRatio="none"
        role="img"
        aria-label="近半年握力趋势，单位为N"
      >
        <polyline className="grip-report__trend-line" points={polyline} />
        {points.map((point) => (
          <g key={point.label}>
            <circle className="grip-report__trend-point" cx={point.x} cy={point.y} r="1.7" />
            <text className="grip-report__trend-label" x={point.x} y="52">{point.label}</text>
          </g>
        ))}
      </svg>
    </article>
  );
}
