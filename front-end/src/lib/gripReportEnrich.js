/**
 * 握力报告数据增强层 —— 把手套实测数据补成 0810 交付包页面需要的形状。
 *
 * 为什么需要这一层
 * ---------------------------------------------------------------
 * 交付包的 mapGripReport 是照着「后端会算好一切」的假设写的，它要读
 *   data.score / data.status / data.summary / data.findings
 *   data.metrics.{maximum,average,difference,endurance}.{status,reference,gaugePosition,...}
 *   data.evaluation.{overall,peer,grade,aiSummary}
 *   data.advice[3] / data.details.{cv,trend}
 * 而本系统实际存进 IndexedDB 的 reportData 只有手套原始产出：
 *   { left|right: { totalForce, fingers[], peakInfo, shakeCount, times[],
 *                   forceTimeSeries{thumb..palm,total}, angularVelocity[], gripDuration },
 *     activeHand, patientName }
 * 缺的那些字段全部走 mapper 的兜底，于是页面上数值算得出来、状态和参考范围
 * 却一律显示「数据不足」。这一层就是把两边接上。
 *
 * 两条红线（BACKEND_HANDOFF.md §7.3 / §8.3 / §11）
 * ---------------------------------------------------------------
 * 1. 参考范围/阈值只能来自可信来源。这里用的是 AWGS 2019 握力切点
 *    （男 28kg / 女 18kg），与 assessmentScoring.js 的 toB 评分同一套常量，
 *    不自己编造上限区间 —— 所以最大握力那张卡显示的是「≥ 切点」而不是
 *    凭空造一个 min~max band。
 * 2. 所有数值都从实测序列算出，不猜、不填假数。算不出来的（如三次测试对比：
 *    本系统每只手只握一次）如实留空，由页面隐藏对应区块。
 *
 * 单位约定：手套与本层内部一律用 N；kg 只在与 AWGS 切点比较时换算（÷9.8）。
 * 交付包页面只显示 N，mapper 里还有一道「aiSummary 含 kg 就整段丢弃」的校验。
 */
import { scoreGrip, extractGripMetrics, toNumber } from './assessmentScoring';

const G = 9.8;                 // N per kg，与 assessmentScoring.getHandForceN 口径一致
const AWGS_THRESHOLD_KG = { 男: 28, 女: 18 };
const MODULE_MAX_SCORE = 25;   // V3 单模块满分，折算百分制用

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function thresholdKg(gender) {
  return AWGS_THRESHOLD_KG[gender] ?? AWGS_THRESHOLD_KG.女;
}

/**
 * 把文案里的「XXkg」改写成「XXX N」。
 *
 * assessmentScoring 是 toB 侧的，文案用 kg（如「男性最大握力低于 28kg 参考阈值」）。
 * 但 toC 报告全程只显示 N，而且 mapGripReport 有一道硬校验：
 * aiSummary 四段里只要出现 kg，整段丢弃回落兜底文案。
 *
 * 这些文案有两个去处 —— 页面上的「需要留意」列表，和喂给 LLM 的事实清单。
 * 两边都不能带 kg，所以在这里统一洗一次，而不是在两个下游各洗一遍。
 */
function kgTextToNewton(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/(\d+(?:\.\d+)?)\s*(?:kg|KG|Kg|公斤|千克)/g, (_match, num) => {
    const newton = round(parseFloat(num) * G, 1);
    return newton === null ? _match : `${newton} N`;
  });
}

/* ════════════════════════════════════════════════
   力-时间序列：平台期定位与统计
   ════════════════════════════════════════════════ */

/**
 * 取某只手的力-时间序列。
 *
 * 注意坐标系：peakInfo 里的 *_idx 是在**原始全采样**帧上算的，而 times /
 * forceTimeSeries 已被降采样（gripReportGenerator.js:127 MAX_POINTS=500），
 * 两者索引不通用。所以这里一律按**时间（秒）**定位，Python 与前端兜底
 * 两条链路都适用。
 */
function handSeries(hand) {
  if (!isObject(hand)) return null;
  const times = Array.isArray(hand.times) ? hand.times : null;
  const total = Array.isArray(hand.forceTimeSeries?.total) ? hand.forceTimeSeries.total : null;
  if (!times || !total || times.length < 4 || times.length !== total.length) return null;
  return { times, total };
}

/**
 * 平台期（真正在用力握住的那一段）的下标区间。
 * 优先用 peakInfo.start_time / end_time；拿不到就退回「≥ 峰值 80%」的连续区间。
 */
function plateauRange(hand, series) {
  const start = toNumber(hand?.peakInfo?.start_time, null);
  const end = toNumber(hand?.peakInfo?.end_time, null);
  if (start !== null && end !== null && end > start) {
    const from = series.times.findIndex((t) => t >= start);
    let to = -1;
    for (let i = series.times.length - 1; i >= 0; i -= 1) {
      if (series.times[i] <= end) { to = i; break; }
    }
    if (from >= 0 && to > from) return { from, to };
  }

  // 兜底：以峰值 80% 为门限，向两侧扩出连续段
  const peak = Math.max(...series.total);
  if (!(peak > 0)) return null;
  const gate = peak * 0.8;
  const peakIdx = series.total.indexOf(peak);
  let from = peakIdx;
  let to = peakIdx;
  while (from > 0 && series.total[from - 1] >= gate) from -= 1;
  while (to < series.total.length - 1 && series.total[to + 1] >= gate) to += 1;
  return to > from ? { from, to } : null;
}

function stats(values) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return null;
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  if (!(mean > 0)) return null;
  const variance = clean.reduce((acc, v) => acc + (v - mean) ** 2, 0) / clean.length;
  const std = Math.sqrt(variance);
  return { mean, std, cv: (std / mean) * 100, count: clean.length };
}

/**
 * 平台期画像：平均力、离散度（CV）、保持率、5 点采样曲线。
 *
 * 保持率 = 平台期最后 1/4 的均值 / 前 1/4 的均值 × 100。
 * 这是「握住之后力有没有掉下去」的直接度量，比拿峰值当分母更稳
 * （峰值是单点，容易被一个尖刺带偏）。
 */
function plateauProfile(hand) {
  const series = handSeries(hand);
  if (!series) return null;
  const range = plateauRange(hand, series);
  if (!range) return null;

  const { from, to } = range;
  const values = series.total.slice(from, to + 1);
  const basic = stats(values);
  if (!basic) return null;

  const duration0 = series.times[to] - series.times[from];

  const quarter = Math.max(1, Math.floor(values.length / 4));
  const head = stats(values.slice(0, quarter));
  const tail = stats(values.slice(-quarter));
  /*
   * 保持率需要「握住一段时间」才有意义。平台期不足 1 秒时（受试者只是快速
   * 捏一下、或峰值很尖导致 ≥80% 区间很窄），末段/起始的比值必然接近 100%，
   * 显示「保持率 100% 保持好」是误导 —— 那不是耐力好，是压根没测到耐力。
   * 这种情况如实返回 null，页面显示「数据不足」。
   */
  const MIN_HOLD_SECONDS = 1;
  const longEnough = Number.isFinite(duration0) && duration0 >= MIN_HOLD_SECONDS;
  const retention = longEnough && head && tail
    ? clamp((tail.mean / head.mean) * 100, 0, 100)
    : null;

  // 5 点等距采样，归一化到平台期起始力 = 100%。握持过短时不出曲线，
  // 否则会画出一条毫无信息量的水平线。
  const base = head?.mean ?? basic.mean;
  const sample = [];
  const labels = [];
  if (longEnough) {
    for (let i = 0; i < 5; i += 1) {
      const idx = Math.round((values.length - 1) * (i / 4));
      sample.push(round(clamp((values[idx] / base) * 100, 0, 100), 1));
      labels.push(`${round(duration0 * (i / 4), 1)}s`);
    }
  }

  return {
    meanForce: round(basic.mean, 2),
    cv: round(basic.cv, 1),
    retentionPercent: retention === null ? null : round(retention, 1),
    series: sample,
    seriesLabels: labels,
    holdSeconds: round(duration0, 1),
    holdTooShort: !longEnough,
  };
}

/* ════════════════════════════════════════════════
   分档文案
   ════════════════════════════════════════════════ */

/** 最大握力档位。切点来自 assessmentScoring.gripCoreScore 的 R 值分档。 */
const FORCE_BANDS = [
  { min: 1.10, label: '优秀' },
  { min: 1.00, label: '良好' },
  { min: 0.85, label: '一般' },
  { min: 0.70, label: '偏低' },
  { min: -Infinity, label: '低' },
];
const GAUGE_BANDS = ['低', '一般', '良好', '优秀'];

function forceBandLabel(ratio) {
  return FORCE_BANDS.find((band) => ratio >= band.min).label;
}

/** 仪表盘指针位置：把 R 值分档的边界对齐到刻度上，而不是线性拉伸。 */
function gaugePosition(ratio) {
  if (!Number.isFinite(ratio)) return null;
  const stops = [[0.55, 0], [0.70, 25], [0.85, 50], [1.00, 75], [1.15, 100]];
  if (ratio <= stops[0][0]) return 0;
  if (ratio >= stops[stops.length - 1][0]) return 100;
  for (let i = 1; i < stops.length; i += 1) {
    const [x1, y1] = stops[i - 1];
    const [x2, y2] = stops[i];
    if (ratio <= x2) {
      return round(y1 + ((ratio - x1) / (x2 - x1)) * (y2 - y1), 1);
    }
  }
  return null;
}

/** 仪表盘高亮哪一档（低/一般/良好/优秀），供 GripGauge 数据驱动。 */
function gaugeBand(ratio) {
  if (!Number.isFinite(ratio)) return null;
  if (ratio >= 1.10) return '优秀';
  if (ratio >= 1.00) return '良好';
  if (ratio >= 0.85) return '一般';
  return '低';
}

/** 左右差异档位。切点来自 assessmentScoring.gripSymmetryScore。 */
function differenceBandLabel(diffPct) {
  if (diffPct === null) return '数据不足';
  if (diffPct <= 10) return '优秀';
  if (diffPct <= 20) return '正常';
  if (diffPct <= 30) return '轻度不对称';
  return '中度不对称';
}

/** 发力稳定性（CV）档位。统计离散度分档，非临床诊断标准，文案里已注明。 */
function cvBandLabel(cv) {
  if (cv === null) return null;
  if (cv <= 8) return '很稳定';
  if (cv <= 15) return '较稳定';
  if (cv <= 25) return '波动偏大';
  return '波动明显';
}

function retentionBandLabel(percent) {
  if (percent === null) return '数据不足';
  if (percent >= 90) return '保持好';
  if (percent >= 80) return '略有下降';
  if (percent >= 65) return '下降明显';
  return '衰减快';
}

/* ════════════════════════════════════════════════
   二级指标
   ════════════════════════════════════════════════ */

/**
 * 从 timeAnalysis 里按标签取值。
 *
 * timeAnalysis 是 [{label, value}] 且 value 是带单位的格式化字符串
 * （如 "0.842 s"）。Python 与前端兜底两条链路都会产出它，但各自的
 * 原始字段名不完全一致，所以把它当兜底数据源：先读结构化字段，
 * 读不到再从这里抠数字。
 */
function fromTimeAnalysis(hand, label) {
  const rows = Array.isArray(hand?.timeAnalysis) ? hand.timeAnalysis : [];
  const row = rows.find((item) => typeof item?.label === 'string' && item.label.includes(label));
  if (!row) return null;
  const matched = String(row.value ?? '').match(/-?\d+(?:\.\d+)?/);
  return matched ? Number(matched[0]) : null;
}

const PALM_NAMES = ['手掌', '掌部', 'palm'];

function isPalm(finger) {
  const name = String(finger?.name ?? '').toLowerCase();
  const key = String(finger?.key ?? '').toLowerCase();
  return PALM_NAMES.some((n) => name.includes(n) || key.includes(n));
}

/** 单只手的二级指标原始值。取不到的一律 null，由调用方决定是否显示该项。 */
function handSecondaryValues(hand, profile) {
  if (!isObject(hand)) return null;

  const peak = isObject(hand.peakInfo) ? hand.peakInfo : {};

  // 发力速度：从开始用力到达到最大力用了多久
  const startTime = toNumber(hand.gripStartTime, null) ?? toNumber(peak.start_time, null);
  const peakTime = toNumber(peak.peak_time, null);
  const timeToPeak = startTime !== null && peakTime !== null && peakTime >= startTime
    ? round(peakTime - startTime, 2)
    : (fromTimeAnalysis(hand, '到达峰值耗时') ?? null);

  const gripDuration = posOrNullLocal(hand.gripDuration)
    ?? fromTimeAnalysis(hand, '有效抓握时长');

  const shakeCount = toNumber(hand.shakeCount ?? hand.shake_count, null)
    ?? fromTimeAnalysis(hand, '抖动次数');

  // 接触面积：原始单位 mm²，换成 cm² 更好读
  const areaMm2 = posOrNullLocal(hand.totalArea);
  const areaCm2 = areaMm2 === null ? null : round(areaMm2 / 100, 1);

  // 手掌占比：手掌力 / 总力。反映是靠手掌压还是靠手指抓
  const fingers = Array.isArray(hand.fingers) ? hand.fingers : [];
  const palm = fingers.find(isPalm);
  const totalForce = posOrNullLocal(hand.totalForce)
    ?? (fingers.length
      ? fingers.reduce((sum, f) => sum + (toNumber(f?.force, 0) || 0), 0)
      : null);
  const palmForce = palm ? toNumber(palm.force, null) : null;
  const palmShare = palmForce !== null && totalForce
    ? round((palmForce / totalForce) * 100, 1)
    : null;

  // 最强手指（排除手掌）
  const fingerOnly = fingers.filter((f) => !isPalm(f) && Number.isFinite(toNumber(f?.force, null)));
  const strongest = fingerOnly.length
    ? fingerOnly.reduce((best, f) => (toNumber(f.force, 0) > toNumber(best.force, 0) ? f : best))
    : null;

  return {
    timeToPeak: timeToPeak !== null && timeToPeak >= 0 ? timeToPeak : null,
    gripDuration: gripDuration !== null && gripDuration > 0 ? round(gripDuration, 1) : null,
    shake: shakeCount !== null && shakeCount >= 0 ? shakeCount : null,
    contactArea: areaCm2,
    palmShare,
    strongestFinger: strongest ? textOrNull(strongest.name) : null,
    strongestFingerForce: strongest ? round(toNumber(strongest.force, 0), 1) : null,
    cv: profile?.cv ?? null,
  };
}

/**
 * 二级指标：主卡之外、但对读报告的人仍有意义的几项。
 *
 * 每一项左右手各有一个值 —— 这些全是单手测量量（发力多快、握了多久、
 * 抖了几次…），只报强侧会丢掉另一只手的信息。所以一张卡里并排给两个值，
 * 配色沿用六区域力量图的口径（左手蓝 / 右手橙）。
 *
 * 取舍原则 —— toB 报告里那 13 项「时间与抖动分析」是工程量
 * （检测阈值、平均角速度、峰值区间起止…），对老人没有解读价值，不照搬。
 * 这里只留能用一句话说清「说明什么」的。
 *
 * 左右都取不到的项整条丢弃 —— 宁可少显示，不显示「--」。
 */
function buildSecondaryMetrics(leftHand, rightHand, leftProfile, rightProfile) {
  const L = handSecondaryValues(leftHand, leftProfile);
  const R = handSecondaryValues(rightHand, rightProfile);
  if (!L && !R) return [];

  const pick = (key) => [L?.[key] ?? null, R?.[key] ?? null];

  /** 两侧都有值时取较好的一侧来写注解；只有一侧就用那一侧 */
  const best = (pair, lowerIsBetter) => {
    const [l, r] = pair;
    if (l === null) return r;
    if (r === null) return l;
    return lowerIsBetter ? Math.min(l, r) : Math.max(l, r);
  };

  const some = (pair) => pair[0] !== null || pair[1] !== null;

  const timeToPeak = pick('timeToPeak');
  const gripDuration = pick('gripDuration');
  const shake = pick('shake');
  const contactArea = pick('contactArea');
  const palmShare = pick('palmShare');
  const strongestFinger = pick('strongestFinger');
  const cv = pick('cv');

  const items = [
    some(timeToPeak) ? {
      id: 'timeToPeak',
      label: '发力速度',
      left: timeToPeak[0],
      right: timeToPeak[1],
      unit: 's',
      note: (() => {
        const b = best(timeToPeak, true);
        return b <= 0.6 ? '一使劲就到位' : b <= 1.2 ? '发力节奏正常' : '使上劲偏慢';
      })(),
      tone: 'green',
    } : null,

    some(gripDuration) ? {
      id: 'gripDuration',
      label: '抓握时长',
      left: gripDuration[0],
      right: gripDuration[1],
      unit: 's',
      note: best(gripDuration, false) >= 3 ? '握够了时间' : '偏短，建议握满 3-5 秒',
      tone: 'blue',
    } : null,

    some(shake) ? {
      id: 'shake',
      label: '抓握抖动',
      left: shake[0],
      right: shake[1],
      unit: '次',
      note: (() => {
        const b = best(shake, true);
        return b <= 2 ? '很稳，几乎不抖' : b <= 5 ? '有点轻微抖动' : '抖动偏多';
      })(),
      tone: 'purple',
    } : null,

    some(contactArea) ? {
      id: 'contactArea',
      label: '接触面积',
      left: contactArea[0],
      right: contactArea[1],
      unit: 'cm²',
      note: '手掌和手指压到手套的总面积',
      tone: 'orange',
    } : null,

    some(palmShare) ? {
      id: 'palmShare',
      label: '手掌出力占比',
      left: palmShare[0],
      right: palmShare[1],
      unit: '%',
      note: (() => {
        const b = best(palmShare, false);
        return b >= 55 ? '主要靠手掌压' : b >= 35 ? '手掌和手指配合得当' : '主要靠手指抓';
      })(),
      tone: 'green',
    } : null,

    some(strongestFinger) ? {
      id: 'strongestFinger',
      label: '最有劲的手指',
      left: strongestFinger[0],
      right: strongestFinger[1],
      unit: '',
      note: [
        L?.strongestFingerForce !== null && L?.strongestFingerForce !== undefined
          ? `左 ${L.strongestFingerForce} N` : null,
        R?.strongestFingerForce !== null && R?.strongestFingerForce !== undefined
          ? `右 ${R.strongestFingerForce} N` : null,
      ].filter(Boolean).join(' ｜ '),
      tone: 'blue',
      isText: true,
    } : null,

    some(cv) ? {
      id: 'cv',
      label: '力值波动',
      left: cv[0],
      right: cv[1],
      unit: '%',
      note: cvBandLabel(best(cv, true)) ?? '',
      tone: 'purple',
    } : null,
  ];

  return items.filter(Boolean);
}

function posOrNullLocal(value) {
  const n = toNumber(value, null);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function textOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/* ════════════════════════════════════════════════
   力-时间曲线
   ════════════════════════════════════════════════ */

/** 曲线渲染点数。500 点画在 ~700px 宽里过密，等距抽到这个数足够平滑 */
const CURVE_POINTS = 120;

/**
 * 把一只手的力-时间序列抽成定长点集。
 *
 * 用等距索引抽样而不是滑窗平均：握力曲线的峰值是关键信息，
 * 平均会把尖峰削平。抽样后再单独把真实峰值点标出来。
 */
function handCurve(hand) {
  const series = handSeries(hand);
  if (!series) return null;

  const { times, total } = series;
  const n = times.length;
  const step = Math.max(1, Math.floor(n / CURVE_POINTS));

  const points = [];
  for (let i = 0; i < n; i += step) {
    const t = toNumber(times[i], null);
    const f = toNumber(total[i], null);
    if (t === null || f === null) continue;
    points.push({ t: round(t, 3), f: round(f, 1) });
  }
  // 保证收尾点在，否则曲线会在末尾被截断
  const lastT = toNumber(times[n - 1], null);
  const lastF = toNumber(total[n - 1], null);
  if (lastT !== null && lastF !== null && points[points.length - 1]?.t !== round(lastT, 3)) {
    points.push({ t: round(lastT, 3), f: round(lastF, 1) });
  }
  if (points.length < 4) return null;

  const peakF = Math.max(...total.map((v) => toNumber(v, 0) || 0));
  const peakIdx = total.findIndex((v) => (toNumber(v, 0) || 0) === peakF);
  const peakT = peakIdx >= 0 ? toNumber(times[peakIdx], null) : null;

  return {
    points,
    peak: peakT !== null ? { t: round(peakT, 3), f: round(peakF, 1) } : null,
    duration: round(times[n - 1] - times[0], 2),
  };
}

/**
 * 左右手的力-时间曲线，共用一套坐标轴。
 *
 * 只做「总力」这一条，不做各手指的堆叠图 —— 六区域力量那张图已经把
 * 分区信息讲清楚了，再叠 6 条线对读报告的人是噪音。
 *
 * 也刻意不导出欧拉角/角速度曲线：前端算法链路里 eulerData 是
 * Math.random() 造的正弦波（gripReportGenerator.js:186-188），
 * angularVelocity 由它派生，画出来是假数据。
 */
function buildForceCurve(leftHand, rightHand) {
  const left = handCurve(leftHand);
  const right = handCurve(rightHand);
  if (!left && !right) return null;

  const maxForce = Math.max(
    left?.peak?.f ?? 0,
    right?.peak?.f ?? 0,
  );
  if (!(maxForce > 0)) return null;

  return {
    left,
    right,
    maxForce: round(maxForce, 1),
    maxDuration: round(Math.max(left?.duration ?? 0, right?.duration ?? 0), 2),
    unit: 'N',
  };
}

/* ════════════════════════════════════════════════
   主入口
   ════════════════════════════════════════════════ */

/**
 * 用 V3 评分 + 手套实测序列，把 reportData 补成交付包页面要的形状。
 *
 * 只做新增，不覆盖已有字段 —— 若将来后端开始下发 metrics/evaluation，
 * 后端的值优先，这一层自动退位。
 *
 * @param {object} reportData 手套产出的 reportData（含 left/right）
 * @param {object} [options]
 * @param {object} [options.patientInfo] { gender, age, weight } —— gender 决定 AWGS 切点
 * @param {Array}  [options.trend] 历史趋势点 [{date, force}]，由调用方从历史记录算好
 * @returns {object} 增强后的 reportData
 */
export function enrichGripReportData(reportData, { patientInfo, trend } = {}) {
  if (!isObject(reportData)) return reportData;
  // 已经是增强过/后端下发的完整形状，不重复处理
  if (isObject(reportData.metrics) && isObject(reportData.metrics.maximum)) return reportData;

  const leftHand = isObject(reportData.left) ? reportData.left : null;
  const rightHand = isObject(reportData.right) ? reportData.right : null;
  if (!leftHand && !rightHand) return reportData;

  const gender = patientInfo?.gender;
  const m = extractGripMetrics(reportData, { gender });
  const scored = scoreGrip(reportData, { gender });

  // 数据无效时不编造任何分档，交给 mapper 的「数据不足」兜底
  if (scored?.invalid) {
    return {
      ...reportData,
      score: 0,
      status: '数据异常',
      summary: {
        title: '本次握力数据无法评估',
        lead: kgTextToNewton(scored.summary) || '采集数据不足以反映真实握力，建议规范佩戴手套后复测。',
      },
      evaluation: {
        overall: { body: kgTextToNewton(scored.summary || '') },
        grade: { label: '数据异常' },
      },
    };
  }

  const thKg = thresholdKg(gender);
  const thN = round(thKg * G, 1);
  const ratio = m.ratio;

  const leftN = leftHand ? toNumber(leftHand.totalForce, null) : null;
  const rightN = rightHand ? toNumber(rightHand.totalForce, null) : null;
  const maxN = Math.max(...[leftN, rightN].filter((v) => Number.isFinite(v)), 0) || null;
  const diffPct = m.diffPct;

  // 以力值更大的一侧作为平台期分析对象，与 V3 增强指标口径一致
  const mainHand = (rightN ?? -1) > (leftN ?? -1) ? rightHand : leftHand;
  const profile = plateauProfile(mainHand);
  const leftProfile = plateauProfile(leftHand);
  const rightProfile = plateauProfile(rightHand);

  // 平均握力：本系统每只手只握一次，没有「三次测试」，
  // 所以这里的「平均」= 平台期平均力（握住那几秒的均值），
  // 图表三根柱子改为 左手/右手/平均，标签同步改掉，不冒充三次测试。
  const meanForces = [leftProfile?.meanForce ?? null, rightProfile?.meanForce ?? null];
  const validMeans = meanForces.filter((v) => Number.isFinite(v));
  const overallMean = validMeans.length
    ? round(validMeans.reduce((a, b) => a + b, 0) / validMeans.length, 2)
    : null;

  const scorePercent = Number.isFinite(scored?.score)
    ? Math.round((scored.score / MODULE_MAX_SCORE) * 100)
    : null;

  const coreItem = scored?.breakdown?.find((b) => b.group === 'core');
  const enhancedItems = scored?.breakdown?.filter((b) => b.group === 'enhanced') ?? [];
  const enhancedTotal = enhancedItems.reduce((sum, b) => sum + (b.score || 0), 0);
  const enhancedMax = enhancedItems.reduce((sum, b) => sum + (b.max || 0), 0);

  /* ── 四张指标卡 ── */
  const metrics = {
    maximum: {
      status: forceBandLabel(ratio),
      gaugePosition: gaugePosition(ratio),
      gaugeBands: GAUGE_BANDS,
      gaugeActiveBand: gaugeBand(ratio),
      // AWGS 2019 是「下切点」而不是区间，所以给 threshold 而不是编造 min~max
      reference: {
        male: { threshold: round(AWGS_THRESHOLD_KG.男 * G, 1) },
        female: { threshold: round(AWGS_THRESHOLD_KG.女 * G, 1) },
        source: 'AWGS 2019',
        // 性别已知时只显示适用的那条线，另一条对 toC 用户是噪音
        applicableGender: gender || null,
      },
    },
    average: {
      value: overallMean,
      // 状态徽章要给出判断，不能重复标题。用握持均值相对同一切点的比值分档，
      // 与最大握力同一套档位口径，便于用户横向对照两张卡。
      status: overallMean === null
        ? '数据不足'
        : forceBandLabel(overallMean / G / thKg),
      series: meanForces.concat([overallMean]),
      seriesLabels: ['左手', '右手', '平均'],
      reference: {
        male: { threshold: round(AWGS_THRESHOLD_KG.男 * G, 1) },
        female: { threshold: round(AWGS_THRESHOLD_KG.女 * G, 1) },
        source: 'AWGS 2019',
        applicableGender: gender || null,
      },
    },
    difference: {
      status: differenceBandLabel(diffPct),
      ringProgress: diffPct === null ? null : round(clamp(diffPct, 0, 100), 1),
      reference: { excellentMax: 10, normalMax: 20, mildMax: 30 },
    },
    endurance: {
      percent: profile?.retentionPercent ?? null,
      status: retentionBandLabel(profile?.retentionPercent ?? null),
      series: profile?.series ?? [],
      seriesLabels: profile?.seriesLabels ?? [],
      holdSeconds: profile?.holdSeconds ?? null,
      holdTooShort: profile?.holdTooShort ?? false,
      // 握持保持率没有公认的行业区间，不编造 reference，
      // 由 mapper 显示「按本次握持时长计算」而不是假的参考范围
      reference: null,
    },
  };

  /* ── 综合评价（三张小卡）── */
  const gradeLabel = `${forceBandLabel(ratio)}（${scored.score}/${MODULE_MAX_SCORE} 分）`;
  const evaluation = {
    overall: {
      body: kgTextToNewton(scored.summary || ''),
    },
    grade: { label: gradeLabel },
    // peer 的文案交给 mapper：只有 peerComparison 有效时才显示，
    // 这里不预写，避免没有同龄数据时出现空话
  };

  /* ── 评分明细（toB 有、toC 原来没有的）── */
  // desc/help 里都写着「男 28kg、女 18kg」这类 toB 口径，统一换算成 N
  const breakdown = (scored.breakdown || []).map((item) => ({
    label: item.label,
    group: item.group,
    score: item.score,
    max: item.max,
    desc: kgTextToNewton(item.desc),
    help: kgTextToNewton(item.help),
  }));

  return {
    ...reportData,
    score: scorePercent,
    status: forceBandLabel(ratio),
    summary: {
      title: `握力综合评分 ${scored.score} / ${MODULE_MAX_SCORE} 分`,
      lead: kgTextToNewton(scored.summary || ''),
    },
    // maxN 用实测原值，不能拿 m.maxKg（已四舍五入到 0.1kg）再 ×9.8 回推 ——
    // 否则要点里写「257.7 N」而指标卡写「258.18 N」，同一页两个数字对不上
    findings: buildFindings({ scored, maxN, thN, diffPct, profile }),
    metrics,
    evaluation: { ...(isObject(reportData.evaluation) ? reportData.evaluation : {}), ...evaluation },
    details: {
      ...(isObject(reportData.details) ? reportData.details : {}),
      cv: profile && profile.cv !== null ? {
        value: profile.cv,
        status: cvBandLabel(profile.cv),
        description: `握住的 ${profile.holdSeconds} 秒里力值上下浮动 ${profile.cv}%，`
          + `${cvBandLabel(profile.cv)}。这是统计离散度，不是临床分级。`,
      } : null,
      trend: Array.isArray(trend) ? trend : (reportData.details?.trend ?? null),
      // 二级指标：主卡之外仍有解读价值的几项，左右手各给一个值，
      // 两侧都取不到的整条过滤掉
      secondaryMetrics: buildSecondaryMetrics(leftHand, rightHand, leftProfile, rightProfile),
      // 力-时间曲线（左右手同轴）。不含欧拉角/角速度 —— 那两条在前端
      // 算法链路里是伪造数据，见 buildForceCurve 的说明
      forceCurve: buildForceCurve(leftHand, rightHand),
      breakdown,
      scoreSummary: {
        total: scored.score,
        max: MODULE_MAX_SCORE,
        core: coreItem?.score ?? null,
        coreMax: coreItem?.max ?? null,
        enhanced: enhancedTotal,
        enhancedMax,
        thresholdN: thN,
        thresholdKg: thKg,
        ratio: round(ratio, 2),
        note: kgTextToNewton(scored.note || ''),
      },
      redFlags: (scored.redFlags || []).map(kgTextToNewton),
    },
  };
}

/**
 * 首屏三条要点。图标只能取 mapFindings 白名单里的四个：
 * thumbs-up / scale / heart / book-open。
 */
function buildFindings({ scored, maxN, thN, diffPct, profile }) {
  const findings = [];

  findings.push({
    icon: 'thumbs-up',
    title: `最大握力 ${round(maxN, 2)} N`,
    detail: maxN >= thN
      ? `达到了参考线 ${thN} N，力量储备是够的。`
      : `还没到参考线 ${thN} N，差 ${round(thN - maxN, 1)} N。`,
  });

  if (diffPct !== null) {
    findings.push({
      icon: 'scale',
      title: `两只手差 ${diffPct}%`,
      detail: diffPct <= 10
        ? '两边力量很接近，说明用力习惯是均衡的。'
        : diffPct <= 20
          ? '两边有一点差距，属于常见范围。'
          : '两边差得比较多，平时可以多练弱的那只手。',
    });
  }

  if (profile?.retentionPercent !== null && profile?.retentionPercent !== undefined) {
    findings.push({
      icon: 'heart',
      title: `握住 ${profile.holdSeconds} 秒后还剩 ${profile.retentionPercent}%`,
      detail: profile.retentionPercent >= 90
        ? '力气能稳稳保持住，耐力不错。'
        : profile.retentionPercent >= 80
          ? '握到后面稍微松了一点，正常。'
          : '握到后面掉得比较快，耐力可以再练。',
    });
  } else if (scored?.redFlags?.length) {
    findings.push({
      icon: 'book-open',
      title: '需要留意',
      detail: scored.redFlags[0],
    });
  }

  return findings.slice(0, 3);
}

/**
 * 导出给 AI 文案用的事实摘要。
 *
 * 字段名与 back-end/.../prompts/grip_toc_prompt.py 的 build_grip_toc_user_prompt
 * 逐一对应 —— 改这里要同步改那边，否则 prompt 里会出现空行被跳过。
 *
 * 只导出已经算好的实测值，不含任何推断结论，措辞由 LLM 负责。
 * 注意：这里刻意不导出 kg —— 交付包 mapper 有一道「aiSummary 含 kg 就整段丢弃」
 * 的校验，源头不给 kg 最省事。
 */
export function buildGripAiFacts(enrichedReportData, patientInfo) {
  const data = enrichedReportData;
  if (!isObject(data)) return null;

  const summary = data.details?.scoreSummary ?? null;
  const cv = data.details?.cv ?? null;
  const endurance = data.metrics?.endurance ?? null;

  if (data.status === '数据异常') {
    return {
      is_valid: false,
      invalid_reason: data.summary?.lead || '采集数据不足以反映真实握力',
    };
  }

  const leftN = toNumber(data.left?.totalForce, null);
  const rightN = toNumber(data.right?.totalForce, null);
  const maxN = Math.max(...[leftN, rightN].filter((v) => Number.isFinite(v)), 0) || null;
  const thN = summary?.thresholdN ?? null;

  return {
    is_valid: true,
    max_force_n: maxN,
    threshold_n: thN,
    reached_threshold: maxN !== null && thN !== null ? maxN >= thN : null,
    mean_force_n: data.metrics?.average?.value ?? null,
    diff_percent: leftN !== null && rightN !== null && maxN
      ? round((Math.abs(leftN - rightN) / maxN) * 100, 1)
      : null,
    stronger_hand: leftN !== null && rightN !== null
      ? (rightN >= leftN ? '右手' : '左手')
      : null,
    retention_percent: endurance?.percent ?? null,
    hold_seconds: endurance?.holdSeconds ?? null,
    cv_percent: cv?.value ?? null,
    score: summary?.total ?? null,
    score_max: summary?.max ?? MODULE_MAX_SCORE,
    grade: data.status ?? null,
    red_flags: data.details?.redFlags ?? [],
    gender: patientInfo?.gender ?? null,
  };
}

/**
 * 从历史记录里挑出握力趋势点。
 *
 * mapTrend 的校验很严：必须正好 6 个点、日期严格递增、force 非负，
 * 任一条不满足就整段丢弃（趋势图隐藏）。所以这里只在真的有 ≥6 条
 * 历史握力记录时才返回，凑不满就返回 null，不补假点。
 *
 * @param {Array} history getHistory() 的结果，按时间倒序或正序都可
 * @returns {Array|null} [{date:'YYYY-MM-DD', force:Number}] × 6
 */
export function buildGripTrend(history) {
  if (!Array.isArray(history)) return null;

  const points = history
    .map((record) => {
      const data = record?.assessments?.grip?.report?.reportData
        ?? record?.assessments?.grip?.reportData;
      if (!isObject(data)) return null;
      const left = toNumber(data.left?.totalForce, null);
      const right = toNumber(data.right?.totalForce, null);
      const force = Math.max(...[left, right].filter((v) => Number.isFinite(v)), 0);
      if (!(force > 0)) return null;

      const raw = record.updatedAt || record.date || record.dateStr;
      const parsed = raw ? new Date(raw) : null;
      if (!parsed || Number.isNaN(parsed.getTime())) return null;

      return {
        date: `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`,
        force: round(force, 1),
        sortKey: parsed.getTime(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortKey - b.sortKey);

  // 同一天多条只留最后一条，否则日期不严格递增会被 mapTrend 整段丢弃
  const byDate = new Map();
  for (const point of points) byDate.set(point.date, point);
  const unique = [...byDate.values()];

  if (unique.length < 6) return null;
  return unique.slice(-6).map(({ date, force }) => ({ date, force }));
}
