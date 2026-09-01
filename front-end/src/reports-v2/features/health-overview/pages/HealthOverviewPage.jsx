import { useEffect, useState } from 'react';
import { MemoryRouter, useInRouterContext } from 'react-router-dom';
import { mapRecordToOverview } from '../mappers/mapRecordToOverview';
import { AdviceCard } from '../components/AdviceCard';
import { ExpertInsight } from '../components/ExpertInsight';
import { GaitAbilityCard } from '../components/GaitAbilityCard';
import { GripAbilityCard } from '../components/GripAbilityCard';
import { HeroSummary } from '../components/HeroSummary';
import { MobileNavigation } from '../components/MobileNavigation';
import { NextAssessment } from '../components/NextAssessment';
import { PageState } from '../components/PageState';
import { PeerComparison } from '../components/PeerComparison';
import { ProgressTrend } from '../components/ProgressTrend';
import { ReportFooter } from '../components/ReportFooter';
import { ReportHeader } from '../components/ReportHeader';
import { SitStandAbilityCard } from '../components/SitStandAbilityCard';
import { StandingAbilityCard } from '../components/StandingAbilityCard';
import { ToastRegion } from '../components/ToastRegion';
import { useHealthOverview } from '../hooks/useHealthOverview';
import { buildReportRoute } from '../utils/reportRoute';

const ABILITY_COMPONENTS = {
  gait: GaitAbilityCard,
  grip: GripAbilityCard,
  sitstand: SitStandAbilityCard,
  standing: StandingAbilityCard,
};

function buildShareSummary(data) {
  const scoreSummary = data.hero.hasScore ? `${data.hero.score}分` : '暂无综合评分';
  return `${data.patient.name}的健康报告，记录于${data.recordedAt}，本次综合状态${scoreSummary}。`;
}

export function HealthOverviewPage({
  gateway,
  recordId,
  onOpenAbility,
  onShare,
  onSaveReminder,
}) {
  const isInRouterContext = useInRouterContext();
  const [notification, setNotification] = useState({ id: 0, message: '' });
  const { status, data, error, retry } = useHealthOverview({
    gateway,
    recordId,
    mapRecordToOverview,
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

  function withToast(content) {
    const page = (
      <>
        {content}
        <ToastRegion notification={notification} />
      </>
    );

    return isInRouterContext ? page : (
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        {page}
      </MemoryRouter>
    );
  }

  if (status !== 'ready') {
    return withToast(
      <main className="health-overview health-overview--state" aria-label="健康报告">
        <PageState status={status} error={error} onRetry={retry} />
      </main>,
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

  async function handleSaveReminder() {
    if (!data.reminderDate) {
      notify('提醒日期不可用，无法保存');
      return;
    }

    try {
      if (typeof onSaveReminder !== 'function') throw new TypeError('Missing reminder boundary');
      await onSaveReminder(data.recordId, data.reminderDate);
      notify('已记下下次评估提醒');
    } catch (_error) {
      notify('保存提醒失败，请稍后重试');
    }
  }

  const overview = (
    <div
      className="health-overview"
      data-testid="health-overview-ready"
      data-overview-record-id={data.recordId}
    >
      <div className="health-overview__scroll">
        <ReportHeader
          recordedAt={data.recordedAt}
          patientName={data.patient.name}
          onShare={handleShare}
        />
        <main className="health-overview__content" aria-label="健康报告">
          <HeroSummary hero={data.hero} />

          <section
            className="health-overview__section"
            id="abilities"
            data-testid="abilities"
            aria-labelledby="abilities-title"
          >
            <div className="health-overview__section-heading">
              <h2 id="abilities-title">四项身体能力评估</h2>
              <p>基于本次检测结果，为您呈现身体各项能力表现</p>
            </div>
            <div className="health-overview__ability-grid">
              {data.abilities.map((ability) => {
                const AbilityCard = ABILITY_COMPONENTS[ability.type];
                return AbilityCard ? (
                  <AbilityCard
                    key={ability.type}
                    ability={ability}
                    to={buildReportRoute(data.recordId, ability.type)}
                    onOpenAbility={onOpenAbility}
                  />
                ) : null;
              })}
            </div>
            <p className="health-overview__disclaimer">
              以上评估结果仅供参考，建议保持规律运动、均衡饮食、充足休息，定期检测，持续关注身体变化。
            </p>
          </section>

          <section
            className="health-overview__section"
            id="advice"
            data-testid="advice"
            aria-labelledby="advice-title"
          >
            <div className="health-overview__section-heading">
              <h2 id="advice-title">给您的温馨小建议</h2>
            </div>
            <div className="health-overview__advice-grid">
              {data.advice.map((advice, index) => (
                <AdviceCard key={`${advice.title}-${index}`} advice={advice} index={index} />
              ))}
            </div>
          </section>

          <div className="health-overview__split-section">
            <ExpertInsight content={data.expertInsight} />
            <PeerComparison comparison={data.peerComparison} />
          </div>

          <div className="health-overview__bottom-section">
            <ProgressTrend trend={data.trend} />
            <NextAssessment assessment={data.nextAssessment} onSaveReminder={handleSaveReminder} />
          </div>
        </main>
        <ReportFooter />
      </div>
      <MobileNavigation />
    </div>
  );

  return withToast(overview);
}
