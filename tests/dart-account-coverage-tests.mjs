import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeDartStatement,mergeDartStatements} from '../sec-worker/dart-financials.mjs';
import {dartAccountInfo,dartAccountRegistryInfo} from '../sec-worker/dart-account-registry.mjs';
const load=name=>readFile(new URL('./fixtures/'+name+'.json',import.meta.url),'utf8').then(JSON.parse);
const [hynix,samsung]=await Promise.all([load('dart-hynix-2025'),load('dart-samsung-2026-h1')]),asOf='2026-10-29';
const h=normalizeDartStatement(hynix,{corp_code:'00164779',fiscal_month:'12'},2025,'11011',asOf),s=normalizeDartStatement(samsung,{corp_code:'00126380',fiscal_month:'12'},2026,'11012',asOf);
assert.equal(h.facts.Assets.label,'Total assets');
assert.equal(h.facts.Assets.original_label,'자산총계');
assert.equal(h.facts.Assets.source_account_id,'ifrs-full_Assets');
assert.equal(h.facts.Dart_TotalSellingGeneralAdministrativeExpenses.mapping_approved,true);
assert.equal(h.facts.Dart_TotalSellingGeneralAdministrativeExpenses.mapping_target,'sga');
assert.equal(h.facts.Dart_TotalSellingGeneralAdministrativeExpenses.units.KRW.find(p=>p.end==='2025-12-31').val,11484471000000);
assert.equal(h.facts.Dart_OtherComprehensiveIncomeLossAccumulatedAmount.mapping_target,'aoci');
assert.ok(Object.values(h.facts).every(f=>!/[\uac00-\ud7af]/.test(f.label)),'Display labels are English while original Korean is preserved separately');
assert.equal(hynix.list[0].account_nm,'자산총계','Original source remains immutable');
assert.equal(s.status,'available');assert.ok(Object.keys(s.facts).length>60,'A conflict cannot discard unrelated statement accounts');
assert.equal(s.facts.Assets.units.KRW.find(p=>p.end==='2026-06-30').val,759480516000000);
const income=s.facts.ProfitLoss.units.KRW.filter(p=>p.start==='2026-01-01'&&p.end==='2026-06-30');
assert.equal(income.find(p=>!p.unresolved).val,118849733000000,'Explicit IS cumulative amount survives CF quarter-copy conflict');
assert.ok(income.some(p=>p.val===71624461000000&&p.unresolved&&p.excluded_from_mapping),'Conflicting CF raw value remains available for inspection');
assert.match(income.find(p=>!p.unresolved).source_resolution,/Explicit IS\/CIS/);
assert.ok(s.conflicts.some(c=>c.concept==='ifrs-full_ProfitLoss'&&c.status==='resolved_with_source_precedence'));
const merged=mergeDartStatements([s,s]);assert.equal(merged.ProfitLoss.units.KRW.length,s.facts.ProfitLoss.units.KRW.length,'Merging remains idempotent without dropping conflicting source variants');
const ambiguous=structuredClone(hynix),duplicate={...ambiguous.list[0],thstrm_amount:String(Number(ambiguous.list[0].thstrm_amount)+1)};ambiguous.list.push(duplicate);
const disputed=normalizeDartStatement(ambiguous,{corp_code:'00164779',fiscal_month:'12'},2025,'11011',asOf);
assert.equal(disputed.status,'available');assert.ok(disputed.unresolved_contexts>=1);
assert.ok(disputed.facts.Assets.units.KRW.filter(p=>p.end==='2025-12-31').every(p=>p.unresolved));
assert.equal(disputed.facts.Revenue.units.KRW.find(p=>p.end==='2025-12-31').val,97146675000000);
const displayOnly=dartAccountInfo('-표준계정코드 미사용-','판매비와관리비','IS');assert.match(displayOnly.label,/Selling/);assert.equal(displayOnly.mapping_approved,undefined,'Korean label translations never approve numeric mappings');
assert.equal(dartAccountInfo('ifrs-full_WeightedAverageShares','가중평균유통주식수','IS').unit_kind,'shares');
assert.equal(dartAccountInfo('dart_IssuedCapitalOfCommonStock','보통주자본금','BS').unit_kind,'monetary','Share capital is monetary, not a number of shares');
assert.ok(dartAccountRegistryInfo.labels>1000);
console.log('DART account coverage passes: official English labels/original IDs, explicit local rules, Samsung H1 conflict isolation and cumulative precedence, unresolved raw values, idempotent merges and share-vs-capital units.');

// A readable custom label must not silently create a canonical financial map.
for(const sourceLabel of ['기타자본','기타수취채권','영업활동으로 인한 자산부채의 변동','조정']){
 const info=dartAccountInfo('-표준계정코드 미사용-',sourceLabel,'CF');
 assert.equal(info.mapping_approved,undefined);assert.equal(info.storage_name,undefined);assert.equal(info.unit_kind,'monetary');assert.equal(info.original_label,sourceLabel);assert.equal(info.source_account_id,'-표준계정코드 미사용-');
 assert.ok(!info.label.startsWith('Company-specific'),'Known custom display label is useful without remapping its value');
}
