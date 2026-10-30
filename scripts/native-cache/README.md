# Native primary-statement fallback cache

The browser uses these same-origin snapshots only when a native upstream source cannot load. They contain normalized primary-source observations, not reconstructed report rows. The cache currently covers Taiwan TSMC, Hon Hai and MediaTek, and Korea Hynix, Samsung, Hyundai and LG Chem.

Build from the checked-in official-source fixtures and optional external source captures:

```sh
node scripts/native-cache/build.mjs \
  --external-root /home/royl/projects/sftsaf/native-adversarial \
  --foreign-root /home/royl/projects/sftsaf/evidence/foreign \
  --output assets/report/data/native-filings
node --test tests/native-filing-cache-tests.mjs
```

Without `--external-root`, only the source fixtures are compiled. The optional foreign directory can add `samsung-2025-annual.json`, a raw official OpenDART statement response, and verified Hynix current-share metadata when available. No credentials are read or published by the builder. The native API uses the user's existing backend; new source captures should be made outside the public website and should retain their official source URL and request metadata.

The manifest is written last and indexes immutable content-hashed JSON. The loader verifies SHA-256, requested native symbol, issuer, source provider and valid dates. Failed requests have a short retry backoff. Cached payloads set `history_periods: []` to avoid launching more live MOPS requests while the upstream is unavailable.

Cached coverage is explicitly partial and identifies source periods. DART retains actual filing-receipt dates. Unknown MOPS publication dates use the cache-acquisition date conservatively; those observations cannot enter earlier historical point-in-time requests. Prices and market ratios are separate dated data and do not extend the statement coverage date. Missing outstanding-share counts remain missing.

This cache is an availability fallback for a bounded source corpus. Rebuilding from old source files does not discover new filings; capture newer upstream snapshots before a refresh if newer statement coverage is required. All cached source reports and comparison periods remain visible in provenance.
