import {readFile,writeFile,readdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {mergePrimaryFilings} from '../../assets/report/primary-filing-supplement.mjs';
import {toReportPayload} from '../../assets/report/sec-adapter.mjs';
const [cacheRoot,output]=process.argv.slice(2),root=new URL('../../assets/report/data/filings/',import.meta.url),manifestText=await readFile(new URL('manifest.json',root),'utf8'),manifest=JSON.parse(manifestText),cases=[];
const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
for(const [cik,entry]of Object.entries(manifest.companies)){
 const source=JSON.parse(await readFile(cacheRoot+'/'+cik+'/facts.json','utf8')),text=await readFile(new URL(entry.file,root),'utf8'),supplement=JSON.parse(text),accession=(await readdir(cacheRoot+'/'+cik)).find(a=>/^\d{10}-\d{2}-\d{6}$/.test(a)),metadata=JSON.parse(await readFile(cacheRoot+'/'+cik+'/'+accession+'/metadata.json','utf8')),record={...metadata.record,...metadata.profile},baseline=[],current=[],merge=[];
 for(let i=0;i<4;i++){let start=performance.now();toReportPayload(source,record);baseline.push(performance.now()-start);start=performance.now();const data=mergePrimaryFilings(source,supplement);merge.push(performance.now()-start);toReportPayload(data,record);current.push(performance.now()-start);}
 cases.push({ticker:entry.ticker,baseline_median_ms:+median(baseline).toFixed(2),merge_median_ms:+median(merge).toFixed(2),merge_and_normalize_median_ms:+median(current).toFixed(2),json_bytes:Buffer.byteLength(text),gzip_bytes:gzipSync(text).length});
}
const result={scope:'Warm local Node medians over four runs; not browser or remote host latency. Gzip sizes are compression potential, not a guarantee the local HTTP server compresses responses.',primary_cache_requests:{manifest_once_per_module_session:1,content_hashed_issuer_json_per_uncached_issuer:1,sec_source_requests:0,manifest_bytes:Buffer.byteLength(manifestText)},cases};
if(output)await writeFile(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
