import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  deriveBilateralLoadPercent,
  deriveCadenceStepsPerMinute,
  deriveStepLengthM,
  enrichGaitReportData,
} from '../src/lib/gaitReportEnrich.js';
import { mapGaitReport } from '../src/reports-v2/features/gait-report/mappers/mapGaitReport.js';
import { mapGaitAssessment } from '../src/reports-v2/features/health-overview/mappers/assessmentMappers.js';

const measuredGait = {
  gaitParams: {
    leftStepTime: '1.00',
    rightStepTime: '1.00',
    crossStepTime: '0.52',
    leftStepLength: '60.0',
    rightStepLength: '62.0',
    crossStepLength: '30.5',
    stepWidth: '10.0',
    walkingSpeed: '1.05',
    leftFPA: '5.0',
    rightFPA: '7.0',
    doubleContactTime: '0.25',
  },
  timeSeries: {
    left: { time: [0, 1, 2, 3], load: [0, 100, 100, 0] },
    right: { time: [0, 1, 2, 3], load: [0, 50, 50, 0] },
  },
};

const record = {
  id: 'record-1',
  patientName: '测试用户',
  updatedAt: '2026-09-02T10:30:00+08:00',
  assessments: { gait: { assessmentId: 'gait-1' } },
};

test('同脚周期按每周期两步换算步频', () => {
  assert.equal(deriveCadenceStepsPerMinute({ leftStepTime: 1, rightStepTime: 1 }), 120);
  assert.equal(deriveCadenceStepsPerMinute({ leftStepTime: 1.2, rightStepTime: 0.8 }), 120);
  assert.equal(deriveCadenceStepsPerMinute({ leftStepTime: 1 }), 120);
});

test('算法厘米步长换算为报告米单位', () => {
  assert.equal(deriveStepLengthM({ leftStepLength: 60, rightStepLength: 64 }), 0.62);
  assert.equal(deriveStepLengthM({ leftStepLength: 60 }), 0.6);
  assert.equal(deriveStepLengthM({ leftStepLength: 16, rightStepLength: 18.7 }), 0.17);
});

test('左右承重使用完整负荷时序的累计冲量', () => {
  assert.deepEqual(deriveBilateralLoadPercent(measuredGait), {
    leftLoadPercent: 66.7,
    rightLoadPercent: 33.3,
  });
});

test('负荷时序含无效值时不生成左右承重比例', () => {
  assert.equal(deriveBilateralLoadPercent({
    timeSeries: {
      left: { time: [0, 1], load: [100, 'N/A'] },
      right: { time: [0, 1], load: [100, 100] },
    },
  }), null);

  assert.equal(deriveBilateralLoadPercent({
    timeSeries: {
      left: { load: [100, 100, 100] },
      right: { load: [100, 100] },
    },
  }), null);

  assert.equal(deriveBilateralLoadPercent({
    timeSeries: {
      left: { time: [0, 1, 0.5], load: [100, 100, 100] },
      right: { time: [0, 1, 2], load: [100, 100, 100] },
    },
  }), null);
});

test('负荷时序不可用时只接受完整六分区冲量', () => {
  const partition = (impulses) => impulses.map((value) => ({ 冲量: value }));

  assert.deepEqual(deriveBilateralLoadPercent({
    partitionFeatures: {
      left: partition([2, 2, 2, 2, 2, 2]),
      right: partition([1, 1, 1, 1, 1, 1]),
    },
  }), {
    leftLoadPercent: 66.7,
    rightLoadPercent: 33.3,
  });

  assert.equal(deriveBilateralLoadPercent({
    partitionFeatures: {
      left: partition([12]),
      right: partition([6]),
    },
  }), null);

  assert.equal(deriveBilateralLoadPercent({
    partitionFeatures: {
      left: partition([2, 2, 2, 2, 2, 2]),
      right: partition([1, 1, 1, 1, 1, 'N/A']),
    },
  }), null);
});

test('空白分数不是有效的后端百分制结果', () => {
  assert.equal(enrichGaitReportData({ ...measuredGait, score: ' ' }).score, 100);
});

test('增强层把 25 分制评分和实测指标映射到报告结构', () => {
  const result = enrichGaitReportData(measuredGait);
  const mapped = mapGaitReport(record, result);
  const stability = mapped.abilities.find((ability) => ability.id === 'stability');
  const direction = mapped.abilities.find((ability) => ability.id === 'direction');

  assert.equal(result.score, 100);
  assert.equal(result.status, '表现较好');
  assert.equal(mapped.hero.score, result.score);
  assert.equal(mapped.hero.title, '步态综合评分 25 / 25 分');
  assert.deepEqual(mapped.hero.findings, [
    { title: '整体步速 1.05 m/s', icon: 'footprints' },
    { title: '左右步幅差 2 cm', icon: 'scale' },
  ]);
  assert.equal(result.abilities.rhythm.cadenceStepsPerMinute, 120);
  assert.equal(result.abilities.rhythm.stepLengthM, 0.61);
  assert.equal(result.abilities.coordination.leftLoadPercent, 66.7);
  assert.equal(result.abilities.coordination.status, '时空参数基本对称，左侧累计负荷较高');
  assert.equal(result.abilities.stability.foreAftSwayCm, null);
  assert.equal(result.abilities.stability.metricMode, 'stepVariability');
  assert.equal(result.abilities.direction.pathDeviationCm, null);
  assert.equal(result.abilities.direction.metricMode, 'pathDeviation');
  assert.equal(result.abilities.direction.status, '数据不足');
  assert.equal(stability.note, result.abilities.stability.note);
  assert.equal(direction.note, result.abilities.direction.note);
  assert.match(stability.note, /连续交替落脚数据/);
  assert.match(direction.note, /暂不能计算步迹直线稳定性/);
  assert.equal(result.recommendations.length, 3);
  assert.equal(result.recommendations[1].title, '关注左右负荷差异');
  assert.equal(result.tags.length, 3);
  assert.equal(result.tags[1].label, '时空参数基本对称，左侧累计负荷较高');
  assert.equal(result.tags[2].label, '综合评分 100 分');
  assert.match(result.summary.lead, /1\.05 m\/s/);
  assert.equal(result.assessmentSummary.body, result.summary.lead);
  assert.doesNotMatch(result.summary.lead, /1\.05m\/s/);
  assert.doesNotMatch(result.scoreExplanation, /双支撑期/);
  assert.match(result.scoreExplanation, /双支撑时间/);
  assert.match(result.scoreExplanation, /累计足底负荷占比.*未计入当前步态评分/);
});

test('合法后端字段优先，无效字段由实测结果补齐', () => {
  const result = enrichGaitReportData({
    ...measuredGait,
    score: 999,
    status: '后端分级',
    summary: { title: '后端标题', lead: '' },
    abilities: {
      coordination: { leftLoadPercent: 120, rightLoadPercent: -20 },
      rhythm: { cadenceStepsPerMinute: 108, stepLengthM: null },
    },
  });

  assert.equal(result.score, 100);
  assert.equal(result.status, '后端分级');
  assert.equal(result.summary.title, '后端标题');
  assert.match(result.summary.lead, /日常步速约/);
  assert.equal(result.abilities.rhythm.cadenceStepsPerMinute, 108);
  assert.equal(result.abilities.rhythm.stepLengthM, 0.61);
  assert.equal(result.abilities.coordination.leftLoadPercent, 66.7);
  assert.equal(result.abilities.coordination.rightLoadPercent, 33.3);
});

test('历史格式的 25 分制标签和笼统协调状态在展示层按当前格式规整', () => {
  const enriched = enrichGaitReportData({
    ...measuredGait,
    tags: [
      { label: '步速达到参考值', icon: 'footprints' },
      { label: '左右步态基本对称', icon: 'scale' },
      { label: '25 / 25 分', icon: 'check-circle' },
    ],
    abilities: {
      coordination: { status: '基本对称' },
    },
    recommendations: [
      { id: 'walking-practice', title: '保持规律步行', description: '保持练习。', icon: 'walking', tone: 'green' },
      { id: 'symmetry-practice', title: '巩固左右协调', description: '保持协调。', icon: 'stretch', tone: 'orange' },
      { id: 'recovery', title: '运动后及时恢复', description: '及时休息。', icon: 'water', tone: 'blue' },
    ],
  });
  const mapped = mapGaitReport(record, enriched);
  const coordination = mapped.abilities.find((ability) => ability.id === 'coordination');

  assert.equal(coordination.status, '时空参数基本对称，左侧累计负荷较高');
  assert.equal(mapped.hero.tags[1].label, coordination.status);
  assert.equal(mapped.hero.tags[2].label, '综合评分 100 分');
  assert.equal(mapped.recommendations[1].title, '关注左右负荷差异');
});

test('真实算法 fixture 映射为 68 分、60 步每分钟和 0.17 米', () => {
  const fixture = JSON.parse(readFileSync(
    new URL('../public/gait_report_data/report_data.json', import.meta.url),
    'utf8',
  ));
  const result = enrichGaitReportData(fixture);

  assert.equal(result.score, 68);
  assert.equal(result.abilities.rhythm.cadenceStepsPerMinute, 60);
  assert.equal(result.abilities.rhythm.stepLengthM, 0.17);
  assert.equal(result.abilities.stability.metricMode, 'stepVariability');
  assert.equal(result.abilities.stability.status, '数据不足');
  assert.equal(result.abilities.stability.stepTimeCvPercent, null);
  assert.equal(result.abilities.stability.stepDistanceCvPercent, null);
  assert.equal(result.abilities.direction.metricMode, 'pathDeviation');
  assert.equal(result.abilities.direction.status, '数据不足');
  assert.equal(result.abilities.direction.pathDeviationCm, null);
});

test('增强不修改输入且可重复调用', () => {
  const input = structuredClone(measuredGait);
  const snapshot = structuredClone(input);
  const once = enrichGaitReportData(input);
  const twice = enrichGaitReportData(once);

  assert.deepEqual(input, snapshot);
  assert.deepEqual(twice, once);
});

test('mapper 的原始数据兜底采用正确步频和米单位', () => {
  const mapped = mapGaitReport(record, measuredGait);
  const rhythm = mapped.abilities.find((ability) => ability.id === 'rhythm');

  assert.equal(rhythm.cadenceStepsPerMinute, 120);
  assert.equal(rhythm.stepLengthM, 0.61);
});

test('mapper 的步频说明按实际可用的单侧周期标注来源', () => {
  const mapped = mapGaitReport(record, {
    gaitParams: { rightStepTime: 1.2 },
  });
  const cadence = mapped.keyMetrics.find((metric) => metric.id === 'cadence');

  assert.equal(cadence.value, 100);
  assert.equal(cadence.note, '由右脚同脚周期换算');
});

test('mapper 补齐关键实测数据并保持左右脚与算法单位', () => {
  const mapped = mapGaitReport(record, measuredGait);
  const metrics = Object.fromEntries(mapped.keyMetrics.map((metric) => [metric.id, metric]));

  assert.deepEqual(
    Object.keys(metrics),
    ['speed', 'cadence', 'cycleTime', 'stepLength', 'stepWidth', 'doubleContactTime', 'fpa'],
  );
  assert.deepEqual(metrics.speed, {
    id: 'speed', label: '整体步速', value: 1.05, unit: 'm/s', tone: 'green',
  });
  assert.equal(metrics.cadence.value, 120);
  assert.equal(metrics.cadence.unit, '步/分钟');
  assert.equal(metrics.cadence.note, '由左右同脚周期换算');
  assert.deepEqual(
    { left: metrics.cycleTime.left, right: metrics.cycleTime.right, unit: metrics.cycleTime.unit },
    { left: 1, right: 1, unit: 's' },
  );
  assert.deepEqual(metrics.cycleTime.supplement, {
    label: '对侧步时', value: 0.52, unit: 's',
  });
  assert.deepEqual(
    { left: metrics.stepLength.left, right: metrics.stepLength.right, unit: metrics.stepLength.unit },
    { left: 60, right: 62, unit: 'cm' },
  );
  assert.deepEqual(metrics.stepLength.supplement, {
    label: '对侧步长', value: 30.5, unit: 'cm',
  });
  assert.equal(metrics.stepWidth.value, 10);
  assert.equal(metrics.doubleContactTime.value, 0.25);
  assert.equal(metrics.doubleContactTime.label, '估算双脚同时着地时间');
  assert.match(metrics.doubleContactTime.note, /算法比例估算.*非直接测量/);
  assert.deepEqual(
    { left: metrics.fpa.left, right: metrics.fpa.right, unit: metrics.fpa.unit },
    { left: 5, right: 7, unit: '°' },
  );
});

test('mapper 将当前 Python 平衡指标明确映射为足内外侧力差', () => {
  const mapped = mapGaitReport(record, {
    ...measuredGait,
    balance: {
      left: {
        整足平衡: { 峰值: '85.34', 均值: '42.12', 标准差: '12.56' },
        前足平衡: { 峰值: '45.21', 均值: '22.14', 标准差: 'N/A' },
      },
      right: {
        足跟平衡: { 峰值: '38.91', 均值: '19.04', 标准差: '5.84' },
      },
    },
  });
  const balance = mapped.medialLateralBalance;

  assert.equal(balance.title, '足内外侧力差');
  assert.match(balance.description, /不是足底总压力/);
  assert.equal(balance.unit, 'N');
  assert.deepEqual(balance.rows[0].left, {
    peak: 85.3,
    mean: 42.1,
    standardDeviation: 12.6,
  });
  assert.equal(balance.rows[1].left.standardDeviation, null);
  assert.deepEqual(balance.rows[2].right, {
    peak: 38.9,
    mean: 19,
    standardDeviation: 5.8,
  });
  assert.deepEqual(balance.rows[2].left, {
    peak: null,
    mean: null,
    standardDeviation: null,
  });
});

test('旧前端来源的 balance 使用中性分区统计语义和原始值单位', () => {
  const mapped = mapGaitReport(record, {
    ...measuredGait,
    _generated: true,
    balance: {
      left: {
        整足平衡: { 峰值: '85.34', 均值: '42.12', 标准差: '12.56' },
      },
      right: {},
    },
  });

  assert.equal(mapped.medialLateralBalance.title, '足底分区统计');
  assert.doesNotMatch(mapped.medialLateralBalance.title, /内外侧|力差/);
  assert.equal(mapped.medialLateralBalance.unit, '原始值');
  assert.match(mapped.medialLateralBalance.description, /整足、前足和足跟/);
});

test('关键实测数据不把缺失值变成 0，零度 FPA 保留为有效值', () => {
  const mapped = mapGaitReport(record, {
    gaitParams: {
      leftStepTime: 1,
      rightStepTime: 'N/A',
      crossStepTime: 'N/A',
      leftStepLength: 60,
      rightStepLength: null,
      crossStepLength: null,
      stepWidth: '',
      doubleContactTime: 'N/A',
      leftFPA: '-0.0',
      rightFPA: null,
    },
    balance: { left: {}, right: {} },
  });
  const metrics = Object.fromEntries(mapped.keyMetrics.map((metric) => [metric.id, metric]));

  assert.equal(metrics.speed.value, null);
  assert.equal(metrics.cycleTime.left, 1);
  assert.equal(metrics.cycleTime.right, null);
  assert.equal(metrics.cadence.note, '由左脚同脚周期换算');
  assert.equal(metrics.cycleTime.supplement.value, null);
  assert.equal(metrics.stepLength.right, null);
  assert.equal(metrics.stepLength.supplement.value, null);
  assert.equal(metrics.stepWidth.value, null);
  assert.equal(metrics.doubleContactTime.value, null);
  assert.equal(Object.is(metrics.fpa.left, -0) || metrics.fpa.left === 0, true);
  assert.equal(metrics.fpa.right, null);
  assert.equal(mapped.medialLateralBalance, null);
});

test('综合报告与步态详情使用相同分数、步频和米单位', () => {
  const enriched = enrichGaitReportData(measuredGait);
  const overview = mapGaitAssessment({
    completed: true,
    report: { reportData: enriched },
  });

  assert.equal(overview.score, 100);
  assert.equal(overview.metrics.find((metric) => metric.label === '同脚步幅').value, '0.61');
  assert.equal(overview.metrics.find((metric) => metric.label === '步频').value, '120');
  assert.equal(overview.status.label, enriched.status);
  assert.match(overview.insight, /步速 1\.05 m\/s/);
  assert.match(overview.insight, /平均同脚步幅 0\.61 m/);
  assert.match(enriched.abilities.rhythm.note, /平均同脚步幅约 0\.61 m/);
  assert.match(enriched.scoreExplanation, /同脚步幅\/步宽合理性/);
  assert.match(overview.insight, /步频 120 步\/分/);
});

test('综合报告的低分步态结论不再使用写死的良好文案', () => {
  const enriched = enrichGaitReportData({
    gaitParams: {
      leftStepTime: 1.4,
      rightStepTime: 2,
      leftStepLength: 35,
      rightStepLength: 45,
      walkingSpeed: 0.5,
    },
  });
  const overview = mapGaitAssessment({
    completed: true,
    report: { reportData: enriched },
  });

  assert.ok(overview.score < 80);
  assert.equal(overview.status.label, enriched.status);
  assert.match(overview.insight, /步速 0\.50 m\/s/);
  assert.doesNotMatch(overview.insight, /步速、步幅和对称性良好/);
});

test('步速缺失但同脚周期或步长有效时仍可展示部分报告', () => {
  const partial = {
    gaitParams: {
      walkingSpeed: 'N/A',
      leftStepTime: '1.2',
      rightStepLength: '55',
    },
  };
  const mapped = mapGaitReport(record, partial);
  const enriched = enrichGaitReportData(partial);

  assert.ok(mapped);
  assert.equal(mapped.walkingSpeed, null);
  const rhythm = mapped.abilities.find((ability) => ability.id === 'rhythm');
  assert.equal(rhythm.cadenceStepsPerMinute, 100);
  assert.equal(rhythm.status, '已测量');
  assert.match(rhythm.note, /步频约 100/);
  assert.equal(enriched.score, null);
  assert.equal(enriched.status, '数据不足');
  assert.match(enriched.summary.lead, /暂不生成综合评分/);
  assert.deepEqual(enriched.details.breakdown, []);
  const overview = mapGaitAssessment({
    completed: true,
    report: { reportData: enriched },
  });
  assert.equal(overview.available, true);
  assert.equal(overview.score, null);
  assert.equal(overview.status.label, '数据不足');
  assert.equal(overview.metrics.find((metric) => metric.label === '步频').value, '100');
});

test('有步速但双侧时空参数不完整时也不生成评分', () => {
  const result = enrichGaitReportData({
    gaitParams: { walkingSpeed: 0.9, leftStepLength: 50 },
  });
  assert.equal(result.score, null);
  assert.equal(result.status, '数据不足');
  assert.doesNotMatch(result.summary.lead, /左右步态存在不对称/);
});

test('缺少步速时仍按完整双侧时空参数判断协调性', () => {
  const result = enrichGaitReportData({
    gaitParams: {
      leftStepTime: 1,
      rightStepTime: 1.05,
      leftStepLength: 60,
      rightStepLength: 62,
    },
  });

  assert.equal(result.score, null);
  assert.equal(result.abilities.coordination.status, '时空参数基本对称');
  const mapped = mapGaitReport(record, result);
  const coordination = mapped.abilities.find((ability) => ability.id === 'coordination');
  assert.equal(coordination.status, '时空参数基本对称');
  assert.equal(coordination.subtitle, '累计足底负荷与双侧时空参数');
  assert.match(coordination.note, /同脚步幅差 2 cm/);
});

test('没有任何有效步态时空参数时 mapper 保持空报告', () => {
  assert.equal(mapGaitReport(record, { gaitParams: {} }), null);
});

test('Hero 左右两种分制始终来自同一份百分制评分', () => {
  const enriched = enrichGaitReportData({ ...measuredGait, score: 42 });
  const mapped = mapGaitReport(record, enriched);

  assert.equal(enriched.details.scoreSummary.total, 25);
  assert.equal(mapped.hero.score, 42);
  assert.equal(mapped.hero.title, '步态综合评分 10.5 / 25 分');
});

test('Python 的 N/A 与 null 可选参数采用相同评分口径', () => {
  const requiredParams = {
    leftStepTime: '1.00',
    rightStepTime: '1.00',
    crossStepTime: '0.52',
    leftStepLength: '60.0',
    rightStepLength: '62.0',
    crossStepLength: '30.5',
    walkingSpeed: '1.05',
  };
  const optionalKeys = ['stepWidth', 'leftFPA', 'rightFPA', 'doubleContactTime'];
  const withOptional = (value) => enrichGaitReportData({
    gaitParams: {
      ...requiredParams,
      ...Object.fromEntries(optionalKeys.map((key) => [key, value])),
    },
  });

  const nullResult = withOptional(null);
  const pythonMissingResult = withOptional('N/A');

  assert.equal(nullResult.score, 96);
  assert.equal(pythonMissingResult.score, nullResult.score);
  assert.deepEqual(pythonMissingResult.details.breakdown, nullResult.details.breakdown);
  optionalKeys.forEach((key) => {
    assert.equal(pythonMissingResult.gaitParams[key], null);
  });
});

test('mapper 规整浮点长尾且不把缺失值变成 0', () => {
  const mapped = mapGaitReport(record, {
    gaitParams: {
      walkingSpeed: 1.1699999570846558,
      leftStepTime: 1.132999999999,
      rightStepTime: 1.044000000001,
      leftStepLength: 109.19999694824219,
      rightStepLength: 109.9000015258789,
    },
    score: 83.999999999,
    peerComparison: {
      percentile: 74.399999999,
      sampleSize: 11.999999999,
    },
    assessmentSummary: {
      changeScore: 2.999999999,
    },
    abilities: {
      stability: {
        foreAftSwayCm: 1.234999999,
        lateralSwayCm: null,
        swayScaleMaxCm: 5.678999999,
      },
      coordination: {
        leftLoadPercent: 40.19999923706055,
        rightLoadPercent: 59.80000076293945,
      },
      rhythm: {
        cadenceStepsPerMinute: 109.999999999,
        stepLengthM: 1.099999999,
        cadenceRange: { min: 89.999999999, max: 120.000000001 },
        stepLengthRange: { min: 0.599999999, max: 0.800000001 },
      },
      direction: {
        pathDeviationCm: null,
        deviationScaleMaxCm: null,
      },
    },
  });
  const stability = mapped.abilities.find((ability) => ability.id === 'stability');
  const coordination = mapped.abilities.find((ability) => ability.id === 'coordination');
  const rhythm = mapped.abilities.find((ability) => ability.id === 'rhythm');
  const direction = mapped.abilities.find((ability) => ability.id === 'direction');

  assert.equal(mapped.walkingSpeed, 1.17);
  assert.equal(mapped.hero.score, 84);
  assert.equal(mapped.hero.peerPercentile, 74.4);
  assert.equal(mapped.hero.peerSampleSize, 12);
  assert.equal(mapped.summary.changeScore, 3);
  assert.equal(stability.foreAftSwayCm, 1.23);
  assert.equal(stability.lateralSwayCm, null);
  assert.equal(stability.swayScaleMaxCm, 5.68);
  assert.equal(stability.lateralProgressPercent, null);
  assert.equal(coordination.leftLoadPercent, 40.2);
  assert.equal(coordination.rightLoadPercent, 59.8);
  assert.equal(rhythm.cadenceStepsPerMinute, 110);
  assert.equal(rhythm.stepLengthM, 1.1);
  assert.deepEqual(rhythm.cadenceRange, { min: 90, max: 120 });
  assert.deepEqual(rhythm.stepLengthRange, { min: 0.6, max: 0.8 });
  assert.equal(direction.pathDeviationCm, null);
  assert.equal(direction.deviationScaleMaxCm, null);
  assert.equal(direction.deviationProgressPercent, null);
});

test('方向控制使用 Python 足印拟合结果并显示均方根、最大偏移和有效落脚数', () => {
  const result = enrichGaitReportData({
    ...measuredGait,
    directionControl: {
      scope: 'plantar_footpath_straightness_proxy',
      reference: 'parallel_footprint_centerlines',
      pathDeviationRmsCm: 0.6349,
      maxPathDeviationCm: 1.405,
      sampleCount: 8,
      forwardSpanCm: 56.24,
      quality: { valid: true, reason: null },
    },
  });
  const direction = mapGaitReport(record, result).abilities.find((item) => item.id === 'direction');

  assert.equal(result.abilities.direction.status, '已测量');
  assert.equal(result.abilities.direction.pathDeviationCm, 0.63);
  assert.equal(result.abilities.direction.maxPathDeviationCm, 1.41);
  assert.equal(direction.pathDeviationCm, 0.63);
  assert.equal(direction.maxPathDeviationCm, 1.41);
  assert.equal(direction.validStepCount, 8);
  assert.equal(direction.forwardSpanCm, 56.2);
  assert.equal(direction.status, '已测量');
  assert.match(direction.note, /偏移越小/);
});

test('方向控制保留有效零偏移，质量无效时不显示算法数值', () => {
  const zero = enrichGaitReportData({
    ...measuredGait,
    directionControl: {
      pathDeviationRmsCm: 0,
      maxPathDeviationCm: 0,
      sampleCount: 6,
      forwardSpanCm: 40,
      quality: { valid: true, reason: null },
    },
  });
  const zeroDirection = mapGaitReport(record, zero).abilities.find((item) => item.id === 'direction');
  assert.equal(zeroDirection.pathDeviationCm, 0);
  assert.equal(zeroDirection.maxPathDeviationCm, 0);
  assert.equal(zeroDirection.status, '已测量');

  const invalid = enrichGaitReportData({
    ...measuredGait,
    directionControl: {
      pathDeviationRmsCm: 0.4,
      maxPathDeviationCm: 0.8,
      sampleCount: 4,
      quality: { valid: false, reason: 'insufficient_alternating_steps' },
    },
  });
  const invalidDirection = mapGaitReport(record, invalid).abilities.find((item) => item.id === 'direction');
  assert.equal(invalidDirection.pathDeviationCm, null);
  assert.equal(invalidDirection.maxPathDeviationCm, null);
  assert.equal(invalidDirection.status, '数据不足');
  assert.match(invalidDirection.note, /连续左右交替落脚次数不足/);
});

test('行走稳定性使用逐步足印算法的变异系数并保留有效零值', () => {
  const result = enrichGaitReportData({
    ...measuredGait,
    walkingStability: {
      scope: 'step_to_step_footprint_consistency',
      stepTimeCvPercent: 0,
      stepDistanceCvPercent: 4.376,
      sampleCount: 6,
      intervalCount: 5,
      quality: { valid: true, reason: null, confidence: 'standard' },
    },
  });
  const stability = mapGaitReport(record, result).abilities.find((item) => item.id === 'stability');

  assert.equal(result.abilities.stability.metricMode, 'stepVariability');
  assert.equal(result.abilities.stability.stepTimeCvPercent, 0);
  assert.equal(result.abilities.stability.stepDistanceCvPercent, 4.38);
  assert.equal(stability.metricMode, 'stepVariability');
  assert.equal(stability.stepTimeCvPercent, 0);
  assert.equal(stability.stepDistanceCvPercent, 4.38);
  assert.equal(stability.variabilityScaleMax, 20);
  assert.equal(stability.status, '已测量');
  assert.match(stability.note, /连续落脚越一致/);
});

test('四次交替落脚的稳定性和方向控制明确标记样本有限', () => {
  const result = enrichGaitReportData({
    ...measuredGait,
    walkingStability: {
      stepTimeCvPercent: 3.2,
      stepDistanceCvPercent: 5.4,
      sampleCount: 4,
      intervalCount: 3,
      quality: { valid: true, reason: null, confidence: 'limited' },
    },
    directionControl: {
      pathDeviationRmsCm: 0.4,
      maxPathDeviationCm: 0.9,
      sampleCount: 4,
      forwardSpanCm: 28,
      quality: { valid: true, reason: null, confidence: 'limited' },
    },
  });
  const mapped = mapGaitReport(record, result);
  const stability = mapped.abilities.find((item) => item.id === 'stability');
  const direction = mapped.abilities.find((item) => item.id === 'direction');

  assert.equal(stability.status, '样本有限');
  assert.equal(direction.status, '样本有限');
  assert.match(stability.note, /样本量有限/);
  assert.match(direction.note, /样本量有限/);
});

test('脚印行走图保留峰值帧、步序和同一坐标比例', () => {
  const footprintTrail = {
    sensorSize: [80, 24],
    sensorPitchMm: 14,
    steps: [
      {
        frameIndex: 2,
        isRight: false,
        isBaseline: true,
        stepIndex: null,
        stepLabel: '起始左脚',
        origin: [3, 1],
        center: [4, 2],
        matrix: [[0, 2, 0], [1, 5, 1]],
        peakLoadN: 9,
        peakSensorForceN: 5,
      },
      {
        frameIndex: 12,
        isRight: true,
        isBaseline: false,
        stepIndex: 1,
        stepLabel: '第1步右脚',
        origin: [15, 20],
        center: [16, 21],
        matrix: [[0, 3, 0], [2, 8, 2]],
        peakLoadN: 15,
        peakSensorForceN: 8,
      },
      {
        frameIndex: 22,
        isRight: false,
        isBaseline: false,
        stepIndex: 2,
        stepLabel: '第2步左脚',
        origin: [3, 40],
        center: [4, 41],
        matrix: [[0, 4, 0], [2, 9, 2]],
        peakLoadN: 17,
        peakSensorForceN: 9,
      },
    ],
    stepCount: 2,
    baselineCount: 1,
    quality: { valid: true, reason: null },
  };
  const snapshot = structuredClone(footprintTrail);
  const mapped = mapGaitReport(record, enrichGaitReportData({
    ...measuredGait,
    footprintTrail,
  }));

  assert.equal(mapped.footprintTrail.available, true);
  assert.equal(mapped.footprintTrail.stepCount, 2);
  assert.equal(mapped.footprintTrail.baselineCount, 1);
  assert.equal(mapped.footprintTrail.sensorPitchCm, 1.4);
  assert.deepEqual(mapped.footprintTrail.sensorSize, [80, 24]);
  assert.deepEqual(mapped.footprintTrail.steps.map((step) => step.frameIndex), [2, 12, 22]);
  assert.deepEqual(mapped.footprintTrail.steps[1].origin, [15, 20]);
  assert.deepEqual(mapped.footprintTrail.steps[1].matrix, [[0, 3, 0], [2, 8, 2]]);
  assert.match(mapped.footprintTrail.note, /接触面积峰值帧/);
  assert.deepEqual(footprintTrail, snapshot);
});

test('脚印行走图拒绝非法或历史缺失的峰值矩阵', () => {
  const legacy = mapGaitReport(record, enrichGaitReportData(measuredGait));
  assert.equal(legacy.footprintTrail.available, false);
  assert.equal(legacy.footprintTrail.stepCount, 0);
  assert.match(legacy.footprintTrail.note, /未取得/);

  const invalid = mapGaitReport(record, enrichGaitReportData({
    ...measuredGait,
    footprintTrail: {
      sensorSize: [80, 24],
      sensorPitchMm: 14,
      quality: { valid: true },
      steps: [{
        frameIndex: 1,
        isRight: false,
        isBaseline: false,
        stepIndex: 1,
        origin: [2, 3],
        center: [3, 4],
        matrix: [[0, -1]],
      }],
    },
  }));
  assert.equal(invalid.footprintTrail.available, false);
  assert.deepEqual(invalid.footprintTrail.steps, []);
});

test('脚印行走图拒绝超出传感器边界的足印坐标', () => {
  const result = mapGaitReport(record, enrichGaitReportData({
    ...measuredGait,
    footprintTrail: {
      sensorSize: [80, 24],
      sensorPitchMm: 14,
      quality: { valid: true },
      steps: [{
        frameIndex: 1,
        isRight: true,
        isBaseline: false,
        stepIndex: 1,
        origin: [23, 79],
        center: [23, 79],
        matrix: [[2, 3], [4, 5]],
      }],
    },
  }));

  assert.equal(result.footprintTrail.available, false);
  assert.deepEqual(result.footprintTrail.steps, []);
});

test('缺少逐步算法结果时不使用足偏角替代稳定性或方向控制', () => {
  const result = enrichGaitReportData({
    ...measuredGait,
    gaitParams: {
      ...measuredGait.gaitParams,
      leftFPA: '-2.5° (内收)',
      rightFPA: '6.0° (外展)',
    },
    fpaPerStep: {
      left: [-3, -2, -2.5, -2],
      right: [5, 6, 7, 6],
    },
  });
  const mapped = mapGaitReport(record, result);
  const stability = mapped.abilities.find((item) => item.id === 'stability');
  const direction = mapped.abilities.find((item) => item.id === 'direction');

  assert.equal(result.gaitParams.leftFPA, -2.5);
  assert.equal(result.gaitParams.rightFPA, 6);
  assert.equal(stability.metricMode, 'stepVariability');
  assert.equal(stability.status, '数据不足');
  assert.equal(stability.stepTimeCvPercent, null);
  assert.equal(stability.stepDistanceCvPercent, null);
  assert.equal(direction.metricMode, 'pathDeviation');
  assert.equal(direction.status, '数据不足');
  assert.equal(direction.pathDeviationCm, null);
  assert.equal(direction.maxPathDeviationCm, null);
  assert.doesNotMatch(stability.note, /足偏角/);
  assert.doesNotMatch(direction.note, /足偏角/);
});

test('算法明确判定无效时不使用旧足偏角掩盖数据不足', () => {
  const result = enrichGaitReportData({
    ...measuredGait,
    abilities: {
      stability: {
        metricMode: 'bodySway',
        status: '良好',
        foreAftSwayCm: 1.2,
        lateralSwayCm: 0.8,
      },
      direction: {
        metricMode: 'pathDeviation',
        status: '已测量',
        pathDeviationCm: 0.3,
        maxPathDeviationCm: 0.7,
        validStepCount: 6,
        quality: { valid: true },
      },
    },
    fpaPerStep: { left: [1, 2, 3], right: [1, 2, 3] },
    walkingStability: {
      quality: { valid: false, reason: 'insufficient_alternating_steps' },
    },
    directionControl: {
      quality: { valid: false, reason: 'insufficient_alternating_steps' },
    },
  });

  assert.equal(result.abilities.stability.status, '数据不足');
  assert.equal(result.abilities.stability.stepTimeCvPercent, null);
  assert.equal(result.abilities.direction.status, '数据不足');
  assert.equal(result.abilities.direction.metricMode, 'pathDeviation');
  assert.equal(result.abilities.direction.leftFpaDeg, undefined);

  const mapped = mapGaitReport(record, result);
  const stability = mapped.abilities.find((item) => item.id === 'stability');
  const direction = mapped.abilities.find((item) => item.id === 'direction');
  assert.equal(stability.metricMode, 'stepVariability');
  assert.equal(stability.foreAftSwayCm, null);
  assert.equal(stability.stepTimeCvPercent, null);
  assert.equal(direction.pathDeviationCm, null);
});

test('步态页脚缺省时使用与握力一致的三行声明，并保留合法自定义文本', () => {
  const fallback = mapGaitReport(record, enrichGaitReportData(measuredGait)).footer;
  assert.deepEqual(fallback, {
    tip: '步态可作为行走能力的参考指标，建议结合专业意见安排复测。',
    disclaimer: '免责声明：本报告仅供参考，不能替代专业医疗诊断。如有不适，请及时就医。',
    copyright: '© 矩侨工业 保留所有权利。',
  });

  const custom = mapGaitReport(record, enrichGaitReportData({
    ...measuredGait,
    footer: { tip: '自定义提示', disclaimer: ' ', copyright: '自定义版权' },
  })).footer;
  assert.equal(custom.tip, '自定义提示');
  assert.equal(custom.disclaimer, fallback.disclaimer);
  assert.equal(custom.copyright, '自定义版权');
});
