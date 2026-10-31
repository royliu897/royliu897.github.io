import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {extractPrimaryInline} from '../sec-worker/primary-inline.mjs';
import {compileInlineFiling,selectPrimaryFilings,submissionRows} from '../sec-worker/primary-ingestion-core.mjs';
import {FilingIngestionObject} from '../sec-worker/filing-ingestion-object.mjs';
import {supplementAutomaticPrimary,reportRefetchInterval} from '../assets/report/automatic-primary.mjs';

const filing={accession:'0000000001-26-000001',form:'10-K',date:'2026-02-15',period:'2025-12-31',url:'https://www.sec.gov/Archives/edgar/data/1/000000000126000001/one.htm'};
const record={cik:'1',ticker:'ONE',tickers:['ONE'],name:'One',industry:''};
function document(period='2025-12-31'){
 const f=(name,value,ctx='i')=>'<tr><td>'+name+'</td><td><ix:nonFraction name="us-gaap:'+name+'" contextRef="'+ctx+'" unitRef="u">'+value+'</ix:nonFraction></td></tr>';
 return '<html xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:us-gaap="http://fasb.org/us-gaap/2025"><body><context id="i"><entity><identifier scheme="http://www.sec.gov/CIK">1</identifier></entity><period><instant>'+period+'</instant></period></context><context id="d"><entity><identifier scheme="http://www.sec.gov/CIK">1</identifier></entity><period><startDate>'+period.slice(0,4)+'-01-01</startDate><endDate>'+period+'</endDate></period></context><unit id="u"><measure>iso4217:USD</measure></unit><h2>Consolidated Balance Sheets</h2><table>'+f('Assets',1000)+f('CashAndCashEquivalentsAtCarryingValue',100)+f('LongTermDebtNoncurrent',200)+f('StockholdersEquity',500)+f('LiabilitiesAndStockholdersEquity',1000)+'</table><h2>Consolidated Statements of Income</h2><table>'+f('Revenues',500,'d')+f('NetIncomeLoss',100,'d')+f('EarningsPerShareDiluted',2,'d')+'</table></body></html>';
}
const parsed=extractPrimaryInline(document(),{record,filing}),compiled=compileInlineFiling(document(),record,filing,'a'.repeat(64)).result;
assert.equal(parsed.selected_statements.balance_sheet,0);assert.equal(parsed.selected_statements.income_statement,1);assert.equal(compiled.facts['report:PrimaryStatementDebt'].units.USD[0].val,200);assert.equal(compiled.sources[0].source_sha256,'a'.repeat(64));
assert.throws(()=>extractPrimaryInline(document().replaceAll('>1</identifier>','>2</identifier>'),{record,filing}),/issuer/);
const conflict='<context id="i"><entity><identifier scheme="http://www.sec.gov/CIK">2</identifier></entity><period><instant>2025-12-31</instant></period></context>';
assert.throws(()=>extractPrimaryInline(document().replace('</body>',conflict+'</body>'),{record,filing}),/Conflicting duplicate/);
assert.throws(()=>extractPrimaryInline(document().replace('</body>','<unit id="u"><measure>iso4217:EUR</measure></unit></body>'),{record,filing}),/Conflicting duplicate/);
const ambiguous=document().replace('</body>','<h2>Consolidated Balance Sheets</h2><table><tr><td><ix:nonFraction name="us-gaap:Assets" contextRef="i" unitRef="u">1</ix:nonFraction></td><td><ix:nonFraction name="us-gaap:LiabilitiesAndStockholdersEquity" contextRef="i" unitRef="u">1</ix:nonFraction></td></tr></table></body>');
assert.equal(extractPrimaryInline(ambiguous,{record,filing}).selected_statements.balance_sheet,undefined);
assert.equal(extractPrimaryInline(document().replace('Consolidated Balance Sheets','Schedule I · Balance Sheets · Condensed Financial Information'),{record,filing}).selected_statements.balance_sheet,undefined,'Parent-only schedules cannot establish consolidated balances');
assert.equal(submissionRows({form:['10-K'],accessionNumber:[filing.accession],filingDate:[filing.date],reportDate:[filing.period],primaryDocument:['../other.htm']},1).length,0);
assert.equal(selectPrimaryFilings([filing,{...filing,date:'2027-02-15',period:'2026-12-31',accession:'0000000001-27-000001'}],'2026-10-31').length,1);

class Storage{constructor(){this.data=new Map();this.alarm=null;}async get(k){return structuredClone(this.data.get(k));}async put(k,v){this.data.set(k,structuredClone(v));}async delete(k){return this.data.delete(k);}async getAlarm(){return this.alarm;}async setAlarm(t){this.alarm=t;}}
const storage=new Storage(),ctx={storage,blockConcurrencyWhile:fn=>fn()},requests=[],oldFetch=fetch,oldNow=Date.now;let now=Date.parse('2026-10-31T12:00:00Z'),allowed=true;
Date.now=()=>now;
const metadata={cik:1,name:'One',tickers:['ONE'],sicDescription:'Manufacturing',filings:{recent:{form:['10-K'],accessionNumber:[filing.accession],filingDate:[filing.date],reportDate:[filing.period],primaryDocument:['one.htm']},files:[]}};
globalThis.fetch=async url=>{requests.push(String(url));if(String(url).includes('/submissions/'))return Response.json(metadata);if(String(url).endsWith('/manifest.json'))return Response.json({companies:{}});if(String(url)===filing.url)return new Response(document());if(String(url).endsWith('/quarter.htm'))return new Response(document('2026-06-30'));throw Error('Unexpected source '+url);};
const env={SITE_ORIGIN:'https://royrliu.com',SEC_USER_AGENT:'Research test contact@example.com',UPSTREAM_LIMIT:{limit:async()=>({success:allowed})}},request=(since=0,ticker='ONE')=>new Request('https://internal/?cik=1&ticker='+ticker+'&since='+since);
try{
 let actor=new FilingIngestionObject(ctx,env),response=await actor.fetch(request()),body=await response.json();assert.equal(body.ingestion.status,'queued');assert.equal(body.supplement,undefined);
 actor.meta.discovery={filings:[],archives:[]};actor.meta.phase='archives';await actor.save();await actor.fetch(request());assert.equal(actor.meta.phase,'archives','Polling must not restart discovery before checked_at exists');actor.meta.phase='plan';
 await actor.alarm();assert.equal(actor.meta.status,'processing');await actor.alarm();assert.equal(actor.meta.status,'ready');
 body=await(await actor.fetch(request())).json();assert.equal(body.supplement.facts['report:PrimaryStatementDebt'].units.USD[0].val,200);assert.equal(body.ingestion.completed,1);
 const sourceCount=requests.filter(u=>u===filing.url).length;
 assert.equal((await(await actor.fetch(request(body.ingestion.revision))).json()).supplement,undefined,'Unchanged revisions do not retransfer the snapshot');
 actor=new FilingIngestionObject(ctx,env);body=await(await actor.fetch(request())).json();assert.ok(body.supplement);assert.equal(requests.filter(u=>u===filing.url).length,sourceCount,'A restarted object serves persistent processed data without re-fetching filings');
 assert.equal((await actor.fetch(request(0,'OTHER'))).status,400);
 now+=300001;metadata.filings.recent.form.unshift('10-Q');metadata.filings.recent.accessionNumber.unshift('0000000001-26-000002');metadata.filings.recent.filingDate.unshift('2026-08-01');metadata.filings.recent.reportDate.unshift('2026-06-30');metadata.filings.recent.primaryDocument.unshift('quarter.htm');
 await actor.fetch(request());await actor.alarm();assert.equal(actor.meta.queue.length,1,'A new filing queues only the new accession');allowed=false;await actor.alarm();assert.equal(actor.meta.status,'retrying');assert.equal(actor.meta.queue.length,1);assert.ok((await(await actor.fetch(request())).json()).supplement,'Last-good data survives rate limiting');
 now=actor.meta.retry_at+1;allowed=true;await actor.alarm();assert.equal(actor.meta.status,'ready');assert.equal(actor.meta.completed,2);assert.equal(requests.filter(u=>u===filing.url).length,sourceCount);
 const raw={cik:'1',asOf:'2026-10-31',facts:{}},original=JSON.stringify(raw);let clientCalls=0;
 const api=async()=>{clientCalls++;return {cik:'1',ingestion:{status:'processing',revision:1,poll_after_ms:2500},supplement:compiled};};
 const [a,b]=await Promise.all([supplementAutomaticPrimary(raw,record,api),supplementAutomaticPrimary(raw,record,api)]);assert.equal(clientCalls,1);assert.ok(a.facts['report:PrimaryStatementDebt']);assert.ok(b.facts['report:PrimaryStatementDebt']);assert.equal(JSON.stringify(raw),original);
 now+=3000;const stale=await supplementAutomaticPrimary(raw,record,async()=>{throw Error('Transient network failure');});assert.ok(stale.facts['report:PrimaryStatementDebt']);assert.equal(stale.primary_ingestion.using_last_good,true);assert.equal(reportRefetchInterval({state:{data:{financials:stale}}}),15000);assert.equal(reportRefetchInterval({financials:{}}),false);
}finally{globalThis.fetch=oldFetch;Date.now=oldNow;}

// Unchanged complete source, independently retained outside the live service.
const actual=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/automatic-inline-source.json.gz',import.meta.url))));
const inventory=extractPrimaryInline(actual.html,actual.metadata),result=compileInlineFiling(actual.html,{...actual.metadata.profile,...actual.metadata.record},actual.metadata.filing,actual.sha256).result;
assert.ok(inventory.selected_statements.balance_sheet!==undefined);assert.equal(result.facts['report:PrimaryStatementDebt'].units.USD.find(p=>p.end==='2026-01-31').val,1492e6);
// Metadata discovery must actually read older archive files, including a
// resumed queue after the recent-submissions response has been saved.
let archiveCalls=0;const discover={meta:{cik:'1',discovery:{filings:[],archives:[{name:'CIK0000000001-submissions-001.json'}]}},source:async()=>{archiveCalls++;return {form:['10-K'],accessionNumber:[filing.accession],filingDate:[filing.date],reportDate:[filing.period],primaryDocument:['one.htm']};},save:async()=>{},finishPlan:async()=>{}};
await FilingIngestionObject.prototype.discoverArchive.call(discover);assert.equal(archiveCalls,1);assert.equal(discover.meta.discovery.filings.length,1);
console.log('Automatic ingestion passes: actual Gap source, primary captions, resource/issuer conflicts, future/path guards, persistent resume, warm caching, new-accession discovery, rate-limit retries, last-good preservation, revision deltas and shared frontend refresh.');
