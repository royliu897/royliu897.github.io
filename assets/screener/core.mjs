export const columns = {
  industry: "Industry",
  market_cap: "Market cap",
  return_1d: "1D",
  return_5d: "1W",
  return_21d: "1M",
  return_63d: "3M",
  return_126d: "6M",
  return_252d: "1Y",
  return_3y: "3Y",
  return_5y: "5Y",
  drawdown_1y: "52W drawdown",
  drawdown_3y: "3Y drawdown",
  drawdown_5y: "5Y drawdown",
  industry_126d_excess: "6M vs industry",
  sector_126d_excess: "6M vs sector",
  market_126d_excess: "6M vs market",
  volatility: "Volatility",
  volume_ratio: "Volume vs usual",
  score: "Signal percentile",
  quality: "History coverage",
  reason: "Why it appears",
};
export const defaultColumns = [
  "industry",
  "market_cap",
  "return_1d",
  "return_21d",
  "return_126d",
  "drawdown_1y",
  "industry_126d_excess",
  "reason",
];
export function validateSnapshot(v) {
  if (
    v?.schema_version !== 1 ||
    !Array.isArray(v.rows) ||
    v.rows.length > 20000 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v.as_of) ||
    v.as_of > new Date().toISOString().slice(0, 10)
  )
    throw Error("Unsupported snapshot or future date");
  const seen = new Set();
  for (const r of v.rows) {
    if (
      !/^[A-Z0-9.-]{1,16}$/.test(r.ticker) ||
      seen.has(r.ticker) ||
      !/^\d+$/.test(String(r.cik)) ||
      !["NYSE", "Nasdaq", "AMEX"].includes(r.exchange) ||
      !Array.isArray(r.signals)
    )
      throw Error("Invalid security identity");
    seen.add(r.ticker);
    for (const k of Object.keys(columns))
      if (
        !["industry", "reason"].includes(k) &&
        r[k] != null &&
        (typeof r[k] !== "number" || !Number.isFinite(r[k]))
      )
        throw Error("Invalid metric");
    if (r.chart && !Array.isArray(r.chart)) throw Error("Invalid history");
    let prior = "";
    for (const p of r.chart || []) {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(p[0]) ||
        p[0] <= prior ||
        p[0] > v.as_of ||
        p.slice(1).length !== 2 ||
        p.slice(1).some((n) => !Number.isFinite(n) || n <= 0)
      )
        throw Error("Invalid chart observation");
      prior = p[0];
    }
  }
  return v;
}
export function reason(r) {
  const out = [];
  if (r.signals.includes("Sudden decline"))
    out.push(
      r.return_1d <= -0.08
        ? `${pct(r.return_1d)} in one day`
        : r.return_5d <= -0.12
          ? `${pct(r.return_5d)} in one week`
          : "Unusual daily decline",
    );
  if (r.signals.includes("Persistent decline"))
    out.push(
      `${pct(r.return_126d <= -0.3 ? r.return_126d : r.return_63d)} in ${r.return_126d <= -0.3 ? "six" : "three"} months`,
    );
  if (r.signals.includes("Depressed price"))
    out.push(
      `${pct(r.drawdown_3y <= -0.4 ? r.drawdown_3y : r.drawdown_5y)} from ${r.drawdown_3y <= -0.4 ? "3" : "5"}Y high`,
    );
  if (r.signals.includes("Industry laggard"))
    out.push(
      `${format("industry_126d_excess", r.industry_126d_excess <= -0.2 ? r.industry_126d_excess : r.industry_252d_excess)} vs ${r.peer_basis === "Sector fallback" ? "sector" : "industry"} (${r.industry_126d_excess <= -0.2 ? "6M" : "1Y"})`,
    );
  return out.join(" · ");
}
export function pct(v) {
  return Number.isFinite(v)
    ? (v > 0 ? "+" : "") + (v * 100).toFixed(1) + "%"
    : "—";
}
export function format(k, v) {
  if (v == null) return "—";
  if (k === "market_cap")
    return (
      "$" +
      (v >= 1e12
        ? (v / 1e12).toFixed(2) + "T"
        : v >= 1e9
          ? (v / 1e9).toFixed(2) + "B"
          : (v / 1e6).toFixed(0) + "M")
    );
  if (["score", "quality"].includes(k))
    return Number(v).toFixed(0) + (k === "quality" ? "%" : "");
  if (k === "volume_ratio") return v.toFixed(1) + "×";
  if (k.endsWith("_excess"))
    return (v > 0 ? "+" : "") + (v * 100).toFixed(1) + " pp";
  return typeof v === "number" ? pct(v) : String(v);
}
export function ruleMatches(row, rule) {
  const v = row[rule.metric];
  if (!Number.isFinite(v) || !Number.isFinite(rule.value)) return false;
  return rule.op === "lte"
    ? v <= rule.value
    : rule.op === "gte"
      ? v >= rule.value
      : Math.abs(v - rule.value) < 1e-9;
}
export function materiallyChanged(r, note) {
  return (
    (r.score ?? 0) > (note.score ?? 0) + 10 ||
    r.signals.some((s) => !note.signals?.includes(s)) ||
    (r.signals.includes("Sudden decline") && r.as_of !== note.as_of)
  );
}
export function selectRows(rows, settings = {}, research = {}) {
  const q = (settings.search || "").trim().toLowerCase(),
    wanted = {
      sudden: "Sudden decline",
      persistent: "Persistent decline",
      laggard: "Industry laggard",
    };
  return rows
    .filter((r) => {
      const n = research[r.cik] || {};
      if (settings.screen === "watchlist") {
        if (
          ![
            "Interesting",
            "Researching",
            "Watchlist",
            "Already invested",
          ].includes(n.status)
        )
          return false;
      } else {
        if (r.stale || (n.status === "Rejected" && !materiallyChanged(r, n)))
          return false;
        if (
          !settings.rules?.length &&
          !r.signals.length &&
          !settings.search &&
          !settings.industry
        )
          return false;
        if (
          wanted[settings.screen] &&
          !r.signals.includes(wanted[settings.screen])
        )
          return false;
      }
      if (
        (q &&
          !`${r.ticker} ${r.name} ${r.industry || ""}`
            .toLowerCase()
            .includes(q)) ||
        (settings.industry && r.industry !== settings.industry) ||
        (settings.sector && r.sector !== settings.sector)
      )
        return false;
      if (
        (r.market_cap ?? 0) < (settings.minCap ?? 50e6) ||
        (r.dollar_volume ?? 0) < (settings.minLiquidity ?? 0)
      )
        return false;
      const rules = settings.rules || [];
      if (
        rules.length &&
        !(settings.mode === "AND"
          ? rules.every((s) => ruleMatches(r, s))
          : rules.some((s) => ruleMatches(r, s)))
      )
        return false;
      return true;
    })
    .sort((a, b) => {
      const key = settings.sort || "score",
        av = a[key],
        bv = b[key];
      if (av == null && bv == null) return a.ticker.localeCompare(b.ticker);
      if (av == null) return 1;
      if (bv == null) return -1;
      const c = typeof av === "string" ? av.localeCompare(bv) : av - bv;
      return (
        c * (settings.direction === "asc" ? 1 : -1) ||
        a.ticker.localeCompare(b.ticker)
      );
    });
}
export function csv(rows, keys) {
  const escape = (v) => {
    const s = String(v ?? "");
    return (
      '"' +
      (typeof v === "string" && /^[=+@-]/.test(s) ? "'" : "") +
      s.replaceAll('"', '""') +
      '"'
    );
  };
  return [
    ["Ticker", "Company", ...keys.map((k) => columns[k])],
    ...rows.map((r) => [
      r.ticker,
      r.name,
      ...keys.map((k) => (k === "reason" ? reason(r) : r[k])),
    ]),
  ]
    .map((row) => row.map(escape).join(","))
    .join("\r\n");
}
