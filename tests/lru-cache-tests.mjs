import assert from 'node:assert/strict';
import {LruCache} from '../assets/report/lru-cache.mjs';
const cache=new LruCache(2);cache.set('a',1).set('b',2);assert.equal(cache.get('a'),1);cache.set('c',3);assert.equal(cache.has('b'),false);assert.equal(cache.has('a'),true);cache.set('a',4);cache.set('d',5);assert.equal(cache.has('c'),false);assert.equal(cache.size,2);assert.equal(cache.get('missing'),undefined);assert.equal(cache.get('a'),4);assert.throws(()=>new LruCache(0));
console.log('LRU access promotion, capacity, replacement and misses pass.');
