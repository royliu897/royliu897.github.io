from __future__ import annotations
import json, os, re, hashlib
from pathlib import Path
import duckdb, polars as pl


class Store:
    def __init__(self, root):
        self.root = Path(root).expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / "prices").mkdir(exist_ok=True)
        self.db = duckdb.connect(str(self.root / "research.duckdb"))
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS securities(ticker VARCHAR PRIMARY KEY, reference JSON, profile JSON, profile_at VARCHAR, price_at VARCHAR, error VARCHAR)"
        )
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS screens(as_of VARCHAR, ticker VARCHAR, result JSON, PRIMARY KEY(as_of,ticker))"
        )

    def put_universe(self, rows):
        for row in rows:
            self.db.execute(
                "INSERT INTO securities(ticker,reference) VALUES (?,?) ON CONFLICT(ticker) DO UPDATE SET reference=excluded.reference",
                [row["ticker"], json.dumps(row)],
            )

    def securities(self):
        return [
            dict(
                zip(
                    [
                        "ticker",
                        "reference",
                        "profile",
                        "profile_at",
                        "price_at",
                        "error",
                    ],
                    r,
                )
            )
            for r in self.db.execute(
                "SELECT * FROM securities ORDER BY ticker"
            ).fetchall()
        ]

    def path(self, ticker):
        if not re.fullmatch(r"[A-Z0-9.-]{1,16}", ticker):
            raise ValueError("Invalid ticker")
        return self.root / "prices" / f"{ticker}.parquet"

    def prices(self, ticker):
        path = self.path(ticker)
        return pl.read_parquet(path).to_dicts() if path.exists() else []

    def analyze(self, ticker, calendar, as_of):
        from .engine import analytics

        path = self.path(ticker)
        if not path.exists():
            return None
        stat = path.stat()
        signature = f"2:{as_of}:{stat.st_size}:{stat.st_mtime_ns}"
        target = self.root / "analytics" / f"{ticker}.json"
        try:
            cached = json.loads(target.read_text())
            if cached.get("signature") == signature:
                return cached["result"]
        except (OSError, ValueError):
            pass
        result = analytics(self.prices(ticker), calendar, as_of)
        atomic_json(target, {"signature": signature, "result": result})
        return result

    def put_prices(self, ticker, rows, provenance=None):
        path = self.path(ticker)
        temp = path.with_suffix(".tmp")
        pl.DataFrame(rows).sort("date").write_parquet(temp, compression="zstd")
        os.replace(temp, path)
        if provenance:
            atomic_json(
                path.with_suffix(".meta.json"),
                {
                    **provenance,
                    "observation_sha256": hashlib.sha256(
                        json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()
                    ).hexdigest(),
                },
            )

    def receipt(self, ticker):
        path = self.path(ticker).with_suffix(".meta.json")
        return (
            json.loads(path.read_text())
            if path.exists()
            else {"provider": "Yahoo Finance / yfinance"}
        )

    def update(self, ticker, **fields):
        for key, value in fields.items():
            if key not in ["profile", "profile_at", "price_at", "error"]:
                raise ValueError("Invalid store field")
            self.db.execute(
                f"UPDATE securities SET {key}=? WHERE ticker=?",
                [json.dumps(value) if key == "profile" else value, ticker],
            )

    def save_screen(self, as_of, rows):
        # Daily event history needs metrics and signals, not duplicate chart arrays.
        values = [
            (
                as_of,
                r["ticker"],
                json.dumps(
                    {k: v for k, v in r.items() if k != "chart"},
                    allow_nan=False,
                    separators=(",", ":"),
                ),
            )
            for r in rows
        ]
        self.db.execute("BEGIN TRANSACTION")
        try:
            self.db.executemany("INSERT OR REPLACE INTO screens VALUES (?,?,?)", values)
            self.db.execute("COMMIT")
        except BaseException:
            self.db.execute("ROLLBACK")
            raise

    def close(self):
        self.db.close()


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(
        json.dumps(value, separators=(",", ":"), allow_nan=False), encoding="utf-8"
    )
    os.replace(temp, path)
