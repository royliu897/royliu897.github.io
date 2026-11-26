# Provider feasibility — checked November 25, 2026

| Source | Verified offering / constraint | Use here |
|---|---|---|
| [Nasdaq Trader](https://classic.nasdaqtrader.com/Trader.aspx?id=SymbolDirDefs) | Current Nasdaq/other-listed symbol files, test/security/ETF flags; ordinary files do not establish company domicile | Exchange/security reference |
| [SEC](https://www.sec.gov/about/developer-resources) | Public submissions and CompanyFacts APIs; nightly bulk files; fair-access rules apply; no daily stock prices | CIK identity; existing financial report |
| [yfinance](https://github.com/ranaroussi/yfinance/blob/main/README.md) | Key-free unofficial Yahoo interfaces; maintainer explicitly describes personal use, no service guarantee or documented universal rate allowance | Default local historical-price/reference adapter |
| [Alpaca](https://docs.alpaca.markets/us/docs/about-market-data-api) | Free Basic account, registered credentials, 200 historical calls/minute, history since 2016; recent SIP data is restricted; IEX covers one exchange | Optional documented adapter; no key configured |
| [Alpaca bars](https://docs.alpaca.markets/us/reference/stockbars) | Multiple symbols per request, 10,000 observations per page, pagination mandatory; split/dividend adjustments selectable | Batch/pagination implementation |
| [SimFin](https://www.simfin.com/en/prices/) | Free plan advertises US coverage and five years of fundamentals/charts with API/bulk access; account/tier limits apply | Potential later fundamentals provider; not assumed unlimited or redistribution licensed |
| [FMP](https://site.financialmodelingprep.com/developer/docs/pricing) | Basic advertises 250 calls/day; historical/endpoint/bandwidth entitlements depend on plan; separate display/redistribution agreement required | Too limited for a default key-free market-wide backfill |
| [Alpha Vantage](https://www.alphavantage.co/premium/) | Standard free allowance is 25 requests/day; premium functions exist | Too limited for the universe |

Official Alpaca materials describe delayed historical SIP availability while distinguishing free IEX real-time coverage. The adapter requests completed historical sessions and treats an entitlement error as a failure; it does not silently substitute IEX for SIP.

A library’s open-source license does not grant redistribution rights to its underlying market data. Therefore Yahoo histories/snapshots stay in local storage; only application code is deployed. The website can read the user’s loopback service or an imported private snapshot. No API secrets are embedded in HTML, JavaScript, Parquet exports or browser configuration.

Stooq was considered but is not used: its download access, adjustment conventions and redistribution permissions were not verified sufficiently for this implementation. No claim is made that arbitrary publicly reachable endpoints are unrestricted feeds.
