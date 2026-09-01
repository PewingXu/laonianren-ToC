export function GripReportFooter({ footer }) {
  return (
    <footer className="grip-report__footer" aria-label="握力报告说明">
      <p>{footer.tip}</p>
      <p>{footer.disclaimer}</p>
      <p>{footer.copyright}</p>
    </footer>
  );
}
