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

Use `/write.html` to draft, preview and publish while signed in as the site author. Drafts autosave in the current browser and can be downloaded/imported as JSON. Publishing creates the article, updates the writing index and creates its discussion automatically. Published articles can be reopened in the editor. Investment theses include author-only trade updates; analysis and note pages have comments only. See [the setup guide](comments-worker/README.md#owner-only-writing) for credentials, deployment and recovery details.

For manually maintained pages:

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

Follow [the Worker setup guide](comments-worker/README.md) to configure identity-only OAuth and a separate writer GitHub App installed only on this repository with Issues and Contents write permissions. Comment requests still use Issues-only tokens; only author publishing uses Contents write access. Visitors grant no repository access. The guide includes migration from the previous broad-scope OAuth app. Existing comments remain readable through a public GitHub fallback. No tokens belong in website files.

Sign in as `royliu897` to see the trade-update form. The Worker enforces author account ID `124701324`, adds the internal `[update]` marker, and prevents visitors from publishing updates. Existing marked updates remain compatible. New messages are stored by the App bot with signed visitor attribution, checked against the discussion and content before allowing on-page edits. Legacy messages retain their original authors and offer their owners an Edit on GitHub link.

Creation and edit times come from GitHub's API, not the visitor's clock. Each timestamp links to the original comment. The site verifies attribution for App-posted messages, but neither that attribution nor the timestamp verifies a trade or creates an immutable archive. Direct GitHub edits to App-posted messages invalidate their attribution. Use the website to edit and GitHub to delete abusive messages.

Enter trades directly, for example `Bought 10 shares @ $76.43`. The site displays the trade text followed by a muted timestamp without repeating the author's username. Both updates and comments use `Sep 22, 2026 · 14:03 UTC`, with seconds retained in the tooltip and machine-readable date. Article dates remain day-only. Include an execution date in the message when reporting an older trade.

The short and full analyses have separate discussions. Editor-published posts register their discussions automatically. Manually added posts need an issue and a Worker `PAGES_JSON` entry. Copy the comment markup and `comments.js` script reference from an existing article. Moderate through the corresponding GitHub issue. Existing Utterances comments require no migration, but everyone must sign in through the new OAuth app.

The list and always-visible editor use the site's typography and background, without an iframe or third-party branding. Named links use `[link text](https://example.com)`. GitHub-rendered Markdown passes through an element and URL allowlist. Saving reloads the list. Failed saves preserve the draft and show an error.

With Node.js 22+, run `node tests/comments-worker.mjs` for server authorization tests. With Python Playwright and Chromium, run `python3 tests/comments.py` for browser checks of forms, ownership, editing, timestamps, sanitization, mobile layout and failed saves.

Automated tests mock GitHub. Verify the actual login, posting, editing and sign-out flow after deploying and configuring the service.

Run `node tests/publishing.mjs` for publishing and conflict checks, and `python3 tests/editor.py` for browser editor checks (Playwright and Chromium required).


## Research desk

`research-desk.html` is a report-centered workspace using the site's shared styling. Open a PDF locally; it is stored in IndexedDB in the current browser and is not sent to the website or committed to this repository. PDF.js is self-hosted under `assets/research/vendor` (Apache-2.0; version and license included), and loaded only when a document is opened.

Notes, valuation models, imported financial series, company selection, drawer states, pinned drawers and tool-column width stay in browser storage. Notes export as a notebook or as the existing writing editor's JSON format. **Open in writing editor** creates a new draft in `roy-writing-drafts-v1` without overwriting existing drafts, then opens that draft by ID. The existing author login, preview and explicit publication flow remain in place. Localhost and the live domain have separate storage; use notebook export/import to transfer notes. Clearing browser data removes local notes and uploaded PDFs.

The report remains visible beside independently expandable drawers. Drag a drawer grip to the right column or bottom dock; the same grip supports arrow keys. Drag separators or use their arrow keys to resize. Each drawer has a position/size menu. Empty docks reappear as drop targets while dragging; the report uses their space when empty. Reset layout restores defaults. Compact density and layout preferences persist. Quick review uses a brief company note; Detailed review exposes business, risk, valuation and source sections that transfer into the writing draft. The tools stack below the report on small screens.

Financials accepts numeric `year,value` CSV, or pasted comma/tab-separated two-column data with that header. Values and units are explicit; automatic PDF table extraction is not implemented. PDF text can be selected and copied, but reading order may need cleanup. Revenue, GAAP net income and diluted EPS load lazily from SEC annual-fact snapshots for all five companies. Annual observations retain source-accession links; values are not Value Line adjusted earnings.

SEC document tabs use accession numbers and primary-document URLs from `assets/research/library/{ticker}.json`. Static GitHub Pages uses dated snapshots rather than browser SEC API requests. Clicking or dragging a filing into the report area opens a closable tab; closed tabs can be reopened. Tabs persist per company under `roy-report-tabs-v1`. Publishers such as the SEC can block iframe embedding; Open original remains available. Local PDFs still use the built-in PDF viewer. Copyrighted Value Line reports are not deployed. The former historical archive UI has been removed; unlinked study assets remain in the repository.

The desk has `noindex`, which is not access control. Notes and imported PDFs remain local.

Checks: `node tests/research-desk.mjs` (Node 22+), `python3 tests/writing.py`, and the existing publishing/worker tests. Browser checks cover PDF rendering, switching companies, drawer persistence, table plotting, date selection and growth display. Draft handoff is covered by unit checks; production author login/publication has not been exercised for this change.


### Chart controls and next research layer

Financials uses `Past [n or all] years`, clipped to available annual observations. Create graph opens a main-viewer graph tab plus its source filing. Axes name the units; a data table preserves full numeric values and source links. Annual change requires the immediately preceding calendar-year observation and a positive prior value. Indexed values require a positive starting value. Imported data can be pasted or loaded from CSV.

Calculator and dashboard expressions accept case-insensitive `m`, `b`, and `t` suffixes. Results abbreviate millions, billions and trillions; calculations retain full precision. Valuation separates projected price from discounted value, including dividends. Reinvestment assumes annual end-of-year dividends and a linear P/E path; it is distinct from cash-flow IRR. Charts remain opt-in.

Range inputs accept years, calendar quarters (`2025 Q2` or `Q2 2025`), or exact ISO dates. Existing exact model ranges are preserved when editing. Filing labels show calendar quarter of period end, not inferred fiscal-quarter numbering. 8-Ks show their filing dates and group under calendar quarters. Events retain exact dates internally. Persistent instruction text is omitted; formulas and source definitions are documented in code/tests. Run `node tests/research-qos.mjs` for suffix, period and range regressions.

### Detailed research library

Detailed review provides a collapsible, resizable source catalogue and Report, Modeling and Notes tabs. It contains a date/form-filtered SEC document catalogue (10-K, 10-Q, 8-K and proxies, including amendments) back to 2015 for the five supported companies. The catalogue uses actual primary document names and accession numbers from SEC submissions and older history partitions. It indexes documents and links to them; it does not download full filings into the browser or extract arbitrary PDF prose. Filing events use factual form/period titles; custom event titles and links can identify a particular earnings release, company announcement, or Fed decision.

Selected US-GAAP concepts are stored separately. Annual observations preserve fiscal end dates and their source accession and filing dates. Duration observations must span 330–380 days; latest filing wins for each period end, bounded by the snapshot cutoff. Instantaneous concepts preserve their reported period ends. This is a latest-reported/revised dataset, not original-vintage investment backtesting data. Values are in raw reported units, not automatically millions. Missing concepts and definition changes are not silently merged.

Refresh source snapshots with `python3 scripts/refresh-research.py --as-of YYYY-MM-DD --start 2015`. The script writes separate metadata and facts snapshots after fetching a company; each individual file is replaced atomically. A partial failure can leave different snapshot dates across companies. Refresh both files together before deploying. No scheduled refresh is configured.

The economic catalogue offers FEDFUNDS, CPIAUCSL and TTLHH, with units, adjustment/frequency descriptions, provider links and date-filled CSV downloads. `python3 scripts/refresh-economic.py --as-of YYYY-MM-DD` fetches all three and replaces the snapshot only if all succeed. The browser loads the dated snapshot without API keys or CORS proxies. Economic observations can be revised, and the snapshot is not an ALFRED vintage. More series can be imported from two-column date/value or FRED CSV files. Missing FRED observations are omitted, not zero-filled.

Company-specific series, event selections, chart settings and saved models use the separate `roy-research-library-v1` browser key. Export/import library backs up this collection separately from notes. Charts support dates, points/lines, indexing and observation-to-observation change. Raw overlays require matching unit labels. Selected events render as dated linked titles and vertical markers; their presence does not assert causation. Models support arithmetic over A/B, exact-date joins or explicitly selected calendar-year aggregation. Units and fiscal/calendar alignment are the user's explicit choices; partial calendar years use available observations. Saved models recalculate on request and can be reused as templates; downstream models do not automatically recalculate.

Fullscreen uses the browser API where available, with an in-page fallback. Escape and the visible exit button leave fullscreen. Light/dark preference persists independently, initially following the system preference. PDFs retain their original document colors. Notes remain plain text with improved spacing, contrast and focus treatment.

Run `node tests/research-library.mjs` for imports, safe URLs, invalid dates, aggregation, denominator/missing-date handling and source-cutoff selection. Browser validation covers loading real source data, creating a net-margin model, adding an event, per-company isolation, theme switching and Escape.


### Review-stage layouts

Quick review uses a viewport-height report, collapsed secondary drawers on the right, and a bottom dock with notes and calculator open by default. Grips move drawers between docks and reorder them; arrow keys provide a keyboard alternative. Right-column and bottom-dock separators resize the regions. Pointer dragging and explicit Move to bottom/right menu actions work even when a dock is empty. Bottom drawer width choices divide the available space. Review status sits in the Notes header, leaving full-width writing space. Detailed review has exactly Report, Modeling, and Notes tabs. The source catalogue can be resized or fully hidden with Hide sources, then restored with Show sources. These layouts move the same live controls rather than duplicating state. On narrow screens controls stack and permit necessary scrolling.

Report supports inline HTTP(S) websites and a locally stored PDF. Publishers may block framing; the original link remains available. Local PDFs are not uploaded. Fit page supplements Fit width.

Document checkboxes constrain newly added annual financial series to selected accession numbers. With no selection, all annual filings in the dated snapshot are eligible. Existing series are not rewritten when selection changes. Metadata is fetched when detailed review opens. Financial facts are fetched and cached only after pressing Load selected financial fields; there is no browser call to the SEC API and no OCR or AI extraction service.

### Modeling dashboard

The + editor creates compact calculations, line graphs or bar graphs. Variables map to loaded fields, and expressions use numbers, +, -, *, /, ^, parentheses, min, max, abs, lag, growth and avg. One expression per line produces up to eight series. A calculation returns the last finite result in the visible date range. Template hints explain variable meanings. Add data source preserves the panel draft while opening the loader. Preview value checks a formula without saving; every input change invalidates the preview. Numeric-only calculations hide data/date controls. Legends wrap for multiple expressions. Derived units must be stated explicitly; the tool does not infer dimensional compatibility.

Inputs join on matching dates by default. Optional calendar-year last/mean/sum aggregation uses available observations only. Lag, growth and average windows count common observations, **not calendar years**. Growth requires a positive prior value. Lookback can include observations before the display window. Undefined results are omitted and counted. Lines connect available observations across gaps. Long line series use extrema-preserving rendering samples; calculations use all observations. Bar charts require at most 250 observations per series rather than silently dropping bars.

Panels can be reordered, resized, edited, duplicated and removed. Current dashboards autosave per company under `roy-dashboards-v1`; named saves retain data and event copies, and JSON export/import backs up panels, source data and annotations. Clear and other dashboard edits support session Undo. Custom formula templates are reusable across companies. Notes retain their existing independent storage and writing-editor handoff.

Calculations run in a lazily created module Worker, with memoized rolling expressions and a work limit. Rendered results are cached, hidden modeling views do not recalculate, and switching companies terminates pending worker calculations. No third-party chart framework is loaded. Dashboard data stays in browser storage unless exported or published through the existing writing flow.

Evidence lists source filing links and the expression/alignment applied. Structured SEC values do not include a page crop: the interface explicitly marks the visual excerpt unavailable instead of implying visual verification. Arbitrary webpage/PDF extraction and automatic event interpretation remain outside this implementation.

Additional checks: `node tests/formulas.mjs` covers arithmetic, ratios, rolling functions, date intersection, prior-period lookback, invalid inputs and discounting. Use Node 22 or later.

UI regression checks for the polish pass: empty-bottom drag recovery and menu relocation; detailed Reset layout keeps Notes visible; full catalogue hide/show; compact note sizing; constant formulas after clearing dates; preview invalidation; draft preservation during source loading; five-series legends.


### Live research data

Research Desk uses the separate [SEC Worker](sec-worker/README.md) for on-demand filing lists and financial facts. The existing comments/publishing Worker is unchanged. Select filings to make their fields and filing-date annotations available; open names to read documents independently. Saved models and notes remain browser-local. The writing footer links to the desk.

Manual series accept comma-separated values, a starting year or quarter, currency symbols and m/b/t suffixes. Empty entries preserve missing periods. Fullscreen requests native fullscreen, with a full-window fallback where unavailable. Embedded documents have independent minus/plus/reset zoom controls; Escape exits fullscreen. Drag panel handles into the reader (or onto Report in detailed review) to open live panels as tabs. Closing a panel tab restores its original position.
