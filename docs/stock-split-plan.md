# Stock split normalization plan

October 29, 2026. This is a proposed implementation, not an adjustment already enabled in the report.

## Recommended approach

Keep SEC financial statements and add a small, cached split-event feed. Normalize individual observations before selecting annual/quarterly values, reconstructing quarters, or calculating TTM and growth. Preserve every raw fact and its filing provenance. Do not replace the backend or install an entire financial engine just to correct share bases.

For an observation already expressed on basis B and a chosen target date T:

`factor = product of confirmed split ratios not already reflected in B, through T`

`normalized EPS or dividend/share = reported value / factor`

`normalized weighted-average shares = reported shares * factor`

Revenue, total net income, assets, debt, cash flow and total equity do not change. Reverse splits use ratios below one. All metrics in a computation must use the same share class, currency and target basis.

The user's F(t) formula works for an original, unadjusted observation. A fiscal period end alone is insufficient when a later filing has already restated that period. For example, a pre-split $8 EPS and an issuer-restated $2 EPS after a 4-for-1 split should both normalize to $2, never $0.50.

## Sources and how to use the linked projects

| Source | Use | Limit |
|---|---|---|
| [yfinance get_splits](https://ranaroussi.github.io/yfinance/reference/api/yfinance.Ticker.get_splits.html) | Fetch available events with `Ticker(symbol).get_splits(period="max")`; store date and new/old share ratio | One library call may involve multiple HTTP calls. Yahoo availability and ticker history are not guaranteed; an empty result is not proof that no split occurred. It does not reveal the basis of SEC observations. |
| [EdgarTools guide](https://github.com/dgunning/edgartools/blob/main/docs/guides/stock-splits-eps-normalization.md) | Reference for SEC split-concept detection, short/instant event filtering, filing-date checks and forward/reverse adjustments | Filing date is useful evidence, not a universal substitute for inspecting a fact's basis. Do not copy its year/ratio deduplication blindly: two genuine identical-ratio splits in one year must remain distinct. |
| [edgar-xbrl-financials](https://github.com/kghoff/edgar-xbrl-financials) | Reference for ordered mappings, provenance and use of issuer-restated comparatives | Its stated split consistency is limited to the restatement window; older history still needs an event feed and basis reconciliation. |
| [AsOf](https://github.com/RaghhavMalani/AsOf) | Model immutable fact versions and separate period dates from filing/knowledge dates | Use its design principles; adopting the full database/valuation stack is unnecessary for this report. |

These are reference designs, not independently validated guarantees of correctness. No packages from these repositories have been installed or executed for this review.

## Implementation sequence

1. **Retain source observations.** Identify facts by CIK, namespace/concept, unit, period start/end, accession and filing date. Store reported value, selected concept, normalization version, target basis, applied event IDs/factor, and confidence/status separately. Never overwrite the reported value. Apply the as-of cutoff before selecting facts and events.

2. **Build an event ledger.** Fetch Yahoo's full available split history once per company, cache it daily, and cross-check SEC split conversion-ratio facts or an issuer announcement. Store effective/trading date, announcement date if known, ratio, source URL and share class. Distinguish actual events from comparative echoes. Exact-date/ratio deduplication needs conflict handling, not deduplication by calendar year. Ticker changes, ADR ratios, share-class conversions, spin-offs and rights issues need explicit treatment rather than automatic split classification.

3. **Resolve each fact's basis.** Prefer a recent issuer-restated comparative when it covers the same concept, unit and exact period. Compare pre/post-event observations for matching periods; corroborate an apparent split ratio with weighted-average shares and EPS, allowing filing rounding. Keep filing date as evidence, while flagging conflicting or missing evidence. An amended filing after an event can repeat an older basis. Do not infer a split from an EPS jump alone: earnings and accounting restatements can also change EPS.

4. **Normalize once, then derive.** Apply only uncovered events, keeping already-restated observations unchanged. Normalize share counts and per-share figures together before day-weighted quarter-share reconstruction and TTM calculation. Dividends need their own basis checks; a changed dividend is not evidence of a split. Prefer explicitly reported annual EPS; reconstructed TTM EPS needs a consistent numerator/denominator and clear provenance rather than assuming rounded quarter EPS always add exactly.

5. **Handle uncertainty explicitly.** A timeout is not an empty split history. Mark uncertain per-share intervals and suppress growth figures crossing an unresolved basis change. Keep unaffected monetary history available. Add a compact provenance explanation so a user can see raw value, filing, events and adjusted value. Share one normalization path across tables, charts, ratios and exports.

6. **Validate before enabling.** Record source fixtures for AAPL's 2014/2020 events, NVDA's multiple splits, TSLA's repeated splits, a confirmed reverse-split issuer and no-split controls. Test already-restated comparatives, same-ratio repeated events, amended filings, missing dates, conflicting feeds, rounding, quarter boundaries and as-of cutoffs. Assert idempotency, no raw-data mutation, cumulative factors, unchanged monetary totals, same-basis EPS/share reconciliation and matching exported/UI values. Compare complete time series to issuer filings; a smoother chart is not proof.

## Fit with the current architecture

The frontend and SEC Worker already provide lazy, deduplicated caching. Add a `/company/CIK…/splits` endpoint after verifying the corresponding ticker/share class. yfinance is Python and cannot be dropped into this JavaScript Worker unchanged. A small Python fetch/cache job could produce the ledger, or the Worker can use the underlying Yahoo corporate-action response and parse only the events. Either approach needs the same cache, identity checks, source records and failure status. Start with recorded AAPL fixtures and a pure normalization module; enable live events only after the fixture suite passes.

## Separate issue: Bob's annual coverage

BOBS is NYSE:BOBS, CIK 2085187. The captured live CompanyFacts response contains quarterly facts but no annual statement duration facts. Its [March 18, 2026 10-K index](https://www.sec.gov/Archives/edgar/data/2085187/000162828026019015/0001628280-26-019015-index.htm) lists an HTML annual report without XBRL instance files; its [August 6 10-Q](https://www.sec.gov/Archives/edgar/data/2085187/000162828026054345/0001628280-26-054345-index.htm) includes XBRL files. The report now shows available quarters and links to the annual filing. Full annual recovery requires a separate deterministic HTML-table ingestion/import path, preserving units, dates, signs, source table and review status. A different CompanyFacts wrapper will not supply facts absent from that feed.
