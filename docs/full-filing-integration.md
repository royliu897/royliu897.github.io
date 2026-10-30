# Full-filing integration and adversarial validation

The local report now loads precomputed primary-statement supplements before its existing normalization and derivation steps. No changes have been pushed or deployed.

## Implemented

An offline extraction command downloads and caches immutable SEC filings outside the website. The compiler publishes compact content-hashed JSON plus a small issuer manifest. Reports load those artifacts; the new path never downloads or parses an SEC filing during a page view. Issuers without a built cache continue using the existing feeds, with that limitation shown in the validation panel.

The current cache covers **12 US issuers, 31 annual filings and 12 latest quarterly filings**, including their disclosed comparative periods: P&G, Caterpillar, JPMorgan, Travelers, Coca-Cola, Costco, Bank of America, Allstate, Apple, Microsoft, Visa and Bob’s Furniture. Bob’s annual document did not contain supported tagged facts; its quarterly filing was extracted successfully. This is bounded coverage, not an automatically refreshed cache for every ticker.

Extraction checks issuer identity, context, unit, numeric scale, financial-statement caption and standard-tag signatures. Ambiguous statement tables, conflicting candidates and dimensional amounts are withheld. Original source concepts, captions, accessions, context IDs, source URLs and source hashes remain in provenance. A caption check is still structured evidence, not a complete implementation of every issuer’s presentation linkbase.

Available cache observations enter before annual, quarterly and TTM derivations. Financial source observations respect their filing date and the requested knowledge cutoff. Existing listed-share-class and split-basis checks remain active. Clean blank dashes and their explanations remain unchanged.

The Unmapped tab now includes an expandable **Data validation and filing coverage** panel with loaded filings, extraction scope, candidate conflicts, scoped mappings withheld and accounting checks requiring review.

## Issues found and fixed during adversarial review

- Same-filing conflicting values no longer win by input order. Known total/component relationships have explicit scope rules; unexplained disagreements are withheld.
- Allstate’s total intangibles excluding goodwill, **558 million**, take precedence over the **432 million** finite-lived component.
- Disclosed nonoperating values survive derivation. The former balancing calculation no longer overwrites them or fills missing interest inputs with assumed zero. Coca-Cola’s disclosed other nonoperating amount is **1,073 million**, rather than the previous residual.
- Caterpillar’s **502 million** interest-expense caption explicitly excludes Financial Products. Production withholds that narrower observation for the generic company row. The earlier pilot’s 60/60 was numerical agreement with targets, not 60 scope-correct mappings; production assesses the remaining 59 targets.
- A larger selected-financial-data table cannot supersede the captioned primary statement just by having more matching facts. Competing primary candidates are withheld.
- Primary statement scope is resolved before total/component preferences. AFS securities sales plus maturities are not treated as a universal total of all-investment sales.
- Failed cache requests can retry after a short backoff; a transient failure no longer disables enrichment for the entire session.
- Accounting balance checks now use matching filing accessions and dates, rather than combining independently selected values from different filings.

## Validation results

| Check | Result | What it establishes |
|---|---:|---|
| Scope-eligible selected annual reference values | 59/59 | Agreement with the bounded, reviewed source targets |
| Current-quarter/instant source comparisons | 39/39 across 12 issuers | Selected cached source observations survive quarterly normalization |
| Day-before-filing cutoff tests | 12/12, zero leaked primary observations | Cached future quarterly filings do not bypass the knowledge cutoff |
| JavaScript regression files | 24/24 pass | Existing report, native, mapping, split, FX and related calculation regressions |
| Python extraction adversarial tests | Pass | Competing summary tables, ambiguous captions and wrong issuers are rejected |
| Additional live native accounting identities | 30/30 | Reported balances and ownership totals reconcile for Hyundai, LG Chem, Hon Hai and MediaTek |

The native adversarial agent also checked actual Hynix, Samsung and TSMC source fixtures, including old Taiwan XML, units, signs, ownership scopes, conflicting duplicates, segment exclusions and publication-date quarantine. In total, native checks covered four Korean issuers and three Taiwan issuers. Those checks establish consistency and rejection behavior, not independently verified completeness of every filing.

The adversarial agent reran the integrated checks after corrections and reported no remaining blocker **within this tested scope**. The corpus was used during development; it is not an untouched holdout evaluation.

## Performance

The new path adds one approximately **1.5 KB manifest per module session**, plus one content-hashed JSON request for each uncached covered issuer. Issuer files are about **84–354 KB uncompressed**, or **6–26 KB when gzip-compressed**. Actual transport compression depends on the host; the local Python HTTP server is not assumed to compress them.

The performance review replaced an unnecessary whole-CompanyFacts clone with copies of only modified fact containers and unit arrays. Source immutability checks still pass. Local warm Node medians measured the merge itself at approximately **0.3–7.5 ms**, compared with roughly 1–57 ms before that optimization. Merge plus normalization ranged approximately **3–213 ms** across the sample, with noticeable timing variance. These are local CPU measurements, not end-to-end browser or production-host latency guarantees.

No extra SEC source calls come from this primary-cache lookup. The report’s existing facts, quote, split and listed-class requests retain their existing behavior.

## Remaining limitations

- The full-filing cache currently contains the listed 12 issuers. Its generic refresh command can add issuers without issuer-specific numerical overrides, but no scheduled universal ingestion service has been configured.
- Recent source checks passed; five older same-filing balance checks remain flagged for Caterpillar (2008–2011) and JPMorgan (2009). They are visible in validation results and are not described as validated history. Additional displayed current/noncurrent liability inconsistencies are also flagged; these can identify mismatched source scope without pretending to know which input is wrong.
- Custom-tag semantic inference, arbitrary dimensions, untagged financial documents, every footnote and every presentation structure remain outside the automatic mapper. The registry does not equate a recognized name with a verified accounting scope.
- Native coverage is still limited by what the DART/MOPS feeds expose, mapped account scope and available history. Passing an accounting identity cannot establish that every useful disclosure is represented.
- This is suitable for further local review with explicit provenance and missing reasons. It is not a 99.9% completeness claim or a finished all-market commercial data service.

## Reproducible files

The repository’s `scripts/filing-cache/README.md` documents cache refresh, build, validation and performance commands. User-facing evidence is saved alongside this report:

- `full-filing-validation.json`
- `quarter-adversarial-results.json`
- `native-adversarial-live-results.json`
- `full-filing-performance.json`
- `full-filing-validation-panel.png`
