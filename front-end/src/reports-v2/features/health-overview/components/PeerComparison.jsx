import { HeartHandshake, UserRound } from 'lucide-react';

export function PeerComparison({ comparison }) {
  const hasPercentile = Number.isFinite(comparison?.percentile);
  const highlighted = hasPercentile ? Math.round(comparison.percentile / 10) : 0;

  return (
    <section className="health-overview__peer" aria-labelledby="peer-title">
      <HeartHandshake className="health-overview__peer-icon" aria-hidden="true" size={38} />
      <p className="health-overview__peer-intro">{comparison?.intro}</p>
      <h2 id="peer-title">
        {hasPercentile ? <>您超越了 <strong>{comparison.percentile}% 的同龄人</strong></> : '保持自己的健康节奏'}
      </h2>
      <p className="health-overview__peer-summary">{comparison?.summary}</p>
      {hasPercentile ? (
        <div className="health-overview__peer-people" aria-label={`同龄人健康表现百分位 ${comparison.percentile}%`}>
          {Array.from({ length: 10 }, (_, index) => (
            <UserRound key={index} aria-hidden="true" data-active={index < highlighted || undefined} size={24} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
