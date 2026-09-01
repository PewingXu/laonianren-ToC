import { ImageOff, Stethoscope } from 'lucide-react';
import { overviewImages } from '../assets';

export function ExpertInsight({ content }) {
  function handleError(event) {
    event.currentTarget.hidden = true;
    event.currentTarget.nextElementSibling.hidden = false;
  }

  return (
    <section className="health-overview__expert" id="insight" data-testid="insight" aria-labelledby="expert-title">
      <div className="health-overview__expert-copy">
        <div className="health-overview__section-heading health-overview__section-heading--inline">
          <Stethoscope aria-hidden="true" size={26} />
          <h2 id="expert-title">专家建议</h2>
        </div>
        <blockquote>“{content}”</blockquote>
      </div>
      <div className="health-overview__expert-photo">
        <img src={overviewImages.expert} alt="微笑的健康顾问" loading="lazy" onError={handleError} />
        <span className="health-overview__image-fallback" hidden>
          <ImageOff aria-hidden="true" size={26} />
          <span>顾问图片暂不可用</span>
        </span>
      </div>
    </section>
  );
}
