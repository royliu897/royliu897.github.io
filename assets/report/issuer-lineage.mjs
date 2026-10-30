// Reviewed legal-successor relationships, never inferred from a reused ticker.
// Only a 1:1 redomiciliation with unchanged ownership is eligible here.
export const issuerLineages=Object.freeze([Object.freeze({
 successor_cik:'2115436',predecessor_cik:'34088',ticker:'XOM',exchange:'NYSE',
 effective:'2026-07-01',known_at:'2026-07-01',exchange_ratio:1,
 kind:'redomiciliation-successor',accession:'0001193125-26-291990',
 source_url:'https://investor.exxonmobil.com/sec-filings/all-sec-filings/content/0001193125-26-291990/d71068d8k12b.htm',
 evidence:'8-K12B explanatory note and Item 2.01: successor registrant; each outstanding predecessor common share exchanged for one successor share with unchanged ownership percentage.'
})]);
const date=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(Date.parse(s));
const cik=s=>String(Number(s));
export function verifiedPredecessor(record,knowledge){
 if(!date(knowledge))return null;
 return issuerLineages.find(r=>cik(record.cik)===r.successor_cik&&record.ticker===r.ticker&&record.exchange===r.exchange&&r.known_at<=knowledge&&r.effective<=knowledge&&r.exchange_ratio===1)||null;
}
function sourced(p,sourceCik){
 if(!/^\d{10}-\d{2}-\d{6}$/.test(p.accn||''))return null;
 const root='https://www.sec.gov/Archives/edgar/data/'+Number(sourceCik)+'/'+p.accn.replaceAll('-','')+'/';
 // A supplied URL must agree with the feed's verified issuer and accession.
 if(p.source_url&&!p.source_url.startsWith(root))return null;
 return {...p,source_cik:cik(sourceCik),source_url:p.source_url||root};
}
export function mergePredecessorHistory(current,predecessor,relation){
 if(!issuerLineages.includes(relation)||cik(current.cik)!==relation.successor_cik||cik(predecessor.cik)!==relation.predecessor_cik||!date(current.asOf)||current.asOf<relation.effective||current.asOf<relation.known_at)throw Error('Unverified issuer lineage.');
 const facts={};let imported=0;
 for(const [name,fact]of Object.entries(current.facts||{}))facts[name]={...fact,units:Object.fromEntries(Object.entries(fact.units||{}).map(([u,ps])=>[u,ps.map(p=>sourced(p,current.cik)).filter(Boolean)]))};
 for(const [name,incoming]of Object.entries(predecessor.facts||{})){
  if(!['us-gaap','ifrs-full','dei'].includes(incoming.namespace))continue;
  const existing=facts[name];if(existing&&existing.namespace!==incoming.namespace)continue;
  const fact=facts[name]??={...incoming,units:{}};
  for(const [unit,ps]of Object.entries(incoming.units||{})){
   const list=fact.units[unit]??=[],ids=new Set(list.map(p=>[p.start,p.end,p.accn,p.val].join('|')));
   for(const p of ps){
    // The old CIK can remain an operating subsidiary after the transaction.
    // Do not append its later financials to the public parent's history.
    if(!date(p.filed)||!date(p.end)||p.filed>relation.effective||p.end>relation.effective||p.filed>current.asOf||p.end>current.asOf||!Number.isFinite(p.val))continue;
    const point=sourced(p,predecessor.cik),id=[p.start,p.end,p.accn,p.val].join('|');
    if(!point||ids.has(id))continue;
    list.push({...point,issuer_lineage:relation.kind,lineage_source_url:relation.source_url});ids.add(id);imported++;
   }
  }
 }
 return {...current,facts,issuer_lineage:{...relation,status:'available',imported_observations:imported}};
}
export async function supplementIssuerHistory(current,record,profile,request){
 const relation=verifiedPredecessor(record,current.asOf);if(!relation)return {facts:current,profile};
 try{
  const [oldResult,historyResult]=await Promise.allSettled([request('/company/CIK'+relation.predecessor_cik+'/facts'),request('/company/CIK'+relation.predecessor_cik+'/filings?from='+Math.max(1994,Number(current.asOf.slice(0,4))-1))]);
  if(oldResult.status!=='fulfilled')throw oldResult.reason;
  const old=oldResult.value;
  const facts=mergePredecessorHistory(current,old,relation);
  // Fact accessions already give exact archive provenance. Recent annual
  // metadata is optional; it must not make a valid fact-history load fail.
  const history=historyResult.status==='fulfilled'?historyResult.value:null;
  const filings=cik(history?.cik)===relation.predecessor_cik?(history.filings||[]).filter(f=>date(f.date)&&date(f.period)&&f.date<=relation.effective&&f.period<=relation.effective&&f.date<=current.asOf&&f.url?.startsWith('https://www.sec.gov/Archives/edgar/data/'+relation.predecessor_cik+'/'+f.accession?.replaceAll('-','')+'/')).map(f=>({...f,source_cik:relation.predecessor_cik,issuer_lineage:relation.kind})):[];
  return {facts,profile:{...profile,filings:[...(profile.filings||[]),...filings].sort((a,b)=>b.date.localeCompare(a.date))}};
 }catch{return {facts:{...current,issuer_lineage:{...relation,status:'unavailable'}},profile};}
}
