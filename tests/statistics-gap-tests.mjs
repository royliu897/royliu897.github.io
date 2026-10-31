import assert from 'node:assert/strict';
import {annualCalendar} from '../assets/report/native-valuation.mjs';
import {toReportPayload} from '../assets/report/sec-adapter.mjs';
const facts={};
for(const [name,values]of Object.entries({Revenues:[80,100],NetIncomeLoss:[10,30],StockholdersEquity:[50,200],Assets:[100,400],LongTermDebtNoncurrent:[0,0],DebtCurrent:[0,0],CapitalLeaseObligationsNoncurrent:[0,0],MinorityInterest:[0,0]}))facts[name]={namespace:'us-gaap',units:{USD:values.map((n,i)=>{const year=[2015,2024][i];return {val:n*1e6,start:['Revenues','NetIncomeLoss'].includes(name)?year+'-01-01':undefined,end:year+'-12-31',filed:(year+1)+'-03-01',accn:'annual'+year,form:'10-K'};})}};
const p=toReportPayload({cik:'1',asOf:'2025-04-01',facts}),points=p.financials.roic_series;
assert.equal(points.find(p=>p.year==='2024').roic,15,'Missing prior fiscal year uses current capital, not a balance nine years earlier');assert.equal(points.find(p=>p.year==='2016').roic,null,'Chart gaps remain gaps rather than joining across missing years');
const before=JSON.stringify(p.financials),calendar=annualCalendar(p.financials);assert.equal(calendar.columns.filter(c=>c!=='TTM').length,10);assert.equal(calendar.income_statement.find(r=>r.key==='revenue').values['2016'],undefined,'Calendar windows never invent financial values');assert.equal(JSON.stringify(p.financials),before);
console.log('Sparse history statistics pass: real prior-year capital, explicit chart gaps, calendar-year windows and unchanged reported values.');

const {alignRoicHistory}=await import('../assets/report/roic-series.mjs');
const sample=[{year:'2020',roic:12},{year:'2022',roic:-5}],snapshot=JSON.stringify(sample);
assert.deepEqual(alignRoicHistory(sample,['2020-12-31','2022-12-31','2025-12-31']),[{year:'2020',roic:12},{year:'2021',roic:null},{year:'2022',roic:-5},{year:'2023',roic:null},{year:'2024',roic:null},{year:'2025',roic:null}],'An unresolved latest year cannot truncate the chart and make an old endpoint look current');
assert.deepEqual(alignRoicHistory([{year:'2020',roic:0}],['2020-12-31','2021-12-31']),[{year:'2020',roic:0},{year:'2021',roic:null}],'Reported zero returns stay visible');
assert.deepEqual(alignRoicHistory([{year:'2020',roic:NaN}],['2020-12-31']),[]);
assert.equal(JSON.stringify(sample),snapshot);
