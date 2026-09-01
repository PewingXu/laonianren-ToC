import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAssessment } from '../../contexts/AssessmentContext';
import EChart from '../../components/ui/EChart';
import { analyzeSitStandCSV } from '../../lib/gripPythonApi';
import { SingleFootpadSerialService } from '../../lib/footpad-sdk/services/FootpadSerialService';
import {
  PressureScene3D, matrixStats, calculateCoP, PressureSimulator,
} from '../../lib/pressure-sensor';

/* ─── 双传感器串口服务实例 ─── */
const seatPadService = new SingleFootpadSerialService('sitstand-seat', '坐垫');
seatPadService.configure({
  rows: 32, cols: 32, baudRate: 1000000,
  // 32×32 坐垫行序修正：后半部分 (行15-31) 需要上下翻转
  preProcessMatrix: (matrix) => {
    const fixed = matrix.map(row => [...row]);
    for (let i = 15; i < 32; i++) fixed[i] = [...matrix[46 - i]]; // 15↔31, 16↔30, ...
    return fixed;
  },
});

const footPadService = new SingleFootpadSerialService('sitstand-foot', '足垫');

/* ─── 图表样式常量 ─── */
const C = { text: '#6B7B8D', grid: '#EDF0F4', blue: '#0066CC', green: '#059669', red: '#DC2626', amber: '#D97706' };
const ttStyle = { backgroundColor: '#fff', borderColor: '#E5E9EF', textStyle: { color: '#1A2332', fontSize: 11 }, extraCssText: 'box-shadow:0 4px 20px rgba(0,0,0,0.08);border-radius:8px;' };

/* ─── 左侧数据面板 ─── */
function LeftDataPanel({ seatStats, footpadStats, seatCoP, footpadCoP, seatHistory, footpadHistory, isRecording, timer, fmtTime }) {
  /* 坐垫压力曲线 */
  const seatLineOpt = useMemo(() => ({
    animation: false,
    grid: { top: 8, bottom: 16, left: 32, right: 8 },
    xAxis: { show: false, type: 'category', data: seatHistory.map((_, i) => i) },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: C.grid } }, axisLabel: { color: C.text, fontSize: 9 } },
    series: [{ type: 'line', smooth: true, symbol: 'none', data: seatHistory,
      lineStyle: { color: C.blue, width: 1.5 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: C.blue + '20' }, { offset: 1, color: 'transparent' }] } }
    }]
  }), [seatHistory]);

  /* 脚垫压力曲线 */
  const footLineOpt = useMemo(() => ({
    animation: false,
    grid: { top: 8, bottom: 16, left: 32, right: 8 },
    xAxis: { show: false, type: 'category', data: footpadHistory.map((_, i) => i) },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: C.grid } }, axisLabel: { color: C.text, fontSize: 9 } },
    series: [{ type: 'line', smooth: true, symbol: 'none', data: footpadHistory,
      lineStyle: { color: C.green, width: 1.5 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: C.green + '20' }, { offset: 1, color: 'transparent' }] } }
    }]
  }), [footpadHistory]);

  /* CoP 散点图 */
  const copOpt = useMemo(() => ({
    animation: false,
    grid: { top: 20, bottom: 28, left: 36, right: 12 },
    xAxis: { name: 'X', type: 'value', min: 0, max: 100, nameTextStyle: { color: C.text, fontSize: 9 }, splitLine: { lineStyle: { color: C.grid } }, axisLabel: { color: C.text, fontSize: 9 } },
    yAxis: { name: 'Y', type: 'value', min: 0, max: 100, nameTextStyle: { color: C.text, fontSize: 9 }, splitLine: { lineStyle: { color: C.grid } }, axisLabel: { color: C.text, fontSize: 9 } },
    series: [
      { type: 'scatter', symbolSize: 8, itemStyle: { color: C.blue },
        data: seatCoP ? [[+(seatCoP.x * 100).toFixed(1), +(seatCoP.y * 100).toFixed(1)]] : [],
        name: '坐垫' },
      { type: 'scatter', symbolSize: 8, itemStyle: { color: C.green },
        data: footpadCoP ? [[+(footpadCoP.x * 100).toFixed(1), +(footpadCoP.y * 100).toFixed(1)]] : [],
        name: '脚垫' },
    ]
  }), [seatCoP, footpadCoP]);

  const Metric = ({ label, value, color }) => (
    <div className="zeiss-data-row">
      <span className="zeiss-data-label text-[11px]">{label}</span>
      <span className="zeiss-data-value text-xs font-semibold tabular-nums" style={{ color }}>{value}</span>
    </div>
  );

  return (
    <div className="h-full flex flex-col gap-3 overflow-y-auto">
      {/* 采集状态卡片 */}
      {isRecording && (
        <div className="zeiss-card p-3 flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: C.red }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>采集中</span>
          <span className="font-mono text-sm font-bold ml-auto" style={{ color: C.blue }}>{fmtTime(timer)}</span>
        </div>
      )}

      {/* 坐垫数据 */}
      <div className="zeiss-card overflow-hidden">
        <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-light)' }}>
          <div className="w-2 h-2 rounded-full" style={{ background: C.blue }} />
          <h3 className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>坐垫压力 (32×32)</h3>
        </div>
        <div className="h-[90px] px-1"><EChart option={seatLineOpt} height={90} /></div>
        <div className="px-4 py-2.5 space-y-1.5">
          <Metric label="最大压力" value={seatStats ? seatStats.max.toFixed(0) : '---'} color={C.blue} />
          <Metric label="平均压力" value={seatStats ? seatStats.mean.toFixed(1) : '---'} color={C.blue} />
          <Metric label="总压力" value={seatStats ? seatStats.totalPressure.toFixed(0) : '---'} color={C.blue} />
          <Metric label="有效点" value={seatStats ? seatStats.nonZeroCount : '---'} color={C.blue} />
          <Metric label="CoP X" value={seatCoP ? (seatCoP.x * 100).toFixed(1) + '%' : '---'} color={C.blue} />
          <Metric label="CoP Y" value={seatCoP ? (seatCoP.y * 100).toFixed(1) + '%' : '---'} color={C.blue} />
        </div>
      </div>

      {/* 脚垫数据 */}
      <div className="zeiss-card overflow-hidden">
        <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-light)' }}>
          <div className="w-2 h-2 rounded-full" style={{ background: C.green }} />
          <h3 className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>脚垫压力 (64×64)</h3>
        </div>
        <div className="h-[90px] px-1"><EChart option={footLineOpt} height={90} /></div>
        <div className="px-4 py-2.5 space-y-1.5">
          <Metric label="最大压力" value={footpadStats ? footpadStats.max.toFixed(0) : '---'} color={C.green} />
          <Metric label="平均压力" value={footpadStats ? footpadStats.mean.toFixed(1) : '---'} color={C.green} />
          <Metric label="总压力" value={footpadStats ? footpadStats.totalPressure.toFixed(0) : '---'} color={C.green} />
          <Metric label="有效点" value={footpadStats ? footpadStats.nonZeroCount : '---'} color={C.green} />
          <Metric label="CoP X" value={footpadCoP ? (footpadCoP.x * 100).toFixed(1) + '%' : '---'} color={C.green} />
          <Metric label="CoP Y" value={footpadCoP ? (footpadCoP.y * 100).toFixed(1) + '%' : '---'} color={C.green} />
        </div>
      </div>

      {/* CoP 散点图 */}
      <div className="zeiss-card overflow-hidden">
        <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-light)' }}>
          <div className="w-2 h-2 rounded-full" style={{ background: C.amber }} />
          <h3 className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>压力中心 (CoP)</h3>
        </div>
        <div className="h-[140px] px-1"><EChart option={copOpt} height={140} /></div>
      </div>
    </div>
  );
}

/* ─── 3D场景控制面板（浮动） ─── */
function SceneControlPanel({ config, onConfigChange }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(8px)', border: '1px solid var(--border-light)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <h4 className="text-[10px] font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>显示设置</h4>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={config.showHeatmap}
            onChange={(e) => onConfigChange({ showHeatmap: e.target.checked })}
            className="rounded" style={{ accentColor: 'var(--zeiss-blue)' }} />
          热力图
        </label>
        <div>
          <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>
            <span>深度</span><span>{(config.depthScale * 100).toFixed(0)}%</span>
          </div>
          <input type="range" min={0} max={0.35} step={0.01} value={config.depthScale}
            onChange={(e) => onConfigChange({ depthScale: parseFloat(e.target.value) })}
            className="w-full h-1 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: 'var(--zeiss-blue)' }} />
        </div>
        <div>
          <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>
            <span>平滑度</span><span>{(config.smoothness * 100).toFixed(0)}%</span>
          </div>
          <input type="range" min={0} max={1} step={0.05} value={config.smoothness}
            onChange={(e) => onConfigChange({ smoothness: parseFloat(e.target.value) })}
            className="w-full h-1 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: 'var(--zeiss-blue)' }} />
        </div>
      </div>
    </div>
  );
}

/* ─── 起坐报告组件（真实数据版） ─── */
function SitStandReport({ patientInfo, pythonResult }) {
  const sections = [
    { id: 'overview', title: '基本信息' },
    { id: 'summary', title: '总体指标' },
    { id: 'stand-evo', title: '站立压力演变' },
    { id: 'stand-cop', title: '站立COP轨迹' },
    { id: 'sit-evo', title: '坐姿压力演变' },
    { id: 'sit-cop', title: '坐姿COP轨迹' },
    { id: 'force-curve', title: '力-时间曲线' },
    { id: 'conclusion', title: '综合评估' },
  ];
  const [activeSection, setActiveSection] = useState('overview');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (pythonResult) {
      // Python API 返回 base64 图片数据
      const imgs = pythonResult.images || {};
      const converted = {
        ...pythonResult,
        test_date: pythonResult.test_date || new Date().toLocaleString(),
        stand_evolution: {
          labels: (imgs.stand_evolution || [])
            .filter((h) => h.label === 0)
            .sort((a, b) => a.sublabel - b.sublabel)
            .map((h) => `${Math.round((h.sublabel / 10) * 100)}%`),
          heatmaps: (imgs.stand_evolution || []).map((h) => ({
            row: h.label,
            col: h.sublabel,
            foot: h.label === 0 ? 'left' : 'right',
            file: h.image,
          })),
        },
        stand_cop: {
          left_image: imgs.stand_cop_left,
          right_image: imgs.stand_cop_right,
        },
        sit_evolution: {
          labels: (imgs.sit_evolution || []).map((_, i) => {
            if (i === 0) return 'Start';
            if (i === 10) return 'End';
            return `${Math.round((i / 10) * 100)}%`;
          }),
          heatmaps: (imgs.sit_evolution || []).map((h, i) => ({
            col: i,
            file: h.image,
          })),
        },
        sit_cop: { image: imgs.sit_cop },
        force_curves: pythonResult.force_curves || null,
      };
      setReportData(converted);
      setLoading(false);
      return;
    }
    // 没有分析结果，不再回退到静态样例数据
    setLoading(false);
  }, [pythonResult]);

  const scrollToSection = (id) => {
    document.getElementById(`sit-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveSection(id);
  };

  const d = reportData;

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="w-10 h-10 border-3 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: 'var(--zeiss-blue)', borderTopColor: 'transparent' }} />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>加载报告数据...</p>
      </div>
    </div>
  );

  if (!d) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>暂无分析数据</p>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>请通过传感器采集数据后再查看报告，或使用"导入CSV分析"功能</p>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      <nav className="w-48 shrink-0 p-4 sticky top-0" style={{ borderRight: '1px solid var(--border-light)' }}>
        <h3 className="text-xs font-semibold mb-4 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>报告目录</h3>
        {sections.map(s => (
          <button key={s.id} onClick={() => scrollToSection(s.id)}
            className={`zeiss-nav-item mb-1 ${activeSection === s.id ? 'active' : ''}`}>
            {s.title}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* ── 基本信息 ── */}
        <section id="sit-overview">
          <div className="zeiss-section-title">基本信息</div>
          <div className="grid grid-cols-4 gap-4">
            {[
              { l: '姓名', v: patientInfo?.name || '---' },
              { l: '测试类型', v: '五次起坐测试' },
              { l: '测试时间', v: d.test_date || new Date().toLocaleString() },
              { l: '完成周期', v: `${d.duration_stats?.num_cycles || 5}次` },
            ].map((item, i) => (
              <div key={i} className="zeiss-card-inner p-4">
                <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{item.l}</div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{item.v}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 总体指标 ── */}
        <section id="sit-summary">
          <div className="zeiss-section-title">总体指标</div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { l: '总时长', v: `${d.duration_stats?.total_duration?.toFixed(1) || '--'}s`, c: C.blue },
              { l: '起坐周期数', v: `${d.duration_stats?.num_cycles || '--'}次`, c: C.green },
              { l: '平均周期时长', v: `${d.duration_stats?.avg_duration?.toFixed(2) || '--'}s`, c: '#0891B2' },
            ].map((item, i) => (
              <div key={i} className="zeiss-card-inner p-5 text-center">
                <div className="text-3xl font-bold" style={{ color: item.c }}>{item.v}</div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{item.l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 站立足底压力演变 ── */}
        <section id="sit-stand-evo">
          <div className="zeiss-section-title">站立足底压力演变</div>
          <div className="zeiss-card p-4">
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>站立过程中左右脚足底压力分布随时间的变化（0%~100%）</p>
            <div className="flex gap-1 mb-1 pl-12">
              {(d.stand_evolution?.labels || []).map((label, i) => (
                <div key={i} className="flex-1 text-center text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
              ))}
            </div>
            <div className="flex items-center gap-1 mb-1">
              <div className="w-12 text-right text-xs font-medium shrink-0" style={{ color: 'var(--zeiss-blue)' }}>左脚</div>
              <div className="flex gap-1 flex-1">
                {(d.stand_evolution?.heatmaps || []).filter(h => h.foot === 'left').sort((a, b) => a.col - b.col).map((h, i) => (
                  <div key={i} className="flex-1">
                    <img src={h.file} alt={`左脚 ${d.stand_evolution.labels[h.col]}`}
                      className="w-full rounded" style={{ background: '#000' }} loading="lazy" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-12 text-right text-xs font-medium shrink-0" style={{ color: 'var(--success)' }}>右脚</div>
              <div className="flex gap-1 flex-1">
                {(d.stand_evolution?.heatmaps || []).filter(h => h.foot === 'right').sort((a, b) => a.col - b.col).map((h, i) => (
                  <div key={i} className="flex-1">
                    <img src={h.file} alt={`右脚 ${d.stand_evolution.labels[h.col]}`}
                      className="w-full rounded" style={{ background: '#000' }} loading="lazy" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── 站立COP轨迹 ── */}
        <section id="sit-stand-cop">
          <div className="zeiss-section-title">站立COP轨迹</div>
          <div className="grid grid-cols-2 gap-4">
            <div className="zeiss-card p-4 text-center">
              <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-tertiary)' }}>左脚 COP 轨迹</div>
              {d.stand_cop?.left_image ? <img src={d.stand_cop.left_image} alt="左脚COP" className="mx-auto rounded-lg" style={{ maxHeight: 360, objectFit: 'contain', background: '#000' }} loading="lazy" /> : <p className="text-xs" style={{ color: 'var(--text-muted)' }}>数据不可用</p>}
            </div>
            <div className="zeiss-card p-4 text-center">
              <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-tertiary)' }}>右脚 COP 轨迹</div>
              {d.stand_cop?.right_image ? <img src={d.stand_cop.right_image} alt="右脚COP" className="mx-auto rounded-lg" style={{ maxHeight: 360, objectFit: 'contain', background: '#000' }} loading="lazy" /> : <p className="text-xs" style={{ color: 'var(--text-muted)' }}>数据不可用</p>}
            </div>
          </div>
        </section>

        {/* ── 坐姿压力演变 ── */}
        <section id="sit-sit-evo">
          <div className="zeiss-section-title">坐姿压力演变</div>
          <div className="zeiss-card p-4">
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>坐姿过程中坐垫压力分布随时间的变化（Start~End）</p>
            <div className="flex gap-1 mb-1">
              {(d.sit_evolution?.labels || []).map((label, i) => (
                <div key={i} className="flex-1 text-center text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
              ))}
            </div>
            <div className="flex gap-1">
              {(d.sit_evolution?.heatmaps || []).sort((a, b) => a.col - b.col).map((h, i) => (
                <div key={i} className="flex-1">
                  <img src={h.file} alt={`坐姿 ${d.sit_evolution.labels[h.col]}`}
                    className="w-full rounded" style={{ background: '#000' }} loading="lazy" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 坐姿COP轨迹 ── */}
        <section id="sit-sit-cop">
          <div className="zeiss-section-title">坐姿COP轨迹</div>
          <div className="zeiss-card p-4 text-center">
            {d.sit_cop?.image ? <img src={d.sit_cop.image} alt="坐姿COP" className="mx-auto rounded-lg" style={{ maxHeight: 400, objectFit: 'contain', background: '#000' }} loading="lazy" /> : <p className="text-xs" style={{ color: 'var(--text-muted)' }}>数据不可用</p>}
          </div>
        </section>

        {/* ── 力-时间曲线 ── */}
        <section id="sit-force-curve">
          <div className="zeiss-section-title">力-时间曲线</div>
          <div className="grid grid-cols-1 gap-4">
            {d.force_curves?.stand_force && (
              <div className="zeiss-card p-4">
                <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-tertiary)' }}>站立脚垫 - 总力随时间变化</div>
                <EChart height={240} option={{
                  animation: false,
                  grid: { top: 20, bottom: 36, left: 56, right: 16 },
                  tooltip: { ...ttStyle, trigger: 'axis', axisPointer: { type: 'line' } },
                  xAxis: { type: 'value', name: '帧', nameTextStyle: { color: C.text, fontSize: 10 },
                    min: 0, max: d.force_curves.stand_force.length - 1,
                    axisLabel: { color: C.text, fontSize: 9 }, splitLine: { show: false } },
                  yAxis: { type: 'value', name: '总力', nameTextStyle: { color: C.text, fontSize: 10 },
                    axisLabel: { color: C.text, fontSize: 9 }, splitLine: { lineStyle: { color: C.grid } } },
                  series: [
                    { type: 'line', smooth: true, symbol: 'none', sampling: 'lttb', large: true,
                      data: d.force_curves.stand_force.map((v, i) => [i, v]),
                      lineStyle: { color: C.blue, width: 1.5 },
                      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [{ offset: 0, color: C.blue + '30' }, { offset: 1, color: 'transparent' }] } } },
                  ],
                }} />
              </div>
            )}
            {d.force_curves?.sit_force && (
              <div className="zeiss-card p-4">
                <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-tertiary)' }}>坐姿坐垫 - 总力随时间变化</div>
                <EChart height={240} option={{
                  animation: false,
                  grid: { top: 20, bottom: 36, left: 56, right: 16 },
                  tooltip: { ...ttStyle, trigger: 'axis', axisPointer: { type: 'line' } },
                  xAxis: { type: 'value', name: '帧', nameTextStyle: { color: C.text, fontSize: 10 },
                    min: 0, max: d.force_curves.sit_force.length - 1,
                    axisLabel: { color: C.text, fontSize: 9 }, splitLine: { show: false } },
                  yAxis: { type: 'value', name: '总力', nameTextStyle: { color: C.text, fontSize: 10 },
                    axisLabel: { color: C.text, fontSize: 9 }, splitLine: { lineStyle: { color: C.grid } } },
                  series: [
                    { type: 'line', smooth: true, symbol: 'none', sampling: 'lttb', large: true,
                      data: d.force_curves.sit_force.map((v, i) => [i, v]),
                      lineStyle: { color: C.green, width: 1.5 },
                      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [{ offset: 0, color: C.green + '30' }, { offset: 1, color: 'transparent' }] } } },
                  ],
                }} />
              </div>
            )}
            {!d.force_curves?.stand_force && !d.force_curves?.sit_force && (
              <div className="zeiss-card p-6 text-center">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>力-时间曲线数据不可用</p>
              </div>
            )}
          </div>
        </section>

        {/* ── 综合评估 ── */}
        <section id="sit-conclusion">
          <div className="zeiss-section-title">综合评估</div>
          <div className="zeiss-card-inner p-5">
            <h5 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>评估结论</h5>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              受试者完成五次起坐测试，总时长 {d.duration_stats?.total_duration?.toFixed(1) || '--'} 秒，
              共 {d.duration_stats?.num_cycles || '--'} 个完整周期，
              平均周期时长 {d.duration_stats?.avg_duration?.toFixed(2) || '--'} 秒。
              站立过程中足底压力分布显示左右脚受力基本对称，COP轨迹集中在足部中心区域，表明站立稳定性良好。
              坐姿压力分布均匀，重心控制稳定。根据国际肌少症工作组(EWGSOP2)标准，
              五次起坐测试时间{(d.duration_stats?.total_duration || 0) < 15 ? '小于' : '大于'}15秒，
              {(d.duration_stats?.total_duration || 0) < 15 ? '该受试者下肢肌力正常' : '建议进一步评估下肢肌力'}。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   主组件
   ═══════════════════════════════════════════ */
export default function SitStandAssessment() {
  const navigate = useNavigate();
  const location = useLocation();
  const { patientInfo, institution, completeAssessment, assessments } = useAssessment();
  const viewReportMode = location.state?.viewReport && assessments.sitstand?.completed;

  const [phase, setPhase] = useState(viewReportMode ? 'report' : 'idle');
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const [showComplete, setShowComplete] = useState(false);
  const [timer, setTimer] = useState(0);
  const timerRef = useRef(null);

  const [seatPressureHistory, setSeatPressureHistory] = useState([]);
  const [footpadPressureHistory, setFootpadPressureHistory] = useState([]);

  // 串口帧录制缓冲区（坐垫 32×32 + 脚垫 64×64）
  const serialFramesRef = useRef({ seat: [], footpad: [] });
  const [serialAnalyzing, setSerialAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');

  // CSV 导入相关 state
  const [showCsvDialog, setShowCsvDialog] = useState(false);
  const [csvSeatFile, setCsvSeatFile] = useState(null);
  const [csvFootFile, setCsvFootFile] = useState(null);
  const [csvAnalyzing, setCsvAnalyzing] = useState(false);
  const [csvError, setCsvError] = useState('');
  const [pythonResult, setPythonResult] = useState(
    viewReportMode ? assessments.sitstand?.data?.pythonResult || null : null
  );
  // 动态报告功能暂时禁用

  const [sceneConfig, setSceneConfig] = useState({
    showHeatmap: true,
    depthScale: 0,
    smoothness: 0.5,
  });

  /* ─── 直接管理连接状态（替代 usePressureScene） ─── */
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const [isSeatConnected, setIsSeatConnected] = useState(false);
  const [isFootpadConnected, setIsFootpadConnected] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [seatStats, setSeatStats] = useState(null);
  const [footpadStats, setFootpadStats] = useState(null);
  const [seatCoP, setSeatCoP] = useState(null);
  const [footpadCoP, setFootpadCoP] = useState(null);
  const simTimerRef = useRef(null);
  const seatSimDataRef = useRef(null);
  const footSimDataRef = useRef(null);
  const simFrameIdxRef = useRef(0);

  /** 转置矩阵（反转 FootpadSerialService 的 .T，恢复原始数据格式） */
  const transposeMatrix = useCallback((mat) => {
    const N = mat.length, M = mat[0]?.length || 0;
    const result = [];
    for (let c = 0; c < M; c++) {
      const row = [];
      for (let r = 0; r < N; r++) row.push(mat[r][c]);
      result.push(row);
    }
    return result;
  }, []);

  /** 过滤点状噪音 */
  const denoiseMatrix = useCallback((matrix, minNeighbors = 2, threshold = 5) => {
    const rows = matrix.length, cols = matrix[0].length;
    const result = matrix.map(row => [...row]);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (matrix[r][c] <= 0 || matrix[r][c] > threshold) continue;
        let neighbors = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && matrix[nr][nc] > 0) neighbors++;
          }
        }
        if (neighbors < minNeighbors) result[r][c] = 0;
      }
    }
    return result;
  }, []);

  /** flat 数组转 2D 矩阵 */
  const flatToMatrix = useCallback((flat, size) => {
    const matrix = [];
    for (let r = 0; r < size; r++) matrix.push(flat.slice(r * size, (r + 1) * size));
    return matrix;
  }, []);

  /** 顺时针旋转90°（仅用于 3D 展示） */
  const rotateCW90 = useCallback((matrix) => {
    const rows = matrix.length, cols = matrix[0]?.length || 0;
    const result = [];
    for (let c = 0; c < cols; c++) {
      const newRow = [];
      for (let r = rows - 1; r >= 0; r--) newRow.push(matrix[r][c]);
      result.push(newRow);
    }
    return result;
  }, []);

  /** 旋转180°（仅用于 3D 展示） */
  const rotate180 = useCallback((matrix) => {
    return matrix.slice().reverse().map(row => [...row].reverse());
  }, []);

  /** 处理传感器数据的通用回调
   *  @param {number[][]} matrix - 显示用矩阵（经过变换）
   *  @param {'seat'|'footpad'} role
   *  @param {number[][]} [rawMatrix] - 录制用原始矩阵（未变换），不传则自动 transpose 回去
   */
  const processSensorData = useCallback((matrix, role, rawMatrix) => {
    const scene = sceneRef.current;
    const stats = matrixStats(matrix);
    const cop = calculateCoP(matrix);
    if (role === 'seat') {
      // 3D 展示：坐垫顺时针旋转90°（仅影响显示，不影响数据计算和录制）
      if (scene) scene.updateSeatData(rotateCW90(matrix));
      setSeatStats(stats);
      setSeatCoP(cop);
      setSeatPressureHistory(prev => {
        const next = [...prev, stats.totalPressure];
        return next.length > 100 ? next.slice(-100) : next;
      });
      if (phaseRef.current === 'recording') {
        const recordMatrix = rawMatrix || transposeMatrix(matrix);
        serialFramesRef.current.seat.push({
          matrix: recordMatrix, timestamp: Date.now(),
          max: stats.max, nonZeroCount: stats.nonZeroCount, totalPressure: stats.totalPressure,
        });
      }
    } else {
      // 3D 展示：足垫旋转180°（仅影响显示，不影响数据计算和录制）
      if (scene) scene.updateFootpadData(rotate180(matrix));
      setFootpadStats(stats);
      setFootpadCoP(cop);
      setFootpadPressureHistory(prev => {
        const next = [...prev, stats.totalPressure];
        return next.length > 100 ? next.slice(-100) : next;
      });
      if (phaseRef.current === 'recording') {
        const recordMatrix = rawMatrix || transposeMatrix(matrix);
        serialFramesRef.current.footpad.push({
          matrix: recordMatrix, timestamp: Date.now(),
          max: stats.max, nonZeroCount: stats.nonZeroCount, totalPressure: stats.totalPressure,
        });
      }
    }
  }, [transposeMatrix, rotateCW90, rotate180]);

  /** 坐垫串口数据回调（FootpadSerialService 做了转置，录制时需转置回去） */
  const handleSeatSerialData = useCallback((matrix) => {
    processSensorData(matrix, 'seat');
  }, [processSensorData]);

  /** 足垫串口数据回调 */
  const handleFootpadSerialData = useCallback((matrix) => {
    processSensorData(matrix, 'footpad');
  }, [processSensorData]);

  // ─── 初始化 3D 场景 ───
  useEffect(() => {
    if (!containerRef.current) return;
    const scene = new PressureScene3D(sceneConfig);
    scene.mount(containerRef.current);
    sceneRef.current = scene;
    return () => { scene.unmount(); sceneRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 停止模拟 ───
  const stopSimulation = useCallback(() => {
    if (simTimerRef.current) { clearInterval(simTimerRef.current); simTimerRef.current = null; }
    setIsSimulating(false);
  }, []);

  // ─── 连接坐垫 ───
  const handleConnectSeat = useCallback(async () => {
    stopSimulation();
    try {
      seatPadService.setOnData(handleSeatSerialData);
      seatPadService.setOnLog((msg, type) => console.log(`[坐垫 ${type}] ${msg}`));
      seatPadService.setOnConnectionChange((connected) => setIsSeatConnected(connected));
      const ok = await seatPadService.connect();
      setIsSeatConnected(!!ok);
    } catch (err) {
      console.error('坐垫连接失败:', err);
      setIsSeatConnected(false);
    }
  }, [handleSeatSerialData, stopSimulation]);

  // ─── 连接足垫 ───
  const handleConnectFootpad = useCallback(async () => {
    stopSimulation();
    try {
      footPadService.setOnData(handleFootpadSerialData);
      footPadService.setOnLog((msg, type) => console.log(`[足垫 ${type}] ${msg}`));
      footPadService.setOnConnectionChange((connected) => setIsFootpadConnected(connected));
      const ok = await footPadService.connect();
      setIsFootpadConnected(!!ok);
    } catch (err) {
      console.error('足垫连接失败:', err);
      setIsFootpadConnected(false);
    }
  }, [handleFootpadSerialData, stopSimulation]);

  // ─── 模拟模式 ───
  const handleSimulate = useCallback(async () => {
    if (seatPadService.getIsConnected() || footPadService.getIsConnected()) return;
    if (simTimerRef.current) return;
    setIsSimulating(true);

    // 尝试加载真实模拟数据
    let useRealData = false;
    if (!seatSimDataRef.current || !footSimDataRef.current) {
      try {
        const [sitResp, standResp] = await Promise.all([
          fetch('/sit_sim_data.json'), fetch('/stand_sim_data.json'),
        ]);
        seatSimDataRef.current = (await sitResp.json()).frames;
        footSimDataRef.current = (await standResp.json()).frames;
        useRealData = true;
      } catch { seatSimDataRef.current = null; footSimDataRef.current = null; }
    } else { useRealData = true; }

    simFrameIdxRef.current = 0;

    if (useRealData && seatSimDataRef.current && footSimDataRef.current) {
      const seatFrames = seatSimDataRef.current;
      const footFrames = footSimDataRef.current;
      const total = Math.max(seatFrames.length, footFrames.length);
      simTimerRef.current = setInterval(() => {
        const idx = simFrameIdxRef.current % total;
        // 坐垫模拟数据（32×32 原始 → 降噪）
        if (seatFrames.length > 0) {
          const flat = seatFrames[idx % seatFrames.length];
          const size = Math.round(Math.sqrt(flat.length));
          const raw = flatToMatrix(flat, size);
          // 旋转180°用于显示
          const rotated = raw.slice().reverse().map(r => [...r].reverse());
          const mat = denoiseMatrix(rotated, 3, 15);
          processSensorData(mat, 'seat', raw);
        }
        // 足垫模拟数据（64×64 原始 → 降噪）
        if (footFrames.length > 0) {
          const flat = footFrames[idx % footFrames.length];
          const size = Math.round(Math.sqrt(flat.length));
          const raw = flatToMatrix(flat, size);
          // 逆时针旋转90° + 水平镜像 + 垂直镜像（与 parseFrameData 一致）
          const cols = raw[0].length, rows = raw.length;
          const rotated = [];
          for (let c = cols - 1; c >= 0; c--) {
            const newRow = [];
            for (let r = 0; r < rows; r++) newRow.push(raw[r][c]);
            rotated.push(newRow);
          }
          const mirrored = rotated.map(row => [...row].reverse());
          const flipped = [...mirrored].reverse();
          const mat = denoiseMatrix(flipped, 3, 12);
          processSensorData(mat, 'footpad', raw);
        }
        simFrameIdxRef.current++;
      }, 50);
    } else {
      // 随机模拟降级
      const seatSim = new PressureSimulator(32, 'sitting');
      const footSim = new PressureSimulator(64, 'static');
      simTimerRef.current = setInterval(() => {
        processSensorData(seatSim.update(0.05), 'seat');
        processSensorData(footSim.update(0.05), 'footpad');
      }, 50);
    }
  }, [processSensorData, flatToMatrix, denoiseMatrix]);

  const deviceConnected = isSeatConnected || isFootpadConnected || isSimulating;

  const handleConfigChange = useCallback((cfg) => {
    setSceneConfig(prev => { const n = { ...prev, ...cfg }; sceneRef.current?.updateConfig(cfg); return n; });
  }, []);

  /**
   * 将录制的帧数据转换为 Python 后端期望的 CSV 格式
   * CSV 列: ,time,max,area,press,data
   * data 列为 flat 数组字符串 "[v1,v2,v3,...]"
   */
  const framesToCSV = useCallback((frames) => {
    const lines = [',time,max,area,press,data'];
    const t0 = frames.length > 0 ? frames[0].timestamp : Date.now();
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const relTime = ((f.timestamp - t0) / 1000).toFixed(2);
      const now = new Date(f.timestamp);
      const timeStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}:${String(now.getMilliseconds()).padStart(3, '0')}`;
      const flat = f.matrix.flat();
      const maxVal = f.max || Math.max(...flat);
      const area = f.nonZeroCount || flat.filter(v => v > 0).length;
      const press = f.totalPressure || flat.reduce((a, b) => a + b, 0);
      const dataStr = `"[${flat.join(',')}]"`;
      lines.push(`${relTime},${timeStr},${maxVal},${area},${press},${dataStr}`);
    }
    return lines.join('\n');
  }, []);

  const start = () => {
    if (!deviceConnected) return;
    setPhase('recording'); setTimer(0);
    setSeatPressureHistory([]); setFootpadPressureHistory([]);
    setPythonResult(null); setAnalysisError('');
    // 清空帧缓冲区
    serialFramesRef.current = { seat: [], footpad: [] };
    timerRef.current = setInterval(() => setTimer(p => p + 1), 100);
  };

  const stop = () => {
    clearInterval(timerRef.current);
    stopSimulation();
    setAnalysisError('');

    const seatFrames = serialFramesRef.current.seat;
    const footpadFrames = serialFramesRef.current.footpad;
    console.log(`[起坐评估] 停止录制 — 坐垫帧数: ${seatFrames.length}, 脚垫帧数: ${footpadFrames.length}`);

    // 只要有任一传感器录制到数据，就尝试分析
    if (seatFrames.length > 0 || footpadFrames.length > 0) {
      setPhase('processing');
      setSerialAnalyzing(true);
      (async () => {
        try {
          // 为缺失的传感器生成最小 CSV（仅表头），避免后端报错
          const sitCsv = seatFrames.length > 0 ? framesToCSV(seatFrames) : ',time,max,area,press,data';
          const standCsv = footpadFrames.length > 0 ? framesToCSV(footpadFrames) : ',time,max,area,press,data';
          const res = await analyzeSitStandCSV(standCsv, sitCsv, patientInfo?.name);
          if (res.success) {
            setPythonResult(res.data);
            completeAssessment('sitstand', { completed: true }, { pythonResult: res.data });
          } else {
            const msg = res.error || res.message || '分析返回失败，请检查数据或 Python 后端日志';
            console.error('[起坐评估] 分析失败:', msg);
            setAnalysisError(msg);
          }
        } catch (e) {
          console.error('[起坐评估] 串口数据分析异常:', e);
          setAnalysisError(e.message || '分析请求失败，请确认 Python 后端已启动');
        } finally {
          setSerialAnalyzing(false);
          setShowComplete(true);
        }
      })();
    } else {
      // 没有帧数据，提示用户
      console.warn('[起坐评估] 未录制到任何帧数据');
      setPhase('processing');
      setAnalysisError('未录制到传感器数据，请确认传感器已连接并在采集期间有数据输入');
      setTimeout(() => setShowComplete(true), 500);
    }
  };

  const viewReport = () => {
    stopSimulation();
    setShowComplete(false); setPhase('report');
    completeAssessment('sitstand', { completed: true }, { seatPressureHistory, footpadPressureHistory, pythonResult });
  };

  // CSV 导入分析
  const handleCsvAnalyze = async () => {
    if (!csvSeatFile || !csvFootFile) return;
    setCsvAnalyzing(true);
    setCsvError('');
    try {
      const sitText = await csvSeatFile.text();
      const standText = await csvFootFile.text();
      // 静态报告分析
      const res = await analyzeSitStandCSV(standText, sitText, patientInfo?.name);
      if (res.success) {
        setPythonResult(res.data);
        setShowCsvDialog(false);
        stopSimulation();
        setPhase('report');
        completeAssessment('sitstand', { completed: true }, { pythonResult: res.data });

      } else {
        setCsvError('分析失败，请检查 CSV 格式');
      }
    } catch (e) {
      setCsvError(e.message || '分析失败，请确认 Python 后端已启动');
    } finally {
      setCsvAnalyzing(false);
    }
  };

  const fmtTime = (t) => {
    const s = Math.floor(t / 10);
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (simTimerRef.current) clearInterval(simTimerRef.current);
    // 组件卸载时断开串口
    if (seatPadService.getIsConnected()) seatPadService.disconnect().catch(() => {});
    if (footPadService.getIsConnected()) footPadService.disconnect().catch(() => {});
  }, []);

  /* ─── 报告模式 ─── */
  if (phase === 'report') {
    return (
      <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
        <header className="assessment-header">
          <div className="flex items-center gap-2 md:gap-4 min-w-0">
            <button onClick={() => navigate('/dashboard')} className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0" style={{ color: 'var(--text-muted)' }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h1 className="text-[13px] md:text-base font-bold truncate" style={{ color: 'var(--text-primary)' }}>
              <span className="hidden lg:inline">肌少症/老年人评估及监测系统——</span>2.起坐能力评估
            </h1>
          </div>
          <div className="flex items-center gap-2 md:gap-4 shrink-0">
            <span className="text-sm font-semibold hidden md:inline" style={{ color: 'var(--text-primary)' }}>{patientInfo?.name || '---'}</span>
            <button onClick={() => navigate('/dashboard')} className="zeiss-btn-primary text-xs py-2 px-3 md:px-4">返回首页</button>
          </div>
        </header>
        <main className="flex-1 min-h-0 overflow-auto">
            <SitStandReport patientInfo={patientInfo} pythonResult={pythonResult} />
        </main>
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     采集模式 — 统一布局：
     ┌──────────── header ────────────┐
     │  左侧数据面板  │  3D 场景     │
     │  (坐垫+脚垫    │  (占满右侧)  │
     │   曲线+指标     │  + 浮动控件  │
     │   +CoP图)       │              │
     └──────────────────────────────┘
     ═══════════════════════════════════════════ */
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* ── 顶部栏 ── */}
      <header className="assessment-header">
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <button onClick={() => navigate('/dashboard')} className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0" style={{ color: 'var(--text-muted)' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h1 className="text-[13px] md:text-base font-bold truncate" style={{ color: 'var(--text-primary)' }}>
            <span className="hidden lg:inline">肌少症/老年人评估及监测系统——</span>2.起坐能力评估
          </h1>
        </div>
        <div className="flex items-center gap-2 md:gap-4 shrink-0">
          {/* 传感器连接状态 */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)' }}>
            <div className={`zeiss-status-dot ${isSeatConnected ? 'connected' : 'disconnected'}`} />
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>坐垫</span>
            <div className={`zeiss-status-dot ${isFootpadConnected ? 'connected' : 'disconnected'}`} style={{ marginLeft: 4 }} />
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>脚垫</span>

            {/* 连接/模拟按钮：只要还有未连接的设备且不在模拟中就显示 */}
            {!isSimulating && (!isSeatConnected || !isFootpadConnected) && (
              <>
                <span style={{ color: 'var(--border-medium)', margin: '0 2px' }}>|</span>
                {!isSeatConnected && (
                  <button onClick={handleConnectSeat} className="text-[10px] font-medium" style={{ color: 'var(--zeiss-blue)' }}>连接坐垫</button>
                )}
                {!isFootpadConnected && (
                  <button onClick={handleConnectFootpad} className="text-[10px] font-medium" style={{ color: 'var(--zeiss-blue)' }}>连接脚垫</button>
                )}
                {!isSeatConnected && !isFootpadConnected && (
                  <>
                    <span style={{ color: 'var(--border-medium)', margin: '0 2px' }}>|</span>
                    <button onClick={handleSimulate} className="text-[10px] font-medium" style={{ color: 'var(--success)' }}>模拟</button>
                  </>
                )}
              </>
            )}
            {isSimulating && (
              <>
                <span className="text-[10px] font-medium" style={{ color: 'var(--success)' }}>模拟中</span>
                <button onClick={stopSimulation} className="text-[10px] font-medium" style={{ color: 'var(--danger, #DC2626)' }}>停止</button>
              </>
            )}
          </div>
          <span className="text-sm font-semibold hidden md:inline" style={{ color: 'var(--text-primary)' }}>{patientInfo?.name || '---'}</span>
          <button onClick={() => navigate('/history')} className="zeiss-btn-ghost text-xs hidden lg:inline-flex">历史记录</button>
        </div>
      </header>

      {/* ── 完成弹窗 ── */}
      {showComplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center zeiss-overlay animate-fadeIn">
          <div className="zeiss-dialog p-8 flex flex-col items-center gap-4 min-w-[340px] animate-slideUp">
            {pythonResult ? (
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--success-light)' }}>
                <svg className="w-7 h-7" fill="none" stroke="var(--success)" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
            ) : (
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: '#FEF3C7' }}>
                <svg className="w-7 h-7" fill="none" stroke="#D97706" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              </div>
            )}
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{pythonResult ? '采集完成，报告已生成' : analysisError ? '采集完成，分析失败' : '采集完成'}</h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{pythonResult ? '您可以查看报告或返回首页继续其他评估' : analysisError ? analysisError : '可导入CSV进行详细分析，或返回首页'}</p>
            <div className="flex gap-3 w-full mt-2">
              <button onClick={() => { setShowComplete(false); completeAssessment('sitstand', { completed: true }, { seatPressureHistory, footpadPressureHistory }); navigate('/dashboard'); }}
                className="zeiss-btn-secondary flex-1 py-3 text-sm">返回首页</button>
              {pythonResult ? (
                <button onClick={viewReport} className="zeiss-btn-primary flex-1 py-3 text-sm">查看报告</button>
              ) : (
                <button onClick={() => { setShowComplete(false); setPhase('idle'); setShowCsvDialog(true); setCsvError(''); setCsvSeatFile(null); setCsvFootFile(null); }}
                  className="zeiss-btn-primary flex-1 py-3 text-sm">导入CSV分析</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CSV 导入对话框 */}
      {showCsvDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center zeiss-overlay animate-fadeIn">
          <div className="zeiss-dialog p-6 min-w-[400px] animate-scaleIn">
            <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>导入CSV数据分析</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>请同时导入坐垫和脚垫的CSV数据</p>

            {/* 坐垫 CSV */}
            <div className="mb-3">
              <label className="text-xs font-medium mb-1.5 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: '#0066CC' }} />
                坐垫 CSV (sit.csv)
              </label>
              <label className="flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
                style={{ border: `1px solid ${csvSeatFile ? 'var(--zeiss-blue)' : 'var(--border-medium)'}`, background: csvSeatFile ? 'var(--zeiss-blue-light)' : 'var(--bg-tertiary)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="w-4 h-4 shrink-0" style={{ color: csvSeatFile ? 'var(--zeiss-blue)' : 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm truncate" style={{ color: csvSeatFile ? 'var(--zeiss-blue)' : 'var(--text-muted)' }}>
                    {csvSeatFile ? csvSeatFile.name : '选择坐垫CSV文件'}
                  </span>
                </div>
                {csvSeatFile && (
                  <button onClick={(e) => { e.preventDefault(); setCsvSeatFile(null); }} className="shrink-0 ml-2 w-5 h-5 flex items-center justify-center rounded-full" style={{ background: 'rgba(0,0,0,0.1)' }}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
                <input type="file" accept=".csv" className="hidden" onChange={e => setCsvSeatFile(e.target.files?.[0] || null)} />
              </label>
            </div>

            {/* 脚垫 CSV */}
            <div className="mb-4">
              <label className="text-xs font-medium mb-1.5 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: '#0891B2' }} />
                脚垫 CSV (stand.csv)
              </label>
              <label className="flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
                style={{ border: `1px solid ${csvFootFile ? '#0891B2' : 'var(--border-medium)'}`, background: csvFootFile ? 'rgba(8,145,178,0.08)' : 'var(--bg-tertiary)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="w-4 h-4 shrink-0" style={{ color: csvFootFile ? '#0891B2' : 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm truncate" style={{ color: csvFootFile ? '#0891B2' : 'var(--text-muted)' }}>
                    {csvFootFile ? csvFootFile.name : '选择脚垫CSV文件'}
                  </span>
                </div>
                {csvFootFile && (
                  <button onClick={(e) => { e.preventDefault(); setCsvFootFile(null); }} className="shrink-0 ml-2 w-5 h-5 flex items-center justify-center rounded-full" style={{ background: 'rgba(0,0,0,0.1)' }}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
                <input type="file" accept=".csv" className="hidden" onChange={e => setCsvFootFile(e.target.files?.[0] || null)} />
              </label>
            </div>

            {csvError && (
              <div className="mb-4 px-3 py-2 rounded-lg text-xs" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                {csvError}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowCsvDialog(false)} disabled={csvAnalyzing}
                className="zeiss-btn-secondary flex-1 py-2.5 text-sm">取消</button>
              <button onClick={handleCsvAnalyze} disabled={(!csvSeatFile || !csvFootFile) || csvAnalyzing}
                className="zeiss-btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2"
                style={{ opacity: ((!csvSeatFile || !csvFootFile) || csvAnalyzing) ? 0.5 : 1 }}>
                {csvAnalyzing && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {csvAnalyzing ? '分析中...' : '开始分析'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 主内容区：左侧面板 + 右侧3D场景 ── */}
      <main className="flex-1 flex min-h-0">
        {/* 左侧数据面板 */}
        <div className="assessment-side-panel">
          <LeftDataPanel
            seatStats={seatStats} footpadStats={footpadStats}
            seatCoP={seatCoP} footpadCoP={footpadCoP}
            seatHistory={seatPressureHistory} footpadHistory={footpadPressureHistory}
            isRecording={phase === 'recording'} timer={timer} fmtTime={fmtTime}
          />
        </div>

        {/* 右侧 3D 场景 */}
        <div className="flex-1 flex flex-col items-center justify-center relative">
          <div className="relative w-full h-full m-3 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-light)' }}>
            <div ref={containerRef} className="w-full h-full" style={{ minHeight: 200 }} />

            {/* 浮动：场景控制面板 - 右上角 */}
            <div className="absolute top-3 right-3 w-[150px] z-10">
              <SceneControlPanel config={sceneConfig} onConfigChange={handleConfigChange} />
            </div>

            {/* 浮动：传感器信息 - 左上角 */}
            <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
              {[
                { label: '坐垫 32×32', connected: isSeatConnected },
                { label: '脚垫 64×64', connected: isFootpadConnected },
              ].map(({ label, connected }) => (
                <div key={label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium"
                  style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)', color: connected ? 'var(--success)' : isSimulating ? 'var(--warning, #D97706)' : 'var(--text-muted)' }}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: connected ? 'var(--success)' : isSimulating ? 'var(--warning, #D97706)' : '#D1D9E0' }} />
                  {label} {connected ? '(硬件)' : isSimulating ? '(模拟)' : '(未连接)'}
                </div>
              ))}
            </div>

            {/* 浮动：操作按钮 - 底部居中 */}
            {phase !== 'processing' && (
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4">
                {phase === 'idle' && deviceConnected && (
                  <div className="flex flex-col items-center gap-1.5">
                    <button onClick={start} className="w-14 h-14 rounded-full border-4 flex items-center justify-center hover:scale-105 transition-transform shadow-lg" style={{ borderColor: 'var(--border-medium)', background: 'rgba(255,255,255,0.9)' }}>
                      <div className="w-10 h-10 rounded-full" style={{ background: 'linear-gradient(135deg, #F8F9FA, #E8ECF0)' }} />
                    </button>
                    <span className="text-xs font-medium px-3 py-1 rounded-full" style={{ color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)' }}>开始采集</span>
                  </div>
                )}
                {phase === 'idle' && !deviceConnected && (
                  <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', border: '1px solid var(--border-light)', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>请先连接传感器</span>
                    <button onClick={handleConnectSeat} className="zeiss-btn-secondary text-[11px] py-1.5 px-2.5">连接坐垫</button>
                    <button onClick={handleConnectFootpad} className="zeiss-btn-secondary text-[11px] py-1.5 px-2.5">连接脚垫</button>
                    <button onClick={handleSimulate} className="text-[11px] py-1.5 px-3 rounded-md font-medium" style={{ background: 'var(--success-light)', color: 'var(--success)', border: '1px solid var(--success)' }}>模拟</button>
                  </div>
                )}
                {phase === 'idle' && deviceConnected && !isSimulating && (!isSeatConnected || !isFootpadConnected) && (
                  <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', border: '1px solid var(--border-light)', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {isSeatConnected ? '坐垫已连接' : '脚垫已连接'}，还需连接{isSeatConnected ? '脚垫' : '坐垫'}
                    </span>
                    {!isSeatConnected && <button onClick={handleConnectSeat} className="zeiss-btn-secondary text-[11px] py-1.5 px-2.5">连接坐垫</button>}
                    {!isFootpadConnected && <button onClick={handleConnectFootpad} className="zeiss-btn-secondary text-[11px] py-1.5 px-2.5">连接脚垫</button>}
                  </div>
                )}
                {phase === 'recording' && (
                  <div className="flex items-center gap-4 px-5 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', border: '1px solid var(--border-light)', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                    <button onClick={stop} className="w-12 h-12 rounded-full border-4 flex items-center justify-center hover:scale-105 transition-transform" style={{ borderColor: C.blue, background: 'rgba(0,102,204,0.05)' }}>
                      <div className="w-5 h-5 rounded-sm" style={{ background: C.blue }} />
                    </button>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>结束采集</span>
                      <span className="font-mono text-sm font-bold" style={{ color: C.blue }}>{fmtTime(timer)}</span>
                    </div>
                  </div>
                )}
                {/* 导入CSV按钮 - idle 状态下始终可见 */}
                {phase === 'idle' && deviceConnected && (
                  <button onClick={() => { setShowCsvDialog(true); setCsvError(''); setCsvSeatFile(null); setCsvFootFile(null); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                    style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', color: 'var(--zeiss-blue)', border: '1px solid rgba(0,102,204,0.2)', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    导入CSV分析
                  </button>
                )}
              </div>
            )}
            {phase === 'processing' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center zeiss-overlay rounded-xl">
                <div className="w-64 h-2 rounded-full overflow-hidden mb-4" style={{ background: 'var(--border-light)' }}>
                  <div className="h-full rounded-full progress-animate" style={{ background: 'linear-gradient(to right, var(--zeiss-blue), #0891B2)' }} />
                </div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {serialAnalyzing ? '正在分析采集数据，请稍候...' : '正在生成报告，请稍候...'}
                </p>
                {serialAnalyzing && (
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    坐垫 {serialFramesRef.current.seat.length} 帧 / 脚垫 {serialFramesRef.current.footpad.length} 帧
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <div className="h-6 flex items-center px-6 shrink-0">
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>powered by 矩侨工业</span>
      </div>
    </div>
  );
}
