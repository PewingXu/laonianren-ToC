function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyObject(value) {
  return isObject(value) && Object.keys(value).length > 0;
}

/**
 * Python 原始报告使用 snake_case。camelCase 仅在同时带有明确后端结构标记时
 * 视为它的别名；旧前端报告的根级 copTimeSeries 是整体 COP，单位也不同。
 */
export function hasStandingBackendSchema(reportData = {}) {
  const hasSnakeMarker = [
    'cop_time_series',
    'arch_features',
    'additional_data',
    'left_cop_trajectory',
    'right_cop_trajectory',
  ].some((key) => Object.hasOwn(reportData, key));
  const hasCamelBackendMarker = isObject(reportData.archFeatures)
    || (
      isObject(reportData.additionalData)
      && !isObject(reportData.left)
      && !isObject(reportData.right)
      && !isObject(reportData.bilateral)
    );
  return hasSnakeMarker || hasCamelBackendMarker;
}

export function representativeStandingCop(reportData = {}) {
  if (nonEmptyObject(reportData.cop_time_series)) return reportData.cop_time_series;
  if (hasStandingBackendSchema(reportData) && nonEmptyObject(reportData.copTimeSeries)) {
    return reportData.copTimeSeries;
  }
  return null;
}

export function standingCopMetrics(reportData = {}) {
  const representative = representativeStandingCop(reportData);
  if (representative) return representative;
  if (nonEmptyObject(reportData.bilateral?.copMetrics)) return reportData.bilateral.copMetrics;
  if (nonEmptyObject(reportData.copTimeSeries)) return reportData.copTimeSeries;
  return {};
}
