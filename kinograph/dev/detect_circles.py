import cv2
import numpy as np

INPUT_PATH = '/home/iwakura/von/tree.jpg'
OUTPUT_PATH = 'output_circles.jpg'

SCALE      = 1
RADIUS     = 170     # circle radius at 0.5x scale (= 142px at full res); tune this first
N_ANGLES   = 150     # perimeter sample points
STRIDE     = 8       # scan grid stride (px at 0.5x); must be << RADIUS
MIN_V      = 30      # 10th-percentile HSV-V on perimeter (rejects black/background)
MAX_STD    = 10      # max per-channel std across perimeter samples (same-color check)
NMS_DIST   = RADIUS  # merge detections closer than this

img = cv2.imread(INPUT_PATH)
assert img is not None
print(f"Loaded: {img.shape}")

# ── Remove watermark via background flood-fill ────────────────────────────────
# Flood-fill from all four corners selects the entire contiguous background.
# Tolerance 55 bridges anti-aliased text edges so the watermark is included,
# then the whole selection is collapsed to pure black.
_h, _w = img.shape[:2]
_flood = img.copy()
_fmask = np.zeros((_h + 2, _w + 2), dtype=np.uint8)
# Tight flood-fill to select the full contiguous background without eating node edges.
# Close the mask to swallow any bright islands (watermark text) sitting inside it.
_tol = (4, 4, 4)
for _pt in [(0, 0), (0, _w - 1), (_h - 1, 0), (_h - 1, _w - 1)]:
    cv2.floodFill(_flood, _fmask, (_pt[1], _pt[0]), (0, 0, 0), _tol, _tol)
_bg_mask = _fmask[1:-1, 1:-1].astype(np.uint8)
_bg_mask = cv2.morphologyEx(_bg_mask, cv2.MORPH_CLOSE, np.ones((60, 60), np.uint8))
img[_bg_mask > 0] = 0
print("Background unified")

small = cv2.resize(img, (0, 0), fx=SCALE, fy=SCALE, interpolation=cv2.INTER_AREA)
h, w = small.shape[:2]
hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)

# Precompute perimeter offsets
angles = np.linspace(0, 2 * np.pi, N_ANGLES, endpoint=False)
off_x = np.round(RADIUS * np.cos(angles)).astype(np.int32)  # (N,)
off_y = np.round(RADIUS * np.sin(angles)).astype(np.int32)

# Candidate center grid (stay RADIUS away from edges so perimeter stays in-bounds)
cxs = np.arange(RADIUS, w - RADIUS, STRIDE, dtype=np.int32)
cys = np.arange(RADIUS, h - RADIUS, STRIDE, dtype=np.int32)
gx, gy = np.meshgrid(cxs, cys)
gx, gy = gx.ravel(), gy.ravel()
print(f"Scanning {len(gx):,} candidates...")

# Perimeter sample coordinates: (M, N)
px = gx[:, None] + off_x[None, :]   # (M, N)
py = gy[:, None] + off_y[None, :]

# Clip (edge candidates already excluded, but rounding may push 1px out)
px = np.clip(px, 0, w - 1)
py = np.clip(py, 0, h - 1)

# Sample BGR and V
bgr = small[py, px].astype(np.float32)   # (M, N, 3)
v   = hsv[:, :, 2][py, px].astype(np.float32)  # (M, N)

# Condition 1: perimeter is non-black (10th percentile tolerates a few artifact pixels)
min_v = np.percentile(v, 10, axis=1)  # (M,)

# Condition 2: every perimeter pixel is the same color (low per-channel std)
std_b = bgr[:, :, 0].std(axis=1)
std_g = bgr[:, :, 1].std(axis=1)
std_r = bgr[:, :, 2].std(axis=1)
max_std = np.maximum(np.maximum(std_b, std_g), std_r)

valid = (min_v >= MIN_V) & (max_std <= MAX_STD)
vx, vy = gx[valid], gy[valid]
score  = min_v[valid]  # use min brightness as confidence
print(f"Valid candidates before NMS: {len(vx)}")

# NMS: keep highest-score center when multiples cluster on the same node
order = np.argsort(score)[::-1]
vx, vy = vx[order], vy[order]
kept_x, kept_y = [], []
suppressed = np.zeros(len(vx), dtype=bool)
for i in range(len(vx)):
    if suppressed[i]:
        continue
    cx, cy = vx[i], vy[i]
    kept_x.append(cx)
    kept_y.append(cy)
    dist = np.hypot(vx[i+1:] - cx, vy[i+1:] - cy)
    suppressed[i+1:] |= (dist < NMS_DIST)

print(f"After NMS: {len(kept_x)} circles")

# ── Link detection ────────────────────────────────────────────────────────────
# A link exists between two nodes when all pixels along the segment strictly
# between their perimeters are one non-black, non-grey, consistent color.
LINK_MAX_DIST = int(RADIUS * 2.6)  # max center-to-center to bother checking
LINK_MIN_V    = 40                  # minimum V (brightness) along link
LINK_MIN_S    = 25                  # minimum mean S (saturation — rejects grey)
LINK_MAX_STD  = 22                  # max per-channel std along link (same-color)

node_colors = []
for cx, cy in zip(kept_x, kept_y):
    _px = np.clip((cx + np.round(RADIUS * np.cos(angles))).astype(int), 0, w - 1)
    _py = np.clip((cy + np.round(RADIUS * np.sin(angles))).astype(int), 0, h - 1)
    node_colors.append(small[_py, _px].mean(axis=0))

links = []  # (i, j, mean_bgr)
for i in range(len(kept_x)):
    for j in range(i + 1, len(kept_x)):
        cx1, cy1 = kept_x[i], kept_y[i]
        cx2, cy2 = kept_x[j], kept_y[j]
        d = np.hypot(cx2 - cx1, cy2 - cy1)
        if d > LINK_MAX_DIST or d < RADIUS * 1.2:
            continue
        # Unit vector from i → j
        ux, uy = (cx2 - cx1) / d, (cy2 - cy1) / d
        # Segment endpoints: just outside each perimeter
        x0, y0 = cx1 + RADIUS * ux, cy1 + RADIUS * uy
        x1, y1 = cx2 - RADIUS * ux, cy2 - RADIUS * uy
        seg_len = np.hypot(x1 - x0, y1 - y0)
        if seg_len < 8:
            continue
        n_s = max(8, int(seg_len / 4))
        ts  = np.linspace(0, 1, n_s)
        sx  = np.clip((x0 + ts * (x1 - x0)).astype(int), 0, w - 1)
        sy  = np.clip((y0 + ts * (y1 - y0)).astype(int), 0, h - 1)
        pix_bgr = small[sy, sx].astype(np.float32)
        pix_hsv = hsv[sy, sx].astype(np.float32)
        if pix_hsv[:, 2].min() < LINK_MIN_V:
            continue
        if pix_hsv[:, 1].mean() < LINK_MIN_S:
            continue
        if pix_bgr.std(axis=0).max() > LINK_MAX_STD:
            continue
        links.append((i, j, tuple(int(v) for v in pix_bgr.mean(axis=0))))

print(f"Links detected: {len(links)}")

# Draw on full-resolution image
output = img.copy()
R_full = int(RADIUS / SCALE)
for i, j, link_color in links:
    cv2.line(output, (kept_x[i], kept_y[i]), (kept_x[j], kept_y[j]),
             link_color, 4, cv2.LINE_AA)
for cx, cy in zip(kept_x, kept_y):
    fx, fy = int(cx / SCALE), int(cy / SCALE)
    cv2.circle(output, (fx, fy), R_full, (255, 0, 0), 6)
    cv2.circle(output, (fx, fy), 6, (0, 0, 255), -1)

print(f"Total circles detected: {len(kept_x)}")
cv2.imwrite(OUTPUT_PATH, output, [cv2.IMWRITE_JPEG_QUALITY, 90])

# ── OCR setup ────────────────────────────────────────────────────────────────
import easyocr
print("Loading OCR model...")
_ocr = easyocr.Reader(['en'], gpu=False, verbose=False)
print("OCR ready")

_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ& °'

from spellchecker import SpellChecker
_spell = SpellChecker()

def _fix_word(w):
    if not w.isalpha():
        return w
    corr = _spell.correction(w.lower())
    return corr.upper() if corr else w

def _fix(text):
    return ' '.join(_fix_word(w) for w in text.split())

def ocr_node(rgba):
    alpha = rgba[:, :, 3:4].astype(np.float32) / 255.0
    flat  = (rgba[:, :, :3].astype(np.float32) * alpha + 255 * (1 - alpha)).astype(np.uint8)
    results = _ocr.readtext(flat, detail=1, paragraph=False, allowlist=_CHARS)
    if not results:
        return ''
    # Bucket y into 80px rows (avg_cy/80); within each row sort left-to-right
    results.sort(key=lambda r: (round(sum(p[1] for p in r[0]) / (4 * 80)), sum(p[0] for p in r[0]) / 4))
    return ' '.join(_fix(r[1]).strip() for r in results if r[1].strip())

# ── Node image export ─────────────────────────────────────────────────────────
import json, os

os.makedirs("nodeimages", exist_ok=True)

# Circular alpha mask: 2R × 2R with transparent outside the circle
_d = RADIUS * 2
_ys, _xs = np.ogrid[:_d, :_d]
_circ_mask = ((_xs - RADIUS) ** 2 + (_ys - RADIUS) ** 2) <= RADIUS ** 2

node_image_paths = []
node_texts = []
for i, (cx, cy) in enumerate(zip(kept_x, kept_y)):
    x0, y0 = cx - RADIUS, cy - RADIUS
    x1, y1 = cx + RADIUS, cy + RADIUS
    pad_l = max(0, -x0); pad_t = max(0, -y0)
    pad_r = max(0, x1 - w); pad_b = max(0, y1 - h)
    crop = img[max(0, y0):min(h, y1), max(0, x0):min(w, x1)]
    if pad_l or pad_t or pad_r or pad_b:
        crop = np.pad(crop, ((pad_t, pad_b), (pad_l, pad_r), (0, 0)))
    rgba = cv2.cvtColor(crop, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = np.where(_circ_mask, 255, 0).astype(np.uint8)
    path = f"nodeimages/node_{i}.png"
    cv2.imwrite(path, rgba)
    node_image_paths.append(path)
    node_texts.append(ocr_node(rgba))
    if (i + 1) % 20 == 0:
        print(f"  OCR {i + 1}/{len(kept_x)}...")

print(f"Node images + OCR → nodeimages/  ({len(node_image_paths)} PNGs)")

# ── Graph data export ─────────────────────────────────────────────────────────
def bgr_to_hex(bgr):
    b, g, r = int(bgr[0]), int(bgr[1]), int(bgr[2])
    return f"#{r:02x}{g:02x}{b:02x}"

graph_data = {
    "nodes": [
        {
            "id": i,
            "x": int(kept_x[i]),
            "y": int(kept_y[i]),
            "radius": RADIUS,
            "color": bgr_to_hex(node_colors[i]),
            "color_bgr": [int(v) for v in node_colors[i]],
            "image": node_image_paths[i],
            "text": node_texts[i],
        }
        for i in range(len(kept_x))
    ],
    "links": [
        {
            "source": i,
            "target": j,
            "color": bgr_to_hex(link_color),
            "color_bgr": list(link_color),
        }
        for i, j, link_color in links
    ],
}

with open("graph.json", "w") as f:
    json.dump(graph_data, f, indent=2)
print(f"Graph data → graph.json  ({len(graph_data['nodes'])} nodes, {len(graph_data['links'])} links)")
print(f"Saved to {OUTPUT_PATH}")

# ── Debug: gap heatmap ────────────────────────────────────────────────────────
# Work at 10% scale so the images are browser-viewable
from scipy.ndimage import distance_transform_edt

VIZ = 0.1
vw, vh = int(w * VIZ), int(h * VIZ)
R_viz = max(1, int(RADIUS * VIZ))

# Tree mask: any non-black pixel
small_viz = cv2.resize(small, (vw, vh), interpolation=cv2.INTER_AREA)
tree_mask = cv2.cvtColor(small_viz, cv2.COLOR_BGR2GRAY) > 20

# Distance from every pixel to the nearest detected center
center_canvas = np.zeros((vh, vw), dtype=np.uint8)
for cx, cy in zip(kept_x, kept_y):
    vx_c = int(cx * VIZ); vy_c = int(cy * VIZ)
    if 0 <= vx_c < vw and 0 <= vy_c < vh:
        center_canvas[vy_c, vx_c] = 255
dist_to_det = distance_transform_edt(center_canvas == 0)

# Normalise to 0-255 capped at 2× the expected node spacing
cap = R_viz * 2.5
dist_norm = (np.clip(dist_to_det, 0, cap) / cap * 255).astype(np.uint8)

gap_heatmap = cv2.applyColorMap(dist_norm, cv2.COLORMAP_JET)
gap_heatmap[~tree_mask] = (10, 10, 10)
for cx, cy in zip(kept_x, kept_y):
    cv2.circle(gap_heatmap, (int(cx*VIZ), int(cy*VIZ)), R_viz, (0, 255, 0), 1)
    cv2.circle(gap_heatmap, (int(cx*VIZ), int(cy*VIZ)), 2, (255, 255, 255), -1)

cv2.imwrite('output_gaps.jpg', gap_heatmap, [cv2.IMWRITE_JPEG_QUALITY, 92])
print("Gap heatmap → output_gaps.jpg  (blue=covered, red=gap)")

# ── Debug: score map (max_std at every grid point) ────────────────────────────
# Low std = perimeter is uniform color = good match. Shows where detector struggled.
score_canvas = np.full((vh, vw), 255, dtype=np.float32)  # 255 = no data
for gxi, gyi, s in zip(gx, gy, max_std):
    vx_s = int(gxi * VIZ); vy_s = int(gyi * VIZ)
    if 0 <= vx_s < vw and 0 <= vy_s < vh:
        score_canvas[vy_s, vx_s] = min(score_canvas[vy_s, vx_s], s)

# Clip to 0-80 range (values >80 are clearly background/noise)
score_u8 = (np.clip(score_canvas, 0, 80) / 80 * 255).astype(np.uint8)
score_map = cv2.applyColorMap(score_u8, cv2.COLORMAP_VIRIDIS)
score_map[~tree_mask] = (10, 10, 10)

cv2.imwrite('output_score.jpg', score_map, [cv2.IMWRITE_JPEG_QUALITY, 92])
print("Score map     → output_score.jpg  (purple=low std=good match, yellow=high std=no match)")

# ── Vis 1: color-matched outlines + links on dark background ─────────────────
angles_s = angles  # reuse perimeter angles
colored = np.zeros_like(small)
# Draw links first (under nodes)
for i, j, link_color in links:
    cv2.line(colored, (kept_x[i], kept_y[i]), (kept_x[j], kept_y[j]),
             link_color, 4, cv2.LINE_AA)
# Draw nodes on top
for (cx, cy), nc in zip(zip(kept_x, kept_y), node_colors):
    ring_color = tuple(int(v) for v in nc)
    highlight  = tuple(min(255, int(v * 1.4)) for v in nc)
    cv2.circle(colored, (cx, cy), RADIUS + 8,  ring_color, 18, cv2.LINE_AA)
    cv2.circle(colored, (cx, cy), RADIUS,       ring_color, 6,  cv2.LINE_AA)
    cv2.circle(colored, (cx, cy), RADIUS - 10,  highlight,  2,  cv2.LINE_AA)
    cv2.circle(colored, (cx, cy), 5,           (255,255,255), -1, cv2.LINE_AA)

cv2.imwrite('output_colored.jpg', colored, [cv2.IMWRITE_JPEG_QUALITY, 92])
print("Colored rings → output_colored.jpg")


# ── Vis 2: detected-link graph on dark background ─────────────────────────────
# Edges = only confirmed links (perimeter-to-perimeter same-color check).
graph = np.zeros_like(small)

# Draw detected links
for i, j, link_color in links:
    cv2.line(graph, (kept_x[i], kept_y[i]), (kept_x[j], kept_y[j]),
             link_color, 4, cv2.LINE_AA)

# Draw nodes on top
for (cx, cy), color in zip(zip(kept_x, kept_y), node_colors):
    c = tuple(int(v) for v in color)
    cv2.circle(graph, (cx, cy), RADIUS,      c,              5, cv2.LINE_AA)
    cv2.circle(graph, (cx, cy), 7,           (255,255,255), -1, cv2.LINE_AA)

cv2.imwrite('output_graph.jpg', graph, [cv2.IMWRITE_JPEG_QUALITY, 92])
print("Graph view    → output_graph.jpg")
