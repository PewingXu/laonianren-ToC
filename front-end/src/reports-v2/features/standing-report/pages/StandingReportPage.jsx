import { useEffect, useMemo, useState } from 'react';
import { ToastRegion } from '../../health-overview/components/ToastRegion';
import { StandingAiGuidance } from '../components/StandingAiGuidance';
import { StandingDetailsPanel } from '../components/StandingDetailsPanel';
import { StandingHero } from '../components/StandingHero';
import { StandingMetricGrid } from '../components/StandingMetricGrid';
import { StandingReportFooter } from '../components/StandingReportFooter';
import { StandingReportHeader } from '../components/StandingReportHeader';
import { StandingReportState } from '../components/StandingReportState';
import { useStandingReport } from '../hooks/useStandingReport';
import { buildStandingHealthSummary } from '../mappers/buildStandingHealthSummary';
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

const AI_KEY_FIELDS = [
  'left_percent',
  'right_percent',
  'sway_cm',
  'cop_scope',
  'center_control_scope',
  'center_lateral_offset_cm',
  'center_longitudinal_offset_cm',
  'center_offset_magnitude_cm',
  'center_lateral_direction',
  'left_arch_index',
  'right_arch_index',
  'arch_note',
  'left_forefoot_percent',
  'left_midfoot_percent',
  'left_heel_percent',
  'right_forefoot_percent',
  'right_midfoot_percent',
  'right_heel_percent',
  'score',
  'score_max',
  'grade',
  'red_flags',
];

export function StandingReportPage({ gateway, recordId, onShare }) {
  const [notification, setNotification] = useState({ id: 0, message: '' });
  const {
    status, data, error, retry, raw, patient,
  } = useStandingReport({
    gateway,
    recordId,
    mapper: mapStandingReport,
  });

  // AI 文案异步取；等待或失败时，按实测结果生成通俗的本地总结。
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
  const healthSummary = ai.copy?.healthSummary ?? buildStandingHealthSummary(facts);

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
          <StandingMetricGrid metrics={data.metrics} />
          <StandingDetailsPanel details={data.details} />
          <StandingAiGuidance
            healthSummary={healthSummary}
            // AI 返回后替换本地文案；等待或失败时由末尾区块提供安全兜底。
            advice={ai.copy?.advice ?? data.advice}
            pending={ai.status === 'loading'}
          />
        </main>
        <StandingReportFooter footer={data.footer} />
      </div>
      <ToastRegion notification={notification} />
    </>
  );
}
