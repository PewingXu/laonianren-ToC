import assert from 'node:assert/strict';
import test from 'node:test';

import { buildComprehensiveScoreResult } from '../src/lib/assessmentScoring.js';
import { enrichGaitReportData } from '../src/lib/gaitReportEnrich.js';
import { prepareAssessmentsForScoring } from '../src/lib/reportScoringAdapter.js';
import { enrichStandingReportData } from '../src/lib/standingReportEnrich.js';

const standingMeasurement = {
  arch_features: {
    left_foot: { area_index: 0.31 },
    right_foot: { area_index: 0.3 },
  },
  additional_data: {
    left_pressure_ratio: 53.1,
    right_pressure_ratio: 46.9,
    left_pressure: { 前足: 0.496, 中足: 0.311, 后足: 0.193 },
    right_pressure: { 前足: 0.759, 中足: 0.058, 后足: 0.183 },
  },
  cop_time_series: {
    path_length: 4.4649,
    max_displacement: 0.2232,
    avg_velocity: 93.0187,
  },
};

const gaitMeasurement = {
  gaitParams: {
    leftStepTime: 1,
    rightStepTime: 1,
    leftStepLength: 60,
    rightStepLength: 62,
    walkingSpeed: 1.05,
    stepWidth: 'N/A',
    doubleContactTime: 'N/A',
    leftFPA: 'N/A',
    rightFPA: 'N/A',
  },
};

function moduleResult(assessments, type) {
  return buildComprehensiveScoreResult(
    prepareAssessmentsForScoring(assessments),
  ).itemResults.find((item) => item.type === type);
}

test('站立综合评分入口与详情使用相同的单位和字段适配', () => {
  const assessments = {
    standing: { completed: true, report: { reportData: standingMeasurement } },
  };
  const snapshot = structuredClone(assessments);
  const detail = enrichStandingReportData(standingMeasurement);
  const result = moduleResult(assessments, 'standing');

  assert.equal(result.score, detail.details.scoreSummary.total);
  assert.equal(detail.score, Math.round((result.score / 25) * 100));
  assert.equal(result.score, 15);
  assert.deepEqual(assessments, snapshot);
});

test('步态 N/A 在综合评分入口与详情中都按缺失值处理', () => {
  const assessments = {
    gait: { completed: true, report: { reportData: gaitMeasurement } },
  };
  const detail = enrichGaitReportData(gaitMeasurement);
  const result = moduleResult(assessments, 'gait');

  assert.equal(result.score, detail.details.scoreSummary.total);
  assert.equal(detail.score, Math.round((result.score / 25) * 100));
  assert.equal(result.score, 24);
});

test('必需字段不完整时不会在综合评分副本中生成站立或步态分数', () => {
  const prepared = prepareAssessmentsForScoring({
    standing: {
      completed: true,
      report: { reportData: { arch_features: { left_foot: { area_index: 0.23 } } } },
    },
    gait: {
      completed: true,
      report: { reportData: { gaitParams: { walkingSpeed: 0.9 } } },
    },
  });
  const result = buildComprehensiveScoreResult(prepared);

  assert.equal(prepared.standing.completed, false);
  assert.equal(prepared.gait.completed, false);
  assert.equal(result.itemResults.find((item) => item.type === 'standing').score, 0);
  assert.equal(result.itemResults.find((item) => item.type === 'gait').score, 0);
});
