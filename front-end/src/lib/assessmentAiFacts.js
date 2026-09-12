/**
 * 起坐 / 站立 / 步态 三项的 AI 事实摘要导出。
 *
 * 定位
 * ---------------------------------------------------------------
 * 与 gripReportEnrich.buildGripAiFacts 同一角色：把实测 reportData +
 * V3 评分结果压成一份「只有事实、没有结论」的扁平对象，交给后端 prompt
 * 组装。措辞一律交给 LLM，这里不写任何判断句。
 *
 * 字段名与后端 prompts/{sitstand,standing,gait}_toc_prompt.py 的
 * build_*_toc_user_prompt 逐一对应 —— 改这边要同步改那边，
 * 否则 prompt 里对应行会被静默跳过（_line 遇到空值返回 None 并被过滤）。
 *
 * 为什么不做进 mapper
 * ---------------------------------------------------------------
 * mapper 是纯函数、要被单测覆盖，且交付包会升级；把「喂 AI 的事实」
 * 混进去会让两者互相牵制。这里独立一层，mapper 只管渲染契约。
 */
import {
  scoreSitStand,
  extractSitStandMetrics,
  toNumber,
} from './assessmentScoring.js';
import {
  deriveStandingBilateralLoad,
  deriveStandingCenterControl,
  enrichStandingReportData,
} from './standingReportEnrich.js';
import {
  deriveBilateralLoadPercent,
  enrichGaitReportData,
} from './gaitReportEnrich.js';
import {
  representativeStandingCop,
  standingCopMetrics,
} from './standingCopContract.js';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** 有限正数才返回，其余一律 null —— prompt 侧会跳过 null 行，不会写出「未知」 */
function posOrNull(value) {
  const n = toNumber(value, null);
  return Number.isFinite(n) && n > 0 ? n : null;
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

function positiveNumber(value) {
  const numericValue = contractNumber(value);
  return numericValue !== null && numericValue > 0 ? numericValue : null;
}

function nonNegativeNumber(value) {
  const numericValue = contractNumber(value);
  return numericValue !== null && numericValue >= 0 ? numericValue : null;
}

function percentOrNull(value) {
  const numericValue = contractNumber(value);
  return numericValue !== null && numericValue >= 0 && numericValue <= 100
    ? numericValue
    : null;
}

function textOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function reportScoreCommon(reportData) {
  const redFlags = Array.isArray(reportData?.details?.redFlags)
    ? reportData.details.redFlags
    : (Array.isArray(reportData?.red_flags) ? reportData.red_flags : []);
  return {
    // 详情页 hero 读取的就是 reportData.score；AI 也固定使用同一百分制字段。
    score: percentOrNull(reportData?.score),
    score_max: 100,
    grade: textOrNull(reportData?.status),
    red_flags: redFlags.filter((item) => typeof item === 'string' && item.trim()),
  };
}

function firstObject(...values) {
  return values.find(isObject) || {};
}

function footSources(reportData, side) {
  const title = side === 'left' ? 'Left' : 'Right';
  const arch = firstObject(reportData.arch_features, reportData.archFeatures);
  const sources = [
    arch[`${side}_foot`],
    arch[`${side}Foot`],
    arch[side],
    reportData[`${side}_foot`],
    reportData[`${side}Foot`],
    reportData[side],
    reportData[title],
  ].filter(isObject);
  return sources.flatMap((source) => [
    source,
    ...(isObject(source.archAnalysis) ? [source.archAnalysis] : []),
    ...(isObject(source.footData) ? [source.footData] : []),
  ]);
}

function firstFootValue(sources, ...keys) {
  for (const source of sources) {
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null) return source[key];
    }
  }
  return null;
}

function measuredArch(reportData, side) {
  const sources = footSources(reportData, side);
  const index = nonNegativeNumber(firstFootValue(
    sources,
    'area_index',
    'archIndex',
    'arch_index',
  ));
  const rawType = textOrNull(firstFootValue(
    sources,
    'area_type',
    'archType',
    'arch_type',
  ));
  return {
    index: index === null ? null : round(index, 2),
    type: rawType,
  };
}

function readableArchType(value) {
  const label = textOrNull(value);
  if (!label) return null;
  const normalized = label.toLowerCase();
  if (normalized.includes('normal') || label.includes('正常')) return '正常足弓';
  if (normalized.includes('high') || label.includes('高足弓') || label.includes('高弓')) {
    return '高弓足';
  }
  if (
    normalized.includes('flat')
    || normalized.includes('low')
    || label.includes('扁平')
    || label.includes('低足弓')
  ) return '扁平足';
  return label;
}

function archNote(leftArch, rightArch) {
  const descriptions = [
    ['左脚', readableArchType(leftArch.type)],
    ['右脚', readableArchType(rightArch.type)],
  ]
    .filter(([, type]) => type)
    .map(([side, type]) => `${side}${type}`);
  return descriptions.length ? descriptions.join('，') : null;
}

function normalizedRegionPressure(value) {
  if (!isObject(value)) return null;
  const regionNumber = (item) => contractNumber(
    isObject(item) ? (item.percent ?? item.ratio) : item,
  );
  const raw = {
    forefoot: regionNumber(value['前足'] ?? value.forefoot ?? value.front),
    midfoot: regionNumber(value['中足'] ?? value.midfoot ?? value.middle),
    heel: regionNumber(value['后足'] ?? value.hindfoot ?? value.rearfoot ?? value.heel),
  };
  const values = Object.values(raw);
  if (values.some((item) => item === null || item < 0)) return null;

  const total = values.reduce((sum, item) => sum + item, 0);
  const isRatio = total >= 0.95 && total <= 1.05;
  const isPercent = total >= 95 && total <= 105;
  if (!isRatio && !isPercent) return null;
  const factor = isRatio ? 100 : 1;
  return Object.fromEntries(
    Object.entries(raw).map(([key, item]) => [key, round(item * factor, 1)]),
  );
}

function measuredRegionPressure(reportData, side) {
  const additional = firstObject(reportData.additional_data, reportData.additionalData);
  const arch = firstObject(reportData.arch_features, reportData.archFeatures);
  const sideData = firstObject(
    reportData[side],
    reportData[`${side}Foot`],
    reportData[`${side}_foot`],
  );
  const candidates = [
    additional[`${side}_pressure`],
    additional[`${side}Pressure`],
    reportData[`${side}_region_pressure`],
    reportData[`${side}RegionPressure`],
    arch[`${side}_foot`]?.region_pressure,
    arch[`${side}Foot`]?.regionPressure,
    sideData.regionPressure,
    sideData.region_pressure,
  ];
  for (const candidate of candidates) {
    const normalized = normalizedRegionPressure(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function combinedRegionPercent(leftRegions, rightRegions, load, key) {
  if (!leftRegions || !rightRegions || !load) return null;
  const leftWeight = load.leftPercent / 100;
  const rightWeight = load.rightPercent / 100;
  return round(
    (leftRegions[key] * leftWeight) + (rightRegions[key] * rightWeight),
    1,
  );
}

function difference(leftValue, rightValue, digits) {
  const left = positiveNumber(leftValue);
  const right = positiveNumber(rightValue);
  return left === null || right === null ? null : round(Math.abs(left - right), digits);
}

/**
 * 评分结果的公共部分。
 * scoreXxx 返回 makeResult 的结构：{ score, maxScore, summary, redFlags, invalid, grade, breakdown }
 */
function scoreCommon(scored) {
  return {
    score: Number.isFinite(scored?.score) ? scored.score : null,
    score_max: Number.isFinite(scored?.maxScore) ? scored.maxScore : 25,
    // 档位文案在 makeResult 里叫 level（grade 只在 invalid 分支透传，不是通用字段）
    grade: typeof scored?.level === 'string' && scored.level.trim()
      ? scored.level.trim()
      : null,
    red_flags: Array.isArray(scored?.redFlags) ? scored.redFlags.filter(Boolean) : [],
  };
}

function invalidFacts(scored, fallbackReason) {
  return {
    is_valid: false,
    invalid_reason: (Array.isArray(scored?.redFlags) && scored.redFlags[0])
      || scored?.summary
      || fallbackReason,
  };
}

/* ════════════════════════════════════════════════
   起坐
   ════════════════════════════════════════════════ */

// 三项的 scoreXxx 都只吃 reportData（与握力不同，不需要性别定阈值）；
// patientInfo 仍保留在签名里，供调用方统一传参、也留给 prompt 用姓名年龄
export function buildSitStandAiFacts(reportData, _patientInfo) {
  if (!isObject(reportData)) return null;

  const scored = scoreSitStand(reportData);
  if (scored?.invalid) return invalidFacts(scored, '本次起坐数据不足以评估');

  const m = extractSitStandMetrics(reportData);

  return {
    is_valid: true,
    total_seconds: posOrNull(m.totalDuration),
    average_seconds: posOrNull(m.avgDuration),
    // 只取真实存在的周期时长；空数组交给 prompt 侧跳过该行
    cycle_seconds: Array.isArray(m.cycleDurations)
      ? m.cycleDurations.map((v) => round(v, 1)).filter((v) => v !== null && v > 0)
      : [],
    left_right_ratio: posOrNull(m.leftRightRatio),
    /*
     * 平滑度原始口径是「总变差 / 净变化」，≈1 最平顺、越大越代偿，
     * 是个下限为 1 的开区间值。直接丢给 LLM 它会读不懂方向，
     * 所以换算成 0-100 的「越大越平顺」分数：1 → 100，2 → 50，3 → 33。
     */
    smoothness: m.forceCurveSmoothness > 0
      ? round(Math.min(100, 100 / m.forceCurveSmoothness), 0)
      : null,
    ...scoreCommon(scored),
  };
}

/* ════════════════════════════════════════════════
   站立
   ════════════════════════════════════════════════ */

/**
 * 站立的「晃动」用 COP 轨迹长度衡量。
 *
 * 档位切点直接取自 assessmentScoring 里 COP 稳态水平的评分档
 * （≤1000mm=5分 / 1001–1500mm=3分 / >1500mm=1分），不另立标准。
 */
function copPathGrade(pathLengthMm) {
  if (!Number.isFinite(pathLengthMm) || pathLengthMm <= 0) return null;
  if (pathLengthMm <= 1000) return '稳';
  if (pathLengthMm <= 1500) return '略有晃动';
  return '晃动偏大';
}

export function buildStandingAiFacts(reportData, _patientInfo) {
  if (!isObject(reportData)) return null;

  // gateway 通常已增强过；这里再调用一次是幂等的，也覆盖直接调用 builder 的场景。
  const enriched = enrichStandingReportData(reportData);
  const common = reportScoreCommon(enriched);
  const load = deriveStandingBilateralLoad(reportData);
  const scoreReady = common.score !== null
    && load !== null
    && percentOrNull(load.leftPercent) !== null
    && percentOrNull(load.rightPercent) !== null;

  const cop = standingCopMetrics(reportData);
  const pathLength = positiveNumber(cop.path_length ?? cop.pathLength);
  const centerControl = deriveStandingCenterControl(reportData);
  const leftArch = measuredArch(reportData, 'left');
  const rightArch = measuredArch(reportData, 'right');
  const leftRegions = measuredRegionPressure(reportData, 'left');
  const rightRegions = measuredRegionPressure(reportData, 'right');
  const invalidReason = scoreReady
    ? null
    : textOrNull(enriched?.summary?.lead)
      || textOrNull(enriched?.evaluation)
      || '本次站立数据不完整，无法生成可靠的综合评价';

  return {
    is_valid: scoreReady,
    invalid_reason: invalidReason,
    left_percent: load ? round(load.leftPercent, 1) : null,
    right_percent: load ? round(load.rightPercent, 1) : null,
    // 保留算法统计范围；代表侧单足 COP 不扩大解释为整体身体重心移动。
    sway_cm: pathLength === null ? null : round(pathLength / 10, 2),
    sway_grade: copPathGrade(pathLength),
    cop_scope: representativeStandingCop(reportData) ? '代表侧单足 COP' : '整体 COP',
    center_control_scope: centerControl ? '峰值帧足底压力中心偏移代理' : null,
    center_lateral_offset_cm: centerControl?.quality?.valid
      ? round(centerControl.lateralOffsetCm, 2)
      : null,
    center_longitudinal_offset_cm: centerControl?.quality?.valid
      ? round(centerControl.longitudinalOffsetCm, 2)
      : null,
    center_offset_magnitude_cm: centerControl?.quality?.valid
      ? round(centerControl.magnitudeCm, 2)
      : null,
    center_lateral_direction: centerControl?.quality?.valid
      ? centerControl.lateralDirection
      : null,
    left_arch_index: leftArch.index,
    right_arch_index: rightArch.index,
    // 分类只取算法实际输出，不根据指数另行推断。
    arch_note: archNote(leftArch, rightArch),
    // 双脚三区都完整时，按实测左右承重合成为全足占比；缺一侧即不输出。
    forefoot_percent: combinedRegionPercent(leftRegions, rightRegions, load, 'forefoot'),
    midfoot_percent: combinedRegionPercent(leftRegions, rightRegions, load, 'midfoot'),
    heel_percent: combinedRegionPercent(leftRegions, rightRegions, load, 'heel'),
    left_forefoot_percent: leftRegions?.forefoot ?? null,
    left_midfoot_percent: leftRegions?.midfoot ?? null,
    left_heel_percent: leftRegions?.heel ?? null,
    right_forefoot_percent: rightRegions?.forefoot ?? null,
    right_midfoot_percent: rightRegions?.midfoot ?? null,
    right_heel_percent: rightRegions?.heel ?? null,
    ...common,
  };
}

/* ════════════════════════════════════════════════
   步态
   ════════════════════════════════════════════════ */

/** 日常步速参考线：与 assessmentScoring.gaitCoreScore 的 1.0 m/s 档位一致 */
const GAIT_SPEED_REFERENCE_MPS = 1.0;

export function buildGaitAiFacts(reportData, _patientInfo) {
  if (!isObject(reportData)) return null;

  const enriched = enrichGaitReportData(reportData);
  const gp = isObject(enriched?.gaitParams) ? enriched.gaitParams : {};
  const rhythm = isObject(enriched?.abilities?.rhythm) ? enriched.abilities.rhythm : {};
  const stability = isObject(enriched?.abilities?.stability) ? enriched.abilities.stability : {};
  const direction = isObject(enriched?.abilities?.direction) ? enriched.abilities.direction : {};
  const common = reportScoreCommon(enriched);
  const load = deriveBilateralLoadPercent(reportData);
  const hasCompleteScoreInputs = [
    gp.walkingSpeed,
    gp.leftStepTime,
    gp.rightStepTime,
    gp.leftStepLength,
    gp.rightStepLength,
  ].every((value) => positiveNumber(value) !== null);

  // 步态综合评分不以左右累计负荷为必需项；负荷缺失只让对应局部事实留空。
  const isValid = hasCompleteScoreInputs
    && common.score !== null
    && !['数据不足', '数据异常'].includes(common.grade);
  const invalidReason = isValid
    ? null
    : !hasCompleteScoreInputs
      ? textOrNull(enriched?.summary?.lead)
        || '本次步态数据不完整，无法生成可靠的综合评价'
      : textOrNull(enriched?.summary?.lead)
        || '本次步态数据不完整，无法生成可靠的综合评价';

  return {
    is_valid: isValid,
    invalid_reason: invalidReason,
    speed_mps: round(positiveNumber(gp.walkingSpeed), 2),
    speed_reference: GAIT_SPEED_REFERENCE_MPS,
    // rhythm 来自 enrich，与报告卡片采用同脚周期的 120 / 周期口径。
    cadence_spm: positiveNumber(rhythm.cadenceStepsPerMinute),
    step_length_m: positiveNumber(rhythm.stepLengthM),
    step_width_cm: positiveNumber(gp.stepWidth) === null ? null : round(Number(gp.stepWidth), 1),
    double_support_s: positiveNumber(gp.doubleContactTime) === null
      ? null
      : round(Number(gp.doubleContactTime), 2),
    // 0 是有效的“无差异”，必须保留，不能按 truthy 过滤。
    step_length_diff: difference(gp.leftStepLength, gp.rightStepLength, 1),
    step_time_diff: difference(gp.leftStepTime, gp.rightStepTime, 3),
    step_time_cv_percent: stability.quality?.valid === true
      ? contractNumber(stability.stepTimeCvPercent)
      : null,
    step_distance_cv_percent: stability.quality?.valid === true
      ? contractNumber(stability.stepDistanceCvPercent)
      : null,
    stability_valid_steps: stability.quality?.valid === true
      ? contractNumber(stability.validStepCount)
      : null,
    stability_confidence: stability.quality?.valid === true
      ? textOrNull(stability.quality?.confidence)
      : null,
    path_deviation_cm: direction.quality?.valid === true
      ? contractNumber(direction.pathDeviationCm)
      : null,
    max_path_deviation_cm: direction.quality?.valid === true
      ? contractNumber(direction.maxPathDeviationCm)
      : null,
    direction_valid_steps: direction.quality?.valid === true
      ? contractNumber(direction.validStepCount)
      : null,
    direction_confidence: direction.quality?.valid === true
      ? textOrNull(direction.quality?.confidence)
      : null,
    left_load_percent: load?.leftLoadPercent ?? null,
    right_load_percent: load?.rightLoadPercent ?? null,
    ...common,
  };
}
