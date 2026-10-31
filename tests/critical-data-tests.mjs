import assert from 'node:assert/strict';
import {criticalStatementFacts,appendCriticalStatementFacts} from '../scripts/filing-cache/critical-statements.mjs';
import {deriveDebt,investedCapital,reportInvestedCapital} from '../assets/report/debt-policy.mjs';
import {reportValuation,valuationCard} from '../assets/report/native-valuation.mjs';
const filing={period:'2025-12-31',date:'2026-02-15',accession:'0000000001-26-000001',url:'https://www.sec.gov/Archives/edgar/data/1/report.htm'};
const point=(name,value,extra={})=>({name,qname:'us-gaap:'+name,namespace:'us-gaap',namespace_uri:'http://fasb.org/us-gaap/2025',value,end:filing.period,filed:filing.date,accession:filing.accession,source_url:filing.url,statement:'balance_sheet',unit:'USD',dimensions:[],label:name,...extra});
const compile=facts=>criticalStatementFacts({filing,facts});
assert.equal(compile([point('LongTermDebtNoncurrent',40000)])[0].value,40000,'Unclassified maturity disclosures are not added to the primary balance-sheet line');
const parts=[point('LongTermDebtAndCapitalLeaseObligations',300),point('LongTermDebtAndCapitalLeaseObligationsCurrent',20),point('ShortTermBorrowings',10)];
const total=compile(parts)[0];assert.equal(total.value,330);assert.equal(total.debt_scope,'includes_finance_leases');assert.equal(total.source_concepts.length,3);
assert.equal(compile([...parts,point('LongTermDebtAndCapitalLeaseObligations',301)]).length,0,'Contradictory primary debt stays unresolved');
for(const extra of [{dimensions:[{axis:'Segment',member:'Retail'}]},{typed:true},{unit:'shares'},{filed:'2026-02-16'},{source_url:'https://wrong.example/report'},{accession:'other'},{namespace:'issuer',namespace_uri:'https://issuer.example'}])assert.equal(compile([point('LongTermDebtNoncurrent',40000,extra)]).length,0);
const appleParts=[point('CommercialPaper',8,{balance_classification:'current_liabilities'}),point('LongTermDebtCurrent',12),point('LongTermDebtNoncurrent',78)];assert.equal(compile(appleParts)[0].value,98,'Separately displayed primary commercial paper is part of total debt');assert.equal(compile([...appleParts,point('ShortTermBorrowings',8)])[0].value,98,'A disclosed borrowing total supersedes its commercial-paper component');
assert.equal(compile([point('LongTermDebtAndCapitalLeaseObligationsCurrent',20),point('LongTermDebtNoncurrent',300)])[0].debt_scope,'includes_current_finance_leases');
assert.equal(compile([point('DebtLongtermAndShorttermCombinedAmount',99),...parts]).length,0,'Reported total has precedence over a derived total');
assert.equal(compile([...parts,point('SpecialDebt',9,{namespace:'issuer',label:'Long-term debt'})]).length,0,'Unclassified issuer debt lines prevent an incomplete total');
const loan=point('NotesAndLoansPayable',5,{label:'Loans and notes payable'});
assert.equal(compile([...parts.slice(0,2),loan]).length,0,'A debt line without resolved current/noncurrent scope prevents claiming a complete sum');
assert.equal(compile([...parts.slice(0,2),{...loan,balance_classification:'current_liabilities'}])[0].value,325);
const leases=compile([point('CustomLease',14,{qname:'issuer:CustomLease',namespace:'issuer',label:'Long-term lease liability'}),point('CustomCurrentLease',.7,{qname:'issuer:CustomCurrentLease',namespace:'issuer',label:'Lease liability',balance_classification:'current_liabilities'})]);
assert.deepEqual(leases.map(p=>p.target_key),['reported_lease_liabilities_noncurrent','reported_lease_liabilities_current']);assert.equal(leases[0].qname,'issuer:CustomLease');
assert.equal(compile([point('CustomLease',5,{label:'Operating lease assets'})]).length,0);
const make=(ps,val)=>({end:'2025-12-31',inputs:ps,val});
const series={_short_borrowings:[{val:10,end:'2025-12-31'}],_commercial_paper:[{val:4,end:'2025-12-31'}],_debt_current:[{val:20,end:'2025-12-31'}],_debt_lease_noncurrent:[{val:300,end:'2025-12-31'}]};deriveDebt(series,make);assert.equal(series.short_term_debt[0].val,30);assert.equal(series.total_debt[0].val,330);assert.equal(series.total_debt[0].debt_scope,'includes_finance_leases');
const partial={_commercial_paper:[{val:4,end:'2025-12-31'}],long_term_debt:[{val:300,end:'2025-12-31'}]};deriveDebt(partial,make);assert.equal(partial.total_debt,undefined);
const reported={total_debt:[{val:300,end:'2025-12-31',debt_scope:'includes_finance_leases'}]};deriveDebt(reported,make);assert.equal(reported.total_debt[0].debt_scope,'includes_finance_leases');
assert.equal(investedCapital(-10,100,'includes_finance_leases',3,20,2),92);assert.equal(investedCapital(-10,100,'excludes_finance_leases',3,20,2),115);assert.equal(investedCapital(50,undefined),undefined);
assert.equal(reportInvestedCapital({debt_policy_version:1,balance_sheet:[{key:'shareholders_equity',values:{2025:10}}]},'2025'),undefined);
const f={columns:['2025'],period_dates:['2025-12-31'],knowledge_as_of:'2026-10-30',debt_policy_version:1,current_shares:{status:'available',common_outstanding:10e6,asOf:'2026-02-01'},income_statement:[],balance_sheet:[{key:'total_debt',values:{2025:100}},{key:'cash',values:{2025:25}}],cash_flow:[{key:'free_cash_flow',values:{2025:-5}}]};
const v=reportValuation(10,f);assert.equal(v.marketCap,100);assert.equal(v.ev,175);assert.equal(v.fcfYield,-5);assert.equal(v.bases.fcfYield,'FY 2025');assert.equal(valuationCard(v,'',x=>String(x)).items.at(-1).value,'-5% · FY 2025');
assert.equal(reportValuation(10,{...f,balance_sheet:[{key:'cash',values:{2025:25}}]}).ev,null);
console.log('Critical data checks pass: primary debt completeness, issuer/dimension/unit/source guards, conflicting totals, combined lease scope, no commercial-paper double counting, no zero substitution, negative-equity invested capital and signed FCF yield.');

const {readFile}=await import('node:fs/promises');
const {compilePrimaryFilings,mergePrimaryFilings}=await import('../assets/report/primary-filing-supplement.mjs');
const {toReportPayload}=await import('../assets/report/sec-adapter.mjs');
const cases=JSON.parse(await readFile(new URL('./fixtures/critical-primary-statements.json',import.meta.url),'utf8'));
for(const source of cases){
 const record={cik:source.cik,ticker:source.ticker},before=JSON.stringify(source);
 const compiled=appendCriticalStatementFacts(compilePrimaryFilings([source],record),[source]);
 const payload=toReportPayload(mergePrimaryFilings({cik:source.cik,asOf:'2026-10-30',facts:{}},compiled,record),record).financials;
 const year=source.filing.period.slice(0,4),row=key=>[...payload.income_statement,...payload.balance_sheet].find(r=>r.key===key);
 for(const [key,target]of [['total_debt',source.expected_total_debt_millions],['reported_costs_expenses',source.expected_costs_expenses_millions]])if(target!==undefined&&target!==null){assert.equal(row(key)?.values[year],target,source.ticker+' '+key);assert.equal(row(key)?.provenance[year].source_url,source.filing.url);}
 if(source.ticker==='MCD'){assert.equal(row('reported_lease_liabilities_current').values[year],694);assert.equal(row('reported_lease_liabilities_noncurrent').values[year],14147);}
 assert.equal(JSON.stringify(source),before,'Primary source inventory remains immutable');
}
console.log('Eleven actual primary-filing fixtures pass: debt totals, combined lease scope, separately tagged lease liabilities, source URLs, expense totals and immutable evidence.');
