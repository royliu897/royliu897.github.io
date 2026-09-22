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
4. Publish trades through the author-only update form on the short thesis, keeping the article's original publication date intact.

The Lennar full analysis preserves the supplied quality-checked Word document's prose, two tables, twelve figures, and twenty source entries. The short version contains an editorial verdict; the full version remains the reference document.

Run `python3 tests/writing.py` to check navigation, local blog links, and the full analysis structure.
Run `node tests/reading-progress.cjs` to check reading progress and generated section links.

### Public comments

Both articles have site-styled editors for public comments stored in GitHub Issues. GitHub login and writes are handled by a Cloudflare Worker. Only the short thesis has an author-only trade-update form. The full analysis has comments but no Updates section.

Follow [the Worker setup guide](comments-worker/README.md) to configure the OAuth app, custom domain, secrets and discussion IDs. The integration is not active until that service is deployed. Existing comments remain readable through a public GitHub fallback. No tokens belong in website files.

Sign in as `royliu897` to see the trade-update form. The Worker enforces author account ID `124701324`, adds the internal `[update]` marker, and prevents visitors from publishing updates. Existing marked updates remain compatible. Each signed-in user can edit their own messages directly on the page. Edits are checked against GitHub ownership and the discussion ID on the server.

Creation and edit times come from GitHub's API, not a date typed into the message or the visitor's clock. Each creation timestamp links to the original comment. These are GitHub-recorded account and time metadata, not cryptographic attestations of content or an immutable archive. Comments remain editable and deletable through GitHub, and repository owners can change the site code.

Enter trades directly, for example `Bought 10 shares @ $76.43`. The site displays the trade text followed by a muted timestamp without repeating the author's username. Both updates and comments use `Sep 22, 2026 · 14:03 UTC`, with seconds retained in the tooltip and machine-readable date. Article dates remain day-only. Include an execution date in the message when reporting an older trade.

The short and full analyses have separate discussions. New posts need an issue and a Worker `PAGES_JSON` entry. Copy the comment markup and `comments.js` script reference from an existing article. Moderate through the corresponding GitHub issue. Existing Utterances comments require no migration, but everyone must sign in through the new OAuth app.

The list and always-visible editor use the site's typography and background, without an iframe or third-party branding. Named links use `[link text](https://example.com)`. GitHub-rendered Markdown passes through an element and URL allowlist. Saving reloads the list. Failed saves preserve the draft and show an error.

With Node.js 22+, run `node tests/comments-worker.mjs` for server authorization tests. With Python Playwright and Chromium, run `python3 tests/comments.py` for browser checks of forms, ownership, editing, timestamps, sanitization, mobile layout and failed saves.

Automated tests mock GitHub. Verify the actual login, posting, editing and sign-out flow after deploying and configuring the service.
