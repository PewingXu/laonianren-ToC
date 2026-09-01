import { ChartNoAxesCombined } from 'lucide-react';
import { GaitAbilityCard } from './GaitAbilityCard';

export function GaitAbilityGrid({ abilities }) {
  return (
    <section
      className="gait-report__abilities"
      aria-labelledby="gait-abilities-title"
    >
      <h3 id="gait-abilities-title" className="gait-report__section-title">
        <ChartNoAxesCombined aria-hidden="true" />
        <span>详细能力拆解</span>
      </h3>
      <div className="gait-report__ability-grid">
        {abilities.map((ability) => (
          <GaitAbilityCard key={ability.id} ability={ability} />
        ))}
      </div>
    </section>
  );
}
