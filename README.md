# Roy Liu’s personal website

Static HTML, CSS, and a canvas garden. Published with GitHub Pages at https://royrliu.com.

## Local preview

From this directory:

```sh
python3 -m http.server 8765
```

Open http://localhost:8765. No build or package installation is needed.

## Physics checks

With Node.js 18 or newer:

```sh
node tests/physics.cjs
```

The deterministic harness checks movement and leaf impulses at 30, 60, and 144 Hz, single-trigger arrival, reduced motion, settling, keyboard bounds, pause, and tree avoidance. It mocks rendering; inspect the garden in a browser for visual changes.

The simulation lives in `interactive.js`, updates at 120 Hz, and draws once per animation frame. Arrow keys move the dog while the canvas has focus; Space pauses. Pointer commands select a destination. Project links remain available independently of the canvas.
