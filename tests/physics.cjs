const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const source = readFileSync(
  require("node:path").join(__dirname, "../interactive.js"),
  "utf8",
);
function harness({ reduced = false, width = 1280, height = 800 } = {}) {
  const events = {},
    elements = {};
  let raf,
    seed = 42,
    timers = [];
  const noop = () => {};
  const ctx = new Proxy(
    { createRadialGradient: () => ({ addColorStop: noop }) },
    { get: (o, k) => (k in o ? o[k] : noop) },
  );
  for (const id of [
    "gameCanvas",
    "footer",
    "pauseBtn",
    "resetBtn",
    "sim-status",
  ])
    elements[id] = {
      offsetHeight: 90,
      style: {},
      getContext: () => ctx,
      focus: noop,
      setAttribute: noop,
      addEventListener: (name, fn) => (events[id + ":" + name] = fn),
    };
  const math = Object.create(Math);
  math.random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const sandbox = {
    console,
    Math: math,
    innerWidth: width,
    innerHeight: height,
    navigator: { deviceMemory: 8 },
    Image: class {
      complete = false;
      naturalWidth = 0;
    },
    document: {
      hidden: false,
      getElementById: (id) => elements[id],
      addEventListener: (name, fn) => (events["document:" + name] = fn),
    },
    matchMedia: () => ({ matches: reduced, addEventListener: noop }),
    requestAnimationFrame: (fn) => (raf = fn),
    setTimeout: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimeout: noop,
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = (name, fn) => (events["window:" + name] = fn);
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return {
    sandbox,
    events,
    elements,
    timers,
    run: (code) => vm.runInContext(code, sandbox),
    frame: (t) => raf(t),
    click: (x, y) =>
      events["gameCanvas:pointerdown"]({
        clientX: x,
        clientY: y,
        pointerType: "touch",
        button: 0,
      }),
  };
}

const results = [];
for (const fps of [30, 60, 144]) {
  const h = harness();
  h.run("trees=[]");
  h.frame(0);
  h.click(1000, 600);
  for (let f = 1; f <= fps / 2; f++) h.frame((f * 1000) / fps);
  const state = h.run(
    "({x:dog.x,y:dog.y,energy:leaves.reduce((a,l)=>a+l.z+Math.abs(l.vx)+Math.abs(l.vy),0)})",
  );
  results.push(state);
  assert(state.x > 740, "Touch target must use pointer coordinates");
}
for (const result of results.slice(1)) {
  assert(
    Math.abs(result.x - results[0].x) < 0.1,
    "Travel must agree across refresh rates",
  );
  assert(
    Math.abs(result.energy - results[0].energy) < 3,
    "Leaf response must agree across refresh rates",
  );
}
console.log("PASS: 30 / 60 / 144 Hz movement and leaf response", results);

const sit = harness();
sit.run("trees=[];dog.targetAction={x:dog.x,y:dog.y,icon:icons[0]}");
sit.frame(0);
for (let i = 1; i <= 120; i++) sit.frame((i * 1000) / 120);
assert.equal(
  sit.timers.length,
  1,
  "Arrival must schedule navigation exactly once",
);
assert.equal(sit.run("dog.targetAction"), null);
assert.equal(sit.run("dog.navigating"), true);
console.log("PASS: arrival clears destination and triggers navigation once");

const paused = harness({ reduced: true });
paused.frame(0);
const before = paused.run("dog.x");
paused.click(1100, 600);
paused.frame(1000);
assert.equal(paused.run("dog.x"), before);
assert.equal(paused.elements.pauseBtn.textContent, "Resume");
paused.elements.pauseBtn.onclick();
assert.equal(paused.run("paused"), false);
console.log("PASS: reduced-motion starts paused and resume works");

const settle = harness();
settle.run(
  "trees=[];leaves=[{x:500,y:500,z:20,vx:3,vy:2,vz:2,vrX:.1,vrY:0,rotX:0,rotY:0,waft:2}]",
);
settle.run("for(let i=0;i<2400;i++)updatePhysics(STEP,i*STEP*1000)");
assert.equal(settle.run("leaves[0].z"), 0);
assert.equal(settle.run("leaves[0].vx"), 0);
assert.equal(settle.run("leaves[0].vy"), 0);
console.log("PASS: airborne leaves settle completely");

const mobile = harness({ width: 390, height: 844 });
mobile.run(
  'trees=[];keys.add("ArrowLeft");keys.add("ArrowDown");for(let i=0;i<2400;i++)updatePhysics(STEP,i*STEP*1000)',
);
assert.equal(mobile.run("dog.x"), 18);
assert(mobile.run("dog.y<=groundBottom()-10"));
const loc = mobile.run("dog.y");
mobile.elements.pauseBtn.onclick();
mobile.frame(0);
mobile.frame(1000);
assert.equal(mobile.run("dog.y"), loc);
console.log("PASS: keyboard respects world boundaries; pause freezes motion");

const route = harness();
route.run(
  "dog.x=400;dog.y=550;trees=[{x:600,y:550,collisionRadius:28}];dog.targetAction={x:800,y:550};for(let i=0;i<2400;i++)updatePhysics(STEP,i*STEP*1000)",
);
assert(
  route.run("Math.hypot(dog.x-800,dog.y-550)<5"),
  "Dog should reach a target on the far side of a tree",
);
console.log("PASS: dog steers around an intervening trunk");
