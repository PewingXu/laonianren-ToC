import { standingReportImages } from '../assets';

export function StandingHero({ hero }) {
  return (
    <section className="standing-report__hero" aria-label="综合站立评价">
      <div className="standing-report__hero-summary">
        <h2 aria-label={hero.title}>
          {hero.title}
          <span className="standing-report__face" aria-hidden="true"><i /></span>
        </h2>
        <p className="standing-report__hero-label">综合站立评分</p>
        <div className="standing-report__score-row">
          <strong>{hero.hasScore ? hero.score : '--'}</strong>
          <small>分</small>
          <b>{hero.status}</b>
        </div>
        <p className="standing-report__peer-rank">
          {hero.hasPeerComparison ? (
            <>超过 <strong>{hero.peerPercentile}%</strong> 的同龄人</>
          ) : '暂无可靠同龄对比数据'}
        </p>
        <blockquote>{hero.lead}</blockquote>
      </div>

      <img
        className="standing-report__hero-image"
        src={standingReportImages.hero}
        alt="老人站在明亮的居家检测场景中"
      />
    </section>
  );
}
