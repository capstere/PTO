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
    if (diff <= 0) {
      countdownEl.textContent = "NU. ☕";
      return;
    }
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
  const toastEl = document.getElementById("hintToast");

  const helpBtn = document.getElementById("helpBtn");
  const helpModal = document.getElementById("helpModal");
  const closeHelpBtn = document.getElementById("closeHelpBtn");

  const soundBtn = document.getElementById("soundBtn");

  const wonder = document.getElementById("wonder");
  const closeWonderBtn = document.getElementById("closeWonderBtn");

  const kickBtn = document.getElementById("kickBtn");
  const interactBtn = document.getElementById("interactBtn");

  function showBubble(text, ms = 1800) {
    bubbleEl.textContent = text;
    bubbleEl.classList.remove("hidden");
    clearTimeout(showBubble._t);
    showBubble._t = setTimeout(() => bubbleEl.classList.add("hidden"), ms);
  }

  function toast(text, ms = 1300) {
    toastEl.textContent = text;
    toastEl.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.add("hidden"), ms);
  }

  if (helpBtn && helpModal) helpBtn.addEventListener("click", () => helpModal.classList.remove("hidden"));
  if (closeHelpBtn && helpModal) closeHelpBtn.addEventListener("click", () => helpModal.classList.add("hidden"));

  // =========================
  // Canvas resize
  // =========================
  function resizeCanvasToCSS() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", () => { resizeCanvasToCSS(); placeProps(); });
  resizeCanvasToCSS();

  // =========================
  // Sound (WebAudio: gubbljud)
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
    const g = audioCtx.createGain();
    const f = audioCtx.createBiquadFilter();

    f.type = "bandpass";
    f.frequency.value = 380 + Math.random() * 380;
    f.Q.value = 1.0 + Math.random() * 2.2;

    o1.type = Math.random() < 0.5 ? "sawtooth" : "square";
    o2.type = "sine";

    const base = 120 + Math.random() * 90;

    o1.frequency.setValueAtTime(base * (1.0 + 0.30 * intensity), now);
    o1.frequency.exponentialRampToValueAtTime(base * 0.65, now + 0.16);

    o2.frequency.setValueAtTime(base * 2.0, now);
    o2.frequency.exponentialRampToValueAtTime(base * 1.25, now + 0.16);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.12 * intensity, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.20);

    o1.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(audioCtx.destination);

    o1.start(now);
    o2.start(now);
    o1.stop(now + 0.22);
    o2.stop(now + 0.22);
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
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.12);
    });
  }

  if (soundBtn) {
    soundBtn.addEventListener("click", async () => {
      audioEnabled = !audioEnabled;
      soundBtn.textContent = audioEnabled ? "🔊 Ljud: PÅ" : "🔊 Ljud: AV";

      if (audioEnabled) {
        ensureAudio();
        if (audioCtx.state === "suspended") await audioCtx.resume();
        toast("Ljud på. Jesper är… auditiv.");
        playGrunt(1.1);
      } else {
        toast("Ljud av. Frid i rummet.");
      }
    });
  }

  // =========================
  // State
  // =========================
  const state = {
    keys: { up:false, down:false, left:false, right:false },
    sitting: false,
    lastAction: 0,

    joy: { active:false, startX:0, startY:0, dx:0, dy:0 },

    secret: { step: 0, unlocked: false }, // ⏰ -> 🍬 -> ⭐ -> sit
  };

  // =========================
  // World
  // =========================
  function getRect() {
    return canvas.getBoundingClientRect();
  }

  function room() {
    const rect = getRect();
    const w = rect.width;
    const h = rect.height;
    return { x: 16, y: 16, w: w - 32, h: h - 32 };
  }

  const jesper = {
    x: 80, y: 120,
    r: 18,
    vx: 0, vy: 0
  };

  const props = {
    table: { x:0, y:0, w:130, h:56 },
    chair: { x:0, y:0, w:72,  h:72 },
    tree:  { x:0, y:0, w:84,  h:118 }
  };

  // 3 pynt (färre, tydligare)
  const ornaments = [
    { id:"clock", label:"⏰", name:"klocka", x:0,y:0,r:18,vx:0,vy:0, base:"#fde047" },
    { id:"candy", label:"🍬", name:"godis",  x:0,y:0,r:18,vx:0,vy:0, base:"#fb7185" },
    { id:"star",  label:"⭐", name:"stjärna",x:0,y:0,r:18,vx:0,vy:0, base:"#60a5fa" }
  ];

  function placeProps() {
    const R = room();

    props.table.x = R.x + 22;
    props.table.y = R.y + R.h * 0.58;

    props.chair.x = props.table.x + props.table.w + 26;
    props.chair.y = props.table.y + 6;

    props.tree.x = R.x + R.w - props.tree.w - 20;
    props.tree.y = R.y + 28;

    // ornaments center-ish
    const cx = R.x + R.w * 0.60;
    const cy = R.y + R.h * 0.36;

    ornaments[0].x = cx - 70; ornaments[0].y = cy + 5;   ornaments[0].vx=0; ornaments[0].vy=0;
    ornaments[1].x = cx - 10; ornaments[1].y = cy - 18;  ornaments[1].vx=0; ornaments[1].vy=0;
    ornaments[2].x = cx + 55; ornaments[2].y = cy + 14;  ornaments[2].vx=0; ornaments[2].vy=0;

    jesper.x = R.x + 90;
    jesper.y = R.y + 140;
    jesper.vx = 0;
    jesper.vy = 0;
  }
  placeProps();

  // =========================
  // Input: D-pad buttons
  // =========================
  document.querySelectorAll(".pad").forEach(btn => {
    const k = btn.dataset.key;
    const isDir = (k === "up" || k === "down" || k === "left" || k === "right");

    const down = (e) => {
      e.preventDefault();
      if (isDir) state.keys[k] = true;
      if (k === "center") showBubble("…", 500);
    };
    const up = (e) => {
      e.preventDefault();
      if (isDir) state.keys[k] = false;
    };

    btn.addEventListener("touchstart", down, { passive:false });
    btn.addEventListener("touchend", up, { passive:false });
    btn.addEventListener("mousedown", down);
    btn.addEventListener("mouseup", up);
    btn.addEventListener("mouseleave", up);
  });

  if (kickBtn) kickBtn.addEventListener("click", () => doKick());
  if (interactBtn) interactBtn.addEventListener("click", () => doSit());

  // =========================
  // Input: canvas pointer
  // - drag ornaments if grabbed
  // - otherwise: joystick movement
  // =========================
  let dragging = null;

  canvas.addEventListener("pointerdown", (e) => {
    const p = getPointerPos(e);
    const o = ornaments.find(x => dist(x.x, x.y, p.x, p.y) <= x.r + 10);

    if (o) {
      dragging = o;
      o.vx = 0; o.vy = 0;
      canvas.setPointerCapture(e.pointerId);
      toast("Flyttar pynt (varför?)");
      playGrunt(0.8);
      return;
    }

    // joystick
    state.joy.active = true;
    state.joy.startX = p.x;
    state.joy.startY = p.y;
    state.joy.dx = 0;
    state.joy.dy = 0;
    canvas.setPointerCapture(e.pointerId);
  }, { passive:false });

  canvas.addEventListener("pointermove", (e) => {
    const p = getPointerPos(e);

    if (dragging) {
      dragging.x = p.x;
      dragging.y = p.y;
      return;
    }

    if (state.joy.active) {
      state.joy.dx = p.x - state.joy.startX;
      state.joy.dy = p.y - state.joy.startY;
      const max = 44;
      state.joy.dx = clamp(state.joy.dx, -max, max);
      state.joy.dy = clamp(state.joy.dy, -max, max);
      return;
    }
  }, { passive:false });

  canvas.addEventListener("pointerup", () => {
    dragging = null;
    state.joy.active = false;
    state.joy.dx = 0;
    state.joy.dy = 0;
  }, { passive:false });

  canvas.addEventListener("pointercancel", () => {
    dragging = null;
    state.joy.active = false;
    state.joy.dx = 0;
    state.joy.dy = 0;
  }, { passive:false });

  function getPointerPos(e){
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // =========================
  // Secret / Wonder
  // =========================
  function advanceSecret(expectedId) {
    if (state.secret.unlocked) return;

    const stepId = (state.secret.step === 0) ? "clock"
                : (state.secret.step === 1) ? "candy"
                : (state.secret.step === 2) ? "star"
                : null;

    if (expectedId === stepId) {
      state.secret.step++;
      playGrunt(1.0);
      toast(`Hemligheten: ${state.secret.step}/3`);
      if (state.secret.step === 3) showBubble("Okej… SITT på stolen. Nu.");
      return;
    }

    // reset
    state.secret.step = 0;
    toast("Nej. Hemligheten blev kränkt.");
    playGrunt(0.8);
  }

  function unlockWonder() {
    if (state.secret.unlocked) return;
    state.secret.unlocked = true;
    playJingle();
    showBubble("…DU KLARADE DET?!", 1400);
    wonder.classList.remove("hidden");
  }

  if (closeWonderBtn) {
    closeWonderBtn.addEventListener("click", () => {
      wonder.classList.add("hidden");
      showBubble("Tillbaka i rummet. Enkelt. Tomt. Tryggt.");
    });
  }

  // =========================
  // Actions
  // =========================
  function doKick() {
    const now = performance.now();
    if (now - state.lastAction < 120) return;
    state.lastAction = now;

    const reach = 72;
    const nearest = ornaments
      .map(o => ({ o, d: dist(jesper.x, jesper.y, o.x, o.y) }))
      .filter(x => x.d <= reach)
      .sort((a,b)=>a.d-b.d)[0];

    if (!nearest) {
      showBubble("Sparkade luft. Kändes ändå produktivt.");
      playGrunt(0.7);
      return;
    }

    const o = nearest.o;
    const dx = o.x - jesper.x;
    const dy = o.y - jesper.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / len;
    const ny = dy / len;

    const impulse = 420 + Math.random() * 120; // px/s
    o.vx += nx * impulse;
    o.vy += ny * impulse;

    showBubble(`👞 SPARK! (${o.label})`);
    playGrunt(1.0);
    advanceSecret(o.id);
  }

  function doSit() {
    // sit only if close to chair
    const c = props.chair;
    const inRange = aabbCircleHit(c.x, c.y, c.w, c.h, jesper.x, jesper.y, jesper.r + 10);

    if (!inRange) {
      showBubble("Satt mentalt. Inte fysiskt.");
      playGrunt(0.7);
      return;
    }

    state.sitting = true;
    showBubble("🪑 …jul… kaffe… existens…", 1400);
    playGrunt(0.8);

    if (state.secret.step === 3 && !state.secret.unlocked) {
      toast("Kombination fullbordad!");
      unlockWonder();
    } else if (!state.secret.unlocked) {
      toast("Du satt. Hemligheten: fortfarande skeptisk.");
    }

    setTimeout(() => state.sitting = false, 850);
  }

  // =========================
  // Idle comments (färre, tydligare)
  // =========================
  const lines = [
    "Det här rummet känns… budget.",
    "Julpynt på golvet = processförbättring.",
    "Om jag sparkar ⏰… kan jag spola tiden?",
    "Kaffe är en livsstil. Också en strategi.",
    "Jag saknar kontoret. (Säg inget.)"
  ];

  function randomComment() {
    if (!wonder.classList.contains("hidden")) return;

    if (Math.random() < 0.35) {
      showBubble(lines[Math.floor(Math.random() * lines.length)]);
      playGrunt(0.55);
    }

    // mild hints
    if (!state.secret.unlocked && Math.random() < 0.20) {
      if (state.secret.step === 0) showBubble("⏰ känns… viktig.", 1200);
      if (state.secret.step === 1) showBubble("🍬 är… misstänkt nyckel.", 1200);
      if (state.secret.step === 2) showBubble("⭐ visar vägen, ibland.", 1200);
    }
  }
  setInterval(randomComment, 4200);

  // =========================
  // Physics / collisions
  // =========================
  function dist(ax, ay, bx, by) { return Math.hypot(ax-bx, ay-by); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function aabbCircleHit(x,y,w,h,cx,cy,cr){
    const px = clamp(cx, x, x + w);
    const py = clamp(cy, y, y + h);
    return dist(px,py,cx,cy) <= cr;
  }

  function resolveWallCircle(R, o){
    if (o.x - o.r < R.x) { o.x = R.x + o.r; o.vx *= -0.55; }
    if (o.x + o.r > R.x + R.w) { o.x = R.x + R.w - o.r; o.vx *= -0.55; }
    if (o.y - o.r < R.y) { o.y = R.y + o.r; o.vy *= -0.55; }
    if (o.y + o.r > R.y + R.h) { o.y = R.y + R.h - o.r; o.vy *= -0.55; }
  }

  function resolveRectBlockCircle(o, rect){
    if (!aabbCircleHit(rect.x, rect.y, rect.w, rect.h, o.x, o.y, o.r)) return false;

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
    o.vx *= 0.80;
    o.vy *= 0.80;

    return true;
  }

  // =========================
  // Update / Draw
  // =========================
  function update(dt) {
    const R = room();

    // movement input (buttons + joystick)
    let ax = (state.keys.right ? 1 : 0) - (state.keys.left ? 1 : 0);
    let ay = (state.keys.down  ? 1 : 0) - (state.keys.up   ? 1 : 0);

    if (state.joy.active) {
      const jx = state.joy.dx / 44;
      const jy = state.joy.dy / 44;
      if (Math.abs(jx) > 0.12) ax = jx;
      if (Math.abs(jy) > 0.12) ay = jy;
    }

    // normalize for diagonals
    const mag = Math.hypot(ax, ay);
    if (mag > 1) { ax /= mag; ay /= mag; }

    const speed = state.sitting ? 0 : 210;

    jesper.vx = ax * speed;
    jesper.vy = ay * speed;

    jesper.x += jesper.vx * dt;
    jesper.y += jesper.vy * dt;

    resolveWallCircle(R, jesper);

    // ornaments physics (clear + snappy)
    const friction = Math.pow(0.10, dt); // strong damping, feels "room-y"

    const blocks = [ props.table, props.chair, props.tree ];

    ornaments.forEach(o => {
      if (dragging === o) return;

      o.x += o.vx * dt;
      o.y += o.vy * dt;

      o.vx *= friction;
      o.vy *= friction;

      // stop tiny drift
      if (Math.abs(o.vx) < 2) o.vx = 0;
      if (Math.abs(o.vy) < 2) o.vy = 0;

      resolveWallCircle(R, o);

      blocks.forEach(b => resolveRectBlockCircle(o, b));

      // collide with Jesper
      const d = dist(o.x, o.y, jesper.x, jesper.y);
      const minD = o.r + jesper.r;
      if (d < minD) {
        const nx = (o.x - jesper.x) / Math.max(d, 1);
        const ny = (o.y - jesper.y) / Math.max(d, 1);
        const push = (minD - d) * 1.05;
        o.x += nx * push;
        o.y += ny * push;
        o.vx += nx * 120;
        o.vy += ny * 120;
      }
    });
  }

  function draw(tMs) {
    const rect = getRect();
    const W = rect.width;
    const H = rect.height;

    // clean bright background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    const R = room();

    // room fill
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(R.x, R.y, R.w, R.h);

    // border
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    ctx.strokeRect(R.x, R.y, R.w, R.h);

    // floor label
    ctx.fillStyle = "rgba(17,24,39,0.25)";
    ctx.font = "900 12px ui-monospace, monospace";
    ctx.fillText("RUM 01 – EXISTENS / JUL / KAFFE", R.x + 12, R.y + R.h - 12);

    // draw furniture (clear silhouettes)
    drawTable(props.table);
    drawChair(props.chair);
    drawTree(props.tree, tMs);

    // draw ornaments (big, readable)
    ornaments.forEach(drawOrnament);

    // draw Jesper (clear)
    drawJesper(tMs);

    // joystick visual (if active)
    if (state.joy.active && !dragging) {
      drawJoystick();
    }
  }

  function drawTable(t){
    ctx.save();
    // top
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    roundRect(t.x, t.y, t.w, t.h, 14, true, true);

    // legs
    ctx.fillStyle = "#e5e7eb";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;
    roundRect(t.x + 16, t.y + t.h - 2, 14, 38, 8, true, true);
    roundRect(t.x + t.w - 30, t.y + t.h - 2, 14, 38, 8, true, true);

    // mug (tacky coffee)
    ctx.fillStyle = "#dbeafe";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;
    roundRect(t.x + t.w - 42, t.y + 12, 18, 16, 6, true, true);
    ctx.beginPath();
    ctx.arc(t.x + t.w - 20, t.y + 20, 6, -0.5, 0.5);
    ctx.stroke();

    ctx.restore();
  }

  function drawChair(c){
    ctx.save();

    // seat
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    roundRect(c.x, c.y + 28, c.w, c.h - 28, 14, true, true);

    // backrest (very clear)
    ctx.fillStyle = "#ffffff";
    roundRect(c.x + 10, c.y, c.w - 20, 34, 14, true, true);

    // “chair” label (tacky)
    ctx.fillStyle = "rgba(17,24,39,0.35)";
    ctx.font = "900 11px ui-monospace, monospace";
    ctx.fillText("STOL", c.x + 18, c.y + 22);

    ctx.restore();
  }

  function drawTree(tr, tMs){
    ctx.save();

    // trunk
    ctx.fillStyle = "#d1d5db";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;
    roundRect(tr.x + tr.w*0.42, tr.y + tr.h*0.78, tr.w*0.16, tr.h*0.20, 8, true, true);

    // triangles
    ctx.fillStyle = "#dcfce7";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;

    triangle(tr.x + tr.w/2, tr.y + 6, tr.x + 10, tr.y + tr.h*0.52, tr.x + tr.w - 10, tr.y + tr.h*0.52);
    triangle(tr.x + tr.w/2, tr.y + tr.h*0.20, tr.x + 8, tr.y + tr.h*0.74, tr.x + tr.w - 8, tr.y + tr.h*0.74);

    // star topper pulse
    const pulse = 0.7 + 0.3 * Math.sin(tMs / 240);
    ctx.font = "22px " + getComputedStyle(document.body).fontFamily;
    ctx.globalAlpha = 1;
    ctx.fillText("⭐", tr.x + tr.w/2 - 10, tr.y + 20);

    // simple baubles
    ctx.globalAlpha = 0.9;
    ctx.font = "18px " + getComputedStyle(document.body).fontFamily;
    ctx.fillText("🔴", tr.x + 12, tr.y + 56);
    ctx.fillText("🔴", tr.x + tr.w - 28, tr.y + 68);
    ctx.fillText("🔴", tr.x + tr.w/2 - 8, tr.y + 92);

    // glow ring (subtle, clear)
    ctx.globalAlpha = 0.18 * pulse;
    ctx.fillStyle = "#60a5fa";
    ctx.beginPath();
    ctx.ellipse(tr.x + tr.w/2, tr.y + tr.h*0.48, 48, 60, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  function drawOrnament(o){
    ctx.save();

    // base circle behind emoji (clarity)
    ctx.beginPath();
    ctx.fillStyle = o.base;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    ctx.arc(o.x, o.y, o.r, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    // emoji
    ctx.font = "24px " + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#111827";
    ctx.fillText(o.label, o.x, o.y + 1);

    ctx.restore();
  }

  // Jesper: curly brunrött hair, tortoiseshell glasses, black hoodie, gray pants, brown shoes
  function drawJesper(tMs){
    ctx.save();

    const moving = Math.abs(jesper.vx) + Math.abs(jesper.vy) > 1;
    const walk = moving ? Math.sin(tMs / 95) : 0;
    const idle = moving ? 0 : Math.sin(tMs / 420);

    // facing based on movement/keys
    const ax = (state.keys.right ? 1 : 0) - (state.keys.left ? 1 : 0);
    const face = ax !== 0 ? ax : (jesper.vx !== 0 ? Math.sign(jesper.vx) : 1);

    const sit = state.sitting ? 1 : 0;
    const bob = (sit ? 0.2 : 1) * (moving ? walk * 2.4 : idle * 1.1);

    const x = jesper.x;
    const y = jesper.y + bob;

    // palette
    const skin = "rgba(255,235,190,1.0)";
    const hair = "rgba(148,72,34,0.95)";
    const hairHi = "rgba(198,108,58,0.75)";
    const hoodie = "rgba(17,24,39,1.0)";           // black-ish
    const pants = "rgba(156,163,175,1.0)";         // gray
    const shoe = "rgba(120,74,36,1.0)";            // brown

    ctx.translate(x, y);
    ctx.scale(face, 1);

    // shadow
    ctx.beginPath();
    ctx.fillStyle = "rgba(17,24,39,0.18)";
    ctx.ellipse(0, 30, 22, 7, 0, 0, Math.PI*2);
    ctx.fill();

    // legs
    const legSwing = sit ? 0 : walk * 8;
    const knee = sit ? 8 : 0;
    drawLeg(-8, 18, -10 + legSwing, 34 - knee);
    drawLeg( 8, 18,  10 - legSwing, 34 - knee);

    // body hoodie
    ctx.fillStyle = hoodie;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    roundRect(-18, -6, 36, 34, 12, true, true);

    // hoodie pocket
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    roundRect(-13, 12, 26, 12, 8, true, false);

    // hood behind head
    ctx.fillStyle = "rgba(17,24,39,1.0)";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -24, 20, Math.PI*0.05, Math.PI*0.95);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // arms
    const armSwing = sit ? 0 : walk * 6;
    drawArm(-18, 6, -30, 14 - armSwing);
    drawArm( 18, 6,  30, 14 + armSwing);

    // head
    ctx.beginPath();
    ctx.fillStyle = skin;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    ctx.arc(0, -26, 15, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    // curly hair
    drawCurlyHair();

    // glasses (tortoiseshell)
    drawTortoiseGlasses();

    // eyes
    ctx.beginPath();
    ctx.fillStyle = "#111827";
    ctx.arc(-5, -28, 2.2, 0, Math.PI*2);
    ctx.arc( 5, -28, 2.2, 0, Math.PI*2);
    ctx.fill();

    // mouth
    ctx.beginPath();
    ctx.strokeStyle = "rgba(17,24,39,0.8)";
    ctx.lineWidth = 2.6;
    if (sit) {
      ctx.moveTo(-4, -19);
      ctx.lineTo(4, -19);
    } else {
      ctx.arc(0, -19, 4, 0.1*Math.PI, 0.9*Math.PI);
    }
    ctx.stroke();

    // pants belt line hint
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.moveTo(-14, 10);
    ctx.lineTo(14, 10);
    ctx.stroke();

    // name tag (very clear)
    ctx.font = "900 12px ui-monospace, monospace";
    ctx.fillStyle = "rgba(17,24,39,0.55)";
    ctx.textAlign = "center";
    ctx.fillText("JESPER", 0, -52);

    ctx.restore();

    function drawLeg(hipX, hipY, footX, footY){
      // pants leg
      ctx.beginPath();
      ctx.strokeStyle = pants;
      ctx.lineWidth = 9;
      ctx.lineCap = "round";
      ctx.moveTo(hipX, hipY);
      ctx.lineTo(footX, footY);
      ctx.stroke();

      // shoe
      ctx.fillStyle = shoe;
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 3;
      roundRect(footX - 12, footY - 7, 24, 14, 7, true, true);

      // sole
      ctx.beginPath();
      ctx.strokeStyle = "rgba(0,0,0,0.28)";
      ctx.lineWidth = 2;
      ctx.moveTo(footX - 10, footY + 4);
      ctx.lineTo(footX + 10, footY + 4);
      ctx.stroke();
    }

    function drawArm(x1, y1, x2, y2){
      ctx.beginPath();
      ctx.strokeStyle = hoodie;
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // hand
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,235,190,0.75)";
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2;
      ctx.arc(x2, y2, 4.5, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
    }

    function drawCurlyHair(){
      // top cap
      ctx.beginPath();
      ctx.fillStyle = hair;
      ctx.arc(0, -34, 16, Math.PI, 0);
      ctx.closePath();
      ctx.fill();

      // curls (clear little loops)
      ctx.strokeStyle = hairHi;
      ctx.lineWidth = 2.2;
      for (let i = -12; i <= 12; i += 6) {
        ctx.beginPath();
        ctx.arc(i, -40, 3.4, 0, Math.PI*2);
        ctx.stroke();
      }
      // side curl
      ctx.beginPath();
      ctx.strokeStyle = hair;
      ctx.lineWidth = 3.2;
      ctx.arc(-13, -29, 4.2, Math.PI*0.2, Math.PI*1.5);
      ctx.stroke();
    }

    function drawTortoiseGlasses(){
      const g = ctx.createLinearGradient(-16, -34, 16, -18);
      g.addColorStop(0.00, "rgba(20,20,20,0.95)");
      g.addColorStop(0.35, "rgba(120,74,36,0.95)");
      g.addColorStop(0.70, "rgba(210,190,150,0.95)");
      g.addColorStop(1.00, "rgba(20,20,20,0.95)");

      ctx.lineWidth = 3.6;
      ctx.strokeStyle = g;

      // left lens
      ctx.beginPath();
      ctx.arc(-7, -28, 6.6, 0, Math.PI*2);
      ctx.stroke();

      // right lens
      ctx.beginPath();
      ctx.arc(7, -28, 6.6, 0, Math.PI*2);
      ctx.stroke();

      // bridge
      ctx.beginPath();
      ctx.lineWidth = 3.0;
      ctx.moveTo(-1.6, -28);
      ctx.lineTo(1.6, -28);
      ctx.stroke();

      // small shine
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1.2;
      ctx.arc(-7, -30, 3.4, Math.PI*1.1, Math.PI*1.7);
      ctx.arc(7, -30, 3.4, Math.PI*1.1, Math.PI*1.7);
      ctx.stroke();
    }
  }

  function drawJoystick(){
    ctx.save();
    ctx.globalAlpha = 0.9;

    const baseX = state.joy.startX;
    const baseY = state.joy.startY;
    const knobX = baseX + state.joy.dx;
    const knobY = baseY + state.joy.dy;

    // base
    ctx.beginPath();
    ctx.fillStyle = "rgba(17,24,39,0.08)";
    ctx.strokeStyle = "rgba(17,24,39,0.35)";
    ctx.lineWidth = 3;
    ctx.arc(baseX, baseY, 26, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    // knob
    ctx.beginPath();
    ctx.fillStyle = "rgba(37,99,235,0.18)";
    ctx.strokeStyle = "rgba(17,24,39,0.55)";
    ctx.lineWidth = 3;
    ctx.arc(knobX, knobY, 18, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

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

  function triangle(ax, ay, bx, by, cx, cy){
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // =========================
  // Loop
  // =========================
  let last = performance.now();
  function loop(t){
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;

    if (wonder.classList.contains("hidden")) {
      update(dt);
      draw(t);
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // First hint (inte för mycket)
  setTimeout(() => {
    toast("Tips: SPARKA ⏰ → 🍬 → ⭐ och SITT på stolen.");
  }, 900);

})();
