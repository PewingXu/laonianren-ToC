import { finiteOrNull, parseCalendarDate } from '../../health-overview/utils/validators.js';
import {
  representativeStandingCop,
  standingCopMetrics,
} from '../../../../lib/standingCopContract.js';
import { deriveStandingCenterControl } from '../../../../lib/standingReportEnrich.js';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstObject(...values) {
  return values.find(isObject) || {};
}

function firstNonEmptyObject(...values) {
  return values.find((value) => isObject(value) && Object.keys(value).length > 0)
    || firstObject(...values);
}

function textOr(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function nonNegativeOrNull(value) {
  const numeric = finiteOrNull(value);
  return numeric !== null && numeric >= 0 ? numeric : null;
}

function positiveOrNull(value) {
  const numeric = finiteOrNull(value);
  return numeric !== null && numeric > 0 ? numeric : null;
}

function plausibleFootDimensions(lengthValue, widthValue) {
  const rawLength = positiveOrNull(lengthValue);
  const rawWidth = positiveOrNull(widthValue);
  // 宽松的采集几何边界，仅拦截单位、方向或噪声造成的明显异常，不作为临床阈值。
  const length = rawLength !== null && rawLength >= 12 && rawLength <= 36
    ? rawLength
    : null;
  const widthInRange = rawWidth !== null && rawWidth >= 4 && rawWidth <= 18;
  const widthFitsLength = length === null || rawWidth <= length * 0.7;
  return {
    length,
    width: widthInRange && widthFitsLength ? rawWidth : null,
  };
}

function finiteValueOrNull(value) {
  return finiteOrNull(value);
}

function percentOrNull(value) {
  const numeric = finiteOrNull(value);
  return numeric !== null && numeric >= 0 && numeric <= 100 ? numeric : null;
}

function roundTo(value, precision) {
  if (value === null) return null;
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
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

function mapTrajectory(value, side) {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 1200).map((point) => {
    const forwardBack = Array.isArray(point) ? finiteValueOrNull(point[0]) : finiteValueOrNull(point?.x);
    const lateral = Array.isArray(point) ? finiteValueOrNull(point[1]) : finiteValueOrNull(point?.y);
    return forwardBack === null || lateral === null
      ? null
      : { x: lateral, y: forwardBack, side };
  }).filter(Boolean);
}

function ratioPercentOrNull(value) {
  const numeric = finiteOrNull(value);
  return numeric !== null && numeric >= 0 && numeric <= 1
    ? roundTo(numeric * 100, 1)
    : null;
}

function mapRegionPressure(source, usesRatio) {
  const data = isObject(source) ? source : {};
  const convert = usesRatio ? ratioPercentOrNull : percentOrNull;
  const regionValue = (value) => roundTo(convert(
    isObject(value) ? (value.percent ?? value.ratio) : value,
  ), 1);
  const mapped = {
    forefoot: regionValue(data['前足'] ?? data.forefoot),
    midfoot: regionValue(data['中足'] ?? data.midfoot),
    hindfoot: regionValue(data['后足'] ?? data.hindfoot),
  };
  const values = Object.values(mapped);
  const expectedTotal = 100;
  const total = values.every((value) => value !== null)
    ? values.reduce((sum, value) => sum + value, 0)
    : null;
  return total !== null && Math.abs(total - expectedTotal) <= 5
    ? mapped
    : { forefoot: null, midfoot: null, hindfoot: null };
}

function hasRegionPressure(regions) {
  return Object.values(regions).every((value) => value !== null);
}

function mapWeight(value) {
  const data = isObject(value) ? value : {};
  const leftPercent = percentOrNull(
    data.leftPercent ?? data.leftRatio ?? data.leftPressureRatio,
  );
  const rightPercent = percentOrNull(
    data.rightPercent ?? data.rightRatio ?? data.rightPressureRatio,
  );
  const valid = leftPercent !== null
    && rightPercent !== null
    && Math.abs(leftPercent + rightPercent - 100) < 0.001;

  const roundedLeft = valid ? roundTo(leftPercent, 1) : null;
  return valid
    ? { leftPercent: roundedLeft, rightPercent: roundTo(100 - roundedLeft, 1) }
    : { leftPercent: null, rightPercent: null };
}

function mapAdvice(value) {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    if (!isObject(item)) return null;
    const id = textOr(item.id, '');
    const title = textOr(item.title, '');
    const detail = textOr(item.detail, '');
    return id && title && detail ? { id, title, detail } : null;
  }).filter(Boolean).slice(0, 3);
}

const FOOTER_FALLBACKS = {
  tip: '站立能力可作为平衡与下肢控制的参考指标，建议结合专业意见安排复测。',
  disclaimer: '免责声明：本报告仅供参考，不能替代专业医疗诊断。如有不适，请及时就医。',
  copyright: '© 矩侨工业 保留所有权利。',
};

function mapFooter(value) {
  const source = isObject(value) ? value : {};
  return Object.fromEntries(
    Object.entries(FOOTER_FALLBACKS).map(([key, fallback]) => [key, textOr(source[key], fallback)]),
  );
}

function footSources(data, arch, side) {
  const title = side === 'left' ? 'Left' : 'Right';
  const sources = [
    arch[`${side}_foot`],
    arch[`${side}Foot`],
    arch[side],
    data[`${side}_foot`],
    data[`${side}Foot`],
    data[side],
    data[title],
  ].filter(isObject);
  return sources.flatMap((source) => [
    source,
    ...(isObject(source.archAnalysis) ? [source.archAnalysis] : []),
    ...(isObject(source.footData) ? [source.footData] : []),
  ]);
}

function firstFootValue(sources, ...keys) {
  for (const source of sources) {
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null) return source[key];
    }
  }
  return null;
}

function normalizeArchType(value, index) {
  const label = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (label.includes('normal') || label.includes('正常')) return '正常足弓';
  if (label.includes('high') || label.includes('高足弓') || label.includes('高弓')) return '高弓足';
  if (label.includes('flat') || label.includes('扁平')) return '扁平足';
  if (index === null) return '数据不足';
  if (index < 0.21) return '高弓足';
  return index <= 0.26 ? '正常足弓' : '扁平足';
}

function normalizeClarkeType(value, angle) {
  const label = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (label.includes('normal') || label.includes('正常')) return '正常足弓';
  if (label.includes('high') || label.includes('高足弓') || label.includes('高弓')) return '高弓足';
  if (label.includes('flat') || label.includes('扁平')) return '扁平足';

  const numericAngle = nonNegativeOrNull(angle);
  if (numericAngle === null) return '数据不足';
  if (numericAngle < 42) return '扁平足';
  return numericAngle <= 48 ? '正常足弓' : '高弓足';
}

function supportSummary(arch) {
  const available = [
    ['左', arch.leftType],
    ['右', arch.rightType],
  ].filter(([, type]) => type !== '数据不足');
  const abnormal = available.filter(([, type]) => type !== '正常足弓');

  if (available.length === 0) return '足弓数据不足。';
  if (available.length === 1 && abnormal.length === 0) {
    const missingSide = available[0][0] === '左' ? '右' : '左';
    return `${available[0][0]}足正常，${missingSide}足数据不足。`;
  }
  if (abnormal.length === 0) return '双脚足弓正常，支撑状态良好。';
  if (abnormal.length === 1) {
    return `${abnormal[0][0]}足为${abnormal[0][1]}，建议关注。`;
  }
  return '双脚足弓需关注，建议进一步评估。';
}

function mapArch(data, arch, additional) {
  const left = footSources(data, arch, 'left');
  const right = footSources(data, arch, 'right');
  const leftArea = firstObject(additional.left_area, additional.leftArea);
  const rightArea = firstObject(additional.right_area, additional.rightArea);
  const rawLeftIndex = nonNegativeOrNull(
    firstFootValue(left, 'area_index', 'archIndex', 'arch_index'),
  );
  const rawRightIndex = nonNegativeOrNull(
    firstFootValue(right, 'area_index', 'archIndex', 'arch_index'),
  );
  const leftIndex = roundTo(rawLeftIndex, 2);
  const rightIndex = roundTo(rawRightIndex, 2);
  const leftClarkeAngle = nonNegativeOrNull(
    firstFootValue(left, 'clarke_angle', 'clarkeAngle'),
  );
  const rightClarkeAngle = nonNegativeOrNull(
    firstFootValue(right, 'clarke_angle', 'clarkeAngle'),
  );
  const leftDimensions = plausibleFootDimensions(
    additional.left_length
      ?? additional.leftLength
      ?? firstFootValue(left, 'length', 'footLength', 'foot_length'),
    additional.left_width
      ?? additional.leftWidth
      ?? firstFootValue(left, 'width', 'footWidth', 'foot_width'),
  );
  const rightDimensions = plausibleFootDimensions(
    additional.right_length
      ?? additional.rightLength
      ?? firstFootValue(right, 'length', 'footLength', 'foot_length'),
    additional.right_width
      ?? additional.rightWidth
      ?? firstFootValue(right, 'width', 'footWidth', 'foot_width'),
  );

  return {
    leftIndex,
    rightIndex,
    leftType: normalizeArchType(
      firstFootValue(left, 'area_type', 'archType', 'arch_type'),
      rawLeftIndex,
    ),
    rightType: normalizeArchType(
      firstFootValue(right, 'area_type', 'archType', 'arch_type'),
      rawRightIndex,
    ),
    leftContactArea: roundTo(positiveOrNull(
      leftArea.total_area_cm2
      ?? leftArea.totalAreaCm2
      ?? firstFootValue(left, 'totalArea', 'contactArea', 'area'),
    ), 2),
    rightContactArea: roundTo(positiveOrNull(
      rightArea.total_area_cm2
      ?? rightArea.totalAreaCm2
      ?? firstFootValue(right, 'totalArea', 'contactArea', 'area'),
    ), 2),
    leftLength: roundTo(leftDimensions.length, 1),
    rightLength: roundTo(rightDimensions.length, 1),
    leftWidth: roundTo(leftDimensions.width, 1),
    rightWidth: roundTo(rightDimensions.width, 1),
    leftClarkeAngle: roundTo(leftClarkeAngle, 1),
    rightClarkeAngle: roundTo(rightClarkeAngle, 1),
    leftClarkeType: normalizeClarkeType(
      firstFootValue(left, 'clarke_type', 'clarkeType'),
      leftClarkeAngle,
    ),
    rightClarkeType: normalizeClarkeType(
      firstFootValue(right, 'clarke_type', 'clarkeType'),
      rightClarkeAngle,
    ),
    leftStaheliRatio: roundTo(nonNegativeOrNull(
      firstFootValue(left, 'staheli_ratio', 'staheliRatio', 'staheli_index', 'staheliIndex'),
    ), 2),
    rightStaheliRatio: roundTo(nonNegativeOrNull(
      firstFootValue(right, 'staheli_ratio', 'staheliRatio', 'staheli_index', 'staheliIndex'),
    ), 2),
  };
}

function buildPressure(data, additional, metrics) {
  const leftFoot = firstObject(data.left, data.leftFoot, data.left_foot);
  const rightFoot = firstObject(data.right, data.rightFoot, data.right_foot);
  const leftRatioSource = firstObject(additional.left_pressure, additional.leftPressure);
  const rightRatioSource = firstObject(additional.right_pressure, additional.rightPressure);
  const leftRegions = Object.keys(leftRatioSource).length
    ? mapRegionPressure(leftRatioSource, true)
    : mapRegionPressure(leftFoot.regionPressure, false);
  const rightRegions = Object.keys(rightRatioSource).length
    ? mapRegionPressure(rightRatioSource, true)
    : mapRegionPressure(rightFoot.regionPressure, false);
  const copResults = firstObject(additional.cop_results, additional.copResults);
  // 原始前端算法在无压力时会带占位 50/50；只接受增强层校验后的报告字段。
  const weight = mapWeight(metrics.weight);

  return {
    ...weight,
    leftRegions,
    rightRegions,
    copDistances: {
      left: roundTo(nonNegativeOrNull(
        copResults.dist_left_to_both ?? copResults['左脚COP到整体COP距离(cm)'],
      ), 2),
      right: roundTo(nonNegativeOrNull(
        copResults.dist_right_to_both ?? copResults['右脚COP到整体COP距离(cm)'],
      ), 2),
      leftForward: roundTo(finiteValueOrNull(
        copResults.left_forward ?? copResults['左脚前移量(cm)'],
      ), 2),
    },
  };
}

function centerMetricSummary(lateralOffset, longitudinalOffset) {
  const facts = [];
  if (lateralOffset !== null) {
    if (lateralOffset < 0) facts.push(`向左偏移 ${Math.abs(lateralOffset)} cm`);
    else if (lateralOffset > 0) facts.push(`向右偏移 ${lateralOffset} cm`);
    else facts.push('左右偏移 0 cm');
  }
  if (longitudinalOffset !== null) {
    facts.push(`前后偏移 ${Math.abs(longitudinalOffset)} cm`);
  }
  return facts.length ? `${facts.join('，')}。` : '';
}

function buildMetrics(data, details) {
  const metrics = firstObject(data.metrics);
  const stability = firstObject(metrics.stability);
  const center = firstObject(details.centerControl, metrics.center);
  const weight = details.pressure;
  const support = details.arch;
  const supportText = supportSummary(support);
  const hasBothFeet = support.leftIndex !== null && support.rightIndex !== null;
  const needsAttention = [support.leftType, support.rightType]
    .some((type) => type === '高弓足' || type === '扁平足');
  const pathLength = details.cop.pathLength;
  const lateralOffset = roundTo(finiteValueOrNull(center.lateralOffset), 2);
  const longitudinalOffset = roundTo(finiteValueOrNull(center.longitudinalOffset), 2);
  const usesRepresentativeFootCop = details.cop.metricScope === 'representative-foot';

  return [
    {
      id: 'stability',
      index: '01',
      title: '站立稳定性',
      description: '站立时保持稳定的能力',
      caption: usesRepresentativeFootCop ? '代表侧 COP 轨迹总长' : 'COP 轨迹总长',
      value: pathLength,
      unit: 'cm',
      status: pathLength === null ? '数据不足' : textOr(stability.status, '已完成'),
      summary: pathLength === null
        ? ''
        : `COP 轨迹总长 ${pathLength} cm。`,
      reference: textOr(stability.reference, ''),
      detailTargetId: 'standing-cop-detail',
    },
    {
      id: 'center',
      index: '02',
      title: '重心控制能力',
      description: '重心位置是否接近双脚中心',
      lateralOffset,
      longitudinalOffset,
      magnitude: roundTo(nonNegativeOrNull(center.magnitudeCm ?? center.magnitude), 2),
      lateralDirection: textOr(center.lateralDirection, ''),
      status: lateralOffset === null && longitudinalOffset === null
        ? '数据不足'
        : '已推断',
      summary: lateralOffset === null && longitudinalOffset === null
        ? '重心偏移数据不足，建议重新检测。'
        : centerMetricSummary(lateralOffset, longitudinalOffset),
      reference: textOr(center.reference, ''),
      detailTargetId: 'standing-center-control-detail',
    },
    {
      id: 'weight',
      index: '03',
      title: '双脚承重分布',
      description: '左右脚承重是否均衡',
      leftPercent: weight.leftPercent,
      rightPercent: weight.rightPercent,
      status: weight.leftPercent === null ? '数据不足' : textOr(metrics.weight?.status, '已完成'),
      summary: weight.leftPercent === null
        ? ''
        : `左脚 ${weight.leftPercent}%，右脚 ${weight.rightPercent}%。`,
      reference: textOr(metrics.weight?.reference, ''),
      detailTargetId: 'standing-pressure-detail',
    },
    {
      id: 'support',
      index: '04',
      title: '足底支撑状态',
      description: '双脚足弓与接触情况',
      ...support,
      status: needsAttention ? '需关注' : hasBothFeet ? '良好' : '数据不足',
      summary: supportText,
      reference: '足弓指数参考范围：0.21-0.26',
      detailTargetId: 'standing-foot-support-detail',
    },
  ];
}

function formatHeroNumber(value) {
  return Number.isInteger(value) ? String(value) : String(roundTo(value, 2));
}

function buildHeroScoreTitle(score, fallback) {
  if (score === null) return fallback;
  return `站立综合评分 ${formatHeroNumber(score / 4)} / 25 分`;
}

function buildHeroFindings(metrics) {
  const stability = metrics.find((metric) => metric.id === 'stability');
  const center = metrics.find((metric) => metric.id === 'center');
  const weight = metrics.find((metric) => metric.id === 'weight');
  const findings = [];

  if (stability?.value !== null) {
    findings.push({
      id: 'stability',
      title: `COP 轨迹 ${formatHeroNumber(stability.value)} ${stability.unit}`,
    });
  }
  if (weight?.leftPercent !== null && weight?.rightPercent !== null) {
    findings.push({
      id: 'weight',
      title: `双脚承重差 ${formatHeroNumber(Math.abs(
        weight.leftPercent - weight.rightPercent,
      ))}%`,
    });
  }
  if (findings.length < 2 && center?.magnitude !== null) {
    findings.push({
      id: 'center',
      title: `足底 COP 偏移 ${formatHeroNumber(center.magnitude)} cm`,
    });
  }

  return findings.slice(0, 2);
}

export function mapStandingReport(record, report) {
  if (!record?.id || !isObject(record.assessments)) {
    throw new TypeError('Invalid assessment history record');
  }

  const data = isObject(report?.reportData) ? report.reportData : report;
  if (!isObject(data)) return null;

  const bilateral = firstObject(data.bilateral);
  const backendCopTime = representativeStandingCop(data);
  const usesRepresentativeFootCop = Boolean(backendCopTime);
  const copTime = standingCopMetrics(data);
  const additional = firstNonEmptyObject(data.additional_data, data.additionalData);
  const archSource = firstNonEmptyObject(data.arch_features, data.archFeatures);
  const metricsSource = firstObject(data.metrics);
  const rawLeftTrajectory = data.left_cop_trajectory
    ?? data.leftCopTrajectory
    ?? bilateral.leftCopTrajectory;
  const rawRightTrajectory = data.right_cop_trajectory
    ?? data.rightCopTrajectory
    ?? bilateral.rightCopTrajectory;
  const leftTrajectory = mapTrajectory(rawLeftTrajectory, 'left');
  const rightTrajectory = mapTrajectory(rawRightTrajectory, 'right');
  const rawPathLengthMm = nonNegativeOrNull(copTime.path_length ?? copTime.pathLength);
  const rawContactAreaMm2 = nonNegativeOrNull(
    copTime.contact_area ?? copTime.contactArea ?? copTime.ellipseArea,
  );
  const leftTrajectoryLength = Array.isArray(rawLeftTrajectory) ? rawLeftTrajectory.length : 0;
  const rightTrajectoryLength = Array.isArray(rawRightTrajectory) ? rawRightTrajectory.length : 0;
  const representativeSide = usesRepresentativeFootCop && (leftTrajectoryLength || rightTrajectoryLength)
    ? (leftTrajectoryLength >= rightTrajectoryLength ? 'left' : 'right')
    : null;
  const deltaXmm = nonNegativeOrNull(copTime.delta_x ?? copTime.deltaX ?? copTime.rangeX);
  const deltaYmm = nonNegativeOrNull(copTime.delta_y ?? copTime.deltaY ?? copTime.rangeY);
  const averageVelocityMm = nonNegativeOrNull(
    copTime.avg_velocity ?? copTime.avgVelocity,
  );
  const maxDisplacementMm = nonNegativeOrNull(
    copTime.max_displacement ?? copTime.maxDisplacement,
  );
  const rmsDisplacementMm = nonNegativeOrNull(
    copTime.rms_displacement ?? copTime.rmsDisplacement,
  );
  const majorAxisMm = nonNegativeOrNull(copTime.major_axis ?? copTime.majorAxis);
  const minorAxisMm = nonNegativeOrNull(copTime.minor_axis ?? copTime.minorAxis);
  // Python 的偏心距与长短轴已按 cm 输出；旧前端 COP 契约仍使用 mm。
  const displacementToCm = usesRepresentativeFootCop ? 1 : 0.1;
  const hasCopMeasurement = leftTrajectoryLength > 0
    || rightTrajectoryLength > 0
    || rawPathLengthMm > 0
    || rawContactAreaMm2 > 0
    || deltaXmm > 0
    || deltaYmm > 0;
  const pathLengthMm = hasCopMeasurement ? rawPathLengthMm : null;
  const contactAreaMm2 = hasCopMeasurement ? rawContactAreaMm2 : null;
  const pressure = buildPressure(data, additional, metricsSource);
  const arch = mapArch(data, archSource, additional);
  const rawCenterControl = deriveStandingCenterControl(data);
  const centerControl = rawCenterControl ? {
    lateralOffset: roundTo(finiteValueOrNull(rawCenterControl.lateralOffsetCm), 2),
    longitudinalOffset: roundTo(nonNegativeOrNull(rawCenterControl.longitudinalOffsetCm), 2),
    magnitude: roundTo(nonNegativeOrNull(rawCenterControl.magnitudeCm), 2),
    lateralDirection: textOr(rawCenterControl.lateralDirection, ''),
    scope: textOr(rawCenterControl.scope, ''),
    reference: textOr(rawCenterControl.reference, ''),
    frameIndex: finiteValueOrNull(rawCenterControl.frameIndex),
    quality: isObject(rawCenterControl.quality) ? rawCenterControl.quality : { valid: false },
    status: rawCenterControl.quality?.valid ? '已推断' : '数据不足',
    summary: textOr(rawCenterControl.summary, ''),
  } : null;
  const rawFourStageLevel = finiteValueOrNull(
    data.four_stage_balance_level
    ?? data.score_inputs?.four_stage_level
    ?? data.scoreInputs?.fourStageLevel,
  );
  const hasFourStageResult = rawFourStageLevel !== null
    && rawFourStageLevel >= 0
    && rawFourStageLevel <= 4;
  const details = {
    cop: {
      pathLength: roundTo(pathLengthMm === null ? null : pathLengthMm / 10, 2),
      area: roundTo(contactAreaMm2 === null ? null : contactAreaMm2 / 100, 2),
      // 压力矩阵 x 是前后方向、y 是左右方向。
      lateralRange: roundTo(deltaYmm === null ? null : deltaYmm / 10, 2),
      longitudinalRange: roundTo(deltaXmm === null ? null : deltaXmm / 10, 2),
      averageVelocity: roundTo(
        !hasCopMeasurement || averageVelocityMm === null ? null : averageVelocityMm / 10,
        2,
      ),
      maxDisplacement: roundTo(
        !hasCopMeasurement || maxDisplacementMm === null
          ? null
          : maxDisplacementMm * displacementToCm,
        2,
      ),
      rmsDisplacement: roundTo(
        !hasCopMeasurement || rmsDisplacementMm === null
          ? null
          : rmsDisplacementMm * displacementToCm,
        2,
      ),
      majorAxis: roundTo(
        !hasCopMeasurement || majorAxisMm === null ? null : majorAxisMm * displacementToCm,
        2,
      ),
      minorAxis: roundTo(
        !hasCopMeasurement || minorAxisMm === null ? null : minorAxisMm * displacementToCm,
        2,
      ),
      trajectory: [...leftTrajectory, ...rightTrajectory],
      metricScope: usesRepresentativeFootCop ? 'representative-foot' : 'combined',
      metricSide: representativeSide,
      reference: textOr(firstObject(data.references).cop, ''),
    },
    pressure,
    arch,
    centerControl,
  };
  const hasCoreData = details.cop.pathLength !== null
    || details.cop.area !== null
    || details.cop.trajectory.length > 0
    || pressure.leftPercent !== null
    || hasRegionPressure(pressure.leftRegions)
    || hasRegionPressure(pressure.rightRegions)
    || arch.leftIndex !== null
    || arch.rightIndex !== null
    || arch.leftContactArea !== null
    || arch.rightContactArea !== null
    || centerControl?.quality?.valid === true
    || hasFourStageResult;

  if (!hasCoreData) return null;

  const score = roundTo(percentOrNull(data.score), 0);
  const reportStatus = textOr(data.status, '');
  const peer = firstObject(data.peerComparison);
  const peerPercentile = roundTo(percentOrNull(peer.percentile), 1);
  const peerSampleSizeValue = positiveOrNull(peer.sampleSize);
  const peerSampleSize = peerSampleSizeValue === null ? null : Math.round(peerSampleSizeValue);
  const hasPeerComparison = peerPercentile !== null && peerSampleSize !== null;
  const summarySource = firstObject(data.summary);
  const mappedMetrics = buildMetrics(data, details);
  const fallbackTitle = textOr(summarySource.title, '站立能力评估结果');

  return {
    recordId: record.id,
    assessmentId: textOr(
      data.assessmentId,
      textOr(report?.assessmentId, record.assessments.standing?.assessmentId || ''),
    ),
    recordedAt: formatReportTime(record.updatedAt || record.date),
    patientName: textOr(record.patientName, '用户'),
    hero: {
      hasScore: score !== null,
      score,
      status: score === null
        ? (reportStatus === '数据异常' ? reportStatus : '数据不足')
        : (reportStatus || '已完成'),
      title: buildHeroScoreTitle(score, fallbackTitle),
      lead: textOr(
        summarySource.heroLead,
        textOr(summarySource.lead, '查看本次站立检测数据。'),
      ),
      findings: buildHeroFindings(mappedMetrics),
      hasPeerComparison,
      peerPercentile: hasPeerComparison ? peerPercentile : null,
      peerSampleSize: hasPeerComparison ? peerSampleSize : null,
    },
    metrics: mappedMetrics,
    details,
    summary: {
      evaluation: textOr(data.evaluation, ''),
      peer: {
        hasPeerComparison,
        percentile: hasPeerComparison ? peerPercentile : null,
        sampleSize: hasPeerComparison ? peerSampleSize : null,
      },
    },
    advice: mapAdvice(data.advice),
    footer: mapFooter(data.footer),
  };
}
