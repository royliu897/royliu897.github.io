import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {concepts} from '../assets/report/concept-registry.mjs';
import schema from '../assets/report/row-schema.mjs';
import {normalizeTaiwanStatement} from '../sec-worker/taiwan-financials.mjs';
import {normalizeDartStatement} from '../sec-worker/dart-financials.mjs';
import {nativeTemplateFor,nativeConcepts,nativeRows,nativeDisplaySigns,prepareNativeFacts,nativeFactEligible,approvedNativeConcept,nativeDefinition} from '../assets/report/native-template.mjs';
const text=readFileSync(new URL('./fixtures/mops-tsmc-2025.xhtml',import.meta.url),'utf8'),parsed=normalizeTaiwanStatement(text,{ticker:'2330'},2025,4,'2026-10-29'),tw={provider:'Taiwan MOPS',asOf:'2026-10-29',facts:parsed.facts};
const source=JSON.stringify(tw),base=JSON.stringify(concepts),prepared=prepareNativeFacts(tw),registry=nativeConcepts(concepts,prepared),rows=table=>nativeRows(schema[table],table,prepared);
assert.equal(nativeTemplateFor(tw).country,'TW');assert.equal(nativeTemplateFor({provider:'OpenDART'}).country,'KR');assert.equal(nativeTemplateFor({facts:{Revenue:{namespace:'ifrs-full'}}}).label,'IFRS');assert.equal(nativeTemplateFor({facts:{Revenues:{namespace:'us-gaap'}}}),null);
assert.equal(nativeConcepts(concepts,{facts:{Revenues:{namespace:'us-gaap'}}}),concepts,'US registry remains unchanged');
assert.equal(nativeRows(schema.balance_sheet,'balance_sheet',{facts:{Revenues:{namespace:'us-gaap'}}}),schema.balance_sheet);
assert.equal(JSON.stringify(concepts),base);assert.equal(JSON.stringify(tw),source,'Native approval and mapping preparation preserve raw source objects');
assert.ok(registry.other_current_liabilities[0].includes('OtherCurrentLiabilities'));
assert.ok(registry.current_deferred_revenue[0].includes('CurrentContractLiabilities'));
assert.ok(registry.current_capital_leases[0].includes('TW_tifrs_bsci_ci_CurrentLeaseLiabilities'));
assert.ok(registry.native_finance_costs[0].includes('FinanceCosts'));assert.ok(!registry.interest_expense[0].includes('FinanceCosts'),'Net/broader finance costs are not automatically interest expense');
assert.ok(registry.native_intangibles_goodwill[0].includes('IntangibleAssetsAndGoodwill'));assert.ok(!registry.intangible_assets[0].includes('IntangibleAssetsAndGoodwill'),'Combined goodwill/intangibles cannot fill excluding-goodwill row');
assert.ok(!registry.paid_in_capital[0].includes('CapitalReserve'));assert.ok(!registry.aoci[0].includes('OtherEquityInterest'),'Native equity reserves retain separate meaning');
for(const table of ['income_statement','balance_sheet','cash_flow']){
 const keys=data=>nativeRows(schema[table],table,data).map(r=>r.key);assert.deepEqual(keys(tw),keys({...tw,facts:{}}),'Native row order stays fixed with sparse disclosures');assert.equal(new Set(keys(tw)).size,keys(tw).length,'No duplicate native row identities');
}
assert.equal(rows('balance_sheet').find(r=>r.key==='native_intangibles_goodwill').label,'Intangibles & Goodwill (Combined)');
assert.ok(rows('income_statement').some(r=>r.key==='native_finance_costs'));assert.ok(rows('balance_sheet').some(r=>r.key==='native_capital_reserve'));
assert.equal(nativeRows(schema.bank_balance,'balance_sheet',tw,{industry:'Commercial Banks'}),schema.bank_balance,'Keep reviewed banking layout; do not force industrial native layout');
assert.equal(nativeFactEligible('FinanceCosts',{namespace:'ifrs-full'},tw),true);assert.equal(nativeFactEligible('FinanceCosts',{namespace:'us-gaap'},tw),false);
assert.equal(nativeFactEligible('TW_tifrs_bsci_ci_CurrentLeaseLiabilities',{namespace:'dart'},tw),false,'Same local name in another namespace is not equivalent');
assert.equal(approvedNativeConcept('tifrs-bsci-ci','TW_tifrs_bsci_ci_CurrentLeaseLiabilities'),true);assert.equal(approvedNativeConcept('tifrs-bsci-ci','TW_tifrs_bsci_ci_UnknownLeaseAmount'),false);
const custom={...tw,facts:{TW_tifrs_bsci_ci_CurrentLeaseLiabilities:{namespace:'tifrs-bsci-ci',units:{TWD:[{val:1024052000,end:'2025-12-31'}]}}}},marked=prepareNativeFacts(custom);assert.equal(marked.facts.TW_tifrs_bsci_ci_CurrentLeaseLiabilities.mapping_approved,true);assert.equal(custom.facts.TW_tifrs_bsci_ci_CurrentLeaseLiabilities.mapping_approved,undefined);
const counterfeit={...tw,facts:{TW_tifrs_bsci_ci_CurrentLeaseLiabilities:{namespace:'evil',units:{TWD:[{val:999}]}}}};assert.equal(prepareNativeFacts(counterfeit).facts.TW_tifrs_bsci_ci_CurrentLeaseLiabilities.mapping_approved,undefined);
const sign=nativeDisplaySigns(tw);assert.equal(sign.native_finance_costs,-1);assert.equal(sign.native_cf_interest_paid,1);assert.equal(sign.native_cf_tax_paid,1);
const dartRaw=JSON.parse(readFileSync(new URL('./fixtures/dart-hynix-2025.json',import.meta.url),'utf8')),dart=normalizeDartStatement(dartRaw,{corp_code:'00164779',fiscal_month:'12'},2025,'11011','2026-10-29'),kr={provider:'OpenDART',facts:dart.facts},krRegistry=nativeConcepts(concepts,prepareNativeFacts(kr));
assert.equal(nativeDisplaySigns(kr).native_cf_interest_paid,-1);assert.equal(nativeDisplaySigns(kr).native_cf_tax_paid,-1,'DART outflow magnitudes and signed MOPS cash effects use different display transforms');
assert.ok(krRegistry.native_cf_assets_liabilities_changes[0].includes('Dart_AdjustmentsForAssetsLiabilitiesOfOperatingActivities'));
assert.ok(nativeRows(schema.cash_flow,'cash_flow',kr).some(r=>r.key==='native_cash_generated_operations'),'Summary cash generated from operations remains visible even without detailed working-capital components');
// Actual TSMC disclosures must be reachable through the reviewed native registry.
for(const [key,names]of [['native_finance_costs',['FinanceCosts']],['native_intangibles_goodwill',['IntangibleAssetsAndGoodwill']],['native_current_financial_assets_fvpl',['CurrentFinancialAssetsAtFairValueThroughProfitOrLoss']],['native_cf_interest_paid_financing',['InterestPaidClassifiedAsFinancingActivities']]]){
 assert.ok(names.some(name=>tw.facts[name]),'Actual fixture contains '+key);assert.ok(registry[key][0].some(name=>tw.facts[name]),'Actual source is reachable for '+key);
}
console.log('Native template tests pass: fixed source-specific rows, actual Taiwan/Korea fields, scoped native meanings, unit metadata, namespace approval, immutable data and provider-specific cash signs.');

assert.match(nativeDefinition('native_finance_costs').formula,/finance costs/);assert.match(nativeDefinition('native:native_intangibles_goodwill').formula,/combined/);assert.equal(nativeDefinition('not-a-native-key'),null);
