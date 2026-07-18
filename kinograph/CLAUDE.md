# Kinograph

A martial arts skill tree for people who need structure to find joy in physical exercise. Nodes represent exercises, unlocked progressively as prerequisites are mastered. Designed with ADHD in mind — the tree removes decision fatigue, the EMOM timer removes pacing fatigue.

## Dev

```bash
npm run dev        # http://localhost:5173  (HMR)
npm run build      # production bundle + service worker → dist/
npm run preview    # serve dist/ — use for PWA/offline validation
```

See [TESTING.md](./TESTING.md) for the full validation checklist.

## Structure

```
index.html         # shell only — no inline styles or scripts
timer.html         # sky timer — standalone repeating interval timer
src/
├── config.js      # VERSION string (single source of truth)
├── main.js        # all app logic
├── style.css      # all styles
└── timer.js       # timer logic (extracted from timer.html)
public/            # static assets — copied as-is by Vite
├── graph.json     # graph data — nodes + links
├── favicon.svg
├── icon-192.png   # PWA manifest icons (rasterized from favicon.svg)
├── icon-512.png
└── nodeimages/    # node_0.webp … node_251.webp
vite.config.js     # build config + vite-plugin-pwa (Workbox)
dev/               # generation scripts and iteration history
  ├── gen_emom.py  # generates emomKata fields from kata strings
  └── fix_emom.py  # manual corrections applied after gen_emom
```

## graph.json schema

```json
{
  "nodes": [{
    "id": 0,
    "x": 5922, "y": 4338,
    "radius": 170,
    "color": "#d8fafe",
    "image": "nodeimages/node_0.webp",
    "text": "STRAIGHT",
    "start": false,
    "kata": "3×20 straight punches each hand, full hip rotation, snapping retraction, 45s rest",
    "emomKata": "every 75s × 3: 20 reps each side, full hip rotation, snapping retraction",
    "spirit": "From center, everything."
  }],
  "links": [{ "source": "0", "target": "1", "color": "#aaa" }]
}
```

**Node fields:**
- `start: true` — root node, auto-mastered on first load (18 root nodes)
- `kata` — standard set/rep prescription shown in the panel (234/252 nodes)
- `emomKata` — EMOM variant: `every [interval] × [sets]: [cues]` (215/252 nodes). Event-based nodes (runs, swims, climbs, tournament) have no emomKata.
- `spirit` — italic quote shown below the node name
- `radius` — node circle radius in SVG units

**Graph stats:** 252 nodes, 252 links

## Node states

`locked` → `unlocked` → `mastered`

- A node unlocks when all its prerequisites are mastered
- Mastery is user-declared (tap "Mark as Mastered")
- Root nodes (`start: true`) auto-master on first load
- Locked nodes with all prereqs unlocked are visible as a teaser

## Kata modes

The panel supports two display modes toggled via the settings gear (⚙, upper-left of map):

- **Standard** — traditional `3×N, Xs rest` format
- **EMOM** — `every [interval] × [sets]: [cues]` format. When active, a "▶ Start EMOM" button appears that deep-links to `timer.html` with interval/sets/cue pre-populated.

Mode is persisted in `localStorage` as `kinograph_kata_mode` (not version-keyed — it's a preference, not progress).

## Timer (`timer.html`)

Standalone repeating interval timer with:
- Configurable duration (min + sec) and repeat count (finite or ∞)
- Count-in phase ("GET READY")
- Multiple tones + volume
- Deep-link params: `?name=PUSH+UP&m=2&s=0&r=3&cue=15+reps...` — pre-populates settings and shows exercise name/cue at top

## Versioning

Version lives in `src/config.js`. Bump on every feature commit — version string and commit message must match.

```js
export const VERSION = '1.10.0';
export const VERSION_MAJOR = VERSION.split('.')[0];
```

Major version bump resets localStorage. Minor/patch bumps preserve progress.

**localStorage keys:**
- `kinograph_v${VERSION_MAJOR}_state` — node id → `locked | unlocked | mastered`
- `kinograph_v${VERSION_MAJOR}_notes` — node id → string
- `kinograph_v${VERSION_MAJOR}_camera` — `{x, y, k}` pan/zoom state
- `kinograph_kata_mode` — `standard | emom`
- `timer_v${VERSION_MAJOR}_settings` — timer preferences
