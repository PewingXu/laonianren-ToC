import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGaitDetails } from '../src/reports-v2/features/gait-report/mappers/buildGaitDetails.js';
import { mapGaitReport } from '../src/reports-v2/features/gait-report/mappers/mapGaitReport.js';

const validStability = {
  sampleCount: 6,
  intervalCount: 5,
  meanStepTimeSeconds: 0.432,
  meanStepDistanceCm: 48.27,
  forwardSpanCm: 238.46,
  quality: { valid: true, confidence: 'standard' },
};

test('missing and synthetic reports do not produce measurements', () => {
  const empty = buildGaitDetails();
  assert.deepEqual(empty.observation, []);
  assert.deepEqual(empty.symmetry, []);
  assert.deepEqual(empty.signals.channels, []);
  assert.equal(empty.signals.durationSeconds, null);

  assert.deepEqual(buildGaitDetails({
    _generated: true,
    gaitParams: { leftStepTime: 1, rightStepTime: 1.1 },
    walkingStability: validStability,
    timeSeries: { left: { time: [0, 1], load: [0, 50], area: [0, 10] } },
  }), empty);
});

test('signals preserve acquisition times, units, zeroes and sampled peaks', () => {
  const result = buildGaitDetails({
    timeSeries: {
      left: { time: [10, 10.04, 10.08], load: [0, 123.456, 20], area: [0, 76.44, 40] },
      right: { time: [10.02, 10.06, 10.1], load: [20, 80, 0], area: [10, 30, 0] },
    },
  });
  assert.equal(result.signals.durationSeconds, 0.1);
  assert.equal(result.signals.startSeconds, 10);
  assert.equal(result.signals.endSeconds, 10.1);
  assert.deepEqual(result.signals.channels.map(({ id, unit }) => ({ id, unit })), [
    { id: 'load', unit: 'N' },
    { id: 'area', unit: 'cm²' },
  ]);
  assert.deepEqual(result.signals.channels[0].sides[0].points, [[10, 0], [10.04, 123.456], [10.08, 20]]);
  assert.equal(result.signals.channels[0].sides[0].peak, 123.46);
  assert.equal(result.signals.channels[0].peakLabel, '采样曲线峰值');
  assert.deepEqual(result.observation, [{ id: 'signalDuration', label: '采样曲线覆盖时长', value: 0.1, unit: 's' }]);
});

test('invalid channels are omitted independently while a valid side is retained', () => {
  for (const invalid of [null, 'N/A', ' ', true, -1, Infinity, NaN, {}, []]) {
    const result = buildGaitDetails({
      timeSeries: {
        left: { time: [0, 1], load: [0, invalid], area: [0, 12] },
        right: { time: [0, 1], load: [0, 40] },
      },
    });
    assert.deepEqual(result.signals.channels[0].sides.map((side) => side.id), ['right']);
    assert.deepEqual(result.signals.channels[1].sides.map((side) => side.id), ['left']);
  }
});

test('nonmonotonic, incomplete and invalid time axes cannot yield curves or durations', () => {
  for (const time of [[1, 1], [1, 0], [-1, 0], [0, ' '], [0, null], [0, Infinity], [0, true], [0], []]) {
    const result = buildGaitDetails({ timeSeries: { left: { time, load: [10, 20] } } });
    assert.deepEqual(result.signals.channels, []);
    assert.equal(result.signals.durationSeconds, null);
  }
});

test('zero load and area curves remain valid without manufacturing missing channels', () => {
  const result = buildGaitDetails({ timeSeries: { left: { time: ['0', '1'], load: ['0', 0] } } });
  assert.equal(result.signals.channels.length, 1);
  assert.equal(result.signals.channels[0].sides.length, 1);
  assert.equal(result.signals.channels[0].sides[0].peak, 0);
  assert.equal(result.signals.durationSeconds, 1);
});

test('symmetry derives precise differences before rounding and preserves signed angles', () => {
  const result = buildGaitDetails({
    gaitParams: {
      leftStepTime: '1.0034', rightStepTime: '1.0046',
      leftStepLength: '59.991', rightStepLength: '60.009',
      leftFPA: -3.25, rightFPA: 0,
    },
  });
  assert.deepEqual(result.symmetry, [
    { id: 'cycleTime', label: '同脚周期', left: 1.003, right: 1.005, difference: 0.001, unit: 's', relativeDifferencePercent: 0.12 },
    { id: 'stepLength', label: '同脚步幅', left: 59.99, right: 60.01, difference: 0.02, unit: 'cm', relativeDifferencePercent: 0.03 },
    { id: 'fpa', label: '足偏角', left: -3.25, right: 0, difference: 3.25, unit: '°', relativeDifferencePercent: null },
  ]);
});

test('single-sided symmetry does not invent a missing side or difference', () => {
  const result = buildGaitDetails({
    gaitParams: { leftStepTime: 0, rightStepTime: 1.2, leftStepLength: ' ', rightStepLength: 'N/A', leftFPA: 0 },
  });
  assert.equal(result.symmetry.length, 2);
  assert.deepEqual(result.symmetry[0], {
    id: 'cycleTime', label: '同脚周期', left: null, right: 1.2, difference: null, unit: 's', relativeDifferencePercent: null,
  });
  assert.equal(result.symmetry[1].left, 0);
  assert.equal(result.symmetry[1].difference, null);
});

test('equal bilateral measurements yield real zero differences', () => {
  const result = buildGaitDetails({ gaitParams: { leftStepTime: 1, rightStepTime: 1, leftFPA: 0, rightFPA: 0 } });
  assert.equal(result.symmetry[0].difference, 0);
  assert.equal(result.symmetry[0].relativeDifferencePercent, 0);
  assert.equal(result.symmetry[1].difference, 0);
  assert.equal(result.symmetry[1].relativeDifferencePercent, null);
});

test('observations distinguish recorded steps from the validated alternating sequence', () => {
  const result = buildGaitDetails({ walkingStability: validStability }, {
    available: true,
    steps: [
      { isRight: false, isBaseline: true },
      ...Array.from({ length: 7 }, (_, index) => ({ isRight: index % 2 === 1, isBaseline: false })),
    ],
  });
  const byId = Object.fromEntries(result.observation.map((item) => [item.id, item]));
  assert.deepEqual(byId.recordedSteps, { id: 'recordedSteps', label: '记录落脚次数', value: 7, unit: '次', leftCount: 4, rightCount: 3 });
  assert.equal(byId.validSteps.value, 6);
  assert.equal(byId.validSteps.confidence, 'standard');
  assert.equal(byId.meanStepTime.value, 0.432);
  assert.equal(byId.meanStepDistance.value, 48.27);
  assert.equal(byId.forwardSpan.value, 238.46);
});

test('failed quality or inconsistent counts cannot become measured observation statistics', () => {
  for (const walkingStability of [
    { ...validStability, quality: { valid: false } },
    { ...validStability, sampleCount: 3, intervalCount: 2 },
    { ...validStability, intervalCount: 4 },
    { ...validStability, sampleCount: 5.5, intervalCount: 4.5 },
  ]) {
    assert.deepEqual(buildGaitDetails({ walkingStability }).observation, []);
  }

  const limited = buildGaitDetails({ walkingStability: { ...validStability, sampleCount: 4, intervalCount: 3 } });
  assert.equal(limited.observation[0].confidence, 'limited');
});

test('direction coverage can survive missing stability but still requires a valid contract', () => {
  const directionControl = { forwardSpanCm: 172.46, quality: { valid: true } };
  assert.deepEqual(buildGaitDetails({ directionControl }).observation, [
    { id: 'forwardSpan', label: '有效步迹覆盖距离', value: 172.46, unit: 'cm' },
  ]);
  assert.deepEqual(buildGaitDetails({ directionControl: { ...directionControl, quality: { valid: false } } }).observation, []);
});

test('building details leaves source measurements unchanged', () => {
  const input = {
    walkingStability: validStability,
    gaitParams: { leftStepTime: '1.02', rightStepTime: '1.01' },
    timeSeries: { left: { time: [2, 3], load: [0, 30] } },
  };
  const snapshot = structuredClone(input);
  const first = buildGaitDetails(input);
  assert.deepEqual(input, snapshot);
  assert.deepEqual(buildGaitDetails(input), first);
});

const balanceKeys = ['整足平衡', '前足平衡', '足跟平衡'];
const emptyBalanceStats = { peak: null, mean: null, standardDeviation: null };
const zeroBalance = () => Object.fromEntries(balanceKeys.map((key) => [key, { 峰值: 0, 均值: 0, 标准差: 0 }]));
const loadedPartitionCurves = () => Array.from({ length: 6 }, () => ({ data: [0, 10, 0] }));
const mapBalance = (data) => mapGaitReport({ id: 'balance-test', assessments: { gait: {} } }, {
  gaitParams: { walkingSpeed: 1 },
  ...data,
}).medialLateralBalance;

test('default zero balance has no measured meaning without positive partition samples', () => {
  for (const partitionCurves of [undefined, null, {}, { left: [], right: [] }, {
    left: Array.from({ length: 6 }, () => ({ data: [0, 0] })),
    right: Array.from({ length: 6 }, () => ({ data: [0, 0] })),
  }]) {
    assert.equal(mapBalance({ balance: { left: zeroBalance(), right: zeroBalance() }, partitionCurves }), null);
  }
});

test('real zero force differences survive when aligned partition samples prove contact', () => {
  const balance = mapBalance({
    balance: { left: zeroBalance(), right: zeroBalance() },
    partitionCurves: { left: loadedPartitionCurves() },
  });
  assert.equal(balance.unit, 'N');
  assert.match(balance.description, /首个分区接触片段/);
  for (const row of balance.rows) {
    assert.deepEqual(row.left, { peak: 0, mean: 0, standardDeviation: 0 });
    assert.deepEqual(row.right, emptyBalanceStats);
  }
});

test('legacy nonzero balance remains usable without partition curves', () => {
  const balance = mapBalance({
    balance: { left: { 整足平衡: { 峰值: '12.3', 均值: '4.2', 标准差: 0 } } },
  });
  assert.deepEqual(balance.rows[0].left, { peak: 12.3, mean: 4.2, standardDeviation: 0 });
  assert.deepEqual(balance.rows[0].right, emptyBalanceStats);
});

test('explicit invalid partition samples invalidate only their dependent regions', () => {
  const left = Object.fromEntries(balanceKeys.map((key) => [key, { 峰值: 12, 均值: 4, 标准差: 1 }]));
  for (const invalidData of [[], [1, null, 1], [1, ' ', 1], [1, true, 1], [1, -1, 1], [1, Infinity, 1], [1, 2]]) {
    const curves = loadedPartitionCurves();
    curves[1] = { data: invalidData };
    const balance = mapBalance({ balance: { left }, partitionCurves: { left: curves } });
    assert.deepEqual(balance.rows[0].left, emptyBalanceStats);
    assert.deepEqual(balance.rows[1].left, emptyBalanceStats);
    assert.deepEqual(balance.rows[2].left, { peak: 12, mean: 4, standardDeviation: 1 });
  }
  assert.equal(mapBalance({ balance: { left }, partitionCurves: { left: [] } }), null);
});

test('all-zero side requires all four dependent curves to be aligned and complete', () => {
  for (const invalidData of [[], [0, null, 0], [0, 10], [0, -10, 0]]) {
    const curves = loadedPartitionCurves();
    curves[5] = { data: invalidData };
    assert.equal(mapBalance({ balance: { left: zeroBalance() }, partitionCurves: { left: curves } }), null);
  }
});

test('a region with no sampled contact does not display a measured zero force difference', () => {
  const curves = loadedPartitionCurves();
  curves[1] = { data: [0, 0, 0] };
  curves[2] = { data: [0, 0, 0] };
  const balance = mapBalance({ balance: { left: zeroBalance() }, partitionCurves: { left: curves } });
  assert.deepEqual(balance.rows[0].left, { peak: 0, mean: 0, standardDeviation: 0 });
  assert.deepEqual(balance.rows[1].left, emptyBalanceStats);
  assert.deepEqual(balance.rows[2].left, { peak: 0, mean: 0, standardDeviation: 0 });
});

test('balance rejects empty text and nonnumeric values while preserving real zero statistics', () => {
  const balance = mapBalance({
    balance: {
      left: {
        整足平衡: { 峰值: 12, 均值: ' ', 标准差: true },
        前足平衡: { 峰值: [], 均值: {}, 标准差: 0 },
      },
    },
  });
  assert.deepEqual(balance.rows[0].left, { peak: 12, mean: null, standardDeviation: null });
  assert.deepEqual(balance.rows[1].left, { peak: null, mean: null, standardDeviation: 0 });
});
