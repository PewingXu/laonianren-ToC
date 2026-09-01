import { staticContent } from '../data/staticContent';
import { formatMetric } from '../utils/formatters';
import { clampPercent, finiteOrNull } from '../utils/validators';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function reportDataFor(assessment) {
  const reportData = assessment?.report?.reportData;
  return assessment?.completed === true && isObject(reportData) ? reportData : null;
}

function metric(copy, value, fractionDigits = 2) {
  return { ...copy, value: formatMetric(value, fractionDigits) };
}

function unavailable(type) {
  const content = staticContent.abilities[type];
  return {
    type,
    title: content.title,
    description: content.description,
    available: false,
    score: 0,
    status: { label: '尚未完成', tone: 'muted' },
    metrics: [],
    insight: '本项评估尚未完成。',
    image: content.image,
  };
}

function view(type, data, metrics, score) {
  if (!data) {
    return unavailable(type);
  }

  const content = staticContent.abilities[type];
  const normalizedScore = clampPercent(score);
  const isGood = normalizedScore >= 80;

  return {
    type,
    title: content.title,
    description: content.description,
    available: true,
    score: normalizedScore,
    status: { label: isGood ? content.status.good : content.status.caution, tone: isGood ? 'positive' : 'caution' },
    metrics,
    insight: content.insight,
    image: content.image,
  };
}

function average(left, right) {
  const values = [finiteOrNull(left), finiteOrNull(right)].filter((value) => value !== null);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function nonNegativeOrNull(value) {
  const numericValue = finiteOrNull(value);
  return numericValue !== null && numericValue >= 0 ? numericValue : null;
}

function positiveOrNull(value) {
  const numericValue = finiteOrNull(value);
  return numericValue !== null && numericValue > 0 ? numericValue : null;
}

function relativeDifference(left, right) {
  const leftValue = finiteOrNull(left);
  const rightValue = finiteOrNull(right);
  const divisor = Math.max(Math.abs(leftValue || 0), Math.abs(rightValue || 0));
  return leftValue === null || rightValue === null || divisor === 0
    ? null
    : Math.abs(leftValue - rightValue) / divisor * 100;
}

export function mapGripAssessment(assessment) {
  const data = reportDataFor(assessment);
  if (!data) {
    return unavailable('grip');
  }

  const leftForce = nonNegativeOrNull(data.left?.totalForce);
  const rightForce = nonNegativeOrNull(data.right?.totalForce);
  const difference = relativeDifference(leftForce, rightForce);
  if (difference === null) {
    return unavailable('grip');
  }
  const score = 100 - difference;
  const content = staticContent.abilities.grip.metrics;

  return view('grip', data, [
    metric(content.left, leftForce),
    metric(content.right, rightForce),
    metric(content.difference, difference),
  ], score);
}

export function mapSitStandAssessment(assessment) {
  const data = reportDataFor(assessment);
  if (!data) {
    return unavailable('sitstand');
  }

  const stats = isObject(data.duration_stats) ? data.duration_stats : {};
  const duration = positiveOrNull(stats.avg_duration);
  if (duration === null) {
    return unavailable('sitstand');
  }
  const kneeStrength = nonNegativeOrNull(data.kneeStrength ?? data.kneeTorque);
  const durations = Array.isArray(stats.cycle_durations)
    ? stats.cycle_durations.map(positiveOrNull).filter((value) => value !== null)
    : [];
  const stability = durations.length > 1
    ? clampPercent(100 - Math.max(...durations.map((value) => Math.abs(value - duration))) * 100)
    : null;
  const score = duration === null ? 0 : 100 - Math.max(0, duration - 1.2) * 20;
  const content = staticContent.abilities.sitstand.metrics;

  return view('sitstand', data, [
    metric(content.duration, duration),
    metric(content.kneeStrength, kneeStrength),
    metric(content.stability, stability, 0),
  ], score);
}

function standingFootSources(data, side) {
  const candidates = [
    data,
    data.arch_features,
    data.additional_data,
    data.arch_features?.additional_data,
  ].filter(isObject);

  return candidates
    .map((candidate) => candidate[side] || candidate[`${side}Foot`] || candidate[`${side}_foot`])
    .filter(isObject);
}

function footValue(foot, ...keys) {
  for (const key of keys) {
    const value = finiteOrNull(foot?.[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function standingFootValue(footSources, ...keys) {
  for (const foot of footSources) {
    const value = footValue(foot, ...keys);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

export function mapStandingAssessment(assessment) {
  const data = reportDataFor(assessment);
  if (!data) {
    return unavailable('standing');
  }

  const leftFeet = standingFootSources(data, 'left');
  const rightFeet = standingFootSources(data, 'right');
  const leftArch = standingFootValue(leftFeet, 'archIndex', 'arch_index');
  const rightArch = standingFootValue(rightFeet, 'archIndex', 'arch_index');
  const archValuesAreValid = [leftArch, rightArch].every((value) => value !== null && value >= 0 && value <= 1);
  const archDifference = archValuesAreValid ? relativeDifference(leftArch, rightArch) : null;
  if (archDifference === null) {
    return unavailable('standing');
  }
  const sway = average(
    nonNegativeOrNull(standingFootValue(leftFeet, 'sway', 'swayAmplitude', 'sway_amplitude')),
    nonNegativeOrNull(standingFootValue(rightFeet, 'sway', 'swayAmplitude', 'sway_amplitude')),
  );
  const score = 100 - archDifference * 2;
  const content = staticContent.abilities.standing.metrics;

  return view('standing', data, [
    metric(content.balance, archDifference),
    metric(content.sway, sway),
  ], score);
}

export function mapGaitAssessment(assessment) {
  const data = reportDataFor(assessment);
  if (!data) {
    return unavailable('gait');
  }

  const params = isObject(data.gaitParams) ? data.gaitParams : {};
  const speed = positiveOrNull(params.walkingSpeed);
  if (speed === null) {
    return unavailable('gait');
  }
  const leftStepLength = nonNegativeOrNull(params.leftStepLength);
  const rightStepLength = nonNegativeOrNull(params.rightStepLength);
  const leftStepTime = positiveOrNull(params.leftStepTime);
  const rightStepTime = positiveOrNull(params.rightStepTime);
  const strideLength = average(leftStepLength, rightStepLength);
  const stepTime = average(leftStepTime, rightStepTime);
  const cadence = stepTime === null ? null : 60 / stepTime;
  const symmetryDifference = relativeDifference(leftStepTime, rightStepTime);
  const symmetry = symmetryDifference === null ? null : 100 - symmetryDifference;
  const score = 100 - Math.abs(speed - 1.1) * 100;
  const content = staticContent.abilities.gait.metrics;

  return view('gait', data, [
    metric(content.speed, speed),
    metric(content.length, strideLength),
    metric(content.cadence, cadence, 0),
    metric(content.symmetry, symmetry, 0),
  ], score);
}
