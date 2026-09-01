import { useCallback, useEffect, useState } from 'react';
import {
  assertAssessmentReportGateway,
  assertReportGateway,
} from '../../health-overview/gateways/reportGatewayContract';

const initialState = {
  status: 'loading',
  data: null,
  error: null,
  // 未经 mapper 的增强后 reportData 与患者信息。
  // 只给 AI 文案用（useGripAiCopy 要拿它算事实摘要），页面渲染一律走 data。
  raw: null,
  patient: null,
};

export function useGripReport({ gateway, recordId, mapper }) {
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

        const assessment = record?.assessments?.grip;
        if (
          record === null
          || assessment?.completed !== true
          || typeof assessment.assessmentId !== 'string'
          || !assessment.assessmentId.trim()
        ) {
          setState({ ...initialState, status: 'empty' });
          return;
        }

        const report = await gateway.getAssessmentReport('grip', {
          recordId,
          assessmentId: assessment.assessmentId,
        });
        if (cancelled) return;

        const data = report === null ? null : mapper(record, report);
        setState(data
          ? {
            status: 'ready',
            data,
            error: null,
            raw: report?.reportData ?? null,
            patient: {
              name: record.patientName ?? '',
              gender: record.patientGender ?? null,
              age: record.patientAge ?? null,
            },
          }
          : { ...initialState, status: 'empty' });
      } catch (error) {
        if (!cancelled) setState({ ...initialState, status: 'error', error });
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [gateway, mapper, recordId, retryCount]);

  return { ...state, retry };
}
