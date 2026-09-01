const TARGET_ID = 'sit-stand-completion-detail';
const STAGE_LABELS = ['坐姿', '起身', '站立', '稳定'];

function pointsAttribute(points) {
  return points.map(([x, y]) => `${x},${y}`).join(' ');
}

export function ProcessTrend({ curves }) {
  const hasData = curves.length === 3;

  return (
    <article
      id={TARGET_ID}
      className="sit-stand-report__detail-column sit-stand-report__trend-detail"
      aria-labelledby={`${TARGET_ID}-title`}
    >
      <h3 id={`${TARGET_ID}-title`} tabIndex="-1">起身过程趋势（本次）</h3>
      {hasData ? (
        <>
          <div className="sit-stand-report__trend-legend" aria-hidden="true">
            {curves.map((curve) => (
              <span key={curve.label} className={`sit-stand-report__legend--${curve.tone}`}>
                {curve.label}
              </span>
            ))}
          </div>
          <svg
            className="sit-stand-report__process-chart"
            viewBox="0 0 220 190"
            role="img"
            aria-label="三次起身过程趋势"
          >
            <g className="sit-stand-report__process-grid">
              <path d="M22 26h186M22 75h186M22 124h186M22 173h186" />
            </g>
            <g className="sit-stand-report__process-axis">
              <text x="4" y="29">4</text>
              <text x="4" y="78">2</text>
              <text x="4" y="127">1</text>
              <text x="4" y="176">0</text>
              <text x="0" y="13">速度(秒)</text>
            </g>
            {curves.map((curve) => (
              <g key={curve.label} className={`sit-stand-report__process-series--${curve.tone}`}>
                <polyline points={pointsAttribute(curve.points)} data-curve={curve.label} />
                {curve.points.map(([x, y], index) => (
                  <circle key={`${curve.label}-${STAGE_LABELS[index]}`} cx={x} cy={y} r="3" />
                ))}
              </g>
            ))}
            <g className="sit-stand-report__stage-labels">
              {STAGE_LABELS.map((label, index) => (
                <text key={label} x={[14, 69, 124, 186][index]} y="188">{label}</text>
              ))}
            </g>
          </svg>
          <p className="sit-stand-report__source-note">数据来源：起身能力检测仪</p>
        </>
      ) : <p className="sit-stand-report__detail-empty">数据不足</p>}
    </article>
  );
}
