import {
  ChevronRight,
  Droplets,
  Footprints,
  Lightbulb,
  PersonStanding,
} from 'lucide-react';

const RECOMMENDATION_ICONS = {
  walking: Footprints,
  stretch: PersonStanding,
  water: Droplets,
};

export function GaitRecommendations({ recommendations }) {
  if (!Array.isArray(recommendations) || recommendations.length !== 3) return null;

  return (
    <article
      className="gait-report__recommendations"
      aria-labelledby="gait-recommendations-title"
    >
      <h3
        id="gait-recommendations-title"
        className="gait-report__guidance-title gait-report__recommendations-title"
      >
        <Lightbulb aria-hidden="true" />
        <span>今天建议做的三件事</span>
      </h3>
      <ul className="gait-report__recommendation-list">
        {recommendations.map((recommendation) => {
          const Icon = RECOMMENDATION_ICONS[recommendation.icon];

          return (
            <li
              className={`gait-report__recommendation-item gait-report__recommendation-item--${recommendation.tone}`}
              key={recommendation.id}
            >
              <span className="gait-report__recommendation-icon" aria-hidden="true">
                <Icon />
              </span>
              <div className="gait-report__recommendation-copy">
                <h4>{recommendation.title}</h4>
                <p>{recommendation.description}</p>
              </div>
              <ChevronRight className="gait-report__recommendation-chevron" aria-hidden="true" />
            </li>
          );
        })}
      </ul>
    </article>
  );
}
