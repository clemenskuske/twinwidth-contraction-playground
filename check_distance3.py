#!/usr/bin/env python3
"""Check distance-3 alternatives for every longer-merge catalogue entry.

Two questions are answered: can every merge be at distance at most 3, and can
each specific bag pair from the displayed witness merge at exactly distance 3?
"""
import argparse
import collections
import json
import subprocess
from pathlib import Path

from build_candidates import adjacency, distance, relation


ROOT = Path(__file__).resolve().parent


def load_catalogue(path):
    prefix = "window.TwinWidthCandidates = "
    source = path.read_text()
    if not source.startswith(prefix):
        raise ValueError("unrecognized catalogue format")
    return json.loads(source[len(prefix):].rstrip(";\n"))


def result_key(graph):
    """Distance-3 decisions depend on the labelled graph and width, not its witness."""
    return json.dumps([graph["n"], graph["edges"], graph["ordinaryWidth"]], separators=(",", ":"))


def write_browser_data(catalogue, rows, path):
    """Keep the offline browser data tied to the exact catalogue snapshot."""
    graphs = {}
    for row in rows:
        item = {"status": row["status"],
                "pairs": [{key: pair[key] for key in
                           ("a", "b", "displayedStep", "displayedDistance", "status")}
                          for pair in row["pairChecks"]]}
        if row["status"] == "YES":
            item["sequence"] = row["sequence"]
        for item_pair, pair in zip(item["pairs"], row["pairChecks"]):
            if pair["status"] == "YES":
                item_pair["sequence"] = pair["sequence"]
                item_pair["targetStep"] = pair["targetStep"]
        graphs[row["id"]] = item
    payload = {"catalogueGeneratedAt": catalogue["generatedAt"], "graphs": graphs}
    path.write_text("window.TwinWidthDistance3 = " + json.dumps(payload, separators=(",", ":")) + ";\n")


def check_sequence(graph, sequence, distance_cap=None, target=None):
    n, width = graph["n"], graph["ordinaryWidth"]
    if len(sequence) != n - 1:
        raise ValueError("incomplete solver sequence")
    adj = adjacency(n, graph["edges"])
    bags = {1 << index for index in range(n)}
    farthest = 0
    distance3 = []
    peak = 0
    target_step = None
    for step, (a, b) in enumerate(sequence, 1):
        if a == b or a not in bags or b not in bags:
            raise ValueError(f"invalid merge at step {step}")
        span = distance(a, b, bags, adj)
        if distance_cap is not None and span > distance_cap:
            raise ValueError(f"nonlocal merge at step {step}: distance {span}")
        if target is not None and {a, b} == set(target):
            if span != 3:
                raise ValueError(f"target pair merged at distance {span}, not 3")
            target_step = step
        farthest = max(farthest, span)
        if span == 3:
            distance3.append({"step": step, "a": a, "b": b})
        bags.remove(a); bags.remove(b); bags.add(a | b)
        peak = max(peak, *(sum(relation(x, y, adj) == 2 for y in bags if y != x) for x in bags))
        if peak > width:
            raise ValueError(f"width exceeded at step {step}")
    if target is not None and target_step is None:
        raise ValueError("target pair was not merged")
    if distance_cap == 3 and farthest != 3:
        raise ValueError("a width-optimal distance-3 witness must use distance 3 because local width is larger")
    return {"farthest": farthest, "distance3Merges": distance3, "peak": peak,
            "targetStep": target_step}


def solve(graph, solver, timeout_ms, target=None):
    data = f"{graph['n']} {graph['m']}\n" + "".join(f"{a} {b}\n" for a, b in graph["edges"])
    mode = "4" if target is not None else "3"
    command = [str(solver), str(graph["ordinaryWidth"]), mode, str(timeout_ms)]
    if target is not None:
        command += [str(target[0]), str(target[1])]
    result = subprocess.run(command,
                            input=data, text=True, capture_output=True,
                            timeout=timeout_ms / 1000 + 5, check=True)
    lines = result.stdout.splitlines()
    status = lines[0].split()[0] if lines else ""
    if status not in {"YES", "NO", "UNKNOWN"}:
        raise ValueError(f"unexpected solver result for {graph['id']}: {result.stdout} {result.stderr}")
    sequence = [[int(x) for x in line.split()] for line in lines[1:]] if status == "YES" else []
    return status, sequence


def decide(graph, solver, timeout_ms, retry_timeout_ms, target=None):
    status, sequence = solve(graph, solver, timeout_ms, target)
    if status == "UNKNOWN":
        status, sequence = solve(graph, solver, retry_timeout_ms, target)
    return status, sequence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalogue", type=Path, default=ROOT / "candidates-data.js")
    parser.add_argument("--solver", type=Path, default=ROOT / "witness-solver")
    parser.add_argument("--output", type=Path, default=ROOT / "distance3-results.jsonl")
    parser.add_argument("--js-output", type=Path, default=ROOT / "distance3-data.js")
    parser.add_argument("--timeout-ms", type=int, default=5000)
    parser.add_argument("--retry-timeout-ms", type=int, default=60000)
    parser.add_argument("--limit", type=int, default=0, help="process only this many entries for a smoke test")
    parser.add_argument("--previous-catalogue", type=Path,
                        help="old candidate snapshot for reusing exact checks")
    parser.add_argument("--previous-results", type=Path,
                        help="JSONL checks for the old snapshot")
    args = parser.parse_args()
    if bool(args.previous_catalogue) != bool(args.previous_results):
        parser.error("provide both previous-catalogue and previous-results")
    catalogue = load_catalogue(args.catalogue)
    graphs = [graph for graph in catalogue["graphs"] if graph["maxMergeDistance"] > 3]
    if args.limit:
        graphs = graphs[:args.limit]
    reusable = {}
    if args.previous_catalogue:
        old_graphs = {graph["id"]: graph for graph in load_catalogue(args.previous_catalogue)["graphs"]}
        for graph in old_graphs.values():
            if graph["maxMergeDistance"] <= 3:
                reusable[result_key(graph)] = {"status": "YES", "sequence": graph["sequence"],
                                               "pairChecks": []}
        for line in args.previous_results.read_text().splitlines():
            if not line:
                continue
            row = json.loads(line)
            graph = old_graphs.get(row["id"])
            if graph:
                reusable[result_key(graph)] = row
    counts = collections.Counter()
    rows = []
    reused = 0
    with args.output.open("w") as handle:
        for number, graph in enumerate(graphs, 1):
            old = reusable.get(result_key(graph))
            if old is not None:
                status, sequence = old["status"], old.get("sequence", [])
                reused += 1
            else:
                status, sequence = decide(graph, args.solver, args.timeout_ms, args.retry_timeout_ms)
            row = {"id": graph["id"], "n": graph["n"], "m": graph["m"],
                   "ordinaryWidth": graph["ordinaryWidth"],
                   "displayedMaxDistance": graph["maxMergeDistance"], "status": status}
            if status == "YES":
                row.update(check_sequence(graph, sequence, distance_cap=3))
                row["sequence"] = sequence
            prior_pairs = {tuple(sorted((pair["a"], pair["b"]))): pair
                           for pair in old.get("pairChecks", [])} if old else {}
            pair_checks = []
            for pair in graph["remoteMerges"]:
                if pair["distance"] <= 3:
                    continue
                target = (pair["a"], pair["b"])
                prior = prior_pairs.get(tuple(sorted(target)))
                if prior:
                    pair_status, pair_sequence = prior["status"], prior.get("sequence", [])
                else:
                    pair_status, pair_sequence = decide(graph, args.solver, args.timeout_ms,
                                                         args.retry_timeout_ms, target)
                checked_pair = {"a": target[0], "b": target[1],
                                "displayedStep": pair["step"], "displayedDistance": pair["distance"],
                                "status": pair_status}
                if pair_status == "YES":
                    checked_pair.update(check_sequence(graph, pair_sequence, target=target))
                    checked_pair["sequence"] = pair_sequence
                pair_checks.append(checked_pair)
            row["pairChecks"] = pair_checks
            handle.write(json.dumps(row, separators=(",", ":")) + "\n")
            rows.append(row)
            counts[status] += 1
            if number % 100 == 0 or number == len(graphs):
                print(f"{number}/{len(graphs)}: {dict(counts)}", flush=True)
    print(f"Saved {len(graphs)} checked entries to {args.output}; reused {reused} unchanged entries")
    write_browser_data(catalogue, rows, args.js_output)
    print(f"Saved browser data to {args.js_output}")


if __name__ == "__main__":
    main()
