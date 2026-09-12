/**
 * 页脚。三段文字，照握力（GripReportFooter）：
 *   提示 / 免责声明 / 版权，居中，首段深色略大。
 * 之前是「一个图标 + 一行 11px 小字」横排，和握力页脚完全对不上。
 */
export function SitStandReportFooter() {
  return (
    <footer className="sit-stand-report__footer" aria-label="起身报告说明">
      <p>起坐速度可作为下肢力量与平衡能力的参考指标，建议结合专业意见安排复测。</p>
      <p>免责声明：本报告仅供参考，不能替代专业医疗诊断。如有不适，请及时就医。</p>
      <p>© 矩侨工业。保留所有权利。</p>
    </footer>
  );
}
