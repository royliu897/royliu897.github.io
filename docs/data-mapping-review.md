# Financial report: adversarial review and final design

October 29, 2026. An independent agent reviewed the mappings, calculations, definitions and coverage assumptions, then rechecked the fixes against generic regression fixtures. No blocker remains in the targeted paths. This is a scoped review, not certification of every SEC concept or issuer.

## Stable rows and source states

The final design follows the preference for consistent formatting: each standard, bank or insurance template keeps its fixed row set. Missing or unavailable values display **—**. Genuine reported or derived zeroes display **0**. Switching years or annual/quarterly mode does not hide individual rows. Missing disclosures are never filled with invented zeroes.

The row registry is a useful canonical superset, not the entire XBRL universe. Static field identifiers, alias precedence, calculation rules and definitions belong in a versioned registry. Issuer/year-specific financial values do not belong there. The report's seeded company/CIK lookup was removed; company resolution now uses the cached SEC directory.

Every populated cell retains the selected source concept/unit, filing date and accession metadata. Derived cells identify their calculation; mixed-filing derivations retain all source accessions and the latest input filing date instead of representing one filing as the sole source.

## Findings fixed

| Finding | Fix and regression |
|---|---|
| Historical valuation table was entirely empty | Monthly closes from the existing Yahoo split-history request now populate historical valuations; TTM uses the current quote. Currency must match the financial statements. |
| Working-capital components were unmapped | Added signed operating asset/liability changes. A disclosed total takes precedence; other-net capital is separated from that total and not dropped or added twice. |
| Cash-flow Other rows were absent | Reconcile disclosed cash-flow totals to identified components. The definitions explicitly identify these as arithmetic residuals. |
| Right-only cash flows disappeared | Sales without purchases, issuance without repurchases and repayments without issuance now retain their disclosed legs in the net-flow categories. |
| Aggregate/subset tags could silently lose amounts | Total short-term borrowing precedes commercial paper; common-stock proceeds precede option-exercise proceeds. |
| Investment maturities could be counted twice in TTM | Canonicalize sale/maturity observations before deriving quarters or TTM. A combined tag is not increased by its maturity component again. |
| A maturity-only revision replaced aggregate proceeds | Retain compatible disclosed sales. Decompose an earlier combined total only with its own original maturity disclosure; otherwise retain a coherent combined observation. Generic cases now produce 16 rather than 6, and preserve historical cutoffs. |
| Tax payable was mapped too narrowly | Added `AccruedIncomeTaxesCurrent` and compatible payable tags. Apple's 2025 source value of $13,016 million is available. |
| Other equity was absent | Reconcile shareholders' equity to identified equity components. Combined common capital is separated from independently reported paid-in capital. |
| Insurance values used non-rendering keys | Align future policy benefits, deferred acquisition costs and receivables with the insurance template. |
| Currency depended on object insertion order | Select the latest coherent reporting currency across core facts; reject unresolved ties rather than mix units or silently default to USD. |
| Interest expense was positive | Convert the reported expense magnitude to a signed negative display value, preserving reversals. The exact SEC tag InterestExpenseNonoperating is covered, including BOBS. |
| A few definitions disagreed with the retained calculator | Correct ratio/percentage distinctions and preceding-quarter versus preceding-year average contexts. |

Apple's 2025 working-capital change is −$25,000 million; operating Other is −$89 million, investing Other −$1,480 million and financing Other −$6,071 million. These reconcile to the disclosed totals and are regression-tested. Separate interest income and non-recurring amounts are not fabricated when the filing does not disclose a compatible value.

## Shared definition graph

All statistic, statement, overview and ratio labels query one local definition registry. Popups show only title, group and formula/definition. Referenced inputs are clickable: for example ROIC → average invested capital → invested capital → shareholders' equity. Child popups open beside the clicked term. Escape closes the top child; closing a child preserves the parent; an unrelated metric clears the previous chain. Dialog content is created only when opened.

The registry is about 24 KB uncompressed / 6.6 KB gzip. Clicks make no financial-data requests. Restoring historical valuations also adds no API request: the monthly prices were already present in the upstream response used for split events.

## Coverage boundary and extension path

SEC CompanyFacts is not a complete representation of a filing. Custom tags, dimensional breakdowns, presentation relationships and untagged tables can require filing-level ingestion. Displaying every available fact as a row would introduce footnote metrics, repeated contexts and overlapping totals.

An offline audit tool at `scripts/audit-report-coverage.mjs` inventories observed concept/unit pairs without a configured mapping. The recorded Apple response contains 508 such observed pairs: 86 have configured targets and 422 do not. **That is not a financial-statement completeness percentage.** Many unmapped items are footnote disclosures or alternate totals; a configured mapping is also not proof that every period is usable.

Use the inventory to review useful additions, extend the registry and add a source-backed fixture. Keep additional disclosure detail separate from the stable main tables. Broader filing-level ingestion should preserve context, dimensions, presentation and provenance rather than append raw XBRL facts automatically.

## Verification and deployment

The independent reviewer reproduced the original defects and confirmed the final maturity-revision fix. Tests cover the generic edge cases, recorded cash-flow reconciliation, financial currency, signed rows, shared definitions, split normalization and company loading. Browser checks confirmed historical valuations and a three-level definition chain. Current local benchmarks put whole report-data conversion at roughly 40–80 ms on recorded 3.6–6.2 MB SEC responses; this is not a network SLA.

The API price-response update is deployed. The website edits remain local and unpushed.
