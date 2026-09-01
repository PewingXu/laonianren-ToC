import { overviewImages } from '../assets';
import { MaterialSymbol } from './MaterialSymbol';

const PRESENTATION = [
  {
    color: '#4D8D54',
    soft: '#F4F9F5',
    ring: 'rgb(77 141 84 / 10%)',
    glow: 'rgb(77 141 84 / 5%)',
    actionIcon: 'calendar_today',
    detailIcon: 'eco',
    crop: { top: '0px', left: '0px' },
    objectPosition: '0% 0%',
    action: [
      [{ text: '每天完成 ' }, { text: '10 次', accent: true }],
      [{ text: '坐站练习' }],
    ],
  },
  {
    color: '#F8A36D',
    soft: '#FFF8F2',
    ring: 'rgb(248 163 109 / 10%)',
    glow: 'rgb(248 163 109 / 5%)',
    actionIcon: 'self_improvement',
    detailIcon: 'spa',
    crop: { top: '0px', left: '-100%' },
    objectPosition: '100% 0%',
    action: [
      [{ text: '每天拉伸 ' }],
      [{ text: '5-10 分钟', accent: true }],
    ],
  },
  {
    color: '#7DA8D8',
    soft: '#F2F7FD',
    ring: 'rgb(125 168 216 / 10%)',
    glow: 'rgb(125 168 216 / 5%)',
    actionIcon: 'directions_walk',
    detailIcon: 'favorite',
    crop: { top: '-100%', left: '0px' },
    objectPosition: '0% 100%',
    action: [
      [{ text: '每天散步 ' }],
      [{ text: '20-30 分钟', accent: true }],
    ],
  },
  {
    color: '#DE7A5A',
    soft: '#FFF5F2',
    ring: 'rgb(222 122 90 / 10%)',
    glow: 'rgb(222 122 90 / 5%)',
    actionIcon: 'back_hand',
    detailIcon: 'fitness_center',
    crop: { top: '-100%', left: '-100%' },
    objectPosition: '100% 100%',
    action: [
      [{ text: '每天进行 ' }, { text: '5 分钟', accent: true }],
      [{ text: '握力练习' }],
    ],
  },
];

const DEFAULT_PRESENTATION = {
  color: '#5F5E5B',
  soft: '#F2F5ED',
  ring: '#ECEFE7',
  glow: '#F8FAF3',
  actionIcon: 'calendar_today',
  detailIcon: 'eco',
  crop: { top: '0px', left: '0px' },
  objectPosition: '0% 0%',
  action: null,
};

function getConfiguredAction(presentation) {
  if (!presentation.action) return '';
  return presentation.action.flat().map(({ text }) => text).join('');
}

function AdviceAction({ action, presentation }) {
  if (action !== getConfiguredAction(presentation)) {
    return (
      <span className="overview-clamp-2 font-subtitle text-body text-on-surface" title={action}>
        {action}
      </span>
    );
  }

  return (
    <span title={action}>
      {presentation.action.map((line, lineIndex) => (
        <span className="block font-subtitle text-body text-on-surface" key={lineIndex}>
          {line.map((segment) => (
            <span
              className={segment.accent ? 'font-bold' : undefined}
              style={segment.accent ? { color: presentation.color } : undefined}
              key={segment.text}
            >
              {segment.text}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

export function AdviceCard({ advice, index }) {
  const presentation = PRESENTATION[index] || DEFAULT_PRESENTATION;

  function handleError(event) {
    event.currentTarget.hidden = true;
    event.currentTarget.nextElementSibling.hidden = false;
  }

  return (
    <article
      className="health-overview__advice-card bg-white rounded-[32px] soft-shadow flex flex-col items-center text-center border border-outline-variant/30 p-6"
      data-advice={index + 1}
      style={{ '--advice-color': presentation.color, '--advice-soft': presentation.soft }}
    >
      <div
        className="health-overview__advice-media w-24 h-24 rounded-full flex items-center justify-center mb-4 relative p-3"
        style={{ backgroundColor: presentation.ring }}
      >
        <span
          className="health-overview__advice-glow absolute inset-0 rounded-full blur-xl"
          style={{ backgroundColor: presentation.glow }}
          aria-hidden="true"
        />
        <span className="health-overview__advice-sprite w-full h-full overflow-hidden rounded-full relative z-10">
          <img
            className="w-[200%] h-[200%] max-w-none absolute"
            src={overviewImages.advice}
            alt={`${advice.title}训练示意图`}
            loading="lazy"
            style={{ objectFit: 'cover', objectPosition: presentation.objectPosition, ...presentation.crop }}
            onError={handleError}
          />
          <span className="health-overview__image-fallback" hidden>
            <MaterialSymbol name="image_not_supported" className="text-[22px]" />
            <span>训练图片暂不可用</span>
          </span>
        </span>
      </div>

      <h3 className="font-section-title text-section-title font-bold text-on-surface mb-2">
        {advice.title}
      </h3>
      <span
        className="health-overview__advice-accent w-8 h-1 rounded-full mb-4"
        data-testid="advice-accent"
        style={{ backgroundColor: presentation.color }}
        aria-hidden="true"
      />

      <div
        className="health-overview__advice-action rounded-2xl p-4 w-full flex items-center gap-4 mb-4"
        style={{ backgroundColor: presentation.soft }}
      >
        <MaterialSymbol
          name={presentation.actionIcon}
          className="health-overview__advice-action-icon text-3xl"
        />
        <span className="health-overview__advice-action-copy text-left min-w-0">
          <AdviceAction action={advice.action} presentation={presentation} />
        </span>
      </div>

      <span className="health-overview__advice-divider w-full border-t border-dashed border-outline-variant mb-4" aria-hidden="true" />
      <p className="health-overview__advice-description flex items-start gap-3 w-full text-left">
        <MaterialSymbol name={presentation.detailIcon} className="text-xl mt-0.5" />
        <span className="overview-clamp-2 font-body text-sm text-secondary leading-relaxed" title={advice.content}>
          {advice.content}
        </span>
      </p>
    </article>
  );
}
