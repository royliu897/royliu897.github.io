import {readFile,writeFile} from 'node:fs/promises';
const evidence='/home/royl/projects/sftsaf/evidence/foreign',catalog=new Map();
for(const statement of ['BS1','IS1','DCIS1','CF3','SCE1']){
 const response=JSON.parse(await readFile(`${evidence}/dart-taxonomy-${statement}.json`,'utf8'));
 if(response.status!=='000')throw Error('No official OpenDART taxonomy source for '+statement);
 for(const row of response.list||[]){
  if(!row.account_id||!row.label_eng||/(Abstract|Axis|Domain|Member)$/.test(row.account_id))continue;
  const id=row.account_id.replace(/^ifrs_/,'ifrs-full_'),label=row.label_eng.replace(/\s+/g,' ').trim(),korean=(row.label_kor||'').trim();
  if(!catalog.has(id))catalog.set(id,[id,label,korean]);
 }
}
const tail=`
const byId=new Map(officialLabels.map(([id,label,korean])=>[id,{label,korean}]));
const normalizeLabel=value=>String(value||'').normalize('NFKC').replace(/[\\s·ㆍ.,()\\[\\]_-]/g,'').toLowerCase();
const literalTranslations=new Map(Object.entries({
 '사업결합으로 인한 현금유출':'Cash outflow from business combinations',
 '사업결합으로 인한 현금유입(유출)':'Cash inflow (outflow) from business combinations',
 '장기투자자산의 처분':'Proceeds from sale of long-term investments',
 '장기투자자산의 취득':'Purchases of long-term investments',
 '종속기업 유상증자 및 소유지분변동':'Subsidiary capital increases and changes in ownership interests',
 '비지배지분의 증감':'Increase (decrease) in noncontrolling interests',
 '사채 및 장기차입금의 상환':'Repayments of bonds and long-term borrowings',
 '단기당기손익-공정가치금융자산의 순감소(증가)':'Net decrease (increase) in current financial assets at fair value through profit or loss',
 '단기금융상품의 순감소(증가)':'Net decrease (increase) in short-term financial instruments'
}).map(([korean,english])=>[normalizeLabel(korean),english]));
const byKorean=new Map();
for(const [,label,korean]of officialLabels){const key=normalizeLabel(korean);if(!key)continue;if(!byKorean.has(key))byKorean.set(key,new Map());byKorean.get(key).set(normalizeLabel(label),label);}
// Numeric mappings require an explicit source identifier and account scope.
// Translation by Korean label never authorizes a financial mapping.
export const localAccountRules=Object.freeze({
 dart_OperatingIncomeLoss:{storage:'OperatingIncomeLoss',target:'operating_income'},
 dart_TotalSellingGeneralAdministrativeExpenses:{storage:'Dart_TotalSellingGeneralAdministrativeExpenses',target:'sga'},
 dart_OtherComprehensiveIncomeLossAccumulatedAmount:{storage:'Dart_OtherComprehensiveIncomeLossAccumulatedAmount',target:'aoci'},
 dart_CurrentLoansReceived:{storage:'Dart_CurrentLoansReceived',target:'_short_borrowings'},
 dart_ProceedsFromLongTermBorrowings:{storage:'Dart_ProceedsFromLongTermBorrowings',target:'_cff_debt_issued'}
});
const shareConcepts=new Set(['WeightedAverageShares','AdjustedWeightedAverageShares','WeightedAverageNumberOfOrdinarySharesOutstanding','WeightedAverageNumberOfOrdinarySharesOutstandingAdjustedForDilution','NumberOfOrdinarySharesOutstanding','NumberOfSharesOutstanding','CommonStockSharesOutstanding']);
export function dartAccountInfo(accountId,sourceLabel,statement){
 const id=String(accountId||'').replace(/^ifrs_/,'ifrs-full_'),rule=localAccountRules[id];
 const exact=byId.get(id),translations=byKorean.get(normalizeLabel(sourceLabel));
 const literal=!exact?literalTranslations.get(normalizeLabel(sourceLabel)):null;
 const translated=!exact&&translations?.size===1?[...translations.values()][0]:null;
 const name=id.match(/^(?:ifrs-full|dart)_(.+)$/)?.[1];
 const readable=name?name.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/([A-Z])([A-Z][a-z])/g,'$1 $2'):'Company-specific '+statement+' account';
 return {label:exact?.label||translated||literal||readable,label_source:exact?'OpenDART official taxonomy':translated?'OpenDART unique Korean-label translation (display only)':literal?'Literal English translation of source label (display only)':'Readable source identifier (display only)',original_label:sourceLabel||'',source_account_id:accountId||'',...(rule?{mapping_approved:true,mapping_target:rule.target,storage_name:rule.storage}:{}),unit_kind:shareConcepts.has(name)?'shares':/EarningsLossPerShare/.test(name||'')?'per-share':'monetary'};
}
export const dartAccountRegistryInfo=Object.freeze({source:'OpenDART xbrlTaxonomy.json',statements:['BS1','IS1','DCIS1','CF3','SCE1'],labels:officialLabels.length,scope:'Official English display labels; numeric mappings are the explicit localAccountRules only.'});
`;
const destination=new URL('../sec-worker/dart-account-registry.mjs',import.meta.url);
await writeFile(destination,'// Generated from official OpenDART taxonomy API snapshots; see scripts/build-dart-account-registry.mjs.\nconst officialLabels='+JSON.stringify([...catalog.values()])+';\n'+tail);
console.log('Generated',catalog.size,'official English labels');
