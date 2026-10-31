// Execute the deployed statistics functions, without React or provider calls.
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import {annualCalendar} from '../../assets/report/native-valuation.mjs';
import {reportInvestedCapital} from '../../assets/report/debt-policy.mjs';
export async function loadStatisticsEvaluator(){
 const source=await readFile(new URL('../../assets/report/report-app.js',import.meta.url),'utf8'),ast=parse(source,{sourceType:'module'}),names=['bn','Be','Pe','ve','Ia','fn','Ks','RW','zW','IW','LW'];
 const bodies=names.map(name=>{const node=ast.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);if(!node)throw Error('Missing deployed statistics function '+name);return source.slice(node.start,node.end);});
 const context=vm.createContext({annualCalendar,reportInvestedCapital});vm.runInContext(bodies.join('\n'),context,{timeout:1000});
 return financials=>{context.auditInput=financials;try{return vm.runInContext('RW(auditInput)',context,{timeout:1000});}finally{delete context.auditInput;}};
}
