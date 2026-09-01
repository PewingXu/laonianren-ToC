function formatForce(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}N` : '--';
}

export function GripSixRegionForces({ regions }) {
  const rows = Array.isArray(regions) ? regions : [];
  const maximumForce = Math.max(
    1,
    ...rows.flatMap((region) => [region.leftForce, region.rightForce].filter(Number.isFinite)),
  );

  return (
    <article className="grip-report__analysis-card grip-report__six-region-card">
      <div className="grip-report__six-region-header">
        <h3>左右手六区域力量</h3>
        <div className="grip-report__six-region-legend" aria-hidden="true">
          <span><i className="grip-report__six-region-dot grip-report__six-region-dot--left" />左手</span>
          <span><i className="grip-report__six-region-dot grip-report__six-region-dot--right" />右手</span>
        </div>
      </div>

      {rows.length === 6 ? (
        <div
          className="grip-report__six-region-chart"
          role="img"
          aria-label="左右手六区域力量对比，单位为N"
        >
          {rows.map((region) => {
            const leftWidth = Number.isFinite(region.leftForce)
              ? `${(region.leftForce / maximumForce) * 100}%`
              : '0%';
            const rightWidth = Number.isFinite(region.rightForce)
              ? `${(region.rightForce / maximumForce) * 100}%`
              : '0%';

            return (
              <div className="grip-report__six-region-row" key={region.key}>
                <span className="grip-report__six-region-value grip-report__six-region-value--left">
                  {formatForce(region.leftForce)}
                </span>
                <span className="grip-report__six-region-track grip-report__six-region-track--left">
                  <i style={{ width: leftWidth }} />
                </span>
                <span className="grip-report__six-region-name">{region.label}</span>
                <span className="grip-report__six-region-track grip-report__six-region-track--right">
                  <i style={{ width: rightWidth }} />
                </span>
                <span className="grip-report__six-region-value grip-report__six-region-value--right">
                  {formatForce(region.rightForce)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="grip-report__six-region-empty">暂无六区域力量数据</p>
      )}
    </article>
  );
}
