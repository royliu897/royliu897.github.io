import {validReportDate} from './report-dates.mjs?v=d4f1839989bb';
const patterns={TWSE:/^TWSE:\d{4,6}$/,KRX:/^KRX:\d{6}$/};
function identity(symbol,entry,data){
 const [exchange,ticker]=String(symbol).split(':');
 if(!patterns[exchange]?.test(symbol)||entry?.symbol!==symbol||data?.native_symbol!==symbol||entry.cik!==data.cik||entry.provider!==data.provider)return false;
 if(exchange==='TWSE')return data.provider==='Taiwan MOPS'&&data.cik==='TWSE'+ticker&&data.native_profile?.ticker===ticker;
 return data.provider==='OpenDART'&&/^DART\d{8}$/.test(data.cik)&&data.cik==='DART'+data.native_profile?.corp_code&&data.native_profile?.ticker===ticker;
}
export function selectNativeFilingCache(manifest,symbol,data,knowledge=new Date().toISOString().slice(0,10)){
 const entry=manifest?.companies?.[symbol];
 if(manifest?.version!==1||!validReportDate(knowledge)||!identity(symbol,entry,data)||data.cache_version!==1||!validReportDate(data.asOf)||!validReportDate(data.cache_known_at)||data.cache_known_at!==entry.known_at||data.cache_known_at>data.asOf||data.asOf>knowledge||data.cache_known_at>knowledge||!data.facts||typeof data.facts!=='object'||Array.isArray(data.facts))return null;
 // Individual filing dates remain the knowledge filter. MOPS has unknown
 // publication times and is conservatively dated at snapshot acquisition.
 const facts={};let observations=0;
 for(const [name,fact]of Object.entries(data.facts)){
  if(!fact||typeof fact!=='object'||!fact.units||typeof fact.units!=='object')return null;
  const units={};
  for(const [unit,points]of Object.entries(fact.units)){
   if(!Array.isArray(points))return null;
   for(const p of points)if(!validReportDate(p.end)||!validReportDate(p.filed)||p.end>data.asOf||p.filed>data.asOf||p.start&&(!validReportDate(p.start)||p.start>p.end)||p.end>p.filed||!Number.isFinite(p.val))return null;
   observations+=points.length;units[unit]=points.map(p=>({...p}));
  }
  facts[name]={...fact,units};
 }
 if(!observations)return null;
 return {...data,facts,history_periods:[],source_coverage:{...data.source_coverage,status:'partial',cached_snapshot:true,cache_known_at:data.cache_known_at,scope:data.source_coverage?.scope||'Last-good cached primary statement snapshots; current upstream statements are unavailable. Coverage is limited to the cached reports.'}};
}
let manifestPromise,retryAt=0;const pending=new Map(),failedUntil=new Map();
const sha256=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('');
export async function loadNativeFilingCache(symbol,fetcher=fetch){
 if(!Object.values(patterns).some(re=>re.test(symbol))||Date.now()<retryAt)return null;
 try{
  manifestPromise??=fetcher(String(new URL('./data/native-filings/manifest.json',import.meta.url)),{signal:AbortSignal.timeout(5000)}).then(async r=>{if(!r.ok)throw Error('Native statement cache unavailable');return r.json();}).catch(error=>{manifestPromise=undefined;retryAt=Date.now()+60000;throw error;});
  const manifest=await manifestPromise,entry=manifest?.companies?.[symbol];
  if(!entry||entry.symbol!==symbol||!/^(?:TWSE-\d{4,6}|KRX-\d{6})-[a-f0-9]{16}\.json$/.test(entry.file||'')||!/^[a-f0-9]{64}$/.test(entry.sha256||'')||Date.now()<(failedUntil.get(entry.file)||0))return null;
  if(!entry.file.startsWith(symbol.replace(':','-')+'-'))return null;
  if(!pending.has(entry.file)){
   if(pending.size>=8)pending.delete(pending.keys().next().value);
   pending.set(entry.file,fetcher(String(new URL('./data/native-filings/'+entry.file,import.meta.url)),{signal:AbortSignal.timeout(5000)}).then(async r=>{if(!r.ok)throw Error('Native statement snapshot unavailable');const text=await r.text();if(text.length>3000000||await sha256(text)!==entry.sha256)throw Error('Native statement snapshot failed integrity check');const result=selectNativeFilingCache(manifest,symbol,JSON.parse(text));if(!result)throw Error('Native statement snapshot identity mismatch');return result;}).catch(error=>{pending.delete(entry.file);failedUntil.set(entry.file,Date.now()+60000);throw error;}));
  }
  return await pending.get(entry.file);
 }catch{return null;}
}
