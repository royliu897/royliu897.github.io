from datetime import datetime, timezone
import copy
import pytest
from roy_screener.engine import (
    analytics,
    merge_incremental,
    peers_and_scores,
    eligible,
    signals,
    validate_prices,
    completed_session,
    sessions,
    quick_exclusions,
)
from roy_screener.store import Store
from roy_screener.providers import security_flags, AlpacaProvider


@pytest.fixture
def data():
    cal = sessions("2020-01-01", "2026-01-30")
    rows = [
        {
            "date": d,
            "split_close": 100 + i / 10,
            "total_close": 100 + i / 8,
            "volume": 10000.0,
            "dividend": 0.0,
            "split": 0.0,
        }
        for i, d in enumerate(cal)
    ]
    return rows, cal


def test_returns_drawdowns_and_real_calendar(data):
    rows, cal = data
    out = analytics(rows, cal, cal[-1])
    assert out["return_5y"] == pytest.approx(
        rows[-1]["total_close"] / rows[-1261]["total_close"] - 1
    )
    assert out["drawdown_5y"] == 0
    assert "2025-12-25" not in cal
    rows[-1]["split_close"] = 100
    out = analytics(rows, cal, cal[-1])
    assert out["drawdown_1y"] == pytest.approx(100 / rows[-2]["split_close"] - 1)
    assert out["return_1d"] > 0


def test_missing_sessions_not_filled(data):
    rows, cal = data
    rows.pop(-2)
    out = analytics(rows, cal, cal[-1])
    assert out["return_1d"] is None
    assert out["return_5d"] is not None
    assert out["drawdown_1y"] is None
    assert out["volatility"] is None


def test_short_history_stale_and_future(data):
    rows, cal = data
    out = analytics(rows[-100:], cal, cal[-1])
    assert out["drawdown_1y"] is None
    assert out["return_5y"] is None
    assert analytics(rows[:-1], cal, cal[-1])["stale"]
    future = {**rows[-1], "date": "2099-01-01", "split_close": 99999}
    assert analytics(rows + [future], cal, cal[-1])["return_1d"] == out["return_1d"]


def test_adjustment_overlap(data):
    rows, _ = data
    old = rows[:10]
    new = [
        {
            **p,
            "split_close": p["split_close"] / 2,
            "total_close": p["total_close"] / 2,
            "volume": p["volume"] * 2,
        }
        for p in rows[7:15]
    ]
    saved = copy.deepcopy(old)
    out = merge_incremental(old, new)
    assert out[0]["split_close"] == old[0]["split_close"] / 2
    assert old == saved
    assert out[0]["volume"] == old[0]["volume"] * 2
    new[1]["total_close"] *= 0.8
    with pytest.raises(ValueError, match="Nonuniform"):
        merge_incremental(old, new)
    with pytest.raises(ValueError, match="overlap"):
        merge_incremental(old, rows[20:])


def test_bad_prices(data):
    rows, _ = data
    with pytest.raises(ValueError, match="Duplicate"):
        validate_prices(rows[:2] + rows[:1])
    for value in [0, -1, float("nan"), float("inf")]:
        with pytest.raises(ValueError):
            validate_prices([{**rows[0], "split_close": value}])


def candidates():
    return [
        {
            "ticker": str(i),
            "cik": str(i),
            "industry": "Software",
            "sector": "Technology",
            "as_of": "2026-01-30",
            "return_126d": -0.1 * i,
            "return_252d": -0.05 * i,
            "return_1d": 0.0,
            "return_5d": 0.0,
            "return_63d": 0.0,
            "drawdown_3y": 0.0,
            "drawdown_5y": None,
            "dollar_volume": 100 + i,
            "stale": False,
        }
        for i in range(7)
    ]


def test_peer_medians_exclude_issuer_classes():
    rows = candidates()
    rows.append({**rows[1], "ticker": "1B", "return_126d": 1000.0, "dollar_volume": 1})
    out, groups = peers_and_scores(rows)
    assert out[0]["industry_126d_peers"] == 6
    assert out[0]["industry_126d_median"] == pytest.approx(-0.35)
    assert out[1]["industry_126d_peers"] == 6
    assert groups[0]["issuers"] == 7
    assert out[-1]["industry_126d_median"] == out[1]["industry_126d_median"]


def test_weak_peers_dates_and_missing_never_good():
    rows = candidates()[:5]
    rows[0]["return_126d"] = None
    out, _ = peers_and_scores(rows)
    assert out[0]["industry_126d_median"] is None
    assert out[0]["laggard_score"] is None
    rows = candidates()
    rows[-1]["as_of"] = "2026-01-29"
    rows[-2]["stale"] = True
    out, _ = peers_and_scores(rows)
    assert out[0]["industry_126d_excess"] is None


def test_industry_vs_sector_are_explicit():
    rows = candidates()
    rows[0]["industry"] = "Other"
    out, _ = peers_and_scores(rows, fallback=False)
    assert out[0]["industry_126d_excess"] is None
    out, _ = peers_and_scores(rows, fallback=True)
    assert out[0]["peer_basis"] == "Sector fallback"
    assert out[0]["industry_126d_excess"] == out[0]["sector_126d_excess"]


def test_thresholds_and_percentiles():
    assert "Sudden decline" in signals({"return_1d": -0.08})
    assert not signals({"return_1d": -0.079999})
    assert "Persistent decline" in signals({"return_63d": -0.2})
    assert "Depressed price" in signals({"drawdown_5y": -0.5})
    assert "Industry laggard" in signals({"industry_126d_excess": -0.2})
    assert not signals({"stale": True, "return_1d": -1})
    rows = candidates()
    out, _ = peers_and_scores(rows)
    assert out[-1]["persistent_score"] > out[0]["persistent_score"]
    assert all(0 <= r["score"] <= 100 for r in out)


def test_universe_domicile_security_types_and_null_cap():
    reference = {"cik": "1", "exchange": "NYSE", "flags": []}
    profile = {
        "country": "United States",
        "quoteType": "EQUITY",
        "marketCap": 60e6,
        "currency": "USD",
    }
    assert not eligible(reference, profile, {})
    assert "foreign" in eligible(reference, {**profile, "country": "China"}, {})
    assert "market cap" in eligible(reference, {**profile, "marketCap": None}, {})
    assert "fund" in security_flags("Alpha Closed-End Fund", "ABC")
    assert "warrant" in security_flags("Alpha Warrants", "ABCW")
    assert "spac" in security_flags("Example Acquisition Corp", "ABC")
    assert "preferred" in quick_exclusions({**reference, "flags": ["preferred"]}, {})


def test_store_atomic_merge_and_research_separation(tmp_path, data):
    rows, _ = data
    store = Store(tmp_path)
    store.put_universe([{"ticker": "AAA", "cik": "1"}])
    store.put_prices("AAA", rows[:10])
    assert store.prices("AAA") == rows[:10]
    with pytest.raises(ValueError):
        store.path("../secret")
    store.save_screen("2026-01-30", [{"ticker": "AAA", "signals": ["Depressed price"]}])
    assert store.db.execute("select count(*) from screens").fetchone()[0] == 1
    store.close()
    assert not list(tmp_path.glob("*notes*"))


def test_calendar_completed_session():
    assert (
        completed_session(datetime(2025, 12, 25, 18, tzinfo=timezone.utc))
        == "2025-12-24"
    )
    assert (
        completed_session(datetime(2025, 11, 28, 19, tzinfo=timezone.utc))
        == "2025-11-28"
    )


def test_alpaca_credentials_are_optional(monkeypatch):
    monkeypatch.delenv("APCA_API_KEY_ID", raising=False)
    monkeypatch.delenv("APCA_API_SECRET_KEY", raising=False)
    with pytest.raises(ValueError, match="locally"):
        AlpacaProvider()


def test_refresh_is_incremental_and_provider_failure_keeps_last_good(
    tmp_path, data, monkeypatch
):
    from roy_screener import cli

    rows, calendar = data
    old = rows[-25:-1]
    store = Store(tmp_path)
    for ticker, cik in [("AAA", "1"), ("BBB", "2")]:
        store.put_universe(
            [
                {
                    "ticker": ticker,
                    "cik": cik,
                    "exchange": "NYSE",
                    "flags": [],
                    "name": ticker,
                }
            ]
        )
        store.update(
            ticker,
            profile={
                "country": "United States",
                "quoteType": "EQUITY",
                "marketCap": 100e6,
                "currency": "USD",
                "industry": "Example",
                "sector": "Example",
            },
            profile_at=datetime.now(timezone.utc).isoformat(),
            price_at=old[-1]["date"],
        )
        store.put_prices(ticker, old)
    calls = []

    class FakeProvider:
        name = "Yahoo Finance / yfinance"

        def __init__(self, *args):
            pass

        def prices(self, ticker, start, end):
            calls.append((ticker, start))
            if ticker == "BBB":
                raise OSError("Provider unavailable")
            return [
                p for p in rows if start.isoformat() <= p["date"] <= end.isoformat()
            ]

    monkeypatch.setattr(cli, "YahooProvider", FakeProvider)
    monkeypatch.setattr(cli, "completed_session", lambda: calendar[-1])
    saved = store.path("BBB").read_bytes()
    cli.refresh(store, {"provider": {"workers": 2}, "screen": {"years": 10}})
    assert store.path("BBB").read_bytes() == saved
    assert store.prices("AAA")[-1]["date"] == calendar[-1]
    assert dict(calls)["AAA"].isoformat() > old[0]["date"]
    calls.clear()
    cli.refresh(store, {"provider": {"workers": 2}, "screen": {"years": 10}})
    assert all(ticker != "AAA" for ticker, _ in calls)
    assert any(r["error"] for r in store.securities() if r["ticker"] == "BBB")
    store.close()


def test_chart_preserves_tiny_positive_prices(data):
    rows, cal = data
    for point in rows:
        if point["date"][:7] == rows[0]["date"][:7]:
            point["split_close"] = 1e12
            point["total_close"] = 1e12
    out = analytics(rows, cal, cal[-1])
    assert all(point[1] > 0 and point[2] > 0 for point in out["chart"])
    assert out["chart"][-1][1] < 0.001


def test_analysis_cache_avoids_recomputation_and_invalidates_source(
    tmp_path, data, monkeypatch
):
    rows, cal = data
    store = Store(tmp_path)
    store.put_prices("AAA", rows)
    first = store.analyze("AAA", cal, cal[-1])
    original = store.prices

    def forbidden(*args):
        raise AssertionError("Unchanged source must not reread/recompute prices")

    monkeypatch.setattr(store, "prices", forbidden)
    assert store.analyze("AAA", cal, cal[-1]) == first
    monkeypatch.setattr(store, "prices", original)
    rows[-1]["split_close"] = 123.0
    store.put_prices("AAA", rows)
    assert store.analyze("AAA", cal, cal[-1])["price"] == 123.0
    store.close()


def test_indexed_peer_results_match_independent_naive_reference():
    from statistics import median

    rows = []
    for i in range(30):
        rows.append(
            {
                "ticker": str(i),
                "cik": str(i),
                "industry": "One",
                "sector": "Tech",
                "as_of": "2026-01-30" if i % 7 else "2026-01-29",
                "price_provider": "A" if i % 3 else "B",
                "return_126d": None if i % 5 == 0 else (i % 8 - 4) / 10,
                "dollar_volume": 100 + i,
                "stale": i % 11 == 0,
            }
        )
    rows.append({**rows[1], "ticker": "1B", "return_126d": -0.9, "dollar_volume": 1})
    canonical = {r["cik"]: r for r in rows[:-1]}
    out, _ = peers_and_scores(rows)
    for r in out:
        valid = [
            p["return_126d"]
            for p in canonical.values()
            if p["cik"] != r["cik"]
            and not p["stale"]
            and p["as_of"] == r["as_of"]
            and p["price_provider"] == r["price_provider"]
            and p["return_126d"] is not None
        ]
        assert r["industry_126d_peers"] == len(valid)
        assert r["industry_126d_median"] == (median(valid) if len(valid) >= 5 else None)
        if len(valid) >= 5 and r["return_126d"] is not None:
            assert r["industry_126d_percentile"] == sum(
                v <= r["return_126d"] for v in valid
            ) / len(valid)
