export function CompletionBars({ metric }) {
  const label = metric.value === null ? '动作完成度数据不足' : `动作完成度 ${metric.value}%`;

  return (
    <svg
      className="sit-stand-report__completion-chart"
      viewBox="0 0 220 140"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id="sitStandCompletionBars" x1="0" x2="1">
          <stop offset="0" stopColor="#f5f0f7" />
          <stop offset="1" stopColor="#a689b5" />
        </linearGradient>
      </defs>
      {metric.chartValues.map((value, index) => {
        const height = Math.round((value / 100) * 84);
        return (
          <rect
            key={`${value}-${index}`}
            data-testid="completion-bar"
            data-value={value}
            x={10 + index * 40}
            y={112 - height}
            width={index === metric.chartValues.length - 1 ? 36 : 34}
            height={height}
          />
        );
      })}
    </svg>
  );
}
