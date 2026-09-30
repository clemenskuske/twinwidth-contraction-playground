(function (root) {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  // A small deterministic force simulation for the normalized graph coordinates
  // used by the playground. It intentionally has no timers, so a contraction
  // records one stable layout in the session history and undo/redo can restore it.
  function layout(graph, options = {}) {
    const nodes = graph.nodes;
    const count = nodes.length;
    if (count < 2) return graph;

    const iterations = Math.max(1, Math.round(options.iterations ?? (count > 300 ? 26 : 46)));
    const ideal = options.linkLength ?? Math.max(.045, Math.min(.19, Math.sqrt(.64 / count) * 1.5));
    const repulsion = ideal * ideal * .75;
    const springStrength = options.springStrength ?? .16;
    const centreStrength = options.centreStrength ?? .008;
    const edges = Object.keys(graph.edges).map(pair => pair.split(':').map(Number));

    for (let iteration = 0; iteration < iterations; iteration++) {
      const forceX = new Float64Array(count), forceY = new Float64Array(count);

      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          let dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
          let distanceSquared = dx * dx + dy * dy;
          if (distanceSquared < 1e-8) {
            // Stable separation for coincident positions after a contraction.
            const angle = (i + 1) * (j + 3) * 1.618;
            dx = Math.cos(angle) * .001;
            dy = Math.sin(angle) * .001;
            distanceSquared = dx * dx + dy * dy;
          }
          const distance = Math.sqrt(distanceSquared), force = repulsion / distanceSquared;
          const x = dx / distance * force, y = dy / distance * force;
          forceX[i] -= x; forceY[i] -= y;
          forceX[j] += x; forceY[j] += y;
        }
      }

      const index = new Map(nodes.map((node, i) => [node.id, i]));
      for (const [aId, bId] of edges) {
        const i = index.get(aId), j = index.get(bId);
        if (i === undefined || j === undefined) continue;
        let dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
        let distance = Math.hypot(dx, dy);
        if (distance < 1e-5) { dx = .001; dy = 0; distance = .001; }
        const force = (distance - ideal) * springStrength;
        const x = dx / distance * force, y = dy / distance * force;
        forceX[i] += x; forceY[i] += y;
        forceX[j] -= x; forceY[j] -= y;
      }

      const temperature = .035 * (1 - iteration / iterations) + .006;
      for (let i = 0; i < count; i++) {
        forceX[i] += (.5 - nodes[i].x) * centreStrength;
        forceY[i] += (.5 - nodes[i].y) * centreStrength;
        const magnitude = Math.hypot(forceX[i], forceY[i]);
        if (magnitude > temperature) {
          forceX[i] = forceX[i] / magnitude * temperature;
          forceY[i] = forceY[i] / magnitude * temperature;
        }
        nodes[i].x = clamp(nodes[i].x + forceX[i], .035, .965);
        nodes[i].y = clamp(nodes[i].y + forceY[i], .07, .9);
      }
    }
    return graph;
  }

  const api = {layout};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GraphForce = api;
})(typeof window === 'undefined' ? globalThis : window);
