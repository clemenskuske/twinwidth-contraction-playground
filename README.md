# Twin-width contraction playground

Open `index.html` in a browser. This is an offline-capable static application with no dependencies, build step, or external requests.

For a local web address, run from this directory:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open http://127.0.0.1:8765.

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
