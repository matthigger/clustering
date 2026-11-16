// Tabs: k-means, Ward's method, Ward's on a picture. Each tab keeps its
// own state while hidden and builds itself the first time it is shown;
// the hash names the open tab.

const HASH = { kmeans: "#kmeans", ward: "#ward", image: "#image" };
const SHOW = { kmeans: kmeansShow, ward: wardShow, image: imageShow };

function setMode(mode) {
  history.replaceState(null, "", HASH[mode]);
  for (const t of document.querySelectorAll(".tab")) {
    t.setAttribute("aria-selected", t.dataset.mode === mode);
  }
  for (const e of document.querySelectorAll("[data-show]")) {
    e.hidden = !e.dataset.show.split(" ").includes(mode);
  }
  kPlay.pause();
  wPlay.pause();
  imStop();
  SHOW[mode]();
}

for (const t of document.querySelectorAll(".tab")) {
  t.onclick = () => setMode(t.dataset.mode);
}

setMode(Object.keys(HASH).find(m => HASH[m] === location.hash) || "kmeans");

addEventListener("hashchange", () => {
  const m = Object.keys(HASH).find(k => HASH[k] === location.hash);
  if (m) setMode(m);
});
