#!/usr/bin/env python3
"""
Convert public/nodeimages/*.png → WebP and report sizes.
Run in dry-run mode first (default) to see the size report.
Pass --apply to actually convert, move PNGs to dev/pngbak/, and update graph.json.
Pass --lossy [quality] to use lossy compression (default quality: 87).
"""

import argparse, json, os, shutil, sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow required: pip install Pillow")

ROOT       = Path(__file__).parent.parent
IMAGES_DIR = ROOT / "public" / "nodeimages"
GRAPH_JSON = ROOT / "public" / "graph.json"
PNG_BAK    = Path(__file__).parent / "pngbak"

def convert(src: Path, lossless: bool, quality: int) -> bytes:
    with Image.open(src) as img:
        import io
        buf = io.BytesIO()
        if lossless:
            img.save(buf, format="WEBP", lossless=True)
        else:
            img.save(buf, format="WEBP", quality=quality, method=6)
        return buf.getvalue()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply",  action="store_true", help="Actually convert and replace files")
    ap.add_argument("--lossy",  action="store_true", help="Use lossy compression")
    ap.add_argument("--quality", type=int, default=87, help="Lossy quality 0-100 (default 87)")
    args = ap.parse_args()

    pngs = sorted(IMAGES_DIR.glob("*.png"))
    if not pngs:
        sys.exit(f"No PNGs found in {IMAGES_DIR}")

    lossless = not args.lossy
    mode_label = f"lossless" if lossless else f"lossy q={args.quality}"
    print(f"\nMode: WebP {mode_label}  |  {'DRY RUN' if not args.apply else 'APPLYING'}")
    print(f"{'File':<20} {'PNG KB':>8} {'WebP KB':>9} {'Savings':>9}")
    print("─" * 50)

    total_png = total_webp = 0
    results = []
    for png in pngs:
        png_size  = png.stat().st_size
        webp_data = convert(png, lossless, args.quality)
        webp_size = len(webp_data)
        saving    = (1 - webp_size / png_size) * 100
        total_png  += png_size
        total_webp += webp_size
        results.append((png, webp_data, webp_size))
        print(f"{png.name:<20} {png_size//1024:>7}K {webp_size//1024:>8}K {saving:>8.1f}%")

    print("─" * 50)
    total_saving = (1 - total_webp / total_png) * 100
    print(f"{'TOTAL':<20} {total_png//1024//1024:>6}MB {total_webp//1024//1024:>7}MB {total_saving:>8.1f}%")
    print(f"  PNG total:  {total_png/1e6:.1f} MB")
    print(f"  WebP total: {total_webp/1e6:.1f} MB  ({mode_label})")

    if not args.apply:
        print("\nDry run complete. Pass --apply to convert and replace files.")
        print("Pass --lossy [--quality N] to compare lossy mode.")
        return

    # Backup PNGs
    PNG_BAK.mkdir(exist_ok=True)
    print(f"\nBacking up PNGs to {PNG_BAK} ...")
    for png, _, _ in results:
        shutil.move(str(png), PNG_BAK / png.name)

    # Write WebP files
    print("Writing WebP files ...")
    for png, webp_data, _ in results:
        out = IMAGES_DIR / png.with_suffix(".webp").name
        out.write_bytes(webp_data)

    # Update graph.json
    print("Updating graph.json ...")
    graph = json.loads(GRAPH_JSON.read_text())
    for node in graph["nodes"]:
        if node.get("image", "").endswith(".png"):
            node["image"] = node["image"].replace(".png", ".webp")
    GRAPH_JSON.write_text(json.dumps(graph, indent=2))

    print(f"\nDone. {len(results)} images converted.")
    print(f"Originals saved to: {PNG_BAK}")

if __name__ == "__main__":
    main()
