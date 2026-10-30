// Offline, bounded review evidence. This does not infer issuer mappings or
// override financial amounts; it annotates actual SEC observations with a
// reviewed primary-statement caption from the exact immutable source report.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=body=>createHash('sha256').update(body).digest('hex');
export async function reviewedScopeInventories(cacheRoot,cik){
 const records=JSON.parse(await readFile(new URL('./reviewed-scopes.json',import.meta.url),'utf8')).reviews.filter(r=>String(Number(r.cik))===String(Number(cik))),inventories=[];
 for(const record of records){
  const folder=cacheRoot+'/'+Number(cik)+'/'+record.filing.accession,html=await readFile(folder+'/filing.htm'),xml=await readFile(folder+'/xbrl-instance.xml');
  if(hash(html)!==record.source_sha256||hash(xml)!==record.instance_sha256)throw Error('Reviewed source scope hash mismatch. Re-review the source before applying the annotation.');
  const data=JSON.parse(await readFile(cacheRoot+'/'+Number(cik)+'/facts.json','utf8'));
  if(String(Number(data.cik))!==String(Number(cik)))throw Error('Reviewed source scope issuer mismatch');
  const source=data.facts[record.concept];if(!source||source.namespace!==record.namespace)throw Error('Reviewed source scope taxonomy mismatch');
  const points=(source.units[record.unit]||[]).filter(p=>p.accn===record.filing.accession&&record.contexts.some(c=>c.start===p.start&&c.end===p.end));
  if(new Set(points.map(p=>p.start+'|'+p.end)).size!==record.contexts.length)throw Error('Reviewed source scope contexts are missing from SEC observations');
  const facts=points.map(p=>({qname:record.namespace+':'+record.concept,namespace:record.namespace,namespace_uri:record.namespace_uri,name:record.concept,unit:record.unit,value:p.val,start:p.start,end:p.end,dimensions:[],typed:false,context_ref:record.contexts.find(c=>c.start===p.start&&c.end===p.end).id,label:record.source_caption,table:record.table_index,filed:record.filing.date,accession:record.filing.accession,source_url:record.filing.url,source_kind:'Reviewed legacy primary caption + original SEC XBRL observation',statement:record.statement,scope_review:{id:record.id,method:record.method,instance_url:record.instance_url,instance_sha256:record.instance_sha256}}));
  inventories.push({schema_version:1,cik:String(cik),ticker:record.ticker,filing:record.filing,source_sha256:record.source_sha256,facts,selected_statements:{[record.statement]:record.table_index},statement_evidence:{[record.statement]:{table:record.table_index,method:record.method,source_caption:record.source_caption,review_id:record.id}}});
 }
 return inventories;
}
