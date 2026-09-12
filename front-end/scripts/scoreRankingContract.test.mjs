import assert from 'node:assert/strict';
import test from 'node:test';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

const ranking = await import('../src/lib/scoreRanking.js');

test('旧评分口径缓存不会参与报告排名', () => {
  localStorage.setItem('sarcopenia_score_index', JSON.stringify({ old: { standing: 16 } }));
  localStorage.setItem('sarcopenia_score_distribution', JSON.stringify({ standing: { 16: 1 } }));

  assert.equal(ranking.isScoreCacheCurrent(), false);
  assert.deepEqual(ranking.loadScoreIndex(), {});
  assert.equal(ranking.getCount('standing'), 0);
});

test('全量重算并标记新口径后可读取一致排名', () => {
  const index = ranking.setRecordScoresBatch({ current: { standing: 15, gait: 24 } }, true);
  ranking.rebuildDistributionFromIndex(index);
  ranking.markScoreCacheCurrent();

  assert.equal(ranking.isScoreCacheCurrent(), true);
  assert.deepEqual(ranking.getRecordScores('current'), { standing: 15, gait: 24 });
  assert.equal(ranking.getCount('standing'), 1);
  assert.equal(ranking.getCount('gait'), 1);
});
