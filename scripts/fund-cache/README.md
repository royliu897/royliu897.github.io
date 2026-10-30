# Fund-native shareholder reports

Closed-end funds such as BDJ do not necessarily have SEC CompanyFacts. This offline source path uses their N-CSR/N-CSRS shareholder reports and preserves fund-native statement meanings.

From the website repository:

```sh
python3 scripts/fund-cache/pull.py --cik 1332283 --ticker BDJ --cache-root /home/royl/projects/sftsaf/fund-cache --reports 4
python3 scripts/fund-cache/build.py /home/royl/projects/sftsaf/fund-cache assets/report/data/funds
node --test tests/fund-report-tests.mjs
```

The downloader validates SEC submission CIK/ticker identity before choosing report URLs. The extractor verifies the cover's fund name, available XBRL CIK declarations, URL issuer/accession, and the explicitly labelled fund column. It does not use the first amount column of a combined report. Caption/label mappings are explicit and fund-specific accounting concepts remain separate from corporate revenue/EPS. Unknown rows are not guessed.

The current generic table layout is tested on four BDJ shareholder reports with 2015–2025 financial highlights and recent annual/semiannual statements. It is not a universal parser for every fund sponsor/report design. Reports sharing a combined financial report must still identify their own issuer and source metadata before extraction.

Fund cache payloads retain original dollars, shares, per-share dollars and percentage points. Displayed money/share counts are in millions; per-share values retain dollars. Source links, filing dates, table/row positions and full-source SHA-256 hashes remain in provenance. Annual highlights' rounded-thousand net assets never override an available exact-dollar statement balance.

The latest-balance column uses the most recent shareholder report. No corporate EPS, P/E, ROIC or manufactured TTM fund income is produced. Annualized distributions are the explicitly stated distribution rate as of the source date, not a claim about actual trailing cash payments. NAV and current quote may have different as-of dates and must be labelled accordingly.

Only compact JSON is exposed to the browser. Raw multi-megabyte filings remain outside the website. The runtime caches one small manifest plus the requested fund JSON; failed requests fall back without diagnostic UI and can retry after a short backoff.
