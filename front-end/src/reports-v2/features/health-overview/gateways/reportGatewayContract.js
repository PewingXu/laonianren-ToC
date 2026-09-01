export function assertReportGateway(gateway) {
  if (!gateway || typeof gateway.getOverviewRecord !== 'function') {
    throw new TypeError('ReportGateway must implement getOverviewRecord(id)');
  }
}

export function assertAssessmentReportGateway(gateway) {
  if (!gateway || typeof gateway.getAssessmentReport !== 'function') {
    throw new TypeError('ReportGateway must implement getAssessmentReport(type, params)');
  }
}
