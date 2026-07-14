#!/usr/bin/env python3
"""
From full-size web JPEGs, build:
  - thumb (max edge 1080) for grid
  - large (max edge 1920) for lightbox
Also rewrite data/images.json with src / srcLarge / srcFull.

Saves as baseline JPEG (progressive=False) so browsers don't paint
scanline-by-scanline while downloading.
"""

from __future__ import annotations

import base64
import io
import json
import math
import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    print("pip install pillow", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / ".migration" / "web"
OUT_THUMB = ROOT / ".migration" / "variants" / "thumb"
OUT_LARGE = ROOT / ".migration" / "variants" / "large"
PREPARED = ROOT / ".migration" / "prepared.json"
JSON_OUT = ROOT / "data" / "images.json"
BASE = "https://s3-store.flyooo.uk/gallery"

THUMB_MAX = 1080
LARGE_MAX = 1920
QUALITY_THUMB = 82
QUALITY_LARGE = 85


def average_color(img: Image.Image) -> str:
    im = img.convert("RGB")
    im.thumbnail((50, 50), Image.Resampling.BOX)
    px = im.load()
    w, h = im.size
    n = w * h
    if not n:
        return "#000000"
    r = g = b = 0.0
    for y in range(h):
        for x in range(w):
            pr, pg, pb = px[x, y]
            r += pr * pr
            g += pg * pg
            b += pb * pb
    return f"#{int(round(math.sqrt(r / n))):02x}{int(round(math.sqrt(g / n))):02x}{int(round(math.sqrt(b / n))):02x}"


def blur_data_url(img: Image.Image) -> str:
    im = img.convert("RGB")
    w, h = im.size
    tw = 16
    th = max(1, round(h * tw / w))
    tiny = im.resize((tw, th), Image.Resampling.BOX)
    # slightly larger + blur-like soft by second downscale upscale feel via low q
    buf = io.BytesIO()
    tiny.save(buf, format="JPEG", quality=40, optimize=True, progressive=False)
    return f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode('ascii')}"


def fit(img: Image.Image, max_edge: int) -> Image.Image:
    im = ImageOps.exif_transpose(img).convert("RGB")
    w, h = im.size
    long_edge = max(w, h)
    if long_edge <= max_edge:
        return im
    scale = max_edge / long_edge
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    return im.resize((nw, nh), Image.Resampling.LANCZOS)


def save_baseline(img: Image.Image, path: Path, quality: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(
        path,
        format="JPEG",
        quality=quality,
        optimize=True,
        progressive=False,  # avoid progressive scan painting
        subsampling="4:2:0",
    )


def ordered_sources() -> list[Path]:
    files = {
        p.name: p
        for p in SRC_DIR.iterdir()
        if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
    }
    if PREPARED.is_file():
        prepared = json.loads(PREPARED.read_text())
        ordered = []
        for item in prepared:
            name = item.get("filename")
            if name in files:
                ordered.append(files.pop(name))
        ordered.extend(sorted(files.values(), key=lambda p: p.name, reverse=True))
        return ordered
    return sorted(files.values(), key=lambda p: p.name, reverse=True)


def main() -> None:
    if not SRC_DIR.is_dir():
        print(f"Missing source dir: {SRC_DIR}", file=sys.stderr)
        sys.exit(1)

    OUT_THUMB.mkdir(parents=True, exist_ok=True)
    OUT_LARGE.mkdir(parents=True, exist_ok=True)

    sources = ordered_sources()
    manifest = []

    for i, src_path in enumerate(sources):
        name = src_path.stem + ".jpg"
        with Image.open(src_path) as raw:
            full = ImageOps.exif_transpose(raw).convert("RGB")
            fw, fh = full.size
            color = average_color(full)
            blur = blur_data_url(full)

            thumb = fit(full, THUMB_MAX)
            large = fit(full, LARGE_MAX)
            tw, th = thumb.size
            lw, lh = large.size

            save_baseline(thumb, OUT_THUMB / name, QUALITY_THUMB)
            save_baseline(large, OUT_LARGE / name, QUALITY_LARGE)

        t_bytes = (OUT_THUMB / name).stat().st_size
        l_bytes = (OUT_LARGE / name).stat().st_size
        print(
            f"{i}: {name} full={fw}x{fh} "
            f"thumb={tw}x{th}({t_bytes // 1024}KB) "
            f"large={lw}x{lh}({l_bytes // 1024}KB) {color}"
        )

        manifest.append(
            {
                "id": i,
                "filename": name,
                "format": "jpg",
                "width": tw,
                "height": th,
                "widthLarge": lw,
                "heightLarge": lh,
                "widthFull": fw,
                "heightFull": fh,
                "src": f"{BASE}/t/{name}",
                "srcLarge": f"{BASE}/l/{name}",
                "srcFull": f"{BASE}/{name}",
                "color": color,
                "blurDataUrl": blur,
            }
        )

    JSON_OUT.parent.mkdir(parents=True, exist_ok=True)
    JSON_OUT.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {JSON_OUT} ({len(manifest)} images)")
    print(f"Thumbs: {OUT_THUMB}")
    print(f"Large:  {OUT_LARGE}")


if __name__ == "__main__":
    main()
