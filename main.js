(() => {
  'use strict';

  // ====== Countdown (7 Jan 2026 06:00 CET = 05:00 UTC) ======
  const countdownEl = document.getElementById('countdownValue');
  const TARGET_UTC_MS = Date.UTC(2026, 0, 7, 5, 0, 0);

  function pad2(n){ return String(n).padStart(2, '0'); }
  function tickCountdown(){
    const now = Date.now();
    const diff = TARGET_UTC_MS - now;
    if (diff <= 0){ countdownEl.textContent = 'NU. ☕'; return; }
    const total = Math.floor(diff / 1000);
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    countdownEl.textContent = `${d}d ${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }
  setInterval(tickCountdown, 1000);
  tickCountdown();

  // ====== DOM ======
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });

  const bubbleEl = document.getElementById('bubble');
  const toastEl  = document.getElementById('hintToast');

  const soundBtn = document.getElementById('soundBtn');
  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const closeHelpBtn = document.getElementById('closeHelpBtn');

  const kickBtn = document.getElementById('kickBtn');
  const sitBtn  = document.getElementById('sitBtn');

  const wonder = document.getElementById('wonder');
  const wonderCanvas = document.getElementById('wonderCanvas');
  const wctx = wonderCanvas.getContext('2d', { alpha: true });
  const closeWonderBtn = document.getElementById('closeWonderBtn');

  function showBubble(text, ms = 1600){
    bubbleEl.textContent = text;
    bubbleEl.classList.remove('hidden');
    clearTimeout(showBubble._t);
    showBubble._t = setTimeout(() => bubbleEl.classList.add('hidden'), ms);
  }
  function toast(text, ms = 1200){
    toastEl.textContent = text;
    toastEl.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.add('hidden'), ms);
  }

  helpBtn?.addEventListener('click', () => helpModal?.classList.remove('hidden'));
  closeHelpBtn?.addEventListener('click', () => helpModal?.classList.add('hidden'));

  // ====== Audio (WebAudio) ======
  let audioEnabled = false;
  let audioCtx = null;

  function ensureAudio(){
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function playGrunt(intensity = 1){
    if (!audioEnabled) return;
    ensureAudio();
    const now = audioCtx.currentTime;

    const o = audioCtx.createOscillator();
    const n = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    const f = audioCtx.createBiquadFilter();

    f.type = 'bandpass';
    f.frequency.value = 320 + Math.random() * 520;
    f.Q.value = 0.8 + Math.random() * 2.6;

    o.type = Math.random() < 0.5 ? 'sawtooth' : 'square';
    n.type = 'triangle';

    const base = 110 + Math.random() * 90;

    o.frequency.setValueAtTime(base * (1.2 + 0.25 * intensity), now);
    o.frequency.exponentialRampToValueAtTime(base * 0.7, now + 0.16);

    n.frequency.setValueAtTime(base * 2.1, now);
    n.frequency.exponentialRampToValueAtTime(base * 1.3, now + 0.16);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.11 * intensity, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    o.connect(f); n.connect(f);
    f.connect(g); g.connect(audioCtx.destination);

    o.start(now); n.start(now);
    o.stop(now + 0.24); n.stop(now + 0.24);
  }

  function playJingle(){
    if (!audioEnabled) return;
    ensureAudio();
    const now = audioCtx.currentTime;
    const notes = [523.25, 659.25, 783.99, 659.25, 523.25];
    notes.forEach((freq, i) => {
      const t = now + i * 0.11;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'triangle';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + 0.12);
    });
  }

  soundBtn?.addEventListener('click', async () => {
    audioEnabled = !audioEnabled;
    soundBtn.textContent = audioEnabled ? '🔊 Ljud: PÅ' : '🔊 Ljud: AV';
    if (audioEnabled){
      ensureAudio();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      toast('Ljud på. Jesper låter… opassande.');
      playGrunt(1.0);
    } else {
      toast('Ljud av. En kort stund av värdighet.');
    }
  });

  // ====== Resize (draw in CSS pixels; handle DPR) ======
  let cssW = 0, cssH = 0, dpr = 1;

  function resizeCanvas(){
    const rect = canvas.getBoundingClientRect();
    cssW = rect.width;
    cssH = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Wonder canvas covers full viewport
    const W = window.innerWidth, H = window.innerHeight;
    wonderCanvas.width = Math.round(W * dpr);
    wonderCanvas.height = Math.round(H * dpr);
    wctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    layout(!world._placed);
    syncSizes();
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function maybeResizeFromSafariUI(){
    // iOS toolbar sometimes changes canvas rect without firing resize
    const rect = canvas.getBoundingClientRect();
    if (Math.abs(rect.width - cssW) > 0.5 || Math.abs(rect.height - cssH) > 0.5){
      resizeCanvas();
    }
  }

  // ====== World layout ======
  const world = {
    R: { x: 0, y: 0, w: 0, h: 0 },
    table: { x:0,y:0,w:0,h:0 },
    chair: { x:0,y:0,w:0,h:0 },
    tree:  { x:0,y:0,w:0,h:0 },
    _placed: false
  };

  function layout(initial){
    const pad = 14;
    world.R.x = pad;
    world.R.y = pad;
    world.R.w = Math.max(200, cssW - pad * 2);
    world.R.h = Math.max(220, cssH - pad * 2);
    world.R.h = Math.min(world.R.h, Math.floor(cssH * 0.93));

    const R = world.R;

    world.table.w = Math.floor(R.w * 0.46);
    world.table.h = Math.floor(R.h * 0.16);

    world.chair.w = Math.floor(R.w * 0.22);
    world.chair.h = Math.floor(R.h * 0.22);

    world.tree.w  = Math.floor(R.w * 0.24);
    world.tree.h  = Math.floor(R.h * 0.42);

    world.table.x = R.x + Math.floor(R.w * 0.08);
    world.table.y = R.y + Math.floor(R.h * 0.63);

    world.chair.x = world.table.x + world.table.w + Math.floor(R.w * 0.06);
    world.chair.y = world.table.y + Math.floor(R.h * 0.03);

    world.tree.x  = R.x + R.w - world.tree.w - Math.floor(R.w * 0.06);
    world.tree.y  = R.y + Math.floor(R.h * 0.08);

    // Place entities once; otherwise just clamp into new room
    if (initial || !world._placed){
      world._placed = true;

      jesper.x = R.x + Math.floor(R.w * 0.16);
      jesper.y = R.y + Math.floor(R.h * 0.82);
      jesper.vx = 0; jesper.vy = 0; jesper.face = 1;

      const cx = R.x + R.w * 0.54;
      const cy = R.y + R.h * 0.38;
      const gap = Math.max(52, Math.floor(R.w * 0.18));

      ornaments[0].x = cx - gap; ornaments[0].y = cy + 18;
      ornaments[1].x = cx;       ornaments[1].y = cy - 10;
      ornaments[2].x = cx + gap; ornaments[2].y = cy + 18;
      ornaments.forEach(o => { o.vx = 0; o.vy = 0; });
    } else {
      // clamp without teleporting
      jesper.x = clamp(jesper.x, R.x + jesper.r, R.x + R.w - jesper.r);
      jesper.y = clamp(jesper.y, R.y + jesper.r, R.y + R.h - jesper.r);
      ornaments.forEach(o => {
        o.x = clamp(o.x, R.x + o.r, R.x + R.w - o.r);
        o.y = clamp(o.y, R.y + o.r, R.y + R.h - o.r);
      });
    }
  }

  // ====== Entities & state ======
  const state = {
    joy: { active:false, sx:0, sy:0, dx:0, dy:0 },
    dragging: null,
    sitting: false,
    secret: { step: 0, unlocked: false }, // clock->candy->star->sit
    puffs: [],
    snow: []
  };

  const jesper = { x: 0, y: 0, vx: 0, vy: 0, r: 18, face: 1 };
  const ornaments = [
    { id:'clock', label:'⏰', base:'#fde047', x:0,y:0,r:18,vx:0,vy:0 },
    { id:'candy', label:'🍬', base:'#fb7185', x:0,y:0,r:18,vx:0,vy:0 },
    { id:'star',  label:'⭐',  base:'#60a5fa', x:0,y:0,r:18,vx:0,vy:0 }
  ];

  function syncSizes(){
    const R = world.R;
    const base = Math.max(16, Math.floor(Math.min(R.w, R.h) * 0.050));
    jesper.r = base + 2;
    ornaments.forEach(o => o.r = base + 1);
    // keep in bounds after resize
    jesper.x = clamp(jesper.x, R.x + jesper.r, R.x + R.w - jesper.r);
    jesper.y = clamp(jesper.y, R.y + jesper.r, R.y + R.h - jesper.r);
    ornaments.forEach(o => {
      o.x = clamp(o.x, R.x + o.r, R.x + R.w - o.r);
      o.y = clamp(o.y, R.y + o.r, R.y + R.h - o.r);
    });
  }

  // ====== Input (pointer only — NO PILAR) ======
  function pointerPos(e){
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = pointerPos(e);

    const hit = ornaments.find(o => dist(o.x, o.y, p.x, p.y) <= o.r + 12);
    if (hit){
      state.dragging = hit;
      hit.vx = 0; hit.vy = 0;
      canvas.setPointerCapture(e.pointerId);
      toast('Flyttar pynt.');
      playGrunt(0.75);
      return;
    }

    state.joy.active = true;
    state.joy.sx = p.x;
    state.joy.sy = p.y;
    state.joy.dx = 0;
    state.joy.dy = 0;
    canvas.setPointerCapture(e.pointerId);
  }, { passive:false });

  canvas.addEventListener('pointermove', (e) => {
    e.preventDefault();
    const p = pointerPos(e);

    if (state.dragging){
      const o = state.dragging;
      const R = world.R;
      o.x = clamp(p.x, R.x + o.r, R.x + R.w - o.r);
      o.y = clamp(p.y, R.y + o.r, R.y + R.h - o.r);
      return;
    }

    if (state.joy.active){
      const max = 56;
      state.joy.dx = clamp(p.x - state.joy.sx, -max, max);
      state.joy.dy = clamp(p.y - state.joy.sy, -max, max);
    }
  }, { passive:false });

  function endPointer(){
    state.dragging = null;
    state.joy.active = false;
    state.joy.dx = 0;
    state.joy.dy = 0;
  }

  canvas.addEventListener('pointerup', endPointer, { passive:false });
  canvas.addEventListener('pointercancel', endPointer, { passive:false });

  kickBtn?.addEventListener('click', () => kick());
  sitBtn?.addEventListener('click', () => sit());

  // ====== Secret ======
  function advanceSecret(id){
    if (state.secret.unlocked) return;
    const need =
      state.secret.step === 0 ? 'clock' :
      state.secret.step === 1 ? 'candy' :
      state.secret.step === 2 ? 'star'  : null;

    if (id === need){
      state.secret.step++;
      toast(`Hemligheten: ${state.secret.step}/3`);
      playGrunt(1.0);
      if (state.secret.step === 3) showBubble('SITT på stolen. Nu.');
      return;
    }

    state.secret.step = 0;
    toast('Nej. Hemligheten nollställdes.');
    playGrunt(0.8);
  }

  function unlockWonder(){
    if (state.secret.unlocked) return;
    state.secret.unlocked = true;
    playJingle();
    showBubble('LEGENDARISKT. ✨', 1400);
    wonder.classList.remove('hidden');
    drawWonderScene(true);
  }

  closeWonderBtn?.addEventListener('click', () => {
    wonder.classList.add('hidden');
    showBubble('Tillbaka i rummet. Självklart.');
  });

  // ====== Actions ======
  function kick(){
    const reach = Math.max(76, jesper.r * 3.2);

    const nearest = ornaments
      .map(o => ({ o, d: dist(jesper.x, jesper.y, o.x, o.y) }))
      .filter(x => x.d <= reach)
      .sort((a,b) => a.d - b.d)[0];

    if (!nearest){
      showBubble('Sparkade luft. Det var… terapeutiskt.');
      playGrunt(0.7);
      return;
    }

    const o = nearest.o;
    const dx = o.x - jesper.x;
    const dy = o.y - jesper.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / len;
    const ny = dy / len;

    const impulse = 520 + Math.random() * 180;
    o.vx += nx * impulse;
    o.vy += ny * impulse;

    addPuff(o.x - nx * 12, o.y - ny * 12, 1.0);
    showBubble(`👞 SPARK! (${o.label})`, 900);
    playGrunt(1.0);

    advanceSecret(o.id);
  }

  function sit(){
    const c = world.chair;
    const ok = aabbCircleHit(c.x, c.y, c.w, c.h, jesper.x, jesper.y, jesper.r + 14);

    if (!ok){
      showBubble('Satt mentalt. Inte fysiskt.');
      playGrunt(0.65);
      return;
    }

    state.sitting = true;
    showBubble('🪑 …jul… kaffe… existens…', 1300);
    playGrunt(0.8);

    if (state.secret.step === 3 && !state.secret.unlocked){
      toast('Kombination fullbordad!');
      unlockWonder();
    }

    setTimeout(() => state.sitting = false, 850);
  }

  // ====== Light chatter ======
  const lines = [
    'Rummet är… otroligt budget.',
    'Min hoodie är 100% certifierad mys.',
    'Jag saknar kontoret. (Säg inte det högt.)',
    'Det här pyntet är ett test av min moral.',
    'Kaffe är en metod.'
  ];
  setInterval(() => {
    if (!wonder.classList.contains('hidden')) return;
    if (Math.random() < 0.22){
      showBubble(lines[(Math.random() * lines.length) | 0]);
      playGrunt(0.55);
    }
    if (!state.secret.unlocked && Math.random() < 0.12){
      if (state.secret.step === 0) showBubble('⏰ känns… viktigt.', 1200);
      if (state.secret.step === 1) showBubble('🍬 är… misstänkt.', 1200);
      if (state.secret.step === 2) showBubble('⭐ är… sista biten.', 1200);
    }
  }, 4200);

  // ====== Physics helpers ======
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function dist(ax,ay,bx,by){ return Math.hypot(ax-bx, ay-by); }

  function aabbCircleHit(x,y,w,h,cx,cy,cr){
    const px = clamp(cx, x, x+w);
    const py = clamp(cy, y, y+h);
    return dist(px,py,cx,cy) <= cr;
  }

  function resolveWallCircle(o){
    const R = world.R;
    if (o.x - o.r < R.x){ o.x = R.x + o.r; o.vx *= -0.55; }
    if (o.x + o.r > R.x + R.w){ o.x = R.x + R.w - o.r; o.vx *= -0.55; }
    if (o.y - o.r < R.y){ o.y = R.y + o.r; o.vy *= -0.55; }
    if (o.y + o.r > R.y + R.h){ o.y = R.y + R.h - o.r; o.vy *= -0.55; }
  }

  function resolveRectBlockCircle(o, rect){
    if (!aabbCircleHit(rect.x, rect.y, rect.w, rect.h, o.x, o.y, o.r)) return;

    const cx = clamp(o.x, rect.x, rect.x + rect.w);
    const cy = clamp(o.y, rect.y, rect.y + rect.h);
    const dx = o.x - cx;
    const dy = o.y - cy;
    const len = Math.max(1e-6, Math.hypot(dx, dy));
    const nx = dx / len;
    const ny = dy / len;

    o.x = cx + nx * (o.r + 0.6);
    o.y = cy + ny * (o.r + 0.6);

    const dot = o.vx * nx + o.vy * ny;
    o.vx -= 1.35 * dot * nx;
    o.vy -= 1.35 * dot * ny;
    o.vx *= 0.82;
    o.vy *= 0.82;
  }

  // ====== Puffs (motion clarity) ======
  function addPuff(x, y, strength = 1){
    state.puffs.push({
      x, y,
      r: 6 + Math.random() * 7 * strength,
      a: 1.0,
      vx: (Math.random()*2-1) * 24 * strength,
      vy: (Math.random()*2-1) * 22 * strength
    });
    if (state.puffs.length > 32) state.puffs.shift();
  }

  // ====== Update & Draw ======
  function update(dt, tMs){
    maybeResizeFromSafariUI();

    // movement from joystick
    let ax = 0, ay = 0;
    if (state.joy.active){
      ax = state.joy.dx / 56;
      ay = state.joy.dy / 56;
      const mag = Math.hypot(ax, ay);
      if (mag > 1){ ax /= mag; ay /= mag; }
    }

    const targetSpeed = state.sitting ? 0 : 240;
    const tx = ax * targetSpeed;
    const ty = ay * targetSpeed;

    // smooth accel
    const lerp = 1 - Math.pow(0.001, dt);
    jesper.vx += (tx - jesper.vx) * lerp;
    jesper.vy += (ty - jesper.vy) * lerp;

    const oldX = jesper.x, oldY = jesper.y;

    jesper.x += jesper.vx * dt;
    jesper.y += jesper.vy * dt;

    const R = world.R;
    jesper.x = clamp(jesper.x, R.x + jesper.r, R.x + R.w - jesper.r);
    jesper.y = clamp(jesper.y, R.y + jesper.r, R.y + R.h - jesper.r);

    if (Math.abs(jesper.vx) > 4) jesper.face = Math.sign(jesper.vx);

    const moved = dist(oldX, oldY, jesper.x, jesper.y);
    if (!state.sitting && moved > 0.9 && Math.random() < 0.35){
      addPuff(jesper.x - jesper.face * 10, jesper.y + jesper.r + 8, 0.45);
    }

    // ornaments
    const friction = Math.pow(0.10, dt);
    const blocks = [ world.table, world.chair, world.tree ];

    ornaments.forEach(o => {
      if (state.dragging === o) return;

      o.x += o.vx * dt;
      o.y += o.vy * dt;

      o.vx *= friction;
      o.vy *= friction;

      if (Math.abs(o.vx) < 2) o.vx = 0;
      if (Math.abs(o.vy) < 2) o.vy = 0;

      resolveWallCircle(o);
      blocks.forEach(b => resolveRectBlockCircle(o, b));

      const d = dist(o.x, o.y, jesper.x, jesper.y);
      const minD = o.r + jesper.r;
      if (d < minD){
        const nx = (o.x - jesper.x) / Math.max(d, 1);
        const ny = (o.y - jesper.y) / Math.max(d, 1);
        const push = (minD - d) * 1.05;
        o.x += nx * push;
        o.y += ny * push;
        o.vx += nx * 140;
        o.vy += ny * 140;
      }
    });

    // puffs
    state.puffs.forEach(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.a -= 1.9 * dt;
    });
    state.puffs = state.puffs.filter(p => p.a > 0);
  }

  function draw(tMs){
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cssW, cssH);

    const R = world.R;

    // room fill
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(R.x, R.y, R.w, R.h);

    // border
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    ctx.strokeRect(R.x, R.y, R.w, R.h);

    // baseboard
    const baseY = R.y + R.h - Math.max(22, Math.floor(R.h * 0.07));
    ctx.strokeStyle = 'rgba(17,24,39,0.20)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(R.x, baseY);
    ctx.lineTo(R.x + R.w, baseY);
    ctx.stroke();

    // label
    ctx.fillStyle = 'rgba(17,24,39,0.24)';
    ctx.font = '900 12px ui-monospace, monospace';
    ctx.fillText('RUM 01 — EXISTENS / JUL / KAFFE', R.x + 10, R.y + R.h - 10);

    // puffs behind
    state.puffs.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.a) * 0.25;
      ctx.beginPath();
      ctx.fillStyle = '#111827';
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // furniture
    drawTree(world.tree, tMs);
    drawTable(world.table);
    drawChair(world.chair);

    // ornaments
    ornaments.slice().sort((a,b)=>a.y-b.y).forEach(drawOrnament);

    // Jesper
    drawJesper(tMs);

    // joystick
    if (state.joy.active && !state.dragging) drawJoystick();
  }

  function roundRect(x,y,w,h,r, fill, stroke){
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

  function drawTable(t){
    ctx.save();
    const rad = Math.max(10, Math.floor(t.h * 0.35));

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    roundRect(t.x, t.y, t.w, t.h, rad, true, true);

    ctx.fillStyle = '#e5e7eb';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    const legW = Math.max(12, Math.floor(t.w * 0.10));
    const legH = Math.max(28, Math.floor(t.h * 0.70));
    roundRect(t.x + Math.floor(t.w*0.12), t.y + t.h - 2, legW, legH, 8, true, true);
    roundRect(t.x + t.w - Math.floor(t.w*0.12) - legW, t.y + t.h - 2, legW, legH, 8, true, true);

    // coffee mug
    ctx.fillStyle = '#dbeafe';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    const mx = t.x + t.w - Math.floor(t.w*0.22);
    const my = t.y + Math.floor(t.h*0.20);
    roundRect(mx, my, 18, 16, 6, true, true);
    ctx.beginPath();
    ctx.arc(mx + 18, my + 8, 6, -0.5, 0.5);
    ctx.stroke();

    ctx.restore();
  }

  function drawChair(c){
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;

    roundRect(c.x, c.y + Math.floor(c.h*0.35), c.w, Math.floor(c.h*0.65), 14, true, true);
    roundRect(c.x + Math.floor(c.w*0.10), c.y, Math.floor(c.w*0.80), Math.floor(c.h*0.50), 14, true, true);

    // label bubble
    const bx = c.x + Math.floor(c.w*0.22);
    const by = c.y - 18;
    roundRect(bx, by, 50, 22, 10, true, true);
    ctx.fillStyle = 'rgba(17,24,39,0.85)';
    ctx.font = '900 10px ui-monospace, monospace';
    ctx.fillText('STOL', bx + 12, by + 15);

    ctx.restore();
  }

  function drawTree(tr, tMs){
    ctx.save();

    const pulse = 0.75 + 0.25 * Math.sin(tMs / 240);
    ctx.globalAlpha = 0.16 * pulse;
    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.ellipse(tr.x + tr.w/2, tr.y + tr.h*0.55, tr.w*0.65, tr.h*0.55, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#d1d5db';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    roundRect(tr.x + tr.w*0.43, tr.y + tr.h*0.78, tr.w*0.14, tr.h*0.20, 8, true, true);

    ctx.fillStyle = '#dcfce7';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;

    function tri(ax,ay,bx,by,cx,cy){
      ctx.beginPath();
      ctx.moveTo(ax,ay);
      ctx.lineTo(bx,by);
      ctx.lineTo(cx,cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    tri(tr.x + tr.w/2, tr.y + 12, tr.x + 10, tr.y + tr.h*0.52, tr.x + tr.w - 10, tr.y + tr.h*0.52);
    tri(tr.x + tr.w/2, tr.y + tr.h*0.22, tr.x + 8, tr.y + tr.h*0.78, tr.x + tr.w - 8, tr.y + tr.h*0.78);

    ctx.font = '22px ' + getComputedStyle(document.body).fontFamily;
    ctx.fillText('⭐', tr.x + tr.w/2 - 10, tr.y + 24);

    ctx.font = '18px ' + getComputedStyle(document.body).fontFamily;
    ctx.fillText('🔴', tr.x + 14, tr.y + tr.h*0.40);
    ctx.fillText('🔴', tr.x + tr.w - 30, tr.y + tr.h*0.46);
    ctx.fillText('🔴', tr.x + tr.w/2 - 8, tr.y + tr.h*0.60);

    ctx.restore();
  }

  function drawOrnament(o){
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = o.base;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    ctx.arc(o.x, o.y, o.r, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    ctx.font = '24px ' + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#111827';
    ctx.fillText(o.label, o.x, o.y + 1);

    ctx.restore();
  }

  function drawJesper(tMs){
    const moving = Math.hypot(jesper.vx, jesper.vy) > 16;
    const walk = moving ? Math.sin(tMs / 85) : 0;
    const idle = moving ? 0 : Math.sin(tMs / 420);

    const sit = state.sitting ? 1 : 0;
    const bob = (sit ? 0.2 : 1) * (moving ? walk * 2.0 : idle * 1.0);

    const x = jesper.x;
    const y = jesper.y + bob;
    const face = jesper.face || 1;

    const skin  = 'rgba(255,235,190,1)';
    const hair  = 'rgba(148,72,34,0.95)';
    const hairH = 'rgba(198,108,58,0.78)';
    const hood  = 'rgba(17,24,39,1)';
    const pants = 'rgba(156,163,175,1)';
    const shoe  = 'rgba(120,74,36,1)';

    // shadow
    ctx.beginPath();
    ctx.fillStyle = 'rgba(17,24,39,0.18)';
    ctx.ellipse(x, y + jesper.r + 14, jesper.r * 1.2, 7, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(face, 1);

    if (moving){
      ctx.strokeStyle = 'rgba(17,24,39,0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-jesper.r*1.8, 8); ctx.lineTo(-jesper.r*2.6, 4);
      ctx.moveTo(-jesper.r*1.8, 16); ctx.lineTo(-jesper.r*2.8, 16);
      ctx.stroke();
    }

    const legSwing = sit ? 0 : walk * (jesper.r * 0.65);
    const knee = sit ? jesper.r * 0.35 : 0;

    drawLeg(-jesper.r*0.35, jesper.r*0.55, -jesper.r*0.45 + legSwing, jesper.r*1.55 - knee);
    drawLeg( jesper.r*0.35, jesper.r*0.55,  jesper.r*0.45 - legSwing, jesper.r*1.55 - knee);

    // hoodie
    ctx.fillStyle = hood;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    roundRect(-jesper.r*1.05, -jesper.r*0.30, jesper.r*2.10, jesper.r*1.95, 12, true, true);

    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    roundRect(-jesper.r*0.75, jesper.r*0.75, jesper.r*1.50, jesper.r*0.55, 10, true, false);

    // hood
    ctx.fillStyle = hood;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -jesper.r*1.05, jesper.r*1.20, Math.PI*0.05, Math.PI*0.95);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // arms
    const armSwing = sit ? 0 : walk * (jesper.r * 0.55);
    drawArm(-jesper.r*1.05, jesper.r*0.20, -jesper.r*1.75, jesper.r*0.70 - armSwing);
    drawArm( jesper.r*1.05, jesper.r*0.20,  jesper.r*1.75, jesper.r*0.70 + armSwing);

    // head
    ctx.beginPath();
    ctx.fillStyle = skin;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    ctx.arc(0, -jesper.r*1.05, jesper.r*0.92, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    // hair
    ctx.beginPath();
    ctx.fillStyle = hair;
    ctx.arc(0, -jesper.r*1.45, jesper.r*1.00, Math.PI, 0);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = hairH;
    ctx.lineWidth = 2.2;
    for (let i = -1; i <= 1; i++){
      ctx.beginPath();
      ctx.arc(i * jesper.r*0.45, -jesper.r*1.75, jesper.r*0.22, 0, Math.PI*2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.strokeStyle = hair;
    ctx.lineWidth = 3;
    ctx.arc(-jesper.r*0.85, -jesper.r*1.05, jesper.r*0.28, Math.PI*0.2, Math.PI*1.5);
    ctx.stroke();

    // glasses
    const g = ctx.createLinearGradient(-jesper.r, -jesper.r*1.55, jesper.r, -jesper.r*0.70);
    g.addColorStop(0.00, 'rgba(20,20,20,0.95)');
    g.addColorStop(0.35, 'rgba(120,74,36,0.95)');
    g.addColorStop(0.70, 'rgba(210,190,150,0.95)');
    g.addColorStop(1.00, 'rgba(20,20,20,0.95)');

    ctx.strokeStyle = g;
    ctx.lineWidth = 3.6;
    circleStroke(-jesper.r*0.42, -jesper.r*1.12, jesper.r*0.40);
    circleStroke( jesper.r*0.42, -jesper.r*1.12, jesper.r*0.40);
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.moveTo(-jesper.r*0.10, -jesper.r*1.12);
    ctx.lineTo( jesper.r*0.10, -jesper.r*1.12);
    ctx.stroke();

    // eyes
    ctx.fillStyle = '#111827';
    circleFill(-jesper.r*0.30, -jesper.r*1.08, jesper.r*0.12);
    circleFill( jesper.r*0.30, -jesper.r*1.08, jesper.r*0.12);

    // mouth
    ctx.strokeStyle = 'rgba(17,24,39,0.85)';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    if (sit){
      ctx.moveTo(-jesper.r*0.24, -jesper.r*0.78);
      ctx.lineTo( jesper.r*0.24, -jesper.r*0.78);
    } else {
      ctx.arc(0, -jesper.r*0.78, jesper.r*0.25, 0.12*Math.PI, 0.88*Math.PI);
    }
    ctx.stroke();

    // name
    ctx.font = '900 12px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(17,24,39,0.55)';
    ctx.textAlign = 'center';
    ctx.fillText('JESPER', 0, -jesper.r*2.45);

    ctx.restore();

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
    function drawLeg(hipX, hipY, footX, footY){
      ctx.beginPath();
      ctx.strokeStyle = pants;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.moveTo(hipX, hipY);
      ctx.lineTo(footX, footY);
      ctx.stroke();

      ctx.fillStyle = shoe;
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2.5;
      roundRect(footX - jesper.r*0.65, footY - 7, jesper.r*1.30, 14, 7, true, true);

      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(footX - jesper.r*0.52, footY + 4);
      ctx.lineTo(footX + jesper.r*0.52, footY + 4);
      ctx.stroke();
    }
    function drawArm(x1,y1,x2,y2){
      ctx.beginPath();
      ctx.strokeStyle = hood;
      ctx.lineWidth = 11;
      ctx.lineCap = 'round';
      ctx.moveTo(x1,y1);
      ctx.lineTo(x2,y2);
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,235,190,0.8)';
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2;
      ctx.arc(x2, y2, 4.6, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawJoystick(){
    const bx = state.joy.sx;
    const by = state.joy.sy;
    const kx = bx + state.joy.dx;
    const ky = by + state.joy.dy;

    ctx.save();
    ctx.globalAlpha = 0.92;

    ctx.fillStyle = 'rgba(17,24,39,0.06)';
    ctx.strokeStyle = 'rgba(17,24,39,0.30)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(bx, by, 28, 0, Math.PI*2); ctx.fill(); ctx.stroke();

    ctx.fillStyle = 'rgba(37,99,235,0.18)';
    ctx.strokeStyle = 'rgba(17,24,39,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(kx, ky, 18, 0, Math.PI*2); ctx.fill(); ctx.stroke();

    ctx.restore();
  }

  // ====== Wonder scene ======
  let wonderInit = false;
  let snowT = 0;

  function initWonderSnow(){
    state.snow = [];
    const W = window.innerWidth;
    const H = window.innerHeight;
    const n = 120;
    for (let i=0; i<n; i++){
      state.snow.push({
        x: Math.random()*W,
        y: Math.random()*H,
        r: 0.8 + Math.random()*2.2,
        s: 18 + Math.random()*60,
        a: 0.35 + Math.random()*0.55
      });
    }
  }

  function drawWonderScene(force){
    if (!force && wonder.classList.contains('hidden')) return;

    if (!wonderInit){
      wonderInit = true;
      initWonderSnow();
    }

    const W = window.innerWidth;
    const H = window.innerHeight;

    // background gradient
    const g = wctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1026');
    g.addColorStop(0.55, '#0b3b78');
    g.addColorStop(1, '#e6f3ff');
    wctx.fillStyle = g;
    wctx.fillRect(0,0,W,H);

    // moon
    wctx.globalAlpha = 0.9;
    wctx.fillStyle = '#ffffff';
    wctx.beginPath();
    wctx.arc(W*0.78, H*0.22, 46, 0, Math.PI*2);
    wctx.fill();

    wctx.globalAlpha = 0.85;
    wctx.fillStyle = 'rgba(11,16,38,0.9)';
    wctx.beginPath();
    wctx.arc(W*0.80, H*0.20, 46, 0, Math.PI*2);
    wctx.fill();

    // hills
    wctx.globalAlpha = 1;
    wctx.fillStyle = '#d7efff';
    wctx.beginPath();
    wctx.ellipse(W*0.32, H*0.86, W*0.55, H*0.18, 0, 0, Math.PI*2);
    wctx.fill();

    wctx.fillStyle = '#bfe6ff';
    wctx.beginPath();
    wctx.ellipse(W*0.72, H*0.90, W*0.60, H*0.20, 0, 0, Math.PI*2);
    wctx.fill();

    // cozy cabin
    const cx = W*0.22, cy = H*0.70;
    wctx.fillStyle = 'rgba(255,255,255,0.92)';
    wctx.strokeStyle = 'rgba(0,0,0,0.30)';
    wctx.lineWidth = 4;
    roundRectW(cx, cy, 160, 110, 18, true, true);

    // roof
    wctx.fillStyle = 'rgba(11,16,38,0.85)';
    wctx.beginPath();
    wctx.moveTo(cx-14, cy+14);
    wctx.lineTo(cx+80, cy-46);
    wctx.lineTo(cx+174, cy+14);
    wctx.closePath();
    wctx.fill();

    // window light
    wctx.fillStyle = 'rgba(255,220,120,0.95)';
    roundRectW(cx+98, cy+42, 38, 30, 8, true, false);
    wctx.fillStyle = 'rgba(255,220,120,0.40)';
    wctx.beginPath();
    wctx.ellipse(cx+118, cy+70, 64, 44, 0, 0, Math.PI*2);
    wctx.fill();

    // pine trees
    drawPine(W*0.60, H*0.72, 140);
    drawPine(W*0.72, H*0.76, 170);
    drawPine(W*0.52, H*0.80, 120);

    // title text
    wctx.globalAlpha = 1;
    wctx.fillStyle = 'rgba(255,255,255,0.95)';
    wctx.font = '1000 26px ui-rounded, system-ui, -apple-system, sans-serif';
    wctx.textAlign = 'center';
    wctx.fillText('GOD JUL, JESPER', W*0.5, H*0.12);

    wctx.fillStyle = 'rgba(255,255,255,0.86)';
    wctx.font = '900 14px ui-monospace, monospace';
    wctx.fillText('The Return of the Office Legend', W*0.5, H*0.15);

    // snow
    snowT += 1/60;
    state.snow.forEach(p => {
      p.y += (p.s / 60);
      p.x += Math.sin((p.y + snowT*50) / 40) * 0.4;
      if (p.y > H + 10){ p.y = -10; p.x = Math.random()*W; }
      wctx.globalAlpha = p.a;
      wctx.fillStyle = '#ffffff';
      wctx.beginPath();
      wctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      wctx.fill();
    });
    wctx.globalAlpha = 1;

    function drawPine(x, y, h){
      wctx.save();
      wctx.translate(x, y);

      wctx.fillStyle = 'rgba(220,252,231,0.95)';
      wctx.strokeStyle = 'rgba(0,0,0,0.28)';
      wctx.lineWidth = 4;

      tri(0, -h, -h*0.55, -h*0.15, h*0.55, -h*0.15);
      tri(0, -h*0.70, -h*0.62, h*0.05, h*0.62, h*0.05);
      tri(0, -h*0.35, -h*0.70, h*0.25, h*0.70, h*0.25);

      wctx.fillStyle = 'rgba(209,213,219,0.95)';
      roundRectW(-h*0.10, h*0.22, h*0.20, h*0.18, 10, true, true);

      wctx.restore();

      function tri(ax, ay, bx, by, cx, cy){
        wctx.beginPath();
        wctx.moveTo(ax, ay);
        wctx.lineTo(bx, by);
        wctx.lineTo(cx, cy);
        wctx.closePath();
        wctx.fill();
        wctx.stroke();
      }
    }

    function roundRectW(x,y,w,h,r, fill, stroke){
      const rr = Math.min(r, w/2, h/2);
      wctx.beginPath();
      wctx.moveTo(x+rr, y);
      wctx.arcTo(x+w, y, x+w, y+h, rr);
      wctx.arcTo(x+w, y+h, x, y+h, rr);
      wctx.arcTo(x, y+h, x, y, rr);
      wctx.arcTo(x, y, x+w, y, rr);
      wctx.closePath();
      if (fill) wctx.fill();
      if (stroke) wctx.stroke();
    }
  }

  function roundRectW(x,y,w,h,r, fill, stroke){
    const rr = Math.min(r, w/2, h/2);
    wctx.beginPath();
    wctx.moveTo(x+rr, y);
    wctx.arcTo(x+w, y, x+w, y+h, rr);
    wctx.arcTo(x+w, y+h, x, y+h, rr);
    wctx.arcTo(x, y+h, x, y, rr);
    wctx.arcTo(x, y, x+w, y, rr);
    wctx.closePath();
    if (fill) wctx.fill();
    if (stroke) wctx.stroke();
  }

  // ====== Loop ======
  let last = performance.now();
  function loop(t){
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;

    if (wonder.classList.contains('hidden')){
      update(dt, t);
      draw(t);
    } else {
      drawWonderScene(false);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ====== First hint ======
  setTimeout(() => toast('Tips: SPARKA ⏰ → 🍬 → ⭐ och SITT på stolen.'), 900);
})();
