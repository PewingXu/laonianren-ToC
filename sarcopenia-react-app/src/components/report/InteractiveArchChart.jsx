import { useRef, useEffect, useState, useCallback } from 'react';

const REGION_COLORS = [
  'rgba(65, 105, 225, 0.7)',
  'rgba(50, 205, 50, 0.7)',
  'rgba(255, 165, 0, 0.7)',
  'rgba(220, 20, 60, 0.7)',
];
const REGION_COLORS_HOVER = [
  'rgba(65, 105, 225, 0.95)',
  'rgba(50, 205, 50, 0.95)',
  'rgba(255, 165, 0, 0.95)',
  'rgba(220, 20, 60, 0.95)',
];
const REGION_NAMES = ['趾部', '前足', '中足', '后足'];
const SPACING_MM = 7;

function normalizeSectionCoords(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const keys = Object.keys(raw).sort((a, b) => Number(a) - Number(b));
    return keys.map((k) => raw[k]);
  }
  return [[], [], [], []];
}

/**
 * 计算坐标的紧凑边界（去掉离群点）
 * 使用连通域分析，只保留最大的连通区域
 */
function getTightBounds(allCoords) {
  if (allCoords.length === 0) return { minR: 0, maxR: 0, minC: 0, maxC: 0 };

  // 建立坐标集合用于快速查找
  const coordSet = new Set(allCoords.map(([r, c]) => `${r},${c}`));

  // BFS 找连通域
  const visited = new Set();
  const components = [];

  for (const [r, c] of allCoords) {
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    const queue = [[r, c]];
    visited.add(key);
    const component = [];
    while (queue.length > 0) {
      const [cr, cc] = queue.shift();
      component.push([cr, cc]);
      for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const nr = cr + dr, nc = cc + dc;
        const nk = `${nr},${nc}`;
        if (coordSet.has(nk) && !visited.has(nk)) {
          visited.add(nk);
          queue.push([nr, nc]);
        }
      }
    }
    components.push(component);
  }

  // 只保留最大的连通域来计算边界
  components.sort((a, b) => b.length - a.length);
  const mainComponent = components[0] || allCoords;

  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  for (const [r, c] of mainComponent) {
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  }
  return { minR, maxR, minC, maxC };
}

function getBounds(coords) {
  if (coords.length === 0) return { minR: 0, maxR: 0, minC: 0, maxC: 0 };
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  for (const [r, c] of coords) {
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  }
  return { minR, maxR, minC, maxC };
}

/**
 * 绘制单只脚的区域图 — 独立缩放，充满自己的半区
 */
function drawFoot(ctx, sections, offsetX, width, canvasH, hoveredRegion, title, tightBounds) {
  const allCoords = sections.flat();
  if (allCoords.length === 0) return;

  // 使用紧凑边界（去掉离群噪音点）
  const bounds = tightBounds || getBounds(allCoords);
  const rowSpan = bounds.maxR - bounds.minR + 1;
  const colSpan = bounds.maxC - bounds.minC + 1;

  const padX = 4;
  const padY = 4;
  const titleH = 20;
  const labelW = 50;
  const drawW = width - padX * 2 - labelW;
  const drawH = canvasH - titleH - padY * 2;

  // 独立计算 scale，让脚充满绘图区域
  const scale = Math.min(drawW / colSpan, drawH / rowSpan);
  const footW = colSpan * scale;
  const footH = rowSpan * scale;
  const cx = offsetX + padX + (drawW - footW) / 2;
  const cy = titleH + padY + (drawH - footH) / 2;

  // 标题
  ctx.fillStyle = '#333';
  ctx.font = 'bold 14px "Noto Sans SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, offsetX + width / 2, 16);

  // 绘制每个区域的点
  const cellSize = Math.max(scale * 0.92, 2);
  for (let i = 0; i < sections.length; i++) {
    const isHovered = hoveredRegion === i;
    ctx.fillStyle = isHovered ? REGION_COLORS_HOVER[i] : REGION_COLORS[i];
    for (const [r, c] of sections[i]) {
      // 裁剪掉超出紧凑边界的离群点
      if (r < bounds.minR || r > bounds.maxR || c < bounds.minC || c > bounds.maxC) continue;
      const px = cx + (c - bounds.minC) * scale;
      const py = cy + (r - bounds.minR) * scale;
      ctx.fillRect(px - cellSize / 2, py - cellSize / 2, cellSize, cellSize);
    }
  }

  // 区域分界线 — 基于实际脚的行范围
  const ratios = [3, 4, 4, 4];
  const totalRatio = 15;
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
  ctx.setLineDash([6, 3]);
  ctx.lineWidth = 1.5;
  let cumRatio = 0;
  for (let i = 0; i < ratios.length - 1; i++) {
    cumRatio += ratios[i];
    const by = cy + (cumRatio / totalRatio) * footH;
    ctx.beginPath();
    ctx.moveTo(cx - 3, by);
    ctx.lineTo(cx + footW + 3, by);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // 区域标签（右侧）
  cumRatio = 0;
  ctx.font = '10px "Noto Sans SC", sans-serif';
  ctx.textAlign = 'left';
  const labelX = cx + footW + 4;
  for (let i = 0; i < ratios.length; i++) {
    const startR = cumRatio;
    cumRatio += ratios[i];
    const midY = cy + ((startR + cumRatio) / 2 / totalRatio) * footH;
    const text = `${REGION_NAMES[i]}(${sections[i].length})`;
    ctx.fillStyle = REGION_COLORS[i].replace(/[\d.]+\)$/, '1)');
    ctx.fillText(text, labelX, midY + 4);
  }
}

export default function InteractiveArchChart({ leftSectionCoords, rightSectionCoords }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  const leftSections = normalizeSectionCoords(leftSectionCoords);
  const rightSections = normalizeSectionCoords(rightSectionCoords);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const halfW = rect.width / 2;

    // 使用紧凑边界（去掉离群噪音点）
    const leftAll = leftSections.flat();
    const rightAll = rightSections.flat();
    const leftTightBounds = getTightBounds(leftAll);
    const rightTightBounds = getTightBounds(rightAll);

    // 取两只脚中较大的行列范围来决定画布高度
    const leftRowSpan = leftAll.length > 0 ? leftTightBounds.maxR - leftTightBounds.minR + 1 : 0;
    const rightRowSpan = rightAll.length > 0 ? rightTightBounds.maxR - rightTightBounds.minR + 1 : 0;
    const leftColSpan = leftAll.length > 0 ? leftTightBounds.maxC - leftTightBounds.minC + 1 : 0;
    const rightColSpan = rightAll.length > 0 ? rightTightBounds.maxC - rightTightBounds.minC + 1 : 0;
    const maxRowSpan = Math.max(leftRowSpan, rightRowSpan) || 1;
    const maxColSpan = Math.max(leftColSpan, rightColSpan) || 1;

    // 画布高度 = 让脚能充满宽度时所需的高度（无上限）
    const padX = 4; const titleH = 20; const padY = 4; const labelW = 50;
    const drawW = halfW - padX * 2 - labelW;
    const scaleByW = drawW / maxColSpan;
    const neededH = titleH + padY * 2 + maxRowSpan * scaleByW;
    const canvasH = Math.min(Math.max(neededH, 300), 480);

    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${canvasH}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, canvasH);
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, rect.width, canvasH);

    drawFoot(ctx, leftSections, 0, halfW, canvasH,
      hoveredRegion?.side === 'left' ? hoveredRegion.index : null, '左脚', leftTightBounds);
    drawFoot(ctx, rightSections, halfW, halfW, canvasH,
      hoveredRegion?.side === 'right' ? hoveredRegion.index : null, '右脚', rightTightBounds);

    // 中间分隔线
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(halfW, 10);
    ctx.lineTo(halfW, canvasH - 10);
    ctx.stroke();
  }, [leftSections, rightSections, hoveredRegion]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const canvasRect = canvas.getBoundingClientRect();
    const mx = e.clientX - canvasRect.left;
    const my = e.clientY - canvasRect.top;
    const halfW = canvasRect.width / 2;
    const side = mx < halfW ? 'left' : 'right';
    const sections = side === 'left' ? leftSections : rightSections;
    const allCoords = sections.flat();
    if (allCoords.length === 0) { setHoveredRegion(null); setTooltip(null); return; }

    const bounds = getTightBounds(allCoords);
    const rowSpan = bounds.maxR - bounds.minR + 1;
    const colSpan = bounds.maxC - bounds.minC + 1;

    const padX = 4; const titleH = 20; const padY = 4; const labelW = 50;
    const oX = side === 'right' ? halfW : 0;
    const drawW = halfW - padX * 2 - labelW;
    const drawH = canvasRect.height - titleH - padY * 2;
    const scale = Math.min(drawW / colSpan, drawH / rowSpan);
    const footW = colSpan * scale;
    const footH = rowSpan * scale;
    const cx = oX + padX + (drawW - footW) / 2;
    const cy = titleH + padY + (drawH - footH) / 2;

    const dataC = (mx - cx) / scale + bounds.minC;
    const dataR = (my - cy) / scale + bounds.minR;

    let bestDist = Infinity;
    let bestRegion = -1;
    for (let i = 0; i < sections.length; i++) {
      for (const [r, c] of sections[i]) {
        const d = (r - dataR) ** 2 + (c - dataC) ** 2;
        if (d < bestDist) { bestDist = d; bestRegion = i; }
      }
    }

    if (bestDist > 9) { setHoveredRegion(null); setTooltip(null); return; }

    setHoveredRegion({ side, index: bestRegion });
    const totalPoints = sections.reduce((s, r) => s + r.length, 0);
    const pts = sections[bestRegion].length;
    const areaCm2 = pts * SPACING_MM * SPACING_MM / 100;
    const areaPercent = totalPoints > 0 ? (pts / totalPoints) * 100 : 0;
    setTooltip({
      x: e.clientX - canvasRect.left, y: e.clientY - canvasRect.top,
      regionIndex: bestRegion, side, pointCount: pts,
      areaCm2: Math.round(areaCm2 * 10) / 10, areaPercent: Math.round(areaPercent * 10) / 10,
    });
  }, [leftSections, rightSections]);

  const handleMouseLeave = useCallback(() => { setHoveredRegion(null); setTooltip(null); }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      <canvas ref={canvasRef} className="w-full rounded-lg cursor-crosshair"
        onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} />
      {tooltip && (
        <div className="absolute pointer-events-none z-10 bg-white/95 border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm"
          style={{ left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth || 400) - 180), top: tooltip.y - 70 }}>
          <div className="font-semibold" style={{ color: REGION_COLORS[tooltip.regionIndex].replace(/[\d.]+\)$/, '1)') }}>
            {tooltip.side === 'left' ? '左脚' : '右脚'} · {REGION_NAMES[tooltip.regionIndex]}
          </div>
          <div className="text-gray-600 mt-1">面积: {tooltip.areaCm2} cm² ({tooltip.areaPercent}%)</div>
          <div className="text-gray-600">采样点: {tooltip.pointCount} 个</div>
        </div>
      )}
      <div className="flex items-center justify-center gap-4 mt-3">
        {REGION_NAMES.map((name, i) => (
          <div key={name} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: REGION_COLORS[i] }} />
            {name}
          </div>
        ))}
      </div>
    </div>
  );
}
