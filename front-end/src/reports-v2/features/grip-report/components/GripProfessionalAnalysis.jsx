import { GripCvAnalysis } from './GripCvAnalysis';
import { GripForceCurve } from './GripForceCurve';
import { GripScoreBreakdown } from './GripScoreBreakdown';
import { GripSixRegionForces } from './GripSixRegionForces';
import { GripTrialsComparison } from './GripTrialsComparison';

/**
 * 专业数据分析区。
 *
 * 每张卡都可能因为数据缺失自行返回 null（本系统每只手只握一次，
 * 所以「三次测试对比」基本恒为空）。原实现把它们塞进写死的
 * 两列 × 两行等高 grid，空卡仍占位 → 六区域力量卡下面出现一大块留白。
 *
 * 现在先算出真正会渲染的卡，再决定布局：
 *   - 右列没内容就不渲染右列容器，避免多出一个 gap
 *   - 一张卡都没有就整节不渲染，标题也不留
 */
export function GripProfessionalAnalysis({ details }) {
  const hasTrials = Array.isArray(details.trials) && details.trials.length === 3;
  const hasCv = Boolean(details.cv);
  const hasRegions = Array.isArray(details.fingerRegions)
    && details.fingerRegions.some((region) => (
      region.leftForce !== null || region.rightForce !== null
    ));
  const hasBreakdown = Array.isArray(details.breakdown) && details.breakdown.length > 0;

  const hasSide = hasCv || hasRegions;
  const hasCurve = Boolean(details.forceCurve);
  if (!hasTrials && !hasSide && !hasBreakdown && !hasCurve) return null;

  return (
    <section
      className="grip-report__professional-analysis"
      aria-labelledby="grip-professional-analysis-title"
    >
      <h2 id="grip-professional-analysis-title">专业数据分析</h2>
      {/* 曲线单独占一整行：横轴是时间，压到半宽会挤成一团 */}
      {hasCurve ? (
        <div className="grip-report__professional-full">
          <GripForceCurve curve={details.forceCurve} />
        </div>
      ) : null}
      <div className="grip-report__professional-grid">
        {hasTrials ? <GripTrialsComparison trials={details.trials} /> : null}
        {hasSide ? (
          <div className="grip-report__professional-side">
            {hasCv ? <GripCvAnalysis cv={details.cv} /> : null}
            {hasRegions ? <GripSixRegionForces regions={details.fingerRegions} /> : null}
          </div>
        ) : null}
        {hasBreakdown ? (
          <GripScoreBreakdown
            breakdown={details.breakdown}
            scoreSummary={details.scoreSummary}
            redFlags={details.redFlags}
          />
        ) : null}
      </div>
    </section>
  );
}
