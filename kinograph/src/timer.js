import { VERSION, VERSION_MAJOR } from './config.js';

const actx = new (window.AudioContext || window.webkitAudioContext)();
let totalSecs=30, remaining=30, running=false, interval=null;
let repMode='inf', repTotal=5, repDone=0, volume=0.8, tone='watch';
let settingsOpen=false;
let phase='idle'; // 'idle' | 'countin' | 'running' | 'done'
let countInTotal=5, countInRemaining=5;
let countInBeepAsRep=false;
let phases=[];    // [{label,secs}] from deep-link; empty = single-interval mode
let phaseIndex=0;

const R    = 82;
const CIRC = 2 * Math.PI * R;
const RO   = R + 6.5;  // outer radius of stroke
const RI   = R - 6.5;  // inner radius of stroke
const POINT_DELTA = 0.11; // radians — arrowhead overshoot

// Hues per phase slot: hold/right · left · rest · 4th
// Amber family for work pops on dark blue; slate for rest reads as neutral
const PHASE_HUE  = ['#f59e0b','#fb923c','#64748b','#a78bfa'];
const OP_FUTURE  = 0.20;
const OP_CURRENT = 0.30;
const OP_DONE    = 0.72;
const NEUTRAL    = '#94a3b8'; // single-interval, no phases

/* ── Welcome ── */
function dismissWelcome(){
  try{ localStorage.setItem(WELCOMED_KEY,'1'); }catch(e){}
  const w=document.getElementById('welcome');
  w.classList.add('leaving');
  setTimeout(()=>w.style.display='none',700);
}

/* ── Audio ── */
function playTone(t){
  const v=volume;
  if(t==='bell'){
    [0,.07,.16].forEach((d,i)=>setTimeout(()=>{
      const o=actx.createOscillator(),g=actx.createGain();
      o.connect(g);g.connect(actx.destination);o.type='sine';
      o.frequency.setValueAtTime(880+i*220,actx.currentTime);
      o.frequency.exponentialRampToValueAtTime(660+i*110,actx.currentTime+1.4);
      g.gain.setValueAtTime(v*.55,actx.currentTime);
      g.gain.exponentialRampToValueAtTime(.001,actx.currentTime+1.6);
      o.start();o.stop(actx.currentTime+1.6);
    },d*1000));
  } else if(t==='chime'){
    [523,659,784,1047].forEach((f,i)=>setTimeout(()=>{
      const o=actx.createOscillator(),g=actx.createGain();
      o.connect(g);g.connect(actx.destination);o.type='sine';o.frequency.value=f;
      g.gain.setValueAtTime(v*.45,actx.currentTime);
      g.gain.exponentialRampToValueAtTime(.001,actx.currentTime+1);
      o.start();o.stop(actx.currentTime+1);
    },i*165));
  } else if(t==='watch'){
    [0,1].forEach(i=>setTimeout(()=>{
      const o=actx.createOscillator(),g=actx.createGain(),
            o2=actx.createOscillator(),g2=actx.createGain();
      o.connect(g);g.connect(actx.destination);
      o2.connect(g2);g2.connect(actx.destination);
      o.type='sine';o.frequency.value=1320;
      o2.type='sine';o2.frequency.value=880;
      g.gain.setValueAtTime(v*.48,actx.currentTime);
      g.gain.exponentialRampToValueAtTime(.001,actx.currentTime+.35);
      g2.gain.setValueAtTime(0,actx.currentTime);
      g2.gain.setValueAtTime(v*.4,actx.currentTime+.07);
      g2.gain.exponentialRampToValueAtTime(.001,actx.currentTime+.65);
      o.start();o.stop(actx.currentTime+.35);
      o2.start();o2.stop(actx.currentTime+.65);
    },i*240));
  } else {
    const o=actx.createOscillator(),g=actx.createGain(),
          o2=actx.createOscillator(),g2=actx.createGain();
    o.connect(g);g.connect(actx.destination);
    o2.connect(g2);g2.connect(actx.destination);
    o.type='sine';
    o.frequency.setValueAtTime(150,actx.currentTime);
    o.frequency.exponentialRampToValueAtTime(88,actx.currentTime+2.2);
    g.gain.setValueAtTime(v*.72,actx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,actx.currentTime+2.7);
    o.start();o.stop(actx.currentTime+2.7);
    o2.type='sine';o2.frequency.value=300;
    g2.gain.setValueAtTime(v*.28,actx.currentTime);
    g2.gain.exponentialRampToValueAtTime(.001,actx.currentTime+1.2);
    o2.start();o2.stop(actx.currentTime+1.2);
  }
}

function playCountInTick(){
  const v=volume;
  const o=actx.createOscillator(),g=actx.createGain();
  o.connect(g);g.connect(actx.destination);o.type='sine';
  o.frequency.setValueAtTime(660,actx.currentTime);
  o.frequency.exponentialRampToValueAtTime(540,actx.currentTime+0.09);
  g.gain.setValueAtTime(v*0.28,actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001,actx.currentTime+0.14);
  o.start();o.stop(actx.currentTime+0.14);
}

function playCountInGo(){
  const v=volume;
  [523,659,784,1047].forEach((f,i)=>setTimeout(()=>{
    const o=actx.createOscillator(),g=actx.createGain();
    o.connect(g);g.connect(actx.destination);o.type='sine';o.frequency.value=f;
    g.gain.setValueAtTime(v*0.52,actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,actx.currentTime+0.55);
    o.start();o.stop(actx.currentTime+0.55);
  },i*100));
}

function playFinish(){
  const v=volume;
  [392,523,659,784,1047,1318].forEach((f,i)=>setTimeout(()=>{
    const o=actx.createOscillator(),g=actx.createGain();
    o.connect(g);g.connect(actx.destination);o.type='sine';o.frequency.value=f;
    g.gain.setValueAtTime(v*0.5,actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,actx.currentTime+1.1);
    o.start();o.stop(actx.currentTime+1.1);
  },i*120));
}

function previewTone(){tone=document.getElementById('toneSelect').value;playTone(tone);saveSettings();}
function updateVol(){
  volume=document.getElementById('volRange').value/100;
  document.getElementById('volVal').textContent=document.getElementById('volRange').value;
  saveSettings();
}

/* ── Settings ── */
function toggleSettings(e){
  if(e)e.stopPropagation();
  settingsOpen=!settingsOpen;
  document.getElementById('settingsPanel').classList.toggle('open',settingsOpen);
  document.getElementById('gearBtn').classList.toggle('spinning',settingsOpen);
}
function setRepMode(mode){
  repMode=mode;
  document.getElementById('repInf').classList.toggle('active',mode==='inf');
  document.getElementById('repSet').classList.toggle('active',mode==='set');
  document.getElementById('repCount').style.display=mode==='set'?'block':'none';
  applySettings();
  saveSettings();
}
function applySettings(){
  const m=parseInt(document.getElementById('minInput').value)||0;
  const s=parseInt(document.getElementById('secInput').value)||0;
  totalSecs=m*60+s;
  if(totalSecs<1){totalSecs=1;document.getElementById('secInput').value=1;}
  repTotal=parseInt(document.getElementById('repCount').value)||5;
  tone=document.getElementById('toneSelect').value;
  countInTotal=Math.max(0,parseInt(document.getElementById('countInInput').value)||0);
  if(!running && !phases.length){remaining=totalSecs;repDone=0;phase='idle';countInRemaining=countInTotal;renderAll();}
  saveSettings();
}
function setGoBeepMode(asRep){
  countInBeepAsRep=asRep;
  document.getElementById('goBeepFree').classList.toggle('active',!asRep);
  document.getElementById('goBeepRep').classList.toggle('active',asRep);
  saveSettings();
}

/* ── Ring ── */
function mkCircle(cls,extra){
  const c=document.createElementNS('http://www.w3.org/2000/svg','circle');
  c.setAttribute('cx','100');c.setAttribute('cy','100');c.setAttribute('r',R);
  if(cls) c.setAttribute('class',cls);
  if(extra) Object.assign(c.style,extra);
  return c;
}

function hexWithOpacity(hex,op){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${op})`;
}

// arcStyle: stroke-dasharray/offset for a stroked circle segment (background arcs)
function arcStyle(startFrac,lengthFrac){
  const arcLen=lengthFrac*CIRC;
  return { strokeDasharray:`${arcLen} ${CIRC-arcLen}`, strokeDashoffset:`${-(startFrac*CIRC)}` };
}

// buildFillPath: filled donut-wedge with flat tail (θ1) and pointed head (θ2)
function buildFillPath(θ1, θ2){
  if(θ2-θ1 < 0.003) return '';
  const cx=100, cy=100;
  const largeArc=(θ2-θ1)>Math.PI?1:0;
  const pt=(r,θ)=>`${cx+r*Math.cos(θ)},${cy+r*Math.sin(θ)}`;
  const θp=θ2+POINT_DELTA; // tip angle slightly ahead
  return [
    `M ${pt(RO,θ1)}`,
    `A ${RO} ${RO} 0 ${largeArc} 1 ${pt(RO,θ2)}`,
    `L ${pt(R,θp)}`,           // pointed tip at mid-radius
    `L ${pt(RI,θ2)}`,
    `A ${RI} ${RI} 0 ${largeArc} 0 ${pt(RI,θ1)}`,
    'Z'
  ].join(' ');
}

function mkFillPath(col){
  const p=document.createElementNS('http://www.w3.org/2000/svg','path');
  p.setAttribute('class','ring-fill');
  p.id='ringFill';
  p.style.fill=col;
  return p;
}

function setupRingPhases(){
  const svg=document.getElementById('ringSvg');
  svg.querySelectorAll('.ring-phase-bg,.ring-fill,.ring-notch-g').forEach(el=>el.remove());

  if(!phases.length){
    svg.appendChild(mkFillPath(NEUTRAL));
    return;
  }

  const total=phases.reduce((a,p)=>a+p.secs,0);
  let elapsed=0;

  // dim background segments for all phases
  phases.forEach((p,i)=>{
    const startFrac=elapsed/total;
    const lenFrac=p.secs/total;
    const col=PHASE_HUE[i%PHASE_HUE.length];
    const bg=mkCircle('ring-phase-bg',{
      stroke:hexWithOpacity(col,OP_FUTURE),
      ...arcStyle(startFrac,lenFrac),
    });
    bg.setAttribute('data-phase-bg',i);
    svg.appendChild(bg);
    elapsed+=p.secs;
  });

  // path-based active fill (on top of background arcs)
  svg.appendChild(mkFillPath(PHASE_HUE[0]));

  // notch dots at phase boundaries
  elapsed=0;
  phases.slice(0,-1).forEach((p,i)=>{
    elapsed+=p.secs;
    const angle=(elapsed/total)*2*Math.PI;
    const nx=100+R*Math.cos(angle), ny=100+R*Math.sin(angle);
    const g=document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('class','ring-notch-g');
    g.setAttribute('data-notch',i);
    const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');
    dot.setAttribute('class','ring-notch-dot');
    dot.setAttribute('cx',nx);dot.setAttribute('cy',ny);dot.setAttribute('r','6');
    g.appendChild(dot);
    svg.appendChild(g);
  });
}

function pulseNotch(i){
  const g=document.querySelector('.ring-notch-g[data-notch="'+i+'"]');
  if(!g) return;
  g.classList.remove('pulsing');
  void g.getBoundingClientRect();
  g.classList.add('pulsing');
}

function updateRingPhaseStates(){
  if(!phases.length) return;
  phases.forEach((_,i)=>{
    const bg=document.querySelector(`.ring-phase-bg[data-phase-bg="${i}"]`);
    if(!bg) return;
    const col=PHASE_HUE[i%PHASE_HUE.length];
    const op=i<phaseIndex?OP_DONE:i===phaseIndex?OP_CURRENT:OP_FUTURE;
    bg.style.stroke=hexWithOpacity(col,op);
  });
}

function updateRing(){
  const fill=document.getElementById('ringFill');
  if(!fill) return;

  if(phase==='idle'||phase==='countin'){
    fill.setAttribute('d','');
    return;
  }
  if(phase==='done'){
    fill.setAttribute('d','');
    if(phases.length) phases.forEach((_,i)=>{
      const bg=document.querySelector(`.ring-phase-bg[data-phase-bg="${i}"]`);
      if(bg) bg.style.stroke=hexWithOpacity(PHASE_HUE[i%PHASE_HUE.length],OP_DONE);
    });
    return;
  }

  if(!phases.length){
    const progress=totalSecs>0?Math.max(0,Math.min(0.999,(totalSecs-remaining)/totalSecs)):0;
    if(progress<0.003){fill.setAttribute('d','');return;}
    fill.style.fill=NEUTRAL;
    fill.setAttribute('d',buildFillPath(0, progress*2*Math.PI));
    return;
  }

  updateRingPhaseStates();
  const total=phases.reduce((a,p)=>a+p.secs,0);
  const startFrac=phases.slice(0,phaseIndex).reduce((a,p)=>a+p.secs,0)/total;
  const lenFrac=phases[phaseIndex].secs/total;
  const elapsed=phases[phaseIndex].secs-remaining;
  const fillFrac=(elapsed/phases[phaseIndex].secs)*lenFrac;
  const clampedFill=Math.max(0,Math.min(lenFrac*0.999,fillFrac));
  if(clampedFill<0.003){fill.setAttribute('d','');return;}
  fill.style.fill=PHASE_HUE[phaseIndex%PHASE_HUE.length];
  fill.setAttribute('d',buildFillPath(startFrac*2*Math.PI,(startFrac+clampedFill)*2*Math.PI));
}

function setPhaseLabel(label){
  const el=document.getElementById('phaseLabel');
  if(!el) return;
  if(!label){el.textContent='';return;}
  el.classList.add('fading');
  setTimeout(()=>{el.textContent=label;el.classList.remove('fading');},220);
}

function resetActiveFill(){
  const fill=document.getElementById('ringFill');
  if(!fill) return;
  fill.setAttribute('d','');
  if(phases.length){
    fill.style.fill=PHASE_HUE[phaseIndex%PHASE_HUE.length];
    updateRingPhaseStates();
  }
}

/* ── Render ── */
function fmt(n){return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function repString(sep){
  const s=sep||' / ';
  return repDone+s+(repMode==='inf'?'∞':repTotal);
}

function renderAll(){
  const isCountIn=phase==='countin';
  const timeStr=isCountIn?String(countInRemaining):fmt(remaining);
  const repStr =isCountIn?'GET  READY':repString(' / ');
  document.getElementById('timeDisplay').textContent=timeStr;
  document.getElementById('repLabel').textContent=repStr;
  const st=phase==='done'?'✓':running?'▶':phase==='idle'?'◦':'⏸';
  document.title=st+' '+timeStr+'  ·  '+repString('/');
  updateRing();
}

/* ── Ripple ── */
function addRipple(strokeColor){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('class','ripple-svg');
  svg.setAttribute('viewBox','0 0 100 100');
  svg.setAttribute('preserveAspectRatio','xMidYMid meet');
  const c=document.createElementNS('http://www.w3.org/2000/svg','circle');
  c.setAttribute('class','ripple-c');
  if(strokeColor) c.style.stroke=strokeColor;
  c.setAttribute('cx','50');c.setAttribute('cy','50');c.setAttribute('r','0');
  svg.appendChild(c);document.body.appendChild(svg);
  setTimeout(()=>svg.remove(),1900);
}

function addFinishFlash(){
  const el=document.createElement('div');
  el.className='finish-flash';
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),1600);
}

/* ── Timer ── */
function runTick(){
  remaining--;
  renderAll();
  if(remaining<=0) onAlarm();
}

function countInTick(){
  countInRemaining--;
  renderAll();
  if(countInRemaining<=0){
    clearInterval(interval);interval=null;
    document.body.classList.remove('counting-in');
    if(countInBeepAsRep){
      repDone++;
      if(repMode==='set'&&repDone>=repTotal){
        playFinish();addFinishFlash();addRipple('rgba(255,210,60,0.65)');
        running=false;phase='done';remaining=0;
        document.body.classList.remove('counting-in','paused');
        document.body.classList.add('done');
        renderAll();return;
      }
    }
    playCountInGo();
    addRipple('rgba(255,210,60,0.65)');
    phase='running';
    if(phases.length){
      phaseIndex=0;remaining=phases[0].secs;
      setPhaseLabel(phases[0].label);
      resetActiveFill();
    } else {
      remaining=totalSecs;
    }
    renderAll();
    interval=setInterval(runTick,1000);
  } else {
    playCountInTick();
  }
}

function onAlarm(){
  actx.resume();
  addRipple();
  const d=document.getElementById('timeDisplay');
  d.classList.add('flash');setTimeout(()=>d.classList.remove('flash'),440);

  if(phases.length){
    const nextPhase=phaseIndex+1;
    if(nextPhase<phases.length){
      pulseNotch(phaseIndex);
      phaseIndex=nextPhase;
      remaining=phases[phaseIndex].secs;
      setPhaseLabel(phases[phaseIndex].label);
      playTone(tone);
      renderAll();
    } else {
      repDone++;
      const isLast=repMode==='set'&&repDone>=repTotal;
      if(isLast){
        playFinish();addFinishFlash();
        clearInterval(interval);interval=null;running=false;
        phase='done';remaining=0;
        document.body.classList.remove('paused');
        document.body.classList.add('done');
        renderAll();
      } else {
        phaseIndex=0;
        remaining=phases[0].secs;
        setPhaseLabel(phases[0].label);
        playTone(tone);
        resetActiveFill();
        renderAll();
      }
    }
  } else {
    const isLast=repMode==='set'&&repDone+1>=repTotal;
    if(isLast){playFinish();addFinishFlash();}else{playTone(tone);}
    repDone++;
    if(repMode==='set'&&repDone>=repTotal){
      clearInterval(interval);interval=null;running=false;
      phase='done';remaining=0;
      document.body.classList.remove('paused');
      document.body.classList.add('done');
      renderAll();
    } else {
      remaining=totalSecs;
      resetActiveFill();
      renderAll();
    }
  }
}

function toggleTimer(){actx.resume();running?pauseTimer():startTimer();}

function startTimer(){
  actx.resume();
  running=true;
  document.body.classList.remove('paused');
  document.getElementById('hint').style.opacity='0';
  if(phase==='idle'){
    if(countInTotal===0){
      phase='running';
      if(phases.length){
        phaseIndex=0;remaining=phases[0].secs;
        setPhaseLabel(phases[0].label);
        resetActiveFill();
      } else {
        remaining=totalSecs;
      }
      renderAll();
      interval=setInterval(runTick,1000);
    } else {
      phase='countin';
      countInRemaining=countInTotal;
      document.body.classList.add('counting-in');
      playCountInTick();
      renderAll();
      interval=setInterval(countInTick,1000);
    }
  } else if(phase==='countin'){
    document.body.classList.add('counting-in');
    renderAll();
    interval=setInterval(countInTick,1000);
  } else {
    renderAll();
    interval=setInterval(runTick,1000);
  }
}

function pauseTimer(){
  running=false;
  document.body.classList.add('paused');
  clearInterval(interval);interval=null;
  renderAll();
}

function stopTimer(done){
  running=false;
  document.body.classList.add('paused');
  clearInterval(interval);interval=null;
  if(done) repDone=0;
}

function resetTimer(){
  stopTimer(true);
  phase='idle';phaseIndex=0;
  remaining=phases.length?phases[0].secs:totalSecs;
  repDone=0;countInRemaining=countInTotal;
  document.body.classList.remove('paused','counting-in','done');
  document.getElementById('hint').style.opacity='1';
  if(phases.length) setPhaseLabel('');
  resetActiveFill();
  renderAll();
}

/* ── Body click ── */
document.body.addEventListener('click',e=>{
  if(e.target.closest('.icon-bar')||e.target.closest('.settings-panel')||e.target.closest('#welcome'))return;
  if(settingsOpen){toggleSettings();return;}
  if(phase==='done'){resetTimer();return;}
  toggleTimer();
});
document.getElementById('settingsPanel').addEventListener('click',e=>e.stopPropagation());

/* ── Persistence ── */
const STORE_KEY='timer_v'+VERSION_MAJOR+'_settings';
const WELCOMED_KEY='timer_v'+VERSION_MAJOR+'_welcomed';

function saveSettings(){
  try{
    localStorage.setItem(STORE_KEY,JSON.stringify({
      min:document.getElementById('minInput').value,
      sec:document.getElementById('secInput').value,
      repMode,
      repCount:document.getElementById('repCount').value,
      countIn:document.getElementById('countInInput').value,
      goBeepAsRep:countInBeepAsRep,
      tone,
      vol:document.getElementById('volRange').value,
    }));
  }catch(e){}
}

function loadSettings(){
  let s;
  try{s=JSON.parse(localStorage.getItem(STORE_KEY));}catch(e){}
  if(!s) return;
  if(s.min!=null) document.getElementById('minInput').value=s.min;
  if(s.sec!=null) document.getElementById('secInput').value=s.sec;
  if(s.repMode) setRepMode(s.repMode);
  if(s.repCount!=null) document.getElementById('repCount').value=s.repCount;
  if(s.countIn!=null) document.getElementById('countInInput').value=s.countIn;
  if(s.goBeepAsRep!=null) setGoBeepMode(s.goBeepAsRep);
  if(s.tone){document.getElementById('toneSelect').value=s.tone;tone=s.tone;}
  if(s.vol!=null){
    document.getElementById('volRange').value=s.vol;
    document.getElementById('volVal').textContent=s.vol;
    volume=s.vol/100;
  }
  applySettings();
}

/* ── Init ── */
loadSettings();

(function applyDeepLink(){
  const p=new URLSearchParams(location.search);
  const hasPhases=p.has('phases');
  const hasDuration=p.has('m')||p.has('s');
  if(!hasPhases&&!hasDuration) return;

  const name=p.get('name')||'';
  const r=parseInt(p.get('r'))||3;

  if(hasPhases){
    phases=p.get('phases').split(',').map(seg=>{
      const idx=seg.indexOf(':');
      if(idx<0) return {label:seg,secs:60};
      return {label:decodeURIComponent(seg.slice(idx+1)),secs:Math.max(1,parseInt(seg.slice(0,idx))||60)};
    });
    document.getElementById('durationGroup').style.display='none';
    document.getElementById('goBeepGroup').style.display='none';
  } else {
    const m=parseInt(p.get('m'))||0;
    const s=parseInt(p.get('s'))||0;
    document.getElementById('minInput').value=m;
    document.getElementById('secInput').value=s;
  }

  document.getElementById('repCount').value=r;
  setRepMode('set');
  applySettings();

  if(hasPhases){
    totalSecs=phases[0].secs;
    remaining=phases[0].secs;
    repDone=0;phase='idle';
    setupRingPhases();
  }

  if(name){
    document.getElementById('exercise-name').textContent=name;
    document.getElementById('exercise-banner').classList.add('visible');
  }

  localStorage.setItem(WELCOMED_KEY,'1');
})();

setupRingPhases();
renderAll();
document.getElementById('timerVer').textContent='v'+VERSION;
if(localStorage.getItem(WELCOMED_KEY)){
  const w=document.getElementById('welcome');
  w.style.display='none';
}

/* expose inline-handler functions to window */
Object.assign(window, {
  dismissWelcome, toggleSettings, setRepMode, applySettings,
  setGoBeepMode, previewTone, updateVol, resetTimer,
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (navigator.onLine && localStorage.getItem('kinograph_autoupdate') !== 'false') location.reload();
  });
}
