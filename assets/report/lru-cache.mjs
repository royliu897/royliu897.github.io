// Access promotes an entry; expiry remains the caller's responsibility.
export class LruCache extends Map {
 constructor(limit){super();if(!Number.isInteger(limit)||limit<1)throw Error('Invalid cache capacity');this.limit=limit;}
 get(key){if(!super.has(key))return undefined;const value=super.get(key);super.delete(key);super.set(key,value);return value;}
 set(key,value){super.delete(key);super.set(key,value);while(this.size>this.limit)super.delete(this.keys().next().value);return this;}
}
