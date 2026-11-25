/* AurumCast India domestic market normalization and bill math. Pure module. */
const AurumIndia = (() => {
 const finite = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
 const codes = { 'XAU.24K':'24K', 'XAU.22K':'22K', 'XAU.18K':'18K' };
 const supported = ['24K','22K','18K'];
 function normalizeGold(raw){
  if(raw?.dataset!=='gold'||raw?.scope!=='in'||raw?.unit?.currency!=='INR'||raw?.unit?.quantity!=='gram'||!Array.isArray(raw.observations))throw Error('Wrong India gold dataset/units');
  const rows={}, dates=new Set();
  for(const o of raw.observations){
   const grade=codes[o.instrument];
   if(!grade||!finite(o.value)||o.value<1000||o.value>100000||!/^\d{4}-\d\d-\d\d$/.test(o.date)||o.is_trading_day===false)continue;
   rows[grade]={value:o.value,status:o.status||'unknown',date:o.date,changePct:Number.isFinite(o.change_pct)?o.change_pct:null};
   dates.add(o.date);
  }
  if(supported.some(k=>!rows[k])||dates.size!==1)throw Error('Missing gold grades or inconsistent dates');
  if(!(rows['24K'].value>rows['22K'].value&&rows['22K'].value>rows['18K'].value))throw Error('Inconsistent gold purity rates');
  return {date:[...dates][0],grades:rows,generatedAt:raw.generated_at||null,
   source:'snapdata.dev (IBJA-attributed provisional republication)',sourceUrl:'https://snapdata.dev/api/v1/gold/in/latest.json',
   note:'Third-party IBJA-attributed daily snapshot; not a licensed official IBJA real-time API.'};
 }
 function normalizeSilver(raw){
  if(raw?.dataset!=='silver'||raw?.scope!=='in'||raw?.unit?.currency!=='INR'||raw?.unit?.quantity!=='kilogram'||!Array.isArray(raw.observations))throw Error('Wrong India silver dataset/units');
  const o=raw.observations.find(v=>v.instrument==='XAG'&&finite(v.value)&&v.value>10000&&v.value<1000000&&v.is_trading_day!==false);
  if(!o||!/^\d{4}-\d\d-\d\d$/.test(o.date))throw Error('Missing or invalid India silver observation');
  return {date:o.date,perKg999:o.value,status:o.status||'unknown',generatedAt:raw.generated_at||null,
   source:'snapdata.dev (IBJA-attributed provisional republication)',sourceUrl:'https://snapdata.dev/api/v1/silver/in/latest.json'};
 }
 function goldGrades(g){
  if(!g?.grades?.['24K'])return [];
  const base=g.grades['24K'].value/.999;
  const known=[['24K','999',.999],['24K (995)','995',.995],['23K','958',.958],['22K','916',.916],['20K','833',.833],['18K','750',.750],['14K','585',.585],['10K','417',.417]];
  return known.map(([name,hallmark,factor])=>{
   const observed=g.grades[name]||null;
   const value=observed?observed.value:base*factor;
   return {name,hallmark,grams:value,per10g:value*10,observed:!!observed,method:observed?'Published grade':'Derived using published 24K/999 fineness',status:observed?.status||'derived'};
  });
 }
 function silverGrades(s){
  if(!finite(s?.perKg999))return [];
  return [['999 Fine',999],['925 Sterling',925],['915 Alloy',915]].map(([name,purity])=>{
   const perGram=s.perKg999/1000*purity/999;
   return {name,purity,perGram,per10g:perGram*10,perKg:perGram*1000,observed:purity===999};
  });
 }
 function ageDays(date,now=Date.now()){
  if(!/^\d{4}-\d\d-\d\d$/.test(date||''))return Infinity;
  return Math.floor((now-Date.parse(date+'T00:00:00Z'))/86400000);
 }
 function bill({rate,weight,charges=0,gstPct=3,wastagePct=0}){
  const safe=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;
  if(!finite(rate))return null;
  const metal=rate*safe(weight),wastage=metal*safe(wastagePct)/100,making=safe(charges),gst=(metal+wastage+making)*safe(gstPct)/100;
  return {metal,wastage,making,gst,total:metal+wastage+making+gst};
 }
 function disparity(observed,model){
  return finite(observed)&&finite(model)?{difference:observed-model,pct:(observed/model-1)*100}:null;
 }
 return {normalizeGold,normalizeSilver,goldGrades,silverGrades,ageDays,bill,disparity};
})();
if(typeof module!=='undefined')module.exports=AurumIndia;
