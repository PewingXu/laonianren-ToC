/**
 * 评分频次表 + 百分位排名（评分排名系统）
 * ---------------------------------------------------------------
 * 存储：localStorage key 'sarcopenia_score_distribution'
 * 结构：{ grip:{分数:人数}, sitstand:{}, standing:{}, gait:{}, comprehensive:{} }
 *   分数为整数：单项 0-25，总分 0-100。北京/广州混同一表（评分口径一致）。
 *
 * 排名规则（同分排前面、分母含本人）：
 *   超越% = (分数<你的人数 + 分数=你的历史人数) / (历史总人数 + 1) × 100
 *   —— 频次表只记“分数→人数”，无论多少万人都极小，累加即可算百分位。
 */
const KEY = 'sarcopenia_score_distribution';
export const RANK_TYPES = ['grip', 'sitstand', 'standing', 'gait', 'comprehensive'];

function emptyDist() {
  return { grip: {}, sitstand: {}, standing: {}, gait: {}, comprehensive: {} };
}

export function loadDistribution() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyDist();
    return { ...emptyDist(), ...JSON.parse(raw) };
  } catch {
    return emptyDist();
  }
}

function saveDistribution(dist) {
  try {
    localStorage.setItem(KEY, JSON.stringify(dist));
  } catch (e) {
    console.error('保存评分频次表失败:', e);
  }
}

/** 累加一个分数到某项频次表 */
export function addScore(type, score) {
  if (!RANK_TYPES.includes(type)) return;
  const s = Math.round(Number(score));
  if (!Number.isFinite(s)) return;
  const dist = loadDistribution();
  dist[type][s] = (dist[type][s] || 0) + 1;
  saveDistribution(dist);
}

/**
 * 基于“历史（不含本人）”分布计算排名。
 * @returns { beat, total, percent, lower, equal } total 为历史人数（不含本人）
 */
export function computeRank(distForType, score) {
  const s = Math.round(Number(score));
  let lower = 0;
  let equal = 0;
  let total = 0;
  for (const k in distForType) {
    const cnt = distForType[k] || 0;
    const ks = Number(k);
    total += cnt;
    if (ks < s) lower += cnt;
    else if (ks === s) equal += cnt;
  }
  const beat = lower + equal;        // 同分历史都算被超越
  const denom = total + 1;           // 分母含本人
  const percent = denom > 0 ? (beat / denom) * 100 : 0;
  return { beat, total, percent, lower, equal };
}

/**
 * 计算“本人已计入库”情况下的排名：先剔除本人一个同分计数得到历史分布，再按 (lower+equal)/(历史总数+1)。
 * 用法：批量入库(addScore)完成后，对每条记录调用本函数得到其相对其他所有人的排名。
 */
export function getRankIncludingSelf(type, score) {
  const dist = loadDistribution();
  const d = { ...(dist[type] || {}) };
  const s = Math.round(Number(score));
  if (d[s] > 0) d[s] = d[s] - 1; // 去掉本人一个计数 → 历史（不含本人）
  return computeRank(d, s);
}

/** 直接基于当前库（视作历史、不含本人）算排名 */
export function getRank(type, score) {
  const dist = loadDistribution();
  return computeRank(dist[type] || {}, score);
}

/** 某项当前入库人数 */
export function getCount(type) {
  const dist = loadDistribution();
  return Object.values(dist[type] || {}).reduce((a, b) => a + (b || 0), 0);
}

export function clearDistribution() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    console.error('清空评分频次表失败:', e);
  }
}

export default { loadDistribution, addScore, computeRank, getRankIncludingSelf, getRank, getCount, clearDistribution, RANK_TYPES };
