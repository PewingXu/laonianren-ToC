import assert from 'node:assert/strict';
import test from 'node:test';

import { bilinearUpsample } from '../src/components/ui/heatmapUtils.js';
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
} from '../src/reports-v2/features/gait-report/components/gaitFootprintVisuals.js';

const step = {
  frameIndex: 10,
  isBaseline: false,
  origin: [10, 20],
  center: [11, 20.5],
  matrix: [
    [5, 10, 5],
    [10, 20, 10],
  ],
};

test('render padding surrounds the footprint with zero cells without moving its coordinates', () => {
  const padded = padFootprintStep(step);

  assert.deepEqual(padded.origin, [8, 18]);
  assert.deepEqual(padded.center, step.center);
  assert.equal(padded.matrix.length, 2 + (FOOTPRINT_PADDING_CELLS * 2));
  assert.equal(padded.matrix[0].length, 3 + (FOOTPRINT_PADDING_CELLS * 2));
  assert.deepEqual(
    padded.matrix.slice(2, 4).map((row) => row.slice(2, 5)),
    step.matrix,
  );
  assert.ok(padded.matrix[0].every((value) => value === 0));
  assert.ok(padded.matrix.at(-1).every((value) => value === 0));
  assert.ok(padded.matrix.every((row) => row[0] === 0 && row.at(-1) === 0));
});

test('padding expands the draw rectangle equally and keeps the original cell area fixed', () => {
  const padded = padFootprintStep(step);
  const layout = {
    minForward: 0,
    maxForward: 80,
    minLateral: 0,
    forwardSign: 1,
    scale: 3.5,
    offsetX: 12,
    offsetY: 8,
  };
  const originalRect = footprintDrawRect(step, layout);
  const paddedRect = footprintDrawRect(padded, layout);
  const margin = FOOTPRINT_PADDING_CELLS * layout.scale;

  assert.equal(paddedRect.x + margin, originalRect.x);
  assert.equal(paddedRect.y + margin, originalRect.y);
  assert.equal(paddedRect.width - (margin * 2), originalRect.width);
  assert.equal(paddedRect.height - (margin * 2), originalRect.height);
});

test('one shared scale preserves forward and left-right sensor distances', () => {
  const layout = {
    minForward: 5,
    maxForward: 90,
    minLateral: 3,
    forwardSign: 1,
    scale: 4,
    offsetX: 20,
    offsetY: 10,
  };
  const first = projectSensorCenter([10, 20], layout);
  const second = projectSensorCenter([14, 27], layout);

  assert.equal(second.x - first.x, 7 * layout.scale);
  assert.equal(second.y - first.y, 4 * layout.scale);
  assert.equal(((second.y - first.y) / layout.scale) * 1.4, 5.6);
});

test('the projected pressure center lands in the center of a sensor cell', () => {
  const layout = {
    minForward: 20,
    maxForward: 40,
    minLateral: 10,
    forwardSign: 1,
    scale: 8,
    offsetX: 0,
    offsetY: 0,
  };

  assert.deepEqual(projectSensorCenter([10, 20], layout), { x: 4, y: 4 });
});

test('reversing walking direction mirrors x but preserves all distances', () => {
  const forwardLayout = {
    minForward: 0,
    maxForward: 100,
    minLateral: 0,
    forwardSign: 1,
    scale: 2,
    offsetX: 0,
    offsetY: 0,
  };
  const reverseLayout = { ...forwardLayout, forwardSign: -1 };
  const centers = [[8, 12], [15, 31]];
  const forward = centers.map((center) => projectSensorCenter(center, forwardLayout));
  const reverse = centers.map((center) => projectSensorCenter(center, reverseLayout));

  assert.equal(reverse[1].x - reverse[0].x, -(forward[1].x - forward[0].x));
  assert.equal(reverse[1].y - reverse[0].y, forward[1].y - forward[0].y);
});

test('bounds include the synthetic transparent margin', () => {
  const padded = padFootprintStep(step);
  assert.deepEqual(footprintBounds([padded]), {
    minLateral: 8,
    maxLateral: 15,
    minForward: 18,
    maxForward: 24,
  });
});

test('smoothed padded footprint stays fully transparent on every outer edge', () => {
  const padded = padFootprintStep({
    ...step,
    origin: [0, 0],
    center: [0, 0],
    matrix: [[100]],
  });
  const width = padded.matrix[0].length * 8;
  const height = padded.matrix.length * 8;
  const interpolated = bilinearUpsample(padded.matrix, height, width);
  const pressure = gaussianBlurField(interpolated, width, height, 8 * 0.55);
  const edgeIndexes = [];
  for (let x = 0; x < width; x += 1) {
    edgeIndexes.push(x, ((height - 1) * width) + x);
  }
  for (let y = 0; y < height; y += 1) {
    edgeIndexes.push(y * width, (y * width) + width - 1);
  }

  assert.ok(edgeIndexes.every((index) => pressureAlpha(pressure[index] / 100) === 0));
  assert.ok(pressure.some((value) => pressureAlpha(value / 100) > 0));
});

test('pressure colors are bounded and low-pressure edges fade smoothly', () => {
  const samples = [0, 0.01, 0.03, 0.07, 0.25, 0.5, 0.75, 1];
  const alpha = samples.map((value) => pressureAlpha(value));

  assert.equal(alpha[0], 0);
  assert.equal(alpha.at(-1), 235);
  assert.ok(alpha[1] > 0 && alpha[1] < alpha[2]);
  assert.ok(alpha[2] < alpha[3]);
  assert.ok(alpha.every((value, index) => index === 0 || value >= alpha[index - 1]));
  assert.equal(pressureAlpha(1, 180), 180);
  samples.forEach((value) => {
    assert.ok(pressureColor(value).every((channel) => channel >= 0 && channel <= 255));
  });
});

test('pressure palette smoothly transitions from cool blue to warm red', () => {
  const blue = pressureColor(0);
  const red = pressureColor(1);
  assert.deepEqual(blue, [49, 88, 138]);
  assert.deepEqual(red, [200, 63, 69]);
  assert.ok(blue[2] > blue[0] && blue[2] > blue[1]);
  assert.ok(red[0] > red[1] && red[0] > red[2]);
  let previous = blue;
  for (let index = 1; index <= 100; index += 1) {
    const current = pressureColor(index / 100);
    current.forEach((channel, channelIndex) => {
      assert.ok(Math.abs(channel - previous[channelIndex]) < 25);
    });
    previous = current;
  }
});

test('trail colors continuously deepen from the first step to the last', () => {
  assert.deepEqual(trailProgressColor(0), [211, 224, 219]);
  assert.deepEqual(trailProgressColor(1), [50, 99, 89]);

  const start = trailProgressColor(0);
  const middle = trailProgressColor(0.5);
  const end = trailProgressColor(1);
  start.forEach((channel, index) => {
    assert.ok(channel > middle[index]);
    assert.ok(middle[index] > end[index]);
  });
});

test('trail steps are connected in reported step order and omit baseline footprints', () => {
  const ordered = orderedMeasuredSteps([
    { frameIndex: 30, stepIndex: 3, isBaseline: false },
    { frameIndex: 2, stepIndex: null, isBaseline: true },
    { frameIndex: 20, stepIndex: 2, isBaseline: false },
    { frameIndex: 10, stepIndex: 1, isBaseline: false },
  ]);

  assert.deepEqual(ordered.map((item) => item.stepIndex), [1, 2, 3]);
});

test('bilinear interpolation clamps the first sample instead of extrapolating', () => {
  const output = bilinearUpsample([
    [10, 20],
    [30, 40],
  ], 4, 4);

  assert.equal(output[0], 10);
  assert.ok(output.every((value) => value >= 10 && value <= 40));
});
