const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./engine.js');
const M = require('./merge-width.js');
const candidate = (n, edges) => ({id: 'test', n, edges: edges.map(([a,b]) => [a-1,b-1])});
const sessionFor = (n, edges, radius = 1) => {
  const s = new M.Session('tree', 3, 1, radius);
  s.resetCandidate(candidate(n, edges)); return s;
};

test('resolve records original pairs, validates type, and counts resolved non-edges', () => {
  const s = sessionFor(3, [[1,2]]), initial = T.clone(s.graph);
  assert.equal(M.width(s.graph), 1);
  assert.throws(() => s.resolve(1,2,'nonedge'), /agree/);
  assert.throws(() => s.resolve(1,2,'invalid'), /Choose/);
  assert.deepEqual(s.graph, initial); assert.equal(s.history.length, 0);
  s.resolve(1,3,'nonedge');
  assert.equal(M.width(s.graph), 2);
  assert.deepEqual(s.graph.mergeWidth.resolved, {'1:3': true});
  assert.throws(() => s.resolve(1,3,'nonedge'), /no unresolved/);
  s.resolve(1,2,'edge');
  assert.equal(s.graph.peak, 3);
  assert.deepEqual(s.graph.mergeWidth.originalEdges, initial.edges);
});

test('merging rejects external and internal conflicts without changing state', () => {
  const s = sessionFor(3, [[1,2],[1,3]]);
  const initial = T.clone(s.graph);
  assert.equal(M.mergeProblem(s.graph, 1,2).internal, false);
  assert.throws(() => s.merge(1,2), /Resolve/);
  assert.deepEqual(s.graph, initial); assert.equal(s.history.length, 0);
  s.merge(2,3);
  assert.equal(M.mergeProblem(s.graph, 1,3).internal, true);
  assert.throws(() => s.merge(1,3), /Resolve/);
  s.resolve(1,3,'edge'); s.merge(1,3);
  assert.equal(M.width(s.graph), 1);
  assert.equal(s.graph.peak, 2, 'resolution width before merging must survive');
  assert.equal(M.complete(s.graph), false, 'one bag alone is not a complete construction');
  s.resolve(3,3,'nonedge'); assert.equal(M.complete(s.graph), true);
  assert.equal(Object.keys(s.graph.mergeWidth.resolved).length, 3);
});

test('radius paths use original vertices, never free passage through a bag', () => {
  const s = sessionFor(6, [[1,2],[3,4],[4,5],[4,6]], 2);
  s.resolveRemaining('edge'); s.merge(2,3);
  const metrics = M.metrics(s.graph);
  assert.equal(metrics.counts[1], 2, '1 cannot jump from member 2 to member 3');
  assert.equal(metrics.counts[4], 4, 'a quotient BFS would incorrectly reach five bags');
  assert.equal(metrics.maximum, 4);
});

test('radius changes recalculate active and redo peaks in chronological order', () => {
  const s = sessionFor(4, [[1,2],[2,3],[3,4]]);
  s.resolveRemaining('edge'); s.merge(1,2);
  const length = s.history.length;
  s.back(); s.back();
  s.setRadius(2);
  assert.equal(s.radius, 2); assert.equal(s.graph.peak, 3);
  s.forward(); assert.equal(s.graph.peak, 4);
  s.forward(); assert.equal(s.graph.peak, 4);
  assert.equal(s.history.length, length);
  s.setRadius(1); assert.equal(s.graph.peak, 3);
  assert.throws(() => s.setRadius(0), /positive/);
  assert.throws(() => s.setRadius(1.5), /positive/);
  assert.equal(s.radius, 1);
  s.reset('clique', 4); assert.equal(s.graph.peak, 1);
});

test('shared history preserves operation types, pre-drag layout, redo, and branching', () => {
  const s = sessionFor(3, [[1,2],[1,3]]);
  const before = T.clone(s.graph); s.graph.nodes[1].x = .91;
  s.merge(2,3,before); s.resolve(1,3,'edge');
  const after = T.clone(s.graph);
  assert.equal(s.history.at(-1).operation, 'resolve-edge');
  s.back(); s.back(); assert.deepEqual(s.graph, before);
  s.forward(); s.forward(); assert.deepEqual(s.graph, after);
  assert.equal(s.history.at(-1).operation, 'resolve-edge');
  s.back(); s.resolve(3,3,'nonedge');
  assert.equal(s.future.length, 0); assert.equal(s.forward(), false);
});

test('cliques can merge first at width one; sparse graphs can resolve edges first', () => {
  const s = new M.Session('clique', 6, 1, 4);
  while (s.graph.nodes.length > 1) s.merge(s.graph.nodes[0].id, s.graph.nodes[1].id);
  s.resolve(s.graph.nodes[0].id,s.graph.nodes[0].id,'edge');
  assert.equal(M.complete(s.graph), true); assert.equal(s.graph.peak, 1);
  for (const kind of ['tree','subdivided','custom','customPath','doubleStar']) {
    s.reset(kind, 5, 2); s.resolveRemaining('edge');
    while (s.graph.nodes.length > 1) s.merge(s.graph.nodes[0].id, s.graph.nodes[1].id);
    s.resolveRemaining('nonedge');
    assert.equal(M.complete(s.graph), true, kind);
    assert.ok(s.history.some(e => e.operation === 'resolve-edge'));
  }
});

test('random constructions agree with independent homogeneity and Floyd-Warshall width', () => {
  let seed = 1234567;
  const random = n => { seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; return (seed >>> 16) % n; };
  for (let trial = 0; trial < 40; trial++) {
    const n = 2 + random(7), edges = [];
    for (let a = 1; a <= n; a++) for (let b = a+1; b <= n; b++) if (random(2)) edges.push([a,b]);
    const s = sessionFor(n, edges, 1 + random(4)), original = new Set(edges.map(([a,b]) => T.key(a,b)));
    let peak = 1;
    const check = () => {
      const g = s.graph, resolved = g.mergeWidth.resolved;
      const distances = Array.from({length:n}, (_,i) => Array.from({length:n}, (_,j) => i === j ? 0 : resolved[T.key(i+1,j+1)] ? 1 : Infinity));
      for (let k=0;k<n;k++) for(let i=0;i<n;i++) for(let j=0;j<n;j++) distances[i][j] = Math.min(distances[i][j], distances[i][k]+distances[k][j]);
      let maximum = 0;
      for(let i=0;i<n;i++) maximum = Math.max(maximum, g.nodes.filter(bag => bag.members.some(v => distances[i][v-1] <= s.radius)).length);
      assert.equal(M.width(g), maximum); peak = Math.max(peak, maximum); assert.equal(g.peak, peak);
      for (const a of g.nodes) for (const b of g.nodes) {
        const types = new Set();
        for (const u of a.members) for (const v of b.members) if(u !== v && !resolved[T.key(u,v)]) types.add(original.has(T.key(u,v)));
        assert.ok(types.size <= 1, 'every unresolved bag pair, including internal pairs, stays homogeneous');
      }
    };
    check();
    for(let step=0;step<60 && !M.complete(s.graph);step++) {
      const bags=s.graph.nodes, i=random(bags.length), j=random(bags.length);
      if(i !== j && !M.mergeProblem(s.graph,bags[i].id,bags[j].id)) s.merge(bags[i].id,bags[j].id);
      else {
        const r=M.relation(s.graph,bags[i],bags[j]);
        if(r.unresolved.length) s.resolve(bags[i].id,bags[j].id,r.edges ? 'edge' : 'nonedge');
      }
      check();
    }
    s.resolveRemaining('edge'); check();
    while(s.graph.nodes.length>1) { s.merge(s.graph.nodes[0].id,s.graph.nodes[1].id); check(); }
    s.resolveRemaining('nonedge'); check(); assert.equal(M.complete(s.graph), true);
  }
});
