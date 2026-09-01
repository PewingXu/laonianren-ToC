import { finiteOrNull, parseCalendarDate } from '../../health-overview/utils/validators';

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

function mapPeerComparison(value) {
  const percentile = isObject(value) ? percentOrNull(value.percentile) : null;
  const sampleSize = isObject(value) ? positiveOrNull(value.sampleSize) : null;
  const hasPeerComparison = percentile !== null && sampleSize !== null;

  return hasPeerComparison
    ? { hasPeerComparison, peerPercentile: percentile, peerSampleSize: sampleSize }
    : { hasPeerComparison: false, peerPercentile: null, peerSampleSize: null };
}

const TAG_ICONS = new Set(['check-circle', 'scale', 'footprints']);

function mapTags(value) {
  if (!Array.isArray(value) || value.length > 3) return [];

  return value
    .map((tag) => {
      if (!isObject(tag)) return null;
      const label = textOr(tag.label, '');
      const icon = textOr(tag.icon, '');
      return label && TAG_ICONS.has(icon) ? { label, icon } : null;
    })
    .filter(Boolean);
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

function mapRecommendations(value) {
  if (!Array.isArray(value) || value.length !== 3) return [];

  const recommendations = value.map((recommendation) => {
    if (!isObject(recommendation)) return null;

    const id = textOr(recommendation.id, '');
    const title = textOr(recommendation.title, '');
    const description = textOr(recommendation.description, '');
    const icon = textOr(recommendation.icon, '');
    const tone = textOr(recommendation.tone, '');

    if (
      !id
      || !title
      || !description
      || !RECOMMENDATION_ICONS.has(icon)
      || !RECOMMENDATION_TONES.has(tone)
    ) return null;

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

function rangeOrNull(value) {
  if (!isObject(value)) return null;

  const min = finiteOrNull(value.min);
  const max = finiteOrNull(value.max);
  return min !== null && min >= 0 && max !== null && min < max ? { min, max } : null;
}

function roundTo(value, precision) {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function progressPercent(value, maximum) {
  return value !== null && maximum !== null
    ? Math.min(100, roundTo((value / maximum) * 100, 2))
    : null;
}

function buildAbilities(data, gaitParams) {
  const abilities = isObject(data.abilities) ? data.abilities : {};
  const fallbackNote = '暂无可靠的能力解读数据。';

  const stability = isObject(abilities.stability) ? abilities.stability : {};
  const foreAftSwayCm = nonNegativeOrNull(stability.foreAftSwayCm);
  const lateralSwayCm = nonNegativeOrNull(stability.lateralSwayCm);
  const swayScaleMaxCm = positiveOrNull(stability.swayScaleMaxCm);
  const hasStabilityData = foreAftSwayCm !== null && lateralSwayCm !== null;

  const coordination = isObject(abilities.coordination) ? abilities.coordination : {};
  const rawLeftLoadPercent = percentOrNull(coordination.leftLoadPercent);
  const rawRightLoadPercent = percentOrNull(coordination.rightLoadPercent);
  const hasCoordinationData = rawLeftLoadPercent !== null
    && rawRightLoadPercent !== null
    && Math.abs(rawLeftLoadPercent + rawRightLoadPercent - 100) < 0.001;
  const leftLoadPercent = hasCoordinationData ? rawLeftLoadPercent : null;
  const rightLoadPercent = hasCoordinationData ? rawRightLoadPercent : null;

  const rhythm = isObject(abilities.rhythm) ? abilities.rhythm : {};
  const leftStepTime = positiveOrNull(gaitParams.leftStepTime);
  const rightStepTime = positiveOrNull(gaitParams.rightStepTime);
  const legacyCadence = leftStepTime !== null && rightStepTime !== null
    ? roundTo(120 / (leftStepTime + rightStepTime), 0)
    : null;
  const leftStepLength = positiveOrNull(gaitParams.leftStepLength);
  const rightStepLength = positiveOrNull(gaitParams.rightStepLength);
  const legacyStepLength = leftStepLength !== null && rightStepLength !== null
    ? roundTo((leftStepLength + rightStepLength) / 2, 2)
    : null;
  const cadenceStepsPerMinute = positiveOrNull(rhythm.cadenceStepsPerMinute) ?? legacyCadence;
  const stepLengthM = positiveOrNull(rhythm.stepLengthM) ?? legacyStepLength;
  const hasRhythmData = cadenceStepsPerMinute !== null && stepLengthM !== null;

  const direction = isObject(abilities.direction) ? abilities.direction : {};
  const pathDeviationCm = nonNegativeOrNull(direction.pathDeviationCm);
  const deviationScaleMaxCm = positiveOrNull(direction.deviationScaleMaxCm);
  const rawBodySway = textOr(direction.bodySway, '');
  const rawBodySwayDetail = textOr(direction.bodySwayDetail, '');
  const hasDirectionData = pathDeviationCm !== null && rawBodySway && rawBodySwayDetail;

  return [
    {
      id: 'stability',
      index: '01',
      title: '行走稳定性',
      subtitle: '身体在行走时是否稳定',
      status: hasStabilityData ? textOr(stability.status, '数据不足') : '数据不足',
      foreAftSwayCm,
      lateralSwayCm,
      swayScaleMaxCm,
      foreAftProgressPercent: progressPercent(foreAftSwayCm, swayScaleMaxCm),
      lateralProgressPercent: progressPercent(lateralSwayCm, swayScaleMaxCm),
      note: hasStabilityData ? textOr(stability.note, fallbackNote) : fallbackNote,
    },
    {
      id: 'coordination',
      index: '02',
      title: '左右协调性',
      subtitle: '左右脚受力是否均衡',
      status: hasCoordinationData ? textOr(coordination.status, '数据不足') : '数据不足',
      leftLoadPercent,
      rightLoadPercent,
      note: hasCoordinationData ? textOr(coordination.note, fallbackNote) : fallbackNote,
    },
    {
      id: 'rhythm',
      index: '03',
      title: '步频节奏',
      subtitle: '行走的节奏是否自然稳定',
      status: hasRhythmData ? textOr(rhythm.status, '数据不足') : '数据不足',
      cadenceStepsPerMinute,
      stepLengthM,
      cadenceRange: rangeOrNull(rhythm.cadenceRange),
      stepLengthRange: rangeOrNull(rhythm.stepLengthRange),
      note: hasRhythmData ? textOr(rhythm.note, fallbackNote) : fallbackNote,
    },
    {
      id: 'direction',
      index: '04',
      title: '方向控制能力',
      subtitle: '行走路线是否稳定，方向控制如何',
      status: hasDirectionData ? textOr(direction.status, '数据不足') : '数据不足',
      pathDeviationCm,
      deviationScaleMaxCm,
      deviationProgressPercent: progressPercent(pathDeviationCm, deviationScaleMaxCm),
      bodySway: hasDirectionData ? rawBodySway : '数据不足',
      bodySwayDetail: hasDirectionData ? rawBodySwayDetail : '暂无可靠数据',
      note: hasDirectionData ? textOr(direction.note, fallbackNote) : fallbackNote,
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
  const walkingSpeed = positiveOrNull(gaitParams.walkingSpeed);
  if (walkingSpeed === null) return null;

  const score = percentOrNull(data.score);
  const hasScore = score !== null;
  const summary = isObject(data.summary) ? data.summary : {};

  return {
    recordId: record.id,
    assessmentId: textOr(data.assessmentId, record.assessments.gait?.assessmentId || ''),
    recordedAt: formatReportTime(record.updatedAt || record.date),
    patientName: textOr(record.patientName, '用户'),
    walkingSpeed,
    abilities: buildAbilities(data, gaitParams),
    recommendations: mapRecommendations(data.recommendations),
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
      title: textOr(summary.title, '步态评估结果'),
      lead: textOr(summary.lead, '查看本次步态检测数据。'),
      tags: mapTags(data.tags),
      ...mapPeerComparison(data.peerComparison),
    },
    summary: mapSummary(data),
  };
}
