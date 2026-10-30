"""Adversarial extraction guards, using small synthetic structured filings."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'/'filing-cache'))
from extract import extract
metadata={'record':{'cik':'1','ticker':'TEST'},'filing':{'accession':'0000000001-26-000001','form':'10-K','date':'2026-02-01','period':'2025-12-31','url':'https://www.sec.gov/Archives/edgar/data/1/000000000126000001/source.htm'}}
header='''<html xmlns:us-gaap="http://fasb.org/us-gaap/2025"><body><context id="c"><entity><identifier scheme="http://www.sec.gov/CIK">1</identifier></entity><period><startDate>2025-01-01</startDate><endDate>2025-12-31</endDate></period></context><unit id="u"><measure>iso4217:USD</measure></unit>'''
def fact(name,value):return f'<tr><td>{name}</td><td><ix:nonFraction name="us-gaap:{name}" contextRef="c" unitRef="u">{value}</ix:nonFraction></td></tr>'
primary='<h2>Consolidated Statements of Income</h2><table>'+fact('NetIncomeLoss',100)+fact('EarningsPerShareDiluted',2)+'</table>'
summary='<h2>Selected financial data</h2><table>'+fact('NetIncomeLoss',999)+fact('EarningsPerShareDiluted',999)+fact('Revenues',999)+fact('OperatingIncomeLoss',999)+'</table>'
result=extract((header+primary+summary+'</body></html>').encode(),metadata)
assert result['selected_statements'].get('income_statement')==0,'A larger financial summary must not win over the captioned statement'
assert [p['value'] for p in result['facts'] if p['name']=='NetIncomeLoss' and p['statement']=='income_statement']==[100]
ambiguous=extract((header+primary+primary+'</body></html>').encode(),metadata)
assert 'income_statement' not in ambiguous['selected_statements'],'Ambiguous captioned statement tables must be withheld'
try:extract((header.replace('>1</identifier>','>2</identifier>')+primary+'</body></html>').encode(),metadata)
except ValueError:pass
else:raise AssertionError('Wrong issuer must be rejected')
print('Offline extraction guards pass: competing summary table, ambiguous primary tables and wrong issuer.')

# Continuation across page/table boundaries must retain both halves, while
# unrelated or conflicting halves must never be assembled into a statement.
instant=header.replace('<startDate>2025-01-01</startDate><endDate>2025-12-31</endDate>','<instant>2025-12-31</instant>')
asset='<h2>Consolidated Balance Sheets</h2><table>'+fact('CashAndCashEquivalentsAtCarryingValue',10)+fact('AssetsCurrent',30)+fact('Assets',100)+'</table>'
liability='<h2>Consolidated Balance Sheets</h2><table>'+fact('LiabilitiesCurrent',20)+fact('StockholdersEquity',60)+fact('LiabilitiesAndStockholdersEquity',100)+'</table>'
def split_result(a=asset,b=liability,prefix=instant):return extract((prefix+a+b+'</body></html>').encode(),metadata)
split=split_result()
assert split['statement_evidence']['balance_sheet']['tables']==[0,1]
assert {f['name'] for f in split['facts'] if f['statement']=='balance_sheet'}=={'CashAndCashEquivalentsAtCarryingValue','AssetsCurrent','Assets','LiabilitiesCurrent','StockholdersEquity','LiabilitiesAndStockholdersEquity'}
for result in [split_result(b=liability.replace('>100<','>99<')),split_result(b=liability.replace('Consolidated Balance Sheets','Selected financial data')),split_result(b=liability.replace('contextRef="c"','contextRef="unknown"')),split_result(b='<table>'+fact('Revenues',50)+'</table>'+liability),split_result(a=asset.replace('</table>',fact('StockholdersEquity',55)+'</table>')),split_result(prefix=instant.replace('http://fasb.org/us-gaap/2025','http://example.com/fasb.org/us-gaap/2025')),split_result(a=asset+liability+asset)]:
 assert 'balance_sheet' not in result['selected_statements'],'Unproven/conflicting/nonadjacent/ambiguous halves must be withheld'
print('Split balance-sheet guards pass: verified complementary tables, dates/units/namespace, conflicts, adjacency and ambiguity.')

# Context IDs and unit IDs are document-wide identifiers. Conflicting duplicate
# declarations must not inherit the first issuer scope or the last currency.
foreign_context='<context id="c"><entity><identifier scheme="http://www.sec.gov/CIK">2</identifier></entity><period><instant>2025-12-31</instant></period></context>'
for malformed in [instant+foreign_context+asset+liability,instant.replace('<body>','<body>'+foreign_context)+asset+liability,instant+'<unit id="u"><measure>iso4217:EUR</measure></unit>'+asset+liability]:
 try:extract((malformed+'</body></html>').encode(),metadata)
 except ValueError as error:assert 'Conflicting duplicate' in str(error)
 else:raise AssertionError('Conflicting document identifiers must not misattribute a split statement')
# Repeated equivalent context declarations do not introduce ambiguity.
same_context='<context id="c"><entity><identifier scheme="http://www.sec.gov/CIK">1</identifier></entity><period><instant>2025-12-31</instant></period></context>'
assert split_result(prefix=instant+same_context)['statement_evidence']['balance_sheet']['tables']==[0,1]
# Prefix aliases can denote the same QName. A conflicting duplicate remains a
# conflict even if the issuer uses two prefixes for the same taxonomy URI.
aliased=instant.replace('<body>','<body>').replace('xmlns:us-gaap="http://fasb.org/us-gaap/2025"','xmlns:us-gaap="http://fasb.org/us-gaap/2025" xmlns:alias="http://fasb.org/us-gaap/2025"')
contradictory_alias=liability.replace('</table>',fact('CashAndCashEquivalentsAtCarryingValue',11).replace('us-gaap:CashAndCashEquivalentsAtCarryingValue','alias:CashAndCashEquivalentsAtCarryingValue')+'</table>')
assert 'balance_sheet' not in split_result(b=contradictory_alias,prefix=aliased)['selected_statements'],'Equivalent namespace aliases cannot conceal a conflicting duplicate'
print('Document identity guards pass: duplicate context/unit contradictions rejected; equal resources retained; aliased QName conflicts withheld.')

assert split_result(prefix=instant.replace('xmlns:us-gaap=', 'xmlns:us-gaap = '))['statement_evidence']['balance_sheet']['tables']==[0,1],'Legal namespace declaration whitespace must preserve the same identity'
