import { Link } from 'react-router-dom';
import { MaterialSymbol } from './MaterialSymbol';
import { StatusBadge } from './StatusBadge';

const CARD_PRESENTATION = {
  sitstand: {
    index: '#4D8D54',
    badgeBackground: '#EAF3EA',
    badgeForeground: '#4D8D54',
    badgeIcon: 'check_circle',
  },
  gait: {
    index: '#6E95D6',
    badgeBackground: '#EEF3FC',
    badgeForeground: '#4B79D3',
    badgeIcon: 'check_circle',
  },
  standing: {
    index: '#A689B5',
    badgeBackground: '#FFF5E6',
    badgeForeground: '#E09038',
    badgeIcon: 'error',
  },
  grip: {
    index: '#F8A36D',
    badgeBackground: '#EAF3EA',
    badgeForeground: '#4D8D54',
    badgeIcon: 'check_circle',
  },
};

const DEFAULT_PRESENTATION = {
  index: '#8C8C8C',
  badgeBackground: '#EEF1F3',
  badgeForeground: '#5F5E5B',
  badgeIcon: 'remove_circle',
};

const POSITIVE_BADGE_PRESENTATION = {
  badgeBackground: '#EAF3EA',
  badgeForeground: '#4D8D54',
  badgeIcon: 'check_circle',
};

export function AbilityImage({ src, alt, className = '' }) {
  function handleError(event) {
    event.currentTarget.hidden = true;
    event.currentTarget.nextElementSibling.hidden = false;
  }

  return (
    <>
      <img className={className} src={src} alt={alt} loading="lazy" onError={handleError} />
      <span className="health-overview__image-fallback" hidden>
        <MaterialSymbol name="image_not_supported" className="text-3xl" />
        <span>图片暂不可用</span>
      </span>
    </>
  );
}

function CardContent({ ability, index, children }) {
  const presentation = CARD_PRESENTATION[ability.type] || DEFAULT_PRESENTATION;
  const badgePresentation = !ability.available
    ? DEFAULT_PRESENTATION
    : ability.status?.tone === 'positive' && presentation.badgeIcon === 'error'
      ? POSITIVE_BADGE_PRESENTATION
      : presentation;

  return (
    <>
      <header className="health-overview__ability-header flex justify-between items-start mb-4">
        <div className="health-overview__ability-heading flex gap-3 items-center">
          <span
            className="health-overview__ability-index w-8 h-8 text-white rounded-lg flex items-center justify-center font-bold text-lg"
            style={{ backgroundColor: presentation.index }}
            aria-hidden="true"
          >
            {index}
          </span>
          <div className="health-overview__ability-title-group">
            <h3 className="font-subtitle font-bold text-on-surface">{ability.title}</h3>
            <p className="text-secondary">{ability.description}</p>
          </div>
        </div>
        <StatusBadge
          status={ability.status}
          iconName={badgePresentation.badgeIcon}
          background={badgePresentation.badgeBackground}
          foreground={badgePresentation.badgeForeground}
        />
      </header>
      {ability.available ? children : (
        <div className="health-overview__ability-unavailable flex-1 min-h-[320px] flex items-center justify-center rounded-xl bg-surface-container-low text-secondary">
          <span>完成本项评估后，即可查看详细结果。</span>
        </div>
      )}
    </>
  );
}

export function AbilityCardShell({ ability, index, to, onOpenAbility, children }) {
  const className = 'health-overview__ability-card bg-white rounded-[32px] soft-shadow flex flex-col border border-outline-variant/20 justify-between p-6';
  const content = <CardContent ability={ability} index={index}>{children}</CardContent>;

  function handleKeyDown(event) {
    if (event.key === ' ') {
      event.preventDefault();
      event.currentTarget.click();
    }
  }

  if (!ability.available) {
    return <article className={className} data-ability={ability.type} data-available="false">{content}</article>;
  }

  return (
    <Link
      className={className}
      data-ability={ability.type}
      data-available="true"
      to={to}
      aria-label={`查看${ability.title}详情`}
      onClick={() => onOpenAbility?.(ability.type)}
      onKeyDown={handleKeyDown}
    >
      {content}
    </Link>
  );
}
