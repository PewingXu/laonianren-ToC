import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasDirectionControlResult,
  hasValidFootprintTrail,
  hasWalkingStabilityResult,
  recoverGaitFootprintTrail,
} from '../src/lib/gaitFootprintTrailRecovery.js';

function footprintTrail(overrides = {}) {
  return {
    sensorSize: [20, 12],
    sensorPitchMm: 14,
    quality: { valid: true },
    steps: [{
      frameIndex: 4,
      isRight: false,
      isBaseline: false,
      stepIndex: 1,
      origin: [2, 3],
      center: [3, 4],
      matrix: [[0, 2, 0], [1, 5, 1]],
    }],
    ...overrides,
  };
}

function legacyReport(reportData = {}) {
  return {
    completed: true,
    reportData: {
      gaitParams: { walkingSpeed: 1.04 },
      score: 17,
      ...reportData,
    },
  };
}

function walkingStability(overrides = {}) {
  return {
    scope: 'step_to_step_footprint_consistency',
    reference: 'consecutive_alternating_footprints',
    stepTimeCvPercent: 8.4,
    stepDistanceCvPercent: 6.2,
    sampleCount: 6,
    intervalCount: 5,
    quality: { valid: true, reason: null, confidence: 'standard' },
    ...overrides,
  };
}

function directionControl(overrides = {}) {
  return {
    scope: 'plantar_footpath_straightness_proxy',
    reference: 'parallel_footprint_centerlines',
    pathDeviationRmsCm: 0.8,
    maxPathDeviationCm: 1.6,
    sampleCount: 6,
    forwardSpanCm: 120,
    quality: { valid: true, reason: null, confidence: 'standard' },
    ...overrides,
  };
}

function algorithmRenderData(overrides = {}) {
  return {
    footprintTrail: footprintTrail(),
    walkingStability: walkingStability(),
    directionControl: directionControl(),
    ...overrides,
  };
}

test('footprint trail validation matches the report coordinate contract', () => {
  assert.equal(hasValidFootprintTrail(footprintTrail()), true);
  assert.equal(hasValidFootprintTrail(null), false);
  assert.equal(hasValidFootprintTrail(footprintTrail({ quality: { valid: false } })), false);
  assert.equal(hasValidFootprintTrail(footprintTrail({ sensorPitchMm: 0 })), false);
  assert.equal(hasValidFootprintTrail(footprintTrail({
    steps: [{
      frameIndex: 4,
      isRight: false,
      isBaseline: false,
      stepIndex: 1,
      origin: [11, 19],
      center: [11, 19],
      matrix: [[1, 2], [3, 4]],
    }],
  })), false);
});

test('walking stability and direction control validators accept algorithm contracts', () => {
  assert.equal(hasWalkingStabilityResult(walkingStability()), true);
  assert.equal(hasDirectionControlResult(directionControl()), true);
  assert.equal(hasWalkingStabilityResult({ quality: { valid: false } }), false);
  assert.equal(hasDirectionControlResult({ quality: { valid: false } }), false);
  assert.equal(hasWalkingStabilityResult({
    quality: { valid: false, reason: 'insufficient_alternating_steps' },
  }), true);
  assert.equal(hasDirectionControlResult({
    quality: { valid: false, reason: 'insufficient_alternating_steps' },
  }), true);
  assert.equal(hasWalkingStabilityResult(walkingStability({ sampleCount: 0 })), false);
  assert.equal(hasDirectionControlResult(directionControl({ pathDeviationRmsCm: -1 })), false);
});

test('a report with all current gait algorithm fields does not rerun the algorithm', async () => {
  let callCount = 0;
  const existingTrail = footprintTrail();
  const report = legacyReport({
    footprintTrail: existingTrail,
    walkingStability: walkingStability(),
    directionControl: directionControl(),
  });

  const result = await recoverGaitFootprintTrail(report, {
    assessmentId: 'gait-existing-trail',
    timestamp: '2026-09-07T09:09:10.000Z',
    client: {
      async getGaitReport() {
        callCount += 1;
        throw new Error('should not be called');
      },
    },
  });

  assert.equal(callCount, 0);
  assert.equal(result, report);
});

test('a gait report receives all recomputed algorithm fields without replacing its other data', async () => {
  const recomputed = algorithmRenderData();
  const report = legacyReport();
  const snapshot = structuredClone(report);
  const requests = [];

  const result = await recoverGaitFootprintTrail(report, {
    assessmentId: 'gait-legacy-merge',
    timestamp: '2026-09-07T09:09:10.000Z',
    client: {
      async getGaitReport(params) {
        requests.push(params);
        return {
          code: 0,
          data: { render_data: { score: 99, ...recomputed } },
        };
      },
    },
  });

  assert.deepEqual(requests, [{
    assessmentId: 'gait-legacy-merge',
    timestamp: '2026-09-07T09:09:10.000Z',
  }]);
  assert.equal(result.reportData.score, 17);
  assert.equal(result.reportData.footprintTrail, recomputed.footprintTrail);
  assert.equal(result.reportData.walkingStability, recomputed.walkingStability);
  assert.equal(result.reportData.directionControl, recomputed.directionControl);
  assert.deepEqual(report, snapshot);
});

test('an existing trail still reruns when stability and direction algorithm fields are missing', async () => {
  const report = legacyReport({ footprintTrail: footprintTrail() });
  let callCount = 0;
  const result = await recoverGaitFootprintTrail(report, {
    assessmentId: 'gait-missing-abilities',
    client: {
      async getGaitReport() {
        callCount += 1;
        return { code: 0, data: { render_data: algorithmRenderData() } };
      },
    },
  });

  assert.equal(callCount, 1);
  assert.equal(result.reportData.footprintTrail, report.reportData.footprintTrail);
  assert.equal(hasWalkingStabilityResult(result.reportData.walkingStability), true);
  assert.equal(hasDirectionControlResult(result.reportData.directionControl), true);
});

test('a partial recomputation keeps each independently usable gait result', async () => {
  const report = legacyReport();
  const recomputedStability = walkingStability();

  const result = await recoverGaitFootprintTrail(report, {
    assessmentId: 'gait-partial-recompute',
    client: {
      async getGaitReport() {
        return {
          code: 0,
          data: {
            render_data: {
              walkingStability: recomputedStability,
              directionControl: {
                quality: { valid: false },
              },
            },
          },
        };
      },
    },
  });

  assert.equal(result.reportData.walkingStability, recomputedStability);
  assert.equal(result.reportData.footprintTrail, undefined);
  assert.equal(result.reportData.directionControl, undefined);
});

test('stored insufficient results do not prevent recomputation from raw gait frames', async () => {
  const report = legacyReport({
    footprintTrail: {
      quality: { valid: false, reason: 'missing_peak_footprints' },
    },
    walkingStability: {
      quality: { valid: false, reason: 'insufficient_alternating_steps' },
    },
    directionControl: {
      quality: { valid: false, reason: 'insufficient_alternating_steps' },
    },
  });
  const recomputed = algorithmRenderData();
  let callCount = 0;

  const result = await recoverGaitFootprintTrail(report, {
    assessmentId: 'gait-recompute-stored-insufficient',
    client: {
      async getGaitReport() {
        callCount += 1;
        return { code: 0, data: { render_data: recomputed } };
      },
    },
  });

  assert.equal(callCount, 1);
  assert.equal(result.reportData.footprintTrail, recomputed.footprintTrail);
  assert.equal(result.reportData.walkingStability, recomputed.walkingStability);
  assert.equal(result.reportData.directionControl, recomputed.directionControl);
});

test('concurrent and later reads share one successful recomputation promise', async () => {
  const report = legacyReport();
  let callCount = 0;
  const client = {
    async getGaitReport() {
      callCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { code: 0, data: { render_data: algorithmRenderData() } };
    },
  };
  const options = {
    assessmentId: 'gait-cache-concurrent',
    timestamp: '2026-09-07T09:09:10.000Z',
    client,
  };

  const [first, second] = await Promise.all([
    recoverGaitFootprintTrail(report, options),
    recoverGaitFootprintTrail(report, options),
  ]);
  const third = await recoverGaitFootprintTrail(report, options);

  assert.equal(callCount, 1);
  assert.equal(first.reportData.footprintTrail, second.reportData.footprintTrail);
  assert.equal(second.reportData.footprintTrail, third.reportData.footprintTrail);
});

test('local placeholder ids never trigger backend recomputation', async () => {
  const report = legacyReport();
  let callCount = 0;

  const result = await recoverGaitFootprintTrail(report, {
    assessmentId: 'local:record-1:gait',
    timestamp: '2026-09-07T09:09:10.000Z',
    client: {
      async getGaitReport() {
        callCount += 1;
        return { code: 0, data: { render_data: algorithmRenderData() } };
      },
    },
  });

  assert.equal(callCount, 0);
  assert.equal(result, report);
});

test('a real request id replaces a stored local placeholder', async () => {
  const report = legacyReport();
  const requests = [];

  const result = await recoverGaitFootprintTrail(report, {
    assessmentId: 'local:record-1:gait',
    fallbackAssessmentId: 'gait-real-request-id',
    timestamp: '2026-09-07T09:09:10.000Z',
    client: {
      async getGaitReport(params) {
        requests.push(params);
        return { code: 0, data: { render_data: algorithmRenderData() } };
      },
    },
  });

  assert.deepEqual(requests, [{
    assessmentId: 'gait-real-request-id',
    timestamp: '2026-09-07T09:09:10.000Z',
  }]);
  assert.equal(hasValidFootprintTrail(result.reportData.footprintTrail), true);
});

test('backend failure and invalid output preserve the legacy report', async () => {
  const report = legacyReport();
  let failureCallCount = 0;
  const retryingClient = {
    async getGaitReport() {
      failureCallCount += 1;
      if (failureCallCount === 1) throw new Error('backend unavailable');
      return { code: 0, data: { render_data: algorithmRenderData() } };
    },
  };
  const oldWarn = console.warn;
  console.warn = () => {};
  try {
    const failedResult = await recoverGaitFootprintTrail(report, {
      assessmentId: 'gait-failed-recompute',
      timestamp: '2026-09-07T09:09:10.000Z',
      client: retryingClient,
    });
    assert.equal(failedResult, report);
  } finally {
    console.warn = oldWarn;
  }

  const retryResult = await recoverGaitFootprintTrail(report, {
    assessmentId: 'gait-failed-recompute',
    timestamp: '2026-09-07T09:09:10.000Z',
    client: retryingClient,
  });
  assert.equal(failureCallCount, 2);
  assert.equal(hasValidFootprintTrail(retryResult.reportData.footprintTrail), true);

  const invalidResult = await recoverGaitFootprintTrail(report, {
    assessmentId: 'gait-invalid-recompute',
    timestamp: '2026-09-07T09:09:10.000Z',
    client: {
      async getGaitReport() {
        return {
          code: 0,
          data: {
            render_data: {
              footprintTrail: footprintTrail({ quality: { valid: false } }),
            },
          },
        };
      },
    },
  });
  assert.equal(invalidResult, report);
});
