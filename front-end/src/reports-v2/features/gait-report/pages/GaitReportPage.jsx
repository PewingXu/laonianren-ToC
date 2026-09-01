import { useEffect, useState } from 'react';
import { ToastRegion } from '../../health-overview/components/ToastRegion';
import { GaitAbilityGrid } from '../components/GaitAbilityGrid';
import { GaitBodyInterpretation } from '../components/GaitBodyInterpretation';
import { GaitHero } from '../components/GaitHero';
import { GaitRecommendations } from '../components/GaitRecommendations';
import { GaitReportHeader } from '../components/GaitReportHeader';
import { GaitReportState } from '../components/GaitReportState';
import { GaitSummary } from '../components/GaitSummary';
import { GaitTrend } from '../components/GaitTrend';
import { useGaitReport } from '../hooks/useGaitReport';
import { mapGaitReport } from '../mappers/mapGaitReport';

function buildShareSummary(data) {
  const score = data.hero.hasScore ? `步态综合评分${data.hero.score}分` : '暂无步态综合评分';
  return `${data.patientName}的步态详细报告，检测时间${data.recordedAt}，${score}。`;
}

export function GaitReportPage({ gateway, recordId, onShare }) {
  const [notification, setNotification] = useState({ id: 0, message: '' });
  const { status, data, error, retry } = useGaitReport({
    gateway,
    recordId,
    mapper: mapGaitReport,
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
        <main className="gait-report gait-report--state" aria-label="步态详细报告">
          <GaitReportState
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

  function handleShowStandards() {
    const target = document.getElementById('gait-professional-analysis');
    if (!target) return;
    target.scrollIntoView({ block: 'center' });
    target.focus({ preventScroll: true });
  }

  function handleShowAbility(abilityId) {
    const target = document.getElementById(`gait-ability-${abilityId}`);
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function handleViewHistory() {
    notify('历史报告入口待与后端对接');
  }

  function handleBuildPlan() {
    notify('运动计划功能待与后端对接');
  }

  return (
    <>
      <div
        className="gait-report"
        data-testid="gait-report-ready"
        data-record-id={data.recordId}
      >
        <GaitReportHeader
          recordId={data.recordId}
          recordedAt={data.recordedAt}
          onShare={handleShare}
          onShowDate={() => notify(`检测时间：${data.recordedAt}`)}
        />
        <main className="gait-report__content" aria-label="步态详细报告内容">
          <GaitHero hero={data.hero} />
          <GaitSummary
            summary={data.summary}
            onShowStandards={handleShowStandards}
          />
          <GaitAbilityGrid abilities={data.abilities} />
          <section
            className="gait-report__guidance-grid"
            aria-label="步态建议与成长趋势"
          >
            <GaitRecommendations recommendations={data.recommendations} />
            <GaitTrend trend={data.trend} />
          </section>
          <GaitBodyInterpretation
            abilities={data.abilities}
            hero={data.hero}
            summary={data.summary}
            onShowAbility={handleShowAbility}
            onViewHistory={handleViewHistory}
            onBuildPlan={handleBuildPlan}
          />
        </main>
      </div>
      <ToastRegion notification={notification} />
    </>
  );
}
