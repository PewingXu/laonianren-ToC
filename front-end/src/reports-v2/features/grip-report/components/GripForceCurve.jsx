/**
 * 握力全程曲线（左右手同轴）。
 *
 * 为什么手写 SVG 而不是引图表库
 * ---------------------------------------------------------------
 * 交付包里所有图表（仪表盘、差异环、耐力线、六区域条）都是手写 SVG，
 * 视觉语言统一且不带第三方样式。toB 那套用的是 ECharts，默认样式
 * （直角网格、深色轴线、方块图例）与这套柔和圆角的设计语言冲突，
 * 而且主包已经 2.9MB，不值得为一张图再引一个库。
 *
 * 只画「总力」一条，不画各手指堆叠 —— 六区域力量那张图已经把分区
 * 讲清楚了，再叠 6 条线是噪音。
 *
 * 也不画欧拉角/角速度：前端算法链路里那两组是 Math.random() 造的
 * 正弦波（gripReportGenerator.js:186-188），画出来是假数据。
 */

const VIEW_W = 720;
const VIEW_H = 240;
const PAD = { top: 18, right: 16, bottom: 28, left: 44 };

const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;

function scaleX(t, maxT) {
  return PAD.left + (maxT > 0 ? (t / maxT) * PLOT_W : 0);
}

function scaleY(f, maxF) {
  return PAD.top + PLOT_H - (maxF > 0 ? (f / maxF) * PLOT_H : 0);
}

function linePath(points, maxT, maxF) {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.t, maxT).toFixed(1)} ${scaleY(p.f, maxF).toFixed(1)}`)
    .join(' ');
}

/** 面积路径：折线 + 落到基线再闭合 */
function areaPath(points, maxT, maxF) {
  if (points.length === 0) return '';
  const baseline = PAD.top + PLOT_H;
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath(points, maxT, maxF)} L ${scaleX(last.t, maxT).toFixed(1)} ${baseline} `
    + `L ${scaleX(first.t, maxT).toFixed(1)} ${baseline} Z`;
}

function Curve({ side, curve, maxT, maxF }) {
  if (!curve) return null;
  const color = side === 'left' ? 'var(--grip-blue)' : 'var(--grip-orange)';

  return (
    <g>
      <path d={areaPath(curve.points, maxT, maxF)} fill={`url(#grip-curve-${side})`} />
      <path
        d={linePath(curve.points, maxT, maxF)}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {curve.peak ? (
        <circle
          cx={scaleX(curve.peak.t, maxT)}
          cy={scaleY(curve.peak.f, maxF)}
          r="4"
          fill="#fff"
          stroke={color}
          strokeWidth="2.5"
        />
      ) : null}
    </g>
  );
}

export function GripForceCurve({ curve }) {
  if (!curve) return null;

  const maxT = curve.maxDuration;
  // Y 轴顶端留 8% 余量，峰值点不会贴着上边缘
  const maxF = curve.maxForce * 1.08;

  // 横轴刻度：按实际时长取 5 档，标签是真实秒数
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
    x: PAD.left + r * PLOT_W,
    label: `${(maxT * r).toFixed(1)}s`,
  }));
  // 纵轴三条参考线：0 / 一半 / 峰值
  const yTicks = [0, curve.maxForce / 2, curve.maxForce].map((f) => ({
    y: scaleY(f, maxF),
    label: Math.round(f),
  }));

  return (
    <article className="grip-report__analysis-card grip-report__curve-card">
      <div className="grip-report__curve-header">
        <div>
          <h3>握力全程曲线</h3>
          <p>从开始用力到松开，力气是怎么变化的</p>
        </div>
        <div className="grip-report__curve-legend" aria-hidden="true">
          {curve.left ? <span><i data-side="left" />左手</span> : null}
          {curve.right ? <span><i data-side="right" />右手</span> : null}
        </div>
      </div>

      <svg
        className="grip-report__curve-svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        /* 不用 preserveAspectRatio="none"：那样横向拉伸会把线宽和轴标签一起拉变形 */
        role="img"
        aria-label={`握力全程曲线，最大 ${curve.maxForce} ${curve.unit}，历时 ${maxT} 秒`}
      >
        <defs>
          <linearGradient id="grip-curve-left" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--grip-blue)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--grip-blue)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="grip-curve-right" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--grip-orange)" stopOpacity="0.24" />
            <stop offset="100%" stopColor="var(--grip-orange)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {yTicks.map((tick) => (
          <g key={`y-${tick.label}`}>
            <line
              className="grip-report__curve-gridline"
              x1={PAD.left}
              y1={tick.y}
              x2={VIEW_W - PAD.right}
              y2={tick.y}
            />
            <text className="grip-report__curve-axis-label" x={PAD.left - 8} y={tick.y + 4} textAnchor="end">
              {tick.label}
            </text>
          </g>
        ))}

        <Curve side="left" curve={curve.left} maxT={maxT} maxF={maxF} />
        <Curve side="right" curve={curve.right} maxT={maxT} maxF={maxF} />

        {ticks.map((tick) => (
          <text
            key={`x-${tick.label}`}
            className="grip-report__curve-axis-label"
            x={tick.x}
            y={VIEW_H - 8}
            textAnchor="middle"
          >
            {tick.label}
          </text>
        ))}
      </svg>

      <p className="grip-report__curve-note">
        纵轴是力（{curve.unit}），横轴是时间。空心圆点是这只手的最大值出现的位置。
      </p>
    </article>
  );
}
