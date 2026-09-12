export function GaitReportFooter({ footer = {} }) {
  return (
    <footer className="gait-report__footer" aria-label="步态报告说明">
      <p>{footer.tip}</p>
      <p>{footer.disclaimer}</p>
      <p>{footer.copyright}</p>
    </footer>
  );
}
