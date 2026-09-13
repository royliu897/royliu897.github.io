const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d", { alpha: false });
const HORIZON_RATIO = 0.45,
  STEP = 1 / 120,
  MAX_PARTICLES = 320;
const DOG_W = 32,
  DOG_H = 40;
const PROJECTS = [
  { id: "logiqal", label: "Logiqal", path: "logiqal.html" },
  { id: "car", label: "Longhorn Racing", path: "lhr.html" },
  { id: "gamma", label: "GAMMA Lab", path: "research.html" },
  { id: "racket", label: "Tennis", path: "tennis.html" },
  { id: "stock", label: "Stock Modeling", path: "stocks.html" },
];
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
let paused = motionPreference.matches,
  encounter = null;
let lastTime = null,
  accumulator = 0,
  simulationTime = 0,
  sitRemaining = 0,
  stepDistance = 0;
let mouse = { x: 0, y: 0 },
  pointerActive = false;
let dog = {
  kind: "dog",
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  facing: "right",
  row: 1,
  col: 0,
  targetAction: null,
  sitLock: false,
};
let grass = [],
  trees = [],
  icons = [],
  patches = [],
  particles = [];
const keys = new Set();
const SKY_ID = 1 + Math.floor(Math.random() * 8);
const assets = {};
for (const [id, src] of Object.entries({
  dog: "dog.png",
  leaf: "spring_leaf.png",
  fallLeaf: "fall_leaf.png",
  treeGreen: "tree_green.png",
  treeFall: "tree_fall.png",
  terrain: "overworld-grass.png",
  car: "car.png",
  gamma: "gamma.png",
  racket: "racket.png",
  stock: "stock.png",
  logiqal: "logiqal-icon.svg",
})) {
  assets[id] = new Image();
  assets[id].src = "assets/" + src;
}
for (let i = 1; i <= 4; i++) {
  assets["sky" + i] = new Image();
  assets["sky" + i].src = `assets/Clouds/Clouds ${SKY_ID}/${i}.png`;
}
const floorCache = document.createElement("canvas");
let floorDirty = true;
assets.terrain.onload = () => {
  floorDirty = true;
};
function sceneScale() {
  return Math.max(0.45, Math.min(1, canvas.width / 1000));
}
function groundBottom() {
  return canvas.height - document.getElementById("footer").offsetHeight;
}
function ready(img) {
  return img.complete && img.naturalWidth > 0;
}
function random(a, b) {
  return a + Math.random() * (b - a);
}

// Small original pixel tufts: cached once, then bent as whole sprites.
// Ground tiles beneath them come from Beast's CC0 Grass Biome atlas.
function makeGrassSprite(variant) {
  const image = document.createElement("canvas");
  image.width = 20;
  image.height = 24;
  const c = image.getContext("2d");
  const colors = [
    ["#35513b", "#52754c", "#86a95f"],
    ["#3e5b3d", "#63844f", "#a4bb6b"],
    ["#304b39", "#4b714b", "#87a565"],
  ][variant];
  for (let i = 0; i < 5; i++) {
    const x = 2 + i * 4,
      h = [12, 18, 22, 16, 11][(i + variant) % 5];
    const lean = [-4, -2, 0, 2, 4][i];
    c.fillStyle = colors[0];
    c.beginPath();
    c.moveTo(x - 1, 24);
    c.lineTo(x - 1, 24 - h * 0.5);
    c.lineTo(x + lean, 24 - h);
    c.lineTo(x + 3, 24 - h * 0.4);
    c.lineTo(x + 3, 24);
    c.fill();
    c.fillStyle = colors[1];
    c.fillRect(x, 24 - Math.floor(h * 0.65), 2, Math.floor(h * 0.65));
    c.fillStyle = colors[2];
    c.fillRect(x + lean, 24 - h, 1, Math.max(2, Math.floor(h * 0.35)));
  }
  return image;
}
const grassSprites = [0, 1, 2].map(makeGrassSprite);

function buildWorld(reset = true) {
  const scale = sceneScale(),
    top = canvas.height * HORIZON_RATIO,
    bottom = groundBottom(),
    height = bottom - top;
  patches = PROJECTS.map((project, i) => ({
    x: canvas.width * (0.16 + (i * 0.68) / (PROJECTS.length - 1)),
    y: top + height * (i % 2 ? 0.57 : 0.43),
    rx: canvas.width * 0.13,
    ry: height * 0.3,
  }));
  const old = icons;
  icons = PROJECTS.map((project, i) => ({
    ...project,
    kind: "icon",
    x: patches[i].x + random(-0.24, 0.24) * patches[i].rx,
    y: patches[i].y + random(-0.2, 0.2) * patches[i].ry,
    revealed: !reset && Boolean(old[i]?.revealed),
  }));
  grass = [];
  const spacing = Math.max(12, 21 * scale);
  for (
    let row = 0, y = top + 18 * scale;
    y < bottom + 12 * scale;
    y += spacing * 0.65, row++
  ) {
    for (let x = 0; x < canvas.width + spacing; x += spacing) {
      const gx = x + (row % 2) * spacing * 0.5 + random(-4, 4) * scale,
        gy = y + random(-3, 3) * scale;
      const distance = Math.min(
        ...patches.map(
          (p) => ((gx - p.x) / p.rx) ** 2 + ((gy - p.y) / p.ry) ** 2,
        ),
      );
      if (distance > random(0.85, 1.22)) continue;
      grass.push({
        kind: "grass",
        x: gx,
        y: gy,
        bend: 0,
        vbend: 0,
        compression: 0,
        variant: Math.floor(random(0, 3)),
        phase: random(0, Math.PI * 2),
        size: random(0.85, 1.15) * scale,
      });
    }
  }
  grass.sort((a, b) => a.y - b.y);
  trees = [];
  // The center stays open for encounters. Tree positions vary within edge bands.
  for (let i = 0; i < 6; i++) {
    const back = i < 3;
    const x = back
      ? random(0.08, 0.92) * canvas.width
      : (i % 2 ? random(0.04, 0.12) : random(0.88, 0.96)) * canvas.width;
    const y = back
      ? top + random(0, 0.1) * height
      : top + random(0.6, 0.95) * height;
    const frame = Math.floor(random(0, 15));
    trees.push({
      kind: "tree",
      x,
      y,
      frame,
      type: Math.random() < 0.7 ? "treeGreen" : "treeFall",
      size: random(1.2, 1.7),
      collisionRadius: 23 * scale,
    });
  }
  particles = [];
  floorDirty = true;
  updateFoundCount();
}

function updateFoundCount() {
  document.getElementById("foundCount").textContent =
    `${icons.filter((i) => i.revealed).length} / ${PROJECTS.length} found`;
}
function setPaused(value) {
  paused = value;
  keys.clear();
  lastTime = null;
  accumulator = 0;
  document.getElementById("pauseBtn").textContent = paused ? "Resume" : "Pause";
  document
    .getElementById("pauseBtn")
    .setAttribute("aria-pressed", String(paused));
}
function emitBurst(x, y, strength = 1, count = 70) {
  const scale = sceneScale();
  for (let i = 0; i < count; i++) {
    const angle = random(0, Math.PI * 2),
      speed = random(1.8, 6) * strength * scale;
    particles.push({
      x,
      y,
      z: random(0, 7) * scale,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.55,
      vz: random(3, 7) * strength * scale,
      rotation: random(0, 6),
      spin: random(-0.15, 0.15),
      size: random(15, 30) * scale,
      age: 0,
      life: random(0.85, 1.65),
      frame: Math.floor(random(0, 5)),
      fall: Math.random() < 0.2,
    });
  }
  if (particles.length > MAX_PARTICLES)
    particles.splice(0, particles.length - MAX_PARTICLES);
}
function sit() {
  if (dog.sitLock) return;
  dog.sitLock = true;
  dog.targetAction = null;
  dog.vx = 0;
  dog.vy = 0;
  sitRemaining = 0.8;
  emitBurst(dog.x, dog.y, 1.25, 95);
  const radius = 115 * sceneScale();
  for (const tuft of grass) {
    const dx = tuft.x - dog.x,
      dy = tuft.y - dog.y,
      d = Math.hypot(dx, dy);
    if (d < radius) {
      const power = 1 - d / radius;
      tuft.vbend += (dx < 0 ? -1 : 1) * power * 15;
      tuft.compression = Math.max(tuft.compression, power * 0.85);
    }
  }
}
function reveal(icon) {
  if (encounter || icon.revealed) return;
  icon.revealed = true;
  encounter = icon;
  sit();
  document.getElementById("encounterTitle").textContent = icon.label;
  document.getElementById("encounterImage").src = assets[icon.id].src;
  document.getElementById("encounterLink").href = icon.path;
  document.getElementById("encounterPanel").hidden = false;
  pointerActive = false;
  keys.clear();
  updateFoundCount();
  document.getElementById("encounterLink").focus({ preventScroll: true });
}
function dismissEncounter() {
  encounter = null;
  document.getElementById("encounterPanel").hidden = true;
  dog.sitLock = false;
  sitRemaining = 0;
  pointerActive = false;
  canvas.focus({ preventScroll: true });
}

function updatePhysics(seconds) {
  const dt = seconds * 60,
    scale = sceneScale();
  const top = canvas.height * HORIZON_RATIO + 12 * scale,
    bottom = groundBottom() - 16 * scale;
  if (dog.sitLock && !encounter) {
    sitRemaining -= seconds;
    if (sitRemaining <= 0) dog.sitLock = false;
  }
  let desiredX = 0,
    desiredY = 0;
  if (!dog.sitLock && !encounter) {
    const kx = Number(keys.has("ArrowRight")) - Number(keys.has("ArrowLeft"));
    const ky = Number(keys.has("ArrowDown")) - Number(keys.has("ArrowUp"));
    if (kx || ky) {
      const length = Math.hypot(kx, ky);
      desiredX = (kx / length) * 8 * scale;
      desiredY = (ky / length) * 8 * scale;
    } else if (dog.targetAction || pointerActive) {
      const target = dog.targetAction || mouse;
      const dx = target.x - dog.x,
        dy = Math.max(top, Math.min(bottom, target.y)) - dog.y,
        d = Math.hypot(dx, dy);
      const leash = dog.targetAction ? 0 : 75 * scale;
      if (dog.targetAction && d < 7 * scale) sit();
      else if (d > leash) {
        const speed = dog.targetAction
          ? Math.min(9 * scale, d * 0.22)
          : Math.min(14 * scale, (d - leash) * 0.065);
        desiredX = (dx / d) * speed;
        desiredY = (dy / d) * speed;
      }
    }
    // Anticipate trunks, then remove velocity into their circular footprints.
    for (const tree of trees) {
      const dx = tree.x - dog.x,
        dy = tree.y - dog.y,
        d = Math.hypot(dx, dy),
        speed = Math.hypot(desiredX, desiredY);
      if (
        d > 0 &&
        d < tree.collisionRadius + 50 * scale &&
        speed > 0.1 &&
        (dx * desiredX + dy * desiredY) / (d * speed) > 0.45
      ) {
        const side = dx * desiredY - dy * desiredX >= 0 ? 1 : -1;
        const weight =
          0.75 * (1 - Math.max(0, d - tree.collisionRadius) / (50 * scale));
        desiredX = desiredX * (1 - weight) - (dy / d) * side * speed * weight;
        desiredY = desiredY * (1 - weight) + (dx / d) * side * speed * weight;
      }
    }
  }
  const ease = 1 - Math.exp(-seconds * 14);
  dog.vx += (desiredX - dog.vx) * ease;
  dog.vy += (desiredY - dog.vy) * ease;
  if (dog.sitLock || encounter) {
    dog.vx = 0;
    dog.vy = 0;
  }
  const oldX = dog.x,
    oldY = dog.y;
  dog.x += dog.vx * dt;
  dog.y += dog.vy * dt;
  for (const tree of trees) {
    const dx = dog.x - tree.x,
      dy = dog.y - tree.y,
      d = Math.hypot(dx, dy),
      r = tree.collisionRadius + 8 * scale;
    if (d < r) {
      const nx = d ? dx / d : 1,
        ny = d ? dy / d : 0;
      dog.x = tree.x + nx * r;
      dog.y = tree.y + ny * r;
      const into = dog.vx * nx + dog.vy * ny;
      if (into < 0) {
        dog.vx -= into * nx;
        dog.vy -= into * ny;
      }
    }
  }
  dog.x = Math.max(15 * scale, Math.min(canvas.width - 15 * scale, dog.x));
  dog.y = Math.max(top, Math.min(bottom, dog.y));
  if (Math.abs(dog.vx) > 0.1) dog.facing = dog.vx > 0 ? "right" : "left";
  const speed = Math.hypot(dog.vx, dog.vy),
    contact = 44 * scale;
  let inGrass = false;
  for (const tuft of grass) {
    const dx = tuft.x - dog.x,
      dy = tuft.y - dog.y,
      d = Math.hypot(dx, dy);
    if (d < contact && speed > 0.3) {
      inGrass = true;
      const force = (1 - d / contact) * Math.min(1, speed / (9 * scale));
      tuft.vbend +=
        ((dx < 0 ? -1 : 1) * 0.6 + (dog.vx / (14 * scale)) * 0.4) *
        force *
        45 *
        seconds;
      tuft.compression = Math.max(tuft.compression, force * 0.7);
    }
    // Damped spring returns each rooted tuft to its original orientation.
    tuft.vbend += (-85 * tuft.bend - 11 * tuft.vbend) * seconds;
    tuft.bend += tuft.vbend * seconds;
    tuft.bend = Math.max(-1.1, Math.min(1.1, tuft.bend));
    tuft.compression *= Math.exp(-3 * seconds);
  }
  if (inGrass) {
    stepDistance += Math.hypot(dog.x - oldX, dog.y - oldY);
    if (stepDistance > 18 * scale) {
      stepDistance = 0;
      emitBurst(
        dog.x,
        dog.y,
        0.18 + speed / (35 * scale),
        Math.min(5, Math.ceil(speed / (2 * scale))),
      );
    }
  }
  for (const icon of icons) {
    if (
      !icon.revealed &&
      !encounter &&
      Math.hypot(dog.x - icon.x, dog.y - icon.y) < 30 * scale
    )
      reveal(icon);
  }
  for (const p of particles) {
    p.age += seconds;
    p.vz -= 0.25 * scale * dt;
    const drag = Math.exp(-seconds * 1.8);
    p.vx *= drag;
    p.vy *= drag;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.rotation += p.spin * dt;
    if (p.z < 0) {
      p.z = 0;
      p.vz = 0;
      p.vx *= Math.exp(-10 * seconds);
      p.vy *= Math.exp(-10 * seconds);
    }
  }
  particles = particles.filter((p) => p.age < p.life);
}

function paintFloor() {
  floorCache.width = canvas.width;
  floorCache.height = canvas.height;
  const c = floorCache.getContext("2d");
  c.imageSmoothingEnabled = false;
  const top = canvas.height * HORIZON_RATIO,
    bottom = groundBottom(),
    tile = 48 * sceneScale();
  c.fillStyle = "#819957";
  c.fillRect(0, top, canvas.width, bottom - top);
  if (ready(assets.terrain))
    for (let y = top; y < bottom; y += tile)
      for (let x = 0; x < canvas.width; x += tile)
        c.drawImage(assets.terrain, 0, 0, 16, 16, x, y, tile, tile);
  c.fillStyle = "rgba(42,70,43,.12)";
  for (const p of patches) {
    c.beginPath();
    c.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
    c.fill();
  }
  floorDirty = false;
}
function drawSky() {
  ctx.fillStyle = "#9fc2ca";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 1; i <= 4; i++) {
    const img = assets["sky" + i];
    if (!ready(img)) continue;
    const h = canvas.height,
      w = (h * img.naturalWidth) / img.naturalHeight;
    const offset =
      -(simulationTime * (i - 1) * 0.0005 + dog.x * 0.012 * (i - 1)) % w;
    for (let x = offset; x < canvas.width; x += w)
      ctx.drawImage(img, x, 0, w, h);
  }
}
function drawObject(obj) {
  const scale = sceneScale(),
    p = 0.5 + obj.y / canvas.height;
  ctx.save();
  if (obj.kind === "grass") {
    const sway = paused
      ? 0
      : Math.sin(simulationTime * 0.0015 + obj.phase) * 0.035;
    const bend = obj.bend + sway,
      size = obj.size * p;
    ctx.translate(obj.x, obj.y);
    ctx.transform(1, 0, -bend * 0.5, 1 - obj.compression * 0.45, 0, 0);
    ctx.drawImage(
      grassSprites[obj.variant],
      -21 * size,
      -48 * size,
      42 * size,
      48 * size,
    );
  } else if (obj.kind === "tree") {
    const img = assets[obj.type],
      size = 128 * obj.size * scale * p;
    if (ready(img))
      ctx.drawImage(
        img,
        (obj.frame % 4) * 128,
        Math.floor(obj.frame / 4) * 128,
        128,
        128,
        obj.x - size / 2,
        obj.y - size + 10 * scale,
        size,
        size,
      );
  } else if (obj.kind === "icon") {
    const size = 92 * scale * p;
    ctx.fillStyle = "rgba(14,32,22,.25)";
    ctx.beginPath();
    ctx.ellipse(
      obj.x,
      obj.y + 8 * scale,
      size * 0.5,
      size * 0.17,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    if (ready(assets[obj.id]))
      ctx.drawImage(
        assets[obj.id],
        obj.x - size / 2,
        obj.y - size * 0.85,
        size,
        size,
      );
  } else {
    let row, col;
    const moving = Math.hypot(dog.vx, dog.vy) > 0.4;
    if (dog.sitLock) {
      row = 3;
      col =
        (dog.facing === "right" ? 0 : 2) +
        (Math.floor(simulationTime / 300) % 2);
    } else if (moving) {
      row = dog.facing === "right" ? 6 : 7;
      col = Math.floor(simulationTime / 85) % 4;
    } else {
      row = 1;
      col =
        (dog.facing === "right" ? 0 : 2) +
        (Math.floor(simulationTime / 500) % 2);
    }
    const w = 125 * scale * p,
      h = 148 * scale * p;
    ctx.fillStyle = "rgba(14,32,22,.24)";
    ctx.beginPath();
    ctx.ellipse(dog.x, dog.y + 4 * scale, w * 0.3, h * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    if (ready(assets.dog))
      ctx.drawImage(
        assets.dog,
        col * DOG_W,
        row * DOG_H,
        DOG_W,
        DOG_H,
        dog.x - w / 2,
        dog.y - h * 0.77,
        w,
        h,
      );
  }
  ctx.restore();
}
function draw() {
  drawSky();
  if (floorDirty) paintFloor();
  ctx.drawImage(floorCache, 0, 0);
  // Rooted grass is generated in row order; merge a handful of actors into it.
  const actors = [...trees, ...icons.filter((i) => i.revealed), dog].sort(
    (a, b) => a.y - b.y,
  );
  let actor = 0;
  for (const tuft of grass) {
    while (actor < actors.length && actors[actor].y <= tuft.y)
      drawObject(actors[actor++]);
    drawObject(tuft);
  }
  while (actor < actors.length) drawObject(actors[actor++]);
  for (const p of particles) {
    const img = p.fall ? assets.fallLeaf : assets.leaf;
    if (!ready(img)) continue;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (p.life - p.age) / 0.4);
    ctx.translate(p.x, p.y - p.z);
    ctx.rotate(p.rotation);
    ctx.drawImage(
      img,
      p.frame * 16,
      0,
      16,
      16,
      -p.size / 2,
      -p.size / 2,
      p.size,
      p.size,
    );
    ctx.restore();
  }
}
function loop(timestamp) {
  const elapsed =
    lastTime === null ? 0 : Math.min(0.1, (timestamp - lastTime) / 1000);
  lastTime = timestamp;
  if (!paused && !document.hidden) {
    accumulator += elapsed;
    while (accumulator + 1e-10 >= STEP) {
      simulationTime += STEP * 1000;
      updatePhysics(STEP);
      accumulator -= STEP;
    }
  }
  draw();
  requestAnimationFrame(loop);
}
function resize(reset = false) {
  const oldWidth = canvas.width || innerWidth,
    oldHeight = canvas.height || innerHeight;
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  ctx.imageSmoothingEnabled = false;
  dog.x = reset ? canvas.width * 0.5 : (dog.x / oldWidth) * canvas.width;
  dog.y = reset
    ? canvas.height * HORIZON_RATIO +
      (groundBottom() - canvas.height * HORIZON_RATIO) * 0.84
    : Math.min((dog.y / oldHeight) * canvas.height, groundBottom() - 20);
  dog.targetAction = null;
  dog.vx = 0;
  dog.vy = 0;
  mouse = { x: dog.x, y: dog.y };
  pointerActive = false;
  buildWorld(reset);
}
canvas.addEventListener("pointermove", (e) => {
  if (encounter) return;
  mouse = { x: e.clientX, y: e.clientY };
  if (e.pointerType === "mouse") {
    pointerActive = true;
  } else if (e.buttons) {
    dog.targetAction = { ...mouse };
  }
});
canvas.addEventListener("pointerleave", () => {
  pointerActive = false;
});
canvas.addEventListener("pointerdown", (e) => {
  if (paused || encounter || (e.pointerType === "mouse" && e.button !== 0))
    return;
  canvas.focus({ preventScroll: true });
  mouse = { x: e.clientX, y: e.clientY };
  if (e.clientY < canvas.height * HORIZON_RATIO || e.clientY > groundBottom())
    return;
  dog.targetAction = { ...mouse };
  pointerActive = e.pointerType === "mouse";
});
canvas.addEventListener("keydown", (e) => {
  if (
    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "p", "P"].includes(
      e.key,
    )
  ) {
    e.preventDefault();
    if (e.key === " ") {
      if (!paused && !encounter && !e.repeat) sit();
      return;
    }
    if (e.key.toLowerCase() === "p") {
      if (!e.repeat) setPaused(!paused);
      return;
    }
    if (!encounter) {
      keys.add(e.key);
      dog.targetAction = null;
    }
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key));
window.addEventListener("blur", () => {
  keys.clear();
  pointerActive = false;
});
canvas.addEventListener("blur", () => keys.clear());
document.addEventListener("visibilitychange", () => {
  lastTime = null;
  accumulator = 0;
  keys.clear();
  pointerActive = false;
});
motionPreference.addEventListener("change", (e) => setPaused(e.matches));
document.getElementById("pauseBtn").onclick = () => setPaused(!paused);
document.getElementById("keepWalking").onclick = dismissEncounter;
document.getElementById("resetBtn").onclick = () => {
  dismissEncounter();
  resize(true);
};
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => resize(false), 150);
});
resize(true);
setPaused(paused);
requestAnimationFrame(loop);
