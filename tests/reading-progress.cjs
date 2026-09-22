const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../reading-progress.js'), 'utf8');

function setup(height, headings = []) {
  const events = {};
  const frames = [];
  const bounds = { top: 100, height };
  const content = { children: headings, getBoundingClientRect: () => bounds };
  const elements = [];
  let observer;
  const window = {
    innerHeight: 800,
    addEventListener: (name, callback) => { events[name] = callback; },
    requestAnimationFrame: callback => frames.push(callback),
    ResizeObserver: true,
  };
  const document = {
    querySelector: () => content,
    body: { append: element => elements.push(element) },
    createElement: tag => ({
      tag, style: { setProperty(name, value) { this[name] = value; } }, children: [], attributes: {},
      append(child) { this.children.push(child); },
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
    }),
  };
  class ResizeObserver {
    constructor(callback) { observer = callback; }
    observe(target) { assert.equal(target, content); }
  }
  vm.runInNewContext(source, { window, document, ResizeObserver });
  return { bounds, events, frames, progress: elements[0], resize: () => observer() };
}

let navigation;
const headings = ['Thesis', 'Value'].map((textContent, index) => ({
  tagName: 'H2', textContent,
  top: 100 + index * 900,
  getBoundingClientRect() { return { top: this.top }; },
  before(element) { navigation = element; },
}));
const page = setup(2400, headings);
assert.equal(navigation.attributes['aria-label'], 'Article sections');
assert.equal(navigation.children[1].href, '#section-1');
assert.equal(navigation.children[2].textContent, 'Value');
assert.equal(page.progress.style['--reading-progress'], 0);
assert.equal(navigation.children[1].attributes['aria-current'], 'location');
headings[1].top = 100;
page.bounds.top = -800;
page.events.scroll();
page.events.scroll();
assert.equal(page.frames.length, 1);
page.frames.shift()();
assert.equal(page.progress.style['--reading-progress'], 0.5);
assert.equal(navigation.children[1].attributes['aria-current'], undefined);
assert.equal(navigation.children[2].attributes['aria-current'], 'location');
page.bounds.top = -2000;
page.events.scroll();
page.frames.shift()();
assert.equal(page.progress.style['--reading-progress'], 1);
page.bounds.height = 4800;
page.resize();
page.frames.shift()();
assert.equal(page.progress.style['--reading-progress'], 0.5);
assert.equal(setup(600).progress.hidden, true);
console.log('Reading progress and section navigation tests passed.');
