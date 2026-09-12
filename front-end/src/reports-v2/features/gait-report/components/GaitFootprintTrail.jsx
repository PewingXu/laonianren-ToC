import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Footprints } from 'lucide-react';
import { bilinearUpsample } from '../../../../components/ui/heatmapUtils';
import {
  FOOTPRINT_PADDING_CELLS,
  footprintBounds,
  footprintDrawRect,
  gaussianBlurField,
  orderedMeasuredSteps,
  padFootprintStep,
  pressureAlpha,
  pressureColor,
  projectSensorCenter,
  trailProgressColor,
  walkingDirectionSign,
} from './gaitFootprintVisuals';

const LEFT_TONE = '#487bb4';
const RIGHT_TONE = '#d36f39';
const BASELINE_TONE = '#8f978f';
const HEATMAP_UPSAMPLE = 8;
const HEATMAP_BLUR_SENSOR_SIGMA = 0.55;
const MAX_INTERPOLATED_PIXELS = 160000;
const TRAIL_DASH = [5, 6];

function rgb(color) {
  return `rgb(${color.join(', ')})`;
}

function pressureCeiling(steps) {
  const values = steps
    .flatMap((step) => step.matrix.flat())
    .filter((value) => value > 0)
    .sort((left, right) => left - right);
  if (!values.length) return 1;
  return values[Math.min(values.length - 1, Math.floor(values.length * 0.95))] || 1;
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, width, height, radius);
    return;
  }

  const boundedRadius = Math.min(radius, width / 2, height / 2);
  context.moveTo(x + boundedRadius, y);
  context.lineTo(x + width - boundedRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + boundedRadius);
  context.lineTo(x + width, y + height - boundedRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - boundedRadius,
    y + height,
  );
  context.lineTo(x + boundedRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - boundedRadius);
  context.lineTo(x, y + boundedRadius);
  context.quadraticCurveTo(x, y, x + boundedRadius, y);
  context.closePath();
}

function drawFootprint(context, step, layout, ceiling) {
  const rows = step.matrix.length;
  const columns = step.matrix[0].length;
  const boundedUpsample = Math.max(1, Math.min(
    HEATMAP_UPSAMPLE,
    Math.floor(Math.sqrt(MAX_INTERPOLATED_PIXELS / (rows * columns))),
  ));
  const heatmapRows = rows * boundedUpsample;
  const heatmapColumns = columns * boundedUpsample;
  const interpolated = bilinearUpsample(step.matrix, heatmapRows, heatmapColumns);
  const heatmap = gaussianBlurField(
    interpolated,
    heatmapColumns,
    heatmapRows,
    boundedUpsample * HEATMAP_BLUR_SENSOR_SIGMA,
  );
  const offscreen = document.createElement('canvas');
  // The walkway is rotated for the report: sensor rows run left-to-right and
  // sensor columns run top-to-bottom. Both axes still use the same scale.
  offscreen.width = heatmapRows;
  offscreen.height = heatmapColumns;
  const offscreenContext = offscreen.getContext('2d');
  if (!offscreenContext) return;
  const image = offscreenContext.createImageData(heatmapRows, heatmapColumns);
  const maximumAlpha = step.isBaseline ? 180 : 235;

  for (let row = 0; row < heatmapRows; row += 1) {
    for (let column = 0; column < heatmapColumns; column += 1) {
      const value = heatmap[(row * heatmapColumns) + column];
      const amount = Math.min(1, value / ceiling);
      const alpha = pressureAlpha(amount, maximumAlpha);
      if (!alpha) continue;
      const [red, green, blue] = pressureColor(amount);
      const targetRow = layout.forwardSign < 0 ? heatmapRows - 1 - row : row;
      const index = ((column * heatmapRows) + targetRow) * 4;
      image.data[index] = red;
      image.data[index + 1] = green;
      image.data[index + 2] = blue;
      image.data[index + 3] = alpha;
    }
  }
  offscreenContext.putImageData(image, 0, 0);

  const rect = footprintDrawRect(step, layout);
  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    offscreen,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
  );
  context.restore();
}

function drawStepBadge(context, step, layout, chartHeight) {
  const { x: centerX, y: centerY } = projectSensorCenter(step.center, layout);
  const outsideOffset = step.isBaseline ? 0 : (step.isRight ? 26 : -26);
  const badgeY = Math.max(18, Math.min(chartHeight - 18, centerY + outsideOffset));
  const fill = step.isBaseline ? BASELINE_TONE : (step.isRight ? RIGHT_TONE : LEFT_TONE);

  context.save();
  context.beginPath();
  context.moveTo(centerX, centerY);
  context.lineTo(centerX, badgeY);
  context.strokeStyle = `${fill}80`;
  context.lineWidth = 1;
  context.stroke();

  context.beginPath();
  context.arc(centerX, badgeY, 11, 0, Math.PI * 2);
  context.fillStyle = fill;
  context.fill();
  context.fillStyle = '#fff';
  context.font = '700 10px "Microsoft YaHei", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(step.isBaseline ? '起' : String(step.stepIndex), centerX, badgeY + 0.5);
  context.restore();
}

function FootprintCanvas({ trail }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const renderSteps = useMemo(
    () => trail.steps.map((step) => padFootprintStep(step)),
    [trail.steps],
  );
  const bounds = useMemo(() => footprintBounds(renderSteps), [renderSteps]);
  const ceiling = useMemo(() => pressureCeiling(trail.steps), [trail.steps]);
  const forwardSign = useMemo(() => walkingDirectionSign(trail.steps), [trail.steps]);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const container = containerRef.current;
    const updateWidth = (width = container.getBoundingClientRect().width) => {
      if (width > 0) setContainerWidth(width);
    };
    updateWidth();

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver((entries) => {
        updateWidth(entries[0]?.contentRect.width);
      });
      observer.observe(container);
      return () => observer.disconnect();
    }

    const handleResize = () => updateWidth();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !bounds || containerWidth < 120) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;
    const chartHeight = 292;
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.round(containerWidth * pixelRatio);
    canvas.height = Math.round(chartHeight * pixelRatio);
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${chartHeight}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, containerWidth, chartHeight);

    const paddingCells = 2;
    const minForward = bounds.minForward - paddingCells;
    const maxForward = bounds.maxForward + paddingCells;
    const minLateral = bounds.minLateral - paddingCells;
    const maxLateral = bounds.maxLateral + paddingCells;
    const sourceWidth = Math.max(1, maxForward - minForward);
    const sourceHeight = Math.max(1, maxLateral - minLateral);
    const plotWidth = Math.max(1, containerWidth - 64);
    const plotHeight = chartHeight - 54;
    const scale = Math.min(plotWidth / sourceWidth, plotHeight / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const layout = {
      minForward,
      maxForward,
      minLateral,
      forwardSign,
      scale,
      offsetX: (containerWidth - drawWidth) / 2,
      offsetY: 16 + ((plotHeight - drawHeight) / 2),
    };

    roundedRect(
      context,
      layout.offsetX,
      layout.offsetY,
      drawWidth,
      drawHeight,
      18,
    );
    context.fillStyle = '#f7f9f6';
    context.fill();
    context.strokeStyle = '#e5e9e2';
    context.lineWidth = 1;
    context.stroke();

    const measuredSteps = orderedMeasuredSteps(renderSteps);
    if (measuredSteps.length > 1) {
      const points = measuredSteps.map((step) => projectSensorCenter(step.center, layout));
      const segmentLengths = points.slice(1).map((point, index) => Math.hypot(
        point.x - points[index].x,
        point.y - points[index].y,
      ));
      const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0) || 1;
      let traversedLength = 0;

      context.save();
      context.setLineDash(TRAIL_DASH);
      context.lineWidth = 1.25;
      context.lineCap = 'round';
      segmentLengths.forEach((segmentLength, index) => {
        const start = points[index];
        const end = points[index + 1];
        const startProgress = traversedLength / totalLength;
        const endProgress = (traversedLength + segmentLength) / totalLength;
        const gradient = context.createLinearGradient(start.x, start.y, end.x, end.y);
        gradient.addColorStop(0, rgb(trailProgressColor(startProgress)));
        gradient.addColorStop(1, rgb(trailProgressColor(endProgress)));

        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.lineDashOffset = -(traversedLength % (TRAIL_DASH[0] + TRAIL_DASH[1]));
        context.strokeStyle = gradient;
        context.stroke();
        traversedLength += segmentLength;
      });
      context.restore();
    }

    renderSteps.forEach((step) => drawFootprint(context, step, layout, ceiling));
    renderSteps.forEach((step) => drawStepBadge(context, step, layout, chartHeight));

    if (trail.sensorPitchCm) {
      const scaleLengthCm = ((10 / trail.sensorPitchCm) * scale) <= plotWidth / 3 ? 10 : 5;
      const scaleLengthPx = (scaleLengthCm / trail.sensorPitchCm) * scale;
      const scaleX = layout.offsetX + drawWidth - scaleLengthPx - 14;
      const scaleY = layout.offsetY + drawHeight - 14;
      context.beginPath();
      context.moveTo(scaleX, scaleY);
      context.lineTo(scaleX + scaleLengthPx, scaleY);
      context.moveTo(scaleX, scaleY - 4);
      context.lineTo(scaleX, scaleY + 4);
      context.moveTo(scaleX + scaleLengthPx, scaleY - 4);
      context.lineTo(scaleX + scaleLengthPx, scaleY + 4);
      context.strokeStyle = '#727b72';
      context.lineWidth = 1.2;
      context.stroke();
      context.fillStyle = '#727b72';
      context.font = '600 10px "Microsoft YaHei", sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'bottom';
      context.fillText(`${scaleLengthCm} cm`, scaleX + (scaleLengthPx / 2), scaleY - 4);
    }
  }, [bounds, ceiling, containerWidth, forwardSign, renderSteps, trail.sensorPitchCm]);

  return (
    <div className="gait-report__footprint-canvas-wrap" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="gait-report__footprint-canvas"
        data-testid="gait-footprint-canvas"
        data-render-mode="pressure-heatmap"
        data-render-padding-cells={FOOTPRINT_PADDING_CELLS}
        data-coordinate-scale="uniform-sensor-grid"
        data-pressure-ceiling-n={ceiling}
        data-source-forward-direction={forwardSign < 0 ? 'decreasing-row' : 'increasing-row'}
        role="img"
        aria-label={`按真实步道比例绘制的 ${trail.stepCount} 步峰值帧足底压力热力图`}
      />
    </div>
  );
}

export function GaitFootprintTrail({ trail }) {
  const data = trail || { available: false, note: '' };

  return (
    <section
      className="gait-report__footprint-trail"
      aria-labelledby="gait-footprint-trail-title"
    >
      <div className="gait-report__footprint-heading">
        <h3 id="gait-footprint-trail-title" className="gait-report__section-title">
          <Footprints aria-hidden="true" />
          <span>脚印行走图</span>
        </h3>
        {data.available ? (
          <span className="gait-report__footprint-count">{data.stepCount} 步足印</span>
        ) : null}
      </div>

      <article className="gait-report__footprint-panel">
        {data.available ? (
          <figure>
            <div className="gait-report__footprint-direction">
              <span>行走方向</span>
              <ArrowRight aria-hidden="true" />
            </div>
            <FootprintCanvas trail={data} />
            <figcaption>
              <div className="gait-report__footprint-legend" aria-label="脚印与压力热力图图例">
                {data.baselineCount > 0 ? <span><i data-tone="baseline" />起始站姿</span> : null}
                <span><i data-tone="left" />左脚</span>
                <span><i data-tone="right" />右脚</span>
                <span className="gait-report__footprint-pressure-scale">
                  <small>低</small><b /><small>高</small>
                  局部压力
                </span>
              </div>
              <p>{data.note}</p>
            </figcaption>
          </figure>
        ) : (
          <div className="gait-report__footprint-empty">
            <span aria-hidden="true"><Footprints /></span>
            <div>
              <strong>逐步峰值足印数据不足</strong>
              <p>{data.note}</p>
            </div>
          </div>
        )}
      </article>
    </section>
  );
}
