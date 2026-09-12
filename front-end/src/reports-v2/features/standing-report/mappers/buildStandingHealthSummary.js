// 用日常说法解释已有测量；不把单侧脚底压力或左右用力差推断成身体不稳。
export function buildStandingHealthSummary(facts) {
  if (facts?.is_valid !== true) {
    return {
      title: '再测一次，把站立情况看清楚',
      body: '这次记录还不够完整，暂时不能判断站立情况。再测时，请您按工作人员的提示，把两只脚完整放在垫子上，像平时一样自然站好。',
      focusBody: '如果测量时挪了脚、扶了东西，或感觉不舒服，请告诉工作人员，方便下次测得更准确。',
    };
  }

  const left = facts.left_percent;
  const right = facts.right_percent;
  const hasLoad = [left, right].every((value) => (
    Number.isFinite(value) && value >= 0 && value <= 100
  )) && Math.abs(left + right - 100) < 0.1;
  // 与现有站立评分及建议一致：左右比例相差超过 10 个百分点时提示留意。
  const uneven = hasLoad && Math.abs(left - right) > 10;

  let title = '站得舒服，也要记得休息';
  let finding = '';
  if (hasLoad) {
    title = uneven ? '站立时，留意两只脚怎么用力' : '两只脚用力差不多';
    finding = uneven
      ? `这次站着时，您的${left > right ? '左脚' : '右脚'}用力更多。平时可以留意，自己是不是常把重量压在同一边。`
      : '这次站着时，您的两只脚用力差不多。平时继续让双脚自然踩稳，以站得舒服为主。';
  }

  return {
    title,
    body: `${finding}洗菜、做饭或排队时，别一直站着不动，站久了可以坐下歇一会儿；穿裤子、换鞋时也可以坐着完成。`,
    focusBody: '留意站一会儿后，是否总有同一只脚酸、脚底疼，或比以前更需要扶着东西。下次检测时穿相近的鞋，按平时的站姿再测，看看有没有变化。',
  };
}
