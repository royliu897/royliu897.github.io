import {companies} from './data.mjs';
const base='https://research-api.royrliu.com',pending=new Map(),memory=new Map();
async function request(path,ttl){const cached=memory.get(path);if(cached&&Date.now()-cached.time<ttl)return cached.value;if(pending.has(path))return pending.get(path);const promise=(async()=>{const r=await fetch(base+path,{signal:AbortSignal.timeout(60000)});const data=await r.json();if(!r.ok)throw Error(data.error||'SEC data unavailable.');memory.set(path,{time:Date.now(),value:data});return data;})();pending.set(path,promise);try{return await promise;}finally{pending.delete(path);}}
export function filingList(ticker,from='2009',to=String(new Date().getFullYear())){if(!companies[ticker])throw Error('Unknown company.');return request(`/company/${ticker}/filings?from=${String(from).slice(0,4)}&to=${String(to).slice(0,4)}`,300000);}
export function financialFacts(ticker){if(!companies[ticker])throw Error('Unknown company.');return request(`/company/${ticker}/facts`,300000);}
export function refreshSEC(){memory.clear();}
