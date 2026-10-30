import {concepts as reportConcepts} from '../assets/report/concept-registry.mjs';
const entityConcepts=new Set(Object.values(reportConcepts).flatMap(([names])=>names));
const decode=text=>text.replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replaceAll('&amp;','&').replaceAll('&nbsp;',' ').replaceAll('&quot;','"').replaceAll('&apos;',"'");
const attrs=text=>Object.fromEntries([...text.matchAll(/([\w:.-]+)\s*=\s*["']([^"']*)["']/g)].map(m=>[m[1].toLowerCase(),decode(m[2])]));
const plain=text=>decode(text.replace(/<ix:exclude\b[^>]*>[\s\S]*?<\/ix:exclude>/gi,'').replace(/<[^>]*>/g,'')).trim();
const classAxis=name=>/^(StatementClassOfStockAxis|ClassesOfShareCapitalAxis|ClassesOfOrdinarySharesAxis)$/.test(name.split(':').at(-1));
const classCode=name=>{
 const local=name.split(':').at(-1);return local.match(/^(?:Common)?Class([A-Z][A-Z0-9-]*?)(?:CommonStock|CapitalStock|Stock)?Member$/)?.[1]||null;
};
const dimensionIdentity=d=>`${d.axis.split(':').at(-1)}:${classCode(d.member)||d.member}`;
const concepts=new Set(['EarningsPerShareBasic','EarningsPerShareDiluted','BasicEarningsLossPerShare','DilutedEarningsLossPerShare','WeightedAverageNumberOfSharesOutstandingBasic','WeightedAverageNumberOfDilutedSharesOutstanding','WeightedAverageShares','AdjustedWeightedAverageShares','NetIncomeLossAvailableToCommonStockholdersBasic','NetIncomeLossAvailableToCommonStockholdersDiluted','NetIncomeLoss','CommonStockDividendsPerShareDeclared']);
export function extractClassFacts(text,{cik,ticker,filing,verifiedClass=null}){
 const contexts=new Map(),rawContexts=new Map(),units=new Map();
 for(const m of text.matchAll(/<(?:\w+:)?context\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?context>/gi)){
  const id=m[1].match(/\bid\s*=\s*["']([^"']+)/i)?.[1];if(id)rawContexts.set(id,m[2]);
 }
 const identifier=body=>body.match(/<(?:\w+:)?identifier\b[^>]*>([^<]+)</i)?.[1];
 if(![...rawContexts.values()].some(body=>Number(identifier(body))===Number(cik)))throw Error('Filing XBRL entity does not match the requested CIK.');
 function context(id){
  if(contexts.has(id))return contexts.get(id);const body=rawContexts.get(id);
  if(!body||Number(identifier(body))!==Number(cik)||/typedMember/i.test(body)){contexts.set(id,null);return null;}
  const dims=[...body.matchAll(/<(?:\w+:)?explicitMember\b([^>]*)>([^<]+)</gi)].map(n=>({axis:attrs(n[1]).dimension,member:plain(n[2])}));
  const date=tag=>body.match(new RegExp('<(?:\\w+:)?'+tag+'>([^<]+)<','i'))?.[1];
  const result={start:date('startDate'),end:date('endDate')||date('instant'),dims};contexts.set(id,result);return result;
 }
 for(const m of text.matchAll(/<(?:\w+:)?unit\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?unit>/gi)){
  const measures=[...m[2].matchAll(/<(?:\w+:)?measure>([^<]+)</gi)].map(x=>x[1].split(':').at(-1));
  if(measures.length===1)units.set(attrs(m[1]).id,measures[0]);else if(measures.length===2&&/unitDenominator/i.test(m[2]))units.set(attrs(m[1]).id,measures.join('/'));
 }
 const candidates=[];
 for(const m of text.matchAll(/<ix:nonNumeric\b([^>]*)>([\s\S]*?)<\/ix:nonNumeric>/gi)){
  const a=attrs(m[1]);if(a.name?.split(':').at(-1)!=='TradingSymbol'||plain(m[2])!==ticker)continue;
  const ctx=context(a.contextref);if(ctx?.dims.length===1&&classAxis(ctx.dims[0].axis))candidates.push(ctx.dims[0]);
 }
 for(const m of text.matchAll(/<[\w.-]+:TradingSymbol\b([^>]*)>([^<]*)<\/[\w.-]+:TradingSymbol>/g)){
  const a=attrs(m[1]);if(plain(m[2])!==ticker)continue;const ctx=context(a.contextref);if(ctx?.dims.length===1&&classAxis(ctx.dims[0].axis))candidates.push(ctx.dims[0]);
 }
 const identities=[...new Set(candidates.map(dimensionIdentity))];
 const selected=identities.length===1?{...candidates[0],identity:identities[0],ticker,cik:String(cik)}:verifiedClass;
 if(!selected||selected.ticker!==ticker||Number(selected.cik)!==Number(cik))return {cik:String(cik),ticker,facts:{},share_class:null,status:'unavailable',reason:'The listed share class could not be established from the filing.'};
 const facts={},seen=new Map();
 function retain(name,attributes,body,inline){
  const local=name?.split(':').at(-1);if(!concepts.has(local)&&!entityConcepts.has(local))return;if(!['us-gaap','ifrs-full','dei'].includes(name.split(':')[0]))return;
  const a=attrs(attributes),ctx=context(a.contextref),unit=units.get(a.unitref);
  if(!ctx?.end||!unit)return;const classFact=ctx.dims.length===1&&classAxis(ctx.dims[0].axis)&&dimensionIdentity(ctx.dims[0])===selected.identity;
  if(ctx.dims.length?(!classFact||!concepts.has(local)||!ctx.start):(!entityConcepts.has(local)||concepts.has(local)&&local!=='NetIncomeLoss'))return;
  const format=a.format?.split(':').at(-1)||'',raw=plain(body);let value;
  if(/fixed-zero|zerodash/.test(format))value=0;
  else{
   if(format&&!/num-?dot-?decimal|num-?comma-?decimal/i.test(format))return;
   const comma=/comma/i.test(format),clean=raw.replace(/[()\s\u00a0]/g,'');
   if(!/^[+-]?[\d.,]+$/.test(clean))return;
   value=Number(comma?clean.replaceAll('.','').replace(',','.'):clean.replaceAll(',',''));
   if(raw.startsWith('(')||a.sign==='-')value=-Math.abs(value);
  }
  const scale=inline?Number(a.scale||0):0;if(!Number.isInteger(scale)||Math.abs(scale)>12)return;value*=10**scale;if(!Number.isFinite(value))return;
  const target=classFact&&local==='NetIncomeLoss'?'ClassAllocatedNetIncome':local==='NetIncomeLossAvailableToCommonStockholdersBasic'?'ClassAllocatedNetIncomeBasic':local==='NetIncomeLossAvailableToCommonStockholdersDiluted'?'ClassAllocatedNetIncomeDiluted':local;
  const id=[target,unit,ctx.start,ctx.end,filing.accession].join(':');
  if(seen.has(id)){if(seen.get(id)!==value)throw Error('Conflicting class-specific facts in the same filing.');return;}seen.set(id,value);
  const point={start:ctx.start,end:ctx.end,val:value,filed:filing.date,accn:filing.accession,form:filing.form,source_url:filing.url,source_data_url:filing.data_url||filing.url,source_concept:name,...(classFact?{share_class:selected.identity}:{}),context_ref:a.contextref};
  ((facts[target]??={namespace:name.split(':')[0],label:local,units:{}}).units[unit]??=[]).push(point);
 }
 if(/<ix:nonFraction\b/i.test(text))for(const m of text.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi)){const name=m[1].match(/\bname\s*=\s*["']([^"']+)/i)?.[1];if(concepts.has(name?.split(':').at(-1))||entityConcepts.has(name?.split(':').at(-1)))retain(name,m[1],m[2],true);}
 else for(const m of text.matchAll(/<([A-Za-z_][\w.-]*:[\w.-]+)\b([^>]*)>([^<]*)<\/\1>/g))retain(m[1],m[2],m[3],false);
 return {cik:String(cik),ticker,facts,share_class:selected,status:Object.keys(facts).length?'available':'unavailable',source:filing};
}
