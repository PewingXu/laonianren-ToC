import { CvAnalysis } from './details/CvAnalysis';
import { ForceTable } from './details/ForceTable';
import { SpeedComparison } from './details/SpeedComparison';

/**
 * 专业数据分析区。结构照握力（GripProfessionalAnalysis）：
 *   区标题 h2 + auto-fit 网格，每个分析项各占一张 analysis-card。
 *
 * 之前是一张 351px 定高的大面板，内部用百分比 + 小数 px 硬切三块
 * （47.5% / 52.5%，126.8px 行高），跟握力的「一项一张卡、各自撑高」不是一套。
 *
 * 三个子组件都会在数据不足时渲染「数据不足」占位，不会返回 null，
 * 所以这里不用像握力那样先算 hasXxx 再决定渲不渲染。
 */
export function SitStandDetailsPanel({ details }) {
  return (
    <section
      className="sit-stand-report__professional-analysis"
      aria-labelledby="sit-stand-details-title"
    >
      <h2 id="sit-stand-details-title" tabIndex="-1">专业数据分析</h2>
      <div className="sit-stand-report__professional-grid">
        <article className="sit-stand-report__analysis-card">
          <SpeedComparison trials={details.speedTrials} />
        </article>
        <article className="sit-stand-report__analysis-card">
          <ForceTable trials={details.forceTrials} />
        </article>
        <article className="sit-stand-report__analysis-card">
          <CvAnalysis cv={details.cv} />
        </article>
      </div>
    </section>
  );
}
