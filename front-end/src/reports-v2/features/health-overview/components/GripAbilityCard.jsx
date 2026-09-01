import { AbilityCardShell, AbilityImage } from './AbilityCardShell';
import { MaterialSymbol } from './MaterialSymbol';

function ForceValue({ metric }) {
  return (
    <div className="health-overview__force-value flex flex-col items-center">
      <span className="text-[10px] text-secondary mb-1">{metric.label}</span>
      <div className="flex items-baseline gap-0.5">
        <span className="font-bold text-on-surface text-3xl">{metric.value}</span>
        <span className="text-[8px] text-secondary">{metric.unit}</span>
      </div>
      <div className="w-12 h-1.5 bg-[#F8A36D] rounded-full mt-1" aria-hidden="true" />
      <span className="text-[10px] text-[#F8A36D] font-medium mt-1">{metric.reference}</span>
    </div>
  );
}

export function GripAbilityCard({ ability, to, onOpenAbility }) {
  if (!ability.available) {
    return <AbilityCardShell ability={ability} index={4} to={to} onOpenAbility={onOpenAbility} />;
  }

  const [left, right, difference] = ability.metrics;

  return (
    <AbilityCardShell ability={ability} index={4} to={to} onOpenAbility={onOpenAbility}>
      <div className="flex items-center gap-4 mb-4">
        <div className="relative w-24 h-32 flex items-center justify-center">
          <AbilityImage className="h-full object-contain" src={ability.image} alt="握力计" />
        </div>
        <div className="flex-1 flex items-center justify-between px-2">
          <ForceValue metric={left} />
          <div className="health-overview__difference w-14 h-14 rounded-full border border-outline-variant/30 flex flex-col items-center justify-center bg-[#FFF8F4] shrink-0">
            <span className="text-[8px] text-secondary">左右差异</span>
            <span className="text-base font-bold text-on-surface">{difference.value}{difference.unit}</span>
            <span className="text-[8px] text-secondary">{difference.reference}</span>
          </div>
          <ForceValue metric={right} />
        </div>
      </div>
      <p className="health-overview__ability-insight flex items-center gap-2 p-3 bg-[#FFF8F4] rounded-xl text-[#F8A36D] h-16">
        <MaterialSymbol name="favorite" className="text-[18px]" filled />
        <span className="overview-clamp-2 font-medium text-on-surface-variant text-sm" title={ability.insight}>
          {ability.insight}
        </span>
      </p>
    </AbilityCardShell>
  );
}
