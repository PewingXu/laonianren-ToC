import { prepareGaitReportScoreInput } from './gaitReportEnrich.js';
import { prepareStandingReportScoreInput } from './standingReportEnrich.js';

const SCORE_INPUT_PREPARERS = Object.freeze({
  standing: prepareStandingReportScoreInput,
  gait: prepareGaitReportScoreInput,
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function reportDataOf(assessment) {
  if (isObject(assessment?.report?.reportData)) return assessment.report.reportData;
  return isObject(assessment?.reportData) ? assessment.reportData : null;
}

/**
 * 为综合评分和历史排名生成只读评分副本。
 *
 * 详情报告在增强层会先处理 Python 字段名、单位和缺失值；其他评分入口也必须
 * 使用同一输入，否则同一次检测会出现不同分数。本函数只适配输入，不改评分算法，
 * 也不改原 assessments。无法满足报告评分契约的项目只在副本中标记为未完成。
 */
export function prepareAssessmentsForScoring(assessments = {}) {
  if (!isObject(assessments)) return {};

  const preparedAssessments = { ...assessments };
  for (const [type, prepare] of Object.entries(SCORE_INPUT_PREPARERS)) {
    const assessment = assessments[type];
    if (!isObject(assessment) || assessment.completed !== true) continue;

    const reportData = reportDataOf(assessment);
    const preparedReportData = reportData ? prepare(reportData) : null;
    if (!preparedReportData) {
      preparedAssessments[type] = { ...assessment, completed: false };
      continue;
    }

    preparedAssessments[type] = {
      ...assessment,
      report: {
        ...(isObject(assessment.report) ? assessment.report : {}),
        reportData: preparedReportData,
      },
    };
  }

  return preparedAssessments;
}

export default prepareAssessmentsForScoring;
