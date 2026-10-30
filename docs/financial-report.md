# Standalone financial reports

Updated October 28, 2026. Implementation: `/home/royl/royliu897.github.io`.

The desk's **Report ↗** button opens the selected company in a separate browser tab. The desk stays in Quick or Detailed review. Search for other companies directly in the report tab.

[Open McDonald's locally](http://127.0.0.1:8766/report.html#/company/NYSE.MCD).

## Frontend

The earlier embedded recreation has been removed. This version retains the actual public FastFS frontend components and an identical stylesheet, with a separate SEC adapter. The baseline adversarial audit found all **27 audited UI functions byte-identical** and the CSS identical to the reference. The subsequent formula-popup addition intentionally changes the statistics renderer; tables, calculations, search, exports and scroll handlers remain intact.

Intentional changes: remove FastFS branding, service/account/navigation links, sample/promotional banners and disclaimer/footer content; replace data/search access; use hash history for static hosting; disable the original health request and version polling. A header toggle now switches between the original light theme and the research desk’s dark palette, using the shared saved theme preference. Clicking a key-statistic label opens its calculation formula; clicking again, clicking outside, or pressing Escape closes it. The original reference stylesheet remains intact, with a separate scoped theme/popup stylesheet.

The original table renderers, chart, search, statistics, controls, number formatting, exports and scroll behavior are preserved. Browser checks covered search/Enter navigation, MCD's chart, JPM's bank/ROE template, stable statement positions, display controls, XLSX and five-file CSV ZIP downloads, and mobile menus/overflow. Quarterly mode has 40 quarters without an extra TTM column; annual has TTM.

The desk button was also exercised: it opened the selected Apple report in a new tab and left the desk in Quick review.

## McDonald's correction

The earlier empty chart came from the calculation, not a lack of history. It required a combined pretax concept absent from the mapped MCD facts. The original frontend's ROIC uses net income and invested capital and permits negative equity when total capital remains positive. That calculation now yields MCD's curve through 2025.

Other fixes keep filing versions until period selection, retain full-year observations repeated in newer 10-Qs, align annual balances by fiscal end, derive standalone quarters from cumulative durations, and duration-weight shares. Share-scale corrections require corroboration from matching reported net income and EPS. MCD's source scale now produces 716.4 million diluted shares for 2025, rather than a millionfold EPS/valuation error. Its fourth dividend quarter is recovered from matching reported annual/quarter periods, reconciling 2025 to $7.17/share.

## Backend limits

The first backend remains the existing free SEC service at `research-api.royrliu.com`. Requests are lazy, cached and deduplicated; annual and quarterly share one facts download. `assets/report/sec-adapter.mjs` owns `loadReportCompany` and `searchReportCompanies`; another backend can implement that schema without changing the retained UI.

Frontend parity does not establish identical financial data. SEC standard facts omit some custom-tagged detail, such as MCD gross-profit components and some bank earning-asset fields. Historical price-dependent ratios lack a historical monthly-price feed. Company Notes now replaces the unreliable extracted business description and saves locally by CIK. Split normalization now adjusts historical per-share observations with explicit confirmed/inferred/unresolved states and a cached event ledger. Unsupported actions and contradictory bases remain gaps rather than silently adjusted values; see stock-split-implementation.md. TTM EPS derived from income and weighted shares can differ slightly from vendor adjusted EPS. These differences remain backend coverage work.

The earlier data research still favors SEC for free long histories. ROIC.ai Free lists two years of annual data and no quarterly financials. Sources: [SEC API documentation](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), [ROIC.ai pricing](https://www.roic.ai/pricing), [SimFin pricing](https://www.simfin.com/en/prices/).

## Source and validation

- Public reference artifacts and REA evidence: `/home/royl/projects/sftsaf/evidence`.
- Reproducible frontend patcher: `/home/royl/projects/sftsaf/build-report-frontend.mjs`.
- Source/patch hashes: `/home/royl/projects/sftsaf/evidence/report-frontend-provenance.json`.
- Independent audit: `/home/royl/projects/sftsaf/parity-audit/final-audit.md`.
- REA remains built and configured for WSL Codex. Use `/home/royl/projects/sftsaf/rea-cli --help`; restart WSL Codex to load the registered MCP server.

Passed: standalone adapter regression tests plus six relevant existing desk/SEC/valuation test scripts, syntax checks, and whitespace checks. Tests cover actual recorded MCD facts, negative-equity ROIC, annual comparative facts, share scale, TTM, quarter four, annual dividend totals, row schema, industry classification, currency/cutoff handling, deduplicated loading and search. Live MCD, Apple and JPM were also exercised.

The website changes remain local and unpushed. The existing SEC Worker has been updated and deployed for the description endpoint and identity validation.


## Notes, display signs and missing annual history (October 29, 2026)

The automatic business excerpt has been removed: literal extraction still selected legal boilerplate for Moody's. The report no longer requests descriptions. Company Notes uses a plain text area with Show/Hide, stored in localStorage by CIK. It survives reloads, remains separate for each company, and is browser/origin-specific (not synced or included in financial exports). A save failure is shown explicitly.

FastFS's public Apple fundamentals sample was checked against 47 overlapping mapped statement rows. SEC magnitude conventions are converted at the display-payload boundary for income tax, accumulated depreciation, treasury stock and loan-loss reserves; bank interest expense also follows the original frontend's explicit negative presentation. COGS, R&D and SG&A remain positive as in FastFS. Negation preserves benefits/reversals instead of forcing absolute values. Calculations run before display conversion; annual, quarterly, TTM and exports receive the same signs. Regression tests preserve a positive income-tax benefit.

BOBS (CIK 2085187) resolves correctly. The live SEC CompanyFacts response has quarterly revenue/EPS/net income observations but no annual duration facts. Its March 18, 2026 10-K filing index has no XBRL instance files; the later 10-Q has them. The report now switches to available quarters for this case, explains the missing annual coverage and links to the annual filing; it does not manufacture annual totals or TTM from incomplete quarters. Automatic fallback does not overwrite the user's saved period preference. Restoring full annual history requires a separate, source-checked annual-table ingestion fallback. See the split plan for recommendations.

Statements still use SEC CompanyFacts; identity/filing metadata uses SEC submissions; current prices use Yahoo. No model is called at runtime. Existing CIK, ticker, exchange and quote-symbol checks remain. Split normalization is now implemented; Apple's ten-year EPS CAGR is 12.5% on a common share basis. Unresolved per-share observations are omitted and explained in the Share basis details panel. See stock-split-implementation.md for policy, evidence and limits. The website changes remain local and unpushed.


## Mapping review and consistent templates (October 29, 2026)

The latest report keeps fixed canonical rows within each industry template, using — for unavailable values and retaining genuine zeroes. Historical valuations now use monthly closes already fetched alongside split events; TTM uses the current quote. No additional API request was introduced for historical prices. Working-capital changes, cash-flow residuals, tax payable, other equity, interest signs and insurance mappings were corrected. Vendor-only classifications are not invented.

All table/statistic labels use the shared `definition-graph.mjs` registry with on-demand recursive popups. Only title, group and formula are shown. New children anchor to clicked terms and Escape closes the top popup. The graph is approximately 6.6 KB gzip and needs no data request on clicks.

The independent adversarial audit and generic regression fixtures found and fixed one-sided cash-flow omissions, working-capital total/component confusion, TTM maturity double counting, component-only revisions, aggregate/subset ordering, insurance schema mismatches, ambiguous currency selection and definition-unit/period mismatches. Runtime company lookup now uses the SEC directory instead of seeded issuers. Source provenance identifies mixed accessions.

See `data-mapping-review.md` for the full review and the scope boundary. `scripts/audit-report-coverage.mjs` inventories unmapped CompanyFacts concepts offline; useful extensions need reviewed mappings and fixtures. CompanyFacts does not cover every custom or dimensional filing disclosure.
