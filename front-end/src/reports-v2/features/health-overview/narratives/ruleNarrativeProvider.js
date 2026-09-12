function availableAbilities(abilities) {
  return Array.isArray(abilities) ? abilities.filter((ability) => (
    ability?.available
    && Number.isFinite(ability.score)
    && ability.score >= 0
    && ability.score <= 100
  )) : [];
}

function lowestAbility(abilities) {
  return abilities.reduce((lowest, ability) => (!lowest || ability.score < lowest.score ? ability : lowest), null);
}

/** Builds deterministic narrative copy from already-normalized assessment summaries. */
export function buildRuleNarrative({ abilities, trend } = {}) {
  const available = availableAbilities(abilities);
  const completedCount = Array.isArray(abilities)
    ? abilities.filter((ability) => ability?.available).length
    : 0;
  const lowest = lowestAbility(available);
  const average = available.length
    ? available.reduce((total, ability) => total + ability.score, 0) / available.length
    : 0;
  const greeting = available.length === 0
    ? (completedCount > 0
      ? `已完成 ${completedCount} 项评估，但数据暂不足以形成综合评分。`
      : '完成评估后，我们会为您整理身体状态。')
    : average >= 80
      ? `已完成 ${available.length} 项评估，整体状态不错，继续保持。`
      : `已完成 ${available.length} 项评估，循序练习会带来更多进步。`;
  const advice = lowest
    ? [`优先关注${lowest.title}，按自身情况安排适量练习。`]
    : [completedCount > 0
      ? '请按各项报告提示复测，取得完整数据后再安排针对性练习。'
      : '完成评估后，根据结果安排适量练习。'];

  return {
    greeting,
    advice,
    expertInsight: lowest
      ? `本次评估中可优先关注${lowest.title}，保持规律活动并按身体感受调整。`
      : (completedCount > 0
        ? '本次已有评估记录，但可用数据不足；请结合各项报告提示完成复测。'
        : '完成评估后，我们会根据结果提供更有针对性的建议。'),
    peerComparison: null,
    trendSummary: typeof trend?.summary === 'string' ? trend.summary : '',
    nextAssessment: {
      title: '期待下次与您见面',
      heading: '相约30天后',
      content: '给身体一点时间，我们下次再来看看有什么新进步。',
      days: 30,
    },
  };
}
