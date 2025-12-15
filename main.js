(() => {
  // ====== Countdown (Stockholm, 7 Jan 2026 06:00 CET = 05:00 UTC) ======
  const countdownEl = document.getElementById("countdownValue");
  const TARGET_UTC_MS = Date.UTC(2026, 0, 7, 5, 0, 0); // Jan=0, 05:00Z == 06:00 CET

  function pad(n) { return String(n).padStart(2, "0"); }

  function tickCountdown() {
    const now = Date.now();
    let diff = TARGET_UTC_MS - now;
    if (diff <= 0) {
      countdownEl.textContent = "NU. ☕";
      return;
    }
    const totalSec = Math.floor(diff / 1000);
    const days = Math.floor(totalSec / 86400);
    const hrs = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    countdownEl.textContent = `${days}d ${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  setInterval(tickCountdown, 1000);
  tickCountdown();

  // ====== Canvas setup ======
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });

  function resizeCanvasToCSS() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resizeCanvasToCSS);
  resizeCanvasToCSS();

  // ====== UI elements ======
  const bubbleEl = document.getElementById("bubble");
  const toastEl = document.getElementById("hintToast");
  const helpBtn = document.getElementById("helpBtn");
  const helpModal = document.getElementById("helpModal");
  const closeHelpBtn = document.getElementById("closeHelpBtn");
  const soundBtn = document.getElementById("soundBtn");

  const wonder = document.getElementById("wonder");
  const closeWonderBtn = document.getElementById("closeWonderBtn");

  function showBubble(text, ms = 2200) {
    bubbleEl.textContent = text;
    bubbleEl.classList.remove("hidden");
    clearTimeout(showBubble._t);
    showBubble._t = setTimeout(() => bubbleEl.classList.add("hidden"), ms);
  }

  function toast(text, ms = 1600) {
    toastEl.textContent = text;
    toastEl.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.add("hidden"), ms);
  }

  helpBtn.addEventListener("click", () => helpModal.classList.remove("hidden"));
  closeHelpBtn.addEventListener("click", () => helpModal.classList.add("hidden"));

  // ====== Sound (WebAudio “gubbljud” + tiny jingle) ======
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
    f.frequency.value = 520 + Math.random() * 240;
    f.Q.value = 1.2 + Math.random() * 2.4;

    o1.type = Math.random() < 0.5 ? "sawtooth" : "square";
    o2.type = "sine";

    const base = 130 + Math.random() * 80;
    o1.frequency.setValueAtTime(base * (1.1 + 0.25 * intensity), now);
    o1.frequency.exponentialRampToValueAtTime(base * 0.7, now + 0.18);

    o2.frequency.setValueAtTime(base * 2.0, now);
    o2.frequency.exponentialRampToValueAtTime(base * 1.2, now + 0.18);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.12 * intensity, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    o1.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(audioCtx.destination);

    o1.start(now);
    o2.start(now);
    o1.stop(now + 0.24);
    o2.stop(now + 0.24);
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

  soundBtn.addEventListener("click", async () => {
    audioEnabled = !audioEnabled;
    soundBtn.textContent = audioEnabled ? "🔊 Ljud: PÅ" : "🔊 Ljud: AV";

    if (audioEnabled) {
      ensureAudio();
      if (audioCtx.state === "suspended") await audioCtx.resume();
      toast("Ljud aktiverat. Jesper är… auditiv.");
      playGrunt(1.1);
    } else {
      toast("Ljud av. Jesper får vara tyst en stund.");
    }
  });

  // ====== Game world (torftig room) ======
  const state = {
    keys: { up:false, down:false, left:false, right:false },
    lastAction: 0,
    sitting: false,

    // secret-progress
    secret: {
      step: 0,
      // “sparkordning”: KLOCKA -> GODIS -> STJÄRNA -> SITT
      // (med vaga hintar från Jesper)
      unlocked: false
    },

    konami: [],
  };

  // Room bounds (in CSS pixels)
  function room() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    // closed room padding
    return { x: 18, y: 24, w: w - 36, h: h - 48 };
  }

  const jesper = {
    x: 80, y: 120,
    r: 16,
    vx: 0, vy: 0
  };

  // Minimal furniture + props
  const props = {
    chair: { x: 70, y: 0, w: 58, h: 58 },
    table: { x: 0, y: 0, w: 110, h: 58 },
    tree:  { x: 0, y: 0, w: 64, h: 88 },
  };

  // Kickable ornaments
  const ornaments = [
    { id:"clock",  label:"⏰", x: 0, y: 0, r: 14, vx:0, vy:0, color:"#FFEB6B", name:"klocka" },
    { id:"candy",  label:"🍬", x: 0, y: 0, r: 14, vx:0, vy:0, color:"#ff4fd8", name:"godis" },
    { id:"star",   label:"⭐", x: 0, y: 0, r: 14, vx:0, vy:0, color:"#45fff1", name:"stjärna" },
    { id:"ball",   label:"🔴", x: 0, y: 0, r: 14, vx:0, vy:0, color:"#ff6b6b", name:"kula" },
    { id:"sock",   label:"🧦", x: 0, y: 0, r: 14, vx:0, vy:0, color:"#7CFF6B", name:"strumpa" },
  ];

  function placeProps() {
    const R = room();

    // place table left-middle, chair near it, tree right-top
    props.table.x = R.x + 24;
    props.table.y = R.y + R.h * 0.52;

    props.chair.x = props.table.x + props.table.w + 18;
    props.chair.y = props.table.y + 6;

    props.tree.x = R.x + R.w - props.tree.w - 26;
    props.tree.y = R.y + 40;

    // ornaments around center
    const cx = R.x + R.w * 0.55;
    const cy = R.y + R.h * 0.35;

    ornaments.forEach((o, i) => {
      o.x = cx + (i - 2) * 34;
      o.y = cy + (i % 2 ? 26 : -18);
      o.vx = 0; o.vy = 0;
    });

    // jesper start
    jesper.x = R.x + 72;
    jesper.y = R.y + 120;
    jesper.vx = 0; jesper.vy = 0;
  }

  window.addEventListener("resize", placeProps);
  placeProps();

  // ====== Controls (touch buttons) ======
  document.querySelectorAll(".pad").forEach(btn => {
    const k = btn.dataset.key;
    const isDir = (k === "up" || k === "down" || k === "left" || k === "right");

    const down = (e) => {
      e.preventDefault();
      if (isDir) state.keys[k] = true;
      if (k === "center") showBubble("😐 …", 600);
      if (isDir) pushKonami(k);
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

  const kickBtn = document.getElementById("kickBtn");
  const interactBtn = document.getElementById("interactBtn");

  kickBtn.addEventListener("click", () => doKick());
  interactBtn.addEventListener("click", () => doSit());

  // Also allow dragging ornaments (tacky power)
  let dragging = null;
  canvas.addEventListener("pointerdown", (e) => {
    const p = getPointerPos(e);
    const o = ornaments.find(x => dist(x.x, x.y, p.x, p.y) <= x.r + 8);
    if (o) {
      dragging = o;
      o.vx = 0; o.vy = 0;
      canvas.setPointerCapture(e.pointerId);
      toast("Flyttar pynt… (varför?)");
      playGrunt(0.8);
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const p = getPointerPos(e);
    dragging.x = p.x;
    dragging.y = p.y;
  });
  canvas.addEventListener("pointerup", () => dragging = null);
  canvas.addEventListener("pointercancel", () => dragging = null);

  function getPointerPos(e){
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ====== Secret logic ======
  // Secret combo (primär):
  // 1) SPARKA klocka
  // 2) SPARKA godis
  // 3) SPARKA stjärna
  // 4) SITT på stolen
  //
  // Jesper droppar hintar ibland.
  function advanceSecret(expectedId) {
    const s = state.secret;
    if (s.unlocked) return;

    const stepId = (s.step === 0) ? "clock"
                : (s.step === 1) ? "candy"
                : (s.step === 2) ? "star"
                : null;

    if (!stepId) return;

    if (expectedId === stepId) {
      s.step++;
      toast(`✅ Hemligheten känns… närmare (${s.step}/3)`);
      playGrunt(1.1);

      if (s.step === 3) {
        showBubble("Jag känner… en julkraft. SITT. Nu.");
      }
    } else {
      // mild reset, tacky frustrerande
      s.step = 0;
      toast("❌ Nä. Inte så. (Hemligheten surar.)");
      showBubble("Allt var bättre innan…", 1200);
      playGrunt(0.9);
    }
  }

  function unlockWonder() {
    if (state.secret.unlocked) return;
    state.secret.unlocked = true;
    playJingle();
    showBubble("…VA?! Okej. Du är värdig.");
    wonder.classList.remove("hidden");
  }

  closeWonderBtn.addEventListener("click", () => {
    wonder.classList.add("hidden");
    showBubble("Tillbaka i rummet. Tragiskt men tryggt.");
  });

  // Konami genväg via touch-knappar + B A (kick= B, sit = A)
  function pushKonami(dirKey){
    const map = { up:"U", down:"D", left:"L", right:"R" };
    state.konami.push(map[dirKey] || "?");
    state.konami = state.konami.slice(-10);
    checkKonami();
  }
  function pushKonamiAction(letter){ // B / A
    state.konami.push(letter);
    state.konami = state.konami.slice(-10);
    checkKonami();
  }
  function checkKonami(){
    const seq = "U,U,D,D,L,R,L,R,B,A";
    if (state.konami.join(",") === seq) {
      toast("🎁 KONAMI! Du fuskade. Respekt.");
      unlockWonder();
    }
  }

  // ====== Actions ======
  function doKick() {
    const now = performance.now();
    if (now - state.lastAction < 120) return;
    state.lastAction = now;

    const reach = 52;
    const nearest = ornaments
      .map(o => ({ o, d: dist(jesper.x, jesper.y, o.x, o.y) }))
      .filter(x => x.d <= reach)
      .sort((a,b)=>a.d-b.d)[0];

    if (!nearest) {
      showBubble("Sparkade luft. Kändes ändå rätt.");
      playGrunt(0.7);
      pushKonamiAction("B");
      return;
    }

    const o = nearest.o;

    // apply impulse away from Jesper
    const dx = o.x - jesper.x;
    const dy = o.y - jesper.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / len;
    const ny = dy / len;

    const power = 6.2 + Math.random() * 2.2;
    o.vx += nx * power;
    o.vy += ny * power;

    showBubble(`👞 *dunk* (${o.name})`);
    playGrunt(1.0);

    // advance secret if correct order
    advanceSecret(o.id);
    pushKonamiAction("B");
  }

  function doSit() {
    const R = room();
    const chair = props.chair;

    // sit if near chair
    const inRange = aabbCircleHit(chair.x, chair.y, chair.w, chair.h, jesper.x, jesper.y, jesper.r + 8);

    if (!inRange) {
      showBubble("Satt mentalt. Inte fysiskt.");
      playGrunt(0.8);
      pushKonamiAction("A");
      return;
    }

    state.sitting = true;
    showBubble("🪑 …Julen är en känsla. Oftast trötthet.");
    playGrunt(0.9);
    pushKonamiAction("A");

    // if secret steps complete -> unlock
    if (state.secret.step === 3 && !state.secret.unlocked) {
      toast("🎄 Kombination fullbordad!");
      unlockWonder();
    } else if (!state.secret.unlocked) {
      toast("Du satt. Hemligheten: inte imponerad.");
    }

    // get up after a bit
    setTimeout(() => state.sitting = false, 900);
  }

  // ====== Random Jesper commentary ======
  const lines = [
    "Jag har varit i det här rummet i… dagar. Eller år. Svårt.",
    "Julpynt på golvet = processförbättring.",
    "Om jag sparkar en 🍬… blir det då en avvikelse?",
    "Kaffe är en livsstil. Också en coping.",
    "Jag ser ljuset… nej det var bara ⭐.",
    "Det finns en hemlighet här inne. Som alltid. Lite onödigt.",
    "Jag saknar kontoret. (Säg inget till någon.)",
    "Vem ställde en gran i ett rum? Vem GODKÄNDE detta?",
    "Jag vill bara… tillbaka 7 januari. 06:00. Gryning. ☕",
    "Allt är tyst… förutom mitt inre och den där 🔴 som rullar."
  ];

  function randomComment() {
    if (wonder && !wonder.classList.contains("hidden")) return;

    const r = Math.random();
    if (r < 0.35) {
      showBubble(lines[Math.floor(Math.random() * lines.length)]);
      playGrunt(0.65);
    }

    // hint droppers (vagt)
    if (!state.secret.unlocked) {
      const s = state.secret.step;
      if (Math.random() < 0.25) {
        if (s === 0) showBubble("Det börjar alltid med… tiden. ⏰", 1600);
        if (s === 1) showBubble("Något sött brukar… låsa upp saker. 🍬", 1600);
        if (s === 2) showBubble("Stjärnor visar vägen. Ibland. ⭐", 1600);
      }
    }
  }
  setInterval(randomComment, 4200);

  // ====== Physics & Collisions ======
  function dist(ax, ay, bx, by) { return Math.hypot(ax-bx, ay-by); }

  function aabbCircleHit(x,y,w,h,cx,cy,cr){
    const px = clamp(cx, x, x + w);
    const py = clamp(cy, y, y + h);
    return dist(px,py,cx,cy) <= cr;
  }

  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

  function resolveWallCircle(R, o){
    // keep circle inside room
    if (o.x - o.r < R.x) { o.x = R.x + o.r; o.vx *= -0.65; }
    if (o.x + o.r > R.x + R.w) { o.x = R.x + R.w - o.r; o.vx *= -0.65; }
    if (o.y - o.r < R.y) { o.y = R.y + o.r; o.vy *= -0.65; }
    if (o.y + o.r > R.y + R.h) { o.y = R.y + R.h - o.r; o.vy *= -0.65; }
  }

  function resolveRectBlock(o, rect){
    // simple circle-rect collision
    if (!aabbCircleHit(rect.x, rect.y, rect.w, rect.h, o.x, o.y, o.r)) return false;

    const cx = clamp(o.x, rect.x, rect.x + rect.w);
    const cy = clamp(o.y, rect.y, rect.y + rect.h);
    const dx = o.x - cx;
    const dy = o.y - cy;
    const len = Math.max(1e-6, Math.hypot(dx, dy));
    const nx = dx / len;
    const ny = dy / len;

    // push out
    o.x = cx + nx * (o.r + 0.5);
    o.y = cy + ny * (o.r + 0.5);

    // bounce
    const dot = o.vx * nx + o.vy * ny;
    o.vx -= 1.4 * dot * nx;
    o.vy -= 1.4 * dot * ny;
    o.vx *= 0.78;
    o.vy *= 0.78;

    return true;
  }

  function update(dt) {
    const R = room();

    // Jesper movement
    const speed = state.sitting ? 0 : 165;
    const ax = (state.keys.right ? 1 : 0) - (state.keys.left ? 1 : 0);
    const ay = (state.keys.down ? 1 : 0) - (state.keys.up ? 1 : 0);

    jesper.vx = ax * speed;
    jesper.vy = ay * speed;

    jesper.x += jesper.vx * dt;
    jesper.y += jesper.vy * dt;

    resolveWallCircle(R, jesper);

    // Ornaments physics
    const friction = Math.pow(0.2, dt); // exponential-ish
    const bounceGruntThreshold = 5.2;

    const blocks = [
      props.table,
      props.chair,
      props.tree
    ];

    ornaments.forEach(o => {
      o.x += o.vx * 60 * dt;
      o.y += o.vy * 60 * dt;

      o.vx *= friction;
      o.vy *= friction;

      resolveWallCircle(R, o);

      // collide with furniture
      let hit = false;
      blocks.forEach(b => {
        if (resolveRectBlock(o, b)) hit = true;
      });

      // collide with Jesper (makes them roll away)
      const d = dist(o.x,o.y, jesper.x, jesper.y);
      const minD = o.r + jesper.r;
      if (d < minD) {
        const nx = (o.x - jesper.x) / Math.max(d, 1);
        const ny = (o.y - jesper.y) / Math.max(d, 1);
        const push = (minD - d) * 0.8;
        o.x += nx * push;
        o.y += ny * push;
        o.vx += nx * 2.2;
        o.vy += ny * 2.2;
        hit = true;
      }

      // occasional grunt on “hard” hits
      if (audioEnabled && hit && (Math.abs(o.vx) + Math.abs(o.vy)) > bounceGruntThreshold && Math.random() < 0.25) {
        playGrunt(0.8);
      }
    });
  }

  // ====== Rendering (tacky room) ======
  function draw() {
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    // background base
    ctx.fillStyle = "#08001d";
    ctx.fillRect(0,0,W,H);

    // wallpaper stripes (tacky)
    for (let i=0;i<14;i++){
      ctx.fillStyle = i%2 ? "rgba(255,79,216,0.06)" : "rgba(69,255,241,0.05)";
      ctx.fillRect(i*(W/14), 0, W/14, H);
    }

    const R = room();

    // room floor
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(R.x, R.y, R.w, R.h);

    // room border
    ctx.strokeStyle = "rgba(255,235,107,0.75)";
    ctx.lineWidth = 3;
    ctx.setLineDash([8,6]);
    ctx.strokeRect(R.x, R.y, R.w, R.h);
    ctx.setLineDash([]);

    // ugly “Christmas lights” along top wall
    const bulbs = 12;
    for (let i=0;i<bulbs;i++){
      const x = R.x + 18 + i * ((R.w-36)/(bulbs-1));
      const y = R.y + 8;
      const pulse = 0.4 + 0.6*Math.sin(performance.now()/240 + i);
      ctx.beginPath();
      ctx.fillStyle = i%3===0 ? `rgba(255,79,216,${0.35+pulse*0.35})`
                    : i%3===1 ? `rgba(69,255,241,${0.35+pulse*0.35})`
                    : `rgba(255,235,107,${0.35+pulse*0.35})`;
      ctx.arc(x, y, 5, 0, Math.PI*2);
      ctx.fill();
    }

    // furniture
    drawTable(props.table);
    drawChair(props.chair);
    drawTree(props.tree);

    // ornaments
    ornaments.forEach(drawOrnament);

    // Jesper (tiny tacky character)
    drawJesper(performance.now());

    // silly “floor label”
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.font = "900 12px ui-monospace, monospace";
    ctx.fillText("RUM 01 – EXISTENS / JUL / KAFFE", R.x + 12, R.y + R.h - 12);
  }

  function drawTable(t){
    ctx.save();
    ctx.fillStyle = "rgba(255,235,107,0.12)";
    ctx.strokeStyle = "rgba(255,235,107,0.35)";
    roundRect(t.x, t.y, t.w, t.h, 10, true, true);
    // legs
    ctx.fillStyle = "rgba(255,235,107,0.16)";
    ctx.fillRect(t.x+10, t.y+t.h, 10, 28);
    ctx.fillRect(t.x+t.w-20, t.y+t.h, 10, 28);
    // mug
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillRect(t.x + t.w*0.58, t.y + 12, 10, 12);
    ctx.strokeStyle = "rgba(255,79,216,0.6)";
    ctx.strokeRect(t.x + t.w*0.58, t.y + 12, 10, 12);
    ctx.restore();
  }

  function drawChair(c){
    ctx.save();
    ctx.fillStyle = "rgba(69,255,241,0.10)";
    ctx.strokeStyle = "rgba(69,255,241,0.35)";
    roundRect(c.x, c.y, c.w, c.h, 10, true, true);
    // backrest line
    ctx.strokeStyle = "rgba(69,255,241,0.55)";
    ctx.beginPath();
    ctx.moveTo(c.x+10, c.y+12);
    ctx.lineTo(c.x+c.w-10, c.y+12);
    ctx.stroke();
    ctx.restore();
  }

  function drawTree(tr){
    ctx.save();
    // trunk
    ctx.fillStyle = "rgba(255,235,107,0.12)";
    ctx.fillRect(tr.x + tr.w*0.42, tr.y + tr.h*0.72, tr.w*0.16, tr.h*0.22);

    // triangles
    ctx.fillStyle = "rgba(124,255,107,0.12)";
    triangle(tr.x + tr.w/2, tr.y + 4, tr.x + 4, tr.y + tr.h*0.55, tr.x + tr.w - 4, tr.y + tr.h*0.55);

    ctx.fillStyle = "rgba(255,79,216,0.10)";
    triangle(tr.x + tr.w/2, tr.y + tr.h*0.18, tr.x + 6, tr.y + tr.h*0.78, tr.x + tr.w - 6, tr.y + tr.h*0.78);

    // star topper
    ctx.font = "22px var(--font)";
    ctx.fillStyle = "rgba(255,235,107,0.85)";
    ctx.fillText("⭐", tr.x + tr.w/2 - 10, tr.y + 18);

    // tiny ornaments on tree
    ctx.font = "16px var(--font)";
    ctx.fillText("🔴", tr.x + 10, tr.y + 52);
    ctx.fillText("🔴", tr.x + tr.w - 26, tr.y + 66);
    ctx.fillText("🔴", tr.x + tr.w/2 - 8, tr.y + 82);

    ctx.restore();
  }

  function drawOrnament(o){
    ctx.save();
    ctx.font = "22px var(--font)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(o.label, o.x, o.y);

    // glow ring
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.arc(o.x, o.y, o.r + 6, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }

function drawJesper(tMs){
  ctx.save();

  const moving = Math.abs(jesper.vx) + Math.abs(jesper.vy) > 1;
  const walk = moving ? Math.sin(tMs / 95) : 0;
  const idle = moving ? 0 : Math.sin(tMs / 420) * 0.8;

  const ax = (state.keys.right ? 1 : 0) - (state.keys.left ? 1 : 0);
  const face = ax !== 0 ? ax : 1;

  const sit = state.sitting ? 1 : 0;
  const bob = (sit ? 0.2 : 1) * (moving ? walk * 1.2 : idle);

  const x = jesper.x;
  const y = jesper.y + bob;

  // --- palette (your outfit) ---
  const skin = "rgba(255,235,190,0.85)";
  const hair = "rgba(148,72,34,0.92)";              // brunrött
  const hairHi = "rgba(198,108,58,0.70)";

  const hoodie = "rgba(8,8,12,0.92)";               // svart hoodie
  const hoodieHi = "rgba(255,255,255,0.08)";

  const pants = "rgba(160,165,175,0.70)";           // grå byxor
  const pantsEdge = "rgba(255,255,255,0.12)";

  const shoe = "rgba(120,74,36,0.90)";              // bruna skor
  const shoeEdge = "rgba(255,255,255,0.12)";

  // transform for facing
  ctx.translate(x, y);
  ctx.scale(face, 1);

  // shadow blob
  ctx.beginPath();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.ellipse(0, 22, 18, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- legs / shoes (walk cycle) ---
  const legSwing = sit ? 0.0 : walk * 6;
  const kneeBend = sit ? 6 : 0;

  drawLegAndShoe(-8, 16, -6 + legSwing, 28 - kneeBend);
  drawLegAndShoe( 8, 16,  6 - legSwing, 28 - kneeBend);

  // --- hoodie body ---
  ctx.lineWidth = 3;
  ctx.fillStyle = hoodie;
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  roundRectLocal(-16, -4, 32, 32, 10, true, true);

  // hoodie pocket (tacky)
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  roundRectLocal(-12, 12, 24, 12, 6, true, false);

  // zipper-ish line
  ctx.beginPath();
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 26);
  ctx.stroke();

  // hood behind head
  ctx.beginPath();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  ctx.arc(0, -26, 18, Math.PI * 0.05, Math.PI * 0.95);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // hoodie highlight (cheap “shine”)
  ctx.beginPath();
  ctx.strokeStyle = hoodieHi;
  ctx.lineWidth = 3;
  ctx.moveTo(-10, 2);
  ctx.quadraticCurveTo(-6, 10, -8, 22);
  ctx.stroke();

  // --- arms (sleeves) ---
  const armSwing = sit ? 0 : walk * 4;
  drawSleeve(-18, 6, -28, 10 - armSwing);
  drawSleeve( 18, 6,  28, 10 + armSwing);

  // --- pants (simple belt line) ---
  ctx.beginPath();
  ctx.strokeStyle = pantsEdge;
  ctx.lineWidth = 2;
  ctx.moveTo(-14, 14);
  ctx.lineTo(14, 14);
  ctx.stroke();

  // --- head ---
  ctx.beginPath();
  ctx.fillStyle = skin;
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 3;
  ctx.arc(0, -26, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // --- curly brunrött hair (tacky curls) ---
  drawCurlyHair();

  // --- glasses (round tortoiseshell) ---
  drawTortoiseGlasses();

  // eyes
  ctx.beginPath();
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.arc(-5, -28, 2, 0, Math.PI * 2);
  ctx.arc( 5, -28, 2, 0, Math.PI * 2);
  ctx.fill();

  // mouth
  ctx.beginPath();
  ctx.strokeStyle = sit ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.55)";
  ctx.lineWidth = 2;
  if (sit) {
    ctx.moveTo(-4, -20);
    ctx.lineTo(4, -20);
  } else {
    ctx.arc(0, -20, 4, 0.1 * Math.PI, 0.9 * Math.PI);
  }
  ctx.stroke();

  // tiny snow puff when moving
  if (moving && Math.random() < 0.20) {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.moveTo(-18, -34);
    ctx.lineTo(-26, -38);
    ctx.moveTo(-16, -30);
    ctx.lineTo(-26, -30);
    ctx.stroke();
  }

  // name tag (tacky)
  ctx.font = "900 12px " + getComputedStyle(document.body).fontFamily;
  ctx.fillStyle = "rgba(255,235,107,0.9)";
  ctx.textAlign = "center";
  ctx.fillText("JESPER", 0, -54);

  ctx.restore();

  // ===== helpers =====
  function drawLegAndShoe(hipX, hipY, footX, footY){
    // pants leg
    ctx.beginPath();
    ctx.strokeStyle = pants;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(footX, footY);
    ctx.stroke();

    // shoe
    ctx.beginPath();
    ctx.fillStyle = shoe;
    ctx.strokeStyle = shoeEdge;
    ctx.lineWidth = 2;
    roundRectLocal(footX - 11, footY - 6, 22, 12, 6, true, true);

    // sole line (extra tacky)
    ctx.beginPath();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.moveTo(footX - 9, footY + 3);
    ctx.lineTo(footX + 9, footY + 3);
    ctx.stroke();
  }

  function drawSleeve(x1, y1, x2, y2){
    ctx.beginPath();
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // hand (tiny)
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,235,190,0.35)";
    ctx.arc(x2, y2, 4, 0, Math.PI*2);
    ctx.fill();
  }

  function drawCurlyHair(){
    // main cap
    ctx.beginPath();
    ctx.fillStyle = hair;
    ctx.arc(0, -33, 15, Math.PI, 0);
    ctx.closePath();
    ctx.fill();

    // curls (small loops)
    ctx.strokeStyle = hairHi;
    ctx.lineWidth = 2;
    for (let i = -10; i <= 10; i += 5) {
      ctx.beginPath();
      ctx.arc(i, -38, 3.2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // side curl
    ctx.beginPath();
    ctx.strokeStyle = hair;
    ctx.lineWidth = 3;
    ctx.arc(-12, -29, 4, Math.PI * 0.2, Math.PI * 1.5);
    ctx.stroke();
  }

  function drawTortoiseGlasses(){
    // tortoiseshell gradient
    const g = ctx.createLinearGradient(-14, -34, 14, -18);
    g.addColorStop(0.00, "rgba(40,25,12,0.95)");   // mörkbrun/svart
    g.addColorStop(0.35, "rgba(120,74,36,0.95)");  // brun
    g.addColorStop(0.70, "rgba(210,190,150,0.95)");// beige
    g.addColorStop(1.00, "rgba(20,20,20,0.95)");   // svart

    ctx.lineWidth = 3.2;
    ctx.strokeStyle = g;

    // left lens
    ctx.beginPath();
    ctx.arc(-7, -28, 6, 0, Math.PI*2);
    ctx.stroke();

    // right lens
    ctx.beginPath();
    ctx.arc(7, -28, 6, 0, Math.PI*2);
    ctx.stroke();

    // bridge
    ctx.beginPath();
    ctx.lineWidth = 2.6;
    ctx.moveTo(-1.5, -28);
    ctx.lineTo(1.5, -28);
    ctx.stroke();

    // tiny shine
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1.2;
    ctx.arc(-7, -30, 3, Math.PI * 1.1, Math.PI * 1.7);
    ctx.arc(7, -30, 3, Math.PI * 1.1, Math.PI * 1.7);
    ctx.stroke();
  }

  function roundRectLocal(x, y, w, h, r, fill, stroke){
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
  }

  // ====== Game loop ======
  let last = performance.now();
  function loop(t){
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    if (!wonder.classList.contains("hidden")) {
      requestAnimationFrame(loop);
      return; // pause room updates while wonder shown
    }
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // First-time hint
  setTimeout(() => {
    toast("Pro tip: sparka ⏰ → 🍬 → ⭐ och SITT på 🪑 (om du vågar).");
  }, 900);

})();
