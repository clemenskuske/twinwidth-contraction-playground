# Twin-width contraction playground

Open `index.html` in a browser. This is an offline-capable static application with no dependencies, build step, or external requests.

For a local web address, run from this directory:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open http://127.0.0.1:8765.

## Certified local gap candidates

The **Gap candidates** tab opens a searchable list of connected graphs whose ordinary twin-width is d and whose distance-2 local twin-width is larger. Select a graph to inspect it in the contraction playground. **Next witness merge** and **Show full witness** replay an ordinary width-d certificate; the detail panel names every pair merged at distance greater than 2 in the current black-or-red trigraph. The listed explanation is one sentence per graph. The builder continues the local solver search from the stored lower bound to obtain and verify the exact local width; an unresolved solver timeout is shown as a lower bound.

The list is sorted by gap (local minus ordinary twin-width), largest first, and then by ordinary twin-width, smallest first. You can sort by either width, original graph diameter, or the farthest merge in the displayed certificate, and filter for a minimum diameter or merge distance. The latter is measured between bags in the current trigraph immediately before merging, so it depends on the chosen certificate.

The catalogue is built from the original `../Computations/results/gaps.jsonl` and pilot files, `../Computations/witness_10_gap.jsonl`, `../Computations/constructed_path_gaps.jsonl`, and the certified `../Computations/pilot_mid_verified/`, `pilot_mid_retries/`, `results_20_30/`, and three `results_20_30_retries*/` gap files. The builder checks exact ordinary widths for the newer heuristic-first search records before displaying them. `candidates-data.js` is a snapshot; refresh it after adding certified records to these sources:

```sh
python3 build_candidates.py
```

For candidates whose displayed ordinary certificate merges bags farther than distance 3, `distance3-data.js` records two exact width-optimal checks. The first asks whether **every** merge can be at distance at most 3. The second asks, separately for each displayed long-distance pair of bags, whether those **same bags** can instead be merged at distance exactly 3; other merges in that sequence may still be farther away. The page shows both answers, filters by them, and can replay every positive certificate. Distances are shortest-path lengths in the current black-or-red trigraph immediately before a merge.

On the current snapshot, 3,004 graphs have a displayed merge farther than 3. An all-merges-at-most-3 optimal sequence exists for 194, is impossible for 2,762, and remains unresolved for 48. Of 3,092 individual displayed long-distance bag pairs, 111 can be merged at distance exactly 3 in some optimal sequence, 2,963 cannot, and 18 remain unresolved. The individual results and certificates are in `distance3-results.jsonl`; all `NO` answers came from the exhaustive solver, and every `YES` certificate was replayed and checked independently. After refreshing `candidates-data.js`, regenerate these results with:

```sh
c++ -O3 -std=c++17 ../Computations/twinwidth.cpp -o ../Computations/twinwidth-distance3
python3 check_distance3.py
```

The browser ignores distance-3 results when their catalogue timestamp does not match the graph snapshot. A timed-out distance-3 decision is displayed as **unresolved**, not as an impossibility.

The constructed example [G5771](https://clemenskuske.github.io/twinwidth-contraction-playground/?graph=candidate&candidate=G5771&catalogue=stable) attaches a 12-vertex pendant path to vertex 1 of the ten-vertex witness. It has 22 vertices, diameter 14, ordinary twin-width 2, and distance-2 twin-width 3. Its displayed distant merge remains the original pair 2 and 6 at distance 4. `../Computations/construct_path_gap.py` reproduces the exact certificate. Rebuilding the catalogue retains IDs for previously listed graph classes.

The 4 October 2026 evening snapshot contains 6,022 certified records representing 5,960 non-isomorphic graphs, including 189 added from the 20–30-vertex search and its retry workers. All listed ordinary and local widths are exact. The new graphs have 20–25 vertices; their largest original graph diameter is 16, and [G5872](https://clemenskuske.github.io/twinwidth-contraction-playground/?graph=candidate&candidate=G5872&catalogue=stable) has a displayed merge at distance 10. The largest parameter gap remains one. No 30–40-vertex run has produced a certified gap in this snapshot.

The builder replays every ordinary and local certificate, checks red degrees and all distant pairs, and removes graph-isomorphic records by exact adjacency-preserving backtracking. It uses no Python packages. Similar graphs are also described by width, vertex order, and cycle surplus. It uses `../Computations/twinwidth` to compute exact local widths; pass `--solver PATH` to use another solver binary.

The **categories** describe the first distant merge in the displayed ordinary certificate:

- **No safe local first move:** every distance-2 first merge already exceeds width (d).
- **Local-prefix dead end:** a prefix of distance-2 merges reaches a state where every allowed next merge exceeds (d).
- **Delayed local obstruction:** some allowed next merges keep red degree at most (d), but the stored exhaustive local search proves none can finish a width-(d) sequence.

These categories characterize a chosen certificate and its first divergence; the exhaustive local `NO` result proves the global gap, including other prefixes. To inspect and automatically classify a source file, run `python3 check_category.py ../Computations/witness_10_gap.jsonl`. Add `--verify-solver` to rerun both width-(d) decisions with the exact `../Computations/twinwidth` binary; an `UNKNOWN` timeout is not accepted as proof.

## Published app

The current version is published at [clemenskuske.github.io/twinwidth-contraction-playground](https://clemenskuske.github.io/twinwidth-contraction-playground/).
The GitHub Actions workflow in `.github/workflows/deploy-pages.yml` redeploys the static app automatically after every push to `main`. It can also be started manually from the repository's **Actions** tab.

### Shareable graph links

The page accepts URL parameters so a graph and a starting sequence can be shared in one link:

- `graph=tree|clique|subdivided|custom|customPath` chooses the graph preset. `given` and `path` are accepted aliases for the two supplied graphs.
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
