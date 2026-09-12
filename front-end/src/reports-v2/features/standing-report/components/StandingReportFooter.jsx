export function StandingReportFooter({ footer }) {
  return (
    <footer className="standing-report__footer" aria-label="站立报告说明">
      <p>{footer.tip}</p>
      <p>{footer.disclaimer}</p>
      <p>{footer.copyright}</p>
    </footer>
  );
}
