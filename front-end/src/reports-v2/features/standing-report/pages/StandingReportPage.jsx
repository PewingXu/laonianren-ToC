import { useEffect, useMemo, useState } from 'react';
import { ToastRegion } from '../../health-overview/components/ToastRegion';
import { StandingDetailsPanel } from '../components/StandingDetailsPanel';
import { StandingHero } from '../components/StandingHero';
import { StandingMetricGrid } from '../components/StandingMetricGrid';
import { StandingReportFooter } from '../components/StandingReportFooter';
import { StandingReportHeader } from '../components/StandingReportHeader';
import { StandingReportState } from '../components/StandingReportState';
import { StandingSummary } from '../components/StandingSummary';
import { useStandingReport } from '../hooks/useStandingReport';
import { mapStandingReport } from '../mappers/mapStandingReport';
import { buildStandingAiFacts } from '../../../../lib/assessmentAiFacts';
import { generateStandingTocAIReport } from '../../../../lib/gripPythonApi';
import {
  useAssessmentAiCopy,
  validateStandingCopy,
} from '../../../shared/useAssessmentAiCopy';

function buildShareSummary(data) {
  const score = data.hero.hasScore ? `站立综合评分${data.hero.score}分` : '暂无站立综合评分';
  return `${data.patientName}的站立详细报告，检测时间${data.recordedAt}，${score}。`;
}

const AI_KEY_FIELDS = ['left_percent', 'right_percent', 'sway_mm', 'score'];

export function StandingReportPage({ gateway, recordId, onShare }) {
  const [notification, setNotification] = useState({ id: 0, message: '' });
  const {
    status, data, error, retry, raw, patient,
  } = useStandingReport({
    gateway,
    recordId,
    mapper: mapStandingReport,
  });

  // AI 文案异步取；失败就一直用 mapper 的兜底，报告永远可读
  const facts = useMemo(
    () => (raw ? buildStandingAiFacts(raw, patient) : null),
    [raw, patient],
  );
  const ai = useAssessmentAiCopy({
    facts,
    patientInfo: patient,
    request: generateStandingTocAIReport,
    validate: validateStandingCopy,
    keyFields: AI_KEY_FIELDS,
  });

  useEffect(() => {
    if (!notification.message) return undefined;
    const notificationId = notification.id;
    const timeoutId = setTimeout(() => {
      setNotification((current) => (
        current.id === notificationId ? { ...current, message: '' } : current
      ));
    }, 5000);
    return () => clearTimeout(timeoutId);
  }, [notification]);

  function notify(message) {
    setNotification((current) => ({ id: current.id + 1, message }));
  }

  if (status !== 'ready') {
    return (
      <>
        <main className="standing-report standing-report--state" aria-label="站立详细报告">
          <StandingReportState
            status={status}
            error={error}
            onRetry={retry}
            recordId={recordId}
          />
        </main>
        <ToastRegion notification={notification} />
      </>
    );
  }

  async function handleShare() {
    try {
      if (typeof onShare !== 'function') throw new TypeError('Missing share boundary');
      const result = await onShare(buildShareSummary(data));
      notify(result === 'copied' ? '报告摘要已复制' : '报告已分享');
    } catch (_error) {
      notify('分享报告失败，请稍后重试');
    }
  }

  function handleShowDetail(targetId) {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.scrollIntoView({ block: 'center' });
    target.focus({ preventScroll: true });
  }

  return (
    <>
      <div
        className="standing-report"
        data-testid="standing-report-ready"
        data-record-id={data.recordId}
      >
        <StandingReportHeader
          recordId={data.recordId}
          recordedAt={data.recordedAt}
          onShare={handleShare}
          onShowDate={() => notify(`检测时间：${data.recordedAt}`)}
        />
        <main className="standing-report__content" aria-label="站立详细报告内容">
          <StandingHero hero={data.hero} />
          <StandingMetricGrid metrics={data.metrics} onShowDetail={handleShowDetail} />
          <StandingDetailsPanel details={data.details} />
          <StandingSummary
            hero={data.hero}
            summary={ai.copy?.evaluation
              ? { ...data.summary, evaluation: ai.copy.evaluation }
              : data.summary}
            // 站立的 advice 在 mapper 里没有兜底（缺数据返回 []），
            // 所以 AI 没回来时这块本来就是空的，直接用 AI 的即可
            advice={ai.copy?.advice ?? data.advice}
          />
          <StandingReportFooter footer={data.footer} />
        </main>
      </div>
      <ToastRegion notification={notification} />
    </>
  );
}
