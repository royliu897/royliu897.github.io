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

Include `reading-progress.js` with `defer` on writing pages. It adds a vertical reading-progress indicator and section links from the article's top-level `h2` headings, highlighting the current section. Wide screens show a fixed left-hand outline. Smaller screens keep the links above the article and the indicator at the left edge. Pages without enough content to scroll hide the indicator. Copying an existing post preserves this setup.

1. Copy `lennar.html` to `company.html` for a short post. Update the title, description, publication date, thesis, sources, and disclosure.
2. Optionally copy `lennar-full.html` to `company-full.html` for the detailed analysis, with images in `assets/`. Update both cross-links; omit the full-analysis link when there is no longer version.
3. Add a fully linked `.post-entry` inside the `.post-list` in `blog.html`, including a `<time datetime="YYYY-MM-DD">` date.
4. Add dated changes inside `.post-updates`, keeping the original publication date intact.

The Lennar full analysis preserves the supplied quality-checked Word document's prose, two tables, twelve figures, and twenty source entries. The short version contains an editorial verdict; the full version remains the reference document.

Run `python3 tests/writing.py` to check navigation, local blog links, and the full analysis structure.
Run `node tests/reading-progress.cjs` to check reading progress and generated section links.

### Public comments

Each article's Updates section includes [Utterances](https://utteranc.es/), which stores public comments in GitHub Issues with author names and timestamps. Visitors need a GitHub account to post. Author updates remain separate above the discussion.

Before comments can be posted, install or configure the [Utterances GitHub app](https://github.com/apps/utterances) for `royliu897/royliu897.github.io`. Keep the repository public with Issues enabled. The app creates a thread when the first visitor comments. No tokens belong in the website files.

Threads are matched by page pathname, so the short and full analyses have separate discussions. Preserve published filenames to preserve thread mappings. When copying a post, keep the embed and update the fallback GitHub search link to the new pathname. Moderate comments through the corresponding GitHub issue. The embedded widget uses its own light theme, with the surrounding heading, spacing and dividers styled by the site.

After deployment and app authorization, test signing in, posting a comment, reloading the page, and viewing the same comment while signed out. Automated tests check the embed configuration, not the third-party login or posting flow.
