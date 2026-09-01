import { Flower2 } from 'lucide-react';

export function StandingReportFooter({ footer }) {
  return (
    <footer className="standing-report__footer" aria-label="站立报告说明">
      <Flower2 aria-hidden="true" />
      <span>{footer.disclaimer}</span>
    </footer>
  );
}
