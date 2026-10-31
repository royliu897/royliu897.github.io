import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {cagrAssessment,cagrBlankDefinition,auditCagrGroups} from '../assets/report/cagr-availability.mjs';
import {loadStatisticsEvaluator} from '../scripts/report-frontend/statistics-evaluator.mjs';
import {toReportPayload} from '../assets/report/sec-adapter.mjs';
import {mergePrimaryFilings} from '../assets/report/primary-filing-supplement.mjs';
const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/gap-report-regression.json.gz',import.meta.url)))),{raw,primary,record}=fixture;
const f=toReportPayload(mergePrimaryFilings(raw,primary,record),record,null,'annual','NYSE:GAP').financials,before=JSON.stringify(f),evaluate=await loadStatisticsEvaluator(),groups=evaluate(f).groups;
for(const[label,start,end]of [['EPS',-1.78,2.13],['FCF',-155,823]]){const a=cagrAssessment(f,label,'5-Year CAGR');assert.equal(a.start_period,'2021');assert.equal(a.end_period,'2026');assert.equal(a.start,start);assert.equal(a.end,end);assert.equal(a.status,'ineligible');assert.ok(cagrBlankDefinition(a).group.includes('Not meaningful'));assert.ok(cagrBlankDefinition(a).detail.includes('−'));assert.equal(cagrAssessment(f,label,'10-Year CAGR').status,'available');}
assert.equal(auditCagrGroups(f,groups).issues.length,0,'The legitimate negative-base blanks must not be reported as missing calculations');
const broken=structuredClone(groups);broken.find(g=>g.title==='10-Year CAGR').items.find(i=>i.label==='EPS').value='—';assert.equal(auditCagrGroups(f,broken).issues[0].issue,'eligible_but_blank','Automatically catch a recoverable display/calculation regression');
const fabricated=structuredClone(groups);fabricated.find(g=>g.title==='5-Year CAGR').items.find(i=>i.label==='EPS').value='10.0%';assert.equal(auditCagrGroups(f,fabricated).issues[0].issue,'ineligible_but_displayed');
const wrong=structuredClone(groups);wrong.find(g=>g.title==='10-Year CAGR').items.find(i=>i.label==='Revenue').value='100.0%';assert.equal(auditCagrGroups(f,wrong).issues[0].issue,'incorrect_result');
for(const value of [0,-1]){const copy=structuredClone(f);copy.income_statement.find(r=>r.key==='eps_diluted').values['2021']=value;assert.equal(cagrAssessment(copy,'EPS','5-Year CAGR').status,'ineligible');}
const missing=structuredClone(f);delete missing.income_statement.find(r=>r.key==='eps_diluted').values['2021'];assert.equal(cagrAssessment(missing,'EPS','5-Year CAGR').status,'unavailable');assert.equal(cagrAssessment(f,'EPS','Valuation'),null);
const empty={columns:[],income_statement:[],cash_flow:[],balance_sheet:[]};assert.equal(cagrAssessment(empty,'EPS','5-Year CAGR').status,'unavailable');
assert.equal(JSON.stringify(f),before,'Explanation and audit never modify source values');
console.log('CAGR availability passes: real Gap negative bases, 5/10-year distinction, zero/missing endpoints, immutable source values and detection of blank, fabricated or incorrect deployed results.');
