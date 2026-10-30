import {companies} from './data.mjs?v=3';
const exchanges={AAPL:'Nasdaq',MSFT:'Nasdaq',MCD:'NYSE',KO:'NYSE',CAT:'NYSE',NKE:'NYSE'};
document.getElementById('open-financial-report').onclick=()=>{
 const id=document.getElementById('company').value,company=companies[id],ticker=company?.ticker||id;
 const exchange=company?.exchange||exchanges[ticker]||'SEC';
 window.open('report.html#/company/'+encodeURIComponent(exchange+'.'+ticker),'_blank','noopener');
};
