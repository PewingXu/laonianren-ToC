import { useEffect, useState } from 'react';
import { ToastRegion } from '../../health-overview/components/ToastRegion';
import { GripHero } from '../components/GripHero';
import { GripMetricGrid } from '../components/GripMetricGrid';
import { GripAdvice } from '../components/GripAdvice';
import { GripAiHealthSummary } from '../components/GripAiHealthSummary';
import { GripProfessionalAnalysis } from '../components/GripProfessionalAnalysis';
import { GripReportFooter } from '../components/GripReportFooter';
import { GripReportHeader } from '../components/GripReportHeader';
import { GripReportState } from '../components/GripReportState';
import { useGripReport } from '../hooks/useGripReport';
import { mapGripReport } from '../mappers/mapGripReport';

function buildShareSummary(data) {
  const score = data.hero.hasScore ? `握力综合评分${data.hero.score}分` : '暂无握力综合评分';
  return `${data.patientName}的握力详细报告，检测时间${data.recordedAt}，${score}，最大握力${data.forces.maximum}${data.unit}。`;
}

export function GripReportPage({ gateway, recordId, onShare }) {
  const [notification, setNotification] = useState({ id: 0, message: '' });
  const { status, data, error, retry } = useGripReport({
    gateway,
    recordId,
    mapper: mapGripReport,
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
        <main className="grip-report grip-report--state" aria-label="握力详细报告">
          <GripReportState
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
        className="grip-report"
        data-testid="grip-report-ready"
        data-record-id={data.recordId}
      >
        <GripReportHeader
          recordId={data.recordId}
          recordedAt={data.recordedAt}
          onShare={handleShare}
          onShowDate={() => notify(`检测时间：${data.recordedAt}`)}
        />
        <main className="grip-report__content" aria-label="握力详细报告内容">
          <GripHero hero={data.hero} unit={data.unit} />
          <GripMetricGrid metrics={data.metrics} onShowDetail={handleShowDetail} />
          <GripProfessionalAnalysis details={data.details} />
          <GripAiHealthSummary healthSummary={data.healthSummary} />
          <GripAdvice advice={data.advice} />
        </main>
        <GripReportFooter footer={data.footer} />
      </div>
      <ToastRegion notification={notification} />
    </>
  );
}
