# Isolated filing-coverage pilot

No production report/API integration is enabled. See `docs/coverage-pilot-findings.md` and `docs/coverage-pilot.html` for the bounded experiment and limitations.

The source corpus is cached outside this website repo at `/home/royl/projects/sftsaf/coverage-pilot`. Full filings are not copied into the website. Scripts in this folder are local experiment utilities; they are not imported into the Worker or browser bundle. Python extraction requires lxml (see requirements.txt). Rules in resolver.mjs contain no issuer-specific mappings or hardcoded financial values. Company names/values in reference JSON are validation fixtures only.

The experiment's original frozen implementation is retained as resolver-v1-frozen.mjs. The manifest records the later global sign correction found during development-case UI review. Final results are not a pristine untouched holdout benchmark.

Run the portable, offline regression checks from the website repo:

```sh
node --test tests/coverage-pilot-tests.mjs
```

The compressed fixture contains trimmed actual observations, selected-year baseline snapshots, calculation relationships and source hashes. It avoids a live-source dependency in CI. The original corpus and its inventories retain complete filing provenance for local investigation.

For local corpus exploration:

```sh
python3 scripts/coverage-pilot/download.py
python3 scripts/coverage-pilot/extract.py /home/royl/projects/sftsaf/coverage-pilot PG CAT JPM TRV KO COST BAC ALL
python3 scripts/coverage-pilot/linkbases.py KO COST BAC ALL
node scripts/coverage-pilot/baselines.mjs PG CAT JPM TRV KO COST BAC ALL
node scripts/coverage-pilot/run.mjs PG CAT JPM TRV KO COST BAC ALL
```

These utilities use the documented local corpus location. Creating a new evaluation requires a fresh manifest/reference set and an untouched holdout; rerunning this corpus is regression testing, not another independent validation.
