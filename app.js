(() => {
  'use strict';
  const T = window.TwinWidth;
  const session = new T.Session('tree', 15);
  const $ = id => document.getElementById(id);
  const svg = $('graph'), area = $('graph-area');
  const view = new window.GraphViewport();
  const sizes = {tree: 15, clique: 6, subdivided: 5, custom: 11, customPath: 13};
  const names = {tree: 'Binary tree', clique: 'Clique', subdivided: 'Subdivided clique', custom: 'Given graph', customPath: 'Given graph with b–f path'};
  const limits = {tree: [3, 31], clique: [3, 12], subdivided: [3, 8], custom: [11, 11], customPath: [13, 13]};
  const query = new URLSearchParams(window.location.search);
  let selection = [], drag = null, hover = null, subdivisions = 1, previewCache = null, previewLocked = false;
  let forceLayoutEnabled = $('force-layout').checked;
  let forceSimulation = null, forceFrame = 0;
  let pan = null, pinch = null;
  const pointers = new Map();
  let lastClick = null, ignoreClick = false;
  let drawFrame = 0;
  let width = 800, height = 520, radius = 22;
  const announce = text => { $('announcement').textContent = text; };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const queryValue = (...keys) => keys.map(key => query.get(key)).find(value => value !== null);
  const parseBoolean = (value, fallback) => {
    if (value === undefined) return fallback;
    return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLowerCase());
  };
  const normalizeKind = value => ({
    tree: 'tree', 'binary-tree': 'tree',
    clique: 'clique',
    subdivided: 'subdivided', 'subdivided-clique': 'subdivided',
    custom: 'custom', given: 'custom',
    custompath: 'customPath', path: 'customPath', 'custom-path': 'customPath', 'given-path': 'customPath'
  }[String(value || '').trim().toLowerCase()] || 'tree');
  const numericQuery = (value, fallback, min, max) => {
    const number = Number(value);
    return Number.isFinite(number) ? clamp(Math.round(number), min, max) : fallback;
  };
  const initialUrlConfig = (() => {
    const kind = normalizeKind(queryValue('graph', 'kind'));
    const [min, max] = limits[kind];
    return {
      kind,
      size: numericQuery(queryValue('vertices', 'size', 'order'), sizes[kind], min, max),
      subdivisions: numericQuery(queryValue('subdivisions', 'subdivision', 'subdivisionsPerEdge'), 1, 0, 20),
      relayout: parseBoolean(queryValue('relayout', 'forceLayout', 'force-layout', 'force'), true),
      sequence: queryValue('sequence', 'contractions') || ''
    };
  })();
  const memberLabel = id => session.graph.labels?.[id] || String(id);
  const memberLabels = members => members.map(memberLabel);
  const membersText = members => { const labels = memberLabels(members); return labels.length <= 3 ? labels.join(', ') : `${labels[0]}, … (${labels.length} vertices)`; };
  const shortBag = members => { const labels = memberLabels(members); return labels.length === 1 ? labels[0] : `{${labels.length <= 2 ? labels.join(',') : `${labels[0]},…`}}`; };
  const nodeName = node => node.members.length === 1 ? `Vertex ${memberLabel(node.members[0])}` : `Bag containing vertices ${membersText(node.members)}`;
  const margin = () => width < 500 ? 25 : 48;
  const screen = node => ({x: margin() + node.x * (width - margin() * 2), y: 32 + node.y * (height - 120)});
  const logical = point => ({x: (point.x - margin()) / (width - margin() * 2), y: (point.y - 32) / (height - 120)});
  const position = event => {
    const rect = svg.getBoundingClientRect();
    return {x: event.clientX - rect.left, y: event.clientY - rect.top};
  };
  const selectedPair = () => selection.length === 2 ? selection : null;
  function measure() {
    width = area.clientWidth; height = area.clientHeight;
    radius = width < 500 ? 15 : 22;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }
  function separateInitialNodes() {
    // Resolve obvious collisions before the live simulation begins.
    const nodes = session.graph.nodes, minimum = 2 * radius + 10;
    // Dense graphs get a larger drawing, which is then fitted into the view.
    // This leaves space to inspect the subdivision paths by zooming in.
    const spread = Math.max(1, Math.sqrt(nodes.length / 35));
    const points = nodes.map(n => {
      const p = screen(n);
      return {x: width / 2 + (p.x - width / 2) * spread, y: height / 2 + (p.y - height / 2) * spread};
    });
    for (let iteration = 0; iteration < 100; iteration++) {
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = points[i], b = points[j];
        let dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
        if (distance >= minimum) continue;
        if (distance < .01) { dx = Math.cos(j * 2.4); dy = Math.sin(j * 2.4); distance = 1; }
        // A small vertical offset keeps rows of leaves from forming a rigid line.
        if (Math.abs(dy) < .1) dy = (j % 2 ? 1 : -1) * minimum * .35;
        const direction = Math.hypot(dx, dy), shift = (minimum - distance) * .52;
        a.x -= dx / direction * shift; a.y -= dy / direction * shift;
        b.x += dx / direction * shift; b.y += dy / direction * shift;
      }
    }
    nodes.forEach((node, i) => Object.assign(node, logical(points[i])));
  }
  function updateView() {
    $('graph-viewport').setAttribute('transform', view.transform);
    $('zoom-level').textContent = `${Math.round(view.scale * 100)}%`;
    $('zoom-in').disabled = view.scale >= 8;
    $('zoom-out').disabled = view.scale <= .1;
    area.style.backgroundSize = `${22 * view.scale}px ${22 * view.scale}px`;
    area.style.backgroundPosition = `${view.x}px ${view.y}px`;
  }
  function fitView() {
    cancelInteractions();
    view.fit(session.graph.nodes.map(screen), width, height, radius);
    updateView();
  }
  function zoomBy(factor, anchor = {x: width / 2, y: height / 2}) {
    view.zoomAt(factor, anchor); updateView();
  }
  function stopForceLayout() {
    if (forceFrame) cancelAnimationFrame(forceFrame);
    forceFrame = 0;
  }
  function ensureForceSimulation() {
    if (!forceLayoutEnabled || session.graph.nodes.length < 2) return null;
    if (!forceSimulation || forceSimulation.graph !== session.graph) forceSimulation = window.GraphForce.createSimulation(session.graph);
    return forceSimulation;
  }
  function scheduleForceLayout() {
    if (!forceLayoutEnabled || forceFrame || drag || pan || pinch || pointers.size || session.graph.nodes.length < 2) return;
    if (!ensureForceSimulation()) return;
    forceFrame = requestAnimationFrame(runForceLayoutFrame);
  }
  function runForceLayoutFrame() {
    forceFrame = 0;
    if (!forceLayoutEnabled || drag || pan || pinch || pointers.size) return;
    const simulation = ensureForceSimulation();
    if (!simulation) return;
    window.GraphForce.step(simulation);
    previewCache = null;
    draw();
    if (!simulation.stable) scheduleForceLayout();
  }
  function wakeForceLayout() {
    const simulation = ensureForceSimulation();
    if (!simulation) { stopForceLayout(); return; }
    window.GraphForce.wake(simulation);
    scheduleForceLayout();
  }
  function resumeForceLayout() {
    if (forceLayoutEnabled) scheduleForceLayout();
  }
  function relayoutGraph() {
    stopForceLayout();
    cancelInteractions();
    window.GraphForce.layout(session.graph);
    forceSimulation = forceLayoutEnabled ? window.GraphForce.createSimulation(session.graph) : null;
    previewCache = null;
    render();
    announce('Re-laid out the current graph with forces.');
    scheduleForceLayout();
  }
  function scheduleDraw() {
    if (drawFrame) return;
    drawFrame = requestAnimationFrame(() => { drawFrame = 0; draw(); });
  }
  function targetAtPoint(point, sourceId) {
    let closest = null, nearest = radius * view.scale + 10;
    for (const node of session.graph.nodes) {
      if (node.id === sourceId) continue;
      const target = view.project(screen(node));
      const distance = Math.hypot(target.x - point.x, target.y - point.y);
      if (distance < nearest) { nearest = distance; closest = node.id; }
    }
    return closest;
  }
  function previewPair() {
    if (previewLocked) return selectedPair();
    return drag?.moved ? (hover === null ? null : [drag.id, hover]) : selectedPair();
  }
  function previewGraph() {
    const pair = previewPair();
    if (!pair) { previewCache = null; return null; }
    if (previewCache?.graph !== session.graph || previewCache.a !== pair[0] || previewCache.b !== pair[1]) {
      previewCache = {graph: session.graph, a: pair[0], b: pair[1], result: T.contract(session.graph, ...pair)};
    }
    return previewCache.result;
  }
  function nodeMarkup(node, redDegrees, options = {}) {
    const p = screen(node), red = redDegrees[node.id] || 0;
    const classes = ['vertex', node.members.length > 1 ? 'merged' : '', node.branch ? 'branch' : '', selection.includes(node.id) ? 'selected' : '', options.target ? 'target' : '', options.dragging ? 'dragging' : ''].filter(Boolean).join(' ');
    const bagSize = node.members.length;
    const labels = memberLabels(node.members), label = bagSize === 2 ? labels.join(',') : labels[0];
    const description = `${nodeName(node)}. Red degree ${red}. ${bagSize > 1 ? `${bagSize} original vertices. ` : ''}Select to prepare a contraction.`;
    return `<g class="${classes}" data-node="${node.id}" role="button" tabindex="0" aria-pressed="${selection.includes(node.id)}" aria-label="${description}" transform="translate(${p.x},${p.y})"><title>${description}</title><circle class="selection-ring" r="${radius + 5}"/><circle class="node-disc" r="${radius}"/><text style="font-size:${bagSize === 2 ? Math.min(11, radius * .62) : Math.min(13, radius * .8)}px">${label}</text>${red ? `<g class="red-badge" transform="translate(${radius * .81},${-radius * .83})"><circle r="9"/><text>${red}</text></g>` : ''}${bagSize > 2 ? `<g class="bag-badge" transform="translate(0,${radius + 12})"><text>×${bagSize}</text></g>` : ''}</g>`;
  }
  function draw() {
    const preview = previewGraph(), visibleGraph = preview || session.graph;
    const redDegrees = T.degrees(visibleGraph);
    const nodeMap = new Map(visibleGraph.nodes.map(n => [n.id, n]));
    $('edges').innerHTML = Object.entries(visibleGraph.edges).map(([pair, color]) => {
      const [a, b] = pair.split(':').map(Number), u = screen(nodeMap.get(a)), v = screen(nodeMap.get(b));
      return `<line class="edge${color === T.RED ? ' red' : ''}" x1="${u.x}" y1="${u.y}" x2="${v.x}" y2="${v.y}"/>`;
    }).join('');
    const pair = previewPair();
    $('nodes').innerHTML = visibleGraph.nodes.filter(n => !drag?.moved || n.id !== drag.id).map(n => nodeMarkup(n, redDegrees, {target: pair && n.id === pair[1]})).join('');
    if (drag?.moved) {
      const source = session.graph.nodes.find(n => n.id === drag.id);
      $('nodes').insertAdjacentHTML('beforeend', nodeMarkup(source, {}, {dragging: true}));
    }
    updatePreview(preview, pair);
    updateView();
  }
  function updatePreview(preview, pair) {
    const panel = $('preview-panel'), message = $('canvas-message');
    panel.classList.toggle('active', !!preview);
    panel.classList.toggle('locked', !!preview && previewLocked);
    $('preview-values').hidden = !preview;
    $('merge-selected').hidden = !preview || !!drag;
    message.className = 'canvas-message';
    if (preview) {
      const a = session.graph.nodes.find(n => n.id === pair[0]), b = session.graph.nodes.find(n => n.id === pair[1]);
      $('preview-heading').textContent = previewLocked ? 'LOCKED CONTRACTION PREVIEW' : 'CONTRACTION PREVIEW';
      $('preview-copy').textContent = `${shortBag(a.members)} + ${shortBag(b.members)} · width ${session.graph.peak} → ${preview.peak}${previewLocked ? ' · double-click a vertex to change the pair' : ' · double-click either vertex to keep this preview'}`;
      $('preview-degree').textContent = T.maxDegree(preview);
      message.classList.add('previewing');
      message.textContent = drag ? `Release to merge · max. red degree ${T.maxDegree(preview)}` : previewLocked ? 'Preview locked · choose Merge to apply' : 'Preview shown · double-click either vertex to lock it';
    } else if (session.graph.nodes.length === 1) {
      $('preview-heading').textContent = 'SEQUENCE COMPLETE';
      $('preview-copy').textContent = `You found a sequence of width ${session.graph.peak}. Go back to explore another choice.`;
      message.classList.add('complete');
      message.textContent = `Decomposition complete · width ${session.graph.peak}`;
    } else {
      $('preview-heading').textContent = selection.length === 1 ? 'ONE VERTEX SELECTED' : 'TRY A CONTRACTION';
      $('preview-copy').textContent = selection.length === 1 ? `${nodeName(session.graph.nodes.find(n => n.id === selection[0]))}. Select a second vertex to preview a merge.` : 'Move any two vertices together. They don’t need to share an edge.';
      if (drag?.moved) message.textContent = 'Move over another vertex to preview a merge';
      else if (selection.length === 1) message.textContent = 'Select another vertex to preview · Esc to cancel';
      else message.innerHTML = '<span class="gesture" aria-hidden="true">○ → ○</span><span>Drag a vertex onto another to merge</span>';
    }
  }
  function render() {
    const g = session.graph, steps = session.history.length;
    $('graph-title').textContent = names[g.kind].toUpperCase();
    $('graph-meta').textContent = `${g.nodes.length} ${g.nodes.length === 1 ? 'vertex' : 'vertices'} · ${Object.keys(g.edges).length} edges`;
    $('step-count').textContent = `${steps} / ${session.initialCount - 1}`;
    const progress = document.querySelector('.progress-track');
    progress.setAttribute('aria-valuemax', session.initialCount - 1);
    progress.setAttribute('aria-valuenow', steps);
    $('progress-fill').style.width = `${steps / (session.initialCount - 1) * 100}%`;
    $('peak-degree').textContent = g.peak;
    $('current-degree').textContent = T.maxDegree(g);
    $('back').disabled = !steps;
    $('canvas-back').disabled = !steps;
    $('forward').disabled = !session.future.length;
    $('empty-history').hidden = !!steps;
    $('history-list').innerHTML = session.history.map((entry, i) => {
      const after = i === steps - 1 ? g : session.history[i + 1].graph;
      return `<li title="Merge ${shortBag(entry.pair[0])} and ${shortBag(entry.pair[1])}"><span class="step-index">${String(i + 1).padStart(2, '0')}</span><span class="pair">${shortBag(entry.pair[0])} + ${shortBag(entry.pair[1])}</span><span class="step-width">Δr ${T.maxDegree(after)}</span></li>`;
    }).reverse().join('');
    $('width-note').textContent = g.nodes.length === 1 ? `This sequence proves twin-width ≤ ${g.peak}.` : 'A completed sequence gives an upper bound on twin-width.';
    draw();
  }
  function selectNode(id) {
    if (session.graph.nodes.length < 2) return;
    previewLocked = false;
    if (selection.includes(id)) selection = selection.filter(n => n !== id);
    else selection = selection.length < 2 ? [...selection, id] : [id];
    draw();
    svg.querySelector(`[data-node="${id}"]`)?.focus({preventScroll: true});
    const preview = previewGraph();
    if (preview) announce(`Contraction preview. Maximum red degree ${T.maxDegree(preview)}; width ${preview.peak}. Use Merge selected vertices to apply.`);
  }
  function lockPreview(id, suppressFollowingClick = false) {
    const pair = selection.length === 2 ? selection : selection.length === 1 && selection[0] !== id ? [selection[0], id] : null;
    if (!pair) return false;
    selection = pair; previewLocked = true; hover = null; previewCache = null;
    lastClick = null; ignoreClick = suppressFollowingClick;
    render();
    const a = session.graph.nodes.find(n => n.id === pair[0]), b = session.graph.nodes.find(n => n.id === pair[1]);
    announce(`Contraction preview locked for ${membersText(a.members)} and ${membersText(b.members)}. Choose Merge selected vertices when ready.`);
    return true;
  }
  function finishMerge(a, b, before) {
    const source = session.graph.nodes.find(n => n.id === a), target = session.graph.nodes.find(n => n.id === b);
    session.merge(a, b, before);
    forceSimulation = null;
    selection = []; hover = null; previewLocked = false;
    render();
    wakeForceLayout();
    announce(`Merged ${membersText(source.members)} and ${membersText(target.members)}. ${session.graph.nodes.length} ${session.graph.nodes.length === 1 ? 'vertex remains' : 'vertices remain'}. Maximum red degree ${T.maxDegree(session.graph)}. Width so far ${session.graph.peak}.`);
  }
  function cancelDrag() {
    if (!drag) return;
    const pointerId = drag.pointerId, before = drag.before;
    drag = null; hover = null;
    session.graph = before;
    if (svg.hasPointerCapture(pointerId)) svg.releasePointerCapture(pointerId);
    render();
  }
  function cancelInteractions(restoreView = false) {
    const ids = [...pointers.keys()];
    pointers.clear();
    if (restoreView && (pinch || pan)) {
      const previous = pinch?.before || pan.before;
      Object.assign(view, previous);
    }
    pan = null; pinch = null; svg.classList.remove('panning');
    cancelDrag();
    for (const id of ids) if (svg.hasPointerCapture(id)) svg.releasePointerCapture(id);
    updateView();
  }
  function goBack() {
    cancelInteractions();
    if (!session.back()) return;
    forceSimulation = null;
    selection = []; previewLocked = false; render(); wakeForceLayout();
    announce(`Undid contraction. ${session.graph.nodes.length} vertices remain. Width so far ${session.graph.peak}.`);
  }
  function goForward() {
    cancelInteractions();
    if (!session.forward()) return;
    forceSimulation = null;
    selection = []; previewLocked = false; render(); wakeForceLayout(); announce('Contraction restored.');
  }
  function sequenceParts(specification) {
    return String(specification).split(/[;,]/).map(part => part.trim()).filter(Boolean).map(part => {
      const values = part.split(/\s*(?:-|:|\+|\s+)\s*/).filter(Boolean);
      return {raw: part, values};
    });
  }
  function sequenceNode(value) {
    const text = String(value).trim();
    const labels = session.graph.labels || {};
    const labelled = Object.entries(labels).find(([, label]) => String(label).toLowerCase() === text.toLowerCase());
    const originalId = labelled ? Number(labelled[0]) : /^\d+$/.test(text) ? Number(text) : NaN;
    return Number.isInteger(originalId) ? session.graph.nodes.find(node => node.members.includes(originalId)) : null;
  }
  function applyInitialSequence(specification) {
    let applied = 0, error = '';
    for (const part of sequenceParts(specification)) {
      if (part.values.length !== 2) { error = `Could not read “${part.raw}”; use pairs such as 1-2 or a-b.`; break; }
      const source = sequenceNode(part.values[0]), target = sequenceNode(part.values[1]);
      if (!source || !target) { error = `Could not find both vertices in “${part.raw}”.`; break; }
      if (source.id === target.id) { error = `“${part.raw}” refers to the same current bag twice.`; break; }
      session.merge(source.id, target.id);
      applied++;
    }
    return {applied, error};
  }
  function start(kind, options = {}) {
    stopForceLayout();
    forceSimulation = null;
    cancelInteractions(); selection = []; hover = null; previewCache = null; previewLocked = false; lastClick = null; ignoreClick = false;
    session.reset(kind, sizes[kind], subdivisions);
    measure(); separateInitialNodes();
    view.fit(session.graph.nodes.map(screen), width, height, radius);
    const max = kind === 'tree' ? 31 : kind === 'clique' ? 12 : kind === 'subdivided' ? 8 : kind === 'customPath' ? 13 : 11;
    $('graph-size').value = sizes[kind]; $('graph-size').max = max; $('graph-size').disabled = kind === 'custom' || kind === 'customPath';
    $('size-label').textContent = kind === 'subdivided' ? 'Clique order' : 'Vertices';
    $('size-range').textContent = kind === 'custom' ? 'The given graph has 11 vertices labelled a through k.' : kind === 'customPath' ? 'The given graph plus a four-vertex b–f path; vertices are labelled a through m.' : `Between 3 and ${max}. Changing this starts a new graph.`;
    $('subdivisions-control').hidden = kind !== 'subdivided';
    $('subdivisions').value = subdivisions;
    document.querySelectorAll('[data-kind]').forEach(button => button.setAttribute('aria-pressed', button.dataset.kind === kind));
    $('family-description').textContent = kind === 'tree' ? `A binary tree on ${sizes[kind]} vertices.` : kind === 'clique' ? `K${sizes[kind]} · every pair of vertices is adjacent.` : kind === 'subdivided' ? `K${sizes[kind]} · ${subdivisions} new ${subdivisions === 1 ? 'vertex' : 'vertices'} per edge · ${subdivisions + 1} edges per path · ${session.initialCount} vertices total.` : kind === 'customPath' ? 'The specified graph plus the path b–l–m–f.' : 'The specified graph on vertices a through k.';
    render();
    if (!options.sequence) {
      wakeForceLayout();
      announce(`Started ${names[kind].toLowerCase()} with ${session.initialCount} vertices.`);
      return;
    }
    const result = applyInitialSequence(options.sequence);
    render();
    wakeForceLayout();
    const suffix = result.error ? ` ${result.error}` : '';
    announce(result.applied ? `Loaded ${result.applied} initial contraction${result.applied === 1 ? '' : 's'}.${suffix}` : `Started ${names[kind].toLowerCase()} with no initial contractions.${suffix}`);
  }

  svg.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointers.size >= 2) return;
    event.preventDefault();
    stopForceLayout();
    const p = position(event);
    pointers.set(event.pointerId, p);
    svg.setPointerCapture(event.pointerId);
    if (pointers.size === 2) {
      cancelDrag(); pan = null;
      const [a, b] = [...pointers.values()];
      const midpoint = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
      pinch = {distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), anchor: view.unproject(midpoint), before: {x: view.x, y: view.y, scale: view.scale}};
      for (const id of pointers.keys()) svg.setPointerCapture(id);
      svg.classList.add('panning');
      return;
    }
    const element = event.target.closest('[data-node]');
    if (!element) {
      pan = {id: event.pointerId, start: p, before: {x: view.x, y: view.y, scale: view.scale}};
      svg.classList.add('panning'); svg.focus({preventScroll: true});
      return;
    }
    const id = Number(element.dataset.node), node = session.graph.nodes.find(n => n.id === id);
    if (!node) return;
    const center = view.project(screen(node));
    drag = {id, pointerId: event.pointerId, start: p, lastPoint: p, offset: {x: center.x - p.x, y: center.y - p.y}, before: T.clone(session.graph), moved: false};
  });
  svg.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const p = position(event);
    pointers.set(event.pointerId, p);
    if (pinch) {
      const [a, b] = [...pointers.values()];
      if (!b) return;
      view.scale = Math.max(.1, Math.min(8, pinch.before.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance));
      view.x = (a.x + b.x) / 2 - pinch.anchor.x * view.scale;
      view.y = (a.y + b.y) / 2 - pinch.anchor.y * view.scale;
      updateView(); return;
    }
    if (pan?.id === event.pointerId) {
      view.x = pan.before.x + p.x - pan.start.x;
      view.y = pan.before.y + p.y - pan.start.y;
      updateView(); return;
    }
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.lastPoint = p;
    if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < 5) return;
    drag.moved = true; selection = [];
    const center = {x: Math.max(0, Math.min(width, p.x + drag.offset.x)), y: Math.max(0, Math.min(height - 60, p.y + drag.offset.y))};
    Object.assign(session.graph.nodes.find(n => n.id === drag.id), logical(view.unproject(center)));
    hover = targetAtPoint(center, drag.id);
    scheduleDraw();
  });
  svg.addEventListener('pointerup', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (pinch) {
      pinch = null;
      const remaining = [...pointers.entries()][0];
      if (remaining) pan = {id: remaining[0], start: remaining[1], before: {x: view.x, y: view.y, scale: view.scale}};
      else svg.classList.remove('panning');
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
      if (!remaining) resumeForceLayout();
      return;
    }
    if (pan?.id === event.pointerId) {
      pan = null; svg.classList.remove('panning');
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
      resumeForceLayout();
      return;
    }
    if (!drag || event.pointerId !== drag.pointerId) return;
    const completed = drag;
    const releasePoint = position(event);
    // The final pointermove can still be queued when pointerup arrives. Hit-test
    // the release point again so a visible target cannot be lost to event lag.
    const target = targetAtPoint(releasePoint, completed.id);
    drag = null; hover = null;
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    if (!completed.moved) {
      if (ignoreClick) { ignoreClick = false; resumeForceLayout(); return; }
      const now = performance.now(), doubleClick = event.detail === 2 || (lastClick?.id === completed.id && now - lastClick.time < 500);
      if (doubleClick && lockPreview(completed.id, true)) { resumeForceLayout(); return; }
      lastClick = {id: completed.id, time: now};
      selectNode(completed.id); resumeForceLayout(); return;
    }
    lastClick = null;
    if (target !== null) finishMerge(completed.id, target, completed.before);
    else { draw(); announce('Vertex moved. No contraction made.'); wakeForceLayout(); }
  });
  svg.addEventListener('dblclick', event => {
    const element = event.target.closest('[data-node]');
    if (drag?.moved) return;
    event.preventDefault();
    const id = element ? Number(element.dataset.node) : targetAtPoint(position(event), null);
    if (id !== null) lockPreview(id);
  });
  svg.addEventListener('pointercancel', event => {
    if (!pointers.has(event.pointerId)) return;
    // Some browsers cancel a captured pointer during a slow redraw. If the
    // pointer was already over a valid target, honor that intended drop.
    if (drag?.pointerId === event.pointerId && drag.moved) {
      const completed = drag, target = targetAtPoint(position(event), drag.id) ?? hover;
      if (target !== null) {
        pointers.delete(event.pointerId); drag = null; hover = null;
        finishMerge(completed.id, target, completed.before);
        return;
      }
    }
    cancelInteractions(true); resumeForceLayout();
  });
  // Losing capture is not itself a cancellation: it is commonly delivered as
  // part of a normal pointerup sequence. pointercancel handles true aborts.
  svg.addEventListener('lostpointercapture', () => {});
  svg.addEventListener('wheel', event => {
    event.preventDefault();
    if (pointers.size) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
    zoomBy(Math.exp(-Math.max(-500, Math.min(500, event.deltaY * unit)) * (event.ctrlKey ? .008 : .002)), position(event));
  }, {passive: false});
  svg.addEventListener('keydown', event => {
    if (!event.ctrlKey && !event.metaKey && ['+', '=', '-', '0'].includes(event.key)) {
      event.preventDefault();
      if (event.key === '0') fitView(); else zoomBy(event.key === '-' ? 1 / 1.25 : 1.25);
      return;
    }
    const element = event.target.closest('[data-node]');
    if (element && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectNode(Number(element.dataset.node)); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { cancelInteractions(true); selection = []; previewLocked = false; draw(); resumeForceLayout(); return; }
    if (event.target.matches('input, textarea, select') || event.target.isContentEditable) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? goForward() : goBack(); }
    else if (event.key === 'Backspace') { event.preventDefault(); goBack(); }
  });
  $('back').addEventListener('click', goBack);
  $('canvas-back').addEventListener('click', goBack);
  $('forward').addEventListener('click', goForward);
  $('zoom-in').addEventListener('click', () => zoomBy(1.25));
  $('zoom-out').addEventListener('click', () => zoomBy(1 / 1.25));
  $('fit-view').addEventListener('click', fitView);
  $('relayout').addEventListener('click', relayoutGraph);
  $('merge-selected').addEventListener('click', () => { const pair = selectedPair(); if (pair) finishMerge(...pair); });
  $('force-layout').addEventListener('change', event => {
    forceLayoutEnabled = event.target.checked;
    if (forceLayoutEnabled) { forceSimulation = null; wakeForceLayout(); }
    else { stopForceLayout(); forceSimulation = null; }
    announce(forceLayoutEnabled ? 'Live force layout enabled; the graph will settle automatically.' : 'Live force layout paused; the current positions are preserved.');
  });
  $('reset').addEventListener('click', () => start(session.graph.kind));
  document.querySelectorAll('[data-kind]').forEach(button => button.addEventListener('click', () => { if (button.dataset.kind !== session.graph.kind) start(button.dataset.kind); }));
  function applySize() {
    const input = $('graph-size');
    if (!input.value || !input.checkValidity()) { input.reportValidity(); input.value = sizes[session.graph.kind]; return; }
    if (Number(input.value) === sizes[session.graph.kind]) return;
    sizes[session.graph.kind] = Number(input.value); start(session.graph.kind);
  }
  $('graph-size').addEventListener('change', applySize);
  $('graph-size').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); applySize(); } });
  function applySubdivisions() {
    const input = $('subdivisions');
    if (!input.value || !input.checkValidity()) { input.reportValidity(); input.value = subdivisions; return; }
    if (Number(input.value) === subdivisions) return;
    subdivisions = Number(input.value); start(session.graph.kind);
  }
  $('subdivisions').addEventListener('change', applySubdivisions);
  $('subdivisions').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); applySubdivisions(); } });
  $('help-button').addEventListener('click', () => {
    const help = $('help-panel'); help.hidden = !help.hidden;
    $('help-button').setAttribute('aria-expanded', !help.hidden);
    if (!help.hidden) help.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest'});
  });
  new ResizeObserver(() => {
    measure();
    if (!drag && !pan && !pinch) draw();
    else updateView();
  }).observe(area);
  sizes[initialUrlConfig.kind] = initialUrlConfig.size;
  subdivisions = initialUrlConfig.subdivisions;
  forceLayoutEnabled = initialUrlConfig.relayout;
  $('force-layout').checked = forceLayoutEnabled;
  start(initialUrlConfig.kind, {sequence: initialUrlConfig.sequence});
})();
