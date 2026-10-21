# Company report imports

McDonald’s uses the existing live SEC Worker. These two non-SEC datasets are
verified imports of official company disclosures, loaded on demand. Refresh
reloads the published import; it does not scrape new releases automatically.
Coverage was checked on 2026-10-21. No market-price feed or FX conversion is included.

| Company | Annual observations | Other observations | Units |
|---|---|---|---|
| Hon Hai / Foxconn, TWSE 2317 | 2022–2025 income, balance sheet, operating cash flow and capex | Selected Q2 2025, Q1/Q2 2026 income; Q2 2026 balance sheet | TWD; EPS in TWD/share |
| SK hynix, KRX 000660 | 2022–2025 revenue, operating profit and net income | Q1 2024–Q2 2026 income | KRW |

## Provenance and interpretation

Each observation stores its source accession, publication date, reporting dates,
frequency, native-currency value, and official URL. Foxconn links include the PDF
page. Concept keys are internal identifiers, not a claim that these are SEC XBRL
facts. Foxconn net income is attributable to the parent; total equity includes
noncontrolling interests. EPS is labeled as reported rather than claiming dilution.
Capex is a positive cash-outflow magnitude, so CFO minus capex gives free cash flow.
SK hynix releases are preliminary K-IFRS figures; 2022 figures were rounded to
whole billions in the cited release. Later comparative disclosures take precedence
when annual observations overlap. Missing fields, including SK hynix EPS and
cash flow, are not estimated.

Publication dates use the release’s stated date (rather than the website’s timezone
timestamp). Foxconn Q2 2026 uses the revised August 18 presentation. The 2025 annual
report is a reading source; its tables have not been imported. Select Results
documents to populate modeling fields. No half-year flow is treated as a quarter.

## Updating

Add the official document to the company’s `-filings.json`, then add verified
observations to `-facts.json`, keeping native units and source page links. Update
both `asOf` dates. Run `node tests/company-providers.mjs` and inspect the financial
fields and reader. The catalogue and facts are separate so opening the source list
does not load all financial data. Notes and saved models remain in local storage.
