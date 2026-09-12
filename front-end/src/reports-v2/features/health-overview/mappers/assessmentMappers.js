import { staticContent } from '../data/staticContent.js';
import { formatMetric } from '../utils/formatters.js';
import { clampPercent, finiteOrNull } from '../utils/validators.js';
import {
  representativeStandingCop,
  standingCopMetrics,
} from '../../../../lib/standingCopContract.js';

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

function textOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function view(type, data, metrics, score, presentation = {}) {
  if (!data) {
    return unavailable(type);
  }

  const content = staticContent.abilities[type];
  const normalizedScore = finiteOrNull(score) === null ? null : clampPercent(score);
  const isGood = normalizedScore !== null && normalizedScore >= 80;
  const statusLabel = textOrNull(presentation.statusLabel)
    || (normalizedScore === null ? '数据不足' : (isGood ? content.status.good : content.status.caution));
  const statusTone = normalizedScore === null
    ? (statusLabel === '数据异常' ? 'caution' : 'muted')
    : (isGood ? 'positive' : 'caution');

  return {
    type,
    title: content.title,
    description: content.description,
    available: true,
    score: normalizedScore,
    status: { label: statusLabel, tone: statusTone },
    metrics,
    insight: textOrNull(presentation.insight) || content.insight,
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

function percentOrNull(value) {
  const numericValue = finiteOrNull(value);
  return numericValue !== null && numericValue >= 0 && numericValue <= 100
    ? numericValue
    : null;
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

function standingInsight(leftWeight, rightWeight, sway, usesRepresentativeFootCop, hasScore) {
  const parts = [];
  if (leftWeight !== null && rightWeight !== null) {
    const difference = Math.abs(leftWeight - rightWeight);
    if (difference <= 10) {
      parts.push(`左右承重相差 ${formatMetric(difference, 1)}%，分布较接近`);
    } else {
      const heavierSide = leftWeight > rightWeight ? '左脚' : '右脚';
      parts.push(`${heavierSide}承重较多，左右相差 ${formatMetric(difference, 1)}%`);
    }
  }
  if (sway !== null) {
    const copLabel = usesRepresentativeFootCop ? '代表侧单足 COP' : '整体 COP';
    parts.push(`${copLabel} 最大摆动范围约 ${formatMetric(sway, 1)} mm`);
  }
  return parts.length
    ? `${parts.join('；')}。`
    : (hasScore
      ? '本次已生成站立评分，但承重与 COP 摆动范围数据不足。'
      : '本次站立数据不足，暂不能形成综合评分。');
}

function gaitInsight(speed, stepLength, cadence, symmetry) {
  const parts = [];
  if (speed !== null) parts.push(`步速 ${formatMetric(speed, 2)} m/s`);
  if (stepLength !== null) parts.push(`平均同脚步幅 ${formatMetric(stepLength, 2)} m`);
  if (cadence !== null) parts.push(`步频 ${formatMetric(cadence, 0)} 步/分`);
  if (symmetry !== null) parts.push(`同脚周期对称性 ${formatMetric(symmetry, 0)}%`);
  return parts.length ? `${parts.join('，')}。` : '本次步态时空参数数据不足。';
}

export function mapStandingAssessment(assessment) {
  const data = reportDataFor(assessment);
  if (!data) {
    return unavailable('standing');
  }

  const score = percentOrNull(data.score);
  const weight = isObject(data.metrics?.weight) ? data.metrics.weight : {};
  const leftWeight = percentOrNull(weight.leftPercent);
  const rightWeight = percentOrNull(weight.rightPercent);
  const hasWeight = leftWeight !== null
    && rightWeight !== null
    && Math.abs(leftWeight + rightWeight - 100) < 0.001;
  const weightDifference = hasWeight ? Math.abs(leftWeight - rightWeight) : null;
  const backendCop = representativeStandingCop(data);
  const cop = standingCopMetrics(data);
  const swayRanges = [
    nonNegativeOrNull(cop.delta_x ?? cop.deltaX ?? cop.rangeX),
    nonNegativeOrNull(cop.delta_y ?? cop.deltaY ?? cop.rangeY),
  ].filter((value) => value !== null);
  const sway = swayRanges.length ? Math.max(...swayRanges) : null;
  const usesRepresentativeFootCop = Boolean(backendCop);
  const content = staticContent.abilities.standing.metrics;
  const swayMetric = usesRepresentativeFootCop
    ? { ...content.sway, label: '代表侧 COP 摆动范围' }
    : content.sway;

  return view('standing', data, [
    metric(content.balance, weightDifference),
    metric(swayMetric, sway),
  ], score, {
    statusLabel: data.status,
    insight: standingInsight(leftWeight, rightWeight, sway, usesRepresentativeFootCop, score !== null),
  });
}

export function mapGaitAssessment(assessment) {
  const data = reportDataFor(assessment);
  if (!data) {
    return unavailable('gait');
  }

  const params = isObject(data.gaitParams) ? data.gaitParams : {};
  const speed = positiveOrNull(params.walkingSpeed);
  const score = percentOrNull(data.score);
  const leftStepLength = nonNegativeOrNull(params.leftStepLength);
  const rightStepLength = nonNegativeOrNull(params.rightStepLength);
  const leftStepTime = positiveOrNull(params.leftStepTime);
  const rightStepTime = positiveOrNull(params.rightStepTime);
  const rhythm = isObject(data.abilities?.rhythm) ? data.abilities.rhythm : {};
  const averageStepLengthCm = average(leftStepLength, rightStepLength);
  const strideLength = positiveOrNull(rhythm.stepLengthM)
    ?? (averageStepLengthCm === null ? null : averageStepLengthCm / 100);
  const stepTime = average(leftStepTime, rightStepTime);
  const cadence = positiveOrNull(rhythm.cadenceStepsPerMinute)
    ?? (stepTime === null ? null : 120 / stepTime);
  const symmetryDifference = relativeDifference(leftStepTime, rightStepTime);
  const symmetry = symmetryDifference === null ? null : 100 - symmetryDifference;
  const content = staticContent.abilities.gait.metrics;

  return view('gait', data, [
    metric(content.speed, speed),
    metric(content.length, strideLength),
    metric(content.cadence, cadence, 0),
    metric(content.symmetry, symmetry, 0),
  ], score, {
    statusLabel: data.status,
    insight: gaitInsight(speed, strideLength, cadence, symmetry),
  });
}
