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

/**
 * 单侧读数。缺测时显示「未测」而不是 0 或 --，
 * 避免看成「测出来是 0」。
 */
function HandValue({ side, value, unit, isText }) {
  const missing = value === null || value === undefined;
  return (
    <div className="grip-report__secondary-hand" data-side={side}>
      <span className="grip-report__secondary-hand-label">
        {side === 'left' ? '左手' : '右手'}
      </span>
      {missing ? (
        <span className="grip-report__secondary-hand-missing">未测</span>
      ) : (
        <span className="grip-report__secondary-hand-value">
          <strong>{value}</strong>
          {!isText && unit ? <small>{unit}</small> : null}
        </span>
      )}
    </div>
  );
}

export function GripSecondaryMetrics({ metrics }) {
  const items = Array.isArray(metrics) ? metrics : [];
  if (items.length === 0) return null;

  return (
    <section
      className="grip-report__secondary-section"
      aria-labelledby="grip-secondary-title"
    >
      <div className="grip-report__secondary-header">
        <h3 id="grip-secondary-title">更多测量数据</h3>
        {/* 与六区域力量图同一套左右配色，读者不用重新学一遍 */}
        <div className="grip-report__secondary-legend" aria-hidden="true">
          <span><i data-side="left" />左手</span>
          <span><i data-side="right" />右手</span>
        </div>
      </div>
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
              <div className="grip-report__secondary-values">
                <HandValue side="left" value={item.left} unit={item.unit} isText={item.isText} />
                <HandValue side="right" value={item.right} unit={item.unit} isText={item.isText} />
              </div>
              {item.note ? <p className="grip-report__secondary-note">{item.note}</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
