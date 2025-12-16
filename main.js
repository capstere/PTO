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
  const wonderFallback = $("wonderFallback");

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

  closeWonderBtn?.addEventListener("click", ()=>{
    wonder?.classList.add("hidden");
    bubble("Tillbaka i rummet. Som vanligt.");
  });

  // ---------- Audio (WebAudio) ----------
  let audioEnabled = false;
  let audioCtx = null;

  function ensureAudio(){
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function ping(freq, t=0.08, gain=0.08){
    if (!audioEnabled) return;
    ensureAudio();
    const a = audioCtx;
    const now = a.currentTime;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "triangle";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t);
    o.connect(g); g.connect(a.destination);
    o.start(now); o.stop(now + t + 0.02);
  }

  function grunt(intensity=1){
    if (!audioEnabled) return;
    ensureAudio();
    const a = audioCtx;
    const now = a.currentTime;

    const o = a.createOscillator();
    const g = a.createGain();
    const f = a.createBiquadFilter();

    f.type = "bandpass";
    f.frequency.value = 240 + Math.random() * 520;
    f.Q.value = 1.2 + Math.random() * 1.8;

    o.type = Math.random() < 0.5 ? "sawtooth" : "square";
    const base = 90 + Math.random() * 70;
    o.frequency.setValueAtTime(base * (1 + 0.25*intensity), now);
    o.frequency.exponentialRampToValueAtTime(base * 0.62, now + 0.18);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.12*intensity, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    o.connect(f); f.connect(g); g.connect(a.destination);
    o.start(now); o.stop(now + 0.25);
  }

  function jingle(){
    if (!audioEnabled) return;
    [523.25,659.25,783.99,659.25,523.25].forEach((f,i)=>{
      setTimeout(()=>ping(f, 0.09, 0.08), i*90);
    });
  }

  soundBtn?.addEventListener("click", async ()=>{
    audioEnabled = !audioEnabled;
    soundBtn.textContent = audioEnabled ? "🔊 Ljud: PÅ" : "🔊 Ljud: AV";
    if (audioEnabled){
      ensureAudio();
      if (audioCtx.state === "suspended") await audioCtx.resume();
      toast("Ljud på.");
      grunt(1.0);
    } else {
      toast("Ljud av.");
    }
  });

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

  const jesper = {
    x: 120,
    vx: 0,
    facing: 1,
    r: 22,
    action: "idle", // idle/walk/kick/sit
    actionT: 0,
    blinkT: 0
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
  };

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

  // ---------- Input (pointer) ----------
  function pointerPos(e){
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener("pointerdown", (e)=>{
    e.preventDefault();
    const p = pointerPos(e);
    const w = toWorld(p.x, p.y);

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
        grunt(0.7);
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
      toast("Nej. Hemligheten blev sur.");
    }
  }

  function unlock(){
    if (state.unlocked) return;
    state.unlocked = true;
    jingle();
    bubble("…okej. Respekt.", 1400);
    wonder?.classList.remove("hidden");
  }

  // ---------- Actions ----------
  function doKick(){
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

    if (!best || bestD > reach){
      bubble("Sparkade luft. Det räknas.", 1200);
      return;
    }

    const dir = Math.sign(best.x - jesper.x) || jesper.facing;
    best.vx += dir * (520 + Math.random()*120);
    bubble(`👞 SPARK! (${best.label})`, 900);
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
    bubble("🪑 …existens… kaffe… jul…", 1400);

    if (state.secretStep === 3 && !state.unlocked){
      toast("Kombination fullbordad!");
      unlock();
    }
  }

  // ---------- Commentary ----------
  const lines = [
    "Det här rummet känns… budget.",
    "Jag vill ha kaffe. Enkelt.",
    "Högtid: 90% väntan, 10% pynt.",
    "Den där lilla tavlan… den är tom. Som jag.",
    "Jag går åt höger. Symboliskt."
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

    // action state timing
    jesper.actionT += dt;
    if (jesper.action === "kick" && jesper.actionT > 0.35) jesper.action = "idle";
    if (jesper.action === "sit" && jesper.actionT > 0.9) jesper.action = "idle";

    // movement (only x)
    let targetV = 0;
    if (state.joy.active){
      const n = state.joy.dx / 120; // -1..1
      targetV = clamp(n, -1, 1) * 360;
    }

    if (Math.abs(targetV) > 12){
      jesper.facing = Math.sign(targetV);
      if (jesper.action !== "kick" && jesper.action !== "sit") jesper.action = "walk";
    } else {
      if (jesper.action === "walk") jesper.action = "idle";
    }

    // smooth velocity
    jesper.vx = lerp(jesper.vx, targetV, clamp(dt*12, 0, 1));
    jesper.x += jesper.vx * dt;
    jesper.x = clamp(jesper.x, ROOM.x + jesper.r, ROOM.x + ROOM.w - jesper.r);

    // ornaments physics (1D)
    const friction = Math.pow(0.07, dt); // strong damping
    for (const o of ornaments){
      if (state.dragging === o) continue;
      o.x += o.vx * dt;
      o.vx *= friction;
      if (Math.abs(o.vx) < 3) o.vx = 0;
      resolveOrnamentBlocks(o);
    }
  }

  function draw(tMs){
    // clear
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0,0,view.cssW, view.cssH);

    // world transform
    ctx.save();
    ctx.translate(view.ox, view.oy);
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

    // tiny “tavla” placeholder
    drawFramePlaceholder();

    // furniture
    drawTable();
    drawChair();
    drawTree(tMs);

    // ornaments
    for (const o of ornaments) drawOrnament(o);

    // Jesper
    drawJesper(tMs);

    // joystick hint
    if (state.joy.active && !state.dragging) drawJoystick();

    // label
    ctx.fillStyle = "rgba(17,24,39,0.25)";
    ctx.font = "900 14px ui-monospace, monospace";
    ctx.fillText("RUM 01 – KALT / TYDLIGT / JUL", ROOM.x + 14, ROOM.y + ROOM.h - 12);

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
    const x = props.table.x;
    const w = props.table.w;
    const topY = FLOOR_Y - 86;
    const h = 40;

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    roundRectStroke(x, topY, w, h, 14);
    ctx.fillRect(x+4, topY+4, w-8, h-8);

    ctx.fillStyle = "#e5e7eb";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    roundRectStroke(x + 18, topY + h - 2, 28, 70, 10);
    roundRectStroke(x + w - 46, topY + h - 2, 28, 70, 10);

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

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;

    roundRectStroke(x + 10, seatY - 78, w - 20, 74, 14);
    ctx.fillRect(x + 14, seatY - 74, w - 28, 66);

    roundRectStroke(x, seatY, w, 52, 14);
    ctx.fillRect(x+4, seatY+4, w-8, 44);

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;
    roundRectStroke(x + 38, seatY - 102, 54, 28, 12);
    ctx.fillRect(x + 41, seatY - 99, 48, 22);
    ctx.fillStyle = "rgba(17,24,39,0.8)";
    ctx.font = "1000 12px ui-monospace, monospace";
    ctx.fillText("STOL", x + 50, seatY - 82);
  }

  function drawTree(tMs){
    const x = props.tree.x, w = props.tree.w;
    const topY = FLOOR_Y - 150;
    const pulse = 0.75 + 0.25 * Math.sin(tMs/240);

    ctx.save();
    ctx.globalAlpha = 0.16 * pulse;
    ctx.fillStyle = "#60a5fa";
    ctx.beginPath();
    ctx.ellipse(x + w/2, FLOOR_Y - 85, 78, 96, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#d1d5db";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    roundRectStroke(x + w/2 - 13, FLOOR_Y - 38, 26, 38, 10);
    ctx.fillRect(x + w/2 - 10, FLOOR_Y - 35, 20, 32);

    ctx.fillStyle = "#dcfce7";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;

    triangle(x + w/2, topY, x + 12, topY + 70, x + w - 12, topY + 70);
    triangle(x + w/2, topY + 48, x + 8, topY + 125, x + w - 8, topY + 125);

    ctx.font = "26px " + getComputedStyle(document.body).fontFamily;
    ctx.fillText("⭐", x + w/2 - 12, topY + 18);

    ctx.font = "22px " + getComputedStyle(document.body).fontFamily;
    ctx.fillText("🔴", x + 18, topY + 74);
    ctx.fillText("🔴", x + w - 44, topY + 90);
    ctx.fillText("🔴", x + w/2 - 10, topY + 118);

    function triangle(ax, ay, bx, by, cx, cy){
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
    const bob = moving ? Math.sin(phase*2)*2.0 : Math.sin(tMs/650)*1.3;

    const x = jesper.x;
    const face = jesper.facing || 1;

    const isKick = (jesper.action === "kick" && jesper.actionT < 0.28);
    const isSit = (jesper.action === "sit");
    const sitDrop = isSit ? 18 : 0;

    ctx.save();
    ctx.translate(x, y - sitDrop + bob);
    ctx.scale(face, 1);

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

    const legA = isSit ? 0 : walk * 10;
    const legB = isSit ? 0 : -walk * 10;

    drawLeg(-10, 6, -12 + legA, 24, pants, shoe);
    drawLeg( 10, 6,  12 + legB, 24, pants, shoe);

    ctx.fillStyle = hood;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    roundRect(-18, -16, 36, 34, 12, true, true);

    ctx.fillStyle = "rgba(255,255,255,0.10)";
    roundRect(-12, 2, 24, 12, 8, true, false);

    const arm = isSit ? 0 : walk * 8;
    const kickArm = isKick ? -14 : 0;
    drawArm(-18, -6, -30, 6 - arm, hood);
    drawArm( 18, -6,  30, 6 + arm + kickArm, hood);

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
    if (blink){
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
    if (isKick){
      ctx.moveTo(-6, -26); ctx.lineTo( 6, -26);
    } else if (isSit){
      ctx.arc(0, -26, 5, 0.15*Math.PI, 0.85*Math.PI);
    } else {
      ctx.arc(0, -26, 4, 0.10*Math.PI, 0.90*Math.PI);
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
    setTimeout(()=>toast("Tips: SPARKA ⏰ → 🍬 → ⭐ och SITT på stolen."), 900);
    requestAnimationFrame(frame);
  } catch(err){
    console.error(err);
    toast("JS-krasch 😵 (öppna konsolen)", 4000);
  }

})();
