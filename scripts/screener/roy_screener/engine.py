"""Daily-session price analytics. All returns are fractions, never percentage points."""

from __future__ import annotations
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from statistics import median, stdev
import bisect, math
import exchange_calendars as xcals


def sessions(start, end):
    cal = xcals.get_calendar("XNYS", start=start, end=end)
    return [d.date().isoformat() for d in cal.sessions]


def completed_session(now=None):
    now = now or datetime.now(timezone.utc)
    cal = xcals.get_calendar(
        "XNYS", start=(now - timedelta(days=20)).date(), end=now.date()
    )
    return next(
        s.date().isoformat()
        for s in reversed(cal.sessions)
        if cal.session_close(s).to_pydatetime() <= now
    )


def validate_prices(rows):
    seen = set()
    out = []
    for row in rows:
        d = date.fromisoformat(row["date"]).isoformat()
        if d in seen:
            raise ValueError("Duplicate price session")
        seen.add(d)
        if any(
            not isinstance(row.get(k), (int, float))
            or not math.isfinite(row[k])
            or row[k] <= 0
            for k in ["split_close", "total_close"]
        ):
            raise ValueError("Invalid adjusted close")
        if not math.isfinite(row["volume"]) or row["volume"] < 0:
            raise ValueError("Invalid volume")
        out.append({**row, "date": d})
    return sorted(out, key=lambda p: p["date"])


def merge_incremental(old, new):
    old, new = validate_prices(old), validate_prices(new)
    if not old:
        return new
    previous = {p["date"]: p for p in old}
    overlap = [p for p in new if p["date"] in previous]
    if len(overlap) < 2:
        raise ValueError("Insufficient adjustment overlap; full backfill required")
    factors = {}
    for key in ["split_close", "total_close"]:
        ratios = [p[key] / previous[p["date"]][key] for p in overlap]
        factor = median(ratios)
        if any(abs(v / factor - 1) > 1e-5 for v in ratios):
            raise ValueError("Nonuniform historical revision; full backfill required")
        factors[key] = factor
    # Adjust the cached prefix onto the vendor's newly observed basis. Never
    # concatenate old dividend/split bases with a freshly adjusted suffix.
    volume_ratios = [
        p["volume"] / previous[p["date"]]["volume"]
        for p in overlap
        if previous[p["date"]]["volume"] > 0
    ]
    volume_factor = median(volume_ratios) if volume_ratios else 1
    if any(
        abs(v / volume_factor - 1) > 1e-4 for v in volume_ratios if volume_factor > 0
    ):
        raise ValueError("Nonuniform volume revision; full backfill required")
    merged = {
        p["date"]: {
            **p,
            **{k: p[k] * v for k, v in factors.items()},
            "volume": p["volume"] * volume_factor,
            "dividend": p.get("dividend", 0) * factors["split_close"],
        }
        for p in old
    }
    merged.update({p["date"]: p for p in new})
    return sorted(merged.values(), key=lambda p: p["date"])


HORIZONS = {
    "1d": 1,
    "5d": 5,
    "21d": 21,
    "63d": 63,
    "126d": 126,
    "252d": 252,
    "3y": 756,
    "5y": 1260,
}


def analytics(rows, calendar, as_of):
    rows = validate_prices([p for p in rows if p["date"] <= as_of])
    bydate = {p["date"]: p for p in rows}
    out = {}
    last = bydate.get(as_of)
    if not last:
        return {
            "as_of": rows[-1]["date"] if rows else None,
            "stale": True,
            "history_sessions": len(rows),
            "chart": [],
        }
    index = calendar.index(as_of)
    ordered = calendar[: index + 1]

    def ret(n, key):
        base = bydate.get(ordered[-n - 1]) if len(ordered) > n else None
        return last[key] / base[key] - 1 if base else None

    def window(n):
        dates = ordered[-n:]
        return (
            [bydate[d] for d in dates]
            if len(dates) == n and all(d in bydate for d in dates)
            else None
        )

    for label, n in HORIZONS.items():
        out["return_" + label] = ret(n, "total_close")
        out["price_return_" + label] = ret(n, "split_close")
    for label, n in [("1y", 252), ("3y", 756), ("5y", 1260)]:
        points = window(n)
        out["drawdown_" + label] = (
            last["split_close"] / max(p["split_close"] for p in points) - 1
            if points
            else None
        )
    prior_year = [d for d in ordered if d[:4] < as_of[:4]]
    base = bydate.get(prior_year[-1]) if prior_year else None
    out["return_ytd"] = last["total_close"] / base["total_close"] - 1 if base else None
    peak = 0
    max_dd = 0
    high_date = None
    for p in rows:
        if p["split_close"] >= peak:
            peak = p["split_close"]
            high_date = p["date"]
        max_dd = min(max_dd, p["split_close"] / peak - 1)
    out["max_drawdown"] = max_dd
    out["drawdown_days"] = (
        (date.fromisoformat(as_of) - date.fromisoformat(high_date)).days
        if high_date
        else None
    )
    points = window(64)
    daily = (
        [
            math.log(points[i]["total_close"] / points[i - 1]["total_close"])
            for i in range(1, len(points))
        ]
        if points
        else []
    )
    out["volatility"] = stdev(daily) * math.sqrt(252) if len(daily) > 1 else None
    history = window(254)
    dist = (
        [
            history[i]["total_close"] / history[i - 1]["total_close"] - 1
            for i in range(1, len(history) - 1)
        ]
        if history
        else []
    )
    sd = stdev(dist) if len(dist) > 1 else 0
    out["abnormal_return_z"] = (
        (out["return_1d"] - sum(dist) / len(dist)) / sd
        if sd > 0 and out["return_1d"] is not None
        else None
    )
    out["return_tail_percentile"] = (
        sum(v <= out["return_1d"] for v in dist) / len(dist)
        if dist and out["return_1d"] is not None
        else None
    )
    points = window(21)
    volume = sum(p["volume"] for p in points[:-1]) / 20 if points else 0
    out["volume_ratio"] = last["volume"] / volume if volume > 0 else None
    out["dollar_volume"] = (
        sum(p["split_close"] * p["volume"] for p in points) / 21 if points else None
    )
    # Monthly observations keep the list snapshot small; daily series remain in Parquet.
    months = {}
    for p in rows:
        months[p["date"][:7]] = p
    sampled = list(months.values())
    start = sampled[0] if sampled else last
    out["chart"] = [
        [
            p["date"],
            round(p["split_close"] / start["split_close"] * 100, 3),
            round(p["total_close"] / start["total_close"] * 100, 3),
        ]
        for p in sampled
    ]
    out.update(
        as_of=as_of,
        stale=False,
        price=last["split_close"],
        history_sessions=len(rows),
        history_start=rows[0]["date"],
        price_source="Yahoo split-adjusted close",
        return_basis="Dividend-adjusted total return",
        drawdown_basis="Split-adjusted closing price",
    )
    return out


def quick_exclusions(reference, config):
    reasons = [
        flag
        for flag, key in [
            ("fund", "funds"),
            ("foreign", "foreign"),
            ("preferred", "preferred"),
            ("warrant", "warrants"),
            ("spac", "spacs"),
        ]
        if flag in reference.get("flags", [])
        and not config.get("include_" + key, False)
    ]
    if not reference.get("active", True):
        reasons.append("inactive")
    return reasons


def eligible(reference, profile, config):
    reasons = []
    flags = set(reference.get("flags", []))
    if profile.get("industry") == "Shell Companies":
        flags.add("spac")
    if profile.get("quoteType") != "EQUITY":
        flags.add("fund")
    if profile.get("country") and profile.get("country") != config.get(
        "country", "United States"
    ):
        flags.add("foreign")
    if not profile.get("country"):
        reasons.append("country unavailable")
    for flag, key in [
        ("fund", "funds"),
        ("foreign", "foreign"),
        ("preferred", "preferred"),
        ("warrant", "warrants"),
        ("spac", "spacs"),
    ]:
        if flag in flags and not config.get("include_" + key, False):
            reasons.append(flag)
    cap = profile.get("marketCap")
    if (
        not isinstance(cap, (int, float))
        or not math.isfinite(cap)
        or cap < config.get("min_market_cap", 50e6)
    ):
        reasons.append("market cap")
    if profile.get("currency") != "USD":
        reasons.append("currency")
    if reference.get("exchange") not in config.get(
        "exchanges", ["NYSE", "Nasdaq", "AMEX"]
    ):
        reasons.append("exchange")
    if not reference.get("cik"):
        reasons.append("unverified issuer")
    return reasons


def peers_and_scores(rows, min_peers=5, fallback=False, benchmark=None):
    canonical = {}
    for r in rows:
        key = r["cik"]
        old = canonical.get(key)
        if (
            not old
            or old.get("stale")
            and not r.get("stale")
            or bool(old.get("stale")) == bool(r.get("stale"))
            and (r.get("dollar_volume") or 0) > (old.get("dollar_volume") or 0)
        ):
            canonical[key] = r
    industries = defaultdict(list)
    sectors = defaultdict(list)
    for r in canonical.values():
        if r.get("industry"):
            industries[r["industry"]].append(r)
        if r.get("sector"):
            sectors[r["sector"]].append(r)
    for r in rows:
        for field, label in [("industry", "industry"), ("sector", "sector")]:
            pool = (industries if field == "industry" else sectors).get(
                r.get(field), []
            )
            for h in HORIZONS:
                valid = [
                    p["return_" + h]
                    for p in pool
                    if p["cik"] != r["cik"]
                    and p.get("return_" + h) is not None
                    and p.get("as_of") == r.get("as_of")
                    and not p.get("stale")
                    and p.get("price_provider") == r.get("price_provider")
                ]
                key = label + "_" + h
                r[key + "_peers"] = len(valid)
                r[key + "_median"] = median(valid) if len(valid) >= min_peers else None
                own = r.get("return_" + h)
                r[key + "_excess"] = (
                    own - r[key + "_median"]
                    if own is not None and r[key + "_median"] is not None
                    else None
                )
                r[key + "_percentile"] = (
                    sum(v <= own for v in valid) / len(valid)
                    if valid and len(valid) >= min_peers and own is not None
                    else None
                )
        r["peer_basis"] = "Industry"
        if (
            fallback
            and r.get("industry_126d_excess") is None
            and r.get("sector_126d_excess") is not None
        ):
            r["industry_126d_excess"] = r["sector_126d_excess"]
            r["peer_basis"] = "Sector fallback"
        for h in HORIZONS:
            r["market_" + h + "_excess"] = (
                r.get("return_" + h) - benchmark["return_" + h]
                if benchmark
                and benchmark.get("price_provider") == r.get("price_provider")
                and r.get("return_" + h) is not None
                and benchmark.get("return_" + h) is not None
                else None
            )
        r["signals"] = signals(r)

    def maximum(r, keys):
        vals = [-r[k] for k in keys if r.get(k) is not None]
        return max(vals) if vals else None

    definitions = {
        "sudden": ["return_1d", "return_5d"],
        "persistent": ["return_63d", "return_126d"],
        "drawdown": ["drawdown_3y", "drawdown_5y"],
        "laggard": ["industry_126d_excess", "industry_252d_excess"],
    }
    for name, keys in definitions.items():
        vals = sorted(
            v
            for r in rows
            if (v := maximum(r, keys)) is not None and not r.get("stale")
        )
        for r in rows:
            v = maximum(r, keys)
            r[name + "_score"] = (
                round(
                    100
                    * (
                        bisect.bisect_left(vals, v)
                        + (bisect.bisect_right(vals, v) - bisect.bisect_left(vals, v))
                        / 2
                    )
                    / len(vals),
                    1,
                )
                if vals and v is not None and not r.get("stale")
                else None
            )
    for r in rows:
        available = [
            r[k + "_score"] for k in definitions if r.get(k + "_score") is not None
        ]
        r["score"] = max(available) if available else None
        r["quality"] = round(
            sum(r.get("return_" + h) is not None for h in HORIZONS)
            / len(HORIZONS)
            * 100
        )
    groups = []
    for name, pool in industries.items():
        valid = [r for r in pool if not r.get("stale")]
        item = {"industry": name, "issuers": len(valid)}
        for h in ["21d", "63d", "126d", "252d"]:
            vals = [r["return_" + h] for r in valid if r.get("return_" + h) is not None]
            item["return_" + h] = median(vals) if len(vals) >= min_peers else None
            item["equal_weight_" + h] = (
                sum(vals) / len(vals) if len(vals) >= min_peers else None
            )
            item["dispersion_" + h] = stdev(vals) if len(vals) >= min_peers else None
        groups.append(item)
    return rows, groups


def signals(r):
    if r.get("stale"):
        return []
    le = lambda key, n: r.get(key) is not None and r[key] <= n
    out = []
    if (
        le("return_1d", -0.08)
        or le("return_5d", -0.12)
        or le("abnormal_return_z", -3)
        and le("return_1d", -1e-12)
    ):
        out.append("Sudden decline")
    if le("return_63d", -0.2) or le("return_126d", -0.3):
        out.append("Persistent decline")
    if le("drawdown_3y", -0.4) or le("drawdown_5y", -0.5):
        out.append("Depressed price")
    if le("industry_126d_excess", -0.2) or le("industry_252d_excess", -0.2):
        out.append("Industry laggard")
    return out
