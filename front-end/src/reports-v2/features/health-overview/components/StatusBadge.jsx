import { MaterialSymbol } from './MaterialSymbol';

export function StatusBadge({
  status,
  iconName = 'remove_circle',
  background = '#EEF1F3',
  foreground = '#5F5E5B',
}) {
  const tone = status?.tone || 'muted';

  return (
    <span
      className="health-overview__status-badge flex items-center gap-1 px-3 py-1 rounded-full font-medium"
      data-tone={tone}
      style={{ color: foreground, backgroundColor: background }}
    >
      <MaterialSymbol name={iconName} className="text-[16px]" filled />
      <span>{status?.label || '尚未完成'}</span>
    </span>
  );
}
