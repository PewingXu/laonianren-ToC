import { useEffect, useMemo, useState } from 'react';
import { ToastRegion } from '../../health-overview/components/ToastRegion';
import { GaitAbilityGrid } from '../components/GaitAbilityGrid';
import { GaitAiGuidance } from '../components/GaitAiGuidance';
import { GaitFootprintTrail } from '../components/GaitFootprintTrail';
import { GaitHero } from '../components/GaitHero';
import { GaitKeyMetrics } from '../components/GaitKeyMetrics';
import {
  GaitLoadAnalysis,
  GaitObservation,
  GaitSymmetry,
} from '../components/GaitMeasurementDetails';
import { GaitReportFooter } from '../components/GaitReportFooter';
import { GaitReportHeader } from '../components/GaitReportHeader';
import { GaitReportState } from '../components/GaitReportState';
import { GaitTrend } from '../components/GaitTrend';
import { useGaitReport } from '../hooks/useGaitReport';
import { buildGaitHealthSummary } from '../mappers/buildGaitHealthSummary';
import { mapGaitReport } from '../mappers/mapGaitReport';
import { buildGaitAiFacts } from '../../../../lib/assessmentAiFacts';
import { generateGaitTocAIReport } from '../../../../lib/gripPythonApi';
import {
  useAssessmentAiCopy,
  validateGaitCopy,
} from '../../../shared/useAssessmentAiCopy';

function buildShareSummary(data) {
  const score = data.hero.hasScore ? `步态综合评分${data.hero.score}分` : '暂无步态综合评分';
  return `${data.patientName}的步态详细报告，检测时间${data.recordedAt}，${score}。`;
}

const AI_KEY_FIELDS = [
  'speed_mps',
  'step_length_m',
  'cadence_spm',
  'step_width_cm',
  'double_support_s',
  'step_length_diff',
  'step_time_diff',
  'step_time_cv_percent',
  'step_distance_cv_percent',
  'stability_valid_steps',
  'stability_confidence',
  'path_deviation_cm',
  'max_path_deviation_cm',
  'direction_valid_steps',
  'direction_confidence',
  'left_load_percent',
  'right_load_percent',
  'score',
  'score_max',
  'grade',
  'red_flags',
];

export function GaitReportPage({ gateway, recordId, onShare }) {
  const [notification, setNotification] = useState({ id: 0, message: '' });
  const {
    status, data, error, retry, raw, patient,
  } = useGaitReport({
    gateway,
    recordId,
    mapper: mapGaitReport,
  });

  // AI 文案异步取；失败就一直用 mapper 的兜底，报告永远可读
  const facts = useMemo(
    () => (raw ? buildGaitAiFacts(raw, patient) : null),
    [raw, patient],
  );
  const ai = useAssessmentAiCopy({
    facts,
    patientInfo: patient,
    request: generateGaitTocAIReport,
    validate: validateGaitCopy,
    keyFields: AI_KEY_FIELDS,
  });

  const healthSummary = ai.copy?.healthSummary ?? buildGaitHealthSummary(facts);

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
          <GaitKeyMetrics
            metrics={data.keyMetrics}
          />
          <GaitSymmetry rows={data.measurementDetails.symmetry} />
          <GaitFootprintTrail trail={data.footprintTrail} />
          <GaitObservation observation={data.measurementDetails.observation} />
          <GaitLoadAnalysis signals={data.measurementDetails.signals} />
          <GaitAbilityGrid abilities={data.abilities} />
          <section
            className="gait-report__guidance-grid"
            aria-label="步态成长趋势"
          >
            <GaitTrend trend={data.trend} />
          </section>
          <GaitAiGuidance
            healthSummary={healthSummary}
            recommendations={ai.copy?.recommendations ?? data.recommendations}
            pending={ai.status === 'loading'}
          />
        </main>
        <GaitReportFooter footer={data.footer} />
      </div>
      <ToastRegion notification={notification} />
    </>
  );
}
