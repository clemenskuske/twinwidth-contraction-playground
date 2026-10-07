(function (root) {
  'use strict';
  const NONE = 0, BLACK = 1, RED = 2;
  const key = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const edge = (graph, a, b) => graph.edges[key(a, b)] || NONE;
  const clone = graph => JSON.parse(JSON.stringify(graph));

  function degrees(graph) {
    const result = Object.fromEntries(graph.nodes.map(n => [n.id, 0]));
    for (const [pair, color] of Object.entries(graph.edges)) {
      if (color !== RED) continue;
      const [a, b] = pair.split(':').map(Number);
      result[a]++; result[b]++;
    }
    return result;
  }
  const maxDegree = graph => Math.max(0, ...Object.values(degrees(graph)));

  // Black + black stays black; absent + absent stays absent.
  // Every other combination is red, including red + red.
  function contract(graph, sourceId, targetId) {
    const source = graph.nodes.find(n => n.id === sourceId);
    const target = graph.nodes.find(n => n.id === targetId);
    if (!source || !target || sourceId === targetId) throw new Error('Choose two distinct vertices.');
    const next = clone(graph);
    next.nodes = next.nodes.filter(n => n.id !== sourceId);
    next.nodes.find(n => n.id === targetId).members = [...source.members, ...target.members].sort((a, b) => a - b);
    next.edges = {};
    for (let i = 0; i < next.nodes.length; i++) {
      for (let j = i + 1; j < next.nodes.length; j++) {
        const a = next.nodes[i].id, b = next.nodes[j].id;
        let color;
        if (a === targetId || b === targetId) {
          const other = a === targetId ? b : a;
          const x = edge(graph, sourceId, other), y = edge(graph, targetId, other);
          color = x === BLACK && y === BLACK ? BLACK : x === NONE && y === NONE ? NONE : RED;
        } else color = edge(graph, a, b);
        if (color) next.edges[key(a, b)] = color;
      }
    }
    next.peak = Math.max(graph.peak || 0, maxDegree(next));
    return next;
  }

  function createGraph(kind, size, subdivisions = 1) {
    const limits = kind === 'tree' ? [3, 31] : kind === 'clique' ? [3, 12] : kind === 'subdivided' ? [3, 8] : kind === 'doubleStar' ? [6, 6] : kind === 'customPath' ? [13, 13] : [11, 11];
    size = Math.max(limits[0], Math.min(limits[1], Math.round(Number(size) || limits[0])));
    subdivisions = Math.max(0, Math.min(20, Math.round(Number(subdivisions) || 0)));
    const graph = {kind, size, subdivisions, nodes: [], edges: {}, peak: 0};
    const add = (x, y, branch = false) => {
      const id = graph.nodes.length + 1;
      graph.nodes.push({id, x, y, members: [id], branch});
      return id;
    };
    const connect = (a, b) => { graph.edges[key(a, b)] = BLACK; };
    if (kind === 'tree') {
      // Lay out the complete binary tree by its leaves; parents sit over their children.
      const x = {}, leaves = [];
      const visit = id => {
        if (2 * id > size) { leaves.push(id); return; }
        visit(2 * id);
        if (2 * id + 1 <= size) visit(2 * id + 1);
      };
      visit(1);
      leaves.forEach((id, i) => { x[id] = (i + 0.5) / leaves.length; });
      for (let id = size; id >= 1; id--) {
        if (x[id] === undefined) x[id] = (x[2 * id] + (x[2 * id + 1] ?? x[2 * id])) / 2;
      }
      const depth = Math.floor(Math.log2(size));
      for (let id = 1; id <= size; id++) {
        add(x[id], .08 + .84 * Math.floor(Math.log2(id)) / depth);
        if (id > 1) connect(Math.floor(id / 2), id);
      }
    } else if (kind === 'doubleStar') {
      [[.35,.5],[.65,.5],[.15,.25],[.85,.25],[.15,.75],[.85,.75]].forEach(([x,y]) => add(x,y));
      for (const [a,b] of [[1,2],[1,3],[2,4],[1,5],[2,6]]) connect(a,b);
    } else if (kind === 'custom' || kind === 'customPath') {
      const labels = kind === 'customPath' ? [...'abcdefghijklm'] : [...'abcdefghijk'];
      const coordinates = [
        [.16, .15], [.07, .40], [.29, .34], [.47, .20], [.68, .25],
        [.88, .42], [.16, .67], [.41, .61], [.65, .69], [.34, .88], [.80, .86]
      ];
      graph.labels = Object.fromEntries(labels.map((label, index) => [index + 1, label]));
      coordinates.forEach(([x, y]) => add(x, y));
      for (const [a, b] of [[1,3],[1,4],[1,5],[1,11],[2,3],[3,10],[4,9],[5,8],[5,11],[6,11],[7,8],[7,9],[8,10],[10,11]]) connect(a, b);
      if (kind === 'customPath') {
        const l = add(.51, .40), m = add(.66, .52);
        connect(2, l); connect(l, m); connect(m, 6);
      }
    } else {
      for (let i = 0; i < size; i++) {
        const angle = -Math.PI / 2 + 2 * Math.PI * i / size;
        add(.5 + .43 * Math.cos(angle), .5 + .43 * Math.sin(angle), kind === 'subdivided');
      }
      for (let a = 1; a <= size; a++) {
        for (let b = a + 1; b <= size; b++) {
          if (kind === 'clique') connect(a, b);
          else {
            const u = graph.nodes[a - 1], v = graph.nodes[b - 1];
            let previous = a;
            for (let s = 1; s <= subdivisions; s++) {
              const t = s / (subdivisions + 1);
              const id = add(u.x + (v.x - u.x) * t, u.y + (v.y - u.y) * t);
              connect(previous, id);
              previous = id;
            }
            connect(previous, b);
          }
        }
      }
    }
    return graph;
  }

  function createCandidateGraph(candidate) {
    const size = Number(candidate.n);
    if (!Number.isInteger(size) || size < 2 || size > 100 || !Array.isArray(candidate.edges)) throw new Error('Invalid candidate graph.');
    const graph = {kind: 'candidate', candidateId: candidate.id, size, subdivisions: 0, nodes: [], edges: {}, peak: 0};
    for (let i = 0; i < size; i++) {
      const angle = -Math.PI / 2 + 2 * Math.PI * i / size;
      graph.nodes.push({id: i + 1, x: .5 + .39 * Math.cos(angle), y: .5 + .39 * Math.sin(angle), members: [i + 1]});
    }
    for (const pair of candidate.edges) {
      if (!Array.isArray(pair) || pair.length !== 2) throw new Error('Invalid candidate edge.');
      const [a, b] = pair.map(Number);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b <= a || b >= size || graph.edges[key(a + 1, b + 1)]) throw new Error('Invalid candidate edge.');
      graph.edges[key(a + 1, b + 1)] = BLACK;
    }
    return graph;
  }

  class Session {
    constructor(kind = 'tree', size = 15, subdivisions = 1) { this.reset(kind, size, subdivisions); }
    reset(kind, size, subdivisions = 1) {
      this.graph = createGraph(kind, size, subdivisions);
      this.initialCount = this.graph.nodes.length;
      this.history = []; this.future = [];
    }
    resetCandidate(candidate) {
      this.graph = createCandidateGraph(candidate);
      this.initialCount = this.graph.nodes.length;
      this.history = []; this.future = [];
    }
    merge(sourceId, targetId, before = this.graph) {
      const source = before.nodes.find(n => n.id === sourceId);
      const target = before.nodes.find(n => n.id === targetId);
      const next = contract(this.graph, sourceId, targetId);
      this.commit(next, [source.members.slice(), target.members.slice()], before);
    }
    // Shared by contractions and merge-width resolve/merge operations.
    commit(next, pair, before = this.graph, operation = 'merge') {
      this.history.push({graph: clone(before), pair, operation});
      this.future = []; this.graph = next;
    }
    back() {
      const entry = this.history.pop();
      if (!entry) return false;
      this.future.push({...entry, graph: clone(this.graph)});
      this.graph = entry.graph; return true;
    }
    forward() {
      const entry = this.future.pop();
      if (!entry) return false;
      this.history.push({...entry, graph: clone(this.graph)});
      this.graph = entry.graph; return true;
    }
  }
  const api = {NONE, BLACK, RED, key, edge, clone, degrees, maxDegree, contract, createGraph, createCandidateGraph, Session};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TwinWidth = api;
})(typeof window === 'undefined' ? globalThis : window);
