# Kinograph

A personal martial arts skill tree. Exercises unlock as prerequisites are mastered — a map of what's been earned and what's still ahead.

## What it is

An interactive SVG graph where each node is an exercise. Nodes carry a **kata** (the prescription) and a **spirit** (a cue). Progress and reflections are saved locally.

Installable as a PWA — works offline.

## Dev

```bash
npm install
npm run dev        # → http://localhost:5173
```

```bash
npm run build      # production bundle + service worker
npm run preview    # serve dist/ — use this to test PWA install and offline mode
```

## Stack

| thing | what |
|---|---|
| `src/main.js` | all app logic |
| `src/config.js` | version — bump major to reset localStorage |
| `src/timer.js` | sky timer logic |
| `public/graph.json` | the full graph — nodes, links, kata, spirit |
| `public/nodeimages/` | one image per node |
| `vite.config.js` | build + PWA (vite-plugin-pwa / Workbox) |
| `dev/` | generation scripts and iteration history |

## Testing

See [TESTING.md](./TESTING.md).
