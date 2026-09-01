import { MaterialSymbol } from './MaterialSymbol';

export function HeroSummary({ hero }) {
  function handleError(event) {
    event.currentTarget.hidden = true;
    event.currentTarget.nextElementSibling.hidden = false;
  }

  const statusIcon = hero.state === 'positive'
    ? 'sentiment_very_satisfied'
    : hero.state === 'caution' ? 'error' : 'help';
  const titleClassName = hero.title.length > 16
    ? 'health-overview__hero-title--compact'
    : '';

  return (
    <section
      className="health-overview__hero bg-white rounded-[40px] soft-shadow mb-section-gap overflow-hidden flex items-stretch"
      id="hero"
      data-testid="hero"
      data-hero-state={hero.state}
      aria-labelledby="hero-title"
    >
      <div className="health-overview__hero-copy p-12 flex-1 flex flex-col justify-center bg-gradient-to-br from-[#FFF8E7]/40 to-transparent basis-[45%]">
        {hero.state !== 'positive' ? (
          <span className="health-overview__hero-kicker">
            {hero.hasScore ? `本次综合状态 · ${hero.score} 分` : '暂无综合评分'}
          </span>
        ) : null}
        <h2
          id="hero-title"
          className={`overview-clamp-2 font-large-title text-large-title text-natural-green mb-6 leading-tight ${titleClassName}`.trim()}
          title={hero.title}
        >
          {hero.title}
        </h2>
        <p
          className="health-overview__hero-description overview-clamp-3 type-body font-subtitle text-subtitle text-secondary max-w-md mb-8"
          title={hero.content}
        >
          {hero.content}
        </p>
        <div className="health-overview__hero-status flex items-center gap-3">
          <MaterialSymbol name={statusIcon} className="text-4xl text-soft-orange" filled />
          <strong className="font-subtitle text-subtitle text-soft-orange font-medium">{hero.status}</strong>
        </div>
      </div>
      <div className="health-overview__hero-media flex-1 relative min-h-[360px] basis-[55%]">
        <img
          src={hero.image}
          alt="阳光客厅中微笑的老年人"
          className="absolute inset-0 w-full h-full object-cover rounded-[32px] soft-shadow"
          onError={handleError}
        />
        <span className="health-overview__image-fallback" hidden>
          <MaterialSymbol name="broken_image" className="text-3xl" />
          <span>健康日记图片暂不可用</span>
        </span>
      </div>
    </section>
  );
}
