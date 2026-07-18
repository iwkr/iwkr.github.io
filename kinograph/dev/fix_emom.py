"""Manually reviewed corrections for emomKata values."""
import json

fixes = {
    # ── Broken: distance units (Nm → "N reps, m ...") ──────────────────────
    "ARMY CRAWL":        "every 2.5 min × 3: 20m army crawl, elbows only, body dragging, hips flat throughout",
    "CRAB WALK":         "every 90s × 3: 15m crab walk each direction, hips elevated throughout, smooth lateral movement",
    "DUCK WALK":         "every 105s × 3: 20m duck walk, heels flat, knees tracking toes, consistent depth",
    "LIZARD CRAWL":      "every 90s × 3: 10 lengths of 10m, hips low, alternating hands, continuous forward movement",

    # ── Broken: hold durations parsed as rep counts ─────────────────────────
    "AIR SIT":           "every 3.5 min × 3: 60s hold, no wall, thighs parallel, arms forward",
    "COPENHAGEN PLANK":  "every 2.5 min × 3: 30s hold each side, top leg on elevated surface, full body rigid",
    "ELBOW PLANK":       "every 2.5 min × 3: 90s hold, forearms flat, body rigid, lower back pressed flat, no hip pike",
    "GERMAN HANG":       "every 2.5 min × 3: 45s hold, shoulders fully open, controlled entry",
    "GRIP TRAINER":      "every 2 min × 3: 60s squeeze at 80% max, rest remaining",
    "HARDSTYLE PLANK":   "every 2.5 min × 3: 45s hold, maximum full-body tension, fists clenched, glutes squeezed",
    "INVERTED HANG":     "every 105s × 3: 30s hold, body parallel to bar, arms locked, core rigid",
    "JACKING":           "every 105s × 3: 60s continuous, consistent height, no missed beats",
    "PLANCHE LEAN":      "every 2 min × 3: 30s hold, hands turned backward, shoulders protracted, body at 20° forward tilt",
    "SIDE PLANK":        "every 3 min × 3: 60s hold each side, body rigid, hips stacked, no rotation",
    "WALL SIT":          "every 2.5 min × 3: 90s hold, thighs parallel, back flat, heels flat, no shifting",
    "WIDE PLANK":        "every 2.5 min × 3: 60s hold, hands wider than shoulder width, full body rigid",

    # ── Broken: jumprope rounds ─────────────────────────────────────────────
    "JUMPROPE":          "every 4 min × 3: 3 min continuous, no misses, consistent rhythm",
    "ONE LEG JUMPROPE":  "every 3.5 min × 3: 2 min each side, no misses",

    # ── Broken: sprint (already interval-based, fix the cue) ────────────────
    "SPRINT":            "every 2.5 min × 6: 100m sprint, full effort, no rep slower than 13s",
    "STAIR SPRINT":      "every 105s × 8: 20 stair flights, continuous ascent, no rail grip",

    # ── Broken: rest note leaked into cue ───────────────────────────────────
    "JAB":               "every 2 min × 3: 50 reps, sharp retraction, full shoulder rotation. No telegraphing",
    "PELICAN PUSH UP":   "every 2 min × 3: 5 reps each side, rings behind body, deep stretch descent, explosive return. Use a spotter until familiar",

    # ── Missing "each side" on holds ────────────────────────────────────────
    "ASSISTED IRON CROSS":   "every 2.5 min × 3: 5s hold each side, rest remaining",
    "EIGHT ANGLED POSE":     "every 2 min × 3: 20s hold each side, rest remaining",
    "ELBOW LEVER":           "every 2.5 min × 3: 15s hold each side, rest remaining",
    "STRADDLE ELBOW LEVER":  "every 2.5 min × 3: 10s hold each side, rest remaining",
    "SWALLOWS POSE":         "every 2 min × 3: 30s hold each side, rest remaining",
    "TUCK HUMAN FLAG":       "every 105s × 3: 8s hold each side, rest remaining",

    # ── Redundant: exercise name repeated in cue ────────────────────────────
    "90° FRONT KICK":     "every 90s × 3: 10 reps each side, leg fully extended at 90°, standing leg locked",
    "90° SIDE KICK":      "every 90s × 3: 10 reps each side, hip over supporting leg, full lockout at 90°",
    "AERIAL CARTWHEELS":  "every 90s × 3: 5 reps each side, no hand contact with floor, controlled landing",
    "AS FRONT KICK":      "every 90s × 3: 10 reps each side, full 90° hip opening, controlled return",
    "AS SIDE KICK":       "every 75s × 3: 15 reps each side, hip fully rotated, blade of foot, full extension",
    "CALF JUMP":          "every 75s × 3: 20 reps, ankles only, full plantar flexion at top, soft landing",
    "CARTWHEEL":          "every 60s × 3: 10 reps each direction, straight arm at apex, feet together at landing",
    "CARTWHEELS":         "every 75s × 3: 10 reps, consecutive without stopping, even tempo throughout",
    "DEPTH PUSH UP":      "every 105s × 3: 10 reps each side, hands on 20cm elevation, full range through depth, explosive concentric",
    "FORWARD ROLL":       "every 75s × 3: 10 reps, fluid entry, no hands catching, stand at exit without pause",
    "FRONT KICK":         "every 75s × 3: 15 reps each side, chamber fully, snap and retract, no leg drop between reps",
    "GUNSHOT KICK":       "every 105s × 3: 8 reps each side, explosive hip snap, foot reaches ear height",
    "HOOK":               "every 90s × 3: 20 reps each side, elbow at 90°, full hip pivot, tight arc",
    "HORIZONTAL FLAG":    "every 2.5 min × 3: 10s hold each side, body fully horizontal, arms locked, no sag at hips",
    "MONKEY BARS":        "every 2.5 min × 3: 20 bars, alternating grip, no foot contact",
    "STRAIGHT":           "every 75s × 3: 20 reps each side, full hip rotation, snapping retraction",
    "VERTICAL FLAG":      "every 2.5 min × 3: 8s hold each side, body fully vertical on pole, arms locked",
}

d = json.load(open('public/graph.json'))
count = 0
for n in d['nodes']:
    if n['text'] in fixes:
        n['emomKata'] = fixes[n['text']]
        count += 1

with open('public/graph.json', 'w') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)

print(f"Applied {count} fixes")
