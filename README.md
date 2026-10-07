# Twin-width contraction playground

Open `index.html` in a browser. This is an offline-capable static application with no dependencies, build step, or external requests.

For a local web address, run from this directory:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open http://127.0.0.1:8765.

## Certified local gap candidates

The **Gap candidates** tab opens a searchable list of connected graphs whose ordinary twin-width is d and whose distance-2 local twin-width is larger. Select a graph to inspect it in the contraction playground. **Next witness merge** and **Show full witness** replay an ordinary width-d certificate; the detail panel names every pair merged at distance greater than 2 in the current black-or-red trigraph. The listed explanation is one sentence per graph. The builder continues the local solver search from the stored lower bound to obtain and verify the exact local width; an unresolved solver timeout is shown as a lower bound.

The list is sorted by gap (local minus ordinary twin-width), largest first, and then by ordinary twin-width, smallest first. You can sort by either width, original graph diameter, the farthest merge in the displayed certificate, 2-core order, pendant depth, or the step of the first distant merge. Merge distance is measured between bags in the current trigraph immediately before merging, so it depends on the chosen certificate. Filters also include minimum core order and pendant depth.

The catalogue is built from the original `../Computations/results/gaps.jsonl` and pilot files, `../Computations/witness_10_gap.jsonl`, `../Computations/constructed_path_gaps.jsonl`, the completed 20–30-vertex run and its three retry files, the three-hour extension and its three retry files, one certified gap from the extension smoke test, and the completed high-width run and its deep retry. The builder checks exact ordinary widths for the newer heuristic-first search records before displaying them; retry records can prove a gap below their original heuristic upper bound. For high-width records, it checks the width-five lower-bound proof, local width-six negative decision, and both positive sequences. `candidates-data.js` is a snapshot; refresh it after adding certified records to these sources:

```sh
python3 build_candidates.py
```

For candidates whose displayed ordinary certificate merges bags farther than distance 3, `distance3-data.js` records two exact width-optimal checks. The first asks whether **every** merge can be at distance at most 3. The second asks, separately for each displayed long-distance pair of bags, whether those **same bags** can instead be merged at distance exactly 3; other merges in that sequence may still be farther away. The page shows both answers, filters by them, and can replay every positive certificate. Distances are shortest-path lengths in the current black-or-red trigraph immediately before a merge.

On the current optimized snapshot, 3,068 graphs have a displayed merge farther than 3. An all-merges-at-most-3 optimal sequence exists for 46, is impossible for 2,832, and remains unresolved for 190. Of 3,123 displayed long-distance bag pairs, 35 can be merged at distance exactly 3 in some optimal sequence, 2,982 cannot, and 106 remain unresolved. The individual results and certificates are in `distance3-results.jsonl`; all `NO` answers came from the exhaustive solver, and every `YES` certificate was replayed and checked independently. After refreshing `candidates-data.js`, regenerate these results with:

```sh
cp candidates-data.js /tmp/previous-candidates.js
cp distance3-results.jsonl /tmp/previous-distance3.jsonl
python3 build_candidates.py
c++ -O3 -std=c++20 witness_solver.cpp -o witness-solver
python3 optimize_witnesses.py
python3 optimize_witnesses.py --only-unresolved --timeout-ms 2000 \
  --progress .witness-refinement.jsonl
python3 check_distance3.py \
  --previous-catalogue /tmp/previous-candidates.js \
  --previous-results /tmp/previous-distance3.jsonl
```

On the current Mac, compile with `SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk` before `c++` because the selected newer SDK has a linker error.

The browser ignores distance-3 results when their catalogue timestamp does not match the graph snapshot. A timed-out distance-3 decision is displayed as **unresolved**, not as an impossibility.

The constructed example [G5771](https://clemenskuske.github.io/twinwidth-contraction-playground/?graph=candidate&candidate=G5771&catalogue=stable) attaches a 12-vertex pendant path to vertex 1 of the ten-vertex witness. It has 22 vertices, diameter 14, ordinary twin-width 2, and distance-2 twin-width 3. Its optimized witness delays the first distant merge to step 14, at distance 4. `../Computations/construct_path_gap.py` reproduces the original exact certificate. Rebuilding the catalogue retains IDs for previously listed graph classes.

The 5 October 2026 snapshot contains 6,578 certified records representing 6,460 non-isomorphic graphs. The completed original 20–30-vertex run and retries found 717 certified gap records; the three-hour extension and retries found another 18; the latest high-width run and retries found six more, all with ordinary twin-width 6 and local twin-width 7. All listed ordinary and local widths are exact. The largest graph has 30 vertices and the greatest original graph diameter is 17. The largest parameter gap remains one. The separate audit in `../Computations/results_high_6/gap_two_summary.json` excludes a gap above one for every one of the 24,730 graphs checked in that run, including 14 graphs whose exact widths remain unresolved; it does not establish a universal bound.

The builder replays every ordinary and local certificate, checks red degrees and all distant pairs, and removes graph-isomorphic records by exact adjacency-preserving backtracking. It uses no Python packages. Structural clusters use the 2-core, the number of leaf attachments, longest pendant depth, and whether an attached tree branches. The first distant pair also records whether each bag contains core vertices, pendant vertices, or both. The page shows these features and keeps the obstruction category as a separate filter. These features describe shape and witness location; the exhaustive local `NO` certifies the parameter gap. `build_candidates.py` uses `../Computations/twinwidth` to compute exact local widths; pass `--solver PATH` to use another solver binary.

`optimize_witnesses.py` keeps every witness at the certified exact ordinary width. It first maximizes the number of initial distance-at-most-2 merges, then minimizes the farthest merge distance subject to that prefix. `witness_solver.cpp` provides its exhaustive solver modes 5 and 6; per-query time limits can leave an optimization unresolved. The page distinguishes **proved latest/minimum** from **best found**. Every replacement is independently replayed with bag, red-degree, and distance checks. In this snapshot, 2,344 displayed witnesses improved; the latest possible first distant merge is proved for 6,192 graphs, and minimum farthest distance for the chosen local prefix is proved for 6,257. The maximum displayed merge distance is 4. In [G6411](https://clemenskuske.github.io/twinwidth-contraction-playground/?graph=candidate&candidate=G6411&catalogue=stable), the first distant merge moved from step 2 at distance 15 to step 15 at distance 4; later merges or a distance-3 sequence remain unresolved. The new graph G6460 still has an unresolved witness optimization and distance-3 alternative after time-limited searches.

The **categories** describe the first distant merge in the displayed ordinary certificate:

- **No safe local first move:** every distance-2 first merge already exceeds width (d).
- **Local-prefix dead end:** a prefix of distance-2 merges reaches a state where every allowed next merge exceeds (d).
- **Delayed local obstruction:** some allowed next merges keep red degree at most (d), but the stored exhaustive local search proves none can finish a width-(d) sequence.

These categories characterize a chosen certificate and its first divergence; the exhaustive local `NO` result proves the global gap, including other prefixes. To inspect and automatically classify a source file, run `python3 check_category.py ../Computations/witness_10_gap.jsonl`. Add `--verify-solver` to rerun both width-(d) decisions with the exact `../Computations/twinwidth` binary; an `UNKNOWN` timeout is not accepted as proof.

## Published app

The current version is published at [clemenskuske.github.io/twinwidth-contraction-playground](https://clemenskuske.github.io/twinwidth-contraction-playground/).
The GitHub Actions workflow in `.github/workflows/deploy-pages.yml` redeploys the static app automatically after every push to `main`. It can also be started manually from the repository's **Actions** tab.

### Shareable graph links

The **Cyclic examples** tab contains three research graphs with verified
ordinary and local sequences. It displays bounds where an optimum remains
unresolved. Choose a graph and a sequence, then use **Next merge**, **Show full
sequence**, or **Show overlapping products**. These graphs have their own
IDs and are not added to the certified gap catalogue.

- [Three overlapping products (23 vertices)](https://clemenskuske.github.io/twinwidth-contraction-playground/?graph=research&example=cyclic-products&step=3)
- [G484 guards inside the pieces (53 vertices)](https://clemenskuske.github.io/twinwidth-contraction-playground/?graph=research&example=piece-guards&step=33)
- [Distributed attachments (53 vertices)](https://clemenskuske.github.io/twinwidth-contraction-playground/?graph=research&example=distributed-guards&step=33)

Research links use `graph=research`, `example=ID`, `certificate=ordinary|local`
(ordinary by default), and `step=N`. Omitting `step` opens the original graph.
The data comes from `../Computations/history_cycle_23_certificate.json`,
`cyclic_piece_guard_53_certificate.json`, and
`cyclic_distributed_guard_53_certificate.json`. Research sequences store
one-based member arrays rather than 32-bit masks so 53-vertex bags replay
without truncation.

The page accepts URL parameters so a graph and a starting sequence can be shared in one link:

- `graph=tree|clique|subdivided|custom|customPath|double-star` chooses the graph preset. `given` and `path` are accepted aliases for the two supplied graphs.
- `vertices=15` chooses the tree/clique order. `subdivisions=2` chooses the number of new vertices per edge for a subdivided clique.
- `relayout=0` or `relayout=1` pauses or enables the live force-directed layout. (`force=0|1` is accepted as an alias.)
- `sequence=1-2,3-4` applies contractions when the page opens. For the supplied graph, use labels such as `sequence=a-b,c-d`; each label may refer to any original vertex inside a current bag.

For example, [open the supplied graph with two contractions](https://clemenskuske.github.io/twinwidth-contraction-playground/?graph=custom&relayout=1&sequence=a-b,c-d). Query parameters only set the initial state; later changes in the controls work normally.

## Trying contractions

- Choose a binary tree, clique, subdivided clique, or the supplied graph on vertices a through k. The size input starts a fresh graph where applicable.
- **Given graph** is the fixed 11-vertex graph with edges ac, ad, ae, ak, bc, cj, di, eh, ek, fk, gh, gi, hj, and jk.
- **With b–f path** adds two vertices `l` and `m`, making the four-vertex path `b–l–m–f`.
- For subdivided cliques, **Subdivisions / edge** inserts 0–20 new vertices into each original clique edge. For a clique of order n and subdivision count s, the graph has n + s·n(n−1)/2 vertices and (s+1)·n(n−1)/2 edges. Zero gives the original clique. Changing either parameter starts a fresh sequence.
- Scroll or pinch over the canvas to zoom (10%–800%). Drag empty background to pan. Use **− / +** to zoom about the center, **Fit** to show the whole graph, or **Re-layout** to run the force-directed layout immediately on the current graph. With the canvas focused, the keyboard equivalents are **− / + / 0**. Zooming and panning do not change the graph or contraction history.
- Drag one vertex onto another. The target highlights and the resulting graph is previewed; release to commit.
- Drag into empty space to rearrange the drawing without contracting.
- Select two vertices and double-click either one to lock the contraction preview on the canvas. You can also select the first vertex and double-click the second directly; choose **Merge selected vertices** when ready.
- **Live force layout** is enabled by default. It keeps a damped force simulation running until the graph settles, pauses while you drag or pan, and resumes after a contraction, undo, redo, or graph reset. Turn the switch off to freeze the current positions.
- Alternatively, select two vertices by clicking them or using Tab and Enter, then press **Merge selected vertices**.
- **Back**, Backspace, or Ctrl/Cmd+Z undoes a contraction, restoring its pre-drag layout, edges, bags, and width. The arrow beside Back or Ctrl/Cmd+Shift+Z restores an undone contraction.
- Escape cancels an active drag or clears the selection. A new contraction after undo discards the redo branch.
- Solid edges are black; dashed red edges are mixed adjacencies. A red badge is the vertex's red degree. A ×N label denotes a bag of N original vertices; the full bag is available in its tooltip/accessibility label.

## Mathematics

For each other vertex, two black incidences remain black and two absent incidences remain absent; every other combination produces a red edge. Contracted vertices need not be adjacent. Edges between the contracted pair disappear. All other edges remain unchanged.

The current maximum red degree and the maximum over the entire current sequence are distinct. The latter is displayed as **Width so far**; only a completed sequence gives an upper bound on the graph's twin-width. This is a manual exploration tool, not a solver for the minimum.

Reference: Bonnet, Kim, Thomassé, and Watrigant, [Twin-width I: tractable FO model checking](https://arxiv.org/abs/2004.14789).

`engine.js` contains the pure graph operations and undo/redo session; `force-layout.js` contains the deterministic damped force simulation; `viewport.js` handles camera geometry; `app.js` handles pointer, keyboard, and animation interaction; `style.css` provides the responsive layout.

Run correctness checks with `node --test *.test.cjs`.

## Postponement failure control

The six-vertex [double star](https://clemenskuske.github.io/twinwidth-contraction-playground/?graph=double-star) has anchors 1,2, leaves 3,5 at 1, and leaves 4,6 at 2. It has ordinary and distance-2 local twin-width one, so it is a control for the transformation, not a graph with a parameter gap.

- [Ordinary width-two reference sequence](https://clemenskuske.github.io/twinwidth-contraction-playground/?graph=double-star&sequence=3-4,5-6,1-2,3-5,1-3): first merge the two distant leaf pairs, then the anchors.
- [Failing state after postponing both distant pairs](https://clemenskuske.github.io/twinwidth-contraction-playground/?graph=double-star&sequence=1-2): the merged anchor has four red neighbors, exceeding the original reference budget 2+1.
- [Successful local width-one sequence](https://clemenskuske.github.io/twinwidth-contraction-playground/?graph=double-star&sequence=3-5,4-6,1-3,2-4,1-2): regroup the leaves at their common anchors before absorbing them. Use Back to inspect its intermediate states.

## Merge-width constructions

Choose **Merge-width** in the decomposition selector to build a construction
sequence on any of the existing graphs. Switching decomposition starts a fresh
sequence; changing **Radius** preserves the construction and recalculates its
current width, peak, and undo/redo states.

- Select two bags and use **Resolve as edges** or **Resolve as non-edges**.
  The operation resolves every remaining original vertex pair between the bags
  and must agree with the original graph.
- Select one bag to resolve its internal pairs. Singleton bags have none.
- Merge using the existing drag, selection, preview, or keyboard controls.
  A merge is blocked if any resulting bag pair, including the merged bag with
  itself, would contain both unresolved edges and unresolved non-edges.
  The preview identifies a conflicting bag. Resolve one of the conflicting
  current bag pairs before trying the merge again.
- **Resolve across all bags** offers a convenient starting construction:
  resolve all edges, merge in any order, then resolve the last bag's remaining
  non-edges. Every individual bag-pair resolution is an undoable step; this
  convenience action does not optimize the width.
- Solid connections are unresolved default edges. Blue dashed connections
  summarize resolved edges; orange dashed connections summarize resolved
  non-edges. Loops show internal pairs. **Inspect defaults and resolved pairs**
  lists the actual original pairs. Both kinds of resolved pairs contribute to
  width. An absent default connection represents non-edges.
- The badge on a bag is the maximum reachable-bag count among its original
  vertices. **Current radius-r width** is the maximum over all original
  vertices; **Width so far** includes every resolution and merge. The starting
  bag counts, so a nonempty initial state has width one.
- Completion requires one bag and all original vertex pairs resolved. Only then
  does the displayed peak certify an upper bound on radius-r merge-width.
  Certified catalogue sequences and cyclic examples' playback describe
  twin-width; their underlying graphs remain usable for manual merge-width
  constructions.

**Share this construction** exposes a replay link. In addition to existing graph
parameters, links accept `mode=merge-width`, `radius=2`, and
`construction=E:1-2,M:2-3,E:1-3,M:1-3,N:3-3`.
`M` merges two current bags, `E` resolves their remaining edges, and `N` resolves
their remaining non-edges. A label can name any original vertex inside a current
bag, including twice for an internal resolution. Numeric IDs and the given
graph's letter labels both work. Invalid steps stop replay with an accessible
explanation, retaining the valid prefix. The existing `sequence` parameter still
accepts merges only; these must satisfy the merge-width validity condition.

For example, open
[the three-vertex tree with a complete radius-2 construction](https://clemenskuske.github.io/twinwidth-contraction-playground/?graph=tree&vertices=3&mode=merge-width&radius=2&construction=E:1-2,M:2-3,E:1-3,M:1-3,N:3-3)
after deploying this contribution.

### Definition and implementation

The implementation follows the **construction-sequence** definition of
Dreier and Toruńczyk,
[Merge-width and First-Order Model Checking](https://arxiv.org/abs/2502.18065),
Introduction and Remark 1.1. It maintains a partition of the fixed original
vertex set and disjoint resolved edges/non-edges. Initially every pair is
unresolved. Resolve operations act on complete pairs of current parts;
merge operations coarsen the partition while preserving homogeneity of every
unresolved bag pair. Completed constructions have one part and every pair
resolved.

Radius-r width counts parts intersecting a closed radius-r ball in the graph
of resolved **original pairs**, including both edges and non-edges. It is
computed separately at each construction step. Paths cannot jump freely
between members of a bag. This is not a radius computation on the displayed
quotient graph, nor a count of twin-width red neighbors. In the equivalent
merge-sequence formulation, the offset between partitions and resolved sets
must be accounted for; measuring resolutions before merges here preserves
those intermediate widths.

`merge-width.js` contains the pure construction operations, validity checks,
original-vertex BFS, and a `Session` subclass. It reuses `engine.js`'s graph
presets, candidate loader, clone/key helpers, and common `commit`/undo/redo
history. The existing layout, viewport, canvas, interaction, catalogue, and
static deployment remain shared. No packages or build step are added.

`merge-width.test.cjs` checks incorrect resolutions, internal/external merge
conflicts, original-vertex distances, radius changes through redo, completion,
pre-drag history, all presets, and randomized constructions against independent
Floyd-Warshall distances and homogeneity checks. Run all checks with
`node --test *.test.cjs`.
