import { useEffect, useMemo, useState } from 'react';
import { ToastRegion } from '../../health-overview/components/ToastRegion';
import { SitStandHero } from '../components/SitStandHero';
import { SitStandAdvice } from '../components/SitStandAdvice';
import { SitStandDetailsPanel } from '../components/SitStandDetailsPanel';
import { SitStandEvaluation } from '../components/SitStandEvaluation';
import { SitStandMetricGrid } from '../components/SitStandMetricGrid';
import { SitStandReportFooter } from '../components/SitStandReportFooter';
import { SitStandReportHeader } from '../components/SitStandReportHeader';
import { SitStandReportState } from '../components/SitStandReportState';
import { useSitStandReport } from '../hooks/useSitStandReport';
import { mapSitStandReport } from '../mappers/mapSitStandReport';
import { buildSitStandAiFacts } from '../../../../lib/assessmentAiFacts';
import { generateSitStandTocAIReport } from '../../../../lib/gripPythonApi';
import {
  useAssessmentAiCopy,
  validateSitStandCopy,
} from '../../../shared/useAssessmentAiCopy';

function buildShareSummary(data) {
  const score = data.hero.hasScore ? `起身综合评分${data.hero.score}分` : '暂无起身综合评分';
  return `${data.patientName}的起身详细报告，检测时间${data.recordedAt}，${score}。`;
}

/** AI 只替换正文；卡片的图标与顺序属于设计，始终来自 mapper */
function mergeAdvice(fallback, aiAdvice) {
  if (!Array.isArray(aiAdvice) || aiAdvice.length !== fallback.length) return fallback;
  return fallback.map((item, index) => ({
    ...item,
    title: aiAdvice[index].title,
    detail: aiAdvice[index].detail,
  }));
}

const AI_KEY_FIELDS = ['total_seconds', 'average_seconds', 'left_right_ratio', 'score'];

export function SitStandReportPage({ gateway, recordId, onShare }) {
  const [notification, setNotification] = useState({ id: 0, message: '' });
  const {
    status, data, error, retry, raw, patient,
  } = useSitStandReport({
    gateway,
    recordId,
    mapper: mapSitStandReport,
  });

  /*
   * AI 文案异步取。报告数值是本地算好的，先渲染；AI 回来后替换掉
   * mapper 给的兜底文案。失败或校验不过就一直用兜底，报告永远可读。
   */
  const facts = useMemo(
    () => (raw ? buildSitStandAiFacts(raw, patient) : null),
    [raw, patient],
  );
  const ai = useAssessmentAiCopy({
    facts,
    patientInfo: patient,
    request: generateSitStandTocAIReport,
    validate: validateSitStandCopy,
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
        <main className="sit-stand-report sit-stand-report--state" aria-label="起身详细报告">
          <SitStandReportState
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
    const heading = target.matches('h2, h3') ? target : target.querySelector('h2, h3');
    if (heading instanceof HTMLElement) heading.focus({ preventScroll: true });
  }

  return (
    <>
      <div
        className="sit-stand-report"
        data-testid="sit-stand-report-ready"
        data-record-id={data.recordId}
      >
        <SitStandReportHeader
          recordId={data.recordId}
          recordedAt={data.recordedAt}
          onShare={handleShare}
          onShowDate={() => notify(`检测时间：${data.recordedAt}`)}
        />
        <main className="sit-stand-report__content" aria-label="起身详细报告内容">
          <SitStandHero hero={data.hero} />
          <SitStandMetricGrid metrics={data.metrics} onShowDetail={handleShowDetail} />
          <SitStandDetailsPanel details={data.details} />
          <section
            className="sit-stand-report__evaluation-grid"
            aria-label="AI健康总结与个性化建议"
          >
            <SitStandEvaluation
              evaluation={ai.copy?.health
                ? { ...data.evaluation, health: ai.copy.health }
                : data.evaluation}
              findings={data.hero.findings}
            />
            <SitStandAdvice advice={mergeAdvice(data.advice, ai.copy?.advice)} />
          </section>
          <SitStandReportFooter />
        </main>
      </div>
      <ToastRegion notification={notification} />
    </>
  );
}
