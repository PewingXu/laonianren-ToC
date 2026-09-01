import { AbilityCardShell, AbilityImage } from './AbilityCardShell';
import { MaterialSymbol } from './MaterialSymbol';

function StandingMetric({ metric, percentScale = false }) {
  const numericValue = Number.parseFloat(metric.value);
  const marker = Number.isFinite(numericValue) ? Math.min(100, Math.max(0, numericValue / 30 * 100)) : 0;
  const scale = percentScale ? ['0%', '15%', '30%'] : ['0', '15', '30'];

  return (
    <div>
      <span className="text-secondary mb-1 block text-sm">{metric.label}</span>
      <div className="flex items-baseline gap-0.5">
        <span className="font-bold text-on-surface text-4xl">{metric.value}</span>
        <span className="text-sm font-bold text-on-surface">{metric.unit}</span>
      </div>
      <div className="w-full h-1.5 bg-surface-container-high rounded-full relative mt-1" aria-hidden="true">
        <span
          className="absolute w-2 h-2 bg-[#A689B5] rounded-full -top-[1px] border border-white shadow-sm"
          style={{ left: `${marker}%` }}
        />
      </div>
      <div className="flex justify-between text-[8px] text-soft-gray mt-0.5">
        {scale.map((label) => <span key={label}>{label}</span>)}
      </div>
    </div>
  );
}

export function StandingAbilityCard({ ability, to, onOpenAbility }) {
  return (
    <AbilityCardShell ability={ability} index={3} to={to} onOpenAbility={onOpenAbility}>
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1 h-32 flex items-center justify-center gap-4">
          <div className="relative h-full flex-1 flex items-center justify-center">
            <AbilityImage className="h-full object-contain scale-[1.18]" src={ability.image} alt="足底压力示意图" />
          </div>
          <div className="w-px h-16 bg-outline-variant/30" />
          <div className="w-12 h-24 bg-surface-container-low rounded-full flex items-center justify-center">
            <MaterialSymbol name="person" className="text-4xl text-surface-dim" />
          </div>
        </div>
        <div className="w-36 flex flex-col gap-4">
          {ability.metrics.map((metric, index) => (
            <StandingMetric key={metric.label} metric={metric} percentScale={index === 0} />
          ))}
        </div>
      </div>
      <p className="health-overview__ability-insight flex items-center gap-2 p-3 bg-[#FFF9F0] rounded-xl text-[#E09038] h-16">
        <MaterialSymbol name="info" className="text-[18px]" filled />
        <span className="overview-clamp-2 font-medium text-on-surface-variant text-sm" title={ability.insight}>
          {ability.insight}
        </span>
      </p>
    </AbilityCardShell>
  );
}
