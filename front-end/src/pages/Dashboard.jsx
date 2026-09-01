import React, { useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssessment } from '../contexts/AssessmentContext';
// ── 0810 报告交付包的总览页，取代原 ComprehensiveReport ──
import { HealthOverviewPage } from '../reports-v2/features/health-overview/pages/HealthOverviewPage';
import { createSessionReportGateway } from '../lib/localReportGateway';
import { shareReportSummary, saveAssessmentReminder } from '../lib/reportBoundaries';
import { buildComprehensiveScoreResult, ASSESSMENT_KEYS, COMPREHENSIVE_MAX_SCORE } from '../lib/assessmentScoring';
// PDF 导出走 Chromium 原生打印（矢量、可搜索），不走 html2canvas
import { ReportPdfButton, buildReportFileName } from '../lib/reportPdf';

/* ─── 评估项目配置 ─── */
/*
 * 配色取自 0810 报告交付包总览页的能力卡（AbilityCardShell.jsx 的 CARD_PRESENTATION
 * 与各 XxxAbilityCard 的 insight 底色），让首页卡片与点进去的报告是同一个身份色：
 *   起坐 #4D8D54 / 步态 #6E95D6·#4B79D3 / 站立 #A689B5·#E09038 / 握力 #F8A36D
 *
 * accent   —— 身份色，用于图标底与描边
 * accentText —— 按钮文字色。#F8A36D / #A689B5 直接当文字太浅，各自压深一档保证可读
 */
const ASSESSMENTS = [
  {
    key: 'grip',
    num: '1',
    title: '握力评估',
    subtitle: 'Grip Strength',
    desc: '通过传感器采集手部握力数据，分析各手指力量分布和抓握模式',
    path: '/assessment/grip',
    accent: '#F8A36D',
    accentText: '#D9803F',
    accentBg: '#FFF8F4',
    icon: '/icons/hand.png',
    iconBg: 'linear-gradient(135deg, #FFF8F4 0%, #FDEADC 100%)',
    devices: ['HL', 'HR'],
  },
  {
    key: 'sitstand',
    num: '2',
    title: '起坐能力评估',
    subtitle: 'Sit-to-Stand',
    desc: '评估从坐到站的运动能力，分析起坐过程中的力量和平衡',
    path: '/assessment/sitstand',
    accent: '#4D8D54',
    accentText: '#4D8D54',
    accentBg: '#EAF3EA',
    icon: '/icons/sit-stand.png',
    iconBg: 'linear-gradient(135deg, #EAF3EA 0%, #D9EADB 100%)',
    devices: ['sit', 'foot1'],
  },
  {
    key: 'standing',
    num: '3',
    title: '静态站立评估',
    subtitle: 'Static Standing',
    desc: '通过足底压力传感器分析站立时的重心分布和平衡稳定性',
    path: '/assessment/standing',
    accent: '#A689B5',
    accentText: '#8B6BA1',
    accentBg: '#F6F2F9',
    icon: '/icons/footprint.png',
    iconBg: 'linear-gradient(135deg, #F6F2F9 0%, #EBE2F1 100%)',
    devices: ['foot1'],
  },
  {
    key: 'gait',
    num: '4',
    title: '行走步态评估',
    subtitle: 'Gait Analysis',
    desc: '分析行走过程中的步态参数，评估步频、步幅和足底压力变化',
    path: '/assessment/gait',
    accent: '#6E95D6',
    accentText: '#4B79D3',
    accentBg: '#EEF3FC',
    icon: '/icons/walking.png',
    iconBg: 'linear-gradient(135deg, #EEF3FC 0%, #DEE8F8 100%)',
    devices: ['foot1', 'foot2', 'foot3', 'foot4'],
  }
];

/* ─── 设备名称映射 ─── */
const DEVICE_LABELS = {
  HL: '左手套',
  HR: '右手套',
  sit: '坐垫',
  foot1: '脚垫1',
  foot2: '脚垫2',
  foot3: '脚垫3',
  foot4: '脚垫4',
};

/* ─── 患者信息弹窗 ─── */
function PatientDialog({ open, onClose, onConfirm }) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState('男');
  const [age, setAge] = useState('65');
  const [weight, setWeight] = useState('70');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center zeiss-overlay animate-fadeIn">
      <div className="zeiss-dialog p-8 w-[480px] max-w-[90vw] animate-scaleIn">
        <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>评估对象信息</h3>
        <p className="text-sm mb-6" style={{ color: 'var(--text-tertiary)' }}>请输入被评估者的基本信息</p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>姓名 *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="请输入姓名"
              className="zeiss-input" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>性别</label>
              <select value={gender} onChange={e => setGender(e.target.value)} className="zeiss-select">
                <option value="男">男</option>
                <option value="女">女</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>年龄</label>
              <select value={age} onChange={e => setAge(e.target.value)} className="zeiss-select">
                {Array.from({ length: 61 }, (_, i) => i + 40).map(a => (
                  <option key={a} value={a}>{a}岁</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>体重(kg)</label>
              <select value={weight} onChange={e => setWeight(e.target.value)} className="zeiss-select">
                {Array.from({ length: 81 }, (_, i) => i + 30).map(w => (
                  <option key={w} value={w}>{w}kg</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-8">
          <button onClick={onClose} className="zeiss-btn-secondary py-3">取消</button>
          <button
            onClick={() => { if (name.trim()) onConfirm({ name: name.trim(), gender, age: +age, weight: +weight }); }}
            disabled={!name.trim()}
            className="py-3 rounded-full font-semibold text-sm transition-all"
            style={{
              background: name.trim() ? 'var(--zeiss-blue)' : '#ECEFE7',
              color: name.trim() ? 'white' : 'var(--text-muted)',
              cursor: name.trim() ? 'pointer' : 'not-allowed',
              border: 'none',
            }}>
            开始评估
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── 一键连接按钮组件 ─── */
function ConnectButton({ status, onConnect, onDisconnect, onRescan, rescanLoading, deviceOnlineMap, macInfo }) {
  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';
  const isError = status === 'error';

  // 统计在线设备数
  const allDevices = ['HL', 'HR', 'sit', 'foot1', 'foot2', 'foot3', 'foot4'];
  const onlineCount = allDevices.filter(d => deviceOnlineMap[d] === 'online').length;
  const hasOffline = isConnected && onlineCount < allDevices.length && onlineCount > 0;

  // 解析 MAC 信息：将端口路径映射的 macInfo 转为简洁显示
  const macEntries = macInfo ? Object.entries(macInfo) : [];

  const handleClick = () => {
    if (isConnected || isError) {
      onDisconnect();
    } else if (!isConnecting) {
      onConnect();
    }
  };

  return (
    <div className="flex items-center gap-3">
      {/* 设备状态指示器 */}
      {isConnected && (
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full"
          style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)' }}>
          <span className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>在线设备</span>
          {allDevices.map(d => (
            <div key={d} className="flex items-center gap-0.5" title={`${DEVICE_LABELS[d]}: ${deviceOnlineMap[d] === 'online' ? '在线' : '离线'}`}>
              {/* 绿=在线、灰=离线，颜色本身承载状态，只换取值不换语义 */}
              <div className="w-1.5 h-1.5 rounded-full transition-colors"
                style={{ background: deviceOnlineMap[d] === 'online' ? '#4D8D54' : '#C0C9BC' }} />
            </div>
          ))}
          <span className="text-[10px] ml-0.5 tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
            {onlineCount}/{allDevices.length}
          </span>
        </div>
      )}



      {/* 连接按钮 */}
      <button
        onClick={handleClick}
        disabled={isConnecting}
        className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all"
        style={{
          // 绿=已连接、灰=连接中、红=故障：状态语义不变，取值换成报告页色板
          background: isConnected ? '#4D8D54' : isConnecting ? '#8C8C8C' : isError ? '#BA1A1A' : 'var(--zeiss-blue)',
          color: 'white',
          border: 'none',
          cursor: isConnecting ? 'wait' : 'pointer',
          opacity: isConnecting ? 0.8 : 1,
        }}
      >
        {/* 图标 */}
        {isConnecting ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : isConnected ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )}
        {isConnecting ? '连接中...' : isConnected ? '已连接' : isError ? '重新连接' : '一键连接'}
      </button>

      {/* 重新扫描按钮（已连接且有设备离线时显示） */}
      {isConnected && (
        <button
          onClick={onRescan}
          disabled={rescanLoading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold transition-all"
          style={{
            // 橙=有设备离线（需要用户注意），常态则弱化为次级按钮
            background: hasOffline ? '#FFF5E6' : 'var(--bg-tertiary)',
            color: hasOffline ? '#E09038' : 'var(--text-tertiary)',
            border: hasOffline ? '1px solid rgb(224 144 56 / 28%)' : '1px solid var(--border-light)',
            cursor: rescanLoading ? 'wait' : 'pointer',
            opacity: rescanLoading ? 0.7 : 1,
          }}
          title="重新扫描串口，连接掉线设备"
        >
          {rescanLoading ? (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          {rescanLoading ? '连接中...' : '重新连接'}
        </button>
      )}
    </div>
  );
}

/* ─── Dashboard 主页 ─── */
export default function Dashboard() {
  const navigate = useNavigate();
  const {
    institution, patientInfo, setPatientInfo, assessments, resetAssessment, startNewSession,
    sessionId,
    deviceConnStatus, deviceOnlineMap, macInfo, connectAllDevices, disconnectAllDevices,
    rescanDevices, rescanLoading,
  } = useAssessment();
  const [showDialog, setShowDialog] = useState(false);
  const [pendingPath, setPendingPath] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(null);
  const [showNewSessionConfirm, setShowNewSessionConfirm] = useState(false);
  const [showGripTip, setShowGripTip] = useState(false);
  const [gripTipPath, setGripTipPath] = useState('');
  const [showSitStandTip, setShowSitStandTip] = useState(false);
  const [sitStandTipPath, setSitStandTipPath] = useState('');
  const [showComprehensiveReport, setShowComprehensiveReport] = useState(false);
  // 综合报告弹层的滚动容器，PDF 导出的打印范围就是它（print.css 认这个节点上的 data-print-root）
  const comprehensiveScrollRef = useRef(null);

  const handleStart = (path) => {
    if (patientInfo) {
      // 握力评估需要先提示用户带好手套
      if (path === '/assessment/grip') {
        setGripTipPath(path);
        setShowGripTip(true);
      } else if (path === '/assessment/sitstand') {
        setSitStandTipPath(path);
        setShowSitStandTip(true);
      } else {
        navigate(path);
      }
    } else {
      setPendingPath(path);
      setShowDialog(true);
    }
  };

  const handleConfirm = (info) => {
    setPatientInfo(info);
    setShowDialog(false);
    // 握力评估需要先提示用户带好手套
    if (pendingPath === '/assessment/grip') {
      setGripTipPath(pendingPath);
      setShowGripTip(true);
    } else if (pendingPath === '/assessment/sitstand') {
      setSitStandTipPath(pendingPath);
      setShowSitStandTip(true);
    } else {
      navigate(pendingPath);
    }
  };

  const confirmReset = () => {
    const key = showResetConfirm;
    resetAssessment(key);
    setShowResetConfirm(null);
    const a = ASSESSMENTS.find(x => x.key === key);
    if (a) navigate(a.path);
  };

  const completedCount = Object.values(assessments).filter(a => a.completed).length;
  const moduleCount = ASSESSMENT_KEYS.length;
  const comprehensiveReady = completedCount === moduleCount;
  const currentRecord = useMemo(() => {
    if (!patientInfo) return null;
    const now = new Date();
    return {
      id: 'current-session',
      sessionId: 'current-session',
      patientName: patientInfo.name,
      patientGender: patientInfo.gender,
      patientAge: patientInfo.age,
      patientWeight: patientInfo.weight,
      institution: institution || '',
      assessments,
      date: now.toISOString(),
      dateStr: `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`,
      updatedAt: now.toISOString(),
    };
  }, [patientInfo, institution, assessments]);
  const comprehensiveScore = useMemo(
    () => currentRecord ? buildComprehensiveScoreResult(assessments, patientInfo || {}) : null,
    [currentRecord, assessments, patientInfo],
  );
  /*
   * 综合报告（交付包总览页）的数据源。
   * 按 sessionId 取本轮已落库的记录，而不是上面的 currentRecord —— 总览页的四张能力卡
   * 要用 record.id 拼 /history/report?id=&type= 的跳转链接，占位 id 会拼出死链。
   * 必须 useMemo：gateway 在交付包 hook 的依赖数组里，每次渲染新建会无限取数。
   */
  const comprehensiveGateway = useMemo(
    () => createSessionReportGateway(sessionId),
    [sessionId],
  );

  return (
    /*
     * dashboard-v2 是首页专属主题作用域（index.css 末尾）：在这棵子树里重定义
     * --zeiss-* / --bg-* / --text-* 等变量，把全站共用的 .zeiss-* 类换成报告页配色，
     * 不改共用规则本身，所以其他页面完全不受影响。弹窗都是本节点的子元素，
     * 虽然 position: fixed，CSS 变量走 DOM 继承，配色照样生效。
     */
    <div className="dashboard-v2 h-screen w-screen flex flex-col overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #FFF9F5 0%, #F8FAF3 100%)' }}>
      {/* Header */}
      <header className="h-14 md:h-16 flex items-center justify-between px-4 md:px-8 shrink-0 z-20"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)', boxShadow: 'var(--shadow-xs)' }}>
        <div className="flex items-center gap-2.5 md:gap-3.5 min-w-0">
          <img src="/logo1.png" alt="Logo" className="w-8 h-8 md:w-9 md:h-9 rounded-lg object-contain shrink-0" />
          <div className="min-w-0">
            <h1 className="text-[13px] md:text-[15px] font-bold tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>
              肌少症/老年人评估及监测系统
            </h1>
            <p className="text-[10px] tracking-[0.15em] hidden md:block" style={{ color: 'var(--text-muted)' }}>
              SARCOPENIA ASSESSMENT & MONITORING SYSTEM
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 md:gap-5 shrink-0">
          {patientInfo && (
            <div className="hidden md:flex items-center gap-2.5 px-4 py-1.5 rounded-lg"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)' }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ background: 'var(--zeiss-blue)' }}>
                {patientInfo.name[0]}
              </div>
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{patientInfo.name}</div>
                <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                  {patientInfo.gender} · {patientInfo.age}岁 · {patientInfo.weight}kg
                </div>
              </div>
            </div>
          )}

          {/* ─── 一键连接按钮 ─── */}
          <ConnectButton
            status={deviceConnStatus}
            onConnect={connectAllDevices}
            onDisconnect={disconnectAllDevices}
            onRescan={rescanDevices}
            rescanLoading={rescanLoading}
            deviceOnlineMap={deviceOnlineMap}
            macInfo={macInfo}
          />

          {institution && (
            <span className="text-sm font-medium hidden lg:inline" style={{ color: 'var(--text-secondary)' }}>{institution}</span>
          )}
          {/* 新评估按钮 */}
          {patientInfo && (
            <button onClick={() => setShowNewSessionConfirm(true)}
              className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm px-3 py-1.5 rounded-full font-semibold transition-all"
              style={{ color: '#4D8D54', background: '#EAF3EA', border: '1px solid rgb(77 141 84 / 20%)' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">新建用户</span>
            </button>
          )}
          <button onClick={() => navigate('/history')}
            className="zeiss-btn-ghost flex items-center gap-1.5 md:gap-2 text-xs md:text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="hidden sm:inline">历史记录</span>
          </button>
          <button onClick={() => navigate('/', { state: { editMode: true } })}
            className="zeiss-btn-ghost flex items-center gap-1.5 md:gap-2 text-xs md:text-sm"
            title="修改登录信息">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="hidden sm:inline">设置</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 md:px-8 z-10 overflow-y-auto">
        {/* 进度概览 */}
        <div className="mb-6 md:mb-10 text-center animate-slideUp">
          <h2 className="text-responsive-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>选择评估项目</h2>
          <p style={{ color: 'var(--text-tertiary)' }}>
            已完成 <span className="font-bold" style={{ color: 'var(--zeiss-blue)' }}>{completedCount}</span> / <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{moduleCount}</span> 项评估
            {comprehensiveReady && <span style={{ color: 'var(--success)' }} className="ml-2 font-medium">· 全部完成</span>}
          </p>
          {completedCount > 0 && (
            <button
              onClick={() => {
                // 按标准模块顺序取第一个已完成项，直接用其 key 作为路由（勿用三元链，新增模块会走错路由）
                const first = ASSESSMENT_KEYS.find(k => assessments?.[k]?.completed);
                if (first) navigate(`/assessment/${first}`, { state: { viewReport: true } });
              }}
              className="mt-3 inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-all"
              style={{ color: '#90435D', background: '#FCF1F4', border: '1px solid rgb(144 67 93 / 20%)' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              查看已完成报告
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => comprehensiveReady && setShowComprehensiveReport(true)}
          disabled={!comprehensiveReady}
          className="mb-5 md:mb-7 w-full max-w-[520px] px-6 py-5 transition-all animate-slideUp"
          style={{
            borderRadius: 28,
            background: comprehensiveReady ? 'var(--bg-secondary)' : '#ECEFE7',
            color: comprehensiveReady ? 'var(--text-primary)' : 'var(--text-muted)',
            border: comprehensiveReady ? '1px solid rgb(77 141 84 / 24%)' : '1px solid var(--border-light)',
            boxShadow: comprehensiveReady ? '0 10px 40px -10px rgb(0 0 0 / 10%)' : 'none',
            cursor: comprehensiveReady ? 'pointer' : 'not-allowed',
            opacity: comprehensiveReady ? 1 : 0.72,
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="text-left">
              <div className="text-sm font-bold">综合评分报告</div>
              <div className="text-xs mt-1" style={{ color: comprehensiveReady ? 'var(--text-tertiary)' : 'var(--text-muted)' }}>
                {comprehensiveReady ? `${moduleCount}项评估已完成，可以生成总评分报告` : `完成全部 ${moduleCount} 项评估后启用，目前 ${completedCount}/${moduleCount}`}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {comprehensiveReady && comprehensiveScore && (
                <div className="text-right">
                  <div className="text-2xl font-black tabular-nums" style={{ color: comprehensiveScore.color }}>
                    {comprehensiveScore.score}
                    <span className="text-xs font-bold ml-0.5">/{COMPREHENSIVE_MAX_SCORE}</span>
                  </div>
                  <div className="text-[10px] font-semibold" style={{ color: comprehensiveScore.color }}>{comprehensiveScore.level}</div>
                </div>
              )}
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                style={{ color: comprehensiveReady ? 'var(--zeiss-blue)' : 'var(--text-muted)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </button>

        {/* 四个评估卡片 */}
        <div className="dashboard-grid px-2">
          {ASSESSMENTS.map((item, idx) => {
            const completed = assessments[item.key]?.completed;
            // 检查该评估所需设备的在线状态
            const requiredDevices = item.devices || [];
            const onlineDevices = requiredDevices.filter(d => deviceOnlineMap[d] === 'online');
            const allDevicesOnline = requiredDevices.length > 0 && onlineDevices.length === requiredDevices.length;
            const someDevicesOnline = onlineDevices.length > 0;

            return (
              <div key={item.key}
                className="zeiss-card zeiss-card-interactive p-4 md:p-6 flex flex-col items-center text-center cursor-pointer relative animate-slideUp"
                style={{ animationDelay: `${idx * 80}ms` }}
                onClick={() => !completed && handleStart(item.path)}
              >
                {/* 完成标记：改成总览页 .health-overview__status-badge 的浅底+绿字胶囊，
                    而不是实心绿圆点 —— 避免与同为绿色的「开始评估」主按钮混淆 */}
                {completed && (
                  <div className="absolute top-4 right-4 w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: '#EAF3EA', border: '1px solid rgb(77 141 84 / 24%)' }}>
                    <svg className="w-3.5 h-3.5" style={{ color: '#4D8D54' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}

                {/* 设备状态指示（仅在已连接时显示） */}
                {deviceConnStatus === 'connected' && !completed && (
                  <div className="absolute top-4 right-4 flex items-center gap-1 px-2 py-0.5 rounded-full"
                    style={{
                      // 绿=齐全、橙=部分在线、灰=全离线：三档语义保留，取值换成报告页色板
                      background: allDevicesOnline ? '#EAF3EA' : someDevicesOnline ? '#FFF5E6' : '#EEF1F3',
                      border: `1px solid ${allDevicesOnline ? 'rgb(77 141 84 / 28%)' : someDevicesOnline ? 'rgb(224 144 56 / 28%)' : 'rgb(140 140 140 / 22%)'}`,
                    }}>
                    <div className="w-1.5 h-1.5 rounded-full"
                      style={{ background: allDevicesOnline ? '#4D8D54' : someDevicesOnline ? '#E09038' : '#8C8C8C' }} />
                    <span className="text-[9px] font-medium"
                      style={{ color: allDevicesOnline ? '#4D8D54' : someDevicesOnline ? '#E09038' : '#5F5E5B' }}>
                      {onlineDevices.length}/{requiredDevices.length}
                    </span>
                  </div>
                )}

                {/* 序号标题：序号做成身份色胶片，对齐总览页能力卡的 .health-overview__ability-index
                    （交付包是 32px / 8px 圆角，首页卡面更窄，收到 24px 留出右上角徽标的位置） */}
                <div className="flex items-center gap-2 mb-2 md:mb-3 self-start pr-7 text-left">
                  <span className="shrink-0 flex items-center justify-center font-bold text-white"
                    style={{ width: 24, height: 24, borderRadius: 8, background: item.accent, fontSize: 14 }}>
                    {item.num}
                  </span>
                  <h3 className="text-[14px] md:text-[18px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
                    {item.title}
                  </h3>
                </div>

                {/* 大尺寸图标区域 */}
                <div className="w-full aspect-square flex items-center justify-center mb-2 md:mb-4 rounded-[20px]"
                  style={{ background: item.iconBg }}>
                  <div className="w-[55%] h-[55%]">
                    <img 
                      src={item.icon} 
                      alt={item.title} 
                      className="w-full h-full object-contain"
                      style={{ opacity: 0.18 }} 
                    />
                  </div>
                </div>

                {/* 描述 */}
                <p className="text-xs leading-relaxed mb-4 flex-1" style={{ color: 'var(--text-tertiary)' }}>
                  {item.desc}
                </p>

                {/* 按钮 */}
                {completed ? (
                  <div className="flex gap-2 w-full">
                    <button onClick={(e) => { e.stopPropagation(); navigate(item.path, { state: { viewReport: true } }); }}
                      className="flex-1 py-2.5 rounded-full text-xs font-semibold transition-all"
                      style={{ background: item.accentBg, color: item.accentText, border: `1px solid ${item.accent}40` }}>
                      查看报告
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setShowResetConfirm(item.key); }}
                      className="zeiss-btn-ghost flex-1 py-2.5 text-xs">
                      重新评估
                    </button>
                  </div>
                ) : (
                  <button className="zeiss-btn-primary w-full py-2.5 text-sm">
                    开始评估
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="h-8 md:h-10 flex items-center justify-between px-4 md:px-8 shrink-0 z-10">
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>powered by 矩侨工业</span>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>v2.0.0</span>
      </footer>

      {/* 患者信息弹窗 */}
      <PatientDialog open={showDialog} onClose={() => setShowDialog(false)} onConfirm={handleConfirm} />

      {/* 握力评估手套提示弹窗 */}
      {showGripTip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center zeiss-overlay animate-fadeIn">
          <div className="zeiss-dialog p-8 w-[460px] max-w-[90vw] animate-scaleIn text-center">
            {/* 强调色用握力模块的身份色（总览页握力能力卡 #F8A36D，文字压深到 #D9803F） */}
            <div className="w-16 h-16 mx-auto mb-5 rounded-full flex items-center justify-center"
              style={{ background: '#FFF8F4' }}>
              <svg className="w-8 h-8" style={{ color: '#D9803F' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>握力评估准备</h3>
            <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--text-tertiary)' }}>
              请确保被评估者已<span className="font-semibold" style={{ color: '#D9803F' }}>戴好手套</span>，并保持<span className="font-semibold" style={{ color: '#D9803F' }}>指尖贴合</span>，<span className="font-semibold" style={{ color: '#D9803F' }}>手掌朝上展开五指</span>，以确保数据采集的准确性。
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setShowGripTip(false)} className="zeiss-btn-secondary py-3 text-sm">取消</button>
              <button
                onClick={() => { setShowGripTip(false); navigate(gripTipPath); }}
                className="py-3 rounded-full font-semibold text-sm text-white border-none cursor-pointer transition-all"
                style={{ background: 'var(--zeiss-blue)' }}>
                开始评估
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 起坐评估提示弹窗 */}
      {showSitStandTip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center zeiss-overlay animate-fadeIn">
          <div className="zeiss-dialog p-8 w-[460px] max-w-[90vw] animate-scaleIn text-center">
            <div className="w-16 h-16 mx-auto mb-5 rounded-full flex items-center justify-center"
              style={{ background: '#EAF3EA' }}>
              <svg className="w-8 h-8" style={{ color: '#4D8D54' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>起坐能力评估准备</h3>
            <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--text-tertiary)' }}>
              请被评估者坐在椅子上，<span className="font-semibold" style={{ color: '#4D8D54' }}>双手交叉放于胸前</span>。
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setShowSitStandTip(false)} className="zeiss-btn-secondary py-3 text-sm">取消</button>
              <button
                onClick={() => { setShowSitStandTip(false); navigate(sitStandTipPath); }}
                className="py-3 rounded-full font-semibold text-sm text-white border-none cursor-pointer transition-all"
                style={{ background: '#4D8D54' }}>
                开始评估
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 重新评估确认弹窗 */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center zeiss-overlay animate-fadeIn">
          <div className="zeiss-dialog p-8 w-[420px] animate-scaleIn text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ background: 'var(--warning-light)' }}>
              <svg className="w-6 h-6" style={{ color: 'var(--warning)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-base mb-6" style={{ color: 'var(--text-primary)' }}>重新评估会覆盖现有报告，确认继续？</p>
            <div className="flex gap-3">
              <button onClick={() => setShowResetConfirm(null)} className="zeiss-btn-secondary flex-1 py-3 text-sm">取消</button>
              <button onClick={confirmReset}
                className="flex-1 py-3 rounded-full text-sm font-semibold text-white border-none cursor-pointer"
                style={{ background: 'var(--warning)' }}>
                确认重新评估
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新评估确认弹窗 */}
      {showNewSessionConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center zeiss-overlay animate-fadeIn">
          <div className="zeiss-dialog p-8 w-[420px] max-w-[90vw] animate-scaleIn text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ background: '#EAF3EA' }}>
              <svg className="w-6 h-6" style={{ color: '#4D8D54' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>创建新用户</h3>
            <p className="text-sm mb-1" style={{ color: 'var(--text-tertiary)' }}>
              当前评估对象是<span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{patientInfo?.name}</span>，已评估的数据将自动保存到历史记录中。
            </p>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              确认创建新的用户？
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setShowNewSessionConfirm(false)} className="zeiss-btn-secondary py-3 text-sm">取消</button>
              <button
                onClick={() => { setShowNewSessionConfirm(false); startNewSession(); }}
                className="py-3 rounded-full text-sm font-semibold text-white border-none cursor-pointer transition-all"
                style={{ background: '#4D8D54' }}>
                确认创建
              </button>
            </div>
          </div>
        </div>
      )}

      {showComprehensiveReport && currentRecord && (
        <div className="fixed inset-0 z-40 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
          <div className="h-12 flex items-center justify-between px-6 shrink-0"
            style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)' }}>
            <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
              {patientInfo?.name || '未知'} 的综合评估报告
            </span>
            <div className="flex items-center gap-3">
              <ReportPdfButton
                targetRef={comprehensiveScrollRef}
                fileName={buildReportFileName(patientInfo?.name, '综合评估报告')}
                title={`${patientInfo?.name || '未知'} 的综合评估报告`}
              />
              <button onClick={() => setShowComprehensiveReport(false)} className="zeiss-btn-ghost text-xs">关闭</button>
            </div>
          </div>
          {/* 交付包总览页自带 120vh 画布，index.css 又禁掉了 body 滚动，滚动条只能挂在这里 */}
          <div ref={comprehensiveScrollRef} className="flex-1 min-h-0 overflow-auto">
            <HealthOverviewPage
              gateway={comprehensiveGateway}
              recordId={sessionId}
              onShare={shareReportSummary}
              onSaveReminder={saveAssessmentReminder}
            />
          </div>
        </div>
      )}
    </div>
  );
}
