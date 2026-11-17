# clustering

Interactive teaching demo of k-means and Ward's method for DS 4400
lesson 22, a companion to the other "visually" demos (e.g.
[PCA](https://github.com/matthigger/pca),
[LDA](https://github.com/matthigger/lda)). Live at
<https://matthigger.github.io/clustering/>. Notation follows the lesson:
clusters C₁, ..., Cₖ with means μⱼ and sizes Nⱼ, WCSS, and
ΔWCSS(A, B) = N_A N_B / (N_A + N_B) ‖μ_A − μ_B‖². Three tabs:

- **k-means** (`#kmeans`). The transport buttons under the plot
  (restart, step back, play / pause, step, run to the end) alternate the
  two steps:
  assign each sample to its nearest mean, update each mean to its
  samples' average. Every step is logged as events (a cluster's samples
  on the first assign, a sample switching cluster, a mean moving, an
  empty cluster restarting, the stop) in the log under the plot; hover a
  line, or a dot on the WCSS-by-step chart, to draw it on the plot.
  Starts: random samples, k-means++, a dataset's fixed start, or drag a
  mean. Converged runs land in a final-WCSS-by-k chart (elbow, local
  minima).
- **Ward's method** (`#ward`). Plays the merges one at a time with the
  same kind of log; the dendrogram puts each bar at the total WCSS after
  its merge (log axis by default, linear for the five-point set)
  and its cut can be dragged.
- **Ward's on a picture** (`#image`). Each pixel's color is a sample and
  only touching regions may merge, so clusters are superpixels. One run
  gives every N; the slider (or the WCSS-by-N chart) picks N. Stock
  pictures: the dog from the PCA demo, scikit-image samples (astronaut,
  rocket, coins: public domain; cat, coffee, cameraman: CC0) and Kodak
  test images (parrots, hats, motocross, lighthouse; released for
  unrestricted use). Uploads stay in the browser.

Each dataset (both point tabs) has a few sliders (samples, spread or
noise, a shape knob such as separation or ring radius) plus New draw
(new seed) and Defaults; sample counts are scaled down on Ward's tab.

Plain HTML/CSS/JS with SVG and canvas: no build step and no
dependencies, so it also works offline from `file://`. The engines are
`js/cluster.js`; datasets are `js/data.js` (seeded, the same on every
visit); `js/images.js` holds the stock pictures as data URLs, rebuilt by
`build/make_images.py` (it downloads the Kodak originals to the
gitignored `build/kodak/` on first run).

## Testing

```sh
~/venv_ds4400/bin/python -I build/make_ref.py      # rewrites test/ref.js
~/venv_ds4400/bin/python test/run_headless.py "file://$PWD/test/index.html" \
    --wait '/PASS|FAIL/.test(document.title)' \
    --eval 'document.getElementById("out").textContent'
test/smoke.sh                                      # JS errors + shots/
```

compares `js/cluster.js` with sklearn's `KMeans` (Lloyd from a given
start), scipy's Ward linkage (total WCSS after each merge) and a
brute-force connectivity-constrained Ward's (itself checked against
sklearn's `ward_tree`), plus a few hand-checked small cases.
`run_headless.py` drives playwright's Chromium (`~/.cache/ms-playwright`),
so run it outside the sandbox.

## Run locally

Open `index.html` in a browser, or serve it:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Publish on GitHub Pages

```sh
gh repo create matthigger/clustering --public --source . --push
gh api -X POST repos/matthigger/clustering/pages -f build_type=workflow
```

`.github/workflows/pages.yml` then deploys each push to main.
