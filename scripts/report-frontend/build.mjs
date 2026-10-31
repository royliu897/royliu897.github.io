import fs from 'node:fs';
import crypto from 'node:crypto';
import {parse} from '@babel/parser';
import generate from '@babel/generator';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url));
const root=path.join(directory,'reference'),site=path.resolve(directory,'../..'),out=path.join(site,'assets/report');
fs.mkdirSync(out,{recursive:true});
// Version the full local module graph together, so refreshing the entry point
// cannot leave older formula/mapping modules in the browser cache.
const moduleImport=/(from\s+["']\.\/[^"'?]+\.mjs)(?:\?v=[^"']+)?(["'])/g;
const moduleFiles=fs.readdirSync(out).filter(name=>name.endsWith('.mjs')).sort();
const canonical=text=>text.replace(moduleImport,'$1$2');
const revision=crypto.createHash('sha256').update(moduleFiles.map(name=>name+'\n'+canonical(fs.readFileSync(out+'/'+name,'utf8'))).join('\n')).digest('hex').slice(0,12);
const versionImports=text=>text.replace(moduleImport,(_,path,quote)=>path+'?v='+revision+quote);
for(const name of moduleFiles){const file=out+'/'+name,old=fs.readFileSync(file,'utf8'),next=versionImports(old);if(next!==old)fs.writeFileSync(file,next);}
const source=fs.readFileSync(root+'/evidence/fastfs-index-DEfpewR9.js','utf8'),ast=parse(source,{sourceType:'module'}),edits=[];
const replace=(name,text)=>{const node=ast.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);if(!node)throw Error('Missing '+name);edits.push({start:node.start,end:node.end,text});};
replace('vC','async function vC(ticker,period="annual"){return loadReportCompany(ticker,period);}');
replace('gX','async function gX(query){return searchReportCompanies(query);}');
replace('$x','function $x(){return null;}');
replace('w0','function w0({error:e}){return y.jsx("p",{className:"text-red-600",children:e?.message||"Data not available at this time. Please try again later."});}');
replace('mZ','function mZ(e,t){return reportValuation(e,t); }');
replace('FW','function FW(e,t){return valuationCard(e,t,Tt);}');
const statsWindowNode=ast.program.body.find(n=>n.id?.name==='RW');edits.push({start:statsWindowNode.start,end:statsWindowNode.end,text:source.slice(statsWindowNode.start,statsWindowNode.end).replace('function RW(e){','function RW(e){e=annualCalendar(e);')});
for(const name of ['zW','IW','LW']){
 const node=ast.program.body.find(n=>n.id?.name===name);let text=source.slice(node.start,node.end);
 if(name==='zW'){
  const old='const lt=ve(j,he);if(lt!==void 0)return lt+(ve(w,he)??0)+(ve(E,he)??0)+(ve(A,he)??0)+(ve(T,he)??0)';
  if(!text.includes(old))throw Error('Invested-capital source patch did not match');
  text=text.replace(old,'return reportInvestedCapital(e,he)');
  text=text.replace('pe=W!==void 0||H!==void 0?(W??0)+(H??0):void 0','pe=ve(Pe(n,"total_debt"),M)');
  edits.push({start:node.start,end:node.end,text});
 }
}
const ttmHelper=ast.program.body.find(n=>n.id?.name==='Bt');
const ttmSource=source.slice(ttmHelper.start,ttmHelper.end).replace('function Bt(e,t){','function Bt(e,t){if(e?.key?.startsWith("eps_")&&/^\\d{4}Q\\d$/.test(t))return e.ttm_values?.[t];');
if(!ttmSource.includes('ttm_values'))throw Error('TTM EPS helper patch did not match');
edits.push({start:ttmHelper.start,end:ttmHelper.end,text:ttmSource});

for(const name of ['ta','uZ','jZ'])replace(name,`function ${name}(){return null;}`);
// Same router/history behavior, with hash URLs so reload works on GitHub Pages.
replace('d5',`function d5(options={}){
 function location(win,history){const url=new URL(win.location.hash.slice(1)||"/",win.location.origin);return j0("",{pathname:url.pathname,search:url.search,hash:url.hash},history.state&&history.state.usr||null,history.state&&history.state.key||"default");}
 function href(win,to){return "#"+(typeof to==="string"?to:zu(to));}
 return m5(location,href,null,options);
}`);
const header=ast.program.body.find(n=>n.id?.name==='Ka');
function strip(node){if(!node||typeof node!=='object')return node;
 if(node.type==='CallExpression'&&node.callee?.object?.name==='y'&&['jsx','jsxs'].includes(node.callee.property?.name)){
  const component=node.arguments[0],props=node.arguments[1];
  if(props?.type==='ObjectExpression'){
   const value=name=>props.properties.find(p=>(p.key?.name||p.key?.value)===name)?.value?.value;
   if(component?.name==='De'&&['/','/plans','/setup','/usage','/account'].includes(value('to'))||component?.value==='a'&&value('href')==='mailto:benjamin@fastfs.org')return {type:'NullLiteral'};
  }
 }
 for(const key of Object.keys(node)){if(['loc','start','end','extra'].includes(key))continue;if(Array.isArray(node[key]))node[key]=node[key].map(strip);else if(node[key]&&typeof node[key]==='object')node[key]=strip(node[key]);}return node;
}
const patchedHeader=strip(header);
function addTheme(node){if(!node||typeof node!=='object')return;
 if(node.type==='ObjectExpression'){const props=node.properties,cls=props.find(p=>p.key?.name==='className')?.value?.value,children=props.find(p=>p.key?.name==='children')?.value;if(cls?.startsWith('mx-auto flex max-w-7xl')&&children?.type==='ArrayExpression')children.elements.splice(-1,0,parse('y.jsx(ReportThemeToggle,{})').program.body[0].expression);}
 for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(addTheme);else if(value&&typeof value==='object')addTheme(value);}
}
addTheme(patchedHeader);
edits.push({start:header.start,end:header.end,text:generate(patchedHeader,{compact:true,comments:true}).code});
const stats=ast.program.body.find(n=>n.id?.name==='qW');
let statsSource=source.slice(stats.start,stats.end).replace('const{groups:n,roicSeries:r}=RW(e)', 'const{groups:n,roicSeries:r}=e.company_type==="fund"?{groups:[],roicSeries:[]}:RW(e)');
for(const [item,group]of [['m','h'],['x','p']]){const before='children:'+item+'.label',after='children:y.jsx(ReportMetricLabel,{label:'+item+'.label,group:'+group+'.title,data:e,valuation:t})';if(!statsSource.includes(before))throw Error('Metric label patch did not match '+item);statsSource=statsSource.replaceAll(before,after);}
for(const [item,group]of [['m','h'],['x','p']]){const before='children:'+item+'.value',after='children:'+item+'.value==="—"?y.jsx(ReportStatisticValue,{item:'+item+',group:'+group+'.title,data:e}):'+item+'.value';if(!statsSource.includes(before))throw Error('Statistic value patch did not match '+item);statsSource=statsSource.replaceAll(before,after);}
edits.push({start:stats.start,end:stats.end,text:statsSource});
for(const [name,item,group]of [['KW','h','Financial Statements'],['DW','m','Overview'],['XW','x',null]]){
 const node=ast.program.body.find(n=>n.id?.name===name);let text=source.slice(node.start,node.end);
 const before='children:'+item+'.label',groupExpression=group?JSON.stringify(group):item+'.section';
 const after='children:y.jsx(ReportMetricLabel,{label:'+item+'.label,group:'+groupExpression+(name==='KW'?',metricKey:'+item+'.key,basis:'+item+'.series_basis':',data:e')+'})';
 if(name==='DW'){text=text.replace('}){const c=', '}){if(e.company_type==="fund")return y.jsx(KW,{rows:["fund_nav_per_share","fund_net_assets","fund_total_investment_income","fund_net_investment_income","fund_distributions_per_share","fund_shares_outstanding"].map(key=>[...e.income_statement,...e.balance_sheet].find(row=>row.key===key)).filter(Boolean),columns:e.columns,unit:t,dataScale:n,currencySymbol:r,formatHeader:l});const c=');}if(name==='XW'){text=text.replace('}){const h=', '}){if(e.company_type==="fund")return y.jsx(KW,{rows:e.fund_ratios||[],columns:t||e.columns,unit:n,dataScale:r,currencySymbol:l,formatHeader:s});const h=');}if(name==='KW'){text=text.replace('children:s(h)', 'children:h==="TTM"&&e.some(row=>row.key.startsWith("fund_"))?"Latest":s(h)');const cell='T!==void 0?Qx(T,h.key,n,r,l):"—"';if(!text.includes(cell))throw Error('Missing-value cell patch did not match');text=text.replace(cell,'T!==void 0?h.is_percentage?T.toFixed(2)+"%":Qx(T,h.is_per_share?"eps_basic":h.key,n,r,l):y.jsx(ReportMissingValue,{row:h,period:w})');}
 if(!text.includes(before))throw Error('Definition label patch did not match '+name);text=text.replaceAll(before,after);edits.push({start:node.start,end:node.end,text});
}
const meta=ast.program.body.find(n=>n.id?.name==='iZ');
const metaSource=source.slice(meta.start,meta.end).replace('(t==null?void 0:t.description)&&y.jsx(lZ,{text:t.description})','y.jsx(ReportCompanyNotes,{key:t?.notes_key,companyKey:t?.notes_key,coverage:t?.coverage,annualFiling:t?.annual_filing,basis:t?.share_basis,sourceNotice:t?.source_notice,sourceSummary:t?.source_summary,valuationNotice:t?.valuation_notice})').replace('Last Close:','Latest Price:');
if(!metaSource.includes('ReportCompanyNotes'))throw Error('Notes patch did not match');
const headerFormula='children:s.label';
if(metaSource.split(headerFormula).length!==3)throw Error('Header formula labels must match desktop and mobile');
const linkedMetaSource=metaSource.replaceAll(headerFormula,'children:["Market Cap:","EV:"].includes(s.label)?y.jsx(ReportMetricLabel,{label:s.label,metricKey:s.label==="Market Cap:"?"market_cap":"enterprise_value",group:"Market value",basis:n?.bases?.[s.label==="Market Cap:"?"marketCap":"ev"]}):s.label');

edits.push({start:meta.start,end:meta.end,text:linkedMetaSource});
const page=ast.program.body.find(n=>n.id?.name==='vZ');
let pageSource=source.slice(page.start,page.end).replace('Qa(pe);','Qa(pe);_.useEffect(()=>{if(re?.financials.company_type==="fund"||(re?.financials.available_periods?.quarterly===false&&re.financials.available_periods.annual))setFundCompany(c);else setFundCompany(null);},[re,c]);_.useEffect(()=>{if(re?.financials.available_periods?.annual===false&&re?.financials.available_periods?.quarterly)setFallbackCompany(c);},[re,c]);').replace('W=F,','W=F,').replace('m=pZ[s]??"$"','exchangeSymbol=pZ[s]??"$"').replace('G=(re==null?void 0:re.profile)??(me==null?void 0:me.profile)??void 0,J=','G=(re==null?void 0:re.profile)??(me==null?void 0:me.profile)??void 0,m=reportCurrencySymbol(G?.currency)||exchangeSymbol,J=').replace('En=me.historical_prices[ct]','En=sn==="TTM"?U?.price:me.historical_prices[ct]').replace('[ye,me==null?void 0:me.historical_prices]','[ye,me==null?void 0:me.historical_prices,U?.price]').replace('[j,N]=bd("display:period","annual")','[storedPeriod,N]=bd("display:period","annual")').replace('{isLoading:L}=M4()','[fallbackCompany,setFallbackCompany]=_.useState(null),[fundCompany,setFundCompany]=_.useState(null),j=fundCompany===c?"annual":storedPeriod==="annual"&&fallbackCompany===c?"quarterly":storedPeriod,{isLoading:L}=M4()').replace('h=d===null&&c==="Nasdaq:AAPL"','h=false').replace('Financial Statements | FastFS','Financial Statements');
const currencyPatches=[
 ['F=re==null?void 0:re.financials','[displayAnnual,displaySelected,currencyControl]=useReportCurrency(re,me,c),F=displayAnnual?.financials'],
 ['M=me==null?void 0:me.financials','M=displaySelected?.financials'],
 ['U=(re==null?void 0:re.price)??(me==null?void 0:me.price)??void 0','U=displayAnnual?.price??displaySelected?.price'],
 ['G=(re==null?void 0:re.profile)??(me==null?void 0:me.profile)??void 0','G=displayAnnual?.profile??displaySelected?.profile'],
 ['J=me==null?void 0:me.dividends','J=displaySelected?.dividends'],
 ['me.historical_prices','displaySelected.historical_prices'],
 ['me==null?void 0:displaySelected.historical_prices','displaySelected?.historical_prices'],
 ['}),W&&y.jsx(qW,','}),currencyControl,W&&y.jsx(qW,']
];
for(const [before,after]of currencyPatches){if(!pageSource.includes(before))throw Error('Currency UI patch missing '+before);pageSource=pageSource.replaceAll(before,after);}
const nativePatches=[
 ['n=fc(),','n=fc(),nativeAlias=nativeRedirect(e?.replace(".",":")),[nativeNotice,setNativeNotice]=_.useState(null),'],
 ['Qa(pe);','Qa(pe);_.useEffect(()=>{if(nativeAlias){setNativeNotice(nativeAlias);n("/company/"+nativeAlias.exchange+"."+nativeAlias.ticker+(t?"/"+t:""),{replace:true});}},[nativeAlias?.symbol,e,t,n]);'],
 ['enabled:!!c&&Y','enabled:!!c&&Y&&!nativeAlias'],
 ['}),(U||G||k)&&','}),nativeNotice?.symbol===c&&y.jsx("p",{className:"report-native-notice",role:"status",children:nativeNotice.message}),(U||G||k)&&']
];
for(const [before,after]of nativePatches){if(!pageSource.includes(before))throw Error('Native listing UI patch did not match '+before);pageSource=pageSource.replaceAll(before,after);}
const unmappedPatches=[
 ['lt=r!=="overview"&&r!=="key_ratios"','lt=r!=="overview"&&r!=="key_ratios"&&r!=="unmapped"'],
 ['r=t&&sZ[t]||"overview"','r=t==="unmapped"?"unmapped":t&&sZ[t]||"overview"'],
 ['const sn=oZ[Ye]','const sn=Ye==="unmapped"?"unmapped":oZ[Ye]'],
 ['children:e1.map(','children:[...e1,{key:"unmapped",label:"Unmapped"}].map('],
 ['}),lt&&Y&&ne&&','}),r==="unmapped"&&D&&y.jsx(ReportUnmappedView,{data:D,columns:Z,unit:E,formatHeader:he}),lt&&Y&&ne&&']
];
for(const [before,after]of unmappedPatches){if(!pageSource.includes(before))throw Error('Unmapped UI patch did not match '+before);pageSource=pageSource.replace(before,after);}
pageSource=pageSource.replace('value:"quarterly",children:"Quarterly"','value:"quarterly",disabled:fundCompany===c,children:"Quarterly"');
if(pageSource===source.slice(page.start,page.end))throw Error('Page patch did not match');
edits.push({start:page.start,end:page.end,text:pageSource});
for(const node of ast.program.body){const text=source.slice(node.start,node.end);
 if(node.type==='ExpressionStatement'&&text.startsWith('fetch(`${rb}/health`)'))edits.push({start:node.start,end:node.end,text:''});
 if(node.type==='ExpressionStatement'&&text.startsWith('f5.createRoot'))edits.push({start:node.start,end:node.end,text:`const {StatisticValue:ReportStatisticValue,MetricLabel:ReportMetricLabel,MissingValue:ReportMissingValue,ThemeToggle:ReportThemeToggle,CompanyNotes:ReportCompanyNotes,UnmappedView:ReportUnmappedView,useCurrencyDisplay:useReportCurrency}=createReportFeatures(_);f5.createRoot(document.getElementById("root")).render(y.jsx(_.StrictMode,{children:y.jsx(O4,{children:y.jsx(PI,{children:y.jsxs(k4,{children:[y.jsx(EZ,{}),y.jsxs(uI,{children:[y.jsx(Er,{path:"/company/:ticker/:tab?",element:y.jsx(vZ,{})}),y.jsx(Er,{path:"*",element:y.jsx(Ka,{})})]})]})})})}));`});
}
let result=source;for(const edit of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,edit.start)+edit.text+result.slice(edit.end);
result='import {reportInvestedCapital} from "./debt-policy.mjs";\nimport {reportValuation,nativeValuation,valuationCard,annualCalendar} from "./native-valuation.mjs";\nimport {createReportFeatures} from "./report-enhancements.mjs";\nimport {loadReportCompany,searchReportCompanies,reportCurrencySymbol,nativeRedirect} from "./sec-adapter.mjs";\n'+result;
result=result.replace('FastFS — Simple QuickFS Alternative | Financial Data','Financial Reports');
result=versionImports(result);fs.writeFileSync(out+'/report-app.js',result);
fs.copyFileSync(root+'/evidence/fastfs-index-CeCSSJCI.css',out+'/report-reference.css');
fs.copyFileSync(root+'/evidence/xlsx-CbTSpprj.js',out+'/xlsx-CbTSpprj.js');
fs.writeFileSync(out+'/jszip.min-s_YNebid.js',fs.readFileSync(root+'/evidence/jszip.min-s_YNebid.js','utf8').replace('./index-DEfpewR9.js','./report-app.js'));
const schema=JSON.parse(fs.readFileSync(root+'/parity-audit/row-schema.json','utf8'));
fs.writeFileSync(out+'/row-schema.mjs','export default '+JSON.stringify(schema)+';\n');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
fs.writeFileSync(site+'/docs/report-frontend-provenance.json',JSON.stringify({sourceURL:'https://fastfs.org/assets/index-DEfpewR9.js',sourceSHA256:sha(source),modifiedSHA256:sha(result),cssSHA256:sha(fs.readFileSync(out+'/report-reference.css')),changes:['vC/gX use SEC adapter','$x disables Guru catalog/key flow','Hash history supports static hosting','Ka removes brand/navigation and adds theme toggle','qW/KW/DW/XW labels query a shared recursive definition graph','Bt uses source/denominator-based TTM EPS rather than summing quarterly EPS','iZ replaces extracted description with local company notes and Latest Price label','ta/uZ/jZ remove footer/promo/version poll','vZ removes static sample banner and branded page title','Bootstrap retains company route and scroll restoration; no health call'],edits:edits.map(({start,end})=>({start,end,unit:'UTF-16 code units'}))},null,2));
const reportHTML=site+'/report.html';fs.writeFileSync(reportHTML,fs.readFileSync(reportHTML,'utf8').replace(/(report-app\.js\?v=)[^"']+/g,'$1'+revision).replace(/(report-enhancements\.css\?v=)[^"']+/g,'$1'+crypto.createHash('sha256').update(fs.readFileSync(out+'/report-enhancements.css')).digest('hex').slice(0,12)));
console.log('Generated standalone frontend; CSS copied byte-for-byte; UI functions retained.');
