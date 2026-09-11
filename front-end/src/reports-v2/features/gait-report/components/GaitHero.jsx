import {
  CheckCircle2,
  Footprints,
  Scale,
} from 'lucide-react';
import { gaitReportImages } from '../assets';

const TAG_ICONS = {
  'check-circle': CheckCircle2,
  footprints: Footprints,
  scale: Scale,
};

function HeroTitle({ hero }) {
  const accent = hero.hasScore && hero.status && hero.title.endsWith(hero.status)
    ? hero.status
    : '';
  const rawTitle = accent ? hero.title.slice(0, -accent.length) : hero.title;
  const title = rawTitle
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+分\s*$/, '分');
  const scoreSuffix = accent
    ? ''
    : title.match(/\d+(?:\.\d+)?\/\d+(?:\.\d+)?分$/)?.[0] || '';
  const tailLength = accent ? 0 : (scoreSuffix.length || Math.min(2, title.length));
  const leadingTitle = tailLength ? title.slice(0, -tailLength) : title;
  const trailingTitle = tailLength ? title.slice(-tailLength) : '';

  return (
    <h2 id="gait-hero-title" aria-label={hero.title}>
      <span>{leadingTitle}</span>
      <span className="gait-report__hero-title-tail">
        {accent ? <strong>{accent}</strong> : trailingTitle}
        <span className="gait-report__hero-emoji" aria-hidden="true">😊</span>
      </span>
    </h2>
  );
}

function PeerComparison({ hero }) {
  if (!hero.hasPeerComparison) {
    return <p className="gait-report__peer-unavailable">暂无可靠同龄对比数据</p>;
  }

  return (
    <p className="gait-report__peer-summary">
      超过了 <strong>{hero.peerPercentile}%</strong> 的同龄人
    </p>
  );
}

export function GaitHero({ hero }) {
  return (
    <section className="gait-report__hero" aria-labelledby="gait-hero-title">
      <div className="gait-report__hero-summary">
        <p className="gait-report__hero-kicker">
          <Footprints aria-hidden="true" />
          步态表现
        </p>
        <HeroTitle hero={hero} />
        <p className="gait-report__hero-lead">{hero.lead}</p>
        <div className="gait-report__findings" aria-label="步态表现摘要">
          {(hero.findings || []).map((finding) => {
            const FindingIcon = TAG_ICONS[finding.icon] || CheckCircle2;
            return (
              <article key={finding.title}>
                <span className="gait-report__finding-icon">
                  <FindingIcon aria-hidden="true" />
                </span>
                <h3>{finding.title}</h3>
              </article>
            );
          })}
        </div>
      </div>

      <figure className="gait-report__hero-media">
        <img
          src={gaitReportImages.hero}
          alt="阳光公园中自信行走的活力长者"
        />
        <span aria-hidden="true" />
        <div className="gait-report__score-card" aria-label="综合步态评分">
          <span className="gait-report__score-label">综合步态评分</span>
          <div className="gait-report__score-row">
            <strong className="gait-report__score-value">
              {hero.hasScore ? hero.score : '--'}
            </strong>
            <span className="gait-report__score-unit">分</span>
          </div>
          <em>{hero.status}</em>
          <PeerComparison hero={hero} />
        </div>
      </figure>
    </section>
  );
}
