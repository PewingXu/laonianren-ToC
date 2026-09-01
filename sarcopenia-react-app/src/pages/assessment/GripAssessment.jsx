import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssessment } from '../../contexts/AssessmentContext';
import HandModel from '../../components/three/HandModel';
import GripReport from '../../components/report/GripReport';
import EChart from '../../components/ui/EChart';
import { HeatmapCanvas } from '../../lib/heatmap';
import { mapLeftHand, mapRightHand, generateSimulatedSensorData } from '../../lib/gripDataMapping';
import { gripLeftService, gripRightService } from '../../lib/GripSerialService';
import { analyzeGripCSV, checkPythonBackend } from '../../lib/gripPythonApi';

/* ─── 步骤指示器 (蔡司风格) ─── */
function StepIndicator({ current, steps }) {
  return (
    <div className="flex items-center gap-1">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={i}>
            {i > 0 && <div className="zeiss-step-line" style={done ? { background: 'var(--success)' } : {}} />}
            <div className="flex flex-col items-center gap-1">
              <div className={`zeiss-step-circle ${done ? 'completed' : active ? 'active' : 'pending'}`}>
                {done ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : i + 1}
              </div>
              <span className="text-[10px] font-medium" style={{ color: done || active ? 'var(--zeiss-blue)' : 'var(--text-muted)' }}>{label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ─── 双端口连接对话框 ─── */
function ConnectDialog({ open, onClose, onConnected }) {
  const [leftStatus, setLeftStatus] = useState('idle'); // idle | connecting | connected | error
  const [rightStatus, setRightStatus] = useState('idle');
  const [leftError, setLeftError] = useState('');
  const [rightError, setRightError] = useState('');

  const connectHand = async (side) => {
    const service = side === 'left' ? gripLeftService : gripRightService;
    const setStatus = side === 'left' ? setLeftStatus : setRightStatus;
    const setErr = side === 'left' ? setLeftError : setRightError;
    setStatus('connecting');
    setErr('');
    try {
      service.setOnStatus((s) => {
        if (s === 'connected') setStatus('connected');
        else if (s === 'error') { setStatus('error'); setErr('连接异常断开'); }
      });
      service.setOnLog((msg, type) => console.log(`[Grip-${side} ${type}] ${msg}`));
      const ok = await service.connect();
      if (!ok) { setStatus('error'); setErr('用户取消或连接失败'); }
    } catch (e) {
      setStatus('error');
      setErr(e.message || '连接失败');
    }
  };

  const bothConnected = leftStatus === 'connected' && rightStatus === 'connected';

  const handleConfirm = () => {
    if (bothConnected) onConnected();
  };

  const handleCancel = async () => {
    if (leftStatus === 'connected') await gripLeftService.disconnect();
    if (rightStatus === 'connected') await gripRightService.disconnect();
    setLeftStatus('idle'); setRightStatus('idle');
    setLeftError(''); setRightError('');
    onClose();
  };

  if (!open) return null;

  const HandPort = ({ side, status, error, onConnect }) => {
    const isLeft = side === 'left';
    const label = isLeft ? '左手手套' : '右手手套';
    const color = isLeft ? '#0066CC' : '#059669';
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ border: `1px solid ${status === 'connected' ? color : 'var(--border-medium)'}`, background: status === 'connected' ? `${color}08` : 'var(--bg-tertiary)' }}>
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: status === 'connected' ? color : status === 'connecting' ? '#F59E0B' : status === 'error' ? '#DC2626' : 'var(--border-medium)' }} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</div>
          <div className="text-[11px]" style={{ color: status === 'connected' ? color : status === 'error' ? '#DC2626' : 'var(--text-muted)' }}>
            {status === 'idle' && '未连接 — 点击右侧按钮选择COM口'}
            {status === 'connecting' && '正在连接...'}
            {status === 'connected' && '已连接'}
            {status === 'error' && (error || '连接失败')}
          </div>
        </div>
        {status !== 'connected' && status !== 'connecting' && (
          <button onClick={onConnect} className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-md transition-colors" style={{ color: 'white', background: color }}>
            选择端口
          </button>
        )}
        {status === 'connecting' && <div className="w-5 h-5 border-2 rounded-full animate-spin shrink-0" style={{ borderColor: `${color} transparent ${color} transparent` }} />}
        {status === 'connected' && (
          <svg className="w-5 h-5 shrink-0" style={{ color }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center zeiss-overlay animate-fadeIn">
      <div className="zeiss-dialog p-6 min-w-[420px] animate-scaleIn">
        <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>连接握力手套</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>请依次为左右手选择对应的串口（COM口），每只手套对应一个端口</p>
        <div className="flex flex-col gap-3 mb-5">
          <HandPort side="left" status={leftStatus} error={leftError} onConnect={() => connectHand('left')} />
          <HandPort side="right" status={rightStatus} error={rightError} onConnect={() => connectHand('right')} />
        </div>
        <div className="flex gap-3">
          <button onClick={handleCancel} className="zeiss-btn-secondary flex-1 py-2.5 text-sm">取消</button>
          <button onClick={handleConfirm} disabled={!bothConnected}
            className="zeiss-btn-primary flex-1 py-2.5 text-sm" style={{ opacity: bothConnected ? 1 : 0.5 }}>
            开始评估
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── 左侧统一数据面板 ─── */
function LeftDataPanel({ leftData, rightData, leftStats, rightStats, phase, timer, fmtTime }) {
  const isLeftActive = phase.startsWith('left');
  const isRightActive = phase.startsWith('right');
  const isRecording = phase.includes('recording');

  const leftLineOpt = useMemo(() => ({
    animation: false,
    grid: { top: 8, bottom: 16, left: 32, right: 8 },
    xAxis: { type: 'category', data: leftData.map((_, i) => i), show: false, boundaryGap: false },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#F0F2F5' } }, axisLabel: { color: '#8896A6', fontSize: 9 } },
    series: [{ type: 'line', data: leftData.map(d => d.value), smooth: true, symbol: 'none',
      lineStyle: { color: '#0066CC', width: 1.5 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(0,102,204,0.15)' }, { offset: 1, color: 'rgba(0,102,204,0)' }] } }
    }]
  }), [leftData]);

  const rightLineOpt = useMemo(() => ({
    animation: false,
    grid: { top: 8, bottom: 16, left: 32, right: 8 },
    xAxis: { type: 'category', data: rightData.map((_, i) => i), show: false, boundaryGap: false },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#F0F2F5' } }, axisLabel: { color: '#8896A6', fontSize: 9 } },
    series: [{ type: 'line', data: rightData.map(d => d.value), smooth: true, symbol: 'none',
      lineStyle: { color: '#059669', width: 1.5 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(5,150,105,0.15)' }, { offset: 1, color: 'rgba(5,150,105,0)' }] } }
    }]
  }), [rightData]);

  const leftNormalOpt = useMemo(() => {
    const mean = parseFloat(leftStats.mean) || 190;
    const std = leftStats.std || 15;
    const xs = Array.from({ length: 100 }, (_, i) => (mean - 4 * std + i * 8 * std / 100).toFixed(1));
    const ys = xs.map(x => (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mean) / std) ** 2));
    return {
      animation: false,
      grid: { top: 8, bottom: 16, left: 32, right: 8 },
      xAxis: { type: 'category', data: xs, axisLabel: { color: '#8896A6', fontSize: 8, interval: 24 }, boundaryGap: false },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#F0F2F5' } }, axisLabel: { color: '#8896A6', fontSize: 9 } },
      series: [{ type: 'line', data: ys, smooth: true, symbol: 'none',
        lineStyle: { color: '#0891B2', width: 1.5 },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(8,145,178,0.12)' }, { offset: 1, color: 'rgba(8,145,178,0)' }] } }
      }]
    };
  }, [leftStats.mean, leftStats.std]);

  const rightNormalOpt = useMemo(() => {
    const mean = parseFloat(rightStats.mean) || 190;
    const std = rightStats.std || 15;
    const xs = Array.from({ length: 100 }, (_, i) => (mean - 4 * std + i * 8 * std / 100).toFixed(1));
    const ys = xs.map(x => (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mean) / std) ** 2));
    return {
      animation: false,
      grid: { top: 8, bottom: 16, left: 32, right: 8 },
      xAxis: { type: 'category', data: xs, axisLabel: { color: '#8896A6', fontSize: 8, interval: 24 }, boundaryGap: false },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#F0F2F5' } }, axisLabel: { color: '#8896A6', fontSize: 9 } },
      series: [{ type: 'line', data: ys, smooth: true, symbol: 'none',
        lineStyle: { color: '#0891B2', width: 1.5 },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(8,145,178,0.12)' }, { offset: 1, color: 'rgba(8,145,178,0)' }] } }
      }]
    };
  }, [rightStats.mean, rightStats.std]);

  const Metric = ({ label, value, color }) => (
    <div className="zeiss-data-row">
      <span className="zeiss-data-label text-[11px]">{label}</span>
      <span className="zeiss-data-value text-xs font-semibold" style={{ color }}>{value}</span>
    </div>
  );

  return (
    <div className="h-full flex flex-col gap-3 overflow-y-auto">
      {/* 采集状态 */}
      {isRecording && (
        <div className="zeiss-card p-3 flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: '#DC2626' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            {isLeftActive ? '左手' : '右手'}采集中
          </span>
          <span className="font-mono text-sm font-bold ml-auto" style={{ color: '#0066CC' }}>{fmtTime(timer)}</span>
        </div>
      )}

      {/* 左手数据 */}
      <div className={`zeiss-card overflow-hidden transition-opacity ${isLeftActive ? 'opacity-100' : 'opacity-50'}`}>
        <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-light)' }}>
          <div className="w-2 h-2 rounded-full" style={{ background: isLeftActive ? '#0066CC' : 'var(--border-light)' }} />
          <h3 className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>左手 · 压力曲线</h3>
        </div>
        <div className="h-[90px] px-1"><EChart option={leftLineOpt} height={90} /></div>
        <div className="px-4 py-2 space-y-1.5">
          <Metric label="平均压力" value={leftStats.avg + ' mmHg'} color="#0066CC" />
          <Metric label="最大压力" value={leftStats.max + ' mmHg'} color="#0066CC" />
          <Metric label="压力总和" value={leftStats.sum + ' mmHg'} color="#0066CC" />
        </div>
      </div>

      {/* 左手正态分布 */}
      <div className={`zeiss-card overflow-hidden transition-opacity ${isLeftActive ? 'opacity-100' : 'opacity-50'}`}>
        <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-light)' }}>
          <div className="w-2 h-2 rounded-full" style={{ background: isLeftActive ? '#0891B2' : 'var(--border-light)' }} />
          <h3 className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>左手 · 正态分布</h3>
        </div>
        <div className="h-[80px] px-1"><EChart option={leftNormalOpt} height={80} /></div>
        <div className="grid grid-cols-4 gap-1 px-3 py-2">
          {[{ l: '均值', v: leftStats.mean }, { l: '方差', v: leftStats.variance }, { l: '偏度', v: leftStats.skewness }, { l: '峰度', v: leftStats.kurtosis }].map((item, i) => (
            <div key={i} className="text-center">
              <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{item.l}</div>
              <div className="text-[11px] font-bold" style={{ color: '#0891B2' }}>{item.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 右手数据 */}
      <div className={`zeiss-card overflow-hidden transition-opacity ${isRightActive ? 'opacity-100' : 'opacity-50'}`}>
        <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-light)' }}>
          <div className="w-2 h-2 rounded-full" style={{ background: isRightActive ? '#059669' : 'var(--border-light)' }} />
          <h3 className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>右手 · 压力曲线</h3>
        </div>
        <div className="h-[90px] px-1"><EChart option={rightLineOpt} height={90} /></div>
        <div className="px-4 py-2 space-y-1.5">
          <Metric label="平均压力" value={rightStats.avg + ' mmHg'} color="#059669" />
          <Metric label="最大压力" value={rightStats.max + ' mmHg'} color="#059669" />
          <Metric label="压力总和" value={rightStats.sum + ' mmHg'} color="#059669" />
        </div>
      </div>

      {/* 右手正态分布 */}
      <div className={`zeiss-card overflow-hidden transition-opacity ${isRightActive ? 'opacity-100' : 'opacity-50'}`}>
        <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-light)' }}>
          <div className="w-2 h-2 rounded-full" style={{ background: isRightActive ? '#0891B2' : 'var(--border-light)' }} />
          <h3 className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>右手 · 正态分布</h3>
        </div>
        <div className="h-[80px] px-1"><EChart option={rightNormalOpt} height={80} /></div>
        <div className="grid grid-cols-4 gap-1 px-3 py-2">
          {[{ l: '均值', v: rightStats.mean }, { l: '方差', v: rightStats.variance }, { l: '偏度', v: rightStats.skewness }, { l: '峰度', v: rightStats.kurtosis }].map((item, i) => (
            <div key={i} className="text-center">
              <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{item.l}</div>
              <div className="text-[11px] font-bold" style={{ color: '#0891B2' }}>{item.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── 主组件 ─── */
export default function GripAssessment() {
  const navigate = useNavigate();
  const { patientInfo, institution, completeAssessment } = useAssessment();
  const videoRef = useRef(null);

  const [deviceStatus, setDeviceStatus] = useState('disconnected');
  const [phase, setPhase] = useState('left-idle');
  const [reportMode, setReportMode] = useState('static');
  const [timer, setTimer] = useState(0);
  const [pressure, setPressure] = useState(0);
  const [leftData, setLeftData] = useState([]);
  const [rightData, setRightData] = useState([]);
  const [showLeftToast, setShowLeftToast] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const timerRef = useRef(null);

  // CSV 导入相关 state
  const [showCsvDialog, setShowCsvDialog] = useState(false);
  const [csvLeftFile, setCsvLeftFile] = useState(null);
  const [csvRightFile, setCsvRightFile] = useState(null);
  const [csvAnalyzing, setCsvAnalyzing] = useState(false);
  const [csvError, setCsvError] = useState('');
  const [pythonResult, setPythonResult] = useState(null);

  // Heatmap state
  const [heatmapCanvas, setHeatmapCanvas] = useState(null);
  const [heatmapVersion, setHeatmapVersion] = useState(0);
  const bodyCanvasRef = useRef(null);
  const frameRef = useRef(0);
  const isSimulationRef = useRef(false);  // 是否模拟模式
  const serialFramesRef = useRef({ left: [], right: [] }); // 串口采集的原始帧数据（按手分开）
  const phaseRef = useRef(phase);         // 用 ref 跟踪 phase，避免串口回调 stale closure
  const [showConnectDialog, setShowConnectDialog] = useState(false); // 双端口连接对话框

  // Initialize HeatmapCanvas
  useEffect(() => {
    if (!bodyCanvasRef.current) {
      bodyCanvasRef.current = new HeatmapCanvas(30, 30, 1, 1, 'hand', {
        min: 0,
        max: 500,
        size: 40
      });
      setHeatmapCanvas(bodyCanvasRef.current.canvas);
    }
  }, []);

  // 同步 phaseRef，让串口回调始终读到最新 phase
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const leftStats = useMemo(() => {
    if (leftData.length === 0) return { avg: '0.00', max: '0.00', sum: '0.00', mean: '0.00', variance: '0.00', skewness: '0.00', kurtosis: '0.00', std: 15 };
    const vals = leftData.map(d => d.value);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const max = Math.max(...vals);
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - avg) ** 2, 0) / vals.length);
    return { avg: avg.toFixed(2), max: max.toFixed(2), sum: (avg * vals.length / 10).toFixed(2), mean: avg.toFixed(2), variance: (std ** 2).toFixed(2), skewness: '0.12', kurtosis: '2.85', std };
  }, [leftData]);

  const rightStats = useMemo(() => {
    if (rightData.length === 0) return { avg: '0.00', max: '0.00', sum: '0.00', mean: '0.00', variance: '0.00', skewness: '0.00', kurtosis: '0.00', std: 15 };
    const vals = rightData.map(d => d.value);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const max = Math.max(...vals);
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - avg) ** 2, 0) / vals.length);
    return { avg: avg.toFixed(2), max: max.toFixed(2), sum: (avg * vals.length / 10).toFixed(2), mean: avg.toFixed(2), variance: (std ** 2).toFixed(2), skewness: '-0.08', kurtosis: '3.12', std };
  }, [rightData]);

  const stepIndex = phase.startsWith('left') ? 0 : phase.startsWith('right') ? 1 : 2;

  // ─── 串口实时数据回调（区分左右手） ───
  // 使用 phaseRef 而非闭包 phase，避免回调注册后 phase 变化导致 stale closure
  const handleSerialFrame = useCallback((frameData, hand) => {
    const currentPhase = phaseRef.current;
    const sensorData = frameData.sensorValues;
    const totalPressure = sensorData.reduce((a, b) => a + b, 0);
    const avgPressure = totalPressure / sensorData.length;

    const isLeft = hand === 'left';
    const isActiveHand = isLeft ? currentPhase.startsWith('left') : currentPhase.startsWith('right');

    // 只在当前采集手匹配时更新 UI
    if (isActiveHand) {
      setPressure(avgPressure);
      const setter = isLeft ? setLeftData : setRightData;
      setter(prev => {
        const next = [...prev, { time: prev.length, value: avgPressure }];
        return next.length > 200 ? next.slice(-200) : next;
      });

      // 更新热力图 — 根据 hand 选择正确的映射函数
      if (bodyCanvasRef.current) {
        try {
          const mapped = isLeft ? mapLeftHand(sensorData) : mapRightHand(sensorData);
          bodyCanvasRef.current.changeHeatmap(mapped, 1, 1, 0);
          setHeatmapVersion(v => v + 1);
        } catch (e) { /* ignore */ }
      }
    }

    // 采集中时存储帧数据（按手分开存储）
    if (currentPhase.includes('recording') && isActiveHand) {
      serialFramesRef.current[hand].push({
        sensorValues: sensorData,
        quaternion: frameData.quaternion,
        timestamp: Date.now(),
      });
    }
  }, []); // 无依赖 — 通过 phaseRef 读取最新 phase

  // ─── 打开连接对话框 ───
  const handleConnect = useCallback(() => {
    isSimulationRef.current = false;
    setShowConnectDialog(true);
  }, []);

  // ─── 双端口连接成功回调 ───
  const handleDeviceConnected = useCallback(() => {
    // 注册左右手数据回调
    gripLeftService.setOnData((frame) => handleSerialFrame(frame, 'left'));
    gripRightService.setOnData((frame) => handleSerialFrame(frame, 'right'));
    setDeviceStatus('connected');
    setShowConnectDialog(false);
  }, [handleSerialFrame]);

  // ─── 断开连接 ───
  const handleDisconnect = useCallback(async () => {
    if (isSimulationRef.current) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    } else {
      await Promise.all([gripLeftService.disconnect(), gripRightService.disconnect()]);
    }
    setDeviceStatus('disconnected');
  }, []);

  // ─── 模拟模式 ───
  const handleSimulate = useCallback(() => {
    isSimulationRef.current = true;
    setDeviceStatus('connected');
  }, []);

  // CSV 导入分析（支持左右手同时或单侧）
  const handleCsvAnalyze = async () => {
    if (!csvLeftFile && !csvRightFile) return;
    setCsvAnalyzing(true);
    setCsvError('');
    try {
      const results = {};

      if (csvLeftFile) {
        const text = await csvLeftFile.text();
        const res = await analyzeGripCSV(text, '左手');
        if (res.success) results.left = res.data;
      }

      if (csvRightFile) {
        const text = await csvRightFile.text();
        const res = await analyzeGripCSV(text, '右手');
        if (res.success) results.right = res.data;
      }

      if (!results.left && !results.right) {
        setCsvError('分析失败，请检查 CSV 格式');
        return;
      }

      // 传递完整的双手结果 { left?: data, right?: data }
      setPythonResult(results);
      setShowCsvDialog(false);
      setPhase('report');
      setReportMode('static');
      completeAssessment('grip', { completed: true }, { pythonResult: results });
    } catch (e) {
      setCsvError(e.message || '分析失败，请确认 Python 后端已启动');
    } finally {
      setCsvAnalyzing(false);
    }
  };

  const startRecording = () => {
    const isLeft = phase === 'left-idle';
    setPhase(isLeft ? 'left-recording' : 'right-recording');
    setTimer(0);
    frameRef.current = 0;
    // 只重置当前手的帧数据
    if (isLeft) {
      serialFramesRef.current.left = [];
    } else {
      serialFramesRef.current.right = [];
    }

    if (isSimulationRef.current) {
      // 模拟模式：定时生成模拟数据
      timerRef.current = setInterval(() => {
        setTimer(p => p + 1);
        frameRef.current += 1;

        const sensorData = generateSimulatedSensorData(isLeft, frameRef.current);
        const totalPressure = sensorData.reduce((a, b) => a + b, 0);
        const avgPressure = totalPressure / sensorData.length;
        setPressure(avgPressure);

        const setter = isLeft ? setLeftData : setRightData;
        setter(prev => {
          const next = [...prev, { time: prev.length, value: avgPressure }];
          return next.length > 200 ? next.slice(-200) : next;
        });

        if (bodyCanvasRef.current) {
          try {
            const mapped = isLeft ? mapLeftHand(sensorData) : mapRightHand(sensorData);
            bodyCanvasRef.current.changeHeatmap(mapped, 1, 1, 0);
            setHeatmapVersion(v => v + 1);
          } catch (e) { /* ignore */ }
        }
      }, 100);
    } else {
      // 真实设备模式：数据由 handleSerialFrame 回调驱动，只需计时器
      timerRef.current = setInterval(() => {
        setTimer(p => p + 1);
      }, 100);
    }
  };

  // ─── 将串口帧数据转为 Python 后端期望的 CSV 格式 ───
  const framesToCSV = (frames) => {
    const lines = ['sensor_data_calibrated,relative_time,imu_data_calibrated'];
    const t0 = frames.length > 0 ? frames[0].timestamp : 0;
    for (const f of frames) {
      const sensorStr = `"[${f.sensorValues.join(',')}]"`;
      const relTime = ((f.timestamp - t0) / 1000).toFixed(4);
      const imuStr = f.quaternion
        ? `"${f.quaternion.map(v => v.toFixed(6)).join(',')}"` : '"1.0,0.0,0.0,0.0"';
      lines.push(`${sensorStr},${relTime},${imuStr}`);
    }
    return lines.join('\n');
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    if (phase === 'left-recording') {
      setShowLeftToast(true);
      setTimeout(() => setShowLeftToast(false), 3000);
      setPhase('right-idle');
      setTimer(0);
    } else {
      setPhase('processing');
      // 非模拟模式：将串口帧数据发给 Python 后端分析
      if (!isSimulationRef.current) {
        (async () => {
          try {
            const results = {};
            const leftFrames = serialFramesRef.current.left;
            const rightFrames = serialFramesRef.current.right;

            if (leftFrames.length > 0) {
              const csv = framesToCSV(leftFrames);
              const res = await analyzeGripCSV(csv, '左手');
              if (res.success) results.left = res.data;
            }
            if (rightFrames.length > 0) {
              const csv = framesToCSV(rightFrames);
              const res = await analyzeGripCSV(csv, '右手');
              if (res.success) results.right = res.data;
            }

            if (results.left || results.right) {
              setPythonResult(results);
            }
          } catch (e) {
            console.error('串口数据分析失败:', e);
          }
          setShowCompleteDialog(true);
        })();
      } else {
        setTimeout(() => setShowCompleteDialog(true), 2000);
      }
    }
  };

  const viewReport = () => {
    setShowCompleteDialog(false);
    setPhase('report');
    setReportMode('static');
    completeAssessment('grip', { completed: true }, { leftData, rightData, pythonResult });
  };

  const handleClose = () => navigate('/dashboard');
  const fmtTime = (t) => {
    const s = Math.floor(t / 10);
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    // 组件卸载时断开两个串口
    if (gripLeftService.connected) gripLeftService.disconnect();
    if (gripRightService.connected) gripRightService.disconnect();
  }, []);

  /* ─── 报告模式 ─── */
  if (phase === 'report') {
    if (reportMode === 'dynamic') {
      return (
        <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
          <header className="h-14 flex items-center justify-between px-6 shrink-0 z-20"
            style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)', boxShadow: 'var(--shadow-xs)' }}>
            <div className="flex items-center gap-3">
              <img src="/logo1.png" alt="Logo" className="w-8 h-8 rounded-lg" />
              <h1 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>
                肌少症/老年人评估及监测系统
                <span className="ml-2 font-normal" style={{ color: 'var(--text-muted)' }}>——1.握力评估</span>
              </h1>
            </div>
            <div className="flex items-center gap-5">
              <StepIndicator current={2} steps={['左手', '右手', '完成']} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{patientInfo?.name || '未知'}</span>
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{institution || ''}</span>
              <button onClick={() => navigate('/history')} className="zeiss-btn-ghost text-xs">历史记录</button>
            </div>
          </header>
          <main className="flex-1 flex flex-col items-center justify-center p-6 z-10">
            <div className="zeiss-card p-6 flex flex-col items-center gap-4 max-w-4xl w-full">
              <div className="flex items-center justify-between w-full">
                <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{patientInfo?.name}的握力评估动态报告</h2>
                <div className="flex items-center gap-3">
                  <button onClick={() => setReportMode('static')}
                    className="zeiss-btn-secondary flex items-center gap-2 text-xs py-2 px-4">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    切换静态报告
                  </button>
                  <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                    style={{ color: 'var(--text-muted)' }}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
              <video ref={videoRef} src="/assets/dynamic_report.mp4" controls className="w-full rounded-xl" style={{ maxHeight: '70vh', background: '#000' }} />
            </div>
          </main>
        </div>
      );
    }

    return (
      <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
        <header className="h-14 flex items-center justify-between px-6 shrink-0 z-20"
          style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)', boxShadow: 'var(--shadow-xs)' }}>
          <div className="flex items-center gap-3">
            <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <img src="/logo1.png" alt="Logo" className="w-8 h-8 rounded-lg" />
            <h1 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>
              肌少症/老年人评估及监测系统
              <span className="ml-2 font-normal" style={{ color: 'var(--text-muted)' }}>——1.握力评估</span>
            </h1>
          </div>
          <div className="flex items-center gap-5">
            <StepIndicator current={2} steps={['左手', '右手', '完成']} />
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{patientInfo?.name || '未知'}</span>
            <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{institution || ''}</span>
            <button onClick={() => setReportMode(reportMode === 'static' ? 'dynamic' : 'static')}
              className="zeiss-btn-ghost text-xs flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {reportMode === 'static' ? '动态报告' : '静态报告'}
            </button>
            <button onClick={handleClose} className="zeiss-btn-primary text-xs py-2 px-4">返回首页</button>
          </div>
        </header>
        <main className="flex-1 min-h-0 z-10">
          <GripReport patientName={patientInfo?.name || '未知'} onClose={handleClose} onSwitchDynamic={() => setReportMode('dynamic')} pythonResult={pythonResult} />
        </main>
      </div>
    );
  }

  /* ─── 采集模式 — 左侧数据面板 + 右侧3D手模型 ─── */
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="assessment-header">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors shrink-0"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <img src="/logo1.png" alt="Logo" className="w-7 h-7 md:w-8 md:h-8 rounded-lg shrink-0" />
          <h1 className="text-[13px] md:text-[15px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
            <span className="hidden lg:inline">肌少症/老年人评估及监测系统——</span>1.握力评估
          </h1>
        </div>
        <div className="flex items-center gap-2 md:gap-4 shrink-0">
          <StepIndicator current={stepIndex} steps={['左手', '右手', '完成']} />

          {/* 设备状态 */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)' }}>
            <div className={`zeiss-status-dot ${deviceStatus}`} />
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {deviceStatus === 'connected' ? '已连接' : deviceStatus === 'connecting' ? '连接中...' : '未连接'}
            </span>
            {deviceStatus === 'disconnected' && (
              <>
                <button onClick={handleConnect} className="text-xs font-medium ml-1" style={{ color: 'var(--zeiss-blue)', background: 'none', border: 'none', cursor: 'pointer' }}>连接</button>
                <span style={{ color: 'var(--border-medium)' }}>|</span>
                <button onClick={handleSimulate} className="text-xs font-medium" style={{ color: '#0891B2', background: 'none', border: 'none', cursor: 'pointer' }}>模拟</button>
              </>
            )}
            {deviceStatus === 'connected' && (
              <button onClick={handleDisconnect} className="text-xs font-medium ml-1" style={{ color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer' }}>断开</button>
            )}
          </div>

          <span className="text-sm font-medium hidden md:inline" style={{ color: 'var(--text-primary)' }}>{patientInfo?.name || '未知'}</span>
          <button onClick={() => navigate('/history')} className="zeiss-btn-ghost text-xs hidden lg:inline-flex">历史记录</button>
        </div>
      </header>

      {/* Toast */}
      {showLeftToast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 animate-slideUp"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-lg)', borderRadius: 'var(--radius-md)', padding: '10px 20px' }}>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'var(--zeiss-blue)' }}>
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>左手采集完成</span>
          </div>
        </div>
      )}

      {/* 报告完成弹窗 */}
      {showCompleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center zeiss-overlay animate-fadeIn">
          <div className="zeiss-dialog p-8 flex flex-col items-center gap-4 min-w-[340px] animate-scaleIn">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--success-light)' }}>
              <svg className="w-7 h-7" style={{ color: 'var(--success)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>采集完成，报告已生成</h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>您可以查看报告或返回首页继续其他评估</p>
            <div className="flex gap-3 w-full mt-2">
              <button onClick={() => { setShowCompleteDialog(false); completeAssessment('grip', { completed: true }, { leftData, rightData, pythonResult }); navigate('/dashboard'); }}
                className="zeiss-btn-secondary flex-1 py-3 text-sm">返回首页</button>
              <button onClick={viewReport}
                className="zeiss-btn-primary flex-1 py-3 text-sm">查看报告</button>
            </div>
          </div>
        </div>
      )}

      {/* 双端口连接对话框 */}
      <ConnectDialog
        open={showConnectDialog}
        onClose={() => setShowConnectDialog(false)}
        onConnected={handleDeviceConnected}
      />

      {/* CSV 导入对话框 */}
      {showCsvDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center zeiss-overlay animate-fadeIn">
          <div className="zeiss-dialog p-6 min-w-[400px] animate-scaleIn">
            <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>导入CSV数据分析</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>支持单侧或双侧同时导入</p>

            {/* 左手 CSV */}
            <div className="mb-3">
              <label className="text-xs font-medium mb-1.5 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: '#0066CC' }} />
                左手 CSV
              </label>
              <label className="flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
                style={{ border: `1px solid ${csvLeftFile ? 'var(--zeiss-blue)' : 'var(--border-medium)'}`, background: csvLeftFile ? 'var(--zeiss-blue-light)' : 'var(--bg-tertiary)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="w-4 h-4 shrink-0" style={{ color: csvLeftFile ? 'var(--zeiss-blue)' : 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm truncate" style={{ color: csvLeftFile ? 'var(--zeiss-blue)' : 'var(--text-muted)' }}>
                    {csvLeftFile ? csvLeftFile.name : '选择左手CSV文件（可选）'}
                  </span>
                </div>
                {csvLeftFile && (
                  <button onClick={(e) => { e.preventDefault(); setCsvLeftFile(null); }} className="shrink-0 ml-2 w-5 h-5 flex items-center justify-center rounded-full" style={{ background: 'rgba(0,0,0,0.1)' }}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
                <input type="file" accept=".csv" className="hidden" onChange={e => setCsvLeftFile(e.target.files?.[0] || null)} />
              </label>
            </div>

            {/* 右手 CSV */}
            <div className="mb-4">
              <label className="text-xs font-medium mb-1.5 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: '#0891B2' }} />
                右手 CSV
              </label>
              <label className="flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
                style={{ border: `1px solid ${csvRightFile ? '#0891B2' : 'var(--border-medium)'}`, background: csvRightFile ? 'rgba(8,145,178,0.08)' : 'var(--bg-tertiary)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="w-4 h-4 shrink-0" style={{ color: csvRightFile ? '#0891B2' : 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm truncate" style={{ color: csvRightFile ? '#0891B2' : 'var(--text-muted)' }}>
                    {csvRightFile ? csvRightFile.name : '选择右手CSV文件（可选）'}
                  </span>
                </div>
                {csvRightFile && (
                  <button onClick={(e) => { e.preventDefault(); setCsvRightFile(null); }} className="shrink-0 ml-2 w-5 h-5 flex items-center justify-center rounded-full" style={{ background: 'rgba(0,0,0,0.1)' }}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
                <input type="file" accept=".csv" className="hidden" onChange={e => setCsvRightFile(e.target.files?.[0] || null)} />
              </label>
            </div>

            {/* 错误提示 */}
            {csvError && (
              <div className="mb-4 px-3 py-2 rounded-lg text-xs" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                {csvError}
              </div>
            )}

            {/* 按钮 */}
            <div className="flex gap-3">
              <button onClick={() => setShowCsvDialog(false)} disabled={csvAnalyzing}
                className="zeiss-btn-secondary flex-1 py-2.5 text-sm">取消</button>
              <button onClick={handleCsvAnalyze} disabled={(!csvLeftFile && !csvRightFile) || csvAnalyzing}
                className="zeiss-btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2"
                style={{ opacity: ((!csvLeftFile && !csvRightFile) || csvAnalyzing) ? 0.5 : 1 }}>
                {csvAnalyzing && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {csvAnalyzing ? '分析中...' : '开始分析'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main: 左侧面板 + 右侧3D */}
      <main className="flex-1 flex min-h-0 relative z-10">
        {/* 左侧数据面板 */}
        <div className="assessment-side-panel">
          <LeftDataPanel
            leftData={leftData} rightData={rightData}
            leftStats={leftStats} rightStats={rightStats}
            phase={phase} timer={timer} fmtTime={fmtTime}
          />
        </div>

        {/* 右侧3D区域 */}
        <div className="flex-1 flex flex-col items-center justify-center relative">
          <div className="relative w-full h-full flex items-center justify-center model-container m-3 rounded-xl">
            <HandModel isRecording={phase.includes('recording')} pressureValue={pressure} isLeftHand={phase.startsWith('left')} heatmapCanvas={heatmapCanvas} heatmapVersion={heatmapVersion} />
            {phase === 'processing' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl" style={{ background: 'rgba(245,246,248,0.8)', backdropFilter: 'blur(4px)' }}>
                <div className="w-64 h-2 rounded-full overflow-hidden mb-4" style={{ background: 'var(--border-light)' }}>
                  <div className="h-full rounded-full progress-animate" style={{ background: 'var(--zeiss-blue)' }} />
                </div>
                <p className="font-medium text-sm" style={{ color: 'var(--text-secondary)' }}>正在汇总采集数据并生成报告，请稍候...</p>
              </div>
            )}
          </div>

          {/* 控制按钮 */}
          {phase !== 'processing' && (
            <div className="absolute bottom-10 z-20 flex flex-col items-center gap-3">
              {phase.includes('idle') && deviceStatus === 'connected' && (
                <>
                  <button onClick={startRecording}
                    className="w-16 h-16 rounded-full flex items-center justify-center hover:scale-105 transition-transform"
                    style={{ border: '3px solid var(--border-medium)', background: 'transparent' }}>
                    <div className="w-11 h-11 rounded-full" style={{ background: 'linear-gradient(135deg, #F0F4F8, #FFFFFF)', boxShadow: 'var(--shadow-sm)' }} />
                  </button>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>开始采集{phase === 'left-idle' ? '左手' : '右手'}</span>
                </>
              )}
              {phase.includes('idle') && deviceStatus !== 'connected' && (
                <span className="text-sm px-5 py-2.5 rounded-lg" style={{ color: 'var(--text-muted)', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
                  请先连接设备或选择模拟模式
                </span>
              )}
              {/* 导入CSV按钮 - 仅模拟模式下可见 */}
              {phase.includes('idle') && deviceStatus === 'connected' && (
                <button onClick={() => { setShowCsvDialog(true); setCsvError(''); setCsvLeftFile(null); setCsvRightFile(null); }}
                  className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                  style={{ color: 'var(--zeiss-blue)', background: 'var(--zeiss-blue-light)', border: '1px solid rgba(0,102,204,0.15)' }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  导入CSV分析
                </button>
              )}
              {phase.includes('recording') && (
                <>
                  <button onClick={stopRecording}
                    className="w-16 h-16 rounded-full flex items-center justify-center hover:scale-105 transition-transform"
                    style={{ border: '3px solid var(--zeiss-blue)', background: 'rgba(0,102,204,0.05)' }}>
                    <div className="w-7 h-7 rounded-sm" style={{ background: 'var(--zeiss-blue)' }} />
                  </button>
                  <div className="flex items-center gap-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    <span>结束采集{phase === 'left-recording' ? '左手' : '右手'}</span>
                    <span className="font-mono px-3 py-1 rounded-md" style={{ background: 'var(--zeiss-blue-light)', color: 'var(--zeiss-blue)' }}>{fmtTime(timer)}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </main>

      <div className="h-6 flex items-center px-6 shrink-0 z-10">
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>powered by 矩侨工业</span>
      </div>
    </div>
  );
}
