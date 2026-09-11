import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COP_PLOT_ORIGIN,
  COP_PLOT_SIZE,
  copTrajectoryPath,
} from '../src/reports-v2/features/standing-report/components/standingCopVisuals.js';

const point = (x, y, side) => ({ x, y, side });

test('a foot sampled only once still renders as a visible dot', () => {
  // 回归：单点线段曾返回裸 moveto（"M x y"），SVG 里什么都不画，
  // 于是这只脚在"站立稳定轨迹"里静默消失，看起来只有一只脚有轨迹。
  const path = copTrajectoryPath([
    point(10, 20, 'left'),
    point(11, 21, 'left'),
    point(40, 30, 'right'),
  ]);

  const segments = path.split(/(?=M)/).map((segment) => segment.trim()).filter(Boolean);
  assert.equal(segments.length, 2);

  const rightSegment = segments.at(-1);
  assert.match(rightSegment, /^M[\d.]+ [\d.]+L[\d.]+ [\d.]+$/);
  const [, moveX, moveY, lineX, lineY] = rightSegment.match(
    /^M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)$/,
  );
  assert.equal(moveX, lineX);
  assert.equal(moveY, lineY);
});

test('each foot becomes its own segment so the two traces never join', () => {
  const path = copTrajectoryPath([
    point(10, 20, 'left'),
    point(11, 21, 'left'),
    point(40, 30, 'right'),
    point(41, 31, 'right'),
  ]);

  assert.equal(path.match(/M/g).length, 2);
});

test('points are normalised into the plot box', () => {
  const path = copTrajectoryPath([
    point(10, 20, 'left'),
    point(11, 21, 'left'),
    point(40, 30, 'right'),
    point(41, 31, 'right'),
  ]);

  const coordinates = [...path.matchAll(/[ML C]([\d.]+) ([\d.]+)/g)]
    .flatMap(([, x, y]) => [Number(x), Number(y)]);
  const low = COP_PLOT_ORIGIN - 1;
  const high = COP_PLOT_ORIGIN + COP_PLOT_SIZE + 1;

  assert.ok(coordinates.length > 0);
  for (const value of coordinates) {
    assert.ok(value >= low && value <= high, `${value} outside [${low}, ${high}]`);
  }
});

test('an empty trajectory produces no path', () => {
  assert.equal(copTrajectoryPath([]), '');
  assert.equal(copTrajectoryPath(null), '');
});
