/* India domestic reference rate panel; isolated from original forecasting engine. */
(() => {
 'use strict';
 function IndiaMarket({m}) {
  const R=window.React, e=R.createElement, I=window.AurumIndia;
  const [data,setData]=R.useState(null),[error,setError]=R.useState(''),[nonce,reload]=R.useState(0);
  const [location,setLocation]=R.useState('chennai'),[purity,setPurity]=R.useState('22K'),
        [weight,setWeight]=R.useState('8'),[making,setMaking]=R.useState('0'),
        [wastage,setWastage]=R.useState('0'),[applyGst,setApplyGst]=R.useState(true);
  R.useEffect(()=>{
   let active=true;
   const get=async(url)=>{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return r.json();};
   async function refresh(){
    try {
     const snap=await get('data/india-rates.json?cache='+Date.now());
     if(snap?.schema!=='aurumcast-india-rates-v1'||!snap.gold?.grades?.['24K']||!snap.silver?.perKg999)throw Error('Invalid India reference snapshot');
     if(active){setData(snap);setError('');}
    } catch(err){if(active)setError(err.message);}
    const src=await Promise.allSettled([
      get('https://snapdata.dev/api/v1/gold/in/latest.json').then(I.normalizeGold),
      get('https://snapdata.dev/api/v1/silver/in/latest.json').then(I.normalizeSilver)
    ]);
    if(!active)return;
    setData(old=>{
      if(!old)return old;
      const gold=src[0].status==='fulfilled'&&src[0].value.date>=old.gold.date?src[0].value:old.gold;
      const silver=src[1].status==='fulfilled'&&src[1].value.date>=old.silver.date?src[1].value:old.silver;
      return gold===old.gold&&silver===old.silver?old:{...old,gold,silver};
    });
   }
   refresh();const timer=setInterval(refresh,15*60*1000);
   return ()=>{active=false;clearInterval(timer);};
  },[nonce]);
  const cash=(v,dec=0)=>Number.isFinite(v)?'₹'+v.toLocaleString('en-IN',{minimumFractionDigits:dec,maximumFractionDigits:dec}):'—';
  const rateSet=data?.gold?I.goldGrades(data.gold):[];
  const city=data?.city,cityMode=location==='chennai'&&city?.gold?.['24K'];
  const rows=rateSet.map(row=>{
   const cityValue=cityMode?city.gold[row.name]:null;
   return {...row,grams:Number.isFinite(cityValue)?cityValue:row.grams,
     observed:Number.isFinite(cityValue)||row.observed,
     per10g:(Number.isFinite(cityValue)?cityValue:row.grams)*10};
  });
  const slv=data?.silver?I.silverGrades(data.silver):[];
  const cityDay=cityMode?city.date:data?.gold?.date;
  const old=I.ageDays(cityDay)>1;
  const current=rows.find(row=>row.name===purity)||rows[0];
  const bill=current?I.bill({rate:current.grams,weight,charges:making,wastagePct:wastage,gstPct:applyGst?3:0}):null;
  const g24=rows.find(x=>x.name==='24K')?.grams,g22=rows.find(x=>x.name==='22K')?.grams,g18=rows.find(x=>x.name==='18K')?.grams;
  const model24=m.ready?m.rates.k24_999:null,model22=m.ready?m.rates.k22_916:null;
  const difference=I.disparity(g24,model24);
  const topCards=[
   ['24K · 999 gold',g24,'per gram',cityDay],
   ['22K · 916 gold',g22,'per gram',cityDay],
   ['18K · 750 gold',g18,'per gram',cityDay],
   ['Silver · 999',slv[0]?.perKg,'per kilogram',data?.silver?.date]
  ];
  const field=(label,value,update,config={})=>e('label',{className:'ac5-input'},label,e('input',{type:'number',min:0,step:'.01',value,onChange:x=>update(x.target.value),...config}));
  const select=(label,value,update,options)=>e('label',{className:'ac5-input'},label,e('select',{value,onChange:x=>update(x.target.value)},
    ...options.map(([id,name])=>e('option',{key:id,value:id},name))));
  return e('section',{id:'india-market',className:'ac5-india-market','aria-label':'Observed Indian domestic bullion rates'},
    e('header',{className:'ac5-title-row'},
      e('div',null,e('span',{className:'ac5-kicker'},'INDIAN BULLION · PUBLISHED INDICATIVE RATES'),
       e('h2',null,'Actual Indian Gold & Silver References'),
       e('p',null,'Published rupee market prices, not COMEX-to-MCX parity estimates')),
      e('div',{className:'ac5-controls'},
       e('div',{className:'ac5-segments'},
        e('button',{className:location==='chennai'?'active':'',onClick:()=>setLocation('chennai')},'Chennai retail'),
        e('button',{className:location==='india'?'active':'',onClick:()=>setLocation('india')},'India benchmark')),
       e('button',{className:'ac5-refresh',onClick:()=>reload(i=>i+1)},'↻ Refresh'))),
    !data?e('p',{className:'ac5-notice'},error||'Loading independently published Indian reference rates…'):
    e(R.Fragment,null,
      e('div',{className:'ac5-notice'+(old?' stale':'')},
        old?'Historical snapshot · ':'Latest available daily snapshot · ',
        cityDay,' · ',cityMode?'Chennai indicative retail (Goodreturns)':'India third-party IBJA-attributed benchmark',
        ' · ',data.gold.grades['24K'].status||'indicative',
        '. Silver benchmark dated ',data.silver.date,'. Not an MCX tick or a jeweller quote.'),
      e('div',{className:'ac5-cards'},...topCards.map(([name,value,unit,date])=>
       e('article',{className:'ac5-rate-card',key:name},
        e('small',null,name),e('strong',null,cash(value,value&&value<1000?2:0)),
        e('span',null,unit,' · ',date||'unavailable')))),
      e('div',{className:'ac5-body'},
       e('section',{className:'ac5-panel'},
        e('h3',null,'Gold rate by purity'),
        e('div',{className:'ac5-scroll'},e('table',{className:'ac5-table'},
         e('thead',null,e('tr',null,...['Grade','₹/g','8g pavan','10g','With GST /g','Basis'].map(t=>e('th',{key:t},t)))),
         e('tbody',null,...rows.map(row=>e('tr',{key:row.name},
          e('td',null,row.name+' · '+row.hallmark),
          e('td',null,cash(row.grams,2)),e('td',null,cash(row.grams*8)),
          e('td',null,cash(row.grams*10)),e('td',null,cash(row.grams*1.03,2)),
          e('td',null,row.observed?'Published':'Derived')))))),
        e('p',{className:'ac5-small'},'22K and 18K retain their published grade quotes. Unquoted grades are 24K purity-adjusted estimates, not additional retailer observations.')),
       e('section',{className:'ac5-panel'},
        e('h3',null,'Indian jewellery price calculator'),
        e('div',{className:'ac5-form'},
         select('Gold purity',purity,setPurity,rows.map(row=>[row.name,row.name+' · '+row.hallmark])),
         field('Weight in grams',weight,setWeight),
         field('Making ₹ total',making,setMaking),
         field('Wastage %',wastage,setWastage)),
        e('label',{className:'ac5-check'},
         e('input',{type:'checkbox',checked:applyGst,onChange:x=>setApplyGst(x.target.checked)}),' Include illustrative 3% GST'),
        bill?e('div',{className:'ac5-bill'},
         ...[['Metal value',bill.metal],['Wastage',bill.wastage],['Making',bill.making],
            ['GST',bill.gst],['Estimated total',bill.total]].map(([name,v])=>
            e('div',{key:name,className:name==='Estimated total'?'ac5-total':''},name,e('b',null,cash(v,2))))):'No validated rate',
        e('p',{className:'ac5-small'},'Sample estimate only; verify making, wastage, stones and final GST on your jeweller invoice.'))),
      e('div',{className:'ac5-compare'},
       e('h3',null,'India market vs AurumCast import parity'),
       e('div',{className:'ac5-compare-grid'},
        e('span',null,'24K Indian rate ',e('b',null,cash(g24,2))),
        e('span',null,'24K calculated parity ',e('b',null,cash(model24,2))),
        e('span',null,'Difference ',e('b',null,difference?cash(difference.difference,2)+' ('+difference.pct.toFixed(2)+'%)':'Loading model')),
        e('span',null,'22K Indian rate ',e('b',null,cash(g22,2))),
        e('span',null,'22K calculated parity ',e('b',null,cash(model22,2)))),
       e('p',{className:'ac5-small'},'An estimated import-parity figure is NOT an observed MCX futures quote or retail bullion rate.')),
      e('div',{className:'ac5-silver'},
       e('h3',null,'Indian silver purity benchmarks'),
       e('div',{className:'ac5-silver-row'},...slv.map(row=>
        e('div',{key:row.name},e('span',null,row.name),
          e('strong',null,cash(row.perGram,2),' /g'),
          e('small',null,cash(row.perKg,0),' /kg')))),
       e('p',{className:'ac5-small'},'999: published daily silver benchmark. 925 sterling and 915 are calculated metal-content equivalents, before tax and retail premium.')),
      e('div',{className:'ac5-foot'},
       e('a',{href:cityMode?city.sourceUrl:data.gold.sourceUrl,target:'_blank',rel:'noopener noreferrer'},'Gold reference / source'),
       e('a',{href:data.silver.sourceUrl,target:'_blank',rel:'noopener noreferrer'},'Silver benchmark source'),
       e('span',null,'If a feed is late, its publication date remains visible.'))));
 }
 window.AurumIndiaWidget=IndiaMarket;
})();
