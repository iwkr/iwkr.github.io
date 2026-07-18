# Testing

## Modes

| Command | Use for |
|---|---|
| `npm run dev` | Development — live reload, instant edits, no bundling |
| `npm run build && npm run preview` | Pre-commit validation — real bundle, real service worker, real PWA |

Test app logic in **dev**. Validate PWA behavior in **preview**.

---

## Core app

| Check | How |
|---|---|
| Graph loads | Nodes and links render, no console errors |
| Pan / zoom | Drag and pinch/scroll work; camera persists on reload |
| Node tap | Panel opens with name, kata, spirit |
| Lock states | Locked nodes visible but muted; unlock when prereqs mastered |
| Mark as Mastered | State persists after hard reload |
| Progress bar | Fraction updates correctly |
| Reset | Clears state, returns to root nodes mastered only |
| Notes | Text saves on input, persists after reload |
| EMOM mode | Toggle in settings; kata switches format; "▶ Start EMOM" appears |
| Timer deep-link | Clicking "▶ Start EMOM" opens timer with correct interval/sets/cue |
| Timer | Starts, pauses, resets, counts down, tones fire on interval |
| Mobile bottom sheet | Peek → expand → close; kata preview in peek state |

---

## PWA (preview only)

Open DevTools → Application.

| Check | What to look for |
|---|---|
| Manifest | Name, icons (192 + 512 PNG), theme color, `display: standalone` |
| Service worker | Status: "activated and running" |
| Cache storage | `graph.json` and `nodeimages/` entries present |
| Install prompt | Address bar shows install icon (Chrome desktop / mobile) |
| Offline | Network tab → offline → hard reload → app loads and is interactive |

---

## Regression watch-points

These have broken before — check after any structural change:

- Timer deep-link params (`?name=&m=&s=&r=&cue=`) pre-populate correctly
- `localStorage` keys are version-prefixed — bumping major clears state, minor/patch preserves it
- Mobile: bottom sheet, panel teleport, compact card all work at 390px width
- Desktop: sidebar visible, tray toggle works, bottom sheet absent
