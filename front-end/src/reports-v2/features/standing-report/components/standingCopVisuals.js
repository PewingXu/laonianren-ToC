/**
 * 站立报告 COP 轨迹的纯几何计算。
 *
 * 拆成独立模块是为了能脱离 React 单测——与步态报告的
 * gait-report/components/gaitFootprintVisuals.js 保持同一套做法。
 */

export const COP_PLOT_ORIGIN = 145;
export const COP_PLOT_SIZE = 130;

/**
 * 把左右脚 COP 点归一化到图示方框内，并按脚分段生成 SVG path。
 *
 * 左右脚会被画进同一个归一化范围，因此两脚的横向间距会挤压各自的摆动幅度；
 * 这是图示中心与"自动缩放参考区"的既定语义，不在这里做每脚独立缩放。
 */
export function copTrajectoryPath(points) {
  if (!Array.isArray(points) || points.length === 0) return '';

  const allX = points.map((point) => point.x);
  const allY = points.map((point) => point.y);
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);
  const xRange = maxX - minX || 1;
  const yRange = maxY - minY || 1;

  const mapped = points.map((point) => ({
    x: COP_PLOT_ORIGIN + ((point.x - minX) / xRange) * COP_PLOT_SIZE,
    y: COP_PLOT_ORIGIN + ((point.y - minY) / yRange) * COP_PLOT_SIZE,
    side: point.side,
  }));

  const segments = [];
  for (const point of mapped) {
    const current = segments[segments.length - 1];
    if (!current || current[0].side !== point.side) segments.push([point]);
    else current.push(point);
  }

  return segments.map((segment) => {
    if (segment.length === 1) {
      // 裸 moveto 在 SVG 里什么都不画，只有一个采样点的那只脚会静默消失。
      // 零长子路径配合 stroke-linecap: round 才能渲染成一个圆点。
      const only = segment[0];
      return `M${only.x.toFixed(1)} ${only.y.toFixed(1)}L${only.x.toFixed(1)} ${only.y.toFixed(1)}`;
    }
    return segment.slice(0, -1).reduce((path, point, index) => {
      const previous = segment[index - 1] || point;
      const next = segment[index + 1];
      const following = segment[index + 2] || next;
      const controlOne = {
        x: point.x + (next.x - previous.x) / 6,
        y: point.y + (next.y - previous.y) / 6,
      };
      const controlTwo = {
        x: next.x - (following.x - point.x) / 6,
        y: next.y - (following.y - point.y) / 6,
      };

      return `${path} C${controlOne.x.toFixed(1)} ${controlOne.y.toFixed(1)} ${controlTwo.x.toFixed(1)} ${controlTwo.y.toFixed(1)} ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
    }, `M${segment[0].x.toFixed(1)} ${segment[0].y.toFixed(1)}`);
  }).join(' ');
}
