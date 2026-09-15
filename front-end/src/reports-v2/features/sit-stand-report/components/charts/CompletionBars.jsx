/**
 * 动作完成度：要求的 3 次各一根柱，做完满高、没做的空。
 *
 * 之前需要正好 5 个百分比值，凑不出来就空白。现在一次一根，
 * 只做了 2 次就是两根满、一根底座，比光写「67%」直观。
 * 结构和样式照握力的 GripTrialBars。
 */
export function CompletionBars({ metric }) {
  const values = Array.isArray(metric.chartValues) ? metric.chartValues : [];
  const labels = Array.isArray(metric.chartLabels) ? metric.chartLabels : [];
  const label = metric.value === null ? '动作完成度数据不足' : `动作完成度 ${metric.value}%`;

  if (values.length === 0) {
    return <div className="sit-stand-report__trial-bars" role="img" aria-label={label} />;
  }

  return (
    <div className="sit-stand-report__trial-bars" role="img" aria-label={label}>
      {values.map((value, index) => {
        const done = value >= 99;
        return (
          <div className="sit-stand-report__trial-bar" key={labels[index] || index}>
            <span>{done ? '✓' : '—'}</span>
            <i
              style={{ height: done ? '72px' : '18px' }}
              aria-hidden="true"
              data-tone={done ? 'purple' : 'empty'}
            />
            <small>{labels[index] || `第${index + 1}次`}</small>
          </div>
        );
      })}
    </div>
  );
}
