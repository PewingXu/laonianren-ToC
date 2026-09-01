import { ShieldAlert } from 'lucide-react';

export function SitStandReportFooter() {
  return (
    <footer className="sit-stand-report__footer">
      <ShieldAlert aria-hidden="true" />
      <p>提示：本报告仅供参考，不能替代专业医疗诊断，如有不适，请及时就医。</p>
    </footer>
  );
}
