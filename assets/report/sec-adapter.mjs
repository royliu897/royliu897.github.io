import {alignRoicHistory} from './roic-series.mjs?v=9e2620bf675f';
import {sourceNames} from './primary-bindings.mjs?v=9e2620bf675f';
import {deriveDebt,investedCapital} from './debt-policy.mjs?v=9e2620bf675f';
import {supplementIssuerHistory} from './issuer-lineage.mjs?v=9e2620bf675f';
import {loadNativeFilingCache} from './native-filing-cache.mjs?v=9e2620bf675f';
import {loadTaiwanMarket} from './native-market.mjs?v=9e2620bf675f';
import {loadFundReport} from './fund-report.mjs?v=9e2620bf675f';
import {outstandingShares,selectedSecurityKind} from './outstanding-shares.mjs?v=9e2620bf675f';
import {prepareNativeFacts,nativeConcepts,nativeFactEligible,nativeRows,nativeDisplaySigns,nativeTemplateFor} from './native-template.mjs?v=9e2620bf675f';
import {supplementPrimaryFilings} from './primary-filing-supplement.mjs?v=9e2620bf675f';
import {attachValueAvailability} from './value-availability.mjs?v=9e2620bf675f';
import {companyTemplate,selectStatementSources,templateConcepts} from './statement-source-policy.mjs?v=9e2620bf675f';
import {nativeRedirect,isKoreanListing,isTaiwanListing} from './native-listings.mjs?v=9e2620bf675f';
export {nativeRedirect} from './native-listings.mjs?v=9e2620bf675f';
import {buildMappingAudit} from './mapping-audit.mjs?v=9e2620bf675f';
import {validateSourceReport} from './validation-checks.mjs?v=9e2620bf675f';
import {concepts} from './concept-registry.mjs?v=9e2620bf675f';
export {concepts} from './concept-registry.mjs?v=9e2620bf675f';
import {supplementClassFacts} from './filing-supplement.mjs?v=9e2620bf675f';
import schema from './row-schema.mjs?v=9e2620bf675f';
import {splitLedger,normalizeShareSeries,combineBasis} from './share-basis.mjs?v=9e2620bf675f';

export function reportCurrencySymbol(currency){
 if(!currency)return null;return {USD:'$',EUR:'€',GBP:'£',JPY:'¥',KRW:'₩',CNY:'CN¥',INR:'₹',CAD:'C$',AUD:'A$',HKD:'HK$',SGD:'S$',TWD:'NT$'}[currency]||currency+' ';
}
const API='https://research-api.royrliu.com',cache=new Map(),pending=new Map();
function boundedSet(map,key,value,limit){map.delete(key);map.set(key,value);while(map.size>limit)map.delete(map.keys().next().value);}
function cacheResponse(path,value){boundedSet(cache,path,{time:Date.now(),value},128);for(const [pattern,limit]of [[/\/facts$/,6],[/\/class-facts\?/,24],[/\/statement\?/,24]]){const keys=[...cache.keys()].filter(k=>pattern.test(k));for(const key of keys.slice(0,Math.max(0,keys.length-limit)))cache.delete(key);}}

const known={};
async function request(path,ttl=300000,timeout=60000){const hit=cache.get(path);if(hit&&Date.now()-hit.time<Math.min(ttl,hit.value?.status==='unavailable'||hit.value?.source_coverage?.status==='partial'?60000:ttl))return hit.value;if(pending.has(path))return pending.get(path);const task=(async()=>{const response=await fetch(API+path,{signal:AbortSignal.timeout(timeout)}),value=await response.json();if(!response.ok)throw Error(value.error||'Financial data could not load.');cacheResponse(path,value);return value;})();pending.set(path,task);try{return await task;}finally{pending.delete(path);}}
async function directory(){return (await request('/directory',86400000)).companies;}
export async function searchReportCompanies(query){
 const text=query.trim().toLowerCase();if(!text)return {results:[]};
 if(/^\d{4,6}$/.test(text)||/[가-힣\u3400-\u9fff]/.test(text)){const native=await request('/international/search?q='+encodeURIComponent(text),86400000).catch(()=>({results:[]}));if(native.results.length)return {results:native.results};}
 const sec=await directory().catch(()=>[]),matches=sec.filter(c=>`${c.ticker} ${c.name}`.toLowerCase().includes(text));
 const sort=rows=>rows.sort((a,b)=>(b.ticker.toLowerCase()===text)-(a.ticker.toLowerCase()===text)||a.ticker.length-b.ticker.length).slice(0,20);
 // Exact SEC tickers do not wait on an unrelated international search.
 if(matches.some(c=>c.ticker.toLowerCase()===text))return {results:sort(matches)};
 const native=await request('/international/search?q='+encodeURIComponent(text),86400000).catch(()=>({results:[]}));
 return {results:sort([...matches,...native.results])};
}

async function resolveCompany(symbol){
 const colon=symbol.indexOf(':'),exchange=colon>=0?symbol.slice(0,colon):'',ticker=colon>=0?symbol.slice(colon+1):symbol;
 const record=known[ticker]||(await directory()).find(c=>c.ticker===ticker||c.ticker===ticker.replaceAll('.','-'));
 if(!record)throw Error(`No SEC company found for ${ticker}.`);
 const normalized=value=>value.toLowerCase().replace(/[^a-z]/g,'');
 if(exchange&&exchange!=='SEC'&&normalized(exchange)!==normalized(record.exchange))throw Error('Selected exchange does not match this SEC ticker.');
 known[ticker]=record;return record;
}
const companyPending=new Map(),companyCache=new Map();
async function companyData(symbol){const hit=companyCache.get(symbol);if(hit&&Date.now()-hit.time<(hit.data.facts?.source_coverage?.status==='partial'?60000:300000))return hit.data;if(companyPending.has(symbol))return companyPending.get(symbol);const task=(async()=>{
 if(isTaiwanListing(symbol)){
  const ticker=symbol.split(':')[1],profile=await request(`/international/TWSE/${ticker}/profile`,86400000,6000).catch(async error=>{const cache=await loadNativeFilingCache(symbol);if(cache?.native_profile)return cache.native_profile;throw error;}),[first,quote,splits]=await Promise.allSettled([request(`/international/TWSE/${ticker}/facts`,21600000,6000).catch(async error=>{const cache=await loadNativeFilingCache(symbol);if(cache)return cache;throw error;}),request(`/quote/${profile.quote_symbol}`),request(`/international/TWSE/${ticker}/splits`,86400000)]);
  if(first.status==='rejected')throw first.reason;const facts=structuredClone(first.value);
  if(profile.ticker!==ticker||facts.cik!=='TWSE'+ticker||splits.status==='fulfilled'&&splits.value.cik!==facts.cik)throw Error('Taiwan issuer identity mismatch.');
  const periods=facts.history_periods||[];
  for(let i=0;i<periods.length;i+=4){const batch=periods.slice(i,i+4),out=await Promise.allSettled(batch.map(([year,quarter])=>request(`/international/TWSE/${ticker}/statement?year=${year}&quarter=${quarter}`,21600000)));for(let j=0;j<out.length;j++){
   const result=out[j];if(result.status==='rejected'){facts.source_coverage.unavailable_periods.push({year:batch[j][0],quarter:batch[j][1],reason:result.reason.message});continue;}
   const v=result.value;facts.source_coverage.sources.push(...v.sources);facts.source_coverage.conflicts.push(...v.conflicts);facts.source_coverage.excluded_contexts+=v.excluded_contexts;
   for(const [name,fact]of Object.entries(v.facts)){if(!facts.facts[name])facts.facts[name]={...fact,units:{}};const target=facts.facts[name];if(target.namespace!==fact.namespace)throw Error('Taiwan taxonomy identity mismatch.');for(const [unit,points]of Object.entries(fact.units)){const list=target.units[unit]??=[],ids=new Set(list.map(p=>[p.start,p.end,p.accn,p.val,!!p.unresolved].join('|')));for(const p of points){const id=[p.start,p.end,p.accn,p.val,!!p.unresolved].join('|');if(!ids.has(id)){list.push(p);ids.add(id);}}}}
  }}
  facts.source_coverage.status=facts.source_coverage.unavailable_periods.length?'partial':'available';
  const data={record:{ticker,exchange:'TWSE',name:profile.name,cik:facts.cik},facts,profile:{...profile,industry:'',native:true,filings:facts.source_coverage.sources},quote:quote.status==='fulfilled'?quote.value:null,splits:splits.status==='fulfilled'?splits.value:{status:'unavailable',events:[]}};boundedSet(companyCache,symbol,{time:Date.now(),data},6);return data;
 }
 if(isKoreanListing(symbol)){
  const ticker=symbol.split(':')[1],profile={status:'fulfilled',value:await request(`/international/KRX/${ticker}/profile`,86400000,6000).catch(async error=>{const cache=await loadNativeFilingCache(symbol);if(cache?.native_profile)return cache.native_profile;throw error;})},[facts,quote,splits]=await Promise.allSettled([request(`/international/KRX/${ticker}/facts`,21600000,6000).catch(async error=>{const cache=await loadNativeFilingCache(symbol);if(cache)return cache;throw error;}),profile.value.quote_symbol?request(`/quote/${profile.value.quote_symbol}`):Promise.resolve(null),request(`/international/KRX/${ticker}/splits`,86400000)]);
  if(facts.status==='rejected')throw facts.reason;if(profile.status==='rejected')throw profile.reason;
  if(profile.value.ticker!==ticker||facts.value.cik!=='DART'+profile.value.corp_code||splits.status==='fulfilled'&&splits.value.cik!==facts.value.cik)throw Error('Korean issuer identity mismatch.');
  const data={record:{ticker,exchange:'KRX',name:profile.value.name,cik:facts.value.cik},facts:facts.value,profile:{...profile.value,industry:'',native:true,filings:facts.value.source_coverage.sources},quote:quote.status==='fulfilled'?quote.value:null,splits:splits.status==='fulfilled'?splits.value:{status:'unavailable',events:[],reason:'Native share-basis events have not been verified.'}};
  boundedSet(companyCache,symbol,{time:Date.now(),data},6);return data;
 }
 const record=await resolveCompany(symbol),[facts,profile,quote,splits]=await Promise.allSettled([request(`/company/CIK${record.cik}/facts`),request(`/company/CIK${record.cik}/filings?from=${new Date().getFullYear()-1}`),request(`/quote/${encodeURIComponent(record.ticker.replaceAll('.','-'))}`),request(`/company/CIK${record.cik}/splits`,86400000)]);if(facts.status==='rejected'){const fund=await loadFundReport(record,profile.status==='fulfilled'?profile.value:{},quote.status==='fulfilled'?quote.value:null);if(fund){const data={fund,record};boundedSet(companyCache,symbol,{time:Date.now(),data},6);return data;}throw facts.reason;}for(const result of [facts,profile,splits])if(result.status==='fulfilled'&&String(Number(result.value.cik))!==String(Number(record.cik)))throw Error('Company identity mismatch; data was not displayed.');if(profile.status==='fulfilled'&&profile.value.tickers?.length&&!profile.value.tickers.includes(record.ticker))throw Error('Ticker does not match SEC filer metadata.');const lineage=await supplementIssuerHistory(facts.value,record,profile.status==='fulfilled'?profile.value:{},request),primary=await supplementPrimaryFilings(lineage.facts,record),enriched=await supplementClassFacts(primary,record,lineage.profile,request);const data={record,facts:enriched,profile:lineage.profile,quote:quote.status==='fulfilled'?quote.value:null,splits:splits.status==='fulfilled'?splits.value:{status:'unavailable',events:[]}};boundedSet(companyCache,symbol,{time:Date.now(),data},6);return data;})();companyPending.set(symbol,task);try{return await task;}finally{companyPending.delete(symbol);}}
export async function loadReportCompany(symbol,period='annual'){const redirected=nativeRedirect(symbol),resolved=redirected?.symbol||symbol,data=await companyData(resolved);if(data.fund)return data.fund;const payload=toReportPayload(data.facts,{...data.record,...data.profile,ticker:data.record.ticker,exchange:data.record.exchange},data.quote,period,resolved,{split_feed:data.splits});
 if(isTaiwanListing(resolved))payload.financials.official_valuation=await loadTaiwanMarket(data.record.ticker,data.facts.asOf);
 if(data.facts.primary_filing_supplement){payload.financials.primary_filing_supplement=data.facts.primary_filing_supplement;}
 if(data.profile.native){const provider=data.facts.provider||'OpenDART';payload.profile.source_summary=provider+' · consolidated '+payload.profile.currency+' · statements through '+payload.financials.period_dates.at(-1)+(data.facts.source_coverage.status==='partial'?' · partial coverage':'');payload.profile.source_notice='Source: '+provider+' consolidated statements, reported in '+payload.profile.currency+'. Latest loaded statement period: '+payload.financials.period_dates.at(-1)+'. '+data.facts.source_coverage.scope+(data.facts.source_coverage.status==='partial'?' Some source reports could not be retrieved or validated.':'');payload.profile.annual_filing=data.facts.source_coverage.sources.find(s=>/^(DART|MOPS) annual$/.test(s.form))?.url;payload.financials.source_coverage=data.facts.source_coverage;payload.financials.native_provider=provider;payload.financials.current_shares=data.facts.current_shares||payload.financials.current_shares||null;const shares=data.facts.current_shares;payload.profile.valuation_notice='Valuation uses the latest reported fiscal year when TTM EPS is unavailable. '+(shares?.status==='available'?'Common shares outstanding: '+new Intl.NumberFormat('en-US').format(shares.common_outstanding)+' as of '+shares.asOf+'. '+(shares.multiple_classes?'Total-company value multiples are withheld because other listed share classes are not priced.':'Market capitalization uses this period-end count, not weighted-average EPS shares.'):'Company-value multiples remain unavailable because a verified common share count net of treasury shares has not been loaded; issued capital alone is not used as outstanding shares.');}
 return payload;}

// Standard-concept mappings are kept in this adapter, outside the unchanged UI.
// type: duration (default), instant, per-share, or weighted-average shares.
const DAY=86400000,days=(a,b)=>(Date.parse(a)-Date.parse(b))/DAY;
const annual=p=>p.start&&days(p.end,p.start)>=330&&days(p.end,p.start)<=380;
const standalone=p=>p.start&&days(p.end,p.start)>=70&&days(p.end,p.start)<=110;
const annualForm=p=>/^(10-K|20-F|40-F)(\/A)?$/.test(p.form)||p.frequency==='year';
function readConcept(data,names,unit,type,key,template,exclusions){names=sourceNames(data,names,key);const observations=new Map();for(const name of names){const fact=data.facts?.[name];if(!nativeFactEligible(name,fact,data))continue;if(fact?.namespace&&!['us-gaap','ifrs-full','dei'].includes(fact.namespace)&&!fact.mapping_approved)continue;for(const p of fact?.units?.[unit]||[]){if(key==='total_debt'&&name==='LongTermDebt'&&p.mapping_key!==key)continue;if(p.mapping_key&&p.mapping_key!==key)continue;if((p.unresolved||p.excluded_from_mapping)&&p.source_priority!=='primary-statement'||!Number.isFinite(p.val)||!p.end||p.end>data.asOf||p.filed>data.asOf)continue;if(type==='instant'&&p.start)continue;if(type!=='instant'&&!p.start)continue;const observationId=`${name}:${p.start||''}:${p.end}:${p.filed}:${p.accn}:${p.val}:${p.mapping_key||''}:${p.source_priority||''}`;if(!observations.has(observationId))observations.set(observationId,{...p,...(data.provider==='Taiwan MOPS'&&['PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities','DividendsPaidClassifiedAsFinancingActivities','TW_tifrs_SCF_PaymentsToAcquireTreasuryShares','TW_tifrs_SCF_RepaymentsOfBonds','TW_tifrs_SCF_RepaymentsOfLongTermDebt','TW_tifrs_SCF_AcquisitionOfPropertyPlantAndEquipment','TW_tifrs_SCF_CashDividendsPaid'].includes(name)?{val:-p.val,reported_value:p.val,source_sign_conversion:'Signed MOPS cash outflow → canonical outflow magnitude'}:{}),...(name==='OtherOperatingIncomeExpenseNet'?{val:-p.val,reported_value:p.val,source_sign_conversion:'Net other operating income/expense → expense display'}:{}),concept:name,unit,namespace:data.facts[name].namespace});}}return selectStatementSources([...observations.values()],key,template,exclusions).sort((a,b)=>a.end.localeCompare(b.end)||(a.filed||'').localeCompare(b.filed||''));}
function byEnd(points){const map=new Map();for(const p of points){const old=map.get(p.end);if(!old||(p.filed||'')>(old.filed||''))map.set(p.end,p);}return [...map.values()].sort((a,b)=>a.end.localeCompare(b.end));}
function quarters(raw,type,dividends=false){const result=raw.filter(standalone);if(type==='per-share'&&!dividends)return byEnd(result);
 for(const p of raw){if(days(p.end,p.start)<=110||days(p.end,p.start)>380)continue;const earlier=raw.filter(q=>q.start===p.start&&q.end<p.end&&days(p.end,q.end)>=70&&days(p.end,q.end)<=110&&q.filed<=p.filed).sort((a,b)=>(b.accn===p.accn)-(a.accn===p.accn)||b.filed.localeCompare(a.filed))[0];if(!earlier){if(dividends&&annual(p)){const parts=byEnd(raw.filter(q=>standalone(q)&&q.start>=p.start&&q.end<p.end));if(parts.length===3&&parts[0].start===p.start&&parts.every((q,i)=>i===0||Math.abs(days(q.start,parts[i-1].end)-1)<=1)&&days(p.end,parts.at(-1).end)>=70&&days(p.end,parts.at(-1).end)<=110)result.push({...p,start:new Date(Date.parse(parts.at(-1).end)+DAY).toISOString().slice(0,10),val:p.val-parts.reduce((n,q)=>n+q.val,0),inputs:[p,...parts],normalization:combineBasis([p,...parts]),derived:'Annual dividends − first three standalone quarters'});}continue;}const start=new Date(Date.parse(earlier.end)+DAY).toISOString().slice(0,10),val=type==='shares'?(p.val*(days(p.end,p.start)+1)-earlier.val*(days(earlier.end,earlier.start)+1))/(days(p.end,earlier.end)):p.val-earlier.val;result.push({...p,start,val,inputs:[p,earlier],normalization:combineBasis([p,earlier]),derived:type==='shares'?'Difference of duration-weighted share counts':'Cumulative duration difference'});}
 return byEnd(result);
}
const point=(list,end)=>list.filter(p=>p.end===end).sort((a,b)=>(b.filed||'').localeCompare(a.filed||''))[0];
function derivedPoint(inputs,val,label){
 const accessions=[...new Set(inputs.flatMap(p=>p.source_accessions||[p.accn]).filter(Boolean))];
 return {...inputs[0],val,inputs,concept:label,source_concepts:[...new Set(inputs.flatMap(p=>p.source_concepts||[p.concept]).filter(Boolean))],filed:inputs.map(p=>p.filed||'').sort().at(-1)||undefined,accn:accessions.length===1?accessions[0]:undefined,source_accessions:accessions,derived:label,normalization:combineBasis(inputs)};
}
function fill(series,key,a,b,fn,label,partial=false,rightOnly=false){
 const out=series[key]||[],left=series[a]||[],right=series[b]||[];
 const anchors=rightOnly?[...left,...right.filter(q=>!left.some(p=>p.end===q.end&&p.start===q.start))]:left;
 for(const anchor of anchors){if(point(out,anchor.end))continue;
  const p=point(left,anchor.end),q=point(right,anchor.end);
  if((!p||!q)&&!partial)continue;if(p&&q&&p.start!==q.start)continue;
  const value=fn(p?.val||0,q?.val||0);
  if(Number.isFinite(value))out.push(derivedPoint([p,q].filter(Boolean),value,label));
 }
 series[key]=out.sort((a,b)=>a.end.localeCompare(b.end));
}

function calculateResidual(series,key,total,components,label){
 const result=[];
 for(const p of series[total]||[]){
  const parts=components.map(([k,sign=1])=>[point(series[k]||[],p.end),sign]).filter(([q])=>q&&(!q.start||!p.start||q.start===p.start));
  if(!parts.length)continue;
  result.push(derivedPoint([p,...parts.map(([q])=>q)],p.val-parts.reduce((sum,[q,sign])=>sum+q.val*sign,0),label));
 }
 series[key]=result;
}
function addWorkingCapital(series){
 const result=[];
 const components=[['_wc_receivables',-1],['_wc_other_receivables',-1],['_wc_inventory',-1],['_wc_prepaid',-1],['_wc_other_assets',-1],['_wc_payables',1],['_wc_tax',1],['_wc_accrued',1],['_wc_other_liabilities',1],['_wc_other_net',-1]];
 const ends=[...new Set([...components.flatMap(([key])=>(series[key]||[]).map(p=>p.end)),...(series._wc_total||[]).map(p=>p.end)])];
 for(const end of ends){
  const total=point(series._wc_total||[],end);if(total){result.push(derivedPoint([total],-total.val,'Negative increase in reported total operating capital'));continue;}
  const otherNet=point(series._wc_other_net||[],end);
  const recv=point(series._wc_receivables||[],end);
  const parts=components.flatMap(([key,sign])=>{const p=point(series[key]||[],end);if(!p||otherNet&&['_wc_other_assets','_wc_other_liabilities'].includes(key)||key==='_wc_other_receivables'&&recv?.concept==='IncreaseDecreaseInReceivables')return [];return [[p,sign]];});
  if(parts.length&&parts.every(([p])=>p.start===parts[0][0].start))result.push(derivedPoint(parts.map(([p])=>p),parts.reduce((sum,[p,sign])=>sum+p.val*sign,0),'Cash effect of reported operating working-capital changes'));
 }
 for(const p of series._tw_wc_signed||[])if(!point(result,p.end))result.push(p);
 series.cf_working_capital=result;
}
function derive(series,provider,template){
 if(template==='bank')fill(series,'gross_loans','net_loans','loan_loss_reserve',(a,b)=>a+b,'Net loans + disclosed loan-loss allowance');
 if(provider==='Taiwan MOPS')for(const loan of series._ifrs_noncurrent_loans||[]){const bond=point(series._ifrs_noncurrent_bonds||[],loan.end);if(bond&&bond.accn===loan.accn){series.long_term_debt=series.long_term_debt.filter(p=>p.end!==loan.end);series.long_term_debt.push(derivedPoint([loan,bond],loan.val+bond.val,'MOPS noncurrent loans + separately reported bonds'));}}

 fill(series,'cf_dna','_ifrs_depreciation','_ifrs_amortization',(a,b)=>a+b,'Reported depreciation + reported amortization');
 fill(series,'sga','_ifrs_selling','_ifrs_administration',(a,b)=>a+b,'Selling expense + administrative expense');
 fill(series,'long_term_debt','_ifrs_noncurrent_loans','_ifrs_noncurrent_bonds',(a,b)=>a+b,'Disclosed noncurrent loans + bonds',true,true);
 fill(series,'_cff_debt_issued','_tw_bonds_issued','_tw_loans_issued',(a,b)=>a+b,'Disclosed bond + loan proceeds',true,true);
 fill(series,'_cff_debt_repaid','_tw_bonds_repaid','_tw_loans_repaid',(a,b)=>a+b,'Disclosed bond + loan repayments',true,true);

 for(const p of series._equity_including_nci||[])if(!point(series.shareholders_equity,p.end)){
  const nci=point(series.minority_interest||[],p.end);
  series.shareholders_equity.push(nci?derivedPoint([p,nci],p.val-nci.val,'Consolidated equity − reported noncontrolling interests'):{...p,equity_scope:'consolidated; NCI not separately reported'});
 }

 fill(series,'pretax_income','_pretax_domestic','_pretax_foreign',(a,b)=>a+b,'Domestic + foreign pretax income');
 series.common_stock=(series.common_stock||[]).map(p=>{const paid=point(series.paid_in_capital||[],p.end);return p.concept==='CommonStocksIncludingAdditionalPaidInCapital'&&paid?derivedPoint([p,paid],p.val-paid.val,'Combined common capital − separately reported paid-in capital'):p;});
 const otherNonoperating=[...(series.other_nonoperating||[])];
 for(const pretax of series.pretax_income||[]){const operating=point(series.operating_income||[],pretax.end);if(!operating||operating.start!==pretax.start)continue;
  const interest=point(series.interest_income||[],pretax.end),expense=point(series.interest_expense||[],pretax.end);
  const known=[operating,...[interest,expense].filter(p=>p&&p.start===pretax.start)];
  const value=pretax.val-operating.val-(interest?.start===pretax.start?interest.val:0)+(expense?.start===pretax.start?expense.val:0);
  const item=derivedPoint([pretax,...known],value,'Pretax income − operating income − separate interest income + interest expense');
  const index=otherNonoperating.findIndex(p=>p.end===pretax.end);if(index<0&&interest&&expense&&interest.start===pretax.start&&expense.start===pretax.start)otherNonoperating.push(item);
 }
 series.other_nonoperating=otherNonoperating;
 fill(series,'gross_profit','revenue','cogs',(a,b)=>a-b,'Revenue − cost of goods sold');
 if(!template)fill(series,'total_operating_expenses','gross_profit','operating_income',(a,b)=>a-b,'Gross profit − operating income (expenses below gross profit)');
 fill(series,'long_term_debt','_long_debt_total','_debt_current',(a,b)=>a-b,'Total long-term debt − current portion');
 for(const p of series.long_term_debt||[])if(p.derived==='Disclosed noncurrent loans + bonds'&&p.inputs?.length===1)p.debt_partial=true;
 deriveDebt(series,derivedPoint);
 fill(series,'total_noncurrent_liabilities','total_liabilities','total_current_liabilities',(a,b)=>a-b,'Liabilities − current liabilities');
 // Productive assets include PPE, software and other intangibles. Preserve
 // that broader disclosed capital-spending scope instead of aliasing it to PPE.
 fill(series,'cf_capex','_cf_productive_purchases','_cf_productive_sales',(a,b)=>b-a,'Reported productive-asset sale proceeds − capital spending (PPE, software and other intangibles)');
 for(const p of series._cf_productive_purchases||[])if(!point(series.cf_capex||[],p.end))(series.cf_capex??=[]).push(derivedPoint([p],-p.val,'Reported gross capital spending on productive assets; asset-sale proceeds are not included'));
 fill(series,'cf_capex','_cf_ppe_purchases','_cf_ppe_sales',(a,b)=>b-a,'PPE proceeds − purchases',true,true);
 for(const p of series._cf_productive_sales||[])if(!point(series.cf_capex||[],p.end))(series.cf_capex??=[]).push(derivedPoint([p],p.val,'Reported productive-asset sale proceeds; capital spending is unavailable'));
 for(const key of ['_cf_productive_purchases','_cf_ppe_purchases'])for(const p of series[key]||[])if(!point(series.capital_expenditures||[],p.end))(series.capital_expenditures??=[]).push(derivedPoint([p],-p.val,key==='_cf_productive_purchases'?'Gross productive-asset capital spending (PPE, software and other intangibles)':'Gross PPE capital spending'));
 fill(series,'cf_acquisitions','_cf_acq_purchases','_cf_acq_sales',(a,b)=>b-a,'Business sale proceeds − acquisitions',true,true);
 fill(series,'cf_investments','_cf_inv_purchases','_cf_inv_sales',(a,b)=>b-a,'Investment sale proceeds − purchases',true,true);
 fill(series,'cf_net_stock','_cf_stock_repurchase','_cf_stock_issuance',(a,b)=>b-a,'Common stock proceeds − repurchases',true,true);
 fill(series,'cf_net_preferred','_cf_net_preferred_issued','_cf_net_preferred_repaid',(a,b)=>a-b,'Preferred issuance − preferred repurchases',true,true);
 fill(series,'cf_debt_net','_cff_debt_issued','_cff_debt_repaid',(a,b)=>a-b,'Debt proceeds − repayments',true,true);
 fill(series,'free_cash_flow','cash_from_operations','_cf_productive_purchases',(a,b)=>a-b,'Operating cash flow − reported gross productive-asset capital spending');
 fill(series,'free_cash_flow','cash_from_operations','_cf_ppe_purchases',(a,b)=>a-b,'Operating cash flow − capital expenditures');
 series.net_income_continuing=[...(series._nic_raw||[])];
 fill(series,'net_income_continuing','net_income','net_income_discontinued',(a,b)=>a-b,'Net income − discontinued operations',true);
 fill(series,'_net_income_available','net_income','preferred_dividends',(a,b)=>a-b,'Net income − preferred dividends',true);
 fill(series,'total_liabilities_equity','total_liabilities','shareholders_equity',(a,b)=>a+b,'Total liabilities + shareholders equity');
 series.cf_debt_net=(series.cf_debt_net||[]).map(p=>{const short=point(series._cf_short_debt_net||[],p.end);return short&&short.start===p.start?derivedPoint([p,short],p.val+short.val,'Net long-term debt + net short-term borrowing'):p;});
 for(const p of series._cf_short_debt_net||[])if(!point(series.cf_debt_net||[],p.end))(series.cf_debt_net??=[]).push(p);
 fill(series,'_ifrs_total_debt_net','_ifrs_total_debt_proceeds','_ifrs_total_debt_repayments',(a,b)=>a-b,'Reported total borrowing proceeds − total borrowing repayments');
 for(const p of series._ifrs_total_debt_net||[]){series.cf_debt_net=series.cf_debt_net.filter(q=>q.end!==p.end);series.cf_debt_net.push(p);}
 addWorkingCapital(series);
 calculateResidual(series,'cf_other_operating','cash_from_operations',[['cf_net_income'],['cf_dna'],['cf_working_capital'],['cf_deferred_tax'],['cf_stock_comp']],'Operating cash flow − identified operating adjustments');
 calculateResidual(series,'cf_other_investing','cash_from_investing',[['cf_capex'],['cf_acquisitions'],['cf_investments']],'Investing cash flow − identified investing flows');
 // SEC dividend payments are positive outflow magnitudes at this stage.
 calculateResidual(series,'cf_other_financing','cash_from_financing',[['cf_net_stock'],['cf_debt_net'],['cf_net_preferred'],['cf_dividends',-1]],'Financing cash flow − identified financing flows');
 calculateResidual(series,'other_equity','shareholders_equity',[['common_stock'],['paid_in_capital'],['retained_earnings'],['aoci'],['preferred_stock'],['treasury_stock',-1]],'Shareholders equity − identified equity components');
 for(const key of ['cf_dividends'])series[key]=(series[key]||[]).map(p=>({...p,val:-p.val}));
 for(const values of Object.values(series))values.sort((a,b)=>a.end.localeCompare(b.end));
}
function trailing(raw,quarterPoints,end,type,additivePerShare=false){
 if(type==='instant')return point(raw,end);
 const whole=raw.filter(p=>annual(p)&&p.end===end).at(-1);if(whole)return whole;
 // Dilution/anti-dilution makes quarterly EPS non-additive. Never sum it.
 if(type==='per-share'&&!additivePerShare)return;
 if(type!=='per-share'){
  const current=raw.filter(p=>p.end===end&&days(p.end,p.start)<330).sort((a,b)=>days(b.end,b.start)-days(a.end,a.start))[0];
  if(current){const priorAnnual=raw.filter(p=>annual(p)&&p.end<end&&Math.abs(days(current.start,p.end)-1)<=10).at(-1),previous=raw.filter(p=>Math.abs(days(current.start,p.start)-365)<=20&&Math.abs(days(current.end,p.end)-365)<=20&&Math.abs(days(current.end,current.start)-days(p.end,p.start))<=15).at(-1);if(priorAnnual&&previous){
   if(type==='shares'){
    const duration=p=>days(p.end,p.start)+1,span=duration(current)+duration(priorAnnual)-duration(previous);
    if(span>=330&&span<=380)return derivedPoint([current,priorAnnual,previous],(current.val*duration(current)+priorAnnual.val*duration(priorAnnual)-previous.val*duration(previous))/span,'Duration-weighted annual + current YTD − prior YTD shares');
   }else return derivedPoint([current,priorAnnual,previous],current.val+priorAnnual.val-previous.val,'Annual + current YTD − prior YTD');
  }}
 }
 let cursor=end;const last=[];for(let i=0;i<4;i++){const p=point(quarterPoints,cursor);if(!p)return;last.push(p);cursor=new Date(Date.parse(p.start)-DAY).toISOString().slice(0,10);}
 if(type==='shares'){const totalDays=last.reduce((n,p)=>n+days(p.end,p.start)+1,0);return derivedPoint(last,last.reduce((n,p)=>n+p.val*(days(p.end,p.start)+1),0)/totalDays,'Day-weighted average of four quarters');}
 return derivedPoint(last,last.reduce((n,p)=>n+p.val,0),'Four standalone quarters');
}
function fiscalLabel(date,boundaries){const q4=boundaries.find(d=>Math.abs(days(date,d))<=14);if(q4)return q4.slice(0,4)+'Q4';const prior=boundaries.filter(d=>d<date).at(-1);if(prior){const q=Math.round(days(date,prior)/91.31);if(q>=1&&q<=3)return String(Number(prior.slice(0,4))+1)+'Q'+q;}return date.slice(0,4)+'Q'+Math.ceil(Number(date.slice(5,7))/3);}

function unavailableReport(data,record,symbol){
 const rows=name=>schema[name].filter(r=>!r.key.startsWith('_')).map(r=>({key:r.key,label:r.label,section:r.section,is_subtotal:r.isSubtotal,values:{}}));
 return {financials:{name:record.name||data.entityName||symbol,ticker:symbol,cik:data.cik||record.cik,company_type:'',available_periods:{annual:false,quarterly:false},columns:['—'],period_dates:[],income_statement:rows('income_statement'),balance_sheet:rows('balance_sheet'),cash_flow:rows('cash_flow'),splits:[],roic_series:[],source_coverage:{status:'unavailable',reason:'No monetary statement observations in SEC CompanyFacts'}},profile:{currency:null,industry:record.industry||'',notes_key:String(data.cik||record.cik||symbol),coverage:'Structured financials unavailable. See the filing.',annual_filing:record.filings?.find(f=>/^(10-K|20-F|40-F|F-1|424B4)$/.test(f.form))?.url||record.filings?.[0]?.url||null},price:null,historical_prices:{},dividends:[]};
}
export function reportingCurrency(data){
 const latest={};
 for(const key of ['revenue','net_income','total_assets','cash_from_operations'])for(const name of concepts[key][0])for(const [unit,points]of Object.entries(data.facts?.[name]?.units||{})){
  if(!/^[A-Z]{3}$/.test(unit))continue;
  for(const p of points)if(!p.unresolved&&!p.excluded_from_mapping&&Number.isFinite(p.val)&&p.end<=data.asOf&&(!p.filed||p.filed<=data.asOf)){
   const id=key+':'+unit;if(!latest[id]||p.end>latest[id])latest[id]=p.end;
  }
 }
 const end=Object.values(latest).sort().at(-1),scores=new Map();
 for(const [id,date]of Object.entries(latest))if(date===end){const unit=id.split(':')[1];scores.set(unit,(scores.get(unit)||0)+1);}
 if(scores.size){const ranked=[...scores].sort((a,b)=>b[1]-a[1]);if(ranked.length===1||ranked[0][1]>ranked[1][1])return ranked[0][0];throw Error('Ambiguous SEC reporting currencies: '+ranked.map(([unit])=>unit).join(', ')+'. Data was not combined.');}
 const units=[...new Set(Object.values(data.facts||{}).flatMap(f=>Object.keys(f.units||{}).filter(u=>/^[A-Z]{3}(?:\/shares)?$/.test(u)).map(u=>u.slice(0,3))))];
 if(units.length===1)return units[0];throw Error(units.length?'Ambiguous SEC reporting currencies. Data was not combined.':'No supported reporting currency was disclosed in these SEC facts.');
}

export function toReportPayload(data,record={},quote=null,period='annual',symbol=record.ticker||'',options={}){
 const knowledge=options.knowledge_as_of||data.asOf;
 data=prepareNativeFacts({...data,asOf:knowledge},record);
 if(options.mode==='point_in_time'&&(!quote?.asOf||quote.asOf.slice(0,10)>knowledge))quote=null;
 if(!Object.values(data.facts||{}).some(f=>Object.entries(f.units||{}).some(([unit,points])=>/^[A-Z]{3}(?:\/shares)?$/.test(unit)&&points.some(p=>Number.isFinite(p.val)))))return unavailableReport(data,record,symbol);
 const currency=reportingCurrency(data);
 const companyType=companyTemplate(record),activeConcepts=nativeConcepts(templateConcepts(concepts,companyType),data,record),sourceExclusions=[];
 const raw={},year={},quarter={},ttm={};
 for(const [key,[names,type='duration']]of Object.entries(activeConcepts)){const unit=type==='per-share'?currency+'/shares':type==='shares'?'shares':currency;raw[key]=readConcept(data,names,unit,type,key,companyType,sourceExclusions);year[key]=byEnd(raw[key].filter(p=>type==='instant'?annualForm(p):annual(p)));quarter[key]=type==='instant'?byEnd(raw[key]):quarters(raw[key],type,key==='_dividends_per_share');}
 // Twelve-month observations in a 10-Q can be rolling cash-flow disclosures,
 // not fiscal years (for example July–June for a December year-end issuer).
 // Keep those raw points for TTM, while annual columns require a known fiscal
 // boundary or a non-quarterly annual/registration observation.
 const quarterlyForm=p=>/^(10-Q|6-K)(\/A)?$/.test(p.form||'');
 const fiscalEnds=new Set(['revenue','net_income','cash_from_operations'].flatMap(key=>(raw[key]||[]).filter(p=>annual(p)&&!quarterlyForm(p)).map(p=>p.end)));
 for(const filing of record.filings||[])if(/^(10-K|20-F|40-F)(\/A)?$/.test(filing.form||'')&&filing.period&&filing.date<=knowledge)fiscalEnds.add(filing.period);
 const fiscalAnnual=p=>annual(p)&&(!quarterlyForm(p)||fiscalEnds.has(p.end));
 for(const [key,[,type='duration']]of Object.entries(activeConcepts))if(type!=='instant')year[key]=byEnd(raw[key].filter(fiscalAnnual));
 // Parent-attributable income and consolidated cash-flow income have
 // different scopes. Convert a total only with a matching NCI disclosure.
 raw.net_income=raw.net_income.map(p=>{
  if(p.concept!=='ProfitLoss')return p;
  const nci=raw.minority_interest_income.find(q=>q.start===p.start&&q.end===p.end&&q.accn===p.accn);
  return nci?derivedPoint([p,nci],p.val-nci.val,'Consolidated profit − disclosed noncontrolling profit'):({...p,income_scope:'Consolidated profit; noncontrolling allocation not available'});
 });
 year.net_income=byEnd(raw.net_income.filter(fiscalAnnual));quarter.net_income=quarters(raw.net_income,'duration');
 // Resolve aggregate-vs-component meaning at the original filing-observation
 // level, before quarter differences and TTM can erase concept identity.
 const sales=raw._cf_inv_sales,maturities=raw._cf_inv_maturities;
 const samePeriod=(p,q)=>p.start===q.start&&p.end===q.end;
 const available=(points,anchor)=>points.filter(p=>samePeriod(p,anchor)&&(p.filed||'')<=(anchor.filed||'')).sort((a,b)=>(b.filed||'').localeCompare(a.filed||'')||Number(b.accn===anchor.accn)-Number(a.accn===anchor.accn))[0];
 const combinedTag='ProceedsFromSaleAndMaturityOfAvailableForSaleSecurities';
 raw._cf_inv_sales=sales.map(p=>{
  if(p.concept===combinedTag)return p;
  const maturity=available(maturities,p);
  return maturity?derivedPoint([p,maturity],p.val+maturity.val,'Disclosed investment sales + available maturity proceeds'):p;
 });
 for(const maturity of maturities){
  const sale=available(sales,maturity);
  if(!sale){raw._cf_inv_sales.push(maturity);continue;}
  if(sale.concept!==combinedTag){raw._cf_inv_sales.push(derivedPoint([maturity,sale],maturity.val+sale.val,'Revised maturity proceeds + available disclosed sales'));continue;}
  // A component-only revision must never replace an aggregate with one part.
  // Decompose a prior combined figure only with its own filing's maturity fact;
  // otherwise retain the last coherent combined observation.
  if(sale.filed<maturity.filed){
   const original=maturities.find(p=>samePeriod(p,sale)&&p.accn===sale.accn&&p.filed===sale.filed);
   if(original)raw._cf_inv_sales.push(derivedPoint([maturity,sale,original],sale.val-original.val+maturity.val,'Earlier combined proceeds − original maturities + revised maturities'));
  }
 }
 raw._cf_inv_sales.sort((a,b)=>a.end.localeCompare(b.end)||(a.filed||'').localeCompare(b.filed||''));
 year._cf_inv_sales=byEnd(raw._cf_inv_sales.filter(fiscalAnnual));quarter._cf_inv_sales=quarters(raw._cf_inv_sales,'duration');
 const annualDates=[...new Set(['revenue','net_income','cash_from_operations','total_assets'].flatMap(k=>year[k].map(p=>p.end)))].sort();
 // An annual balance is often repeated in a newer 10-Q. Its period end, not
 // the form of the latest repetition, determines the annual column.
 for(const [key,[,type='duration']]of Object.entries(activeConcepts))if(type==='instant')year[key]=raw[key].filter(p=>annualDates.includes(p.end));
 // Some filings publish share counts in millions without a corresponding XBRL
 // scale. Correct only when matching reported income/EPS corroborates a factor.
 for(const [key,eps]of [['shares_diluted','eps_diluted'],['shares_basic','eps_basic']]){
  const adjusted=raw[key].flatMap(p=>{const match=list=>list.find(q=>q.end===p.end&&q.start===p.start&&q.accn===p.accn)||point(list.filter(q=>q.start===p.start),p.end),income=match(raw[eps==='eps_basic'?'_eps_income_basic':'_eps_income_diluted'])||match(raw.net_income),earnings=match(raw[eps]);if(!income||!earnings||earnings.val===0||p.val<=0)return [p];const expected=income.val/earnings.val,scale=[1,1e3,1e6].find(f=>Math.abs(p.val*f/expected-1)<.02);return scale?[{...p,val:p.val*scale,...(scale!==1?{inputs:[p,income,earnings],derived:'Share scale reconciled with matching income/EPS'}:{})}]:p.val<10000?[]:[p];});
  raw[key]=adjusted;year[key]=byEnd(adjusted.filter(fiscalAnnual));quarter[key]=quarters(adjusted,'shares');
 }
 const ledger=splitLedger(data,options.split_feed,options);
 const normalized=normalizeShareSeries(raw,ledger,{...options,knowledge_as_of:knowledge});
 for(const key of ['eps_basic','eps_diluted','shares_basic','shares_diluted','_dividends_per_share']){
  raw[key]=normalized.series[key];const type=concepts[key][1];
  year[key]=byEnd(raw[key].filter(fiscalAnnual));quarter[key]=quarters(raw[key],type,key==='_dividends_per_share');
 }
 const quarterDates=[...new Set(['revenue','net_income','cash_from_operations','total_assets'].flatMap(k=>quarter[k].map(p=>p.end)))].filter(date=>!annualDates.includes(date)||['revenue','net_income','cash_from_operations'].some(k=>quarter[k].some(p=>p.end===date))).sort();
 const latest=quarterDates.at(-1)||annualDates.at(-1);
 for(const [key,[,type='duration']]of Object.entries(activeConcepts)){const p=latest&&trailing(raw[key],quarter[key],latest,type,key==='_dividends_per_share');ttm[key]=p?[p]:[];}
 derive(year,data.provider,companyType);derive(quarter,data.provider,companyType);derive(ttm,data.provider,companyType);
 for(const [eps,shares]of [['eps_diluted','shares_diluted'],['eps_basic','shares_basic']]){
  const numerator=ttm[eps==='eps_basic'?'_eps_income_basic':'_eps_income_diluted'][0]||(!data.share_class?ttm._net_income_available[0]:null);
  if(!ttm[eps].length&&numerator&&ttm[shares][0]?.val>0)ttm[eps]=[derivedPoint([numerator,ttm[shares][0]],numerator.val/ttm[shares][0].val,'Estimated TTM matching-class income / TTM weighted-average shares')];
 }

 const selected=period==='quarterly'?quarter:year,dates=period==='quarterly'?quarterDates:annualDates;
 const ifrsReporting=Object.values(data.facts||{}).some(f=>f.namespace==='ifrs-full')&&!Object.values(data.facts||{}).some(f=>f.namespace==='us-gaap');
 const industry=record.industry||'';
 const labels=dates.map(d=>period==='quarterly'?fiscalLabel(d,annualDates):d.slice(0,4));
 const datesByLabel=new Map();dates.forEach((date,i)=>datesByLabel.set(labels[i],date));
 // FastFS/Guru uses positive operating-cost magnitudes, but signed tax and
 // contra-asset/equity rows. Negate the SEC magnitude (not abs), so tax benefits
 // and reversals retain their opposite sign. Apply after all calculations.
 const displaySign={...nativeDisplaySigns(data,record),minority_interest_income:-1,interest_expense:-1,income_tax:-1,accumulated_depreciation:-1,treasury_stock:-1,loan_loss_reserve:-1};
 const quarterEPS={eps_diluted:{},eps_basic:{}};
 if(period==='quarterly')for(const [eps,shares]of [['eps_diluted','shares_diluted'],['eps_basic','shares_basic']])for(const date of quarterDates){
  const reported=point(year[eps],date);
  if(reported&&Number.isFinite(reported.val)){quarterEPS[eps][fiscalLabel(date,annualDates)]=reported.val;continue;}
  const income=trailing(raw[eps==='eps_basic'?'_eps_income_basic':'_eps_income_diluted'],quarter[eps==='eps_basic'?'_eps_income_basic':'_eps_income_diluted'],date,'duration')||(!data.share_class?trailing(raw.net_income,quarter.net_income,date,'duration'):null),preferred=trailing(raw.preferred_dividends,quarter.preferred_dividends,date,'duration'),denominator=trailing(raw[shares],quarter[shares],date,'shares');
  if(income&&Number.isFinite(income.val)&&denominator?.val>0)quarterEPS[eps][fiscalLabel(date,annualDates)]=(income.val-(preferred?.val||0))/denominator.val;
 }
 const rows=(name)=>{
  const template=companyType==='bank'?(name==='income_statement'?'bank_income':name==='balance_sheet'?'bank_balance':name):companyType==='insurance'?(name==='income_statement'?'insurance_income':name==='balance_sheet'?'insurance_balance':name):name;
  let metadata=[...(schema[template]||schema[name])];const add=(key,label,before,isSubtotal=false)=>{const at=metadata.findIndex(row=>row.key===before);metadata.splice(at<0?metadata.length:at,0,{key,label,isSubtotal,section:''});};
  if(name==='income_statement'){if(!companyType&&!data.provider)add('reported_costs_expenses','Costs & Expenses (Reported)','operating_income',true);add('net_income_continuing','Net Income (Continuing)','');add('_net_income_available','Net Income Available to Shareholders','');add('shares_basic','Shares (Basic)','shares_diluted');}
  if(name==='balance_sheet'&&!companyType)metadata=metadata.map(row=>row.key==='accounts_receivable'?{...row,label:'Receivables (Net)'}:row);
  if(name==='balance_sheet'){add('total_debt','Total Debt','long_term_debt',true);add('reported_lease_liabilities_current','Lease Liabilities (Reported Current)','current_capital_leases');add('reported_lease_liabilities_noncurrent','Lease Liabilities (Reported Noncurrent)','noncurrent_capital_leases');if(!data.provider){add('operating_lease_liabilities_current','Operating Lease Liabilities (Current)','current_capital_leases');add('operating_lease_liabilities_noncurrent','Operating Lease Liabilities (Noncurrent)','noncurrent_capital_leases');}}
  if(name==='balance_sheet')add('total_liabilities_equity','Total Liabilities & Equity','',true);
  if(name==='cash_flow'){metadata=metadata.filter(row=>!row.key.startsWith('_'));add('capital_expenditures','Capital Expenditures','cf_other_investing');add('cf_capex','Capital Expenditures (Net / Reported)','cf_other_investing');add('cf_acquisitions','Acquisitions','cf_other_investing');add('cf_investments','Investments','cf_other_investing');add('cf_net_stock','Net Issuance of Common Stock','cf_debt_net');}
  metadata=nativeRows(metadata,name,data,record);
  return metadata.map(row=>{const key=row.key,sourceKey=companyType==='insurance'&&key==='receivables'?'accounts_receivable':key,perShare=activeConcepts[sourceKey]?.[1]==='per-share',scale=perShare?1:1e6,values={},provenance={};for(const [label,date]of datesByLabel){const p=point(selected[sourceKey]||[],date);if(p){if(Number.isFinite(p.val))values[label]=p.val/scale*(displaySign[key]||1);provenance[label]={...p.normalization,end:p.end,start:p.start,reported_value:p.reported_value??p.val,source_form:p.form,debt_scope:p.debt_scope,debt_partial:p.debt_partial,income_scope:p.income_scope,filed:p.filed,accn:p.accn,source_accessions:p.source_accessions||[p.accn].filter(Boolean),source_url:p.source_url,source_cik:p.source_cik,issuer_lineage:p.issuer_lineage,lineage_source_url:p.lineage_source_url,source_concept:p.source_concept,source_concepts:p.source_concepts,source_sha256:p.source_sha256,class_basis_rule:p.class_basis_rule,source_context_member:p.source_context_member,share_class:p.share_class,equity_scope:p.equity_scope,concept:p.concept,unit:p.unit,calculation:p.derived||null};}}const trailingPoint=ttm[sourceKey]?.[0];if(period!=='quarterly'&&trailingPoint){if(Number.isFinite(trailingPoint.val))values.TTM=trailingPoint.val/scale*(displaySign[key]||1);provenance.TTM={...trailingPoint.normalization,end:trailingPoint.end,start:trailingPoint.start,filed:trailingPoint.filed,accn:trailingPoint.accn,source_url:trailingPoint.source_url,source_cik:trailingPoint.source_cik,issuer_lineage:trailingPoint.issuer_lineage,lineage_source_url:trailingPoint.lineage_source_url,concept:trailingPoint.concept,debt_scope:trailingPoint.debt_scope,debt_partial:trailingPoint.debt_partial,calculation:trailingPoint.derived||null};}const equivalent=(raw[sourceKey]||[]).find(p=>p.class_basis_rule&&p.source_context_member),equivalentCode=equivalent?.source_context_member?.match(/EquivalentClass([A-Z0-9]+)Member$/)?.[1],seriesBasis=equivalent?.class_basis_rule||(['cf_capex','free_cash_flow'].includes(key)?Object.entries(provenance).filter(([period])=>/^\d{4}$/.test(period)).sort((a,b)=>b[0].localeCompare(a[0]))[0]?.[1]?.calculation:undefined);
  const debtLeases=key==='long_term_debt'&&Object.values(provenance).some(p=>p.debt_scope==='includes_finance_leases');
  return {key,series_basis:seriesBasis,label:debtLeases?'Long-Term Debt & Finance Leases':equivalentCode&&key.startsWith('shares_')?row.label.replace(')',', Equivalent Class '+equivalentCode+')'):ifrsReporting&&key==='current_capital_leases'?'Current Lease Liabilities':ifrsReporting&&key==='noncurrent_capital_leases'?'Noncurrent Lease Liabilities':row.label,section:row.section,is_subtotal:row.isSubtotal,is_per_share:perShare,is_shares:activeConcepts[sourceKey]?.[1]==='shares',values,provenance,...(quarterEPS[key]?{ttm_values:quarterEPS[key]}:{})};});
 };
 const financials={name:record.name||data.entityName||record.ticker,ticker:symbol,company_type:companyType,statement_template:nativeTemplateFor(data,record),knowledge_as_of:knowledge,debt_policy_version:1,security_kind:selectedSecurityKind(data,record),current_shares:outstandingShares(data,record,knowledge),available_periods:{annual:annualDates.length>0,quarterly:quarterDates.length>0},columns:[...datesByLabel.keys(),...(period==='quarterly'?[]:['TTM'])],period_dates:[...datesByLabel.values(),...(period==='quarterly'?[]:[latest])],income_statement:rows('income_statement'),balance_sheet:rows('balance_sheet'),cash_flow:rows('cash_flow'),cik:data.cik||record.cik||'',splits:ledger.events,share_basis:{policy:normalized.policy,feed_status:ledger.feed_status,events:ledger.events,non_share_actions:ledger.non_share_actions||[]}};
 // Match the original frontend's ROIC formula, including negative equity when
 // total invested capital stays positive. Pretax and tax concepts are not needed.
 const capital=date=>{const debt=point(year.total_debt||[],date);return investedCapital(point(year.shareholders_equity,date)?.val,debt?.val,debt?.debt_scope,point(year.current_capital_leases||[],date)?.val,point(year.noncurrent_capital_leases||[],date)?.val,point(year.minority_interest||[],date)?.val);};
 financials.roic_series=annualDates.flatMap((date,i)=>{const equity=d=>point(year.shareholders_equity,d)?.val,ni=point(year.net_income,date),end=companyType?equity(date):capital(date),begin=i>0&&days(date,annualDates[i-1])>=330&&days(date,annualDates[i-1])<=400?(companyType?equity(annualDates[i-1]):capital(annualDates[i-1])):undefined,average=begin===undefined?end:(begin+end)/2;return ni&&average!==undefined&&average!==0&&(companyType||average>0)?[{year:date.slice(0,4),roic:Math.round(ni.val/average*1000)/10}]:[];});
 financials.roic_series=alignRoicHistory(financials.roic_series,annualDates);
 financials.source_selection={policy:'statement-first-v1',excluded_observations:sourceExclusions};
 financials.share_basis.source_class=data.share_class||null;financials.share_basis.filing_supplement=data.filing_supplement||null;
 financials.share_basis.observations=['eps_diluted','eps_basic','shares_diluted','shares_basic','_dividends_per_share'].flatMap(key=>{
  const points=[...datesByLabel].map(([period,date])=>[period,point(selected[key],date)]);
  if(period!=='quarterly')points.push(['TTM',ttm[key]?.[0]]);
  return points.flatMap(([period,p])=>p?.normalization?[{metric_key:key,metric:{eps_diluted:'EPS (Diluted)',eps_basic:'EPS (Basic)',shares_diluted:'Shares (Diluted)',shares_basic:'Shares (Basic)',_dividends_per_share:'Dividends Per Share'}[key],period,value:Number.isFinite(p.val)?p.val/(key.startsWith('shares')?1e6:1):undefined,reported_value:p.reported_value,filed:p.filed,accn:p.accn,calculation:p.derived||null,source_url:p.source_url,...p.normalization}]:[]);
 });
 let historicalPrices={};
 const feed=options.split_feed;
 if(feed?.currency===currency&&feed.monthly_prices&&(options.mode!=='point_in_time'||feed.fetchedAt?.slice(0,10)<=knowledge)){
  // Yahoo closes and our normalized shares use the same current split basis.
  // Do not use today's adjusted history in a historical-knowledge backtest.
  historicalPrices=Object.fromEntries(Object.entries(feed.monthly_prices).filter(([month,value])=>month<=knowledge.slice(0,7)&&Number.isFinite(value)&&value>0));
 }
 const dividends=quarter._dividends_per_share.filter(p=>Number.isFinite(p.val)).map(p=>({date:p.end,amount:p.val,reported_amount:p.reported_value,share_basis:p.normalization}));
 financials.review_sources={provider:data.provider||'SEC EDGAR',fetched_at:data.fetchedAt||null,quote_as_of:quote?.currency===currency?quote.asOf:null};
 financials.validation=validateSourceReport(data,{financials,profile:{currency}});
 financials.mapping_audit=buildMappingAudit(data,financials,period==='quarterly',activeConcepts);
 attachValueAvailability(data,financials,{currency,symbol,registry:activeConcepts,annualSource:record.filings?.find(f=>/^(10-K|20-F|40-F)$/.test(f.form)||/^(DART|MOPS) annual$/.test(f.form))?.url});
 return {financials,profile:{currency,issuer_lineage:data.issuer_lineage,industry:record.industry||'',notes_key:String(data.cik||record.cik||symbol),share_basis:financials.share_basis,coverage:annualDates.length===0&&quarterDates.length>0?'Quarterly data only; annual history unavailable.':'',annual_filing:record.filings?.find(f=>/^(10-K|20-F|40-F)$/.test(f.form))?.url||null},price:quote&&quote.currency===currency?{...quote,price:quote.price,currency}:null,historical_prices:historicalPrices,dividends};
}
