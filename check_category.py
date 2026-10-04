#!/usr/bin/env python3
"""Check causal gap categories for certified graphs in one JSONL file."""
import argparse
import collections
import json
import subprocess
from pathlib import Path

from build_candidates import adjacency, certificate, classify_gap


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path, help="A gaps.jsonl file from Computations")
    parser.add_argument("--verify-solver", action="store_true",
                        help="rerun the ordinary YES and local NO decisions with the exact solver")
    parser.add_argument("--solver", type=Path, default=Path(__file__).resolve().parent.parent / "Computations/twinwidth")
    parser.add_argument("--timeout-ms", type=int, default=5000)
    args = parser.parse_args()
    counts = collections.Counter()
    for number, line in enumerate(args.file.read_text().splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get("status") != "GAP":
            continue
        adj = adjacency(row["n"], row["edges"])
        sequence, remote = certificate(row, adj)
        if args.verify_solver:
            data = f"{row['n']} {len(row['edges'])}\n" + "".join(f"{a} {b}\n" for a, b in row["edges"])
            for mode, expected in ((0, "YES"), (2, "NO")):
                completed = subprocess.run([str(args.solver), str(row["ordinary_width"]), str(mode), str(args.timeout_ms)],
                                           input=data, text=True, capture_output=True,
                                           timeout=args.timeout_ms / 1000 + 5, check=True)
                actual = completed.stdout.split()[0]
                if actual != expected:
                    raise ValueError(f"line {number}: solver mode {mode} returned {actual}, expected {expected}")
        result = classify_gap(row, adj, sequence, remote)
        counts[result["name"]] += 1
        print(f"{number}: {result['name']} (first distant step {result['divergenceStep']}; "
              f"{result['widthSafeLocalChoices']}/{result['localChoices']} immediately safe local moves)")
    print("Categories:", dict(counts))


if __name__ == "__main__":
    main()
