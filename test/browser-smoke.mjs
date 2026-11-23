import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const errors=[];
const inspect=async (name,contextOptions,width,height)=>{
 const context=await browser.newContext(contextOptions);
 const page=await context.newPage();
 page.on('pageerror',error=>{errors.push(name+': '+error.message);console.error('PAGE ERROR',name,error.message)});
 page.on('console',msg=>{if(msg.type()==='error')console.error('BROWSER CONSOLE',name,msg.text())});
 page.on('requestfailed',req=>console.error('REQUEST FAILED',name,req.url(),req.failure()?.errorText));
 await page.goto('http://127.0.0.1:8765/',{waitUntil:'load',timeout:60000});
 console.log('INITIAL BROWSER STATE',name,JSON.stringify(await page.evaluate(()=>({
  react:!!window.React,reactDOM:!!window.ReactDOM,echarts:!!window.echarts,
  rootExists:!!document.getElementById('ac-react-root'),
  rootMarkup:document.getElementById('ac-react-root')?.innerHTML.slice(0,350),
  docReady:document.readyState,legacy:!!document.getElementById('main-wrap'),
  versions:document.querySelector('meta[name="aurumcast-ui-release"]')?.content
 }))));
 try{await page.waitForFunction(()=>document.documentElement.classList.contains('ac3-mounted'),{timeout:12000});}
 catch(error){
   mkdirSync('browser-artifacts',{recursive:true});
   await page.screenshot({path:'browser-artifacts/'+name+'-FAILED.png',fullPage:true});
   console.error('FAILED MOUNT',JSON.stringify(await page.evaluate(()=>({
     react:!!window.React,reactDOM:!!window.ReactDOM,echarts:!!window.echarts,
     rootMarkup:document.getElementById('ac-react-root')?.innerHTML.slice(0,800),
     legacyDisplay:getComputedStyle(document.getElementById('main-wrap')).display
   }))));
   throw error;
 }
 const state=await page.evaluate(()=>{
  const legacy=document.getElementById('main-wrap');
  return {
   version:document.querySelector('meta[name="aurumcast-ui-release"]')?.content,
   mounted:document.documentElement.classList.contains('ac3-mounted'),
   oldHomepageHidden:legacy && getComputedStyle(legacy).display==='none',
   nav:!!document.querySelector('.ac2-side nav'),
   hero:!!document.querySelector('.ac2-hero'),
   branded:document.body.textContent.includes('AurumCast v3')
  };
 });
 assert.equal(state.version,'v3-reference-20261123');
 assert.equal(state.mounted,true);
 assert.equal(state.oldHomepageHidden,true,'Old homepage must not appear underneath React');
 assert.equal(state.nav,true);
 assert.equal(state.hero,true);
 assert.equal(state.branded,true);
 mkdirSync('browser-artifacts',{recursive:true});
 await page.screenshot({path:'browser-artifacts/'+name+'.png',fullPage:true});
 console.log(name,JSON.stringify(state));
 await context.close();
};
try{
 await inspect('desktop',{viewport:{width:1728,height:960},deviceScaleFactor:1},1728,960);
 await inspect('mobile',{...devices['iPhone 13']},390,844);
 assert.deepEqual(errors,[],'Client-side unhandled JavaScript exceptions');
 console.log('AurumCast v3 browser smoke PASSED');
}finally{await browser.close();}
