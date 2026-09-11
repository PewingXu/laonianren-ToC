/**
 * 把 Python 步态算法的实测输出补成交付版报告 mapper 所需的数据形状。
 *
 * 这里只做报告层适配，不改算法结果。稳定性和方向控制只读取 Python
 * 基于逐步足印计算的契约，不用足偏角替代其他能力指标。
 */
import { extractGaitMetrics, scoreGait, toNumber } from './assessmentScoring.js';

const MODULE_MAX_SCORE = 25;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function positiveNumber(value) {
  const numericValue = toNumber(value, null);
  return numericValue !== null && numericValue > 0 ? numericValue : null;
}

function contractNumber(value) {
  if (
    value === null
    || value === undefined
    || typeof value === 'boolean'
    || (typeof value === 'string' && !value.trim())
  ) {
    return null;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function angleContractNumber(value) {
  const strictValue = contractNumber(value);
  if (strictValue !== null || typeof value !== 'string') return strictValue;
  const match = value.trim().match(/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)/);
  if (!match) return null;
  const numericValue = Number(match[0]);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function nonNegativeContractNumber(value) {
  const numericValue = contractNumber(value);
  return numericValue !== null && numericValue >= 0 ? numericValue : null;
}

function positiveInteger(value) {
  const numericValue = contractNumber(value);
  return numericValue !== null && numericValue > 0 && Number.isInteger(numericValue)
    ? numericValue
    : null;
}

const DIRECTION_QUALITY_REASONS = {
  missing_step_geometry: '未取得有效的逐步足印坐标',
  insufficient_alternating_steps: '有效的连续左右交替落脚次数不足',
  insufficient_forward_progression: '有效步迹覆盖距离不足',
  degenerate_path_fit: '步迹拟合条件不足',
  insufficient_valid_steps: '有效落脚次数不足',
  insufficient_bilateral_steps: '左右脚有效落脚次数不足',
  no_alternating_sequence: '未取得连续左右交替步迹',
  insufficient_forward_span: '有效步迹覆盖距离不足',
  non_monotonic_progression: '步迹前进方向不稳定',
  rank_deficient_fit: '步迹拟合条件不足',
  invalid_coordinates: '足印坐标无效',
  non_finite_result: '步迹计算结果无效',
};

const STABILITY_QUALITY_REASONS = {
  missing_step_geometry: '未取得有效的逐步足印坐标',
  missing_walking_stability: '未取得逐步稳定性计算结果',
  insufficient_alternating_steps: '有效的连续左右交替落脚次数不足',
  insufficient_forward_progression: '有效步迹覆盖距离不足',
  non_monotonic_progression: '步迹前进方向不稳定',
  invalid_step_intervals: '相邻落脚的时间或位置数据无效',
  non_finite_result: '步态规律性计算结果无效',
};

function walkingStabilityAbility(reportData) {
  const stability = isObject(reportData.walkingStability)
    ? reportData.walkingStability
    : (isObject(reportData.walking_stability) ? reportData.walking_stability : {});
  const quality = isObject(stability.quality) ? stability.quality : {};
  const stepTimeCvPercent = nonNegativeContractNumber(
    stability.stepTimeCvPercent ?? stability.step_time_cv_percent,
  );
  const stepDistanceCvPercent = nonNegativeContractNumber(
    stability.stepDistanceCvPercent ?? stability.step_distance_cv_percent,
  );
  const validStepCount = positiveInteger(stability.sampleCount ?? stability.sample_count);
  const intervalCount = positiveInteger(stability.intervalCount ?? stability.interval_count);
  const confidence = quality.confidence === 'limited' ? 'limited' : 'standard';
  const valid = quality.valid === true
    && stepTimeCvPercent !== null
    && stepDistanceCvPercent !== null
    && validStepCount !== null
    && intervalCount !== null;

  if (valid) {
    const limitedText = confidence === 'limited' ? '，样本量有限' : '';
    return {
      metricMode: 'stepVariability',
      status: confidence === 'limited' ? '样本有限' : '已测量',
      foreAftSwayCm: null,
      lateralSwayCm: null,
      swayScaleMaxCm: null,
      stepTimeCvPercent: round(stepTimeCvPercent, 2),
      stepDistanceCvPercent: round(stepDistanceCvPercent, 2),
      validStepCount,
      intervalCount,
      quality: { valid: true, reason: null, confidence },
      note: `基于 ${validStepCount} 次连续交替落脚计算步时和落脚间距的变异系数${limitedText}；数值越小，说明本次连续落脚越一致。`,
    };
  }

  const reason = typeof quality.reason === 'string' ? quality.reason.trim() : '';
  const reasonText = STABILITY_QUALITY_REASONS[reason] || '本次没有足够的连续交替落脚数据';
  return {
    metricMode: 'stepVariability',
    status: '数据不足',
    foreAftSwayCm: null,
    lateralSwayCm: null,
    swayScaleMaxCm: null,
    stepTimeCvPercent: null,
    stepDistanceCvPercent: null,
    validStepCount: null,
    intervalCount: null,
    quality: { valid: false, reason: reason || null, confidence: null },
    note: `${reasonText}，暂不能计算步态规律性。`,
  };
}

function directionControlAbility(reportData) {
  const control = isObject(reportData.directionControl)
    ? reportData.directionControl
    : (isObject(reportData.direction_control) ? reportData.direction_control : {});
  const quality = isObject(control.quality) ? control.quality : {};
  const pathDeviationCm = nonNegativeContractNumber(
    control.pathDeviationRmsCm ?? control.path_deviation_rms_cm,
  );
  const maxPathDeviationCm = nonNegativeContractNumber(
    control.maxPathDeviationCm ?? control.max_path_deviation_cm,
  );
  const validStepCount = positiveInteger(control.sampleCount ?? control.sample_count);
  const forwardSpanCm = nonNegativeContractNumber(
    control.forwardSpanCm ?? control.forward_span_cm,
  );
  const valid = quality.valid === true
    && pathDeviationCm !== null
    && maxPathDeviationCm !== null
    && validStepCount !== null;

  if (!valid) {
    const reason = typeof quality.reason === 'string' ? quality.reason.trim() : '';
    const reasonText = DIRECTION_QUALITY_REASONS[reason] || '本次没有足够的有效步迹';
    return {
      status: '数据不足',
      pathDeviationCm: null,
      maxPathDeviationCm: null,
      validStepCount: null,
      forwardSpanCm: null,
      metricMode: 'pathDeviation',
      quality: { valid: false, reason: reason || null, confidence: null },
      note: `${reasonText}，暂不能计算步迹直线稳定性。`,
    };
  }

  const confidence = quality.confidence === 'limited' ? 'limited' : 'standard';
  const limitedText = confidence === 'limited' ? '，样本量有限' : '';
  return {
    metricMode: 'pathDeviation',
    status: confidence === 'limited' ? '样本有限' : '已测量',
    pathDeviationCm: round(pathDeviationCm, 2),
    maxPathDeviationCm: round(maxPathDeviationCm, 2),
    validStepCount,
    forwardSpanCm: round(forwardSpanCm, 1),
    quality: { valid: true, reason: null, confidence },
    note: `基于 ${validStepCount} 次有效落脚拟合行走路线${limitedText}；偏移越小，说明本次落脚方向越一致。`,
  };
}

const GAIT_NUMERIC_PARAM_KEYS = [
  'leftStepTime',
  'rightStepTime',
  'crossStepTime',
  'leftStepLength',
  'rightStepLength',
  'crossStepLength',
  'stepWidth',
  'walkingSpeed',
  'doubleContactTime',
  'pathDeviation',
  'path_deviation',
];

/**
 * Python 会用 "N/A" 表示未测得的可选参数。评分器的旧数值解析会把这类
 * 字符串当成 0，因此先在报告适配层规范成 null，再交给评分和文案链路。
 */
export function normalizeGaitReportData(reportData) {
  if (!isObject(reportData) || !isObject(reportData.gaitParams)) return reportData;

  const gaitParams = { ...reportData.gaitParams };
  GAIT_NUMERIC_PARAM_KEYS.forEach((key) => {
    if (Object.hasOwn(gaitParams, key)) gaitParams[key] = contractNumber(gaitParams[key]);
  });
  ['leftFPA', 'rightFPA'].forEach((key) => {
    if (Object.hasOwn(gaitParams, key)) gaitParams[key] = angleContractNumber(gaitParams[key]);
  });
  return { ...reportData, gaitParams };
}

function hasUsableValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return Boolean(value.trim());
  if (typeof value === 'number') return Number.isFinite(value);
  return true;
}

function mergeMissing(existing, derived) {
  if (!isObject(existing)) return derived;
  const result = { ...existing };
  Object.entries(derived).forEach(([key, value]) => {
    if (!hasUsableValue(result[key])) result[key] = value;
  });
  return result;
}

function mergeValidated(existing, derived, validators = {}) {
  if (!isObject(existing)) return derived;
  const result = { ...existing };
  Object.entries(derived).forEach(([key, value]) => {
    const isValid = validators[key] || hasUsableValue;
    if (!isValid(result[key])) result[key] = value;
  });
  return result;
}

function withFallbackField(target, key, value, isValid = hasUsableValue) {
  return isValid(target[key]) ? target : { ...target, [key]: value };
}

/**
 * left/rightStepTime 是 Python 对同脚相邻压力峰索引求差得到的周期时长。
 * 一个同脚周期包含两步，因此 cadence = 120 / 平均周期时长。
 */
export function deriveCadenceStepsPerMinute(gaitParams = {}) {
  const leftCycleSeconds = positiveNumber(gaitParams.leftStepTime);
  const rightCycleSeconds = positiveNumber(gaitParams.rightStepTime);
  const cycles = [leftCycleSeconds, rightCycleSeconds].filter(Number.isFinite);
  if (!cycles.length) return null;

  const averageCycleSeconds = cycles.reduce((sum, value) => sum + value, 0) / cycles.length;
  return round(120 / averageCycleSeconds, 0);
}

/** Python 的同脚相邻足跟距离（步幅）以 cm 输出，报告卡片固定显示 m。 */
export function deriveStepLengthM(gaitParams = {}) {
  const lengthsCm = [
    positiveNumber(gaitParams.leftStepLength),
    positiveNumber(gaitParams.rightStepLength),
  ].filter(Number.isFinite);
  if (!lengthsCm.length) return null;

  const averageCm = lengthsCm.reduce((sum, value) => sum + value, 0) / lengthsCm.length;
  return round(averageCm / 100, 2);
}

function integratedLoad(series) {
  if (!isObject(series) || !Array.isArray(series.load)) return null;

  const loads = series.load.map(contractNumber);
  if (loads.some((value) => value === null || value < 0)) return null;
  const times = Array.isArray(series.time) ? series.time.map(contractNumber) : [];

  if (loads.length >= 2 && times.length === loads.length) {
    let impulse = 0;
    let validSegments = 0;
    for (let index = 1; index < loads.length; index += 1) {
      const from = times[index - 1];
      const to = times[index];
      if (from === null || to === null || to <= from) continue;
      impulse += ((loads[index - 1] + loads[index]) / 2) * (to - from);
      validSegments += 1;
    }
    if (validSegments === loads.length - 1 && impulse > 0) return impulse;
  }

  return null;
}

function summedLoad(series) {
  if (!isObject(series) || !Array.isArray(series.load)) return null;

  const loads = series.load.map(contractNumber);
  if (loads.some((value) => value === null || value < 0)) return null;
  const totalLoad = loads.reduce((sum, value) => sum + value, 0);
  return totalLoad > 0 ? totalLoad : null;
}

function partitionImpulse(features) {
  // Python 固定输出 S1-S6 六个足底分区。残缺数组不能代表整足累计负荷。
  if (!Array.isArray(features) || features.length !== 6) return null;
  const impulses = features.map((item) => contractNumber(item?.['冲量']));
  if (impulses.some((value) => value === null || value < 0)) return null;
  const total = impulses.reduce((sum, value) => sum + value, 0);
  return total > 0 ? total : null;
}

/**
 * 以完整采集时段内左右足的累计垂直负荷（冲量）计算占比。时序不可用时，
 * 才退回六个足底分区的实测冲量之和；balance 字段是足内侧/外侧力差，不能用于这里。
 */
export function deriveBilateralLoadPercent(reportData = {}) {
  const leftLoads = reportData.timeSeries?.left?.load;
  const rightLoads = reportData.timeSeries?.right?.load;
  const leftIntegrated = integratedLoad(reportData.timeSeries?.left);
  const rightIntegrated = integratedLoad(reportData.timeSeries?.right);
  const leftSummed = summedLoad(reportData.timeSeries?.left);
  const rightSummed = summedLoad(reportData.timeSeries?.right);
  const leftPartition = partitionImpulse(reportData.partitionFeatures?.left);
  const rightPartition = partitionImpulse(reportData.partitionFeatures?.right);

  let leftImpulse = null;
  let rightImpulse = null;
  if (leftIntegrated !== null && rightIntegrated !== null) {
    leftImpulse = leftIntegrated;
    rightImpulse = rightIntegrated;
  } else if (
    leftSummed !== null
    && rightSummed !== null
    && Array.isArray(leftLoads)
    && Array.isArray(rightLoads)
    && leftLoads.length === rightLoads.length
    && (!Array.isArray(reportData.timeSeries?.left?.time)
      || reportData.timeSeries.left.time.length === 0)
    && (!Array.isArray(reportData.timeSeries?.right?.time)
      || reportData.timeSeries.right.time.length === 0)
  ) {
    // 两侧同源等间隔采样时，公共时间间隔在求占比时相消。
    leftImpulse = leftSummed;
    rightImpulse = rightSummed;
  } else if (
    leftPartition !== null
    && rightPartition !== null
    && reportData.partitionFeatures.left.length === reportData.partitionFeatures.right.length
  ) {
    leftImpulse = leftPartition;
    rightImpulse = rightPartition;
  }
  const totalImpulse = (leftImpulse ?? 0) + (rightImpulse ?? 0);

  if (!(leftImpulse > 0) || !(rightImpulse > 0) || !(totalImpulse > 0)) return null;

  const leftLoadPercent = round((leftImpulse / totalImpulse) * 100, 1);
  return {
    leftLoadPercent,
    rightLoadPercent: round(100 - leftLoadPercent, 1),
  };
}

function loadStatus(loadRatio) {
  if (!loadRatio) return '';
  const difference = Math.abs(loadRatio.leftLoadPercent - loadRatio.rightLoadPercent);
  if (difference <= 10) return '累计负荷较均衡';
  return `${loadRatio.leftLoadPercent > loadRatio.rightLoadPercent ? '左侧' : '右侧'}累计负荷较高`;
}

function coordinationStatus(metrics, loadRatio) {
  const hasSymmetryData = metrics.leftStepLength > 0
    && metrics.rightStepLength > 0
    && metrics.leftStepTime > 0
    && metrics.rightStepTime > 0;
  const symmetryOk = hasSymmetryData
    && metrics.stepLengthDiff < 6
    && metrics.stepTimeDiff < 0.12;
  const temporalStatus = hasSymmetryData
    ? (symmetryOk ? '时空参数基本对称' : '时空参数需关注')
    : '';

  return [temporalStatus, loadStatus(loadRatio)].filter(Boolean).join('，') || '数据不足';
}

function gaitTags(metrics, scored, loadRatio) {
  const scorePercent = scored
    ? round((scored.score / MODULE_MAX_SCORE) * 100, 0)
    : null;

  return [
    {
      label: metrics.walkingSpeed <= 0
        ? '步速数据不足'
        : (metrics.walkingSpeed >= 1 ? '步速达到参考值' : '步速低于参考值'),
      icon: 'footprints',
    },
    {
      label: coordinationStatus(metrics, loadRatio),
      icon: 'scale',
    },
    {
      label: scorePercent === null ? '综合评分数据不足' : `综合评分 ${scorePercent} 分`,
      icon: 'check-circle',
    },
  ];
}

function coreStrength(metrics) {
  if (metrics.walkingSpeed >= 1) return '行走速度';
  if (
    metrics.leftStepLength > 0
    && metrics.rightStepLength > 0
    && metrics.stepLengthDiff < 6
    && metrics.leftStepTime > 0
    && metrics.rightStepTime > 0
    && metrics.stepTimeDiff < 0.12
  ) return '时空参数对称';
  return '步态数据已记录';
}

function abilityData(reportData, metrics, loadRatio) {
  const cadenceStepsPerMinute = deriveCadenceStepsPerMinute(reportData.gaitParams);
  const stepLengthM = deriveStepLengthM(reportData.gaitParams);
  const hasSymmetryData = metrics.leftStepLength > 0
    && metrics.rightStepLength > 0
    && metrics.leftStepTime > 0
    && metrics.rightStepTime > 0;

  const coordinationFacts = [];
  if (loadRatio) {
    coordinationFacts.push(
      `累计足底负荷占比为左脚 ${loadRatio.leftLoadPercent}%、右脚 ${loadRatio.rightLoadPercent}%`,
    );
  }
  if (hasSymmetryData) {
    coordinationFacts.push(
      `左右同脚步幅差 ${metrics.stepLengthDiff} cm、同脚周期差 ${metrics.stepTimeDiff} s`,
    );
  }
  const coordinationNote = coordinationFacts.length
    ? `${coordinationFacts.join('；')}。`
    : '本次没有完整的左右负荷时序或双侧时空参数，暂不能判断左右协调性。';

  const rhythmFacts = [];
  if (cadenceStepsPerMinute !== null) rhythmFacts.push(`由同脚周期换算的步频约 ${cadenceStepsPerMinute} 步/分钟`);
  if (stepLengthM !== null) {
    const measuredLengthSides = [
      positiveNumber(reportData.gaitParams.leftStepLength),
      positiveNumber(reportData.gaitParams.rightStepLength),
    ].filter(Number.isFinite).length;
    rhythmFacts.push(
      measuredLengthSides === 2
        ? `左右平均同脚步幅约 ${stepLengthM} m`
        : `已测侧同脚步幅约 ${stepLengthM} m`,
    );
  }
  if (metrics.walkingSpeed > 0) rhythmFacts.push(`整体步速 ${round(metrics.walkingSpeed, 2)} m/s`);

  return {
    stability: walkingStabilityAbility(reportData),
    coordination: {
      status: coordinationStatus(metrics, loadRatio),
      leftLoadPercent: loadRatio?.leftLoadPercent ?? null,
      rightLoadPercent: loadRatio?.rightLoadPercent ?? null,
      note: coordinationNote,
    },
    rhythm: {
      status: cadenceStepsPerMinute !== null || stepLengthM !== null ? '已测量' : '数据不足',
      cadenceStepsPerMinute,
      stepLengthM,
      cadenceRange: null,
      stepLengthRange: null,
      note: rhythmFacts.length ? `${rhythmFacts.join('，')}。` : '本次没有可用于换算步频和同脚步幅的有效数据。',
    },
    direction: directionControlAbility(reportData),
  };
}

function recommendations(metrics, loadRatio) {
  const hasSymmetryData = metrics.leftStepLength > 0
    && metrics.rightStepLength > 0
    && metrics.leftStepTime > 0
    && metrics.rightStepTime > 0;
  const temporalAsymmetry = hasSymmetryData
    && (metrics.stepLengthDiff >= 6 || metrics.stepTimeDiff >= 0.12);
  const loadAsymmetry = loadRatio
    && Math.abs(loadRatio.leftLoadPercent - loadRatio.rightLoadPercent) > 10;
  const hasCoordinationConcern = temporalAsymmetry || loadAsymmetry;
  return [
    {
      id: 'walking-practice',
      title: metrics.walkingSpeed >= 1 ? '保持规律步行' : '练习舒适步速',
      description: metrics.walkingSpeed >= 1
        ? '在安全、平整的环境中保持规律步行，延续当前行走能力。'
        : '选择安全、平整的路线，以舒适节奏分段练习，不必刻意追求速度。',
      icon: 'walking',
      tone: 'green',
    },
    {
      id: 'symmetry-practice',
      title: hasSymmetryData
        ? (hasCoordinationConcern
          ? (loadAsymmetry ? '关注左右负荷差异' : '关注左右步态差异')
          : '巩固左右协调')
        : '复测左右步态',
      description: hasSymmetryData
        ? (hasCoordinationConcern
          ? (loadAsymmetry
            ? '练习时关注双脚均匀落地，并留意两侧落脚距离与节奏；如差异持续，可咨询康复专业人员。'
            : '练习时放慢节奏，关注两侧落脚距离与节奏；如差异持续，可咨询康复专业人员。')
          : '继续进行左右交替迈步和下肢力量练习，保持两侧动作协调。')
        : '本次双侧时空参数不完整，建议完成足够步态周期后复测。',
      icon: 'stretch',
      tone: 'orange',
    },
    {
      id: 'recovery',
      title: '运动后及时恢复',
      description: '步行练习后安排休息并及时补水；出现疼痛、头晕或明显不稳时应停止活动。',
      icon: 'water',
      tone: 'blue',
    },
  ];
}

function reportGaitTerm(value) {
  if (typeof value !== 'string') return value;
  return value
    .replaceAll('步长', '同脚步幅')
    .replaceAll('双支撑期占比', '双支撑时间')
    .replaceAll('双支撑期', '双支撑时间')
    .replace(/(\d+(?:\.\d+)?)\s*m\/s/g, '$1 m/s')
    .replace(/(\d+(?:\.\d+)?)\s*cm/g, '$1 cm')
    .replace(/(\d+(?:\.\d+)?)\s*s\b/g, '$1 s');
}

function reportBreakdown(scored) {
  return (scored?.breakdown || []).map((item) => ({
    ...item,
    label: reportGaitTerm(item.label),
    desc: reportGaitTerm(item.desc),
    help: reportGaitTerm(item.help),
  }));
}

function scoreExplanation(scored, breakdown, hasLoadData) {
  const parts = breakdown
    .map((item) => `${item.label} ${item.score}/${item.max} 分`)
    .join('，');
  const note = reportGaitTerm(scored.note);
  const scoreScope = hasLoadData
    ? '累计足底负荷占比用于报告观察，未计入当前步态评分。'
    : '';
  return [parts ? `${note} 本次明细：${parts}。` : note, scoreScope]
    .filter(Boolean)
    .join(' ');
}

function gaitSummaryTitle(level) {
  return level === '表现较好'
    ? '本次步态表现较好'
    : `本次步态评估为${level}`;
}

function hasCompleteScoreInputs(gaitParams) {
  return [
    gaitParams.walkingSpeed,
    gaitParams.leftStepTime,
    gaitParams.rightStepTime,
    gaitParams.leftStepLength,
    gaitParams.rightStepLength,
  ].every((value) => positiveNumber(value) !== null);
}

/**
 * 把 Python 的 N/A 规整成评分器可识别的缺失值，并校验综合评分必需字段。
 * 返回值只用于现有 scoreGait，不修改算法结果或原始 reportData。
 */
export function prepareGaitReportScoreInput(reportData) {
  const normalized = normalizeGaitReportData(reportData);
  return isObject(normalized?.gaitParams) && hasCompleteScoreInputs(normalized.gaitParams)
    ? normalized
    : null;
}

function partialSummary(metrics) {
  if (metrics.walkingSpeed > 0) {
    return `本次已测得步速 ${round(metrics.walkingSpeed, 2)} m/s，但左右同脚步幅或同脚周期数据不完整，暂不生成综合评分。`;
  }
  return '本次只取得部分步态参数，缺少可靠步速或完整双侧时空数据，暂不生成综合评分。';
}

function validPercentScore(value) {
  const score = contractNumber(value);
  return score !== null && score >= 0 && score <= 100;
}

function validTags(value) {
  const icons = new Set(['check-circle', 'scale', 'footprints']);
  return Array.isArray(value)
    && value.length <= 3
    && value.every((item) => (
      isObject(item)
      && typeof item.label === 'string'
      && Boolean(item.label.trim())
      && icons.has(item.icon)
    ));
}

function validRecommendations(value) {
  const icons = new Set(['walking', 'stretch', 'water']);
  const tones = new Set(['green', 'orange', 'blue']);
  return Array.isArray(value)
    && value.length === 3
    && value.every((item) => (
      isObject(item)
      && ['id', 'title', 'description'].every((key) => (
        typeof item[key] === 'string' && Boolean(item[key].trim())
      ))
      && icons.has(item.icon)
      && tones.has(item.tone)
    ));
}

const positiveMetric = (value) => {
  const numericValue = contractNumber(value);
  return numericValue !== null && numericValue > 0;
};
const percentMetric = (value) => {
  const numericValue = contractNumber(value);
  return numericValue !== null && numericValue >= 0 && numericValue <= 100;
};

function mergeCoordination(existing, derived) {
  const result = mergeValidated(existing, derived, {
    leftLoadPercent: percentMetric,
    rightLoadPercent: percentMetric,
  });
  const left = contractNumber(existing?.leftLoadPercent);
  const right = contractNumber(existing?.rightLoadPercent);
  const hasValidExistingPair = left !== null
    && right !== null
    && left >= 0
    && left <= 100
    && right >= 0
    && right <= 100
    && Math.abs(left + right - 100) < 0.001;

  if (hasValidExistingPair) return result;
  return {
    ...result,
    leftLoadPercent: derived.leftLoadPercent,
    rightLoadPercent: derived.rightLoadPercent,
  };
}

/**
 * 用现有 V3 scoreGait 结果增强报告。已有后端字段始终优先，本层只补缺失字段。
 */
export function enrichGaitReportData(reportData) {
  if (!isObject(reportData) || !isObject(reportData.gaitParams)) return reportData;

  const normalizedReport = normalizeGaitReportData(reportData);
  const metrics = extractGaitMetrics(normalizedReport);
  const loadRatio = deriveBilateralLoadPercent(normalizedReport);
  const scoreInput = prepareGaitReportScoreInput(reportData);
  const scored = scoreInput ? scoreGait(scoreInput) : null;
  const scorePercent = scored ? round((scored.score / MODULE_MAX_SCORE) * 100, 0) : null;
  const incompleteSummary = partialSummary(metrics);
  const breakdown = reportBreakdown(scored);
  const scoredSummary = reportGaitTerm(scored?.summary);

  const derivedAbilities = abilityData(normalizedReport, metrics, loadRatio);
  const existingAbilities = isObject(reportData.abilities) ? reportData.abilities : {};
  const mergedAbilities = {
    ...existingAbilities,
    stability: derivedAbilities.stability,
    coordination: mergeCoordination(existingAbilities.coordination, derivedAbilities.coordination),
    rhythm: mergeValidated(existingAbilities.rhythm, derivedAbilities.rhythm, {
      cadenceStepsPerMinute: positiveMetric,
      stepLengthM: positiveMetric,
    }),
    direction: derivedAbilities.direction,
  };

  const derivedSummary = {
    title: scored ? gaitSummaryTitle(scored.level) : '本次步态数据不完整',
    lead: scoredSummary || incompleteSummary,
  };
  const derivedAssessmentSummary = {
    body: scoredSummary || incompleteSummary,
    changeScore: null,
    strength: scored ? coreStrength(metrics) : '数据不足',
  };
  const scoreSummary = scored ? {
    total: scored.score,
    max: MODULE_MAX_SCORE,
    percent: scorePercent,
    note: reportGaitTerm(scored.note),
  } : null;
  const existingDetails = isObject(reportData.details) ? reportData.details : {};
  const derivedDetails = {
    breakdown,
    scoreSummary,
    redFlags: (scored?.redFlags || []).map(reportGaitTerm),
  };

  let enriched = {
    ...normalizedReport,
    abilities: mergedAbilities,
    summary: mergeMissing(reportData.summary, derivedSummary),
    assessmentSummary: mergeMissing(reportData.assessmentSummary, derivedAssessmentSummary),
    details: mergeMissing(existingDetails, derivedDetails),
  };

  enriched = withFallbackField(enriched, 'score', scorePercent, validPercentScore);
  enriched = withFallbackField(enriched, 'status', scored?.level || '数据不足');
  enriched = withFallbackField(
    enriched,
    'tags',
    gaitTags(metrics, scored, loadRatio),
    validTags,
  );
  enriched = withFallbackField(
    enriched,
    'recommendations',
    recommendations(metrics, loadRatio),
    validRecommendations,
  );
  enriched = withFallbackField(
    enriched,
    'scoreExplanation',
    scored ? scoreExplanation(
      scored,
      breakdown,
      derivedAbilities.coordination.leftLoadPercent !== null,
    ) : incompleteSummary,
  );

  return enriched;
}
