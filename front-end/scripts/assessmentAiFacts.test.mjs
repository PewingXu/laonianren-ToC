import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildGaitAiFacts,
  buildStandingAiFacts,
} from '../src/lib/assessmentAiFacts.js';
import { validateGaitCopy, validateStandingCopy } from '../src/reports-v2/shared/useAssessmentAiCopy.js';
import { buildStandingHealthSummary } from '../src/reports-v2/features/standing-report/mappers/buildStandingHealthSummary.js';
import { buildGaitHealthSummary } from '../src/reports-v2/features/gait-report/mappers/buildGaitHealthSummary.js';

function peakFrame(leftValue = 3, rightValue = 1) {
  return Array.from({ length: 4096 }, (_value, index) => (
    index % 64 < 32 ? leftValue : rightValue
  ));
}

const standingMeasurement = {
  arch_features: {
    peak_frame_data: peakFrame(),
    left_foot: { area_index: 0.23, area_type: 'normal' },
    right_foot: { area_index: 0.24, area_type: 'normal' },
  },
  additional_data: {
    left_pressure: { 前足: 0.4, 中足: 0.2, 后足: 0.4 },
    right_pressure: { 前足: 0.35, 中足: 0.25, 后足: 0.4 },
  },
  cop_time_series: {
    path_length: 800,
    contact_area: 120,
    max_displacement: 2,
    avg_velocity: 10,
  },
  four_stage_balance_level: 4,
};

const gaitMeasurement = {
  gaitParams: {
    leftStepTime: 1,
    rightStepTime: 1,
    leftStepLength: 60,
    rightStepLength: 60,
    stepWidth: 10,
    walkingSpeed: 1.05,
    doubleContactTime: 0.25,
  },
  timeSeries: {
    left: { time: [0, 1, 2], load: [0, 100, 0] },
    right: { time: [0, 1, 2], load: [0, 100, 0] },
  },
};

test('站立 AI facts 复用报告百分制评分并映射实测足弓和三区压力', () => {
  const facts = buildStandingAiFacts(standingMeasurement);

  assert.equal(facts.is_valid, true);
  assert.equal(facts.score, 88);
  assert.equal(facts.score_max, 100);
  assert.equal(facts.left_percent, 75);
  assert.equal(facts.right_percent, 25);
  assert.equal(facts.cop_scope, '代表侧单足 COP');
  assert.equal(facts.sway_cm, 80);
  assert.equal(facts.left_arch_index, 0.23);
  assert.equal(facts.right_arch_index, 0.24);
  assert.equal(facts.arch_note, '左脚正常足弓，右脚正常足弓');
  assert.equal(facts.left_forefoot_percent, 40);
  assert.equal(facts.left_midfoot_percent, 20);
  assert.equal(facts.left_heel_percent, 40);
  assert.equal(facts.right_forefoot_percent, 35);
  assert.equal(facts.right_midfoot_percent, 25);
  assert.equal(facts.right_heel_percent, 40);
  assert.equal(facts.forefoot_percent, 38.8);
  assert.equal(facts.midfoot_percent, 21.3);
  assert.equal(facts.heel_percent, 40);
});

test('站立 AI facts 传递重心偏移代理并拒绝无效质量结果', () => {
  const measured = buildStandingAiFacts({
    ...standingMeasurement,
    center_control: {
      lateral_offset_cm: -1.234,
      longitudinal_offset_cm: 0.106,
      magnitude_cm: 1.239,
      lateral_direction: 'left',
      quality: { valid: true, reason: null },
    },
  });
  assert.equal(measured.center_control_scope, '峰值帧足底压力中心偏移代理');
  assert.equal(measured.center_lateral_offset_cm, -1.23);
  assert.equal(measured.center_longitudinal_offset_cm, 0.11);
  assert.equal(measured.center_offset_magnitude_cm, 1.24);
  assert.equal(measured.center_lateral_direction, 'left');

  const invalid = buildStandingAiFacts({
    ...standingMeasurement,
    center_control: { quality: { valid: false, reason: 'missing_cop_points' } },
  });
  assert.equal(invalid.center_lateral_offset_cm, null);
  assert.equal(invalid.center_longitudinal_offset_cm, null);
  assert.equal(invalid.center_offset_magnitude_cm, null);
  assert.equal(invalid.center_lateral_direction, null);
});

test('站立缺少可靠左右承重时 facts 无效，但保留已有实测值', () => {
  const facts = buildStandingAiFacts({
    ...standingMeasurement,
    arch_features: {
      ...standingMeasurement.arch_features,
      peak_frame_data: Array(4096).fill(0),
    },
  });

  assert.equal(facts.is_valid, false);
  assert.equal(facts.score, null);
  assert.equal(facts.left_percent, null);
  assert.equal(facts.left_arch_index, 0.23);
  assert.equal(facts.left_forefoot_percent, 40);
  assert.match(facts.invalid_reason, /缺少可靠的左右承重比例/);
});

test('站立旧前端驼峰结构保留合法零足弓指数并标明整体 COP', () => {
  const facts = buildStandingAiFacts({
    left: {
      archAnalysis: { archIndex: 0, archType: '高足弓' },
      footData: { pressure: 100 },
      regionPressure: {
        forefoot: { percent: 40 },
        midfoot: { percent: 20 },
        hindfoot: { percent: 40 },
      },
    },
    right: {
      archAnalysis: { archIndex: 0.24, archType: '正常足弓' },
      footData: { pressure: 100 },
      regionPressure: {
        forefoot: { percent: 35 },
        midfoot: { percent: 25 },
        hindfoot: { percent: 40 },
      },
    },
    bilateral: {
      copMetrics: { pathLength: 800, ellipseArea: 120, maxDisplacement: 20 },
    },
    scoreInputs: { fourStageLevel: 4 },
  });

  assert.equal(facts.is_valid, true);
  assert.equal(facts.left_arch_index, 0);
  assert.equal(facts.arch_note, '左脚高弓足，右脚正常足弓');
  assert.equal(facts.cop_scope, '整体 COP');
  assert.equal(facts.left_percent, 50);
  assert.equal(facts.right_percent, 50);
});

test('步态 AI facts 与报告统一使用同脚周期步频、米制步幅和百分制评分', () => {
  const facts = buildGaitAiFacts(gaitMeasurement);

  assert.equal(facts.is_valid, true);
  assert.equal(facts.cadence_spm, 120);
  assert.equal(facts.step_length_m, 0.6);
  assert.equal(facts.step_length_diff, 0);
  assert.equal(facts.step_time_diff, 0);
  assert.equal(facts.left_load_percent, 50);
  assert.equal(facts.right_load_percent, 50);
  assert.equal(facts.score, 100);
  assert.equal(facts.score_max, 100);
});

test('步态 AI facts 与报告统一读取方向控制算法契约', () => {
  const facts = buildGaitAiFacts({
    ...gaitMeasurement,
    directionControl: {
      pathDeviationRmsCm: 0.63,
      maxPathDeviationCm: 1.41,
      sampleCount: 8,
      forwardSpanCm: 56.2,
      quality: { valid: true, reason: null, confidence: 'limited' },
    },
  });

  assert.equal(facts.path_deviation_cm, 0.63);
  assert.equal(facts.max_path_deviation_cm, 1.41);
  assert.equal(facts.direction_valid_steps, 8);
  assert.equal(facts.direction_confidence, 'limited');

  const invalid = buildGaitAiFacts({
    ...gaitMeasurement,
    directionControl: {
      pathDeviationRmsCm: 0.63,
      maxPathDeviationCm: 1.41,
      sampleCount: 4,
      quality: { valid: false, reason: 'insufficient_alternating_steps' },
    },
  });
  assert.equal(invalid.path_deviation_cm, null);
  assert.equal(invalid.max_path_deviation_cm, null);
  assert.equal(invalid.direction_valid_steps, null);
  assert.equal(invalid.direction_confidence, null);
});

test('步态 AI facts 传递行走稳定性数值与有限样本标记', () => {
  const facts = buildGaitAiFacts({
    ...gaitMeasurement,
    walkingStability: {
      stepTimeCvPercent: 3.2,
      stepDistanceCvPercent: 5.4,
      sampleCount: 4,
      intervalCount: 3,
      quality: { valid: true, reason: null, confidence: 'limited' },
    },
  });

  assert.equal(facts.step_time_cv_percent, 3.2);
  assert.equal(facts.step_distance_cv_percent, 5.4);
  assert.equal(facts.stability_valid_steps, 4);
  assert.equal(facts.stability_confidence, 'limited');
});

test('真实步态 fixture facts 显示 60 步每分钟和 0.17 米', () => {
  const fixture = JSON.parse(readFileSync(
    new URL('../public/gait_report_data/report_data.json', import.meta.url),
    'utf8',
  ));
  const facts = buildGaitAiFacts(fixture);

  assert.equal(facts.cadence_spm, 60);
  assert.equal(facts.step_length_m, 0.17);
  assert.equal(facts.score, 68);
  assert.equal(facts.score_max, 100);
  assert.equal(facts.is_valid, true);
  // fixture 没有完整负荷时序或六分区冲量，只跳过承重事实。
  assert.equal(facts.left_load_percent, null);
  assert.equal(facts.right_load_percent, null);
});

test('步态部分数据无效，完整评分但无可靠承重时只留空承重事实', () => {
  const partial = buildGaitAiFacts({
    gaitParams: { walkingSpeed: 0.9, leftStepLength: 50 },
    timeSeries: gaitMeasurement.timeSeries,
  });
  const noReliableLoad = buildGaitAiFacts({ gaitParams: gaitMeasurement.gaitParams });

  assert.equal(partial.is_valid, false);
  assert.equal(noReliableLoad.is_valid, true);
  assert.equal(noReliableLoad.score, 100);
  assert.equal(noReliableLoad.left_load_percent, null);
});

test('步态 N/A 可选指标保持缺失，不作为零值交给 AI', () => {
  const facts = buildGaitAiFacts({
    ...gaitMeasurement,
    gaitParams: {
      ...gaitMeasurement.gaitParams,
      stepWidth: 'N/A',
      doubleContactTime: 'N/A',
      leftFPA: 'N/A',
      rightFPA: '',
      pathDeviation: 'N/A',
    },
  });

  assert.equal(facts.is_valid, true);
  assert.equal(facts.step_width_cm, null);
  assert.equal(facts.double_support_s, null);
  assert.equal(facts.path_deviation_cm, null);

  const zeroDeviation = buildGaitAiFacts({
    ...gaitMeasurement,
    directionControl: {
      pathDeviationRmsCm: 0,
      maxPathDeviationCm: 0,
      sampleCount: 6,
      quality: { valid: true, reason: null },
    },
  });
  assert.equal(zeroDeviation.path_deviation_cm, 0);
});

test('站立 AI 建议 ID 固定为 StandingSummary 已支持的图标契约', () => {
  const copy = validateStandingCopy({
    evaluation: '本次站立检测已完成。',
    advice: [
      { id: 'ignored-1', title: '活动', detail: '活动建议。' },
      { id: 'ignored-2', title: '站姿', detail: '站姿建议。' },
      { id: 'ignored-3', title: '力量', detail: '力量建议。' },
    ],
  });

  assert.deepEqual(copy.advice.map((item) => item.id), ['activity', 'posture', 'strength']);
  assert.equal(copy.healthSummary, null);
});

test('站立 AI 接受完整通俗总结，旧版评价仍可单独返回', () => {
  const copy = validateStandingCopy({
    healthSummary: {
      title: ' 两只脚用力差不多 ',
      body: ' 站久了可以坐下歇一会儿。 ',
      focusBody: ' 留意是不是同一只脚总觉得酸。 ',
    },
  });
  assert.deepEqual(copy, {
    evaluation: null,
    healthSummary: {
      title: '两只脚用力差不多',
      body: '站久了可以坐下歇一会儿。',
      focusBody: '留意是不是同一只脚总觉得酸。',
    },
    advice: null,
  });
  assert.deepEqual(validateStandingCopy({ evaluation: '原版站立评价。' }), {
    evaluation: '原版站立评价。', healthSummary: null, advice: null,
  });
});

test('站立 AI 总结字段不完整时整块回退，不混入旧评价', () => {
  const complete = { title: '留意两只脚怎么用力', body: '站久了歇一会儿。', focusBody: '留意脚底有没有不舒服。' };
  for (const field of ['title', 'body', 'focusBody']) {
    for (const invalid of [undefined, '  ', {}]) {
      const healthSummary = { ...complete, [field]: invalid };
      const copy = validateStandingCopy({ evaluation: '原版技术评价。', healthSummary });
      assert.equal(copy.healthSummary, null);
      assert.equal(copy.evaluation, '原版技术评价。');
      assert.equal(validateStandingCopy({ healthSummary }), null);
    }
  }
});

test('站立通俗总结从实测压力区分哪只脚用力多，并沿用左右差异边界', () => {
  for (const [left, right, side] of [[3, 1, '左脚'], [1, 3, '右脚']]) {
    const facts = buildStandingAiFacts({
      ...standingMeasurement,
      arch_features: { ...standingMeasurement.arch_features, peak_frame_data: peakFrame(left, right) },
    });
    assert.equal(facts.is_valid, true);
    const summary = buildStandingHealthSummary(facts);
    assert.ok(summary.body.includes(`${side}用力更多`));
    assert.doesNotMatch(Object.values(summary).join(''), /COP|压力中心|轨迹|综合评估|\d/);
  }
  const facts = buildStandingAiFacts(standingMeasurement);
  assert.match(buildStandingHealthSummary({ ...facts, left_percent: 55, right_percent: 45 }).body, /差不多/);
  assert.match(buildStandingHealthSummary({ ...facts, left_percent: 55.1, right_percent: 44.9 }).body, /左脚用力更多/);
});

test('站立通俗总结不因无效记录中的残留比例给出良好结论', () => {
  const facts = buildStandingAiFacts({});
  const summary = buildStandingHealthSummary({ ...facts, left_percent: 50, right_percent: 50 });
  assert.equal(facts.is_valid, false);
  assert.match(summary.body, /再测/);
  assert.doesNotMatch(summary.body, /差不多|用力更多/);
  assert.deepEqual(summary, buildStandingHealthSummary(null));
});

test('站立通俗总结不把单侧脚底压力轨迹当作身体晃动或跌倒风险', () => {
  const facts = buildStandingAiFacts(standingMeasurement);
  const summary = buildStandingHealthSummary({
    ...facts, cop_scope: '代表侧单足 COP', sway_cm: 1234, sway_grade: '晃动偏大',
  });
  assert.deepEqual(summary, buildStandingHealthSummary(facts));
  assert.doesNotMatch(Object.values(summary).join(''), /身体晃动|跌倒风险|身体不稳/);
});

test('步态 AI 接受独立完整的末尾总结并清理字段空白', () => {
  const copy = validateGaitCopy({
    healthSummary: {
      title: '  按舒适节奏安排出行  ',
      body: '  建议您为日常出行留出充足时间。  ',
      focusBody: '  复测时比较相同路线下的走路节奏。  ',
    },
  });

  assert.deepEqual(copy, {
    assessmentSummary: null,
    scoreExplanation: null,
    healthSummary: {
      title: '按舒适节奏安排出行',
      body: '建议您为日常出行留出充足时间。',
      focusBody: '复测时比较相同路线下的走路节奏。',
    },
    recommendations: null,
  });
});

test('步态 AI 末尾总结缺少任一有效字段时整块丢弃，保留开头摘要', () => {
  const complete = {
    title: '按舒适节奏安排出行',
    body: '建议您为日常出行留出充足时间。',
    focusBody: '复测时比较相同路线下的走路节奏。',
  };
  const assessmentSummary = { body: '本次走路节奏接近。', strength: '左右落脚节奏接近' };

  for (const field of ['title', 'body', 'focusBody']) {
    for (const invalidValue of [undefined, null, '', '   ', 12, {}, []]) {
      const healthSummary = { ...complete, [field]: invalidValue };
      const copy = validateGaitCopy({ assessmentSummary, healthSummary });
      assert.equal(copy.healthSummary, null, `${field} 不接受 ${JSON.stringify(invalidValue)}`);
      assert.deepEqual(copy.assessmentSummary, assessmentSummary);
      assert.equal(validateGaitCopy({ healthSummary }), null);
    }
  }
});

test('步态 AI 兼容未提供末尾总结的旧版摘要、评分与三条建议', () => {
  const copy = validateGaitCopy({
    assessmentSummary: { body: '本次实测结果已记录。', strength: '左右落脚节奏接近' },
    scoreExplanation: '本次分数结合走路速度和左右落脚表现。',
    recommendations: [
      { id: 'old-walk', title: '步行练习', description: '按舒适速度练习。' },
      { id: 'old-stretch', title: '活动放松', description: '活动脚踝并放松。' },
      { id: 'old-safety', title: '出行准备', description: '选择平整路面。' },
    ],
  });

  assert.equal(copy.healthSummary, null);
  assert.equal(copy.assessmentSummary.body, '本次实测结果已记录。');
  assert.equal(copy.scoreExplanation, '本次分数结合走路速度和左右落脚表现。');
  assert.deepEqual(copy.recommendations.map(({ id, icon, tone }) => ({ id, icon, tone })), [
    { id: 'walk', icon: 'walking', tone: 'green' },
    { id: 'stretch', icon: 'stretch', tone: 'orange' },
    { id: 'safety', icon: 'water', tone: 'blue' },
  ]);
});

test('步态末尾本地总结用低步速实测安排出行，不复述开头数据摘要', () => {
  const openingBody = '日常步速约 0.15 m/s，提示行动能力下降风险增加。';
  const facts = buildGaitAiFacts({
    ...gaitMeasurement,
    gaitParams: { ...gaitMeasurement.gaitParams, walkingSpeed: 0.15 },
    assessmentSummary: { body: openingBody, strength: '步态数据已记录' },
  });
  const summary = buildGaitHealthSummary(facts);
  const copy = Object.values(summary).join('');

  assert.equal(facts.is_valid, true);
  assert.match(summary.body, /预留.*时间/);
  assert.match(summary.body, /路程分成几段/);
  assert.match(summary.focusBody, /复测/);
  assert.ok(!copy.includes(openingBody));
  assert.doesNotMatch(copy, /评分|\d|步态数据已记录/);
});

test('步态末尾本地总结在数据无效时指导复测，不受残留步速影响', () => {
  const facts = buildGaitAiFacts({ gaitParams: { walkingSpeed: 0.15 } });
  const summary = buildGaitHealthSummary(facts);

  assert.equal(facts.is_valid, false);
  assert.equal(facts.speed_mps, 0.15);
  assert.deepEqual(summary, buildGaitHealthSummary({ is_valid: false }));
  assert.match(summary.body, /不足以支持完整的步态判断/);
  assert.match(summary.body, /复测/);
  assert.doesNotMatch(summary.body, /路程分成几段|逐步调整活动量/);
});

test('步态末尾本地总结对稳定性或方向的有限样本保留结论限制', () => {
  const facts = buildGaitAiFacts(gaitMeasurement);
  for (const confidence of ['stability_confidence', 'direction_confidence']) {
    const summary = buildGaitHealthSummary({ ...facts, [confidence]: 'limited' });
    assert.match(summary.focusBody, /样本有限/);
    assert.match(summary.focusBody, /只作本次参考/);
  }
  const standard = buildGaitHealthSummary({
    ...facts,
    stability_confidence: 'standard',
    direction_confidence: 'standard',
  });
  assert.doesNotMatch(standard.focusBody, /样本有限/);
});
