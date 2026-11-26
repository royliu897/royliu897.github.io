# Stock screener

The default view is a ranked stock list. Screening controls are under **Refine**. The page reuses the website’s paper/ink palette, serif headings, research-desk dark theme and theme preference. Each expanded company links to the existing financial report.

This release implements **Phase 1: price-based discovery**. Sudden declines, persistent declines, depressed prices, industry laggards and industry rankings work with actual daily history. Current/historical valuation compression, normalized earnings and fundamental-disconnect screens belong to later phases and are not presented as implemented. The existing report remains the detailed fundamental-research destination.

## Run locally

Python 3.12+ is required. From the repository root:

    python -m venv .venv
    # Linux: source .venv/bin/activate
    # Windows PowerShell: .venv/Scripts/Activate.ps1
    python -m pip install -e "./scripts/screener[test]"
    roy-screen init
    roy-screen update

In a second terminal with the same environment:

    roy-screen serve

Open http://127.0.0.1:8772/screener.html. The production page https://royrliu.com/screener.html can also read the loopback service, subject to your browser’s local-network policy. Alternatively, **Refine → Data & research → Import snapshot** loads ~/.local/share/roy-screener/website/latest.json. The browser remembers the last snapshot in IndexedDB and remains usable while the updater is off. On Windows the default directory is under the current user’s home.

Downloaded Yahoo data stays outside the website repository. Do not publish its snapshots/raw histories as an open data feed. This personal-research workflow does not grant Yahoo redistribution rights. The public deployment contains the interface, not a bundled market dataset.

No API key is required for the default provider. A complete first backfill can take hours; it is resumable and produces usable snapshots as it progresses. The page shows the actual loaded count. That count, not the size of the listing directory, defines the available screen and peer universe. Bootstrap priority affects collection order only, never metrics, eligibility or ranking.

## Routine workflow

    roy-screen update
    roy-screen update --tickers NKE,HD --force
    roy-screen build
    roy-screen audit
    roy-screen init
    roy-screen --config scripts/screener/config.example.toml update
    roy-screen --data /path/to/private-cache serve

Run init when refreshing the directory; removed listings are marked inactive without deleting history. Update skips completed sessions, refreshes reference profiles weekly and fetches a two-week price overlap. Conflicting historical adjustment factors trigger a full history refresh for that security. Provider failures retain previous files and do not stop other securities. Two workers, a shared request gate, three attempts and exponential backoff bound acquisition. Yahoo does not document a guaranteed allowance; the configured gate is a conservative client budget, not a promise of provider capacity.

The frontend checks a compact status file and transfers a new snapshot only after its revision changes. Only 50 table rows render at a time; chart geometry is created on expansion. Charts use monthly samples; analytical returns/drawdowns use daily data.

## Storage and provenance

- research.duckdb: securities/reference/profile freshness and dated screening results.
- prices/{ticker}.parquet: ordered daily adjusted closes, volumes and actions, compressed with Zstandard and replaced atomically.
- prices/{ticker}.meta.json: provider, retrieval time, adjustment basis and SHA-256 of canonical stored observations for newly refreshed files.
- website/latest.json: validated browser snapshot; status.json: small freshness record.
- website/audit.json: exclusions, pending tickers, stale results, weak peer coverage and provider failures.

The web service binds only to loopback, serves a restricted set of files and allows read-only requests from the research website and its own origin. Notes, tags, review status and saved screens live in separate browser storage; data refreshes never overwrite them. Export research before clearing browser storage. Separate share classes share issuer-level research notes.

## Import your own data

Price CSV columns: ticker,date,split_close,total_close,volume. Both price series must be supplied on consistent adjustment bases; raw closes must not be described as adjusted closes.

Profiles JSON is an array of objects with a reference object (ticker, name, numeric SEC cik, exchange, flags) and profile object (country, quoteType, currency, marketCap, industry, sector). Valid exchanges: NYSE, Nasdaq, AMEX. For US common stocks use country United States, quoteType EQUITY, currency USD.

    roy-screen import prices.csv profiles.json

Only import datasets you are permitted to use. CSV/profile adapters allow replacement without changing the engine. AlpacaProvider implements documented paginated historical bars, including a batch method. To use it, set APCA_API_KEY_ID and APCA_API_SECRET_KEY in the local environment and provider.name = "alpaca" in TOML. It uses SIP history ending after a completed session; entitlement failures remain explicit. Yahoo remains the reference-profile adapter. A provider switch backfills that security rather than stitching different feeds together. No brokerage order endpoints are used.

## Formulas and limits

See [METRICS.md](METRICS.md), [PROVIDERS.md](PROVIDERS.md) and the generated private audit for definitions and verified provider constraints. There are no buy/sell recommendations, price predictions, or backtest-return claims.

US classification uses Yahoo’s current country field plus Nasdaq security descriptions and SEC issuer identity. This is a country-of-company proxy, not independent verification of legal incorporation or a complete institutional security master. Unknown country/cap/issuer identity is excluded and recorded. Reference market caps are dated profile values, not recomputed historical capitalization. Optional country/security-type exclusions are configured in TOML and require those securities to be collected.

Historical industry classification changes, delisted-universe reconstruction, corporate reorganization lineage and detailed manual peer groups are not implemented. Corporate reorganizations can make long history incomparable despite mathematically consistent adjustment factors. No company is called undervalued merely because its price fell.

## Tests and frontend build

    python -m pytest scripts/screener/tests -q
    node --test tests/screener-tests.mjs
    # Optional: set ROY_SCREENER_DATA to the private dataset directory first.
    python -m pytest scripts/screener/tests/test_integration.py -q
    python scripts/screener/build_frontend.py

Synthetic fixtures cover session alignment, holidays, insufficient history, split/dividend basis transitions, peer identity, missing data, thresholds, ranks, persistence and failure handling. Real integration checks independently recompute selected returns and drawdowns from cached source observations. Local real data is not committed to the public repo.
