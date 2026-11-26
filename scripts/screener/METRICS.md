# Metric definitions

All internal returns are fractions. The interface multiplies them by 100. Null is displayed as a dash.

| Metric | Definition |
|---|---|
| 1D/1W/1M/3M/6M/1Y/3Y/5Y return | Dividend-adjusted close at the latest completed NYSE session divided by the close 1/5/21/63/126/252/756/1260 trading sessions earlier, minus 1 |
| Price return | Same endpoints, using split-adjusted closes |
| YTD return | Total-return close / final session close of the preceding calendar year − 1 |
| 52W/3Y/5Y drawdown | Latest split-adjusted close / maximum split-adjusted close over 252/756/1260 sessions − 1 |
| Maximum observed drawdown | Minimum of close / running historical high − 1 over available history |
| Drawdown duration | Calendar days since the latest occurrence of the highest closing price in available history |
| Volatility | Sample standard deviation of 63 consecutive daily log total returns × √252 |
| Abnormal daily return z-score | (Latest daily total return − mean of preceding 252 daily total returns) / their sample standard deviation; current return excluded |
| Daily return tail percentile | Fraction of those historical daily returns at or below the latest return |
| Volume ratio | Latest volume / mean volume of preceding 20 sessions |
| Dollar liquidity | Mean of split-adjusted close × correspondingly adjusted volume over 21 sessions |
| Industry-relative return | Subject total return − median total return of other valid independent issuers in the current industry |
| Sector/market-relative return | Subject total return − separate sector median / SPY total return |
| Industry equal-weight return | Arithmetic mean of valid independent issuer returns; separate from the default median |
| Industry dispersion | Sample standard deviation of valid independent issuer returns |
| History coverage | Fraction of eight return horizons with valid endpoints; this is not an accuracy guarantee |

Session targets come from the XNYS calendar, including holidays and early closes. No forward fill is used. Missing return endpoints withhold that return; a missing session anywhere in a drawdown/volatility window withholds that window. A recent IPO does not get a five-year metric. Stale securities have no actionable screening signals.

Peer groups select one representative per SEC CIK, favoring a current, liquid class, and exclude all of the subject issuer’s classes. At least five valid other issuers with the same as-of date and price feed are required by default. A sector fallback is opt-in and labeled. The benchmark population is the current eligible loaded universe and therefore changes as backfill proceeds.

## Screens

- Sudden: 1D ≤ −8%, 5D ≤ −12%, or a negative daily return with z ≤ −3.
- Persistent: 63-session return ≤ −20% or 126-session return ≤ −30%.
- Depressed price: three-year drawdown ≤ −40% or five-year drawdown ≤ −50%.
- Industry laggard: six- or twelve-month industry excess return ≤ −20 percentage points.

Custom numeric conditions use explicit AND/OR. Missing observations fail a condition. Size, liquidity, industry and sector selections are additional constraints.

## Ranking

Each independent family takes its most negative available constituent return/drawdown/excess return, then ranks that severity across eligible loaded securities using a tie-aware midpoint empirical percentile (0–100). This percentile transformation is robust to the magnitude of extreme outliers. Correlated horizons are combined by maximum severity, not added. The default list sorts by the largest available family percentile; missing families contribute nothing. The individual company expansion exposes all four component percentiles.

The ranking measures the prominence of a research signal, not probability of profit. A small loaded universe can produce unstable percentiles, so the loaded count is always visible.

## Research state

Rejections are suppressed until a new signal family appears, the maximum severity percentile increases by more than ten points, or a new day triggers a sudden-decline event. Other review states and notes are independent of market refreshes. Percentile changes during backfill can affect the material-change heuristic; inspect the loaded coverage when interpreting these events.

The universe is current, reference classification is current, and price adjustments reflect the vendor’s current history. These results are unsuitable for claims about point-in-time backtest performance. Historical valuation compression is omitted until historical shares, enterprise values and publication-date-aligned financial information are available.
