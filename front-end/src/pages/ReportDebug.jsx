/**
 * 报告调试台  ——  /debug/report
 * ---------------------------------------------------------------
 * 目的：不接设备、不采集，直接把 CSV / Excel / JSON 灌进 0810 报告页，用于调试报告本身。
 *
 * 三条入料通道：
 *   1. CSV / XLSX   → 复用 csvImport.prepareImport 判型并组装算法入参，
 *                     再走 backendBridge.importCsvReport 让后端跑真算法拿 render_data。
 *                     与真机采集调的是同一套算法，所以结果口径一致。
 *   2. JSON         → 直接给 reportData（或整条记录 / 槽位表），完全绕过 Python，
 *                     调 mapper 和页面渲染最快。
 *   3. 历史记录     → 从 IndexedDB 挑一条已有记录灌进来，用于回归对照。
 *
 * 数据只在内存里，本页不写 IndexedDB、不改频次表，刷新即清空。
 *
 * 已知限制：总览页的能力卡跳的是 /history/report?id=<占位id>，本页的数据没落库，
 * 点进去会显示「未找到对应的记录」—— 请用上方页签切换项目。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { backendBridge } from '../lib/BackendBridge';
import { prepareImport, extractCsvSheetsFromXlsx } from '../lib/csvImport';
import { getDeviceRegion, REGION_LABEL } from '../lib/deviceRegion';
import { getHistory, getRecord } from '../lib/historyService';
import { createMemoryRecordGateway, REPORT_TYPES } from '../lib/localReportGateway';
import { shareReportSummary, saveAssessmentReminder } from '../lib/reportBoundaries';
// PDF 导出走 Chromium 原生打印（矢量、可搜索），不走 html2canvas。
// 调试台上放这个按钮的意义：不用连设备也能验证导出效果。
import { ReportPdfButton, buildReportFileName } from '../lib/reportPdf';
import { HealthOverviewPage } from '../reports-v2/features/health-overview/pages/HealthOverviewPage';
import { GripReportPage } from '../reports-v2/features/grip-report/pages/GripReportPage';
import { SitStandReportPage } from '../reports-v2/features/sit-stand-report/pages/SitStandReportPage';
import { StandingReportPage } from '../reports-v2/features/standing-report/pages/StandingReportPage';
import { GaitReportPage } from '../reports-v2/features/gait-report/pages/GaitReportPage';

const TYPE_LABELS = {
  grip: '握力',
  sitstand: '起坐',
  standing: '站立',
  gait: '步态',
};

const DEBUG_RECORD_ID = 'debug:report';

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(fr.error || new Error('读取文件失败'));
    fr.readAsText(file);
  });
}

function readFileBuffer(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error || new Error('读取文件失败'));
    fr.readAsArrayBuffer(file);
  });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * CSV 文本 → { type, reportData }。
 * 握力要左右手分别调一次算法，再包成与采集端点 /getHandPdf 一致的 { left, right, activeHand }；
 * 单手失败不整体失败（与采集端点行为一致）。
 */
async function csvToReport(csvText, region, username) {
  const { type, algoInput, frameCount } = prepareImport(csvText, region, username);

  if (type === 'grip') {
    const callHand = async (input) => {
      if (!input) return null;
      try {
        const r = await backendBridge.importCsvReport('grip', input);
        if (r?.code !== 0 || !r?.data?.render_data) return null;
        return r.data.render_data;
      } catch { return null; }
    };
    const left = await callHand(algoInput.left);
    const right = await callHand(algoInput.right);
    if (!left && !right) throw new Error('未生成任何一只手的报告');
    return { type, frameCount, reportData: { left, right, activeHand: left ? 'left' : 'right' } };
  }

  const resp = await backendBridge.importCsvReport(type, algoInput);
  if (resp?.code !== 0 || !resp?.data?.render_data) {
    throw new Error(resp?.msg || '后端未返回报告数据');
  }
  return { type, frameCount, reportData: resp.data.render_data };
}

/**
 * JSON 文本 → { grip?, sitstand?, standing?, gait? }。识别三种形状：
 *   ① 槽位表 { grip: reportData, ... }（本页「导出 JSON」的产物）
 *   ② 整条历史记录 { assessments: { grip: { report: { reportData } } } }
 *   ③ 裸 reportData —— 无法自判类型，需调用方指定 fallbackType
 */
function jsonToReports(jsonText, fallbackType) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`JSON 解析失败：${err.message}`);
  }
  if (!isObject(parsed)) throw new Error('JSON 顶层必须是对象');

  // ② 整条记录
  if (isObject(parsed.assessments)) {
    const out = {};
    for (const type of REPORT_TYPES) {
      const a = parsed.assessments[type];
      const rd = isObject(a?.report?.reportData) ? a.report.reportData
        : (isObject(a?.reportData) ? a.reportData : null);
      if (rd) out[type] = rd;
    }
    if (!Object.keys(out).length) throw new Error('记录 JSON 里没有可用的 reportData');
    return out;
  }

  // ① 槽位表
  const slotKeys = REPORT_TYPES.filter((t) => isObject(parsed[t]));
  if (slotKeys.length) {
    const out = {};
    for (const t of slotKeys) out[t] = parsed[t];
    return out;
  }

  // ③ 裸 reportData
  if (!fallbackType) {
    throw new Error('这份 JSON 看起来是单项 reportData，请先在上方页签选中对应项目再导入');
  }
  return { [fallbackType]: parsed };
}

export default function ReportDebug() {
  const navigate = useNavigate();

  const [patient, setPatient] = useState({ name: '调试用户', gender: '男', age: '70', weight: '60' });
  const [region, setRegion] = useState(() => getDeviceRegion());
  const [reports, setReports] = useState({});          // { grip: reportData, ... }
  const [sources, setSources] = useState({});          // { grip: '张三_握力.csv · 1024 帧' }
  const [view, setView] = useState('overview');        // 'overview' | REPORT_TYPES[n]
  const [busy, setBusy] = useState('');
  const [logs, setLogs] = useState([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [historyList, setHistoryList] = useState([]);

  const csvInputRef = useRef(null);
  const jsonInputRef = useRef(null);
  // 报告滚动容器 = PDF 导出的打印范围（print.css 认这个节点上的 data-print-root）
  const reportScrollRef = useRef(null);

  const appendLog = useCallback((line, tone = 'info') => {
    setLogs((prev) => [...prev.slice(-40), { line, tone, key: `${prev.length}-${line}` }]);
  }, []);

  useEffect(() => {
    getHistory()
      .then((list) => setHistoryList((list || []).slice(0, 30)))
      .catch(() => setHistoryList([]));
  }, []);

  /**
   * 必须 useMemo：交付包的 useXxxReport 把 gateway 放进 useEffect 依赖数组，
   * 每次渲染新建对象会导致无限重新取数。
   * 不传 recordId（只传占位 fallbackId）：本页数据没落库，查不到分数，同龄对比自然隐藏，不伪造。
   */
  const gateway = useMemo(() => createMemoryRecordGateway({
    reports,
    patient,
    institution: `${REGION_LABEL[region] || ''}·调试`,
    fallbackId: DEBUG_RECORD_ID,
  }), [reports, patient, region]);

  const loadedTypes = REPORT_TYPES.filter((t) => isObject(reports[t]));

  /* ─── CSV / XLSX 导入 ─── */
  const handleCsvFiles = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    setBusy('正在解析...');
    const nextReports = {};
    const nextSources = {};

    for (const file of files) {
      const isExcel = /\.xlsx?$/i.test(file.name);
      const baseName = file.name.replace(/\.(csv|xlsx?)$/i, '');
      const displayName = (baseName.split(/[_\-（(]/)[0] || baseName).trim() || baseName;
      try {
        if (isExcel) {
          const sheets = await extractCsvSheetsFromXlsx(await readFileBuffer(file));
          if (!sheets.length) throw new Error('Excel 中没有可用的数据表');
          for (const { sheetName, csvText } of sheets) {
            setBusy(`正在跑算法 ${file.name} · ${sheetName} ...`);
            try {
              const { type, reportData, frameCount } = await csvToReport(csvText, region, displayName);
              nextReports[type] = reportData;
              nextSources[type] = `${file.name}[${sheetName}] · ${frameCount} 行`;
              appendLog(`✓ ${TYPE_LABELS[type]}：${file.name}[${sheetName}]`, 'ok');
            } catch (err) {
              appendLog(`✗ ${file.name}[${sheetName}]：${err.message}`, 'err');
            }
          }
        } else {
          setBusy(`正在跑算法 ${file.name} ...`);
          const { type, reportData, frameCount } = await csvToReport(await readFileText(file), region, displayName);
          nextReports[type] = reportData;
          nextSources[type] = `${file.name} · ${frameCount} 行`;
          appendLog(`✓ ${TYPE_LABELS[type]}：${file.name}`, 'ok');
        }
      } catch (err) {
        appendLog(`✗ ${file.name}：${err.message}`, 'err');
      }
    }

    setBusy('');
    const gotTypes = Object.keys(nextReports);
    if (gotTypes.length) {
      setReports((prev) => ({ ...prev, ...nextReports }));
      setSources((prev) => ({ ...prev, ...nextSources }));
      // 只导入了一项时直接切到那一项，省一次点击
      if (gotTypes.length === 1) setView(gotTypes[0]);
    }
  }, [region, appendLog]);

  /* ─── JSON 导入 ─── */
  const handleJsonFiles = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    setBusy('正在解析 JSON...');
    const nextReports = {};
    const nextSources = {};
    for (const file of files) {
      try {
        const parsed = jsonToReports(await readFileText(file), view === 'overview' ? null : view);
        for (const [type, rd] of Object.entries(parsed)) {
          nextReports[type] = rd;
          nextSources[type] = file.name;
          appendLog(`✓ ${TYPE_LABELS[type]}：${file.name}`, 'ok');
        }
      } catch (err) {
        appendLog(`✗ ${file.name}：${err.message}`, 'err');
      }
    }
    setBusy('');
    const gotTypes = Object.keys(nextReports);
    if (gotTypes.length) {
      setReports((prev) => ({ ...prev, ...nextReports }));
      setSources((prev) => ({ ...prev, ...nextSources }));
      if (gotTypes.length === 1) setView(gotTypes[0]);
    }
  }, [view, appendLog]);

  /* ─── 从历史记录载入 ─── */
  const handleLoadHistory = useCallback(async (recordId) => {
    if (!recordId) return;
    setBusy('正在读取历史记录...');
    try {
      const record = await getRecord(recordId);
      if (!record) throw new Error('记录不存在');
      const next = {};
      const nextSrc = {};
      for (const type of REPORT_TYPES) {
        const a = record.assessments?.[type];
        const rd = isObject(a?.report?.reportData) ? a.report.reportData
          : (isObject(a?.reportData) ? a.reportData : null);
        if (rd) {
          next[type] = rd;
          nextSrc[type] = `历史记录 ${record.patientName || ''}`;
        }
      }
      if (!Object.keys(next).length) throw new Error('这条记录里没有四项报告数据');
      setReports(next);
      setSources(nextSrc);
      setPatient({
        name: record.patientName || '调试用户',
        gender: record.patientGender || '男',
        age: record.patientAge ?? '',
        weight: record.patientWeight ?? '',
      });
      appendLog(`✓ 载入历史记录：${record.patientName || recordId}（${Object.keys(next).map(t => TYPE_LABELS[t]).join('、')}）`, 'ok');
    } catch (err) {
      appendLog(`✗ 载入失败：${err.message}`, 'err');
    } finally {
      setBusy('');
    }
  }, [appendLog]);

  /* ─── 导出当前槽位为 JSON（存回归样本用）─── */
  const handleExportJson = useCallback(() => {
    if (!loadedTypes.length) return;
    const blob = new Blob([JSON.stringify(reports, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-debug-${loadedTypes.join('-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [reports, loadedTypes]);

  const handleClear = useCallback(() => {
    setReports({});
    setSources({});
    setView('overview');
    appendLog('已清空所有槽位', 'info');
  }, [appendLog]);

  const renderReport = () => {
    if (!loadedTypes.length) {
      return (
        <div className="h-full flex items-center justify-center">
          <div className="text-center max-w-md px-6">
            <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>还没有数据</p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              选 CSV / Excel 会调后端真算法出报告；选 JSON 则直接把 reportData 灌进页面，
              不经过 Python，最适合调 mapper 和样式。
            </p>
          </div>
        </div>
      );
    }

    if (view === 'overview') {
      return (
        <HealthOverviewPage
          gateway={gateway}
          recordId={DEBUG_RECORD_ID}
          onShare={shareReportSummary}
          onSaveReminder={saveAssessmentReminder}
        />
      );
    }

    if (!isObject(reports[view])) {
      return (
        <div className="h-full flex items-center justify-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {TYPE_LABELS[view]} 槽位为空，请先导入
          </p>
        </div>
      );
    }

    const common = { gateway, recordId: DEBUG_RECORD_ID, onShare: shareReportSummary };
    switch (view) {
      case 'grip': return <GripReportPage {...common} />;
      case 'sitstand': return <SitStandReportPage {...common} />;
      case 'standing': return <StandingReportPage {...common} />;
      case 'gait': return <GaitReportPage {...common} />;
      default: return null;
    }
  };

  const tabBase = 'text-xs px-3 py-1.5 rounded-lg font-semibold transition-all';

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-6 shrink-0 z-20"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)', boxShadow: 'var(--shadow-xs)' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ color: 'var(--text-muted)' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>报告调试台</h1>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#FEF3C7', color: '#B45309' }}>
            数据不入库
          </span>
        </div>

        {/* 项目页签 */}
        <div className="flex items-center gap-2">
          <button onClick={() => setView('overview')} className={tabBase}
            style={view === 'overview'
              ? { background: 'var(--zeiss-blue)', color: '#fff' }
              : { background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
            综合报告
          </button>
          {REPORT_TYPES.map((t) => {
            const has = isObject(reports[t]);
            return (
              <button key={t} onClick={() => setView(t)} disabled={!has} className={tabBase}
                style={view === t
                  ? { background: 'var(--zeiss-blue)', color: '#fff' }
                  : { background: 'var(--bg-tertiary)', color: has ? 'var(--text-secondary)' : 'var(--text-muted)', opacity: has ? 1 : 0.45 }}>
                {TYPE_LABELS[t]}{has ? '' : ' ·'}
              </button>
            );
          })}
          {loadedTypes.length > 0 && (
            <ReportPdfButton
              targetRef={reportScrollRef}
              fileName={buildReportFileName(patient.name, view === 'overview' ? '综合评估报告' : `${TYPE_LABELS[view]}评估报告`)}
              title={view === 'overview' ? '综合评估报告' : `${TYPE_LABELS[view]}评估报告`}
            />
          )}
          <button onClick={() => setPanelOpen((v) => !v)} className="zeiss-btn-ghost text-xs ml-2">
            {panelOpen ? '收起工具栏' : '展开工具栏'}
          </button>
        </div>
      </header>

      {/* 工具栏 */}
      {panelOpen && (
        <div className="shrink-0 px-6 py-3 flex flex-wrap items-center gap-x-5 gap-y-3 z-10"
          style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)' }}>
          {/* 入料 */}
          <div className="flex items-center gap-2">
            <input ref={csvInputRef} type="file" accept=".csv,.xlsx,.xls" multiple hidden onChange={handleCsvFiles} />
            <input ref={jsonInputRef} type="file" accept=".json" multiple hidden onChange={handleJsonFiles} />
            <button onClick={() => csvInputRef.current?.click()} disabled={!!busy}
              className="zeiss-btn-primary text-xs py-2 px-4">选 CSV / Excel</button>
            <button onClick={() => jsonInputRef.current?.click()} disabled={!!busy}
              className="zeiss-btn-secondary text-xs py-2 px-4">选 JSON</button>
          </div>

          {/* 采集地（影响站立/起坐/步态的垫子线序与翻转） */}
          <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            采集地
            <select value={region} onChange={(e) => setRegion(e.target.value)}
              className="text-xs px-2 py-1 rounded-md"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}>
              <option value="guangzhou">广州</option>
              <option value="beijing">北京</option>
            </select>
          </label>

          {/* 从历史记录载入 */}
          <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            历史记录
            <select defaultValue="" onChange={(e) => { handleLoadHistory(e.target.value); e.target.value = ''; }}
              className="text-xs px-2 py-1 rounded-md max-w-[200px]"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}>
              <option value="">选一条载入…</option>
              {historyList.map((h) => (
                <option key={h.id} value={h.id}>{h.patientName || '未知'} · {h.dateStr || ''}</option>
              ))}
            </select>
          </label>

          {/* 受试者信息（只影响报告页头，不参与算法） */}
          <div className="flex items-center gap-1.5">
            {[
              ['name', '姓名', 'w-20'],
              ['age', '年龄', 'w-12'],
              ['weight', '体重', 'w-14'],
            ].map(([key, label, w]) => (
              <label key={key} className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {label}
                <input value={patient[key] ?? ''} onChange={(e) => setPatient((p) => ({ ...p, [key]: e.target.value }))}
                  className={`${w} text-xs px-2 py-1 rounded-md`}
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }} />
              </label>
            ))}
            <label className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
              性别
              <select value={patient.gender} onChange={(e) => setPatient((p) => ({ ...p, gender: e.target.value }))}
                className="text-xs px-2 py-1 rounded-md"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}>
                <option value="男">男</option>
                <option value="女">女</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button onClick={handleExportJson} disabled={!loadedTypes.length}
              className="zeiss-btn-ghost text-xs" style={loadedTypes.length ? {} : { opacity: 0.45 }}>导出 JSON</button>
            <button onClick={handleClear} disabled={!loadedTypes.length}
              className="zeiss-btn-ghost text-xs" style={loadedTypes.length ? {} : { opacity: 0.45 }}>清空</button>
          </div>

          {/* 状态行 */}
          <div className="w-full flex items-center gap-4 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {busy ? (
              <span style={{ color: 'var(--zeiss-blue)' }}>{busy}</span>
            ) : (
              <span>
                已载入：{loadedTypes.length
                  ? loadedTypes.map((t) => `${TYPE_LABELS[t]}（${sources[t] || '—'}）`).join('　')
                  : '无'}
              </span>
            )}
            {logs.length > 0 && (
              <span className="truncate" style={{ color: logs[logs.length - 1].tone === 'err' ? '#DC2626' : 'var(--text-muted)' }}>
                {logs[logs.length - 1].line}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 报告区。交付包页面自己没有内滚动容器，index.css 又禁掉了 body 滚动，滚动条挂在这里。
          这个节点同时是 PDF 导出的打印范围（reportPdf.jsx 往上打 data-print-root） */}
      <main ref={reportScrollRef} className="flex-1 min-h-0 overflow-auto">
        {renderReport()}
      </main>
    </div>
  );
}
