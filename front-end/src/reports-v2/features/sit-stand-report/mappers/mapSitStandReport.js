import { finiteOrNull, parseCalendarDate } from '../../health-overview/utils/validators';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function buildPeerView(peerComparison) {
  if (!isObject(peerComparison)) {
    return {
      hasPeerComparison: false,
      peerPercentile: null,
      peerSampleSize: null,
      peerAverageDuration: null,
      rankPercent: null,
    };
  }

  const peerPercentile = percentOrNull(peerComparison.percentile);
  const peerSampleSize = positiveOrNull(peerComparison.sampleSize);
  const peerAverageDuration = positiveOrNull(peerComparison.averageDuration);
  const rankPercent = percentOrNull(peerComparison.rankPercent);
  const hasPeerComparison = [
    peerPercentile,
    peerSampleSize,
    peerAverageDuration,
    rankPercent,
  ].every((value) => value !== null);

  return hasPeerComparison
    ? {
      hasPeerComparison,
      peerPercentile,
      peerSampleSize,
      peerAverageDuration,
      rankPercent,
    }
    : {
      hasPeerComparison: false,
      peerPercentile: null,
      peerSampleSize: null,
      peerAverageDuration: null,
      rankPercent: null,
    };
}

function mapFindings(findings) {
  if (!Array.isArray(findings)) return [];

  return findings
    .filter((finding) => isObject(finding) && textOr(finding.title, '') && textOr(finding.detail, ''))
    .slice(0, 4)
    .map((finding) => ({
      title: finding.title.trim(),
      detail: finding.detail.trim(),
      icon: textOr(finding.icon, ''),
    }));
}

const DEFAULT_HEALTH_EVALUATION = {
  preface: '本次起身能力检测',
  result: '已完成',
  details: [
    '请结合本次检测数据关注起身表现。',
    '如有不适，请咨询专业人员。',
  ],
};

const DEFAULT_ADVICE = [
  { title: '保持日常活动', detail: '根据身体情况安排适量活动，避免久坐。', icon: 'activity' },
  { title: '注意动作安全', detail: '起身时保持环境稳定，必要时使用可靠支撑。', icon: 'armchair' },
  { title: '及时休息', detail: '活动中如有疲劳或不适，请暂停并休息。', icon: 'droplets' },
  { title: '咨询专业人员', detail: '需要调整训练计划时，请咨询专业人员。', icon: 'dumbbell' },
];

const ADVICE_ICONS = new Set(['activity', 'armchair', 'droplets', 'dumbbell']);

function textArray(value, maximumLength) {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximumLength) return [];

  const values = value.map((item) => textOr(item, ''));
  return values.every(Boolean) ? values : [];
}

function mapHealthEvaluation(value) {
  if (isObject(value)) {
    const preface = textOr(value.preface, '');
    const result = textOr(value.result, '');
    const details = textArray(value.details, 3);
    if (preface && result && details.length > 0) return { preface, result, details };
  }

  return {
    ...DEFAULT_HEALTH_EVALUATION,
    details: [...DEFAULT_HEALTH_EVALUATION.details],
  };
}

function buildEvaluation(data, peer) {
  const evaluation = isObject(data.evaluation) ? data.evaluation : {};
  const rawPeer = isObject(evaluation.peer) ? evaluation.peer : {};
  const peerBase = {
    ageTitle: textOr(rawPeer.ageTitle, '年龄段评价'),
    rankLabel: textOr(rawPeer.rankLabel, '同龄段排名'),
  };

  return {
    health: mapHealthEvaluation(evaluation.health),
    peer: peer.hasPeerComparison
      ? {
        hasPeerComparison: true,
        percentile: peer.peerPercentile,
        summary: textOr(rawPeer.summary, '已完成同龄人对比'),
        ...peerBase,
        rankPercent: peer.rankPercent,
        rankText: `前 ${peer.rankPercent}%`,
        level: textOr(rawPeer.level, '请结合检测数据查看'),
      }
      : {
        hasPeerComparison: false,
        percentile: null,
        summary: '暂无可靠同龄对比数据',
        ...peerBase,
        rankPercent: null,
        rankText: '',
        level: '',
      },
  };
}

function mapAdvice(value) {
  if (Array.isArray(value) && value.length === 4) {
    const items = value.map((item) => {
      if (!isObject(item)) return null;
      const title = textOr(item.title, '');
      const detail = textOr(item.detail, '');
      const icon = textOr(item.icon, '');
      return title && detail && ADVICE_ICONS.has(icon) ? { title, detail, icon } : null;
    });
    if (items.every(Boolean)) return items;
  }

  return DEFAULT_ADVICE.map((item) => ({ ...item }));
}

function rangeOrNull(value) {
  if (!isObject(value)) return null;

  const min = finiteOrNull(value.min);
  const max = finiteOrNull(value.max);
  const precisionValue = finiteOrNull(value.precision);
  const precision = Number.isInteger(precisionValue)
    && precisionValue >= 0
    && precisionValue <= 3
    ? precisionValue
    : null;
  return min !== null && max !== null && min < max ? { min, max, precision } : null;
}

function percentArray(value, maximumLength) {
  if (!Array.isArray(value)) return [];

  const values = value.slice(0, maximumLength).map(percentOrNull);
  return values.length > 0 && values.every((item) => item !== null) ? values : [];
}

function positiveArray(value, expectedLength) {
  if (!Array.isArray(value) || value.length !== expectedLength) return [];

  const values = value.map(positiveOrNull);
  return values.every((item) => item !== null) ? values : [];
}

function mapForceTrials(value) {
  if (!Array.isArray(value) || value.length !== 4) return [];

  const trials = value.map((trial) => {
    if (!isObject(trial)) return null;

    const label = textOr(trial.label, '');
    const leftPercent = percentOrNull(trial.leftPercent);
    const rightPercent = percentOrNull(trial.rightPercent);
    const differencePercent = percentOrNull(trial.differencePercent);
    const hasBalancedTotal = leftPercent !== null
      && rightPercent !== null
      && Math.abs(leftPercent + rightPercent - 100) < 0.001;
    const hasMatchingDifference = hasBalancedTotal
      && differencePercent !== null
      && Math.abs(Math.abs(leftPercent - rightPercent) - differencePercent) < 0.001;
    if (!label || !hasMatchingDifference) return null;

    return { label, leftPercent, rightPercent, differencePercent };
  });

  return trials.every(Boolean) ? trials : [];
}

function mapCv(value) {
  if (!isObject(value)) return null;

  const leftPercent = percentOrNull(value.leftPercent);
  const rightPercent = percentOrNull(value.rightPercent);
  const averagePercent = percentOrNull(value.averagePercent);
  const status = textOr(value.status, '');
  const hasMatchingAverage = leftPercent !== null
    && rightPercent !== null
    && averagePercent !== null
    && Math.abs((leftPercent + rightPercent) / 2 - averagePercent) < 0.001;
  return hasMatchingAverage && status
    ? { leftPercent, rightPercent, averagePercent, status }
    : null;
}

const PROCESS_TONES = new Set(['blue', 'green', 'purple']);

function mapProcessTrend(value) {
  if (!Array.isArray(value) || value.length !== 3) return [];

  const curves = value.map((curve) => {
    if (!isObject(curve) || !Array.isArray(curve.points) || curve.points.length !== 4) return null;

    const label = textOr(curve.label, '');
    const tone = textOr(curve.tone, '');
    const points = curve.points.map((point) => {
      if (!Array.isArray(point) || point.length !== 2) return null;
      const x = finiteOrNull(point[0]);
      const y = finiteOrNull(point[1]);
      return x !== null && x >= 0 && x <= 220 && y !== null && y >= 0 && y <= 190
        ? [x, y]
        : null;
    });
    if (!label || !PROCESS_TONES.has(tone) || !points.every(Boolean)) return null;

    return { label, tone, points };
  });

  return curves.every(Boolean) ? curves : [];
}

function buildDetails(data, durationStats) {
  const details = isObject(data.details) ? data.details : {};
  const rawSpeedTrials = Array.isArray(details.speedTrials)
    ? details.speedTrials
    : durationStats.cycle_durations;

  return {
    speedTrials: positiveArray(rawSpeedTrials, 3),
    forceTrials: mapForceTrials(details.forceTrials),
    cv: mapCv(details.cv),
    processTrend: mapProcessTrend(details.processTrend),
  };
}

function rangeCopy(range, unit) {
  const formatValue = (value) => (
    range?.precision === null ? String(value) : value.toFixed(range.precision)
  );
  const unitGap = unit && unit !== '%' ? ' ' : '';
  return range
    ? `参考范围：${formatValue(range.min)} ~ ${formatValue(range.max)}${unitGap}${unit}`
    : '参考范围：数据不足';
}

function buildMetrics(data, averageDuration) {
  const metrics = isObject(data.metrics) ? data.metrics : {};
  const speed = isObject(metrics.speed) ? metrics.speed : {};
  const speedPeerPercentile = percentOrNull(speed.peerPercentile);
  const speedReference = rangeOrNull(speed.reference);
  const speedGaugePosition = percentOrNull(speed.gaugePosition);

  const balance = isObject(metrics.balance) ? metrics.balance : {};
  const rawLeftPercent = percentOrNull(balance.leftPercent);
  const rawRightPercent = percentOrNull(balance.rightPercent);
  const hasBalance = rawLeftPercent !== null
    && rawRightPercent !== null
    && Math.abs(rawLeftPercent + rawRightPercent - 100) < 0.001;
  const leftPercent = hasBalance ? rawLeftPercent : null;
  const rightPercent = hasBalance ? rawRightPercent : null;
  const rawBalanceDifferenceMax = percentOrNull(balance.referenceDifferenceMax);
  const balanceDifferenceMax = rawBalanceDifferenceMax !== null && rawBalanceDifferenceMax > 0
    ? rawBalanceDifferenceMax
    : null;

  const stability = isObject(metrics.stability) ? metrics.stability : {};
  const stabilityScore = percentOrNull(stability.score);
  const stabilityReference = rangeOrNull(stability.reference);

  const completion = isObject(metrics.completion) ? metrics.completion : {};
  const completionPercent = percentOrNull(completion.percent);
  const completionReference = rangeOrNull(completion.reference);

  return [
    {
      id: 'speed',
      index: '01',
      title: '起身速度',
      value: averageDuration,
      unit: '秒',
      status: textOr(speed.status, '数据不足'),
      peerPercentile: speedPeerPercentile,
      summary: speedPeerPercentile === null
        ? '暂无可靠同龄对比数据'
        : `超过了 ${speedPeerPercentile}% 的同龄人`,
      reference: rangeCopy(speedReference, '秒'),
      chartValue: speedGaugePosition,
      detailTargetId: 'sit-stand-speed-detail',
    },
    {
      id: 'balance',
      index: '02',
      title: '双脚发力平衡',
      leftPercent,
      rightPercent,
      status: hasBalance ? textOr(balance.status, '数据不足') : '数据不足',
      summary: hasBalance ? textOr(balance.summary, '数据不足') : '数据不足',
      reference: balanceDifferenceMax === null
        ? '参考范围：数据不足'
        : `参考范围：差异 < ${balanceDifferenceMax}%`,
      chartValue: hasBalance ? leftPercent : null,
      detailTargetId: 'sit-stand-balance-detail',
    },
    {
      id: 'stability',
      index: '03',
      title: '起身稳定性',
      value: stabilityScore,
      unit: '分',
      status: stabilityScore === null ? '数据不足' : textOr(stability.status, '数据不足'),
      summary: stabilityScore === null ? '数据不足' : textOr(stability.summary, '数据不足'),
      reference: rangeCopy(stabilityReference, '分'),
      chartValues: stabilityScore === null ? [] : percentArray(stability.trend, 6),
      detailTargetId: 'sit-stand-stability-detail',
    },
    {
      id: 'completion',
      index: '04',
      title: '动作完成度',
      value: completionPercent,
      unit: '%',
      status: completionPercent === null ? '数据不足' : textOr(completion.status, '数据不足'),
      summary: completionPercent === null ? '数据不足' : textOr(completion.summary, '数据不足'),
      reference: rangeCopy(completionReference, '%'),
      chartValues: completionPercent === null ? [] : percentArray(completion.bars, 5),
      detailTargetId: 'sit-stand-details-title',
    },
  ];
}

export function mapSitStandReport(record, report) {
  if (!record?.id || !isObject(record.assessments)) {
    throw new TypeError('Invalid assessment history record');
  }

  const data = isObject(report?.reportData) ? report.reportData : report;
  if (!isObject(data)) return null;

  const durationStats = isObject(data.duration_stats) ? data.duration_stats : {};
  const averageDuration = positiveOrNull(durationStats.avg_duration);
  if (averageDuration === null) return null;

  const score = percentOrNull(data.score);
  const hasScore = score !== null;
  const peer = buildPeerView(data.peerComparison);

  return {
    recordId: record.id,
    assessmentId: textOr(data.assessmentId, record.assessments.sitstand?.assessmentId || ''),
    recordedAt: formatReportTime(record.updatedAt || record.date),
    patientName: textOr(record.patientName, '用户'),
    averageDuration,
    metrics: buildMetrics(data, averageDuration),
    details: buildDetails(data, durationStats),
    evaluation: buildEvaluation(data, peer),
    advice: mapAdvice(data.advice),
    hero: {
      hasScore,
      score,
      status: hasScore ? textOr(data.status, '已完成') : '数据不足',
      title: textOr(data.summary?.title, '起身评估结果'),
      lead: textOr(data.summary?.lead, '查看本次起身检测数据。'),
      findings: mapFindings(data.findings),
      ...peer,
    },
  };
}
