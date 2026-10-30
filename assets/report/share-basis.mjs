import {verifiedNonShareAction} from './corporate-actions.mjs?v=36daa9623894';
const DAY=86400000;
const lag=(a,b)=>(Date.parse(a)-Date.parse(b))/DAY;
const finite=n=>Number.isFinite(n);
const sourceURL=(cik,p)=>p.source_url||(p.accn&&/^\d+$/.test(String(cik))?`https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${p.accn.replaceAll('-','')}/`:null);
const shareKeys=['eps_basic','eps_diluted','shares_basic','shares_diluted','_dividends_per_share'];
const isShares=key=>key.startsWith('shares_');
const allowedTypes=new Set(['split','reverse_split','stock_dividend','recapitalization']);
export function secSplitEvents(data,knowledgeAsOf=data.asOf){
 const events=[];
 for(const [concept,fact]of Object.entries(data.facts||{})){
  // Cash dividends and stock-dividend percentages are deliberately not inferred
  // from generic dividend concepts: those do not establish a conversion ratio.
  if(!/StockSplitConversionRatio/.test(concept))continue;
  for(const p of fact.units?.pure||[]){
   if(!p.end||!p.filed||p.filed>knowledgeAsOf||p.end>knowledgeAsOf||!finite(p.val)||p.val<=0||p.val===1||lag(p.filed,p.end)<0||lag(p.filed,p.end)>280||p.start&&Math.abs(lag(p.end,p.start))>31)continue;
   events.push({id:`sec:${p.end}:${p.val}`,date:p.end,ratio:p.val,type:p.val<1?'reverse_split':'split',known_at:p.filed,source:data.provider==='OpenDART'?'OpenDART XBRL':'SEC XBRL',url:sourceURL(data.cik,p),accn:p.accn,concept});
  }
 }
 return events;
}
export function splitLedger(data,feed=null,policy={}){
 const knowledge=policy.knowledge_as_of||data.asOf;
 const eventKnowledge=policy.mode!=='point_in_time'&&policy.target_share_basis>knowledge?policy.target_share_basis:knowledge;
 const sec=secSplitEvents(data,eventKnowledge),external=(feed?.events||[]).filter(e=>e.known_at&&e.known_at<=eventKnowledge);
 const events=[],nonShareActions=[];
 const add=e=>{
  const classification=verifiedNonShareAction(data,e,eventKnowledge);
  if(classification){nonShareActions.push({...classification,vendor_event:{...e},share_basis_effect:'none'});return;}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!finite(e.ratio)||e.ratio<=0||e.ratio===1||e.type==='cash_dividend')return;
  const exact=events.find(x=>x.date===e.date&&x.ratio===e.ratio);
  if(exact){exact.sources.push(e);exact.known_at=exact.known_at<e.known_at?exact.known_at:e.known_at;return;}
  events.push({...e,id:`${e.date}:${e.ratio}`,sources:[e],unresolved:!allowedTypes.has(e.type)});
 };
 // SEC context end dates can be announcement/record dates, not trading dates.
 // Use the external event date only when there is one unambiguous ratio/date
 // candidate; preserve the original SEC contexts as evidence, not extra splits.
 external.forEach(add);
 for(const e of sec){
  const matches=events.filter(x=>x.sources.some(s=>s.source!=='SEC XBRL')&&x.ratio===e.ratio&&Math.abs(lag(x.date,e.date))<=90);
  if(matches.length===1){const match=matches[0];if(match.type==='unclassified_action'){match.type=e.type;match.unresolved=false;}match.sources.push(e);match.known_at=match.known_at<e.known_at?match.known_at:e.known_at;continue;}
  if(matches.length>1)matches.forEach(x=>x.unresolved=true);
  add(e);
 }
 // Repeated nearby SEC-only dates may describe one announcement/payment pair.
 // Without a corroborating date, do not compound them as two genuine events.
 for(const e of events)if(e.sources.every(s=>s.source==='SEC XBRL')&&events.some(other=>other!==e&&other.ratio===e.ratio&&Math.abs(lag(other.date,e.date))<=90&&other.sources.every(s=>s.source==='SEC XBRL')))e.unresolved=true;
 for(const event of events)if(events.some(e=>e!==event&&e.date===event.date&&e.ratio!==event.ratio))event.unresolved=true;
 return {events:events.sort((a,b)=>a.date.localeCompare(b.date)),non_share_actions:nonShareActions,feed_status:feed?.status||'unavailable',knowledge_as_of:knowledge,event_knowledge_as_of:eventKnowledge};
}
const close=(a,b,key)=>Math.abs(a-b)<=Math.max(isShares(key)?1:.011,Math.abs(b)*(isShares(key)?.01:.005));
const periodKey=p=>`${p.start||''}:${p.end}:${p.concept||''}:${p.unit||''}`;
const companion=key=>({eps_basic:'shares_basic',eps_diluted:'shares_diluted',shares_basic:'eps_basic',shares_diluted:'eps_diluted'})[key];
const worst=list=>list.includes('unresolved')?'unresolved':list.includes('inferred')?'inferred':'confirmed';
export function combineBasis(inputs){
 const infos=inputs.map(p=>p.normalization).filter(Boolean);
 if(!infos.length)return undefined;
 return {basis_status:worst(infos.map(x=>x.basis_status)),target_share_basis:infos[0].target_share_basis,knowledge_as_of:infos[0].knowledge_as_of,derived:true,inputs:infos.map(x=>({basis_status:x.basis_status,factor:x.factor,events:x.events}))};
}
export function normalizeShareSeries(series,ledger,policy={}){
 const knowledge=policy.knowledge_as_of||ledger.knowledge_as_of;
 const target=policy.target_share_basis||knowledge,mode=policy.mode||'current';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(knowledge)||!/^\d{4}-\d{2}-\d{2}$/.test(target)||(mode==='point_in_time'&&target>knowledge))throw Error('Point-in-time share basis must not be later than the knowledge cutoff.');
 const eventKnowledge=mode==='current'&&target>knowledge?target:knowledge;
 if(!['current','point_in_time'].includes(mode))throw Error('Unknown share-basis mode.');
 // Historical knowledge excludes facts/events learned later, even if their
 // economic period was earlier. An explicit target may be earlier than that.
 const eligible={...series};
 for(const key of shareKeys)eligible[key]=(series[key]||[]).filter(p=>p.end<=knowledge&&(!p.filed||p.filed<=knowledge)).map(p=>({...p,val:p.reported_value??p.val}));
 const groups={};
 for(const key of shareKeys){groups[key]=new Map();for(const p of eligible[key]){const id=periodKey(p);if(!groups[key].has(id))groups[key].set(id,[]);groups[key].get(id).push(p);}}
 function resolve(p,key,event){
  if(event.unresolved)return {state:'unresolved',reflected:null,evidence:'Conflicting or unsupported corporate action'};
  // Explicit filing-disclosure annotations can resolve stock dividends and
  // split-like recapitalizations without pretending they are cash dividends.
  const explicit=p.share_basis?.[event.id];
  if(typeof explicit==='boolean')return {state:'confirmed',reflected:explicit,evidence:'Source disclosure annotation'};
  if(p.publication_date_unknown)return {state:'unresolved',reflected:null,evidence:'Original publication date is unknown; retrieval date is not split-basis evidence'};
  if(!p.filed)return {state:'unresolved',reflected:null,evidence:'Missing filing date and no basis disclosure'};
  if(p.filed<event.date)return {state:'inferred',reflected:false,evidence:'Filed before the effective split date'};
  const candidates=(groups[key].get(periodKey(p))||[]).filter(q=>!q.publication_date_unknown&&q.filed&&q.filed<event.date&&q.end<event.date&&q!==p).sort((a,b)=>b.filed.localeCompare(a.filed));
  const before=candidates[0];
  if(!before||before.val===0||p.val===0)return {state:'inferred',reflected:true,evidence:'Post-event filing chronology; no direct comparable basis evidence'};
  const intervening=ledger.events.filter(e=>e.date>before.filed&&e.date<=p.filed);
  if(intervening.length>1){
   let product=1;const matches=[];
   for(let index=0;index<=intervening.length;index++){
    if(index)product*=intervening[index-1].ratio;
    if(close(p.val,isShares(key)?before.val*product:before.val/product,key))matches.push(index);
   }
   if(matches.length!==1)return {state:'unresolved',reflected:null,evidence:'Multi-event comparative revisions have ambiguous or contradictory bases'};
   return {state:'inferred',reflected:intervening.findIndex(e=>e.id===event.id)<matches[0],evidence:'Same-period revision matches a cumulative event basis'};
  }
  const expected=isShares(key)?before.val*event.ratio:before.val/event.ratio;
  const adjusted=close(p.val,expected,key),unchanged=close(p.val,before.val,key);
  if(adjusted===unchanged)return {state:adjusted?'inferred':'unresolved',reflected:adjusted?true:null,evidence:adjusted?'Rounding makes the basis ambiguous; chronology inference':'Same-period revisions do not reconcile to the split ratio'};
  let corroborated=false;
  const other=companion(key);
  if(other){const prior=eligible[other].find(q=>q.start===before.start&&q.end===before.end&&q.accn===before.accn),later=eligible[other].find(q=>q.start===p.start&&q.end===p.end&&q.accn===p.accn);
   if(prior&&later&&prior.val!==0){const expectedOther=adjusted?(isShares(other)?prior.val*event.ratio:prior.val/event.ratio):prior.val;corroborated=close(later.val,expectedOther,other);}}
  return {state:corroborated?'confirmed':'inferred',reflected:adjusted,evidence:corroborated?'Same-period EPS and share-count observations corroborate basis':adjusted?'Same-period per-share revision matches split ratio':'Same-period observation retains pre-split basis'};
 }
 const result={...eligible};
 for(const key of shareKeys)result[key]=eligible[key].map(p=>{
  // Always recompute from a retained reported value, making normalization
  // idempotent even if callers pass previously normalized observations.
  const reported=p.reported_value??p.val,original={...p,val:reported};
  let factor=1;const decisions=[];
  for(const event of ledger.events){
   if(event.known_at>eventKnowledge)continue;
   const wanted=event.date<=target;
   // Events before both period and target cannot change this observation's
   // basis. Periods crossing an event still need a filing/disclosure decision.
   if(p.start&&p.start>event.date&&wanted)continue;
   const decision=resolve(original,key,event);decisions.push({id:event.id,date:event.date,ratio:event.ratio,type:event.type,...decision});
   if(decision.reflected===null)continue;
   if(wanted&&!decision.reflected)factor*=event.ratio;
   if(!wanted&&decision.reflected)factor/=event.ratio;
  }
  const status=worst(decisions.map(d=>d.state));
  return {...p,reported_value:reported,val:status==='unresolved'?NaN:isShares(key)?reported*factor:reported/factor,normalization:{version:1,basis_status:status,knowledge_as_of:knowledge,target_share_basis:target,mode,factor,events:decisions,feed_status:ledger.feed_status}};
 });
 return {series:result,policy:{knowledge_as_of:knowledge,target_share_basis:target,event_knowledge_as_of:eventKnowledge,mode},events:ledger.events,feed_status:ledger.feed_status};
}
