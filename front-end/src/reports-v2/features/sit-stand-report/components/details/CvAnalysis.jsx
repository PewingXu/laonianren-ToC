const TARGET_ID = 'sit-stand-stability-detail';

function CvRing({ side, value, tone }) {
  return (
    <div className="sit-stand-report__ring-block">
      <svg viewBox="0 0 86 86" role="img" aria-label={`${side}侧变异系数${value}%`}>
        <circle className="sit-stand-report__ring-track" cx="43" cy="43" r="35" />
        <circle className={`sit-stand-report__ring-value sit-stand-report__ring-value--${tone}`} cx="43" cy="43" r="35" />
      </svg>
      <span>{side}侧<b>{value}%</b></span>
    </div>
  );
}

export function CvAnalysis({ cv }) {
  return (
    <article
      id={TARGET_ID}
      className="sit-stand-report__detail-column sit-stand-report__cv-detail"
      aria-labelledby={`${TARGET_ID}-title`}
    >
      <h3 id={`${TARGET_ID}-title`} tabIndex="-1">稳定性分析（变异系数 CV）</h3>
      {cv ? (
        <>
          <div className="sit-stand-report__cv-content">
            <div className="sit-stand-report__cv-rings">
              <CvRing side="左" value={cv.leftPercent} tone="blue" />
              <CvRing side="右" value={cv.rightPercent} tone="green" />
            </div>
            <div className="sit-stand-report__cv-summary">
              <p className="sit-stand-report__cv-average">
                双侧平均 <strong>{cv.averagePercent}%</strong>
              </p>
              <span className="sit-stand-report__good-pill">{cv.status}</span>
            </div>
          </div>
          <p className="sit-stand-report__cv-range">
            参考范围：优秀 &lt; 5%　正常 5% ~ 10%　一般 10% ~ 15%　偏低 &gt; 15%
          </p>
        </>
      ) : <p className="sit-stand-report__detail-empty">数据不足</p>}
    </article>
  );
}
