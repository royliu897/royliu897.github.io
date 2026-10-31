# Repeatable report review

The browser's **Unmapped → Data review** uses the existing loaded payload. It
does not fetch additional sources or infer filing completeness. The panel is
collapsed initially; the open body has a bounded height, three small views and
one expanded item at a time. Fields with no eligible loaded observation are
distinct from a verified nondisclosure. Reported/calculated/unknown-source
values and unmapped/ineligible/unresolved gaps remain separate.

To compare source refreshes, save `loadReportCompany()` payloads as JSON in a
directory **outside the public site**. Use native-currency payloads before the
optional display FX conversion. Do not include local company notes.

```sh
node scripts/audit-report-quality.mjs /path/to/payloads --output /path/to/review.json
node scripts/audit-report-quality.mjs /path/to/refreshed-payloads \
  --baseline /path/to/review.json --output /path/to/next-review.json --strict
```

The offline audit compares security identity, reporting currency, historical
periods, disappeared values and changed values with filing-accession evidence.
It also reports accounting checks that need review. `--strict` exits with code
2 if any exception exists; legitimate issuer revisions still need review and
are not silently repaired. Passing an audit is not a coverage percentage.
There is no scheduled job or baseline download on the browser request path.


Critical financial core
-----------------------
The coverage checklist is revenue, gross profit, operating income, interest expense,
net income/EPS, cash, total debt, current assets/liabilities, inventory, receivables,
equity, goodwill, lease liabilities, operating cash flow, gross capital spending,
dividends, ROIC, operating margin, P/E, EV/EBIT and FCF yield. Buybacks, insider/
management data and qualitative 10-K/proxy review are outside this pass.

Run `node scripts/audit-critical-report.mjs PAYLOAD_DIRECTORY OUTPUT_JSON` on saved
native-currency report payloads. This runs offline, retains source receipts and
does not add a banner or extra runtime requests. It inventories blanks; it does
not treat every blank as a mapping error or promise a completeness percentage.

`tests/critical-data-tests.mjs` checks eleven source-backed primary-filing fixtures
and adversarial debt/lease calculations. Debt totals use explicit totals or
disjoint primary balance-sheet lines; commercial paper is not added again to a
borrowing total. Unclassified or conflicting inputs stay unresolved. Combined
debt-and-finance-lease scopes are preserved so ROIC does not add those leases
twice. Issuer-specific leases retain the original QName and exact primary caption.
Gross capital spending excludes asset-sale proceeds; FCF yield can be negative.
Latest-FY valuation fallback remains labelled and is never presented as TTM.


Gap regression (GAP, previously GPS)
----------------------------------
`tests/gap-report-regression-tests.mjs` reproduces the missing EV and truncated
ROIC history using real source facts, then checks the generic primary-statement
pipeline against the same issuer. The frozen source fixture verifies FY-end
debt of USD 1,492 million, latest-quarter debt of USD 1,493 million and cash of
USD 2,103 million. The latest 10-Q's annual comparative is retained as the newer
source for the same FY-end balance. All nine general valuation card values must
be finite, and the last ten annual ROIC observations must include the reported
loss years. Nothing substitutes zero for an unreported current debt amount.

The raw CompanyFacts feed alone does not establish the complete debt scope in
this case. The versioned primary cache supplies that evidence using the existing
generic compiler, with no ticker-specific calculation rule. Cache coverage is
still a subset of issuers; a passing sampled audit must not be represented as
complete coverage of all searchable companies.

ROIC calendar tests also retain unresolved trailing years as null points, so an
old last available value cannot silently appear to be the end of current history.
Missing years are not interpolated or joined across.

The Gap fixture also checks a source-scope trap: `CommercialPaper` of USD 6
million at February 2, 2019 is captioned "Domestic commercial paper and other"
in the cash-and-cash-equivalents footnote of the 2020 10-K, not as borrowing.
The primary-statement debt total excludes that cash investment. A raw concept
name alone is insufficient evidence of a liability in this filing.


Automatic CAGR validation
-------------------------
Run `node scripts/report-frontend/audit-statistics.mjs PAYLOAD_DIRECTORY --output
review.json --strict` after installing the frontend build dependencies. It
executes the statistics functions extracted from the actual compiled frontend
and compares each displayed CAGR with independently calculated endpoint
eligibility and growth. Positive eligible endpoints with a blank result, an
incorrect percentage, or a displayed rate with invalid endpoints produce a
nonzero exit in strict mode. Missing, unresolved and nonpositive inputs remain
separate categories. The audit uses saved payloads and makes no provider calls.

The default report UI retains the dash; clicking a missing CAGR shows the exact
start/end values and a short reason. Gap's five-year EPS and FCF start from
negative values in the period ending 2021, so both are mathematically ineligible
under the existing CAGR convention. Their ten-year bases are positive.

`.github/workflows/report-checks.yml` runs the frozen source and calculation
regressions automatically on report-related pushes and pull requests. It does
not fetch the full stock universe, and the existing Pages deployment remains
separate. The saved-payload sweep supplements these regression tests; neither
is a claim of complete filing coverage. Missing source endpoints still require
retrieval/mapping work, rather than assigning zero or shifting the lookback.
