import {
  Accessibility,
  BriefcaseMedical,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import { sitStandReportImage } from '../assets';

const FINDING_ICONS = {
  accessibility: Accessibility,
  'briefcase-medical': BriefcaseMedical,
  scale: Scale,
  shield: ShieldCheck,
};

export function SitStandHero({ hero }) {
  return (
    <section
      className="sit-stand-report__hero"
      aria-labelledby="sit-stand-hero-title"
    >
      <div className="sit-stand-report__hero-score">
        <h2 id="sit-stand-hero-title">
          {hero.title} <span aria-hidden="true">🙂</span>
        </h2>
        <p className="sit-stand-report__hero-lead">{hero.lead}</p>
        <p className="sit-stand-report__score-label">综合起身评分</p>
        <div className="sit-stand-report__score-line">
          <strong className="sit-stand-report__score-value">
            {hero.hasScore ? hero.score : '--'}
          </strong>
          <span>分</span>
          <em>{hero.status}</em>
        </div>
        {hero.hasPeerComparison ? (
          <p className="sit-stand-report__peer-copy">
            超过了 <b>{hero.peerPercentile}%</b> 的同龄人
          </p>
        ) : (
          <p className="sit-stand-report__peer-copy">暂无可靠同龄对比数据</p>
        )}
        <div className="sit-stand-report__score-progress" aria-hidden="true"><span /></div>
        <div className="sit-stand-report__hero-meta">
          <span>
            同龄人平均： <b>{hero.hasPeerComparison ? `${hero.peerAverageDuration} 秒` : '--'}</b>
          </span>
          <span>
            您的排名： <b>{hero.hasPeerComparison ? `前 ${hero.rankPercent}%` : '--'}</b>
          </span>
        </div>
      </div>

      <div className="sit-stand-report__hero-findings" aria-label="综合表现结论">
        {hero.findings.map((finding) => {
          const FindingIcon = FINDING_ICONS[finding.icon] || Accessibility;
          return (
            <article className="sit-stand-report__finding" key={finding.title}>
              <span className="sit-stand-report__finding-icon">
                <FindingIcon aria-hidden="true" />
              </span>
              <div>
                <h3>{finding.title}</h3>
                <p>{finding.detail}</p>
              </div>
            </article>
          );
        })}
      </div>

      <figure className="sit-stand-report__hero-photo">
        <img src={sitStandReportImage} alt="一位老人从扶手椅上平稳起身" />
      </figure>
    </section>
  );
}
