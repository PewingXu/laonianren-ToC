import { BookOpen, Dumbbell, Heart, Scale, ThumbsUp } from 'lucide-react';
import { gripReportImage } from '../assets';

const FINDING_ICONS = {
  'book-open': BookOpen,
  heart: Heart,
  scale: Scale,
  'thumbs-up': ThumbsUp,
};

function HeroTitle({ hero }) {
  const accent = hero.hasScore && hero.status && hero.title.endsWith(hero.status)
    ? hero.status
    : '';
  const title = accent ? hero.title.slice(0, -accent.length) : hero.title;

  return (
    <h2 id="grip-hero-title" aria-label={hero.title}>
      <span>{title}</span>
      {accent ? <strong>{accent}</strong> : null}
      <span className="grip-report__hero-emoji" aria-hidden="true">😊</span>
    </h2>
  );
}

function PeerComparison({ hero }) {
  if (!hero.hasPeerComparison) {
    return <p className="grip-report__peer-unavailable">{hero.peerSummary}</p>;
  }

  return (
    <p className="grip-report__peer-summary">
      超过了 <strong>{hero.peerPercentile}%</strong> 的同龄人
    </p>
  );
}

export function GripHero({ hero }) {
  return (
    <section className="grip-report__hero" aria-labelledby="grip-hero-title">
      <div className="grip-report__hero-summary">
        <p className="grip-report__hero-kicker">
          <Dumbbell aria-hidden="true" />
          握力表现
        </p>
        <HeroTitle hero={hero} />
        <p className="grip-report__hero-lead">{hero.lead}</p>

        <div className="grip-report__findings" aria-label="握力表现摘要">
          {hero.findings.map((finding) => {
            const FindingIcon = FINDING_ICONS[finding.icon] || ThumbsUp;
            return (
              <article key={finding.title}>
                <span className="grip-report__finding-icon">
                  <FindingIcon aria-hidden="true" />
                </span>
                <h3>{finding.title}</h3>
              </article>
            );
          })}
        </div>
      </div>

      <figure className="grip-report__hero-media">
        <img src={gripReportImage} alt="手持握力计的老年人" />
        <span aria-hidden="true" />
        <div className="grip-report__score-card" aria-label="综合握力评分">
          <span className="grip-report__score-label">综合握力评分</span>
          <div className="grip-report__score-row">
            <strong className="grip-report__score-value">
              {hero.hasScore ? hero.score : '--'}
            </strong>
            <span className="grip-report__score-unit">分</span>
          </div>
          <em>{hero.status}</em>
          <PeerComparison hero={hero} />
        </div>
      </figure>
    </section>
  );
}
