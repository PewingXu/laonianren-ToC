import { staticContent } from '../data/staticContent';
import { buildNarrativeCacheKey, resolveNarrative } from '../narratives/narrativeResolver';
import { buildRuleNarrative } from '../narratives/ruleNarrativeProvider';
import { formatRecordedAt } from '../utils/formatters';
import { finiteOrNull, parseCalendarDate } from '../utils/validators';
import {
  mapGaitAssessment,
  mapGripAssessment,
  mapSitStandAssessment,
  mapStandingAssessment,
} from './assessmentMappers';

function buildHeroView(abilities, narrative) {
  const availableAbilities = abilities.filter((ability) => (
    ability.available
    && Number.isFinite(ability.score)
    && ability.score >= 0
    && ability.score <= 100
  ));
  const averageScore = availableAbilities.length
    ? availableAbilities.reduce((total, ability) => total + ability.score, 0) / availableAbilities.length
    : 0;

  if (availableAbilities.length === 0) {
    return {
      ...staticContent.hero,
      state: 'unavailable',
      hasScore: false,
      score: 0,
      title: '完成评估后，再一起看看身体状态',
      content: '当前没有可用于综合判断的评估数据，完成至少一项评估后将生成专属总结。',
      status: '暂无可评估数据',
    };
  }

  if (averageScore < 80) {
    return {
      ...staticContent.hero,
      state: 'caution',
      hasScore: true,
      score: Math.round(averageScore),
      title: '有几项状态值得多留意',
      content: '本次结果提示部分能力还有改善空间，请根据身体感受循序调整活动节奏。',
      status: '建议关注',
    };
  }

  return {
    ...staticContent.hero,
    state: 'positive',
    hasScore: true,
    ...(narrative.greeting ? { title: narrative.greeting } : {}),
    score: Math.round(averageScore),
  };
}

function buildAdviceViews(_abilities, narrative) {
  if (!narrative.advice) {
    return staticContent.advice;
  }

  return staticContent.advice.map((advice, index) => ({
    ...advice,
    ...(narrative.advice[index] ? { content: narrative.advice[index] } : {}),
  }));
}

function buildPeerComparison(peerComparison) {
  return peerComparison;
}

function buildReminderDate(recordedAt, days) {
  const calendarDate = parseCalendarDate(recordedAt);
  if (!calendarDate || !Number.isInteger(days) || days < 1) return null;

  const date = new Date(Date.UTC(calendarDate.year, calendarDate.month - 1, calendarDate.day + days));
  return date.toISOString().slice(0, 10);
}

/** Converts a legacy assessment-history record into the HealthOverviewData page model. */
export function mapRecordToOverview(record) {
  if (!record?.id || !record?.assessments) {
    throw new TypeError('Invalid assessment history record');
  }

  const abilities = [
    mapSitStandAssessment(record.assessments.sitstand),
    mapGaitAssessment(record.assessments.gait),
    mapStandingAssessment(record.assessments.standing),
    mapGripAssessment(record.assessments.grip),
  ];
  const rules = buildRuleNarrative({ abilities, trend: staticContent.trend });
  const resolvedNarrative = resolveNarrative({
    cachedAi: record.narrative || null,
    manual: staticContent.manualNarrative || {},
    rules,
    expectedCacheKey: buildNarrativeCacheKey({
      recordId: record.id,
      updatedAt: record.updatedAt || record.date,
      promptVersion: 'overview-v1',
      modelVersion: record.narrative?.modelVersion || 'none',
    }),
  });

  return {
    recordId: record.id,
    recordedAt: formatRecordedAt(record.updatedAt || record.date),
    patient: {
      name: record.patientName || '用户',
      gender: record.patientGender || '',
      age: finiteOrNull(record.patientAge),
      weight: finiteOrNull(record.patientWeight),
      institution: record.institution || '',
    },
    hero: buildHeroView(abilities, resolvedNarrative),
    abilities,
    advice: buildAdviceViews(abilities, resolvedNarrative),
    expertInsight: resolvedNarrative.expertInsight || staticContent.expertInsight,
    peerComparison: buildPeerComparison(resolvedNarrative.peerComparison),
    trend: { ...staticContent.trend, summary: resolvedNarrative.trendSummary || staticContent.trend.summary },
    nextAssessment: resolvedNarrative.nextAssessment || staticContent.nextAssessment,
    reminderDate: buildReminderDate(
      record.updatedAt || record.date,
      (resolvedNarrative.nextAssessment || staticContent.nextAssessment).days,
    ),
  };
}
