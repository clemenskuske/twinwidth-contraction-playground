const {test} = require('node:test');
const assert = require('node:assert/strict');
const T = require('./engine.js');
const Force = require('./force-layout.js');

test('force layout is deterministic, moves a contracted graph, and stays in bounds', () => {
  const first = T.createGraph('tree', 15);
  const second = T.clone(first);
  const before = first.nodes.map(node => [node.x, node.y]);
  assert.equal(Force.layout(first, {iterations: 30}), first);
  Force.layout(second, {iterations: 30});
  assert.deepEqual(first, second);
  assert.notDeepEqual(first.nodes.map(node => [node.x, node.y]), before);
  for (const node of first.nodes) {
    assert.ok(node.x >= .035 && node.x <= .965);
    assert.ok(node.y >= .07 && node.y <= .9);
  }
});

test('force layout separates coincident positions after a merge', () => {
  const graph = T.contract(T.createGraph('clique', 6), 1, 2);
  const merged = graph.nodes.find(node => node.id === 2);
  for (const node of graph.nodes) { node.x = merged.x; node.y = merged.y; }
  Force.layout(graph, {iterations: 24});
  const positions = graph.nodes.map(node => `${node.x.toFixed(6)}:${node.y.toFixed(6)}`);
  assert.ok(new Set(positions).size > 1);
});

test('continuous force simulation settles and can be woken', () => {
  const graph = T.createGraph('tree', 15), simulation = Force.createSimulation(graph);
  const initial = graph.nodes.map(node => [node.x, node.y]);
  let steps = 0;
  while (!simulation.stable && steps < 1000) { Force.step(simulation); steps++; }
  assert.equal(simulation.stable, true);
  assert.notDeepEqual(graph.nodes.map(node => [node.x, node.y]), initial);
  graph.nodes[0].x = .9;
  Force.wake(simulation); Force.step(simulation);
  assert.equal(simulation.stable, false);
});
