import { finiteOrNull, parseCalendarDate } from '../../health-overview/utils/validators';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstObject(...values) {
  return values.find(isObject) || {};
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
    const x = Array.isArray(point) ? finiteValueOrNull(point[0]) : finiteValueOrNull(point?.x);
    const y = Array.isArray(point) ? finiteValueOrNull(point[1]) : finiteValueOrNull(point?.y);
    return x === null || y === null ? null : { x, y, side };
  }).filter(Boolean);
}

function ratioPercentOrNull(value) {
  const numeric = finiteOrNull(value);
  return numeric !== null && numeric >= 0 && numeric <= 1
    ? roundTo(numeric * 100, 2)
    : null;
}

function mapRegionPressure(source, usesRatio) {
  const data = isObject(source) ? source : {};
  const convert = usesRatio ? ratioPercentOrNull : percentOrNull;
  return {
    forefoot: convert(data['前足'] ?? data.forefoot),
    midfoot: convert(data['中足'] ?? data.midfoot),
    hindfoot: convert(data['后足'] ?? data.hindfoot),
  };
}

function hasRegionPressure(regions) {
  return Object.values(regions).some((value) => value !== null);
}

function mapWeight(value) {
  const data = isObject(value) ? value : {};
  const leftPercent = percentOrNull(data.leftPercent ?? data.leftRatio);
  const rightPercent = percentOrNull(data.rightPercent ?? data.rightRatio);
  const valid = leftPercent !== null
    && rightPercent !== null
    && Math.abs(leftPercent + rightPercent - 100) < 0.001;

  return valid
    ? { leftPercent, rightPercent }
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

function footSources(data, arch, side) {
  const title = side === 'left' ? 'Left' : 'Right';
  return [
    arch[`${side}_foot`],
    arch[`${side}Foot`],
    arch[side],
    data[`${side}_foot`],
    data[`${side}Foot`],
    data[side],
    data[title],
  ].filter(isObject);
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
  if (label.includes('normal') || label.includes('正常')) return '正常';
  if (label.includes('high') || label.includes('高足弓')) return '偏高';
  if (label.includes('flat') || label.includes('扁平')) return '偏低';
  if (index === null) return '数据不足';
  if (index < 0.21) return '偏高';
  return index <= 0.26 ? '正常' : '偏低';
}

function supportSummary(arch) {
  const available = [
    ['左', arch.leftType],
    ['右', arch.rightType],
  ].filter(([, type]) => type !== '数据不足');
  const abnormal = available.filter(([, type]) => type !== '正常');

  if (available.length === 0) return '足底支撑数据不足。';
  if (available.length === 1 && abnormal.length === 0) {
    const missingSide = available[0][0] === '左' ? '右' : '左';
    return `已取得${available[0][0]}足支撑数据，${missingSide}足数据不足。`;
  }
  if (abnormal.length === 0) return '双脚足弓处于正常范围，足底支撑状态良好。';
  if (abnormal.length === 1) {
    return `${abnormal[0][0]}足足弓状态${abnormal[0][1]}，建议持续关注。`;
  }
  return '双脚足弓指标存在偏差，建议结合专业评估进一步关注。';
}

function mapArch(data, arch, additional) {
  const left = footSources(data, arch, 'left');
  const right = footSources(data, arch, 'right');
  const leftArea = firstObject(additional.left_area, additional.leftArea);
  const rightArea = firstObject(additional.right_area, additional.rightArea);
  const leftIndex = positiveOrNull(firstFootValue(left, 'area_index', 'archIndex', 'arch_index'));
  const rightIndex = positiveOrNull(firstFootValue(right, 'area_index', 'archIndex', 'arch_index'));

  return {
    leftIndex,
    rightIndex,
    leftType: normalizeArchType(
      firstFootValue(left, 'area_type', 'archType', 'arch_type'),
      leftIndex,
    ),
    rightType: normalizeArchType(
      firstFootValue(right, 'area_type', 'archType', 'arch_type'),
      rightIndex,
    ),
    leftContactArea: positiveOrNull(
      leftArea.total_area_cm2
      ?? leftArea.totalAreaCm2
      ?? firstFootValue(left, 'totalArea', 'contactArea'),
    ),
    rightContactArea: positiveOrNull(
      rightArea.total_area_cm2
      ?? rightArea.totalAreaCm2
      ?? firstFootValue(right, 'totalArea', 'contactArea'),
    ),
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
  const weight = mapWeight(firstObject(
    metrics.weight,
    data.bilateral_pressure_ratio,
    data.bilateralPressureRatio,
  ));

  return {
    ...weight,
    leftRegions,
    rightRegions,
    copDistances: {
      left: nonNegativeOrNull(
        copResults.dist_left_to_both ?? copResults['左脚COP到整体COP距离(cm)'],
      ),
      right: nonNegativeOrNull(
        copResults.dist_right_to_both ?? copResults['右脚COP到整体COP距离(cm)'],
      ),
      leftForward: finiteValueOrNull(
        copResults.left_forward ?? copResults['左脚前移量(cm)'],
      ),
    },
  };
}

function buildMetrics(data, details) {
  const metrics = firstObject(data.metrics);
  const stability = firstObject(metrics.stability);
  const center = firstObject(metrics.center);
  const weight = details.pressure;
  const support = details.arch;
  const supportText = supportSummary(support);
  const hasBothFeet = support.leftIndex !== null && support.rightIndex !== null;
  const needsAttention = [support.leftType, support.rightType]
    .some((type) => type === '偏高' || type === '偏低');
  const swayArea = positiveOrNull(stability.swayArea) ?? details.cop.area;
  const lateralOffset = finiteValueOrNull(center.lateralOffset);
  const longitudinalOffset = finiteValueOrNull(center.longitudinalOffset);

  return [
    {
      id: 'stability',
      index: '01',
      title: '身体稳定性',
      description: '身体在站立时保持稳定的能力',
      value: swayArea,
      unit: textOr(stability.unit, 'cm²'),
      status: swayArea === null ? '数据不足' : textOr(stability.status, '已完成'),
      summary: swayArea === null ? '' : textOr(stability.summary, ''),
      reference: textOr(stability.reference, ''),
      detailTargetId: 'standing-cop-detail',
    },
    {
      id: 'center',
      index: '02',
      title: '重心控制能力',
      description: '身体重心是否稳定在支撑区域',
      lateralOffset,
      longitudinalOffset,
      status: lateralOffset === null && longitudinalOffset === null
        ? '数据不足'
        : textOr(center.status, '已完成'),
      summary: lateralOffset === null && longitudinalOffset === null
        ? ''
        : textOr(center.summary, ''),
      reference: textOr(center.reference, ''),
      detailTargetId: 'standing-cop-detail',
    },
    {
      id: 'weight',
      index: '03',
      title: '双脚承重分布',
      description: '左右脚承担身体重量是否均衡',
      leftPercent: weight.leftPercent,
      rightPercent: weight.rightPercent,
      status: weight.leftPercent === null ? '数据不足' : textOr(metrics.weight?.status, '已完成'),
      summary: weight.leftPercent === null ? '' : textOr(metrics.weight?.summary, ''),
      reference: textOr(metrics.weight?.reference, ''),
      detailTargetId: 'standing-pressure-detail',
    },
    {
      id: 'support',
      index: '04',
      title: '足底支撑状态',
      description: '双脚足弓与足底接触状态是否正常',
      ...support,
      status: needsAttention ? '需关注' : hasBothFeet ? '良好' : '数据不足',
      summary: supportText,
      reference: '足弓指数参考范围：0.21-0.26',
      detailTargetId: 'standing-foot-support-detail',
    },
  ];
}

export function mapStandingReport(record, report) {
  if (!record?.id || !isObject(record.assessments)) {
    throw new TypeError('Invalid assessment history record');
  }

  const data = isObject(report?.reportData) ? report.reportData : report;
  if (!isObject(data)) return null;

  const copTime = firstObject(data.cop_time_series, data.copTimeSeries);
  const additional = firstObject(data.additional_data, data.additionalData);
  const archSource = firstObject(data.arch_features, data.archFeatures);
  const metricsSource = firstObject(data.metrics);
  const leftTrajectory = mapTrajectory(
    data.left_cop_trajectory ?? data.leftCopTrajectory,
    'left',
  );
  const rightTrajectory = mapTrajectory(
    data.right_cop_trajectory ?? data.rightCopTrajectory,
    'right',
  );
  const pathLengthMm = positiveOrNull(copTime.path_length ?? copTime.pathLength);
  const contactAreaMm2 = positiveOrNull(copTime.contact_area ?? copTime.contactArea);
  const deltaXmm = nonNegativeOrNull(copTime.delta_x ?? copTime.deltaX);
  const deltaYmm = nonNegativeOrNull(copTime.delta_y ?? copTime.deltaY);
  const pressure = buildPressure(data, additional, metricsSource);
  const arch = mapArch(data, archSource, additional);
  const details = {
    cop: {
      pathLength: roundTo(pathLengthMm === null ? null : pathLengthMm / 10, 2),
      area: roundTo(contactAreaMm2 === null ? null : contactAreaMm2 / 100, 2),
      lateralRange: roundTo(deltaXmm === null ? null : deltaXmm / 10, 2),
      longitudinalRange: roundTo(deltaYmm === null ? null : deltaYmm / 10, 2),
      trajectory: [...leftTrajectory, ...rightTrajectory],
      reference: textOr(firstObject(data.references).cop, ''),
    },
    pressure,
    arch,
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
    || arch.rightContactArea !== null;

  if (!hasCoreData) return null;

  const score = percentOrNull(data.score);
  const peer = firstObject(data.peerComparison);
  const peerPercentile = percentOrNull(peer.percentile);
  const peerSampleSize = positiveOrNull(peer.sampleSize);
  const hasPeerComparison = peerPercentile !== null && peerSampleSize !== null;
  const summarySource = firstObject(data.summary);

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
      status: score === null ? '数据不足' : textOr(data.status, '已完成'),
      title: textOr(summarySource.title, '站立能力评估结果'),
      lead: textOr(summarySource.lead, '查看本次站立检测数据。'),
      hasPeerComparison,
      peerPercentile: hasPeerComparison ? peerPercentile : null,
      peerSampleSize: hasPeerComparison ? peerSampleSize : null,
    },
    metrics: buildMetrics(data, details),
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
    footer: {
      disclaimer: textOr(
        data.footer?.disclaimer,
        '提示：本报告仅供参考，不能替代专业医生的诊断，如有不适，请及时就医。',
      ),
    },
  };
}
