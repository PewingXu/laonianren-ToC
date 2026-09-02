import {
  Activity,
  Fingerprint,
  Gauge,
  Hand,
  Maximize2,
  Timer,
  Waves,
} from 'lucide-react';

/**
 * 二级指标条。
 *
 * 为什么单独做一块，而不是塞进「核心指标」那四张大卡
 * ---------------------------------------------------------------
 * 那四张是结论性指标（最大握力/握持均值/左右差异/保持率），每张都带
 * 分档、图表和参考线，是给人「看结果」的。这里这些是过程性指标
 * （发力多快、握了多久、抖了几次、手掌出多少力），单条信息量小，
 * 做成同样大的卡片会稀释主卡的视觉权重，也把页面拉得很长。
 *
 * 所以用一行紧凑格子承载：数值大、说明小，一眼扫过去即可。
 *
 * toB 报告里那 13 项「时间与抖动分析」没有全搬 —— 检测阈值、平均角速度、
 * 峰值区间起止这些是调试用的工程量，对读报告的老人没有解读价值。
 */

const ICONS = {
  timeToPeak: Gauge,
  gripDuration: Timer,
  shake: Waves,
  contactArea: Maximize2,
  palmShare: Hand,
  strongestFinger: Fingerprint,
  cv: Activity,
};

export function GripSecondaryMetrics({ metrics }) {
  const items = Array.isArray(metrics) ? metrics : [];
  if (items.length === 0) return null;

  return (
    <section
      className="grip-report__secondary-section"
      aria-labelledby="grip-secondary-title"
    >
      <h3 id="grip-secondary-title">更多测量数据</h3>
      <div className="grip-report__secondary-grid">
        {items.map((item) => {
          const Icon = ICONS[item.id] || Activity;
          return (
            <article
              key={item.id}
              className="grip-report__secondary-card"
              data-tone={item.tone}
            >
              <div className="grip-report__secondary-head">
                <span className="grip-report__secondary-icon" aria-hidden="true">
                  <Icon />
                </span>
                <h4>{item.label}</h4>
              </div>
              <p className="grip-report__secondary-value">
                <strong>{item.value}</strong>
                {item.unit ? <span>{item.unit}</span> : null}
              </p>
              {item.note ? <p className="grip-report__secondary-note">{item.note}</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
