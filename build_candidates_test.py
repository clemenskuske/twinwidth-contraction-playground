"""Check exact isomorphism matching against brute force on small graphs."""
import itertools
import json
import random
import unittest

from build_candidates import DEFAULT_SOURCE, adjacency, certificate, first_distant_pair_type, graph_diameter, isomorphic, normalize_gap, structural_features


def brute_isomorphic(left, right):
    n = len(left)
    return any(all(bool(left[a] >> b & 1) == bool(right[p[a]] >> p[b] & 1)
                   for a in range(n) for b in range(a + 1, n))
               for p in itertools.permutations(range(n)))


class IsomorphismTests(unittest.TestCase):
    def test_pendant_structure_distinguishes_path_and_branch(self):
        triangle = [(0, 1), (0, 2), (1, 2)]
        path = structural_features(adjacency(6, triangle + [(0, 3), (3, 4), (4, 5)]))
        branch = structural_features(adjacency(6, triangle + [(0, 3), (3, 4), (3, 5)]))
        self.assertEqual((path["family"], path["coreOrder"], path["longestPendantDepth"]),
                         ("Short pendant path", 3, 3))
        self.assertEqual((branch["family"], branch["coreOrder"], branch["leafCount"]),
                         ("Branched pendant tree", 3, 2))
        self.assertEqual(first_distant_pair_type([{"a": 1 << 1, "b": 1 << 5}], path),
                         "core + pendant")

    def test_random_pairs_and_relabelings(self):
        rng = random.Random(20261004)
        n = 6
        graphs = []
        for _ in range(12):
            edges = [(a, b) for a in range(n) for b in range(a + 1, n) if rng.randrange(2)]
            graphs.append(adjacency(n, edges))
            permutation = list(range(n))
            rng.shuffle(permutation)
            renamed = adjacency(n, [tuple(sorted((permutation[a], permutation[b]))) for a, b in edges])
            self.assertTrue(isomorphic(graphs[-1], renamed))
        for left, right in itertools.combinations(graphs, 2):
            self.assertEqual(isomorphic(left, right), brute_isomorphic(left, right))

    def test_mid_search_gap_gets_exact_width_evidence(self):
        row = json.loads((DEFAULT_SOURCE / "pilot_mid_verified/gaps.jsonl").read_text().splitlines()[0])
        adj = adjacency(row["n"], row["edges"])
        normalized = normalize_gap(row, adj, DEFAULT_SOURCE / "twinwidth", 1000)
        self.assertEqual(normalized["ordinary_width"], 2)
        self.assertEqual(normalized["diameter"], graph_diameter(adj))
        self.assertEqual(normalized["outcomes"][-1]["local"]["status"], "NO")
        sequence, remote = certificate(normalized, adj)
        self.assertEqual(len(sequence), row["n"] - 1)
        self.assertTrue(remote)

    def test_mid_gap_rejects_unverified_local_result(self):
        row = json.loads((DEFAULT_SOURCE / "pilot_mid_verified/gaps.jsonl").read_text().splitlines()[0])
        row["local_decision"]["status"] = "UNKNOWN"
        with self.assertRaisesRegex(ValueError, "local NO"):
            normalize_gap(row, adjacency(row["n"], row["edges"]), DEFAULT_SOURCE / "twinwidth", 1000)

    def test_retry_gap_uses_tested_width_below_heuristic_upper(self):
        with (DEFAULT_SOURCE / "results_20_30_retries_1/gaps.jsonl").open() as handle:
            row = next(row for line in handle if
                       (row := json.loads(line))["tested_width"] < row["ordinary_upper"])
        adj = adjacency(row["n"], row["edges"])
        normalized = normalize_gap(row, adj, DEFAULT_SOURCE / "twinwidth", 1000)
        self.assertEqual(normalized["ordinary_width"], row["tested_width"])
        certificate(normalized, adj)

    def test_high_width_gap_uses_exact_lower_and_local_witness(self):
        row = json.loads((DEFAULT_SOURCE / "results_high_6/gaps.jsonl").read_text().splitlines()[0])
        adj = adjacency(row["n"], row["edges"])
        normalized = normalize_gap(row, adj, DEFAULT_SOURCE / "twinwidth", 1000)
        self.assertEqual(normalized["ordinary_width"], 6)
        self.assertEqual(normalized["local_exact"], 7)
        self.assertEqual(normalized["outcomes"][-2]["ordinary"]["status"], "NO")
        self.assertTrue(certificate(normalized, adj)[1])


if __name__ == "__main__":
    unittest.main()
