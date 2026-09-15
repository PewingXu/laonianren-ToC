/**
 * 起身稳定性：三根柱子，一次一根，柱高 = 这次耗时 / 最慢一次。
 *
 * 之前是一条需要正好 6 个点的折线，本系统只有 3 次周期，凑不满
 * mapper 就丢弃 → 图表区一片空白。「稳定性」本来就是看三次快慢差多少，
 * 三根高矮不一的柱子比一条趋势线更直接。
 *
 * 结构和样式照握力的 GripTrialBars（.grip-report__trial-bar），
 * 柱顶标原始秒数而不是百分比 —— 老人看得懂「2.1 秒」，看不懂「87%」。
 */
export function StabilitySparkline({ metric }) {
  const values = Array.isArray(metric.chartValues) ? metric.chartValues : [];
  const labels = Array.isArray(metric.chartLabels) ? metric.chartLabels : [];
  const seconds = Array.isArray(metric.chartSeconds) ? metric.chartSeconds : [];
  const label = metric.value === null
    ? '稳定性数据不足'
    : `稳定性得分 ${metric.value} 分`;

  if (values.length === 0) {
    return <div className="sit-stand-report__trial-bars" role="img" aria-label={label} />;
  }

  return (
    <div className="sit-stand-report__trial-bars" role="img" aria-label={label}>
      {values.map((value, index) => {
        const height = `${Math.max(18, (value / 100) * 72)}px`;
        const sec = seconds[index];
        return (
          <div className="sit-stand-report__trial-bar" key={labels[index] || index}>
            <span>{Number.isFinite(sec) ? `${sec}s` : '--'}</span>
            <i style={{ height }} aria-hidden="true" data-tone="orange" />
            <small>{labels[index] || `第${index + 1}次`}</small>
          </div>
        );
      })}
    </div>
  );
}
