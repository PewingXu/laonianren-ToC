import { AbilityCardShell, AbilityImage } from './AbilityCardShell';
import { MaterialSymbol } from './MaterialSymbol';
import { MetricItem } from './MetricItem';

export function SitStandAbilityCard({ ability, to, onOpenAbility }) {
  return (
    <AbilityCardShell ability={ability} index={1} to={to} onOpenAbility={onOpenAbility}>
      <div className="flex items-center gap-4 mb-4">
        <div className="relative flex-1 h-40 flex items-center justify-center overflow-hidden rounded-xl bg-white">
          <AbilityImage
            className="w-full h-full object-contain rounded-xl scale-[.8]"
            src={ability.image}
            alt="起身动作序列"
          />
        </div>
        <div className="w-28 flex flex-col items-center">
          <span className="text-secondary mb-1 text-sm">综合表现</span>
          <div className="flex items-baseline gap-0.5">
            <span className="font-bold text-[#4D8D54] leading-none text-6xl" style={{ fontSize: 88 }}>
              {ability.score}
            </span>
            <span className="text-lg font-bold text-[#4D8D54]">%</span>
          </div>
          <div className="w-full h-1.5 bg-surface-container-high rounded-full mt-2 overflow-hidden" aria-hidden="true">
            <div className="h-full bg-[#4D8D54]" style={{ width: `${ability.score}%` }} />
          </div>
          <span className="text-[#4D8D54] mt-1 text-sm">{ability.status.label}</span>
        </div>
      </div>
      <div className="health-overview__metrics health-overview__metrics--three grid grid-cols-3 gap-2 mb-4">
        {ability.metrics.map((metric, index) => (
          <MetricItem
            key={metric.label}
            metric={metric}
            tone="#4D8D54"
            valueClassName={index === 2 ? 'text-5xl' : ''}
          />
        ))}
      </div>
      <p className="health-overview__ability-insight flex items-center gap-2 p-3 bg-[#EAF3EA] rounded-xl text-[#4D8D54] h-16">
        <MaterialSymbol name="eco" className="text-[18px]" filled />
        <span className="overview-clamp-2 font-medium text-base" title={ability.insight}>{ability.insight}</span>
      </p>
    </AbilityCardShell>
  );
}
