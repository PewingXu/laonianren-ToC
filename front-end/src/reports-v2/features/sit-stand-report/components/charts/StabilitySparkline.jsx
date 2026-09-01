function chartPoints(values) {
  if (values.length === 0) return [];

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = maximum - minimum;
  return values.map((value, index) => {
    const x = values.length === 1 ? 110 : 14 + (193 * index) / (values.length - 1);
    const y = spread === 0 ? 68 : 104 - ((value - minimum) / spread) * 72;
    return { x: Math.round(x), y: Math.round(y) };
  });
}

export function StabilitySparkline({ metric }) {
  const points = chartPoints(metric.chartValues);
  const isRising = metric.chartValues.length > 1
    && metric.chartValues.at(-1) > metric.chartValues[0];
  const label = metric.value === null
    ? '稳定性数据不足'
    : `稳定性得分 ${metric.value} 分，${isRising ? '呈上升趋势' : '趋势平稳'}`;

  return (
    <svg
      className="sit-stand-report__stability-chart"
      viewBox="0 0 220 140"
      role="img"
      aria-label={label}
    >
      {points.length > 0 ? (
        <>
          <polyline
            data-testid="stability-line"
            data-values={metric.chartValues.join(',')}
            points={points.map(({ x, y }) => `${x},${y}`).join(' ')}
          />
          <g>
            {points.map(({ x, y }, index) => (
              <circle key={`${x}-${y}-${index}`} cx={x} cy={y} r="4" />
            ))}
          </g>
        </>
      ) : null}
    </svg>
  );
}
