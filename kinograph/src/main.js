import * as d3 from 'd3';
import { VERSION, VERSION_MAJOR } from './config.js';

function parseEmomInterval(emomKata) {
  const m = emomKata.match(/^every (\d+(?:\.\d+)?) min × (\d+)/);
  if (m) {
    const total = Math.round(parseFloat(m[1]) * 60);
    return { m: Math.floor(total / 60), s: total % 60, r: parseInt(m[2]) };
  }
  const s = emomKata.match(/^every (\d+)s × (\d+)/);
  if (s) {
    const total = parseInt(s[1]);
    return { m: Math.floor(total / 60), s: total % 60, r: parseInt(s[2]) };
  }
  return null;
}

async function main() {
  const svg       = document.getElementById('map');
  const world     = document.getElementById('world');
  const tooltip   = document.getElementById('tooltip');
  const shell     = document.getElementById('sidebar-shell');
  const trayTab   = document.getElementById('tray-tab');
  const LS_KEY    = `kinograph_v${VERSION_MAJOR}_state`;
  const NOTE_KEY  = `kinograph_v${VERSION_MAJOR}_notes`;
  const CAM_KEY   = `kinograph_v${VERSION_MAJOR}_camera`;
  const MODE_KEY  = 'kinograph_kata_mode';
  const MIN_SCALE = 0.12, MAX_SCALE = 3.0;

  let defs = svg.querySelector('defs');
  if (!defs) { defs = document.createElementNS('http://www.w3.org/2000/svg','defs'); svg.insertBefore(defs,svg.firstChild); }

  defs.innerHTML = `
    <filter id="glow-mastered" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="10" result="b1"/>
      <feMerge><feMergeNode in="b1"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glow-unlocked" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2" result="b1"/>
      <feMerge><feMergeNode in="b1"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="drop-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.12)"/>
    </filter>`;

  /* ── DATA ── */
  let data;
  try { const r = await fetch('graph.json'); data = await r.json(); }
  catch(e) {
    data = { nodes:[
      {id:1,x:400,y:300,text:'Root',image:'',color:'#b8860b',start:true,spirit:'Begin here.',kata:null},
      {id:2,x:640,y:300,text:'Child',image:'',color:'#4e73b4',kata:'3×10, 60s rest',spirit:'Step by step.'}
    ], links:[{source:"1",target:"2",color:"#aaa"}] };
  }

  const nodes   = data.nodes.map(n => ({...n, id: String(n.id)}));
  const links   = data.links.map(l => ({...l, source: String(l.source), target: String(l.target)}));
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const adj     = new Map(nodes.map(n => [n.id, []]));
  links.forEach(l => { adj.get(l.source).push(l.target); adj.get(l.target).push(l.source); });

  const depth = new Map(), catOf = new Map(), Q = [];
  nodes.filter(n => n.start).forEach(n => { depth.set(n.id,0); catOf.set(n.id,n.id); Q.push(n.id); });
  for (let i = 0; i < Q.length; i++) {
    adj.get(Q[i]).forEach(nb => {
      if (!depth.has(nb)) { depth.set(nb, depth.get(Q[i])+1); catOf.set(nb, catOf.get(Q[i])); Q.push(nb); }
    });
  }
  const prereqs = new Map(nodes.map(n => [
    n.id, adj.get(n.id).filter(nb => (depth.get(nb)??0) < (depth.get(n.id)??0))
  ]));
  const nonRoots = nodes.filter(n => !n.start);

  /* ── STATE ── */
  const gs    = new Map(nodes.map(n => [n.id, 'locked']));
  const notes = JSON.parse(localStorage.getItem(NOTE_KEY) || '{}');
  const saveProgress = () => localStorage.setItem(LS_KEY, JSON.stringify(Object.fromEntries(gs)));
  const saveNotes    = () => localStorage.setItem(NOTE_KEY, JSON.stringify(notes));
  const loadProgress = () => {
    const s = localStorage.getItem(LS_KEY); if (!s) return false;
    Object.entries(JSON.parse(s)).forEach(([k,v]) => gs.set(k,v)); return true;
  };
  if (!loadProgress()) {
    nodes.forEach(n => { if (n.start) gs.set(n.id,'mastered'); else if (depth.get(n.id)===1) gs.set(n.id,'unlocked'); });
  }

  const isVisible = nid => {
    const st = gs.get(nid);
    if (st === 'mastered' || st === 'unlocked') return true;
    const pp = prereqs.get(nid);
    return pp.length > 0 && pp.every(p => gs.get(p) === 'unlocked');
  };

  /* ── SVG BUILD ── */
  const mk = (tag, attrs) => {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (let k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  const R = nodes[0].radius || 40;
  const nodeClip = mk('clipPath', {id: 'node-clip'});
  nodeClip.appendChild(mk('circle', {r: R}));
  defs.appendChild(nodeClip);
  const linkEls = new Map(), outerEls = new Map(), innerEls = new Map();

  const linkKeys = new Set();
  links.forEach(l => {
    const key = `${l.source}-${l.target}`;
    if (linkKeys.has(key)) return; linkKeys.add(key);
    const sn = nodeMap.get(l.source), tn = nodeMap.get(l.target);
    const line = mk('line', {
      x1: sn.x, y1: sn.y, x2: tn.x, y2: tn.y,
      stroke: '#c8c3bb', 'stroke-width': 8, 'stroke-linecap': 'round',
      display: 'none'
    });
    world.appendChild(line);
    linkEls.set(`${l.source}-${l.target}`, line);
    linkEls.set(`${l.target}-${l.source}`, line);
  });

  const buildNode = node => {
    if (outerEls.has(node.id)) return;
    const outer = mk('g', {transform: `translate(${node.x},${node.y})`, style: 'display:none'});
    const inner = mk('g', {class: 'node-inner', style: 'cursor:pointer;'});

    inner.appendChild(mk('circle', {r: R+1, fill: 'white', filter: 'url(#drop-shadow)', class: 'node-bg'}));
    const border = mk('circle', {r: R, fill: 'none', stroke: 'rgba(0,0,0,0.1)', 'stroke-width': '2', class: 'node-border'});
    inner.appendChild(border);

    const img = mk('image', {
      href: node.image, x: -R, y: -R, width: R*2, height: R*2,
      'clip-path': 'url(#node-clip)', style: 'pointer-events:none;', class: 'node-img'
    });
    inner.appendChild(img);

    const children = adj.get(node.id).filter(nb => (depth.get(nb)||0) > (depth.get(node.id)||0));
    if (children.length === 0) {
      inner.appendChild(mk('circle', {r: R+9, fill: 'none', stroke: node.color, 'stroke-width': 1.5, 'stroke-dasharray': '3,5', class: 'terminal-ring', opacity: 0.65}));
      inner.appendChild(mk('circle', {r: R+5, fill: 'none', stroke: node.color, 'stroke-width': 1, opacity: 0.3}));
    }

    const hit = mk('circle', {r: R+8, fill: 'white', 'fill-opacity': 0, stroke: 'none', class: 'hit-area'});
    inner.appendChild(hit);

    inner.addEventListener('click', e => {
      e.stopPropagation();
      if (!wasDragging && isVisible(node.id)) selectNode(node.id);
    });
    inner.addEventListener('mouseenter', () => {
      if (!isVisible(node.id)) return;
      const s = gs.get(node.id);
      tooltip.textContent = s === 'locked' ? 'Locked' : node.text;
      tooltip.style.background = s === 'locked' ? '#9a9188' : node.color;
      tooltip.classList.add('on');
    });
    inner.addEventListener('mouseleave', () => tooltip.classList.remove('on'));

    outer.appendChild(inner); world.appendChild(outer);
    outerEls.set(node.id, outer); innerEls.set(node.id, inner);
  };

  // Build visible nodes synchronously; defer locked nodes until idle
  const deferred = [];
  nodes.forEach(node => { isVisible(node.id) ? buildNode(node) : deferred.push(node); });
  const scheduleDeferred = list => {
    const tick = deadline => {
      while (list.length && deadline.timeRemaining() > 1) buildNode(list.shift());
      if (list.length) (window.requestIdleCallback || (cb => setTimeout(cb, 16)))(tick);
    };
    (window.requestIdleCallback || (cb => setTimeout(cb, 16)))(tick);
  };
  if (deferred.length) scheduleDeferred(deferred);

  /* ── MAP UPDATE ── */
  const styleNode = (n, newMastered, newUnlocked) => {
    const state    = gs.get(n.id);
    let outer      = outerEls.get(n.id);
    if (!outer) {
      if (!isVisible(n.id)) return;
      buildNode(n);
      outer = outerEls.get(n.id);
      if (!outer) return;
    }
    const inner    = innerEls.get(n.id);
    const border   = inner.querySelector('.node-border');
    const vis      = isVisible(n.id);
    const isNextUp = state === 'locked' && prereqs.get(n.id).length > 0 && prereqs.get(n.id).every(p => gs.get(p) === 'unlocked');

    outer.style.display = vis ? 'block' : 'none';
    inner.style.pointerEvents = vis ? 'all' : 'none';
    if (!vis) return;

    const bg  = inner.querySelector('.node-bg');
    const img = inner.querySelector('.node-img');

    if (state === 'mastered') {
      inner.setAttribute('filter', 'url(#glow-mastered)');
      inner.style.opacity = '';
      border.setAttribute('stroke', '#b8860b'); border.setAttribute('stroke-width', '4'); border.removeAttribute('stroke-dasharray');
      bg.setAttribute('fill', '#c8920e');
      img.setAttribute('style', 'pointer-events:none; filter:sepia(0.55) saturate(1.8) brightness(1.12) contrast(1.05);');
      if (n.id === newMastered) { inner.classList.add('just-mastered'); setTimeout(()=>inner.classList.remove('just-mastered'),650); }
    } else if (state === 'unlocked') {
      inner.setAttribute('filter', 'url(#glow-unlocked)');
      inner.style.opacity = '';
      border.setAttribute('stroke', n.color||'#aaa'); border.setAttribute('stroke-width', '2'); border.removeAttribute('stroke-dasharray');
      bg.setAttribute('fill', 'white');
      img.setAttribute('style', 'pointer-events:none;');
      if (newUnlocked && newUnlocked.includes(n.id)) { inner.classList.add('just-unlocked'); setTimeout(()=>inner.classList.remove('just-unlocked'),500); }
    } else if (isNextUp) {
      inner.removeAttribute('filter');
      inner.style.opacity = '0.35';
      border.setAttribute('stroke', 'rgba(184,134,11,0.35)'); border.setAttribute('stroke-width', '1.5'); border.removeAttribute('stroke-dasharray');
      bg.setAttribute('fill', 'white');
      img.setAttribute('style', 'pointer-events:none;');
    }
  };

  const styleLink = (l, seen) => {
    const key = `${l.source}-${l.target}`;
    if (seen.has(key)) return; seen.add(key);
    const line = linkEls.get(key);
    if (!line) return;
    const show = isVisible(l.source) && isVisible(l.target);
    if (!show) { line.setAttribute('display','none'); return; }
    line.removeAttribute('display');
    const s1 = gs.get(l.source), s2 = gs.get(l.target);
    const teaser = (id) => gs.get(id) === 'locked' && prereqs.get(id).length > 0 && prereqs.get(id).every(p => gs.get(p) === 'unlocked');
    const targetNode = nodeMap.get(l.target);
    line.classList.remove('active-edge');
    line.removeAttribute('filter');
    line.setAttribute('stroke-opacity', '1');
    if (s1 === 'mastered' && s2 === 'mastered') {
      line.classList.add('active-edge');
      line.setAttribute('stroke', 'rgba(184,134,11,0.55)');
    } else if (teaser(l.source) || teaser(l.target)) {
      line.setAttribute('stroke', '#c8c3bb');
      line.setAttribute('stroke-opacity', '0.45');
    } else {
      line.setAttribute('stroke', targetNode.color || '#c8c3bb');
    }
  };

  const updateMap = (newMastered=null, newUnlocked=[]) => {
    if (newMastered) {
      // dirty path: only touch the changed node + its neighbors
      const dirty = new Set([newMastered, ...adj.get(newMastered)]);
      newUnlocked.forEach(id => { dirty.add(id); adj.get(id).forEach(nb => dirty.add(nb)); });
      dirty.forEach(id => styleNode(nodeMap.get(id), newMastered, newUnlocked));
      const seen = new Set();
      dirty.forEach(id => links.filter(l => l.source === id || l.target === id).forEach(l => styleLink(l, seen)));
    } else {
      // full pass on initial load
      nodes.forEach(n => styleNode(n, null, newUnlocked));
      const seen = new Set();
      links.forEach(l => styleLink(l, seen));
    }
  };

  /* ── PANEL ── */
  let selectedId = null, noteTimer = null;
  const $ = id => document.getElementById(id);

  /* ── MOBILE BOTTOM SHEET ── */
  const isMobile    = () => window.matchMedia('(max-width: 767px)').matches;
  const bsSheet       = document.getElementById('bottom-sheet');
  const bsBackdrop    = document.getElementById('bs-backdrop');
  const bsName        = document.getElementById('bs-name');
  const bsDot         = document.getElementById('bs-dot');
  const bsContent     = document.getElementById('bs-content');
  const bsProgFill    = document.getElementById('bs-prog-fill');
  const bsKataPreview = document.getElementById('bs-kata-preview');

  if (isMobile()) bsContent.appendChild(document.getElementById('panel'));

  const sheetSetPeek = (id) => {
    const n = nodeMap.get(id), s = gs.get(id);
    const isTeaser = s === 'locked' && prereqs.get(id).length > 0 && prereqs.get(id).every(p => gs.get(p) === 'unlocked');
    bsName.textContent = isTeaser ? 'Locked exercise' : n.text;
    bsDot.className = ''; bsDot.classList.add(isTeaser ? 'locked' : s);
    const mode = localStorage.getItem(MODE_KEY) || 'standard';
    const useEmom = mode === 'emom' && n.emomKata;
    bsKataPreview.textContent = isTeaser ? 'Complete prerequisites to unlock.' :
      n.start ? 'Root category — explore its children.' :
      (useEmom ? n.emomKata : n.kata) || '';
    bsSheet.classList.remove('expanded');
    bsSheet.classList.add('peek');
    bsSheet.removeAttribute('inert');
    bsBackdrop.classList.remove('on');
  };

  const sheetExpand = () => {
    bsSheet.classList.add('expanded');
    bsSheet.classList.remove('peek');
    bsBackdrop.classList.add('on');
  };

  const sheetClose = () => {
    bsSheet.classList.remove('peek', 'expanded');
    bsBackdrop.classList.remove('on');
    bsSheet.setAttribute('inert', '');
  };

  document.getElementById('bs-peek').addEventListener('click', () => {
    if (bsSheet.classList.contains('expanded')) {
      bsSheet.classList.remove('expanded'); bsSheet.classList.add('peek');
      bsBackdrop.classList.remove('on');
    } else {
      sheetExpand();
    }
  });
  document.getElementById('bs-peek').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('bs-peek').click(); }
  });
  document.getElementById('bs-close').addEventListener('click', e => {
    e.stopPropagation();
    if (selectedId) { innerEls.get(selectedId)?.querySelector('.hit-area')?.setAttribute('stroke','none'); selectedId = null; }
    sheetClose();
  });
  bsBackdrop.addEventListener('click', () => {
    bsSheet.classList.remove('expanded'); bsSheet.classList.add('peek');
    bsBackdrop.classList.remove('on');
  });

  /* ── SIDEBAR ARIA ── */
  const setSidebarFocusable = (focusable) => {
    const sidebarInner = document.getElementById('sidebar');
    sidebarInner.querySelectorAll('button, a, textarea, input').forEach(el => {
      if (focusable) el.removeAttribute('tabindex'); else el.setAttribute('tabindex', '-1');
    });
    sidebarInner.setAttribute('aria-hidden', focusable ? 'false' : 'true');
  };

  trayTab.addEventListener('click', () => {
    const nowCollapsed = shell.classList.toggle('collapsed');
    setSidebarFocusable(!nowCollapsed);
  });

  svg.addEventListener('click', e => {
    if (e.target === svg || e.target === world) {
      if (isMobile()) {
        if (bsSheet.classList.contains('expanded')) {
          bsSheet.classList.remove('expanded'); bsSheet.classList.add('peek');
          bsBackdrop.classList.remove('on');
        } else if (bsSheet.classList.contains('peek')) {
          if (selectedId) { innerEls.get(selectedId)?.querySelector('.hit-area')?.setAttribute('stroke','none'); selectedId = null; }
          sheetClose();
        }
        return;
      }
      if (selectedId) {
        innerEls.get(selectedId)?.querySelector('.hit-area')?.setAttribute('stroke','none');
        selectedId = null;
      }
    }
  });

  const selectNode = id => {
    if (selectedId && selectedId !== id) {
      innerEls.get(selectedId)?.querySelector('.hit-area')?.setAttribute('stroke','none');
    }
    selectedId = id;
    const hit = innerEls.get(id).querySelector('.hit-area');
    hit.setAttribute('stroke', '#b8860b'); hit.setAttribute('stroke-width', '3'); hit.setAttribute('stroke-opacity', '0.75');
    if (isMobile()) {
      renderPanel(id);
      sheetSetPeek(id);
      panTo(id);
    } else {
      shell.classList.remove('collapsed');
      panTo(id);
      renderPanel(id);
    }
  };

  const renderPanel = id => {
    const n = nodeMap.get(id), s = gs.get(id), parents = prereqs.get(id);
    const isTeaser = s === 'locked' && parents.length > 0 && parents.every(p => gs.get(p) === 'unlocked');
    const isRoot   = !!n.start;

    $('panel-empty').style.display = 'none';
    const card = $('node-card');
    card.style.display = 'flex';
    card.style.animation = 'none'; void card.offsetHeight; card.style.animation = '';

    const img = $('panel-img');
    img.src = n.image;
    img.style.filter = isTeaser ? 'grayscale(1) brightness(1.1) opacity(0.35)' : 'none';

    $('panel-img-ring').className = ''; $('panel-img-ring').classList.add(isTeaser ? 'locked' : s);
    $('state-dot').className = ''; $('state-dot').classList.add(isTeaser ? 'locked' : s);

    const nameEl = $('panel-name');
    nameEl.textContent = isTeaser ? 'Locked exercise' : n.text;
    nameEl.style.color = isTeaser ? 'var(--ink4)' : (s === 'mastered' ? 'var(--gold)' : 'var(--ink)');

    const cat = nodeMap.get(catOf.get(id)) || n;
    $('panel-cat').textContent = isTeaser ? '' : cat.text;
    $('panel-cat').style.color = 'var(--ink4)';
    $('panel-status').textContent = isTeaser ? 'Complete prerequisites' : s.charAt(0).toUpperCase()+s.slice(1);
    $('panel-status').style.color = s === 'mastered' ? 'var(--gold)' : 'var(--ink4)';

    $('panel-spirit-wrap').style.display = 'none';

    $('panel-body').style.display = 'flex';

    const kb = $('kata-block'), kr = $('kata-root-msg'), mb = $('master-btn');
    if (isTeaser) {
      kb.style.display='none'; kr.style.display='none'; mb.style.display='none';
    } else if (isRoot) {
      kb.style.display='none'; kr.textContent='Root category — explore its children.'; kr.style.display='block'; mb.style.display='none';
    } else {
      kr.style.display='none'; kb.style.display='block';
      const mode = localStorage.getItem(MODE_KEY) || 'standard';
      const useEmom = mode === 'emom' && n.emomKata;
      kb.textContent = useEmom ? n.emomKata : (n.kata || '—');

      const eb = $('emom-btn');
      if (useEmom) {
        const parsed = parseEmomInterval(n.emomKata);
        if (n.phases && parsed) {
          const phasesParam = n.phases.map(ph => `${ph.s}:${encodeURIComponent(ph.label)}`).join(',');
          const p = new URLSearchParams({ name: n.text, r: parsed.r, phases: phasesParam });
          eb.href = `timer.html?${p}`;
          eb.style.display = 'block';
        } else if (parsed) {
          const cue = n.emomKata.replace(/^every [^:]+:\s*/, '');
          const p = new URLSearchParams({ name: n.text, m: parsed.m, s: parsed.s, r: parsed.r, cue });
          eb.href = `timer.html?${p}`;
          eb.style.display = 'block';
        } else { eb.style.display = 'none'; }
      } else { eb.style.display = 'none'; }
      if (s === 'unlocked') {
        mb.style.display='block'; mb.className=''; mb.textContent='Mark as Mastered';
        mb.onclick = () => {
          const newly = [];
          gs.set(id, 'mastered');
          adj.get(id).forEach(nb => {
            if (gs.get(nb)==='locked' && prereqs.get(nb).every(p => gs.get(p)==='mastered')) { gs.set(nb,'unlocked'); newly.push(nb); }
          });
          saveProgress(); updateMap(id, newly); updateProgress(); renderPanel(id);
        };
      } else if (s === 'mastered') {
        mb.style.display='block'; mb.className='is-mastered'; mb.textContent='✦  Mastered';
      } else { mb.style.display='none'; }
    }

    const makeList = (listId, headId, items) => {
      const list=$(listId), head=$(headId); list.innerHTML='';
      if (!items.length) { head.style.display='none'; return; }
      head.style.display='flex';
      items.forEach(tid => {
        const n2=nodeMap.get(tid), s2=gs.get(tid);
        const row=document.createElement('div'); row.className='node-row'; row.onclick=()=>selectNode(tid);
        const locked=s2==='locked', mastered=s2==='mastered';
        row.innerHTML=`<img src="${n2.image}" class="node-thumb" style="filter:${locked?'saturate(0) opacity(0.28)':mastered?'saturate(0.5) brightness(0.9)':'none'};border-color:${locked?'':n2.color}"><span class="node-row-text" style="color:${locked?'var(--ink4)':mastered?'var(--ink3)':'var(--ink2)'}">${n2.text}</span>`;
        list.appendChild(row);
      });
    };
    if (!isTeaser) {
      makeList('needs-list',   'needs-head',   prereqs.get(id));
      makeList('unlocks-list', 'unlocks-head', adj.get(id).filter(nb => (depth.get(nb)||0) > (depth.get(id)||0)));
    } else {
      ['needs-head','unlocks-head'].forEach(h => {$(h).style.display='none';});
      ['needs-list','unlocks-list'].forEach(l => {$(l).innerHTML='';});
    }

    const val = notes[id]||'';
    const ta = $('notes-area'); ta.value = val;
    $('notes-chars').textContent = val.length+' chars';
    $('notes-saved').textContent = '—'; $('notes-saved').classList.remove('flash');
    updateCaret();
  };

  const notesArea  = $('notes-area');
  const notesCaret = $('notes-caret');
  const updateCaret = () => notesCaret.classList.toggle('show', document.activeElement === notesArea && notesArea.value.length === 0);
  notesArea.addEventListener('focus', updateCaret);
  notesArea.addEventListener('blur',  () => notesCaret.classList.remove('show'));
  notesArea.addEventListener('input', () => {
    updateCaret();
    if (!selectedId) return;
    notes[selectedId] = notesArea.value;
    $('notes-chars').textContent = notesArea.value.length+' chars';
    $('notes-saved').textContent = 'saving…'; $('notes-saved').classList.remove('flash');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      saveNotes(); $('notes-saved').textContent = 'saved ✓'; $('notes-saved').classList.add('flash');
      setTimeout(()=>{ $('notes-saved').textContent='—'; $('notes-saved').classList.remove('flash'); }, 2000);
    }, 700);
  });

  const updateProgress = () => {
    const mastered = nonRoots.filter(n => gs.get(n.id) === 'mastered').length;
    const pct = `${(mastered/nonRoots.length)*100}%`;
    $('prog-fill').style.width = pct;
    $('prog-text').textContent = `${mastered} / ${nonRoots.length} mastered`;
    if (bsProgFill) bsProgFill.style.width = pct;
  };

  /* ── CAMERA ── */
  let wasDragging = false;

  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y), pad = 400;
  const zoom = d3.zoom()
    .scaleExtent([MIN_SCALE, MAX_SCALE])
    .translateExtent([[Math.min(...xs) - pad, Math.min(...ys) - pad], [Math.max(...xs) + pad, Math.max(...ys) + pad]])
    .on('start', () => { wasDragging = false; svg.classList.add('panning'); })
    .on('zoom',  e  => { if (e.sourceEvent) wasDragging = true; world.setAttribute('transform', e.transform); })
    .on('end',   e  => {
      svg.classList.remove('panning');
      setTimeout(() => wasDragging = false, 0);
      if (e.sourceEvent) {
        const t = d3.zoomTransform(svg);
        localStorage.setItem(CAM_KEY, JSON.stringify({x: t.x, y: t.y, k: t.k}));
      }
    });

  d3.select(svg).call(zoom);

  const panTo = id => {
    const n      = nodeMap.get(id);
    const rect   = svg.getBoundingClientRect();
    const t      = d3.zoomTransform(svg);
    const mobile = isMobile();
    const sbW    = mobile ? 0 : (shell.classList.contains('collapsed') ? 0 : 420);
    const vw     = rect.width - sbW;
    const peekH  = mobile ? 108 : 0;
    const vh     = rect.height - peekH;
    const margin = 80;

    const sx = n.x * t.k + t.x;
    const sy = n.y * t.k + t.y;
    if (sx > margin && sx < vw - margin && sy > margin && sy < vh - margin) return;

    d3.select(svg).transition().duration(420).ease(d3.easeCubicOut)
      .call(zoom.transform, d3.zoomIdentity.translate(vw/2 - n.x * t.k, vh/2 - n.y * t.k).scale(t.k));
  };

  window.addEventListener('mousemove', e => {
    if (!tooltip.classList.contains('on')) return;
    tooltip.style.left = `${e.clientX+14}px`; tooltip.style.top = `${e.clientY+10}px`;
  });

  $('btn-reset').onclick = () => { if (confirm('Reset all progress?')) { localStorage.clear(); location.reload(); } };

  /* ── SETTINGS MODAL ── */
  const settingsOverlay = $('settings-overlay');
  const EMOM_NOTE = 'Every Minute On the Minute — the clock paces your rest so you don\'t have to think about it.';
  const STD_NOTE  = 'Traditional set + rest format.';

  const applyMode = mode => {
    localStorage.setItem(MODE_KEY, mode);
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    $('kata-mode-note').textContent = mode === 'emom' ? EMOM_NOTE : STD_NOTE;
    $('kata-label').textContent = mode === 'emom' ? 'Kata — EMOM' : 'Kata';
    if (selectedId) renderPanel(selectedId);
  };

  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => applyMode(b.dataset.mode));

  const applyAutoUpdate = val => {
    localStorage.setItem(AU_KEY, val);
    $('au-on').classList.toggle('active', val !== 'false');
    $('au-off').classList.toggle('active', val === 'false');
  };
  $('au-on').onclick  = () => applyAutoUpdate('true');
  $('au-off').onclick = () => applyAutoUpdate('false');

  $('settings-btn').onclick = () => {
    const mode = localStorage.getItem(MODE_KEY) || 'standard';
    applyMode(mode);
    applyAutoUpdate(localStorage.getItem(AU_KEY) ?? 'true');
    settingsOverlay.classList.add('open');
    settingsOverlay.removeAttribute('inert');
    $('settings-close').focus();
  };
  const closeSettings = () => {
    settingsOverlay.classList.remove('open');
    settingsOverlay.setAttribute('inert', '');
  };
  $('settings-close').onclick = closeSettings;
  settingsOverlay.addEventListener('click', e => { if (e.target === settingsOverlay) closeSettings(); });

  // Apply persisted mode on load (label + toggle state)
  applyMode(localStorage.getItem(MODE_KEY) || 'standard');

  const rect    = svg.getBoundingClientRect();
  const savedCam = JSON.parse(localStorage.getItem(CAM_KEY) || 'null');
  if (savedCam) {
    d3.select(svg).call(zoom.transform, d3.zoomIdentity.translate(savedCam.x, savedCam.y).scale(savedCam.k));
  } else {
    const sbW  = shell.classList.contains('collapsed') ? 0 : 420;
    const vw   = rect.width - sbW;
    const vh   = rect.height;
    const minX = Math.min(...xs) - R, maxX = Math.max(...xs) + R;
    const minY = Math.min(...ys) - R, maxY = Math.max(...ys) + R;
    const gw   = maxX - minX, gh = maxY - minY;
    const fit  = Math.min(vw / gw, vh / gh) * 0.88;
    const k    = Math.min(Math.max(fit, MIN_SCALE), MAX_SCALE);
    const cx   = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    d3.select(svg).call(zoom.transform, d3.zoomIdentity.translate(vw/2 - cx * k, vh/2 - cy * k).scale(k));
  }

  updateMap(); updateProgress();

  const loader = document.getElementById('loader');
  const visibleImgs = nodes.filter(n => isVisible(n.id) && n.image);
  const imgPromises = visibleImgs.map(n => new Promise(res => {
    const i = new Image(); i.onload = res; i.onerror = res; i.src = n.image;
  }));
  Promise.all(imgPromises).then(() => {
    loader.classList.add('fade-out');
    setTimeout(() => loader.remove(), 450);
  });
}

main();
document.getElementById('ver-label').textContent = 'v' + VERSION;

const AU_KEY = 'kinograph_autoupdate';
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (navigator.onLine && localStorage.getItem(AU_KEY) !== 'false') location.reload();
  });
}
