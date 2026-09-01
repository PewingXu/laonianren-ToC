const DEFAULT_BANDS = ['低', '一般', '良好', '优秀'];

/**
 * 最大握力分级仪表盘。
 *
 * 交付包原版把「良好」写死成 <strong> 高亮 —— 不管实测多少，页面永远
 * 高亮良好。现在由 metric.chartBands / chartActiveBand 驱动：
 * 档位来自 AWGS 2019 切点换算出的 R 值分档（见 gripReportEnrich.js）。
 * 拿不到这两个字段时退回原来的静态四档，只是不再高亮任何一档，
 * 避免在数据不足时给出误导性的结论。
 */
export function GripGauge({ metric }) {
  const arcLength = 125.6;
  const dashOffset = metric.chartValue === null
    ? arcLength
    : arcLength * (1 - metric.chartValue / 100);

  const bands = Array.isArray(metric.chartBands) && metric.chartBands.length === 4
    ? metric.chartBands
    : DEFAULT_BANDS;
  const activeBand = metric.chartActiveBand || '';

  return (
    <div className="grip-report__gauge" role="img" aria-label={
      activeBand ? `最大握力分级：${activeBand}` : '最大握力分级仪表盘'
    }>
      <svg viewBox="0 0 100 50" aria-hidden="true">
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke="var(--grip-line)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke="var(--grip-green)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={arcLength}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div>
        {bands.map((band) => (
          band === activeBand
            ? <strong key={band}>{band}</strong>
            : <span key={band}>{band}</span>
        ))}
      </div>
    </div>
  );
}
