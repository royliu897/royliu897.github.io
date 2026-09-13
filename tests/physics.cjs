const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=readFileSync(require('node:path').join(__dirname,'../interactive.js'),'utf8');
function harness({reduced=false,width=1280,height=800}={}){
  const events={},elements={};let raf,seed=42;
  const noop=()=>{};
  const ctx=new Proxy({},{get:(o,k)=>k in o?o[k]:noop});
  const element=id=>({width:0,height:0,offsetHeight:90,style:{},hidden:true,getContext:()=>ctx,focus:noop,setAttribute:noop,addEventListener:(name,fn)=>events[id+':'+name]=fn});
  for(const id of ['gameCanvas','footer','pauseBtn','resetBtn','foundCount','encounterPanel','encounterTitle','encounterImage','encounterLink','keepWalking'])elements[id]=element(id);
  const math=Object.create(Math);math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const sandbox={console,Math:math,innerWidth:width,innerHeight:height,navigator:{},Image:class{complete=false;naturalWidth=0;},document:{hidden:false,getElementById:id=>elements[id],createElement:()=>element('cache'),addEventListener:(name,fn)=>events['document:'+name]=fn},matchMedia:()=>({matches:reduced,addEventListener:noop}),requestAnimationFrame:fn=>raf=fn,setTimeout:noop,clearTimeout:noop};
  sandbox.window=sandbox;sandbox.addEventListener=(name,fn)=>events['window:'+name]=fn;
  vm.createContext(sandbox);vm.runInContext(source,sandbox);
  return {events,elements,run:code=>vm.runInContext(code,sandbox),frame:t=>raf(t),move:(x,y)=>events['gameCanvas:pointermove']({clientX:x,clientY:y,pointerType:'mouse'}),click:(x,y)=>events['gameCanvas:pointerdown']({clientX:x,clientY:y,pointerType:'touch',button:0}),key:key=>events['gameCanvas:keydown']({key,repeat:false,preventDefault:noop})};
}
const positions=[];
for(const fps of [30,60,144]){
  const h=harness();h.run('icons=[];trees=[]');h.move(1100,600);h.frame(0);
  for(let i=1;i<=fps/2;i++)h.frame(i*1000/fps);
  positions.push(h.run('({x:dog.x,y:dog.y,bend:grass.reduce((sum,t)=>sum+Math.abs(t.bend),0)})'));
}
for(const p of positions){assert(p.x>800);assert(Math.abs(p.x-positions[0].x)<.01);assert(Math.abs(p.bend-positions[0].bend)<.01);}
console.log('PASS: cursor leash and grass agree at 30/60/144 Hz');
const leash=harness();leash.run('icons=[];trees=[]');leash.move(1000,600);
leash.run('for(let i=0;i<1000;i++)updatePhysics(STEP)');
assert(leash.run('Math.hypot(dog.x-1000,dog.y-600)>65 && Math.hypot(dog.x-1000,dog.y-600)<80'));
console.log('PASS: dog follows without a click and stops within leash slack');

const touch=harness();touch.run('icons=[];trees=[]');touch.click(1000,600);
touch.run('for(let i=0;i<400;i++)updatePhysics(STEP)');
assert(touch.run('Math.hypot(dog.x-1000,dog.y-600)<8'));
assert.equal(touch.run('dog.targetAction'),null);
console.log('PASS: touch command reaches destination and sits once');

const burst=harness();burst.run('icons=[];trees=[]');burst.key(' ');
assert.equal(burst.run('particles.length'),95);burst.key(' ');assert.equal(burst.run('particles.length'),95);
burst.run('for(let i=0;i<600;i++)updatePhysics(STEP)');
assert.equal(burst.run('particles.length'),0);assert(burst.run('grass.every(t=>Math.abs(t.bend)<.01)'));
burst.run('for(let i=0;i<20;i++)emitBurst(dog.x,dog.y)');assert.equal(burst.run('particles.length'),320);
console.log('PASS: single exaggerated sit burst, spring recovery, particle expiry and cap');

function disturbance(speed){const h=harness();h.run(`icons=[];trees=[];grass=[{x:dog.x+10,y:dog.y,bend:0,vbend:0,compression:0}];dog.vx=${speed};updatePhysics(STEP)`);return h.run('grass[0].compression');}
assert(disturbance(10)>disturbance(2));console.log('PASS: faster running disturbs grass more');

const found=harness();assert.equal(found.run('icons.some(i=>i.revealed)'),false);
for(let i=0;i<5;i++){
  found.run(`dog.x=icons[${i}].x;dog.y=icons[${i}].y;updatePhysics(STEP)`);
  assert.equal(found.elements.encounterPanel.hidden,false);
  assert.equal(found.elements.encounterLink.href,found.run(`icons[${i}].path`));
  found.elements.keepWalking.onclick();assert.equal(found.elements.encounterPanel.hidden,true);
}
assert.equal(found.elements.foundCount.textContent,'5 / 5 found');
found.elements.resetBtn.onclick();assert.equal(found.elements.foundCount.textContent,'0 / 5 found');
assert(found.run('trees.every(t=>t.y<canvas.height*HORIZON_RATIO+(groundBottom()-canvas.height*HORIZON_RATIO)*.11 || t.x<canvas.width*.13 || t.x>canvas.width*.87)'));
console.log('PASS: all five hidden objects reveal correctly, keep-walking, reset, and center exclusion for trees');

const paused=harness({reduced:true,width:390,height:844});paused.move(350,650);paused.frame(0);const x=paused.run('dog.x');paused.frame(500);assert.equal(paused.run('dog.x'),x);
paused.elements.pauseBtn.onclick();paused.frame(600);paused.frame(700);assert(paused.run('dog.x')>x);
console.log('PASS: reduced-motion pause and resume on mobile');
