import {numberLiteral} from './amounts.mjs';
import {annualize} from './research-data.mjs?v=5';
export function parseFormula(source){
 if(typeof source!=='string'||source.length>500)throw Error('Use an expression of at most 500 characters.');
 const tokens=source.match(/(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?[mMbBtT]?|[A-Za-z][A-Za-z0-9_]*|[()+\-*/^,]|\S/g)||[];let i=0,depth=0;
 const take=t=>tokens[i]===t&&(i++,true);
 function atom(){if(++depth>40)throw Error('Expression nesting is too deep.');let n;const t=tokens[i++];if(t==='('){n=sum();if(!take(')'))throw Error('Missing closing parenthesis.');}else if(/^\d|^\.\d/.test(t||'')){n={op:'number',value:numberLiteral(t)};}else if(/^[A-Za-z][\w]*$/.test(t||'')){if(take('(')){const args=[sum()];while(take(','))args.push(sum());if(!take(')'))throw Error('Missing closing parenthesis.');if(!['lag','growth','avg','abs','min','max'].includes(t))throw Error('Unknown function: '+t);if((['lag','growth','avg'].includes(t)&&args.length!==2)||(t==='abs'&&args.length!==1)||(['min','max'].includes(t)&&args.length!==2))throw Error('Wrong number of function arguments.');n={op:t,args};}else n={op:'variable',name:t};}else throw Error('Expected a number, variable or parenthesis.');depth--;return n;}
 function power(){const a=atom();return take('^')?{op:'^',args:[a,unary()]}:a;}
 function unary(){if(take('-'))return {op:'neg',args:[unary()]};if(take('+'))return unary();return power();}
 function product(){let a=unary();while(['*','/'].includes(tokens[i]))a={op:tokens[i++],args:[a,unary()]};return a;}
 function sum(){let a=product();while(['+','-'].includes(tokens[i]))a={op:tokens[i++],args:[a,product()]};return a;}
 const ast=sum();if(i!==tokens.length)throw Error('Unexpected expression token.');return ast;
}
export function variables(ast){const out=new Set();function visit(n){if(n.op==='variable')out.add(n.name);for(const a of n.args||[])visit(a);}visit(ast);return [...out];}
function evaluator(series){
 const memo=new WeakMap();let operations=0;
 function evaluate(n,index){let cache=memo.get(n);if(!cache){cache=new Map();memo.set(n,cache);}if(cache.has(index))return cache.get(index);if(++operations>500000)throw Error("Calculation is too large. Use a shorter range or simpler expression.");const value=compute(n,index);cache.set(index,value);return value;}
 function compute(n,index){
 if(index<0)return NaN;if(n.op==='number')return n.value;if(n.op==='variable')return series[n.name]?.[index]??NaN;
 const a=()=>evaluate(n.args[0],index),b=()=>evaluate(n.args[1],index);
 if(['lag','growth','avg'].includes(n.op)){const k=b();if(!Number.isInteger(k)||k<1||k>1000)throw Error('Lag/window must be a whole number from 1 to 1,000.');if(n.op==='lag')return evaluate(n.args[0],index-k);if(n.op==='growth'){const previous=evaluate(n.args[0],index-k);return previous>0?a()/previous-1:NaN;}if(index<k-1)return NaN;let total=0;for(let j=0;j<k;j++)total+=evaluate(n.args[0],index-j);return total/k;}
 switch(n.op){case 'neg':return -a();case '+':return a()+b();case '-':return a()-b();case '*':return a()*b();case '/':return b()===0?NaN:a()/b();case '^':return a()**b();case 'abs':return Math.abs(a());case 'min':return Math.min(a(),b());case 'max':return Math.max(a(),b());}throw Error('Unknown operation.');
 }
 return evaluate;
}
export function calculatePanel(panel,collection){
 const expressions=panel.expressions.split('\n').map(s=>s.trim()).filter(Boolean);if(!expressions.length||expressions.length>8)throw Error('Use 1–8 expressions, one per line.');
 const asts=expressions.map(parseFormula),used=[...new Set(asts.flatMap(variables))],mapped={};
 for(const name of used){const id=panel.bindings[name],s=collection.find(s=>s.id===id);if(!s)throw Error(`Choose a data field for ${name}.`);mapped[name]=panel.alignment==='exact'?s.points:annualize(s.points,panel.alignment);}
 // Exact-date intersection of referenced inputs. Never interpolate or forward-fill.
 const dateSets=Object.fromEntries(used.map(n=>[n,new Set(mapped[n].map(p=>p.date))]));
 const dates=used.length?[...dateSets[used[0]]].filter(d=>used.every(n=>dateSets[n].has(d))).sort():[panel.to||new Date().toISOString().slice(0,10)];
 const values={};for(const name of used){const map=new Map(mapped[name].map(p=>[p.date,p.value]));values[name]=dates.map(d=>map.get(d));}
 const evaluate=evaluator(values);
 const result=asts.map((ast,k)=>{const points=[];let omitted=0;for(let i=0;i<dates.length;i++){const date=dates[i];if(date<panel.from||date>panel.to)continue;const value=evaluate(ast,i);if(Number.isFinite(value))points.push({date,value});else omitted++;}return {name:expressions[k],points,omitted};});
 if(!result.some(r=>r.points.length))throw Error('No finite results in the selected period. Check dates, missing values and denominators.');return result;
}
