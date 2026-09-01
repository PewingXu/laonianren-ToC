const TARGET_ID = 'sit-stand-speed-detail';

function formatSeconds(value) {
  return value.toFixed(1);
}

export function SpeedComparison({ trials }) {
  const hasData = trials.length === 3;
  const best = hasData ? Math.min(...trials) : null;
  const average = hasData
    ? trials.reduce((total, value) => total + value, 0) / trials.length
    : null;
  const labels = ['第一次', '第二次', '第三次'];
  const formattedTrials = trials.map((value) => `${formatSeconds(value)}秒`);
  const accessibleLabel = hasData
    ? `三次起身速度分别为${formattedTrials[0]}、${formattedTrials[1]}和${formattedTrials[2]}`
    : '';

  return (
    <article
      id={TARGET_ID}
      className="sit-stand-report__detail-column sit-stand-report__speed-detail"
      aria-labelledby={`${TARGET_ID}-title`}
    >
      <h3 id={`${TARGET_ID}-title`} tabIndex="-1">起身速度对比</h3>
      {hasData ? (
        <div className="sit-stand-report__speed-content">
          <svg
            className="sit-stand-report__speed-bars"
            viewBox="0 0 310 132"
            role="img"
            aria-label={accessibleLabel}
          >
            <defs>
              <linearGradient id="sitStandSpeedColumn" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#7da8d8" />
                <stop offset="1" stopColor="#c7d9ec" />
              </linearGradient>
            </defs>
            <g className="sit-stand-report__detail-grid-lines">
              <path d="M30 20h274M30 59h274M30 98h274M30 110h274" />
            </g>
            <g className="sit-stand-report__detail-axis-copy">
              <text x="3" y="23">8</text>
              <text x="3" y="62">6</text>
              <text x="3" y="101">4</text>
              <text x="3" y="113">2</text>
              <text x="0" y="10">(秒)</text>
            </g>
            <g className="sit-stand-report__detail-bars">
              {trials.map((value, index) => {
                const height = Math.min(88, Math.round(value * 20) + 5);
                return (
                  <rect
                    key={labels[index]}
                    x={58 + index * 80}
                    y={110 - height}
                    width="35"
                    height={height}
                    rx="3"
                    data-value={value}
                  />
                );
              })}
            </g>
            <g className="sit-stand-report__detail-bar-values">
              {trials.map((value, index) => {
                const height = Math.min(88, Math.round(value * 20) + 5);
                return (
                  <text key={labels[index]} x={66 + index * 80} y={104 - height}>
                    {formatSeconds(value)}
                  </text>
                );
              })}
            </g>
            <g className="sit-stand-report__detail-bar-labels">
              {labels.map((label, index) => (
                <text key={label} x={52 + index * 80} y="128">{label}</text>
              ))}
            </g>
          </svg>
          <div className="sit-stand-report__detail-notes">
            <p>最佳成绩：{formatSeconds(best)} 秒</p>
            <p>平均成绩：{formatSeconds(average)} 秒</p>
            <p>参考范围：2.3 ~ 4.0 秒</p>
          </div>
        </div>
      ) : <p className="sit-stand-report__detail-empty">数据不足</p>}
    </article>
  );
}
