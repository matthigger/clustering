// Demo datasets for the k-means and Ward's tabs, each with a few
// parameters the student can adjust (sliders under the dataset picker).
// Samples come from a seeded generator, so a dataset is the same on every
// visit until New draw changes its seed.
//
// Dataset record:
//   {id, name, k, gen(rng, p) -> array of [x, y], params?, ward (count
//    scale for Ward's tab, whose dendrogram needs few leaves, or 0 to
//    leave it out), kmeans? (false to leave it out), starts?(p) ->
//    {label: (k, 2) means}, init? (default start: a starts label)}
//   params: [[key, label, min, max, step, default, count?]]; count
//    params are sample counts, scaled by the tab's count scale

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

const DATASETS = [
  {
    id: "blobs", name: "three blobs", k: 3, ward: .25,
    params: [["n", "samples per blob", 5, 150, 5, 60, true],
      ["sd", "spread", 0.3, 3, 0.1, 1.1], ["sep", "distance apart", 0.3, 1.6,
        0.05, 1]],
    gen: (rng, p) => [[-4, -2], [3, -3], [0.5, 4]].flatMap(c =>
      blob(rng, p.n, [c[0] * p.sep, c[1] * p.sep], p.sd)),
    starts: p => ({ "two in one blob": [[-4.6, -2.2], [-3.4, -1.8],
      [1.8, 0.4]].map(([x, y]) => [x * p.sep, y * p.sep]) }),
  },
  {
    id: "six", name: "six points", k: 2, ward: 0,
    gen: () => [[0, 0], [1, 1], [0, 2], [3, 2], [5, 4], [6, 4]],
    starts: () => ({ "fixed start": [[0, 2], [1, 1]] }),
    init: "fixed start",
  },
  {
    id: "fivept", name: "five points", k: 2, ward: 1, kmeans: false,
    gen: () => [[0, 1], [3, 3], [3, 5], [4, 1], [6, 3]],
  },
  {
    id: "five", name: "how many?", k: 3, ward: .25,
    params: [["n", "samples per blob", 5, 120, 5, 50, true],
      ["sd", "spread", 0.3, 2.5, 0.05, 0.95],
      ["close", "close pair apart", 0.5, 6, 0.1, 3]],
    gen: (rng, p) => {
      const u = [0.83, -1], m = [-4, 2.8];
      const pair = [-.5, .5].map(t => [m[0] + t * p.close * u[0] / 1.3,
        m[1] + t * p.close * u[1] / 1.3]);
      return [...pair, [4, 4.5], [-2, -4.5], [4.5, -2.5]].flatMap(c =>
        blob(rng, p.n, c, p.sd));
    },
  },
  {
    id: "unequal", name: "one big, two small", k: 3, ward: .2,
    params: [["nb", "big: samples", 30, 400, 10, 240, true],
      ["sb", "big: spread", 0.8, 3.5, 0.1, 2.1],
      ["ns", "small: samples", 5, 80, 5, 25, true],
      ["ss", "small: spread", 0.15, 1.5, 0.05, 0.45]],
    gen: (rng, p) => [
      ...blob(rng, p.nb, [-1.5, 0], p.sb),
      ...blob(rng, p.ns, [5, 3.2], p.ss),
      ...blob(rng, p.ns, [5, -3.2], p.ss)],
  },
  {
    id: "stretched", name: "stretched", k: 3, ward: .25,
    params: [["n", "samples per bar", 10, 150, 5, 60, true],
      ["len", "length", 0.5, 6, 0.1, 3.6], ["gap", "gap", 1, 5, 0.1, 3]],
    gen: (rng, p) => {
      const c = Math.cos(.45), sn = Math.sin(.45), pts = [];
      for (const off of [-p.gap, 0, p.gap]) {
        for (let i = 0; i < p.n; i++) {
          const u = p.len * gauss(rng), v = off + 0.35 * gauss(rng);
          pts.push([c * u - sn * v, sn * u + c * v]);
        }
      }
      return pts;
    },
  },
  {
    id: "moons", name: "moons", k: 2, ward: .25,
    params: [["n", "samples per moon", 10, 250, 10, 100, true],
      ["sd", "noise", 0, 1.2, 0.05, 0.35]],
    gen: (rng, p) => [
      ...arc(rng, p.n, [-2, -1], 4, 0, Math.PI, p.sd),
      ...arc(rng, p.n, [2, 1], 4, Math.PI, 2 * Math.PI, p.sd)],
  },
  {
    id: "rings", name: "rings", k: 2, ward: .25,
    params: [["ni", "inner: samples", 10, 200, 10, 70, true],
      ["no", "outer: samples", 20, 400, 10, 190, true],
      ["r", "inner radius", 0.3, 4.5, 0.1, 1.4],
      ["sd", "noise", 0, 1.2, 0.05, 0.3]],
    gen: (rng, p) => [
      ...arc(rng, p.ni, [0, 0], p.r, 0, 2 * Math.PI, p.sd),
      ...arc(rng, p.no, [0, 0], 5.5, 0, 2 * Math.PI, p.sd)],
  },
  {
    id: "smiley", name: "smiley", k: 4, ward: .25,
    params: [["n", "samples on the face", 40, 400, 10, 170, true],
      ["sd", "noise", 0, 1, 0.05, 0.2],
      ["smile", "smile width", 0.1, 0.9, 0.05, 0.6]],
    gen: (rng, p) => {
      const f = p.n / 170, h = p.smile / 2;
      return [
        ...arc(rng, p.n, [0, 0], 6.5, 0, 2 * Math.PI, p.sd),
        ...blob(rng, Math.round(30 * f), [-2.3, 2.2], 0.45 + p.sd),
        ...blob(rng, Math.round(30 * f), [2.3, 2.2], 0.45 + p.sd),
        ...arc(rng, Math.round(70 * f), [0, 0.6], 3.6, (1.5 - h) * Math.PI,
          (1.5 + h) * Math.PI, p.sd)];
    },
  },
  {
    id: "uniform", name: "no clusters", k: 4, ward: .2,
    params: [["n", "samples", 20, 600, 10, 250, true]],
    gen: (rng, p) => Array.from({ length: p.n }, () =>
      [12 * rng() - 6, 12 * rng() - 6]),
  },
];

/** Datasets for one tab ("kmeans" or "ward"), with their samples. */
function datasetsFor(tab) {
  return DATASETS.filter(d => (tab === "ward" ? d.ward > 0 :
    d.kmeans !== false)).map(d => {
    const s = tab === "ward" ? d.ward : 1;
    const params = (d.params || []).map(([key, label, lo, hi, step, def,
      count]) => (count ? [key, label, Math.max(2, Math.round(lo * s)),
      Math.round(hi * s), Math.max(1, Math.round(step * s)),
      Math.max(2, Math.round(def * s)), true] :
      [key, label, lo, hi, step, def, false]));
    const e = { ...d, params, seed: 0,
      p: Object.fromEntries(params.map(q => [q[0], q[5]])) };
    regen(e);
    return e;
  });
}

/** Redraw dataset d's samples X (and starts) from its seed and params. */
function regen(d) {
  const rng = makeRng(7 + d.id.length * 131 + d.id.charCodeAt(0) +
    7919 * d.seed);
  const p = { ...d.p };
  for (const q of d.params) if (q[6]) p[q[0]] = Math.round(p[q[0]]);
  d.X = d.gen(rng, p);
  d.st = d.starts ? d.starts(p) : null;
}

/**
 * Build sliders for dataset d's params, plus a New draw button.
 *
 * Args:
 *   el (Element): container, emptied first
 *   d (object): dataset from datasetsFor
 *   onChange (Function): () -> called after d.X is redrawn
 */
function paramControls(el, d, onChange) {
  el.innerHTML = d.params.map(([key, label, lo, hi, step]) =>
    `<label class="slider"><span>${label}</span><span class="pair"><input
    type="range" data-key="${key}" min="${lo}" max="${hi}" step="${step}"
    value="${d.p[key]}"><b>${+d.p[key].toFixed(2)}</b></span></label>`)
    .join("") + (d.params.length ? `<div class="buttons"><button
    class="redraw">New draw</button><button class="defaults">Defaults</button>
    </div>` : "");
  for (const r of el.querySelectorAll("input[type=range]")) {
    r.addEventListener("input", () => {
      d.p[r.dataset.key] = +r.value;
      r.nextElementSibling.textContent = +(+r.value).toFixed(2);
      regen(d);
      onChange();
    });
  }
  const redraw = el.querySelector(".redraw");
  if (!redraw) return;
  redraw.onclick = () => { d.seed++; regen(d); onChange(); };
  el.querySelector(".defaults").onclick = () => {
    for (const q of d.params) d.p[q[0]] = q[5];
    d.seed = 0;
    regen(d);
    paramControls(el, d, onChange);
    onChange();
  };
}
