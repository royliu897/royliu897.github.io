The report now supports native South Korean and TWSE-listed Taiwan companies, with native currency as the default and an optional **Display USD** checkbox. The checkbox shows the exchange rate, source and timestamp. It translates every displayed period at that one current rate; it does not claim to apply historical exchange rates.

Search examples: `000660` (SK hynix), `005930` (Samsung), `2330` (TSMC), `2317` (Hon Hai), `2303` (UMC). English names and native names are supported where present in the regulator directory. Taiwan coverage currently means TWSE-listed companies; TPEx is not included.

The source is OpenDART for Korea and consolidated Taiwan-IFRS MOPS filings for Taiwan. The US SEC source remains separate. Native share prices come from Yahoo Finance using the verified native listing symbol. Company IDs, reporting periods, consolidation, units and scales are checked before mapping values.

Changes verified in this update:

- DART uses 1,374 official English account labels, preserving Korean labels and original IDs. Custom-label translation is for display only and never authorizes a numeric mapping.
- Samsung's conflicting interim ProfitLoss copies no longer discard the whole filing. Explicit cumulative income-statement amounts take precedence; excluded copies remain inspectable.
- MOPS supports both older XML instances and newer inline-XBRL documents. Actual `scale` attributes are applied; XML `decimals` is not used as a multiplier. Legacy EPS currency-only units receive an explicit, provenance-preserving per-share interpretation for the registered EPS concepts.
- Taiwan loans and separately disclosed bonds are combined correctly. Signed cash outflows are converted to canonical magnitudes before calculating capex, dividends and free cash flow. Source values remain unchanged.
- P/E no longer requires weighted-average share counts. Native valuations identify a fiscal-year fallback when reported TTM EPS is unavailable.
- Korean period-end common shares come from OpenDART's separate stock-total report; they never substitute for weighted-average EPS shares.
- The Unmapped tab displays readable source labels first and keeps raw tags, original labels, units and filing links in expandable details.

Live validation covered SK hynix, Samsung, TSMC, Hon Hai and UMC. Korean samples include annual history from 2013; Taiwan samples include restated/comparative history from 2012. All five include a loaded statement period through June 2026. The final run retrieved all scheduled sample reports successfully. This sample does not establish complete coverage for every issuer or every disclosure.

Performance measurements with provider caches populated: initial SK hynix 762 ms, TSMC 593 ms. Switching annual/quarterly views reused company data with zero network requests and took 11–19 ms in the Node measurement. Initial Taiwan source downloads in the earlier run took roughly 6–26 seconds, including a temporary Hon Hai timeout that succeeded on retry. Filings are cached separately for six hours, requests are deduplicated, and parsing is limited to one Taiwan filing per Worker invocation. FX is fetched only when enabled, cached for five minutes, and adds no request to the default native view.

Fourteen regression test files pass, including actual DART/MOPS fixtures, accounting identities, source conflict exclusion, currency conversion immutability and ratio invariance, split handling, and stale/future FX-date rejection. The independent adversarial review found the debt-component, consolidation-metadata, unknown-publication split and hidden-fallback-error issues; all were corrected.

Remaining limits are visible rather than filled with guessed values:

- This is primary-statement ingestion, not every footnote in every filing. Some useful disclosures remain unmapped or absent from the regulator's structured endpoint. Weighted-average shares, depreciation detail and working-capital breakdowns may still be blank for Korean issuers whose primary DART extract does not expose them.
- Taiwan P/E works, but company-value multiples remain blank until a verified common share count net of treasury stock is loaded. The TWSE directory's issued-share field is not silently treated as outstanding shares.
- Samsung's other listed share class is not priced, so total-company market capitalization and enterprise-value multiples are withheld. Its common-share P/E is available.
- Original MOPS filing publication times are not yet verified. Retrieval dates are explicitly marked as such, cannot establish a historical split basis, and do not support historical point-in-time backtests. Unresolved affected per-share observations are omitted and flagged.
- Native listings are not automatically converted into OTC/ADR share equivalents. Existing verified SK hynix redirects remain; other identity links need evidence.
- Japan/EDINET remains deferred. No additional API key is required for the Taiwan path implemented here.

Validation details: [sample values and source coverage](korea-taiwan-validation.json), [performance measurements](foreign-performance.json), [DART account review](dart-account-coverage-review.md).

Primary sources: [OpenDART taxonomy](https://engopendart.fss.or.kr/guide/detail.do?apiGrpCd=DE003&apiId=AE00037), [OpenDART stock totals](https://engopendart.fss.or.kr/guide/detail.do?apiGrpCd=DE002&apiId=AE00017), [TWSE company directory](https://openapi.twse.com.tw/v1/opendata/t187ap03_L), [TSMC's 2025 consolidated MOPS source](https://mopsov.twse.com.tw/server-java/FileDownLoad?functionName=t164sb01&step=9&co_id=2330&year=2025&season=4&report_id=C), [Frankfurter FX API](https://frankfurter.dev/).

The final source run passed 68 reported annual balance-sheet identity checks across the five samples. Hon Hai's older per-share history is flagged where the share basis across corporate actions cannot be established; raw observations remain in Share basis details. This is distinct from a missing source report.
