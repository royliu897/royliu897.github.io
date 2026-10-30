const inflight=new Map();
export async function loadUsdFx(currency,ctx){
 if(!/^[A-Z]{3}$/.test(currency))throw Object.assign(Error('Invalid currency.'),{status:400});
 const key=new Request('https://research-api.royrliu.com/internal/fx/USD/'+currency+'?v=1'),hit=await caches.default.match(key);if(hit)return hit.json();
 if(inflight.has(currency))return inflight.get(currency);
 const task=(async()=>{
  const fetchedAt=new Date().toISOString();let value;
  if(currency==='USD')return {base:'USD',quote:'USD',per_usd:1,usd_per_unit:1,asOf:fetchedAt,fetchedAt,kind:'identity',source:'USD'};
  try{
   const symbol=currency+'=X',url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?interval=1d&range=5d',response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0',Accept:'application/json'},signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw Error();const json=await response.json(),m=json.chart?.result?.[0]?.meta,rate=m?.regularMarketPrice,asOf=new Date(m?.regularMarketTime*1000).toISOString();
   if(m.symbol!==symbol||m.currency!==currency||!Number.isFinite(rate)||rate<=0||Date.now()-Date.parse(asOf)>7*86400000||Date.parse(asOf)>Date.now()+300000)throw Error();
   value={base:'USD',quote:currency,per_usd:rate,usd_per_unit:1/rate,asOf,fetchedAt,kind:'market_quote',source:'Yahoo Finance FX',source_url:'https://finance.yahoo.com/quote/'+encodeURIComponent(symbol)+'/'};
  }catch{
   const url='https://api.frankfurter.dev/v2/rates?base=USD&quotes='+currency,response=await fetch(url,{signal:AbortSignal.timeout(8000)});if(!response.ok)throw Object.assign(Error('Current FX could not be retrieved.'),{status:502});
   const rows=await response.json(),r=Array.isArray(rows)&&rows.find(x=>x.base==='USD'&&x.quote===currency);if(!r||!Number.isFinite(r.rate)||r.rate<=0||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(Date.parse(r.date))||new Date(Date.parse(r.date)).toISOString().slice(0,10)!==r.date||Date.parse(r.date)>Date.now()+300000||Date.now()-Date.parse(r.date)>7*86400000)throw Object.assign(Error('FX response could not be verified.'),{status:502});
   value={base:'USD',quote:currency,per_usd:r.rate,usd_per_unit:1/r.rate,asOf:r.date,fetchedAt,kind:'daily_reference',source:'Frankfurter central-bank reference blend',source_url:url};
  }
  ctx.waitUntil(caches.default.put(key,new Response(JSON.stringify(value),{headers:{'Cache-Control':'public, max-age=300'}})));return value;
 })();inflight.set(currency,task);try{return await task;}finally{inflight.delete(currency);}
}
