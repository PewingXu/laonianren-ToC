import { AssessmentAiGuidance } from '../../../shared/AssessmentAiGuidance';

const RECOMMENDATION_META = [
  {
    id: 'walk',
    icon: 'walking',
    tone: 'green',
    title: '规律走路练习',
    description: '根据自身状态安排规律走路练习，保持舒适节奏并循序渐进。',
  },
  {
    id: 'stretch',
    icon: 'stretch',
    tone: 'orange',
    title: '拉伸与放松',
    description: '活动前后适当拉伸下肢，动作保持缓慢，并在稳定支撑下完成。',
  },
  {
    id: 'safety',
    icon: 'water',
    tone: 'blue',
    title: '补水与安全',
    description: '走路前后及时补水，选择平整安全的路线，并穿着合脚防滑的鞋。',
  },
];

function recommendationGroups(recommendations) {
  const source = Array.isArray(recommendations) ? recommendations : [];
  return RECOMMENDATION_META.map((meta, index) => {
    const item = source[index];
    return {
      id: item?.id || meta.id,
      icon: item?.icon || meta.icon,
      tone: item?.tone || meta.tone,
      title: item?.title || meta.title,
      items: [item?.description || meta.description],
    };
  });
}

export function GaitAiGuidance({
  healthSummary,
  recommendations,
  pending = false,
}) {
  return (
    <AssessmentAiGuidance
      idPrefix="gait"
      healthSummary={{ ...healthSummary, focusTitle: '后续观察重点' }}
      advice={recommendationGroups(recommendations)}
      pending={pending}
    />
  );
}
