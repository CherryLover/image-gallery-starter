#!/usr/bin/env python3
"""
Rebuild data/images.json from local image files.

Usage:
  python3 scripts/generate-images-json.py [image_dir]

Default image dir: .migration/web (fallback: .migration/originals)
Public base URL: https://s3-store.flyooo.uk/gallery

If .migration/prepared.json exists, files are ordered as listed there
(Cloudinary public_id desc). Otherwise filenames are sorted reverse
(so newer IMG_xxxx often appear first).

Color algorithm (Unsplash-style representative color):
  1. Downsample to a small thumbnail
  2. Sqrt-mean of RGB channels (more perceptual than plain average)
Result stored in each item's `color` field as #rrggbb.
"""

from __future__ import annotations

import base64
import io
import json
import math
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Please install Pillow: pip install pillow", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DIRS = [
    ROOT / ".migration" / "web",
    ROOT / ".migration" / "originals",
]
PREPARED = ROOT / ".migration" / "prepared.json"
OUT = ROOT / "data" / "images.json"
BASE_URL = "https://s3-store.flyooo.uk/gallery"
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def average_color_unsplash_style(img: Image.Image) -> str:
    """Unsplash-like single representative color via sqrt-mean RGB."""
    im = img.convert("RGB")
    im.thumbnail((50, 50), Image.Resampling.BOX)
    # flatten without deprecated getdata()
    px = im.load()
    w, h = im.size
    r = g = b = 0.0
    n = w * h
    if n == 0:
        return "#000000"
    for y in range(h):
        for x in range(w):
            pr, pg, pb = px[x, y]
            r += pr * pr
            g += pg * pg
            b += pb * pb
    r = int(round(math.sqrt(r / n)))
    g = int(round(math.sqrt(g / n)))
    b = int(round(math.sqrt(b / n)))
    return f"#{r:02x}{g:02x}{b:02x}"


def blur_data_url(img: Image.Image) -> str:
    im = img.convert("RGB")
    w, h = im.size
    target_w = 8
    target_h = max(1, round(h * target_w / w))
    tiny = im.resize((target_w, target_h), Image.Resampling.BOX)
    buf = io.BytesIO()
    tiny.save(buf, format="JPEG", quality=70, optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{b64}"


def resolve_dir(arg: str | None) -> Path:
    if arg:
        p = Path(arg)
        if not p.is_dir():
            print(f"Not a directory: {p}", file=sys.stderr)
            sys.exit(1)
        return p
    for d in DEFAULT_DIRS:
        if d.is_dir() and any(x.suffix.lower() in EXTS for x in d.iterdir()):
            return d
    print("No image directory found. Pass a path.", file=sys.stderr)
    sys.exit(1)


def ordered_files(src_dir: Path) -> list[Path]:
    by_name = {
        p.name: p
        for p in src_dir.iterdir()
        if p.is_file() and p.suffix.lower() in EXTS
    }
    if PREPARED.is_file():
        prepared = json.loads(PREPARED.read_text())
        ordered = []
        for item in prepared:
            name = item.get("filename")
            if name in by_name:
                ordered.append(by_name.pop(name))
        # any leftover files append reverse-sorted
        ordered.extend(sorted(by_name.values(), key=lambda p: p.name.lower(), reverse=True))
        return ordered
    return sorted(by_name.values(), key=lambda p: p.name.lower(), reverse=True)


def main() -> None:
    src_dir = resolve_dir(sys.argv[1] if len(sys.argv) > 1 else None)
    files = ordered_files(src_dir)
    if not files:
        print(f"No images found in {src_dir}", file=sys.stderr)
        sys.exit(1)

    manifest = []
    for i, path in enumerate(files):
        fmt = path.suffix.lower().lstrip(".")
        if fmt == "jpeg":
            fmt = "jpg"
        with Image.open(path) as img:
            width, height = img.size
            color = average_color_unsplash_style(img)
            blur = blur_data_url(img)
        name = path.name
        manifest.append(
            {
                "id": i,
                "src": f"{BASE_URL}/{name}",
                "key": f"gallery/{name}",
                "filename": name,
                "width": width,
                "height": height,
                "format": fmt,
                "color": color,
                "blurDataUrl": blur,
            }
        )
        print(f"{i}: {name} {width}x{height} {color}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {OUT} ({len(manifest)} images)")


if __name__ == "__main__":
    main()
