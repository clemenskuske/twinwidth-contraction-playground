#!/usr/bin/env python3
"""Build the offline candidate catalogue from certified Computations gap files.

Uses only the Python standard library. Isomorphism is checked exactly by
backtracking inside buckets with the same graph invariants; clusters are a
simple, reproducible grouping by width, order, and cycle surplus.
"""
import argparse
import collections
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_SOURCE = Path(__file__).resolve().parent.parent / "Computations"
GAP_SOURCES = (
    "witness_10_gap.jsonl", "constructed_path_gaps.jsonl",
    "pilot/gaps.jsonl", "results/gaps.jsonl",
    "pilot_mid_verified/gaps.jsonl", "pilot_mid_retries/gaps.jsonl",
    "results_20_30/gaps.jsonl", "results_20_30_retries/gaps.jsonl",
    "results_20_30_retries_1/gaps.jsonl", "results_20_30_retries_2/gaps.jsonl",
    "pilot_extension_smoke_retries_2/gaps.jsonl",
    "results_20_30_extension/gaps.jsonl",
    "results_20_30_extension_retries_0/gaps.jsonl",
    "results_20_30_extension_retries_1/gaps.jsonl",
    "results_20_30_extension_retries_2/gaps.jsonl",
)


def source_rows(source):
    for relative in GAP_SOURCES:
        path = source / relative
        if not path.exists():
            continue
        with path.open() as handle:
            for number, line in enumerate(handle, 1):
                if not line.endswith("\n"):
                    # A search process may be appending to this file.
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError as error:
                    raise ValueError(f"{path}:{number}: {error}") from error
                if row.get("status") == "GAP":
                    yield relative, number, row


def adjacency(n, edges):
    adj = [0] * n
    for a, b in edges:
        if not (0 <= a < b < n) or adj[a] & (1 << b):
            raise ValueError("invalid simple graph edge")
        adj[a] |= 1 << b
        adj[b] |= 1 << a
    return adj


def graph_diameter(adj):
    longest = 0
    for start in range(len(adj)):
        seen, frontier, span = 1 << start, 1 << start, 0
        while seen.bit_count() < len(adj):
            next_frontier = 0
            for vertex in range(len(adj)):
                if frontier >> vertex & 1:
                    next_frontier |= adj[vertex]
            frontier = next_frontier & ~seen
            if not frontier:
                raise ValueError("disconnected candidate graph")
            seen |= frontier
            span += 1
        longest = max(longest, span)
    return longest


def exact_decision(adj, edges, width, solver, timeout_ms):
    data = f"{len(adj)} {len(edges)}\n" + "".join(f"{a} {b}\n" for a, b in edges)
    result = subprocess.run([str(solver), str(width), "0", str(timeout_ms)],
                            input=data, text=True, capture_output=True,
                            timeout=timeout_ms / 1000 + 5, check=True)
    status = result.stdout.split(maxsplit=1)[0] if result.stdout.strip() else ""
    if status not in {"YES", "NO", "UNKNOWN"}:
        raise ValueError(f"unexpected ordinary solver result: {result.stdout} {result.stderr}")
    return status


def normalize_gap(row, adj, solver, timeout_ms):
    """Give heuristic-first GAP records the exact-width evidence used by the catalogue."""
    if "ordinary_width" in row:
        return row
    # Retry records can prove a gap one width below the original heuristic
    # upper bound; tested_width is the bound actually decided YES/NO.
    width = row.get("tested_width", row["ordinary_upper"])
    if (row.get("local_lower_bound") != width + 1 or
            row.get("local_decision", {}).get("status") != "NO" or
            row.get("ordinary_sequence_verified") is not True):
        raise ValueError("mid-size gap lacks a verified ordinary YES and local NO")
    positive = next((row[key] for key in ("ordinary_probe", "ordinary_decision")
                     if row.get(key, {}).get("status") == "YES"), None)
    if positive is None:
        positive = row.get("ordinary_decision") or row.get("ordinary")
    if (positive is None or positive.get("status") not in {"YES", "HEURISTIC"} or
            positive.get("width", width) != width or not positive.get("sequence")):
        raise ValueError("mid-size gap has no verified width-bound sequence")
    initial_lower = min(((adj[a] ^ adj[b]) & ~((1 << a) | (1 << b))).bit_count()
                        for a in range(row["n"]) for b in range(a + 1, row["n"]))
    outcomes = []
    for bound in range(initial_lower, width):
        status = exact_decision(adj, row["edges"], bound, solver, timeout_ms)
        if status != "NO":
            raise ValueError(f"ordinary width below {width} is {status}, so exact width is unproved")
        outcomes.append({"d": bound, "ordinary": {"status": "NO"}})
    outcomes.append({"d": width, "ordinary": {"status": "YES", "sequence": positive["sequence"]},
                     "local": {"status": "NO"}})
    return dict(row, ordinary_width=width, lower=initial_lower,
                diameter=graph_diameter(adj), outcomes=outcomes)


def invariants(n, adj):
    degree = tuple(sorted(x.bit_count() for x in adj))
    triangles = sum((adj[a] & adj[b]).bit_count()
                    for a in range(n) for b in range(a + 1, n) if adj[a] >> b & 1) // 3
    # Vertex-local signatures make exact matching fast without relying on WL
    # fingerprints as an isomorphism proof.
    signatures = tuple(sorted((adj[a].bit_count(),
                               tuple(sorted(adj[b].bit_count() for b in range(n) if adj[a] >> b & 1)))
                              for a in range(n)))
    return degree, triangles, signatures


def isomorphic(left, right):
    """Exact adjacency-preserving bijection, with degree refinement."""
    n = len(left)
    if len(right) != n:
        return False
    if invariants(n, left) != invariants(n, right):
        return False
    signature = lambda adj, v: (adj[v].bit_count(),
                                tuple(sorted(adj[u].bit_count() for u in range(n) if adj[v] >> u & 1)))
    options = [[v for v in range(n) if signature(left, u) == signature(right, v)] for u in range(n)]
    mapping = {}
    used = set()

    def search():
        if len(mapping) == n:
            return True
        # Most constrained vertex first; compare adjacency to assigned vertices.
        choices = []
        for u in range(n):
            if u in mapping:
                continue
            valid = [v for v in options[u] if v not in used and all(
                bool(left[u] >> other & 1) == bool(right[v] >> image & 1)
                for other, image in mapping.items())]
            if not valid:
                return False
            choices.append((len(valid), -left[u].bit_count(), u, valid))
        _, _, u, valid = min(choices)
        for v in valid:
            mapping[u] = v
            used.add(v)
            if search():
                return True
            used.remove(v)
            del mapping[u]
        return False

    return search()


def relation(a, b, adj):
    total = a.bit_count() * b.bit_count()
    count = sum((adj[v] & b).bit_count() for v in range(len(adj)) if a >> v & 1)
    return 0 if count == 0 else 1 if count == total else 2


def distance(a, b, bags, adj):
    neighbors = {x: {y for y in bags if x != y and relation(x, y, adj)} for x in bags}
    seen = {a}
    frontier = {a}
    length = 0
    while frontier:
        if b in frontier:
            return length
        seen |= frontier
        frontier = {y for x in frontier for y in neighbors[x] if y not in seen}
        length += 1
    raise ValueError("disconnected contraction state")


def mask_label(mask):
    members = [str(i + 1) for i in range(mask.bit_length()) if mask >> i & 1]
    return members[0] if len(members) == 1 else "{" + ",".join(members) + "}"


def certificate(row, adj):
    d = row["ordinary_width"]
    initial_lower = min(((adj[a] ^ adj[b]) & ~((1 << a) | (1 << b))).bit_count()
                        for a in range(row["n"]) for b in range(a + 1, row["n"]))
    decisions = {x["d"]: x["ordinary"]["status"] for x in row["outcomes"]}
    if (row["local_lower_bound"] != d + 1 or row["lower"] != initial_lower or
            any(decisions.get(bound) != "NO" for bound in range(initial_lower, d))):
        raise ValueError("candidate lacks exact ordinary-width or local lower-bound evidence")
    outcome = next(x for x in row["outcomes"] if x["d"] == d)
    if outcome["ordinary"]["status"] != "YES" or outcome["local"]["status"] != "NO":
        raise ValueError("candidate lacks YES/NO certificate")
    bags = {1 << i for i in range(row["n"])}
    sequence = outcome["ordinary"]["sequence"]
    remote = []
    peak = 0
    for step, (a, b) in enumerate(sequence, 1):
        if a == b or a not in bags or b not in bags:
            raise ValueError(f"invalid certificate at step {step}")
        span = distance(a, b, bags, adj)
        if span > 2:
            remote.append({"step": step, "a": a, "b": b, "distance": span})
        bags.remove(a)
        bags.remove(b)
        bags.add(a | b)
        peak = max(peak, *(sum(relation(x, y, adj) == 2 for y in bags if y != x) for x in bags))
        if peak > d:
            raise ValueError(f"certificate exceeds width {d} at step {step}")
    if len(bags) != 1 or not remote:
        raise ValueError("incomplete certificate or no nonlocal merge")
    return sequence, remote


def classify_gap(row, adj, sequence, remote):
    """Classify the first forbidden merge using exact one-step red degrees.

    The stored local NO result supplies the global exhaustive part of the
    certificate. A one-step obstruction alone is only about this prefix.
    """
    first = remote[0]
    bags = {1 << i for i in range(row["n"])}
    for a, b in sequence[:first["step"] - 1]:
        bags.remove(a); bags.remove(b); bags.add(a | b)
    choices = []
    for index, a in enumerate(sorted(bags)):
        for b in sorted(bags)[index + 1:]:
            if distance(a, b, bags, adj) > 2:
                continue
            after = (bags - {a, b}) | {a | b}
            red_neighbors = {x: [y for y in after if y != x and relation(x, y, adj) == 2] for x in after}
            hub = max(after, key=lambda x: (len(red_neighbors[x]), -x))
            choices.append((len(red_neighbors[hub]), a, b, hub, sorted(red_neighbors[hub])))
    if not choices:
        raise ValueError("connected trigraph has no local pair")
    safe = sum(choice[0] <= row["ordinary_width"] for choice in choices)
    if safe:
        category = "Delayed local obstruction"
    elif first["step"] == 1:
        category = "No safe local first move"
    else:
        category = "Local-prefix dead end"
    best = min(choices)
    return {"name": category, "divergenceStep": first["step"],
            "localChoices": len(choices), "widthSafeLocalChoices": safe,
            "bestLocal": {"a": best[1], "b": best[2], "redDegree": best[0],
                          "hub": best[3], "redNeighbors": best[4]}}


def exact_local_width(row, adj, solver, timeout_ms):
    """Continue the stored local NO decisions until the first verified YES."""
    n = row["n"]
    data = f"{n} {len(row['edges'])}\n" + "".join(f"{a} {b}\n" for a, b in row["edges"])
    for width in range(row["ordinary_width"] + 1, n):
        status = "UNKNOWN"
        for budget in (timeout_ms, max(30000, timeout_ms * 6)):
            try:
                completed = subprocess.run([str(solver), str(width), "2", str(budget)],
                                           input=data, text=True, capture_output=True,
                                           timeout=budget / 1000 + 5, check=True)
            except subprocess.TimeoutExpired:
                continue
            lines = completed.stdout.splitlines()
            status = lines[0].split()[0] if lines else ""
            if status != "UNKNOWN":
                break
        if status == "NO":
            continue
        if status == "UNKNOWN":
            return None
        if status != "YES":
            raise ValueError(f"unexpected local solver result: {completed.stdout} {completed.stderr}")
        sequence = [[int(value) for value in line.split()] for line in lines[1:] if line.strip()]
        bags = {1 << i for i in range(n)}
        if len(sequence) != n - 1:
            raise ValueError("local solver returned an incomplete sequence")
        for a, b in sequence:
            if a not in bags or b not in bags or a == b or distance(a, b, bags, adj) > 2:
                raise ValueError("local solver returned a nonlocal or invalid merge")
            bags.remove(a); bags.remove(b); bags.add(a | b)
            if max(sum(relation(x, y, adj) == 2 for y in bags if y != x) for x in bags) > width:
                raise ValueError("local solver certificate exceeds claimed width")
        return width
    raise ValueError("connected graph has no local sequence at width n-1")


def structural_group(row):
    n, m, d = row["n"], row["m"], row["ordinary_width"]
    order = "small" if n <= 13 else "medium" if n <= 16 else "large"
    surplus = m - n + 1
    density = "few cycles" if surplus <= n // 3 else "more cycles"
    return f"Width {d} · {order} · {density}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("candidates-data.js"))
    parser.add_argument("--previous-catalogue", type=Path,
                        help="snapshot whose graph IDs and exact local widths should be retained")
    parser.add_argument("--solver", type=Path, default=DEFAULT_SOURCE / "twinwidth")
    parser.add_argument("--timeout-ms", type=int, default=5000)
    args = parser.parse_args()
    previous = {}
    previous_buckets = collections.defaultdict(list)
    next_id = 1
    previous_path = args.previous_catalogue or args.output
    if previous_path.exists():
        content = previous_path.read_text()
        prefix = "window.TwinWidthCandidates = "
        if content.startswith(prefix):
            for graph in json.loads(content[len(prefix):].rstrip(";\n"))["graphs"]:
                adj = adjacency(graph["n"], graph["edges"])
                record = (graph["id"], graph.get("localWidth"), adj)
                previous[(graph["n"], tuple(map(tuple, graph["edges"])))] = record
                previous_buckets[(graph["n"], graph["m"], invariants(graph["n"], adj))].append(record)
                next_id = max(next_id, int(graph["id"][1:]) + 1)
    grouped = collections.defaultdict(list)
    source_counts = collections.Counter()
    for relative, number, row in source_rows(args.source):
        adj = adjacency(row["n"], row["edges"])
        if row["m"] != len(row["edges"]):
            raise ValueError(f"{relative}:{number}: edge count mismatch")
        try:
            row = normalize_gap(row, adj, args.solver, args.timeout_ms)
        except ValueError as error:
            raise ValueError(f"{relative}:{number}: {error}") from error
        sequence, remote = certificate(row, adj)
        key = (row["n"], row["m"], invariants(row["n"], adj))
        source_counts[relative] += 1
        grouped[key].append((relative, number, row, adj, sequence, remote))

    unique = []
    duplicates = 0
    for bucket in grouped.values():
        classes = []
        for item in bucket:
            match = next((group for group in classes if isomorphic(item[3], group[0][3])), None)
            if match is None:
                classes.append([item])
            else:
                match.append(item)
                duplicates += 1
        for group in classes:
            # Prefer the manually recorded small witness, then a sequence with
            # the fewest long-distance moves for a readable explanation.
            relative, number, row, adj, sequence, remote = min(group, key=lambda x: (
                x[0] != "witness_10_gap.jsonl", len(x[5]), x[0], x[1]))
            old = previous.get((row["n"], tuple(map(tuple, row["edges"]))))
            if old is None:
                old = next((record for record in previous_buckets[
                    (row["n"], row["m"], invariants(row["n"], adj))]
                    if isomorphic(adj, record[2])), None)
            local_width = old[1] if old is not None else None
            if local_width is None:
                local_width = exact_local_width(row, adj, args.solver, args.timeout_ms)
            candidate_id = old[0] if old is not None else "G" + str(next_id).zfill(3)
            if old is None:
                next_id += 1
            unique.append({
                "id": candidate_id,
                "n": row["n"], "m": row["m"], "edges": row["edges"],
                "ordinaryWidth": row["ordinary_width"],
                "localLowerBound": row["local_lower_bound"],
                "localWidth": local_width,
                "gap": local_width - row["ordinary_width"] if local_width is not None else None,
                "diameter": row["diameter"],
                "maxMergeDistance": max(move["distance"] for move in remote),
                "triangleCount": invariants(row["n"], adj)[1],
                "cycleSurplus": row["m"] - row["n"] + 1,
                "category": classify_gap(row, adj, sequence, remote),
                "structuralGroup": structural_group(row),
                "sequence": sequence,
                "remoteMerges": remote,
                "source": f"{relative}:{number}",
                "isomorphicRecords": len(group)
            })
    unique.sort(key=lambda x: (x["gap"] is None, -(x["gap"] or 0), x["ordinaryWidth"], x["n"], x["m"], x["triangleCount"], int(x["id"][1:])))
    if not previous:
        for index, entry in enumerate(unique, 1):
            entry["id"] = "G" + str(index).zfill(3)
    output = {"definition": "Distance-2 contractions use the current black-or-red total graph.",
              "generatedAt": datetime.now(timezone.utc).isoformat(),
              "sources": dict(source_counts), "inputRecords": sum(source_counts.values()),
              "isomorphicDuplicatesRemoved": duplicates,
              "exactLocalWidths": sum(x["localWidth"] is not None for x in unique),
              "categories": dict(collections.Counter(x["category"]["name"] for x in unique)),
              "graphs": unique}
    args.output.write_text("window.TwinWidthCandidates = " +
                           json.dumps(output, separators=(",", ":")) + ";\n")
    print(f"Wrote {len(unique)} graphs from {output['inputRecords']} certified records; removed {duplicates} isomorphic duplicates.")


if __name__ == "__main__":
    main()
