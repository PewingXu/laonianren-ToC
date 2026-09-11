import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveStandingBilateralLoad,
  deriveStandingCenterControl,
  enrichStandingReportData,
  prepareStandingReportScoreInput,
} from '../src/lib/standingReportEnrich.js';
import { generateFootReport } from '../src/lib/FootAnalysis.js';
import { mapStandingReport } from '../src/reports-v2/features/standing-report/mappers/mapStandingReport.js';
import {
  buildCenterGaugeModel,
  buildWeightRingModel,
  normalizeWeightShares,
} from '../src/reports-v2/features/standing-report/standingVisualMath.js';
import { mapStandingAssessment } from '../src/reports-v2/features/health-overview/mappers/assessmentMappers.js';

function peakFrame(leftValue = 3, rightValue = 1) {
  return Array.from({ length: 4096 }, (_value, index) => (
    index % 64 < 32 ? leftValue : rightValue
  ));
}

function rawFrontendFrame(firstFootValue = 12, secondFootValue = 4) {
  // parseFrameData 会转置原始矩阵，因此处理后的左右脚来自原始上下半区。
  return Array.from({ length: 4096 }, (_value, index) => (
    Math.floor(index / 64) < 32 ? firstFootValue : secondFootValue
  ));
}

test('空站立记录不会触发承重解析或生成评分输入', () => {
  assert.equal(prepareStandingReportScoreInput(null), null);
});

const measuredStanding = {
  arch_features: {
    peak_frame_data: peakFrame(),
    left_foot: { area_index: 0.23, area_type: 'normal' },
    right_foot: { area_index: 0.24, area_type: 'normal' },
  },
  additional_data: {
    left_pressure: { 前足: 0.4, 中足: 0.2, 后足: 0.4 },
    right_pressure: { 前足: 0.35, 中足: 0.25, 后足: 0.4 },
    left_area: { total_area_cm2: 51.2 },
    right_area: { total_area_cm2: 49.8 },
  },
  cop_time_series: {
    path_length: 800,
    contact_area: 120,
    delta_x: 10,
    delta_y: 30,
    // Python 输出单位为 cm；增强层仅在评分副本中换算为 20 mm。
    max_displacement: 2,
    avg_velocity: 10,
  },
  left_cop_trajectory: [[1, 2], [2, 3]],
  right_cop_trajectory: [[4, 40], [5, 41]],
  four_stage_balance_level: 4,
};

// 来自实测站立算法结果，仅保留足弓映射回归所需字段。
const measuredFlatFootArch = {
  arch_features: {
    left_foot: {
      area_index: 0.31006886696301167,
      area_type: '扁平足(flat foot)',
    },
    right_foot: {
      area_index: 0.3008387052036166,
      area_type: '扁平足(flat foot)',
    },
  },
};

const record = {
  id: 'record-1',
  patientName: '测试用户',
  updatedAt: '2026-09-02T10:30:00+08:00',
  assessments: { standing: { assessmentId: 'standing-1' } },
};

test('重心控制优先读取算法契约并保留有效零值', () => {
  const control = deriveStandingCenterControl({
    center_control: {
      scope: 'peak_frame_plantar_cop_proxy',
      reference: 'bilateral_foot_cop_midpoint',
      frame_index: 12,
      lateral_offset_cm: 0,
      longitudinal_offset_cm: 0,
      magnitude_cm: 0,
      lateral_direction: 'centered',
      quality: { valid: true, reason: null },
    },
  });

  assert.equal(control.lateralOffsetCm, 0);
  assert.equal(control.longitudinalOffsetCm, 0);
  assert.equal(control.magnitudeCm, 0);
  assert.equal(control.lateralDirection, 'centered');
  assert.equal(control.status, '已推断');
  assert.match(control.summary, /峰值帧足底压力中心相对双足支撑中点/);
  assert.match(control.summary, /并非直接测得的身体质心/);
});

test('旧报告由峰值帧三个 COP 点迁移重心偏移且显式无效结果不回退', () => {
  const legacy = {
    additional_data: {
      cop_results: {
        frame_index: 8,
        left_cop: [10, 10],
        right_cop: [14, 30],
        both_cop: [13, 22],
      },
    },
  };
  const control = deriveStandingCenterControl(legacy);

  assert.equal(control.frameIndex, 8);
  assert.equal(control.lateralOffsetCm, 2.8);
  assert.equal(control.longitudinalOffsetCm, 1.4);
  assert.ok(Math.abs(control.magnitudeCm - (Math.sqrt(5) * 1.4)) < 1e-12);
  assert.equal(control.lateralDirection, 'right');
  assert.equal(control.quality.valid, true);

  const invalid = deriveStandingCenterControl({
    ...legacy,
    center_control: {
      quality: { valid: false, reason: 'missing_cop_points' },
    },
  });
  assert.equal(invalid.quality.valid, false);
  assert.equal(invalid.lateralOffsetCm, null);
  assert.equal(invalid.status, '数据不足');
});

const frontendStanding = {
  left: {
    archAnalysis: { archIndex: 0.23, archType: '正常足弓' },
    footData: { area: 51.2, pressure: 300 },
    regionPressure: {
      forefoot: { percent: 40 },
      midfoot: { percent: 20 },
      hindfoot: { percent: 40 },
    },
  },
  right: {
    archAnalysis: { archIndex: 0.24, archType: '正常足弓' },
    footData: { area: 49.8, pressure: 100 },
    regionPressure: {
      forefoot: { percent: 35 },
      midfoot: { percent: 25 },
      hindfoot: { percent: 40 },
    },
  },
  bilateral: {
    leftPressureRatio: 70,
    rightPressureRatio: 30,
    // 原始帧尚未经过前端算法的旋转/镜像，不能拿它直接按列判断左右。
    peakFrameFlat: peakFrame(1, 3),
    copMetrics: {
      pathLength: 800,
      ellipseArea: 120,
      rangeX: 10,
      rangeY: 30,
      maxDisplacement: 20,
      avgVelocity: 10,
    },
    leftCopTrajectory: [[1, 2], [2, 3]],
    rightCopTrajectory: [[4, 40], [5, 41]],
  },
  scoreInputs: { fourStageLevel: 4 },
};

test('后端峰值帧按左右半区计算承重，前端使用处理后的左右总压力', () => {
  assert.deepEqual(deriveStandingBilateralLoad(measuredStanding), {
    leftPercent: 75,
    rightPercent: 25,
  });
  assert.equal(deriveStandingBilateralLoad({
    arch_features: { peak_frame_data: [1, 2, 3] },
  }), null);
  assert.deepEqual(deriveStandingBilateralLoad({
    left: { footData: { pressure: 100 } },
    right: { footData: { pressure: 100 } },
    bilateral: {
      leftPressureRatio: 60,
      rightPressureRatio: 40,
      peakFrameFlat: peakFrame(1, 3),
    },
  }), { leftPercent: 50, rightPercent: 50 });
  assert.equal(deriveStandingBilateralLoad({
    left: { footData: { pressure: 0 } },
    right: { footData: { pressure: 0 } },
    bilateral: {
      leftPressureRatio: 50,
      rightPressureRatio: 50,
      peakFrameFlat: peakFrame(1, 1),
    },
  }), null);
});

test('真实前端算法结果按处理后坐标确定左右且拒绝全零占位', () => {
  const asymmetric = generateFootReport([rawFrontendFrame(12, 4)]);
  const balanced = generateFootReport([rawFrontendFrame(8, 8)]);
  const empty = generateFootReport([Array(4096).fill(0)]);

  assert.deepEqual(deriveStandingBilateralLoad(asymmetric), {
    leftPercent: 75,
    rightPercent: 25,
  });
  assert.deepEqual(deriveStandingBilateralLoad(balanced), {
    leftPercent: 50,
    rightPercent: 50,
  });
  assert.equal(deriveStandingBilateralLoad(empty), null);
});

test('有效显式承重比例优先并支持 0 到 1 比例', () => {
  const input = {
    ...measuredStanding,
    additional_data: {
      ...measuredStanding.additional_data,
      left_pressure_ratio: 0.48,
      right_pressure_ratio: 0.52,
    },
    arch_features: { ...measuredStanding.arch_features, peak_frame_data: peakFrame() },
  };
  assert.deepEqual(deriveStandingBilateralLoad(input), { leftPercent: 48, rightPercent: 52 });
  assert.equal(enrichStandingReportData(input).score, 100);
});

test('增强层将评分折算为百分制并补齐真实承重和摘要', () => {
  const result = enrichStandingReportData(measuredStanding);
  const mapped = mapStandingReport(record, result);

  assert.equal(result.score, 88);
  assert.equal(result.status, '表现较好');
  assert.equal(mapped.hero.score, result.score);
  assert.equal(mapped.hero.title, '站立综合评分 22 / 25 分');
  assert.deepEqual(mapped.hero.findings, [
    { id: 'stability', title: 'COP 轨迹 80 cm' },
    { id: 'weight', title: '双脚承重差 50%' },
  ]);
  assert.equal(result.metrics.weight.leftPercent, 75);
  assert.equal(result.metrics.weight.rightPercent, 25);
  assert.match(result.summary.lead, /代表侧单足 COP 轨迹总长/);
  assert.match(result.summary.lead, /80 cm/);
  assert.equal(mapped.hero.lead, result.summary.heroLead);
  assert.ok(mapped.hero.lead.length <= 50);
  assert.doesNotMatch(mapped.hero.lead, /核心|增强|四阶段|COP/);
  assert.equal(result.metrics.stability.unit, 'cm');
  assert.match(result.summary.lead, /代表侧单足峰值区间/);
  assert.equal(result.advice.length, 3);
  assert.equal(result.details.scoreSummary.total, 22);
});

test('缺少四阶段平衡结果时在报告可见位置说明保守计分', () => {
  const input = structuredClone(measuredStanding);
  delete input.four_stage_balance_level;

  const result = enrichStandingReportData(input);
  const mapped = mapStandingReport(record, result);
  const notice = '本次未录入四阶段平衡结果，该评分项按中等档保守计分。';

  assert.ok(result.summary.lead.includes(notice));
  assert.ok(result.details.scoreSummary.note.includes(notice));
  assert.ok(!mapped.hero.lead.includes(notice));
  assert.equal(mapped.hero.lead, result.summary.heroLead);
  assert.ok(mapped.summary.evaluation.includes(notice));
});

test('低分来源按真实分项归因，不把正常 COP 稳态和承重写成异常', () => {
  const result = enrichStandingReportData({
    arch_features: {
      left_foot: { area_index: 0.31, area_type: '扁平足(flat foot)' },
      right_foot: { area_index: 0.3, area_type: '扁平足(flat foot)' },
    },
    additional_data: {
      left_pressure_ratio: 53.1,
      right_pressure_ratio: 46.9,
      left_pressure: { 前足: 0.496, 中足: 0.311, 后足: 0.193 },
      right_pressure: { 前足: 0.759, 中足: 0.058, 后足: 0.183 },
    },
    cop_time_series: {
      path_length: 4.4649,
      contact_area: 0,
      delta_x: 0.4525,
      delta_y: 4.4419,
      max_displacement: 0.2232,
      avg_velocity: 93.0187,
    },
  });

  assert.equal(result.score, 60);
  assert.match(result.summary.lead, /轨迹总长约 0\.45 cm/);
  assert.match(result.summary.lead, /COP 按轨迹总长判断为稳态/);
  assert.match(result.summary.lead, /左右承重较均衡/);
  assert.match(result.summary.lead, /足底压力集中/);
  assert.match(result.summary.lead, /双脚扁平足/);
  assert.match(result.summary.lead, /COP 轨迹形态/);
  assert.doesNotMatch(result.summary.lead, /压力中心移动或左右负荷存在需要关注/);
  assert.doesNotMatch(result.summary.lead, /左右承重差异/);
});

test('足弓指数零是有效测量值，不会被 mapper 当成缺失', () => {
  const mapped = mapStandingReport(record, {
    arch_features: {
      left_foot: { area_index: 0 },
      right_foot: { area_index: 0 },
    },
  });

  assert.ok(mapped);
  assert.equal(mapped.details.arch.leftIndex, 0);
  assert.equal(mapped.details.arch.rightIndex, 0);
  assert.equal(mapped.details.arch.leftType, '高弓足');
  assert.equal(mapped.details.arch.rightType, '高弓足');
});

test('足弓类型按原始指数分类，显示值四舍五入不改变临界档位', () => {
  const mapped = mapStandingReport(record, {
    arch_features: {
      left_foot: { area_index: 0.206 },
      right_foot: { area_index: 0.264 },
    },
  });

  assert.equal(mapped.details.arch.leftIndex, 0.21);
  assert.equal(mapped.details.arch.rightIndex, 0.26);
  assert.equal(mapped.details.arch.leftType, '高弓足');
  assert.equal(mapped.details.arch.rightType, '扁平足');
});

test('实测站立算法样本中的扁平足按报告统一术语显示', () => {
  const mapped = mapStandingReport(record, measuredFlatFootArch);
  const support = mapped.metrics.find((metric) => metric.id === 'support');

  assert.equal(mapped.details.arch.leftIndex, 0.31);
  assert.equal(mapped.details.arch.rightIndex, 0.3);
  assert.equal(mapped.details.arch.leftType, '扁平足');
  assert.equal(mapped.details.arch.rightType, '扁平足');
  assert.equal(support.status, '需关注');
  assert.match(support.summary, /双脚足弓需关注/);
});

test('存在有效 COP 上下文时保留零活动面积', () => {
  const mapped = mapStandingReport(record, {
    cop_time_series: {
      path_length: 800,
      contact_area: 0,
      delta_x: 10,
      delta_y: 30,
    },
    left_cop_trajectory: [[1, 2], [2, 3]],
  });
  const stability = mapped.metrics.find((metric) => metric.id === 'stability');

  assert.equal(mapped.details.cop.area, 0);
  assert.equal(stability.value, 80);
  assert.equal(stability.unit, 'cm');
  assert.notEqual(stability.status, '数据不足');
});

test('前端算法回退结构使用已处理左右压力生成同口径报告', () => {
  const result = enrichStandingReportData(frontendStanding);
  const mapped = mapStandingReport(record, result);

  assert.equal(result.score, 88);
  assert.equal(result.metrics.weight.leftPercent, 75);
  assert.equal(result.metrics.weight.rightPercent, 25);
  assert.equal(mapped.details.cop.pathLength, 80);
  assert.equal(mapped.details.cop.area, 1.2);
  assert.equal(mapped.details.cop.lateralRange, 3);
  assert.equal(mapped.details.cop.averageVelocity, 1);
  assert.equal(mapped.details.cop.maxDisplacement, 2);
  assert.deepEqual(mapped.details.pressure.leftRegions, {
    forefoot: 40,
    midfoot: 20,
    hindfoot: 40,
  });
  assert.equal(mapped.details.arch.leftContactArea, 51.2);
  assert.deepEqual(mapped.details.cop.trajectory[0], { x: 2, y: 1, side: 'left' });
  assert.equal(
    result.details.breakdown.find((item) => item.label === 'AP/ML 稳定性').score,
    2,
  );
});

test('旧前端根级 copTimeSeries 保持整体 COP 和毫米评分单位', () => {
  const legacyFrontend = {
    left: frontendStanding.left,
    right: frontendStanding.right,
    bilateral: {
      leftPressureRatio: 70,
      rightPressureRatio: 30,
      leftCopTrajectory: frontendStanding.bilateral.leftCopTrajectory,
      rightCopTrajectory: frontendStanding.bilateral.rightCopTrajectory,
    },
    copTimeSeries: frontendStanding.bilateral.copMetrics,
    scoreInputs: frontendStanding.scoreInputs,
  };
  const result = enrichStandingReportData(legacyFrontend);
  const mapped = mapStandingReport(record, result);

  assert.equal(result.score, 88);
  assert.equal(result.copTimeSeries.maxDisplacement, 20);
  assert.match(result.metrics.stability.summary, /整体 COP/);
  assert.equal(mapped.details.cop.metricScope, 'combined');
  assert.equal(mapped.details.cop.metricSide, null);
});

test('后端最大偏移从 cm 转为 mm 后再评分，且不修改原始报告', () => {
  const input = {
    ...measuredStanding,
    cop_time_series: {
      ...measuredStanding.cop_time_series,
      max_displacement: 3,
    },
  };
  const result = enrichStandingReportData(input);

  assert.equal(input.cop_time_series.max_displacement, 3);
  assert.equal(result.cop_time_series.max_displacement, 3);
  assert.equal(result.details.scoreSummary.total, 20);
  assert.equal(result.score, 80);
  assert.equal(
    result.details.breakdown.find((item) => item.label === 'COP 轨迹形态').score,
    1,
  );
  assert.equal(
    result.details.breakdown.find((item) => item.label === 'AP/ML 稳定性').score,
    1,
  );
});

test('评分三区只优先完整合法的现有字段，否则回退到 additional_data', () => {
  const invalidExisting = enrichStandingReportData({
    ...measuredStanding,
    left_region_pressure: { forefoot: 1, midfoot: 0 },
    right_region_pressure: { forefoot: 1, midfoot: 0 },
  });
  assert.equal(
    invalidExisting.details.breakdown.find((item) => item.label === '足底压力分区合理性').score,
    2,
  );

  const validExisting = enrichStandingReportData({
    ...measuredStanding,
    left_region_pressure: { forefoot: 0.8, midfoot: 0.1, rearfoot: 0.1 },
    right_region_pressure: { forefoot: 0.4, midfoot: 0.2, rearfoot: 0.4 },
  });
  assert.equal(
    validExisting.details.breakdown.find((item) => item.label === '足底压力分区合理性').score,
    0,
  );
});

test('综合报告使用站立评分、实测承重差和 COP 晃动范围', () => {
  const enriched = enrichStandingReportData(measuredStanding);
  const overview = mapStandingAssessment({
    completed: true,
    report: { reportData: enriched },
  });

  assert.equal(overview.score, 88);
  assert.equal(overview.metrics.find((metric) => metric.label === '左右承重差异').value, '50.00');
  assert.equal(overview.metrics.find((metric) => metric.label === '代表侧 COP 摆动范围').value, '30.00');
  assert.equal(overview.status.label, enriched.status);
  assert.match(overview.insight, /左脚承重较多/);
  assert.match(overview.insight, /代表侧单足 COP 最大摆动范围约 30\.0 mm/);
  assert.doesNotMatch(overview.insight, /左脚重心偏移/);
});

test('综合报告不会为均衡承重生成写死的左脚偏移结论', () => {
  const enriched = enrichStandingReportData({
    ...measuredStanding,
    additional_data: {
      ...measuredStanding.additional_data,
      left_pressure_ratio: 50,
      right_pressure_ratio: 50,
    },
  });
  const overview = mapStandingAssessment({
    completed: true,
    report: { reportData: enriched },
  });

  assert.match(overview.insight, /左右承重相差 0\.0%，分布较接近/);
  assert.doesNotMatch(overview.insight, /左脚.*偏移|左脚.*多留意/);
});

test('mapper 使用正确单位、方向和分开的左右轨迹标记', () => {
  const enriched = enrichStandingReportData(measuredStanding);
  const mapped = mapStandingReport(record, enriched);

  assert.equal(mapped.details.cop.pathLength, 80);
  assert.equal(mapped.details.cop.area, 1.2);
  assert.equal(mapped.details.cop.lateralRange, 3);
  assert.equal(mapped.details.cop.longitudinalRange, 1);
  assert.equal(mapped.details.cop.averageVelocity, 1);
  assert.equal(mapped.details.cop.maxDisplacement, 2);
  assert.deepEqual(mapped.details.cop.trajectory[0], { x: 2, y: 1, side: 'left' });
  assert.deepEqual(mapped.details.cop.trajectory[2], { x: 40, y: 4, side: 'right' });
  assert.equal(mapped.details.cop.metricScope, 'representative-foot');
  assert.equal(mapped.details.cop.metricSide, 'left');
  const stability = mapped.metrics.find((metric) => metric.id === 'stability');
  const center = mapped.metrics.find((metric) => metric.id === 'center');
  const weight = mapped.metrics.find((metric) => metric.id === 'weight');
  const support = mapped.metrics.find((metric) => metric.id === 'support');
  assert.equal(stability.title, '站立稳定性');
  assert.equal(stability.description, '站立时保持稳定的能力');
  assert.equal(stability.caption, '代表侧 COP 轨迹总长');
  assert.equal(stability.summary, 'COP 轨迹总长 80 cm。');
  assert.equal(center.description, '重心位置是否接近双脚中心');
  assert.equal(center.summary, '重心偏移数据不足，建议重新检测。');
  assert.equal(weight.description, '左右脚承重是否均衡');
  assert.equal(weight.summary, '左脚 75%，右脚 25%。');
  assert.equal(support.description, '双脚足弓与接触情况');
  assert.equal(support.summary, '双脚足弓正常，支撑状态良好。');
  assert.deepEqual(mapped.details.pressure.leftRegions, {
    forefoot: 40,
    midfoot: 20,
    hindfoot: 40,
  });
  assert.equal(center.lateralOffset, null);
});

test('mapper 补齐 COP 与足型的重要实测数据并按来源换算单位', () => {
  const mapped = mapStandingReport(record, enrichStandingReportData({
    ...measuredStanding,
    arch_features: {
      ...measuredStanding.arch_features,
      left_foot: {
        ...measuredStanding.arch_features.left_foot,
        clarke_angle: 28.4,
        clarke_type: 'normal',
        staheli_ratio: 0.62,
      },
      right_foot: {
        ...measuredStanding.arch_features.right_foot,
        clarke_angle: 24.1,
        clarke_type: 'flat foot',
        staheli_ratio: 0.81,
      },
    },
    additional_data: {
      ...measuredStanding.additional_data,
      left_length: 24.3,
      right_length: 24.6,
      left_width: 9.1,
      right_width: 9.3,
    },
    cop_time_series: {
      ...measuredStanding.cop_time_series,
      rms_displacement: 0.42,
      major_axis: 1.6,
      minor_axis: 0.7,
    },
  }));

  assert.equal(mapped.details.cop.rmsDisplacement, 0.42);
  assert.equal(mapped.details.cop.majorAxis, 1.6);
  assert.equal(mapped.details.cop.minorAxis, 0.7);
  assert.equal(mapped.details.arch.leftLength, 24.3);
  assert.equal(mapped.details.arch.rightWidth, 9.3);
  assert.equal(mapped.details.arch.leftClarkeAngle, 28.4);
  assert.equal(mapped.details.arch.rightClarkeType, '扁平足');
  assert.equal(mapped.details.arch.leftStaheliRatio, 0.62);
});

test('足型映射兼容 Staheli 历史字段，并由实测 Clarke 角补充分型', () => {
  const mapped = mapStandingReport(record, enrichStandingReportData({
    ...measuredStanding,
    arch_features: {
      ...measuredStanding.arch_features,
      left_foot: {
        ...measuredStanding.arch_features.left_foot,
        clarke_angle: 27.4,
        clarke_type: null,
        staheli_index: 1.04,
      },
      right_foot: {
        ...measuredStanding.arch_features.right_foot,
        clarke_angle: 42.8,
        clarke_type: null,
        staheliIndex: 0.67,
      },
    },
  }));

  assert.equal(mapped.details.arch.leftClarkeType, '扁平足');
  assert.equal(mapped.details.arch.rightClarkeType, '正常足弓');
  assert.equal(mapped.details.arch.leftStaheliRatio, 1.04);
  assert.equal(mapped.details.arch.rightStaheliRatio, 0.67);
});

test('站立报告过滤明显不可信的足部尺寸，同时保留合理测量值', () => {
  const mapped = mapStandingReport(record, enrichStandingReportData({
    ...measuredStanding,
    additional_data: {
      ...measuredStanding.additional_data,
      left_length: 15.5,
      left_width: 15.5,
      right_length: 28.1,
      right_width: 44.9,
    },
  }));

  assert.equal(mapped.details.arch.leftLength, 15.5);
  assert.equal(mapped.details.arch.leftWidth, null);
  assert.equal(mapped.details.arch.rightLength, 28.1);
  assert.equal(mapped.details.arch.rightWidth, null);
});

test('承重环使用真实左右比例，拒绝缺失或无效输入', () => {
  assert.deepEqual(normalizeWeightShares(53.1, 46.9), { left: 53.1, right: 46.9 });
  assert.deepEqual(normalizeWeightShares(8, 2), { left: 80, right: 20 });
  assert.equal(normalizeWeightShares(null, 100), null);
  assert.equal(normalizeWeightShares(0, 0), null);

  assert.deepEqual(buildWeightRingModel(53.1, 46.9), {
    hasValue: true,
    leftShare: 53.1,
    rightShare: 46.9,
    leftDashoffset: -46.9,
    rightDashoffset: 0,
  });
  assert.deepEqual(buildWeightRingModel(null, 100), {
    hasValue: false,
    leftShare: 0,
    rightShare: 0,
    leftDashoffset: 0,
    rightDashoffset: 0,
  });
});

test('重心仪表动态扩展对称量程，缺失时不生成指针', () => {
  const missing = buildCenterGaugeModel(null);
  assert.equal(missing.hasValue, false);
  assert.equal(missing.needlePath, null);
  assert.deepEqual(missing.ticks, [-2, -1, 0, 1, 2]);

  const outOfBaseRange = buildCenterGaugeModel(3.2);
  assert.equal(outOfBaseRange.hasValue, true);
  assert.equal(outOfBaseRange.limit, 4);
  assert.deepEqual(outOfBaseRange.ticks, [-4, -2, 0, 2, 4]);
  assert.ok(outOfBaseRange.tip.x > 125);
  assert.ok(outOfBaseRange.tip.y > 59 && outOfBaseRange.tip.y < 133);

  const centered = buildCenterGaugeModel(0);
  assert.equal(centered.tip.x, 125);
  assert.equal(centered.tip.y, 59);
});

test('mapper 将重心偏移代理放入核心指标和详情契约', () => {
  const enriched = enrichStandingReportData({
    ...measuredStanding,
    center_control: {
      scope: 'peak_frame_plantar_cop_proxy',
      reference: 'bilateral_foot_cop_midpoint',
      frame_index: 193,
      lateral_offset_cm: -1.234,
      longitudinal_offset_cm: 0.106,
      magnitude_cm: 1.239,
      lateral_direction: 'left',
      quality: { valid: true, reason: null },
    },
  });
  const mapped = mapStandingReport(record, enriched);
  const center = mapped.metrics.find((metric) => metric.id === 'center');

  assert.equal(center.lateralOffset, -1.23);
  assert.equal(center.longitudinalOffset, 0.11);
  assert.equal(center.magnitude, 1.24);
  assert.equal(center.lateralDirection, 'left');
  assert.equal(center.status, '已推断');
  assert.equal(center.summary, '向左偏移 1.23 cm，前后偏移 0.11 cm。');
  assert.doesNotMatch(center.summary, /并非直接测得的身体质心/);
  assert.match(mapped.details.centerControl.summary, /峰值帧足底压力中心相对双足支撑中点/);
  assert.match(mapped.details.centerControl.summary, /并非直接测得的身体质心/);
  assert.deepEqual(mapped.details.centerControl, {
    lateralOffset: -1.23,
    longitudinalOffset: 0.11,
    magnitude: 1.24,
    lateralDirection: 'left',
    scope: 'peak_frame_plantar_cop_proxy',
    reference: 'bilateral_foot_cop_midpoint',
    frameIndex: 193,
    quality: { valid: true, reason: null },
    status: '已推断',
    summary: enriched.metrics.center.summary,
  });
});

test('代表侧按原始轨迹长度选择，不受 1200 点展示上限影响', () => {
  const trajectory = (count) => Array.from({ length: count }, (_value, index) => [index, index + 1]);
  const mapped = mapStandingReport(record, {
    ...measuredStanding,
    left_cop_trajectory: trajectory(1201),
    right_cop_trajectory: trajectory(1202),
  });

  assert.equal(mapped.details.cop.trajectory.filter((point) => point.side === 'left').length, 1200);
  assert.equal(mapped.details.cop.trajectory.filter((point) => point.side === 'right').length, 1200);
  assert.equal(mapped.details.cop.trajectory.length, 2400);
  assert.equal(mapped.details.cop.metricSide, 'right');
});

test('驼峰后端 COP 字段和空对象使用一致的指标范围', () => {
  const camelCaseReport = {
    ...measuredStanding,
    cop_time_series: {},
    copTimeSeries: {
      pathLength: 800,
      contactArea: 120,
      deltaX: 10,
      deltaY: 30,
      maxDisplacement: 2,
      avgVelocity: 10,
    },
  };
  const enriched = enrichStandingReportData(camelCaseReport);
  const mapped = mapStandingReport(record, enriched);

  assert.match(enriched.metrics.stability.summary, /代表侧单足 COP/);
  assert.equal(enriched.score, 88);
  assert.equal(enriched.details.scoreSummary.total, 22);
  assert.equal(mapped.details.cop.metricScope, 'representative-foot');

  const displaced = enrichStandingReportData({
    ...camelCaseReport,
    copTimeSeries: { ...camelCaseReport.copTimeSeries, maxDisplacement: 3 },
  });
  assert.equal(displaced.copTimeSeries.maxDisplacement, 3);
  assert.equal(displaced.score, 80);
  assert.equal(
    displaced.details.breakdown.find((item) => item.label === 'COP 轨迹形态').score,
    1,
  );

  const emptyBackendCop = mapStandingReport(record, {
    bilateral: {
      copMetrics: { pathLength: 800, ellipseArea: 120 },
      leftCopTrajectory: [[1, 2]],
      rightCopTrajectory: [[3, 4]],
    },
    cop_time_series: {},
    copTimeSeries: {},
  });
  assert.equal(emptyBackendCop.details.cop.metricScope, 'combined');
  assert.equal(emptyBackendCop.details.cop.metricSide, null);
  assert.equal(emptyBackendCop.metrics.find((metric) => metric.id === 'stability').caption, 'COP 轨迹总长');
});

test('三区比例不完整或总和无效时保持数据不足', () => {
  const mapped = mapStandingReport(record, {
    ...measuredStanding,
    additional_data: {
      left_pressure: { 前足: 0, 中足: 0, 后足: 0 },
      right_pressure: { 前足: 0.5, 中足: 0.5 },
    },
  });

  assert.deepEqual(mapped.details.pressure.leftRegions, {
    forefoot: null,
    midfoot: null,
    hindfoot: null,
  });
  assert.deepEqual(mapped.details.pressure.rightRegions, {
    forefoot: null,
    midfoot: null,
    hindfoot: null,
  });
});

test('增强不修改输入且重复调用结果一致', () => {
  const input = structuredClone(measuredStanding);
  const snapshot = structuredClone(input);
  const once = enrichStandingReportData(input);
  const twice = enrichStandingReportData(once);

  assert.deepEqual(input, snapshot);
  assert.deepEqual(twice, once);
});

test('已有合法报告字段保持优先', () => {
  const result = enrichStandingReportData({
    ...measuredStanding,
    score: 42,
    status: '后端分级',
    evaluation: '后端评价',
    summary: { title: '后端标题', lead: '后端摘要' },
    metrics: {
      weight: {
        leftPercent: 48,
        rightPercent: 52,
        status: '后端状态',
        summary: '后端承重摘要',
      },
    },
  });

  assert.equal(result.score, 42);
  assert.equal(result.status, '后端分级');
  assert.equal(result.evaluation, '后端评价');
  assert.equal(result.summary.title, '后端标题');
  assert.equal(result.summary.lead, '后端摘要');
  assert.equal(result.metrics.weight.leftPercent, 48);
  assert.equal(result.metrics.weight.summary, '后端承重摘要');

  const mapped = mapStandingReport(record, result);
  assert.equal(mapped.hero.score, 42);
  assert.equal(mapped.hero.title, '站立综合评分 10.5 / 25 分');
  assert.equal(mapped.hero.lead, result.summary.heroLead);
});

test('mapper 优先使用简短首图说明并补齐握力同款三行声明', () => {
  const mapped = mapStandingReport(record, {
    ...measuredStanding,
    summary: {
      title: '站立报告',
      heroLead: '简短首图结论。',
      lead: '这里保留完整、详细的算法说明。',
    },
    footer: { tip: '自定义站立提示。' },
  });

  assert.equal(mapped.hero.lead, '简短首图结论。');
  assert.deepEqual(mapped.footer, {
    tip: '自定义站立提示。',
    disclaimer: '免责声明：本报告仅供参考，不能替代专业医疗诊断。如有不适，请及时就医。',
    copyright: '© 矩侨工业 保留所有权利。',
  });
});

test('无效报告字段和非数值峰值不会覆盖真实派生结果', () => {
  const invalidPeak = peakFrame();
  invalidPeak[0] = 'N/A';
  assert.equal(deriveStandingBilateralLoad({
    arch_features: { peak_frame_data: invalidPeak },
  }), null);

  const result = enrichStandingReportData({
    ...measuredStanding,
    score: 'N/A',
    status: ' ',
    advice: [],
    metrics: { weight: { leftPercent: 120, rightPercent: -20 } },
  });
  assert.equal(result.score, 88);
  assert.equal(result.status, '表现较好');
  assert.equal(result.metrics.weight.leftPercent, 75);
  assert.equal(result.metrics.weight.rightPercent, 25);
  assert.equal(result.advice.length, 3);
});

test('缺少可靠左右承重时不按默认 50/50 生成评分或均衡结论', () => {
  const result = enrichStandingReportData({
    ...measuredStanding,
    arch_features: {
      ...measuredStanding.arch_features,
      peak_frame_data: Array(4096).fill(0),
    },
  });
  const mapped = mapStandingReport(record, result);

  assert.equal(result.score, null);
  assert.equal(result.status, '数据不足');
  assert.match(result.summary.lead, /暂不生成综合评分/);
  assert.doesNotMatch(result.summary.lead, /负荷整体较均衡/);
  assert.equal(mapped.hero.hasScore, false);
  assert.equal(mapped.details.pressure.leftPercent, null);
  const overview = mapStandingAssessment({
    completed: true,
    report: { reportData: result },
  });
  assert.equal(overview.available, true);
  assert.equal(overview.score, null);
  assert.equal(overview.status.label, '数据不足');
});

test('算法有效性校验失败时报告保留数据异常状态', () => {
  const result = enrichStandingReportData({
    arch_features: { peak_frame_data: peakFrame(1, 1) },
  });
  const mapped = mapStandingReport(record, result);

  assert.equal(result.score, null);
  assert.equal(result.status, '数据异常');
  assert.equal(mapped.hero.hasScore, false);
  assert.equal(mapped.hero.status, '数据异常');
  const overview = mapStandingAssessment({
    completed: true,
    report: { reportData: result },
  });
  assert.equal(overview.available, true);
  assert.equal(overview.score, null);
  assert.equal(overview.status.label, '数据异常');
});

test('接触面积近似字段不作为左右承重实测值', () => {
  const result = enrichStandingReportData({
    ...measuredStanding,
    arch_features: {
      ...measuredStanding.arch_features,
      peak_frame_data: Array(4096).fill(0),
    },
    bilateral_pressure_ratio: { leftRatio: 50, rightRatio: 50 },
  });
  assert.equal(result.score, null);
  assert.equal(result.metrics.weight.leftPercent, null);
});

test('前端算法的占位 50/50 没有有效左右总压力时保持数据不足', () => {
  const result = enrichStandingReportData({
    bilateral: { leftPressureRatio: 50, rightPressureRatio: 50 },
    left: { archAnalysis: {}, footData: {}, regionPressure: {} },
    right: { archAnalysis: {}, footData: {}, regionPressure: {} },
    scoreInputs: { fourStageLevel: 4 },
  });

  assert.equal(result.score, null);
  assert.equal(result.status, '数据不足');
  assert.equal(result.metrics.weight.leftPercent, null);
  const mapped = mapStandingReport(record, result);
  assert.ok(mapped);
  assert.equal(mapped.hero.hasScore, false);
  assert.equal(mapped.hero.status, '数据不足');
  assert.equal(mapped.details.pressure.leftPercent, null);
});

test('mapper 单独调用时也不把原始占位 bilateral 当作承重实测', () => {
  const mapped = mapStandingReport(record, {
    bilateral: { leftPressureRatio: 50, rightPressureRatio: 50 },
    four_stage_balance_level: 4,
  });

  assert.ok(mapped);
  assert.equal(mapped.details.pressure.leftPercent, null);
  assert.equal(mapped.metrics.find((metric) => metric.id === 'weight').status, '数据不足');
});
