(() => {
  'use strict';

  // =========================================================
  // Jesper i rummet — Dunderversion v2 (NO D-PAD)
  // - Mobile first, joystick drag on canvas
  // - SPARKA / SITT buttons
  // - 3 props, 3 ornaments, secret combo, wonder overlay
  // =========================================================

  // ===== Countdown (7 Jan 2026 06:00 CET = 05:00 UTC) =====
  const countdownEl = document.getElementById('countdownValue');
  const TARGET_UTC_MS = Date.UTC(2026, 0, 7, 5, 0, 0);
  const pad2 = (n) => String(n).padStart(2, '0');

  function tickCountdown() {
    if (!countdownEl) return;
    const diff = TARGET_UTC_MS - Date.now();
    if (diff <= 0) { countdownEl.textContent = 'NU. ☕'; return; }
    const total = Math.floor(diff / 1000);
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    countdownEl.textContent = `${d}d ${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }
  setInterval(tickCountdown, 1000);
  tickCountdown();

  // ===== DOM =====
  const canvas = document.getElementById('game');
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
  const closeWonderBtn = document.getElementById('closeWonderBtn');

  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false });

  // Wonder canvas is optional, but preferred
  const wctx = (wonderCanvas && wonderCanvas.getContext) ? wonderCanvas.getContext('2d', { alpha: true }) : null;

  function showBubble(text, ms = 1600) {
    if (!bubbleEl) return;
    bubbleEl.textContent = text;
    bubbleEl.classList.remove('hidden');
    clearTimeout(showBubble._t);
    showBubble._t = setTimeout(() => bubbleEl.classList.add('hidden'), ms);
  }

  function toast(text, ms = 1200) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.add('hidden'), ms);
  }

  helpBtn?.addEventListener('click', () => helpModal?.classList.remove('hidden'));
  closeHelpBtn?.addEventListener('click', () => helpModal?.classList.add('hidden'));

  // ===== Audio (WebAudio) =====
  let audioEnabled = false;
  let audioCtx = null;

  function ensureAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function playGrunt(intensity = 1) {
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

  function playJingle() {
    if (!audioEnabled) return;
    ensureAudio();
    const now = audioCtx.currentTime;
    const notes = [523.25, 659.25, 783.99, 659.25, 523.25]; // C E G E C
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
    if (audioEnabled) {
      ensureAudio();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      toast('Ljud på. Jesper har… foley.', 1200);
      playGrunt(1.0);
    } else {
      toast('Ljud av. Stillhet. Nästan.', 1200);
    }
  });

  // ===== Math helpers =====
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  function aabbCircleHit(x, y, w, h, cx, cy, cr) {
    const px = clamp(cx, x, x + w);
    const py = clamp(cy, y, y + h);
    return dist(px, py, cx, cy) <= cr;
  }

  // ===== Game state =====
  const state = {
    sitting: false,
    lastAction: 0,
    dragging: null,

    // joystick in canvas pixels; converted to world in toWorld()
    joy: { active: false, startX: 0, startY: 0, dx: 0, dy: 0 },

    secret: { step: 0, unlocked: false }, // ⏰ -> 🍬 -> ⭐ -> sit

    puffs: [],
    snow: [],
    snowT: 0
  };

  // ===== World (fixed coordinate system) =====
  const WORLD = { w: 360, h: 520 };
  const ROOM  = { x: 14, y: 14, w: 332, h: 330 };

  const view = { scale: 1, ox: 0, oy: 0, cssW: 0, cssH: 0, dpr: 1 };

  // Entities (placed in placeEntities)
  const jesper = { x: 80, y: 290, vx: 0, vy: 0, r: 18, face: 1 };

  const props = {
    table: { x: 0, y: 0, w: 150, h: 56 },
    chair: { x: 0, y: 0, w: 92,  h: 92 },
    tree:  { x: 0, y: 0, w: 104, h: 156 }
  };

  const ornaments = [
    { id: 'clock', label: '⏰', base: '#fde047', x: 0, y: 0, r: 18, vx: 0, vy: 0 },
    { id: 'candy', label: '🍬', base: '#fb7185', x: 0, y: 0, r: 18, vx: 0, vy: 0 },
    { id: 'star',  label: '⭐', base: '#60a5fa', x: 0, y: 0, r: 18, vx: 0, vy: 0 }
  ];

  function placeEntities() {
    // furniture: separated, readable
    props.table.x = ROOM.x + 18;
    props.table.y = ROOM.y + ROOM.h - 118;

    props.chair.x = props.table.x + props.table.w + 20;
    props.chair.y = props.table.y + 10;

    props.tree.x  = ROOM.x + ROOM.w - props.tree.w - 16;
    props.tree.y  = ROOM.y + 26;

    // ornaments centered and not on top of tree
    const cx = ROOM.x + ROOM.w * 0.56;
    const cy = ROOM.y + ROOM.h * 0.40;
    const gap = 62;

    ornaments[0].x = cx - gap; ornaments[0].y = cy + 18; ornaments[0].vx = ornaments[0].vy = 0;
    ornaments[1].x = cx;       ornaments[1].y = cy - 10; ornaments[1].vx = ornaments[1].vy = 0;
    ornaments[2].x = cx + gap; ornaments[2].y = cy + 18; ornaments[2].vx = ornaments[2].vy = 0;

    // Jesper start: bottom-left
    jesper.x = ROOM.x + 70;
    jesper.y = ROOM.y + ROOM.h - 72;
    jesper.vx = 0; jesper.vy = 0; jesper.face = 1;
  }

  // ===== Resize =====
  function resizeAll() {
    const rect = canvas.getBoundingClientRect();
    view.cssW = rect.width;
    view.cssH = rect.height;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.max(2, Math.round(view.cssW * view.dpr));
    canvas.height = Math.max(2, Math.round(view.cssH * view.dpr));
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);

    // fit world inside canvas
    view.scale = Math.min(view.cssW / WORLD.w, view.cssH / WORLD.h);
    view.ox = (view.cssW - WORLD.w * view.scale) / 2;
    view.oy = (view.cssH - WORLD.h * view.scale) / 2;

    if (wonderCanvas && wctx) {
      const W = window.innerWidth;
      const H = window.innerHeight;
      wonderCanvas.width  = Math.max(2, Math.round(W * view.dpr));
      wonderCanvas.height = Math.max(2, Math.round(H * view.dpr));
      wctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    }

    // place after resize to keep proportions consistent
    placeEntities();
  }

  function maybeResizeFromSafariUI() {
    const rect = canvas.getBoundingClientRect();
    if (Math.abs(rect.width - view.cssW) > 0.5 || Math.abs(rect.height - view.cssH) > 0.5) {
      resizeAll();
    }
  }

  window.addEventListener('resize', resizeAll);
  resizeAll();

  // ===== Coordinate conversion =====
  function toWorld(px, py) {
    return {
      x: (px - view.ox) / view.scale,
      y: (py - view.oy) / view.scale
    };
  }

  // ===== Pointer input: drag ornaments OR joystick =====
  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = pointerPos(e);
    const w = toWorld(p.x, p.y);

    // hit ornaments
    const hit = ornaments.find(o => dist(o.x, o.y, w.x, w.y) <= o.r + 10);
    if (hit) {
      state.dragging = hit;
      hit.vx = 0; hit.vy = 0;
      canvas.setPointerCapture(e.pointerId);
      toast('Flyttar pynt.', 900);
      playGrunt(0.75);
      return;
    }

    // joystick
    state.joy.active = true;
    state.joy.startX = w.x;
    state.joy.startY = w.y;
    state.joy.dx = 0;
    state.joy.dy = 0;
    canvas.setPointerCapture(e.pointerId);
  }, { passive: false });

  canvas.addEventListener('pointermove', (e) => {
    e.preventDefault();
    const p = pointerPos(e);
    const w = toWorld(p.x, p.y);

    if (state.dragging) {
      const o = state.dragging;
      o.x = clamp(w.x, ROOM.x + o.r, ROOM.x + ROOM.w - o.r);
      o.y = clamp(w.y, ROOM.y + o.r, ROOM.y + ROOM.h - o.r);
      return;
    }

    if (state.joy.active) {
      const max = 46;
      state.joy.dx = clamp(w.x - state.joy.startX, -max, max);
      state.joy.dy = clamp(w.y - state.joy.startY, -max, max);
    }
  }, { passive: false });

  function endPointer() {
    state.dragging = null;
    state.joy.active = false;
    state.joy.dx = 0; state.joy.dy = 0;
  }
  canvas.addEventListener('pointerup', endPointer, { passive: false });
  canvas.addEventListener('pointercancel', endPointer, { passive: false });

  // ===== Actions =====
  kickBtn?.addEventListener('click', () => doKick());
  sitBtn?.addEventListener('click', () => doSit());

  function advanceSecret(expectedId) {
    if (state.secret.unlocked) return;
    const stepId =
      state.secret.step === 0 ? 'clock' :
      state.secret.step === 1 ? 'candy' :
      state.secret.step === 2 ? 'star'  : null;

    if (expectedId === stepId) {
      state.secret.step++;
      toast(`Hemligheten: ${state.secret.step}/3`, 1000);
      playGrunt(1.0);
      if (state.secret.step === 3) showBubble('SITT på stolen. Nu.', 1400);
      return;
    }
    state.secret.step = 0;
    toast('Nej. Hemligheten blev sur.', 1200);
    playGrunt(0.8);
  }

  function unlockWonder() {
    if (state.secret.unlocked) return;
    state.secret.unlocked = true;
    playJingle();
    showBubble('…okej. Respekt.', 1400);
    wonder?.classList.remove('hidden');
  }

  closeWonderBtn?.addEventListener('click', () => {
    wonder?.classList.add('hidden');
    showBubble('Tillbaka i rummet. Som vanligt.', 1400);
  });

  function addPuff(x, y, strength = 1) {
    state.puffs.push({
      x, y,
      r: 6 + Math.random() * 7 * strength,
      a: 1.0,
      vx: (Math.random() * 2 - 1) * 22 * strength,
      vy: (Math.random() * 2 - 1) * 22 * strength
    });
    if (state.puffs.length > 30) state.puffs.splice(0, state.puffs.length - 30);
  }

  function doKick() {
    const now = performance.now();
    if (now - state.lastAction < 120) return;
    state.lastAction = now;

    const reach = 78;
    let best = null;
    let bestD = 1e9;
    for (const o of ornaments) {
      const d = dist(jesper.x, jesper.y, o.x, o.y);
      if (d < reach && d < bestD) { best = o; bestD = d; }
    }

    if (!best) {
      showBubble('Sparkade luft. Känns korrekt.', 1400);
      playGrunt(0.65);
      return;
    }

    const dx = best.x - jesper.x;
    const dy = best.y - jesper.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / len, ny = dy / len;

    const impulse = 520 + Math.random() * 140;
    best.vx += nx * impulse;
    best.vy += ny * impulse;

    addPuff(best.x - nx * 14, best.y - ny * 14, 1.0);

    showBubble(`👞 SPARK! (${best.label})`, 950);
    playGrunt(1.0);
    advanceSecret(best.id);
  }

  function doSit() {
    const c = props.chair;
    const inRange = aabbCircleHit(c.x, c.y, c.w, c.h, jesper.x, jesper.y, jesper.r + 12);

    if (!inRange) {
      showBubble('Satt mentalt. Inte fysiskt.', 1400);
      playGrunt(0.6);
      return;
    }

    state.sitting = true;
    showBubble('🪑 …existens… kaffe… jul…', 1350);
    playGrunt(0.8);

    if (state.secret.step === 3 && !state.secret.unlocked) {
      toast('Kombination fullbordad!', 1200);
      unlockWonder();
    } else if (!state.secret.unlocked) {
      toast('Du satt. Hemligheten: skeptisk.', 1200);
    }

    setTimeout(() => { state.sitting = false; }, 850);
  }

  // ===== Light commentary =====
  const lines = [
    'Rummet är… minimalistiskt.',
    'Jag är en legend i ett tomt rum.',
    'Vem godkände den här granen?',
    '⏰ känns… hotfull.',
    'Jag vill ha kaffe.'
  ];
  setInterval(() => {
    if (wonder && !wonder.classList.contains('hidden')) return;
    if (Math.random() < 0.24) {
      showBubble(lines[(Math.random() * lines.length) | 0], 1500);
      playGrunt(0.45);
    }
  }, 4200);

  // ===== Physics =====
  function resolveWallCircle(o) {
    if (o.x - o.r < ROOM.x) { o.x = ROOM.x + o.r; o.vx *= -0.55; }
    if (o.x + o.r > ROOM.x + ROOM.w) { o.x = ROOM.x + ROOM.w - o.r; o.vx *= -0.55; }
    if (o.y - o.r < ROOM.y) { o.y = ROOM.y + o.r; o.vy *= -0.55; }
    if (o.y + o.r > ROOM.y + ROOM.h) { o.y = ROOM.y + ROOM.h - o.r; o.vy *= -0.55; }
  }

  function resolveRectBlockCircle(o, rect) {
    if (!aabbCircleHit(rect.x, rect.y, rect.w, rect.h, o.x, o.y, o.r)) return;

    const cx = clamp(o.x, rect.x, rect.x + rect.w);
    const cy = clamp(o.y, rect.y, rect.y + rect.h);
    const dx = o.x - cx, dy = o.y - cy;
    const len = Math.max(1e-6, Math.hypot(dx, dy));
    const nx = dx / len, ny = dy / len;

    o.x = cx + nx * (o.r + 0.6);
    o.y = cy + ny * (o.r + 0.6);

    const dot = o.vx * nx + o.vy * ny;
    o.vx -= 1.35 * dot * nx;
    o.vy -= 1.35 * dot * ny;
    o.vx *= 0.82; o.vy *= 0.82;
  }

  // ===== Drawing primitives =====
  function roundRect(x, y, w, h, r, fill, stroke) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // ===== Draw: Furniture =====
  function drawTable(t) {
    // tabletop
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    roundRect(t.x, t.y, t.w, t.h, 14, true, true);

    // subtle inset
    ctx.strokeStyle = 'rgba(17,24,39,0.18)';
    ctx.lineWidth = 2;
    roundRect(t.x + 8, t.y + 8, t.w - 16, t.h - 16, 12, false, true);

    // legs
    ctx.fillStyle = '#e5e7eb';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    roundRect(t.x + 18, t.y + t.h - 2, 14, 38, 8, true, true);
    roundRect(t.x + t.w - 32, t.y + t.h - 2, 14, 38, 8, true, true);

    // coffee mug (tacky)
    ctx.fillStyle = '#dbeafe';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    roundRect(t.x + t.w - 46, t.y + 12, 18, 16, 6, true, true);
    ctx.beginPath();
    ctx.arc(t.x + t.w - 24, t.y + 20, 6, -0.5, 0.5);
    ctx.stroke();
  }

  function drawChair(c) {
    // seat
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    roundRect(c.x, c.y + 34, c.w, c.h - 34, 14, true, true);

    // backrest (bigger and clear)
    roundRect(c.x + 10, c.y, c.w - 20, 46, 14, true, true);

    // small bolts (silly detail)
    ctx.fillStyle = 'rgba(17,24,39,0.25)';
    ctx.beginPath();
    ctx.arc(c.x + 18, c.y + 52, 2.2, 0, Math.PI * 2);
    ctx.arc(c.x + c.w - 18, c.y + 52, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // label bubble
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    roundRect(c.x + 24, c.y - 18, 48, 22, 10, true, true);
    ctx.fillStyle = 'rgba(17,24,39,0.8)';
    ctx.font = '900 10px ui-monospace, monospace';
    ctx.fillText('STOL', c.x + 35, c.y - 3);
  }

  function drawTree(tr, tMs) {
    ctx.save();

    // glow halo
    const pulse = 0.75 + 0.25 * Math.sin(tMs / 240);
    ctx.globalAlpha = 0.18 * pulse;
    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.ellipse(tr.x + tr.w / 2, tr.y + tr.h * 0.55, 56, 74, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // trunk
    ctx.fillStyle = '#d1d5db';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    roundRect(tr.x + tr.w * 0.43, tr.y + tr.h * 0.78, tr.w * 0.14, tr.h * 0.20, 8, true, true);

    // triangles
    const tri = (ax, ay, bx, by, cx, cy) => {
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.lineTo(cx, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };

    ctx.fillStyle = '#dcfce7';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;

    tri(tr.x + tr.w / 2, tr.y + 10, tr.x + 10, tr.y + tr.h * 0.52, tr.x + tr.w - 10, tr.y + tr.h * 0.52);
    tri(tr.x + tr.w / 2, tr.y + tr.h * 0.22, tr.x + 8, tr.y + tr.h * 0.76, tr.x + tr.w - 8, tr.y + tr.h * 0.76);

    // topper star + baubles
    ctx.font = '22px ' + getComputedStyle(document.body).fontFamily;
    ctx.fillText('⭐', tr.x + tr.w / 2 - 10, tr.y + 24);

    ctx.font = '18px ' + getComputedStyle(document.body).fontFamily;
    ctx.fillText('🔴', tr.x + 16, tr.y + 64);
    ctx.fillText('🔴', tr.x + tr.w - 30, tr.y + 78);
    ctx.fillText('🔴', tr.x + tr.w / 2 - 8, tr.y + 104);

    ctx.restore();
  }

  function drawOrnament(o) {
    // base disc
    ctx.beginPath();
    ctx.fillStyle = o.base;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // little shine
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(o.x - 6, o.y - 6, o.r * 0.35, Math.PI * 1.1, Math.PI * 1.7);
    ctx.stroke();

    // emoji
    ctx.font = '24px ' + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#111827';
    ctx.fillText(o.label, o.x, o.y + 1);
  }

  // ===== Jesper drawing (clearer character) =====
  function drawJesper(tMs) {
    const moving = Math.abs(jesper.vx) + Math.abs(jesper.vy) > 1;
    const walk = moving ? Math.sin(tMs / 90) : 0;
    const idle = moving ? 0 : Math.sin(tMs / 420);
    const sit = state.sitting ? 1 : 0;
    const bob = (sit ? 0.2 : 1) * (moving ? walk * 2.2 : idle * 1.0);

    const x = jesper.x;
    const y = jesper.y + bob;
    const face = jesper.face || 1;

    const skin  = 'rgba(255,235,190,1.0)';
    const hair  = 'rgba(148,72,34,0.95)';
    const hairH = 'rgba(198,108,58,0.78)';
    const hood  = 'rgba(17,24,39,1.0)';
    const pants = 'rgba(156,163,175,1.0)';
    const shoe  = 'rgba(120,74,36,1.0)';

    // shadow
    ctx.beginPath();
    ctx.fillStyle = 'rgba(17,24,39,0.18)';
    ctx.ellipse(x, y + 32, 22, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(face, 1);

    // motion lines
    if (moving) {
      ctx.strokeStyle = 'rgba(17,24,39,0.20)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-30, 10); ctx.lineTo(-44, 6);
      ctx.moveTo(-30, 18); ctx.lineTo(-46, 18);
      ctx.stroke();
    }

    // legs
    const legSwing = sit ? 0 : walk * 10;
    const knee = sit ? 9 : 0;
    drawLeg(-9, 18, -12 + legSwing, 36 - knee);
    drawLeg( 9, 18,  12 - legSwing, 36 - knee);

    // hoodie body
    ctx.fillStyle = hood;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    roundRect(-20, -6, 40, 38, 12, true, true);

    // pocket
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    roundRect(-14, 14, 28, 12, 8, true, false);

    // hood behind head
    ctx.fillStyle = hood;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -26, 22, Math.PI * 0.05, Math.PI * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // arms
    const armSwing = sit ? 0 : walk * 8;
    drawArm(-20, 8, -34, 18 - armSwing);
    drawArm( 20, 8,  34, 18 + armSwing);

    // head
    ctx.beginPath();
    ctx.fillStyle = skin;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    ctx.arc(0, -26, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // curly hair cap + curls
    ctx.beginPath();
    ctx.fillStyle = hair;
    ctx.arc(0, -36, 17, Math.PI, 0);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = hairH;
    ctx.lineWidth = 2.2;
    for (let i = -12; i <= 12; i += 6) {
      ctx.beginPath();
      ctx.arc(i, -42, 3.6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // tortoiseshell glasses
    const gg = ctx.createLinearGradient(-18, -34, 18, -18);
    gg.addColorStop(0.00, 'rgba(20,20,20,0.95)');
    gg.addColorStop(0.35, 'rgba(120,74,36,0.95)');
    gg.addColorStop(0.70, 'rgba(210,190,150,0.95)');
    gg.addColorStop(1.00, 'rgba(20,20,20,0.95)');

    ctx.strokeStyle = gg;
    ctx.lineWidth = 3.8;
    circleStroke(-7, -28, 7.0);
    circleStroke( 7, -28, 7.0);

    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.moveTo(-1.6, -28);
    ctx.lineTo( 1.6, -28);
    ctx.stroke();

    // eyes
    ctx.fillStyle = '#111827';
    circleFill(-5, -28, 2.2);
    circleFill( 5, -28, 2.2);

    // mouth
    ctx.strokeStyle = 'rgba(17,24,39,0.85)';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    if (sit) { ctx.moveTo(-4, -18); ctx.lineTo(4, -18); }
    else { ctx.arc(0, -18, 4, 0.12 * Math.PI, 0.88 * Math.PI); }
    ctx.stroke();

    // label
    ctx.font = '900 12px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(17,24,39,0.55)';
    ctx.textAlign = 'center';
    ctx.fillText('JESPER', 0, -56);

    ctx.restore();

    function drawLeg(hipX, hipY, footX, footY) {
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
      roundRect(footX - 13, footY - 7, 26, 14, 7, true, true);

      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(footX - 10, footY + 4);
      ctx.lineTo(footX + 10, footY + 4);
      ctx.stroke();
    }

    function drawArm(x1, y1, x2, y2) {
      ctx.beginPath();
      ctx.strokeStyle = hood;
      ctx.lineWidth = 11;
      ctx.lineCap = 'round';
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,235,190,0.8)';
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2;
      ctx.arc(x2, y2, 4.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    function circleStroke(cx, cy, r) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    function circleFill(cx, cy, r) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawJoystick() {
    const bx = state.joy.startX;
    const by = state.joy.startY;
    const kx = bx + state.joy.dx;
    const ky = by + state.joy.dy;

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(17,24,39,0.07)';
    ctx.strokeStyle = 'rgba(17,24,39,0.35)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(bx, by, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    ctx.fillStyle = 'rgba(37,99,235,0.18)';
    ctx.strokeStyle = 'rgba(17,24,39,0.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(kx, ky, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ===== Wonder (pretty winter card) =====
  function ensureSnowParticles() {
    if (state.snow.length) return;
    for (let i = 0; i < 140; i++) {
      state.snow.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: 0.8 + Math.random() * 2.2,
        s: 18 + Math.random() * 80,
        a: 0.25 + Math.random() * 0.70
      });
    }
  }

  function drawWonderScene() {
    if (!wctx || !wonderCanvas) return;
    ensureSnowParticles();

    const W = window.innerWidth;
    const H = window.innerHeight;

    // gradient sky
    const g = wctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1026');
    g.addColorStop(1, '#1d4ed8');
    wctx.fillStyle = g;
    wctx.fillRect(0, 0, W, H);

    // moon
    wctx.globalAlpha = 0.95;
    wctx.fillStyle = 'rgba(255,255,255,0.92)';
    wctx.beginPath();
    wctx.arc(W * 0.78, H * 0.22, 42, 0, Math.PI * 2);
    wctx.fill();

    wctx.globalAlpha = 0.18;
    wctx.beginPath();
    wctx.arc(W * 0.78, H * 0.22, 88, 0, Math.PI * 2);
    wctx.fill();

    // snow hills
    wctx.globalAlpha = 1;
    wctx.fillStyle = 'rgba(255,255,255,0.10)';
    wctx.beginPath();
    wctx.moveTo(0, H * 0.78);
    wctx.quadraticCurveTo(W * 0.35, H * 0.70, W * 0.60, H * 0.80);
    wctx.quadraticCurveTo(W * 0.82, H * 0.88, W, H * 0.78);
    wctx.lineTo(W, H);
    wctx.lineTo(0, H);
    wctx.closePath();
    wctx.fill();

    wctx.fillStyle = 'rgba(255,255,255,0.18)';
    wctx.beginPath();
    wctx.moveTo(0, H * 0.86);
    wctx.quadraticCurveTo(W * 0.45, H * 0.78, W, H * 0.88);
    wctx.lineTo(W, H);
    wctx.lineTo(0, H);
    wctx.closePath();
    wctx.fill();

    // cozy cabin
    const cx = W * 0.18, cy = H * 0.62;
    wctx.fillStyle = 'rgba(255,255,255,0.09)';
    wctx.fillRect(cx, cy, 170, 110);

    wctx.fillStyle = 'rgba(11,16,38,0.85)';
    wctx.beginPath();
    wctx.moveTo(cx - 14, cy + 14);
    wctx.lineTo(cx + 85, cy - 52);
    wctx.lineTo(cx + 184, cy + 14);
    wctx.closePath();
    wctx.fill();

    // window light
    wctx.fillStyle = 'rgba(255,220,120,0.95)';
    wctx.fillRect(cx + 104, cy + 44, 38, 30);
    wctx.globalAlpha = 0.30;
    wctx.beginPath();
    wctx.ellipse(cx + 123, cy + 70, 66, 44, 0, 0, Math.PI * 2);
    wctx.fill();
    wctx.globalAlpha = 1;

    // pine silhouettes
    function pine(x, y, h) {
      wctx.save();
      wctx.translate(x, y);
      wctx.fillStyle = 'rgba(220,252,231,0.22)';
      wctx.beginPath();
      wctx.moveTo(0, -h);
      wctx.lineTo(-h * 0.55, -h * 0.10);
      wctx.lineTo(h * 0.55, -h * 0.10);
      wctx.closePath();
      wctx.fill();
      wctx.restore();
    }
    pine(W * 0.60, H * 0.72, 150);
    pine(W * 0.70, H * 0.77, 190);
    pine(W * 0.50, H * 0.80, 130);

    // snow particles
    state.snowT += 1 / 60;
    for (const p of state.snow) {
      p.y += p.s / 60;
      p.x += Math.sin((p.y + state.snowT * 50) / 40) * 0.4;
      if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
      wctx.globalAlpha = p.a;
      wctx.fillStyle = '#ffffff';
      wctx.beginPath();
      wctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      wctx.fill();
    }
    wctx.globalAlpha = 1;

    // headline (kept short)
    wctx.fillStyle = 'rgba(255,255,255,0.95)';
    wctx.font = '1000 26px ui-rounded, system-ui, -apple-system, sans-serif';
    wctx.textAlign = 'center';
    wctx.fillText('GOD JUL, JESPER', W * 0.5, H * 0.12);

    wctx.fillStyle = 'rgba(255,255,255,0.86)';
    wctx.font = '900 14px ui-monospace, monospace';
    wctx.fillText('The Return of the Office Legend', W * 0.5, H * 0.15);
  }

  // ===== Game update/draw =====
  function update(dt, tMs) {
    maybeResizeFromSafariUI();

    // joystick -> movement
    let ax = 0, ay = 0;
    if (state.joy.active) {
      const jx = state.joy.dx / 46;
      const jy = state.joy.dy / 46;
      if (Math.abs(jx) > 0.12) ax = jx;
      if (Math.abs(jy) > 0.12) ay = jy;
    }

    // normalize
    const mag = Math.hypot(ax, ay);
    if (mag > 1) { ax /= mag; ay /= mag; }

    const speed = state.sitting ? 0 : 230;
    jesper.vx = ax * speed;
    jesper.vy = ay * speed;

    if (Math.abs(jesper.vx) > 1) jesper.face = Math.sign(jesper.vx);

    const oldX = jesper.x, oldY = jesper.y;
    jesper.x += jesper.vx * dt;
    jesper.y += jesper.vy * dt;

    // clamp to room
    jesper.x = clamp(jesper.x, ROOM.x + jesper.r, ROOM.x + ROOM.w - jesper.r);
    jesper.y = clamp(jesper.y, ROOM.y + jesper.r, ROOM.y + ROOM.h - jesper.r);

    // motion puffs
    const moved = dist(oldX, oldY, jesper.x, jesper.y);
    if (!state.sitting && moved > 0.5 && Math.random() < 0.40) {
      addPuff(jesper.x - jesper.face * 10, jesper.y + 20, 0.45);
    }

    // ornaments physics
    const friction = Math.pow(0.10, dt);
    const blocks = [props.table, props.chair, props.tree];

    for (const o of ornaments) {
      if (state.dragging === o) continue;

      o.x += o.vx * dt;
      o.y += o.vy * dt;

      o.vx *= friction;
      o.vy *= friction;
      if (Math.abs(o.vx) < 2) o.vx = 0;
      if (Math.abs(o.vy) < 2) o.vy = 0;

      resolveWallCircle(o);
      for (const b of blocks) resolveRectBlockCircle(o, b);

      // collide with Jesper
      const d = dist(o.x, o.y, jesper.x, jesper.y);
      const minD = o.r + jesper.r;
      if (d < minD) {
        const nx = (o.x - jesper.x) / Math.max(d, 1);
        const ny = (o.y - jesper.y) / Math.max(d, 1);
        const push = (minD - d) * 1.05;
        o.x += nx * push; o.y += ny * push;
        o.vx += nx * 140; o.vy += ny * 140;
      }
    }

    // puffs update
    for (const p of state.puffs) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.a -= 1.8 * dt;
    }
    state.puffs = state.puffs.filter(p => p.a > 0);

    // if wonder open, animate wonder canvas too
    if (wonder && !wonder.classList.contains('hidden')) {
      drawWonderScene();
    }
  }

  function draw(tMs) {
    // clear (CSS pixel coordinates)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, view.cssW, view.cssH);

    // draw world
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);

    // room background
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(ROOM.x, ROOM.y, ROOM.w, ROOM.h);

    // border
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    ctx.strokeRect(ROOM.x, ROOM.y, ROOM.w, ROOM.h);

    // baseboard for depth
    ctx.strokeStyle = 'rgba(17,24,39,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ROOM.x, ROOM.y + ROOM.h - 26);
    ctx.lineTo(ROOM.x + ROOM.w, ROOM.y + ROOM.h - 26);
    ctx.stroke();

    // label
    ctx.fillStyle = 'rgba(17,24,39,0.25)';
    ctx.font = '900 12px ui-monospace, monospace';
    ctx.fillText('RUM 01 – EXISTENS / JUL / KAFFE', ROOM.x + 10, ROOM.y + ROOM.h - 10);

    // puffs behind furniture
    for (const p of state.puffs) {
      ctx.globalAlpha = Math.max(0, p.a) * 0.30;
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // furniture
    drawTree(props.tree, tMs);
    drawTable(props.table);
    drawChair(props.chair);

    // ornaments (depth)
    ornaments.slice().sort((a, b) => a.y - b.y).forEach(drawOrnament);

    // Jesper on top
    drawJesper(tMs);

    // joystick overlay
    if (state.joy.active && !state.dragging) drawJoystick();

    ctx.restore();
  }

  // ===== Loop =====
  let last = performance.now();
  function loop(t) {
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;

    if (wonder && !wonder.classList.contains('hidden')) {
      // still animate wonder, but keep room frozen behind overlay
      drawWonderScene();
    } else {
      update(dt, t);
      draw(t);
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // First hint
  setTimeout(() => toast('Tips: SPARKA ⏰ → 🍬 → ⭐ och SITT på stolen.'), 900);

})();
