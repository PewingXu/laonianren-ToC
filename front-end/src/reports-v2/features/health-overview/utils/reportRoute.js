const VALID_REPORT_TYPES = new Set(['grip', 'sitstand', 'standing', 'gait']);

/**
 * 报告页返回按钮的目标：本应用的综合报告页。
 *
 * 交付包各报告页原来写死的是它自带路由 `/overview/:recordId`，而本应用的 App.jsx
 * 只有 `/history/comprehensive?id=`（见 App.jsx 的路由表），所以那个链接会落到 NotFound。
 * 集中在这里拼，五个报告页共用，日后改路由只动一处。
 *
 * recordId 缺失时退回历史列表 —— 那里能重新选记录，比停在 404 上有用。
 */
export function buildOverviewRoute(recordId) {
  if (typeof recordId !== 'string' || !recordId.trim()) return '/history';
  return `/history/comprehensive?${new URLSearchParams({ id: recordId }).toString()}`;
}

export function buildReportRoute(recordId, type) {
  if (typeof recordId !== 'string' || !recordId.trim() || !VALID_REPORT_TYPES.has(type)) {
    throw new TypeError('Invalid report route');
  }

  const query = new URLSearchParams({ id: recordId, type });
  return `/history/report?${query.toString()}`;
}
