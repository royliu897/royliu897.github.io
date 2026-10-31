import assert from 'node:assert/strict';
import worker from '../sec-worker/worker.mjs';
let forwarded;
const env={SITE_ORIGIN:'https://royrliu.com',FILING_CACHE:{idFromName:name=>name,get:id=>({fetch:async url=>{forwarded={id,url};return Response.json({cik:id,ingestion:{revision:42}});}})}},ctx={waitUntil(){}};
const get=query=>worker.fetch(new Request('https://research-api.royrliu.com/company/CIK354950/primary-filings?'+query,{headers:{Origin:'https://royrliu.com'}}),env,ctx);
const good=await get('ticker=HD&since=42&status=1');assert.equal(good.status,200);assert.equal((await good.json()).ingestion.revision,42);assert.equal(forwarded.id,'354950');assert.equal(new URL(forwarded.url).searchParams.get('status'),'1');assert.equal(good.headers.get('Access-Control-Allow-Origin'),'https://royrliu.com');
for(const query of ['ticker=HD&status=2','ticker=HD&status=1&status=1','ticker=HD&since=-1','ticker=HD&ticker=OTHER','ticker=HD&from=2020'])assert.equal((await get(query)).status,400);
console.log('Snapshot route forwards metadata-only requests with CORS and rejects duplicate/invalid parameters.');
