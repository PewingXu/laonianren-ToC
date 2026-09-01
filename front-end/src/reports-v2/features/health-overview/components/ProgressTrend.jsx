import { ArrowDown, ArrowUp, CircleEllipsis, Minus, Sparkles } from 'lucide-react';

const TREND_PRESENTATION = {
  up: {
    label: '每天都在变好哦',
    detail: '底子越来越扎实了，给自己的坚持鼓个掌吧！',
    Icon: ArrowUp,
  },
  down: {
    label: '近期状态有些波动',
    detail: '放慢节奏，结合身体感受持续观察。',
    Icon: ArrowDown,
  },
  flat: {
    label: '近期状态保持平稳',
    detail: '保持规律习惯，继续积累身体变化。',
    Icon: Minus,
  },
  empty: {
    label: '等待更多评估记录',
    detail: '完成更多评估后，这里会呈现状态变化。',
    Icon: CircleEllipsis,
  },
};

function buildCoordinates(points) {
  if (!points.length) return [];
  const validPoints = points
    .map((point) => ({ ...point, score: Number(point.score) }))
    .filter((point) => Number.isFinite(point.score));
  if (!validPoints.length) return [];

  const scores = validPoints.map((point) => point.score);
  const minimum = Math.min(...scores);
  const maximum = Math.max(...scores);
  const spread = Math.max(1, maximum - minimum);

  return validPoints.map((point, index) => ({
    ...point,
    x: validPoints.length === 1 ? 300 : 48 + index * (504 / (validPoints.length - 1)),
    y: 158 - ((point.score - minimum) / spread) * 100,
  }));
}

function getTrendState(coordinates) {
  if (!coordinates.length) return { state: 'empty', change: null };

  const change = coordinates.at(-1).score - coordinates[0].score;
  if (change > 0) return { state: 'up', change };
  if (change < 0) return { state: 'down', change };
  return { state: 'flat', change };
}

export function ProgressTrend({ trend }) {
  const coordinates = buildCoordinates(Array.isArray(trend?.points) ? trend.points : []);
  const path = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const { state, change } = getTrendState(coordinates);
  const presentation = TREND_PRESENTATION[state];
  const TrendIcon = presentation.Icon;

  return (
    <section className="health-overview__trend" id="trend" data-testid="trend" aria-labelledby="trend-title">
      <div className="health-overview__trend-main">
        <h2 id="trend-title">{trend.title}</h2>
        <p className="health-overview__trend-description">{trend.summary}</p>
        {coordinates.length ? (
          <svg className="health-overview__trend-chart" viewBox="0 0 600 210" role="img" aria-label="近期健康状态分趋势">
            <path className="health-overview__trend-grid" d="M 48 58 H 552 M 48 108 H 552 M 48 158 H 552" />
            <path className="health-overview__trend-path" d={path} data-testid="trend-path" />
            {coordinates.map((point, index) => (
              <g key={`${point.label}-${index}`} transform={`translate(${point.x} ${point.y})`}>
                <circle className="health-overview__trend-point" r={index === coordinates.length - 1 ? 7 : 6} />
                <text className="health-overview__trend-score" x="0" y="-15">{point.score}</text>
                <text className="health-overview__trend-label" x="0" y={190 - point.y}>{point.label}</text>
              </g>
            ))}
          </svg>
        ) : <p className="health-overview__trend-empty">暂无趋势记录</p>}
      </div>
      <aside
        className="health-overview__trend-summary"
        data-testid="trend-summary"
        data-trend-state={state}
      >
        <div className="health-overview__trend-summary-heading">
          <span>{presentation.label}</span>
          <TrendIcon aria-hidden="true" size={22} />
        </div>
        {change !== null ? (
          <p className="health-overview__trend-change">
            <span>近期状态分</span>
            <strong><TrendIcon aria-hidden="true" size={21} />{change > 0 ? `+${change}` : change}</strong>
          </p>
        ) : null}
        <small className="health-overview__trend-detail">{presentation.detail}</small>
        <Sparkles aria-hidden="true" className="health-overview__trend-sparkle" size={54} />
      </aside>
    </section>
  );
}
