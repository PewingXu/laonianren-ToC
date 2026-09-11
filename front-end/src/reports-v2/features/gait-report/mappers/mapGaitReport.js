import { finiteOrNull, parseCalendarDate } from '../../health-overview/utils/validators.js';
import { buildGaitDetails } from './buildGaitDetails.js';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function positiveOrNull(value) {
  const numericValue = finiteOrNull(value);
  return numericValue !== null && numericValue > 0 ? numericValue : null;
}

function nonNegativeOrNull(value) {
  const numericValue = finiteOrNull(value);
  return numericValue !== null && numericValue >= 0 ? numericValue : null;
}

function percentOrNull(value) {
  const numericValue = finiteOrNull(value);
  return numericValue !== null && numericValue >= 0 && numericValue <= 100
    ? numericValue
    : null;
}

function boundedChangeOrNull(value) {
  const numericValue = finiteOrNull(value);
  return numericValue !== null && numericValue >= -100 && numericValue <= 100
    ? Math.round(numericValue)
    : null;
}

function textOr(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function formatReportTime(value) {
  const parsed = parseCalendarDate(value);
  if (!parsed) return '';

  const date = [parsed.year, parsed.month, parsed.day]
    .map((part, index) => (index === 0 ? String(part).padStart(4, '0') : String(part).padStart(2, '0')))
    .join('-');
  return parsed.hour === null
    ? date
    : `${date} ${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`;
}

function mapPeerComparison(value) {
  const percentile = isObject(value) ? percentOrNull(value.percentile) : null;
  const sampleSize = isObject(value) ? positiveOrNull(value.sampleSize) : null;
  const hasPeerComparison = percentile !== null && sampleSize !== null;

  return hasPeerComparison
    ? {
      hasPeerComparison,
      peerPercentile: roundTo(percentile, 1),
      peerSampleSize: Math.round(sampleSize),
    }
    : { hasPeerComparison: false, peerPercentile: null, peerSampleSize: null };
}

const TAG_ICONS = new Set(['check-circle', 'scale', 'footprints']);

function mapTags(value, { score, coordinationStatus } = {}) {
  if (!Array.isArray(value) || value.length > 3) return [];

  return value
    .map((tag) => {
      if (!isObject(tag)) return null;
      let label = textOr(tag.label, '');
      const icon = textOr(tag.icon, '');
      if (/^\d+(?:\.\d+)?\s*\/\s*25\s*分$/.test(label) && Number.isFinite(score)) {
        label = `综合评分 ${score} 分`;
      }
      if (
        ['左右步态基本对称', '左右步态需关注', '左右对称数据不足'].includes(label)
        && coordinationStatus
      ) {
        label = coordinationStatus;
      }
      return label && TAG_ICONS.has(icon) ? { label, icon } : null;
    })
    .filter(Boolean);
}

function formatHeroNumber(value) {
  return Number.isInteger(value) ? String(value) : String(roundTo(value, 2));
}

function buildHeroScoreTitle(score, fallback) {
  if (score === null) return fallback;
  return `步态综合评分 ${formatHeroNumber(score / 4)} / 25 分`;
}

function buildHeroFindings(gaitParams, abilities) {
  const walkingSpeed = roundTo(positiveOrNull(gaitParams.walkingSpeed), 2);
  const leftStepLength = roundTo(positiveOrNull(gaitParams.leftStepLength), 1);
  const rightStepLength = roundTo(positiveOrNull(gaitParams.rightStepLength), 1);
  const rhythm = abilities.find((ability) => ability.id === 'rhythm');
  const findings = [];

  if (walkingSpeed !== null) {
    findings.push({
      title: `整体步速 ${formatHeroNumber(walkingSpeed)} m/s`,
      icon: 'footprints',
    });
  }
  if (leftStepLength !== null && rightStepLength !== null) {
    findings.push({
      title: `左右步幅差 ${formatHeroNumber(Math.abs(leftStepLength - rightStepLength))} cm`,
      icon: 'scale',
    });
  }
  if (findings.length < 2 && rhythm?.cadenceStepsPerMinute !== null) {
    findings.push({
      title: `步频 ${formatHeroNumber(rhythm.cadenceStepsPerMinute)} 步/分钟`,
      icon: 'check-circle',
    });
  }

  return findings.slice(0, 2);
}

function mapSummary(data) {
  const value = isObject(data.assessmentSummary) ? data.assessmentSummary : {};

  return {
    body: textOr(value.body, '暂无详细评估摘要。'),
    changeScore: boundedChangeOrNull(value.changeScore),
    strength: textOr(value.strength, '数据不足'),
    explanation: textOr(data.scoreExplanation, '暂无评分说明。'),
  };
}

const RECOMMENDATION_ICONS = new Set(['walking', 'stretch', 'water']);
const RECOMMENDATION_TONES = new Set(['green', 'orange', 'blue']);

function mapRecommendations(value, coordinationStatus = '') {
  if (!Array.isArray(value) || value.length !== 3) return [];

  const recommendations = value.map((recommendation) => {
    if (!isObject(recommendation)) return null;

    const id = textOr(recommendation.id, '');
    let title = textOr(recommendation.title, '');
    let description = textOr(recommendation.description, '');
    const icon = textOr(recommendation.icon, '');
    const tone = textOr(recommendation.tone, '');

    if (
      !id
      || !title
      || !description
      || !RECOMMENDATION_ICONS.has(icon)
      || !RECOMMENDATION_TONES.has(tone)
    ) return null;

    if (id === 'symmetry-practice' && /累计负荷较高/.test(coordinationStatus)) {
      title = '关注左右负荷差异';
      description = '练习时关注双脚均匀落地，并留意两侧落脚距离与节奏；如差异持续，可咨询康复专业人员。';
    }

    return { id, title, description, icon, tone };
  });

  return recommendations.every(Boolean) ? recommendations : [];
}

function mapTrend(value) {
  if (!isObject(value) || !Array.isArray(value.points) || value.points.length !== 4) {
    return null;
  }

  const summary = textOr(value.summary, '');
  const note = textOr(value.note, '');
  if (!summary || !note) return null;

  let previousDateNumber = null;
  const points = [];

  for (const point of value.points) {
    if (!isObject(point)) return null;

    const date = textOr(point.date, '');
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? parseCalendarDate(date) : null;
    if (!parsed) return null;

    const dateNumber = (parsed.year * 10000) + (parsed.month * 100) + parsed.day;
    if (previousDateNumber !== null && dateNumber <= previousDateNumber) return null;

    points.push({
      date,
      label: `${String(parsed.month).padStart(2, '0')}/${String(parsed.day).padStart(2, '0')}`,
    });
    previousDateNumber = dateNumber;
  }

  return { summary, note, points };
}

const PROFESSIONAL_ANALYSIS_CONTRACT = [
  {
    id: 'stability',
    title: '步态稳定性分析',
    status: '表现优秀',
    icon: 'stability',
    tone: 'green',
  },
  {
    id: 'pressure',
    title: '足底压力分布',
    status: '均衡 (48% / 52%)',
    icon: 'pressure',
    tone: 'neutral',
  },
  {
    id: 'symmetry',
    title: '行走对称性分析',
    status: '高度对称',
    icon: 'symmetry',
    tone: 'green',
  },
];

function mapProfessionalAnalysis(value) {
  if (!Array.isArray(value) || value.length !== PROFESSIONAL_ANALYSIS_CONTRACT.length) return [];

  const analysis = value.map((item, index) => {
    if (!isObject(item)) return null;

    const expected = PROFESSIONAL_ANALYSIS_CONTRACT[index];

    const id = textOr(item.id, '');
    const title = textOr(item.title, '');
    const description = textOr(item.description, '');
    const status = textOr(item.status, '');
    const detail = textOr(item.detail, '');
    const icon = textOr(item.icon, '');
    const tone = textOr(item.tone, '');

    if (
      id !== expected.id
      || title !== expected.title
      || !description
      || status !== expected.status
      || !detail
      || icon !== expected.icon
      || tone !== expected.tone
    ) return null;

    return { id, title, description, status, detail, icon, tone };
  });

  return analysis.every(Boolean) ? analysis : [];
}

function buildReminderDate(value, days) {
  const parsed = parseCalendarDate(value);
  if (!parsed || !Number.isInteger(days) || days < 1 || days > 365) return null;

  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return date.toISOString().slice(0, 10);
}

function mapRetestReminder(value, recordedAt) {
  if (!isObject(value)) return null;

  const days = finiteOrNull(value.days);
  const title = textOr(value.title, '');
  const description = textOr(value.description, '');
  const actionLabel = textOr(value.actionLabel, '');
  const reminderDate = buildReminderDate(recordedAt, days);

  return title && description && actionLabel && reminderDate
    ? { days, title, description, actionLabel, reminderDate }
    : null;
}

function rangeOrNull(value, precision = 2) {
  if (!isObject(value)) return null;

  const min = finiteOrNull(value.min);
  const max = finiteOrNull(value.max);
  return min !== null && min >= 0 && max !== null && min < max
    ? { min: roundTo(min, precision), max: roundTo(max, precision) }
    : null;
}

const FOOTER_FALLBACKS = {
  tip: '步态可作为行走能力的参考指标，建议结合专业意见安排复测。',
  disclaimer: '免责声明：本报告仅供参考，不能替代专业医疗诊断。如有不适，请及时就医。',
  copyright: '© 矩侨工业 保留所有权利。',
};

function mapFooter(value) {
  const source = isObject(value) ? value : {};
  return Object.fromEntries(
    Object.entries(FOOTER_FALLBACKS).map(([key, fallback]) => [key, textOr(source[key], fallback)]),
  );
}

function roundTo(value, precision) {
  if (value === null) return null;
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function progressPercent(value, maximum) {
  return value !== null && maximum !== null
    ? Math.min(100, roundTo((value / maximum) * 100, 2))
    : null;
}

function coordinatePair(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const first = nonNegativeOrNull(value[0]);
  const second = nonNegativeOrNull(value[1]);
  return first === null || second === null ? null : [first, second];
}

function mapPeakFootprintMatrix(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 256) return null;
  const width = Array.isArray(value[0]) ? value[0].length : 0;
  if (width === 0 || width > 128) return null;

  let hasPressure = false;
  const matrix = [];
  for (const sourceRow of value) {
    if (!Array.isArray(sourceRow) || sourceRow.length !== width) return null;
    const row = [];
    for (const sourceValue of sourceRow) {
      const pressure = nonNegativeOrNull(sourceValue);
      if (pressure === null) return null;
      if (pressure > 0) hasPressure = true;
      row.push(roundTo(pressure, 1));
    }
    matrix.push(row);
  }
  return hasPressure ? matrix : null;
}

function mapFootprintTrail(value) {
  const trail = isObject(value) ? value : {};
  const sensorSize = coordinatePair(trail.sensorSize);
  const sensorPitchMm = positiveOrNull(trail.sensorPitchMm);
  const sourceSteps = Array.isArray(trail.steps) && trail.steps.length <= 64
    ? trail.steps
    : [];
  const mappedSteps = sourceSteps.map((sourceStep) => {
    if (!isObject(sourceStep) || typeof sourceStep.isRight !== 'boolean') return null;
    const frameIndex = nonNegativeOrNull(sourceStep.frameIndex);
    const origin = coordinatePair(sourceStep.origin);
    const center = coordinatePair(sourceStep.center);
    const matrix = mapPeakFootprintMatrix(sourceStep.matrix);
    if (frameIndex === null || !origin || !center || !matrix) return null;

    const isBaseline = sourceStep.isBaseline === true;
    const rawStepIndex = positiveOrNull(sourceStep.stepIndex);
    const stepIndex = !isBaseline && Number.isInteger(rawStepIndex) ? rawStepIndex : null;
    if (!isBaseline && stepIndex === null) return null;

    return {
      frameIndex: Math.round(frameIndex),
      isRight: sourceStep.isRight,
      isBaseline,
      stepIndex,
      stepLabel: textOr(
        sourceStep.stepLabel,
        isBaseline
          ? `起始${sourceStep.isRight ? '右脚' : '左脚'}`
          : `第${stepIndex}步${sourceStep.isRight ? '右脚' : '左脚'}`,
      ),
      origin,
      center,
      matrix,
      peakLoadN: roundTo(nonNegativeOrNull(sourceStep.peakLoadN), 1),
      peakSensorForceN: roundTo(nonNegativeOrNull(sourceStep.peakSensorForceN), 1),
    };
  });

  const hasInvalidStep = mappedSteps.some((step) => step === null);
  const steps = mappedSteps.filter((step) => {
    if (!step || !sensorSize) return false;
    const [sensorHeight, sensorWidth] = sensorSize;
    const [originX, originY] = step.origin;
    const [centerX, centerY] = step.center;
    const rowCount = step.matrix.length;
    const columnCount = step.matrix[0].length;
    return originX + columnCount <= sensorWidth
      && originY + rowCount <= sensorHeight
      && centerX >= originX
      && centerX <= originX + columnCount - 1
      && centerY >= originY
      && centerY <= originY + rowCount - 1;
  }).sort((left, right) => left.frameIndex - right.frameIndex);

  const measuredSteps = steps.filter((step) => !step.isBaseline);
  const available = trail.quality?.valid === true
    && Array.isArray(trail.steps)
    && trail.steps.length > 0
    && trail.steps.length <= 64
    && !hasInvalidStep
    && steps.length === sourceSteps.length
    && sensorSize !== null
    && sensorPitchMm !== null
    && measuredSteps.length > 0;

  return {
    available,
    sensorSize: sensorSize || [0, 0],
    sensorPitchCm: sensorPitchMm === null ? null : roundTo(sensorPitchMm / 10, 2),
    steps: available ? steps : [],
    stepCount: available ? measuredSteps.length : 0,
    baselineCount: available ? steps.length - measuredSteps.length : 0,
    note: available
      ? `共映射 ${measuredSteps.length} 步接触面积峰值帧足印；足印位置及左右间距按 ${roundTo(sensorPitchMm / 10, 2)} cm 传感器网格等比例绘制。`
      : '未取得可用的逐步压力峰值帧，暂不能生成足印行走图。',
  };
}

function buildKeyMetrics(gaitParams, abilities) {
  const rhythm = abilities.find((ability) => ability.id === 'rhythm') || {};
  const leftCycleTime = roundTo(positiveOrNull(gaitParams.leftStepTime), 3);
  const rightCycleTime = roundTo(positiveOrNull(gaitParams.rightStepTime), 3);
  const cadenceNote = leftCycleTime !== null && rightCycleTime !== null
    ? '由左右同脚周期换算'
    : leftCycleTime !== null
      ? '由左脚同脚周期换算'
      : rightCycleTime !== null
        ? '由右脚同脚周期换算'
        : null;

  return [
    {
      id: 'speed',
      label: '整体步速',
      value: roundTo(positiveOrNull(gaitParams.walkingSpeed), 2),
      unit: 'm/s',
      tone: 'green',
    },
    {
      id: 'cadence',
      label: '步频',
      value: rhythm.cadenceStepsPerMinute ?? null,
      unit: '步/分钟',
      note: cadenceNote,
      tone: 'blue',
    },
    {
      id: 'cycleTime',
      label: '同脚周期',
      left: leftCycleTime,
      right: rightCycleTime,
      unit: 's',
      supplement: {
        label: '对侧步时',
        value: roundTo(positiveOrNull(gaitParams.crossStepTime), 3),
        unit: 's',
      },
      tone: 'purple',
    },
    {
      id: 'stepLength',
      label: '同脚步幅',
      left: roundTo(positiveOrNull(gaitParams.leftStepLength), 1),
      right: roundTo(positiveOrNull(gaitParams.rightStepLength), 1),
      unit: 'cm',
      supplement: {
        label: '对侧步长',
        value: roundTo(positiveOrNull(gaitParams.crossStepLength), 1),
        unit: 'cm',
      },
      tone: 'green',
    },
    {
      id: 'stepWidth',
      label: '步宽',
      value: roundTo(positiveOrNull(gaitParams.stepWidth), 1),
      unit: 'cm',
      tone: 'blue',
    },
    {
      id: 'doubleContactTime',
      label: '估算双脚同时着地时间',
      value: roundTo(positiveOrNull(gaitParams.doubleContactTime), 3),
      unit: 's',
      note: '由步态周期按算法比例估算，非直接测量',
      tone: 'orange',
    },
    {
      id: 'fpa',
      label: '平均足偏角 (FPA)',
      left: roundTo(finiteOrNull(gaitParams.leftFPA), 1),
      right: roundTo(finiteOrNull(gaitParams.rightFPA), 1),
      unit: '°',
      tone: 'orange',
    },
  ];
}

const BALANCE_REGIONS = [
  { id: 'whole', key: '整足平衡', label: '整足', curveIndexes: [1, 2, 4, 5] },
  { id: 'forefoot', key: '前足平衡', label: '前足', curveIndexes: [1, 2] },
  { id: 'heel', key: '足跟平衡', label: '足跟', curveIndexes: [4, 5] },
];

function balanceNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  return nonNegativeOrNull(value);
}

function mapBalanceStats(value) {
  const stats = isObject(value) ? value : {};
  return {
    peak: roundTo(balanceNumber(stats['峰值']), 1),
    mean: roundTo(balanceNumber(stats['均值']), 1),
    standardDeviation: roundTo(balanceNumber(stats['标准差']), 1),
  };
}

function balanceCurveEvidence(curves, indexes) {
  if (!Array.isArray(curves)) return { valid: false, hasLoad: false };
  const series = indexes.map((index) => {
    const values = curves[index]?.data;
    if (!Array.isArray(values) || !values.length) return null;
    const parsed = values.map(balanceNumber);
    return parsed.every((item) => item !== null) ? parsed : null;
  });
  const valid = series.every((values) => values !== null && values.length === series[0]?.length);
  return {
    valid,
    hasLoad: valid && series.some((values) => values.some((item) => item > 0)),
  };
}

function mapBalanceMetrics(value, { legacyGenerated = false, partitionCurves } = {}) {
  if (!isObject(value)) return null;

  const sides = {};
  for (const side of ['left', 'right']) {
    const sideStats = isObject(value[side]) ? value[side] : {};
    const hasNonzeroStats = BALANCE_REGIONS.some((region) => (
      ['峰值', '均值', '标准差'].some((key) => balanceNumber(sideStats[region.key]?.[key]) > 0)
    ));
    const hasExplicitCurves = partitionCurves !== undefined
      && (!isObject(partitionCurves) || Object.hasOwn(partitionCurves, side));
    const curves = partitionCurves?.[side];
    const wholeEvidence = balanceCurveEvidence(curves, [1, 2, 4, 5]);
    // Python also emits all-zero statistics when its partition sample is absent.
    const hasMeasuredSide = hasNonzeroStats || (wholeEvidence.valid && wholeEvidence.hasLoad);
    sides[side] = BALANCE_REGIONS.map((region) => {
      const evidence = balanceCurveEvidence(curves, region.curveIndexes);
      return hasMeasuredSide && (!hasExplicitCurves || (evidence.valid && evidence.hasLoad))
        ? mapBalanceStats(sideStats[region.key])
        : mapBalanceStats(null);
    });
  }

  const rows = BALANCE_REGIONS.map((region, index) => ({
    id: region.id,
    label: region.label,
    left: sides.left[index],
    right: sides.right[index],
  }));
  const hasMeasuredValue = rows.some((row) => (
    [...Object.values(row.left), ...Object.values(row.right)]
      .some((item) => item !== null)
  ));

  if (!hasMeasuredValue) return null;

  return legacyGenerated
    ? {
      title: '足底分区统计',
      description: '显示整足、前足和足跟的峰值、均值及标准差。',
      unit: '原始值',
      rows,
    }
    : {
      title: '足内外侧力差',
      description: '取本次首个分区接触片段，反映同一只脚内侧与外侧受力差的绝对值，不是足底总压力。',
      unit: 'N',
      rows,
    };
}

function buildAbilities(data, gaitParams) {
  const abilities = isObject(data.abilities) ? data.abilities : {};
  const fallbackNote = '暂无可靠的能力解读数据。';

  const stability = isObject(abilities.stability) ? abilities.stability : {};
  const foreAftSwayCm = roundTo(nonNegativeOrNull(stability.foreAftSwayCm), 2);
  const lateralSwayCm = roundTo(nonNegativeOrNull(stability.lateralSwayCm), 2);
  const swayScaleMaxCm = roundTo(positiveOrNull(stability.swayScaleMaxCm), 2);
  const stepTimeCvPercent = roundTo(nonNegativeOrNull(stability.stepTimeCvPercent), 2);
  const stepDistanceCvPercent = roundTo(nonNegativeOrNull(stability.stepDistanceCvPercent), 2);
  const explicitStabilityMode = [
    'stepVariability',
    'bodySway',
  ].includes(stability.metricMode)
    ? stability.metricMode
    : null;
  const stabilityMode = explicitStabilityMode
    || (stepTimeCvPercent !== null && stepDistanceCvPercent !== null
      ? 'stepVariability'
      : 'bodySway');
  const hasStabilityData = stabilityMode === 'stepVariability'
    ? stepTimeCvPercent !== null && stepDistanceCvPercent !== null
    : foreAftSwayCm !== null && lateralSwayCm !== null;
  const stabilityValues = stabilityMode === 'stepVariability'
    ? [stepTimeCvPercent, stepDistanceCvPercent]
    : [];
  const measuredStabilityValues = stabilityValues.filter((value) => value !== null);
  const variabilityScaleMax = measuredStabilityValues.length
    ? Math.max(
      stabilityMode === 'stepVariability' ? 20 : 15,
      Math.ceil(Math.max(...measuredStabilityValues) / 5) * 5,
    )
    : null;

  const coordination = isObject(abilities.coordination) ? abilities.coordination : {};
  const rawLeftLoadPercent = percentOrNull(coordination.leftLoadPercent);
  const rawRightLoadPercent = percentOrNull(coordination.rightLoadPercent);
  const hasCoordinationData = rawLeftLoadPercent !== null
    && rawRightLoadPercent !== null
    && Math.abs(rawLeftLoadPercent + rawRightLoadPercent - 100) < 0.001;
  const leftLoadPercent = hasCoordinationData ? roundTo(rawLeftLoadPercent, 1) : null;
  const rightLoadPercent = hasCoordinationData
    ? roundTo(100 - leftLoadPercent, 1)
    : null;
  const leftStepTime = positiveOrNull(gaitParams.leftStepTime);
  const rightStepTime = positiveOrNull(gaitParams.rightStepTime);
  const leftStepLength = positiveOrNull(gaitParams.leftStepLength);
  const rightStepLength = positiveOrNull(gaitParams.rightStepLength);
  const hasBilateralSpatiotemporal = leftStepTime !== null
    && rightStepTime !== null
    && leftStepLength !== null
    && rightStepLength !== null;
  const hasCoordinationInterpretation = hasCoordinationData || hasBilateralSpatiotemporal;
  const stepLengthDifference = hasBilateralSpatiotemporal
    ? roundTo(Math.abs(leftStepLength - rightStepLength), 2)
    : null;
  const cycleTimeDifference = hasBilateralSpatiotemporal
    ? roundTo(Math.abs(leftStepTime - rightStepTime), 2)
    : null;
  const loadComparison = hasCoordinationData
    ? (Math.abs(leftLoadPercent - rightLoadPercent) <= 10
      ? '累计负荷较均衡'
      : `${leftLoadPercent > rightLoadPercent ? '左侧' : '右侧'}累计负荷较高`)
    : '';
  const derivedCoordinationStatus = hasBilateralSpatiotemporal
    ? [
      stepLengthDifference < 6 && cycleTimeDifference < 0.12
        ? '时空参数基本对称'
        : '时空参数需关注',
      loadComparison,
    ].filter(Boolean).join('，')
    : (loadComparison || '数据不足');
  const derivedCoordinationNote = [
    hasCoordinationData
      ? `累计足底负荷占比为左脚 ${leftLoadPercent}%、右脚 ${rightLoadPercent}%`
      : null,
    hasBilateralSpatiotemporal
      ? `左右同脚步幅差 ${stepLengthDifference} cm、同脚周期差 ${cycleTimeDifference} s`
      : null,
  ].filter(Boolean).join('；');

  const rhythm = isObject(abilities.rhythm) ? abilities.rhythm : {};
  const cycleTimes = [leftStepTime, rightStepTime].filter((value) => value !== null);
  // 算法给的是同脚相邻峰值的周期时长；每个同脚周期包含两步。
  const legacyCadence = cycleTimes.length
    ? roundTo(120 / (cycleTimes.reduce((sum, value) => sum + value, 0) / cycleTimes.length), 0)
    : null;
  const stepLengthsCm = [leftStepLength, rightStepLength].filter((value) => value !== null);
  const legacyStepLength = stepLengthsCm.length
    ? roundTo(
      (stepLengthsCm.reduce((sum, value) => sum + value, 0) / stepLengthsCm.length) / 100,
      2,
    )
    : null;
  const cadenceStepsPerMinute = roundTo(
    positiveOrNull(rhythm.cadenceStepsPerMinute) ?? legacyCadence,
    0,
  );
  const stepLengthM = roundTo(
    positiveOrNull(rhythm.stepLengthM) ?? legacyStepLength,
    2,
  );
  const hasRhythmData = cadenceStepsPerMinute !== null || stepLengthM !== null;
  const derivedRhythmNote = [
    cadenceStepsPerMinute !== null ? `由同脚周期换算的步频约 ${cadenceStepsPerMinute} 步/分钟` : null,
    stepLengthM !== null ? `已测同脚步幅约 ${stepLengthM} m` : null,
  ].filter(Boolean).join('，');

  const direction = isObject(abilities.direction) ? abilities.direction : {};
  const directionMode = 'pathDeviation';
  const pathDeviationCm = roundTo(nonNegativeOrNull(direction.pathDeviationCm), 2);
  const maxPathDeviationCm = roundTo(nonNegativeOrNull(direction.maxPathDeviationCm), 2);
  const validStepCountValue = positiveOrNull(direction.validStepCount);
  const validStepCount = Number.isInteger(validStepCountValue) ? validStepCountValue : null;
  const forwardSpanCm = roundTo(nonNegativeOrNull(direction.forwardSpanCm), 1);
  const hasPathDirectionData = directionMode === 'pathDeviation'
    && direction.quality?.valid === true
    && pathDeviationCm !== null
    && maxPathDeviationCm !== null
    && validStepCount !== null;
  const hasDirectionData = hasPathDirectionData;
  const derivedDeviationScaleMax = hasPathDirectionData
    ? Math.max(5, Math.ceil(maxPathDeviationCm))
    : null;
  const deviationScaleMaxCm = roundTo(
    positiveOrNull(direction.deviationScaleMaxCm) ?? derivedDeviationScaleMax,
    2,
  );

  return [
    {
      id: 'stability',
      index: '01',
      title: '行走稳定性',
      subtitle: stabilityMode === 'stepVariability'
        ? '相邻落脚的时间与间距是否一致'
        : '身体在行走时是否稳定',
      status: hasStabilityData ? textOr(stability.status, '数据不足') : '数据不足',
      metricMode: stabilityMode,
      foreAftSwayCm,
      lateralSwayCm,
      swayScaleMaxCm,
      foreAftProgressPercent: progressPercent(foreAftSwayCm, swayScaleMaxCm),
      lateralProgressPercent: progressPercent(lateralSwayCm, swayScaleMaxCm),
      stepTimeCvPercent,
      stepDistanceCvPercent,
      validStepCount: Number.isInteger(positiveOrNull(stability.validStepCount))
        ? positiveOrNull(stability.validStepCount)
        : null,
      intervalCount: Number.isInteger(positiveOrNull(stability.intervalCount))
        ? positiveOrNull(stability.intervalCount)
        : null,
      variabilityScaleMax,
      stepTimeProgressPercent: progressPercent(stepTimeCvPercent, variabilityScaleMax),
      stepDistanceProgressPercent: progressPercent(stepDistanceCvPercent, variabilityScaleMax),
      note: textOr(stability.note, fallbackNote),
    },
    {
      id: 'coordination',
      index: '02',
      title: '左右协调性',
      subtitle: '累计足底负荷与双侧时空参数',
      status: hasCoordinationInterpretation
        ? (/^(基本对称|步态基本对称|需关注|步态需关注|已测量)$/.test(
          textOr(coordination.status, ''),
        )
          ? derivedCoordinationStatus
          : textOr(coordination.status, derivedCoordinationStatus))
        : '数据不足',
      leftLoadPercent,
      rightLoadPercent,
      note: hasCoordinationInterpretation
        ? textOr(coordination.note, `${derivedCoordinationNote}。`)
        : fallbackNote,
    },
    {
      id: 'rhythm',
      index: '03',
      title: '步频节奏',
      subtitle: '行走的节奏是否自然稳定',
      status: hasRhythmData ? textOr(rhythm.status, '已测量') : '数据不足',
      cadenceStepsPerMinute,
      stepLengthM,
      cadenceRange: rangeOrNull(rhythm.cadenceRange),
      stepLengthRange: rangeOrNull(rhythm.stepLengthRange),
      note: hasRhythmData ? textOr(rhythm.note, `${derivedRhythmNote}。`) : fallbackNote,
    },
    {
      id: 'direction',
      index: '04',
      title: '方向控制能力',
      subtitle: '足底步迹相对行走路线的偏移',
      status: hasDirectionData ? textOr(direction.status, '已测量') : '数据不足',
      metricMode: directionMode,
      pathDeviationCm: hasPathDirectionData ? pathDeviationCm : null,
      maxPathDeviationCm: hasPathDirectionData ? maxPathDeviationCm : null,
      validStepCount: hasPathDirectionData ? validStepCount : null,
      forwardSpanCm: hasPathDirectionData ? forwardSpanCm : null,
      deviationScaleMaxCm: hasPathDirectionData ? deviationScaleMaxCm : null,
      deviationProgressPercent: hasPathDirectionData
        ? progressPercent(pathDeviationCm, deviationScaleMaxCm)
        : null,
      note: textOr(direction.note, fallbackNote),
    },
  ];
}

export function mapGaitReport(record, report) {
  if (!record?.id || !isObject(record.assessments)) {
    throw new TypeError('Invalid assessment history record');
  }

  const data = isObject(report?.reportData) ? report.reportData : report;
  if (!isObject(data)) return null;

  const gaitParams = isObject(data.gaitParams) ? data.gaitParams : {};
  const walkingSpeed = roundTo(positiveOrNull(gaitParams.walkingSpeed), 2);
  const hasMeasuredGait = [
    walkingSpeed,
    positiveOrNull(gaitParams.leftStepTime),
    positiveOrNull(gaitParams.rightStepTime),
    positiveOrNull(gaitParams.leftStepLength),
    positiveOrNull(gaitParams.rightStepLength),
  ].some((value) => value !== null);
  if (!hasMeasuredGait) return null;

  const score = roundTo(percentOrNull(data.score), 0);
  const hasScore = score !== null;
  const summary = isObject(data.summary) ? data.summary : {};
  const abilities = buildAbilities(data, gaitParams);
  const footprintTrail = mapFootprintTrail(data.footprintTrail);
  const coordinationStatus = abilities.find((ability) => ability.id === 'coordination')?.status;
  const fallbackTitle = textOr(summary.title, '步态评估结果');

  return {
    recordId: record.id,
    assessmentId: textOr(data.assessmentId, record.assessments.gait?.assessmentId || ''),
    recordedAt: formatReportTime(record.updatedAt || record.date),
    patientName: textOr(record.patientName, '用户'),
    walkingSpeed,
    keyMetrics: buildKeyMetrics(gaitParams, abilities),
    footprintTrail,
    measurementDetails: buildGaitDetails(data, footprintTrail),
    medialLateralBalance: mapBalanceMetrics(data.balance, {
      legacyGenerated: data._generated === true,
      partitionCurves: data.partitionCurves,
    }),
    abilities,
    recommendations: mapRecommendations(data.recommendations, coordinationStatus),
    footer: mapFooter(data.footer),
    trend: mapTrend(data.trend),
    professionalAnalysis: mapProfessionalAnalysis(data.professionalAnalysis),
    retestReminder: mapRetestReminder(
      data.retestReminder,
      record.updatedAt || record.date,
    ),
    hero: {
      hasScore,
      score,
      status: hasScore ? textOr(data.status, '已完成') : '数据不足',
      title: buildHeroScoreTitle(score, fallbackTitle),
      lead: textOr(summary.lead, '查看本次步态检测数据。'),
      findings: buildHeroFindings(gaitParams, abilities),
      tags: mapTags(data.tags, { score, coordinationStatus }),
      ...mapPeerComparison(data.peerComparison),
    },
    summary: mapSummary(data),
  };
}
