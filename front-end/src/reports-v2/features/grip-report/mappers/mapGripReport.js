import { finiteOrNull, parseCalendarDate } from '../../health-overview/utils/validators';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function roundTo(value, precision) {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  }
  return value;
}

function copyFingers(value) {
  return Array.isArray(value) ? value.map(cloneValue) : [];
}

const FINGER_REGION_DEFINITIONS = [
  { key: 'thumb', label: '大拇指', names: ['大拇指', '拇指'] },
  { key: 'index_finger', label: '食指', names: ['食指'] },
  { key: 'middle_finger', label: '中指', names: ['中指'] },
  { key: 'ring_finger', label: '无名指', names: ['无名指'] },
  { key: 'little_finger', label: '小拇指', names: ['小拇指', '小指'] },
  { key: 'palm', label: '手掌', names: ['手掌', '掌部'] },
];

function findFingerForce(fingers, definition) {
  if (!Array.isArray(fingers)) return null;

  const finger = fingers.find((item) => (
    isObject(item)
    && (
      textOr(item.key, '') === definition.key
      || definition.names.includes(textOr(item.name, ''))
    )
  ));

  return finger ? nonNegativeOrNull(finger.force) : null;
}

function mapFingerRegions(leftFingers, rightFingers) {
  return FINGER_REGION_DEFINITIONS.map((definition) => ({
    key: definition.key,
    label: definition.label,
    leftForce: findFingerForce(leftFingers, definition),
    rightForce: findFingerForce(rightFingers, definition),
    unit: 'N',
  }));
}

const FINDING_ICONS = new Set(['thumbs-up', 'scale', 'heart', 'book-open']);

function mapFindings(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((finding) => {
      if (!isObject(finding)) return null;
      const title = textOr(finding.title, '');
      const detail = textOr(finding.detail, '');
      const icon = textOr(finding.icon, '');
      return title && FINDING_ICONS.has(icon) ? { title, detail, icon } : null;
    })
    .filter(Boolean)
    .slice(0, 3);
}

function mapPeerComparison(value) {
  const peer = isObject(value) ? value : {};
  const peerPercentile = percentOrNull(peer.percentile);
  const peerSampleSize = positiveOrNull(peer.sampleSize);
  const peerAverageForce = positiveOrNull(peer.averageForce);
  const peerRankPercent = percentOrNull(peer.rankPercent);
  const hasPeerComparison = peerPercentile !== null;

  return hasPeerComparison
    ? {
      hasPeerComparison: true,
      peerPercentile,
      peerSampleSize,
      peerAverageForce,
      peerRankPercent,
      peerSummary: `超过了 ${peerPercentile}% 的同龄人`,
    }
    : {
      hasPeerComparison: false,
      peerPercentile: null,
      peerSampleSize: null,
      peerAverageForce: null,
      peerRankPercent: null,
      peerSummary: '暂无可靠同龄对比数据',
    };
}

const EVALUATION_META = [
  { id: 'overall', title: '综合状态', icon: 'health-and-safety', tone: 'green' },
  { id: 'peer', title: '同龄人对比', icon: 'users', tone: 'blue' },
  { id: 'grade', title: '年龄组评级', icon: 'award', tone: 'orange' },
];

const EVALUATION_FALLBACKS = {
  overall: '已记录本次握力检测数据，具体健康含义请咨询专业人员。',
  peer: '暂无可靠同龄对比数据。',
  grade: '暂无可靠年龄组评级',
};

function mapEvaluation(value, hasPeerComparison) {
  const source = isObject(value) ? value : {};
  const overall = isObject(source.overall) ? source.overall : {};
  const peer = isObject(source.peer) ? source.peer : {};
  const grade = isObject(source.grade) ? source.grade : {};

  return EVALUATION_META.map((meta) => {
    if (meta.id === 'overall') {
      return { ...meta, body: textOr(overall.body, EVALUATION_FALLBACKS.overall), label: '' };
    }
    if (meta.id === 'peer') {
      return {
        ...meta,
        body: hasPeerComparison
          ? textOr(peer.body, EVALUATION_FALLBACKS.peer)
          : EVALUATION_FALLBACKS.peer,
        label: '',
      };
    }
    return { ...meta, body: '', label: textOr(grade.label, EVALUATION_FALLBACKS.grade) };
  });
}

const HEALTH_SUMMARY_FALLBACK = {
  title: '握力检测结果已记录',
  body: '本次握力检测数据已完成记录，具体健康含义请结合专业人员意见进行评估。',
  focusTitle: '关注方向',
  focusBody: '建议持续关注握力变化，并根据专业人员建议安排后续复测和训练。',
};

function healthSummaryText(value) {
  return typeof value === 'string'
    ? value.replace(/\p{Cf}/gu, '').trim()
    : '';
}

function mapAiHealthSummary(value) {
  if (!isObject(value)) return { ...HEALTH_SUMMARY_FALLBACK };

  const summary = Object.fromEntries(
    Object.keys(HEALTH_SUMMARY_FALLBACK).map((key) => [key, healthSummaryText(value[key])]),
  );
  const copy = Object.values(summary);
  return copy.every(Boolean) && copy.every((text) => !/kg/i.test(text.normalize('NFKC')))
    ? summary
    : { ...HEALTH_SUMMARY_FALLBACK };
}

const ADVICE_META = [
  { id: 'strength', title: '力量训练', icon: 'dumbbell', tone: 'green' },
  { id: 'nutrition', title: '营养补充', icon: 'utensils', tone: 'orange' },
  { id: 'recovery', title: '休息与恢复', icon: 'bed', tone: 'purple' },
];

const ADVICE_FALLBACKS = [
  ['根据专业人员建议安排适合自己的力量训练。', '训练时注意动作规范并循序渐进。'],
  ['保持均衡饮食并关注优质蛋白质摄入。', '如需补充营养素，请先咨询专业人员。'],
  ['训练后安排充分休息与放松。', '如有持续不适，应停止训练并咨询专业人员。'],
];

function fallbackAdvice() {
  return ADVICE_META.map((meta, index) => ({ ...meta, items: [...ADVICE_FALLBACKS[index]] }));
}

function mapAdvice(value) {
  if (!Array.isArray(value) || value.length !== ADVICE_META.length) return fallbackAdvice();

  const groups = ADVICE_META.map((meta, index) => {
    const source = value[index];
    if (!isObject(source) || source.id !== meta.id || !Array.isArray(source.items) || source.items.length !== 2) {
      return null;
    }
    const items = source.items.map((item) => textOr(item, ''));
    return items.every(Boolean) ? { ...meta, items: [...items] } : null;
  });
  return groups.every(Boolean) ? groups : fallbackAdvice();
}

const FOOTER_FALLBACKS = {
  tip: '握力可作为肌肉力量的参考指标，建议结合专业意见安排复测。',
  disclaimer: '免责声明：本报告仅供参考，不能替代专业医疗诊断。如有不适，请及时就医。',
  copyright: '© 矩侨工业 保留所有权利。',
};

function mapFooter(value) {
  const source = isObject(value) ? value : {};
  return Object.fromEntries(
    Object.entries(FOOTER_FALLBACKS).map(([key, fallback]) => [key, textOr(source[key], fallback)]),
  );
}

function positiveArray(value, expectedLength) {
  if (!Array.isArray(value) || value.length !== expectedLength) return [];

  const values = value.map(positiveOrNull);
  return values.every((item) => item !== null) ? values : [];
}

function percentArray(value, expectedLength) {
  if (!Array.isArray(value) || value.length !== expectedLength) return [];

  const values = value.map(percentOrNull);
  return values.every((item) => item !== null) ? values : [];
}

function nonNegativeArray(value, expectedLength) {
  if (!Array.isArray(value) || value.length !== expectedLength) return [];

  const values = value.map(nonNegativeOrNull);
  return values.every((item) => item !== null) ? values : [];
}

function mapTrials(value) {
  const trials = isObject(value) ? value : {};
  const left = positiveArray(trials.left, 3);
  const right = positiveArray(trials.right, 3);
  if (left.length !== 3 || right.length !== 3) {
    return { left: [], right: [], averages: [], average: null };
  }

  const averages = left.map((leftForce, index) => roundTo((leftForce + right[index]) / 2, 2));
  const allForces = [...left, ...right];
  const average = roundTo(
    allForces.reduce((total, force) => total + force, 0) / allForces.length,
    2,
  );
  return { left, right, averages, average };
}

function mapDetailTrials(value) {
  const trials = isObject(value) ? value : {};
  const left = nonNegativeArray(trials.left, 3);
  const right = nonNegativeArray(trials.right, 3);
  if (left.length !== 3 || right.length !== 3) return [];

  return left.map((leftForce, index) => ({
    label: `第 ${index + 1} 次`,
    leftForce,
    rightForce: right[index],
    maximumForce: Math.max(leftForce, right[index]),
    unit: 'N',
  }));
}

function mapCv(value) {
  if (!isObject(value)) return null;

  const cvValue = percentOrNull(value.value);
  const status = textOr(value.status, '');
  const description = textOr(value.description, '');
  return cvValue !== null && status && description
    ? { value: cvValue, status, description }
    : null;
}

function mapTrend(value) {
  if (!Array.isArray(value) || value.length !== 6) return [];

  const trend = value.map((point) => {
    if (!isObject(point)) return null;

    const date = textOr(point.date, '');
    const parsedDate = parseCalendarDate(date);
    const force = nonNegativeOrNull(point.force);
    if (!parsedDate || force === null) return null;

    return {
      date,
      label: `${parsedDate.month}月`,
      force,
      unit: 'N',
      calendarKey: parsedDate.year * 10000 + parsedDate.month * 100 + parsedDate.day,
    };
  });

  const isStrictlyAscending = trend.every((point, index) => (
    point && (index === 0 || point.calendarKey > trend[index - 1].calendarKey)
  ));
  return isStrictlyAscending
    ? trend.map(({ calendarKey: _calendarKey, ...point }) => point)
    : [];
}

function rangeOrNull(value, validator = positiveOrNull) {
  if (!isObject(value)) return null;

  const min = validator(value.min);
  const max = validator(value.max);
  return min !== null && max !== null && min < max ? { min, max } : null;
}

function formatRangeValue(value) {
  return Number.isInteger(value) ? String(value) : String(roundTo(value, 2));
}

/**
 * 力值参考范围。支持两种形态：
 *   1. { male:{min,max}, female:{min,max} } —— 后端下发真实区间时用
 *   2. { male:{threshold}, female:{threshold}, source } —— 本系统实际用的形态。
 *      AWGS 2019 给的是「下切点」（男 28kg / 女 18kg），不是上下限区间，
 *      所以按「≥ 切点」表述，不把切点当 min 再编一个 max 出来。
 */
function forceReferenceLines(value) {
  const reference = isObject(value) ? value : {};

  const maleThreshold = positiveOrNull(reference.male?.threshold);
  const femaleThreshold = positiveOrNull(reference.female?.threshold);
  if (maleThreshold !== null && femaleThreshold !== null) {
    const source = textOr(reference.source, '');
    const sourceLine = source ? `依据 ${source} 握力切点` : '低于参考线提示肌力储备不足';
    // 性别已知时只报适用的那条线，另一条对读报告的人是噪音
    const gender = textOr(reference.applicableGender, '');
    const own = gender === '男' ? maleThreshold : gender === '女' ? femaleThreshold : null;
    if (own !== null) {
      return [`参考线：≥ ${formatRangeValue(own)} N`, sourceLine];
    }
    return [
      `参考线：男性 ≥ ${formatRangeValue(maleThreshold)} N ｜ 女性 ≥ ${formatRangeValue(femaleThreshold)} N`,
      sourceLine,
    ];
  }

  const male = rangeOrNull(reference.male);
  const female = rangeOrNull(reference.female);
  if (!male || !female) return ['参考范围：数据不足'];

  return [
    `参考范围：男性 ${formatRangeValue(male.min)} ~ ${formatRangeValue(male.max)} N`,
    `女性 ${formatRangeValue(female.min)} ~ ${formatRangeValue(female.max)} N`,
  ];
}

function percentReferenceLines(value) {
  const reference = isObject(value) ? value : {};
  const male = rangeOrNull(reference.male, percentOrNull);
  const female = rangeOrNull(reference.female, percentOrNull);
  if (!male || !female) return ['参考范围：数据不足'];

  return [
    `参考范围：男性 ${formatRangeValue(male.min)}% ~ ${formatRangeValue(male.max)}%`,
    `女性 ${formatRangeValue(female.min)}% ~ ${formatRangeValue(female.max)}%`,
  ];
}

/**
 * 握力保持率的说明行。
 *
 * 保持率没有公认的行业参考区间，所以这里不显示「参考范围」，
 * 而是说明这个数是怎么算出来的 —— 避免用户把它当成有标准的临床指标。
 */
function retentionReferenceLines(endurance, holdSeconds) {
  const reference = isObject(endurance?.reference) ? endurance.reference : null;
  if (reference) return percentReferenceLines(reference);

  const seconds = positiveOrNull(holdSeconds);

  // 握持过短：说明为什么这项算不了，而不是留一句干巴巴的「数据不足」
  if (endurance?.holdTooShort) {
    return seconds === null
      ? ['未采集到有效握持时段']
      : [
        `本次只握住了 ${formatRangeValue(seconds)} 秒，不足以看出耐力`,
        '下次用最大力量持续握紧 3-5 秒',
      ];
  }

  if (seconds === null) return ['数据不足'];
  return [
    `按本次握持 ${formatRangeValue(seconds)} 秒计算`,
    '末段均值 ÷ 起始均值，越接近 100% 说明越握得住',
  ];
}

function differenceReferenceLines(value) {
  const reference = isObject(value) ? value : {};
  const excellentMax = percentOrNull(reference.excellentMax);
  const normalMax = percentOrNull(reference.normalMax);
  const mildMax = percentOrNull(reference.mildMax);
  if (
    excellentMax === null
    || normalMax === null
    || mildMax === null
    || excellentMax <= 0
    || excellentMax >= normalMax
    || normalMax >= mildMax
  ) return ['参考范围：数据不足'];

  return [
    `优秀 < ${formatRangeValue(excellentMax)}% | 正常 ${formatRangeValue(excellentMax)}% ~ ${formatRangeValue(normalMax)}%`,
    `轻度 ${formatRangeValue(normalMax)}% ~ ${formatRangeValue(mildMax)}% | 中度 > ${formatRangeValue(mildMax)}%`,
  ];
}

/* ══ toB 侧独有指标的映射（评分明细 / 分数汇总 / 风险提示）══ */

/**
 * V3 评分明细。来自 assessmentScoring.scoreGrip 的 breakdown，
 * 结构是「核心 18 分 + 增强 7 分」的逐项拆解。
 * 任一项缺 label/score/max 就丢弃该项，不显示半条记录。
 */
function mapBreakdown(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!isObject(item)) return null;
      const label = textOr(item.label, '');
      const score = nonNegativeOrNull(item.score);
      const max = positiveOrNull(item.max);
      if (!label || score === null || max === null || score > max) return null;
      return {
        label,
        group: item.group === 'core' ? 'core' : 'enhanced',
        score,
        max,
        percent: roundTo((score / max) * 100, 1),
        desc: textOr(item.desc, ''),
        help: textOr(item.help, ''),
      };
    })
    .filter(Boolean);
}

function mapScoreSummary(value) {
  if (!isObject(value)) return null;

  const total = nonNegativeOrNull(value.total);
  const max = positiveOrNull(value.max);
  if (total === null || max === null || total > max) return null;

  return {
    total,
    max,
    core: nonNegativeOrNull(value.core),
    coreMax: positiveOrNull(value.coreMax),
    enhanced: nonNegativeOrNull(value.enhanced),
    enhancedMax: positiveOrNull(value.enhancedMax),
    thresholdN: positiveOrNull(value.thresholdN),
    ratio: positiveOrNull(value.ratio),
    note: textOr(value.note, ''),
  };
}

/** 风险提示。空数组与非数组一律返回 []，由组件决定是否隐藏整块。 */
function mapRedFlags(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => textOr(item, '')).filter(Boolean).slice(0, 5);
}

/**
 * 力-时间曲线。
 *
 * 点集必须 ≥4 个且 t 单调不减 —— 乱序的点画出来是折返的乱线。
 * 任一侧不合规就丢掉那一侧；两侧都没有则整块不显示。
 */
function mapCurveSide(value) {
  if (!isObject(value) || !Array.isArray(value.points) || value.points.length < 4) return null;

  const points = [];
  let previousT = -Infinity;
  for (const point of value.points) {
    if (!isObject(point)) return null;
    const t = finiteOrNull(point.t);
    const f = nonNegativeOrNull(point.f);
    if (t === null || f === null || t < previousT) return null;
    previousT = t;
    points.push({ t, f });
  }

  const peak = isObject(value.peak) ? value.peak : null;
  const peakT = peak ? finiteOrNull(peak.t) : null;
  const peakF = peak ? nonNegativeOrNull(peak.f) : null;

  return {
    points,
    peak: peakT !== null && peakF !== null ? { t: peakT, f: peakF } : null,
    duration: positiveOrNull(value.duration),
  };
}

function mapForceCurve(value) {
  if (!isObject(value)) return null;

  const left = mapCurveSide(value.left);
  const right = mapCurveSide(value.right);
  if (!left && !right) return null;

  const maxForce = positiveOrNull(value.maxForce);
  const maxDuration = positiveOrNull(value.maxDuration);
  if (maxForce === null || maxDuration === null) return null;

  return { left, right, maxForce, maxDuration, unit: textOr(value.unit, 'N') };
}

const SECONDARY_TONES = new Set(['green', 'blue', 'orange', 'purple']);

/**
 * 二级指标。每项左右手各一个值。
 *
 * 数值项要求是有限数；文本项（如「最有劲的手指」）用 isText 标记走字符串校验。
 * 单侧缺失是允许的（只测了一只手时很常见），组件会把缺的那侧显示成「未测」；
 * 但两侧都拿不到就丢弃该项，不留一张空卡。
 */
function mapSecondaryMetrics(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!isObject(item)) return null;
      const id = textOr(item.id, '');
      const label = textOr(item.label, '');
      if (!id || !label) return null;

      const isText = item.isText === true;
      const readSide = (side) => {
        if (isText) return textOr(side, '') || null;
        return finiteOrNull(side);
      };
      const left = readSide(item.left);
      const right = readSide(item.right);
      if (left === null && right === null) return null;

      return {
        id,
        label,
        left,
        right,
        isText,
        unit: textOr(item.unit, ''),
        note: textOr(item.note, ''),
        tone: SECONDARY_TONES.has(item.tone) ? item.tone : 'green',
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function metricMeta(config, hasValue) {
  if (!hasValue) {
    return {
      status: '数据不足',
      peerPercentile: null,
      summary: '数据不足',
    };
  }

  const peerPercentile = percentOrNull(config.peerPercentile);
  return {
    status: textOr(config.status, '数据不足'),
    peerPercentile,
    summary: peerPercentile === null
      ? '暂无可靠同龄对比数据'
      : `超过了 ${peerPercentile}% 的同龄人`,
  };
}

/** 一组力值柱（左手/右手/平均），任一项无效则整组丢弃，避免半截图表 */
function forceBars(value, expectedLength) {
  if (!Array.isArray(value) || value.length !== expectedLength) return [];
  const values = value.map(nonNegativeOrNull);
  return values.every((item) => item !== null) ? values : [];
}

function textArray(value, expectedLength) {
  if (!Array.isArray(value) || value.length !== expectedLength) return [];
  const items = value.map((item) => textOr(item, ''));
  return items.every(Boolean) ? items : [];
}

function buildMetrics(data, forces) {
  const metrics = isObject(data.metrics) ? data.metrics : {};
  const maximum = isObject(metrics.maximum) ? metrics.maximum : {};
  const average = isObject(metrics.average) ? metrics.average : {};
  const difference = isObject(metrics.difference) ? metrics.difference : {};
  const endurance = isObject(metrics.endurance) ? metrics.endurance : {};
  const trials = mapTrials(data.trials);
  const differenceValue = forces.relativeDifferencePercent === null
    ? null
    : roundTo(forces.relativeDifferencePercent, 2);
  const enduranceValue = percentOrNull(endurance.percent);
  const enduranceSeries = enduranceValue === null
    ? []
    : percentArray(endurance.series, 5);
  const hasEnduranceSeries = enduranceSeries.length === 5;
  // 耐力横轴：交付包原本写死 0s/15s/30s/45s/60s（60 秒协议），
  // 但本系统一次握持只有几秒，套用那套标签是误导 —— 改用增强层按
  // 实际握持时长生成的标签，拿不到就退回原来的固定档位。
  const enduranceLabels = textArray(endurance.seriesLabels, 5);

  /*
   * 平均握力：本系统每只手只握一次，不存在「三次测试」。
   * 增强层给的是平台期均值（握住那几秒的平均力），三根柱子是
   * 左手 / 右手 / 平均。若拿不到增强层数据，则退回交付包原来的
   * 三次测试口径（后端若下发 trials 仍然可用）。
   */
  const averageBars = forceBars(average.series, 3);
  const averageLabels = textArray(average.seriesLabels, 3);
  const useAverageBars = averageBars.length === 3 && averageLabels.length === 3;
  const averageValue = useAverageBars
    ? nonNegativeOrNull(average.value)
    : trials.average;

  return [
    {
      id: 'maximum',
      index: '01',
      title: '最大握力',
      value: forces.maximum,
      unit: 'N',
      ...metricMeta(maximum, forces.maximum !== null),
      chartValue: percentOrNull(maximum.gaugePosition),
      // 仪表盘档位：原来 GripGauge 把「良好」写死高亮，与数据无关。
      // 这两个字段让它跟着 R 值走；拿不到时组件回退到静态渲染。
      chartBands: textArray(maximum.gaugeBands, 4),
      chartActiveBand: textOr(maximum.gaugeActiveBand, ''),
      referenceLines: forceReferenceLines(maximum.reference),
    },
    {
      id: 'average',
      index: '02',
      title: useAverageBars ? '握持均值' : '平均握力',
      value: averageValue,
      unit: 'N',
      ...metricMeta(average, averageValue !== null),
      chartValues: useAverageBars ? [...averageBars] : [...trials.averages],
      chartLabels: useAverageBars ? [...averageLabels] : ['第一次', '第二次', '第三次'],
      referenceLines: forceReferenceLines(average.reference),
    },
    {
      id: 'difference',
      index: '03',
      title: '左右差异',
      value: differenceValue,
      unit: '%',
      ...metricMeta(difference, differenceValue !== null),
      chartValue: percentOrNull(difference.ringProgress),
      leftForce: forces.left,
      rightForce: forces.right,
      forceUnit: 'N',
      referenceLines: differenceReferenceLines(difference.reference),
    },
    {
      id: 'endurance',
      index: '04',
      title: '握力保持率',
      value: enduranceValue,
      unit: '%',
      ...metricMeta(endurance, enduranceValue !== null),
      chartValues: hasEnduranceSeries ? [...enduranceSeries] : [],
      // 没有曲线数据时连横轴标签也不给：原来会回落到 0s/15s/30s/45s/60s，
      // 那是 60 秒耐力协议的刻度，本系统一次握持只有几秒，显示出来是误导
      chartLabels: hasEnduranceSeries && enduranceLabels.length === 5
        ? enduranceLabels
        : [],
      referenceLines: retentionReferenceLines(endurance, endurance.holdSeconds),
    },
  ];
}

export function mapGripReport(record, report) {
  if (!record?.id || !isObject(record.assessments)) {
    throw new TypeError('Invalid assessment history record');
  }

  const data = isObject(report?.reportData) ? report.reportData : report;
  if (!isObject(data)) return null;

  const leftData = isObject(data.left) ? data.left : {};
  const rightData = isObject(data.right) ? data.right : {};
  const left = nonNegativeOrNull(leftData.totalForce);
  const right = nonNegativeOrNull(rightData.totalForce);
  const availableForces = [left, right].filter((value) => value !== null);

  if (availableForces.length === 0 || availableForces.every((value) => value === 0)) return null;

  const maximum = Math.max(...availableForces);
  const relativeDifferencePercent = left !== null && right !== null && maximum > 0
    ? (Math.abs(left - right) / maximum) * 100
    : null;
  const score = percentOrNull(data.score);
  const hasScore = score !== null;
  const peerComparison = mapPeerComparison(data.peerComparison);
  const hasCompletePeerComparison = [
    peerComparison.peerPercentile,
    peerComparison.peerSampleSize,
    peerComparison.peerAverageForce,
    peerComparison.peerRankPercent,
  ].every((item) => item !== null);

  const forces = {
    left,
    right,
    maximum,
    relativeDifferencePercent,
  };
  const details = isObject(data.details) ? data.details : {};

  // 「专业数据分析」区实际会渲染哪些卡由这份结果决定
  const mappedDetails = {
    trials: mapDetailTrials(data.trials),
    cv: mapCv(details.cv),
    trend: mapTrend(details.trend),
    fingerRegions: mapFingerRegions(leftData.fingers, rightData.fingers),
    secondaryMetrics: mapSecondaryMetrics(details.secondaryMetrics),
    forceCurve: mapForceCurve(details.forceCurve),
    breakdown: mapBreakdown(details.breakdown),
    scoreSummary: mapScoreSummary(details.scoreSummary),
    redFlags: mapRedFlags(details.redFlags),
  };

  return {
    recordId: record.id,
    assessmentId: textOr(
      data.assessmentId,
      textOr(report?.assessmentId, record.assessments.grip?.assessmentId || ''),
    ),
    recordedAt: formatReportTime(record.updatedAt || record.date),
    patientName: textOr(record.patientName, '用户'),
    unit: 'N',
    activeHand: textOr(data.activeHand, ''),
    hands: {
      left: { totalForce: left, fingers: copyFingers(leftData.fingers) },
      right: { totalForce: right, fingers: copyFingers(rightData.fingers) },
    },
    forces,
    metrics: buildMetrics(data, forces),
    evaluation: mapEvaluation(data.evaluation, hasCompletePeerComparison),
    healthSummary: mapAiHealthSummary(data.evaluation?.aiSummary),
    advice: mapAdvice(data.advice),
    footer: mapFooter(data.footer),
    details: mappedDetails,
    hero: {
      hasScore,
      score,
      status: hasScore ? textOr(data.status, '已完成') : '数据不足',
      title: textOr(data.summary?.title, '握力评估结果'),
      lead: textOr(data.summary?.lead, '查看本次握力检测数据。'),
      findings: mapFindings(data.findings),
      ...peerComparison,
    },
  };
}
