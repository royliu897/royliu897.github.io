import {INGESTION_VERSION,HISTORY_START,submissionRows,selectPrimaryFilings,compileInlineFiling,compileLegacyFiling,combinePrimarySupplements,validateFiling} from './primary-ingestion-core.mjs';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const terminal=new Set(['ready','partial','unsupported','failed']);
const fail=(message,status=502)=>Object.assign(Error(message),{status});
const maxSourceBytes=16000000;
async function packed(value){return new Uint8Array(await new Response(new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());}
async function unpacked(value){return value?JSON.parse(await new Response(new Blob([value]).stream().pipeThrough(new DecompressionStream('gzip'))).text()):null;}
async function limitedText(response,limit){
 const reader=response.body?.getReader();if(!reader)return '';const decoder=new TextDecoder();let text='',size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw fail('SEC source exceeds extraction size limit',413);}text+=decoder.decode(value,{stream:true});}return text+decoder.decode();
}

// One persistent, alarm-driven queue per issuer. Network waits never keep the
// browser's report request open, and interrupted work resumes from storage.
export class FilingIngestionObject {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.cache=null;this.busy=false;this.ready=ctx.blockConcurrencyWhile(async()=>{this.meta=await ctx.storage.get('meta')||{revision:0,documents:{},queue:[],failures:[]};});}
 async save(){await this.ctx.storage.put('meta',this.meta);}
 async schedule(ms=100){const existing=await this.ctx.storage.getAlarm();if(!existing||existing>Date.now()+ms)await this.ctx.storage.setAlarm(Date.now()+ms);}
 async source(url,{jsonBody=false,sec=true}={}){
  const u=new URL(url);
  if(sec&&!['www.sec.gov','data.sec.gov'].includes(u.hostname))throw fail('Unapproved SEC source',400);
  if(sec&&this.env.UPSTREAM_LIMIT&&!(await this.env.UPSTREAM_LIMIT.limit({key:'sec'})).success)throw fail('SEC request budget is temporarily exhausted',429);
  const response=await fetch(url,{headers:{'User-Agent':this.env.SEC_USER_AGENT,Accept:jsonBody?'application/json':'text/html,application/xml'},redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw fail('SEC source unavailable ('+response.status+')',response.status===429?429:response.status===404?404:502);
  const text=await limitedText(response,jsonBody?25000000:maxSourceBytes);
  if(!jsonBody)return text;
  try{return JSON.parse(text);}catch{throw fail('Unexpected SEC JSON response');}
 }
 async fetch(request){
  await this.ready;const u=new URL(request.url),cik=u.searchParams.get('cik'),ticker=u.searchParams.get('ticker'),since=Number(u.searchParams.get('since')||0);
  if(request.method!=='GET'||!/^\d{1,10}$/.test(cik||'')||Number(cik)<=0||!/^[-A-Z0-9.^]{1,24}$/.test(ticker||'')||!Number.isSafeInteger(since)||since<0)return json({error:'Invalid filing ingestion request'},400);
  if(this.meta.cik&&this.meta.cik!==String(Number(cik)))return json({error:'Ingestion issuer identity mismatch'},400);
  if(this.meta.profile&&!this.meta.profile.tickers.includes(ticker))return json({error:'Ticker does not match this SEC company'},400);
  this.meta.cik=String(Number(cik));this.meta.requested_ticker=ticker;
  if(this.meta.version!==INGESTION_VERSION||!this.meta.phase||terminal.has(this.meta.status)&&Date.now()-this.meta.checked_at>=300000){
   if(this.meta.version!==INGESTION_VERSION)this.meta.seed_checked=false;this.meta.discovery=null;this.meta.version=INGESTION_VERSION;this.meta.phase='plan';this.meta.status='queued';await this.save();await this.schedule();
  }else if(!terminal.has(this.meta.status))await this.schedule(Math.max(100,(this.meta.retry_at||0)-Date.now()));
  const body={cik:this.meta.cik,ingestion:this.status()};
  if(this.meta.revision>since){const snapshot=await this.snapshot();if(snapshot)body.supplement=snapshot;}
  return json(body);
 }
 status(){
  const m=this.meta,failures=(m.selected||[]).filter(a=>['unsupported','failed'].includes(m.documents[a]?.status)&&!m.queue?.some(f=>f.accession===a)).map(accession=>({accession,reason:m.documents[accession].reason})),status=terminal.has(m.status)&&!['unsupported','failed'].includes(m.status)&&failures.length?'partial':m.status,active=!terminal.has(status),retry=Math.max(0,(m.retry_at||0)-Date.now());
  return {version:INGESTION_VERSION,status:status||'queued',revision:m.revision,completed:m.completed||0,total:m.total||0,failed:failures.length,retrieval_failures:failures.slice(0,24),checked_at:m.checked_at?new Date(m.checked_at).toISOString():null,latest_period:m.latest_period||null,poll_after_ms:active?Math.max(2500,Math.min(60000,retry)):300000,...(retry?{retry_at:new Date(m.retry_at).toISOString()}:{}),scope:'Automatic primary filings; unresolved mappings remain blank.'};
 }
 async bootstrap(){
  if(this.meta.seed_checked)return;
  this.meta.seed_checked=true;
  try{
   const root=this.env.SITE_ORIGIN+'/assets/report/data/filings/',manifest=await this.source(root+'manifest.json',{jsonBody:true,sec:false}),entry=manifest.companies?.[this.meta.cik];
   if(!entry||!new RegExp('^CIK'+this.meta.cik+'-[a-f0-9]{16}\\.json$').test(entry.file))return;
   const seed=await this.source(root+entry.file,{jsonBody:true,sec:false});
   if(seed.ingestion_version!==INGESTION_VERSION)return;
   combinePrimarySupplements([seed],this.meta.cik);await this.ctx.storage.put('seed',await packed(seed));
   for(const s of seed.sources||[])if(Object.keys(s.selected_statements||s.statement_evidence||{}).length===3)this.meta.documents[s.accession]={status:'seeded',version:INGESTION_VERSION};
   this.meta.revision++;this.cache=null;
  }catch{/* A prebuilt seed is an optimization, never required for discovery. */}
 }
 async plan(){
  const cik=this.meta.cik,padded=cik.padStart(10,'0'),data=await this.source('https://data.sec.gov/submissions/CIK'+padded+'.json',{jsonBody:true});
  if(String(Number(data.cik))!==cik)throw fail('SEC submissions issuer mismatch',400);
  const tickers=(data.tickers||[]).filter(t=>/^[-A-Z0-9.^]{1,24}$/.test(t));
  this.meta.profile={cik,tickers,name:data.name||'',industry:data.sicDescription||'',ticker:tickers.includes(this.meta.requested_ticker)?this.meta.requested_ticker:tickers[0]||this.meta.requested_ticker};
  const filings=submissionRows(data.filings?.recent||{},cik),archives=(data.filings?.files||[]).filter(a=>a.filingTo>=HISTORY_START+'-01-01').sort((a,b)=>b.filingTo.localeCompare(a.filingTo)).slice(0,10);
  this.meta.discovery={filings,archives};this.meta.phase='archives';this.meta.status='processing';this.meta.plan_attempts=0;await this.save();
  if(!archives.length)await this.finishPlan();
 }
 async discoverArchive(){
  const d=this.meta.discovery,padded=this.meta.cik.padStart(10,'0');
  if(!d?.archives.length||d.filings.filter(f=>['10-K','20-F','40-F'].includes(f.form)).length>=22){await this.finishPlan();return;}
  const a=d.archives[0];
  if(new RegExp('^CIK'+padded+'-submissions-\\d+\\.json$').test(a.name)){
   const older=await this.source('https://data.sec.gov/submissions/'+a.name,{jsonBody:true});d.filings.push(...submissionRows(older,this.meta.cik));
  }
  d.archives.shift();this.meta.plan_attempts=0;await this.save();if(!d.archives.length)await this.finishPlan();
 }
 async finishPlan(){
  const filings=this.meta.discovery?.filings||[];
  const selected=selectPrimaryFilings(filings,new Date().toISOString().slice(0,10));
  await this.bootstrap();
  this.meta.selected=selected.map(f=>f.accession);this.meta.queue=selected.filter(f=>this.meta.documents[f.accession]?.version!==INGESTION_VERSION||!(['ready','seeded','unsupported'].includes(this.meta.documents[f.accession]?.status)||this.meta.documents[f.accession]?.status==='failed'&&this.meta.documents[f.accession].retry_at>Date.now()));
  this.meta.total=selected.length;this.meta.completed=selected.length-this.meta.queue.length;this.meta.latest_period=selected.map(f=>f.period).sort().at(-1)||null;this.meta.checked_at=Date.now();this.meta.failures=selected.filter(f=>['unsupported','failed'].includes(this.meta.documents[f.accession]?.status)&&!this.meta.queue.some(q=>q.accession===f.accession)).map(f=>({accession:f.accession,reason:this.meta.documents[f.accession].reason}));this.meta.plan_attempts=0;this.meta.retry_at=null;this.meta.phase='documents';delete this.meta.discovery;
  this.meta.status=!selected.length?'unsupported':this.meta.queue.length?'processing':this.meta.failures.length?'partial':'ready';await this.save();
 }
 async sourcePart(filing,kind,url,jsonBody=false){
  const key='source:'+filing.accession+':'+kind,stored=await this.ctx.storage.get(key);if(stored)return unpacked(stored);
  const value=await this.source(url,{jsonBody}),body=await packed(value);if(body.byteLength>1900000)throw Object.assign(fail('Legacy component exceeds storage limit',413),{permanent:true});
  await this.ctx.storage.put(key,body);filing.component_keys=[...new Set([...(filing.component_keys||[]),key])];await this.save();return value;
 }
 async clearParts(filing){for(const key of filing.component_keys||[])await this.ctx.storage.delete(key);delete filing.component_keys;}
 async legacy(filing,html,hash){
  const htmlKey='source:'+filing.accession+':html';if(!(filing.component_keys||[]).includes(htmlKey)){const body=await packed(html);if(body.byteLength>1900000)throw Object.assign(fail('Legacy filing exceeds transient storage limit',413),{permanent:true});await this.ctx.storage.put(htmlKey,body);filing.component_keys=[...(filing.component_keys||[]),htmlKey];await this.save();}
  const root=filing.url.slice(0,filing.url.lastIndexOf('/')+1),index=await this.sourcePart(filing,'index',root+'index.json',true),names=(index.directory?.item||[]).map(i=>i.name).filter(n=>/^[-A-Za-z0-9_.]+$/.test(n));
  const unique=(items,kind)=>{if(items.length!==1)throw Object.assign(Error('Ambiguous or missing legacy '+kind+' component'),{permanent:true});return items[0];};
  const files={instance:unique(names.filter(n=>/\.xml$/i.test(n)&&!/(?:_(?:cal|def|lab|pre|ref)|FilingSummary|^R\d+)\.xml$/i.test(n)),'instance'),pre:unique(names.filter(n=>/_pre\.xml$/i.test(n)),'presentation'),lab:unique(names.filter(n=>/_lab\.xml$/i.test(n)),'labels'),schema:unique(names.filter(n=>/\.xsd$/i.test(n)),'schema')},inputs={},proof={html:{url:filing.url,sha256:hash}};
  for(const[kind,name]of Object.entries(files)){inputs[kind]=await this.sourcePart(filing,kind,root+name);proof[kind]={url:root+name,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(inputs[kind])))].map(v=>v.toString(16).padStart(2,'0')).join('')};}
  return compileLegacyFiling(inputs,this.meta.profile,filing,html,hash,proof).result;
 }
 async processDocument(){
  const filing=this.meta.queue[0];if(!filing)return;
  validateFiling(filing,this.meta.cik);
  try{
   const savedHtml=await this.ctx.storage.get('source:'+filing.accession+':html'),source=savedHtml?await unpacked(savedHtml):await this.source(filing.url),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source)))].map(v=>v.toString(16).padStart(2,'0')).join('');
   let compiled;try{compiled=compileInlineFiling(source,this.meta.profile,filing,hash).result;}catch(e){if((/Requested issuer\/period not found/.test(e.message)&&!/<(?:[\w.-]+:)?nonfraction\b/i.test(source))||/No unambiguous primary/.test(e.message))compiled=await this.legacy(filing,source,hash);else{e.permanent=true;throw e;}}
   const body=await packed(compiled);if(body.byteLength>1900000)throw Object.assign(fail('Compiled filing exceeds storage limit',413),{permanent:true});
   await this.ctx.storage.put('document:'+filing.accession,body);
   this.meta.documents[filing.accession]={status:'ready',version:INGESTION_VERSION,source_sha256:hash};await this.clearParts(filing);this.meta.queue.shift();this.meta.completed++;this.meta.revision++;this.meta.retry_at=null;this.cache=null;
  }catch(e){
   if(e.status===429){this.meta.status='retrying';this.meta.retry_at=Date.now()+61000;await this.save();return;}
   filing.attempts=(filing.attempts||0)+1;
   if(!e.permanent&&filing.attempts<3&&e.status!==404){this.meta.status='retrying';this.meta.retry_at=Date.now()+Math.min(60000,5000*2**filing.attempts);await this.save();return;}
   await this.clearParts(filing);this.meta.failures.push({accession:filing.accession,reason:e.message});this.meta.documents[filing.accession]={...this.meta.documents[filing.accession],status:e.permanent?'unsupported':'failed',retry_at:Date.now()+3600000,version:INGESTION_VERSION,reason:e.message};this.meta.queue.shift();this.meta.completed++;this.meta.retry_at=null;
  }
  this.meta.status=this.meta.queue.length?'processing':this.meta.failures.length?'partial':'ready';await this.save();
 }
 async alarm(){
  await this.ready;if(this.busy){await this.schedule(1000);return;}this.busy=true;
  try{
   if(this.meta.retry_at>Date.now()){await this.schedule(this.meta.retry_at-Date.now());return;}
   if(this.meta.phase==='plan'||this.meta.phase==='archives'){
    try{if(this.meta.phase==='plan')await this.plan();else await this.discoverArchive();}catch(e){this.meta.plan_attempts=(this.meta.plan_attempts||0)+(e.status===429?0:1);this.meta.status=e.status===400||this.meta.plan_attempts>=5?'failed':'retrying';this.meta.last_error=e.message;if(this.meta.status==='failed')this.meta.checked_at=Date.now();this.meta.retry_at=Date.now()+(e.status===429?61000:30000);await this.save();}
   }else if(this.meta.queue.length)await this.processDocument();
  }finally{this.busy=false;if(!terminal.has(this.meta.status))await this.schedule(Math.max(300,(this.meta.retry_at||0)-Date.now()));}
 }
 async snapshot(){
  if(this.cache?.revision===this.meta.revision)return this.cache.result;
  const parts=[],seed=await unpacked(await this.ctx.storage.get('seed'));if(seed)parts.push(seed);
  for(const accession of this.meta.selected||[]){const value=await this.ctx.storage.get('document:'+accession);if(value){const part=await unpacked(value);if(part)parts.push(part);}}
  if(!parts.length)return null;
  const result=combinePrimarySupplements(parts,this.meta.cik);this.cache={revision:this.meta.revision,result};return result;
 }
}
