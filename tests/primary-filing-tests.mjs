import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {compilePrimaryFilings,mergePrimaryFilings,supplementPrimaryFilings} from '../assets/report/primary-filing-supplement.mjs';
import {selectStatementSources} from '../assets/report/statement-source-policy.mjs';
import {toReportPayload} from '../assets/report/sec-adapter.mjs';
const read=url=>JSON.parse(readFileSync(url,'utf8')),manifest=read(new URL('../assets/report/data/filings/manifest.json',import.meta.url)),cases=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/statement-policy-facts.json.gz',import.meta.url))));
const refs=read(new URL('../scripts/coverage-pilot/reference-cells.json',import.meta.url));let matched=0,checked=0;
for(const [ticker,c]of Object.entries(cases)){
 const entry=manifest.companies[String(Number(c.data.cik))],supplement=read(new URL('../assets/report/data/filings/'+entry.file,import.meta.url)),before=JSON.stringify(c.data),data=mergePrimaryFilings(c.data,supplement),f=toReportPayload(data,c.record).financials,rows=['income_statement','balance_sheet','cash_flow'].flatMap(t=>f[t]),get=key=>rows.find(r=>r.key===key)?.values[c.year];
 assert.equal(JSON.stringify(c.data),before,'Merging never mutates SEC observations');
 for(const ref of refs.filter(r=>r.ticker===ticker&&r.expected!==null)){
  if(ticker==='CAT'&&ref.key==='interest_expense'){assert.equal(get(ref.key),undefined,'Business-scoped interest cannot become a generic company total');continue;}
  checked++;assert.ok(Math.abs(get(ref.key)-ref.expected)<.001,ticker+' '+ref.key);matched++;
 }
 if(ticker==='PG')assert.equal(get('cash'),9942,'Primary caption resolves broader cash without substituting restricted-cash totals elsewhere');
 if(ticker==='ALL')assert.equal(get('intangible_assets'),558,'Total intangibles supersedes finite-lived component');
 if(ticker==='KO')assert.equal(get('other_nonoperating'),1073,'A balancing residual must not overwrite the disclosed nonoperating fact');
 const historical=mergePrimaryFilings({...c.data,asOf:'2020-01-01'},supplement);assert.equal(Object.values(historical.facts).flatMap(f=>Object.values(f.units).flat()).filter(p=>p.source_priority==='primary-statement').length,0,'Future cache observations respect the knowledge cutoff');
 assert.throws(()=>mergePrimaryFilings(c.data,{...supplement,cik:'999'}),/identity/);
}
assert.equal(checked,59);assert.equal(matched,59);
const filing={accession:'0000000001-26-000001',form:'10-K',date:'2026-02-01',period:'2025-12-31',url:'https://www.sec.gov/Archives/edgar/data/1/000000000126000001/source.htm'};
const fact=(value,extra={})=>({qname:'us-gaap:Assets',namespace:'us-gaap',namespace_uri:'https://fasb.org/us-gaap/2025',name:'Assets',unit:'USD',value,start:null,end:'2025-12-31',typed:false,dimensions:[],statement:'balance_sheet',filed:filing.date,accession:filing.accession,source_url:filing.url,...extra});
const inventory={cik:'1',filing,facts:[fact(100),fact(200)],selected_statements:{balance_sheet:1}},compiled=compilePrimaryFilings([inventory],{cik:'1'});
assert.equal(compiled.conflicts.length,1);assert.ok(compiled.facts.Assets.units.USD.every(p=>p.unresolved));
const report=toReportPayload(mergePrimaryFilings({cik:'1',asOf:'2026-10-29',facts:{Revenues:{namespace:'us-gaap',units:{USD:[{val:100,start:'2025-01-01',end:'2025-12-31',filed:filing.date,accn:filing.accession,form:'10-K'}]}},Assets:{namespace:'us-gaap',units:{USD:[{val:100,start:null,end:'2025-12-31',filed:filing.date,accn:filing.accession,form:'10-K'}]}}}},compiled));
const asset=report.financials.balance_sheet.find(r=>r.key==='total_assets');assert.equal(asset.values['2025'],undefined);assert.equal(asset.availability['2025'].status,'unresolved');
const p=val=>({val,concept:'Assets',start:null,end:'2025-12-31',filed:filing.date,accn:filing.accession,form:'10-K'});
assert.equal(selectStatementSources([p(1),p(2)],'total_assets','').length,0,'Contradictory identical-source values are not collapsed by input order');
assert.equal(compilePrimaryFilings([{...inventory,facts:[fact(100,{dimensions:[{axis:'SegmentAxis',member:'SegmentMember'}]})]}],{cik:'1'}).facts.Assets,undefined);
const network=[];await supplementPrimaryFilings({cik:'9',asOf:'2026-10-29',facts:{}},{cik:'9'},async url=>{network.push(String(url));return {ok:true,json:async()=>({companies:{}})};});assert.equal(network.length,1,'Uncached issuer checks only the shared manifest, not SEC filings');
console.log('Primary filing integration passes: 59 scope-eligible references, CAT scope withholding, total/component hierarchy, preservation of direct facts, immutable sources, as-of cutoff, duplicate conflicts and bounded cache lookup.');

const cashSale=(concept,val,extra={})=>({...p(val),concept,...extra});
assert.equal(selectStatementSources([cashSale('ProceedsFromSaleAndMaturityOfAvailableForSaleSecurities',30),cashSale('ProceedsFromSaleOfInvestments',10)],'_cf_inv_sales','').length,0,'AFS sales/maturities and generic investment sales have no universal subset relationship');
assert.equal(selectStatementSources([cashSale('ProceedsFromSaleAndMaturityOfAvailableForSaleSecurities',30),cashSale('ProceedsFromSaleOfInvestments',10,{source_priority:'primary-statement'})],'_cf_inv_sales','')[0].val,10,'Primary statement scope is resolved before total/component relationships');
