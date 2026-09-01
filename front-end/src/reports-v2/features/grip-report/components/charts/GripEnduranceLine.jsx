function buildPoints(values) {
  if (values.length !== 5) return [];
  return values.map((value, index) => ({
    x: index * 25,
    y: 38 - (value / 100) * 30,
  }));
}

export function GripEnduranceLine({ metric }) {
  const points = buildPoints(metric.chartValues);
  const path = points.map((point, index) => (
    `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  )).join(' ');

  return (
    <div className="grip-report__endurance-line" role="img" aria-label="60秒握力耐力变化">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
        {path ? <path d={path} fill="none" stroke="var(--grip-purple)" strokeWidth="2" /> : null}
        {points.map((point) => (
          <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="1.6" fill="var(--grip-purple)" />
        ))}
      </svg>
      <div>
        {metric.chartLabels.map((label) => <span key={label}>{label}</span>)}
      </div>
    </div>
  );
}
