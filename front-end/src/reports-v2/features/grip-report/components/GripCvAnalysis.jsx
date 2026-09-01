export function GripCvAnalysis({ cv }) {
  if (!cv) return null;

  return (
    <article className="grip-report__analysis-card grip-report__cv-card">
      <h3 id="grip-endurance-detail" tabIndex={-1}>发力稳定性 (CV)</h3>
      <div className="grip-report__cv-content">
        <div className="grip-report__cv-ring">
          <svg viewBox="0 0 36 36" role="img" aria-label={`变异系数${cv.value}%，评价${cv.status}`}>
            <circle className="grip-report__cv-ring-track" cx="18" cy="18" r="16" />
            <circle className="grip-report__cv-ring-value" cx="18" cy="18" r="16" />
          </svg>
          <div>
            <strong>{cv.value}%</strong>
            <span>变异系数</span>
          </div>
        </div>
        <div className="grip-report__cv-copy">
          <p><span>评价</span><strong>{cv.status}</strong></p>
          <small>{cv.description}</small>
        </div>
      </div>
    </article>
  );
}
