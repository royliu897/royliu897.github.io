# Korean native reports and performance review

Implemented October 29, 2026. Website changes remain local/unpushed; the supporting API Worker is deployed.

## Working scope

The standalone report now supports Korean native listings through OpenDART. Search accepts local stock codes and names from 2,714 regulator-sourced issuer links. Selected companies are revalidated against OpenDART's company profile before statements load. English search names are not comprehensive; local stock codes are the most reliable lookup. The profile also identifies the market so KOSPI and KOSDAQ quote symbols are not guessed interchangeably.

SK hynix `000660` and Samsung Electronics `005930` were tested live. Both returned annual history spanning 2013–2025, with pre-2015 figures supplied as comparatives in later reports. Native prices and financials use KRW. Reported annual EPS is preserved. Quarterly income amounts are kept separate from YTD amounts; comparative cash-flow amounts are treated as YTD even where OpenDART stores them in a field containing `_q_` in its name.

Explicit IFRS aggregate borrowing and lease-liability tags were added. IFRS lease rows are labelled Lease Liabilities rather than being presented as US-GAAP-only capital leases. Unapproved issuer-defined names cannot inherit a standard mapping merely by sharing its local name.

Annual history is prioritized; only selected recent interim reports are fetched, so historical quarterly coverage is sparse.

The retrieved feed covers consolidated primary statements for verified December fiscal year ends. Dimensional account details and statements of changes in equity are excluded. Non-December year ends are rejected explicitly rather than assigned incorrect dates. Some required valuation inputs, including weighted shares for TTM EPS, may be absent from this feed; dependent valuations remain blank. This does not mean those inputs are absent from the issuer's full filing. No currency conversion is inferred: quotes only display when their currency matches the report.

Native Yahoo corporate-action history uses the validated native security symbol, not a US OTC/ADS symbol. Samsung's 2018 50-for-1 split was retrieved and passed through the existing basis-resolution engine. Source events remain evidence rather than a guarantee of complete action coverage.

Japan's EDINET work is deferred as requested. Taiwan, Hong Kong and European native-source adapters were not added in this pass. Existing SEC-listed foreign filers remain available through the SEC backend. Investigation of TSMC also confirmed why native expansion requires accounting-basis checks: Taiwan IFRS and IASB IFRS figures in the SEC report can differ, even for the same issuer and year.

## OTC routing

The verified SK hynix links `OTC:HXSCL` and `Nasdaq:SKHY` redirect to `KRX:000660`. A small notice explains that this is the native report, with native currency and share basis—not an OTC/ADS valuation. The issuer's SEC prospectus identifies ordinary listing code 000660; OpenDART validates the corresponding Korean issuer.

There is no fuzzy global OTC-to-native matching. Other OTC results retain their existing behavior until a security link is verified. The alias registry is separate from financial mappings and is small enough to extend without downloading a global security master into the browser.

## Sources, caching and credentials

The supplied OpenDART credential is installed in the Cloudflare Worker secret store. It is not included in browser modules, public responses or public cache keys. Tests enforce those boundaries. The official [OpenDART statement API](https://engopendart.fss.or.kr/guide/detail.do?apiGrpCd=DE003&apiId=AE00036) supplies financial data; [OpenDartReader](https://github.com/FinanceData/OpenDartReader) was examined as an integration reference. No Python/Pandas service or third-party financial-data runtime was added.

The corporate-code ZIP download repeatedly timed out. The current directory instead uses issuer identifiers from OpenDART periodic filing metadata for August 2026, retrieved on October 29. This is not an exhaustive current exchange directory: newly listed companies with no report in that interval may be absent. The bundled directory stays on the server; search sends only matching results to the browser.

From the website repository, the directory can be refreshed with:

```sh
python3 scripts/refresh-dart-directory.py --from 20260801 --to 20260831
```

The helper accepts `DART_API_KEY` from the local environment or prompts without echoing. It does not save the credential. The Worker uses its own configured secret; deploying updated code preserves that secret. No further key setup is needed now.

Financial statements are requested in bounded batches of four and cached. Successful aggregate reports use a six-hour cache; incomplete retrievals retry after 60 seconds. A missing just-ended quarter is recorded separately from a failed or contradictory source. Original filing receipts, publication dates and public filing URLs are retained.

## Live validation and remaining gaps

See the `korean-report-validation.json` chat output. The checks validate selected source identities, annual core fields and reported accounting identities; they do not certify all disclosures or mappings.

- SK hynix: selected annual sources loaded, latest interim period June 30, 2026. September's report was not available at the check.
- Samsung: annual sources loaded, but its June 2026 interim API response produced conflicting facts in the same normalized context. That report is withheld and source coverage is marked partial. The report displays the latest loaded statement date so its TTM freshness is visible. Resolving the conflicting interim facts requires additional source-context work.
- Eleven relevant test files pass, including recorded OpenDART fixtures, company/currency/consolidation/cutoff checks, quarterly/YTD distinction, IFRS debt and lease scope, native security/split identity, parameter restrictions and credential isolation. Existing SEC and split regressions also pass.

## Performance findings and fixes

Changes made:

- Bounded browser caches: six company datasets, six large facts responses, 24 class-specific filing responses and 128 total request entries. Previously, visiting more companies could retain raw datasets indefinitely.
- Exact SEC ticker searches skip the international lookup.
- The Korean issuer directory is searched server-side; the browser receives up to 20 matches rather than all 2,714 records.
- Partial source responses no longer sit in the successful six-hour cache.
- Historical OpenDART source retrieval uses four-request batches to reduce sequential network waiting, while retaining the existing rate budget and per-request deadlines.

Observed live loads were approximately **1.2 seconds for warm SK hynix** and **21.2 seconds for Samsung's initial load**, which returned partial coverage. These are different cache conditions and are not a controlled before/after comparison. Cold historical API retrieval remains the main latency risk; local processing is much smaller. Auxiliary quote/split requests are still awaited before the initial payload completes.

Local Node v24 transform measurements, five runs after warmup, including the mapping audit:

| Dataset | Annual median | Quarterly median |
| --- | ---: | ---: |
| Visa CompanyFacts | 50.0 ms | 97.0 ms |
| McDonald's recorded fixture | 11.0 ms | 16.8 ms |
| SK hynix OpenDART | 4.9 ms | 3.1 ms |

These exclude network and React rendering and are not browser interaction timings. Visa's fixture did not include its full filing supplement. The Unmapped audit alone previously measured around 7 ms on the Visa source. The native-link browser module is 789 bytes raw / 474 bytes gzip. The deployed Worker, including its server-side directory, is about 74.9 KiB gzip and reported a 3 ms startup.

Detailed measurements and methodology are in the `report-performance-review.json` chat output. Larger future improvements would be progressive history/auxiliary loading and filing-context-aware mapping, rather than adding a heavy library to every report page.
