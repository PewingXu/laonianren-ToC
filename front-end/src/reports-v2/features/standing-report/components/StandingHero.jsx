import {
  Activity,
  Footprints,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import { standingReportImages } from '../assets';

const FINDING_ICONS = {
  stability: ShieldCheck,
  center: Activity,
  weight: Scale,
  support: Footprints,
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
    <h2 id="standing-hero-title" aria-label={hero.title}>
      <span>{leadingTitle}</span>
      <span className="standing-report__hero-title-tail">
        {accent ? <strong>{accent}</strong> : trailingTitle}
        <span className="standing-report__hero-emoji" aria-hidden="true">😊</span>
      </span>
    </h2>
  );
}

function PeerComparison({ hero }) {
  if (!hero.hasPeerComparison) {
    return <p className="standing-report__peer-unavailable">暂无可靠同龄对比数据</p>;
  }

  return (
    <p className="standing-report__peer-summary">
      超过了 <strong>{hero.peerPercentile}%</strong> 的同龄人
    </p>
  );
}

export function StandingHero({ hero }) {
  const hasLongLead = typeof hero.lead === 'string' && hero.lead.trim().length > 72;

  return (
    <section
      className={`standing-report__hero${hasLongLead ? ' standing-report__hero--compact' : ''}`}
      aria-labelledby="standing-hero-title"
    >
      <div className="standing-report__hero-summary">
        <p className="standing-report__hero-kicker">
          <Activity aria-hidden="true" />
          站立表现
        </p>
        <HeroTitle hero={hero} />
        <p className="standing-report__hero-lead">{hero.lead}</p>

        <div className="standing-report__findings" aria-label="站立表现摘要">
          {(hero.findings || []).map((finding) => {
            const FindingIcon = FINDING_ICONS[finding.id] || ShieldCheck;
            return (
              <article key={finding.id}>
                <span className="standing-report__finding-icon">
                  <FindingIcon aria-hidden="true" />
                </span>
                <h3>{finding.title}</h3>
              </article>
            );
          })}
        </div>
      </div>

      <figure className="standing-report__hero-media">
        <img
          className="standing-report__hero-image"
          src={standingReportImages.hero}
          alt="老人站在明亮的居家检测场景中"
        />
        <span aria-hidden="true" />
        <figcaption className="standing-report__score-card" aria-label="综合站立评分">
          <span className="standing-report__score-label">综合站立评分</span>
          <div className="standing-report__score-row">
            <strong className="standing-report__score-value">
              {hero.hasScore ? hero.score : '--'}
            </strong>
            <small className="standing-report__score-unit">分</small>
          </div>
          <em>{hero.status}</em>
          <PeerComparison hero={hero} />
        </figcaption>
      </figure>
    </section>
  );
}
