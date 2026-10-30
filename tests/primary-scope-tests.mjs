import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {compilePrimaryFilings,mergePrimaryFilings,primaryScopeRejection} from '../assets/report/primary-filing-supplement.mjs';
import {toReportPayload} from '../assets/report/sec-adapter.mjs';
const inventory=JSON.parse(readFileSync(new URL('./fixtures/fdx-reviewed-cogs-scope.json',import.meta.url))),data=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/fdx-historical-cogs.json.gz',import.meta.url)))),record={cik:'1048911',ticker:'FDX',name:'FedEx Corporation'},snapshot=JSON.stringify(data);
const before=toReportPayload(data,record),get=(p,key,year)=>p.financials.income_statement.find(r=>r.key===key)?.values[year];
assert.equal(get(before,'cogs','2019'),16654,'Actual legacy taxonomy observation is present');assert.ok(get(before,'gross_profit','2019')>50000,'Unqualified alias previously manufactured a gross profit from purchased transportation');
const compiled=compilePrimaryFilings([inventory],record);assert.equal(compiled.rejections.length,3);assert.equal(compiled.rejections[0].source_label,'Purchased transportation');
assert.ok(compiled.facts.CostOfGoodsAndServicesSold.units.USD.every(p=>p.unresolved&&p.excluded_from_mapping&&p.scope_rejection));
const after=toReportPayload(mergePrimaryFilings(data,compiled,record),record);
for(const year of ['2017','2018','2019']){assert.equal(get(after,'cogs',year),undefined,'Known narrower source cannot become full COGS '+year);assert.equal(get(after,'gross_profit',year),undefined,'Gross profit cannot derive from the rejected cost component '+year);}
assert.ok(after.financials.source_selection.excluded_observations.some(p=>p.key==='cogs'));assert.equal(JSON.stringify(data),snapshot);
assert.ok(!Object.values(mergePrimaryFilings({...data,asOf:'2019-07-15'},compiled).facts).flatMap(f=>Object.values(f.units).flat()).some(p=>p.source_priority==='primary-statement'&&p.accn===inventory.filing.accession),'Review evidence never introduces future filing observations before the report was available');
assert.match(primaryScopeRejection({label:'Purchased transportation'},'cogs'),/does not establish total/,'Caption rule is generic, without an issuer condition');assert.equal(primaryScopeRejection({label:'Cost of goods and services sold'},'cogs'),null);assert.equal(primaryScopeRejection({label:'Purchased transportation'},'other_operating'),null,'A component remains eligible for a matching component row');
const reviewRegistry=JSON.parse(readFileSync(new URL('../scripts/filing-cache/reviewed-scopes.json',import.meta.url)));
assert.ok(reviewRegistry.reviews.every(r=>!('value' in r)&&!('val' in r)&&!('expected_value' in r)),'Reviewed scope registry stores provenance and captions, never numerical overrides');
console.log('Primary scope guards pass: actual 2017–2019 FedEx purchased-transportation XBRL facts are withheld from total COGS and derived gross profit; generic caption behavior, source immutability, filing cutoff and the metadata-only review registry are checked.');
