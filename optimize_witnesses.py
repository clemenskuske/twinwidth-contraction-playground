#!/usr/bin/env python3
"""Prefer late distant merges, then short distant merges, in exact-width witnesses.

Every replacement is replayed independently. A solver timeout leaves a valid
best-found witness and an explicit unresolved optimality status.
"""
import argparse
import collections
import concurrent.futures
import json
import subprocess
from pathlib import Path

from build_candidates import adjacency, classify_gap, distance, first_distant_pair_type, relation, structural_features
from check_distance3 import load_catalogue


ROOT = Path(__file__).resolve().parent


def analyze(graph, sequence):
    n, width = graph["n"], graph["ordinaryWidth"]
    adj = adjacency(n, graph["edges"])
    bags = {1 << v for v in range(n)}
    remote = []
    if len(sequence) != n - 1:
        raise ValueError(f"{graph['id']}: incomplete witness")
    for step, (a, b) in enumerate(sequence, 1):
        if a == b or a not in bags or b not in bags:
            raise ValueError(f"{graph['id']}: invalid bags at step {step}")
        span = distance(a, b, bags, adj)
        if span > 2:
            remote.append({"step": step, "a": a, "b": b, "distance": span})
        bags.remove(a); bags.remove(b); bags.add(a | b)
        if any(sum(relation(x, y, adj) == 2 for y in bags if y != x) > width for x in bags):
            raise ValueError(f"{graph['id']}: width exceeded at step {step}")
    if not remote:
        raise ValueError(f"{graph['id']}: no distant merge in width-optimal witness")
    return remote


def rank(remote):
    # A later first nonlocal merge is most important; then the farthest merge,
    # the first remote distance, and the number of remote merges.
    return (-remote[0]["step"], max(move["distance"] for move in remote),
            remote[0]["distance"], len(remote))


def solve(graph, solver, mode, timeout_ms, *extra):
    data = f"{graph['n']} {graph['m']}\n" + "".join(f"{a} {b}\n" for a, b in graph["edges"])
    command = [str(solver), str(graph["ordinaryWidth"]), str(mode), str(timeout_ms),
               *(str(value) for value in extra)]
    result = subprocess.run(command, input=data, text=True, capture_output=True,
                            timeout=timeout_ms / 1000 + 5, check=True)
    lines = result.stdout.splitlines()
    status = lines[0].split()[0] if lines else ""
    if status not in {"YES", "NO", "UNKNOWN"}:
        raise ValueError(f"{graph['id']}: unexpected solver answer {result.stdout} {result.stderr}")
    sequence = [[int(x) for x in line.split()] for line in lines[1:]] if status == "YES" else None
    return status, sequence


def optimize(graph, solver, timeout_ms, alternatives):
    best = graph["sequence"]
    best_remote = analyze(graph, best)
    original_rank = rank(best_remote)
    for sequence in alternatives:
        remote = analyze(graph, sequence)
        if rank(remote) < rank(best_remote):
            best, best_remote = sequence, remote
    prior_optimization = graph.get("witnessOptimization", {})
    delay_status = "proved" if (best_remote[0]["step"] == graph["n"] - 1 or
                                (best_remote[0]["step"] == graph["remoteMerges"][0]["step"] and
                                 prior_optimization.get("delayStatus") == "proved")) else "time-limited"
    attempts = 0
    # Each successful query may leap over many prefix lengths. An exhaustive
    # NO at the next prefix proves this witness delays the first distant merge
    # as far as any width-optimal sequence can.
    while delay_status != "proved" and attempts < 5:
        minimum_prefix = best_remote[0]["step"]
        status, sequence = solve(graph, solver, 5, timeout_ms, minimum_prefix)
        attempts += 1
        if status == "NO":
            delay_status = "proved"
            break
        if status == "UNKNOWN":
            break
        remote = analyze(graph, sequence)
        if remote[0]["step"] <= best_remote[0]["step"]:
            raise ValueError(f"{graph['id']}: prefix solver returned no improvement")
        best, best_remote = sequence, remote
        if best_remote[0]["step"] == graph["n"] - 1:
            delay_status = "proved"
            break

    max_distance = max(move["distance"] for move in best_remote)
    distance_status = "proved" if (max_distance == 3 or
                                   (best_remote[0]["step"] == graph["remoteMerges"][0]["step"] and
                                    max_distance == graph["maxMergeDistance"] and
                                    prior_optimization.get("distanceStatus") == "proved")) else "time-limited"
    # The local gap proves a distance cap of two impossible. Try distance caps
    # in increasing order, with the best-known local prefix fixed.
    if max_distance > 3 and distance_status != "proved":
        prefix = best_remote[0]["step"] - 1
        unresolved_lower_cap = False
        for cap in range(3, max_distance):
            status, sequence = solve(graph, solver, 6, timeout_ms, prefix, cap)
            if status == "UNKNOWN":
                unresolved_lower_cap = True
                continue
            if status == "YES":
                remote = analyze(graph, sequence)
                if rank(remote) < rank(best_remote):
                    best, best_remote = sequence, remote
                # An earlier timeout leaves open the possibility of a lower cap.
                distance_status = "time-limited" if unresolved_lower_cap else "proved"
                break
        else:
            distance_status = "time-limited" if unresolved_lower_cap else "proved"

    result = dict(graph)
    if best_remote[0]["step"] == graph["n"] - 1:
        delay_status = "proved"
    result["sequence"] = best
    result["remoteMerges"] = best_remote
    result["maxMergeDistance"] = max(move["distance"] for move in best_remote)
    result["category"] = classify_gap({"n": graph["n"], "ordinary_width": graph["ordinaryWidth"]},
                                      adjacency(graph["n"], graph["edges"]), best, best_remote)
    result["structure"] = structural_features(adjacency(graph["n"], graph["edges"]))
    result["structuralGroup"] = result["structure"]["family"]
    result["firstDistantPairType"] = first_distant_pair_type(best_remote, result["structure"])
    result["witnessOptimization"] = {
        "firstDistantStep": best_remote[0]["step"], "delayStatus": delay_status,
        "distanceStatus": distance_status, "attempts": attempts,
        "previousFirstDistantStep": graph.get("witnessOptimization", {}).get(
            "previousFirstDistantStep", graph["remoteMerges"][0]["step"]),
        "previousMaxMergeDistance": graph.get("witnessOptimization", {}).get(
            "previousMaxMergeDistance", graph["maxMergeDistance"]),
        "improved": graph.get("witnessOptimization", {}).get("improved", False) or
                    rank(best_remote) < original_rank,
    }
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalogue", type=Path, default=ROOT / "candidates-data.js")
    parser.add_argument("--distance3-results", type=Path, default=ROOT / "distance3-results.jsonl")
    parser.add_argument("--solver", type=Path, default=ROOT / "witness-solver")
    parser.add_argument("--timeout-ms", type=int, default=500)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--ids", nargs="+", metavar="GRAPH_ID",
                        help="optimize only these catalogue graph IDs")
    parser.add_argument("--only-unresolved", action="store_true",
                        help="retry only graphs whose delay or distance optimum timed out")
    parser.add_argument("--progress", type=Path, default=ROOT / ".witness-optimization.jsonl")
    args = parser.parse_args()
    catalogue = load_catalogue(args.catalogue)
    graphs = catalogue["graphs"]
    if args.ids:
        requested = set(args.ids)
        unknown = requested - {g["id"] for g in graphs}
        if unknown:
            parser.error(f"unknown graph IDs: {', '.join(sorted(unknown))}")
        graphs = [g for g in graphs if g["id"] in requested]
    if args.only_unresolved:
        graphs = [g for g in graphs if g.get("witnessOptimization", {}).get("delayStatus") != "proved" or
                  g.get("witnessOptimization", {}).get("distanceStatus") != "proved"]
    graphs = graphs[:args.limit or None]
    known = {}
    if args.progress.exists():
        for line in args.progress.read_text().splitlines():
            if line:
                row = json.loads(line)
                known[row["id"]] = row
    alternate = collections.defaultdict(list)
    if args.distance3_results.exists():
        for line in args.distance3_results.read_text().splitlines():
            if not line:
                continue
            row = json.loads(line)
            if row.get("status") == "YES":
                alternate[row["id"]].append(row["sequence"])
            for pair in row.get("pairChecks", []):
                if pair["status"] == "YES":
                    alternate[row["id"]].append(pair["sequence"])
    for graph in graphs:
        prior = known.get(graph["id"])
        if prior and (prior["edges"] != graph["edges"] or
                      prior["ordinaryWidth"] != graph["ordinaryWidth"]):
            del known[graph["id"]]
    pending = [g for g in graphs if g["id"] not in known]
    with args.progress.open("a") as handle, concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(optimize, g, args.solver, args.timeout_ms, alternate[g["id"]]): g["id"]
                   for g in pending}
        done = 0
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            known[result["id"]] = result
            handle.write(json.dumps(result, separators=(",", ":")) + "\n")
            handle.flush()
            done += 1
            if done % 100 == 0 or done == len(pending):
                print(f"{done}/{len(pending)} optimized; {sum(g['witnessOptimization']['improved'] for g in known.values())} improved", flush=True)
    if args.limit:
        print("Smoke run complete; catalogue unchanged")
        return
    catalogue["graphs"] = [known.get(g["id"], g) for g in catalogue["graphs"]]
    for graph in catalogue["graphs"]:
        if "firstDistantPairType" not in graph or "coreMask" not in graph.get("structure", {}):
            graph["structure"] = structural_features(adjacency(graph["n"], graph["edges"]))
            graph["structuralGroup"] = graph["structure"]["family"]
            graph["firstDistantPairType"] = first_distant_pair_type(graph["remoteMerges"], graph["structure"])
    catalogue["categories"] = dict(collections.Counter(g["category"]["name"] for g in catalogue["graphs"]))
    catalogue["structuralFamilies"] = dict(collections.Counter(g["structuralGroup"] for g in catalogue["graphs"]))
    catalogue["firstDistantPairTypes"] = dict(collections.Counter(g["firstDistantPairType"] for g in catalogue["graphs"]))
    catalogue["witnessOptimizationSummary"] = {
        "improved": sum(g["witnessOptimization"]["improved"] for g in catalogue["graphs"]),
        "delayProved": sum(g["witnessOptimization"]["delayStatus"] == "proved" for g in catalogue["graphs"]),
        "distanceProved": sum(g["witnessOptimization"]["distanceStatus"] == "proved" for g in catalogue["graphs"]),
    }
    from datetime import datetime, timezone
    catalogue["generatedAt"] = datetime.now(timezone.utc).isoformat()
    args.catalogue.write_text("window.TwinWidthCandidates = " + json.dumps(catalogue, separators=(",", ":")) + ";\n")
    print(json.dumps(catalogue["witnessOptimizationSummary"], indent=2))


if __name__ == "__main__":
    main()
