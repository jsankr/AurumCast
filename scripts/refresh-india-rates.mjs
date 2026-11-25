import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const I=require('../src/india-market.cjs');
const base=new URL('../',import.meta.url);
const output=new URL('../data/india-rates.json',import.meta.url);
const old=JSON.parse(await readFile(output,'utf8'));
const pull=async url=>{
 const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),15000);
 try{const response=await fetch(url,{signal:ctrl.signal,headers:{Accept:'application/json','User-Agent':'AurumCast/1.0 (India market data reference)'}});
  if(!response.ok)throw Error('HTTP '+response.status);return await response.json();}
 finally{clearTimeout(timeout);}
};
const tasks=await Promise.allSettled([
 pull('https://snapdata.dev/api/v1/gold/in/latest.json').then(I.normalizeGold),
 pull('https://snapdata.dev/api/v1/silver/in/latest.json').then(I.normalizeSilver)
]);
const next={...old};
let changed=false;
for(let i=0;i<2;i++){
 const name=i?'silver':'gold',task=tasks[i];
 if(task.status==='rejected'){console.warn(name+' feed unavailable:',String(task.reason));continue;}
 const candidate=task.value;
 if(candidate.date >= (old[name]?.date||'')){
  if(JSON.stringify(candidate)!==JSON.stringify(old[name])){next[name]=candidate;changed=true;}
 }
}
if(tasks.every(x=>x.status==='rejected'))throw Error('Neither Indian data source could be verified; retaining last dated snapshot');
if(changed){
 next.updatedAt=new Date().toISOString();
 await writeFile(output,JSON.stringify(next,null,2)+'\n');
 console.log('Published dated India reference rates:',next.gold.date,next.silver.date);
}else console.log('No new Indian market observations; file unchanged');
