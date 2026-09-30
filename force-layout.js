(function (root) {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const defaults = (count, options = {}) => ({
    linkLength: options.linkLength ?? Math.max(.07, Math.min(.18, Math.sqrt(.64 / Math.max(2, count)) * 1.15)),
    repulsion: options.repulsion ?? .0008,
    springStrength: options.springStrength ?? .12,
    centreStrength: options.centreStrength ?? .002,
    damping: options.damping ?? .82,
    stepScale: options.stepScale ?? .8,
    maxSpeed: options.maxSpeed ?? .028,
    stabilityThreshold: options.stabilityThreshold ?? .000025,
    stabilityFrames: options.stabilityFrames ?? 10
  });

  const nodeSignature = graph => graph.nodes.map(node => node.id).join(',');

  function createSimulation(graph, options = {}) {
    const velocities = new Map(graph.nodes.map(node => [node.id, {x: 0, y: 0}]));
    return {
      graph,
      velocities,
      options: defaults(graph.nodes.length, options),
      stableFrames: 0,
      stable: graph.nodes.length < 2,
      signature: nodeSignature(graph)
    };
  }

  function wake(simulation) {
    if (!simulation) return simulation;
    simulation.stableFrames = 0;
    simulation.stable = false;
    return simulation;
  }

  // Advance one damped force-directed step. The state is kept outside the
  // graph so callers can pause and resume without losing momentum.
  function step(simulation, options = {}) {
    const graph = simulation.graph, nodes = graph.nodes, count = nodes.length;
    if (count < 2) { simulation.stable = true; return simulation; }
    simulation.options = {...simulation.options, ...options};
    const config = simulation.options;
    const forceX = new Float64Array(count), forceY = new Float64Array(count);
    const index = new Map(nodes.map((node, i) => [node.id, i]));

    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        let dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
        let distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < 1e-8) {
          // Stable separation for coincident positions after a contraction.
          const angle = (nodes[i].id + 1) * (nodes[j].id + 3) * 1.618;
          dx = Math.cos(angle) * .001;
          dy = Math.sin(angle) * .001;
          distanceSquared = dx * dx + dy * dy;
        }
        const distance = Math.sqrt(distanceSquared), force = config.repulsion / distanceSquared;
        const x = dx / distance * force, y = dy / distance * force;
        forceX[i] -= x; forceY[i] -= y;
        forceX[j] += x; forceY[j] += y;
      }
    }

    for (const pair of Object.keys(graph.edges)) {
      const [aId, bId] = pair.split(':').map(Number);
      const i = index.get(aId), j = index.get(bId);
      if (i === undefined || j === undefined) continue;
      let dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
      let distance = Math.hypot(dx, dy);
      if (distance < 1e-5) { dx = .001; dy = 0; distance = .001; }
      const force = (distance - config.linkLength) * config.springStrength;
      const x = dx / distance * force, y = dy / distance * force;
      forceX[i] += x; forceY[i] += y;
      forceX[j] -= x; forceY[j] -= y;
    }

    let maxMovement = 0;
    for (let i = 0; i < count; i++) {
      const node = nodes[i], velocity = simulation.velocities.get(node.id) || {x: 0, y: 0};
      forceX[i] += (.5 - node.x) * config.centreStrength;
      forceY[i] += (.5 - node.y) * config.centreStrength;
      velocity.x = (velocity.x + forceX[i] * config.stepScale) * config.damping;
      velocity.y = (velocity.y + forceY[i] * config.stepScale) * config.damping;
      const speed = Math.hypot(velocity.x, velocity.y);
      if (speed > config.maxSpeed) {
        velocity.x = velocity.x / speed * config.maxSpeed;
        velocity.y = velocity.y / speed * config.maxSpeed;
      }
      const nextX = clamp(node.x + velocity.x, .035, .965);
      const nextY = clamp(node.y + velocity.y, .07, .9);
      const movement = Math.hypot(nextX - node.x, nextY - node.y);
      node.x = nextX;
      node.y = nextY;
      simulation.velocities.set(node.id, velocity);
      maxMovement = Math.max(maxMovement, movement);
    }

    if (maxMovement <= config.stabilityThreshold) simulation.stableFrames++;
    else simulation.stableFrames = 0;
    simulation.stable = simulation.stableFrames >= config.stabilityFrames;
    return simulation;
  }

  // Keep the original synchronous API for the manual Re-layout button and
  // deterministic tests. Continuous callers use createSimulation + step.
  function layout(graph, options = {}) {
    const iterations = Math.max(1, Math.round(options.iterations ?? (graph.nodes.length > 300 ? 26 : 46)));
    const simulation = createSimulation(graph, options);
    for (let iteration = 0; iteration < iterations; iteration++) step(simulation);
    return graph;
  }

  const api = {layout, createSimulation, step, wake, nodeSignature};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GraphForce = api;
})(typeof window === 'undefined' ? globalThis : window);
