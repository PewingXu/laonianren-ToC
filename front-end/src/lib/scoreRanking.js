/**
 * 评分频次表 + 得分索引 + 百分位排名（评分排名系统）
 * ---------------------------------------------------------------
 * 两张小表（都在 localStorage，体积极小，与报告数据完全解耦）：
 *
 *  ① 频次表 'sarcopenia_score_distribution'
 *     { grip:{分数:人数}, sitstand:{}, standing:{}, gait:{} }
 *     只记「分数 → 人数」，几万人也只有几十个键，用来算百分位。
 *
 *  ② 得分索引 'sarcopenia_score_index'
 *     { 记录ID: { grip:21, sitstand:19, ... } }
 *     记下每个人各项的得分。有了它：
 *       - 显示排名徽章不必再去读报告、跑评分算法（直接查表）
 *       - 频次表可由它一次聚合出来（rebuildDistributionFromIndex），
 *         "重算排名"不再需要遍历所有报告数据
 *
 *  分数为整数，各模块统一 0-25 口径（与单项报告一致）。北京/广州混同一表（评分口径一致）。
 *  注：不做综合总分排名——历史数据集里各人完成的项目数不一，凑不齐 4 项无法公平比较总分。
 *
 * 排名规则（同分排前面、分母含本人）：
 *   超越% = (分数<你的人数 + 分数=你的历史人数) / (历史总人数 + 1) × 100
 */
const KEY = 'sarcopenia_score_distribution';
const INDEX_KEY = 'sarcopenia_score_index';
export const RANK_TYPES = ['grip', 'sitstand', 'standing', 'gait'];

function emptyDist() {
  return Object.fromEntries(RANK_TYPES.map(t => [t, {}]));
}

/* ─── ② 得分索引：记录ID → 各项得分 ─── */

export function loadScoreIndex() {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function saveScoreIndex(index) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch (e) {
    console.error('保存得分索引失败:', e);
  }
}

/** 记录某条记录的各项得分（itemScores 形如 {grip:21, gait:18}）；传空则等同删除 */
export function setRecordScores(recordId, itemScores) {
  if (recordId == null) return;
  const index = loadScoreIndex();
  if (!itemScores || !Object.keys(itemScores).length) delete index[String(recordId)];
  else index[String(recordId)] = itemScores;
  saveScoreIndex(index);
}

/** 批量写入得分索引（一次落盘）；replaceAll=true 时整表替换（用于全量重算） */
export function setRecordScoresBatch(entries = {}, replaceAll = false) {
  const index = replaceAll ? {} : loadScoreIndex();
  for (const [id, scores] of Object.entries(entries)) {
    if (scores && Object.keys(scores).length) index[String(id)] = scores;
    else delete index[String(id)];
  }
  saveScoreIndex(index);
  return index;
}

export function getRecordScores(recordId) {
  return loadScoreIndex()[String(recordId)] || null;
}

export function removeRecordScores(recordId) {
  const index = loadScoreIndex();
  if (index[String(recordId)]) {
    delete index[String(recordId)];
    saveScoreIndex(index);
  }
}

/**
 * 由得分索引聚合出频次表（一次遍历，不接触任何报告数据）。
 * 这使"重算排名"的成本只与人数相关，与报告体积无关。
 */
export function rebuildDistributionFromIndex(index = null) {
  const idx = index || loadScoreIndex();
  const dist = emptyDist();
  for (const scores of Object.values(idx)) {
    if (!scores) continue;
    for (const [type, score] of Object.entries(scores)) {
      if (!RANK_TYPES.includes(type)) continue;
      const s = Math.round(Number(score));
      if (!Number.isFinite(s)) continue;
      dist[type][s] = (dist[type][s] || 0) + 1;
    }
  }
  saveDistribution(dist);
  return dist;
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

/** 累加一个分数到某项频次表（单条；批量请用 rebuildDistribution，避免 N 次读写 localStorage） */
export function addScore(type, score) {
  if (!RANK_TYPES.includes(type)) return;
  const s = Math.round(Number(score));
  if (!Number.isFinite(s)) return;
  const dist = loadDistribution();
  dist[type][s] = (dist[type][s] || 0) + 1;
  saveDistribution(dist);
}

/**
 * 批量重建频次表（幂等）：内存里累加完再**一次性**落盘。
 * 旧写法是每条分数都 loadDistribution+saveDistribution，N 条记录 × 5 项 = 5N 次
 * 同步 localStorage 往返，几百条就会把主线程冻住数秒；这里压成 1 次读 + 1 次写。
 * @param {Array<{type:string, score:number}>} entries
 */
export function rebuildDistribution(entries = []) {
  const dist = emptyDist();
  for (const e of entries) {
    if (!e || !RANK_TYPES.includes(e.type)) continue;
    const s = Math.round(Number(e.score));
    if (!Number.isFinite(s)) continue;
    dist[e.type][s] = (dist[e.type][s] || 0) + 1;
  }
  saveDistribution(dist);
  return dist;
}

/** 基于给定分布（不读 localStorage）算排名，供批量场景复用，避免每条都读盘 */
export function computeRankFromDist(dist, type, score, excludeSelf = true) {
  const d = { ...((dist && dist[type]) || {}) };
  const s = Math.round(Number(score));
  if (excludeSelf && d[s] > 0) d[s] = d[s] - 1; // 剔除本人一个计数 → 得到"历史"分布
  return computeRank(d, s);
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

/** 清空频次表与得分索引（两张表同源，必须一起清，否则重算会复活旧数据） */
export function clearDistribution() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(INDEX_KEY);
  } catch (e) {
    console.error('清空评分频次表失败:', e);
  }
}

export default { loadDistribution, addScore, computeRank, getRankIncludingSelf, getRank, getCount, clearDistribution, RANK_TYPES };
