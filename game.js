(() => {
  const TAU = Math.PI * 2;
  const SIDES = 6;
  const STEP = TAU / SIDES;
  const PLAYER_R = 96;
  const CORE_R = 34;
  const WALL_THICK = 20;
  const SPAWN_R = 500;
  const BEST_KEY = "gyre-best";

  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");

  let width = 0;
  let height = 0;
  let dpr = 1;

  const state = {
    mode: "menu",
    time: 0,
    angle: -Math.PI / 2 + STEP / 2,
    dir: 1,
    world: 0,
    spinDir: 1,
    walls: [],
    spawnIn: 0.35,
    score: 0,
    best: Number(localStorage.getItem(BEST_KEY) || 0),
    shake: 0,
    flash: 0,
    particles: [],
  };

  let audioCtx = null;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function norm(a) {
    a %= TAU;
    if (a < 0) a += TAU;
    return a;
  }

  function sectorOf(angle, rot) {
    return Math.floor(norm(angle - rot + Math.PI / 2) / STEP) % SIDES;
  }

  function hexPoint(i, radius, rot) {
    const a = rot + i * STEP - Math.PI / 2;
    return [Math.cos(a) * radius, Math.sin(a) * radius];
  }

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, dur, type, gain) {
    const ac = ensureAudio();
    if (!ac) return;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type || "square";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain || 0.05, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + dur);
  }

  function openSides(gaps) {
    const sides = Array(SIDES).fill(1);
    for (const g of gaps) sides[((g % SIDES) + SIDES) % SIDES] = 0;
    return sides;
  }

  function randomPattern() {
    const shift = Math.floor(Math.random() * SIDES);
    const roll = Math.random();
    let gaps;
    if (roll < 0.28) gaps = [0];
    else if (roll < 0.5) gaps = [0, 1];
    else if (roll < 0.7) gaps = [0, 3];
    else if (roll < 0.85) gaps = [0, 2];
    else gaps = [0, 1, 3];
    return openSides(gaps.map((g) => g + shift));
  }

  function wallSpeed() {
    return 150 + Math.min(state.time * 9, 220);
  }

  function spawnDelay() {
    return Math.max(0.52, 1.28 - state.time * 0.035);
  }

  function turnSpeed() {
    return 3.05 + Math.min(state.time * 0.045, 1.6);
  }

  function spinSpeed() {
    return (0.28 + Math.min(state.time * 0.018, 0.7)) * state.spinDir;
  }

  function resetRun() {
    state.mode = "play";
    state.time = 0;
    state.angle = -Math.PI / 2 + STEP / 2;
    state.dir = Math.random() < 0.5 ? 1 : -1;
    state.world = 0;
    state.spinDir = Math.random() < 0.5 ? 1 : -1;
    state.walls = [];
    state.spawnIn = 0.2;
    state.score = 0;
    state.shake = 0;
    state.flash = 0.35;
    state.particles = [];
    tone(660, 0.08, "square", 0.04);
    tone(990, 0.12, "square", 0.03);
  }

  function die() {
    if (state.mode !== "play") return;
    state.mode = "dead";
    state.shake = 14;
    state.flash = 0.85;
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(BEST_KEY, String(state.best));
    }
    const x = Math.cos(state.angle) * PLAYER_R;
    const y = Math.sin(state.angle) * PLAYER_R;
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * TAU;
      const s = 40 + Math.random() * 220;
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.4 + Math.random() * 0.55,
        max: 0.7,
      });
    }
    tone(180, 0.28, "sawtooth", 0.06);
    tone(90, 0.4, "square", 0.05);
  }

  function input(x) {
    ensureAudio();
    if (state.mode === "menu") {
      resetRun();
      return;
    }
    if (state.mode === "dead") {
      resetRun();
      return;
    }
    if (typeof x === "number") {
      state.dir = x < width / 2 ? -1 : 1;
    } else {
      state.dir *= -1;
    }
    tone(state.dir > 0 ? 520 : 420, 0.04, "square", 0.03);
  }

  function spawnWall() {
    state.walls.push({
      r: SPAWN_R,
      thick: WALL_THICK,
      sides: randomPattern(),
      resolved: false,
    });
  }

  function update(dt) {
    state.shake = Math.max(0, state.shake - dt * 28);
    state.flash = Math.max(0, state.flash - dt * 1.8);

    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);

    if (state.mode === "menu") {
      state.world += dt * 0.22;
      state.angle += dt * 0.9;
      return;
    }

    if (state.mode === "dead") {
      state.world += dt * 0.08;
      return;
    }

    state.time += dt;
    state.world += spinSpeed() * dt;
    state.angle += state.dir * turnSpeed() * dt;

    if (state.time > 8 && Math.floor(state.time) !== Math.floor(state.time - dt)) {
      if (Math.random() < 0.12) state.spinDir *= -1;
    }

    state.spawnIn -= dt;
    if (state.spawnIn <= 0) {
      spawnWall();
      state.spawnIn = spawnDelay();
    }

    const speed = wallSpeed();
    for (const wall of state.walls) {
      wall.r -= speed * dt;
      if (!wall.resolved && wall.r <= PLAYER_R) {
        wall.resolved = true;
        const sector = sectorOf(state.angle, state.world);
        if (wall.sides[sector]) {
          die();
        } else {
          state.score += 1;
          tone(240 + state.score * 8, 0.05, "triangle", 0.035);
        }
      }
    }
    state.walls = state.walls.filter((w) => w.r + w.thick > CORE_R - 8);
  }

  function strokeHex(radius, rot) {
    ctx.beginPath();
    for (let i = 0; i <= SIDES; i++) {
      const [x, y] = hexPoint(i % SIDES, radius, rot);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function fillHex(radius, rot) {
    ctx.beginPath();
    for (let i = 0; i < SIDES; i++) {
      const [x, y] = hexPoint(i, radius, rot);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawWall(wall, rot) {
    const outer = wall.r + wall.thick / 2;
    const inner = wall.r - wall.thick / 2;
    if (outer < 4) return;
    for (let i = 0; i < SIDES; i++) {
      if (!wall.sides[i]) continue;
      const a0 = rot + i * STEP - Math.PI / 2;
      const a1 = a0 + STEP;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a0) * outer, Math.sin(a0) * outer);
      ctx.lineTo(Math.cos(a1) * outer, Math.sin(a1) * outer);
      ctx.lineTo(Math.cos(a1) * inner, Math.sin(a1) * inner);
      ctx.lineTo(Math.cos(a0) * inner, Math.sin(a0) * inner);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawPlayer() {
    const x = Math.cos(state.angle) * PLAYER_R;
    const y = Math.sin(state.angle) * PLAYER_R;
    const tangent = state.angle + Math.PI / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tangent);
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 8);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCenteredText(text, y, size, color, weight) {
    ctx.fillStyle = color;
    ctx.font = `${weight || 600} ${size}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 0, y);
  }

  function draw() {
    const pulse = state.mode === "play" ? 0.5 + 0.5 * Math.sin(state.time * 8) : 1;
    const bg = 9 + state.flash * 40;
    ctx.fillStyle = `rgb(${bg},${bg},${bg + 2})`;
    ctx.fillRect(0, 0, width, height);

    const sx = state.shake ? (Math.random() - 0.5) * state.shake : 0;
    const sy = state.shake ? (Math.random() - 0.5) * state.shake : 0;

    ctx.save();
    ctx.translate(width / 2 + sx, height / 2 + sy);

    const rot = state.world;
    const scale = Math.min(width, height) / 820;
    ctx.scale(scale, scale);

    ctx.fillStyle = "#111113";
    fillHex(CORE_R, rot);

    ctx.strokeStyle = `rgba(251, 191, 36, ${0.18 + pulse * 0.08})`;
    ctx.lineWidth = 2;
    strokeHex(CORE_R, rot);
    ctx.strokeStyle = "rgba(250, 250, 250, 0.06)";
    ctx.lineWidth = 1;
    strokeHex(PLAYER_R, rot);

    ctx.fillStyle = "#f4f4f5";
    for (const wall of state.walls) drawWall(wall, rot);

    ctx.fillStyle = "#fbbf24";
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.4, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (state.mode !== "dead") {
      ctx.fillStyle = "#fbbf24";
      ctx.shadowColor = "rgba(251, 191, 36, 0.55)";
      ctx.shadowBlur = 16;
      drawPlayer();
      ctx.shadowBlur = 0;
    }

    if (state.mode === "menu") {
      drawCenteredText("GYRE", 0, 42, "#fafafa", 700);
      drawCenteredText("left · right · tap", 36, 13, "#71717a", 500);
    } else if (state.mode === "play") {
      drawCenteredText(String(state.score), 0, 36, "#fafafa", 650);
    } else {
      drawCenteredText(String(state.score), -18, 44, "#fafafa", 700);
      drawCenteredText(
        state.best === state.score && state.score > 0 ? "best" : `best ${state.best}`,
        18,
        14,
        "#fbbf24",
        500
      );
      drawCenteredText("again", 48, 13, "#71717a", 500);
    }

    ctx.restore();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "Space") {
      e.preventDefault();
      input();
    } else if (e.code === "ArrowLeft" || e.code === "KeyA") {
      e.preventDefault();
      if (state.mode === "play") {
        state.dir = -1;
        ensureAudio();
        tone(420, 0.04, "square", 0.03);
      } else {
        input();
      }
    } else if (e.code === "ArrowRight" || e.code === "KeyD") {
      e.preventDefault();
      if (state.mode === "play") {
        state.dir = 1;
        ensureAudio();
        tone(520, 0.04, "square", 0.03);
      } else {
        input();
      }
    }
  });

  canvas.addEventListener("pointerdown", (e) => {
    input(e.clientX);
  });

  resize();
  requestAnimationFrame(frame);
})();
