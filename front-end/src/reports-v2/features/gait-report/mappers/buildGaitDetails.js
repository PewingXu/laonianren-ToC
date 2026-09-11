function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function numericValue(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveValue(value) {
  const number = numericValue(value);
  return number !== null && number > 0 ? number : null;
}

function round(value, digits) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function mapSignalSide(series, id, label, channel) {
  if (!isObject(series) || !Array.isArray(series.time) || !Array.isArray(series[channel])) {
    return null;
  }
  if (series.time.length < 2 || series.time.length !== series[channel].length) return null;

  const points = [];
  let previousTime = null;
  let peak = 0;
  for (let index = 0; index < series.time.length; index += 1) {
    const time = numericValue(series.time[index]);
    const value = numericValue(series[channel][index]);
    if (
      time === null || time < 0
      || value === null || value < 0
      || (previousTime !== null && time <= previousTime)
    ) return null;
    points.push([time, value]);
    peak = Math.max(peak, value);
    previousTime = time;
  }

  return { id, label, points, peak: round(peak, 2) };
}

function buildSignals(data) {
  const channels = [
    { id: 'load', label: '足底负荷', unit: 'N' },
    { id: 'area', label: '接触面积', unit: 'cm²' },
  ].map((channel) => {
    const sides = [
      mapSignalSide(data.timeSeries?.left, 'left', '左脚', channel.id),
      mapSignalSide(data.timeSeries?.right, 'right', '右脚', channel.id),
    ].filter(Boolean);
    return { ...channel, peakLabel: '采样曲线峰值', sides };
  }).filter((channel) => channel.sides.length);

  const sides = channels.flatMap((channel) => channel.sides);
  const startSeconds = sides.length ? Math.min(...sides.map((side) => side.points[0][0])) : null;
  const endSeconds = sides.length ? Math.max(...sides.map((side) => side.points.at(-1)[0])) : null;

  return {
    durationSeconds: sides.length ? round(endSeconds - startSeconds, 3) : null,
    startSeconds,
    endSeconds,
    channels,
  };
}

function buildSymmetry(gaitParams) {
  const definitions = [
    { id: 'cycleTime', label: '同脚周期', leftKey: 'leftStepTime', rightKey: 'rightStepTime', unit: 's', digits: 3 },
    { id: 'stepLength', label: '同脚步幅', leftKey: 'leftStepLength', rightKey: 'rightStepLength', unit: 'cm', digits: 2 },
    { id: 'fpa', label: '足偏角', leftKey: 'leftFPA', rightKey: 'rightFPA', unit: '°', digits: 2 },
  ];

  return definitions.map(({ id, label, leftKey, rightKey, unit, digits }) => {
    const parse = id === 'fpa' ? numericValue : positiveValue;
    const left = parse(gaitParams[leftKey]);
    const right = parse(gaitParams[rightKey]);
    if (left === null && right === null) return null;
    const difference = left !== null && right !== null ? Math.abs(left - right) : null;
    // Derive differences before display rounding so small measured asymmetries survive.
    const relativeDifferencePercent = difference !== null && id !== 'fpa'
      ? round((difference / ((left + right) / 2)) * 100, 2)
      : null;
    return {
      id,
      label,
      left: round(left, digits),
      right: round(right, digits),
      difference: round(difference, digits),
      unit,
      relativeDifferencePercent,
    };
  }).filter(Boolean);
}

function validContract(value) {
  return isObject(value) && value.quality?.valid === true;
}

function buildObservation(data, mappedTrail, signals) {
  const observation = [];
  const add = (id, label, value, unit, digits = 2, extra = {}) => {
    if (value !== null) observation.push({ id, label, value: round(value, digits), unit, ...extra });
  };

  if (mappedTrail?.available === true && Array.isArray(mappedTrail.steps)) {
    const measured = mappedTrail.steps.filter((step) => step.isBaseline !== true);
    if (measured.length) {
      add('recordedSteps', '记录落脚次数', measured.length, '次', 0, {
        leftCount: measured.filter((step) => step.isRight === false).length,
        rightCount: measured.filter((step) => step.isRight === true).length,
      });
    }
  }

  const stability = isObject(data.walkingStability) ? data.walkingStability : data.walking_stability;
  const direction = isObject(data.directionControl) ? data.directionControl : data.direction_control;
  const sampleCount = validContract(stability)
    ? positiveValue(stability.sampleCount ?? stability.sample_count)
    : null;
  const intervalCount = validContract(stability)
    ? positiveValue(stability.intervalCount ?? stability.interval_count)
    : null;
  const hasStableSequence = sampleCount !== null && Number.isInteger(sampleCount) && sampleCount >= 4
    && intervalCount === sampleCount - 1;

  if (hasStableSequence) {
    add('validSteps', '连续交替落脚', sampleCount, '次', 0, {
      confidence: stability.quality.confidence === 'limited' || sampleCount < 6 ? 'limited' : 'standard',
    });
    add('meanStepTime', '平均相邻步时', positiveValue(stability.meanStepTimeSeconds ?? stability.mean_step_time_seconds), 's', 3);
    add('meanStepDistance', '平均落脚间距', positiveValue(stability.meanStepDistanceCm ?? stability.mean_step_distance_cm), 'cm');
  }

  const forwardSpan = hasStableSequence
    ? positiveValue(stability.forwardSpanCm ?? stability.forward_span_cm)
    : null;
  const directionSpan = validContract(direction)
    ? positiveValue(direction.forwardSpanCm ?? direction.forward_span_cm)
    : null;
  add('forwardSpan', '有效步迹覆盖距离', forwardSpan ?? directionSpan, 'cm');
  add('signalDuration', '采样曲线覆盖时长', signals.durationSeconds, 's', 3);
  return observation;
}

/** Additional report measurements retain their original units and acquisition timeline. */
export function buildGaitDetails(data, mappedTrail = null) {
  const source = isObject(data) ? data : {};
  if (source._generated === true) {
    return {
      observation: [],
      symmetry: [],
      signals: { durationSeconds: null, startSeconds: null, endSeconds: null, channels: [] },
    };
  }

  const signals = buildSignals(source);
  return {
    observation: buildObservation(source, mappedTrail, signals),
    symmetry: buildSymmetry(isObject(source.gaitParams) ? source.gaitParams : {}),
    signals,
  };
}
