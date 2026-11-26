from __future__ import annotations
import argparse, concurrent.futures, http.server, json, os, time, tomllib
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse
from .providers import YahooProvider, AlpacaProvider, universe
from .store import Store, atomic_json
from .engine import (
    analytics,
    completed_session,
    eligible,
    merge_incremental,
    peers_and_scores,
    sessions,
    validate_prices,
    quick_exclusions,
)

DEFAULT = {
    "screen": {"years": 10, "min_market_cap": 50e6, "min_peers": 5},
    "provider": {"workers": 2, "requests_per_minute": 60, "profile_ttl_days": 7},
}


def configuration(path):
    result = {k: dict(v) for k, v in DEFAULT.items()}
    if path:
        for k, v in tomllib.loads(Path(path).read_text()).items():
            result.setdefault(k, {}).update(v)
    return result


def build(store, config):
    as_of = completed_session()
    start = (
        date.fromisoformat(as_of)
        - timedelta(days=370 * (config["screen"].get("years", 10) + 1))
    ).isoformat()
    calendar = sessions(start, as_of)
    rows = []
    excluded = []
    missing = []
    errors = []
    allrows = store.securities()
    benchmark = analytics(store.prices("SPY"), calendar, as_of)
    benchmark["price_provider"] = store.receipt("SPY").get("provider")
    for record in allrows:
        ticker = record["ticker"]
        reference = json.loads(record["reference"])
        profile = json.loads(record["profile"] or "{}")
        if ticker == "SPY":
            continue
        if record["error"]:
            errors.append({"ticker": ticker, "reason": record["error"]})
        quick = quick_exclusions(reference, config["screen"])
        if quick:
            excluded.append({"ticker": ticker, "reasons": quick})
            continue
        if not profile:
            missing.append(ticker)
            continue
        reasons = eligible(reference, profile, config["screen"])
        if reasons:
            excluded.append({"ticker": ticker, "reasons": reasons})
            continue
        try:
            prices = store.prices(ticker)
            if not prices:
                missing.append(ticker)
                continue
            result = analytics(prices, calendar, as_of)
        except Exception as e:
            errors.append(
                {
                    "ticker": ticker,
                    "reason": "Invalid cached history: " + type(e).__name__,
                }
            )
            missing.append(ticker)
            continue
        if (result.get("dollar_volume") or 0) < config["screen"].get(
            "min_dollar_volume", 0
        ):
            excluded.append({"ticker": ticker, "reasons": ["liquidity"]})
            continue
        rows.append(
            {
                **result,
                "ticker": ticker,
                "cik": reference["cik"],
                "name": profile.get("longName") or reference["name"],
                "exchange": reference["exchange"],
                "industry": profile.get("industry"),
                "sector": profile.get("sector"),
                "market_cap": profile.get("marketCap"),
                "profile_at": record["profile_at"],
                "source": store.receipt(ticker).get("provider"),
                "price_provider": store.receipt(ticker).get("provider"),
                "report_url": "https://royrliu.com/report.html#/company/"
                + reference["exchange"]
                + "."
                + ticker,
            }
        )
    rows, industries = peers_and_scores(
        rows,
        config["screen"].get("min_peers", 5),
        config["screen"].get("peer_fallback", False),
        benchmark,
    )
    prior = store.db.execute(
        "SELECT ticker,result FROM screens WHERE as_of=(SELECT MAX(as_of) FROM screens WHERE as_of<?)",
        [as_of],
    ).fetchall()
    old = {t: json.loads(v) for t, v in prior}
    for r in rows:
        r["new_signals"] = (
            [
                s
                for s in r["signals"]
                if s not in old.get(r["ticker"], {}).get("signals", [])
            ]
            if old
            else []
        )
    if rows:
        store.save_screen(as_of, rows)
    coverage = {
        "listed_candidates": len(allrows) - 1,
        "loaded": len(rows),
        "excluded": len(excluded),
        "pending": len(missing),
        "stale": sum(bool(r.get("stale")) for r in rows),
        "weak_peers": sum(
            r.get("industry_126d_peers", 0) < config["screen"].get("min_peers", 5)
            for r in rows
        ),
        "errors": len(errors),
    }
    output = {
        "schema_version": 1,
        "as_of": as_of,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "provider": ", ".join(sorted({str(r["source"]) for r in rows}))
        if rows
        else "Yahoo Finance / yfinance",
        "classification": "Yahoo current industry / sector",
        "universe": "Nasdaq Trader active exchange listings; Yahoo US domicile; SEC issuer identity",
        "min_market_cap": config["screen"].get("min_market_cap", 50e6),
        "min_peers": config["screen"].get("min_peers", 5),
        "coverage": coverage,
        "rows": rows,
        "industries": industries,
        "phase": 1,
    }
    atomic_json(store.root / "website/latest.json", output)
    atomic_json(
        store.root / "website/status.json",
        {
            k: output[k]
            for k in ["schema_version", "as_of", "generated_at", "coverage", "provider"]
        },
    )
    audit = {k: v for k, v in output.items() if k not in ["rows", "industries"]}
    audit.update(
        exclusions=excluded,
        pending=missing,
        provider_errors=errors,
        limitations=[
            "Price dislocation is not historical valuation compression.",
            "Current live universe and current industry classifications; no survivorship-free backtests.",
            "Yahoo is unofficial and personal-use; raw histories and snapshots remain local.",
            "Historical valuation and fundamental-disconnect screens are not implemented in phase 1.",
        ],
    )
    atomic_json(store.root / "website/audit.json", audit)
    print(
        json.dumps(
            {
                "as_of": as_of,
                **coverage,
                "snapshot": str(store.root / "website/latest.json"),
            }
        ),
        flush=True,
    )
    return output


def refresh(store, config, limit=None, tickers=None):
    cfg = config["provider"]
    provider = YahooProvider(cfg.get("requests_per_minute", 60))
    price_provider = AlpacaProvider() if cfg.get("name") == "alpaca" else provider
    as_of = date.fromisoformat(completed_session())
    today = datetime.now(timezone.utc).isoformat()
    records = store.securities()
    # Work resumes where it stopped; a first installation prioritizes liquid
    # familiar names only for latency, then continues the complete directory.
    priority = {
        t: i
        for i, t in enumerate(
            "SPY NKE HD GAP AAPL MSFT PG V FDX INTC PYPL TGT WBA CVS PFE MRK DIS BA WBD PARA F GM STLA DLTR DG EL UPS CCL AAL LUV WFC C BAC JPM ALL PRU MET AIG USB XOM CVX OXY HAL SLB DOW LYB NUE STLD CAT DE LEN DHI MCD SBUX CMG TSLA NVDA AMD AVGO QCOM ORCL CRM ADBE AMZN GOOGL META NFLX EBAY ETSY BABA TSM".split()
        )
    }
    records.sort(
        key=lambda r: (
            r["price_at"] == as_of.isoformat(),
            bool(r["price_at"]),
            priority.get(r["ticker"], 10000),
            r["ticker"],
        )
    )
    if tickers:
        records = [r for r in records if r["ticker"] in tickers]
    records = [
        r
        for r in records
        if r["price_at"] != as_of.isoformat()
        and (
            r["ticker"] == "SPY"
            or not quick_exclusions(json.loads(r["reference"]), config["screen"])
        )
    ]
    if limit is not None:
        records = records[:limit]

    def work(record):
        reference = json.loads(record["reference"])
        profile = json.loads(record["profile"] or "{}")
        profile_at = record["profile_at"]
        newprofile = False
        if record["ticker"] != "SPY" and (
            not profile
            or not profile_at
            or (datetime.now(timezone.utc) - datetime.fromisoformat(profile_at)).days
            >= cfg.get("profile_ttl_days", 7)
        ):
            profile = provider.profile(record["ticker"])
            newprofile = True
        if record["ticker"] != "SPY" and eligible(reference, profile, config["screen"]):
            return record, profile, newprofile, None, None
        old = (
            store.prices(record["ticker"])
            if store.receipt(record["ticker"]).get("provider") == price_provider.name
            else []
        )
        start = (
            as_of - timedelta(days=366 * config["screen"].get("years", 10))
            if not old
            else date.fromisoformat(old[-1]["date"]) - timedelta(days=14)
        )
        new = [
            p
            for p in price_provider.prices(record["ticker"], start, as_of)
            if p["date"] <= as_of.isoformat()
        ]
        try:
            merged = merge_incremental(old, new)
        except ValueError:
            merged = validate_prices(
                price_provider.prices(
                    record["ticker"],
                    as_of - timedelta(days=366 * config["screen"].get("years", 10)),
                    as_of,
                )
            )
        return record, profile, newprofile, merged, None

    # Database writes stay on the coordinator; workers only fetch independent securities.
    processed = 0
    last_export = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(
        max_workers=min(4, max(1, cfg.get("workers", 2)))
    ) as pool:
        iterator = iter(records)
        pending = {}

        def submit():
            try:
                r = next(iterator)
            except StopIteration:
                return False
            pending[pool.submit(work, r)] = r
            return True

        for _ in range(min(4, max(1, cfg.get("workers", 2)))):
            submit()
        while pending:
            done, _ = concurrent.futures.wait(
                pending, return_when=concurrent.futures.FIRST_COMPLETED
            )
            for future in done:
                record = pending.pop(future)
                try:
                    _, profile, changed, prices, _ = future.result()
                    if changed:
                        store.update(
                            record["ticker"],
                            profile=profile,
                            profile_at=datetime.now(timezone.utc).isoformat(),
                        )
                    if prices:
                        store.put_prices(
                            record["ticker"],
                            prices,
                            {
                                "provider": price_provider.name,
                                "fetched_at": datetime.now(timezone.utc).isoformat(),
                                "through": as_of.isoformat(),
                                "basis": "split-adjusted close and dividend-adjusted total-return close",
                            },
                        )
                    store.update(
                        record["ticker"], price_at=as_of.isoformat(), error=None
                    )
                except Exception as e:
                    store.update(
                        record["ticker"], error=type(e).__name__ + ": " + str(e)[:180]
                    )
                processed += 1
                if processed % 10 == 0:
                    print(
                        json.dumps(
                            {
                                "processed": processed,
                                "queued": len(records),
                                "ticker": record["ticker"],
                            }
                        ),
                        flush=True,
                    )
                if time.monotonic() - last_export > 60:
                    build(store, config)
                    last_export = time.monotonic()
                submit()
    return build(store, config)


def serve(root, port):
    repo = Path(__file__).resolve().parents[3]
    root = Path(root).expanduser().resolve()

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(repo), **kw)

        def end_headers(self):
            origin = self.headers.get("Origin")
            if origin in [
                "https://royrliu.com",
                "http://127.0.0.1:8766",
                "http://localhost:8766",
                "http://127.0.0.1:" + str(port),
                "http://localhost:" + str(port),
            ]:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.end_headers()

        def do_GET(self):
            path = urlparse(self.path).path
            if self.headers.get("Origin") not in [
                None,
                "https://royrliu.com",
                "http://127.0.0.1:8766",
                "http://localhost:8766",
                "http://127.0.0.1:" + str(port),
                "http://localhost:" + str(port),
            ]:
                self.send_error(403)
                return
            if path in [
                "/screener-data/latest.json",
                "/screener-data/audit.json",
                "/screener-data/status.json",
            ]:
                target = root / "website" / path.rsplit("/", 1)[1]
                if not target.exists():
                    self.send_error(404)
                    return
                data = target.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            if (
                path.startswith("/assets/")
                and ".." not in path
                and Path(path).suffix in [".mjs", ".css", ".svg", ".png", ".js"]
                or path in ["/screener.html", "/styles.css", "/"]
            ):
                if path == "/":
                    self.path = "/screener.html"
                return super().do_GET()
            self.send_error(404)

    print(f"http://127.0.0.1:{port}/screener.html", flush=True)
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data",
        default=os.environ.get(
            "ROY_SCREENER_DATA", str(Path.home() / ".local/share/roy-screener")
        ),
    )
    parser.add_argument("--config")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init")
    update = sub.add_parser("update")
    update.add_argument("--limit", type=int)
    update.add_argument("--tickers")
    update.add_argument("--force", action="store_true")
    sub.add_parser("build")
    sub.add_parser("audit")
    server = sub.add_parser("serve")
    server.add_argument("--port", type=int, default=8772)
    imp = sub.add_parser("import")
    imp.add_argument("prices")
    imp.add_argument("profiles")
    args = parser.parse_args()
    config = configuration(args.config)
    if args.command == "serve":
        serve(args.data, args.port)
        return
    store = Store(args.data)
    try:
        if args.command == "init":
            rows = universe()
            incoming = {r["ticker"] for r in rows} | {"SPY"}
            for old in store.securities():
                if old["ticker"] not in incoming:
                    store.put_universe(
                        [{**json.loads(old["reference"]), "active": False}]
                    )
            rows = [{**r, "active": True} for r in rows]
            rows.append(
                {
                    "ticker": "SPY",
                    "name": "Market benchmark",
                    "exchange": "NYSE",
                    "flags": ["fund"],
                    "cik": "SPY",
                }
            )
            store.put_universe(rows)
            print(json.dumps({"candidates": len(rows) - 1}))
            build(store, config)
        elif args.command == "update":
            tickers = set(args.tickers.split(",")) if args.tickers else None
            if args.force:
                for record in store.securities():
                    if not tickers or record["ticker"] in tickers:
                        store.update(record["ticker"], price_at=None, profile_at=None)
            refresh(store, config, args.limit, tickers)
        elif args.command == "build":
            build(store, config)
        elif args.command == "audit":
            print((store.root / "website/audit.json").read_text())
        elif args.command == "import":
            from .providers import CsvProvider

            profiles = json.loads(Path(args.profiles).read_text())
            csvprovider = CsvProvider(args.prices)
            for record in profiles:
                store.put_universe([record["reference"]])
                ticker = record["reference"]["ticker"]
                store.update(
                    ticker,
                    profile=record["profile"],
                    profile_at=datetime.now(timezone.utc).isoformat(),
                )
                store.put_prices(
                    ticker,
                    validate_prices(
                        csvprovider.prices(ticker, date(1900, 1, 1), date.today())
                    ),
                    {
                        "provider": "User CSV",
                        "fetched_at": datetime.now(timezone.utc).isoformat(),
                        "basis": "User-supplied adjusted closes",
                    },
                )
            build(store, config)
    finally:
        store.close()


if __name__ == "__main__":
    main()
