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
  scoreStanding,
  scoreGait,
  extractSitStandMetrics,
  extractStandingMetrics,
  extractGaitMetrics,
  toNumber,
} from './assessmentScoring';

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

function finiteOrNull(value) {
  const n = toNumber(value, null);
  return Number.isFinite(n) ? n : null;
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

  const scored = scoreStanding(reportData);
  if (scored?.invalid) return invalidFacts(scored, '本次站立数据不足以评估');

  /*
   * 不自己猜字段嵌法：站立的 reportData 有「后端算法」与「前端算法」两套
   * 完全不同的形状（arch_features/cop_time_series vs left.archAnalysis/bilateral），
   * extractStandingMetrics 已经把两套都归一化了，直接复用它，
   * 避免这里和评分口径漂移。
   */
  const m = extractStandingMetrics(reportData);

  const leftPercent = finiteOrNull(m.leftPressureRatio);
  const rightPercent = finiteOrNull(m.rightPressureRatio);

  return {
    is_valid: true,
    left_percent: leftPercent,
    right_percent: rightPercent,
    // COP 轨迹长度：站立时重心划过的总路程，越短越稳
    sway_mm: posOrNull(m.pathLength) === null ? null : round(m.pathLength, 1),
    sway_grade: copPathGrade(m.pathLength),
    left_arch_index: finiteOrNull(m.leftArchIndex),
    right_arch_index: finiteOrNull(m.rightArchIndex),
    // 足型分类由算法给，没有就不提 —— 不按指数自己编「高足弓/平足」
    arch_note: null,
    // 前后掌占比这一层实测里没有统一字段，留空由 prompt 跳过
    forefoot_percent: null,
    heel_percent: null,
    ...scoreCommon(scored),
  };
}

/* ════════════════════════════════════════════════
   步态
   ════════════════════════════════════════════════ */

/** 日常步速参考线：与 assessmentScoring.gaitCoreScore 的 1.0 m/s 档位一致 */
const GAIT_SPEED_REFERENCE_MPS = 1.0;

export function buildGaitAiFacts(reportData, _patientInfo) {
  if (!isObject(reportData)) return null;

  const scored = scoreGait(reportData);
  if (scored?.invalid) return invalidFacts(scored, '本次步态数据不足以评估');

  const m = extractGaitMetrics(reportData);
  const gp = isObject(reportData.gaitParams) ? reportData.gaitParams : {};

  const leftLen = posOrNull(m.leftStepLength);
  const rightLen = posOrNull(m.rightStepLength);
  const stepLengthM = leftLen !== null && rightLen !== null
    ? round((leftLen + rightLen) / 2, 2)
    : (leftLen ?? rightLen);

  const leftTime = posOrNull(m.leftStepTime);
  const rightTime = posOrNull(m.rightStepTime);
  const avgStepTime = leftTime !== null && rightTime !== null
    ? (leftTime + rightTime) / 2
    : (leftTime ?? rightTime);

  return {
    is_valid: true,
    speed_mps: posOrNull(m.walkingSpeed) === null ? null : round(m.walkingSpeed, 2),
    speed_reference: GAIT_SPEED_REFERENCE_MPS,
    // 步频没有直接字段，用平均单步时间换算：60 / 单步秒数 = 步/分
    cadence_spm: avgStepTime ? round(60 / avgStepTime, 0) : null,
    step_length_m: stepLengthM,
    step_width_cm: posOrNull(m.stepWidth) === null ? null : round(m.stepWidth, 1),
    double_support_s: posOrNull(m.doubleContactTime) === null
      ? null
      : round(m.doubleContactTime, 2),
    step_length_diff: Number.isFinite(m.stepLengthDiff) && m.stepLengthDiff > 0
      ? round(m.stepLengthDiff, 2)
      : null,
    step_time_diff: Number.isFinite(m.stepTimeDiff) && m.stepTimeDiff > 0
      ? round(m.stepTimeDiff, 2)
      : null,
    path_deviation_cm: finiteOrNull(gp.pathDeviation ?? gp.path_deviation),
    ...scoreCommon(scored),
  };
}
