(function (root) {
  'use strict';
  const T = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.TwinWidth;
  const cache = new WeakMap();
  const relationCache = new WeakMap();
  function validateRadius(radius) {
    if (!Number.isSafeInteger(radius) || radius < 1) throw new Error('Radius must be a positive integer.');
    return radius;
  }
  function findPart(graph, id) {
    const part = graph.nodes.find(node => node.id === id);
    if (!part) throw new Error('Choose a current bag.');
    return part;
  }
  // Pairs are always pairs of ORIGINAL vertices, including inside a bag.
  function pairs(a, b) {
    const result = [];
    for (const u of a.members) for (const v of b.members) {
      if (u === v || (a === b && u > v)) continue;
      result.push(T.key(u, v));
    }
    return result;
  }
  function relation(graph, a, b) {
    const state = graph.mergeWidth;
    const unresolved = [], resolvedEdges = [], resolvedNonedges = [];
    let edges = 0, nonedges = 0;
    for (const pair of pairs(a, b)) {
      const adjacent = !!state.originalEdges[pair];
      if (state.resolved[pair]) (adjacent ? resolvedEdges : resolvedNonedges).push(pair);
      else { unresolved.push(pair); if (adjacent) edges++; else nonedges++; }
    }
    return {a: a.id, b: b.id, unresolved, edges, nonedges, resolvedEdges, resolvedNonedges};
  }
  function relations(graph) {
    if (relationCache.has(graph)) return relationCache.get(graph);
    const result = [];
    for (let i = 0; i < graph.nodes.length; i++) for (let j = i; j < graph.nodes.length; j++) {
      result.push(relation(graph, graph.nodes[i], graph.nodes[j]));
    }
    relationCache.set(graph, result);
    return result;
  }
  function refresh(graph) {
    // This quotient is only for the existing drawing/layout. Width never uses it.
    graph.edges = {};
    const owner = new Map();
    for (const part of graph.nodes) for (const v of part.members) owner.set(v, part.id);
    for (const pair of Object.keys(graph.mergeWidth.originalEdges)) {
      if (graph.mergeWidth.resolved[pair]) continue;
      const [a,b] = pair.split(':').map(v => owner.get(Number(v)));
      if (a !== b) graph.edges[T.key(a,b)] = T.BLACK;
    }
    for (const pair of Object.keys(graph.mergeWidth.resolved)) {
      const [a,b] = pair.split(':').map(v => owner.get(Number(v)));
      if (a !== b) graph.edges[T.key(a,b)] = T.RED;
    }
    graph.peak = Math.max(graph.peak || 1, width(graph));
    return graph;
  }
  function initialize(original, radius = 1) {
    validateRadius(radius);
    if (original.nodes.some(n => n.members.length !== 1 || n.members[0] !== n.id) ||
        Object.values(original.edges).some(color => color !== T.BLACK)) {
      throw new Error('Start merge-width from an uncontracted simple graph.');
    }
    const graph = T.clone(original);
    graph.mergeWidth = {vertices: graph.nodes.map(n => n.id), originalEdges: {...graph.edges}, resolved: {}, radius};
    graph.peak = graph.nodes.length ? 1 : 0;
    return graph;
  }
  function mergeProblem(graph, sourceId, targetId) {
    const source = findPart(graph, sourceId), target = findPart(graph, targetId);
    if (sourceId === targetId) throw new Error('Choose two distinct bags.');
    const combined = {...target, members: [...source.members, ...target.members]};
    for (const other of [combined, ...graph.nodes.filter(n => n !== source && n !== target)]) {
      const r = relation(graph, combined, other);
      if (r.edges && r.nonedges) return {members: other.members, internal: other === combined, edges: r.edges, nonedges: r.nonedges};
    }
    return null;
  }
  function merge(graph, sourceId, targetId) {
    if (mergeProblem(graph, sourceId, targetId)) throw new Error('Resolve conflicting edges or non-edges before merging these bags.');
    const next = T.clone(graph), source = findPart(next, sourceId), target = findPart(next, targetId);
    target.members = [...source.members, ...target.members].sort((a, b) => a - b);
    next.nodes = next.nodes.filter(n => n !== source);
    return refresh(next);
  }
  function resolve(graph, aId, bId, type) {
    if (!['edge', 'nonedge'].includes(type)) throw new Error('Choose edge or nonedge resolution.');
    const r = relation(graph, findPart(graph, aId), findPart(graph, bId));
    if (!r.unresolved.length) throw new Error('These bags have no unresolved pairs.');
    if (type === 'edge' ? r.nonedges : r.edges) throw new Error('Resolution must agree with every unresolved pair in the original graph.');
    const next = T.clone(graph);
    for (const pair of r.unresolved) next.mergeWidth.resolved[pair] = true;
    return refresh(next);
  }
  function metrics(graph) {
    const state = graph.mergeWidth;
    if (cache.get(graph)?.radius === state.radius) return cache.get(graph);
    const owner = new Map();
    for (const part of graph.nodes) for (const v of part.members) owner.set(v, part.id);
    if (graph.nodes.length === 1 || !Object.keys(state.resolved).length) {
      const result = {radius: state.radius, maximum: state.vertices.length ? 1 : 0, witness: state.vertices[0],
        counts: Object.fromEntries(state.vertices.map(v => [v, 1])),
        bagCounts: Object.fromEntries(graph.nodes.map(n => [n.id, 1]))};
      cache.set(graph, result); return result;
    }
    const adjacency = new Map(state.vertices.map(v => [v, []]));
    for (const pair of Object.keys(state.resolved)) {
      const [a, b] = pair.split(':').map(Number);
      adjacency.get(a).push(b); adjacency.get(b).push(a);
    }
    const counts = {}, bagCounts = Object.fromEntries(graph.nodes.map(n => [n.id, 0]));
    let maximum = 0, witness = null;
    for (const v of state.vertices) {
      const seen = new Set([v]), reached = new Set([owner.get(v)]);
      let frontier = [v];
      // The starting bag counts. A bag never supplies free paths between members.
      for (let distance = 0; distance < state.radius && frontier.length && reached.size < graph.nodes.length; distance++) {
        const next = [];
        for (const u of frontier) for (const w of adjacency.get(u)) if (!seen.has(w)) {
          seen.add(w); reached.add(owner.get(w)); next.push(w);
        }
        frontier = next;
      }
      counts[v] = reached.size;
      bagCounts[owner.get(v)] = Math.max(bagCounts[owner.get(v)], reached.size);
      if (reached.size > maximum) { maximum = reached.size; witness = v; }
    }
    const result = {radius: state.radius, maximum, witness, counts, bagCounts};
    cache.set(graph, result);
    return result;
  }
  const width = graph => metrics(graph).maximum;
  const complete = graph => graph.nodes.length === 1 && Object.keys(graph.mergeWidth.resolved).length ===
    graph.mergeWidth.vertices.length * (graph.mergeWidth.vertices.length - 1) / 2;

  class Session extends T.Session {
    constructor(kind = 'tree', size = 15, subdivisions = 1, radius = 1) {
      super(kind, size, subdivisions);
      this.setRadius(radius);
    }
    reset(kind, size, subdivisions = 1) {
      super.reset(kind, size, subdivisions);
      this.graph = initialize(this.graph, this.radius || 1);
    }
    resetCandidate(candidate) {
      super.resetCandidate(candidate);
      this.graph = initialize(this.graph, this.radius || 1);
    }
    merge(sourceId, targetId, before = this.graph) {
      const a = findPart(before, sourceId), b = findPart(before, targetId);
      this.commit(merge(this.graph, sourceId, targetId), [a.members.slice(), b.members.slice()], before);
    }
    resolve(aId, bId, type) {
      const a = findPart(this.graph, aId), b = findPart(this.graph, bId);
      this.commit(resolve(this.graph, aId, bId, type), [a.members.slice(), b.members.slice()], this.graph, `resolve-${type}`);
    }
    resolveRemaining(type) {
      if (!['edge', 'nonedge'].includes(type)) throw new Error('Choose edge or nonedge resolution.');
      // Each bag-pair resolution is a separate construction step and undo entry.
      for (const r of relations(this.graph)) if (type === 'edge' ? r.edges && !r.nonedges : r.nonedges && !r.edges) {
        this.resolve(r.a, r.b, type);
      }
    }
    setRadius(radius) {
      this.radius = validateRadius(radius);
      let peak = 0;
      // Re-evaluate the whole active AND redo sequence, preserving its operations.
      for (const graph of [...this.history.map(e => e.graph), this.graph, ...this.future.slice().reverse().map(e => e.graph)]) {
        graph.mergeWidth.radius = radius;
        peak = Math.max(peak, width(graph)); graph.peak = peak;
      }
    }
  }
  const api = {initialize, relation, relations, mergeProblem, merge, resolve, metrics, width, complete, Session};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MergeWidth = api;
})(typeof window === 'undefined' ? globalThis : window);
