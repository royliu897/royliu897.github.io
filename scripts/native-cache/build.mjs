// Build raw normalized primary-source fallback caches, never derived reports.
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {normalizeTaiwanStatement} from '../../sec-worker/taiwan-financials.mjs';
import {normalizeDartStatement,mergeDartStatements} from '../../sec-worker/dart-financials.mjs';
const args=Object.fromEntries(Array.from({length:Math.ceil((process.argv.length-2)/2)},(_,i)=>[process.argv[2+i*2],process.argv[3+i*2]]));
const external=args['--external-root'],foreign=args['--foreign-root'],output=args['--output']||new URL('../../assets/report/data/native-filings/',import.meta.url).pathname,known=args['--as-of']||new Date().toISOString().slice(0,10),fixtures=new URL('../../tests/fixtures/',import.meta.url),manifest={version:1,known_at:known,companies:{}},results=[];
const taiwanDirectory=JSON.parse(await readFile(new URL('../../sec-worker/data/taiwan-directory.json',import.meta.url),'utf8')),koreaDirectory=JSON.parse(await readFile(new URL('../../sec-worker/data/dart-directory.json',import.meta.url),'utf8'));
const parse=async path=>JSON.parse(await readFile(path,'utf8')),hash=text=>createHash('sha256').update(text).digest('hex');
await mkdir(output,{recursive:true});
function validateSources(data,profile){
 for(const fact of Object.values(data.facts||{}))for(const points of Object.values(fact.units||{}))for(const p of points){
  const url=new URL(p.source_url);
  if(data.provider==='Taiwan MOPS'){
   if(!['mopsov.twse.com.tw','mops.twse.com.tw'].includes(url.hostname)||url.searchParams.get('co_id')!==profile.ticker||p.consolidation!=='CFS')throw Error('MOPS source identity mismatch');
  }else if(url.hostname!=='englishdart.fss.or.kr'||url.searchParams.get('rcpNo')!==p.accn||!/^\d{14}$/.test(p.accn)||p.consolidation!=='CFS')throw Error('DART source identity mismatch');
 }
}
async function publish(symbol,profile,statements,inputs,currentShares){
 const tw=symbol.startsWith('TWSE:'),ticker=symbol.split(':')[1],provider=tw?'Taiwan MOPS':'OpenDART',facts=mergeDartStatements(statements),sources=[...new Map(statements.flatMap(s=>s.sources||[]).map(s=>[[s.accession,s.period].join('|'),s])).values()];
 if(tw)for(const fact of Object.values(facts))for(const points of Object.values(fact.units))for(const p of points)Object.assign(p,{filed:known,known_at:known,publication_date_unknown:true});
 if(tw)for(const source of sources)Object.assign(source,{date:known,publication_date_unknown:true});
 const data={cache_version:1,cache_known_at:known,native_symbol:symbol,cik:tw?'TWSE'+ticker:'DART'+profile.corp_code,provider,asOf:known,fetchedAt:known+'T00:00:00.000Z',entityName:profile.name,native_profile:{...profile,native:true,provider},history_periods:[],facts,source_coverage:{status:'partial',cached_snapshot:true,cache_known_at:known,sources,unavailable_periods:[],conflicts:statements.flatMap(s=>s.conflicts||[]),excluded_contexts:statements.reduce((n,s)=>n+(s.excluded_contexts||0),0),scope:'Last-good cached consolidated primary statement snapshots through '+sources.map(s=>s.period).sort().at(-1)+'. Live upstream statements are unavailable; only cached reports and their comparative periods are included. '+(tw?'Original publication times are unknown; the cache acquisition date is used as conservative knowledge time.':'Original DART receipt dates are retained.')},cache_inputs:inputs};
 if(currentShares?.status==='available'&&Number.isSafeInteger(currentShares.common_outstanding)&&currentShares.common_outstanding>0&&typeof currentShares.multiple_classes==='boolean'&&sources.some(s=>s.period===currentShares.asOf)&&currentShares.asOf<=known&&/^https:\/\/englishdart\.fss\.or\.kr\//.test(currentShares.source_url||''))data.current_shares=currentShares;
 validateSources(data,profile);const text=JSON.stringify(data),sha256=hash(text),file=symbol.replace(':','-')+'-'+sha256.slice(0,16)+'.json';await writeFile(output+'/'+file,text);
 manifest.companies[symbol]={symbol,cik:data.cik,provider,file,sha256,known_at:known,latest_period:sources.map(s=>s.period).sort().at(-1)};results.push({symbol,file,bytes:Buffer.byteLength(text),source_reports:sources.length,concepts:Object.keys(facts).length,current_shares:data.current_shares?.status||'unavailable'});
}
const tsmProfile={...taiwanDirectory.find(p=>p.ticker==='2330'),currency:'TWD',quote_symbol:'2330.TW'};const tsmStatements=[],tsmInputs=[];
for(const [name,year]of [['mops-tsmc-2015.xml',2015],['mops-tsmc-2025.xhtml',2025]]){const raw=await readFile(new URL(name,fixtures),'utf8');tsmStatements.push(normalizeTaiwanStatement(raw,tsmProfile,year,4,known));tsmInputs.push({input_name:name,sha256:hash(raw),kind:'Official MOPS source document'});}
await publish('TWSE:2330',tsmProfile,tsmStatements,tsmInputs);
for(const [ticker,names]of [['000660',['dart-hynix-2025.json','dart-hynix-2026-h1.json']],['005930',['dart-samsung-2026-h1.json']]]){
 const profile={...koreaDirectory.find(p=>p.ticker===ticker),fiscal_month:'12',quote_symbol:ticker+'.KS'},statements=[],inputs=[];
 for(const name of names){const raw=await readFile(new URL(name,fixtures),'utf8'),value=JSON.parse(raw),first=value.list?.[0];statements.push(normalizeDartStatement(value,profile,Number(first.bsns_year),first.reprt_code,known));inputs.push({input_name:name,sha256:hash(raw),kind:'Official OpenDART statement response'});}
 if(foreign&&ticker==='005930')try{const name='samsung-2025-annual.json',raw=await readFile(foreign+'/'+name,'utf8'),value=JSON.parse(raw),first=value.list?.[0];statements.push(normalizeDartStatement(value,profile,Number(first.bsns_year),first.reprt_code,known));inputs.push({input_name:name,sha256:hash(raw),kind:'Official OpenDART statement response'});}catch(error){if(error.code!=='ENOENT')throw error;}
 let currentShares;
 if(foreign&&ticker==='000660')try{const value=await parse(foreign+'/hynix-live-facts.json');if(value.cik==='DART'+profile.corp_code&&value.provider==='OpenDART')currentShares=value.current_shares;}catch{}
 await publish('KRX:'+ticker,profile,statements,inputs,currentShares);
}
if(external)for(const symbol of ['TWSE:2317','TWSE:2454','KRX:005380','KRX:051910']){
 const id=symbol.replace(':','-'),profile=await parse(external+'/'+id+'-profile.json'),raw=await readFile(external+'/'+id+'-statement.json','utf8'),value=JSON.parse(raw),tw=symbol.startsWith('TWSE:'),first=value.list?.[0],statement=tw?value:normalizeDartStatement(value,profile,Number(first.bsns_year),first.reprt_code,known);
 await publish(symbol,profile,[statement],[{input_name:id+'-statement.json',sha256:hash(raw),kind:tw?'Normalized official MOPS primary-statement response':'Official OpenDART statement response'}]);
}
await writeFile(output+'/manifest.json.tmp',JSON.stringify(manifest));await rename(output+'/manifest.json.tmp',output+'/manifest.json');console.log(JSON.stringify({known_at:known,results},null,2));
