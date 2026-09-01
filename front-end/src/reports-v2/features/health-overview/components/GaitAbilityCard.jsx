import { AbilityCardShell, AbilityImage } from './AbilityCardShell';
import { MaterialSymbol } from './MaterialSymbol';
import { MetricItem } from './MetricItem';

export function GaitAbilityCard({ ability, to, onOpenAbility }) {
  return (
    <AbilityCardShell ability={ability} index={2} to={to} onOpenAbility={onOpenAbility}>
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1 h-32 relative flex items-center justify-center">
          <div className="absolute w-full h-px border-b border-dashed border-blue-200 top-1/2" />
          <div className="flex justify-between w-full px-4 relative z-10" aria-hidden="true">
            {[0, 1, 2].map((dot) => (
              <span key={dot} className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            ))}
          </div>
          <AbilityImage className="h-full object-contain absolute" src={ability.image} alt="步态行走示意图" />
        </div>
        <div className="w-28 flex flex-col items-center">
          <span className="text-secondary mb-1 text-sm">综合表现</span>
          <div className="relative w-16 h-16">
            <svg
              className="w-full h-full -rotate-90"
              viewBox="0 0 100 100"
              role="img"
              aria-label={`综合表现 ${ability.score}%`}
            >
              <circle cx="50" cy="50" fill="none" r="40" stroke="#EEF3FC" strokeWidth="12" />
              <circle
                cx="50"
                cy="50"
                fill="none"
                r="40"
                stroke="#4B79D3"
                strokeDasharray="251.2"
                strokeDashoffset={251.2 * (1 - ability.score / 100)}
                strokeLinecap="round"
                strokeWidth="12"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center font-bold text-xl">
              {ability.score}%
            </div>
          </div>
          <span className="text-on-surface mt-1 text-sm">{ability.status.label}</span>
        </div>
      </div>
      <div className="health-overview__metrics health-overview__metrics--four grid grid-cols-4 gap-1 mb-4">
        {ability.metrics.map((metric) => (
          <MetricItem key={metric.label} metric={metric} compact tone="#4B79D3" />
        ))}
      </div>
      <p className="health-overview__ability-insight flex items-center gap-2 p-3 bg-[#EEF3FC] rounded-xl text-[#4B79D3] h-16">
        <MaterialSymbol name="snowshoeing" className="text-[18px]" filled />
        <span className="overview-clamp-2 font-medium text-on-surface-variant text-base" title={ability.insight}>
          {ability.insight}
        </span>
      </p>
    </AbilityCardShell>
  );
}
