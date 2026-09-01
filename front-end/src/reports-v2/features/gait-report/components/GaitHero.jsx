import {
  CheckCircle2,
  Footprints,
  Leaf,
  Scale,
} from 'lucide-react';
import { gaitReportImages } from '../assets';

const TAG_ICONS = {
  'check-circle': CheckCircle2,
  footprints: Footprints,
  scale: Scale,
};

function HeroTitle({ title }) {
  const highlightedText = title.endsWith('很稳') ? '很稳' : '';
  const leadingText = highlightedText ? title.slice(0, -highlightedText.length) : title;

  return (
    <>
      {leadingText}
      {highlightedText ? <strong>{highlightedText}</strong> : null}
      <span aria-hidden="true"> 😊</span>
    </>
  );
}

export function GaitHero({ hero }) {
  return (
    <section className="gait-report__hero" aria-labelledby="gait-hero-title">
      <div className="gait-report__hero-copy">
        <div className="gait-report__hero-eyebrow">
          <Leaf aria-hidden="true" />
          <span>步态表现</span>
        </div>
        <h2 id="gait-hero-title" aria-label={hero.title}>
          <HeroTitle title={hero.title} />
        </h2>
        <p className="gait-report__hero-lead">{hero.lead}</p>
        <div className="gait-report__hero-tags" aria-label="步态表现标签">
          {hero.tags.map((tag) => {
            const TagIcon = TAG_ICONS[tag.icon] || CheckCircle2;
            return (
              <article key={tag.label}>
                <TagIcon aria-hidden="true" />
                <span>{tag.label}</span>
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
        <figcaption className="gait-report__score-card">
          <span>综合步态评分</span>
          <p>
            <strong className="gait-report__score-value">
              {hero.hasScore ? hero.score : '--'}
            </strong>
            <small>分</small>
          </p>
          <em>{hero.status}</em>
          <span>
            {hero.hasPeerComparison
              ? `超过 ${hero.peerPercentile}% 的同龄人`
              : '暂无可靠同龄对比数据'}
          </span>
        </figcaption>
      </figure>
    </section>
  );
}
