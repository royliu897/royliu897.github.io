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
