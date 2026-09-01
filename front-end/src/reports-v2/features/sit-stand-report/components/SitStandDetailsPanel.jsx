import { CvAnalysis } from './details/CvAnalysis';
import { ForceTable } from './details/ForceTable';
import { SpeedComparison } from './details/SpeedComparison';

export function SitStandDetailsPanel({ details }) {
  return (
    <section
      className="sit-stand-report__details-panel"
      aria-labelledby="sit-stand-details-title"
    >
      <h2 id="sit-stand-details-title" tabIndex="-1">详细数据</h2>
      <div className="sit-stand-report__details-grid">
        <ForceTable trials={details.forceTrials} />
        <div className="sit-stand-report__details-analysis">
          <SpeedComparison trials={details.speedTrials} />
          <CvAnalysis cv={details.cv} />
        </div>
      </div>
    </section>
  );
}
