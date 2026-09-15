/**
 * 起身速度仪表盘。结构照握力的 GripGauge：
 *   一个 180° 圆弧（底轨 + 进度弧）+ 下方四个档位标签，当前档位高亮。
 *
 * 之前是 220×150 的大表盘带指针，且 CSS 重写时把 stroke/fill 规则丢了，
 * SVG <path> 默认 fill:black，整个半圆渲染成一块黑 —— 就是你截图里那个。
 * 现在改成和握力同一套画法，样式共用 .sit-stand-report__gauge 那组规则。
 *
 * 档位切点与 sitStandReportEnrich.speedBand 一致（≤6s 很好 / ≤7.2s 不错 /
 * ≤9s 一般 / ≤12s 偏慢 / 更慢 慢），这里只显示 4 档标签，把「很好」「不错」
 * 合并到「优秀」「良好」的语义位上，跟握力的四档（低/一般/良好/优秀）对齐。
 */
const BANDS = ['慢', '偏慢', '一般', '良好'];

function activeBand(status) {
  if (status === '很好' || status === '不错') return '良好';
  if (status === '一般') return '一般';
  if (status === '偏慢') return '偏慢';
  if (status === '慢') return '慢';
  return '';
}

export function SpeedGauge({ metric }) {
  const arcLength = 125.6;
  const dashOffset = metric.chartValue === null
    ? arcLength
    : arcLength * (1 - metric.chartValue / 100);
  const active = activeBand(metric.status);
  const label = metric.value === null
    ? '起身速度数据不足'
    : `起身速度 ${metric.value}${metric.unit}，${metric.status}`;

  return (
    <div className="sit-stand-report__gauge" role="img" aria-label={label}>
      <svg viewBox="0 0 100 50" aria-hidden="true">
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke="var(--sit-line)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke="var(--sit-green)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={arcLength}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div>
        {BANDS.map((band) => (
          band === active
            ? <strong key={band}>{band}</strong>
            : <span key={band}>{band}</span>
        ))}
      </div>
    </div>
  );
}
