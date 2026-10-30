import {writeFile} from 'node:fs/promises';
const url='https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_d',response=await fetch(url,{signal:AbortSignal.timeout(30000)});
if(!response.ok)throw Error('TWSE valuation source HTTP '+response.status);
const raw=await response.json(),rows={};
const positive=v=>typeof v==='string'&&v.trim()&&Number(v)>0&&Number.isFinite(Number(v))?Number(v):null;
for(const p of raw){
 if(!/^\d{4,6}$/.test(p.Code)||!/^\d{8}$/.test(p.Date))continue;
 const asOf=p.Date.slice(0,4)+'-'+p.Date.slice(4,6)+'-'+p.Date.slice(6),price=positive(p.ClosePrice);if(!price||!Number.isFinite(Date.parse(asOf)))continue;
 if(rows[p.Code])throw Error('Duplicate TWSE security identity');
 rows[p.Code]={asOf,price,pe:positive(p.PEratio),pb:positive(p.PBratio),financial_period:p.FiscalYearQuarter};
}
if(Object.keys(rows).length<100)throw Error('Incomplete TWSE valuation response; previous snapshot retained');
const snapshot={version:1,source_url:url,currency:'TWD',known_at:new Date().toISOString().slice(0,10),rows};
await writeFile(new URL('../assets/report/data/taiwan-market.json',import.meta.url),JSON.stringify(snapshot));console.log('Refreshed '+Object.keys(rows).length+' dated TWSE market ratios');
