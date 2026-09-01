const TARGET_ID = 'sit-stand-balance-detail';

export function ForceTable({ trials }) {
  const hasData = trials.length === 4;

  return (
    <article
      id={TARGET_ID}
      className="sit-stand-report__detail-column sit-stand-report__force-detail"
      aria-labelledby={`${TARGET_ID}-title`}
    >
      <h3 id={`${TARGET_ID}-title`} tabIndex="-1">左右侧发力数据</h3>
      {hasData ? (
        <>
          <table aria-labelledby={`${TARGET_ID}-title`}>
            <thead>
              <tr><th scope="col">次数</th><th scope="col">左脚(%)</th><th scope="col">右脚(%)</th><th scope="col">差异</th></tr>
            </thead>
            <tbody>
              {trials.map((trial) => (
                <tr key={trial.label}>
                  <td>{trial.label}</td>
                  <td>{trial.leftPercent}</td>
                  <td>{trial.rightPercent}</td>
                  <td>{trial.differencePercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="sit-stand-report__table-range">参考范围：差异 &lt; 10%</p>
        </>
      ) : <p className="sit-stand-report__detail-empty">数据不足</p>}
    </article>
  );
}
