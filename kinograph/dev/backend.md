# Working with the Data

Two files are everything you need: `graph.json` and the `nodeimages/` folder.

---

## What you have

**`graph.json`** — 252 nodes, 252 links.

Each node looks like this:
```json
{
  "id": 0,
  "x": 5922,
  "y": 4338,
  "radius": 170,
  "color": "#d8fafe",
  "color_bgr": [254, 250, 216],
  "image": "nodeimages/node_0.png",
  "text": "STRAIGHT",
  "start": false
}
```

`start: true` on 18 nodes — these are the **category/muscle-group roots** that sit at the center of the layout. They look different: big black filled circle, text only, no silhouette graphic. Every progression path begins at one of them.

Each link looks like this:
```json
{
  "source": 0,
  "target": 52,
  "color": "#d9faff",
  "color_bgr": [255, 250, 217]
}
```

**`nodeimages/node_N.png`** — 340×340 RGBA circular badge for each node. Transparent outside the circle. Drop it directly onto any dark background and it just works.

---

## The coordinate system

`x` and `y` are the center of each node in the original image space (~7500×8000px). They are not normalized. Before rendering, offset everything:

```js
const minX = Math.min(...nodes.map(n => n.x));
const minY = Math.min(...nodes.map(n => n.y));
// then place each node at (n.x - minX + padding, n.y - minY + padding)
```

All nodes have `radius: 170` (pixels at original scale). Scale it down proportionally if you're fitting to a smaller canvas.

---

## Color is meaningful

The nodes come in four rough color families — orange/yellow, blue, green, and white — and the links inherit the color of the connection they represent. Use this:

- **Group by color** to build category views (filter to show only green nodes etc.)
- **Link color** often matches its endpoint colors — you can tint or animate links in the same hue family as their nodes
- Colors are in both hex (`color`) and BGR (`color_bgr`). For web use `color`, for OpenCV use `color_bgr`

---

## Graph structure

- Average degree is 2 — it's mostly a tree-like structure with occasional branching
- Max degree is 5 (node 150, "BACK LEG LIFT") — these hubs make natural "anchor" points for layout
- A few nodes are leaves (degree 1) — the tips of each progression path

Build the adjacency list once and reuse it:
```js
const adj = {};
for (const link of links) {
  (adj[link.source] ??= []).push(link.target);
  (adj[link.target] ??= []).push(link.source);
}
```

**Start nodes** (`start: true`) are the 18 roots — one per muscle group / category. To walk a full progression path: pick a start node, then follow links outward (away from center). BFS depth from a start node naturally gives you beginner → advanced ordering.

```js
const startNodes = nodes.filter(n => n.start);
// pick one, BFS outward
function getPath(startId, depth = 5) {
  const visited = new Set([startId]);
  const queue = [[startId, 0]];
  const path = [];
  while (queue.length) {
    const [id, d] = queue.shift();
    if (d > 0) path.push(id);          // skip the root itself
    if (d >= depth) continue;
    for (const neighbor of (adj[id] ?? [])) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([neighbor, d + 1]);
      }
    }
  }
  return path;
}
```

---

## Ideas worth building

**Interactive graph explorer** — render nodes as `<img>` tags or Canvas drawImage calls at their x/y positions, draw SVG lines for links. Click a node to highlight its neighbors, grey out the rest. The circular PNGs are already styled — zero CSS needed beyond `border-radius`.

**Workout path finder** — BFS/DFS from any node. Show the user a random connected trail of 5–8 exercises. The `text` field gives you the exercise name for free.

**Color-filtered gallery** — bucket nodes by their hex color into categories, render each category as a horizontal scroll row. Link color can be used as a subtle connector line between rows.

**Animated force graph** — load into D3 or Cytoscape.js using `x`/`y` as initial positions (so it doesn't scramble on load), then let forces settle gently. The existing layout is already good — small repulsion, frozen positions work fine too.

**Zoomable poster** — since the images are hi-res and the coordinate space is large, OpenSeadragon or Leaflet.js (tile-free mode) can render the full 7500×8000 space with smooth pinch zoom. Each node is an overlay at its exact position.

**Node card on hover** — every node has an image, a name, a color, and a position. That's enough for a clean tooltip or slide-out panel showing the badge large, the exercise name, and "connected to: X, Y, Z."

---

## Loading in JS

```js
const { nodes, links } = await fetch('graph.json').then(r => r.json());

// node image URL
const imgUrl = node => node.image; // e.g. "nodeimages/node_0.png"
```

If you're serving locally just run `python3 -m http.server` from the project folder — the relative paths in `graph.json` resolve correctly.

---

## Loading in Python

```python
import json
with open('graph.json') as f:
    data = json.load(f)

nodes = {n['id']: n for n in data['nodes']}
links = data['links']
```

Node images are standard RGBA PNGs — `cv2.imread(path, cv2.IMREAD_UNCHANGED)` or `PIL.Image.open(path)`.
