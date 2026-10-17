"""Fetch selected public economic observations for a static, dated catalogue."""
import argparse,csv,io,json,urllib.request
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--as-of',required=True);args=p.parse_args()
out={'asOf':args.as_of,'vintage':'Latest revised observations at retrieval, not point-in-time vintages.','series':{}}
for code in ['FEDFUNDS','CPIAUCSL','TTLHH']:
    url=f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={code}&cosd=2015-01-01&coed={args.as_of}'
    req=urllib.request.Request(url,headers={'User-Agent':'RoyLiuResearchDesk royrliu@utexas.edu'})
    try:
        with urllib.request.urlopen(req,timeout=40) as r:text=r.read().decode()
        rows=csv.reader(io.StringIO(text));next(rows);points=[{'date':d,'value':float(v)} for d,v in rows if v not in ('','.') and d<=args.as_of]
        if not points:raise ValueError('No observations')
        out['series'][code]=points;print(code,len(points),flush=True)
    except Exception as e:raise RuntimeError(f'{code}: refresh failed; previous snapshot retained') from e
path=Path(__file__).resolve().parents[1]/'assets/research/library/economic.json';temp=path.with_suffix('.tmp');temp.write_text(json.dumps(out,separators=(',',':')));temp.replace(path)
