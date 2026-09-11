import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAlgoInput } from '../src/lib/csvImport.js';

function frame(value) {
  return JSON.stringify(Array(4096).fill(value));
}

test('gait CSV import preserves sparse asynchronous rows per board', () => {
  const rows = [
    {
      timestamp: '1000',
      foot1_data: frame(1),
      foot2_data: frame(2),
      foot3_data: frame(3),
      foot4_data: frame(4),
    },
    { timestamp: '1020', foot1_data: frame(11) },
    { timestamp: '1024', foot3_data: frame(33) },
    { timestamp: '1040', foot2_data: frame(22) },
    { timestamp: '1044', foot4_data: frame(44) },
  ];

  const result = buildAlgoInput('gait', rows);

  assert.deepEqual(result.board_data.map((series) => JSON.parse(series[0])[0]), [1, 2, 3, 4]);
  assert.deepEqual(result.board_data.map((series) => series.length), [2, 2, 2, 2]);
  assert.deepEqual(result.board_times.map((series) => series.length), [2, 2, 2, 2]);
  assert.equal(JSON.parse(result.board_data[0][1])[0], 11);
  assert.equal(JSON.parse(result.board_data[1][1])[0], 22);
  assert.equal(JSON.parse(result.board_data[2][1])[0], 33);
  assert.equal(JSON.parse(result.board_data[3][1])[0], 44);
});

test('gait CSV import reports a missing board without discarding other boards', () => {
  const rows = [{
    timestamp: '1000',
    foot1_data: frame(1),
    foot2_data: frame(2),
    foot3_data: frame(3),
  }];

  assert.throws(
    () => buildAlgoInput('gait', rows),
    /foot4_data/,
  );
});
