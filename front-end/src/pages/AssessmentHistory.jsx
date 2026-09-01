import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssessment } from '../contexts/AssessmentContext';
import { searchHistory, deleteRecord, clearHistory, saveAssessmentSession, getRecord } from '../lib/historyService';
import { backendBridge } from '../lib/BackendBridge';
import { prepareImport, extractCsvSheetsFromXlsx, TYPE_LABEL } from '../lib/csvImport';
import { REGION_LABEL } from '../lib/deviceRegion';
import {
  getRankIncludingSelf,
  getCount,
  loadDistribution,
  loadScoreIndex,
  setRecordScoresBatch,
  removeRecordScores,
  rebuildDistributionFromIndex,
  computeRankFromDist,
  clearDistribution,
} from '../lib/scoreRanking';
import {
  buildComprehensiveScoreResult,
  ASSESSMENT_KEYS,
  ASSESSMENT_LABELS as SHORT_LABELS,
} from '../lib/assessmentScoring';

const MODULE_COUNT = ASSESSMENT_KEYS.length;
// 表格栅格：序号1 + 患者2 + 日期1 + 各评估各1 + 完成度2 + 操作2
const GRID_TEMPLATE = `repeat(${6 + MODULE_COUNT + 2}, minmax(0, 1fr))`;

const ASSESSMENT_LABELS = {
  grip: '握力评估',
  sitstand: '起坐能力评估',
  standing: '静态站立评估',
  gait: '行走步态评估',
};

const ASSESSMENT_ICONS = {
  grip: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M9.5 7V3.5a1.5 1.5 0 013 0V7m0 0V2.5a1.5 1.5 0 013 0V7m0 0V4a1.5 1.5 0 013 0v4.5M15.5 7V5.5a1.5 1.5 0 013 0V12c0 4.142-3.358 7.5-7.5 7.5S3.5 16.142 3.5 12v-1.5a1.5 1.5 0 013 0V7" />
    </svg>
  ),
  sitstand: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="12" cy="5" r="2" />
      <path d="M8 10h8l-2 6H10l-2-6zm2 6v5m4-5v5" />
    </svg>
  ),
  standing: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <ellipse cx="8" cy="16" rx="3" ry="5" />
      <ellipse cx="16" cy="16" rx="3" ry="5" />
    </svg>
  ),
  gait: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="12" cy="4" r="2" />
      <path d="M10 8l-3 7 3-1 2 8m0-14l3 5-2 2 3 7" />
    </svg>
  ),
};

export default function AssessmentHistory() {
  const navigate = useNavigate();
  const { institution, patientInfo } = useAssessment();
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [expandedRow, setExpandedRow] = useState(null);
  const [loading, setLoading] = useState(false);
  const pageSize = 10;

  // 异步数据状态
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // CSV 导入 / 排名
  const fileInputRef = useRef(null);
  const importModeRef = useRef('base'); // 'base'=导入基础库 | 'eval'=导入测评（与基础比排名）
  const [importRegion, setImportRegion] = useState('guangzhou');
  const [busy, setBusy] = useState(false);       // 导入/生成进行中
  const [busyMsg, setBusyMsg] = useState('');
  const [rankMap, setRankMap] = useState({});    // recordId -> { [type]: {percent, total, ...} }

  // 搜索防抖：每敲一个字都要全量读取+过滤历史，记录多时逐键卡顿；停止输入 280ms 后再查
  const [debouncedTerm, setDebouncedTerm] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTerm(searchTerm), 280);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // 异步加载数据
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    searchHistory({
      keyword: debouncedTerm,
      date: dateFilter,
      page: currentPage,
      pageSize,
      light: true, // 列表只要摘要字段，不加载含 base64 图片的报告数据
    }).then(result => {
      if (!cancelled) {
        setItems(result.items || []);
        setTotal(result.total || 0);
        setTotalPages(result.totalPages || 0);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setItems([]);
        setTotal(0);
        setTotalPages(0);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [debouncedTerm, dateFilter, currentPage, refreshKey]);

  useEffect(() => { setCurrentPage(1); }, [debouncedTerm, dateFilter]);

  const handleDelete = useCallback(async (id) => {
    await deleteRecord(id);
    // 同步移出得分索引并重建频次表，否则被删的人还留在排名基数里
    removeRecordScores(id);
    rebuildDistributionFromIndex();
    setShowDeleteConfirm(null);
    setRefreshKey(k => k + 1);
  }, []);

  const handleClear = useCallback(async () => {
    await clearHistory();
    clearDistribution(); // 记录清空了，排名两张表也一起清
    setShowClearConfirm(false);
    setRankMap({});
    setRefreshKey(k => k + 1);
  }, []);

  const getCompletedCount = (assessments) => {
    if (!assessments) return 0;
    return ASSESSMENT_KEYS.filter(k => assessments[k]?.completed).length;
  };

  const viewReport = (recordId, type) => {
    navigate(`/history/report?id=${recordId}&type=${type}`);
  };

  // ─── CSV 批量导入（评分排名用；每个 csv = 一位受试者的一个项目）───
  const readFileText = (file) => new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(fr.error || new Error('读取文件失败'));
    fr.readAsText(file);
  });

  /** 取一条记录里各模块的有效得分（无效/未完成项不计入排名） */
  const extractItemScores = (rec) => {
    const patient = { name: rec.patientName, gender: rec.patientGender || '男', age: rec.patientAge, weight: rec.patientWeight };
    const comp = buildComprehensiveScoreResult(rec.assessments || {}, patient);
    const itemScores = {};
    (comp.itemResults || []).forEach(it => {
      if (rec.assessments?.[it.type]?.completed && !it.invalid && it.score > 0) {
        itemScores[it.type] = it.score;
      }
    });
    // 不做综合总分排名：历史数据集里各人完成项目数不一，凑不齐 4 项无法公平比总分，只保留单项排名
    return itemScores;
  };

  /**
   * 全量重建：读全部记录算分 → 写「得分索引」→ 由索引聚合出「频次表」（各一次落盘）。
   * 只在【导入完成】或【手动点重算排名】时执行；日常进页面不跑这个。
   */
  const recalcAllScores = useCallback(async () => {
    const all = await searchHistory({ keyword: '', date: '', page: 1, pageSize: 100000 });
    const records = all.items || [];
    const perRecord = [];
    const indexEntries = {};
    for (const rec of records) {
      const itemScores = extractItemScores(rec);
      indexEntries[rec.id] = itemScores;
      perRecord.push({ id: rec.id, sessionId: rec.sessionId, name: rec.patientName, itemScores });
    }
    setRecordScoresBatch(indexEntries, true);          // ① 整表替换得分索引（一次落盘）
    const dist = rebuildDistributionFromIndex();        // ② 由索引聚合频次表（一次落盘）

    const nextRank = {};
    for (const r of perRecord) {
      const ranks = {};
      for (const type in r.itemScores) {
        ranks[type] = { score: r.itemScores[type], ...computeRankFromDist(dist, type, r.itemScores[type]) };
      }
      nextRank[r.id] = ranks;
    }
    setRankMap(nextRank);
    return { records, perRecord, nextRank, dist };
  }, []);

  /**
   * 进入历史页 / 翻页 / 搜索后，只为【当前页这 10 条】显示徽章：
   *   优先直接查「得分索引」（纯内存查表，不碰报告数据）；
   *   索引里没有的（老记录/刚导入未入索引）才按 id 读一次完整记录算分，并回填索引，下次即命中。
   * 这样常态下进页面 = 两次查表，与总记录数、报告体积都无关。
   */
  useEffect(() => {
    if (!items.length) return;
    let cancelled = false;
    (async () => {
      try {
        const dist = loadDistribution();
        const index = loadScoreIndex();
        const next = {};
        const backfill = {};
        for (const it of items) {
          if (cancelled) return;
          let itemScores = index[String(it.id)];
          if (!itemScores) {
            const full = await getRecord(it.id);   // 索引未命中才读报告
            if (!full) continue;
            itemScores = extractItemScores(full);
            backfill[it.id] = itemScores;
          }
          const ranks = {};
          for (const type in itemScores) {
            ranks[type] = { score: itemScores[type], ...computeRankFromDist(dist, type, itemScores[type]) };
          }
          next[it.id] = ranks;
        }
        if (cancelled) return;
        if (Object.keys(backfill).length) setRecordScoresBatch(backfill); // 回填，一次落盘
        setRankMap(prev => ({ ...prev, ...next }));
      } catch (err) {
        console.error('计算当前页排名失败:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [items]);

  const handleFilesSelected = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const mode = importModeRef.current; // 'base'=导入基础库 | 'eval'=导入测评
    setBusy(true);
    let ok = 0;
    const errors = [];
    const subjectKeys = new Set(); // 本次导入涉及的受试者

    // 导入一份 csv 文本（csv 文件或 xlsx 的一个 sheet 均走此函数）
    const importOneCsvText = async (csvText, subjectKey, displayName) => {
      const { type, algoInput } = prepareImport(csvText, importRegion, displayName);
      let renderData = null;
      if (type === 'grip') {
        // 握力：左右手分别调算法，再包装成与采集端点 /getHandPdf 一致的结构。
        // 单手失败不整体失败（与端点一致：失败的手为 null，另一只照常出报告）
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
        renderData = { left, right, activeHand: left ? 'left' : 'right' };
      } else {
        const resp = await backendBridge.importCsvReport(type, algoInput);
        if (resp?.code !== 0 || !resp?.data?.render_data) {
          throw new Error(resp?.msg || '后端未返回报告数据');
        }
        renderData = resp.data.render_data;
      }

      const assessments = {
        [type]: {
          completed: true,
          report: { reportData: renderData },
          completedAt: new Date().toISOString(),
        },
      };
      const patient = { name: displayName, gender: '男', age: '', weight: '' };
      await saveAssessmentSession(patient, `${REGION_LABEL[importRegion]}·导入`, assessments, `import_${subjectKey}`);
      subjectKeys.add(subjectKey);
      return type;
    };

    for (const file of files) {
      setBusyMsg(`正在导入 ${file.name} ...`);
      const isExcel = /\.xlsx?$/i.test(file.name);
      try {
        if (isExcel) {
          // Excel 工作簿（广州版“批量导出数据”格式）：一个文件 = 一位受试者，每个 sheet = 一个项目。
          // 受试者键用完整基名（去掉尾部“_四项评估数据”），同名不同编号的人不会混；显示姓名取第一段。
          const baseName = file.name.replace(/\.xlsx?$/i, '').replace(/_四项评估数据$/, '');
          const subjectKey = baseName;
          const displayName = (baseName.split(/[_\-（(]/)[0] || baseName).trim() || baseName;
          const buf = await new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = () => reject(fr.error || new Error('读取文件失败'));
            fr.readAsArrayBuffer(file);
          });
          const sheets = await extractCsvSheetsFromXlsx(buf);
          if (!sheets.length) throw new Error('Excel 中没有可用的数据表');
          for (const { sheetName, csvText } of sheets) {
            setBusyMsg(`正在导入 ${file.name} · ${sheetName} ...`);
            try {
              await importOneCsvText(csvText, subjectKey, displayName);
              ok++;
            } catch (err) {
              errors.push(`${file.name}[${sheetName}]：${err.message}`);
            }
          }
        } else {
          // CSV：每个文件 = 一位受试者的一个项目；按文件名前缀归组（张三_步态.csv → 张三）
          const text = await readFileText(file);
          const baseName = file.name.replace(/\.csv$/i, '');
          const subjectKey = (baseName.split(/[_\-（(]/)[0] || baseName).trim() || baseName;
          await importOneCsvText(text, subjectKey, subjectKey);
          ok++;
        }
      } catch (err) {
        errors.push(`${file.name}：${err.message}`);
      }
    }

    // 导入完成 → 全量重算频次表与排名（幂等）
    let summary = '';
    if (ok > 0) {
      setBusyMsg('正在计算评分与排名...');
      try {
        const { perRecord } = await recalcAllScores();
        if (mode === 'eval') {
          // 测评模式：报告本次导入的每位受试者打败了多少人
          const lines = [];
          for (const key of subjectKeys) {
            const rec = perRecord.find(r => r.sessionId === `import_${key}` || r.name === key);
            if (!rec) continue;
            const parts = Object.entries(rec.itemScores).map(([type, score]) => {
              const rk = getRankIncludingSelf(type, score);
              return `${SHORT_LABELS[type] || type} ${score}/25·超越${rk.percent.toFixed(1)}%`;
            });
            lines.push(`${key}：${parts.join('；') || '无有效得分'}`);
          }
          summary = `\n\n── 测评结果 ──\n${lines.join('\n')}`;
        } else {
          // 基础库模式：报告基础库规模
          const counts = ASSESSMENT_KEYS.map(t => `${SHORT_LABELS[t]}${getCount(t)}人`).join('、');
          summary = `\n\n基础库现有：${counts}（仅单项排名，不做综合总分排名）`;
        }
      } catch (err) {
        summary = `\n\n评分排名计算失败：${err.message}`;
      }
    }

    setBusy(false);
    setBusyMsg('');
    setRefreshKey(k => k + 1);
    alert(`导入完成：成功 ${ok} 个${errors.length ? `，失败 ${errors.length} 个\n${errors.slice(0, 6).join('\n')}` : ''}${summary}`);
  }, [importRegion, recalcAllScores]);

  // ─── 重算排名（维护键）：按当前全部记录幂等重建频次表 + 全部排名 ───
  const handleRecalcRank = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setBusyMsg('正在计算评分与排名...');
    try {
      const { records } = await recalcAllScores();
      alert(`已根据 ${records.length} 条记录重建评分基础库并计算排名，展开任意记录可查看“超越百分比”。`);
    } catch (err) {
      alert('计算失败：' + err.message);
    } finally {
      setBusy(false);
      setBusyMsg('');
    }
  }, [busy, recalcAllScores]);

  return (
    <div className="min-h-screen w-full flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-4 sm:px-8 shrink-0 z-10"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)', boxShadow: 'var(--shadow-xs)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <img src="/logo1.png" alt="Logo" className="w-9 h-9 rounded-lg object-contain shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sm sm:text-[15px] font-bold tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>
              肌少症/老年人评估及监测系统
            </h1>
            <p className="text-[10px] tracking-[0.15em] hidden sm:block" style={{ color: 'var(--text-muted)' }}>
              SARCOPENIA ASSESSMENT & MONITORING SYSTEM
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-5 shrink-0">
          {patientInfo && (
            <span className="text-sm font-semibold hidden sm:inline" style={{ color: 'var(--text-primary)' }}>{patientInfo.name}</span>
          )}
          <button onClick={() => navigate('/dashboard')} className="zeiss-btn-ghost flex items-center gap-2 text-xs sm:text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            返回首页
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 p-3 sm:p-6 flex flex-col min-h-0">
        <div className="zeiss-card flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>历史记录</h2>
              <span className="text-xs px-2 py-1 rounded-md" style={{ background: 'var(--zeiss-blue-light)', color: 'var(--zeiss-blue)' }}>
                共 {total} 条
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" multiple className="hidden" onChange={handleFilesSelected} />
              <select value={importRegion} onChange={e => setImportRegion(e.target.value)}
                className="zeiss-input py-2 text-sm" style={{ width: 92 }} title="导入数据的设备地区（决定线序预处理）">
                <option value="guangzhou">广州</option>
                <option value="beijing">北京</option>
              </select>
              <button onClick={() => { if (busy) return; importModeRef.current = 'base'; fileInputRef.current?.click(); }} disabled={busy}
                title="批量导入一批 csv：生成报告 + 算分入库，构成排名基础人群"
                className="text-xs px-3 py-2 rounded-lg font-semibold transition-colors"
                style={{ color: '#0891B2', background: '#ECFEFF', border: '1px solid #0891B233', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                导入基础库
              </button>
              <button onClick={() => { if (busy) return; importModeRef.current = 'eval'; fileInputRef.current?.click(); }} disabled={busy}
                title="导入新受试者 csv：生成报告 + 算分，与基础库比出“超越百分比”，本人也计入基础"
                className="text-xs px-3 py-2 rounded-lg font-semibold transition-colors"
                style={{ color: 'white', background: 'linear-gradient(135deg, #0066CC, #0891B2)', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                导入测评
              </button>
              <button onClick={() => navigate('/debug/report')}
                title="上传 CSV / Excel / JSON 直接出报告，不接设备、不写入历史记录（调试用）"
                className="text-xs px-3 py-2 rounded-lg font-semibold transition-colors"
                style={{ color: '#B45309', background: '#FEF3C7', border: '1px solid #B4530933' }}>
                报告调试台
              </button>
              <button onClick={handleRecalcRank} disabled={busy}
                title="按当前全部历史记录重建评分基础库并重算所有排名（幂等，可反复点）"
                className="text-xs px-3 py-2 rounded-lg font-semibold transition-colors"
                style={{ color: '#0066CC', background: '#EFF6FF', border: '1px solid #0066CC22', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                重算排名
              </button>
              {busy && busyMsg && (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{busyMsg}</span>
              )}
              <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                className="zeiss-input py-2 text-sm" style={{ width: 160 }} />
              <input type="text" placeholder="搜索姓名或机构" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="zeiss-input py-2 text-sm" style={{ width: 180 }} />
              {total > 0 && (
                <button onClick={() => setShowClearConfirm(true)}
                  className="text-xs px-3 py-2 rounded-lg transition-colors"
                  style={{ color: 'var(--danger)', background: 'var(--danger-light)', border: 'none', cursor: 'pointer' }}>
                  清空全部
                </button>
              )}
            </div>
          </div>

          {/* Table Header：栅格 = 序号1 + 患者2 + 日期1 + 评估N + 完成度2 + 操作2（Tailwind 无 grid-cols-13，用 inline style） */}
          <div className="grid gap-2 px-4 sm:px-6 py-3 text-xs font-semibold zeiss-table-header" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
            <div className="col-span-1 text-center" style={{ color: 'var(--text-tertiary)' }}>序号</div>
            <div className="col-span-2" style={{ color: 'var(--text-tertiary)' }}>患者信息</div>
            <div className="col-span-1 text-center" style={{ color: 'var(--text-tertiary)' }}>日期</div>
            {ASSESSMENT_KEYS.map(key => (
              <div key={key} className="col-span-1 text-center" style={{ color: 'var(--text-tertiary)' }}>
                {SHORT_LABELS[key]}
              </div>
            ))}
            <div className="col-span-2 text-center" style={{ color: 'var(--text-tertiary)' }}>完成度</div>
            <div className="col-span-2 text-center" style={{ color: 'var(--text-tertiary)' }}>操作</div>
          </div>

          {/* Table Body */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-8 h-8 border-2 rounded-full animate-spin mb-4"
                  style={{ borderColor: 'var(--border-light)', borderTopColor: 'var(--zeiss-blue)' }} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>加载中...</p>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <svg className="w-16 h-16 mb-4" style={{ color: 'var(--border-light)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {searchTerm || dateFilter ? '未找到匹配的记录' : '暂无历史记录，完成评估后会自动保存'}
                </p>
              </div>
            ) : (
              items.map((item, idx) => {
                const completedCount = getCompletedCount(item.assessments);
                const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                const isExpanded = expandedRow === item.id;

                return (
                  <React.Fragment key={item.id}>
                    <div className="grid gap-2 px-4 sm:px-6 py-3.5 text-sm items-center zeiss-table-row cursor-pointer"
                      style={{ gridTemplateColumns: GRID_TEMPLATE }}
                      onClick={() => setExpandedRow(isExpanded ? null : item.id)}>
                      <div className="col-span-1 text-center" style={{ color: 'var(--text-muted)' }}>{globalIdx}</div>
                      <div className="col-span-2 min-w-0">
                        <div className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.patientName}</div>
                        <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                          {item.patientGender} · {item.patientAge}岁 · {item.patientWeight}kg
                        </div>
                      </div>
                      <div className="col-span-1 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {item.dateStr}
                      </div>
                      {ASSESSMENT_KEYS.map(key => (
                        <div key={key} className="col-span-1 text-center">
                          {item.assessments?.[key]?.completed ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full" style={{ background: 'var(--success-light)' }}>
                              <svg className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full" style={{ background: 'var(--bg-tertiary)' }}>
                              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--border-medium)' }} />
                            </span>
                          )}
                        </div>
                      ))}
                      <div className="col-span-2 flex items-center justify-center gap-2">
                        <div className="w-16 h-2 rounded-full overflow-hidden" style={{ background: 'var(--border-light)' }}>
                          <div className="h-full rounded-full transition-all"
                            style={{
                              width: `${(completedCount / MODULE_COUNT) * 100}%`,
                              background: completedCount === MODULE_COUNT ? 'var(--success)' : 'var(--zeiss-blue)'
                            }} />
                        </div>
                        <span className="text-xs font-medium" style={{ color: completedCount === MODULE_COUNT ? 'var(--success)' : 'var(--zeiss-blue)' }}>
                          {completedCount}/{MODULE_COUNT}
                        </span>
                      </div>
                      <div className="col-span-2 flex justify-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); setExpandedRow(isExpanded ? null : item.id); }}
                          className="text-xs px-3 py-1.5 rounded-md transition-colors"
                          style={{ color: 'var(--zeiss-blue)', background: 'var(--zeiss-blue-light)', border: 'none', cursor: 'pointer' }}>
                          {isExpanded ? '收起' : '详情'}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(item.id); }}
                          className="text-xs px-3 py-1.5 rounded-md transition-colors"
                          style={{ color: 'var(--danger)', background: 'var(--danger-light)', border: 'none', cursor: 'pointer' }}>
                          删除
                        </button>
                      </div>
                    </div>

                    {/* 展开详情 - 每个评估都可以点击查看报告 */}
                    {isExpanded && (
                      <div className="px-4 sm:px-6 pb-4 animate-slideUp" style={{ background: 'var(--bg-tertiary)' }}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 pt-3">
                          {ASSESSMENT_KEYS.map(key => {
                            const assessment = item.assessments?.[key];
                            const completed = assessment?.completed;
                            return (
                              <div key={key} className="zeiss-card p-4 flex flex-col">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                                      style={{
                                        background: completed ? 'var(--zeiss-blue-light)' : 'var(--bg-tertiary)',
                                        color: completed ? 'var(--zeiss-blue)' : 'var(--text-muted)'
                                      }}>
                                      {ASSESSMENT_ICONS[key]}
                                    </div>
                                    <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                      {ASSESSMENT_LABELS[key]}
                                    </h4>
                                  </div>
                                  {completed ? (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>已完成</span>
                                  ) : (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>未完成</span>
                                  )}
                                </div>
                                {completed && assessment.completedAt && (
                                  <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
                                    完成时间: {new Date(assessment.completedAt).toLocaleString('zh-CN')}
                                  </p>
                                )}
                                {!completed && (
                                  <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>暂未完成此项评估</p>
                                )}
                                {/* 排名徽章（一键生成后显示） */}
                                {completed && rankMap[item.id]?.[key] && (
                                  <div className="mb-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-center"
                                    style={{ background: '#ECFEFF', color: '#0891B2', border: '1px solid #0891B233' }}>
                                    评分 {rankMap[item.id][key].score}/25 · 超越 {rankMap[item.id][key].percent.toFixed(1)}%
                                  </div>
                                )}
                                {/* 查看报告按钮 */}
                                {completed ? (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); viewReport(item.id, key); }}
                                    className="mt-auto w-full py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                                    style={{ background: 'var(--zeiss-blue)', color: 'white', border: 'none', cursor: 'pointer' }}>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    查看报告
                                  </button>
                                ) : (
                                  <button disabled
                                    className="mt-auto w-full py-2 rounded-lg text-xs font-medium"
                                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border-light)', cursor: 'not-allowed' }}>
                                    暂无报告
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {/* 一键操作区 */}
                        {getCompletedCount(item.assessments) > 0 && (
                          <div className="mt-3 flex items-center gap-3 flex-wrap">
                            {/* 综合总分不参与排名（各人完成项目数不一），故此处不显示综合超越百分比 */}
                            {/* 综合报告按钮 */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/history/comprehensive?id=${item.id}`);
                              }}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                              style={{ color: 'white', background: 'linear-gradient(135deg, #0066CC, #0891B2)', border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,102,204,0.25)' }}>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              生成综合报告
                            </button>
                            {/* 打开所有报告按钮 */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const completedTypes = ASSESSMENT_KEYS.filter(k => item.assessments?.[k]?.completed);
                                completedTypes.forEach((type, idx) => {
                                  setTimeout(() => {
                                    window.open(`/history/report?id=${item.id}&type=${type}`, '_blank');
                                  }, idx * 500);
                                });
                              }}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                              style={{ color: '#0891B2', background: '#ECFEFF', border: '1px solid #0891B233', cursor: 'pointer' }}>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              打开单项报告（{getCompletedCount(item.assessments)}份）
                            </button>
                          </div>
                        )}
                        {item.institution && (
                          <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
                            评估机构: {item.institution}
                          </p>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 sm:px-6 py-3 flex items-center justify-between shrink-0" style={{ borderTop: '1px solid var(--border-light)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                第 {currentPage} / {totalPages} 页，共 {total} 条记录
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
                  style={{ color: currentPage <= 1 ? 'var(--border-light)' : 'var(--text-muted)', cursor: currentPage <= 1 ? 'not-allowed' : 'pointer' }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button key={pageNum} onClick={() => setCurrentPage(pageNum)}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-xs font-medium transition-all"
                      style={currentPage === pageNum
                        ? { background: 'var(--zeiss-blue)', color: 'white' }
                        : { color: 'var(--text-secondary)', cursor: 'pointer' }
                      }>
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
                  style={{ color: currentPage >= totalPages ? 'var(--border-light)' : 'var(--text-muted)', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer' }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <div className="h-8 flex items-center px-4 sm:px-8 shrink-0">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>powered by 矩侨工业</span>
      </div>

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center zeiss-overlay animate-fadeIn">
          <div className="zeiss-dialog p-8 w-[400px] max-w-[90vw] animate-scaleIn text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'var(--danger-light)' }}>
              <svg className="w-6 h-6" style={{ color: 'var(--danger)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <p className="text-base mb-6" style={{ color: 'var(--text-primary)' }}>确认删除此条记录？</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(null)} className="zeiss-btn-secondary flex-1 py-3 text-sm">取消</button>
              <button onClick={() => handleDelete(showDeleteConfirm)}
                className="flex-1 py-3 rounded-[10px] text-sm font-semibold text-white border-none cursor-pointer"
                style={{ background: 'var(--danger)' }}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 清空确认弹窗 */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center zeiss-overlay animate-fadeIn">
          <div className="zeiss-dialog p-8 w-[400px] max-w-[90vw] animate-scaleIn text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'var(--danger-light)' }}>
              <svg className="w-6 h-6" style={{ color: 'var(--danger)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-base mb-2" style={{ color: 'var(--text-primary)' }}>确认清空所有历史记录？</p>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>此操作不可恢复</p>
            <div className="flex gap-3">
              <button onClick={() => setShowClearConfirm(false)} className="zeiss-btn-secondary flex-1 py-3 text-sm">取消</button>
              <button onClick={handleClear}
                className="flex-1 py-3 rounded-[10px] text-sm font-semibold text-white border-none cursor-pointer"
                style={{ background: 'var(--danger)' }}>
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
