import { useCallback, useEffect, useState } from 'react';
import {
  assertAssessmentReportGateway,
  assertReportGateway,
} from '../../health-overview/gateways/reportGatewayContract';

const initialState = {
  status: 'loading',
  data: null,
  error: null,
};

export function useGaitReport({ gateway, recordId, mapper }) {
  const [state, setState] = useState(initialState);
  const [retryCount, setRetryCount] = useState(0);
  const retry = useCallback(() => setRetryCount((count) => count + 1), []);

  useEffect(() => {
    let cancelled = false;

    setState(initialState);

    async function load() {
      try {
        assertReportGateway(gateway);
        assertAssessmentReportGateway(gateway);

        const record = await gateway.getOverviewRecord(recordId);
        if (cancelled) return;

        const assessment = record?.assessments?.gait;
        if (
          record === null
          || assessment?.completed !== true
          || typeof assessment.assessmentId !== 'string'
          || !assessment.assessmentId.trim()
        ) {
          setState({ status: 'empty', data: null, error: null });
          return;
        }

        const report = await gateway.getAssessmentReport('gait', {
          recordId,
          assessmentId: assessment.assessmentId,
        });
        if (cancelled) return;

        const data = report === null ? null : mapper(record, report);
        setState(data
          ? { status: 'ready', data, error: null }
          : { status: 'empty', data: null, error: null });
      } catch (error) {
        if (!cancelled) setState({ status: 'error', data: null, error });
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [gateway, mapper, recordId, retryCount]);

  return { ...state, retry };
}
