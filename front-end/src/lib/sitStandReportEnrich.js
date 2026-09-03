/**
 * 起坐报告数据增强层 —— 把实测数据补成 0810 交付包页面需要的形状。
 *
 * 与 gripReportEnrich.js 同一套思路（见那边的详细说明）：交付包的
 * mapSitStandReport 假设「后端会算好一切」，要读
 *   data.score / data.status / data.summary / data.findings
 *   data.metrics.{speed,balance,stability,completion}
 *   data.evaluation.health / data.advice[4] / data.details.{cv,processTrend,...}
 * 而本系统实际存进 IndexedDB 的只有算法原始产出：
 *   { duration_stats:{total_duration,num_cycles,avg_duration,cycle_durations},
 *     pressure_stats:{foot_max,foot_avg,sit_max,sit_avg,force_curve_smoothness},
 *     symmetry:{left_right_ratio}, cycle_peak_forces:[] }
 * 缺的字段全部走 mapper 兜底，页面上就是一片「数据不足」。
 *
 * 红线同握力：分档阈值只用 assessmentScoring.js 里已有的 V3 常量，
 * 不自己编造参考区间；算不出来的如实留空，由页面隐藏。
 *
 * 起坐口径是**3 次**起坐总时长（不是 5 次）。V3 的档位由 5 次口径
 * 按 3/5 比例换算而来，见 assessmentScoring.sitstandCoreScore 的注释。
 */
import { scoreSitStand, extractSitStandMetrics, toNumber } from './assessmentScoring';

const MODULE_MAX_SCORE = 25;

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

/* ════════════════════════════════════════════════
   分档
   ════════════════════════════════════════════════ */

/**
 * 起身速度档位。切点直接取自 sitstandCoreScore 的 3 次口径分档
 * （≤6s / ≤7.2s / ≤9s / ≤12s），保证与评分同一把尺子。
 */
function speedBand(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '数据不足';
  if (totalSeconds <= 6) return '很好';
  if (totalSeconds <= 7.2) return '不错';
  if (totalSeconds <= 9) return '一般';
  if (totalSeconds <= 12) return '偏慢';
  return '慢';
}

/**
 * 仪表盘指针位置：把档位边界对齐到刻度上（越快越靠右）。
 * 6s 以内满格，12s 以上见底。
 */
function speedGaugePosition(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;
  const stops = [[6, 100], [7.2, 75], [9, 50], [12, 25], [16, 0]];
  if (totalSeconds <= stops[0][0]) return 100;
  if (totalSeconds >= stops[stops.length - 1][0]) return 0;
  for (let i = 1; i < stops.length; i += 1) {
    const [x1, y1] = stops[i - 1];
    const [x2, y2] = stops[i];
    if (totalSeconds <= x2) {
      return round(y1 + ((totalSeconds - x1) / (x2 - x1)) * (y2 - y1), 1);
    }
  }
  return null;
}

/** 左右负重对称档位。切点取自 sitstandSymmetryScore（85 / 70）。 */
function balanceBand(ratio) {
  if (!Number.isFinite(ratio)) return '数据不足';
  if (ratio >= 85) return '均衡';
  if (ratio >= 70) return '略偏一侧';
  return '明显偏一侧';
}

/** 起身平稳档位。切点取自 sitstandForceCurveScore（1.15 / 1.40）。 */
function smoothnessBand(smoothness) {
  if (!Number.isFinite(smoothness)) return '数据不足';
  if (smoothness <= 1.15) return '一气呵成';
  if (smoothness <= 1.40) return '略有停顿';
  return '起身费劲';
}

/* ════════════════════════════════════════════════
   派生量
   ════════════════════════════════════════════════ */

/**
 * 把 symmetry.left_right_ratio 换算成左右各占百分之几。
 *
 * 算法给的 ratio 语义是「弱侧/强侧 × 100」（≥85 判均衡，见
 * sitstandSymmetryScore），不是「左占比」。所以只能得出两侧的
 * 相对大小，得不出哪边是左。
 *
 * mapper 要求 leftPercent + rightPercent 必须严格等于 100，
 * 否则整块判无效。这里按 ratio 反推两侧占比：
 *   弱 : 强 = ratio : 100  →  弱占比 = ratio/(100+ratio)
 * 至于哪边强，优先看算法有没有直接给 stronger_side / left_ratio，
 * 给不出就返回 null —— 不猜，宁可这块显示「数据不足」。
 */
function balancePercents(symmetry) {
  if (!isObject(symmetry)) return { leftPercent: null, rightPercent: null };

  // 算法若直接给了左右占比就用它（不同版本字段名不一）
  const directLeft = toNumber(symmetry.left_percent ?? symmetry.leftPercent, null);
  const directRight = toNumber(symmetry.right_percent ?? symmetry.rightPercent, null);
  if (directLeft !== null && directRight !== null) {
    const sum = directLeft + directRight;
    if (sum > 0) {
      const left = round((directLeft / sum) * 100, 1);
      return { leftPercent: left, rightPercent: round(100 - left, 1) };
    }
  }

  const ratio = toNumber(symmetry.left_right_ratio, null);
  const stronger = symmetry.stronger_side ?? symmetry.strongerSide ?? null;
  if (ratio === null || ratio <= 0 || ratio > 100 || !stronger) {
    return { leftPercent: null, rightPercent: null };
  }

  const weakShare = round((ratio / (100 + ratio)) * 100, 1);
  const strongShare = round(100 - weakShare, 1);
  const leftIsStronger = String(stronger).includes('左') || String(stronger).toLowerCase() === 'left';
  return leftIsStronger
    ? { leftPercent: strongShare, rightPercent: weakShare }
    : { leftPercent: weakShare, rightPercent: strongShare };
}

/**
 * 每次起坐耗时的稳定性评分（0-100）。
 *
 * 用周期时长的变异系数换算：CV 0% → 100 分，CV 30% → 0 分，线性。
 * 分档切点与 sitstandCycleStabilityScore 一致（0.10 / 0.25）。
 */
function stabilityFromCycles(cycleDurations) {
  if (!Array.isArray(cycleDurations) || cycleDurations.length < 2) return null;
  const values = cycleDurations.filter((v) => Number.isFinite(v) && v > 0);
  if (values.length < 2) return null;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (!(mean > 0)) return null;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const cv = Math.sqrt(variance) / mean;

  return { score: round(clamp((1 - cv / 0.30) * 100, 0, 100), 0), cv: round(cv * 100, 1) };
}

function stabilityBand(cv) {
  if (!Number.isFinite(cv)) return '数据不足';
  if (cv <= 10) return '每次都差不多';
  if (cv <= 25) return '快慢有点波动';
  return '一次比一次慢';
}

/* ════════════════════════════════════════════════
   主入口
   ════════════════════════════════════════════════ */

/**
 * @param {object} reportData 起坐算法产出的 reportData
 * @param {object} [options]
 * @param {object} [options.patientInfo] { gender, age, weight }（起坐评分不依赖性别，仅透传）
 */
export function enrichSitStandReportData(reportData, { patientInfo } = {}) {
  if (!isObject(reportData)) return reportData;
  // 已是增强过/后端下发的完整形状，不重复处理
  if (isObject(reportData.metrics) && isObject(reportData.metrics.speed)) return reportData;

  const ds = isObject(reportData.duration_stats) ? reportData.duration_stats : null;
  if (!ds) return reportData;

  const m = extractSitStandMetrics(reportData);
  const scored = scoreSitStand(reportData);

  // 数据无效：不编造任何分档，交给 mapper 的「数据不足」兜底
  if (scored?.invalid) {
    return {
      ...reportData,
      score: 0,
      status: '数据异常',
      summary: {
        title: '本次起坐数据无法评估',
        lead: scored.summary || '采集数据不足以反映真实起坐能力，建议检查设备后重测。',
      },
      evaluation: {
        health: {
          preface: '关于这次测试',
          result: '这次没有测准，建议重做一次',
          details: (scored.redFlags || []).slice(0, 3),
        },
      },
      details: { redFlags: scored.redFlags || [] },
    };
  }

  const totalDuration = m.totalDuration;
  // 算法给的 avg_duration 是 total/n 的浮点结果，直接显示会出现
  // 「2.8000000000000003 秒」。mapper 原样取值，所以在源头规整到 2 位。
  const avgDuration = m.avgDuration === null ? null : round(m.avgDuration, 2);
  const cycles = m.cycleDurations;

  const scorePercent = Number.isFinite(scored?.score)
    ? Math.round((scored.score / MODULE_MAX_SCORE) * 100)
    : null;

  const coreItem = scored?.breakdown?.find((b) => b.group === 'core');
  const enhancedItems = scored?.breakdown?.filter((b) => b.group === 'enhanced') ?? [];
  const enhancedTotal = enhancedItems.reduce((s, b) => s + (b.score || 0), 0);
  const enhancedMax = enhancedItems.reduce((s, b) => s + (b.max || 0), 0);

  const { leftPercent, rightPercent } = balancePercents(reportData.symmetry);
  const stability = stabilityFromCycles(cycles);
  const smoothness = m.forceCurveSmoothness;

  /* ── 四张指标卡 ── */
  const metrics = {
    speed: {
      status: speedBand(totalDuration),
      gaugePosition: speedGaugePosition(totalDuration),
      // 参考区间用 V3 的「好」档上限：3 次总时长 ≤6s 为佳，
      // 折算到单次平均是 2s；关注线 7.2s 折算 2.4s
      reference: { min: 1.5, max: 2.4, precision: 1 },
    },
    balance: {
      status: balanceBand(m.leftRightRatio),
      summary: leftPercent === null
        ? '数据不足'
        : `左脚 ${leftPercent}%，右脚 ${rightPercent}%`,
      leftPercent,
      rightPercent,
      referenceDifferenceMax: 15,
    },
    stability: {
      score: stability?.score ?? null,
      status: stabilityBand(stability?.cv ?? null),
      summary: stability === null
        ? '数据不足'
        : `每次起坐耗时上下差 ${stability.cv}%`,
      reference: { min: 75, max: 100, precision: 0 },
      // 趋势要正好 6 点，本系统只有 3 次周期，凑不满就不给（mapper 会丢弃）
      trend: [],
    },
    completion: {
      // 完成度 = 实际完成次数 / 要求的 3 次
      percent: m.numCycles > 0 ? round(clamp((m.numCycles / 3) * 100, 0, 100), 0) : null,
      status: m.numCycles >= 3 ? '全部完成' : m.numCycles > 0 ? '未做满 3 次' : '数据不足',
      summary: m.numCycles > 0 ? `完成了 ${m.numCycles} 次完整起坐` : '数据不足',
      // rangeOrNull 要求 min < max，不能写 {100,100}（会被判无效显示「数据不足」）。
      // 用「完成 3 次即 100%」的区间表达：低于 100% 就是没做满。
      reference: { min: 99, max: 100, precision: 0 },
      bars: [],
    },
  };

  /* ── 健康评估区 ── */
  const evaluation = {
    health: {
      preface: '从这次起身的速度来看',
      result: `${speedBand(totalDuration)}，3 次起坐共用了 ${round(totalDuration, 1)} 秒`,
      details: buildHealthDetails({ totalDuration, avgDuration, cycles, stability, smoothness, scored }),
    },
  };

  const breakdown = (scored.breakdown || []).map((item) => ({
    label: item.label,
    group: item.group,
    score: item.score,
    max: item.max,
    desc: item.desc,
    help: item.help,
  }));

  const redFlags = buildRedFlags({ totalDuration, m, stability, smoothness, scoredFlags: scored.redFlags || [] });

  return {
    ...reportData,
    /*
     * 覆写 duration_stats.avg_duration。
     *
     * mapper 的 averageDuration 直接读 data.duration_stats.avg_duration 原值，
     * 不看这一层算的变量。算法给的是 total/n 的浮点结果，页面上会显示成
     * 「2.8000000000000003 秒」。所以必须把源字段本身规整掉。
     * 其余字段原样保留，不动任何实测值。
     */
    duration_stats: avgDuration === null ? ds : { ...ds, avg_duration: avgDuration },
    score: scorePercent,
    status: speedBand(totalDuration),
    summary: {
      title: `起坐综合评分 ${scored.score} / ${MODULE_MAX_SCORE} 分`,
      lead: scored.summary || '',
    },
    findings: buildFindings({ totalDuration, avgDuration, stability, smoothness, m }),
    metrics,
    evaluation: { ...(isObject(reportData.evaluation) ? reportData.evaluation : {}), ...evaluation },
    details: {
      ...(isObject(reportData.details) ? reportData.details : {}),
      // 三次各用了多久 —— mapper 要求正好 3 个正数
      speedTrials: cycles.length === 3 ? cycles.map((v) => round(v, 2)) : [],
      /* 不填 details.cv：起坐 mapper 的 cv 指的是「左右脚各自的发力变异系数」
         （要求 leftPercent / rightPercent / averagePercent 三值齐全且均值严格等于
         两者平均），而本系统算得出来的是「三次周期耗时的变异系数」，语义不同。
         硬塞进去会让读者把它当成左右脚数据。周期波动已经通过
         metrics.stability 和健康评估的第二条讲清楚了。 */
      cycleStability: stability ? {
        cvPercent: stability.cv,
        score: stability.score,
        status: stabilityBand(stability.cv),
      } : null,
      breakdown,
      scoreSummary: {
        total: scored.score,
        max: MODULE_MAX_SCORE,
        core: coreItem?.score ?? null,
        coreMax: coreItem?.max ?? null,
        enhanced: enhancedTotal,
        enhancedMax,
        totalDuration: round(totalDuration, 1),
        note: scored.note || '',
      },
      redFlags,
    },
  };
}

/** 健康评估的 3 条说明。mapper 要求 1~3 条且每条非空。 */
function buildHealthDetails({ totalDuration, avgDuration, cycles, stability, smoothness, scored }) {
  const details = [];

  const parts = [`3 次起坐总共用了 ${round(totalDuration, 1)} 秒`];
  if (avgDuration !== null) parts.push(`平均每次 ${round(avgDuration, 1)} 秒`);
  if (cycles.length === 3) {
    parts.push(`三次分别是 ${cycles.map((c) => round(c, 1)).join('、')} 秒`);
  }
  details.push(`${parts.join('，')}。`);

  if (stability) {
    details.push(
      stability.cv <= 10
        ? `三次快慢差 ${stability.cv}%，节奏很稳，说明腿上的劲能持续输出。`
        : stability.cv <= 25
          ? `三次快慢差 ${stability.cv}%，有一点波动，属于常见范围。`
          : `三次快慢差 ${stability.cv}%，一次比一次慢，说明连续起身比较吃力。`,
    );
  }

  if (Number.isFinite(smoothness)) {
    details.push(
      smoothness <= 1.15
        ? '起身过程一气呵成，没有反复晃身攒劲的情况。'
        : smoothness <= 1.40
          ? '起身时有轻微停顿，建议起来前先把脚往回收一点会更省劲。'
          : '起身时需要晃身攒劲或撑两次才起得来，建议先练腿部力量，起身时扶稳。',
    );
  } else if (scored?.summary) {
    details.push(scored.summary);
  }

  return details.slice(0, 3);
}

/** 首屏要点。图标白名单见 mapSitStandReport 的 mapFindings。 */
function buildFindings({ totalDuration, avgDuration, stability, smoothness, m }) {
  const findings = [];

  findings.push({
    icon: 'timer',
    title: `3 次共 ${round(totalDuration, 1)} 秒`,
    detail: totalDuration <= 7.2
      ? '起身速度在同龄人里是不错的。'
      : `比 7.2 秒的关注线慢了 ${round(totalDuration - 7.2, 1)} 秒。`,
  });

  if (avgDuration !== null) {
    findings.push({
      icon: 'activity',
      title: `平均每次 ${round(avgDuration, 1)} 秒`,
      detail: '从坐下到完全站直算一次。',
    });
  }

  if (stability) {
    findings.push({
      icon: 'gauge',
      title: `三次快慢差 ${stability.cv}%`,
      detail: stability.cv <= 10 ? '节奏很稳。' : stability.cv <= 25 ? '有一点波动。' : '越做越慢，连续起身吃力。',
    });
  }

  return findings.slice(0, 3);
}

/**
 * 「需要留意」。与握力同一原则：不用 toB 的第三人称措辞，
 * 按同一批实测值重新生成第二人称文案。
 * 判定阈值与 scoreSitStand 保持一致。
 */
function buildRedFlags({ totalDuration, m, stability, smoothness, scoredFlags }) {
  const flags = [];

  if (Number.isFinite(totalDuration) && totalDuration > 9) {
    flags.push(`您 3 次起坐用了 ${round(totalDuration, 1)} 秒，超过 9 秒的关注线`);
  }
  if (m.numCycles > 0 && m.numCycles < 3) {
    flags.push(`这次只完成了 ${m.numCycles} 次完整起坐，不足 3 次`);
  }
  if (Number.isFinite(m.leftRightRatio) && m.leftRightRatio < 70) {
    flags.push('您起身时明显偏向一侧用力，另一条腿分担得较少');
  }
  if (stability && stability.cv > 30) {
    flags.push(`三次起坐的快慢相差 ${stability.cv}%，一次比一次慢`);
  }
  if (Number.isFinite(smoothness) && smoothness > 1.40) {
    flags.push('起身时需要晃身攒劲或撑两次才起得来');
  }

  const covered = /起坐|起身|完整起坐/;
  for (const raw of scoredFlags) {
    if (typeof raw === 'string' && raw.trim() && !covered.test(raw)) flags.push(raw.trim());
  }

  return flags;
}

/**
 * 导出给 AI 文案用的事实摘要。
 * 字段名与 prompts/sitstand_toc_prompt.py 的 build_sitstand_toc_user_prompt 逐一对应。
 */
export function buildSitStandAiFacts(enriched) {
  if (!isObject(enriched)) return null;

  if (enriched.status === '数据异常') {
    return {
      is_valid: false,
      invalid_reason: enriched.summary?.lead || '采集数据不足以反映真实起坐能力',
    };
  }

  const ds = isObject(enriched.duration_stats) ? enriched.duration_stats : {};
  const summary = enriched.details?.scoreSummary ?? null;

  return {
    is_valid: true,
    total_seconds: toNumber(ds.total_duration, null),
    average_seconds: toNumber(ds.avg_duration, null),
    cycle_seconds: Array.isArray(ds.cycle_durations)
      ? ds.cycle_durations.map((v) => toNumber(v, null)).filter((v) => v !== null)
      : [],
    grade: enriched.status ?? null,
    score: summary?.total ?? null,
    score_max: summary?.max ?? MODULE_MAX_SCORE,
    left_right_ratio: toNumber(enriched.symmetry?.left_right_ratio, null),
    smoothness: toNumber(enriched.pressure_stats?.force_curve_smoothness, null),
    cycle_cv_percent: enriched.details?.cycleStability?.cvPercent ?? null,
    red_flags: enriched.details?.redFlags ?? [],
  };
}
