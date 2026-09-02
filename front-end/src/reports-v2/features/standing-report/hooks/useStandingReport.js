import { useCallback, useEffect, useState } from 'react';
import {
  assertAssessmentReportGateway,
  assertReportGateway,
} from '../../health-overview/gateways/reportGatewayContract';

const initialState = {
  status: 'loading',
  data: null,
  error: null,
  // raw / patient 供 AI 文案 hook 用：AI 需要的是实测事实摘要，
  // 而 data 已经是渲染契约（含兜底文案），从里面反推不出原始数值
  raw: null,
  patient: null,
};

export function useStandingReport({ gateway, recordId, mapper }) {
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

        const assessment = record?.assessments?.standing;
        if (
          record === null
          || assessment?.completed !== true
          || typeof assessment.assessmentId !== 'string'
          || !assessment.assessmentId.trim()
        ) {
          setState({ ...initialState, status: 'empty' });
          return;
        }

        const report = await gateway.getAssessmentReport('standing', {
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
