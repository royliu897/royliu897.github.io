import assert from 'node:assert/strict';
import {loadUsdFx} from '../sec-worker/fx-provider.mjs';
globalThis.caches={default:{match:async()=>null,put:async()=>{}}};const ctx={waitUntil:()=>{}};let calls=0;
globalThis.fetch=async()=>{calls++;return Response.json({chart:{result:[{meta:{symbol:'KRW=X',currency:'KRW',regularMarketPrice:1300,regularMarketTime:Math.floor(Date.now()/1000)}}]}});};
const rate=await loadUsdFx('KRW',ctx);assert.equal(rate.per_usd,1300);assert.equal(rate.usd_per_unit,1/1300);assert.equal(calls,1);
for(const date of ['2030-01-01','2026-02-30','2020-01-01','nonsense']){
 globalThis.fetch=async url=>String(url).includes('yahoo')?new Response('',{status:503}):Response.json([{base:'USD',quote:'TWD',rate:32,date}]);
 await assert.rejects(loadUsdFx('TWD',ctx),/verified/);
}
globalThis.fetch=async url=>String(url).includes('yahoo')?new Response('',{status:503}):Response.json([{base:'USD',quote:'TWD',rate:32,date:new Date().toISOString().slice(0,10)}]);
assert.equal((await loadUsdFx('TWD',ctx)).kind,'daily_reference');await assert.rejects(loadUsdFx('../KRW',ctx),/Invalid/);
console.log('FX provider passes: direction, quote identity, valid daily fallback, stale/future/invalid date rejection and input constraints.');
