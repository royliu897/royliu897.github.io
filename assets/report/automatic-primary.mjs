import {LruCache} from './lru-cache.mjs?v=e0a27133a6e6';
import {mergePrimaryFilings} from './primary-filing-supplement.mjs?v=e0a27133a6e6';

const states=new LruCache(6),active=new Set(['queued','processing','retrying']);
export async function supplementAutomaticPrimary(data,record,request){
 const key=String(Number(record.cik))+':'+record.ticker;
 let state=states.get(key);if(!state){state={revision:0,last:0,meta:null,supplement:null};states.set(key,state);}
 const ttl=state.error?15000:active.has(state.meta?.status)?2000:300000;
 if(!state.last||Date.now()-state.last>=ttl){
  if(!state.pending)state.pending=(async()=>{
   try{
    const path='/company/CIK'+Number(record.cik)+'/primary-filings?ticker='+encodeURIComponent(record.ticker)+'&since='+state.revision,status=await request(path+'&status=1',0,10000);
    let value=status;
    if(status.ingestion?.revision>state.revision){value=await request(path,0,10000);if(!value.supplement)throw Error('Changed snapshot unavailable');}
    if(String(Number(value.cik))!==String(Number(record.cik))||!value.ingestion||!Number.isSafeInteger(value.ingestion.revision)||value.ingestion.revision<state.revision)throw Error('Automatic filing snapshot identity/revision mismatch');
    if(value.supplement){if(value.supplement.schema_version!==1||String(Number(value.supplement.cik))!==String(Number(record.cik)))throw Error('Automatic filing snapshot issuer mismatch');const merged=mergePrimaryFilings(data,value.supplement,record);state.supplement=value.supplement;state.merged=merged;state.base=data;state.mergedSupplement=value.supplement;}
    state.meta=value.ingestion;state.revision=value.ingestion.revision;state.error=false;
   }catch{state.error=true;state.meta={...state.meta,status:'retrying',poll_after_ms:15000};}
   finally{state.last=Date.now();state.pending=null;}
  })();
  await state.pending;
 }
 let enriched=data;
 if(state.supplement){try{if(state.base!==data||state.mergedSupplement!==state.supplement){state.merged=mergePrimaryFilings(data,state.supplement,record);state.base=data;state.mergedSupplement=state.supplement;}enriched=state.merged;}catch{state.error=true;state.meta={...state.meta,status:'retrying',poll_after_ms:15000};}}
 return {...enriched,primary_ingestion:{...state.meta,...(state.error?{using_last_good:true}:{})}};
}
export function reportRefetchInterval(query){
 const data=query?.state?.data||query,info=data?.financials?.primary_ingestion;
 return info?Math.max(2500,Math.min(300000,Number(info.poll_after_ms)||300000)):false;
}
