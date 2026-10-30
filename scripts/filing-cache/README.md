# Cached primary-statement supplements

This generic, offline pipeline feeds the actual report. It is separate from the historical isolated pilot in `scripts/coverage-pilot/`. No issuer-specific financial values or automatic AI mappings are active rules.

Raw filings and complete inventories belong outside the public website. Only compiled, content-hashed primary-statement facts and a small manifest are published under `assets/report/data/filings/`. Build the manifest last; it is the lookup index. Old hashed objects can be retained during a deployment rollover. Extraction requires Python 3 and lxml; Node commands require the project's Node 24 runtime.

From the repository root, for example:

```sh
python3 scripts/filing-cache/pull.py \
  --cache-root /home/royl/projects/sftsaf/filing-cache \
  --symbols PG CAT JPM TRV KO COST BAC ALL AAPL V MSFT BOBS \
  --annual-filings 3 --latest-quarter

node scripts/filing-cache/build.mjs \
  /home/royl/projects/sftsaf/filing-cache assets/report/data/filings

node /home/royl/projects/sftsaf/build-report-frontend.mjs
```

The download command uses a bounded year range and automatically narrows SEC archive-directory queries when the public proxy asks for a smaller range. Cached immutable accession files are reused. Unsupported documents are recorded as extraction failures; subsequent supported filings can still be extracted. Source failures are not evidence of nondisclosure. Check extraction-run.json and build output before publishing. This is an explicit batch refresh, not a scheduled service or an on-demand job queue.

Validation:

```sh
node --test tests/*-tests.mjs
python3 tests/filing-extraction-tests.py
node scripts/filing-cache/audit.mjs /home/royl/projects/sftsaf/filing-cache /tmp/full-filing-validation.json
node scripts/filing-cache/check-quarter.mjs /home/royl/projects/sftsaf/filing-cache /tmp/quarter-validation.json
node scripts/validate-native-adversarial.mjs /home/royl/projects/sftsaf/native-adversarial
node scripts/filing-cache/performance.mjs /home/royl/projects/sftsaf/filing-cache /tmp/filing-performance.json
```

The browser checks one shared manifest, then fetches only the selected issuer's compact JSON. Failed fetches fall back to the original feed and can retry after a short backoff. There is no SEC HTML parsing on this request path. A cache miss remains visible in Unmapped → Data validation and filing coverage.

Annual/quarterly identity, namespace, units, scope, dates, context, source provenance, duplicate conflicts and source immutability are checked. Caption plus standard-concept signatures identify statement tables; ambiguous candidates are withheld. This does not implement every presentation linkbase, arbitrary dimensional rollup or semantic custom-tag mapping. Production compilation deliberately excludes the pilot's narrower-scope Caterpillar interest observation.

`reviewed-scopes.json` stores bounded, dated scope-review evidence for legacy reports without inline XBRL. It contains source captions, context identities and immutable HTML/XML hashes, never replacement financial amounts. `reviewed-scopes.mjs` verifies those sources and annotates the original SEC observations during a rebuild. The initial review covers FedEx's 2017–2019 purchased-transportation line: its generic cost-of-goods tag does not establish total cost of sales. The compiler rejects that narrower caption for every issuer; it does not contain a FedEx mapping exception. This is a reviewed exception record, not an automatic legacy-filing extraction claim. Retain both source files when refreshing this accession; a hash mismatch requires a new review.
