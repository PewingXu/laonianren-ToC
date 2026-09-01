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
import { useGripAiCopy } from '../hooks/useGripAiCopy';
import { useGripReport } from '../hooks/useGripReport';
import { mapGripReport } from '../mappers/mapGripReport';

/**
 * 合并建议：卡片的标题/图标/配色来自 mapper（属于设计），
 * 只有两条正文来自 AI。AI 没返回就整组用兜底，不混搭。
 */
function mergeAdvice(fallback, aiGroups) {
  if (!Array.isArray(aiGroups)) return fallback;
  return fallback.map((group) => {
    const match = aiGroups.find((item) => item.id === group.id);
    return match ? { ...group, items: [...match.items] } : group;
  });
}

function buildShareSummary(data) {
  const score = data.hero.hasScore ? `握力综合评分${data.hero.score}分` : '暂无握力综合评分';
  return `${data.patientName}的握力详细报告，检测时间${data.recordedAt}，${score}，最大握力${data.forces.maximum}${data.unit}。`;
}

export function GripReportPage({ gateway, recordId, onShare }) {
  const [notification, setNotification] = useState({ id: 0, message: '' });
  const { status, data, error, retry, raw, patient } = useGripReport({
    gateway,
    recordId,
    mapper: mapGripReport,
  });

  /*
   * AI 文案是异步的，不能挡着报告渲染 —— 数值部分本地就算好了，
   * 让用户对着空白页等几十秒的网络请求没有道理。
   * 所以报告先出，AI 回来后再替换掉 mapper 给的兜底文案；
   * 请求失败或校验不过就一直用兜底，报告永远可读。
   */
  const ai = useGripAiCopy(raw, patient);

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
          {/*
            AI 成功返回才覆盖；否则保持 mapper 的兜底文案。
            advice 需要保留 mapper 给的 title/icon/tone（AI 只出 items 文字）。
          */}
          <GripAiHealthSummary
            healthSummary={ai.aiSummary || data.healthSummary}
            pending={ai.status === 'loading'}
          />
          <GripAdvice advice={mergeAdvice(data.advice, ai.advice)} />
        </main>
        <GripReportFooter footer={data.footer} />
      </div>
      <ToastRegion notification={notification} />
    </>
  );
}
