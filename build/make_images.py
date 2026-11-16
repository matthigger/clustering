"""Write the image tab's stock pictures to js/images.js as JPEG data URLs.

Usage: ~/venv_ds4400/bin/python -I build/make_images.py

Sources: build/dog.jpg (the course's dog, as in the PCA demo) and four
scikit-image samples: astronaut (NASA, public domain), chelsea the cat
and coffee (CC0), rocket (SpaceX, public domain). Each is center-cropped
to a square (the rocket keeps its portrait shape) and resized so its long
side is SIDE pixels; the page downsamples again to the working size.
Data URLs (not image files) let the page read the pixels from file://
too, where a canvas drawn from a file <img> is tainted.
"""
import base64
import io
import pathlib

import numpy as np
import skimage.data
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SIDE = 256


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


def main() -> None:
    """Crop, resize and save each stock picture."""
    src = {
        "dog": Image.open(ROOT / "build/dog.jpg"),
        "astronaut": Image.fromarray(skimage.data.astronaut()),
        "cat": Image.fromarray(skimage.data.chelsea()),
        "coffee": Image.fromarray(skimage.data.coffee()),
        "rocket": Image.fromarray(skimage.data.rocket()),
    }
    center = {"astronaut": (.45, .5), "cat": (.55, .5), "coffee": (.5, .5)}
    urls = []
    for name, im in src.items():
        im = im.convert("RGB")
        if name in center:
            im = crop_square(im, *center[name])
        elif name == "rocket":
            w, h = im.size
            im = im.crop((int(w * .3), 0, int(w * .72), h))
        else:
            im = crop_square(im)
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
