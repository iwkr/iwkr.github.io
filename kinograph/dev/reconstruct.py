import json
import cv2
import numpy as np

GRAPH_PATH  = 'graph.json'
OUTPUT_PATH = 'output_reconstruct.jpg'
PADDING     = 220   # px around the bounding box
LINK_WIDTH  = 18

with open(GRAPH_PATH) as f:
    data = json.load(f)

nodes = data['nodes']
links = data['links']

xs = [n['x'] for n in nodes]
ys = [n['y'] for n in nodes]
x_min, x_max = min(xs), max(xs)
y_min, y_max = min(ys), max(ys)

R = nodes[0]['radius']
ox = x_min - R - PADDING
oy = y_min - R - PADDING
W  = x_max - x_min + 2 * R + 2 * PADDING
H  = y_max - y_min + 2 * R + 2 * PADDING

canvas = np.zeros((H, W, 3), dtype=np.uint8)

# Precompute shifted centers
centers = {n['id']: (n['x'] - ox, n['y'] - oy) for n in nodes}

# Draw links first (under nodes)
for link in links:
    cx1, cy1 = centers[link['source']]
    cx2, cy2 = centers[link['target']]
    color_bgr = tuple(link['color_bgr'])
    cv2.line(canvas, (cx1, cy1), (cx2, cy2), color_bgr, LINK_WIDTH, cv2.LINE_AA)

# Paste node images on top using alpha mask
for node in nodes:
    img = cv2.imread(node['image'], cv2.IMREAD_UNCHANGED)
    if img is None:
        print(f"Warning: missing {node['image']}")
        continue

    # Resize to match stored radius in case image size differs
    d = R * 2
    if img.shape[0] != d or img.shape[1] != d:
        img = cv2.resize(img, (d, d), interpolation=cv2.INTER_AREA)

    alpha = img[:, :, 3].astype(np.float32) / 255.0
    bgr   = img[:, :, :3]

    cx, cy = centers[node['id']]
    x0, y0 = cx - R, cy - R
    x1, y1 = x0 + d, y0 + d

    # Clamp to canvas bounds
    sl = slice(max(0, y0), min(H, y1)), slice(max(0, x0), min(W, x1))
    il = slice(max(0, -y0), d - max(0, y1 - H)), slice(max(0, -x0), d - max(0, x1 - W))

    a = alpha[il][..., None]
    canvas[sl] = (bgr[il] * a + canvas[sl] * (1 - a)).astype(np.uint8)

cv2.imwrite(OUTPUT_PATH, canvas, [cv2.IMWRITE_JPEG_QUALITY, 92])
print(f"Saved {OUTPUT_PATH}  ({W}×{H}px,  {len(nodes)} nodes, {len(links)} links)")
