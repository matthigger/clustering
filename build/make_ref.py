"""Write test/ref.js: reference results for the engines in js/cluster.js.

Usage: ~/venv_ds4400/bin/python -I build/make_ref.py

Three kinds of case, each with its inputs and the expected outputs:

    kmeans: {X, mu0, mu, wcss}   sklearn KMeans (Lloyd, given start, tol 0)
    ward:   {X, total}           scipy linkage(X, "ward"); its heights are
                                 sqrt(2 ΔWCSS), so total = cumsum(h² / 2)
    grid:   {w, h, F, total}     brute-force Ward's on a pixel grid, merging
                                 only 4-neighbor regions; checked here
                                 against sklearn's ward_tree with a grid
                                 connectivity
"""
import json
import pathlib

import numpy as np
from scipy.cluster.hierarchy import linkage
from sklearn.cluster import KMeans, ward_tree
from sklearn.feature_extraction.image import grid_to_graph

ROOT = pathlib.Path(__file__).resolve().parent.parent


def kmeans_case(rng: np.random.Generator, n: int, k: int) -> dict:
    """Blobs plus noise, started from k samples; sklearn's final means."""
    c = rng.normal(0, 4, (k, 2))
    x = c[rng.integers(0, k, n)] + rng.normal(0, 1.3, (n, 2))
    mu0 = x[rng.choice(n, k, replace=False)]
    km = KMeans(k, init=mu0, n_init=1, algorithm="lloyd", tol=0,
                max_iter=500).fit(x)
    return {"X": x.tolist(), "mu0": mu0.tolist(),
            "mu": km.cluster_centers_.tolist(), "wcss": km.inertia_}


def ward_case(rng: np.random.Generator, n: int) -> dict:
    """Random samples; total WCSS after each of scipy's Ward merges."""
    x = rng.normal(0, 3, (n, 2))
    h = linkage(x, "ward")[:, 2]
    return {"X": x.tolist(), "total": np.cumsum(h ** 2 / 2).tolist()}


def grid_ward(f: np.ndarray, w: int, h: int) -> np.ndarray:
    """Brute-force Ward's on a grid, merging only touching regions.

    Args:
        f (np.array): (h * w, d) pixel features, row-major

    Returns:
        delta (np.array): (h * w - 1,) ΔWCSS of each merge, in order
    """
    lab = np.arange(h * w).reshape(h, w)
    out = []
    while len(np.unique(lab)) > 1:
        pairs = set()
        for a, b in [(lab[:, :-1], lab[:, 1:]), (lab[:-1, :], lab[1:, :])]:
            m = a != b
            pairs |= {tuple(sorted(p)) for p in zip(a[m], b[m])}
        flat = lab.ravel()
        best = None
        for p, q in pairs:
            fp, fq = f[flat == p], f[flat == q]
            na, nb = len(fp), len(fq)
            dl = na * nb / (na + nb) * np.sum((fp.mean(0) - fq.mean(0)) ** 2)
            if best is None or dl < best[0]:
                best = (dl, p, q)
        out.append(best[0])
        lab[lab == best[2]] = best[1]
    return np.array(out)


def grid_case(rng: np.random.Generator, w: int, h: int) -> dict:
    """Smooth color field plus noise on a w x h grid."""
    yy, xx = np.mgrid[0:h, 0:w] / max(w, h)
    f = np.stack([xx, yy, xx * yy], -1) + rng.normal(0, .15, (h, w, 3))
    f = f.reshape(-1, 3)
    delta = grid_ward(f, w, h)
    sk = ward_tree(f, connectivity=grid_to_graph(h, w),
                   return_distance=True)[4]
    assert np.allclose(np.sort(sk ** 2 / 2), np.sort(delta)), \
        "brute force disagrees with sklearn ward_tree"
    return {"w": w, "h": h, "F": f.ravel().tolist(),
            "total": np.cumsum(delta).tolist()}


def main() -> None:
    """Build every case and write test/ref.js."""
    rng = np.random.default_rng(4400)
    ref = {
        "kmeans": [kmeans_case(rng, n, k) for n, k in
                   [(60, 3), (120, 5), (200, 4), (40, 2)]],
        "ward": [ward_case(rng, n) for n in (8, 30, 60)],
        "grid": [grid_case(rng, w, h) for w, h in [(6, 5), (9, 7)]],
    }
    js = ("// Reference results for test/index.html; written by "
          "build/make_ref.py.\nconst REF = " + json.dumps(ref) + ";\n")
    (ROOT / "test/ref.js").write_text(js)
    print("wrote test/ref.js,", len(js), "bytes")


if __name__ == "__main__":
    main()
