// Only reviewed offline bindings carry mapping_approved + a target key.
const indexes=new WeakMap();
export function sourceNames(data,names,key){
 let index=indexes.get(data);
 if(!index){index=new Map();for(const[name,fact]of Object.entries(data.facts||{}))if(fact.mapping_approved)for(const points of Object.values(fact.units||{}))for(const p of points)if(p.mapping_key){if(!index.has(p.mapping_key))index.set(p.mapping_key,new Set());index.get(p.mapping_key).add(name);}indexes.set(data,index);}
 return [...new Set([...names,...(index.get(key)||[])])];
}
