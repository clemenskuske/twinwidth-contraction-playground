const {test} = require('node:test');
const assert = require('node:assert/strict');
const T = require('./engine.js');

test('all nine combinations of incidences follow the trigraph rule', () => {
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) {
    const graph = {nodes: [1,2,3].map(id => ({id, members:[id], x:0, y:0})), edges:{}, peak:0};
    if (x) graph.edges['1:3'] = x;
    if (y) graph.edges['2:3'] = y;
    const original = T.clone(graph), result = T.contract(graph, 1, 2);
    assert.equal(T.edge(result,2,3), x === 1 && y === 1 ? 1 : x === 0 && y === 0 ? 0 : 2);
    assert.deepEqual(graph, original, 'contraction must not mutate the input');
    assert.deepEqual(result.nodes.find(n => n.id === 2).members, [1,2]);
    assert.equal(result.nodes.length, 2);
  }
});

test('generators have the expected simple graph structure', () => {
  for (let n = 3; n <= 12; n++) {
    const tree = T.createGraph('tree', n), clique = T.createGraph('clique', n);
    assert.equal(tree.nodes.length, n); assert.equal(Object.keys(tree.edges).length, n - 1);
    assert.equal(Object.keys(clique.edges).length, n * (n - 1) / 2);
  }
  for (let n = 3; n <= 8; n++) {
    const graph = T.createGraph('subdivided', n);
    assert.equal(graph.nodes.length, n + n * (n - 1) / 2);
    assert.equal(Object.keys(graph.edges).length, n * (n - 1));
    for (const node of graph.nodes) {
      const neighbors = graph.nodes.filter(other => T.edge(graph, node.id, other.id));
      assert.equal(neighbors.length, node.id <= n ? n - 1 : 2);
      assert.ok(neighbors.every(other => (node.id <= n) !== (other.id <= n)));
    }
  }
});

test('the given graph preset has the requested labels and edge set', () => {
  const graph = T.createGraph('custom', 11);
  assert.deepEqual(graph.nodes.map(node => graph.labels[node.id]), [...'abcdefghijk']);
  const expected = ['1:3','1:4','1:5','1:11','2:3','3:10','4:9','5:8','5:11','6:11','7:8','7:9','8:10','10:11'];
  assert.deepEqual(Object.keys(graph.edges), expected);
  assert.ok(Object.values(graph.edges).every(color => color === T.BLACK));
});

test('the path variant adds b-l-m-f to the given graph', () => {
  const graph = T.createGraph('customPath', 13);
  assert.deepEqual(graph.nodes.map(node => graph.labels[node.id]), [...'abcdefghijklm']);
  assert.equal(graph.nodes.length, 13);
  assert.equal(Object.keys(graph.edges).length, 17);
  assert.deepEqual(['2:12', '12:13', '6:13'].map(pair => graph.edges[pair]), [T.BLACK, T.BLACK, T.BLACK]);
});

test('cliques remain all black for every contraction', () => {
  const session = new T.Session('clique', 12);
  while (session.graph.nodes.length > 1) {
    session.merge(session.graph.nodes[0].id, session.graph.nodes.at(-1).id);
    assert.equal(session.graph.peak, 0);
    assert.ok(Object.values(session.graph.edges).every(color => color === T.BLACK));
  }
  assert.equal(session.graph.nodes[0].members.length, 12);
});

test('every clique edge becomes a disjoint path with the chosen subdivision count', () => {
  for (const n of [3, 5, 8]) for (const subdivisions of [0, 1, 2, 5, 20]) {
    const graph = T.createGraph('subdivided', n, subdivisions);
    const edgeCount = n * (n - 1) / 2;
    assert.equal(graph.subdivisions, subdivisions);
    assert.equal(graph.nodes.length, n + edgeCount * subdivisions);
    assert.equal(Object.keys(graph.edges).length, edgeCount * (subdivisions + 1));
    const adj = Object.fromEntries(graph.nodes.map(node => [node.id, []]));
    for (const pair of Object.keys(graph.edges)) {
      const [a, b] = pair.split(':').map(Number); adj[a].push(b); adj[b].push(a);
    }
    for (let branch = 1; branch <= n; branch++) {
      assert.equal(adj[branch].length, n - 1);
      const ends = new Set();
      for (const first of adj[branch]) {
        let previous = branch, current = first, internal = 0;
        while (current > n) {
          assert.equal(adj[current].length, 2);
          const next = adj[current].find(v => v !== previous);
          previous = current; current = next; internal++;
          assert.ok(internal <= subdivisions, 'path must end at another branch');
        }
        assert.equal(internal, subdivisions);
        assert.notEqual(current, branch);
        ends.add(current);
      }
      assert.equal(ends.size, n - 1);
    }
  }
});

test('subdivision choice persists through contractions, undo, and redo', () => {
  const session = new T.Session('subdivided', 4, 3);
  assert.equal(session.initialCount, 22);
  session.merge(5, 6);
  for (const graph of [session.graph, session.history[0].graph]) assert.equal(graph.subdivisions, 3);
  session.back(); assert.equal(session.graph.nodes.length, 22);
  session.forward(); assert.equal(session.graph.nodes.length, 21);
  session.reset('subdivided', 4, 0);
  assert.equal(session.graph.nodes.length, 4);
  assert.equal(Object.keys(session.graph.edges).length, 6);
});

test('contractions agree with the independent original-partition definition', () => {
  // Recompute each relation from all pairs in the original graph, independent
  // of the update rule under test. Exercises red propagation over whole sequences.
  let seed = 20260929;
  const rand = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (const kind of ['tree','clique','subdivided']) for (let trial = 0; trial < 30; trial++) {
    const original = T.createGraph(kind, kind === 'tree' ? 15 : kind === 'clique' ? 8 : 6, trial % 4);
    let graph = T.clone(original), peak = 0;
    while (graph.nodes.length > 1) {
      const i = rand(graph.nodes.length), j = (i + 1 + rand(graph.nodes.length - 1)) % graph.nodes.length;
      graph = T.contract(graph, graph.nodes[i].id, graph.nodes[j].id);
      const independentDegrees = {};
      for (const a of graph.nodes) {
        independentDegrees[a.id] = 0;
        for (const b of graph.nodes) {
          if (a === b) continue;
          const incidences = a.members.flatMap(u => b.members.map(v => T.edge(original, u, v)));
          const expected = incidences.every(x => x === 1) ? 1 : incidences.every(x => x === 0) ? 0 : 2;
          assert.equal(T.edge(graph, a.id, b.id), expected);
          if (expected === 2) independentDegrees[a.id]++;
        }
      }
      peak = Math.max(peak, ...Object.values(independentDegrees));
      assert.equal(graph.peak, peak);
      assert.deepEqual(T.degrees(graph), independentDegrees);
    }
  }
});

test('undo restores bags, edges, peak, and pre-drag positions; redo and branching work', () => {
  const session = new T.Session('tree', 7), start = T.clone(session.graph);
  const before = T.clone(session.graph);
  session.graph.nodes[3].x = .91;
  session.merge(4, 6, before);
  assert.equal(session.graph.peak, 2);
  const after = T.clone(session.graph);
  assert.equal(session.back(), true); assert.deepEqual(session.graph, start);
  assert.equal(session.forward(), true); assert.deepEqual(session.graph, after);
  session.merge(2, 3); session.back(); assert.deepEqual(session.graph, after);
  session.back(); assert.deepEqual(session.graph, start);
  assert.equal(session.back(), false);
  session.merge(4, 5);
  assert.equal(session.graph.peak, 0);
  assert.equal(session.future.length, 0);
  assert.equal(session.forward(), false);
});

test('peak survives the final contraction, and resets when undo passes its cause', () => {
  const session = new T.Session('tree', 7);
  session.merge(4, 6);
  while (session.graph.nodes.length > 1) session.merge(session.graph.nodes[0].id, session.graph.nodes[1].id);
  assert.equal(T.maxDegree(session.graph), 0);
  assert.ok(session.graph.peak >= 2);
  while (session.back()) {}
  assert.equal(session.graph.peak, 0);
  assert.equal(session.graph.nodes.length, 7);
});
