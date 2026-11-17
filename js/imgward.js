// Ward's method on an image tab. Each pixel starts as its own cluster
// with its color (r, g, b in 0..1) as the sample; Ward's method merges
// only regions that touch (4-neighbors), so every cluster is a connected
// superpixel. The full merge sequence is computed once per picture, and
// the slider shows the picture as N superpixels, each painted its mean
// color, by replaying the first n - N merges.

// ---------------------------------------------------------------- tab

const IM = {
  name: "dog",
  src: null,
  res: 128,
  w: 0,
  h: 0,
  rgb: null,
  merges: null,
  N: 64,
  lab: null,
  mean: null,
  hover: -1,
  peek: false,
  ms: 0,
  anim: null,
};

const imCanvas = document.getElementById("i-canvas");
const imChart = document.getElementById("i-chart");
const imSlider = document.getElementById("i-n");
const imNum = document.getElementById("i-nv");
const imN = () => IM.w * IM.h;

/** Load an image URL, shrink it to the working size, run Ward's. */
function imLoad(url) {
  const img = new Image();
  img.onload = () => {
    IM.src = img;
    imPrepare();
  };
  img.src = url;
}

/** Resample the source to IM.res on its long side, then run Ward's. */
function imPrepare() {
  const img = IM.src, k = IM.res / Math.max(img.width, img.height);
  IM.w = Math.max(1, Math.round(img.width * k));
  IM.h = Math.max(1, Math.round(img.height * k));
  const cv = document.createElement("canvas");
  cv.width = IM.w;
  cv.height = IM.h;
  const cx = cv.getContext("2d");
  cx.imageSmoothingQuality = "high";
  cx.drawImage(img, 0, 0, IM.w, IM.h);
  const px = cx.getImageData(0, 0, IM.w, IM.h).data, n = imN();
  IM.rgb = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) IM.rgb[3 * i + c] = px[4 * i + c] / 255;
  }
  const t0 = performance.now();
  IM.merges = wardGrid(IM.rgb, IM.w, IM.h, 3);
  IM.ms = performance.now() - t0;
  IM.N = Math.min(IM.N, n);
  imSlider.max = 1000;
  imSetN(IM.N);
}

/** Slider position (0..1000) for N superpixels, on a log scale. */
const imPos = N => Math.round(1000 * Math.log(N) / Math.log(imN()));
const imFromPos = p => Math.max(1, Math.round(Math.exp(p / 1000 *
  Math.log(imN()))));

function imSetN(N) {
  IM.N = clamp(Math.round(N), 1, imN());
  const n = imN();
  IM.lab = gridLabels(n, IM.merges, n - IM.N);
  const acc = new Map();
  for (let i = 0; i < n; i++) {
    let a = acc.get(IM.lab[i]);
    if (!a) acc.set(IM.lab[i], a = [0, 0, 0, 0]);
    a[0] += IM.rgb[3 * i];
    a[1] += IM.rgb[3 * i + 1];
    a[2] += IM.rgb[3 * i + 2];
    a[3]++;
  }
  IM.mean = acc;
  if (document.activeElement !== imSlider) imSlider.value = imPos(IM.N);
  if (document.activeElement !== imNum) imNum.value = IM.N;
  imRender();
  imRead();
  imDrawChart();
}

/** Paint the superpixels (or the original while peeking). */
function imRender() {
  const n = imN(), w = IM.w, h = IM.h;
  const s = Math.max(1, Math.floor(640 / Math.max(w, h)));
  imCanvas.width = w * s;
  imCanvas.height = h * s;
  const cx = imCanvas.getContext("2d");
  const out = cx.createImageData(w * s, h * s), D = out.data;
  const lines = document.getElementById("i-lines").checked && !IM.peek;
  const col = new Uint8ClampedArray(3 * n);
  for (let i = 0; i < n; i++) {
    if (IM.peek) {
      for (let c = 0; c < 3; c++) col[3 * i + c] = 255 * IM.rgb[3 * i + c];
    } else {
      const a = IM.mean.get(IM.lab[i]);
      const dim = IM.hover >= 0 && IM.lab[i] !== IM.hover ? .45 : 1;
      for (let c = 0; c < 3; c++) {
        col[3 * i + c] = 255 * (dim * a[c] / a[3] + (1 - dim) * .97);
      }
    }
  }
  for (let y = 0; y < h * s; y++) {
    const py = (y / s) | 0, ey = y % s === s - 1 && py + 1 < h;
    for (let x = 0; x < w * s; x++) {
      const pxx = (x / s) | 0, i = py * w + pxx, o = 4 * (y * w * s + x);
      let r = col[3 * i], g = col[3 * i + 1], b = col[3 * i + 2];
      if (lines && s > 1) {
        const ex = x % s === s - 1 && pxx + 1 < w;
        if ((ex && IM.lab[i + 1] !== IM.lab[i]) ||
            (ey && IM.lab[i + w] !== IM.lab[i])) {
          r = r * .35;
          g = g * .35;
          b = b * .35;
        }
      }
      D[o] = r;
      D[o + 1] = g;
      D[o + 2] = b;
      D[o + 3] = 255;
    }
  }
  cx.putImageData(out, 0, 0);
}

function imRead() {
  const n = imN(), m = n - IM.N;
  const tot = m ? IM.merges.total[m - 1] : 0;
  const next = m < n - 1 ? IM.merges.delta[m] : null;
  document.getElementById("i-read").innerHTML =
    row("picture", `${IM.w} × ${IM.h} = ${n.toLocaleString()} pixels`) +
    row("superpixels <i>N</i>", IM.N.toLocaleString()) +
    row("average size", `${fmt3(n / IM.N)} pixels`) +
    row("total WCSS", fmt3(tot)) +
    row("next merge ΔWCSS", next === null ? "none" : fmt3(next));
  document.getElementById("i-time").textContent = `Ward's ran all ${
    (n - 1).toLocaleString()} merges in ${Math.round(IM.ms)} ms.`;
  const hv = document.getElementById("i-hover");
  if (IM.hover >= 0 && IM.mean.has(IM.hover)) {
    const a = IM.mean.get(IM.hover);
    const c = [0, 1, 2].map(k => Math.round(255 * a[k] / a[3]));
    hv.innerHTML = `<span class="swatch" style="background:rgb(${c})"></span>
      this superpixel: ${a[3].toLocaleString()} pixel${a[3] === 1 ? "" : "s"},
      mean color (${c.join(", ")})`;
  } else {
    hv.textContent = "Hover the picture to pick out one superpixel.";
  }
}

// ---------------------------------------------------- WCSS-by-N chart

const IC = { w: 460, h: 230, x0: 52, x1: 446, y0: 14, y1: 190 };

function imDrawChart() {
  const n = imN(), tot = IM.merges.total, top = tot[n - 2] || 1;
  const lo = Math.max(tot.find(v => v > 0) || top / 1e4, top / 1e7);
  const sx = N => IC.x0 + Math.log(N) / Math.log(n) * (IC.x1 - IC.x0);
  const sy = v => IC.y1 - Math.log(Math.max(v, lo) / lo) / Math.log(top / lo)
    * (IC.y1 - IC.y0);
  let s = `<rect class="frame" x="${IC.x0}" y="${IC.y0}" width="${
    IC.x1 - IC.x0}" height="${IC.y1 - IC.y0}"/>`;
  let ticks = logTicks(lo, top);
  if (ticks.length > 7) ticks = ticks.filter(v => Number.isInteger(+Math.log10(v).toFixed(6)));
  for (const v of ticks) {
    s += `<line class="grid" x1="${IC.x0}" x2="${IC.x1}" y1="${sy(v)}"
      y2="${sy(v)}"/><text class="tick" x="${IC.x0 - 6}" y="${sy(v) + 4}"
      text-anchor="end">${fmtTick(v)}</text>`;
  }
  for (let N = 1; N <= n; N *= 10) {
    s += `<line class="grid" x1="${sx(N)}" x2="${sx(N)}" y1="${IC.y0}"
      y2="${IC.y1}"/><text class="tick" x="${sx(N)}" y="${IC.y1 + 15}"
      text-anchor="${sx(N) > IC.x1 - 24 ? "end" : "middle"}">${
      N.toLocaleString()}</text>`;
  }
  s += `<text class="axis-label sm" x="${(IC.x0 + IC.x1) / 2}"
    y="${IC.y1 + 33}" text-anchor="middle">superpixels N (log)</text>`;
  let d = `M${sx(n)} ${IC.y1}`;
  const stride = Math.max(1, Math.floor(n / 600));
  for (let m = 1; m < n; m += m < 2000 ? 1 : stride) {
    d += `L${sx(n - m).toFixed(1)} ${sy(tot[m - 1]).toFixed(1)}`;
  }
  d += `L${sx(1)} ${sy(top)}`;
  s += `<path class="c-curve" d="${d}"/>`;
  const m = n - IM.N, y = m ? sy(tot[m - 1]) : IC.y1;
  s += `<line class="c-now" x1="${sx(IM.N)}" x2="${sx(IM.N)}" y1="${IC.y0}"
    y2="${IC.y1}"/><circle class="kdot" cx="${sx(IM.N)}" cy="${y}" r="5"/>`;
  imChart.innerHTML = s;
}

dragOn(imChart, {
  down: (h, q) => { imStop(); imAtChart(q); return true; },
  move: q => imAtChart(q),
});
function imAtChart(q) {
  const f = clamp((q.x - IC.x0) / (IC.x1 - IC.x0), 0, 1);
  imSetN(Math.exp(f * Math.log(imN())));
}

// ----------------------------------------------------------- controls

imSlider.addEventListener("input", () => {
  imStop();
  imSetN(imFromPos(+imSlider.value));
});
imNum.addEventListener("input", () => {
  const v = parseInt(imNum.value, 10);
  if (Number.isFinite(v) && v >= 1) { imStop(); imSetN(v); }
});
imNum.addEventListener("change", () => imNum.blur());
for (const b of document.querySelectorAll("#i-quick button")) {
  b.onclick = () => { imStop(); imSetN(+b.dataset.n); };
}
document.getElementById("i-lines").onchange = () => imRender();

function imStop() {
  if (IM.anim) cancelAnimationFrame(IM.anim);
  IM.anim = null;
  playIcon(document.getElementById("i-play"), false);
}
document.getElementById("i-play").onclick = () => {
  if (IM.anim) { imStop(); return; }
  if (IM.N <= 1) imSetN(imN());
  playIcon(document.getElementById("i-play"), true);
  let last = performance.now();
  const frame = now => {
    const dt = Math.min(now - last, 100) / 1000;
    last = now;
    const N = IM.N * Math.exp(-dt * Math.log(imN()) / 8);
    imSetN(Math.min(IM.N - 1, Math.floor(N)));
    IM.anim = IM.N > 1 ? requestAnimationFrame(frame) : null;
    if (!IM.anim) imStop();
  };
  IM.anim = requestAnimationFrame(frame);
};

/** Pixel index under a pointer event on the canvas (-1 outside). */
function imPixelAt(e) {
  const r = imCanvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / r.width * IM.w);
  const y = Math.floor((e.clientY - r.top) / r.height * IM.h);
  return x >= 0 && y >= 0 && x < IM.w && y < IM.h ? y * IM.w + x : -1;
}
imCanvas.addEventListener("pointermove", e => {
  const i = imPixelAt(e), hv = i >= 0 ? IM.lab[i] : -1;
  if (hv !== IM.hover) { IM.hover = hv; imRender(); imRead(); }
});
imCanvas.addEventListener("pointerleave", () => {
  IM.hover = -1;
  IM.peek = false;
  imRender();
  imRead();
});
imCanvas.addEventListener("pointerdown", e => {
  e.preventDefault();
  IM.peek = true;
  imRender();
});
imCanvas.addEventListener("pointerup", () => { IM.peek = false; imRender(); });

segmented(document.getElementById("i-res"), [["64", "64"], ["128", "128"],
  ["192", "192"]], v => {
  imStop();
  IM.res = +v;
  segSet(document.getElementById("i-res"), v);
  imPrepare();
});
segSet(document.getElementById("i-res"), "128");

const imPics = document.getElementById("i-pics");
imPics.innerHTML = Object.keys(IMAGES).map(k => `<button class="thumb"
  data-k="${k}" title="${k}" aria-label="${k}"><img src="${IMAGES[k]}" alt="${k}"></button>`)
  .join("");
function imPick(k, url) {
  imStop();
  IM.name = k;
  for (const b of imPics.querySelectorAll(".thumb")) {
    b.setAttribute("aria-checked", b.dataset.k === k);
  }
  imLoad(url);
}
for (const b of imPics.querySelectorAll(".thumb")) {
  b.onclick = () => {
    document.getElementById("i-fname").textContent = "";
    imPick(b.dataset.k, IMAGES[b.dataset.k]);
  };
}
document.getElementById("i-file").addEventListener("change", e => {
  const f = e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => imPick("upload", rd.result);
  rd.readAsDataURL(f);
  document.getElementById("i-fname").textContent = f.name;
});

let imShown = false;
function imageShow() {
  if (imShown) return;
  imShown = true;
  imPick(IM.name, IMAGES[IM.name]);
}
