"""Write the image tab's stock pictures to js/images.js as JPEG data URLs.

Usage: ~/venv_ds4400/bin/python -I build/make_images.py

Sources:
    build/dog.jpg      the course's dog, as in the PCA demo
    scikit-image       astronaut, rocket (NASA / SpaceX, public domain);
                       chelsea the cat, coffee, cameraman (CC0); coins
                       (public domain)
    Kodak PhotoCD set  kodim03 hats, kodim05 motocross, kodim21
                       lighthouse, kodim23 parrots, released by Kodak for
                       unrestricted use; downloaded once to build/kodak/
                       (gitignored) from KODAK_URL

Square sources are center-cropped, the rest keep their shape; each is
resized so its long side is SIDE pixels (the page downsamples again to
the working size). Data URLs (not image files) let the page read the
pixels from file:// too, where a canvas drawn from a file <img> is
tainted.
"""
import base64
import io
import pathlib
import urllib.request

import numpy as np
import skimage.data
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SIDE = 256
KODAK_URL = "https://r0k.us/graphics/kodak/kodak/kodim{:02d}.png"
KODAK = {"hats": 3, "motocross": 5, "lighthouse": 21, "parrots": 23}


def crop_square(im: Image.Image, cx: float = .5, cy: float = .5
                ) -> Image.Image:
    """Crop the largest square centered near (cx, cy), as image fractions."""
    w, h = im.size
    s = min(w, h)
    x0 = int(round(np.clip(cx * w - s / 2, 0, w - s)))
    y0 = int(round(np.clip(cy * h - s / 2, 0, h - s)))
    return im.crop((x0, y0, x0 + s, y0 + s))


def fit(im: Image.Image) -> Image.Image:
    """Resize so the long side is SIDE pixels."""
    k = SIDE / max(im.size)
    size = (round(im.width * k), round(im.height * k))
    return im.resize(size, Image.LANCZOS)


def kodak(num: int) -> Image.Image:
    """Kodak test image kodimNN, downloaded to build/kodak/ on first use."""
    path = ROOT / f"build/kodak/kodim{num:02d}.png"
    if not path.exists():
        path.parent.mkdir(exist_ok=True)
        with urllib.request.urlopen(KODAK_URL.format(num)) as r:
            path.write_bytes(r.read())
    return Image.open(path)


def main() -> None:
    """Crop, resize and encode each stock picture, in thumbnail order."""
    src = {
        "dog": Image.open(ROOT / "build/dog.jpg"),
        "parrots": kodak(KODAK["parrots"]),
        "hats": kodak(KODAK["hats"]),
        "astronaut": Image.fromarray(skimage.data.astronaut()),
        "cat": Image.fromarray(skimage.data.chelsea()),
        "coffee": Image.fromarray(skimage.data.coffee()),
        "motocross": kodak(KODAK["motocross"]),
        "lighthouse": kodak(KODAK["lighthouse"]),
        "cameraman": Image.fromarray(skimage.data.camera()),
        "coins": Image.fromarray(skimage.data.coins()),
        "rocket": Image.fromarray(skimage.data.rocket()),
    }
    center = {"astronaut": (.45, .5), "cat": (.55, .5), "coffee": (.5, .5),
              "dog": (.5, .5), "cameraman": (.5, .5)}
    urls = []
    for name, im in src.items():
        im = im.convert("RGB")
        if name in center:
            im = crop_square(im, *center[name])
        elif name == "rocket":
            w, h = im.size
            im = im.crop((int(w * .3), 0, int(w * .72), h))
        im = fit(im)
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=88)
        print(name, im.size, buf.tell(), "bytes")
        b64 = base64.b64encode(buf.getvalue()).decode()
        urls.append(f'  {name}: "data:image/jpeg;base64,{b64}",')
    js = ("// Stock pictures for the image tab as data URLs; written by\n"
          "// build/make_images.py.\n"
          "const IMAGES = {\n" + "\n".join(urls) + "\n};\n")
    (ROOT / "js/images.js").write_text(js)


if __name__ == "__main__":
    main()
