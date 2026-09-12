import { AssessmentAiGuidance } from '../../../shared/AssessmentAiGuidance';

const ADVICE_META = [
  {
    id: 'activity',
    icon: 'activity',
    tone: 'green',
    title: '平衡练习',
    detail: '在有人陪同或扶稳的情况下，根据专业建议安排适合自己的平衡练习。',
  },
  {
    id: 'posture',
    icon: 'posture',
    tone: 'orange',
    title: '站姿调整',
    detail: '站立时保持双脚自然受力，久站期间适时变换姿势并安排休息。',
  },
  {
    id: 'strength',
    icon: 'walking',
    tone: 'purple',
    title: '足部照护',
    detail: '选择合脚且防滑的鞋，持续留意足底受力变化和足部不适。',
  },
];

function adviceGroups(advice) {
  const source = Array.isArray(advice) ? advice : [];
  return ADVICE_META.map((meta, index) => {
    const item = source[index];
    return {
      id: item?.id || meta.id,
      icon: meta.icon,
      tone: meta.tone,
      title: item?.title || meta.title,
      items: [item?.detail || meta.detail],
    };
  });
}

export function StandingAiGuidance({
  healthSummary,
  advice,
  pending = false,
}) {
  return (
    <AssessmentAiGuidance
      idPrefix="standing"
      healthSummary={{ ...healthSummary, focusTitle: '平时多留意这些变化' }}
      advice={adviceGroups(advice)}
      pending={pending}
    />
  );
}
