const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d", { alpha: false });

// --- ENGINE TUNING ---
// Scale simulation density to the screen and device instead of paying for a
// desktop-sized scene everywhere. This keeps the field lush without wasting frames.
const getLeafCount = () => {
  const areaScale = (innerWidth * innerHeight) / (1440 * 900);
  const memoryScale =
    navigator.deviceMemory && navigator.deviceMemory <= 4 ? 0.72 : 1;
  return Math.round(
    Math.max(900, Math.min(5200, 4000 * areaScale * memoryScale)),
  );
};
const HORIZON_RATIO = 0.45;

const DOG_W = 32,
  DOG_H = 40;

// Select Sky Folder (1-8) ONCE on load
const SKY_ID = Math.ceil(Math.random() * 8);

function sceneScale() {
  return Math.max(0.4, Math.min(1, canvas.width / 1000));
}
function groundBottom() {
  return canvas.height - document.getElementById("footer").offsetHeight;
}

let mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
// Added 'navigating' flag to fix the infinite reload loop
let dog = {
  kind: "dog",
  x: 200,
  y: 0,
  vx: 0,
  vy: 0,
  row: 1,
  col: 0,
  facing: "right",
  sitLock: false,
  targetAction: null,
  navigating: false,
};
let leaves = [];
let icons = [];
let trees = [];
let lastTime = null;
let accumulator = 0;
let simulationTime = 0;
const STEP = 1 / 120;
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
let paused = motionPreference.matches;
let sitRemaining = 0;
const keys = new Set();
let effects = [];
let hoveredIcon = null;
let vignette = null;
const DEPTH_BUCKET_COUNT = 40;
const depthBuckets = Array.from({ length: DEPTH_BUCKET_COUNT }, () => []);
const GRAVITY = 0.39;

function updateVignette() {
  vignette = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    canvas.height * 0.15,
    canvas.width / 2,
    canvas.height / 2,
    canvas.width * 0.72,
  );
  vignette.addColorStop(0, "rgba(10,18,12,0)");
  vignette.addColorStop(1, "rgba(7,12,8,.22)");
}

const assets = {
  dog: { src: "assets/dog.png", img: new Image() },
  fallLeaf: { src: "assets/fall_leaf.png", img: new Image() },
  springLeaf: { src: "assets/spring_leaf.png", img: new Image() },
  treeGreen: { src: "assets/tree_green.png", img: new Image() },
  treeFall: { src: "assets/tree_fall.png", img: new Image() },
  complete_floor: { src: "assets/complete_floor.png", img: new Image() },

  car: { src: "assets/car.png", img: new Image(), path: "lhr.html" },
  gamma: { src: "assets/gamma.png", img: new Image(), path: "research.html" },
  racket: { src: "assets/racket.png", img: new Image(), path: "tennis.html" },
  stock: { src: "assets/stock.png", img: new Image(), path: "stocks.html" },

  // Sky Layers
  sky1: {
    src: `assets/Clouds/Clouds ${SKY_ID}/1.png`,
    img: new Image(),
    speed: 0.0,
  },
  sky2: {
    src: `assets/Clouds/Clouds ${SKY_ID}/2.png`,
    img: new Image(),
    speed: 0.05,
  },
  sky3: {
    src: `assets/Clouds/Clouds ${SKY_ID}/3.png`,
    img: new Image(),
    speed: 0.1,
  },
  sky4: {
    src: `assets/Clouds/Clouds ${SKY_ID}/4.png`,
    img: new Image(),
    speed: 0.2,
  },
};

function initLeaves() {
  leaves = [];
  const topLimit = canvas.height * HORIZON_RATIO;
  const botLimit = groundBottom();
  const leafCount = getLeafCount();
  for (let i = 0; i < leafCount; i++) {
    leaves.push({
      kind: "leaf",
      x: Math.random() * canvas.width,
      y: topLimit + Math.random() * (botLimit - topLimit),
      z: 0,
      vz: 0,
      vx: 0,
      vy: 0,
      rotX: Math.random() * 6,
      rotY: Math.random() * 6,
      vrX: 0,
      vrY: 0,
      type: Math.random() > 0.5 ? "fallLeaf" : "springLeaf",
      frame: Math.floor(Math.random() * 5),
      size: (24 + Math.random() * 34) * sceneScale(),
      skew: (Math.random() - 0.5) * 0.1,
      waft: Math.random() * 10,
      layer: Math.random(),
      chaos: 0.5 + Math.random(),
    });
  }
  document.getElementById("sim-status").textContent = paused
    ? "Paused. You can still use the project links below."
    : "Click or tap to walk. Arrow keys work too.";
}

function initEnvironment() {
  trees = [];
  const topLimit = canvas.height * HORIZON_RATIO;
  const botLimit = groundBottom();

  for (let i = 0; i < 5; i++) {
    const isFall = Math.random() > 0.5;
    const type = isFall ? "treeFall" : "treeGreen";
    const frameIndex = Math.floor(Math.random() * 15);
    const sx = (frameIndex % 4) * 128;
    const sy = Math.floor(frameIndex / 4) * 128;
    const pad = 50;
    trees.push({
      kind: "tree",
      type: type,
      sx: sx,
      sy: sy,
      x: canvas.width * [0.18, 0.06, 0.52, 0.94, 0.84][i],
      y: i % 2 === 0 ? topLimit + 12 : botLimit - 12,
      scale: 1.2 + Math.random() * 0.5,
      collisionRadius: Math.min(28, (botLimit - topLimit) * 0.09),
    });
  }
}

function init() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.imageSmoothingEnabled = false;
  updateVignette();
  dog.x = canvas.width * 0.5;
  dog.y = canvas.height * 0.76;
  mouse = { x: dog.x, y: dog.y };
  Object.keys(assets).forEach((key) => (assets[key].img.src = assets[key].src));
  initLeaves();
  initEnvironment();
  const topLimit = canvas.height * HORIZON_RATIO;
  const botLimit = groundBottom();
  const ids = ["car", "gamma", "racket", "stock"];
  icons = ids.map((id, i) => ({
    kind: "icon",
    id,
    x: (i + 1) * (canvas.width / 5),
    y: topLimit + (botLimit - topLimit) * 0.4,
    rot: (Math.random() - 0.5) * 0.2,
    revealed: false,
    path: assets[id].path,
  }));
  canvas.addEventListener("pointermove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (
      dog.navigating ||
      paused ||
      (e.pointerType === "mouse" && e.button !== 0)
    )
      return;
    canvas.focus({ preventScroll: true });
    const top = canvas.height * HORIZON_RATIO,
      bottom = groundBottom();
    if (e.clientY < top || e.clientY > bottom) return;
    mouse = { x: e.clientX, y: e.clientY };
    const icon = icons.find(
      (i) =>
        Math.hypot(mouse.x - i.x, mouse.y - i.y) <
        Math.min(55, canvas.width / 10),
    );
    let target = {
      x: icon ? icon.x : mouse.x,
      y: icon ? icon.y : mouse.y,
      icon,
    };
    for (const tree of trees) {
      const dx = target.x - tree.x,
        dy = target.y - tree.y,
        d = Math.hypot(dx, dy);
      if (d < tree.collisionRadius + 12) {
        const angle = d
          ? Math.atan2(dy, dx)
          : Math.atan2(dog.y - tree.y, dog.x - tree.x);
        target.x = tree.x + Math.cos(angle) * (tree.collisionRadius + 14);
        target.y = tree.y + Math.sin(angle) * (tree.collisionRadius + 14);
      }
    }
    target.x = Math.max(18, Math.min(canvas.width - 18, target.x));
    target.y = Math.max(top + 10, Math.min(bottom - 10, target.y));
    dog.sitLock = false;
    sitRemaining = 0;
    dog.targetAction = target;
    effects.push({
      x: target.x,
      y: target.y,
      born: simulationTime,
      color: icon ? "#f2f5b5" : "#fff",
    });
  });
  canvas.addEventListener("keydown", (e) => {
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)
    ) {
      e.preventDefault();
      if (e.key === " ") {
        if (!e.repeat) setPaused(!paused);
        return;
      }
      keys.add(e.key);
      if (!dog.navigating) {
        dog.targetAction = null;
        dog.sitLock = false;
        sitRemaining = 0;
      }
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key));
  window.addEventListener("blur", () => keys.clear());
  canvas.addEventListener("blur", () => keys.clear());
  document.addEventListener("visibilitychange", () => {
    lastTime = null;
    accumulator = 0;
    keys.clear();
  });
  motionPreference.addEventListener("change", (e) => setPaused(e.matches));
  document.getElementById("pauseBtn").onclick = () => setPaused(!paused);
  document.getElementById("resetBtn").onclick = () => {
    initLeaves();
    effects = [];
  };
  setPaused(paused);
  requestAnimationFrame(loop);
}

window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  dog.navigating = false;
  dog.sitLock = false;
  dog.targetAction = null;
  dog.vx = 0;
  dog.vy = 0;
  lastTime = null;
  accumulator = 0;
});

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.imageSmoothingEnabled = false;
    updateVignette();
    dog.targetAction = null;
    dog.vx = 0;
    dog.vy = 0;
    dog.x = Math.max(18, Math.min(dog.x, canvas.width - 18));
    dog.y = Math.max(
      canvas.height * HORIZON_RATIO + 10,
      Math.min(dog.y, groundBottom() - 10),
    );
    initLeaves();
    initEnvironment();
    const top = canvas.height * HORIZON_RATIO;
    const bottom = groundBottom();
    icons.forEach((icon, i) => {
      icon.x = (i + 1) * (canvas.width / 5);
      icon.y = top + (bottom - top) * 0.4;
    });
  }, 180);
});

function setPaused(value) {
  paused = value;
  lastTime = null;
  accumulator = 0;
  keys.clear();
  document.getElementById("pauseBtn").textContent = paused ? "Resume" : "Pause";
  document
    .getElementById("pauseBtn")
    .setAttribute("aria-pressed", String(paused));
  document.getElementById("sim-status").textContent = paused
    ? "Paused. You can still use the project links below."
    : "Click or tap to walk. Arrow keys work too.";
}

function triggerSitExplosion(x, y, icon) {
  if (dog.sitLock || dog.navigating) return;
  dog.sitLock = true;
  dog.targetAction = null;
  dog.vx = 0;
  dog.vy = 0;
  dog.x = x;
  dog.y = y;
  sitRemaining = 0.5;
  if (icon) {
    dog.navigating = true;
    icon.revealed = true;
    setTimeout(() => {
      window.location.href = icon.path;
    }, 600);
  }
  for (const leaf of leaves) {
    const dx = leaf.x - x,
      dy = leaf.y - y,
      d = Math.hypot(dx, dy);
    if (d >= 85) continue;
    const strength = 1 - d / 85,
      angle = d ? Math.atan2(dy, dx) : leaf.waft;
    leaf.vx += Math.cos(angle) * 3 * strength;
    leaf.vy += Math.sin(angle) * 2 * strength;
    leaf.vz = Math.max(leaf.vz, 3.5 * strength + 0.8);
    leaf.vrX = Math.sin(leaf.waft) * 0.16;
    leaf.layer = 1;
  }
}

// Fixed 120 Hz updates keep acceleration, drag, and contact impulses independent
// of display refresh rate. Rendering never mutates the simulation.
function updatePhysics(seconds, time) {
  const dt = seconds * 60,
    top = canvas.height * HORIZON_RATIO + 10,
    bottom = groundBottom() - 10;
  if (dog.sitLock && !dog.navigating) {
    sitRemaining -= seconds;
    if (sitRemaining <= 0) dog.sitLock = false;
  }
  if (!dog.sitLock && !dog.navigating) {
    let tx = dog.x,
      ty = dog.y;
    if (dog.targetAction) {
      tx = dog.targetAction.x;
      ty = dog.targetAction.y;
    }
    let dx = tx - dog.x,
      dy = ty - dog.y,
      dist = Math.hypot(dx, dy);
    const kx = Number(keys.has("ArrowRight")) - Number(keys.has("ArrowLeft"));
    const ky = Number(keys.has("ArrowDown")) - Number(keys.has("ArrowUp"));
    let desiredX = 0,
      desiredY = 0;
    if (kx || ky) {
      const n = Math.hypot(kx, ky);
      desiredX = (kx / n) * 6;
      desiredY = (ky / n) * 6;
    } else if (dog.targetAction && dist < 4) {
      triggerSitExplosion(tx, ty, dog.targetAction.icon);
    } else if (dist > 1) {
      const speed = Math.min(6, dist * 0.12);
      desiredX = (dx / dist) * speed;
      desiredY = (dy / dist) * speed;
    }
    // Steer around trunks before contact, then slide along the surface.
    for (const tree of trees) {
      const ox = tree.x - dog.x,
        oy = tree.y - dog.y,
        d = Math.hypot(ox, oy),
        r = tree.collisionRadius + 12;
      const speed = Math.hypot(desiredX, desiredY);
      if (d < r + 65 && d > 0 && speed > 0) {
        const dot = (ox * desiredX + oy * desiredY) / (d * speed);
        if (dot > 0.35) {
          const side = ox * dy - oy * dx >= 0 ? 1 : -1;
          const weight = (1 - Math.max(0, d - r) / 65) * 0.9;
          desiredX = desiredX * (1 - weight) - (oy / d) * side * speed * weight;
          desiredY = desiredY * (1 - weight) + (ox / d) * side * speed * weight;
        }
      }
    }
    const ease = 1 - Math.exp(-seconds * 12);
    dog.vx += (desiredX - dog.vx) * ease;
    dog.vy += (desiredY - dog.vy) * ease;
    dog.x += dog.vx * dt;
    dog.y += dog.vy * dt;
    for (const tree of trees) {
      const dx = dog.x - tree.x,
        dy = dog.y - tree.y,
        d = Math.hypot(dx, dy),
        r = tree.collisionRadius + 8;
      if (d < r) {
        const nx = d ? dx / d : 1,
          ny = d ? dy / d : 0;
        dog.x = tree.x + nx * r;
        dog.y = tree.y + ny * r;
        const v = dog.vx * nx + dog.vy * ny;
        if (v < 0) {
          dog.vx -= v * nx;
          dog.vy -= v * ny;
        }
      }
    }
    dog.x = Math.max(18, Math.min(canvas.width - 18, dog.x));
    dog.y = Math.max(top, Math.min(bottom, dog.y));
    if (Math.abs(dog.vx) > 0.1) dog.facing = dog.vx > 0 ? "right" : "left";
  }
  const speed = Math.hypot(dog.vx, dog.vy);
  for (const leaf of leaves) {
    const dx = leaf.x - dog.x,
      dy = leaf.y - (dog.y + 10),
      d = Math.hypot(dx, dy),
      r = 50 * (0.5 + leaf.y / canvas.height);
    if (d < r && speed > 0.4 && !dog.sitLock && leaf.z < 12) {
      const force = (1 - d / r) * Math.min(speed, 6) * dt;
      leaf.vx += (d ? dx / d : 1) * force * 0.8;
      leaf.vy += (d ? dy / d : 0) * force * 0.5;
      leaf.vz = Math.max(leaf.vz, Math.min(3, force + 1));
      leaf.vrX = Math.sin(leaf.waft) * 0.1;
    }
    if (
      leaf.z > 0 ||
      Math.abs(leaf.vx) + Math.abs(leaf.vy) + Math.abs(leaf.vz) > 0.025
    ) {
      const airborne = leaf.z > 0 || leaf.vz > 0;
      const drag = Math.exp(-(airborne ? 1.8 : 13) * seconds);
      leaf.vx *= drag;
      leaf.vy *= drag;
      if (airborne) {
        leaf.vz -= GRAVITY * dt;
        leaf.vx += Math.sin(time * 0.0015 + leaf.waft) * 0.025 * dt;
      }
      leaf.x += leaf.vx * dt;
      leaf.y += leaf.vy * dt;
      leaf.z += leaf.vz * dt;
      leaf.rotX += leaf.vrX * dt;
      leaf.rotY += leaf.vrY * dt;
      if (leaf.z <= 0) {
        leaf.z = 0;
        leaf.vz = 0;
        leaf.vrX *= Math.exp(-16 * seconds);
      }
      leaf.x = Math.max(0, Math.min(canvas.width, leaf.x));
      leaf.y = Math.max(top - 10, Math.min(bottom + 10, leaf.y));
    } else {
      leaf.vx = 0;
      leaf.vy = 0;
      leaf.vz = 0;
      leaf.z = 0;
    }
  }
}

function drawSkyLayer(layer, dt, time) {
  if (!layer.img.complete || !layer.img.naturalWidth) return;
  const imgRatio = layer.img.width / layer.img.height;
  const drawH = canvas.height;
  const drawW = drawH * imgRatio;
  let wind = time * 0.02 * layer.speed;
  let parallax = dog.x * 0.2 * layer.speed;
  let totalX = -(wind + parallax) % drawW;
  ctx.drawImage(layer.img, totalX, 0, drawW, drawH);
  ctx.drawImage(layer.img, totalX + drawW, 0, drawW, drawH);
  if (totalX + drawW < canvas.width) {
    ctx.drawImage(layer.img, totalX + drawW * 2, 0, drawW, drawH);
  }
}

function loop(timestamp) {
  const elapsed =
    lastTime === null ? 0 : Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;
  if (!paused && !document.hidden) {
    accumulator += elapsed;
    while (accumulator + 1e-10 >= STEP) {
      simulationTime += STEP * 1000;
      updatePhysics(STEP, simulationTime);
      accumulator -= STEP;
    }
  }
  const time = simulationTime,
    dt = 1;
  const topLimit = canvas.height * HORIZON_RATIO;
  const botLimit = groundBottom();

  ctx.fillStyle = "#87CEEB";
  ctx.fillRect(0, 0, canvas.width, topLimit);
  drawSkyLayer(assets.sky1, dt, time);
  drawSkyLayer(assets.sky2, dt, time);
  drawSkyLayer(assets.sky3, dt, time);
  drawSkyLayer(assets.sky4, dt, time);

  if (
    assets.complete_floor.img.complete &&
    assets.complete_floor.img.naturalWidth
  ) {
    ctx.drawImage(
      assets.complete_floor.img,
      0,
      topLimit,
      canvas.width,
      botLimit - topLimit,
    );
  } else {
    ctx.fillStyle = "#11150d";
    ctx.fillRect(0, topLimit, canvas.width, botLimit - topLimit);
  }

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, botLimit, canvas.width, canvas.height - botLimit);
  // Ground plane ends above the persistent navigation.

  hoveredIcon =
    icons.find(
      (i) =>
        Math.hypot(mouse.x - i.x, mouse.y - i.y) <
        Math.min(55, canvas.width / 10),
    ) || null;
  canvas.style.cursor = hoveredIcon ? "pointer" : "crosshair";
  let moving = Math.hypot(dog.vx, dog.vy) > 0.4;

  if (dog.sitLock) {
    dog.row = 3;
    dog.col = (dog.facing === "right" ? 0 : 2) + (Math.floor(time / 300) % 2);
  } else if (!moving) {
    dog.row = 1;
    dog.col = (dog.facing === "right" ? 0 : 2) + (Math.floor(time / 500) % 2);
  } else {
    dog.row = dog.facing === "right" ? 6 : 7;
    dog.col = Math.floor(time / 100) % 4;
  }

  // Linear-time approximate depth ordering. Forty narrow bands are visually
  // indistinguishable from a full sort here, without thousands of allocations.
  for (const bucket of depthBuckets) bucket.length = 0;
  const depthRange = Math.max(1, botLimit - topLimit);
  const addToDepthBucket = (obj) => {
    const normalized = (obj.y - topLimit) / depthRange;
    const index = Math.max(
      0,
      Math.min(
        DEPTH_BUCKET_COUNT - 1,
        Math.floor(normalized * DEPTH_BUCKET_COUNT),
      ),
    );
    depthBuckets[index].push(obj);
  };
  for (const leaf of leaves) addToDepthBucket(leaf);
  for (const icon of icons) addToDepthBucket(icon);
  for (const tree of trees) addToDepthBucket(tree);
  addToDepthBucket(dog);

  for (let bucketIndex = 0; bucketIndex < DEPTH_BUCKET_COUNT; bucketIndex++) {
    for (const obj of depthBuckets[bucketIndex]) {
      let p = 0.5 + obj.y / canvas.height;

      if (obj.kind === "leaf") {
        let l = obj;
        if (assets[l.type].img.complete && assets[l.type].img.naturalWidth) {
          ctx.setTransform(
            p * Math.sin(l.rotX),
            l.skew,
            0,
            p * Math.cos(l.rotY),
            l.x,
            l.y - l.z,
          );
          ctx.drawImage(
            assets[l.type].img,
            l.frame * 16,
            0,
            16,
            16,
            -l.size / 2,
            -l.size / 2,
            l.size,
            l.size,
          );
        }
      } else if (obj.kind === "tree") {
        let t = obj;
        if (assets[t.type].img.complete && assets[t.type].img.naturalWidth) {
          let renderSize = 128 * t.scale * p * sceneScale();
          ctx.setTransform(1, 0, 0, 1, t.x, t.y);
          ctx.drawImage(
            assets[t.type].img,
            t.sx,
            t.sy,
            128,
            128,
            -renderSize / 2,
            -renderSize + 10 * p,
            renderSize,
            renderSize,
          );
        }
      } else if (obj.kind === "icon") {
        let i = obj;
        if (assets[i.id].img.complete && assets[i.id].img.naturalWidth) {
          const isHovered = hoveredIcon === i;
          const pulse = isHovered ? 1.06 + Math.sin(time * 0.008) * 0.025 : 1;
          ctx.setTransform(p * sceneScale(), 0, 0, p * sceneScale(), i.x, i.y);
          ctx.globalAlpha = isHovered ? 0.32 : 0.14;
          ctx.fillStyle = isHovered ? "#f3f6b0" : "#ffffff";
          ctx.beginPath();
          ctx.ellipse(0, 42, 70 * pulse, 25 * pulse, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.scale(pulse, pulse);
          ctx.rotate(i.rot);
          ctx.drawImage(assets[i.id].img, -60, -60, 120, 120);
          if (i.revealed) {
            ctx.setTransform(1, 0, 0, 1, i.x, i.y + 80 * p);
            ctx.fillStyle = "white";
            ctx.font = "italic 15px Georgia";
            ctx.textAlign = "center";
            ctx.fillText(i.id.toUpperCase(), 0, 0);
          }
        }
      } else {
        if (assets.dog.img.complete && assets.dog.img.naturalWidth) {
          let dW = 135 * p * sceneScale(),
            dH = 160 * p * sceneScale();
          ctx.setTransform(1, 0, 0, 1, dog.x, dog.y);
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = "#10140e";
          ctx.beginPath();
          ctx.ellipse(0, 3, dW * 0.3, dH * 0.1, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.drawImage(
            assets.dog.img,
            dog.col * DOG_W,
            dog.row * DOG_H,
            DOG_W,
            DOG_H,
            -dW / 2,
            -dH * 0.7,
            dW,
            dH,
          );
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  // Crisp click ripples make commands feel immediate while the dog travels.
  effects = effects.filter((effect) => time - effect.born < 650);
  effects.forEach((effect) => {
    const age = (time - effect.born) / 650;
    ctx.globalAlpha = (1 - age) * 0.65;
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(
      effect.x,
      effect.y,
      12 + age * 48,
      5 + age * 18,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  });
  ctx.globalAlpha = 1;

  // Subtle grade ties the separate pixel assets into one scene.
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  requestAnimationFrame(loop);
}
init();
