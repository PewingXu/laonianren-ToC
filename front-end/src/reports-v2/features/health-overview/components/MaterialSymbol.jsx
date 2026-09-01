export function MaterialSymbol({ name, className = '', filled = false, label }) {
  const style = filled
    ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }
    : undefined;

  return (
    <span
      className={`material-symbols-outlined ${className}`.trim()}
      style={style}
      aria-hidden={label ? undefined : 'true'}
      aria-label={label}
    >
      {name}
    </span>
  );
}
