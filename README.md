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

## Writing

The writing section is plain HTML with shared blog styles appended to `styles.css`.

Include `reading-progress.js` with `defer` on writing pages. It adds a thin reading-progress bar and section links from the article's top-level `h2` headings. Pages without enough content to scroll hide the bar. Copying an existing post preserves this setup.

1. Copy `lennar.html` to `company.html` for a short post. Update the title, description, publication date, thesis, sources, and disclosure.
2. Optionally copy `lennar-full.html` to `company-full.html` for the detailed analysis, with images in `assets/`. Update both cross-links; omit the full-analysis link when there is no longer version.
3. Add a fully linked `.post-entry` inside the `.post-list` in `blog.html`, including a `<time datetime="YYYY-MM-DD">` date.
4. Add dated changes inside `.post-updates`, keeping the original publication date intact.

The Lennar full analysis preserves the supplied quality-checked Word document's prose, two tables, twelve figures, and twenty source entries. The short version contains an editorial verdict; the full version remains the reference document.

Run `python3 tests/writing.py` to check navigation, local blog links, and the full analysis structure.
Run `node tests/reading-progress.cjs` to check reading progress and generated section links.
