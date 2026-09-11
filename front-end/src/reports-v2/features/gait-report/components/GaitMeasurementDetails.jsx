import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Activity, ClipboardList, Scale, ScanLine } from 'lucide-react';

const SIDE_COLORS = { left: '#487bb4', right: '#cf713f' };

function Reading({ value, unit }) {
  if (value === null || value === undefined) {
    return <span className="gait-report__detail-missing">未测</span>;
  }
  return <span className="gait-report__detail-reading">{value}<small>{unit}</small></span>;
}

function SectionTitle({ id, icon: Icon, children }) {
  return (
    <h3 id={id} className="gait-report__section-title">
      <Icon aria-hidden="true" />
      <span>{children}</span>
    </h3>
  );
}

export function GaitObservation({ observation = [] }) {
  if (!observation.length) return null;
  return (
    <section className="gait-report__measurement-section" aria-labelledby="gait-observation-title">
      <SectionTitle id="gait-observation-title" icon={ClipboardList}>本次步行记录</SectionTitle>
      <dl className="gait-report__observation-list">
        {observation.map((item) => (
          <div key={item.id}>
            <dt>{item.label}</dt>
            <dd><Reading value={item.value} unit={item.unit} /></dd>
            {item.leftCount !== undefined ? (
              <p>左脚 {item.leftCount} 次 / 右脚 {item.rightCount} 次</p>
            ) : null}
            {item.confidence === 'limited' ? <p>样本量有限</p> : null}
          </div>
        ))}
      </dl>
    </section>
  );
}

export function GaitSymmetry({ rows = [] }) {
  if (!rows.length) return null;
  return (
    <section className="gait-report__measurement-section" aria-labelledby="gait-symmetry-title">
      <SectionTitle id="gait-symmetry-title" icon={Scale}>左右步态对比</SectionTitle>
      <div className="gait-report__detail-table-wrap">
        <table className="gait-report__detail-table">
          <thead>
            <tr><th scope="col">测量项目</th><th scope="col" data-side="left">左脚</th><th scope="col" data-side="right">右脚</th><th scope="col">左右差值</th><th scope="col">相对差异</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.label}</th>
                <td data-side="left"><Reading value={row.left} unit={row.unit} /></td>
                <td data-side="right"><Reading value={row.right} unit={row.unit} /></td>
                <td><Reading value={row.difference} unit={row.unit} /></td>
                <td>{row.id === 'fpa' ? <span className="gait-report__detail-missing">不适用</span> : <Reading value={row.relativeDifferencePercent} unit="%" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="gait-report__detail-note">左右差值取绝对值；相对差异为差值占双侧均值的百分比，越小表示两侧越接近。足偏角只比较角度差。</p>
    </section>
  );
}

function SignalChart({ channel, startSeconds, endSeconds }) {
  const option = useMemo(() => ({
    animation: false,
    textStyle: { fontFamily: '"Microsoft YaHei", sans-serif' },
    grid: { top: 38, left: 64, right: 24, bottom: 48 },
    tooltip: {
      trigger: 'axis',
      confine: true,
      renderMode: 'richText',
      valueFormatter: (value) => `${value} ${channel.unit}`,
    },
    xAxis: {
      type: 'value',
      min: startSeconds,
      max: endSeconds,
      name: '时间 (s)',
      nameLocation: 'middle',
      nameGap: 28,
      splitNumber: 4,
      axisLabel: { color: '#687167', hideOverlap: true },
      axisLine: { lineStyle: { color: '#cfd8d2' } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      name: channel.unit,
      splitNumber: 3,
      axisLabel: { color: '#687167' },
      splitLine: { lineStyle: { color: '#e8eeea', type: 'dashed' } },
    },
    series: channel.sides.map((side) => ({
      name: side.label,
      type: 'line',
      data: side.points,
      showSymbol: false,
      smooth: false,
      connectNulls: false,
      lineStyle: { width: 2, color: SIDE_COLORS[side.id] },
      itemStyle: { color: SIDE_COLORS[side.id] },
      emphasis: { focus: 'series' },
    })),
  }), [channel, startSeconds, endSeconds]);

  return (
    <figure className="gait-report__signal-figure" aria-labelledby={`gait-signal-${channel.id}`}>
      <div className="gait-report__signal-heading">
        <h4 id={`gait-signal-${channel.id}`}>{channel.label}</h4>
        <div className="gait-report__signal-legend">
          {channel.sides.map((side) => <span key={side.id} data-side={side.id}><i />{side.label}</span>)}
        </div>
      </div>
      <div className="gait-report__signal-chart" role="img" aria-label={`${channel.label}随时间变化曲线，单位${channel.unit}`}>
        <ReactECharts option={option} notMerge opts={{ renderer: 'svg' }} style={{ height: 264, width: '100%' }} />
      </div>
      <figcaption>
        <span>{channel.peakLabel}</span>
        <div>
          {['left', 'right'].map((id) => (
            <span key={id} data-side={id}>
              {id === 'left' ? '左脚' : '右脚'} <Reading value={channel.sides.find((side) => side.id === id)?.peak} unit={channel.unit} />
            </span>
          ))}
        </div>
      </figcaption>
    </figure>
  );
}

export function GaitLoadAnalysis({ signals }) {
  if (!signals?.channels.length) return null;
  return (
    <section className="gait-report__measurement-section" aria-labelledby="gait-load-title">
      <SectionTitle id="gait-load-title" icon={Activity}>足底受力变化</SectionTitle>
      <div className="gait-report__signal-grid">
        {signals.channels.map((channel) => <SignalChart key={channel.id} channel={channel} startSeconds={signals.startSeconds} endSeconds={signals.endSeconds} />)}
      </div>
      <p className="gait-report__detail-note">曲线保留本次记录的时间轴。峰值取自报告采样点，可能低于完整采集过程中的瞬时峰值。</p>
    </section>
  );
}

export function GaitBalanceDetails({ balance }) {
  if (!balance || balance.unit !== 'N') return null;
  return (
    <section className="gait-report__measurement-section" aria-labelledby="gait-balance-title">
      <SectionTitle id="gait-balance-title" icon={ScanLine}>{balance.title}</SectionTitle>
      <div className="gait-report__detail-table-wrap">
        <table className="gait-report__detail-table gait-report__balance-table">
          <thead>
            <tr><th scope="col" rowSpan="2">足底区域</th><th scope="colgroup" colSpan="3" data-side="left">左脚 (N)</th><th scope="colgroup" colSpan="3" data-side="right">右脚 (N)</th></tr>
            <tr>{['left', 'right'].flatMap((side) => ['峰值', '均值', '标准差'].map((label) => <th key={`${side}-${label}`} scope="col" data-side={side}>{label}</th>))}</tr>
          </thead>
          <tbody>
            {balance.rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.label}</th>
                {['left', 'right'].flatMap((side) => ['peak', 'mean', 'standardDeviation'].map((key) => <td key={`${side}-${key}`} data-side={side}><Reading value={row[side][key]} /></td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="gait-report__detail-note">{balance.description}标准差表示本次力差的波动程度。</p>
    </section>
  );
}
