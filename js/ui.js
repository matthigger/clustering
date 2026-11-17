// Shared helpers: a seeded random generator, plot planes whose square
// domain fits the data, cluster colors, SVG pieces, pointer dragging,
// number formatting and the footer build stamp.

/** Seeded uniform [0, 1) generator (mulberry32). */
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draw from a uniform generator (Box-Muller). */
function gauss(rng) {
  const u = 1 - rng(), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/** Cluster colors; cluster j (0-based) uses PALETTE[j % 10]. */
const PALETTE = ["#2563eb", "#ea580c", "#16a34a", "#c026d3", "#0891b2",
  "#ca8a04", "#dc2626", "#4f46e5", "#65a30d", "#db2777"];
const GRAY = "#9aa3b2";

/** Subscript digits for a non-negative integer, e.g. 12 -> "₁₂". */
function subN(i) {
  return String(i).replace(/\d/g, c => "₀₁₂₃₄₅₆₇₈₉"[c]);
}

/**
 * Make a square plot plane over box (viewBox units) for a data domain.
 *
 * Args:
 *   box (object): {w, h, x0, x1, y0, y1} viewBox size and plot corners
 *
 * Returns:
 *   (object): the box plus fit(pts) to fit the domain to points
 *     (array of [x, y]), and scales sx, sy (data to viewBox) and ix, iy
 *     (back) for the current domain
 */
function makePlane(box) {
  const p = { ...box, dom: { x: [-8, 8], y: [-8, 8] }, step: 2 };
  const k = () => (p.x1 - p.x0) / (p.dom.x[1] - p.dom.x[0]);
  p.sx = v => p.x0 + (v - p.dom.x[0]) * k();
  p.sy = v => p.y1 - (v - p.dom.y[0]) * k();
  p.ix = q => p.dom.x[0] + (q - p.x0) / k();
  p.iy = q => p.dom.y[0] + (p.y1 - q) / k();
  p.k = k;
  p.fit = pts => {
    let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    for (const q of pts) {
      for (const i of [0, 1]) {
        lo[i] = Math.min(lo[i], q[i]);
        hi[i] = Math.max(hi[i], q[i]);
      }
    }
    const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], 2) * 1.12;
    const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
    p.dom = { x: [c[0] - span / 2, c[0] + span / 2],
      y: [c[1] - span / 2, c[1] + span / 2] };
    p.step = niceStep(span / 8);
  };
  return p;
}

/** Smallest of 1, 2, 5 times a power of 10 at least raw. */
function niceStep(raw) {
  const e = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map(m => m * e).find(s => s >= raw * .999);
}

/** Clip path over plane p's box, then grid lines and tick labels. */
function axesSvg(p, clipId) {
  let a = `<defs><clipPath id="${clipId}"><rect x="${p.x0}" y="${p.y0}"
    width="${p.x1 - p.x0}" height="${p.y1 - p.y0}"/></clipPath></defs>`;
  const dig = p.step < 1 ? 1 : 0;
  for (const ax of ["x", "y"]) {
    const [lo, hi] = p.dom[ax];
    for (let v = Math.ceil(lo / p.step) * p.step; v <= hi; v += p.step) {
      const z = Math.abs(v) < 1e-9 ? " zero" : "";
      if (ax === "x") {
        const x = p.sx(v).toFixed(1);
        a += `<line class="grid${z}" x1="${x}" x2="${x}" y1="${p.y0}"
          y2="${p.y1}"/><text class="tick" x="${x}" y="${p.y1 + 17}"
          text-anchor="middle">${fmt(v, dig)}</text>`;
      } else {
        const y = p.sy(v).toFixed(1);
        a += `<line class="grid${z}" x1="${p.x0}" x2="${p.x1}" y1="${y}"
          y2="${y}"/><text class="tick" x="${p.x0 - 7}" y="${+y + 4}"
          text-anchor="end">${fmt(v, dig)}</text>`;
      }
    }
  }
  a += `<rect class="frame" x="${p.x0}" y="${p.y0}" width="${p.x1 - p.x0}"
    height="${p.y1 - p.y0}"/>`;
  return a;
}

/** "x,y" in viewBox units for data point q on plane p. */
function pxy(p, q) { return `${p.sx(q[0]).toFixed(1)},${p.sy(q[1]).toFixed(1)}`; }

/** Convex hull of points (array of [x, y]), counterclockwise. */
function hull(pts) {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (s.length < 3) return s;
  const cross = (o, a, b) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of s) {
    while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), q) <= 0) {
      lower.pop();
    }
    lower.push(q);
  }
  for (const q of s.reverse()) {
    while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), q) <= 0) {
      upper.pop();
    }
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * SVG path of a rounded blob around points: the hull, inflated by r
 * viewBox units (a round-joined stroke of width 2r over the hull).
 */
function blobSvg(p, pts, r, attrs) {
  const h = hull(pts);
  const d = "M" + h.map(q => pxy(p, q)).join("L") + "Z";
  return `<path d="${d}" stroke-width="${2 * r}" stroke-linejoin="round"
    ${attrs}/>`;
}

/** SVG arrow between viewBox points; cls sets stroke and fill. */
function arrowPx(x1, y1, x2, y2, cls, head = 13) {
  const L = Math.hypot(x2 - x1, y2 - y1);
  if (L < 1) return "";
  const ux = (x2 - x1) / L, uy = (y2 - y1) / L, h = Math.min(head, L * .6);
  const bx = x2 - ux * h, by = y2 - uy * h;
  const pts = [[x2, y2], [bx - uy * h * .45, by + ux * h * .45],
    [bx + uy * h * .45, by - ux * h * .45]];
  return `<g class="arrow ${cls}"><line x1="${x1}" y1="${y1}" x2="${bx}"
    y2="${by}"/><polygon points="${pts.map(q => q.join(",")).join(" ")}"/>
    </g>`;
}

/** Pointer position in the viewBox units of an SVG. */
function svgPoint(el, e) {
  const pt = el.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  return pt.matrixTransform(el.getScreenCTM().inverse());
}

/**
 * Route pointer drags on an element to handlers.
 *
 * Args:
 *   el (Element): an SVG (pointer in its viewBox units) or any element
 *     (pointer in CSS pixels from its top left)
 *   h.down (Function): (handle, q, e) -> bool, handle = data-h of the
 *     element under the pointer (or null); return true to start a drag
 *   h.move (Function): (q, e) during the drag
 *   h.up (Function | undefined): (e) at the end
 */
function dragOn(el, h) {
  const at = e => {
    if (el instanceof SVGSVGElement) return svgPoint(el, e);
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  el.addEventListener("pointerdown", e => {
    const t = e.target.closest("[data-h]");
    if (!h.down(t ? t.dataset.h : null, at(e), e)) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const move = ev => h.move(at(ev), ev);
    const up = ev => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      if (h.up) h.up(ev);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  });
}

/** Number with a true minus sign. */
function fmt(x, digits = 2) {
  const a = Math.abs(x).toFixed(digits);
  return (x < 0 && a !== (0).toFixed(digits) ? "−" : "") + a;
}

/** Number to about 3 significant digits, true minus sign. */
function fmt3(x) {
  const a = Math.abs(x);
  if (a >= 1e5) return fmt(x / 1e3, 0) + "k";
  if (a >= 100) return fmt(x, 0);
  if (a >= 10) return fmt(x, 1);
  return fmt(x, 2);
}

/** Axis tick label: 3 significant digits, no trailing zeros. */
function fmtTick(v) {
  const s = Number(v.toPrecision(3));
  return (s < 0 ? "−" : "") + Math.abs(s).toLocaleString("en-US",
    { maximumFractionDigits: 12 });
}

/** Tick values 1, 2, 5 times powers of 10 within [lo, hi]. */
function logTicks(lo, hi) {
  const out = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi));
    e++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e;
      if (v >= lo * .999 && v <= hi * 1.001) out.push(v);
    }
  }
  return out;
}

/** Point [a, b] as "(a, b)". */
function fpt(v, digits = 2) {
  return `(${fmt(v[0], digits)}, ${fmt(v[1], digits)})`;
}

/** Single-choice segmented control; onPick(value) on click. */
function segmented(el, items, onPick) {
  el.innerHTML = items.map(([v, label]) =>
    `<button role="radio" data-v="${v}">${label}</button>`).join("");
  for (const b of el.querySelectorAll("button")) {
    b.onclick = () => onPick(b.dataset.v);
  }
}

/** Mark value v checked in a segmented control. */
function segSet(el, v) {
  for (const b of el.querySelectorAll("button")) {
    b.setAttribute("aria-checked", b.dataset.v === String(v));
  }
}

/** Readout row: label on the left, value on the right. */
function row(label, val) {
  return `<div class="row"><span>${label}</span><span class="val">${
    val}</span></div>`;
}

/** Transport icons (16 x 16, VCR style) as inline SVG. */
const ICON = Object.fromEntries(Object.entries({
  play: "M4 2.5v11l9-5.5z",
  pause: "M3.5 2.5h3.2v11H3.5zM9.3 2.5h3.2v11H9.3z",
  step: "M2.5 2.5v11L10 8zM11 2.5h2.6v11H11z",
  back: "M13.5 2.5v11L6 8zM2.4 2.5H5v11H2.4z",
  start: "M1.8 2.5h2.3v11H1.8zM9.2 2.5v11L4.6 8zM14.6 2.5v11L10 8z",
  end: "M11.9 2.5h2.3v11h-2.3zM6.8 2.5v11L11.4 8zM1.4 2.5v11L6 8z",
}).map(([k, d]) => [k, `<svg class="ic" viewBox="0 0 16 16"
  aria-hidden="true"><path d="${d}"/></svg>`]));

for (const b of document.querySelectorAll("[data-icon]")) {
  b.innerHTML = ICON[b.dataset.icon];
}

/** Show a play button as play or pause. */
function playIcon(el, playing) {
  el.innerHTML = playing ? ICON.pause : ICON.play;
  el.title = playing ? "Pause" : "Play";
  el.setAttribute("aria-label", el.title);
}

/** Play speeds: steps per second for the speed control. */
const SPEEDS = [["0.5", "½×"], ["1.5", "1×"], ["5", "3×"]];

/**
 * Drive a step function on a timer, for the Play / Pause buttons.
 *
 * Args:
 *   step (Function): () -> bool, false when there is nothing left to do
 *   onState (Function): (playing) -> called when play starts or stops
 *
 * Returns:
 *   (object): {play(), pause(), toggle(), playing(), rate}
 */
function player(step, onState) {
  let timer = null;
  const P = { rate: 1.5 };
  const tick = () => {
    if (!step()) { P.pause(); return; }
    timer = setTimeout(tick, 1000 / P.rate);
  };
  P.playing = () => timer !== null;
  P.play = () => {
    if (timer) return;
    timer = setTimeout(tick, 0);
    onState(true);
  };
  P.pause = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    onState(false);
  };
  P.toggle = () => (P.playing() ? P.pause() : P.play());
  return P;
}

// Footer build stamp: the deployed commit (linked) and build time.
(function () {
  const el = document.getElementById("build");
  if (!el) return;
  const repo = "https://github.com/matthigger/clustering";
  if (!BUILD) { el.textContent = "local copy"; return; }
  const when = new Date(BUILD.time).toLocaleString("en-US", {
    dateStyle: "medium", timeStyle: "short" });
  el.innerHTML = `build <a href="${repo}/commit/${BUILD.sha}">${
    BUILD.sha.slice(0, 7)}</a>, ${when}`;
})();
