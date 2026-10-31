# Research SEC service

Separate from the comments/publishing Worker. GitHub Pages calls https://research-api.royrliu.com. No credentials, notes, or user documents are sent. Company lookup uses the SEC ticker directory. Company routes accept numeric CIK identifiers and legacy ticker aliases; all upstream URLs are fixed SEC endpoints.

GET /directory returns company names, tickers, exchanges and CIKs. GET /company/CIK63908/filings?from=2015&to=2026 loads filing metadata and overlapping historical submission indexes. GET /company/CIK63908/facts loads SEC companyfacts and returns standard US-GAAP, IFRS and DEI concepts. The frontend fetches only when a catalogue, financial tool or selected filing needs data. Concurrent identical requests share a promise.

Cloudflare edge cache: company directory 24 hours, filing indexes 5 minutes, historical index files 24 hours, facts 1 hour. Cache is opportunistic and per edge location; it is not permanent archival storage. Refresh clears browser memory and reloads through that cache. Saved panels retain their loaded observations and source accession IDs. Quarterly series include standalone reported quarters (and balance-sheet instants); YTD cash-flow values are not silently treated as quarter values. Unmapped taxonomy concepts are retained for review; OCR and full segment reconstruction are not implemented.

Rate bindings limit each client to 60 requests/minute and upstream cache misses to 30/minute per Cloudflare location. These are abuse controls, not a global SEC-rate guarantee. Upstream addresses and methods are fixed, redirects are refused, and failures surface without bundled-snapshot fallback. API responses use a declared SEC User-Agent. Automatic ingestion uses the existing Workers account and SQLite Durable Objects; normal account quotas apply.

Development/deploy: `npx wrangler dev` / `npx wrangler deploy` from this directory with the existing Cloudflare login. The frontend points to the deployed API; localhost port 8766 is an allowed development origin. Tests: `node tests/live-sec.mjs` from repo root. The comments Worker configuration and secrets are untouched.

The Overview uses reported financial history, not forecasts or analyst ratings. Currency selection is explicit; the initial currency has the greatest revenue observation coverage. Per-share values retain the filing basis (no ADR conversion). Missing quarters are not synthesized from YTD figures. Filing lists include foreign issuer forms. Presentations and other external documents can be added by URL; investor-relations exhibits are not automatically crawled.


## Automatic primary filings

`GET /company/CIK{cik}/primary-filings?ticker={ticker}&since={revision}` queues discovery and returns the last processed snapshot immediately. One SQLite Durable Object per issuer stores its resumable work queue, compiled observations and source receipts. The binding and migration live in `wrangler.toml`; deployment requires `npm ci` and `npx wrangler deploy`. No local process, new API key or scheduled maintenance is required. Workers development and preview URLs are disabled.

The queue reads recent and historical SEC submissions, then prioritizes the latest 10-Q and annual 10-K/20-F/40-F filings from 2008 onward (up to 22 annuals and 32 filings including amendments). Each alarm handles one discovery step or filing. Inline XBRL is streamed; older XBRL uses the original instance, presentation, labels and schema. Only unambiguous consolidated statement tables/roles and verified issuer, period, unit and dimensional contexts qualify. Existing mapping and security-class rules still apply. Receipts retain accession, URL and source hashes. Unknown labels are not guessed, parent-only schedules are excluded, and no missing number becomes zero.

Completed supplements persist between visits. Warm requests with the current revision return only small metadata. Browsers share concurrent annual/quarter requests, reuse baseline facts, and poll only for changed supplements. Five-minute metadata refresh discovers new accessions without downloading completed filings again. Rate limits pause and resume the queue; transient legacy components are saved between retries. Failures retain last-good values and are recorded as partial coverage. Updating `primary-ingestion-version.mjs` retries documents under changed extraction rules.

This improves retrieval coverage, not a guarantee that every template field is disclosed or mapped. Oversized, ambiguous and pre-XBRL documents can remain unsupported; quarterly foreign 6-K and fund N-CSR extraction are outside this queue. Korea and Taiwan retain their separate native-source adapters. The existing source review exposes evidence without new report banners.

Regression checks: `node --test tests/*.mjs` from the repository root after installing this package and `scripts/report-frontend` dependencies. Actual unchanged Gap inline HTML and FedEx legacy XML fixtures test both formats. The ingestion tests also cover persistence, discovery, new accessions, retries, revision-only responses, issuer conflicts and immutable last-good data.
