import assert from 'node:assert/strict';
import {expression} from '../assets/research/finance.mjs';
import {calculatePanel} from '../assets/research/formulas.mjs';
import {formatAmount} from '../assets/research/amounts.mjs';
import {parsePeriod,quarterLabel,filingLabel,pastRange,periodInput} from '../assets/research/periods.mjs';
for(const [input,value]of [['60m+2b',2060000000],['2T/4',5e11],['1e3m',1e9],['60t',6e13],['.5B',5e8]]){
 assert.equal(expression(input),value);
 assert.equal(calculatePanel({bindings:{},alignment:'exact',from:'2025-01-01',to:'2025-12-31',expressions:input},[])[0].points[0].value,value);
}
assert.equal(expression('0.05 + 0.01*t',2),.07);
assert.throws(()=>expression('60million'));
assert.equal(formatAmount(-60000000),'-60m');
assert.equal(formatAmount(2.06e9),'2.06b');
assert.equal(formatAmount(999999999),'1b');
assert.equal(formatAmount(.025,4),'0.025');
assert.equal(parsePeriod('2024'),'2024-01-01');
assert.equal(parsePeriod('2024',true),'2024-12-31');
assert.equal(parsePeriod('2024 Q1',true),'2024-03-31');
assert.equal(parsePeriod('Q2 2025'),'2025-04-01');
assert.equal(parsePeriod('2024-02-29'),'2024-02-29');
assert.throws(()=>parsePeriod('2025 Q5'));
assert.throws(()=>parsePeriod('2025-02-29'));
assert.equal(quarterLabel('2025-05-31'),'2025 Q2');
assert.equal(filingLabel({form:'10-K',period:'2025-05-31',date:'2025-07-17'}),'10-K · Q2 2025');
assert.equal(filingLabel({form:'8-K',date:'2025-07-17'}),'8-K · 2025-07-17');
const points=[[2022,1],[2023,2],[2025,3]];
assert.deepEqual(pastRange(points,'2'),[[2025,3]]);
assert.deepEqual(pastRange(points,'100'),points);
assert.deepEqual(pastRange(points,'ALL'),points);
assert.throws(()=>pastRange(points,'0'));
console.log('Amount suffixes, compact results, typed periods and clipped ranges passed.');

assert.equal(periodInput('2025-02-14'),'2025-02-14');
assert.equal(periodInput('2025-03-31',true),'2025 Q1');
assert.equal(periodInput('2025-01-01'),'2025 Q1');
