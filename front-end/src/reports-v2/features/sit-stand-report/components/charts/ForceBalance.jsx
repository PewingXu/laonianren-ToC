function FootShape({ side }) {
  const isLeft = side === 'left';
  return (
    <svg viewBox="0 0 30 46" aria-hidden="true">
      <ellipse cx={isLeft ? 16 : 14} cy="25" rx="8" ry="15" />
      <circle cx={isLeft ? 7 : 23} cy="9" r="3" />
      <circle cx={isLeft ? 12 : 18} cy="6" r="3" />
      <circle cx={isLeft ? 17 : 13} cy="5" r="2.7" />
      <circle cx={isLeft ? 22 : 8} cy="7" r="2.4" />
    </svg>
  );
}

export function ForceBalance({ metric }) {
  const hasBalance = metric.leftPercent !== null && metric.rightPercent !== null;
  const label = hasBalance
    ? `左脚 ${metric.leftPercent}%，右脚 ${metric.rightPercent}%`
    : '双脚发力数据不足';

  return (
    <div className="sit-stand-report__balance-visual" role="img" aria-label={label}>
      <div className="sit-stand-report__balance-labels" aria-hidden="true">
        <span>轻</span><span>强</span>
      </div>
      <div className="sit-stand-report__balance-track" aria-hidden="true">
        <span
          data-testid="left-balance-segment"
          style={{ width: `${metric.leftPercent ?? 0}%` }}
        />
        <i
          data-testid="right-balance-segment"
          style={{ width: `${metric.rightPercent ?? 0}%` }}
        />
      </div>
      <div className="sit-stand-report__feet-row" aria-hidden="true">
        <FootShape side="left" />
        <FootShape side="right" />
      </div>
    </div>
  );
}
