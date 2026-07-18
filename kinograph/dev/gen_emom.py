"""Generate emomKata field for each node in graph.json."""
import json, re

CLEAN_INTERVALS = [30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240, 300, 360, 420]

def round_to_clean(s):
    return min(CLEAN_INTERVALS, key=lambda x: abs(x - s))

def fmt_interval(s):
    m = {30:"30s",45:"45s",60:"60s",75:"75s",90:"90s",105:"105s",
         120:"2 min",150:"2.5 min",180:"3 min",210:"3.5 min",
         240:"4 min",300:"5 min",360:"6 min",420:"7 min"}
    return m.get(s, f"{s}s")

def get_rest(k, default=60):
    m = re.search(r'(\d+)s rest', k)
    return int(m.group(1)) if m else default

def each_side_present(k):
    return bool(re.search(r'each (?:side|leg|arm|hand)', k, re.I))

def make_emom(text, kata):
    if not kata:
        return None
    k = kata

    # ── Event / endurance — no EMOM equivalent ─────────────────────────────
    if re.search(r'\d[\d.]*\s*km', k, re.I):
        return None
    if re.search(r'(marathon|tournament|multi-pitch|climbing route|parkour)', k, re.I):
        return None
    if re.search(r'\d+m\s+(front crawl|butterfly stroke|breaststroke|backstroke|sidestroke|combat sidestroke)', k, re.I):
        return None
    if re.search(r'(enter and compete|complete a |perform a complete)', k, re.I):
        return None
    if re.search(r'(stair sprint|uphill gradient)', k, re.I):
        return None
    # 1 hour plank — milestone, not programmable
    if re.search(r'60 continuous minutes', k, re.I):
        return None

    # ── Shadow boxing / sparring: N×M minute rounds ────────────────────────
    rm = re.search(r'(\d+)×(\d+)\s*minute\s*rounds?', k, re.I)
    if rm:
        sets, dur = int(rm.group(1)), int(rm.group(2))
        rest = get_rest(k, 60)
        interval = round_to_clean(dur * 60 + rest)
        return f"every {fmt_interval(interval)} × {sets}: {dur} min round, rest remaining"

    # ── Continuous minutes hold (no "×" reps): N continuous minutes ────────
    # e.g. "3 continuous minutes, ..." or "Hold back stance for 2 continuous minutes"
    cmm = re.search(r'(\d+) continuous minutes', k, re.I)
    if cmm:
        dur = int(cmm.group(1)) * 60
        interval = round_to_clean(dur + 60)
        return f"every {fmt_interval(interval)} × 3: {dur}s hold, rest remaining"

    # ── "Hold X for Ns" or "Ns hold on each leg" ──────────────────────────
    hfor = re.search(r'hold .+ for (\d+)s', k, re.I)
    if hfor:
        dur = int(hfor.group(1))
        rest = get_rest(k, 60)
        interval = round_to_clean(dur + rest)
        each = each_side_present(k)
        note = ' each side' if each else ''
        return f"every {fmt_interval(interval)} × 3: {dur}s hold{note}, rest remaining"

    # "Ns hold on each leg/side" — no "for" keyword
    hleg = re.search(r'(\d+)s hold on each', k, re.I)
    if hleg:
        dur = int(hleg.group(1))
        rest = get_rest(k, 60)
        interval = round_to_clean(dur * 2 + rest)  # both legs per round
        return f"every {fmt_interval(interval)} × 3: {dur}s hold each side, rest remaining"

    # ── Xs continuous [words] hold [each side] ─────────────────────────────
    # e.g. "60s continuous freestanding hold", "10s continuous back lever hold"
    chold = re.search(r'^(\d+)s continuous (?:\w+ )*hold', k, re.I)
    if chold:
        dur = int(chold.group(1))
        rest = get_rest(k, 120)
        each = each_side_present(k)
        # both-sides holds: interval accounts for each side
        effective = dur * 2 + rest if each else dur + rest
        interval = round_to_clean(effective)
        note = ' each side' if each else ''
        # strip duration + rest from cues
        cues = re.sub(r'^(\d+)s continuous (?:\w+ )*hold,?\s*', '', k, flags=re.I)
        cues = re.sub(r',?\s*\d+s rest\s*$', '', cues).strip().strip(',').strip()
        if cues:
            return f"every {fmt_interval(interval)} × 3: {dur}s hold{note}, {cues}"
        return f"every {fmt_interval(interval)} × 3: {dur}s hold{note}, rest remaining"

    # ── Xs [word] hold [each side] (no "continuous") ──────────────────────
    # e.g. "8s vertical flag hold each side, ..., 120s rest"
    plain_hold = re.search(r'^(\d+)s (?:\w+ )*hold', k, re.I)
    if plain_hold:
        dur = int(plain_hold.group(1))
        rest = get_rest(k, 120)
        each = each_side_present(k)
        effective = dur * 2 + rest if each else dur + rest
        interval = round_to_clean(effective)
        note = ' each side' if each else ''
        cues = re.sub(r'^(\d+)s (?:\w+ )*hold,?\s*', '', k, flags=re.I)
        cues = re.sub(r',?\s*\d+s rest\s*$', '', cues).strip().strip(',').strip()
        if cues:
            return f"every {fmt_interval(interval)} × 3: {dur}s hold{note}, {cues}"
        return f"every {fmt_interval(interval)} × 3: {dur}s hold{note}, rest remaining"

    # ── Hold sets with "x" (not ×): "3x30s hold each side" ───────────────
    xhold = re.search(r'(\d+)x(\d+)s hold', k, re.I)
    if xhold:
        sets, dur = int(xhold.group(1)), int(xhold.group(2))
        rest = get_rest(k, 75)
        each = each_side_present(k)
        effective = dur * 2 + rest if each else dur + rest
        interval = round_to_clean(effective)
        note = ' each side' if each else ''
        return f"every {fmt_interval(interval)} × {sets}: {dur}s hold{note}, rest remaining"

    # ── Hold sets: 3×Ns hold / dead hang / passive hang / squeeze ─────────
    hm = re.search(r'(\d+)×(\d+)s\s+(dead hang|passive hang|hold|squeeze|continuous hold)', k, re.I)
    if hm:
        sets, dur = int(hm.group(1)), int(hm.group(2))
        rest = get_rest(k, 90)
        interval = round_to_clean(dur + rest)
        return f"every {fmt_interval(interval)} × {sets}: {dur}s hold, rest remaining"

    # ── "N consecutive X": single-set milestone-style strength ─────────────
    consec = re.search(r'^(\d+) consecutive', k, re.I)
    if consec:
        reps = int(consec.group(1))
        rest = get_rest(k, 90)
        set_dur = reps * 3  # moderate estimate for complex movements
        interval = round_to_clean(set_dur + rest)
        cues = re.sub(r'^\d+ consecutive \w+,?\s*', '', k)
        cues = re.sub(r',?\s*\d+s rest\s*$', '', cues).strip().strip(',').strip()
        if cues:
            return f"every {fmt_interval(interval)} × 3: {reps} reps, {cues}"
        return f"every {fmt_interval(interval)} × 3: {reps} reps"

    # ── "N climbs/falls/rounds" (no × or x): small-set milestone ──────────
    small = re.search(r'^(\d+) (?:rope climbs?|falls?)', k, re.I)
    if small:
        reps = int(small.group(1))
        rest = get_rest(k, 120)
        set_dur = reps * 15  # rope climb ~15s each
        interval = round_to_clean(set_dur + rest)
        cues = re.sub(r'^\d+ \w+,?\s*', '', k)
        cues = re.sub(r',?\s*\d+s rest\s*$', '', cues).strip().strip(',').strip()
        if cues:
            return f"every {fmt_interval(interval)} × 3: {reps} reps, {cues}"
        return f"every {fmt_interval(interval)} × 3: {reps} reps"

    # ── Standard reps: 3×N ─────────────────────────────────────────────────
    rx = re.search(r'(\d+)×(\d+)', k)
    if not rx:
        return None
    sets, reps = int(rx.group(1)), int(rx.group(2))
    rest = get_rest(k, 60)

    kl = k.lower()
    if '3s negative' in kl:
        set_dur = reps * 4.5
    elif '2s negative' in kl:
        set_dur = reps * 3.5
    elif any(w in kl for w in ['punch', 'kick', 'jump', 'cartwheel', 'fall']):
        set_dur = reps * 1.5
    else:
        set_dur = reps * 2.5

    interval = round_to_clean(set_dur + rest)

    # Build cues: strip sets×reps prefix, leading each-side, trailing rest
    cues = k
    cues = re.sub(r'^\d+×\d+\s*', '', cues)
    cues = re.sub(r'^each (?:side|leg|arm|hand)\s*,?\s*', '', cues, flags=re.I)
    cues = re.sub(r',?\s*\d+s rest\s*$', '', cues).strip().strip(',').strip()

    each = each_side_present(k)
    side = ' each side' if each else ''

    if cues:
        return f"every {fmt_interval(interval)} × {sets}: {reps} reps{side}, {cues}"
    else:
        return f"every {fmt_interval(interval)} × {sets}: {reps} reps{side}"


d = json.load(open('public/graph.json'))

# Clear existing emomKata to regenerate cleanly
for n in d['nodes']:
    n.pop('emomKata', None)

ok = skip = 0
for n in d['nodes']:
    if n.get('kata'):
        emom = make_emom(n['text'], n['kata'])
        if emom:
            n['emomKata'] = emom
            ok += 1
        else:
            skip += 1
            print(f"  SKIP [{n['text']}]: {n['kata'][:90]}")

with open('public/graph.json', 'w') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)

print(f"\nDone: {ok} emomKata written, {skip} skipped (event-based/milestone)")
