/**
 * 把 Python 站立算法输出补成交付版报告需要的数据形状。
 *
 * 本层只适配报告数据，不修改算法结果。重心控制项使用算法给出的峰值帧
 * 足底压力中心偏移代理，不把它扩大解释为直接测得的身体质心；左右承重只
 * 接受有效显式比例、Python 已定向峰值帧，或前端算法已完成坐标变换后输出
 * 的左右脚总压力。
 */
import { scoreStanding } from './assessmentScoring.js';
import {
  hasStandingBackendSchema,
  representativeStandingCop,
  standingCopMetrics,
} from './standingCopContract.js';

const MODULE_MAX_SCORE = 25;
const STANDING_SPACING_CM = 1.4;
const CENTER_CONTROL_SCOPE = 'peak_frame_plantar_cop_proxy';
const CENTER_CONTROL_REFERENCE = 'bilateral_foot_cop_midpoint';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function contractNumber(value) {
  if (
    value === null
    || value === undefined
    || typeof value === 'boolean'
    || (typeof value === 'string' && !value.trim())
  ) return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function hasUsableValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const text = value.trim();
    return Boolean(text) && !['N/A', '--', '—'].includes(text.toUpperCase());
  }
  if (typeof value === 'number') return Number.isFinite(value);
  return true;
}

function withFallbackField(target, key, value, isValid = hasUsableValue) {
  return isValid(target[key]) ? target : { ...target, [key]: value };
}

function mergeMissing(existing, derived) {
  if (!isObject(existing)) return derived;
  const result = { ...existing };
  Object.entries(derived).forEach(([key, value]) => {
    if (!hasUsableValue(result[key])) result[key] = value;
  });
  return result;
}

function finiteCopPoint(value) {
  const first = Array.isArray(value)
    ? value[0]
    : (value?.x ?? value?.row ?? value?.ap);
  const second = Array.isArray(value)
    ? value[1]
    : (value?.y ?? value?.column ?? value?.ml);
  const forwardBack = contractNumber(first);
  const lateral = contractNumber(second);
  return forwardBack === null || lateral === null
    ? null
    : [forwardBack, lateral];
}

function lateralDirection(value) {
  if (!Number.isFinite(value)) return null;
  if (Math.abs(value) < 1e-9) return 'centered';
  return value > 0 ? 'right' : 'left';
}

function centerControlSummary(control) {
  if (!control?.quality?.valid) {
    return '峰值帧足底压力中心相对双足支撑中点的数据不完整，暂无法推断偏移。';
  }
  const direction = control.lateralDirection === 'right'
    ? '偏向右足侧'
    : (control.lateralDirection === 'left' ? '偏向左足侧' : '居中');
  return `峰值帧足底压力中心相对双足支撑中点：左右偏移 ${round(Math.abs(control.lateralOffsetCm), 2)} cm（${direction}），前后偏移 ${round(control.longitudinalOffsetCm, 2)} cm。该结果为足底压力中心偏移代理，并非直接测得的身体质心。`;
}

function invalidCenterControl(reason = 'missing_cop_points') {
  const control = {
    scope: CENTER_CONTROL_SCOPE,
    reference: CENTER_CONTROL_REFERENCE,
    frameIndex: null,
    lateralOffsetCm: null,
    longitudinalOffsetCm: null,
    magnitudeCm: null,
    lateralDirection: null,
    quality: { valid: false, reason },
  };
  return { ...control, status: '数据不足', summary: centerControlSummary(control) };
}

function normalizeExplicitCenterControl(source) {
  const quality = isObject(source.quality) ? source.quality : {};
  if (quality.valid === false) {
    return invalidCenterControl(
      typeof quality.reason === 'string' && quality.reason.trim()
        ? quality.reason.trim()
        : 'invalid_algorithm_output',
    );
  }

  const lateralOffsetCm = contractNumber(
    source.lateral_offset_cm ?? source.lateralOffsetCm ?? source.lateralOffset,
  );
  const rawLongitudinalOffsetCm = contractNumber(
    source.longitudinal_offset_cm
      ?? source.longitudinalOffsetCm
      ?? source.longitudinalOffset,
  );
  if (lateralOffsetCm === null || rawLongitudinalOffsetCm === null) {
    return invalidCenterControl('missing_offset_values');
  }

  const longitudinalOffsetCm = Math.abs(rawLongitudinalOffsetCm);
  const explicitMagnitude = contractNumber(source.magnitude_cm ?? source.magnitudeCm);
  const control = {
    scope: typeof source.scope === 'string' && source.scope.trim()
      ? source.scope.trim()
      : CENTER_CONTROL_SCOPE,
    reference: typeof source.reference === 'string' && source.reference.trim()
      ? source.reference.trim()
      : CENTER_CONTROL_REFERENCE,
    frameIndex: contractNumber(source.frame_index ?? source.frameIndex),
    lateralOffsetCm,
    longitudinalOffsetCm,
    magnitudeCm: explicitMagnitude === null
      ? Math.hypot(lateralOffsetCm, longitudinalOffsetCm)
      : Math.abs(explicitMagnitude),
    lateralDirection: lateralDirection(lateralOffsetCm),
    quality: { valid: true, reason: null },
  };
  return { ...control, status: '已推断', summary: centerControlSummary(control) };
}

function deriveLegacyCenterControl(reportData) {
  const additional = isObject(reportData.additional_data)
    ? reportData.additional_data
    : (isObject(reportData.additionalData) ? reportData.additionalData : {});
  const cop = isObject(additional.cop_results)
    ? additional.cop_results
    : (isObject(additional.copResults) ? additional.copResults : null);
  if (!cop) return null;

  const left = finiteCopPoint(cop.left_cop ?? cop.leftCop);
  const right = finiteCopPoint(cop.right_cop ?? cop.rightCop);
  const both = finiteCopPoint(cop.both_cop ?? cop.bothCop);
  if (!left || !right || !both) return invalidCenterControl();

  const referenceForwardBack = (left[0] + right[0]) / 2;
  const referenceLateral = (left[1] + right[1]) / 2;
  const signedLongitudinalOffsetCm = (both[0] - referenceForwardBack) * STANDING_SPACING_CM;
  const lateralOffsetCm = (both[1] - referenceLateral) * STANDING_SPACING_CM;
  const control = {
    scope: CENTER_CONTROL_SCOPE,
    reference: CENTER_CONTROL_REFERENCE,
    frameIndex: contractNumber(cop.frame_index ?? cop.frameIndex),
    lateralOffsetCm,
    longitudinalOffsetCm: Math.abs(signedLongitudinalOffsetCm),
    magnitudeCm: Math.hypot(signedLongitudinalOffsetCm, lateralOffsetCm),
    lateralDirection: lateralDirection(lateralOffsetCm),
    quality: { valid: true, reason: null },
  };
  return { ...control, status: '已推断', summary: centerControlSummary(control) };
}

/**
 * 统一新旧站立报告中的峰值帧足底压力中心偏移代理。
 * 显式算法结果具有权威性；若其质量无效，不再用历史字段覆盖。
 */
export function deriveStandingCenterControl(reportData = {}) {
  if (!isObject(reportData)) return null;
  const hasExplicit = isObject(reportData.center_control)
    || isObject(reportData.centerControl);
  if (hasExplicit) {
    return normalizeExplicitCenterControl(
      isObject(reportData.center_control) ? reportData.center_control : reportData.centerControl,
    );
  }
  return deriveLegacyCenterControl(reportData);
}

function normalizedRatioPair(leftValue, rightValue) {
  const left = contractNumber(leftValue);
  const right = contractNumber(rightValue);
  if (left === null || right === null || left < 0 || right < 0) return null;

  const total = left + right;
  const isFraction = total >= 0.99 && total <= 1.01;
  const isPercent = total >= 99 && total <= 101;
  if (!isFraction && !isPercent) return null;

  const leftPercent = round((left / total) * 100, 1);
  return {
    leftPercent,
    rightPercent: round(100 - leftPercent, 1),
  };
}

function explicitBilateralLoad(reportData) {
  const additional = isObject(reportData.additional_data)
    ? reportData.additional_data
    : (isObject(reportData.additionalData) ? reportData.additionalData : {});
  const metricsWeight = isObject(reportData.metrics?.weight) ? reportData.metrics.weight : {};

  const candidates = [
    [metricsWeight.leftPercent ?? metricsWeight.leftRatio, metricsWeight.rightPercent ?? metricsWeight.rightRatio],
    [additional.left_pressure_ratio ?? additional.leftPressureRatio,
      additional.right_pressure_ratio ?? additional.rightPressureRatio],
  ];

  for (const [left, right] of candidates) {
    const parsed = normalizedRatioPair(left, right);
    if (parsed) return parsed;
  }
  return null;
}

function peakFrameBilateralLoad(reportData) {
  const arch = isObject(reportData.arch_features)
    ? reportData.arch_features
    : (isObject(reportData.archFeatures) ? reportData.archFeatures : {});
  const peak = arch.peak_frame_data ?? arch.peakFrameData;
  if (!Array.isArray(peak) || peak.length !== 4096) return null;

  let left = 0;
  let right = 0;
  for (let row = 0; row < 64; row += 1) {
    for (let column = 0; column < 64; column += 1) {
      const pressure = contractNumber(peak[(row * 64) + column]);
      if (pressure === null || pressure < 0) return null;
      if (column < 32) left += pressure;
      else right += pressure;
    }
  }

  const total = left + right;
  if (left < 0 || right < 0 || !(total > 0)) return null;
  const leftPercent = round((left / total) * 100, 1);
  return {
    leftPercent,
    rightPercent: round(100 - leftPercent, 1),
  };
}

function frontendBilateralLoad(reportData) {
  const left = contractNumber(reportData.left?.footData?.pressure);
  const right = contractNumber(reportData.right?.footData?.pressure);
  if (left === null || right === null || left < 0 || right < 0 || !(left + right > 0)) {
    return null;
  }

  const leftPercent = round((left / (left + right)) * 100, 1);
  return {
    leftPercent,
    rightPercent: round(100 - leftPercent, 1),
  };
}

export function deriveStandingBilateralLoad(reportData = {}) {
  return explicitBilateralLoad(reportData)
    ?? peakFrameBilateralLoad(reportData)
    ?? frontendBilateralLoad(reportData);
}

function normalizedRegionPressure(value) {
  if (!isObject(value)) return null;
  const regionNumber = (item) => contractNumber(
    isObject(item) ? (item.percent ?? item.ratio) : item,
  );
  const forefoot = regionNumber(value['前足'] ?? value.forefoot ?? value.front);
  const midfoot = regionNumber(value['中足'] ?? value.midfoot ?? value.middle);
  const hindfoot = regionNumber(value['后足'] ?? value.hindfoot ?? value.rearfoot ?? value.heel);
  if ([forefoot, midfoot, hindfoot].some((item) => item === null || item < 0)) return null;

  const total = forefoot + midfoot + hindfoot;
  const isFraction = total >= 0.95 && total <= 1.05;
  const isPercent = total >= 95 && total <= 105;
  if (!isFraction && !isPercent) return null;
  const divisor = isPercent ? 100 : 1;
  return {
    forefoot: forefoot / divisor,
    midfoot: midfoot / divisor,
    rearfoot: hindfoot / divisor,
  };
}

/**
 * scoreStanding 的兼容输入名早于当前 Python 输出。只在用于评分的浅副本中
 * 把 additional_data 三区比例映射到旧读取路径，原始 reportData 不被修改。
 */
function standingScoringInput(reportData, load) {
  const backendCop = representativeStandingCop(reportData);
  const isBackend = hasStandingBackendSchema(reportData);
  const additionalKey = isObject(reportData.additional_data) ? 'additional_data' : 'additionalData';
  const additional = isObject(reportData[additionalKey]) ? reportData[additionalKey] : {};
  const existingLeftRegion = normalizedRegionPressure(reportData.left_region_pressure);
  const existingRightRegion = normalizedRegionPressure(reportData.right_region_pressure);
  const additionalLeftRegion = normalizedRegionPressure(
    additional.left_pressure ?? additional.leftPressure,
  );
  const additionalRightRegion = normalizedRegionPressure(
    additional.right_pressure ?? additional.rightPressure,
  );
  const leftRegion = isBackend
    ? (existingLeftRegion ?? additionalLeftRegion)
    : normalizedRegionPressure(reportData.left?.regionPressure);
  const rightRegion = isBackend
    ? (existingRightRegion ?? additionalRightRegion)
    : normalizedRegionPressure(reportData.right?.regionPressure);

  let scoringInput = reportData;
  if (backendCop) {
    const maxDisplacementCm = contractNumber(
      backendCop.max_displacement ?? backendCop.maxDisplacement,
    );
    const normalizedCop = { ...backendCop };
    [
      ['path_length', 'pathLength'],
      ['contact_area', 'contactArea'],
      ['delta_x', 'deltaX'],
      ['delta_y', 'deltaY'],
      ['avg_velocity', 'avgVelocity'],
    ].forEach(([snakeKey, camelKey]) => {
      if (normalizedCop[snakeKey] == null && backendCop[camelKey] != null) {
        normalizedCop[snakeKey] = backendCop[camelKey];
      }
    });
    scoringInput = {
      ...scoringInput,
      // scoreStanding 的后端分支只读取 snake_case；Python 的该字段实际以 cm 输出。
      cop_time_series: {
        ...normalizedCop,
        ...(maxDisplacementCm === null ? {} : { max_displacement: maxDisplacementCm * 10 }),
      },
    };
  }
  if (isBackend) {
    const scoreInputs = isObject(reportData.score_inputs)
      ? reportData.score_inputs
      : (isObject(reportData.scoreInputs) ? reportData.scoreInputs : {});
    scoringInput = {
      ...scoringInput,
      left_region_pressure: leftRegion,
      right_region_pressure: rightRegion,
      score_inputs: scoreInputs,
    };
  }

  if (load && isBackend) {
    const arch = isObject(reportData.arch_features)
      ? reportData.arch_features
      : (isObject(reportData.archFeatures) ? reportData.archFeatures : {});
    scoringInput = {
      ...scoringInput,
      // 评分器优先读取峰值帧。统一改走已严格校验的比例，确保评分与报告展示一致。
      arch_features: { ...arch, peak_frame_data: [] },
      additional_data: {
        ...additional,
        left_pressure_ratio: load.leftPercent,
        right_pressure_ratio: load.rightPercent,
      },
    };
  } else if (load) {
    const bilateral = isObject(reportData.bilateral) ? reportData.bilateral : {};
    scoringInput = {
      ...scoringInput,
      left: {
        ...(isObject(reportData.left) ? reportData.left : {}),
        ...(leftRegion ? { regionPressure: leftRegion } : {}),
      },
      right: {
        ...(isObject(reportData.right) ? reportData.right : {}),
        ...(rightRegion ? { regionPressure: rightRegion } : {}),
      },
      bilateral: {
        ...bilateral,
        leftPressureRatio: load.leftPercent,
        rightPressureRatio: load.rightPercent,
      },
    };
  }
  return scoringInput;
}

function metricData(reportData, load, scored) {
  const existing = isObject(reportData.metrics) ? reportData.metrics : {};
  const backendCop = representativeStandingCop(reportData);
  const cop = standingCopMetrics(reportData);
  const pathLengthMm = contractNumber(cop.path_length ?? cop.pathLength);
  const swayAreaMm2 = contractNumber(cop.contact_area ?? cop.contactArea ?? cop.ellipseArea);
  const copScope = backendCop ? '代表侧单足 COP' : '整体 COP';
  const copItem = scored?.breakdown?.find((item) => item.label === 'COP 稳态水平（核心）');
  const loadItem = scored?.breakdown?.find((item) => item.label === '左右负荷偏移（核心）');

  const stabilityFacts = [];
  if (pathLengthMm !== null && pathLengthMm > 0) {
    stabilityFacts.push(`${copScope} 轨迹总长约 ${round(pathLengthMm / 10, 2)} cm`);
  }
  if (swayAreaMm2 !== null && swayAreaMm2 > 0) {
    stabilityFacts.push(`${copScope} 活动面积约 ${round(swayAreaMm2 / 100, 2)} cm²`);
  }

  const derivedStability = {
    status: stabilityFacts.length ? (copItem?.desc || '已测量') : '数据不足',
    summary: stabilityFacts.length ? `${stabilityFacts.join('，')}。` : '',
    unit: 'cm',
  };
  const derivedWeight = {
    leftPercent: load?.leftPercent ?? null,
    rightPercent: load?.rightPercent ?? null,
    status: load ? (loadItem?.desc || '已测量') : '数据不足',
    summary: load
      ? `本次有效压力数据中左脚承重 ${load.leftPercent}%，右脚承重 ${load.rightPercent}%。`
      : '',
  };
  const centerControl = deriveStandingCenterControl(reportData);
  const derivedCenter = centerControl ? {
    lateralOffset: centerControl.lateralOffsetCm,
    longitudinalOffset: centerControl.longitudinalOffsetCm,
    magnitude: centerControl.magnitudeCm,
    lateralDirection: centerControl.lateralDirection,
    scope: centerControl.scope,
    reference: centerControl.reference,
    frameIndex: centerControl.frameIndex,
    quality: centerControl.quality,
    status: centerControl.status,
    summary: centerControl.summary,
  } : null;

  const weight = mergeMissing(existing.weight, derivedWeight);
  const existingLeft = contractNumber(existing.weight?.leftPercent);
  const existingRight = contractNumber(existing.weight?.rightPercent);
  const hasValidExistingWeight = existingLeft !== null
    && existingRight !== null
    && existingLeft >= 0
    && existingLeft <= 100
    && existingRight >= 0
    && existingRight <= 100
    && Math.abs(existingLeft + existingRight - 100) < 0.001;

  return {
    ...existing,
    stability: mergeMissing(existing.stability, derivedStability),
    center: derivedCenter ?? existing.center,
    weight: hasValidExistingWeight ? weight : {
      ...weight,
      leftPercent: derivedWeight.leftPercent,
      rightPercent: derivedWeight.rightPercent,
    },
  };
}

function adviceFor(scored, load) {
  if (!scored) {
    const measurementDetail = load
      ? '本次承重比例已记录，但其他站立核心数据不完整，暂不形成综合能力判断。'
      : '本次缺少可靠的左右承重比例，不据此判断双脚是否均衡。';
    return [
      {
        id: 'activity',
        title: '先完成可靠复测',
        detail: '复测时请确认双脚完整站在压力垫上，并按流程保持自然站姿。',
      },
      {
        id: 'posture',
        title: '暂不形成综合判断',
        detail: measurementDetail,
      },
      {
        id: 'strength',
        title: '注意站立安全',
        detail: '日常站立或练习时使用稳固支撑；出现疼痛、头晕或明显不稳时停止活动。',
      },
    ];
  }

  const loadDifference = load ? round(Math.abs(load.leftPercent - load.rightPercent), 1) : null;
  const needsLoadAttention = loadDifference !== null && loadDifference > 10;
  const archFlag = (scored.redFlags || []).find((flag) => flag.includes('足弓'));

  return [
    {
      id: 'activity',
      title: scored.score >= 20 ? '保持平衡活动' : '加强安全平衡练习',
      detail: scored.score >= 20
        ? '在安全环境中保持规律步行和站立练习，并按计划复测观察变化。'
        : '在有人照看或有稳固扶手的环境中练习站立与重心转移，避免独自挑战高难度动作。',
    },
    {
      id: 'posture',
      title: needsLoadAttention ? '关注双脚承重差异' : '保持自然对称站姿',
      detail: needsLoadAttention
        ? `本次左右承重相差约 ${loadDifference}%，练习时注意双脚均匀着地；差异持续时建议咨询康复专业人员。`
        : load
          ? '本次双脚承重较接近，日常站立时继续保持双脚自然、均匀着地。'
          : '本次缺少可靠的左右承重比例，建议复测时确认双脚完整站在压力垫上。',
    },
    {
      id: 'strength',
      title: archFlag ? '关注足底支撑' : '维持下肢力量',
      detail: archFlag
        ? `${archFlag}。如伴随疼痛、麻木或行走不适，建议由专业人员进一步评估。`
        : '结合自身能力进行坐站和下肢力量练习；出现疼痛、头晕或明显不稳时停止活动。',
    },
  ];
}

function validPercentScore(value) {
  const numericValue = contractNumber(value);
  return numericValue !== null && numericValue >= 0 && numericValue <= 100;
}

function validAdvice(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.length <= 3
    && value.every((item) => (
      isObject(item)
      && ['id', 'title', 'detail'].every((key) => (
        typeof item[key] === 'string' && Boolean(item[key].trim())
      ))
    ));
}

function standingReportText(value, usesRepresentativeFootCop) {
  if (typeof value !== 'string') return value;
  const scopedText = usesRepresentativeFootCop
    ? value
      .replace(/COP\s*轨迹/g, '代表侧单足 COP 轨迹')
      .replace(/COP\s*稳态/g, '代表侧单足 COP 稳态')
      .replaceAll('足底压力中心(COP)', '代表侧单足压力中心(COP)')
    : value;
  return scopedText
    .replaceAll('轨迹长度', '轨迹总长')
    .replace(/(\d+(?:\.\d+)?)\s*mm\b/g, '$1 mm')
    .replace(/(\d+(?:\.\d+)?)\s*cm²/g, '$1 cm²')
    .replace(/(\d+(?:\.\d+)?)\s*cm\b/g, '$1 cm');
}

function reportBreakdown(scored, usesRepresentativeFootCop) {
  return (scored?.breakdown || []).map((item) => ({
    ...item,
    desc: standingReportText(item.desc, usesRepresentativeFootCop),
    help: standingReportText(item.help, usesRepresentativeFootCop),
  }));
}

function standingSummaryTitle(level) {
  return level === '表现较好'
    ? '本次站立表现较好'
    : `本次站立评估为${level}`;
}

function hasFourStageMeasurement(reportData) {
  const explicit = isObject(reportData.score_inputs)
    ? reportData.score_inputs
    : (isObject(reportData.scoreInputs) ? reportData.scoreInputs : {});
  const level = contractNumber(
    explicit.four_stage_level
    ?? explicit.fourStageLevel
    ?? explicit.balanceLevel
    ?? reportData.four_stage_balance_level,
  );
  return level !== null && level >= 0 && level <= 4;
}

function breakdownItem(scored, label) {
  return scored?.breakdown?.find((item) => item.label === label) ?? null;
}

function breakdownGroupScore(scored, group) {
  return round(
    (scored?.breakdown || [])
      .filter((item) => item.group === group)
      .reduce((sum, item) => sum + (contractNumber(item.score) ?? 0), 0),
    1,
  );
}

function archConcernText(description) {
  const match = typeof description === 'string'
    ? description.match(/左([^/，]+)\/右([^，。]+)/)
    : null;
  if (!match) return '足弓支撑状态';

  const left = match[1].trim();
  const right = match[2].trim();
  return left === right ? `双脚${left}` : `左脚${left}、右脚${right}`;
}

function standingConcernText(item, usesRepresentativeFootCop, hasFourStage) {
  if (!item || item.score >= item.max || /缺失|待录入|无法判断/.test(item.desc || '')) {
    return null;
  }

  const copScope = usesRepresentativeFootCop ? '代表侧单足 COP' : '整体 COP';
  switch (item.label) {
    case '四阶段平衡等级（核心）':
      return hasFourStage ? '四阶段平衡表现' : null;
    case 'COP 稳态水平（核心）':
      return `${copScope} 稳态`;
    case '左右负荷偏移（核心）':
      return '左右承重差异';
    case '足底压力分区合理性':
      return item.score <= 0 ? '足底压力集中' : '局部足底压力偏高';
    case '足弓/足型压力特征':
      return archConcernText(item.desc);
    case 'COP 轨迹形态':
      return `${copScope} 轨迹形态`;
    case 'AP/ML 稳定性':
      return '前后/内外侧摆动幅度';
    default:
      return item.desc || item.label;
  }
}

function hasMeasuredBreakdown(item) {
  return item && !/缺失|待录入|无法判断/.test(item.desc || '');
}

function buildStandingHeroLead(scored, reportData, usesRepresentativeFootCop) {
  if (!scored) return '本次已取得部分站立数据，暂不足以形成完整结论。';

  const strengths = [];
  const concerns = [];
  const load = breakdownItem(scored, '左右负荷偏移（核心）');
  if (hasMeasuredBreakdown(load)) {
    (load.score >= load.max ? strengths : concerns).push(
      load.score >= load.max ? '双脚承重较均衡' : '左右脚承重差异需要关注',
    );
  }

  const arch = breakdownItem(scored, '足弓/足型压力特征');
  if (hasMeasuredBreakdown(arch)) {
    (arch.score >= arch.max ? strengths : concerns).push(
      arch.score >= arch.max ? '双脚足弓支撑正常' : '足弓支撑状态需要关注',
    );
  }

  const cop = standingCopMetrics(reportData);
  const pathLength = contractNumber(cop.path_length ?? cop.pathLength);
  const copSteady = breakdownItem(scored, 'COP 稳态水平（核心）');
  if (pathLength !== null && pathLength > 0 && hasMeasuredBreakdown(copSteady)) {
    const subject = usesRepresentativeFootCop
      ? '算法选取的一侧足底压力变化'
      : '站立时足底压力变化';
    (copSteady.score >= copSteady.max ? strengths : concerns).push(
      `${subject}${copSteady.score >= copSteady.max ? '较平稳' : '需要关注'}`,
    );
  }

  const regions = breakdownItem(scored, '足底压力分区合理性');
  if (hasMeasuredBreakdown(regions) && regions.score < regions.max) {
    concerns.push('足底局部受力需要关注');
  }

  const statements = concerns.length
    ? [...strengths.slice(0, 1), concerns[0]]
    : strengths.slice(0, 2);
  return statements.length
    ? `本次站立检测显示${statements.join('，')}。`
    : '本次已完成站立检测，现有数据暂不足以形成明确结论。';
}

function buildStandingScoredSummary(scored, reportData, usesRepresentativeFootCop) {
  if (!scored) return '';

  const cop = standingCopMetrics(reportData);
  const pathLengthMm = contractNumber(cop.path_length ?? cop.pathLength);
  const copScope = usesRepresentativeFootCop ? '代表侧单足 COP' : '整体 COP';
  const coreScore = breakdownGroupScore(scored, 'core');
  const enhancedScore = breakdownGroupScore(scored, 'enhanced');
  const scoreText = `核心 ${coreScore}/18 + 增强 ${enhancedScore}/7`;
  const opening = pathLengthMm !== null && pathLengthMm > 0
    ? `${copScope} 轨迹总长约 ${round(pathLengthMm / 10, 2)} cm（${scoreText}）。`
    : `本次站立评分为 ${scored.score}/${MODULE_MAX_SCORE} 分（${scoreText}）。`;

  const highlights = [];
  const copSteady = breakdownItem(scored, 'COP 稳态水平（核心）');
  const load = breakdownItem(scored, '左右负荷偏移（核心）');
  if (copSteady?.score >= copSteady?.max && pathLengthMm > 0) {
    highlights.push(`${copScope} 按轨迹总长判断为稳态`);
  }
  if (load?.score >= load?.max) highlights.push('左右承重较均衡');

  const hasFourStage = hasFourStageMeasurement(reportData);
  const concerns = (scored.breakdown || [])
    .map((item) => standingConcernText(item, usesRepresentativeFootCop, hasFourStage))
    .filter(Boolean);

  if (highlights.length && concerns.length) {
    return `${opening}实测分项显示${highlights.join('、')}；主要需关注${concerns.join('、')}。`;
  }
  if (highlights.length) return `${opening}实测分项显示${highlights.join('、')}。`;
  if (concerns.length) return `${opening}主要需关注${concerns.join('、')}。`;
  return opening;
}

/**
 * 把算法原始字段整理成 scoreStanding 已有接口所需的输入形状。
 * 只返回浅复制的数据，不修改采集结果；没有可靠左右承重时不生成评分输入。
 */
export function prepareStandingReportScoreInput(reportData, verifiedLoad) {
  if (!isObject(reportData)) return null;
  const load = verifiedLoad === undefined
    ? deriveStandingBilateralLoad(reportData)
    : verifiedLoad;
  return load ? standingScoringInput(reportData, load) : null;
}

/** 用现有 V3 scoreStanding 结果补齐报告；已有报告字段优先。 */
export function enrichStandingReportData(reportData) {
  if (!isObject(reportData)) return reportData;
  const hasAlgorithmData = isObject(reportData.cop_time_series)
    || isObject(reportData.copTimeSeries)
    || isObject(reportData.arch_features)
    || isObject(reportData.archFeatures)
    || isObject(reportData.additional_data)
    || isObject(reportData.additionalData)
    || isObject(reportData.center_control)
    || isObject(reportData.centerControl)
    || isObject(reportData.bilateral)
    || isObject(reportData.left)
    || isObject(reportData.right)
    || isObject(reportData.score_inputs)
    || isObject(reportData.scoreInputs)
    || Array.isArray(reportData.four_stage_results)
    || contractNumber(reportData.four_stage_balance_level) !== null;
  if (!hasAlgorithmData) return reportData;

  const load = deriveStandingBilateralLoad(reportData);
  const scoreInput = prepareStandingReportScoreInput(reportData, load);
  const scoredResult = scoreInput ? scoreStanding(scoreInput) : null;
  const scored = scoredResult && !scoredResult.invalid ? scoredResult : null;
  const scorePercent = scored ? round((scored.score / MODULE_MAX_SCORE) * 100, 0) : null;
  const usesRepresentativeFootCop = Boolean(representativeStandingCop(reportData));
  const backendCopScopeNote = usesRepresentativeFootCop
    ? 'COP 指标为算法选取的代表侧单足峰值区间结果。'
    : '';
  const fourStageNote = scored && !hasFourStageMeasurement(reportData)
    ? '本次未录入四阶段平衡结果，该评分项按中等档保守计分。'
    : '';
  const scoredSummary = buildStandingScoredSummary(
    scored,
    reportData,
    usesRepresentativeFootCop,
  );
  const breakdown = reportBreakdown(scored, usesRepresentativeFootCop);
  const incompleteSummary = scoredResult?.invalid
    ? scoredResult.summary
    : '本次已取得部分站立数据，但缺少可靠的左右承重比例，暂不生成综合评分。';
  const derivedSummary = {
    title: scored ? standingSummaryTitle(scored.level) : '本次站立数据不完整',
    heroLead: buildStandingHeroLead(scored, reportData, usesRepresentativeFootCop),
    lead: [scoredSummary || incompleteSummary, backendCopScopeNote, fourStageNote]
      .filter(Boolean)
      .join(' '),
  };
  const existingDetails = isObject(reportData.details) ? reportData.details : {};
  const derivedDetails = {
    breakdown,
    scoreSummary: scored ? {
      total: scored.score,
      max: MODULE_MAX_SCORE,
      percent: scorePercent,
      note: [
        standingReportText(scored.note, usesRepresentativeFootCop),
        backendCopScopeNote,
        fourStageNote,
      ]
        .filter(Boolean)
        .join(' '),
    } : null,
    redFlags: (scored?.redFlags || scoredResult?.redFlags || [])
      .map((flag) => standingReportText(flag, usesRepresentativeFootCop)),
  };

  let enriched = {
    ...reportData,
    metrics: metricData(reportData, load, scored),
    summary: mergeMissing(reportData.summary, derivedSummary),
    details: mergeMissing(existingDetails, derivedDetails),
  };
  enriched = withFallbackField(enriched, 'score', scorePercent, validPercentScore);
  enriched = withFallbackField(
    enriched,
    'status',
    scored?.level || (scoredResult?.invalid ? '数据异常' : '数据不足'),
  );
  enriched = withFallbackField(
    enriched,
    'evaluation',
    [scoredSummary || incompleteSummary, backendCopScopeNote, fourStageNote]
      .filter(Boolean)
      .join(' '),
  );
  enriched = withFallbackField(enriched, 'advice', adviceFor(scored, load), validAdvice);
  return enriched;
}
