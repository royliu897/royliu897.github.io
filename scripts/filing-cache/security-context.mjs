// Offline only. Cover-page security identity is established by same-context
// DEI TradingSymbol + Security12bTitle, not by counting directory tickers.
import {extractClassFacts} from '../../sec-worker/class-facts.mjs';
import {mergeClassFacts} from '../../assets/report/filing-supplement.mjs';
const decode=s=>String(s||'').replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replaceAll('&amp;','&').replaceAll('&nbsp;',' ').replaceAll('&quot;','"').replaceAll('&apos;',"'");
const attrs=s=>Object.fromEntries([...String(s).matchAll(/([\w:.-]+)\s*=\s*["']([^"']*)["']/g)].map(m=>[m[1].toLowerCase(),decode(m[2])]));
const plain=s=>decode(String(s).replace(/<ix:exclude\b[^>]*>[\s\S]*?<\/ix:exclude>/gi,'').replace(/<[^>]*>/g,'')).replace(/\s+/g,' ').trim();
const local=s=>String(s||'').split(':').at(-1);
const classAxis=s=>['StatementClassOfStockAxis','ClassesOfShareCapitalAxis','ClassesOfOrdinarySharesAxis'].includes(local(s));
const standardNamespace=(prefix,namespaces)=>prefix==='us-gaap'&&/^https?:\/\/(?:fasb\.org|xbrl\.us)\//.test(namespaces[prefix]||'')||prefix==='ifrs-full'&&/^https?:\/\/xbrl\.(?:ifrs|iasb)\.org\/taxonomy\//.test(namespaces[prefix]||'');
const shareConcepts=new Set(['EarningsPerShareBasic','EarningsPerShareDiluted','BasicEarningsLossPerShare','DilutedEarningsLossPerShare','WeightedAverageNumberOfSharesOutstandingBasic','WeightedAverageNumberOfDilutedSharesOutstanding','WeightedAverageShares','AdjustedWeightedAverageShares','NetIncomeLossAvailableToCommonStockholdersBasic','NetIncomeLossAvailableToCommonStockholdersDiluted','NetIncomeLoss','CommonStockDividendsPerShareDeclared']);
function inlineElements(text,tag){
 const tokens=new RegExp('<'+tag+'\\b([^>]*)>|<\\/'+tag+'\\s*>','gi'),stack=[],out=[];
 for(const token of text.matchAll(tokens)){
  if(token[1]!==undefined){if(!/\/\s*$/.test(token[1]))stack.push({start:token.index,body:token.index+token[0].length,attributes:token[1]});}
  else if(stack.length){const open=stack.pop();out.push([text.slice(open.start,token.index+token[0].length),open.attributes,text.slice(open.body,token.index)]);}
 }
 return out;
}
export function canonicalSecurityTicker(value){
 const ticker=plain(value).toUpperCase();
 // SEC cover symbols use several exchange punctuation conventions. These
 // transformations preserve the security series, not an issuer name match.
 const preferred=ticker.match(/^([A-Z0-9.-]+)(?:\s+PR\s*|\.PR\.)([A-Z0-9]+)$/);
 if(preferred)return preferred[1].replaceAll('.','-')+'-P'+preferred[2];
 return ticker.replaceAll('.','-').replaceAll('/','-');
}
export function securityTitleKind(title){
 if(/\bpreferred\b|\bpreference\b/i.test(title))return 'preferred';
 if(/\bnotes?\b|\bdebentures?\b|\bbonds?\b|\bETNs?\b|debt securities/i.test(title))return 'debt';
 if(/\bcommon\s+(?:stock|shares|units)\b|\bordinary\s+shares\b|\bshares?\s+of\s+beneficial\s+interest\b/i.test(title))return 'common';
 return 'unknown';
}
function classCode(member){
 const name=local(member);if(/preferred|preference/i.test(name))return null;
 return name.match(/^(?:Common)?Class([A-Z][A-Z0-9-]*?)(?:CommonStock|CapitalStock|Stock)?Member$/)?.[1]||null;
}
export function extractSecurityContext(text,{cik,ticker,filing,tickers=[]}){
 if(!/^0*[1-9][0-9]{0,9}$/.test(String(cik)))throw Error('Invalid security cover issuer identity.');
 const namespaces=Object.fromEntries([...text.matchAll(/xmlns:([\w.-]+)\s*=\s*["']([^"']+)["']/g)].map(m=>[m[1],m[2]])),contexts=new Map();
 for(const m of text.matchAll(/<(?:[\w.-]+:)?context\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?context>/gi)){
  const a=attrs(m[1]),body=m[2],id=body.match(/<(?:[\w.-]+:)?identifier\b([^>]*)>([^<]+)</i),scheme=id&&attrs(id[1]).scheme;
  if(!a.id||!id||!/^0*[1-9][0-9]{0,9}$/.test(id[2].trim())||!/^https?:\/\/www\.sec\.gov\/CIK$/.test(scheme||'')||String(Number(id[2]))!==String(Number(cik))||/typedMember/i.test(body))continue;
  const dimensions=[...body.matchAll(/<(?:[\w.-]+:)?explicitMember\b([^>]*)>([^<]+)</gi)].map(n=>({axis:attrs(n[1]).dimension,member:plain(n[2])}));
  contexts.set(a.id,{dimensions});
 }
 if(!contexts.size)throw Error('Security cover issuer identity could not be verified.');
 const continuations=new Map([...text.matchAll(/<ix:continuation\b([^>]*)>([\s\S]*?)<\/ix:continuation>/gi)].map(m=>[attrs(m[1]).id,{a:attrs(m[1]),body:m[2]}]));
 function continued(a,body){let out=plain(body),next=a.continuedat;const seen=new Set();while(next){if(seen.has(next)||seen.size>=12||!continuations.has(next))return null;seen.add(next);const part=continuations.get(next);out+=' '+plain(part.body);next=part.a.continuedat;}return out.trim();}
 const values=new Map();
 for(const m of inlineElements(text,'ix:nonNumeric')){
  const a=attrs(m[1]),[prefix,name]=String(a.name||'').split(':');
  if(!['TradingSymbol','Security12bTitle'].includes(name)||!/^https?:\/\/xbrl\.sec\.gov\/dei\//.test(namespaces[prefix]||'')||!contexts.has(a.contextref))continue;
  const value=continued(a,m[2]);if(value===null)continue;
  const group=values.get(a.contextref)||{TradingSymbol:[],Security12bTitle:[]};group[name].push(value);values.set(a.contextref,group);
 }
 const listings=[];
 for(const [context,group]of values){
  const symbols=[...new Set(group.TradingSymbol)],titles=[...new Set(group.Security12bTitle)];
  if(symbols.length!==1||titles.length!==1||!symbols[0]||/^none|n\/a$/i.test(symbols[0]))continue;
  const dimensions=contexts.get(context).dimensions,titleClass=titles[0].match(/\bClass\s+([A-Z][A-Z0-9-]*)\b/i)?.[1]?.toUpperCase(),dimensionClasses=dimensions.filter(d=>classAxis(d.axis)).map(d=>classCode(d.member)).filter(Boolean),contradiction=!!titleClass&&dimensionClasses.length>0&&!dimensionClasses.includes(titleClass);
  listings.push({ticker:canonicalSecurityTicker(symbols[0]),source_symbol:symbols[0],title:titles[0],kind:contradiction?'unknown':securityTitleKind(titles[0]),context_ref:context,dimensions,...(contradiction?{class_identity_conflict:true}:{})});
 }
 const selected=listings.filter(s=>s.ticker===canonicalSecurityTicker(ticker)),unknownTickers=[...new Set(tickers.map(canonicalSecurityTicker))].filter(t=>!listings.some(s=>s.ticker===t&&s.kind!=='unknown'));
 const namedCommonClasses=new Set(),unknownCommonMembers=new Set(),ownCapitalContexts=new Set(listings.filter(s=>s.kind==='common').map(s=>s.context_ref));
 const ownCapitalConcepts=new Set([...shareConcepts,'CommonStockSharesOutstanding','EntityCommonStockSharesOutstanding','CommonStockValue','CommonStockValueOutstanding','CommonStocksIncludingAdditionalPaidInCapital']);
 for(const m of text.matchAll(/<ix:nonFraction\b([^>]*)>/gi)){const a=attrs(m[1]),[prefix,name]=String(a.name||'').split(':'),ctx=contexts.get(a.contextref),standard=standardNamespace(prefix,namespaces)||name==='EntityCommonStockSharesOutstanding'&&/^https?:\/\/xbrl\.sec\.gov\/dei\//.test(namespaces[prefix]||'');if(ownCapitalConcepts.has(name)&&standard&&ctx?.dimensions.length===1&&classAxis(ctx.dimensions[0].axis))ownCapitalContexts.add(a.contextref);}
 for(const [context,ctx]of contexts)for(const d of ctx.dimensions){
  // A bank's Visa share holdings also have class dimensions. Only its own
  // earnings/share-capital concepts establish issuer common-share classes.
  if(!ownCapitalContexts.has(context)||!classAxis(d.axis))continue;const code=classCode(d.member);
  const registeredCommon=listings.some(s=>s.kind==='common'&&s.dimensions.some(x=>x.axis===d.axis&&x.member===d.member)),registeredOther=listings.some(s=>['preferred','debt'].includes(s.kind)&&s.dimensions.some(x=>x.axis===d.axis&&x.member===d.member));
  if(registeredOther||/preferred|preference/i.test(local(d.member)))continue;
  if(code&&(/common/i.test(local(d.member))||registeredCommon))namedCommonClasses.add(code);
  else if(!registeredCommon&&!/^(?:(?:All|Total|Aggregate)?Common(?:Stock|Shares|Units)|OrdinaryShares|OrdinaryShareCapital)Member$/i.test(local(d.member)))unknownCommonMembers.add(d.member);
 }
 const commonTickers=[...new Set(listings.filter(s=>s.kind==='common').map(s=>s.ticker))],commonClasses=Math.max(commonTickers.length,namedCommonClasses.size);
 const kinds=[...new Set(selected.map(s=>s.kind))],selectedKind=kinds.length===1?kinds[0]:kinds.includes('common')&&kinds.every(k=>k==='common'||k==='debt')?'common':'unknown';
 const classConflicts=listings.filter(s=>s.class_identity_conflict).map(s=>({ticker:s.ticker,title:s.title,context_ref:s.context_ref,dimensions:s.dimensions}));
 const model={version:1,cik:String(cik),selected_ticker:canonicalSecurityTicker(ticker),asOf:filing.date,source_url:filing.url,accession:filing.accession,listings,common_listed_classes:commonTickers.length,common_context_classes:[...namedCommonClasses].sort(),unknown_common_members:[...unknownCommonMembers].sort(),class_conflicts:classConflicts,unknown_tickers:unknownTickers,selected_kind:selectedKind,eligible_single_common_class:selectedKind==='common'&&commonClasses===1&&unknownTickers.length===0&&unknownCommonMembers.size===0&&classConflicts.length===0,status:listings.length?'available':'unavailable'};
 return {model,contexts,namespaces,selected};
}
export function extractListedClassSupplement(text,options){
 const {model,contexts,namespaces,selected}=extractSecurityContext(text,options),commonSelected=selected.filter(s=>s.kind==='common');
 if(!selected.length||model.selected_kind!=='common')return {cik:String(options.cik),ticker:options.ticker,facts:{},status:'unavailable',reason:'A selected listed common security could not be established from the cover.',source:options.filing};
 // Restrict the pure extractor to class-specific per-share/allocated-income
 // facts before parsing, so unrelated entity-wide footnote conflicts cannot
 // poison this supplement. No entity-wide financial fact is merged back.
 const qualifiedEquivalentContexts=new Map(),qualifiedFacts=new Map(),qualifiedByContextConcept=new Map(),rawFacts=new Map(),selectedCode=commonSelected.flatMap(s=>s.dimensions.filter(d=>classAxis(d.axis)).map(d=>classCode(d.member))).find(Boolean);
 for(const m of inlineElements(text,'ix:nonFraction')){const a=attrs(m[1]);if(!a.id)continue;if(!rawFacts.has(a.id))rawFacts.set(a.id,[]);rawFacts.get(a.id).push(a);}
 // The issuer can report EPS on an equivalent class basis. Accept that basis
 // only on an identified primary EPS row whose caption expressly names the
 // registered class. The reported EPS is retained without numerical conversion.
 for(const point of options.inventory?.facts||[]){
  const ctx=contexts.get(point.context_ref),member=ctx?.dimensions?.[0]?.member,raw=rawFacts.get(point.fact_id),[prefix,name]=String(point.qname||'').split(':'),eps=['EarningsPerShareBasic','EarningsPerShareDiluted','BasicEarningsLossPerShare','DilutedEarningsLossPerShare'].includes(point.name),weighted=['WeightedAverageNumberOfSharesOutstandingBasic','WeightedAverageNumberOfDilutedSharesOutstanding','WeightedAverageShares','AdjustedWeightedAverageShares'].includes(point.name);
  if(!selectedCode||!eps&&!weighted||point.statement!=='income_statement'||ctx?.dimensions.length!==1||!classAxis(ctx.dimensions[0].axis)||local(member)!=='EquivalentClass'+selectedCode+'Member')continue;
  if(!raw||raw.length!==1||raw[0].name!==point.qname||raw[0].contextref!==point.context_ref||name!==point.name||prefix!==point.namespace||point.namespace_uri!==namespaces[prefix]||!standardNamespace(prefix,namespaces))continue;
  const caption=eps?new RegExp('(?:earnings|income).*per.*equivalent\\s+class\\s*'+selectedCode+'\\s+share','i'):new RegExp('(?:average|weighted).*equivalent\\s+class\\s*'+selectedCode+'\\s+shares','i');
  if(!caption.test(point.label||''))continue;
  const rule=eps?'Issuer-reported equivalent Class '+selectedCode+' EPS on primary income statement; no numerical conversion':'Issuer-reported equivalent Class '+selectedCode+' weighted-average shares; aggregate equivalent-share denominator, not actual Class '+selectedCode+' shares outstanding';
  qualifiedEquivalentContexts.set(point.context_ref,member);qualifiedFacts.set(point.fact_id,{member,rule});qualifiedByContextConcept.set(point.context_ref+'|'+point.qname,{member,rule});
 }
 let scoped=text.replace(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi,(full,attributes)=>{
  const a=attrs(attributes),[prefix,name]=String(a.name||'').split(':'),ctx=contexts.get(a.contextref);
  const eligible=shareConcepts.has(name)&&standardNamespace(prefix,namespaces)&&ctx?.dimensions.length===1&&classAxis(ctx.dimensions[0].axis);
  return eligible&&(!/^EquivalentClass/.test(local(ctx.dimensions[0].member))||qualifiedFacts.has(a.id))?full:'';
 });
 scoped=scoped.replace(/<(?:[\w.-]+:)?context\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?context>/gi,(full,attributes)=>qualifiedEquivalentContexts.has(attrs(attributes).id)?full.replace(/(<(?:[\w.-]+:)?explicitMember\b[^>]*>)([^<]+)(<\/(?:[\w.-]+:)?explicitMember>)/gi,(element,open,member,close)=>member.trim()===qualifiedEquivalentContexts.get(attrs(attributes).id)?open+'us-gaap:CommonClass'+selectedCode+'Member'+close:element):full);
 // A reused issuer symbol on a debt listing does not define the common class.
 const commonCoverContexts=new Set(commonSelected.map(s=>s.context_ref));
 scoped=scoped.replace(/<ix:nonNumeric\b([^>]*)>([\s\S]*?)<\/ix:nonNumeric>/gi,(full,attributes,body)=>{const a=attrs(attributes);return local(a.name)==='TradingSymbol'&&canonicalSecurityTicker(plain(body))===canonicalSecurityTicker(options.ticker)&&!commonCoverContexts.has(a.contextref)?'':full;});
 const parsed=extractClassFacts(scoped,{cik:options.cik,ticker:commonSelected[0].source_symbol,filing:options.filing});
 const facts=Object.fromEntries(Object.entries(parsed.facts||{}).map(([name,fact])=>[name,{...fact,units:Object.fromEntries(Object.entries(fact.units||{}).map(([unit,ps])=>[unit,ps.filter(p=>p.share_class).map(p=>{const qualified=qualifiedByContextConcept.get(p.context_ref+'|'+p.source_concept);return {...p,...(qualified?{source_context_member:qualified.member,class_basis_rule:qualified.rule}:{})};})]))}]).filter(([,fact])=>Object.values(fact.units).some(ps=>ps.length)));
 return {...parsed,ticker:options.ticker,facts,share_class:parsed.share_class?{...parsed.share_class,ticker:options.ticker,source_symbol:commonSelected[0].source_symbol}:null,status:Object.keys(facts).length?'available':'unavailable',scope:'Selected listed-class EPS, weighted shares and allocated income only; entity-wide facts excluded.'};
}
export function combineListedClassSupplements(supplements,{cik,ticker}){
 let data={cik:String(cik),facts:{}},sources=[],failures=[];
 for(const value of supplements){
  if(value.ticker!==ticker||String(Number(value.cik))!==String(Number(cik)))throw Error('Listed-class cache security identity mismatch.');
  if(value.status!=='available'){failures.push({source:value.source,reason:value.reason||'No eligible selected-class observations'});continue;}
  try{data=mergeClassFacts(data,value);sources.push(value.source);}catch(error){failures.push({source:value.source,reason:error.message});}
 }
 return {...data,ticker,status:sources.length?(failures.length?'partial':'available'):'unavailable',sources,failures,scope:'Offline cached selected listed-class facts only. Security and class identity are checked before merge.'};
}
export function validateListedClassHistory(value,{cik,ticker,expectedClass}){
 const source=value.source,validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(Date.parse(s)),sourcePrefix='https://www.sec.gov/Archives/edgar/data/'+Number(cik)+'/'+String(source?.accession||'').replaceAll('-','')+'/';
 if(!expectedClass||String(Number(value.cik))!==String(Number(cik))||value.ticker!==ticker||value.share_class?.identity!==expectedClass||canonicalSecurityTicker(value.share_class?.ticker)!==ticker||String(Number(value.share_class?.cik))!==String(Number(cik)))throw Error('Historical listed-class identity mismatch.');
 if(!/^\d{10}-\d{2}-\d{6}$/.test(source?.accession||'')||!/^10-[KQ](?:\/A)?$/.test(source.form||'')||!validDate(source.date)||!validDate(source.period)||source.period>source.date||!source.url?.startsWith(sourcePrefix))throw Error('Historical listed-class filing metadata mismatch.');
 const facts={},allocated=new Set(['ClassAllocatedNetIncome','ClassAllocatedNetIncomeBasic','ClassAllocatedNetIncomeDiluted']);
 for(const [name,fact]of Object.entries(value.facts||{})){
  if(!shareConcepts.has(name)&&!allocated.has(name)||!['us-gaap','ifrs-full'].includes(fact.namespace))continue;
  const units={};
  for(const [unit,points]of Object.entries(fact.units||{})){
   const expectedUnit=/Shares|SharesOutstanding/.test(name)&&!/PerShare/.test(name)?unit==='shares':allocated.has(name)?/^[A-Z]{3}$/.test(unit):/^[A-Z]{3}\/shares$/.test(unit);
   if(!expectedUnit)continue;
   const eligible=points.filter(p=>p.share_class===expectedClass&&Number.isFinite(p.val)&&validDate(p.start)&&validDate(p.end)&&p.start<=p.end&&p.end<=source.period&&p.filed===source.date&&p.accn===source.accession&&p.source_url===source.url&&!p.unresolved&&!p.excluded_from_mapping);
   if(eligible.length)units[unit]=eligible.map(p=>({...p}));
  }
  if(Object.keys(units).length)facts[name]={...fact,units};
 }
 if(!Object.keys(facts).length)throw Error('Historical listed-class cache has no eligible scoped observations.');
 return {...value,facts,status:'available',scope:'Historical selected-class EPS, weighted shares and allocated income only; entity-wide facts discarded.'};
}
