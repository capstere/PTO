(() => {
  // =========================
  // Countdown (Stockholm/CET)
  // 7 Jan 2026 06:00 CET = 05:00 UTC
  // =========================
  const countdownEl = document.getElementById("countdownValue");
  const TARGET_UTC_MS = Date.UTC(2026, 0, 7, 5, 0, 0);

  function pad2(n) { return String(n).padStart(2, "0"); }
  function tickCountdown() {
    const now = Date.now();
    let diff = TARGET_UTC_MS - now;
    if (diff <= 0) { countdownEl.textContent = "NU. ☕"; return; }
    const total = Math.floor(diff / 1000);
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    countdownEl.textContent = `${d}d ${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }
  setInterval(tickCountdown, 1000);
  tickCountdown();

  // =========================
  // DOM
  // =========================
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });

  const bubbleEl = document.getElementById("bubble");
  const toastEl  = document.getElementById("hintToast");

  const helpBtn = document.getElementById("helpBtn");
  const helpModal = document.getElementById("helpModal");
  const closeHelpBtn = document.getElementById("closeHelpBtn");

  const soundBtn = document.getElementById("soundBtn");
  const wonder = document.getElementById("wonder");
  const closeWonderBtn = document.getElementById("closeWonderBtn");

  const kickBtn = document.getElementById("kickBtn");
  const interactBtn = document.getElementById("interactBtn");

  function showBubble(text, ms = 1600) {
    bubbleEl.textContent = text;
    bubbleEl.classList.remove("hidden");
    clearTimeout(showBubble._t);
    showBubble._t = setTimeout(() => bubbleEl.classList.add("hidden"), ms);
  }
  function toast(text, ms = 1200) {
    toastEl.textContent = text;
    toastEl.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.add("hidden"), ms);
  }

  helpBtn?.addEventListener("click", () => helpModal?.classList.remove("hidden"));
  closeHelpBtn?.addEventListener("click", () => helpModal?.classList.add("hidden"));

  // =========================
  // Audio (WebAudio)
  // =========================
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

    const o1 = audioCtx.createOscillator();
    const o2 = audioCtx.createOscillator();
    const g  = audioCtx.createGain();
    const f  = audioCtx.createBiquadFilter();

    f.type = "bandpass";
    f.frequency.value = 340 + Math.random() * 420;
    f.Q.value = 1.0 + Math.random() * 2.0;

    o1.type = Math.random() < 0.5 ? "sawtooth" : "square";
    o2.type = "sine";

    const base = 120 + Math.random() * 80;
    o1.frequency.setValueAtTime(base * (1.0 + 0.35 * intensity), now);
    o1.frequency.exponentialRampToValueAtTime(base * 0.65, now + 0.16);
    o2.frequency.setValueAtTime(base * 2.0, now);
    o2.frequency.exponentialRampToValueAtTime(base * 1.2, now + 0.16);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.12 * intensity, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.20);

    o1.connect(f); o2.connect(f);
    f.connect(g);
    g.connect(audioCtx.destination);

    o1.start(now); o2.start(now);
    o1.stop(now + 0.22); o2.stop(now + 0.22);
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
      o.type = "triangle";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + 0.12);
    });
  }

  soundBtn?.addEventListener("click", async () => {
    audioEnabled = !audioEnabled;
    soundBtn.textContent = audioEnabled ? "🔊 Ljud: PÅ" : "🔊 Ljud: AV";
    if (audioEnabled) {
      ensureAudio();
      if (audioCtx.state === "suspended") await audioCtx.resume();
      toast("Ljud på. Jesper låter… exakt så här.");
      playGrunt(1.1);
    } else {
      toast("Ljud av. Stillhet. (för en gångs skull)");
    }
  });

  // =========================
  // Fixed world (stable layout)
  // =========================
  const WORLD = { w: 360, h: 520 };
  const ROOM  = { x: 14, y: 14, w: 332, h: 330 }; // tydlig, rymlig “låda”

  let view = { scale: 1, ox: 0, oy: 0, cssW: 0, cssH: 0 };

  function resizeCanvasToCSS() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    view.cssW = rect.width;
    view.cssH = rect.height;

    // fit world inside canvas
    const s = Math.min(rect.width / WORLD.w, rect.height / WORLD.h);
    view.scale = s;
    view.ox = (rect.width - WORLD.w * s) / 2;
    view.oy = (rect.height - WORLD.h * s) / 2;
  }
  window.addEventListener("resize", () => { resizeCanvasToCSS(); placeProps(); });
  resizeCanvasToCSS();

  function toWorld(px, py) {
    return {
      x: (px - view.ox) / view.scale,
      y: (py - view.oy) / view.scale
    };
  }

  // =========================
  // State
  // =========================
  const state = {
    keys: { up:false, down:false, left:false, right:false },
    sitting: false,
    lastAction: 0,
    joy: { active:false, startX:0, startY:0, dx:0, dy:0 }, // world units
    secret: { step: 0, unlocked: false }, // ⏰ -> 🍬 -> ⭐ -> sit
    puffs: [] // små “rörelse-puffs”
  };

  // =========================
  // Entities
  // =========================
  const jesper = { x: 92, y: 290, r: 18, vx: 0, vy: 0, face: 1 };

  const props = {
    table: { x: 0, y: 0, w: 150, h: 56 },
    chair: { x: 0, y: 0, w: 90,  h: 90 },
    tree:  { x: 0, y: 0, w: 100, h: 150 }
  };

  const ornaments = [
    { id:"clock", label:"⏰", name:"klocka",  x:0,y:0,r:18,vx:0,vy:0, base:"#fde047" },
    { id:"candy", label:"🍬", name:"godis",   x:0,y:0,r:18,vx:0,vy:0, base:"#fb7185" },
    { id:"star",  label:"⭐", name:"stjärna", x:0,y:0,r:18,vx:0,vy:0, base:"#60a5fa" }
  ];

  function placeProps() {
    // furniture (tydligt separerade)
    props.table.x = ROOM.x + 20;
    props.table.y = ROOM.y + ROOM.h - 120;

    props.chair.x = props.table.x + props.table.w + 22;
    props.chair.y = props.table.y + 10;

    props.tree.x = ROOM.x + ROOM.w - props.tree.w - 16;
    props.tree.y = ROOM.y + 30;

    // ornaments i “mitten”, inte uppe i granen
    const cx = ROOM.x + ROOM.w * 0.58;
    const cy = ROOM.y + ROOM.h * 0.40;

    ornaments[0].x = cx - 62; ornaments[0].y = cy + 10; ornaments[0].vx=0; ornaments[0].vy=0;
    ornaments[1].x = cx +  4; ornaments[1].y = cy - 16; ornaments[1].vx=0; ornaments[1].vy=0;
    ornaments[2].x = cx + 62; ornaments[2].y = cy + 12; ornaments[2].vx=0; ornaments[2].vy=0;

    // Jesper start: nedre vänster-ish (aldrig i granen)
    jesper.x = ROOM.x + 70;
    jesper.y = ROOM.y + ROOM.h - 70;
    jesper.vx = 0; jesper.vy = 0;
    jesper.face = 1;
  }
  placeProps();

  // =========================
  // D-pad input
  // =========================
  document.querySelectorAll(".pad").forEach(btn => {
    const k = btn.dataset.key;
    const isDir = (k === "up" || k === "down" || k === "left" || k === "right");
    const down = (e) => { e.preventDefault(); if (isDir) state.keys[k] = true; };
    const up   = (e) => { e.preventDefault(); if (isDir) state.keys[k] = false; };

    btn.addEventListener("touchstart", down, { passive:false });
    btn.addEventListener("touchend", up, { passive:false });
    btn.addEventListener("mousedown", down);
    btn.addEventListener("mouseup", up);
    btn.addEventListener("mouseleave", up);
  });

  kickBtn?.addEventListener("click", () => doKick());
  interactBtn?.addEventListener("click", () => doSit());

  // =========================
  // Pointer: drag ornaments OR joystick
  // =========================
  let dragging = null;

  function getPointerPos(e){
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const p = getPointerPos(e);
    const w = toWorld(p.x, p.y);

    const hit = ornaments.find(o => dist(o.x, o.y, w.x, w.y) <= o.r + 10);
    if (hit) {
      dragging = hit;
      hit.vx = 0; hit.vy = 0;
      canvas.setPointerCapture(e.pointerId);
      toast("Flyttar pynt.");
      playGrunt(0.75);
      return;
    }

    state.joy.active = true;
    state.joy.startX = w.x;
    state.joy.startY = w.y;
    state.joy.dx = 0;
    state.joy.dy = 0;
    canvas.setPointerCapture(e.pointerId);
  }, { passive:false });

  canvas.addEventListener("pointermove", (e) => {
    e.preventDefault();
    const p = getPointerPos(e);
    const w = toWorld(p.x, p.y);

    if (dragging) {
      dragging.x = clamp(w.x, ROOM.x + dragging.r, ROOM.x + ROOM.w - dragging.r);
      dragging.y = clamp(w.y, ROOM.y + dragging.r, ROOM.y + ROOM.h - dragging.r);
      return;
    }

    if (state.joy.active) {
      const max = 46;
      state.joy.dx = clamp(w.x - state.joy.startX, -max, max);
      state.joy.dy = clamp(w.y - state.joy.startY, -max, max);
    }
  }, { passive:false });

  function endPointer() {
    dragging = null;
    state.joy.active = false;
    state.joy.dx = 0; state.joy.dy = 0;
  }
  canvas.addEventListener("pointerup", endPointer, { passive:false });
  canvas.addEventListener("pointercancel", endPointer, { passive:false });

  // =========================
  // Secret / Wonder
  // =========================
  function advanceSecret(expectedId) {
    if (state.secret.unlocked) return;

    const stepId =
      state.secret.step === 0 ? "clock" :
      state.secret.step === 1 ? "candy" :
      state.secret.step === 2 ? "star"  : null;

    if (expectedId === stepId) {
      state.secret.step++;
      toast(`Hemligheten: ${state.secret.step}/3`);
      playGrunt(1.0);
      if (state.secret.step === 3) showBubble("SITT på stolen. Nu.");
      return;
    }

    state.secret.step = 0;
    toast("Nej. Hemligheten blev sur.");
    playGrunt(0.8);
  }

  function unlockWonder() {
    if (state.secret.unlocked) return;
    state.secret.unlocked = true;
    playJingle();
    showBubble("…okej. Respekt.", 1400);
    wonder.classList.remove("hidden");
  }

  closeWonderBtn?.addEventListener("click", () => {
    wonder.classList.add("hidden");
    showBubble("Tillbaka i rummet. Som vanligt.");
  });

  // =========================
  // Actions
  // =========================
  function doKick() {
    const now = performance.now();
    if (now - state.lastAction < 120) return;
    state.lastAction = now;

    const reach = 76;
    const nearest = ornaments
      .map(o => ({ o, d: dist(jesper.x, jesper.y, o.x, o.y) }))
      .filter(x => x.d <= reach)
      .sort((a,b)=>a.d-b.d)[0];

    if (!nearest) {
      showBubble("Sparkade luft. Känns korrekt.");
      playGrunt(0.7);
      return;
    }

    const o = nearest.o;
    const dx = o.x - jesper.x;
    const dy = o.y - jesper.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / len;
    const ny = dy / len;

    const impulse = 480 + Math.random() * 140; // world px/s
    o.vx += nx * impulse;
    o.vy += ny * impulse;

    // tydlig “spark-puff”
    addPuff(o.x - nx * 14, o.y - ny * 14, 1.0);

    showBubble(`👞 SPARK! (${o.label})`, 950);
    playGrunt(1.0);
    advanceSecret(o.id);
  }

  function doSit() {
    const c = props.chair;
    const inRange = aabbCircleHit(c.x, c.y, c.w, c.h, jesper.x, jesper.y, jesper.r + 12);

    if (!inRange) {
      showBubble("Satt mentalt. Inte fysiskt.");
      playGrunt(0.65);
      return;
    }

    state.sitting = true;
    showBubble("🪑 …existens… kaffe… jul…", 1350);
    playGrunt(0.8);

    if (state.secret.step === 3 && !state.secret.unlocked) {
      toast("Kombination fullbordad!");
      unlockWonder();
    } else if (!state.secret.unlocked) {
      toast("Du satt. Hemligheten: skeptisk.");
    }

    setTimeout(() => state.sitting = false, 850);
  }

  // =========================
  // Light commentary (low frequency)
  // =========================
  const lines = [
    "Rummet är… minimalistiskt.",
    "Jag är en legend i ett tomt rum.",
    "Vem godkände den här granen?",
    "⏰ känns... hotfull.",
    "Jag vill ha kaffe."
  ];
  setInterval(() => {
    if (!wonder.classList.contains("hidden")) return;
    if (Math.random() < 0.28) {
      showBubble(lines[(Math.random()*lines.length)|0]);
      playGrunt(0.55);
    }
  }, 4200);

  // =========================
  // Physics helpers
  // =========================
  function dist(ax, ay, bx, by) { return Math.hypot(ax-bx, ay-by); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function aabbCircleHit(x,y,w,h,cx,cy,cr){
    const px = clamp(cx, x, x+w);
    const py = clamp(cy, y, y+h);
    return dist(px, py, cx, cy) <= cr;
  }

  function resolveWallCircle(o){
    if (o.x - o.r < ROOM.x) { o.x = ROOM.x + o.r; o.vx *= -0.55; }
    if (o.x + o.r > ROOM.x + ROOM.w) { o.x = ROOM.x + ROOM.w - o.r; o.vx *= -0.55; }
    if (o.y - o.r < ROOM.y) { o.y = ROOM.y + o.r; o.vy *= -0.55; }
    if (o.y + o.r > ROOM.y + ROOM.h) { o.y = ROOM.y + ROOM.h - o.r; o.vy *= -0.55; }
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
    o.vx *= 0.82; o.vy *= 0.82;
  }

  // =========================
  // Puffs (motion clarity)
  // =========================
  function addPuff(x, y, strength = 1) {
    state.puffs.push({
      x, y,
      r: 6 + Math.random() * 6 * strength,
      a: 1.0,
      vx: (Math.random()*2-1) * 20 * strength,
      vy: (Math.random()*2-1) * 20 * strength
    });
    state.puffs = state.puffs.slice(-28);
  }

  // =========================
  // Update + Draw
  // =========================
  function update(dt, tMs) {
    // input -> velocity
    let ax = (state.keys.right ? 1 : 0) - (state.keys.left ? 1 : 0);
    let ay = (state.keys.down  ? 1 : 0) - (state.keys.up   ? 1 : 0);

    if (state.joy.active) {
      const jx = state.joy.dx / 46;
      const jy = state.joy.dy / 46;
      if (Math.abs(jx) > 0.12) ax = jx;
      if (Math.abs(jy) > 0.12) ay = jy;
    }

    const mag = Math.hypot(ax, ay);
    if (mag > 1) { ax /= mag; ay /= mag; }

    const speed = state.sitting ? 0 : 230;
    jesper.vx = ax * speed;
    jesper.vy = ay * speed;

    if (Math.abs(jesper.vx) > 1) jesper.face = Math.sign(jesper.vx);

    const oldX = jesper.x, oldY = jesper.y;
    jesper.x += jesper.vx * dt;
    jesper.y += jesper.vy * dt;

    // keep inside room
    jesper.x = clamp(jesper.x, ROOM.x + jesper.r, ROOM.x + ROOM.w - jesper.r);
    jesper.y = clamp(jesper.y, ROOM.y + jesper.r, ROOM.y + ROOM.h - jesper.r);

    // add puffs while moving (clear motion)
    const moved = dist(oldX, oldY, jesper.x, jesper.y);
    if (!state.sitting && moved > 0.5 && Math.random() < 0.40) {
      addPuff(jesper.x - jesper.face * 10, jesper.y + 20, 0.45);
    }

    // ornaments physics
    const friction = Math.pow(0.10, dt);

    const blocks = [ props.table, props.chair, props.tree ];
    ornaments.forEach(o => {
      if (dragging === o) return;

      o.x += o.vx * dt;
      o.y += o.vy * dt;

      o.vx *= friction;
      o.vy *= friction;

      if (Math.abs(o.vx) < 2) o.vx = 0;
      if (Math.abs(o.vy) < 2) o.vy = 0;

      resolveWallCircle(o);
      blocks.forEach(b => resolveRectBlockCircle(o, b));

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
    });

    // puffs update
    state.puffs.forEach(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.a -= 1.8 * dt;
    });
    state.puffs = state.puffs.filter(p => p.a > 0);
  }

  function draw(tMs) {
    // clear canvas
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, view.cssW, view.cssH);

    // draw in world coordinates
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);

    // room fill + border (clean)
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(ROOM.x, ROOM.y, ROOM.w, ROOM.h);

    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;
    ctx.strokeRect(ROOM.x, ROOM.y, ROOM.w, ROOM.h);

    // simple “baseboard” line for depth
    ctx.strokeStyle = "rgba(17,24,39,0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ROOM.x, ROOM.y + ROOM.h - 26);
    ctx.lineTo(ROOM.x + ROOM.w, ROOM.y + ROOM.h - 26);
    ctx.stroke();

    // label
    ctx.fillStyle = "rgba(17,24,39,0.25)";
    ctx.font = "900 12px ui-monospace, monospace";
    ctx.fillText("RUM 01 – EXISTENS / JUL / KAFFE", ROOM.x + 10, ROOM.y + ROOM.h - 10);

    // puffs behind everything (soft)
    state.puffs.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.a) * 0.35;
      ctx.beginPath();
      ctx.fillStyle = "#111827";
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // furniture (clear)
    drawTree(props.tree, tMs);
    drawTable(props.table);
    drawChair(props.chair);

    // ornaments (y-sort for nicer depth)
    ornaments.slice().sort((a,b)=>a.y-b.y).forEach(drawOrnament);

    // Jesper last (always visible)
    drawJesper(tMs);

    // joystick overlay (world)
    if (state.joy.active && !dragging) drawJoystickWorld();

    ctx.restore();
  }

  // =========================
  // Drawing helpers
  // =========================
  function roundRect(x, y, w, h, r, fill, stroke){
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
    // tabletop
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;
    roundRect(t.x, t.y, t.w, t.h, 14, true, true);

    // legs
    ctx.fillStyle = "#e5e7eb";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.5;
    roundRect(t.x + 18, t.y + t.h - 2, 14, 38, 8, true, true);
    roundRect(t.x + t.w - 32, t.y + t.h - 2, 14, 38, 8, true, true);

    // coffee mug
    ctx.fillStyle = "#dbeafe";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.5;
    roundRect(t.x + t.w - 46, t.y + 12, 18, 16, 6, true, true);
    ctx.beginPath();
    ctx.arc(t.x + t.w - 24, t.y + 20, 6, -0.5, 0.5);
    ctx.stroke();
  }

  function drawChair(c){
    // seat base
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;
    roundRect(c.x, c.y + 32, c.w, c.h - 32, 14, true, true);

    // backrest (bigger & clearer)
    roundRect(c.x + 10, c.y, c.w - 20, 42, 14, true, true);

    // “STOL” bubble-ish label
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.5;
    roundRect(c.x + 22, c.y - 18, 46, 22, 10, true, true);
    ctx.fillStyle = "rgba(17,24,39,0.8)";
    ctx.font = "900 10px ui-monospace, monospace";
    ctx.fillText("STOL", c.x + 33, c.y - 3);
  }

  function drawTree(tr, tMs){
    ctx.save();

    // glow halo (subtle but clear)
    const pulse = 0.75 + 0.25 * Math.sin(tMs / 240);
    ctx.globalAlpha = 0.18 * pulse;
    ctx.fillStyle = "#60a5fa";
    ctx.beginPath();
    ctx.ellipse(tr.x + tr.w/2, tr.y + tr.h*0.55, 56, 72, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // trunk
    ctx.fillStyle = "#d1d5db";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.5;
    roundRect(tr.x + tr.w*0.43, tr.y + tr.h*0.78, tr.w*0.14, tr.h*0.20, 8, true, true);

    // triangles
    ctx.fillStyle = "#dcfce7";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.5;

    tri(tr.x + tr.w/2, tr.y + 10, tr.x + 10, tr.y + tr.h*0.52, tr.x + tr.w - 10, tr.y + tr.h*0.52);
    tri(tr.x + tr.w/2, tr.y + tr.h*0.22, tr.x + 8, tr.y + tr.h*0.76, tr.x + tr.w - 8, tr.y + tr.h*0.76);

    // star topper
    ctx.font = "22px " + getComputedStyle(document.body).fontFamily;
    ctx.fillText("⭐", tr.x + tr.w/2 - 10, tr.y + 24);

    // baubles
    ctx.font = "18px " + getComputedStyle(document.body).fontFamily;
    ctx.fillText("🔴", tr.x + 16, tr.y + 64);
    ctx.fillText("🔴", tr.x + tr.w - 30, tr.y + 78);
    ctx.fillText("🔴", tr.x + tr.w/2 - 8, tr.y + 104);

    ctx.restore();

    function tri(ax, ay, bx, by, cx, cy){
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.lineTo(cx, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawOrnament(o){
    // base disc
    ctx.beginPath();
    ctx.fillStyle = o.base;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;
    ctx.arc(o.x, o.y, o.r, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    // emoji
    ctx.font = "24px " + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#111827";
    ctx.fillText(o.label, o.x, o.y + 1);
  }

  function drawJesper(tMs){
    // clearer animation
    const moving = Math.abs(jesper.vx) + Math.abs(jesper.vy) > 1;
    const walk = moving ? Math.sin(tMs / 90) : 0;
    const idle = moving ? 0 : Math.sin(tMs / 420);

    const sit = state.sitting ? 1 : 0;
    const bob = (sit ? 0.2 : 1) * (moving ? walk * 2.2 : idle * 1.0);

    const x = jesper.x;
    const y = jesper.y + bob;
    const face = jesper.face || 1;

    // outfit palette
    const skin  = "rgba(255,235,190,1.0)";
    const hair  = "rgba(148,72,34,0.95)";
    const hairH = "rgba(198,108,58,0.78)";
    const hood  = "rgba(17,24,39,1.0)";
    const pants = "rgba(156,163,175,1.0)";
    const shoe  = "rgba(120,74,36,1.0)";

    // shadow
    ctx.beginPath();
    ctx.fillStyle = "rgba(17,24,39,0.18)";
    ctx.ellipse(x, y + 32, 22, 7, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(face, 1);

    // motion lines (super tydligt när du går)
    if (moving) {
      ctx.strokeStyle = "rgba(17,24,39,0.20)";
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
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;
    roundRect(-20, -6, 40, 38, 12, true, true);

    // pocket highlight
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    roundRect(-14, 14, 28, 12, 8, true, false);

    // hood behind head
    ctx.fillStyle = hood;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -26, 22, Math.PI*0.05, Math.PI*0.95);
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
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;
    ctx.arc(0, -26, 16, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    // curly hair
    ctx.beginPath();
    ctx.fillStyle = hair;
    ctx.arc(0, -36, 17, Math.PI, 0);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = hairH;
    ctx.lineWidth = 2.2;
    for (let i = -12; i <= 12; i += 6) {
      ctx.beginPath();
      ctx.arc(i, -42, 3.6, 0, Math.PI*2);
      ctx.stroke();
    }

    // tortoiseshell glasses
    const g = ctx.createLinearGradient(-18, -34, 18, -18);
    g.addColorStop(0.00, "rgba(20,20,20,0.95)");
    g.addColorStop(0.35, "rgba(120,74,36,0.95)");
    g.addColorStop(0.70, "rgba(210,190,150,0.95)");
    g.addColorStop(1.00, "rgba(20,20,20,0.95)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 3.8;

    circleStroke(-7, -28, 7.0);
    circleStroke( 7, -28, 7.0);

    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.moveTo(-1.6, -28);
    ctx.lineTo( 1.6, -28);
    ctx.stroke();

    // eyes
    ctx.fillStyle = "#111827";
    circleFill(-5, -28, 2.2);
    circleFill( 5, -28, 2.2);

    // mouth
    ctx.strokeStyle = "rgba(17,24,39,0.85)";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    if (sit) { ctx.moveTo(-4, -18); ctx.lineTo(4, -18); }
    else { ctx.arc(0, -18, 4, 0.12*Math.PI, 0.88*Math.PI); }
    ctx.stroke();

    // name label (small, clean)
    ctx.font = "900 12px ui-monospace, monospace";
    ctx.fillStyle = "rgba(17,24,39,0.55)";
    ctx.textAlign = "center";
    ctx.fillText("JESPER", 0, -56);

    ctx.restore();

    function drawLeg(hipX, hipY, footX, footY){
      // pants
      ctx.beginPath();
      ctx.strokeStyle = pants;
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.moveTo(hipX, hipY);
      ctx.lineTo(footX, footY);
      ctx.stroke();

      // shoe
      ctx.fillStyle = shoe;
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2.5;
      roundRect(footX - 13, footY - 7, 26, 14, 7, true, true);

      // sole
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(footX - 10, footY + 4);
      ctx.lineTo(footX + 10, footY + 4);
      ctx.stroke();
    }

    function drawArm(x1, y1, x2, y2){
      ctx.beginPath();
      ctx.strokeStyle = hood;
      ctx.lineWidth = 11;
      ctx.lineCap = "round";
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // hand
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,235,190,0.8)";
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2;
      ctx.arc(x2, y2, 4.6, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();
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

  function drawJoystickWorld(){
    const bx = state.joy.startX;
    const by = state.joy.startY;
    const kx = bx + state.joy.dx;
    const ky = by + state.joy.dy;

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(17,24,39,0.07)";
    ctx.strokeStyle = "rgba(17,24,39,0.35)";
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(bx, by, 26, 0, Math.PI*2); ctx.fill(); ctx.stroke();

    ctx.fillStyle = "rgba(37,99,235,0.18)";
    ctx.strokeStyle = "rgba(17,24,39,0.55)";
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(kx, ky, 18, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // =========================
  // Loop
  // =========================
  let last = performance.now();
  function loop(t){
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;

    if (wonder.classList.contains("hidden")) {
      update(dt, t);
      draw(t);
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  setTimeout(() => toast("Tips: SPARKA ⏰ → 🍬 → ⭐ och SITT på stolen."), 900);
})();
