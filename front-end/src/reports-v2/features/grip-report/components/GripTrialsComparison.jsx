function formatForce(value) {
  return String(value);
}

export function GripTrialsComparison({ trials }) {
  if (trials.length !== 3) return null;

  const maximumForce = Math.max(...trials.flatMap((trial) => [trial.leftForce, trial.rightForce]));

  return (
    <article className="grip-report__analysis-card grip-report__trials-card">
      <h3 id="grip-trials-detail" tabIndex={-1}>左右手握力对比 (3次测试)</h3>
      <svg
        className="grip-report__comparison-chart"
        viewBox="0 0 440 210"
        role="img"
        aria-label="三次左右手握力对比，单位为N"
      >
        <line className="grip-report__comparison-baseline" x1="26" y1="164" x2="414" y2="164" />
        {trials.map((trial, index) => {
          const leftHeight = maximumForce === 0 ? 0 : (trial.leftForce / maximumForce) * 128;
          const rightHeight = maximumForce === 0 ? 0 : (trial.rightForce / maximumForce) * 128;
          const groupX = 72 + index * 128;
          return (
            <g key={trial.label}>
              <rect className="grip-report__comparison-bar grip-report__comparison-bar--left" x={groupX} y={164 - leftHeight} width="42" height={leftHeight} rx="5" />
              <rect className="grip-report__comparison-bar grip-report__comparison-bar--right" x={groupX + 52} y={164 - rightHeight} width="42" height={rightHeight} rx="5" />
              <text className="grip-report__comparison-value" x={groupX + 21} y={156 - leftHeight}>{formatForce(trial.leftForce)}</text>
              <text className="grip-report__comparison-value" x={groupX + 73} y={156 - rightHeight}>{formatForce(trial.rightForce)}</text>
              <text className="grip-report__comparison-label" x={groupX + 47} y="190">{trial.label}</text>
            </g>
          );
        })}
        <text className="grip-report__comparison-legend-label" x="130" y="20">左手 (N)</text>
        <text className="grip-report__comparison-legend-label" x="245" y="20">右手 (N)</text>
      </svg>
      <div className="grip-report__comparison-legend" aria-hidden="true">
        <span><i />左手 (N)</span>
        <span><i />右手 (N)</span>
      </div>
      <table aria-labelledby="grip-trials-detail">
        <thead>
          <tr>
            <th scope="col">测试次数</th>
            <th scope="col">左手 (N)</th>
            <th scope="col">右手 (N)</th>
            <th scope="col">最大值 (N)</th>
          </tr>
        </thead>
        <tbody>
          {trials.map((trial) => (
            <tr key={trial.label}>
              <td>{trial.label}</td>
              <td>{formatForce(trial.leftForce)}</td>
              <td>{formatForce(trial.rightForce)}</td>
              <td>{formatForce(trial.maximumForce)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
