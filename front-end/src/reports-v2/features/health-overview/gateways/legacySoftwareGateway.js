const REPORT_METHODS = Object.freeze({
  grip: 'getGripReport',
  sitstand: 'getSitStandReport',
  standing: 'getStandingReport',
  gait: 'getGaitReport',
});

class LegacyGatewayError extends Error {
  constructor(code, message) {
    super(message || 'Legacy software request failed');
    this.name = 'LegacyGatewayError';
    this.code = code;
  }
}

function unwrapHttpResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result) || !Number.isInteger(result.code)) {
    throw new LegacyGatewayError(-1, 'Malformed legacy software response');
  }
  if (result.code === 0 && !Object.hasOwn(result, 'data')) {
    throw new LegacyGatewayError(-1, 'Malformed legacy software response');
  }
  if (result.code !== 0) {
    throw new LegacyGatewayError(result?.code ?? -1, result?.message || result?.msg);
  }

  return result.data;
}

export function createLegacySoftwareGateway(bridge) {
  return {
    async getOverviewRecord(id) {
      return unwrapHttpResult(await bridge.getHistory(id));
    },

    async getAssessmentReport(type, params) {
      const method = REPORT_METHODS[type];
      if (!method) throw new TypeError(`Unsupported assessment report type: ${type}`);

      return unwrapHttpResult(await bridge[method](params));
    },
  };
}
