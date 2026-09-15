import { prepareGaitReportScoreInput } from './gaitReportEnrich.js';

const gaitTrailPromiseCaches = new WeakMap();

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativePair(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const first = finiteNumber(value[0]);
  const second = finiteNumber(value[1]);
  return first !== null && first >= 0 && second !== null && second >= 0
    ? [first, second]
    : null;
}

function validFootprintMatrix(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 256) return null;
  const columnCount = Array.isArray(value[0]) ? value[0].length : 0;
  if (columnCount === 0 || columnCount > 128) return null;

  let hasPressure = false;
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== columnCount) return null;
    for (const sourceValue of row) {
      const pressure = finiteNumber(sourceValue);
      if (pressure === null || pressure < 0) return null;
      if (pressure > 0) hasPressure = true;
    }
  }
  return hasPressure ? { rowCount: value.length, columnCount } : null;
}

/** Keep the recovery acceptance rules aligned with the gait report mapper. */
export function hasValidFootprintTrail(value) {
  if (!isObject(value) || value.quality?.valid !== true) return false;

  const sensorSize = nonNegativePair(value.sensorSize);
  const sensorPitchMm = finiteNumber(value.sensorPitchMm);
  if (!sensorSize || sensorSize.some((size) => size <= 0) || !(sensorPitchMm > 0)) return false;
  if (!Array.isArray(value.steps) || value.steps.length === 0 || value.steps.length > 64) {
    return false;
  }

  const [sensorHeight, sensorWidth] = sensorSize;
  let measuredStepCount = 0;
  for (const step of value.steps) {
    if (!isObject(step) || typeof step.isRight !== 'boolean') return false;

    const frameIndex = finiteNumber(step.frameIndex);
    const origin = nonNegativePair(step.origin);
    const center = nonNegativePair(step.center);
    const matrixSize = validFootprintMatrix(step.matrix);
    if (frameIndex === null || frameIndex < 0 || !origin || !center || !matrixSize) return false;

    if (step.isBaseline !== true) {
      const stepIndex = finiteNumber(step.stepIndex);
      if (!(stepIndex > 0) || !Number.isInteger(stepIndex)) return false;
      measuredStepCount += 1;
    }

    const [originX, originY] = origin;
    const [centerX, centerY] = center;
    if (
      originX + matrixSize.columnCount > sensorWidth
      || originY + matrixSize.rowCount > sensorHeight
      || centerX < originX
      || centerX > originX + matrixSize.columnCount - 1
      || centerY < originY
      || centerY > originY + matrixSize.rowCount - 1
    ) return false;
  }

  return measuredStepCount > 0;
}

function hasAlgorithmQuality(value) {
  return isObject(value)
    && isObject(value.quality)
    && typeof value.quality.valid === 'boolean';
}

function isNonNegativeNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number >= 0;
}

function isPositiveInteger(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 && Number.isInteger(number);
}

export function hasWalkingStabilityResult(value) {
  if (!hasAlgorithmQuality(value)) return false;
  if (value.quality.valid === false) {
    return typeof value.quality.reason === 'string' && Boolean(value.quality.reason.trim());
  }
  return isNonNegativeNumber(value.stepTimeCvPercent)
    && isNonNegativeNumber(value.stepDistanceCvPercent)
    && isPositiveInteger(value.sampleCount)
    && isPositiveInteger(value.intervalCount);
}

export function hasDirectionControlResult(value) {
  if (!hasAlgorithmQuality(value)) return false;
  if (value.quality.valid === false) {
    return typeof value.quality.reason === 'string' && Boolean(value.quality.reason.trim());
  }
  return isNonNegativeNumber(value.pathDeviationRmsCm)
    && isNonNegativeNumber(value.maxPathDeviationCm)
    && isPositiveInteger(value.sampleCount);
}

function hasUsableWalkingStability(value) {
  return value?.quality?.valid === true && hasWalkingStabilityResult(value);
}

function hasUsableDirectionControl(value) {
  return value?.quality?.valid === true && hasDirectionControlResult(value);
}

function realAssessmentId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const assessmentId = value.trim();
  return assessmentId
    && !/^(local|pending|debug):/i.test(assessmentId)
    ? assessmentId
    : null;
}

function gaitTrailCacheFor(client) {
  let cache = gaitTrailPromiseCaches.get(client);
  if (!cache) {
    cache = new Map();
    gaitTrailPromiseCaches.set(client, cache);
  }
  return cache;
}

async function requestRecomputedGaitData(client, {
  assessmentId,
  timestamp,
  collectName,
  bodyWeightKg,
}) {
  if (!client || typeof client.getGaitReport !== 'function') return null;

  const cache = gaitTrailCacheFor(client);
  const cached = cache.get(assessmentId);
  if (cached) return cached;

  const request = (async () => {
    try {
      const params = { assessmentId, timestamp };
      if (typeof collectName === 'string' && collectName.trim()) {
        params.collectName = collectName.trim();
      }
      const measuredWeight = finiteNumber(bodyWeightKg);
      if (measuredWeight !== null && measuredWeight > 0) params.body_weight_kg = measuredWeight;
      const response = await client.getGaitReport(params);
      const renderData = response?.code === 0 ? response?.data?.render_data : null;
      if (!isObject(renderData)) return null;

      const result = {};
      if (hasValidFootprintTrail(renderData.footprintTrail)) {
        result.footprintTrail = renderData.footprintTrail;
      }
      if (hasUsableWalkingStability(renderData.walkingStability)) {
        result.walkingStability = renderData.walkingStability;
      }
      if (hasUsableDirectionControl(renderData.directionControl)) {
        result.directionControl = renderData.directionControl;
      }
      /*
       * gaitParams 也要带回去。下游 recoverGaitFootprintTrail 在存量参数算不出
       * 评分时（旧算法给了 N/A）会用 recomputed.gaitParams 覆盖，但之前这里
       * 只装了三个可视化字段，gaitParams 永远是 undefined —— 于是出现
       * 「足印/稳定性/方向都补回来了，评分卡还是 --」。
       * 只在新算法给出的参数能算出评分时才带，否则覆盖了也是白覆盖。
       */
      if (prepareGaitReportScoreInput({ gaitParams: renderData.gaitParams })) {
        result.gaitParams = renderData.gaitParams;
      }
      /*
       * 也带上重算后的 gaitParams。
       *
       * 旧版算法对 leftStepTime / rightStepTime 会给 'N/A'，而综合评分的门槛
       * （gaitReportEnrich.hasCompleteScoreInputs）要求步速、左右步时、左右步长
       * 五项都是正数。缺一项评分就是 null，首屏显示「-- 分」。
       * 之前回填只补三个新区块、不碰 gaitParams，所以这类旧记录即便回填成功
       * 也永远没有评分。这里只在重算结果能过评分门槛时才带出来，
       * 由 recoverGaitFootprintTrail 决定要不要替换存量。
       */
      if (prepareGaitReportScoreInput({ gaitParams: renderData.gaitParams })) {
        result.gaitParams = renderData.gaitParams;
      }
      // The three contracts have different quality thresholds. Keep every
      // independently valid result instead of discarding the whole recompute
      // when one algorithm cannot produce a value for this recording.
      return Object.keys(result).length ? result : null;
    } catch (error) {
      console.warn('Failed to recompute gait algorithm data:', error?.message || error);
      return null;
    }
  })();

  cache.set(assessmentId, request);
  const result = await request;
  // A transient backend failure or an algorithm response without the new contracts stays retryable.
  if (!result && cache.get(assessmentId) === request) cache.delete(assessmentId);
  return result;
}

export async function recoverGaitFootprintTrail(report, {
  client,
  assessmentId,
  fallbackAssessmentId,
  timestamp,
  collectName,
  bodyWeightKg,
} = {}) {
  if (!isObject(report?.reportData)) {
    return report;
  }

  // An explicit invalid quality result is useful as an explanation, but it is
  // not a completed measurement. Re-run those historical reports when their
  // original assessment id still lets the backend reach the raw frames.
  const hasTrail = hasValidFootprintTrail(report.reportData.footprintTrail);
  const hasStability = hasUsableWalkingStability(report.reportData.walkingStability);
  const hasDirection = hasUsableDirectionControl(report.reportData.directionControl);
  // 存量 gaitParams 能不能算出综合评分。算不出（旧算法给了 N/A）也算「缺」，要重算
  const hasScorableParams = Boolean(prepareGaitReportScoreInput(report.reportData));
  if (hasTrail && hasStability && hasDirection && hasScorableParams) return report;

  const sourceAssessmentId = realAssessmentId(assessmentId)
    || realAssessmentId(fallbackAssessmentId);
  if (!sourceAssessmentId) return report;

  const recomputed = await requestRecomputedGaitData(client, {
    assessmentId: sourceAssessmentId,
    timestamp,
    collectName,
    bodyWeightKg,
  });
  if (!recomputed) return report;

  const recoveredFields = {};
  if (!hasTrail && recomputed.footprintTrail) {
    recoveredFields.footprintTrail = recomputed.footprintTrail;
  }
  if (!hasStability && recomputed.walkingStability) {
    recoveredFields.walkingStability = recomputed.walkingStability;
  }
  if (!hasDirection && recomputed.directionControl) {
    recoveredFields.directionControl = recomputed.directionControl;
  }
  // 只在存量算不出评分、且重算结果能算时才替换；存量本来就完整就不动它
  if (!hasScorableParams && recomputed.gaitParams) {
    recoveredFields.gaitParams = recomputed.gaitParams;
  }
  if (!Object.keys(recoveredFields).length) return report;

  return {
    ...report,
    reportData: {
      ...report.reportData,
      ...recoveredFields,
    },
  };
}
