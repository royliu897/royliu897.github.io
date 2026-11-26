import assert from 'node:assert/strict';
import {selectRows,validateSnapshot,csv,materiallyChanged,reason} from '../assets/screener/core.mjs';
const stock={ticker:'ABC',cik:'1',name:'A <company>',exchange:'NYSE',market_cap:100e6,score:90,signals:['Persistent decline'],return_63d:-.25,return_126d:-.4,chart:[['2025-01-01',100,100],['2025-12-01',60,62]]};
const data={schema_version:1,as_of:'2025-12-01',rows:[stock]};assert.strictEqual(validateSnapshot(data),data);
assert.throws(()=>validateSnapshot({...data,rows:[stock,stock]}),/identity/);assert.throws(()=>validateSnapshot({...data,rows:[{...stock,score:NaN}]}),/metric/);assert.throws(()=>validateSnapshot({...data,as_of:'2099-01-01'}),/future/);
assert.equal(selectRows([stock]).length,1);assert.equal(selectRows([{...stock,score:null},stock])[0].score,90);assert.equal(selectRows([stock],{screen:'sudden'}).length,0);
assert.equal(selectRows([stock],{rules:[{metric:'return_63d',op:'lte',value:-.2},{metric:'return_1d',op:'lte',value:-.08}],mode:'AND'}).length,0);assert.equal(selectRows([stock],{rules:[{metric:'return_63d',op:'lte',value:-.2},{metric:'return_1d',op:'lte',value:-.08}],mode:'OR'}).length,1);
assert.equal(selectRows([stock],{}, {'1':{status:'Rejected',score:90,signals:stock.signals}}).length,0);assert.ok(materiallyChanged({...stock,score:100},{score:70,signals:stock.signals}));assert.equal(selectRows([stock],{screen:'watchlist'},{'1':{status:'Watchlist'}}).length,1);
assert.ok(csv([{...stock,name:'=HYPERLINK("bad")'}],['return_126d']).includes("'=HYPERLINK"));assert.match(reason(stock),/six months/);
console.log('Screener: identity and metric validation, missing values, AND/OR, sorting, watchlists, rejected-event suppression and safe CSV pass.');

assert.match(reason({...stock,signals:['Industry laggard'],industry_126d_excess:-.1,industry_252d_excess:-.3}),/-30.0 pp/);
