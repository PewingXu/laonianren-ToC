function needlePath(position) {
  const safePosition = position ?? 50;
  const angle = Math.PI * (1 - safePosition / 100);
  const x = 110 + Math.cos(angle) * 58;
  const y = 87 - Math.sin(angle) * 58;
  return `M110 87 ${x.toFixed(1)} ${y.toFixed(1)}`;
}

export function SpeedGauge({ metric }) {
  const hasPosition = metric.chartValue !== null;
  const label = metric.value === null
    ? '起身速度数据不足'
    : `起身速度位于${metric.status}区间，${metric.value}${metric.unit}`;

  return (
    <svg
      className="sit-stand-report__speed-gauge"
      viewBox="0 0 220 150"
      role="img"
      aria-label={label}
      data-position={hasPosition ? metric.chartValue : ''}
    >
      <defs>
        <linearGradient id="sitStandSpeedArc" x1="0" x2="1">
          <stop offset="0" stopColor="#8fb796" />
          <stop offset=".58" stopColor="#4d8d54" />
          <stop offset="1" stopColor="#286834" />
        </linearGradient>
      </defs>
      <path className="sit-stand-report__gauge-track" d="M24 87A86 86 0 0 1 196 87" />
      <path className="sit-stand-report__gauge-active" d="M24 87A86 86 0 0 1 196 87" />
      {hasPosition ? (
        <>
          <path className="sit-stand-report__gauge-needle" d={needlePath(metric.chartValue)} />
          <circle className="sit-stand-report__gauge-center" cx="110" cy="87" r="7" />
        </>
      ) : null}
      <text x="21" y="119">偏慢</text>
      <text x="101" y="119">一般</text>
      <text x="188" y="119">优秀</text>
    </svg>
  );
}
