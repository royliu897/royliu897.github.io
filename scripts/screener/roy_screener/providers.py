"""Replaceable personal-research providers. No credentials in exported snapshots."""

from __future__ import annotations
import csv, io, os, re, threading, time
from datetime import date, timedelta
from typing import Protocol
import httpx


class Provider(Protocol):
    name: str

    def profile(self, ticker: str) -> dict: ...
    def prices(self, ticker: str, start: date, end: date) -> list[dict]: ...


class RateGate:
    def __init__(self, rpm):
        self.interval = 60 / rpm
        self.lock = threading.Lock()
        self.next = 0

    def wait(self):
        with self.lock:
            delay = max(0, self.next - time.monotonic())
            self.next = max(self.next, time.monotonic()) + self.interval
        if delay:
            time.sleep(delay)


def retry(fn, gate, attempts=3):
    for attempt in range(attempts):
        gate.wait()
        try:
            return fn()
        except Exception:
            if attempt == attempts - 1:
                raise
            time.sleep(2 ** (attempt + 1))


def security_flags(name, ticker, etf=False):
    n = name.lower()
    flags = []
    if etf or re.search(r"\b(fund|etf|etn|income trust)\b", n):
        flags.append("fund")
    if re.search(r"\b(preferred|preference|depositary shares)\b", n):
        flags.append("preferred")
    if re.search(r"\b(warrants?|rights?|units?)\b", n):
        flags.append("warrant")
    if re.search(r"\b(adr|ads|american depositary|ordinary shares)\b", n):
        flags.append("foreign")
    if re.search(r"\b(acquisition corp|acquisition corporation|blank check)\b", n):
        flags.append("spac")
    return flags


def universe():
    client = httpx.Client(timeout=30, follow_redirects=False)
    out = {}
    for filename, nasdaq in [("nasdaqlisted.txt", True), ("otherlisted.txt", False)]:
        response = client.get("https://www.nasdaqtrader.com/dynamic/SymDir/" + filename)
        response.raise_for_status()
        for row in csv.DictReader(io.StringIO(response.text), delimiter="|"):
            ticker = row.get("Symbol" if nasdaq else "ACT Symbol", "")
            exchange = (
                "Nasdaq"
                if nasdaq
                else {"N": "NYSE", "A": "AMEX"}.get(row.get("Exchange"))
            )
            if (
                not ticker
                or row.get("Test Issue") != "N"
                or not exchange
                or not re.fullmatch(r"[A-Z0-9.-]{1,16}", ticker)
            ):
                continue
            name = row.get("Security Name", "")
            out[ticker.replace(".", "-")] = {
                "ticker": ticker.replace(".", "-"),
                "name": name,
                "exchange": exchange,
                "flags": security_flags(name, ticker, row.get("ETF") == "Y"),
                "cik": None,
            }
    # SEC identity groups share classes; it does not establish US domicile.
    response = client.get("https://research-api.royrliu.com/directory")
    response.raise_for_status()
    for row in response.json()["companies"]:
        if row["ticker"] in out:
            out[row["ticker"]]["cik"] = str(row["cik"])
    return list(out.values())


class YahooProvider:
    name = "Yahoo Finance / yfinance"

    def __init__(self, rpm=60):
        self.gate = RateGate(rpm)

    def profile(self, ticker):
        import yfinance as yf

        value = retry(lambda: yf.Ticker(ticker).get_info(), self.gate)
        if value.get("symbol") != ticker or not value.get("quoteType"):
            raise ValueError("Provider security identity unavailable")
        return {
            k: value.get(k)
            for k in [
                "symbol",
                "longName",
                "country",
                "industry",
                "sector",
                "marketCap",
                "quoteType",
                "currency",
                "exchange",
            ]
        }

    def prices(self, ticker, start, end):
        import yfinance as yf

        frame = retry(
            lambda: yf.Ticker(ticker).history(
                start=start.isoformat(),
                end=(end + timedelta(days=1)).isoformat(),
                auto_adjust=False,
                actions=True,
                timeout=20,
            ),
            self.gate,
        )
        if frame.empty:
            raise ValueError("No daily price history returned")
        result = []
        for index, p in frame.iterrows():
            result.append(
                {
                    "date": index.date().isoformat(),
                    "split_close": float(p["Close"]),
                    "total_close": float(p["Adj Close"]),
                    "volume": float(p["Volume"]),
                    "dividend": float(p.get("Dividends", 0)),
                    "split": float(p.get("Stock Splits", 0)),
                }
            )
        return result


class CsvProvider:
    name = "User CSV"

    def __init__(self, path):
        self.path = path

    def profile(self, ticker):
        raise NotImplementedError("CSV imports require an explicit profile JSON")

    def prices(self, ticker, start, end):
        with open(self.path, newline="", encoding="utf-8-sig") as f:
            return [
                {
                    **row,
                    "split_close": float(row["split_close"]),
                    "total_close": float(row["total_close"]),
                    "volume": float(row["volume"]),
                }
                for row in csv.DictReader(f)
                if row["ticker"] == ticker
                and start.isoformat() <= row["date"] <= end.isoformat()
            ]


class AlpacaProvider:
    name = "Alpaca SIP historical"

    def __init__(self, rpm=120):
        self.gate = RateGate(rpm)
        self.client = httpx.Client(
            timeout=30,
            headers={
                "APCA-API-KEY-ID": os.environ.get("APCA_API_KEY_ID", ""),
                "APCA-API-SECRET-KEY": os.environ.get("APCA_API_SECRET_KEY", ""),
            },
        )
        if not os.environ.get("APCA_API_KEY_ID") or not os.environ.get(
            "APCA_API_SECRET_KEY"
        ):
            raise ValueError("Set APCA_API_KEY_ID and APCA_API_SECRET_KEY locally")

    def profile(self, ticker):
        raise NotImplementedError(
            "Use the cached reference provider for domicile and industry"
        )

    def batch_prices(self, tickers, start, end, adjustment):
        params = {
            "symbols": ",".join(tickers),
            "timeframe": "1Day",
            "start": start.isoformat(),
            "end": end.isoformat() + "T23:59:59Z",
            "adjustment": adjustment,
            "feed": "sip",
            "limit": 10000,
        }
        out = {t: [] for t in tickers}
        while True:

            def get():
                response = self.client.get(
                    "https://data.alpaca.markets/v2/stocks/bars", params=params
                )
                response.raise_for_status()
                return response.json()

            value = retry(get, self.gate)
            for ticker, bars in value.get("bars", {}).items():
                if ticker not in out:
                    raise ValueError("Unexpected security in batch")
                out[ticker].extend(bars)
            token = value.get("next_page_token")
            if not token:
                break
            params["page_token"] = token
        return out

    def prices(self, ticker, start, end):
        split = self.batch_prices([ticker], start, end, "split")[ticker]
        total = self.batch_prices([ticker], start, end, "all")[ticker]
        totals = {p["t"][:10]: p["c"] for p in total}
        return [
            {
                "date": p["t"][:10],
                "split_close": p["c"],
                "total_close": totals[p["t"][:10]],
                "volume": p["v"],
                "dividend": 0.0,
                "split": 0.0,
            }
            for p in split
            if p["t"][:10] in totals
        ]
