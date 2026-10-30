# Report frontend build

This patches a pinned FastFS reference into the standalone report. It does not
fetch a changing upstream build. The reference files and row schema are checked
in under `reference/`; generated browser files remain under `assets/report/`.
The adapter and definitions are ordinary ES modules and are not bundled into
the third-party reference code. Node 24.11 or later is required.

```sh
cd scripts/report-frontend
npm ci --ignore-scripts
npm run build
```

Run this after editing report modules to refresh the module graph cache version.
It also regenerates `docs/report-frontend-provenance.json`. The build is
deterministic: running it twice with unchanged inputs produces identical files.
No API key or network request is needed to build the frontend.

From the repository root, validate with:

```sh
node --test tests/*.mjs
python3 tests/filing-extraction-tests.py
git diff --check
```

Primary, native and fund source-cache builders live in their sibling script
directories. Their raw source captures stay outside this public repository.
The static site requires no Node packages at runtime. GitHub Pages excludes
scripts, tests, docs and both backend source directories from publication.
