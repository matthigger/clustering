// Demo datasets for the k-means and Ward's tabs. Each generator draws
// from a seeded generator, so a dataset is the same on every visit; s
// scales the sample counts (1 for k-means, smaller for Ward's, whose
// dendrogram needs few leaves).
//
// Dataset record:
//   {id, name, k, gen(rng, s) -> array of [x, y], ward (s for Ward's tab,
//    or 0 to leave it out), starts? {label: (k, 2) means}, init? (the
//    default start: a starts label, else random samples)}

/** n draws from a round Gaussian at c with standard deviation sd. */
function blob(rng, n, c, sd) {
  return Array.from({ length: n }, () =>
    [c[0] + sd * gauss(rng), c[1] + sd * gauss(rng)]);
}

/** n draws near an arc of radius r about c, angles a0..a1 (radians). */
function arc(rng, n, c, r, a0, a1, sd) {
  return Array.from({ length: n }, () => {
    const t = a0 + (a1 - a0) * rng();
    return [c[0] + r * Math.cos(t) + sd * gauss(rng),
      c[1] + r * Math.sin(t) + sd * gauss(rng)];
  });
}

/** Count scaled by s, at least lo. */
const cnt = (n, s, lo = 3) => Math.max(lo, Math.round(n * s));

const DATASETS = [
  {
    id: "blobs", name: "three blobs", k: 3, ward: .25,
    gen: (rng, s) => [
      ...blob(rng, cnt(60, s), [-4, -2], 1.1),
      ...blob(rng, cnt(60, s), [3, -3], 1.1),
      ...blob(rng, cnt(60, s), [0.5, 4], 1.1)],
    starts: { "two in one blob": [[-4.6, -2.2], [-3.4, -1.8], [1.8, 0.4]] },
  },
  {
    id: "six", name: "six points", k: 2, ward: 0,
    gen: () => [[0, 0], [1, 1], [0, 2], [3, 2], [5, 4], [6, 4]],
    starts: { "fixed start": [[0, 2], [1, 1]] }, init: "fixed start",
  },
  {
    id: "fivept", name: "five points", k: 2, ward: 1, kmeans: false,
    gen: () => [[0, 1], [3, 3], [3, 5], [4, 1], [6, 3]],
  },
  {
    id: "five", name: "how many?", k: 3, ward: .25,
    gen: (rng, s) => [
      ...blob(rng, cnt(50, s), [-5, 4], 0.9),
      ...blob(rng, cnt(50, s), [-3, 1.6], 0.9),
      ...blob(rng, cnt(50, s), [4, 4.5], 1),
      ...blob(rng, cnt(50, s), [-2, -4.5], 1),
      ...blob(rng, cnt(50, s), [4.5, -2.5], 1)],
  },
  {
    id: "unequal", name: "one big, two small", k: 3, ward: .2,
    gen: (rng, s) => [
      ...blob(rng, cnt(240, s), [-1.5, 0], 2.1),
      ...blob(rng, cnt(25, s), [5, 3.2], 0.45),
      ...blob(rng, cnt(25, s), [5, -3.2], 0.45)],
  },
  {
    id: "stretched", name: "stretched", k: 3, ward: .25,
    gen: (rng, s) => {
      const c = Math.cos(.45), sn = Math.sin(.45), pts = [];
      for (const off of [-3, 0, 3]) {
        for (let i = 0; i < cnt(60, s); i++) {
          const u = 3.6 * gauss(rng), v = off + 0.35 * gauss(rng);
          pts.push([c * u - sn * v, sn * u + c * v]);
        }
      }
      return pts;
    },
  },
  {
    id: "moons", name: "moons", k: 2, ward: .25,
    gen: (rng, s) => [
      ...arc(rng, cnt(100, s), [-2, -1], 4, 0, Math.PI, 0.35),
      ...arc(rng, cnt(100, s), [2, 1], 4, Math.PI, 2 * Math.PI, 0.35)],
  },
  {
    id: "rings", name: "rings", k: 2, ward: .25,
    gen: (rng, s) => [
      ...arc(rng, cnt(70, s), [0, 0], 1.4, 0, 2 * Math.PI, 0.3),
      ...arc(rng, cnt(190, s), [0, 0], 5.5, 0, 2 * Math.PI, 0.3)],
  },
  {
    id: "smiley", name: "smiley", k: 4, ward: .25,
    gen: (rng, s) => [
      ...arc(rng, cnt(170, s), [0, 0], 6.5, 0, 2 * Math.PI, 0.2),
      ...blob(rng, cnt(30, s), [-2.3, 2.2], 0.45),
      ...blob(rng, cnt(30, s), [2.3, 2.2], 0.45),
      ...arc(rng, cnt(70, s), [0, 0.6], 3.6, 1.2 * Math.PI, 1.8 * Math.PI,
        0.2)],
  },
  {
    id: "uniform", name: "no clusters", k: 4, ward: .2,
    gen: (rng, s) => Array.from({ length: cnt(250, s) }, () =>
      [12 * rng() - 6, 12 * rng() - 6]),
  },
];

/** Datasets for one tab ("kmeans" or "ward"), with their samples. */
function datasetsFor(tab) {
  return DATASETS.filter(d => (tab === "ward" ? d.ward > 0 :
    d.kmeans !== false)).map(d => ({ ...d,
    X: d.gen(makeRng(7 + d.id.length * 131 + d.id.charCodeAt(0)),
      tab === "ward" ? d.ward : 1) }));
}
