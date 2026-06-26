import React from 'react';
import InfoTooltip from './InfoTooltip';

/**
 * 评分明细区块：把 scoreResult.breakdown 按"核心硬指标 / 设备增强指标"分组罗列，
 * 每个小项一行：指标名 + ? 悬浮提示（怎么算的）+ 右侧得分 X/Y + 灰色 desc。
 */
function BreakdownRow({ item }) {
  const pct = item.max > 0 ? item.score / item.max : 0;
  const color = pct >= 0.8 ? '#059669' : pct >= 0.5 ? '#D97706' : '#DC2626';
  return (
    <div
      className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg"
      style={{ background: 'var(--bg-hover, #f8f9fa)' }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs md:text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {item.label}
          </span>
          <InfoTooltip text={item.help} />
        </div>
        {item.desc && (
          <div className="text-[10px] md:text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {item.desc}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <span className="text-sm md:text-base font-bold tabular-nums" style={{ color }}>
          {item.score}
        </span>
        <span className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
          /{item.max}
        </span>
      </div>
    </div>
  );
}

export default function ScoreBreakdownSection({ scoreResult, title = '评分明细' }) {
  if (!scoreResult || !Array.isArray(scoreResult.breakdown) || scoreResult.breakdown.length === 0) {
    return null;
  }

  const breakdown = scoreResult.breakdown;
  const coreItems = breakdown.filter(b => b.group === 'core');
  const enhancedItems = breakdown.filter(b => b.group === 'enhanced');
  const ungrouped = breakdown.filter(b => b.group !== 'core' && b.group !== 'enhanced');

  const coreTotal = coreItems.reduce((s, b) => s + (b.score || 0), 0);
  const coreMax = coreItems.reduce((s, b) => s + (b.max || 0), 0);
  const enhTotal = enhancedItems.reduce((s, b) => s + (b.score || 0), 0);
  const enhMax = enhancedItems.reduce((s, b) => s + (b.max || 0), 0);

  return (
    <section className="zeiss-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          鼠标移到 <span style={{ color: 'var(--zeiss-blue, #0066CC)', fontWeight: 700 }}>?</span> 查看每项算法
        </span>
      </div>

      {coreItems.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              核心硬指标
            </span>
            <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
              {coreTotal}/{coreMax}
            </span>
          </div>
          <div className="space-y-1.5">
            {coreItems.map((item, i) => <BreakdownRow key={`core-${i}`} item={item} />)}
          </div>
        </div>
      )}

      {enhancedItems.length > 0 && (
        <div className="mb-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              设备增强指标
            </span>
            <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
              {enhTotal}/{enhMax}
            </span>
          </div>
          <div className="space-y-1.5">
            {enhancedItems.map((item, i) => <BreakdownRow key={`enh-${i}`} item={item} />)}
          </div>
        </div>
      )}

      {ungrouped.length > 0 && (
        <div className="space-y-1.5">
          {ungrouped.map((item, i) => <BreakdownRow key={`ung-${i}`} item={item} />)}
        </div>
      )}
    </section>
  );
}
