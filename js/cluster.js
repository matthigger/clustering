// Clustering engines, free of the page: k-means (Lloyd's assign and
// update steps, random and k-means++ starts), Ward's method on samples,
// and Ward's method on a pixel grid that merges only touching regions.
// test/index.html checks them against sklearn and scipy (build/make_ref.py).

/**
 * Find the mean nearest to x.
 *
 * Args:
 *   x (number[]): (2,) sample
 *   mu (number[][]): (k, 2) means
 *   keep (number): current cluster, kept on a tie (-1: none, the lowest
 *     index wins, as in sklearn)
 *
 * Returns:
 *   (number[]): [j, squared distance to mu[j]]
 */
function nearest(x, mu, keep = -1) {
  let best = keep >= 0 ? keep : 0, bd = d2(x, mu[best]);
  for (let j = 0; j < mu.length; j++) {
    const d = d2(x, mu[j]);
    if (d < bd - 1e-12) { best = j; bd = d; }
  }
  return [best, bd];
}

/** WCSS = sum over samples of the squared distance to their mean. */
function kmWcss(X, mu, assign) {
  let s = 0;
  X.forEach((x, i) => { if (assign[i] >= 0) s += d2(x, mu[assign[i]]); });
  return s;
}

/**
 * Assign step: move each sample to its nearest mean.
 *
 * Args:
 *   X (number[][]): (n, 2) samples
 *   mu (number[][]): (k, 2) means
 *   assign (number[]): (n,) current clusters, -1 before the first step
 *
 * Returns:
 *   (object): {assign (n,) new clusters, events}; the first assignment
 *     gives one "join" event per cluster, later ones a "switch" event per
 *     sample that changes cluster
 */
function kmAssign(X, mu, assign) {
  const first = assign.every(a => a < 0);
  const out = [], events = [];
  X.forEach((x, i) => {
    const [j, dj] = nearest(x, mu, assign[i]);
    out.push(j);
    if (!first && j !== assign[i]) {
      events.push({ kind: "switch", i, from: assign[i], to: j,
        dFrom: d2(x, mu[assign[i]]), dTo: dj,
        muFrom: [...mu[assign[i]]], muTo: [...mu[j]] });
    }
  });
  if (first) {
    mu.forEach((m, j) => {
      const members = out.flatMap((a, i) => (a === j ? [i] : []));
      events.push({ kind: "join", j, members, mu: [...m] });
    });
  }
  return { assign: out, events };
}

/**
 * Update step: move each mean to the average of its samples.
 *
 * A cluster left empty restarts its mean at a sample drawn with
 * probability proportional to its squared distance to its own mean, the
 * k-means++ rule (Arthur & Vassilvitskii 2007).
 *
 * Returns:
 *   (object): {mu (k, 2) new means, events: "move" or "empty" per mean
 *     that changes}
 */
function kmUpdate(X, mu, assign, rng) {
  const k = mu.length, sum = mu.map(() => [0, 0]), n = mu.map(() => 0);
  X.forEach((x, i) => {
    sum[assign[i]][0] += x[0];
    sum[assign[i]][1] += x[1];
    n[assign[i]]++;
  });
  const out = [], events = [];
  for (let j = 0; j < k; j++) {
    if (n[j] === 0) {
      const w = X.map((x, i) => d2(x, mu[assign[i]]));
      const i = drawIndex(w, rng);
      out.push([...X[i]]);
      events.push({ kind: "empty", j, i, p: [...mu[j]], q: [...X[i]] });
      continue;
    }
    const q = [sum[j][0] / n[j], sum[j][1] / n[j]];
    out.push(q);
    if (d2(q, mu[j]) > 1e-18) {
      events.push({ kind: "move", j, p: [...mu[j]], q, n: n[j],
        members: assign.flatMap((a, i) => (a === j ? [i] : [])) });
    }
  }
  return { mu: out, events };
}

/** Index drawn with probability proportional to weights w (uniform if 0). */
function drawIndex(w, rng) {
  const tot = w.reduce((a, b) => a + b, 0);
  if (!(tot > 0)) return Math.floor(rng() * w.length);
  let u = rng() * tot;
  for (let i = 0; i < w.length; i++) {
    u -= w[i];
    if (u <= 0) return i;
  }
  return w.length - 1;
}

/** k distinct samples' indices, uniformly at random. */
function initRandom(X, k, rng) {
  const idx = X.map((_, i) => i);
  for (let i = 0; i < k; i++) {
    const r = i + Math.floor(rng() * (idx.length - i));
    [idx[i], idx[r]] = [idx[r], idx[i]];
  }
  return idx.slice(0, k);
}

/**
 * k-means++ start (Arthur & Vassilvitskii 2007): first mean a random
 * sample, each next one a sample drawn with probability proportional to
 * its squared distance to the nearest mean so far.
 *
 * Returns:
 *   (number[]): (k,) sample indices
 */
function initPP(X, k, rng) {
  const idx = [Math.floor(rng() * X.length)];
  while (idx.length < k) {
    const w = X.map(x => Math.min(...idx.map(i => d2(x, X[i]))));
    idx.push(drawIndex(w, rng));
  }
  return idx;
}

// ---------------------------------------------------------------------

/**
 * Run Ward's method on samples, trying every pair at each step.
 *
 * The cost of merging clusters A and B is the rise in total WCSS,
 * ΔWCSS = N_A N_B / (N_A + N_B) ‖μ_A − μ_B‖² (Ward 1963). Ties go to the
 * pair of oldest nodes.
 *
 * Args:
 *   X (number[][]): (n, 2) samples
 *
 * Returns:
 *   (object[]): (n - 1,) merge records, in order
 */
function wardTree(X) {
  const n = X.length;
  let act = X.map((x, i) => ({ id: i, n: 1, mu: [...x] }));
  const merges = [];
  let total = 0;
  for (let t = 0; t < n - 1; t++) {
    let best = null;
    for (let p = 0; p < act.length; p++) {
      for (let q = p + 1; q < act.length; q++) {
        const A = act[p], B = act[q];
        const dl = A.n * B.n / (A.n + B.n) * d2(A.mu, B.mu);
        if (!best || dl < best.dl - 1e-12) best = { p, q, dl };
      }
    }
    const A = act[best.p], B = act[best.q], N = A.n + B.n;
    const mu = [(A.n * A.mu[0] + B.n * B.mu[0]) / N,
      (A.n * A.mu[1] + B.n * B.mu[1]) / N];
    total += best.dl;
    merges.push({ a: A.id, b: B.id, na: A.n, nb: B.n, muA: A.mu, muB: B.mu,
      mu, delta: best.dl, total });
    act = act.filter((_, i) => i !== best.p && i !== best.q);
    act.push({ id: n + t, n: N, mu });
  }
  return merges;
}

/** Node colors: a new color when two samples merge, else the bigger
 *  child's (samples are gray). */
function wardColors(n, merges) {
  const col = Array(2 * n - 1).fill(GRAY), size = Array(2 * n - 1).fill(1);
  let next = 0;
  merges.forEach((m, t) => {
    const id = n + t;
    size[id] = m.na + m.nb;
    if (m.na === 1 && m.nb === 1) col[id] = PALETTE[next++ % PALETTE.length];
    else col[id] = col[m.na >= m.nb ? m.a : m.b];
  });
  return col;
}

/** Each sample's cluster (node id) after the first t merges. */
function wardLabels(n, merges, t) {
  const lab = Array.from({ length: n }, (_, i) => i);
  for (let s = 0; s < t; s++) {
    const { a, b } = merges[s];
    for (let i = 0; i < n; i++) {
      if (lab[i] === a || lab[i] === b) lab[i] = n + s;
    }
  }
  return lab;
}

/** Samples under each node: (2n - 1,) arrays of sample indices. */
function wardMembers(n, merges) {
  const mem = Array.from({ length: n }, (_, i) => [i]);
  merges.forEach(m => mem.push([...mem[m.a], ...mem[m.b]]));
  return mem;
}

// ---------------------------------------------------------------------

/**
 * Run Ward's method on a pixel grid, merging only touching regions.
 *
 * Candidate pairs sit in a min-heap keyed by ΔWCSS; an entry whose
 * cluster has since merged is skipped when popped (its key is stale).
 * Region ids: pixels 0..n-1 (row-major), merge t makes region n + t.
 *
 * Args:
 *   F (Float64Array): (n * d,) features, pixel-major
 *   w (number): image width in pixels
 *   h (number): image height in pixels
 *   d (number): features per pixel
 *
 * Returns:
 *   (object): {a, b (Int32Array): (n - 1,) merged regions,
 *     delta, total (Float64Array): (n - 1,) ΔWCSS of each merge and the
 *     total WCSS after it}
 */
function wardGrid(F, w, h, d) {
  const n = w * h, N = 2 * n - 1;
  const cnt = new Float64Array(N), sum = new Float64Array(N * d);
  const alive = new Uint8Array(N), adj = new Array(N);
  for (let i = 0; i < n; i++) {
    cnt[i] = 1;
    alive[i] = 1;
    for (let c = 0; c < d; c++) sum[i * d + c] = F[i * d + c];
    adj[i] = new Set();
  }
  const heap = makeHeap(4 * n);
  const cost = (p, q) => {
    let s = 0;
    for (let c = 0; c < d; c++) {
      const diff = sum[p * d + c] / cnt[p] - sum[q * d + c] / cnt[q];
      s += diff * diff;
    }
    return cnt[p] * cnt[q] / (cnt[p] + cnt[q]) * s;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      for (const j of [x + 1 < w ? i + 1 : -1, y + 1 < h ? i + w : -1]) {
        if (j < 0) continue;
        adj[i].add(j);
        adj[j].add(i);
        heap.push(cost(i, j), i, j);
      }
    }
  }
  const A = new Int32Array(n - 1), B = new Int32Array(n - 1);
  const delta = new Float64Array(n - 1), total = new Float64Array(n - 1);
  let tot = 0;
  for (let t = 0; t < n - 1; t++) {
    let e;
    do { e = heap.pop(); } while (!alive[e.a] || !alive[e.b]);
    const a = e.a, b = e.b, c = n + t;
    A[t] = a;
    B[t] = b;
    delta[t] = e.key;
    tot += e.key;
    total[t] = tot;
    alive[a] = alive[b] = 0;
    alive[c] = 1;
    cnt[c] = cnt[a] + cnt[b];
    for (let k = 0; k < d; k++) sum[c * d + k] = sum[a * d + k] + sum[b * d + k];
    const [big, small] = adj[a].size >= adj[b].size ? [adj[a], adj[b]] :
      [adj[b], adj[a]];
    for (const u of small) big.add(u);
    big.delete(a);
    big.delete(b);
    adj[c] = big;
    adj[a] = adj[b] = null;
    for (const u of big) {
      const s = adj[u];
      s.delete(a);
      s.delete(b);
      s.add(c);
      heap.push(cost(c, u), c, u);
    }
  }
  return { a: A, b: B, delta, total };
}

/** Binary min-heap of (key, a, b) on growable typed arrays. */
function makeHeap(cap) {
  let K = new Float64Array(cap), A = new Int32Array(cap);
  let B = new Int32Array(cap), size = 0;
  const swap = (i, j) => {
    [K[i], K[j]] = [K[j], K[i]];
    [A[i], A[j]] = [A[j], A[i]];
    [B[i], B[j]] = [B[j], B[i]];
  };
  return {
    push(key, a, b) {
      if (size === K.length) {
        const k2 = new Float64Array(2 * size), a2 = new Int32Array(2 * size);
        const b2 = new Int32Array(2 * size);
        k2.set(K);
        a2.set(A);
        b2.set(B);
        K = k2;
        A = a2;
        B = b2;
      }
      let i = size++;
      K[i] = key;
      A[i] = a;
      B[i] = b;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (K[p] <= K[i]) break;
        swap(i, p);
        i = p;
      }
    },
    pop() {
      const out = { key: K[0], a: A[0], b: B[0] };
      size--;
      if (size > 0) {
        K[0] = K[size];
        A[0] = A[size];
        B[0] = B[size];
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < size && K[l] < K[m]) m = l;
          if (r < size && K[r] < K[m]) m = r;
          if (m === i) break;
          swap(i, m);
          i = m;
        }
      }
      return out;
    },
  };
}

/**
 * Label each pixel by its region after the first m merges.
 *
 * Returns:
 *   (Int32Array): (n,) region id of each pixel
 */
function gridLabels(n, merges, m) {
  const parent = new Int32Array(n + m);
  for (let i = 0; i < n + m; i++) parent[i] = i;
  for (let t = 0; t < m; t++) {
    parent[merges.a[t]] = n + t;
    parent[merges.b[t]] = n + t;
  }
  const find = i => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) {
      const nx = parent[i];
      parent[i] = r;
      i = nx;
    }
    return r;
  };
  const lab = new Int32Array(n);
  for (let i = 0; i < n; i++) lab[i] = find(i);
  return lab;
}
