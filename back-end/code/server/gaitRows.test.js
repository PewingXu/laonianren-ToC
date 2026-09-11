const assert = require('node:assert/strict')
const test = require('node:test')

const { extractGaitBoardSeries } = require('./gaitRows')

function frame(value) {
  return Array(4096).fill(value)
}

function row(timestamp, data) {
  return { timestamp, data: JSON.stringify(data) }
}

test('extracts independently sampled gait boards from sparse database rows', () => {
  const initial = {
    foot1: { arr: frame(10), stamp: 995 },
    foot2: { arr: frame(20), stamp: 996 },
    foot3: { arr: frame(30), stamp: 997 },
    foot4: { arr: frame(40), stamp: 998 },
  }
  const rows = [
    row(1000, initial),
    row(1020, { foot1: { arr: frame(11), stamp: 1019 } }),
    row(1024, { foot3: { arr: frame(31), stamp: 1022 } }),
    row(1040, { foot2: { arr: frame(21), stamp: 1038 } }),
    row(1044, { foot4: { arr: frame(41), stamp: 1041 } }),
  ]

  const result = extractGaitBoardSeries(rows)

  assert.deepEqual(result.boardData.map((series) => series.map((item) => item[0])), [
    [10, 11],
    [20, 21],
    [30, 31],
    [40, 41],
  ])
  assert.deepEqual(result.boardTimes, [
    [995, 1019],
    [996, 1038],
    [997, 1022],
    [998, 1041],
  ])
  assert.deepEqual(result.rejectedFrames, [0, 0, 0, 0])
  assert.deepEqual(result.rejectedTimestamps, [0, 0, 0, 0])
})

test('a duplicate stamp on one board does not discard new frames from another board', () => {
  const rows = [
    row(1000, {
      foot1: { arr: frame(10), stamp: 990 },
      foot2: { arr: frame(20), stamp: 991 },
    }),
    row(1020, {
      foot1: { arr: frame(99), stamp: 990 },
      foot2: { arr: frame(21), stamp: 1018 },
    }),
  ]

  const result = extractGaitBoardSeries(rows)

  assert.deepEqual(result.boardData[0].map((item) => item[0]), [10])
  assert.deepEqual(result.boardTimes[0], [990])
  assert.deepEqual(result.boardData[1].map((item) => item[0]), [20, 21])
  assert.deepEqual(result.boardTimes[1], [991, 1018])
})

test('ignores malformed rows and rejects only the invalid board frame', () => {
  const rows = [
    { timestamp: 900, data: '{not json' },
    row('not-a-time', { foot1: { arr: frame(1), stamp: 'bad-stamp' } }),
    row(1000, {
      foot1: { arr: [1, 2], stamp: 1 },
      foot2: frame(2),
    }),
    row(1020, { foot1: { arr: frame(3), stamp: 1018 } }),
    row(null, { foot3: frame(4) }),
  ]

  const result = extractGaitBoardSeries(rows)

  assert.deepEqual(result.boardData[0].map((item) => item[0]), [3])
  assert.deepEqual(result.boardTimes[0], [1018])
  assert.deepEqual(result.boardData[1].map((item) => item[0]), [2])
  assert.deepEqual(result.boardTimes[1], [1000])
  assert.deepEqual(result.rejectedFrames, [1, 0, 0, 0])
  assert.deepEqual(result.rejectedTimestamps, [1, 0, 1, 0])
})

test('rejects zero and negative timestamps instead of creating 1970 frames', () => {
  const rows = [
    row(0, { foot1: { arr: frame(1), stamp: 0 } }),
    row(-10, { foot2: { arr: frame(2), stamp: -5 } }),
    row(0, { foot3: { arr: frame(3), stamp: 0 } }),
    row(-10, { foot4: { arr: frame(4), stamp: -1 } }),
  ]

  const result = extractGaitBoardSeries(rows)

  assert.deepEqual(result.boardData, [[], [], [], []])
  assert.deepEqual(result.boardTimes, [[], [], [], []])
  assert.deepEqual(result.rejectedTimestamps, [1, 1, 1, 1])
})
