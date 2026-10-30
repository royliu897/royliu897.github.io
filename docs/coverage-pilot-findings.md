> Follow-on review correction: the earlier 60/60 result was numerical agreement with selected pilot targets. Caterpillar’s interest-expense target excludes Financial Products and is not a company-wide total. Production excludes that target and withholds that value; 59 scope-eligible references remain. The cached filing path is now integrated locally; see full-filing-integration.md for its scope and remaining limitations.

# Filing coverage pilot

The pilot supports continuing with a filing-first normalization system. It demonstrates reusable improvements across companies without ticker-specific mappings. It does **not** establish 99.9% completeness, and it is not ready for an automatic production rollout.

The experiment uses the existing general, banking and insurance templates. It covers one annual reporting period for each of eight US companies. Development companies were P&G, Caterpillar, JPMorgan and Travelers. Coca-Cola, Costco, Bank of America and Allstate were held out until the initial rules were frozen. Korea/Taiwan, historical normalization, TTM and live valuation statistics are outside this experiment.

| Company | Template | Cohort | Populated cells before → pilot | Blanks filled | Existing selections corrected |
|---|---|---|---:|---:|---:|
| P&G | General | Development | 64 → 69 | 6 | 2 |
| Caterpillar | General | Development | 61 → 67 | 6 | 1 |
| JPMorgan | Banking | Development | 41 → 49 | 9 | 3 |
| Travelers | Insurance | Development | 39 → 47 | 8 | 0 |
| Coca-Cola | General | Held out | 55 → 59 | 4 | 0 |
| Costco | General | Held out | 61 → 63 | 2 | 0 |
| Bank of America | Banking | Held out | 41 → 46 | 5 | 0 |
| Allstate | Insurance | Held out | 40 → 48 | 9 | 2 |

Across the sample, 49 blanks were filled using source facts or traceable derivations, and eight populated selections were corrected. The held-out companies gained 20 previously blank values and two corrected selections without new issuer-specific mappings. Three stale continuing-income estimates were withheld after their underlying net income changed; this is why 49 recovered blanks produce a net increase of 46 populated cells. Residual “Other” buckets were refreshed separately and are not counted as independently recovered disclosures.

These are **population counts, not completeness percentages**. The 604 template cells include categories that may not apply or may not be separately disclosed. The 156 remaining blanks cannot be treated as 156 proven omissions.

Four systemic problems were confirmed:

1. **Template bindings are incomplete.** Standard tags for common treasury stock, pension liabilities, prepaid/other current assets, bank loan allowances and insurer investment income were not wired to their template rows. Some specialized template keys have no resolver at all. These require a template contract: every displayed key must have a mapping, derivation or explicit applicability rule.
2. **The summary feed loses important context.** Caterpillar's main income statement reports nonoperating interest expense using a business-scope dimension. The pilot recovers that primary-statement line while continuing to reject arbitrary segment-footnote substitutions.
3. **Fact selection can be wrong even when a cell is populated.** A newer proxy disclosure can supersede a more precise annual-statement observation under the current date-first selection. Bank interest-income mapping can choose an investment-interest component instead of the reported operating interest total. Selection needs source role, accounting scope and precision, not merely the latest filing date or first matching alias.
4. **Missing components distort derived buckets.** Restoring P&G treasury stock changes the computed equity “Other” bucket from −143,604 million to −596 million. The latter agrees with the filing's ESOP debt-retirement reserve. An equation can balance while a major component is hidden inside a residual, so arithmetic reconciliation alone is not completeness verification.

The pilot reads numeric inline-XBRL facts directly from cached official filings, preserves units/scales, issuer identity, contexts, dimensions and source anchors, and identifies primary statements using standard-concept signatures. It applies explicit reusable bindings and source-scope rules. It also uses an actual calculation linkbase to identify JPMorgan's investment-securities subtotal from its available-for-sale and held-to-maturity components; the rule does not name JPMorgan's custom tag. Renaming that extension tag still passes the structural test, while a nonreconciling subtotal is rejected.

Verification uses a preselected set of 64 template reference targets. Sixty were numerically assessed against reviewer-curated filing rows/notes; four were not numerically assessed and were not treated as zero or absent. The baseline matched 31 of those 60 numeric references; the final pilot matches 60. For the held-out companies, the comparison is 18 of 28 versus 28 of 28. An additional 28 targeted post-run reference checks cover the remaining recovered/corrected fields and derivations. These are deliberately limited verification sets, not exhaustive proof of filing completeness or an estimate of unseen-company accuracy.

The initial rule/code hashes and sample split are retained. During UI review of the development cases, a global display-sign bug for noncontrolling income was corrected after the first held-out run. No new tag mappings or ticker exceptions were added from the held-out results. The manifest records this change; the final result should not be described as a pristine untouched held-out benchmark.

Regression checks cover actual filing observations, source immutability, issuer/period/unit/namespace isolation, rejection of segment substitutions, zero preservation, conflicting-source abstention, source-form precedence, structural calculation equivalence and the curated reference values. Portable compressed fixtures are in the repository, so these tests do not require downloading the full corpus or making live API calls.

Three baseline-versus-filing comparisons remain unresolved, involving other nonoperating income and cash-flow net-income scope. They are retained for review rather than silently overwritten. Caterpillar also has a disclosed financial-products operating-interest category outside the current general template's listed expense components. P&G's R&D disclosure is a component of SG&A, so the displayed expense categories must not automatically be assumed additive. Both are examples of composition/applicability work still required.

Local parsing took approximately 0.06–1.26 seconds per cached filing. Two bank filings exceed the current production loader's 12 MB source limit. These are local Python/lxml measurements, not Cloudflare Worker CPU measurements. A production version should parse/cache each filing in a background ingestion step and serve a compact normalized result; downloading and parsing large filings on every report click would be the wrong deployment model.

My recommendation is to proceed with a bounded second phase: formalize the template contract, replace date-first selection with a source-role/restatement-aware policy, add dependency tracking so derived values are rebuilt coherently, and repeat validation on a larger untouched sample. Include native-market filings before claiming the same result for Korea or Taiwan. The evidence supports a systematic implementation, with occasional unfamiliar-pattern review; it does not support promising universal automatic completeness or no ongoing maintenance.

The preview preserves “—” and opens an explanation when clicked: unmapped, unavailable, ineligible or unresolved. Filled values open source evidence. This is an isolated latest-annual comparison; the live report and backend were not changed or deployed by this pilot.

[Interactive pilot](coverage-pilot.html) · [Detailed results and evidence](coverage-pilot-results.json)

Official source filings: [P&G](https://www.sec.gov/Archives/edgar/data/80424/000008042426000103/pg-20260630.htm), [Caterpillar](https://www.sec.gov/Archives/edgar/data/18230/000001823026000008/cat-20251231.htm), [JPMorgan](https://www.sec.gov/Archives/edgar/data/19617/000162828026008131/jpm-20251231.htm), [Travelers](https://www.sec.gov/Archives/edgar/data/86312/000008631226000065/trv-20251231.htm), [Coca-Cola](https://www.sec.gov/Archives/edgar/data/21344/000162828026010047/ko-20251231.htm), [Costco](https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm), [Bank of America](https://www.sec.gov/Archives/edgar/data/70858/000007085826000157/bac-20251231.htm), [Allstate](https://www.sec.gov/Archives/edgar/data/899051/000089905126000031/all-20251231.htm).

Some template categories also need an explicit accounting policy. For example, a vendor's 'Other non-recurring' total is not necessarily a separately reported GAAP line. Likewise, operating leases cannot simply be inserted into a finance/capital-lease row. A complete parser will not make every template category applicable; those dashes need an honest applicability explanation.
