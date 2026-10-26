# Research SEC service

Separate from the comments/publishing Worker. GitHub Pages calls https://research-api.royrliu.com. No credentials, notes, or user documents are sent. Company lookup uses the SEC ticker directory. Company routes accept numeric CIK identifiers and legacy ticker aliases; all upstream URLs are fixed SEC endpoints.

GET /directory returns company names, tickers, exchanges and CIKs. GET /company/CIK63908/filings?from=2015&to=2026 loads filing metadata and overlapping historical submission indexes. GET /company/CIK63908/facts loads SEC companyfacts and returns standard US-GAAP, IFRS and DEI concepts. The frontend fetches only when a catalogue, financial tool or selected filing needs data. Concurrent identical requests share a promise.

Cloudflare edge cache: company directory 24 hours, filing indexes 5 minutes, historical index files 24 hours, facts 1 hour. Cache is opportunistic and per edge location; it is not permanent archival storage. Refresh clears browser memory and reloads through that cache. Saved panels retain their loaded observations and source accession IDs. Quarterly series include standalone reported quarters (and balance-sheet instants); YTD cash-flow values are not silently treated as quarter values. Custom taxonomy/segment parsing and OCR are not implemented.

Rate bindings limit each client to 60 requests/minute and upstream cache misses to 30/minute per Cloudflare location. These are abuse controls, not a global SEC-rate guarantee. Upstream addresses and methods are fixed, redirects are refused, and failures surface without bundled-snapshot fallback. API responses use a declared SEC User-Agent. No paid storage resources are provisioned; normal Workers usage applies.

Development/deploy: `npx wrangler dev` / `npx wrangler deploy` from this directory with the existing Cloudflare login. The frontend points to the deployed API; localhost port 8766 is an allowed development origin. Tests: `node tests/live-sec.mjs` from repo root. The comments Worker configuration and secrets are untouched.

The Overview uses reported financial history, not forecasts or analyst ratings. Currency selection is explicit; the initial currency has the greatest revenue observation coverage. Per-share values retain the filing basis (no ADR conversion). Missing quarters are not synthesized from YTD figures. Filing lists include foreign issuer forms. Presentations and other external documents can be added by URL; investor-relations exhibits are not automatically crawled.
