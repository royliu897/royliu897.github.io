// Reviewed issuer disclosures can identify a vendor price-history adjustment
// that is not a conversion of the parent's common shares. No ratio is inferred.
export const nonShareActions=Object.freeze([Object.freeze({
 cik:'1048911',ticker:'FDX',date:'2026-06-01',known_at:'2026-06-01',type:'spin_off',
 source_url:'https://www.sec.gov/Archives/edgar/data/1048911/000110465926068519/tm2616055d1_8k.htm',
 accession:'0001104659-26-068519',
 evidence:'Item 2.01: distribution of 80.1% of FedEx Freight; one FDXF share per two FDX shares. No conversion of outstanding FDX common shares.'
})]);
export function verifiedNonShareAction(data,event,knowledge){
 if(event.type!=='unclassified_action'||event.source!=='Yahoo Finance')return null;
 return nonShareActions.find(a=>a.cik===String(Number(data.cik))&&event.date===a.date&&a.known_at<=knowledge)||null;
}
