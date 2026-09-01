import { Leaf, TrendingUp } from 'lucide-react';

const TREND_POINTS = [
  { x: 10, y: 30, radius: 2.5 },
  { x: 35, y: 25, radius: 2.5 },
  { x: 65, y: 15, radius: 2.5 },
  { x: 90, y: 10, radius: 3 },
];

export function GaitTrend({ trend }) {
  if (!trend) return null;

  return (
    <article className="gait-report__trend" aria-labelledby="gait-trend-title">
      <h3 id="gait-trend-title" className="gait-report__guidance-title gait-report__trend-title">
        <TrendingUp aria-hidden="true" />
        <span>成长趋势</span>
      </h3>
      <p className="gait-report__trend-summary">{trend.summary}</p>
      <div className="gait-report__trend-frame">
        <div className="gait-report__trend-plot">
          <svg
            className="gait-report__trend-chart"
            preserveAspectRatio="none"
            viewBox="0 0 100 40"
            role="img"
            aria-label="最近四次步态检测趋势"
          >
            <path d="M10 30 L 35 25 L 65 15 L 90 10" />
            {TREND_POINTS.map((point) => (
              <circle
                key={`${point.x}-${point.y}`}
                cx={point.x}
                cy={point.y}
                r={point.radius}
              />
            ))}
          </svg>
          <div className="gait-report__trend-dates">
            {trend.points.map((point, index) => (
              <time
                className={index === trend.points.length - 1
                  ? 'gait-report__trend-date--current'
                  : undefined}
                dateTime={point.date}
                key={point.date}
              >
                {point.label}
              </time>
            ))}
          </div>
        </div>
      </div>
      <div className="gait-report__trend-note">
        <Leaf aria-hidden="true" />
        <span>{trend.note}</span>
      </div>
    </article>
  );
}
