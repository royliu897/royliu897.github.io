import os, json, math
from pathlib import Path
import polars as pl, pytest


@pytest.mark.skipif(
    not os.environ.get("ROY_SCREENER_DATA"), reason="Real local dataset not configured"
)
def test_real_history_cross_check():
    root = Path(os.environ["ROY_SCREENER_DATA"])
    snapshot = json.loads((root / "website/latest.json").read_text())
    checked = 0
    for row in snapshot["rows"]:
        if row["ticker"] not in ["NKE", "HD", "AAPL"]:
            continue
        data = (
            pl.read_parquet(root / "prices" / f"{row['ticker']}.parquet")
            .sort("date")
            .filter(pl.col("date") <= snapshot["as_of"])
        )
        last = data.tail(1).to_dicts()[0]
        assert row["price"] == last["split_close"]
        base = data.tail(6).head(1).to_dicts()[0]
        assert math.isclose(
            row["return_5d"],
            last["total_close"] / base["total_close"] - 1,
            rel_tol=1e-9,
        )
        assert math.isclose(
            row["drawdown_1y"],
            last["split_close"] / data.tail(252)["split_close"].max() - 1,
            rel_tol=1e-9,
        )
        checked += 1
    assert checked >= 2
