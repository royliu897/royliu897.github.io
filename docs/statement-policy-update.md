> Follow-on review correction: the earlier 60/60 result was numerical agreement with selected pilot targets. Caterpillar’s interest-expense target excludes Financial Products and is not a company-wide total. Production excludes that target and withholds that value; 59 scope-eligible references remain. The cached filing path is now integrated locally; see full-filing-integration.md for its scope and remaining limitations.

# Report coverage: local implementation update

The first shared fixes from the coverage pilot are now applied to the local report. Nothing has been pushed or deployed. The full-filing resolver remains an isolated prototype.

## What changed

- Selection prefers financial-statement filings over later proxy observations for the same reporting period, while retaining financial-statement restatements and sole-source fallbacks.
- Income-statement net income distinguishes income attributable to the parent from consolidated cash-flow net income. Noncontrolling-interest signs are handled consistently.
- Bank interest income uses a disclosed operating total rather than substituting an investment-income component.
- Shared, template-specific bindings recover disclosed treasury stock, pensions, other current assets, bank loans and allowances, and insurance amounts. These are concept and template rules, not issuer-specific numerical overrides.
- Missing statement values retain the same dash. Clicking one opens a small explanation with its status, configured source tags, an annual-source link when available, and a link to inspect loaded tags. Clicking the same dash again closes it. Available statuses distinguish unmapped, unavailable, ineligible, and unresolved observations.

An unavailable feed value does not establish that the company omitted it from its filing. Related observations also do not establish that their scope matches the requested row.

## Verification

The current feed-based report matches **58 of 60 selected numerical reference cells across eight US issuers**, compared with 31 of 60 before the pilot. These are selected reference cells, not a completeness or accuracy percentage for all displayed data. Four additional reference targets were not assessed.

The two remaining reference gaps are intentionally blank in the ordinary report: P&G cash requires distinguishing the primary statement amount from broader restricted-cash observations; Caterpillar interest expense requires primary-statement dimensional context. The isolated full-filing prototype resolves both, but that ingestion path has not been promoted.

All 16 regression test files passed after the shared changes. Targeted selector, adapter, and adversarial-data tests passed again after the indexing optimization. Browser verification confirmed the P&G balance-sheet explanation, its source links, and click-again dismissal without changing the table format.

The prototype also matched 28 supplemental post-run numerical checks. Several source comparisons remain unresolved, and some expense components overlap; those limitations are documented in the original pilot findings. The held-out evaluation also includes a disclosed post-freeze global sign correction. This is not evidence of 99.9% universal coverage, and it does not validate Korea or Taiwan.

## Performance

These shared changes add **zero network requests**. A small cached Node normalization sample measured approximately 54–105 ms per company, versus 47–69 ms previously; P&G was the largest measured increase, about 35 ms. Sparse blank-reason metadata measured about 42–63 KB of serialized JSON per sampled company. These are local normalization measurements, not full page-load or production Worker benchmarks.

The full-filing prototype is more expensive: some bank filings exceed the existing loader's size limit. Production use needs cached/background extraction rather than reparsing a filing on every report view.

## Remaining work

The next ingestion step is a cached primary-statement inventory with context, dimensions, calculation relationships, and source provenance. It should be promoted only after ambiguous selections are withheld reliably and repeatable reference checks cover more periods and issuers. Korea and Taiwan require their own source-specific evaluation.

## Review files

- `coverage-pilot-findings.md`: original pilot scope, source evidence, results, and caveats.
- `coverage-pilot.html`: isolated before/after explorer.
- `statement-policy-validation.json`: current report's 60 selected reference comparisons.
- `statement-policy-performance.json`: local normalization measurements.
- `report-missing-value-explanation.png`: actual local report's blank-value explanation.
