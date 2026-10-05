const {test} = require('node:test');
const assert = require('node:assert/strict');
const {compare} = require('./catalogue.js');

test('default ordering prefers a larger gap, then a smaller ordinary width', () => {
  const rows = [
    {id:'G003', gap:1, ordinaryWidth:2, localWidth:3, n:10, m:15},
    {id:'G002', gap:2, ordinaryWidth:3, localWidth:5, n:10, m:15},
    {id:'G001', gap:2, ordinaryWidth:2, localWidth:4, n:10, m:15}
  ];
  assert.deepEqual(rows.sort((a, b) => compare(a, b)).map(row => row.id), ['G001', 'G002', 'G003']);
});

test('distance and local-width options sort by their selected measure', () => {
  const rows = [
    {id:'G001', gap:1, ordinaryWidth:2, localWidth:3, n:10, m:15, diameter:4, maxMergeDistance:5},
    {id:'G002', gap:1, ordinaryWidth:3, localWidth:4, n:10, m:15, diameter:7, maxMergeDistance:3}
  ];
  assert.equal([...rows].sort((a, b) => compare(a, b, 'diameter-desc'))[0].id, 'G002');
  assert.equal([...rows].sort((a, b) => compare(a, b, 'merge-desc'))[0].id, 'G001');
  assert.equal([...rows].sort((a, b) => compare(a, b, 'local-desc'))[0].id, 'G002');
});

test('structure and late-merge options use the selected numeric measure', () => {
  const rows = [
    {id:'G001', gap:1, ordinaryWidth:2, n:10, m:13, structure:{coreOrder:8, longestPendantDepth:1}, remoteMerges:[{step:2}]},
    {id:'G002', gap:1, ordinaryWidth:2, n:12, m:15, structure:{coreOrder:6, longestPendantDepth:5}, remoteMerges:[{step:8}]}
  ];
  assert.equal([...rows].sort((a,b) => compare(a,b,'core-desc'))[0].id, 'G001');
  assert.equal([...rows].sort((a,b) => compare(a,b,'depth-desc'))[0].id, 'G002');
  assert.equal([...rows].sort((a,b) => compare(a,b,'remote-late'))[0].id, 'G002');
});
