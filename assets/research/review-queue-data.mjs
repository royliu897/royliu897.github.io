export function parseQueue(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\t'||c==='\n')){row.push(cell.trim());cell='';if(c==='\n'){if(row.some(Boolean))rows.push(row);row=[];}}else if(c!=='\r')cell+=c;}
 if(quoted)throw Error('Close the quoted CSV field.');row.push(cell.trim());if(row.some(Boolean))rows.push(row);
 if(!rows.length)throw Error('Paste tickers or choose a CSV file.');
 const header=rows[0].map(x=>x.toLowerCase()),hasHeader=header.includes('ticker')||header.includes('symbol'),ti=hasHeader?Math.max(header.indexOf('ticker'),header.indexOf('symbol')):0,ii=hasHeader?header.indexOf('industry'):2;
 const unique=new Map();for(const r of rows.slice(hasHeader?1:0)){const ticker=(r[ti]||'').toUpperCase();if(!/^[A-Z0-9.^-]{1,24}$/.test(ticker))throw Error(`Invalid ticker: ${ticker||'(empty)'}`);const industry=ii>=0?r[ii]||'Other':'Other';if(unique.has(ticker)&&unique.get(ticker).industry!==industry)throw Error(`Conflicting industries for ${ticker}.`);unique.set(ticker,{ticker,industry});}
 if(!unique.size)throw Error('No companies found.');if(unique.size>5000)throw Error('Limit each list to 5,000 companies.');return [...unique.values()];
}
