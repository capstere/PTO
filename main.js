(() => {
  "use strict";

  // ---------- Safe helpers ----------
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function nowMs(){ return performance.now ? performance.now() : Date.now(); }

  // ---------- Countdown (7 Jan 2026 06:00 CET = 05:00 UTC) ----------
  const countdownEl = $("countdownValue");
  const TARGET_UTC_MS = Date.UTC(2026, 0, 7, 5, 0, 0);
  function pad2(n){ return String(n).padStart(2, "0"); }
  function tickCountdown(){
    const diff = TARGET_UTC_MS - Date.now();
    if (!countdownEl) return;
    if (diff <= 0){ countdownEl.textContent = "NU. ☕"; return; }
    const total = Math.floor(diff / 1000);
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    countdownEl.textContent = `${d}d ${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }
  setInterval(tickCountdown, 1000);
  tickCountdown();

  // ---------- UI ----------
  const canvas = $("game");
  const toastEl = $("toast");
  const bubbleEl = $("bubble");
  const soundBtn = $("soundBtn");
  const helpBtn = $("helpBtn");
  const helpModal = $("helpModal");
  const closeHelpBtn = $("closeHelpBtn");
  const kickBtn = $("kickBtn");
  const sitBtn = $("sitBtn");
  const wonder = $("wonder");
  const closeWonderBtn = $("closeWonderBtn");
  const wonderImg = $("wonderImg");
  const tavlaImg = $("tavlaImg");
  const tavlaOverlay = $("tavlaOverlay");
  const tavlaGif = $("tavlaGif");
  const wonderFallback = $("wonderFallback");
  const confetti = $("confetti");

  function toast(msg, ms=1200){
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>toastEl.classList.add("hidden"), ms);
  }
  function bubble(msg, ms=1600){
    if (!bubbleEl) return;
    bubbleEl.textContent = msg;
    bubbleEl.classList.remove("hidden");
    clearTimeout(bubble._t);
    bubble._t = setTimeout(()=>bubbleEl.classList.add("hidden"), ms);
  }

  helpBtn?.addEventListener("click", ()=> helpModal?.classList.remove("hidden"));
  closeHelpBtn?.addEventListener("click", ()=> helpModal?.classList.add("hidden"));

  // If julbild.jpg missing, show fallback art
  if (wonderImg && wonderFallback){
    wonderImg.addEventListener("error", () => {
      wonderImg.classList.add("hidden");
      wonderFallback.classList.remove("hidden");
    });
  }

  // Tavla-GIF overlay: om GIF saknas/failar så faller vi tillbaka på canvas-placeholder.
  let tavlaOverlayReady = false;
  if (tavlaGif && tavlaOverlay){
    tavlaGif.addEventListener("load", ()=>{ tavlaOverlayReady = true; });
    tavlaGif.addEventListener("error", ()=>{
      tavlaOverlayReady = false;
      // håll den ur vägen
      tavlaOverlay.style.left = "-9999px";
      tavlaOverlay.style.top  = "-9999px";
      tavlaOverlay.style.width = "1px";
      tavlaOverlay.style.height = "1px";
    });
    // Om den redan hunnit ladda innan listenern:
    if (tavlaGif.complete && (tavlaGif.naturalWidth || tavlaGif.width)) tavlaOverlayReady = true;
  }

  closeWonderBtn?.addEventListener("click", ()=>{
    wonder?.classList.add("hidden");
    bubble("Äntligen hemma…");
    stopConfetti();
  });

  // ---------- Confetti (victory) ----------
  const _conf = {
    ctx: null,
    w: 0,
    h: 0,
    dpr: 1,
    active: false,
    raf: 0,
    last: 0,
    emitUntil: 0,
    endAt: 0,
    carry: 0,
    parts: []
  };

  const CONFETTI_COLORS = [
    "#ef4444","#f59e0b","#84cc16","#22c55e","#06b6d4",
    "#3b82f6","#a855f7","#ec4899","#ffffff","#111827"
  ];

  function resizeConfetti(){
    if (!confetti) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, window.innerWidth|0);
    const h = Math.max(1, window.innerHeight|0);
    confetti.width  = Math.round(w * dpr);
    confetti.height = Math.round(h * dpr);
    _conf.w = w; _conf.h = h; _conf.dpr = dpr;
    const c = confetti.getContext("2d");
    _conf.ctx = c;
    if (c) c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener("resize", resizeConfetti, { passive:true });

  function _rand(a,b){ return a + Math.random()*(b-a); }

  function _emitOne(x, y, vx, vy){
    const w = _rand(6, 14);
    const h = _rand(8, 20);
    _conf.parts.push({
      x, y,
      vx, vy,
      rot: _rand(0, Math.PI*2),
      vr: _rand(-6, 6),
      w, h,
      life: _rand(2.8, 6.4),
      age: 0,
      color: CONFETTI_COLORS[(Math.random()*CONFETTI_COLORS.length)|0],
      shape: (Math.random() < 0.78) ? "rect" : "disc"
    });
  }

  function _burst(n){
    for (let i=0;i<n;i++){
      const x = _rand(0, _conf.w);
      const y = _rand(-40, -10);
      const vx = _rand(-160, 160);
      const vy = _rand(40, 220);
      _emitOne(x,y,vx,vy);
    }
    // extra side-cannons
    for (let i=0;i<Math.max(0, (n/4)|0); i++){
      const side = (Math.random() < 0.5) ? 0 : 1;
      const x = side ? (_conf.w + 20) : (-20);
      const y = _rand(_conf.h*0.35, _conf.h*0.80);
      const vx = side ? _rand(-360, -160) : _rand(160, 360);
      const vy = _rand(-120, 120);
      _emitOne(x,y,vx,vy);
    }
  }

  function startConfetti(opts){
    if (!confetti) return;
    const o = opts || {};
    const durationMs = (o.durationMs != null) ? (o.durationMs|0) : 6500;
    const emitMs     = (o.emitMs != null) ? (o.emitMs|0) : 2800;
    const burstN     = (o.burst != null) ? (o.burst|0) : 280;
    const rate       = (o.rate != null) ? (+o.rate) : 220; // per second

    resizeConfetti();
    try { confetti.classList.remove("hidden"); } catch (e) {}

    _conf.active = true;
    _conf.parts.length = 0;
    _conf.carry = 0;

    const t0 = nowMs();
    _conf.last = t0;
    _conf.emitUntil = t0 + emitMs;
    _conf.endAt = t0 + durationMs;

    // Big opening burst
    _burst(burstN);

    // kick off loop
    if (!_conf.raf) _conf.raf = requestAnimationFrame(_confTick);
    _conf.rate = rate;
  }

  function stopConfetti(){
    _conf.active = false;
    if (_conf.raf){
      try { cancelAnimationFrame(_conf.raf); } catch (e) {}
      _conf.raf = 0;
    }
    _conf.parts.length = 0;
    _conf.carry = 0;
    if (_conf.ctx){
      try { _conf.ctx.clearRect(0,0,_conf.w,_conf.h); } catch (e) {}
    }
    if (confetti){
      try { confetti.classList.add("hidden"); } catch (e) {}
    }
  }

  function _confTick(ts){
    if (!_conf.active) { _conf.raf = 0; return; }
    const ctx2 = _conf.ctx;
    if (!ctx2){ stopConfetti(); return; }

    const dt = clamp((ts - _conf.last) / 1000, 0.001, 0.033);
    _conf.last = ts;

    // emit for the first part of the sequence
    if (ts < _conf.emitUntil){
      _conf.carry += _conf.rate * dt;
      const n = _conf.carry | 0;
      _conf.carry -= n;
      if (n > 0) _burst(Math.min(n, 80)); // cap per-frame
    }

    // update
    const g = 520; // gravity
    for (let i=_conf.parts.length-1; i>=0; i--){
      const p = _conf.parts[i];
      p.age += dt;
      p.vy += g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;

      // mild drag
      p.vx *= Math.pow(0.93, dt*60);
      p.vy *= Math.pow(0.985, dt*60);

      if (p.age >= p.life || p.y > _conf.h + 80 || p.x < -120 || p.x > _conf.w + 120){
        _conf.parts.splice(i, 1);
      }
    }

    // draw
    ctx2.clearRect(0,0,_conf.w,_conf.h);
    for (const p of _conf.parts){
      const a = clamp(1 - (p.age / p.life), 0, 1);
      ctx2.globalAlpha = 0.95 * a;
      ctx2.save();
      ctx2.translate(p.x, p.y);
      ctx2.rotate(p.rot);
      ctx2.fillStyle = p.color;
      if (p.shape === "disc"){
        ctx2.beginPath();
        ctx2.arc(0, 0, Math.max(3, p.w*0.35), 0, Math.PI*2);
        ctx2.fill();
      } else {
        ctx2.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      }
      ctx2.restore();
    }
    ctx2.globalAlpha = 1;

    // auto stop when finished
    if (ts > _conf.endAt && _conf.parts.length === 0){
      stopConfetti();
      return;
    }

    _conf.raf = requestAnimationFrame(_confTick);
  }


  // ---------- Audio (WebAudio + MP3) ----------
// Tips: iOS kräver "user gesture" för att starta ljud. Därför auto-startar vi (om sparat som PÅ)
// först vid första tryck/drag på sidan.
let audioEnabled = false;
let audioCtx = null;
let bgMusic = null; // HTMLAudioElement (mp3)
// Background music should sit under SFX (lower than before)
const MUSIC_TARGET_VOL = 0.1;

// fade-state
let _fadeRaf = 0;
let _fadeToken = 0;
let pendingAutoStart = false;

function vibe(pattern){
  try {
    if (navigator && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  } catch (e) {}
}

function ensureAudio(){
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function ensureMusic(){
  if (bgMusic) return;
  bgMusic = new Audio("assets/julsang.mp3");
  bgMusic.loop = true;
  bgMusic.preload = "auto";
  bgMusic.volume = MUSIC_TARGET_VOL;
}

function cancelFade(){
  if (_fadeRaf){
    try { cancelAnimationFrame(_fadeRaf); } catch (e) {}
    _fadeRaf = 0;
  }
}

function fadeVolume(audio, toVol, ms, onDone){
  cancelFade();
  const token = ++_fadeToken;
  const fromVol = clamp((audio && typeof audio.volume === "number") ? audio.volume : 0, 0.0001, 1);
  const start = nowMs();
  const dur = Math.max(1, ms|0);
  const target = clamp(toVol, 0.0001, 1);

  const step = () => {
    if (token !== _fadeToken) return;
    const t = clamp((nowMs() - start) / dur, 0, 1);
    const v = lerp(fromVol, target, t);
    try { audio.volume = v; } catch (e) {}
    if (t < 1){
      _fadeRaf = requestAnimationFrame(step);
    } else {
      _fadeRaf = 0;
      if (typeof onDone === "function") onDone();
    }
  };
  _fadeRaf = requestAnimationFrame(step);
}

async function musicOn(){
  if (!audioEnabled) return;
  ensureMusic();
  try {
    // Starta tyst och fadda in
    bgMusic.volume = 0.0001;
    await bgMusic.play();
    fadeVolume(bgMusic, MUSIC_TARGET_VOL, 650);
  } catch (e){
    console.warn("Kunde inte starta julstämningen", e);
  }
}

function musicOff(reset=true){
  if (!bgMusic) return;
  try {
    fadeVolume(bgMusic, 0.0001, 450, () => {
      try { bgMusic.pause(); } catch (e) {}
      if (reset){
        try { bgMusic.currentTime = 0; } catch (e) {}
      }
      // återställ volym så nästa start kan fadda in från tyst
      try { bgMusic.volume = MUSIC_TARGET_VOL; } catch (e) {}
    });
  } catch (e){
    // fallback: hard stop
    try { bgMusic.pause(); } catch (e2) {}
    if (reset){
      try { bgMusic.currentTime = 0; } catch (e2) {}
    }
  }
}

function setSoundBtnLabel(){
  if (!soundBtn) return;
  soundBtn.textContent = audioEnabled ? "🔊 Ljud: PÅ" : "🔊 Ljud: AV";
}

// --- restore persisted audio preference ---
try {
  audioEnabled = localStorage.getItem("jesper_audio_enabled") === "1";
  pendingAutoStart = audioEnabled;
} catch (e) {}
setSoundBtnLabel();
if (audioEnabled) setTimeout(()=>toast("Ljud sparat som PÅ – rör skärmen för att starta.", 2200), 650);

async function startAudioFromGesture(){
  if (!audioEnabled || !pendingAutoStart) return;
  pendingAutoStart = false;
  ensureAudio();
  if (audioCtx && audioCtx.state === "suspended"){
    try { await audioCtx.resume(); } catch (e) {}
  }
  await musicOn();
}

// Om användaren tidigare haft ljud PÅ: starta vid första interaktion (drag på canvas räcker).
window.addEventListener("pointerdown", startAudioFromGesture, { once:true, passive:true });
window.addEventListener("touchstart", startAudioFromGesture, { once:true, passive:true });
window.addEventListener("mousedown", startAudioFromGesture, { once:true, passive:true });

let _noiseBuf = null;
function getNoiseBuf(){
  if (_noiseBuf || !audioEnabled) return _noiseBuf;
  ensureAudio();
  const a = audioCtx;
  const len = a.sampleRate; // 1s
  const b = a.createBuffer(1, len, a.sampleRate);
  const d = b.getChannelData(0);
  for (let i=0;i<len;i++) d[i] = (Math.random()*2-1);
  _noiseBuf = b;
  return _noiseBuf;
}

function noiseBurst({dur=0.12, type="lowpass", f0=1400, f1=null, q=0.9, gain=0.18} = {}){
  if (!audioEnabled) return;
  ensureAudio();
  const a = audioCtx;
  const now = a.currentTime;
  const src = a.createBufferSource();
  src.buffer = getNoiseBuf();
  const f = a.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, now);
  if (f1 != null) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + Math.max(0.02, dur));
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(f);
  f.connect(g);
  g.connect(a.destination);
  src.start(now);
  src.stop(now + dur + 0.05);
}

function thump(intensity=1){
  if (!audioEnabled) return;
  ensureAudio();
  const a = audioCtx;
  const now = a.currentTime;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = "sine";
  const base = 78 + Math.random()*18;
  o.frequency.setValueAtTime(base * (1 + 0.10*intensity), now);
  o.frequency.exponentialRampToValueAtTime(base*0.55, now + 0.12);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.22*intensity, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  o.connect(g); g.connect(a.destination);
  o.start(now); o.stop(now + 0.18);
}

function ping(freq, t=0.12, gain=0.08){
  if (!audioEnabled) return;
  ensureAudio();
  const a = audioCtx;
  const now = a.currentTime;
  const o1 = a.createOscillator();
  const o2 = a.createOscillator();
  const g = a.createGain();
  o1.type = "sine";
  o2.type = "triangle";
  o1.frequency.setValueAtTime(freq, now);
  o2.frequency.setValueAtTime(freq*2, now);
  o2.detune.value = (Math.random()-0.5)*8;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + t);
  o1.connect(g); o2.connect(g); g.connect(a.destination);
  o1.start(now); o2.start(now);
  o1.stop(now + t + 0.02); o2.stop(now + t + 0.02);
}

// --- Public SFX (används i spelet) ---
function grunt(intensity=1){
  // punch/impact
  thump(intensity);
  noiseBurst({ dur: 0.09, type: "lowpass", f0: 900 + Math.random()*400, q: 0.7, gain: 0.14*intensity });
}

function pop(intensity=1){
  // sparkle/click
  ping(880 + Math.random()*220, 0.10, 0.06*intensity);
  noiseBurst({ dur: 0.05, type: "highpass", f0: 1800, q: 0.8, gain: 0.03*intensity });
}

function swoosh(){
  // whoosh
  noiseBurst({ dur: 0.14, type: "bandpass", f0: 220, f1: 1200, q: 0.9, gain: 0.07 });
}

function jingle(){
  // little bell phrase
  const seq = [523.25, 659.25, 783.99, 659.25, 523.25];
  seq.forEach((f,i)=> setTimeout(()=>ping(f, 0.14, 0.07), i*95));
  // extra tiny sparkle tail
  setTimeout(()=>pop(0.7), 520);
}


function victoryFanfare(){
  if (!audioEnabled) return;
  // Big happy "WIN" chord + run (still tiny + cute)
  const chord1 = [523.25, 659.25, 783.99];
  const chord2 = [587.33, 739.99, 880.00];
  chord1.forEach((f,i)=> setTimeout(()=>ping(f, 0.16, 0.09), i*10));
  setTimeout(()=>chord2.forEach((f,i)=> setTimeout(()=>ping(f, 0.16, 0.085), i*10)), 160);

  const run = [659.25, 783.99, 987.77, 1174.66];
  run.forEach((f,i)=> setTimeout(()=>ping(f, 0.13, 0.075), 360 + i*90));

  // little boom
  setTimeout(()=>{ thump(1.35); noiseBurst({ dur: 0.10, type:"bandpass", f0: 180, f1: 820, q: 0.9, gain: 0.08 }); }, 520);
}


soundBtn?.addEventListener("click", async ()=>{
  audioEnabled = !audioEnabled;
  pendingAutoStart = false;

  try { localStorage.setItem("jesper_audio_enabled", audioEnabled ? "1" : "0"); } catch (e) {}
  setSoundBtnLabel();

  if (audioEnabled){
    ensureAudio();
    if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume();
    await musicOn();
    toast("Ljud på.");
    grunt(1.0);
    vibe(18);
  } else {
    musicOff(true);
    toast("Ljud av.");
    vibe(10);
  }
});

// Om användaren byter app/flik: pausa musiken så iOS inte blir grinig.
  document.addEventListener("visibilitychange", ()=>{
    if (!bgMusic) return;
    if (document.hidden){
      musicOff(false);
    } else if (audioEnabled){
      musicOn();
    }
  }, { passive:true });

  // ---------- Canvas / rendering ----------
  if (!canvas){
    console.warn("Canvas #game saknas.");
    return;
  }
  const ctx = canvas.getContext("2d", { alpha: false });

  // fixed world (side view)
  const WORLD = { w: 900, h: 360 };
  const view = { s: 1, ox: 0, oy: 0, cssW: 0, cssH: 0 };

  // room rectangle (side view)
  const ROOM = { x: 40, y: 40, w: 820, h: 260 };
  const FLOOR_Y = ROOM.y + ROOM.h - 38; // ground line

  function resize(){
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    view.cssW = rect.width;
    view.cssH = rect.height;

    view.s = Math.min(rect.width / WORLD.w, rect.height / WORLD.h);
    view.ox = (rect.width - WORLD.w * view.s) / 2;
    view.oy = (rect.height - WORLD.h * view.s) / 2;
  }
  window.addEventListener("resize", resize, { passive:true });
  resize();

  function toWorld(px, py){
    return { x: (px - view.ox)/view.s, y: (py - view.oy)/view.s };
  }

  // ---------- Game objects ----------
  const props = {
    table: { x: 150, w: 210 },
    chair: { x: 430, w: 130 },
    tree:  { x: 700, w: 130 },
    frame: { x: 90, y: 75, w: 90, h: 60 } // empty “tavla”
  };

  // Placera GIF-overlay:n exakt över ramen i canvas (så GIF verkligen animerar).
  function syncTavlaOverlay(){
    if (!tavlaOverlay || !tavlaGif) return;
    if (!tavlaOverlayReady || !(tavlaGif.complete && (tavlaGif.naturalWidth || tavlaGif.width))){
      tavlaOverlay.style.left = "-9999px";
      tavlaOverlay.style.top = "-9999px";
      tavlaOverlay.style.width = "1px";
      tavlaOverlay.style.height = "1px";
      return;
    }
    const f = props.frame;
    const innerX = f.x + 6, innerY = f.y + 6;
    const innerW = f.w - 12, innerH = f.h - 12;
    const left = view.ox + innerX * view.s;
    const top  = view.oy + innerY * view.s;
    const w    = innerW * view.s;
    const h    = innerH * view.s;
    tavlaOverlay.style.left = `${left}px`;
    tavlaOverlay.style.top = `${top}px`;
    tavlaOverlay.style.width = `${w}px`;
    tavlaOverlay.style.height = `${h}px`;
  }

  const jesper = {
    x: 120,
    vx: 0,
    facing: 1,
    r: 22,
    action: "idle", // idle/walk/kick/sit/bump/wave/dance
    actionT: 0,
    blinkT: 0,
    idleTimer: 0,
    bumpCd: 0,
    smileT: 0
  };

  const ornaments = [
    { id:"clock", label:"⏰", x: 300, vx: 0, r: 20, base:"#fde047" },
    { id:"candy", label:"🍬", x: 360, vx: 0, r: 20, base:"#fb7185" },
    { id:"star",  label:"⭐", x: 520, vx: 0, r: 20, base:"#60a5fa" }
  ];

  const state = {
    joy: { active:false, startX:0, dx:0 },
    dragging: null,
    secretStep: 0,
    unlocked: false,
    shakeT: 0,
    shakeMag: 0,
  };

  // Små "sparkle"-particles (rent kosmetiskt)
  const particles = [];
  function spawnSparkles(x, y, n=10){
    for (let i=0;i<n;i++){
      particles.push({
        x, y,
        vx: (Math.random()-0.5)*140,
        vy: (-40 - Math.random()*140),
        life: 0.55 + Math.random()*0.35,
        t: 0,
        ch: Math.random() < 0.6 ? "✨" : (Math.random() < 0.5 ? "❄️" : "⭐")
      });
    }
  }

  let _jesperTapMs = 0;

  // ---------- Persist unlock (localStorage) ----------
  try {
    state.unlocked = localStorage.getItem("jesper_unlocked") === "1";
    if (state.unlocked) setTimeout(()=>wonder?.classList.remove("hidden"), 800);
  } catch (e) {}

  // keep everything on floor
  function floorYForRadius(r){ return FLOOR_Y - r; }

  // collision x ranges for ornaments
  function blockRanges(){
    // each block is a solid column on floor (table legs-ish, chair base, tree trunk)
    return [
      { x: props.table.x + 18, w: 28 },
      { x: props.table.x + props.table.w - 46, w: 28 },
      { x: props.chair.x + 12, w: props.chair.w - 24 },
      { x: props.tree.x + 52, w: 26 }, // trunk
    ];
  }

  function resolveOrnamentBlocks(o){
    // room bounds
    const minX = ROOM.x + o.r;
    const maxX = ROOM.x + ROOM.w - o.r;
    if (o.x < minX){ o.x = minX; o.vx *= -0.55; }
    if (o.x > maxX){ o.x = maxX; o.vx *= -0.55; }

    // blocks
    for (const b of blockRanges()){
      const left = b.x - o.r;
      const right = b.x + b.w + o.r;
      if (o.x > left && o.x < right){
        // push out to nearest side
        const dl = Math.abs(o.x - left);
        const dr = Math.abs(right - o.x);
        if (dl < dr){
          o.x = left;
          o.vx = -Math.abs(o.vx) * 0.65;
        } else {
          o.x = right;
          o.vx = Math.abs(o.vx) * 0.65;
        }
      }
    }
  }

  function setAction(name){
    jesper.action = name;
    jesper.actionT = 0;
  }

  function onWallBump(side){
    if (jesper.bumpCd > 0) return;
    jesper.bumpCd = 0.55;
    jesper.facing = -jesper.facing;
    setAction("bump");
    grunt(0.65);
    vibe(14);
    bubble("💢 Aj!", 900);
    pop(0.9);
    // liten skakning
    state.shakeT = 0.18;
    state.shakeMag = 7;
  }


  // ---------- Input (pointer) ----------
  function pointerPos(e){
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener("pointerdown", (e)=>{
    e.preventDefault();
    const p = pointerPos(e);
    const w = toWorld(p.x, p.y);

    // Klicka på Jesper för en emote (dubbelklick = dans).
    const jcx = jesper.x;
    const jcy = FLOOR_Y - 34;
    if (Math.hypot(w.x - jcx, w.y - jcy) <= 34){
      const t = nowMs();
      if ((t - _jesperTapMs) < 320){
        _jesperTapMs = 0;
        doDance();
      } else {
        _jesperTapMs = t;
        setAction("wave");
        pop(0.7);
        bubble("👋 Hej...", 900);
      }
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    // hit ornament? (drag)
    for (const o of ornaments){
      const oy = floorYForRadius(o.r);
      const dx = w.x - o.x;
      const dy = w.y - oy;
      if (Math.hypot(dx,dy) <= o.r + 10){
        state.dragging = o;
        o.vx = 0;
        canvas.setPointerCapture(e.pointerId);
        toast("Flyttar pynt.");
        pop(0.6);
        return;
      }
    }

    // else joystick (horizontal only)
    state.joy.active = true;
    state.joy.startX = w.x;
    state.joy.dx = 0;
    canvas.setPointerCapture(e.pointerId);
  }, { passive:false });

  canvas.addEventListener("pointermove", (e)=>{
    e.preventDefault();
    const p = pointerPos(e);
    const w = toWorld(p.x, p.y);

    if (state.dragging){
      state.dragging.x = clamp(w.x, ROOM.x + state.dragging.r, ROOM.x + ROOM.w - state.dragging.r);
      return;
    }

    if (state.joy.active){
      state.joy.dx = clamp(w.x - state.joy.startX, -120, 120);
    }
  }, { passive:false });

  function endPointer(){
    state.dragging = null;
    state.joy.active = false;
    state.joy.dx = 0;
  }
  canvas.addEventListener("pointerup", endPointer, { passive:false });
  canvas.addEventListener("pointercancel", endPointer, { passive:false });


// Touch fallback (äldre iOS/Android): joystick på canvas (horisontell)
if (!("PointerEvent" in window)){
  canvas.addEventListener("touchstart", (e)=>{
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    const r = canvas.getBoundingClientRect();
    const x = t.clientX - r.left;
    const y = t.clientY - r.top;
    const w = toWorld(x, y);
    state.joy.active = true;
    state.joy.startX = w.x;
    state.joy.dx = 0;
  }, { passive:false });

  canvas.addEventListener("touchmove", (e)=>{
    if (!state.joy.active || e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    const r = canvas.getBoundingClientRect();
    const x = t.clientX - r.left;
    const y = t.clientY - r.top;
    const w = toWorld(x, y);
    state.joy.dx = clamp(w.x - state.joy.startX, -120, 120);
  }, { passive:false });

  canvas.addEventListener("touchend", ()=>endPointer(), { passive:true });
  canvas.addEventListener("touchcancel", ()=>endPointer(), { passive:true });
}

  // ---------- Buttons ----------
  kickBtn?.addEventListener("click", ()=>doKick());
  sitBtn?.addEventListener("click", ()=>doSit());

  // ---------- Secret logic ----------
  function advanceSecret(id){
    if (state.unlocked) return;
    const seq = ["clock","candy","star"];
    if (id === seq[state.secretStep]){
      state.secretStep++;
      toast(`Hemligheten: ${state.secretStep}/3`);
      if (state.secretStep === 3) bubble("SITT på stolen. Nu.");
    } else {
      state.secretStep = 0;
      toast("Nää… Börja om…");
    }
  }

  function unlock(){
    if (state.unlocked) return;
    state.unlocked = true;
    try { localStorage.setItem("jesper_unlocked", "1"); } catch (e) {}

    // 🎉 Victory: confetti + fanfare + extra shake
    victoryFanfare();
    startConfetti({ burst: 320, rate: 260, emitMs: 3200, durationMs: 7600 });

    state.shakeT = 0.95;
    state.shakeMag = 18;

    // sparkle shower
    for (let i=0;i<10;i++){
      const x = ROOM.x + 80 + Math.random()*(ROOM.w - 160);
      const y = ROOM.y + 70 + Math.random()*(ROOM.h - 160);
      spawnSparkles(x, y, 10);
    }

    jingle();
    vibe([30,50,30,50,30]);
    bubble("…okej. Bra. 🎁", 1600);
    wonder?.classList.remove("hidden");
  }

  // ---------- Actions ----------

  function doDance(){
    if (jesper.action === "dance") return;
    setAction("dance");
    pop(0.8);
    jingle();
    vibe(10);
    spawnSparkles(jesper.x, FLOOR_Y - 80, 12);
    bubble("💃 ...jag lever...", 1100);
  }

  function doKick(){
    swoosh();
    const reach = 90;
    let best = null, bestD = 1e9;

    for (const o of ornaments){
      const d = Math.abs(o.x - jesper.x);
      if (d < bestD){
        bestD = d; best = o;
      }
    }
    setAction("kick");
    grunt(1.0);
    vibe(22);

    if (!best || bestD > reach){
      bubble("Miss! Men det räknas.", 1200);
      return;
    }

    const dir = Math.sign(best.x - jesper.x) || jesper.facing;
    best.vx += dir * (520 + Math.random()*120);
    // Smile only on hit
    jesper.smileT = 0.85;
    spawnSparkles(best.x, FLOOR_Y - 72, 10);
    pop(1.0);
    bubble(`👊 HIT! (${best.label})`, 900);
    advanceSecret(best.id);
  }

  function doSit(){
    // sit if close to chair
    const chairCenter = props.chair.x + props.chair.w/2;
    if (Math.abs(jesper.x - chairCenter) > 90){
      bubble("Satt mentalt. Inte fysiskt.", 1300);
      grunt(0.65);
      return;
    }

    setAction("sit");
    grunt(0.75);
    vibe(12);
    bubble("🪑 …existens… jul…", 1400);

    if (state.secretStep === 3 && !state.unlocked){
      toast("Uppdrag utfört!");
      unlock();
    }
  }

  // ---------- Commentary ----------
  const lines = [
    "Det här rummet känns… budget…",
    "Kanske en kaffe…",
    "Jag är 100% ledig…",
    "Den där lilla tavlan…",
    "Undra hur det går på fabriken…"
  ];
  setInterval(()=>{
    if (!wonder?.classList.contains("hidden")) return;
    if (Math.random() < 0.22){
      bubble(lines[(Math.random()*lines.length)|0], 1700);
      grunt(0.5);
    }
  }, 4200);

  // ---------- Update / Draw ----------
  function update(dt, tMs){
    // blink timer
    jesper.blinkT -= dt;
    if (jesper.blinkT <= 0) jesper.blinkT = 2.5 + Math.random()*2.2;

    // smile timer (endast när han träffar)
    jesper.smileT = Math.max(0, (jesper.smileT || 0) - dt);

    // action state timing
    jesper.actionT += dt;
    if (jesper.action === "kick" && jesper.actionT > 0.35) jesper.action = "idle";
    if (jesper.action === "sit"  && jesper.actionT > 0.9)  jesper.action = "idle";
    if (jesper.action === "bump" && jesper.actionT > 0.40) jesper.action = "idle";
    if (jesper.action === "wave" && jesper.actionT > 1.20) jesper.action = "idle";
    if (jesper.action === "dance" && jesper.actionT > 1.55) jesper.action = "idle";

    // movement (only x)
    let targetV = 0;
    if (state.joy.active){
      const n = state.joy.dx / 120; // -1..1
      targetV = clamp(n, -1, 1) * 360;
    }

    if (Math.abs(targetV) > 12){
      jesper.facing = Math.sign(targetV);
      if (jesper.action !== "kick" && jesper.action !== "sit" && jesper.action !== "bump" && jesper.action !== "wave" && jesper.action !== "dance") jesper.action = "walk";
    } else {
      if (jesper.action === "walk") jesper.action = "idle";
    }

    // smooth velocity
    jesper.vx = lerp(jesper.vx, targetV, clamp(dt*12, 0, 1));
    
jesper.x += jesper.vx * dt;
const leftWall  = ROOM.x + jesper.r;
const rightWall = ROOM.x + ROOM.w - jesper.r;

// vägg-krock: studs + liten "bump"-animation + ljud (med cooldown)
jesper.bumpCd = Math.max(0, (jesper.bumpCd||0) - dt);
if (jesper.x < leftWall){
  jesper.x = leftWall;
  if (jesper.vx < -40) onWallBump(-1);
  jesper.vx = Math.max(0, -jesper.vx * 0.35);
} else if (jesper.x > rightWall){
  jesper.x = rightWall;
  if (jesper.vx > 40) onWallBump(1);
  jesper.vx = Math.min(0, -jesper.vx * 0.35);
}

// Idle trigger (efter 8s)
jesper.idleTimer = (jesper.idleTimer || 0) + dt;
if (jesper.action === "idle" && jesper.idleTimer > 8){
  bubble("👋 Hoho...?");
  setAction("wave");
  pop(1.0);
  jesper.idleTimer = 0;
}
if (jesper.action !== "idle") jesper.idleTimer = 0;

    // ornaments physics (1D)
    const friction = Math.pow(0.07, dt); // strong damping
    for (const o of ornaments){
      if (state.dragging === o) continue;
      o.x += o.vx * dt;
      o.vx *= friction;
      if (Math.abs(o.vx) < 3) o.vx = 0;
      resolveOrnamentBlocks(o);
    }

    // particles
    for (let i = particles.length - 1; i >= 0; i--){
      const p = particles[i];
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 240 * dt;
      p.vx *= Math.pow(0.15, dt);
      if (p.t >= p.life) particles.splice(i, 1);
    }
  }

  function draw(tMs){
    // clear
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0,0,view.cssW, view.cssH);

    // world transform
    ctx.save();
    ctx.translate(view.ox, view.oy);
    if (state.shakeT > 0){
      state.shakeT = Math.max(0, state.shakeT - (1/60));
      const m = state.shakeMag || 0;
      ctx.translate((Math.random()-0.5)*m, (Math.random()-0.5)*m*0.6);
    }
    ctx.scale(view.s, view.s);

    // room box
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(ROOM.x, ROOM.y, ROOM.w, ROOM.h);

    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    roundRectStroke(ROOM.x, ROOM.y, ROOM.w, ROOM.h, 18);

    // wall/floor separation
    ctx.strokeStyle = "rgba(17,24,39,0.25)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ROOM.x, FLOOR_Y);
    ctx.lineTo(ROOM.x + ROOM.w, FLOOR_Y);
    ctx.stroke();

    // tavla (bilden styrs av <img id="tavlaImg" ...> i index.html)
    drawFrame();

    // furniture
    drawTable();
    drawChair();
    drawTree(tMs);

    // ornaments
    for (const o of ornaments) drawOrnament(o);

    // Jesper
    drawJesper(tMs);

    // sparkles
    drawParticles();

    // joystick hint
    if (state.joy.active && !state.dragging) drawJoystick();

    // label
    ctx.fillStyle = "rgba(17,24,39,0.25)";
    ctx.font = "900 14px ui-monospace, monospace";
    ctx.fillText("                    JUL", ROOM.x + 14, ROOM.y + ROOM.h - 12);

    ctx.restore();

    // keep GIF-overlay in sync even if layout changes
    syncTavlaOverlay();
  }

  function drawParticles(){
    if (!particles.length) return;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 18px ui-rounded, system-ui, sans-serif";
    for (const p of particles){
      const a = clamp(1 - (p.t / Math.max(0.001, p.life)), 0, 1);
      ctx.globalAlpha = 0.85 * a;
      ctx.fillText(p.ch, p.x, p.y);
    }
    ctx.restore();
  }

  function roundRectStroke(x,y,w,h,r){
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.arcTo(x+w, y, x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x, y+h, rr);
    ctx.arcTo(x, y+h, x, y, rr);
    ctx.arcTo(x, y, x+w, y, rr);
    ctx.closePath();
    ctx.stroke();
  }

  
function drawImageContain(img, x, y, w, h){
  // contain-fit (passa in) — ingen beskärning
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return false;
  const s = Math.min(w / iw, h / ih);
  const dw = iw * s;
  const dh = ih * s;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
  return true;
}

function drawFrame(){
  const f = props.frame;
  const innerX = f.x + 6, innerY = f.y + 6;
  const innerW = f.w - 12, innerH = f.h - 12;

  // ram
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 4;
  roundRectStroke(f.x, f.y, f.w, f.h, 10);
  ctx.fillRect(f.x+4, f.y+4, f.w-8, f.h-8);

  // matt bakgrund
  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(innerX, innerY, innerW, innerH);

  // Om vi har GIF-overlay:n aktiv så ritas bilden i DOM istället (så den faktiskt animerar).
  const overlayOk = !!(tavlaOverlay && tavlaGif && tavlaOverlayReady && tavlaGif.complete && (tavlaGif.naturalWidth || tavlaGif.width));

  const img = tavlaImg;
  let drew = overlayOk; // true = ingen placeholder
  if (!overlayOk && img && img.complete && (img.naturalWidth || img.width)){
    ctx.save();
    ctx.beginPath();
    ctx.rect(innerX, innerY, innerW, innerH);
    ctx.clip();
    drew = drawImageContain(img, innerX, innerY, innerW, innerH);
    ctx.restore();
  }
  ctx.restore();

  if (!drew) drawFramePlaceholder();
}

function drawFramePlaceholder(){
    const f = props.frame;
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    roundRectStroke(f.x, f.y, f.w, f.h, 10);
    ctx.fillRect(f.x+4, f.y+4, f.w-8, f.h-8);

    ctx.fillStyle = "rgba(17,24,39,0.35)";
    ctx.font = "900 12px ui-monospace, monospace";
    ctx.fillText("TAVLA", f.x + 16, f.y + 24);
    ctx.fillStyle = "rgba(17,24,39,0.25)";
    ctx.font = "900 10px ui-monospace, monospace";
    ctx.fillText("(lägg bild själv)", f.x + 10, f.y + 42);
    ctx.restore();
  }

  function drawTable(){
    const x = props.table.x, w = props.table.w;
    const topY = FLOOR_Y - 82;
    const h = 34;

    // shadow
    ctx.save();
    ctx.fillStyle = "rgba(17,24,39,0.16)";
    ctx.beginPath();
    ctx.ellipse(x + w/2, FLOOR_Y + 2, w*0.46, 10, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // tabletop (trä)
    ctx.fillStyle = "#f59e0b";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    roundRectStroke(x, topY, w, h, 12);
    ctx.fillRect(x + 4, topY + 4, w - 8, h - 8);

    // wood grain
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 1.5;
    for (let i=0;i<6;i++){
      const yy = topY + 8 + i*4.6;
      ctx.beginPath();
      ctx.moveTo(x + 10, yy);
      ctx.lineTo(x + w - 10, yy + (i%2?1.2:-0.8));
      ctx.stroke();
    }
    ctx.restore();

    // christmas table runner
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(x + 14, topY + 6, w - 28, 8);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(x + 14, topY + 16, w - 28, 3);

    // legs (4)
    ctx.fillStyle = "#9ca3af";
    const legY = topY + h;
    ctx.fillRect(x + 18, legY, 10, 60);
    ctx.fillRect(x + w - 28, legY, 10, 60);
    ctx.fillRect(x + 46, legY, 8, 56);
    ctx.fillRect(x + w - 54, legY, 8, 56);

    // small mug for fun (kopp)
    ctx.fillStyle = "#dbeafe";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;
    const mx = x + w - 54, my = topY + 10;
    roundRectStroke(mx, my, 22, 20, 7);
    ctx.fillRect(mx+3, my+3, 16, 14);
    ctx.beginPath();
    ctx.arc(mx + 22, my + 11, 7, -0.7, 0.7);
    ctx.stroke();
  }

  function drawChair(){
    const x = props.chair.x, w = props.chair.w;
    const seatY = FLOOR_Y - 52;

    // shadow
    ctx.save();
    ctx.fillStyle = "rgba(17,24,39,0.18)";
    ctx.beginPath();
    ctx.ellipse(x + w/2, FLOOR_Y + 2, w*0.34, 8, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // cushion
    ctx.fillStyle = "#fef3c7";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;
    roundRectStroke(x + 10, seatY, w - 20, 18, 10);
    ctx.fillRect(x + 12, seatY + 2, w - 24, 14);

    // seat base
    ctx.fillStyle = "#d97706";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    roundRectStroke(x + 6, seatY + 16, w - 12, 18, 10);
    ctx.fillRect(x + 10, seatY + 20, w - 20, 10);

    // legs
    ctx.fillStyle = "#9ca3af";
    ctx.fillRect(x + 14, seatY + 34, 10, 36);
    ctx.fillRect(x + w - 24, seatY + 34, 10, 36);

    // backrest
    ctx.fillStyle = "#e5e7eb";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    roundRectStroke(x + 10, seatY - 74, w - 20, 70, 14);
    ctx.fillRect(x + 14, seatY - 70, w - 28, 62);

    // slats (gör den mer "stolig")
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = "#111827";
    const slats = 4;
    for (let i=1;i<slats;i++){
      const sx = x + 14 + (i*(w - 28)/slats);
      ctx.fillRect(sx, seatY - 66, 2, 54);
    }
    ctx.restore();

    // label
    ctx.fillStyle = "rgba(17,24,39,0.85)";
    ctx.font = "1000 12px ui-monospace, monospace";
    ctx.fillText("STOL", x + w/2 - 18, seatY - 38);
  }

  function drawTree(tMs){
    const x = props.tree.x, w = props.tree.w;
    const topY = FLOOR_Y - 160;
    const pulse = 0.8 + 0.2 * Math.sin(tMs/250);

    // glowing aura
    ctx.save();
    ctx.globalAlpha = 0.12 * pulse;
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.ellipse(x + w/2, FLOOR_Y - 85, 88, 110, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // trunk
    ctx.fillStyle = "#78350f";
    ctx.fillRect(x + w/2 - 10, FLOOR_Y - 38, 20, 38);

    // tree layers
    const levels = 4;
    ctx.fillStyle = "#16a34a";
    ctx.strokeStyle = "#166534";
    ctx.lineWidth = 4;

    for(let i=0; i<levels; i++){
      const y1 = topY + i*32;
      const y2 = topY + (i+1)*32;
      const step = 16 + i*12;
      ctx.beginPath();
      ctx.moveTo(x + w/2, y1);
      ctx.lineTo(x + w/2 - step, y2);
      ctx.lineTo(x + w/2 + step, y2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // decorations
    const deco = [
      { x: x+28, y: topY+62, emoji: "🔴" },
      { x: x+72, y: topY+92, emoji: "🟠" },
      { x: x+48, y: topY+124, emoji: "🟡" }
    ];
    ctx.font = "24px " + getComputedStyle(document.body).fontFamily;
    for (const d of deco){
      ctx.fillText(d.emoji, d.x, d.y);
    }

    ctx.font = "28px " + getComputedStyle(document.body).fontFamily;
    ctx.fillText("⭐", x + w/2 - 14, topY + 10);
  }

  function drawOrnament(o){
    const y = floorYForRadius(o.r);
    ctx.beginPath();
    ctx.fillStyle = o.base;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    ctx.arc(o.x, y, o.r, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    ctx.font = "26px " + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#111827";
    ctx.fillText(o.label, o.x, y + 1);
  }

  function drawJesper(tMs){
    const y = FLOOR_Y - 8;
    const moving = Math.abs(jesper.vx) > 18 && jesper.action !== "sit";
    const phase = (tMs/120) % (Math.PI*2);
    const walk = moving ? Math.sin(phase) : 0;
    const isDance = (jesper.action === "dance");
    const dance = isDance ? Math.sin(tMs/85) : 0;
    const bob = (moving ? Math.sin(phase*2)*2.0 : Math.sin(tMs/650)*1.3) + (isDance ? Math.sin(tMs/55)*2.0 : 0);

    const x = jesper.x;
    const face = jesper.facing || 1;

    const isKick = (jesper.action === "kick" && jesper.actionT < 0.28);
    const isBump = (jesper.action === "bump" && jesper.actionT < 0.40);
    const isWave = (jesper.action === "wave" && jesper.actionT < 1.20);
    const isSit = (jesper.action === "sit");
    const sitDrop = isSit ? 18 : 0;

    ctx.save();
    ctx.translate(x, y - sitDrop + bob);
    ctx.scale(face, 1);
    if (isBump) ctx.rotate(0.10 * Math.sin(tMs/95));
    if (isDance) ctx.rotate(0.18 * dance);

    ctx.beginPath();
    ctx.fillStyle = "rgba(17,24,39,0.18)";
    ctx.ellipse(0, 28, 22, 6, 0, 0, Math.PI*2);
    ctx.fill();

    const skin = "rgba(255,235,190,1)";
    const hair = "rgba(148,72,34,0.95)";
    const hairH = "rgba(198,108,58,0.78)";
    const hood = "rgba(17,24,39,1)";
    const pants = "rgba(156,163,175,1)";
    const shoe = "rgba(120,74,36,1)";

    const legA = isSit ? 0 : (isDance ? dance * 18 : walk * 10);
    const legB = isSit ? 0 : (isDance ? -dance * 18 : -walk * 10);

    drawLeg(-10, 6, -12 + legA, 24, pants, shoe);
    drawLeg( 10, 6,  12 + legB, 24, pants, shoe);

    ctx.fillStyle = hood;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    roundRect(-18, -16, 36, 34, 12, true, true);

    ctx.fillStyle = "rgba(255,255,255,0.10)";
    roundRect(-12, 2, 24, 12, 8, true, false);

    const arm = isSit ? 0 : (isDance ? dance * 14 : walk * 8);
    const kickArm = isKick ? -14 : 0;
    drawArm(-18, -6, -30, 6 - arm, hood);
    if (isWave){
      drawArm(18, -6, 30, -16 + Math.sin(tMs/150)*10, hood);
    } else {
      drawArm( 18, -6,  30, 6 + arm + kickArm, hood);
    }

    ctx.beginPath();
    ctx.fillStyle = skin;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    ctx.arc(0, -34, 16, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = hair;
    ctx.arc(0, -44, 17, Math.PI, 0);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = hairH;
    ctx.lineWidth = 2.2;
    for (let i=-12; i<=12; i+=6){
      ctx.beginPath();
      ctx.arc(i, -50, 3.6, 0, Math.PI*2);
      ctx.stroke();
    }

    const g = ctx.createLinearGradient(-18, -46, 18, -30);
    g.addColorStop(0.00, "rgba(20,20,20,0.95)");
    g.addColorStop(0.35, "rgba(120,74,36,0.95)");
    g.addColorStop(0.70, "rgba(210,190,150,0.95)");
    g.addColorStop(1.00, "rgba(20,20,20,0.95)");

    ctx.strokeStyle = g;
    ctx.lineWidth = 3.8;
    circleStroke(-7, -36, 7.2);
    circleStroke( 7, -36, 7.2);
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.moveTo(-1.6, -36);
    ctx.lineTo( 1.6, -36);
    ctx.stroke();

    const blink = (jesper.blinkT < 0.10);
    if (isWave){
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(-6, -36); ctx.lineTo(6, -36); // öppna ögon
      ctx.stroke();
    } else if (blink){
      ctx.strokeStyle = "rgba(17,24,39,0.8)";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-8, -36); ctx.lineTo(-2, -36);
      ctx.moveTo( 2, -36); ctx.lineTo( 8, -36);
      ctx.stroke();
    } else {
      ctx.fillStyle = "#111827";
      circleFill(-5, -36, 2.2);
      circleFill( 5, -36, 2.2);
    }

    ctx.strokeStyle = "rgba(17,24,39,0.85)";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    const smiling = (jesper.smileT || 0) > 0.02;
    if (smiling){
      // smile (endast när han träffar)
      ctx.arc(0, -26, 5, 0.15*Math.PI, 0.85*Math.PI);
    } else if (isBump){
      // liten "ouch"-min
      ctx.arc(0, -24, 5, 1.15*Math.PI, 1.85*Math.PI);
    } else {
      // neutral default
      ctx.moveTo(-6, -26); ctx.lineTo(6, -26);
    }
    ctx.stroke();

    ctx.font = "900 12px ui-monospace, monospace";
    ctx.fillStyle = "rgba(17,24,39,0.55)";
    ctx.textAlign = "center";
    ctx.fillText("JESPER", 0, -62);

    ctx.restore();

    function roundRect(x,y,w,h,r,fill,stroke){
      const rr = Math.min(r, w/2, h/2);
      ctx.beginPath();
      ctx.moveTo(x+rr, y);
      ctx.arcTo(x+w, y, x+w, y+h, rr);
      ctx.arcTo(x+w, y+h, x, y+h, rr);
      ctx.arcTo(x, y+h, x, y, rr);
      ctx.arcTo(x, y, x+w, y, rr);
      ctx.closePath();
      if (fill) ctx.fill();
      if (stroke) ctx.stroke();
    }

    function drawLeg(hipX, hipY, footX, footY, pantsCol, shoeCol){
      ctx.beginPath();
      ctx.strokeStyle = pantsCol;
      ctx.lineWidth = 11;
      ctx.lineCap = "round";
      ctx.moveTo(hipX, hipY);
      ctx.lineTo(footX, footY);
      ctx.stroke();

      ctx.fillStyle = shoeCol;
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 3;
      roundRect(footX - 13, footY - 7, 26, 14, 7, true, true);

      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(footX - 10, footY + 4);
      ctx.lineTo(footX + 10, footY + 4);
      ctx.stroke();
    }

    function drawArm(x1, y1, x2, y2, sleeveCol){
      ctx.beginPath();
      ctx.strokeStyle = sleeveCol;
      ctx.lineWidth = 11;
      ctx.lineCap = "round";
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = "rgba(255,235,190,0.85)";
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2;
      ctx.arc(x2, y2, 4.8, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
    }

    function circleStroke(cx, cy, r){
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI*2);
      ctx.stroke();
    }
    function circleFill(cx, cy, r){
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI*2);
      ctx.fill();
    }
  }

  function drawJoystick(){
    const bx = clamp(state.joy.startX, ROOM.x+40, ROOM.x+ROOM.w-40);
    const by = ROOM.y + ROOM.h - 80;
    const kx = bx + state.joy.dx;

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(17,24,39,0.07)";
    ctx.strokeStyle = "rgba(17,24,39,0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(bx, by, 24, 0, Math.PI*2); ctx.fill(); ctx.stroke();

    ctx.fillStyle = "rgba(37,99,235,0.18)";
    ctx.strokeStyle = "rgba(17,24,39,0.55)";
    ctx.beginPath(); ctx.arc(kx, by, 16, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ---------- Loop ----------
  let last = nowMs();
  function frame(t){
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;

    if (wonder?.classList.contains("hidden") ?? true){
      update(dt, t);
      draw(t);
    }

    requestAnimationFrame(frame);
  }

  try{
    setTimeout(()=>toast("⏰ → 🍬 → ⭐ och sitt ner."), 900);
    requestAnimationFrame(frame);
  } catch(err){
    console.error(err);
    toast("Krasch 😵", 4000);
  }

})();
