import {
  Accessibility,
  BriefcaseMedical,
  Scale,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import { sitStandReportImage } from '../assets';

const FINDING_ICONS = {
  accessibility: Accessibility,
  'briefcase-medical': BriefcaseMedical,
  scale: Scale,
  shield: ShieldCheck,
  timer: Timer,
  activity: Accessibility,
  gauge: Scale,
};

/**
 * 起坐报告首屏。
 *
 * 改版说明：为什么照握力那套重排
 * ---------------------------------------------------------------
 * 原来是三栏：左栏塞了标题、结论、综合评分、档位、同龄对比、同龄人平均、
 * 您的排名七样东西，中间一栏放三条要点，右边才是图片。结果是
 *   - 左栏过密，「暂无可靠同龄对比数据」和下面的「同龄人平均」直接压在一起
 *   - 同一个分数出现两次（标题里的 7/25 和下面的 28 分是同一个东西）
 *
 * 握力页的处理更舒展：左栏只留 kicker + 标题 + 一段结论 + 三个要点胶片，
 * 分数卡浮在右侧图片上。视觉重心分开，两边都不挤。这里照搬同一套结构。
 */
function PeerComparison({ hero }) {
  if (!hero.hasPeerComparison) {
    return <p className="sit-stand-report__peer-unavailable">{hero.peerSummary || '暂无可靠同龄对比数据'}</p>;
  }

  return (
    <p className="sit-stand-report__peer-summary">
      超过了 <strong>{hero.peerPercentile}%</strong> 的同龄人
    </p>
  );
}

export function SitStandHero({ hero }) {
  return (
    <section className="sit-stand-report__hero" aria-labelledby="sit-stand-hero-title">
      <div className="sit-stand-report__hero-summary">
        <p className="sit-stand-report__hero-kicker">
          <Accessibility aria-hidden="true" />
          起身表现
        </p>

        <h2 id="sit-stand-hero-title">
          <span>{hero.title}</span>
          <span className="sit-stand-report__hero-emoji" aria-hidden="true">🙂</span>
        </h2>

        <p className="sit-stand-report__hero-lead">{hero.lead}</p>

        <div className="sit-stand-report__findings" aria-label="起身表现摘要">
          {hero.findings.map((finding) => {
            const FindingIcon = FINDING_ICONS[finding.icon] || Accessibility;
            return (
              <article key={finding.title}>
                <span className="sit-stand-report__finding-icon">
                  <FindingIcon aria-hidden="true" />
                </span>
                <h3>{finding.title}</h3>
              </article>
            );
          })}
        </div>
      </div>

      <figure className="sit-stand-report__hero-media">
        <img src={sitStandReportImage} alt="一位老人从扶手椅上平稳起身" />
        <span aria-hidden="true" />
        <div className="sit-stand-report__score-card" aria-label="综合起身评分">
          <span className="sit-stand-report__score-label">综合起身评分</span>
          <div className="sit-stand-report__score-row">
            <strong className="sit-stand-report__score-value">
              {hero.hasScore ? hero.score : '--'}
            </strong>
            <span className="sit-stand-report__score-unit">分</span>
          </div>
          <em>{hero.status}</em>
          <PeerComparison hero={hero} />
        </div>
      </figure>
    </section>
  );
}
