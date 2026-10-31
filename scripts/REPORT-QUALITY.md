# Repeatable report review

The browser's **Unmapped → Data review** uses the existing loaded payload. It
does not fetch additional sources or infer filing completeness. The panel is
collapsed initially; the open body has a bounded height, three small views and
one expanded item at a time. Fields with no eligible loaded observation are
distinct from a verified nondisclosure. Reported/calculated/unknown-source
values and unmapped/ineligible/unresolved gaps remain separate.

To compare source refreshes, save `loadReportCompany()` payloads as JSON in a
directory **outside the public site**. Use native-currency payloads before the
optional display FX conversion. Do not include local company notes.

```sh
node scripts/audit-report-quality.mjs /path/to/payloads --output /path/to/review.json
node scripts/audit-report-quality.mjs /path/to/refreshed-payloads \
  --baseline /path/to/review.json --output /path/to/next-review.json --strict
```

The offline audit compares security identity, reporting currency, historical
periods, disappeared values and changed values with filing-accession evidence.
It also reports accounting checks that need review. `--strict` exits with code
2 if any exception exists; legitimate issuer revisions still need review and
are not silently repaired. Passing an audit is not a coverage percentage.
There is no scheduled job or baseline download on the browser request path.
