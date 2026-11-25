import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';const require=createRequire(import.meta.url);
const I=require('../src/india-market.cjs');
test('reject mismatched units and invalid grades',()=>{
 assert.throws(()=>I.normalizeGold({dataset:'gold',scope:'in',unit:{currency:'INR',quantity:'kilogram'},observations:[]}));
 assert.throws(()=>I.normalizeSilver({dataset:'silver',scope:'in',unit:{currency:'INR',quantity:'gram'},observations:[]}));
});
test('India benchmarks preserve independently published grade quotes',()=>{
 const obs=['24K','22K','18K'].map((k,i)=>({instrument:'XAU.'+k,value:[12458,11420,9344][i],date:'2026-11-25',status:'provisional'}));
 const g=I.normalizeGold({dataset:'gold',scope:'in',unit:{quantity:'gram',currency:'INR'},observations:obs});
 const rates=I.goldGrades(g);
 assert.equal(rates.find(x=>x.name==='22K').grams,11420);
 assert.equal(rates.find(x=>x.name==='24K').per10g,124580);
 assert.equal(rates.find(x=>x.name==='20K').observed,false);
});
test('Silver purity follows 999/925/915 and never equals retail price',()=>{
 const s=I.normalizeSilver({dataset:'silver',scope:'in',unit:{quantity:'kilogram',currency:'INR'},observations:[{instrument:'XAG',value:165000,date:'2026-11-25'}]});
 const rows=I.silverGrades(s);
 assert.equal(rows[0].perKg,165000);
 assert.ok(rows[1].perGram>rows[2].perGram&&rows[2].perGram>0);
 assert.ok(Math.abs(rows[1].perGram-165*.925/.999)<1e-9);
});
test('GST total uses metal, wastage and making, with no double-added import duty',()=>{
 const b=I.bill({rate:11420,weight:8,charges:1000,wastagePct:2,gstPct:3});
 assert.ok(Math.abs(b.total-(b.metal+b.wastage+b.making)*1.03)<1e-8);
 assert.equal(I.ageDays('2026-11-25',Date.parse('2026-11-25T12:00:00Z')),0);
});
