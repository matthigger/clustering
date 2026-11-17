// k-means tab (Lloyd's algorithm). Play alternates two steps: assign
// each sample to its nearest mean, then update each mean to the average
// of its samples. Every step is logged as events (a sample switching
// cluster, a mean moving, the stop) that the log can redraw on hover;
// each step keeps a snapshot of the means and labels, so Back undoes it.
//
// Step entry:
//   {type: "start" | "assign" | "update", wcss? (after the step),
//    mu (k, 2) after, assign (n,) after (-1 = no cluster yet),
//    events: [{kind, ...geometry}], stop? (true on the final assign)}

// ---------------------------------------------------------------- tab

const KM_BOX = { w: 700, h: 700, x0: 42, x1: 686, y0: 14, y1: 658 };
const KM_LOG_MAX = 10;

const K = {
  sets: datasetsFor("kmeans"),
  set: null,
  k: 3,
  init: "random",
  seed: 2,
  steps: [],
  rng: null,
  runs: {},
  hl: null,
  expanded: new Set(),
  drag: null,
  plane: makePlane(KM_BOX),
};
K.set = K.sets[0];

const kPlane = document.getElementById("k-plane");
const kLog = document.getElementById("k-log");
const kChart = document.getElementById("k-chart");
const kRuns = document.getElementById("k-runs");

const kLast = () => K.steps.at(-1);
const kDone = () => !!kLast().stop;

/** Start a run: means from the chosen start method (or given). */
function kReset(mu = null, how = null) {
  K.rng = makeRng(1000 + K.seed);
  const X = K.set.X;
  let starts = null;
  if (!mu) {
    if (K.set.starts && K.set.starts[K.init]) {
      mu = K.set.starts[K.init].map(m => [...m]);
      how = K.init;
    } else {
      starts = (K.init === "pp" ? initPP : initRandom)(X, K.k, K.rng);
      mu = starts.map(i => [...X[i]]);
      how = K.init === "pp" ? "k-means++" : "random samples";
    }
  }
  K.k = mu.length;
  K.steps = [{ type: "start", how, mu, assign: X.map(() => -1),
    events: mu.map((m, j) => ({ kind: "start", j, q: [...m],
      i: starts ? starts[j] : -1 })) }];
  K.expanded.clear();
  K.hl = null;
}

/** Run the next step; false once converged. */
function kStep() {
  if (kDone()) return false;
  const X = K.set.X, last = kLast();
  if (last.type !== "assign") {
    const r = kmAssign(X, last.mu, last.assign);
    const entry = { type: "assign", mu: last.mu, assign: r.assign,
      events: r.events, wcss: kmWcss(X, last.mu, r.assign) };
    if (last.type === "update" && r.events.length === 0) {
      entry.stop = true;
      entry.events = [{ kind: "stop", mu: last.mu.map(m => [...m]),
        wcss: entry.wcss }];
      const runs = K.runs[K.set.id] = K.runs[K.set.id] || [];
      runs.push({ k: K.k, wcss: entry.wcss });
    }
    K.steps.push(entry);
  } else {
    const r = kmUpdate(X, last.mu, last.assign, K.rng);
    K.steps.push({ type: "update", mu: r.mu, assign: last.assign,
      events: r.events, wcss: kmWcss(X, r.mu, last.assign) });
  }
  K.hl = null;
  kDraw();
  return !kDone();
}

const kPlay = player(kStep, playing => {
  playIcon(document.getElementById("k-play"), playing);
});

// ------------------------------------------------------------ drawing

/** Clip convex polygon poly to the half-plane {x : a·x <= b}. */
function clipHalf(poly, a, b) {
  const out = [], f = q => a[0] * q[0] + a[1] * q[1] - b;
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length], fp = f(p), fq = f(q);
    if (fp <= 0) out.push(p);
    if (fp * fq < 0) {
      const t = fp / (fp - fq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  });
  return out;
}

/** Voronoi cell of each mean, clipped to the plane's domain. */
function voronoi(mu, dom) {
  const box = [[dom.x[0], dom.y[0]], [dom.x[1], dom.y[0]],
    [dom.x[1], dom.y[1]], [dom.x[0], dom.y[1]]];
  return mu.map((m, j) => {
    let poly = box;
    mu.forEach((o, i) => {
      if (i === j || d2(m, o) < 1e-18) return;
      const a = [o[0] - m[0], o[1] - m[1]];
      const b = (d2(o, [0, 0]) - d2(m, [0, 0])) / 2;
      poly = clipHalf(poly, a, b);
    });
    return poly;
  });
}

const sampleLbl = i => `<i>x</i>${subN(i + 1)}`;
const muLbl = j => `<i>μ</i>${subN(j + 1)}`;
const chip = j =>
  `<span class="chip" style="--c:${PALETTE[j]}">C${subN(j + 1)}</span>`;

function kDraw() {
  const P = K.plane, X = K.set.X, st = kLast();
  const small = X.length <= 12, r = small ? 8 : 4.6;
  let s = axesSvg(P, "k-clip") + `<g clip-path="url(#k-clip)">`;
  if (document.getElementById("k-vor").checked) {
    voronoi(st.mu, P.dom).forEach((poly, j) => {
      if (poly.length < 3) return;
      s += `<polygon class="cell" points="${poly.map(q => pxy(P, q))
        .join(" ")}" style="--c:${PALETTE[j]}"/>`;
    });
  }
  X.forEach((x, i) => {
    const c = st.assign[i] >= 0 ? PALETTE[st.assign[i]] : GRAY;
    s += `<circle class="pt" cx="${P.sx(x[0]).toFixed(1)}"
      cy="${P.sy(x[1]).toFixed(1)}" r="${r}" fill="${c}"/>`;
    if (small) {
      s += `<text class="lbl small" x="${P.sx(x[0]) + 10}"
        y="${P.sy(x[1]) - 9}">x${subN(i + 1)}</text>`;
    }
  });
  s += `<g id="k-hl">${K.hl ? kHlSvg(K.hl) : ""}</g>`;
  st.mu.forEach((m, j) => {
    const cx = P.sx(m[0]), cy = P.sy(m[1]);
    s += `<g class="mean" data-h="mu${j}" style="--c:${PALETTE[j]}">
      <circle cx="${cx}" cy="${cy}" r="11"/><path d="M${cx - 5} ${cy}h10
      M${cx} ${cy - 5}v10"/></g><text class="lbl mu" x="${cx + 14}"
      y="${cy - 10}" style="fill:${PALETTE[j]}">μ${subN(j + 1)}</text>`;
  });
  kPlane.innerHTML = s + "</g>";
  kRead();
  kDrawChart();
  kDrawLog();
  kDrawRuns();
}

/** Overlay SVG for highlighted events (array of event objects). */
function kHlSvg(evs) {
  const P = K.plane, X = K.set.X;
  const at = q => [P.sx(q[0]), P.sy(q[1])];
  const ring = (q, rr = 9) => {
    const [x, y] = at(q);
    return `<circle class="ring" cx="${x}" cy="${y}" r="${rr}"/>`;
  };
  const seg = (a, b, cls, c) => {
    const [x1, y1] = at(a), [x2, y2] = at(b);
    return `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}"
      y2="${y2}" style="--c:${c}"/>`;
  };
  const tag = (a, b, txt, c) => {
    const [x1, y1] = at(a), [x2, y2] = at(b);
    return `<text class="lbl small" x="${(x1 + x2) / 2 + 6}"
      y="${(y1 + y2) / 2 - 6}" style="fill:${c}">${txt}</text>`;
  };
  const few = evs.length <= 3;
  let s = "";
  for (const e of evs) {
    if (e.kind === "start") {
      s += ring(e.q, 17);
      if (e.i >= 0) s += ring(X[e.i], 9);
    } else if (e.kind === "join") {
      for (const i of e.members) s += seg(X[i], e.mu, "spoke", PALETTE[e.j]);
      s += ring(e.mu, 17);
    } else if (e.kind === "switch") {
      const x = X[e.i];
      s += seg(x, e.muFrom, "was", PALETTE[e.from]);
      s += seg(x, e.muTo, "now", PALETTE[e.to]);
      s += ring(x, 9);
      if (few) {
        s += tag(x, e.muFrom, fmt3(e.dFrom), PALETTE[e.from]);
        s += tag(x, e.muTo, fmt3(e.dTo), PALETTE[e.to]);
      }
    } else if (e.kind === "move" || e.kind === "empty") {
      if (e.kind === "move" && few) {
        for (const i of e.members) s += seg(X[i], e.q, "spoke", PALETTE[e.j]);
      }
      if (e.kind === "empty") s += ring(X[e.i], 9);
      const [x1, y1] = at(e.p), [x2, y2] = at(e.q);
      s += `<circle class="ghost" cx="${x1}" cy="${y1}" r="11"
        style="--c:${PALETTE[e.j]}"/>`;
      s += arrowPx(x1, y1, x2, y2, "mv");
      s += ring(e.q, 17);
    } else if (e.kind === "stop") {
      for (const m of e.mu) s += ring(m, 19);
      const [x, y] = at(e.mu[0]);
      s += `<text class="lbl ink" x="${x + 20}" y="${y + 30}">converged</text>`;
    }
  }
  return s;
}

/** Log text for one event. */
function kEventTxt(e) {
  switch (e.kind) {
    case "start":
      return `${muLbl(e.j)} starts at ${fpt(e.q)}` +
        (e.i >= 0 ? `, sample ${sampleLbl(e.i)}` : "");
    case "join":
      return `${chip(e.j)} gets ${e.members.length} sample${
        e.members.length === 1 ? "" : "s"}: ${muLbl(e.j)} is their nearest
        mean`;
    case "switch":
      return `${sampleLbl(e.i)} switches ${chip(e.from)} → ${chip(e.to)}:
        ‖${sampleLbl(e.i)} − ${muLbl(e.to)}‖² = ${fmt3(e.dTo)} &lt;
        ${fmt3(e.dFrom)}`;
    case "move":
      return `${muLbl(e.j)} moves ${fpt(e.p)} → ${fpt(e.q)}, the mean of
        its ${e.n} sample${e.n === 1 ? "" : "s"}`;
    case "empty":
      return `${chip(e.j)} is empty: ${muLbl(e.j)} restarts at
        ${sampleLbl(e.i)} (a k-means++ draw)`;
    case "stop":
      return `No sample switched, so no mean will move: converged. Stop at
        WCSS ${fmt3(e.wcss)}.`;
  }
  return "";
}

/** Log heading for step entry s (index t). */
function kHeadTxt(s, t) {
  if (s.type === "start") {
    return `<b>Start</b> · <i>k</i> = ${s.mu.length} means, ${s.how}`;
  }
  const prev = K.steps[t - 1].wcss;
  const w = prev === undefined ? `WCSS ${fmt3(s.wcss)}` :
    `WCSS ${fmt3(prev)} → ${fmt3(s.wcss)}`;
  let what;
  if (s.type === "assign") {
    const n = s.events.filter(e => e.kind === "switch").length;
    what = s.stop ? "nothing switches" : t === 1 ? "every sample to its " +
      "nearest mean" : `${n} sample${n === 1 ? "" : "s"} switch`;
  } else {
    const n = s.events.length;
    what = `${n} mean${n === 1 ? "" : "s"} move${n === 1 ? "s" : ""}`;
  }
  return `<b>Step ${t}</b> · <span class="ty ${s.type}">${s.type}</span> ·
    ${what} · ${w}`;
}

function kDrawLog() {
  const atEnd = kLog.scrollTop + kLog.clientHeight >= kLog.scrollHeight - 8;
  let s = "";
  K.steps.forEach((st, t) => {
    const all = K.expanded.has(t) || st.events.length <= KM_LOG_MAX + 1;
    const shown = all ? st.events : st.events.slice(0, KM_LOG_MAX);
    s += `<div class="entry"><div class="head" data-s="${t}">${
      kHeadTxt(st, t)}</div><ul>`;
    shown.forEach((e, i) => {
      s += `<li data-s="${t}" data-e="${i}">${kEventTxt(e)}</li>`;
    });
    if (!all) {
      s += `<li class="more" data-s="${t}" data-more="1">+ ${
        st.events.length - KM_LOG_MAX} more (click to list)</li>`;
    }
    s += "</ul></div>";
  });
  kLog.innerHTML = s;
  if (atEnd || kPlay.playing()) kLog.scrollTop = kLog.scrollHeight;
}

/** Events behind a hovered log element (or null). */
function kEventsOf(el) {
  if (!el) return null;
  const st = K.steps[+el.dataset.s];
  if (!st) return null;
  if (el.dataset.e !== undefined) return [st.events[+el.dataset.e]];
  if (el.dataset.more) return st.events.slice(KM_LOG_MAX);
  return st.events;
}

function kSetHl(evs, el = null) {
  K.hl = evs;
  document.getElementById("k-hl").innerHTML = evs ? kHlSvg(evs) : "";
  for (const h of kLog.querySelectorAll(".on")) h.classList.remove("on");
  if (el) el.classList.add("on");
}

kLog.addEventListener("mouseover", e => {
  const el = e.target.closest("[data-s]");
  kSetHl(kEventsOf(el), el);
});
kLog.addEventListener("mouseleave", () => kSetHl(null));
kLog.addEventListener("click", e => {
  const el = e.target.closest("[data-more]");
  if (!el) return;
  K.expanded.add(+el.dataset.s);
  kDrawLog();
});

function kRead() {
  const st = kLast(), t = K.steps.length - 1;
  const next = kDone() ? "none: converged" : st.type === "assign" ?
    "update the means" : "assign the samples";
  document.getElementById("k-read").innerHTML =
    row("step", t) +
    row("WCSS", st.wcss === undefined ? "no clusters yet" : fmt3(st.wcss)) +
    row("next", next);
  document.getElementById("k-step").disabled = kDone();
  document.getElementById("k-back").disabled = K.steps.length < 2;
}

// ------------------------------------------------------- WCSS chart

const KC = { w: 460, h: 180, x0: 50, x1: 446, y0: 10, y1: 142 };

function kDrawChart() {
  const pts = K.steps.flatMap((s, t) => (s.wcss === undefined ? [] :
    [{ t, w: s.wcss, type: s.type }]));
  const tMax = Math.max(6, K.steps.length - 1);
  let lo = 0, hi = 1;
  if (pts.length) {
    lo = Math.min(...pts.map(p => p.w));
    hi = Math.max(...pts.map(p => p.w));
    const pad = Math.max((hi - lo) * .12, hi * .02, 1e-6);
    lo = Math.max(0, lo - pad);
    hi += pad;
  }
  const sx = t => KC.x0 + (t / tMax) * (KC.x1 - KC.x0);
  const sy = w => KC.y1 - (w - lo) / (hi - lo) * (KC.y1 - KC.y0);
  let s = `<rect class="frame" x="${KC.x0}" y="${KC.y0}" width="${
    KC.x1 - KC.x0}" height="${KC.y1 - KC.y0}"/>`;
  const ys = niceStep((hi - lo) / 4);
  for (let v = Math.ceil(lo / ys) * ys; v <= hi; v += ys) {
    s += `<line class="grid" x1="${KC.x0}" x2="${KC.x1}" y1="${sy(v)}"
      y2="${sy(v)}"/><text class="tick" x="${KC.x0 - 6}" y="${sy(v) + 4}"
      text-anchor="end">${fmtTick(v)}</text>`;
  }
  const xs = niceStep(tMax / 8);
  for (let t = 0; t <= tMax; t += xs) {
    s += `<text class="tick" x="${sx(t)}" y="${KC.y1 + 15}"
      text-anchor="middle">${t}</text>`;
  }
  s += `<text class="axis-label sm" x="${(KC.x0 + KC.x1) / 2}"
    y="${KC.y1 + 33}" text-anchor="middle">step</text>`;
  if (pts.length > 1) {
    s += `<polyline class="c-line" points="${pts.map(p =>
      `${sx(p.t)},${sy(p.w)}`).join(" ")}"/>`;
  }
  for (const p of pts) {
    s += `<circle class="cpt ${p.type}" data-s="${p.t}" cx="${sx(p.t)}"
      cy="${sy(p.w)}" r="5"/>`;
  }
  kChart.innerHTML = s;
}

kChart.addEventListener("mouseover", e => {
  const el = e.target.closest("[data-s]");
  if (!el) return;
  const head = kLog.querySelector(`.head[data-s="${el.dataset.s}"]`);
  kSetHl(K.steps[+el.dataset.s].events, head);
  if (head) head.scrollIntoView({ block: "nearest" });
});
kChart.addEventListener("mouseleave", () => kSetHl(null));

// ------------------------------------------------- finished runs chart

const KR = { w: 460, h: 190, x0: 50, x1: 446, y0: 12, y1: 152 };

function kDrawRuns() {
  const runs = K.runs[K.set.id] || [];
  const el = document.getElementById("k-runs-note");
  el.textContent = runs.length ? `${runs.length} finished run${
    runs.length === 1 ? "" : "s"} on this dataset; the lowest WCSS for
    each k is filled.` : "Runs that converge on this dataset land here.";
  const hi = runs.length ? Math.max(...runs.map(r => r.wcss)) * 1.08 : 1;
  const sx = k => KR.x0 + (k - .5) / 8 * (KR.x1 - KR.x0);
  const sy = w => KR.y1 - w / hi * (KR.y1 - KR.y0);
  let s = `<rect class="frame" x="${KR.x0}" y="${KR.y0}" width="${
    KR.x1 - KR.x0}" height="${KR.y1 - KR.y0}"/>`;
  const ys = niceStep(hi / 4);
  for (let v = 0; v <= hi; v += ys) {
    s += `<line class="grid" x1="${KR.x0}" x2="${KR.x1}" y1="${sy(v)}"
      y2="${sy(v)}"/><text class="tick" x="${KR.x0 - 6}" y="${sy(v) + 4}"
      text-anchor="end">${fmtTick(v)}</text>`;
  }
  for (let k = 1; k <= 8; k++) {
    s += `<text class="tick" x="${sx(k)}" y="${KR.y1 + 15}"
      text-anchor="middle">${k}</text>`;
  }
  s += `<text class="axis-label sm" x="${(KR.x0 + KR.x1) / 2}"
    y="${KR.y1 + 33}" text-anchor="middle">k</text>`;
  const best = {};
  for (const r of runs) best[r.k] = Math.min(best[r.k] ?? Infinity, r.wcss);
  const ks = Object.keys(best).map(Number).sort((a, b) => a - b);
  if (ks.length > 1) {
    s += `<polyline class="c-line" points="${ks.map(k =>
      `${sx(k)},${sy(best[k])}`).join(" ")}"/>`;
  }
  for (const r of runs) {
    const b = r.wcss === best[r.k];
    s += `<circle class="rpt${b ? " best" : ""}" cx="${sx(r.k)}"
      cy="${sy(r.wcss)}" r="${b ? 5.5 : 4.5}"><title>k = ${r.k}, WCSS ${
      fmt3(r.wcss)}</title></circle>`;
  }
  kRuns.innerHTML = s;
}

// ----------------------------------------------------------- controls

function kStartChoices() {
  const items = [["random", "random samples"], ["pp", "k-means++"]];
  for (const label of Object.keys(K.set.starts || {})) {
    items.push([label, label]);
  }
  segmented(document.getElementById("k-init"), items, v => {
    K.init = v;
    if (K.set.starts && K.set.starts[v]) {
      K.k = K.set.starts[v].length;
    }
    kRestart();
  });
}

function kSyncControls() {
  segSet(document.getElementById("k-sets"), K.set.id);
  segSet(document.getElementById("k-init"), K.init);
  document.getElementById("k-k").value = K.k;
  document.getElementById("k-kv").textContent = K.k;
}

function kRestart(mu = null, how = null) {
  kPlay.pause();
  kReset(mu, how);
  kSyncControls();
  kDraw();
}

function kPickSet(id) {
  K.set = K.sets.find(d => d.id === id);
  K.k = K.set.k;
  K.init = K.set.init || "random";
  K.plane.fit(K.set.X);
  kStartChoices();
  kRestart();
}

segmented(document.getElementById("k-sets"),
  K.sets.map(d => [d.id, d.name]), kPickSet);
segmented(document.getElementById("k-speed"), SPEEDS, v => {
  kPlay.rate = +v;
  segSet(document.getElementById("k-speed"), v);
});
segSet(document.getElementById("k-speed"), "1.5");

document.getElementById("k-k").addEventListener("input", e => {
  K.k = +e.target.value;
  if (K.set.starts && K.set.starts[K.init] &&
      K.set.starts[K.init].length !== K.k) {
    K.init = "random";
  }
  kRestart();
});
/** Back to step 0 of the current start. */
function kRewind() {
  kPlay.pause();
  K.steps = [K.steps[0]];
  K.rng = makeRng(1000 + K.seed);
  K.expanded.clear();
  K.hl = null;
  kDraw();
}

document.getElementById("k-play").onclick = () => {
  if (kDone()) kRewind();
  kPlay.toggle();
};
document.getElementById("k-step").onclick = () => { kPlay.pause(); kStep(); };
document.getElementById("k-back").onclick = () => {
  kPlay.pause();
  if (K.steps.length < 2) return;
  const s = K.steps.pop();
  if (s.stop) K.runs[K.set.id].pop();
  K.hl = null;
  kDraw();
};
document.getElementById("k-reset").onclick = kRewind;
document.getElementById("k-new").onclick = () => {
  K.seed++;
  if (K.init !== "pp") K.init = "random";
  kRestart();
};
document.getElementById("k-vor").onchange = () => kDraw();
document.getElementById("k-clear").onclick = () => {
  K.runs[K.set.id] = [];
  kDrawRuns();
};

dragOn(kPlane, {
  down: (h, q) => {
    if (!h || !h.startsWith("mu")) return false;
    kPlay.pause();
    K.drag = +h.slice(2);
    return true;
  },
  move: q => {
    const P = K.plane;
    const m = kLast().mu.map(v => [...v]);
    m[K.drag] = [clamp(P.ix(q.x), P.dom.x[0], P.dom.x[1]),
      clamp(P.iy(q.y), P.dom.y[0], P.dom.y[1])];
    kReset(m, "placed by hand");
    K.init = "hand";
    kSyncControls();
    kDraw();
  },
  up: () => { K.drag = null; },
});

let kShown = false;
function kmeansShow() {
  if (kShown) return;
  kShown = true;
  kPickSet(K.set.id);
}
