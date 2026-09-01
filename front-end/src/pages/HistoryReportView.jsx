import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getRecord, updateAssessmentAiReport } from '../lib/historyService';
import { backendBridge } from '../lib/BackendBridge';
import { localReportGateway, REPORT_TYPES } from '../lib/localReportGateway';
import { shareReportSummary } from '../lib/reportBoundaries';
// PDF 导出走 Chromium 原生打印（矢量、可搜索），不走 html2canvas。
import { ReportPdfButton, buildReportFileName } from '../lib/reportPdf';
// ── 0810 报告交付包页面（src/reports-v2/）──
// 四项报告全部走 reports-v2 的交付包原生页面。
// 这些页面自己通过 gateway 取数并处理 加载/失败/数据不足 三态，不接收 reportData 做展示。
import { GripReportPage } from '../reports-v2/features/grip-report/pages/GripReportPage';
import { SitStandReportPage } from '../reports-v2/features/sit-stand-report/pages/SitStandReportPage';
import { StandingReportPage } from '../reports-v2/features/standing-report/pages/StandingReportPage';
import { GaitReportPage } from '../reports-v2/features/gait-report/pages/GaitReportPage';

const TYPE_LABELS = {
  grip: '握力评估',
  sitstand: '起坐能力评估',
  standing: '静态站立评估',
  gait: '行走步态评估',
};


/* ─── 历史报告查看页面 ─── */
export default function HistoryReportView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const recordId = searchParams.get('id');
  const assessmentType = searchParams.get('type');
  const isPageMountedRef = useRef(true);
  // 打印范围：指向下面承载报告的滚动容器，print.css 靠这个节点上的 data-print-root 定界
  const reportScrollRef = useRef(null);

  // 从后端数据库获取记录
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    isPageMountedRef.current = true;
    return () => {
      isPageMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!recordId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getRecord(recordId).then(data => {
      if (!cancelled) {
        setRecord(data);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [recordId]);

  const patientName = record?.patientName || '未知';
  // 目前无人消费：0810 交付包的四个报告页一期不接 AI（AI 区块走其自带的降级文案）。
  // 保留是给二期接 AI 用的 —— 届时报告页的 AI effect 会依赖它，
  // 而 useMemo 是必需的：每次渲染都新建对象会让那个 effect 不断重跑。
  const patientInfo = useMemo(() => (record ? {
    name: record.patientName,
    gender: record.patientGender,
    age: record.patientAge,
    weight: record.patientWeight,
  } : { name: '未知' }), [record]);

  // 从历史记录中提取报告数据
  // 两种存法都真实存在（assessmentScoring.js 里同样有这两条兜底），与 localReportGateway 口径保持一致，
  // 否则会出现「外壳判定无数据、交付包页面其实能渲染」的错位
  const assessmentData = record?.assessments?.[assessmentType];
  const reportData = assessmentData?.report?.reportData || assessmentData?.reportData || null;

  // 该类型是否已换成 reports-v2 页面（四项全部是）
  const isReportV2 = REPORT_TYPES.includes(assessmentType);

  const handleBack = () => navigate('/history');

  // AI 报告生成完成后，补存到历史记录。
  // 同 patientInfo：一期没有页面调它，保留是给二期给四个报告页接 AI 时用的回写通道。
  const handleAiReportReady = useCallback(async (aiData) => {
    if (!record || !assessmentType) return;
    try {
      // 写回存储（现为异步：写 IndexedDB）
      const ok = await updateAssessmentAiReport(record.id, assessmentType, aiData);
      if (!ok) return;

      if (isPageMountedRef.current) {
        setRecord(prev => {
          if (!prev?.assessments?.[assessmentType]) return prev;
          return {
            ...prev,
            assessments: {
              ...prev.assessments,
              [assessmentType]: {
                ...prev.assessments[assessmentType],
                report: {
                  ...(prev.assessments[assessmentType].report || {}),
                  reportData: {
                    ...(prev.assessments[assessmentType].report?.reportData || {}),
                    aiReport: aiData,
                  },
                },
              },
            },
          };
        });
      }
    } catch (e) {
      console.error('AI 报告补存失败:', e);
    }
  }, [record, assessmentType]);

  // CSV 导出
  const [csvExporting, setCsvExporting] = useState(false);
  const assessmentIds = assessmentData?.assessmentId || null;

  const handleExportCsv = useCallback(async () => {
    if (!assessmentIds) {
      alert('该历史记录没有关联的采集数据 ID，无法导出 CSV');
      return;
    }
    setCsvExporting(true);
    try {
      // assessmentIds 可能是逗号分隔的多个 ID（如握力左右手）
      const ids = assessmentIds.split(',').filter(Boolean);
      const sampleTypeMap = { grip: '1', sitstand: '3', standing: '4', gait: 'gait' };
      const params = ids.length > 1
        ? { assessmentIds: ids, sampleType: sampleTypeMap[assessmentType] || '' }
        : { assessmentId: ids[0], sampleType: sampleTypeMap[assessmentType] || '' };
      const resp = await backendBridge.exportCsv(params);
      if (resp?.code === 0 && resp?.data?.fileName) {
        const url = backendBridge.getCsvDownloadUrl(resp.data.fileName);
        const a = document.createElement('a');
        a.href = url;
        a.download = resp.data.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        alert('导出失败: ' + (resp?.msg || '未知错误'));
      }
    } catch (e) {
      console.error('CSV导出失败:', e);
      alert('CSV导出失败: ' + e.message);
    } finally {
      setCsvExporting(false);
    }
  }, [assessmentIds, assessmentType]);

  const renderReport = () => {
    if (loading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 rounded-full animate-spin mb-4 mx-auto"
              style={{ borderColor: 'var(--border-light)', borderTopColor: 'var(--zeiss-blue)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>加载中...</p>
          </div>
        </div>
      );
    }

    if (!record) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <p style={{ color: 'var(--text-muted)' }}>未找到对应的记录</p>
        </div>
      );
    }

    if (!reportData) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text-muted)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>该评估记录没有保存报告数据</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>请重新进行评估以生成完整报告</p>
          </div>
        </div>
      );
    }

    switch (assessmentType) {
      // ── 四项走 0810 交付包页面 ──
      // 患者信息不用透传：交付包页面从 gateway 返回的记录里自己读。
      // 一期不接 onAiReportReady（交付包页面没有这个入口），AI 区块走其自带的保守降级文案。
      case 'grip':
        return <GripReportPage gateway={localReportGateway} recordId={recordId} onShare={shareReportSummary} />;
      case 'standing':
        return <StandingReportPage gateway={localReportGateway} recordId={recordId} onShare={shareReportSummary} />;
      case 'sitstand':
        return <SitStandReportPage gateway={localReportGateway} recordId={recordId} onShare={shareReportSummary} />;
      case 'gait':
        return <GaitReportPage gateway={localReportGateway} recordId={recordId} onShare={shareReportSummary} />;
      default:
        return (
          <div className="flex-1 flex items-center justify-center">
            <p style={{ color: 'var(--text-muted)' }}>未找到对应的报告数据</p>
          </div>
        );
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-6 shrink-0 z-20"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)', boxShadow: 'var(--shadow-xs)' }}>
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <img src="/logo1.png" alt="Logo" className="w-8 h-8 rounded-lg" />
          <h1 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>
            {patientName} 的{TYPE_LABELS[assessmentType] || '评估'}报告
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs px-3 py-1 rounded-full" style={{ background: 'var(--zeiss-blue-light)', color: 'var(--zeiss-blue)' }}>
            历史记录
          </span>
          {record?.dateStr && (
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{record.dateStr}</span>
          )}
          {/* 五项报告都走 reports-v2，PDF 一律用 Chromium 原生打印（矢量、可搜索） */}
          {isReportV2 && reportData && (
            <ReportPdfButton
              targetRef={reportScrollRef}
              fileName={buildReportFileName(patientName, TYPE_LABELS[assessmentType], record?.dateStr)}
              title={`${patientName} 的${TYPE_LABELS[assessmentType] || '评估'}报告`}
            />
          )}
          {assessmentIds && (
            <button onClick={handleExportCsv} disabled={csvExporting}
              className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all"
              style={{ color: '#059669', background: '#ECFDF5', border: '1px solid #05966930', opacity: csvExporting ? 0.6 : 1 }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {csvExporting ? '导出中...' : '导出 CSV'}
            </button>
          )}
          <button onClick={handleBack} className="zeiss-btn-ghost text-xs flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
            </svg>
            返回历史记录
          </button>
        </div>
      </header>

      {/* Report Content */}
      {/*
        交付包页面是按整页应用写的，靠 body 滚动，而 index.css:57 把 html/body/#root 都设成
        overflow:hidden，所以必须由这里的 <main> 承担滚动。站立报告原本还在 body 上要求
        min-width:1200px（已在 embedded.css 里解除），窄窗口时需要横向滚动，故两轴都放开。
        五项报告现在都是 reports-v2 页面，isReportV2 恒真；三元式保留是给未知 type 兜底
        （renderReport 的 default 分支会渲染一段提示文案，不需要滚动）。
      */}
      <main ref={reportScrollRef} className={`flex-1 min-h-0 ${isReportV2 ? 'overflow-auto' : 'overflow-hidden'}`}>
        {renderReport()}
      </main>

      <div className="h-6 flex items-center px-6 shrink-0 z-10">
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>powered by 矩侨工业</span>
      </div>
    </div>
  );
}
