# QuickFS investigation and SEC data validation

Checked 29 October 2026. No website UI redesign or Git push.

## What QuickFS.org reveals

The page investigated was [QuickFS.org’s Visa report](https://quickfs.org/company/V), specifically that domain. Its response HTML already contains the financial tables, company description, and chart data. The browser code handles charts, table navigation, and company search. The visible company-search request is `/search-companies?q=…`; the inspected application code does not expose a financial-data or description-provider API.

REA successfully analyzed the saved application script as inert JavaScript. Evidence is retained in `/home/royl/projects/sftsaf/evidence/quickfs-app-full-analysis.json` and its summary; the captured page is `quickfs-visa.html`. This is evidence about the public client, not access to their server. REA explicitly limits its conclusions to the selected source and static relationships. Neither its analysis nor the rendered description establishes the upstream vendor. Attribution to Yahoo, SEC, or any other description provider would be speculation.

Useful inspiration is the separation of a normalized report payload from the display. Our fixed templates and lazy, cached data adapter already use that separation. There is no verified upstream source here to adopt. Company Notes remain the editable notepad requested earlier; automatic business descriptions have not been restored.

## Visa: why the SEC feed looked incomplete

The SEC CompanyFacts response omits Visa’s share-class-dimensional EPS and weighted shares. The current filing has separate values for Classes A, B1, B2, and C. Selecting the first EPS encountered, or dividing consolidated earnings by Class A basic shares, would be incorrect.

The new generic filing fallback establishes the listed class from `dei:TradingSymbol` and its stock-class dimension, checks CIK/ticker identity, and extracts matching standard facts from the SEC’s XBRL instance. Other dimensions and other classes are excluded. Matching class income is stored separately from consolidated net income. The parser also supplements standard consolidated facts when CompanyFacts lags the filing.

The [2025 Visa 10-K](https://www.sec.gov/Archives/edgar/data/1403161/000140316125000089/v-20250930.htm) verifies:

| 2025 figure | Value |
| --- | ---: |
| Class A basic EPS | $10.22 |
| Class A diluted EPS | $10.20 |
| Basic weighted shares | 1,714 million |
| Diluted weighted shares | 1,966 million |
| Consolidated net income | $20,058 million |
| Total equity including NCI | $37,915 million |
| Disclosed noncontrolling interests | $6 million |
| Parent shareholders’ equity | $37,909 million |

An actual SEC instance slice, including competing classes, is now a regression fixture. The browser displays EPS and equity, and P/E, P/B, P/S, EV/S, EV/EBIT, and EV/Pretax populate. Some other metrics remain unavailable where required inputs are not mapped; missing values are not proof that the issuer never disclosed them.

The latest supplemental 10-Q is for June 30, 2026. TTM EPS remains an explicitly estimated matching-class income / duration-weighted shares calculation; quarterly EPS is never simply summed. Annual reported EPS remains preferred.

## SK hynix: a separate coverage gap

SKHY and HXSCL resolve to the same SEC filer, CIK 2120882. Its CompanyFacts response currently has no financial facts. The [SEC prospectus inspected](https://www.sec.gov/Archives/edgar/data/2120882/000119312526299963/d32785d424b4.htm) contains financial statements in untagged HTML rather than inline XBRL facts supported by this parser.

This was not evidence of an unsupported reporting currency. The report now states that structured statement coverage is unavailable and links to a filing. It does not guess USD or invent financial figures. **SK hynix financial ingestion is still outstanding.** A reviewed HTML-table ingestion path or a Korean disclosure backend is needed for actual coverage.

## Validation implemented

Every populated mapped source cell can retain concept, unit, period, accession, source URL, class, and derivation metadata. Parsed filing facts are merged without changing the original CompanyFacts observations. The report attaches a `financials.validation` result with:

- Annual core-field gaps: revenue, net income, diluted EPS, assets, equity, operating cash flow.
- Reported assets versus separately reported liabilities plus total equity, with filing accessions retained. A mismatch may reflect revisions from different filings and requires source review; it is not automatically repaired.
- Listed-class EPS versus matching allocated income / weighted shares, within reported rounding tolerance.
- Explicit `partial`, `review`, or `unavailable` states instead of a blanket accuracy claim.

Cash-flow residuals balancing are not counted as independent validation: they balance by construction. Nor does the presence of a standard SEC tag prove the chosen period, dimension, unit, or revision is correct.

Run the reproducible live audit from the website repository:

```sh
node scripts/validate-source-coverage.mjs 1403161 V /tmp/visa-source-validation.json
```

The saved [Visa validation output](visa-source-validation.json) includes exact source accessions, request timing, share-basis information, field coverage, and all checks. This run flags a 2008 balance-sheet mismatch involving different filing accessions and an unavailable 2010 filing extraction. Those are unresolved review items, not a clean bill of health.

Eight relevant test files pass, covering recorded SEC facts, the new multi-class fixture, identity isolation, split normalization, cash-flow/sign mappings, stable templates, and loading behavior. These are regression checks, not an exhaustive issuer audit.

## Performance and next coverage work

Ordinary companies with recent EPS and weighted shares do not trigger this fallback. A deficient company triggers a bounded set of annual filings spaced to use comparative history, plus the latest quarterly filing and selected amendments. Immutable filing responses are cached for seven days; client requests are also cached and deduplicated. Parsing stays on the Worker, not in the report UI.

The Visa audit made 11 API requests in total, including base facts, filing metadata, split history, and historical supplements. One observed first audit took about 5.3 seconds before adding the split call; a repeat of the full audit took about 1.5 seconds with warm server caches. These are observations, not guaranteed latency or a clean cold-cache benchmark. Class-deficient issuers therefore do have a larger first-load cost than ordinary CompanyFacts-only issuers.

Before calling the backend broadly complete, extend the audit across representative ordinary, bank, insurance, multiclass, IFRS, and newly listed issuers; review unmapped statement concepts against actual statement presentation; and maintain source-backed fixtures for each new mapping. Use third-party pages as discrepancy detectors, with filings as the adjudicating source. A finite template is useful for presentation, but it is not the superset of every fact an issuer can disclose.
