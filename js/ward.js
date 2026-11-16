// Ward's method tab. The whole merge sequence is computed when a dataset
// is picked; the tab shows the first t merges (Play / Step / Back, or
// drag the cut on the dendrogram). Dendrogram bars sit at the total WCSS
// after each merge, as in lesson 22 (scipy draws √(2 ΔWCSS) instead).
//
// Merge record (merge t makes node n + t; samples are nodes 0..n-1):
//   {a, b, na, nb, muA, muB, mu, delta, total}

// ---------------------------------------------------------------- tab

const W = {
  sets: datasetsFor("ward"),
  set: null,
  merges: [],
  col: [],
  mem: [],
  order: [],
  t: 0,
  hl: null,
  log: true,
  plane: makePlane(KM_BOX),
};
W.set = W.sets[0];

const wPlane = document.getElementById("w-plane");
const wDen = document.getElementById("w-den");
const wLog = document.getElementById("w-log");
const wN = () => W.set.X.length;

function wPickSet(id) {
  wPlay.pause();
  W.set = W.sets.find(d => d.id === id);
  const n = wN();
  W.merges = wardTree(W.set.X);
  W.col = wardColors(n, W.merges);
  W.mem = wardMembers(n, W.merges);
  W.order = W.mem[2 * n - 2].length ? wLeafOrder() : [];
  W.plane.fit(W.set.X);
  W.log = n > 12;
  segSet(document.getElementById("w-scale"), W.log ? "log" : "lin");
  W.t = 0;
  W.hl = null;
  segSet(document.getElementById("w-sets"), id);
  wDraw();
}

/** Leaves left to right: older child first at every node. */
function wLeafOrder() {
  const n = wN(), out = [];
  const walk = id => {
    if (id < n) { out.push(id); return; }
    const m = W.merges[id - n];
    walk(Math.min(m.a, m.b));
    walk(Math.max(m.a, m.b));
  };
  walk(2 * n - 2);
  return out;
}

function wStep() {
  if (W.t >= wN() - 1) return false;
  W.t++;
  W.hl = null;
  wDraw();
  return W.t < wN() - 1;
}

const wPlay = player(wStep, playing => {
  document.getElementById("w-play").textContent = playing ? "Pause" : "Play";
});

/** Short name of node id: its samples if few, else its size. */
function wName(id) {
  const m = W.mem[id], c = W.col[id];
  const txt = m.length <= 3 ? `{${m.map(i => `x${subN(i + 1)}`).join(", ")}}`
    : `${m.length} samples`;
  return `<span class="chip" style="--c:${c}">${txt}</span>`;
}

// ------------------------------------------------------------ drawing

function wDraw() {
  const P = W.plane, X = W.set.X, n = wN();
  const lab = wardLabels(n, W.merges, W.t);
  const small = n <= 12, r = small ? 8 : 5;
  const alive = [...new Set(lab)];
  let s = axesSvg(P, "w-clip") + `<g clip-path="url(#w-clip)">`;
  for (const id of alive) {
    if (W.mem[id].length < 2) continue;
    s += blobSvg(P, W.mem[id].map(i => X[i]), small ? 16 : 10,
      `class="blob" style="--c:${W.col[id]}"`);
  }
  if (document.getElementById("w-next").checked && W.t < n - 1) {
    const m = W.merges[W.t];
    s += `<line class="nextm" x1="${P.sx(m.muA[0])}" y1="${P.sy(m.muA[1])}"
      x2="${P.sx(m.muB[0])}" y2="${P.sy(m.muB[1])}"/>`;
  }
  X.forEach((x, i) => {
    s += `<circle class="pt" cx="${P.sx(x[0]).toFixed(1)}"
      cy="${P.sy(x[1]).toFixed(1)}" r="${r}" fill="${W.col[lab[i]]}"/>`;
    if (small) {
      s += `<text class="lbl small" x="${P.sx(x[0]) + 10}"
        y="${P.sy(x[1]) - 9}">x${subN(i + 1)}</text>`;
    }
  });
  if (document.getElementById("w-means").checked) {
    for (const id of alive) {
      if (W.mem[id].length < 2) continue;
      const mu = id < n ? X[id] : W.merges[id - n].mu;
      const cx = P.sx(mu[0]), cy = P.sy(mu[1]);
      s += `<path class="cross" d="M${cx - 6} ${cy - 6}l12 12M${cx + 6}
        ${cy - 6}l-12 12" style="--c:${W.col[id]}"/>`;
    }
  }
  s += `<g id="w-hl">${W.hl !== null ? wHlSvg(W.hl) : ""}</g></g>`;
  wPlane.innerHTML = s;
  wDrawDen();
  wDrawLog();
  wRead();
}

/** Overlay for merge t: both clusters, their means and the ΔWCSS. */
function wHlSvg(t) {
  const P = W.plane, X = W.set.X, m = W.merges[t], n = wN();
  const small = n <= 12;
  let s = "";
  for (const [id, cls] of [[m.a, "hlA"], [m.b, "hlB"]]) {
    const pts = W.mem[id].map(i => X[i]);
    s += blobSvg(P, pts, small ? 20 : 13, `class="hlblob ${cls}"`);
  }
  const [x1, y1, x2, y2] = [P.sx(m.muA[0]), P.sy(m.muA[1]), P.sx(m.muB[0]),
    P.sy(m.muB[1])];
  s += `<line class="hlseg" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  for (const [x, y] of [[x1, y1], [x2, y2]]) {
    s += `<circle class="hlmu" cx="${x}" cy="${y}" r="6"/>`;
  }
  s += `<text class="lbl ink" x="${(x1 + x2) / 2 + 10}" y="${
    (y1 + y2) / 2 - 10}">ΔWCSS ${fmt3(m.delta)}</text>`;
  return s;
}

function wSetHl(t, el = null) {
  W.hl = t;
  document.getElementById("w-hl").innerHTML = t !== null ? wHlSvg(t) : "";
  for (const h of document.querySelectorAll("#w-log .on, #w-den .on")) {
    h.classList.remove("on");
  }
  if (t === null) return;
  const li = wLog.querySelector(`[data-m="${t}"]`);
  if (li) li.classList.add("on");
  if (el && el !== li) el.classList.add("on");
  const br = wDen.querySelector(`.br[data-m="${t}"]`);
  if (br) br.classList.add("on");
}

// --------------------------------------------------------- dendrogram

const WD = { w: 460, h: 380, x0: 52, x1: 448, y0: 14, y1: 330 };

/** Display height scale for the dendrogram (linear or log total WCSS). */
function wHeightScale() {
  const H = W.merges.map(m => m.total), top = H.at(-1) || 1;
  if (!W.log) {
    return { f: h => WD.y1 - h / top * (WD.y1 - WD.y0), lo: 0, top };
  }
  const pos = H.filter(h => h > 1e-12);
  const lo = pos.length ? pos[0] / 2 : top / 100;
  const L = v => Math.log(Math.max(v, lo));
  return { f: h => WD.y1 - (L(h) - L(lo)) / (L(top) - L(lo)) *
    (WD.y1 - WD.y0), lo, top };
}

/** Cut height (display y) between merges t - 1 and t. */
function wCutY(t, sc) {
  const H = W.merges.map(m => m.total), n = wN();
  const below = t > 0 ? sc.f(H[t - 1]) : WD.y1;
  const above = t < n - 1 ? sc.f(H[t]) : WD.y0 - 8;
  return (below + above) / 2;
}

function wDrawDen() {
  WD.y1 = wN() <= 40 ? 344 : 362;
  const n = wN(), sc = wHeightScale();
  const xs = Array(2 * n - 1), ys = Array(2 * n - 1).fill(WD.y1);
  W.order.forEach((id, k) => {
    xs[id] = WD.x0 + 8 + (k + .5) / n * (WD.x1 - WD.x0 - 16);
  });
  W.merges.forEach((m, t) => {
    xs[n + t] = (xs[m.a] + xs[m.b]) / 2;
    ys[n + t] = sc.f(m.total);
  });
  let s = `<rect class="frame" x="${WD.x0}" y="${WD.y0}" width="${
    WD.x1 - WD.x0}" height="${WD.y1 - WD.y0}"/>`;
  if (W.log) {
    let ticks = logTicks(sc.lo, sc.top);
    if (ticks.length > 9) ticks = ticks.filter(v => Number.isInteger(+Math.log10(v).toFixed(6)));
    for (const v of ticks) {
      const y = sc.f(v);
      s += `<line class="grid" x1="${WD.x0}" x2="${WD.x1}" y1="${y}"
        y2="${y}"/><text class="tick" x="${WD.x0 - 6}" y="${y + 4}"
        text-anchor="end">${fmtTick(v)}</text>`;
    }
  } else {
    const st = niceStep(sc.top / 5);
    for (let v = 0; v <= sc.top * 1.0001; v += st) {
      const y = sc.f(v);
      s += `<line class="grid" x1="${WD.x0}" x2="${WD.x1}" y1="${y}"
        y2="${y}"/><text class="tick" x="${WD.x0 - 6}" y="${y + 4}"
        text-anchor="end">${fmtTick(v)}</text>`;
    }
  }
  s += `<text class="axis-label sm" text-anchor="middle"
    transform="translate(13 ${(WD.y0 + WD.y1) / 2}) rotate(-90)">total WCSS${
    W.log ? " (log)" : ""}</text>`;
  W.merges.forEach((m, t) => {
    const id = n + t, done = t < W.t;
    const c = done ? W.col[wardLabels1(id)] : "";
    s += `<path class="br${done ? "" : " later"}" data-m="${t}"
      d="M${xs[m.a]} ${ys[m.a]}V${ys[id]}H${xs[m.b]}V${ys[m.b]}"
      ${done ? `style="--c:${c}"` : ""}/>`;
  });
  if (n <= 40) {
    W.order.forEach(id => {
      s += `<text class="tick leaf" x="${xs[id]}" y="${WD.y1 + 14}"
        text-anchor="middle">${n <= 20 ? `x${subN(id + 1)}` : id + 1}</text>`;
    });
  }
  const cy = wCutY(W.t, sc);
  s += `<line class="cut" x1="${WD.x0}" x2="${WD.x1}" y1="${cy}"
    y2="${cy}"/><rect class="cuth" data-h="cut" x="${WD.x0}" y="${cy - 9}"
    width="${WD.x1 - WD.x0}" height="18"/><text class="lbl small ink"
    x="${WD.x1 - 6}" y="${cy - 7}" text-anchor="end">${n - W.t}
    cluster${n - W.t === 1 ? "" : "s"}</text>`;
  wDen.innerHTML = s;
}

/** Color source for a finished branch: the cluster it is in now. */
function wardLabels1(id) {
  const n = wN();
  let cur = id;
  for (let t = Math.max(cur - n + 1, 0); t < W.t; t++) {
    const m = W.merges[t];
    if (m.a === cur || m.b === cur) cur = n + t;
  }
  return cur;
}

/** Merges to show for a cut at display height y. */
function wTAtY(y) {
  const sc = wHeightScale(), n = wN();
  let t = 0;
  while (t < n - 1 && sc.f(W.merges[t].total) >= y) t++;
  return t;
}

dragOn(wDen, {
  down: (h, q) => {
    wPlay.pause();
    W.t = wTAtY(q.y);
    wDraw();
    return true;
  },
  move: q => {
    const t = wTAtY(q.y);
    if (t !== W.t) { W.t = t; W.hl = null; wDraw(); }
  },
});
wDen.addEventListener("mouseover", e => {
  const el = e.target.closest(".br");
  if (el) wSetHl(+el.dataset.m, el);
});
wDen.addEventListener("mouseout", e => {
  if (e.target.closest(".br")) wSetHl(null);
});

// ---------------------------------------------------------------- log

function wDrawLog() {
  const atEnd = wLog.scrollTop + wLog.clientHeight >= wLog.scrollHeight - 8;
  const n = wN();
  let s = `<div class="entry"><div class="head"><b>Start</b> · ${n}
    clusters of one sample · total WCSS 0</div></div>`;
  for (let t = 0; t < W.t; t++) {
    const m = W.merges[t], N = m.na + m.nb;
    s += `<div class="entry"><div class="head" data-m="${t}"><b>Step ${
      t + 1}</b> · <span class="ty merge">merge</span> · ${n - t - 1}
      cluster${n - t - 1 === 1 ? "" : "s"} left · total WCSS ${
      fmt3(m.total)}</div><ul><li data-m="${t}">${wName(m.a)} + ${
      wName(m.b)}: ΔWCSS = ${m.na}·${m.nb}/${N} · ‖<i>μ</i><sub>A</sub>
      − <i>μ</i><sub>B</sub>‖² = ${fmt3(m.na * m.nb / N)} · ${
      fmt3(d2(m.muA, m.muB))} = ${fmt3(m.delta)}, the cheapest of ${
      (n - t) * (n - t - 1) / 2} pair${n - t === 2 ? "" : "s"}</li>`;
    if (t === n - 2) {
      s += `<li class="stop">One cluster left: stop. Total WCSS ${
        fmt3(m.total)}.</li>`;
    }
    s += "</ul></div>";
  }
  wLog.innerHTML = s;
  if (atEnd || wPlay.playing()) wLog.scrollTop = wLog.scrollHeight;
}

wLog.addEventListener("mouseover", e => {
  const el = e.target.closest("[data-m]");
  wSetHl(el ? +el.dataset.m : null, el);
});
wLog.addEventListener("mouseleave", () => wSetHl(null));

function wRead() {
  const n = wN(), t = W.t;
  const next = t < n - 1 ? W.merges[t] : null;
  document.getElementById("w-read").innerHTML =
    row("clusters", n - t) +
    row("total WCSS", t ? fmt3(W.merges[t - 1].total) : "0") +
    row("next merge", next ? `${wName(next.a)} + ${wName(next.b)}, ΔWCSS ${
      fmt3(next.delta)}` : "none: one cluster");
  document.getElementById("w-step").disabled = t >= n - 1;
  document.getElementById("w-back").disabled = t === 0;
}

// ----------------------------------------------------------- controls

segmented(document.getElementById("w-sets"),
  W.sets.map(d => [d.id, d.name]), wPickSet);
segmented(document.getElementById("w-speed"), SPEEDS, v => {
  wPlay.rate = +v;
  segSet(document.getElementById("w-speed"), v);
});
segSet(document.getElementById("w-speed"), "1.5");
segmented(document.getElementById("w-scale"), [["log", "log"],
  ["lin", "linear"]], v => {
  W.log = v === "log";
  segSet(document.getElementById("w-scale"), v);
  wDrawDen();
});
segSet(document.getElementById("w-scale"), "log");

document.getElementById("w-play").onclick = () => {
  if (W.t >= wN() - 1) W.t = 0;
  wPlay.toggle();
};
document.getElementById("w-step").onclick = () => { wPlay.pause(); wStep(); };
document.getElementById("w-back").onclick = () => {
  wPlay.pause();
  if (W.t > 0) { W.t--; W.hl = null; wDraw(); }
};
document.getElementById("w-reset").onclick = () => {
  wPlay.pause();
  W.t = 0;
  wDraw();
};
document.getElementById("w-end").onclick = () => {
  wPlay.pause();
  W.t = wN() - 1;
  wDraw();
};
for (const id of ["w-means", "w-next"]) {
  document.getElementById(id).onchange = () => wDraw();
}

let wShown = false;
function wardShow() {
  if (wShown) return;
  wShown = true;
  wPickSet(W.set.id);
}
