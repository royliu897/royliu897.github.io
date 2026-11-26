import {
  columns,
  defaultColumns,
  validateSnapshot,
  selectRows,
  format,
  pct,
  reason,
  csv,
} from "./core.mjs?v=c28bb9ec2b08";
const $ = (id) => document.getElementById(id),
  el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text != null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
const read = (key, otherwise) => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? otherwise;
    } catch {
      return otherwise;
    }
  },
  write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      message(
        "Browser storage is full. Export your research before clearing it.",
      );
      return false;
    }
  };
const initial = {
  screen: "all",
  sort: "score",
  direction: "desc",
  search: "",
  industry: "",
  sector: "",
  minCap: 50e6,
  minLiquidity: 0,
  mode: "OR",
  rules: [],
};
let settings = { ...initial },
  visible = read("roy-screen-columns", defaultColumns).filter((k) =>
    Object.hasOwn(columns, k),
  ),
  research = read("roy-screen-research", {}),
  saved = read("roy-screen-saved", {}),
  snapshot = null,
  page = 0,
  expanded = null,
  selected = new Set(),
  lastRows = [],
  chartYears = 5,
  chartMode = "price";
function message(text) {
  $("message").hidden = !text;
  $("message").textContent = text || "";
}
function download(name, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = el("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function db() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("roy-screen-snapshots", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("data");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function cacheSnapshot(value) {
  const database = await db();
  try {
    await new Promise((resolve, reject) => {
      const tx = database.transaction("data", "readwrite");
      tx.objectStore("data").put(value, "latest");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
}
async function cachedSnapshot() {
  const database = await db();
  try {
    return await new Promise((resolve, reject) => {
      const q = database.transaction("data").objectStore("data").get("latest");
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
  } finally {
    database.close();
  }
}
function theme() {
  let current;
  try {
    current = localStorage.getItem("roy-research-theme");
  } catch {}
  const dark = current
    ? current === "dark"
    : matchMedia("(prefers-color-scheme:dark)").matches;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  $("theme").textContent = dark ? "Light mode" : "Dark mode";
  $("theme").setAttribute("aria-pressed", String(dark));
}
theme();
$("theme").onclick = () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  try {
    localStorage.setItem("roy-research-theme", dark ? "dark" : "light");
  } catch {}
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  $("theme").textContent = dark ? "Light mode" : "Dark mode";
  $("theme").setAttribute("aria-pressed", String(dark));
};
function load(value) {
  snapshot = validateSnapshot(value);
  const c = snapshot.coverage || {};
  $("coverage-detail").textContent =
    `${c.loaded ?? snapshot.rows.length} eligible stocks loaded · ${c.listed_candidates ?? "—"} directory candidates · ${c.excluded ?? 0} exclusions · ${c.pending ?? 0} pending · ${c.stale ?? 0} stale · ${c.weak_peers ?? 0} with weak peer coverage. Industry comparisons require ${snapshot.min_peers ?? 5} other issuers. Market cap is a reference value dated in each company’s detail.`;
  for (const name of ["industry", "sector"]) {
    const control = $(name),
      current = control.value;
    control.replaceChildren(
      el("option", "All " + (name === "industry" ? "industries" : "sectors")),
    );
    control.firstChild.value = "";
    for (const text of [
      ...new Set(snapshot.rows.map((r) => r[name]).filter(Boolean)),
    ].sort()) {
      const o = el("option", text);
      o.value = text;
      control.append(o);
    }
    control.value = current;
  }
  render();
}
async function refresh(quiet = false) {
  const local =
      (location.hostname === "127.0.0.1" ||
        location.hostname === "localhost") &&
      location.port === "8772",
    url = local
      ? "/screener-data/latest.json"
      : "http://127.0.0.1:8772/screener-data/latest.json";
  try {
    const statusResponse = await fetch(
      url.replace("latest.json", "status.json"),
      { cache: "no-store", signal: AbortSignal.timeout(4000) },
    );
    if (!statusResponse.ok) throw Error("Local updater is not available");
    const status = await statusResponse.json();
    if (
      (snapshot?.revision || snapshot?.generated_at) ===
      (status.revision || status.generated_at)
    ) {
      if (!quiet) message("");
      return;
    }
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw Error("Local snapshot is not ready");
    const text = await response.text();
    if (text.length > 40e6) throw Error("Snapshot is too large");
    const value = validateSnapshot(JSON.parse(text));
    if (
      (snapshot?.revision || snapshot?.generated_at) !==
      (value.revision || value.generated_at)
    ) {
      load(value);
      await cacheSnapshot(value);
    }
    if (!quiet) message("");
  } catch (e) {
    if (!snapshot) {
      $("data-status").textContent = "No local snapshot loaded";
      $("empty").hidden = false;
      $("empty").replaceChildren(
        el("h2", "Your research list starts here"),
        el(
          "p",
          "Start the local screener, or open Refine → Data & research to import a snapshot.",
        ),
      );
    }
    if (!quiet)
      message(
        snapshot
          ? "Showing your saved list. Start the local updater or import a newer snapshot to refresh it."
          : "Could not connect to the local updater. Import a snapshot or open the local workspace.",
      );
  }
}
function header() {
  const tr = el("tr");
  tr.append(el("th", ""));
  const company = el("th", "Company", "company");
  tr.append(company);
  for (const k of visible) {
    const th = el("th");
    if (k === "industry") th.className = "company";
    const button = el(
      "button",
      columns[k] +
        (settings.sort === k
          ? settings.direction === "asc"
            ? " ↑"
            : " ↓"
          : ""),
    );
    if (k !== "reason") {
      button.onclick = () => {
        settings.direction =
          settings.sort === k && settings.direction === "desc" ? "asc" : "desc";
        settings.sort = k;
        render();
      };
      th.setAttribute(
        "aria-sort",
        settings.sort === k
          ? settings.direction === "asc"
            ? "ascending"
            : "descending"
          : "none",
      );
    } else button.disabled = true;
    th.append(button);
    tr.append(th);
  }
  $("stock-table").tHead.replaceChildren(tr);
}
function render() {
  if (!snapshot) return;
  document
    .querySelectorAll("[data-screen]")
    .forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.screen === settings.screen),
      ),
    );
  $("compare").hidden = !selected.size;
  $("clear-selection").hidden = !selected.size;
  $("compare").textContent = `Compare (${selected.size})`;
  if (settings.screen === "industries") {
    renderIndustries();
    return;
  }
  header();
  lastRows = selectRows(snapshot.rows, settings, research);
  page = Math.max(0, Math.min(page, Math.ceil(lastRows.length / 50) - 1));
  const body = $("stock-table").tBodies[0];
  body.replaceChildren();
  for (const row of lastRows.slice(page * 50, page * 50 + 50)) {
    const tr = el(
        "tr",
        null,
        "screen-row" + (expanded === row.ticker ? " selected" : ""),
      ),
      check = el("input");
    check.type = "checkbox";
    check.checked = selected.has(row.ticker);
    check.setAttribute("aria-label", "Compare " + row.ticker);
    check.onchange = () => {
      if (check.checked && selected.size >= 4) {
        check.checked = false;
        message("Compare up to four companies.");
        return;
      }
      check.checked ? selected.add(row.ticker) : selected.delete(row.ticker);
      render();
    };
    const td = el("td", null, "select-cell");
    td.append(check);
    tr.append(td);
    const company = el("td", null, "company"),
      open = el("button", row.ticker);
    open.setAttribute("aria-expanded", String(expanded === row.ticker));
    open.onclick = () => {
      expanded = expanded === row.ticker ? null : row.ticker;
      render();
    };
    company.append(open, el("small", row.name));
    const status = research[row.cik]?.status;
    if (status && status !== "Unreviewed")
      company.append(el("span", status, "status-tag"));
    tr.append(company);
    for (const k of visible) {
      const cell = el(
        "td",
        k === "reason" ? reason(row) : format(k, row[k]),
        k === "industry"
          ? "industry"
          : k === "reason"
            ? "reason"
            : typeof row[k] === "number" && row[k] < 0
              ? "negative"
              : "",
      );
      if (row[k] == null && k !== "reason")
        cell.title = k.startsWith("industry")
          ? `Unavailable: requires ${snapshot.min_peers ?? 5} independent peers with matching dates`
          : "Unavailable: required observations were not loaded";
      if (k === "market_cap")
        cell.title =
          "Reference market cap · " + new Date(row.profile_at).toLocaleString();
      tr.append(cell);
    }
    body.append(tr);
    if (expanded === row.ticker) {
      const expandedRow = el("tr", null, "expanded"),
        cell = el("td");
      cell.colSpan = visible.length + 2;
      cell.append(detail(row));
      expandedRow.append(cell);
      body.append(expandedRow);
    }
  }
  $("empty").hidden = !!lastRows.length;
  $("table-wrap").hidden = !lastRows.length;
  $("result-count").textContent = lastRows.length
    ? `${page * 50 + 1}–${Math.min((page + 1) * 50, lastRows.length)} of ${lastRows.length} companies`
    : "0 companies";
  $("previous").disabled = page === 0;
  $("next").disabled = (page + 1) * 50 >= lastRows.length;
  const c = snapshot.coverage || {},
    asof = new Date(snapshot.as_of + "T12:00:00Z").toLocaleDateString(
      undefined,
      { month: "short", day: "numeric", year: "numeric" },
    );
  $("data-status").textContent =
    `${asof} close · ${snapshot.rows.length.toLocaleString()} stocks loaded${c.pending ? " · partial coverage" : ""} · ${snapshot.provider}`;
}
function chart(row) {
  const wrap = el("div"),
    controls = el("div", null, "chart-controls");
  for (const n of [1, 3, 5, 10]) {
    const b = el("button", n + "Y");
    b.setAttribute("aria-pressed", String(chartYears === n));
    b.onclick = () => {
      chartYears = n;
      render();
    };
    controls.append(b);
  }
  const mode = el("select");
  mode.setAttribute("aria-label", "Chart series");
  for (const [value, label] of [
    ["price", "Split-adjusted price"],
    ["total", "Total return"],
    ["drawdown", "Price drawdown"],
  ]) {
    const o = el("option", label);
    o.value = value;
    mode.append(o);
  }
  mode.value = chartMode;
  mode.onchange = () => {
    chartMode = mode.value;
    render();
  };
  controls.append(mode);
  wrap.append(controls);
  const cutoff = new Date(snapshot.as_of + "T12:00:00Z");
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - chartYears);
  const points = (row.chart || []).filter(
    (p) => p[0] >= cutoff.toISOString().slice(0, 10),
  );
  if (points.length < 2) {
    wrap.append(el("p", "Not enough history for a chart.", "muted"));
    return wrap;
  }
  let peak = 0;
  const values = points.map((p) => {
    const v = p[chartMode === "total" ? 2 : 1];
    peak = Math.max(peak, v);
    return chartMode === "drawdown"
      ? (v / peak - 1) * 100
      : (v / points[0][chartMode === "total" ? 2 : 1]) * 100;
  });
  const low = Math.min(...values),
    high = Math.max(...values),
    span = high - low || 1,
    ns = "http://www.w3.org/2000/svg",
    svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 640 225");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    `${row.ticker} ${chartMode} from ${points[0][0]} to ${points.at(-1)[0]}; monthly closes`,
  );
  for (let i = 0; i < 4; i++) {
    const y = 20 + i * 60,
      line = document.createElementNS(ns, "line");
    for (const [k, v] of Object.entries({
      x1: 46,
      x2: 630,
      y1: y,
      y2: y,
      stroke: "var(--line)",
      "stroke-width": 0.7,
    }))
      line.setAttribute(k, v);
    svg.append(line);
    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", "0");
    text.setAttribute("y", String(y + 4));
    text.setAttribute("fill", "var(--muted)");
    text.setAttribute("font-size", "10");
    text.textContent =
      (high - (i * span) / 3).toFixed(0) +
      (chartMode === "drawdown" ? "%" : "");
    svg.append(text);
  }
  const path = document.createElementNS(ns, "path");
  path.setAttribute(
    "d",
    values
      .map(
        (v, i) =>
          (i ? "L" : "M") +
          (46 + (i / (values.length - 1)) * 584).toFixed(2) +
          "," +
          (20 + ((high - v) / span) * 180).toFixed(2),
      )
      .join(" "),
  );
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "var(--blue)");
  path.setAttribute("stroke-width", "2");
  svg.append(path);
  const graph = el("div", null, "price-chart");
  graph.append(svg);
  const caption = el("div", null, "chart-note");
  caption.append(
    el("span", points[0][0]),
    el(
      "span",
      "Monthly closes" + (chartMode !== "drawdown" ? " · indexed to 100" : ""),
    ),
    el("span", points.at(-1)[0]),
  );
  wrap.append(graph, caption);
  return wrap;
}
function detail(row) {
  const wrap = el("section"),
    heading = el("div", null, "detail-heading"),
    report = el("a", "Financial report ↗");
  report.href =
    "https://royrliu.com/report.html#/company/" +
    encodeURIComponent(
      (row.exchange === "AMEX" ? "SEC" : row.exchange) + "." + row.ticker,
    );
  report.target = "_blank";
  report.rel = "noopener";
  heading.append(el("h2", row.name), report);
  wrap.append(heading);
  const grid = el("div", null, "detail-grid"),
    left = el("div"),
    right = el("div");
  left.append(chart(row));
  const metrics = el("div", null, "detail-metrics");
  for (const [label, value] of [
    ["1-week return", pct(row.return_5d)],
    ["3-month return", pct(row.return_63d)],
    ["1-year return", pct(row.return_252d)],
    ["3-year drawdown", pct(row.drawdown_3y)],
    ["5-year drawdown", pct(row.drawdown_5y)],
    [
      "Current drawdown duration",
      row.drawdown_days == null ? "—" : row.drawdown_days + " days",
    ],
    ["Annualized volatility", pct(row.volatility)],
    ["Daily return z-score", row.abnormal_return_z?.toFixed(2) ?? "—"],
  ]) {
    const div = el("div");
    div.append(el("span", label), el("strong", value));
    metrics.append(div);
  }
  left.append(metrics);
  right.append(el("h3", "Why it appears"));
  const list = el("ul", null, "signal-list");
  for (const text of reason(row).split(" · ").filter(Boolean))
    list.append(el("li", text));
  if (!list.children.length)
    list.append(
      el("li", "No standard decline threshold is currently triggered."),
    );
  right.append(list);
  const strength = el("div", null, "detail-metrics");
  for (const [name, key] of [
    ["Sudden", "sudden"],
    ["Persistent", "persistent"],
    ["Drawdown", "drawdown"],
    ["Industry laggard", "laggard"],
  ]) {
    const line = el("div");
    line.append(
      el("span", name + " percentile"),
      el(
        "strong",
        row[key + "_score"] == null ? "—" : row[key + "_score"].toFixed(0),
      ),
    );
    strength.append(line);
  }
  right.append(
    strength,
    el(
      "p",
      "Ranks are cross-sectional percentiles. The list uses the largest available signal percentile; missing metrics add no score.",
      "detail-sources",
    ),
  );
  const fields = el("div", null, "research-fields"),
    note = research[row.cik] || {},
    status = el("select");
  for (const name of [
    "Unreviewed",
    "Interesting",
    "Researching",
    "Watchlist",
    "Rejected",
    "Already invested",
  ]) {
    const o = el("option", name);
    o.value = name;
    status.append(o);
  }
  status.value = note.status || "Unreviewed";
  const tags = el("input");
  tags.placeholder = "Tags";
  tags.value = note.tags || "";
  tags.maxLength = 300;
  const notes = el("textarea");
  notes.value = note.notes || "";
  notes.placeholder = "Thesis, questions, or reason for passing…";
  notes.maxLength = 10000;
  for (const [name, input] of [
    ["Research status", status],
    ["Tags", tags],
    ["Notes", notes],
  ]) {
    const l = el("label", name);
    l.append(input);
    fields.append(l);
  }
  const save = () => {
    research[row.cik] = {
      status: status.value,
      tags: tags.value,
      notes: notes.value,
      updated_at: new Date().toISOString(),
      as_of: row.as_of,
      score: row.score,
      signals: row.signals,
    };
    write("roy-screen-research", research);
  };
  status.onchange = () => {
    save();
    message("Research status saved.");
  };
  tags.onchange = save;
  notes.oninput = save;
  right.append(fields);
  grid.append(left, right);
  wrap.append(grid);
  const same = snapshot.rows.filter(
      (p) => p.industry === row.industry && p.cik !== row.cik && !p.stale,
    ),
    seen = new Set(),
    peers = same
      .sort(
        (a, b) =>
          Math.abs(Math.log((a.market_cap || 1) / (row.market_cap || 1))) -
          Math.abs(Math.log((b.market_cap || 1) / (row.market_cap || 1))),
      )
      .filter((p) => {
        if (seen.has(p.cik)) return false;
        seen.add(p.cik);
        return true;
      })
      .slice(0, 6);
  const peerWrap = el("div", null, "peer-table");
  peerWrap.append(
    el(
      "h3",
      `${row.industry || "Industry"} · ${row.industry_126d_peers ?? 0} valid other issuers`,
    ),
  );
  const table = el("table"),
    head = el("tr");
  for (const label of [
    "Nearby peers by size",
    "Market cap",
    "6M return",
    "1Y return",
  ])
    head.append(el("th", label));
  table.append(head);
  for (const p of peers) {
    const tr = el("tr");
    for (const value of [
      p.ticker,
      format("market_cap", p.market_cap),
      pct(p.return_126d),
      pct(p.return_252d),
    ])
      tr.append(el("td", value));
    table.append(tr);
  }
  peerWrap.append(table);
  wrap.append(
    peerWrap,
    el(
      "p",
      `${row.source} · prices through ${row.as_of} · reference profile ${row.profile_at ? new Date(row.profile_at).toLocaleDateString() : "unknown"} · ${row.history_sessions ?? 0} price sessions. Peer benchmark: ${row.peer_basis || "Industry"}, other issuers only. ${row.industry_126d_median == null ? "Insufficient peer coverage; comparison withheld." : ""}`,
      "detail-sources",
    ),
  );
  return wrap;
}
function renderIndustries() {
  const head = el("tr");
  for (const text of [
    "Industry",
    "Independent issuers",
    "1M median",
    "3M median",
    "6M median",
    "1Y median",
    "6M dispersion",
  ])
    head.append(el("th", text));
  $("stock-table").tHead.replaceChildren(head);
  const body = $("stock-table").tBodies[0];
  body.replaceChildren();
  let rows = (snapshot.industries || [])
    .filter(
      (r) =>
        !settings.search ||
        r.industry.toLowerCase().includes(settings.search.toLowerCase()),
    )
    .sort((a, b) => (a.return_126d ?? Infinity) - (b.return_126d ?? Infinity));
  for (const r of rows) {
    const tr = el("tr"),
      td = el("td"),
      b = el("button", r.industry, "industry-button");
    b.onclick = () => {
      settings.screen = "all";
      settings.industry = r.industry;
      $("industry").value = r.industry;
      page = 0;
      render();
    };
    td.append(b);
    tr.append(td);
    for (const value of [
      r.issuers,
      pct(r.return_21d),
      pct(r.return_63d),
      pct(r.return_126d),
      pct(r.return_252d),
      pct(r.dispersion_126d),
    ])
      tr.append(el("td", value));
    body.append(tr);
  }
  $("table-wrap").hidden = !rows.length;
  $("empty").hidden = !!rows.length;
  $("previous").disabled = true;
  $("next").disabled = true;
  $("result-count").textContent =
    rows.length + " industries · current loaded universe";
  $("data-status").textContent =
    `${snapshot.as_of} · industry medians, one observation per issuer`;
}
function renderRules() {
  const list = $("rules");
  list.replaceChildren();
  settings.rules.forEach((rule, i) => {
    const div = el("div", null, "rule"),
      metric = el("select");
    metric.setAttribute("aria-label", "Rule metric");
    for (const [k, label] of Object.entries(columns))
      if (
        k.startsWith("return_") ||
        k.startsWith("drawdown_") ||
        k.endsWith("_excess")
      ) {
        const o = el("option", label + " (%)");
        o.value = k;
        metric.append(o);
      }
    metric.value = rule.metric;
    const op = el("select");
    op.setAttribute("aria-label", "Rule operator");
    for (const [v, t] of [
      ["lte", "≤"],
      ["gte", "≥"],
    ]) {
      const o = el("option", t);
      o.value = v;
      op.append(o);
    }
    op.value = rule.op;
    const value = el("input");
    value.type = "number";
    value.step = "any";
    value.value = rule.value * 100;
    value.setAttribute("aria-label", "Rule threshold percent");
    const remove = el("button", "Remove");
    remove.onclick = () => {
      settings.rules.splice(i, 1);
      renderRules();
      render();
    };
    metric.onchange = () => {
      rule.metric = metric.value;
      render();
    };
    op.onchange = () => {
      rule.op = op.value;
      render();
    };
    value.onchange = () => {
      if (value.value.trim() === "" || !Number.isFinite(Number(value.value)))
        return;
      rule.value = Number(value.value) / 100;
      render();
    };
    div.append(metric, op, value, remove);
    list.append(div);
  });
}
function controls() {
  for (const id of ["industry", "sector"]) $(id).value = settings[id];
  $("min-cap").value = settings.minCap / 1e6;
  $("min-liquidity").value = settings.minLiquidity / 1e6;
  $("rule-mode").value = settings.mode;
  $("search").value = settings.search;
  renderRules();
}
document.querySelectorAll("[data-screen]").forEach(
  (b) =>
    (b.onclick = () => {
      settings.screen = b.dataset.screen;
      page = 0;
      expanded = null;
      render();
    }),
);
$("search").oninput = () => {
  settings.search = $("search").value;
  page = 0;
  render();
};
for (const id of ["industry", "sector"])
  $(id).onchange = () => {
    settings[id] = $(id).value;
    page = 0;
    render();
  };
for (const [id, key] of [
  ["min-cap", "minCap"],
  ["min-liquidity", "minLiquidity"],
])
  $(id).onchange = () => {
    settings[key] = Math.max(0, Number($(id).value) || 0) * 1e6;
    page = 0;
    render();
  };
$("rule-mode").onchange = () => {
  settings.mode = $("rule-mode").value;
  render();
};
$("refine-button").onclick = () => {
  $("refine").hidden = !$("refine").hidden;
  $("refine-button").setAttribute("aria-expanded", String(!$("refine").hidden));
};
$("add-rule").onclick = () => {
  settings.rules.push({ metric: "return_63d", op: "lte", value: -0.2 });
  renderRules();
  render();
};
$("reset").onclick = () => {
  settings = { ...initial, rules: [] };
  page = 0;
  controls();
  render();
};
$("previous").onclick = () => {
  page--;
  render();
};
$("next").onclick = () => {
  page++;
  render();
};
$("refresh").onclick = () => refresh();
for (const [k, label] of Object.entries(columns)) {
  const l = el("label"),
    input = el("input");
  input.type = "checkbox";
  input.checked = visible.includes(k);
  input.onchange = () => {
    visible = input.checked ? [...visible, k] : visible.filter((s) => s !== k);
    write("roy-screen-columns", visible);
    render();
  };
  l.append(input, document.createTextNode(label));
  $("columns").append(l);
}
function renderSaved() {
  $("saved").replaceChildren(el("option", "Choose…"));
  $("saved").firstChild.value = "";
  for (const name of Object.keys(saved)) {
    const o = el("option", name);
    o.value = name;
    $("saved").append(o);
  }
}
renderSaved();
$("save-screen").onclick = () => {
  const name = prompt("Screen name");
  if (!name?.trim()) return;
  saved[name.trim().slice(0, 80)] = structuredClone({
    ...settings,
    search: "",
  });
  write("roy-screen-saved", saved);
  renderSaved();
  $("saved").value = name.trim().slice(0, 80);
};
$("saved").onchange = () => {
  const s = saved[$("saved").value];
  if (s) {
    settings = { ...initial, ...structuredClone(s) };
    page = 0;
    controls();
    render();
  }
};
$("export-csv").onclick = () =>
  download(
    "stock-screen-" + (snapshot?.as_of || "") + ".csv",
    csv(lastRows, visible),
    "text/csv",
  );
$("export-notes").onclick = () =>
  download(
    "screener-research.json",
    JSON.stringify({ schema_version: 1, research }, null, 2),
    "application/json",
  );
$("snapshot-file").onchange = async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 40e6) throw Error("Snapshot exceeds 40 MB");
    const value = validateSnapshot(JSON.parse(await file.text()));
    await cacheSnapshot(value);
    load(value);
    message("Snapshot saved in this browser.");
  } catch (error) {
    message(error.message);
  }
  e.target.value = "";
};
$("research-file").onchange = async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5e6) throw Error("Research file exceeds 5 MB");
    const data = JSON.parse(await file.text());
    if (
      data.schema_version !== 1 ||
      !data.research ||
      typeof data.research !== "object"
    )
      throw Error("Unsupported research file");
    const nextResearch = { ...research };
    for (const [key, n] of Object.entries(data.research)) {
      if (
        !/^\d+$/.test(key) ||
        typeof n.notes !== "string" ||
        n.notes.length > 10000 ||
        ![
          "Unreviewed",
          "Interesting",
          "Researching",
          "Watchlist",
          "Rejected",
          "Already invested",
        ].includes(n.status)
      )
        throw Error("Invalid research entry");
      if (
        !research[key] ||
        String(n.updated_at) > String(research[key].updated_at)
      )
        nextResearch[key] = n;
    }
    research = nextResearch;
    write("roy-screen-research", research);
    render();
    message("Research merged; newer notes retained.");
  } catch (error) {
    message(error.message);
  }
  e.target.value = "";
};
$("clear-selection").onclick = () => {
  selected.clear();
  render();
};
$("compare").onclick = () => {
  const body = $("compare-body");
  body.replaceChildren();
  const rows = snapshot.rows.filter((r) => selected.has(r.ticker)),
    table = el("table"),
    head = el("tr");
  head.append(el("th", ""));
  for (const r of rows) head.append(el("th", r.ticker));
  table.append(head);
  for (const k of [
    "market_cap",
    "return_1d",
    "return_21d",
    "return_126d",
    "return_252d",
    "drawdown_3y",
    "industry_126d_excess",
    "score",
  ]) {
    const tr = el("tr");
    tr.append(el("th", columns[k]));
    for (const r of rows) tr.append(el("td", format(k, r[k])));
    table.append(tr);
  }
  body.append(table);
  $("comparison").showModal();
};
$("close-compare").onclick = () => $("comparison").close();
$("comparison").onclick = (e) => {
  if (e.target === $("comparison")) $("comparison").close();
};
try {
  const cached = await cachedSnapshot();
  if (cached) load(cached);
} catch {}
await refresh(true);
setInterval(() => {
  if (!document.hidden) refresh(true);
}, 120000);
