# Stock split normalization implemented

October 29, 2026. Website changes are local and unpushed. The existing SEC Worker has been deployed with the split-history endpoint.

The report uses a pure JavaScript normalization module, `assets/report/share-basis.mjs`. No yfinance/Python runtime or third-party package was added. The existing Worker obtains Yahoo corporate actions using monthly chart data over the available history; the response exposed to the browser contains only split events and provenance. The browser requests it in parallel with facts, profile and quote, caches it daily, and shares one company load between annual and quarterly views. Temporary failures are distinguished from successful empty history and can be retried. The Worker caches successful results for one day.

## Behavior

- Original SEC observations remain intact. Normalized observations retain reported values, filing/accession, event decisions, factor, status, knowledge cutoff and target basis. Reapplying normalization starts from the retained reported value, preventing a second adjustment.
- **Confirmed** means source annotations or matching-period EPS and share-count observations corroborate the basis. **Inferred** covers chronology and single-metric comparative evidence. **Unresolved** covers contradictions, missing filing evidence, ambiguous events and unsupported actions; affected per-share values are omitted. Inferences remain usable and are visible in the details panel.
- Issuer-restated comparatives remain unchanged. A later amendment that repeats an older basis can still be adjusted. Multiple events compound; reverse splits use ratios below one. Monetary statement totals are unchanged.
- Stock dividends and split-like recapitalizations with an identified ratio are supported as distinct ledger event types. Ordinary cash dividends never trigger share adjustments. Generic dividend amounts/percentages are not automatically interpreted as split ratios. Dividend/share history is re-expressed on the target share basis; it is not an original-declared-cash series.
- SEC conversion-ratio context dates can differ from trading dates. One unambiguous matching Yahoo event within 90 days supplies the canonical event date, with SEC context records retained as evidence. Nearby duplicate SEC-only dates are flagged rather than multiplied. Distinct same-ratio external events remain separate, including two in one year.
- Complex Yahoo adjustment ratios are classified as unclassified actions unless SEC evidence resolves them. This prevents GE's spin-off price adjustments from being treated automatically as EPS share splits. It is not comprehensive corporate-action classification; simple-ratio actions can still need review, and ADR/class conversions are not universally resolved. Multiple SEC-listed share classes cause the company-level Yahoo feed to report unavailable instead of guessing a class.

## Dates and EPS rules

`toReportPayload(data, record, quote, period, symbol, options)` accepts:

```javascript
{
  knowledge_as_of: '2019-12-31',
  target_share_basis: '2019-12-31',
  mode: 'point_in_time',
  split_feed: recordedOrLiveFeed
}
```

Point-in-time mode excludes later observations and later-known event information, rejects a target after the knowledge cutoff, and rejects undated/future quotes. Dates are inclusive calendar dates, not intraday market timestamps. In `current` mode, an explicitly later target can use later corporate actions to rebase older-known observations without selecting later earnings restatements. The normal report defaults both dates to current available knowledge. A genuinely historical event history needs historical SEC evidence or a preserved historical feed snapshot; today's Yahoo download is not represented as information known years ago.

Reported annual EPS takes precedence. Nonannual TTM EPS is estimated from common income and time-weighted shares, not a sum of quarterly diluted EPS. The quarterly ratio helper and financial exports use the same per-period TTM EPS map. The estimate is identified in provenance and can differ from an issuer's exact diluted-EPS treatment.

## Validation and performance

Recorded fixtures cover Apple, Nvidia, Tesla, GE and the live Yahoo feed. Tests exercise double adjustment, stale amendments, contradictory observations, immutable inputs, idempotency, date cutoffs, independent target basis, reverse/repeated splits, stock/cash dividends, recapitalizations, company/symbol checks, temporary failures, share classes, annual EPS precedence and non-additive quarterly EPS. Existing adapter, statement-sign and company-loading regressions pass.

Apple's 2015 EPS now adjusts from reported $9.22 to $2.305; its issuer-restated 2018 EPS stays $2.98. The report's ten-year EPS CAGR now displays 12.5%, replacing -2.1%. One older Apple dividend observation is unresolved and omitted; the details panel identifies it. GE has unresolved older per-share history around unclassified actions rather than automatically adjusted values.

Local Node benchmarks measured the entire annual report-data conversion, including existing calculations and normalization, at median times of approximately 40–80 ms over five measured runs after warmup on recorded 3.6–6.2 MB SEC payloads. This is neither incremental overhead nor a browser/network SLA. Cold loads add one event-history request; repeated loads use caches. The local browser was checked for the corrected Apple CAGR, provenance details, and absence of console errors.

The implementation improves split consistency; it does not certify every SEC mapping, accounting restatement, corporate action or historical comparison.
