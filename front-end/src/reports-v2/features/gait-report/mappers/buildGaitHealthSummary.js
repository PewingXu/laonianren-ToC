// 末尾总结侧重日常安排与后续观察；评分和实测数字由报告开头说明。
export function buildGaitHealthSummary(facts) {
  if (facts?.is_valid !== true) {
    return {
      title: '先完善测量，再安排活动计划',
      body: '目前的记录还不足以支持完整的步态判断。建议您在工作人员指导下，按平时的自然节奏完成复测，再据此调整日常活动安排。',
      focusBody: '复测时尽量保持相近的鞋履和测试条件，完整走过检测区域，便于比较前后的变化。',
    };
  }

  const speed = facts.speed_mps;
  const reference = facts.speed_reference;
  const belowReference = Number.isFinite(speed) && speed > 0
    && Number.isFinite(reference) && reference > 0 && speed < reference;
  const limited = facts.stability_confidence === 'limited'
    || facts.direction_confidence === 'limited';

  return {
    title: belowReference ? '日常出行，给自己留足时间' : '让规律走动融入日常生活',
    body: belowReference
      ? '外出买菜或散步时，建议您预留更充裕的时间，把较长的路程分成几段，按舒适的节奏行走。先以走得从容、途中能够适当休息为目标，再根据自身感受逐步调整活动量。'
      : '建议您把散步、买菜等日常走动安排得更有规律，根据当天的体力选择路程，并给休息留出余地。活动量是否合适，还要结合走路时的舒适程度和走完后的恢复情况来判断。',
    focusBody: [
      limited ? '本次落脚样本有限，节奏和路线表现只作本次参考。' : '',
      '留意走同一段熟悉路线时，是否比平时更费力、需要更多停顿，或转弯时更需要扶靠；记录这些变化，并在相近条件下复测。',
    ].join(''),
  };
}
