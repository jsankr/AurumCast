/* AurumCast 2.0: React-owned dashboard, charts, purity table, settings and tools.
 * Data comes only from the validated AurumBridge snapshot of the original GE engine.
 * Existing advanced analytics modules are retained until migrated and parity tested.
 */
(() => {
 'use strict';
 if (!window.React || !window.ReactDOM) { document.documentElement.classList.add('ac2-fallback'); console.error('React not loaded; existing dashboard stays available'); return; }
 const R=React, h=R.createElement, useState=R.useState, useEffect=R.useEffect, useRef=R.useRef;
 const nav=[
  ['overview','Dashboard','layout-dashboard'],['monitor','Market Live','activity'],['forecast','Forecast & Prediction','trending-up'],
  ['proof','Backtesting','shield-check'],['analytics','Technical Analysis','chart-no-axes-combined'],['purityCard','Gold Purity & Rates','coins'],
  ['k22Card','22K Prediction','scale'],['invest','Investor Insights','lightbulb'],['data','Data & Sources','database']];
 const money=(n,d=0,unit='₹')=>Number.isFinite(n)?unit+n.toLocaleString(unit==='₹'?'en-IN':'en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
 const pct=(v)=>Number.isFinite(v)?(v>=0?'+':'')+(v*100).toFixed(2)+'%':'—';
 const dataTime=t=>t?new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(t)+' IST':'—';
 const btn=(label,fn,cls='')=>h('button',{type:'button',className:cls,onClick:fn},label);
 function useMarket(){
  const [m,set]=useState(()=>window.AurumBridge?.snapshot()||{ready:false});
  useEffect(()=>{const on=e=>set(e.detail);window.addEventListener('aurum:update',on);set(window.AurumBridge?.snapshot()||{ready:false});return()=>window.removeEventListener('aurum:update',on)},[]);
  return m;
 }
 function Icon({name}){const path={
  'layout-dashboard':'M3 3h8v8H3z M13 3h8v5h-8z M13 10h8v11h-8z M3 13h8v8H3z','activity':'M3 12h4l3-7 4 14 3-7h4','trending-up':'M3 17l6-6 4 4 8-8 M15 7h6v6',
  'shield-check':'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4','chart-no-axes-combined':'M3 3v18h18 M7 15l4-4 3 2 5-6','coins':'M12 8c5 0 9-2 9-4s-4-3-9-3S3 2 3 4s4 4 9 4z M3 4v7c0 2 4 4 9 4s9-2 9-4V4 M3 11v7c0 2 4 4 9 4s9-2 9-4v-7',
  'scale':'M12 3v18 M5 21h14 M3 7h18 M5 7l-3 7h6z M19 7l-3 7h6z','lightbulb':'M9 18h6 M10 22h4 M9 15a7 7 0 1 1 6 0l-1 3h-4z',
  'database':'M3 5c0-2 4-3 9-3s9 1 9 3-4 3-9 3-9-1-9-3z M3 5v7c0 2 4 3 9 3s9-1 9-3V5 M3 12v7c0 2 4 3 9 3s9-1 9-3v-7',
  'settings':'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M4 12l-2-1 2-4 2 1 2-2-1-2 4-2 1 2h3l1-2 4 2-1 2 2 2 2-1 2 4-2 1v3l2 1-2 4-2-1-2 2 1 2-4 2-1-2h-3l-1 2-4-2 1-2-2-2-2 1-2-4 2-1z',
  'refresh-cw':'M20 11a8 8 0 0 0-14-5L3 9 M3 3v6h6 M4 13a8 8 0 0 0 14 5l3-3 M21 21v-6h-6','menu':'M3 6h18 M3 12h18 M3 18h18',
  'x':'M4 4l16 16 M20 4L4 20','search':'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16 M17 17l5 5','bell':'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  'calculator':'M5 2h14v20H5z M8 6h8 M8 11h2 M14 11h2 M8 15h2 M14 15h2 M8 19h2 M14 19h2',
  'target':'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'};
 return h('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:path[name]||path.activity}));}
 function Chart({market,range}){
  const ref=useRef(null);
  useEffect(()=>{
   if(!market.ready||!ref.current||!window.echarts)return;
   let chart=window.echarts.getInstanceByDom(ref.current)||window.echarts.init(ref.current);
   const all=market.candle||[],n=range==='1D'?24:range==='5D'?120:range==='1M'?720:range==='3M'?2160:range==='ALL'?all.length:168;
   const bars=all.slice(-n),dates=bars.map(b=>dataTime(b.t).replace(' IST','')),candles=bars.map(b=>[b.o,b.c,b.l,b.h]);
   const close=bars.map(b=>b.c),average=(count)=>close.map((_,i)=>i<count-1?null:close.slice(i-count+1,i+1).reduce((a,b)=>a+b,0)/count);
   const option={animationDuration:350,backgroundColor:'transparent',
    tooltip:{trigger:'axis',axisPointer:{type:'cross'},backgroundColor:'#151e2b',borderColor:'#526078',textStyle:{color:'#f4f0e8'}},
    legend:{top:1,left:12,textStyle:{color:'#a7afbd'},data:['Gold spot proxy','SMA 20','SMA 50']},
    grid:[{left:60,right:18,top:38,height:'62%'},{left:60,right:18,top:'81%',height:'13%'}],
    xAxis:[{type:'category',data:dates,axisLine:{lineStyle:{color:'#42516a'}},axisLabel:{color:'#8490a0',hideOverlap:true},splitLine:{show:false}},
      {type:'category',gridIndex:1,data:dates,axisLabel:{show:false},axisLine:{show:false}}],
    yAxis:[{scale:true,axisLabel:{color:'#8490a0',formatter:v=>'$'+Math.round(v).toLocaleString()},splitLine:{lineStyle:{color:'rgba(255,255,255,.07)'}}},
      {scale:true,gridIndex:1,axisLabel:{show:false},splitLine:{show:false}}],
    dataZoom:[{type:'inside',xAxisIndex:[0,1]}],
    series:[{name:'Gold spot proxy',type:'candlestick',data:candles,itemStyle:{color:'#20c78d',color0:'#f16672',borderColor:'#20c78d',borderColor0:'#f16672'}},
      {name:'SMA 20',type:'line',data:average(20),showSymbol:false,lineStyle:{color:'#53b8ff',width:1.6},itemStyle:{color:'#53b8ff'}},
      {name:'SMA 50',type:'line',data:average(50),showSymbol:false,lineStyle:{color:'#f2b84b',width:1.6},itemStyle:{color:'#f2b84b'}},
      {name:'Volume',type:'bar',data:bars.map(b=>({value:b.v,itemStyle:{color:b.c>=b.o?'rgba(32,199,141,.42)':'rgba(241,102,114,.38)'}})),xAxisIndex:1,yAxisIndex:1,barMaxWidth:9}]};
   chart.setOption(option,true);
   const observer=new ResizeObserver(()=>chart.resize());observer.observe(ref.current);
   return()=>{observer.disconnect();if(!chart.isDisposed())chart.dispose()};
  },[market,range]);
  return h('div',{ref,className:'ac-native-chart',role:'img','aria-label':'Gold proxy candlestick price chart with SMA 20 and SMA 50 and volume'});
 }
 function Metric({title,value,secondary,positive,icon}){return h('article',{className:'ac2-metric'},h('span',{className:'ac2-metric-icon'},icon||'◆'),
  h('div',{className:'ac2-metric-info'},h('div',{className:'ac2-muted'},title),h('strong',null,value),h('small',{className:positive===null?'':positive?'positive':'negative'},secondary||'—')));}
 function RateTable({m}){
  const rows=[['24K · 99.99%','k24_9999',true],['24K · 99.9%','k24_999',true],['MCX · 99.5% parity','mcx995',false],['22K · 91.6%','k22_916',true],['Fine gold · international','fineIntl',false]];
  return h('div',{className:'ac2-table-wrap'},h('table',{className:'ac2-table'},h('thead',null,h('tr',null,
   ['Grade','₹ / gram','₹ / 10 gram','Including 3% GST / gram'].map(x=>h('th',{key:x},x)))),
   h('tbody',null,rows.map(([name,key,gst])=>h('tr',{key},h('td',null,name),h('td',null,money(m.rates[key],2)),h('td',null,money(m.rates[key]*10)),h('td',null,gst?money(m.rates[key]*1.03,2):'—'))))));
 }
 function Calculator({m}){
  const [grams,setGrams]=useState(10),[purity,setPurity]=useState('k22_916'),[make,setMake]=useState(0);
  const g=Math.max(0,+grams||0),making=Math.max(0,+make||0),raw=g*m.rates[purity],gst=raw*.03;
  return h('div',{className:'ac2-calculator'},
   h('div',{className:'ac2-fields'},h('label',null,'Weight (grams)',h('input',{type:'number',min:0,step:.1,value:grams,onChange:e=>setGrams(e.target.value)})),
   h('label',null,'Purity',h('select',{value:purity,onChange:e=>setPurity(e.target.value)},[['k22_916','22K · 916'],['k24_999','24K · 999'],['k24_9999','24K · 999.9'],['mcx995','MCX 995 parity']].map(([k,v])=>h('option',{value:k,key:k},v)))),
   h('label',null,'Making charges (₹)',h('input',{type:'number',min:0,value:make,onChange:e=>setMake(e.target.value)}))),
   h('div',{className:'ac2-receipt'},h('span',null,'Metal',h('b',null,money(raw,2))),h('span',null,'Estimated GST on metal',h('b',null,money(gst,2))),
   h('span',null,'Making charges (before any applicable taxes)',h('b',null,money(making,2))),
   h('span',{className:'total'},'Illustrative subtotal',h('b',null,money(raw+gst+making,2)))),
   h('p',{className:'ac2-disclaimer'},'Indicative metal parity only. Retail jeweller rates, making charges, applicable tax treatment and fees may differ.'));
 }
 function Settings({m,close}){
  const [duty,setDuty]=useState(m.duty),[hours,setHours]=useState(m.hours),[auto,setAuto]=useState(m.auto),[quote,setQuote]=useState(''),[theme,setTheme]=useState(m.theme||'aurum');
  return h('div',{className:'ac2-modal-back',onMouseDown:e=>{if(e.target===e.currentTarget)close()}},h('section',{className:'ac2-modal',role:'dialog','aria-modal':true,'aria-label':'Market settings'},
    h('header',null,h('div',null,h('h2',null,'Market settings'),h('p',null,'Changes recalculate parity and forecasts using the same engine.')),btn(h(Icon,{name:'x'}),close,'ac2-square')),
    h('label',null,'Import duty (%)',h('input',{type:'number',value:duty,min:0,max:49.99,step:.25,onChange:e=>setDuty(e.target.value)})),
    h('label',null,'Hourly history',h('select',{value:hours,onChange:e=>setHours(+e.target.value)},[1000,2000,3000].map(n=>h('option',{key:n,value:n},n+' hours')))),
    h('label',{className:'ac2-toggle'},h('input',{type:'checkbox',checked:!!auto,onChange:e=>setAuto(e.target.checked)}),'Automatic market refresh'),
    h('label',null,'Visual theme',h('select',{value:theme,onChange:e=>setTheme(e.target.value)},[['aurum','Aurum Night'],['obsidian','Obsidian'],['rose','Rose Quartz'],['ivory','Ivory Glass']].map(([value,title])=>h('option',{key:value,value},title)))),
    h('div',{className:'ac2-actions'},btn('Save settings',()=>{window.AurumBridge.configure({duty:+duty,hours:+hours,auto});window.AurumBridge.setTheme(theme);close()},'ac2-gold-btn')),
    h('hr'),h('h3',null,'Broker quote calibration'),h('p',null,'Optional actual MCX 995 price per 10 g. Apply only if your quote is from the correct contract.'),
    h('label',null,'Actual MCX / 10 g (₹)',h('input',{type:'number',value:quote,onChange:e=>setQuote(e.target.value)})),
    h('div',{className:'ac2-actions'},btn('Calibrate',()=>{if(window.AurumBridge.calibrate(+quote))close()},'ac2-gold-btn'),btn('Clear calibration',()=>window.AurumBridge.configure({calibration:0}))),
    h('hr'),btn('Clear locally stored prediction ledger',()=>{if(window.confirm('Clear predictions saved in this browser?'))window.AurumBridge.clearLedger()}),
    h('p',{className:'ac2-disclaimer'},'Your custom preferences and prediction ledger are stored in this browser.')));}
 function LineChart({rows,fields,title,percent=false}){
  const ref=useRef(null);
  useEffect(()=>{
    if(!rows?.length||!ref.current||!window.echarts)return;
    const chart=window.echarts.init(ref.current);
    const colors=['#e6b861','#60bffa','#47cc9c','#ed7c7f'];
    chart.setOption({backgroundColor:'transparent',animationDuration:300,
      tooltip:{trigger:'axis',backgroundColor:'#172232',borderColor:'#485566',textStyle:{color:'#f2f4f6'}},
      legend:{top:0,left:12,textStyle:{color:'#aeb6c4'},data:fields.map(f=>f.label)},
      grid:{top:42,left:65,right:18,bottom:48},
      xAxis:{type:'category',data:rows.map(r=>r.date),axisLabel:{color:'#a1aab8',hideOverlap:true},axisLine:{lineStyle:{color:'#3b495a'}}},
      yAxis:{type:'value',scale:true,axisLabel:{color:'#a1aab8',formatter:v=>percent?v.toFixed(0):'₹'+Math.round(v).toLocaleString('en-IN')},splitLine:{lineStyle:{color:'rgba(255,255,255,.07)'}}},
      dataZoom:[{type:'inside'},{type:'slider',height:12,bottom:10,borderColor:'#364358',fillerColor:'rgba(237,185,94,.11)',textStyle:{color:'#97a0b0'}}],
      series:fields.map((f,i)=>({name:f.label,type:'line',data:rows.map(r=>Number.isFinite(r[f.key])?r[f.key]:null),
        connectNulls:false,showSymbol:false,lineStyle:{color:colors[i%colors.length],width:1.8},
        itemStyle:{color:colors[i%colors.length]}}))
    },true);
    const obs=new ResizeObserver(()=>chart.resize());obs.observe(ref.current);
    return()=>{obs.disconnect();chart.dispose()};
  },[rows,fields,title,percent]);
  return h('div',{ref,className:'ac2-linechart',role:'img','aria-label':title});
 }
 const historicalFields=[{key:'mcx',label:'MCX parity · ₹/10g'}];
 const backtestFields=[{key:'predicted',label:'Predicted'},{key:'actual',label:'Actual'},{key:'lower',label:'Lower 68%'},{key:'upper',label:'Upper 68%'}];
 const rsiFields=[{key:'rsi',label:'RSI (14)'}];
 function NativeAnalytics({m}){
  const [tab,setTab]=useState('backtest');
  const rows=m.analysis?.daily||[];
  const indicators=rows.map((r,i)=>({...r,rsi:m.analysis?.rsi?.[i]??null,macd:m.analysis?.macd?.[i]??null}));
  return h('section',{className:'ac2-panel ac2-toolspanel',id:'ac2-native-analytics'},
    h('div',{className:'ac2-panel-head'},h('div',null,h('h2',null,'Technical & walk-forward analytics'),
      h('p',null,'Native React charts sourced from the original model and historical market series.')),
      h('div',{className:'ac2-ranges'},btn('Backtesting',()=>setTab('backtest'),tab==='backtest'?'active':''),
        btn('Technical indicators',()=>setTab('technical'),tab==='technical'?'active':''))),
    tab==='backtest'?
      h('div',{className:'ac2-analytics-grid'},h('div',null,h('h3',null,'Predicted vs actual MCX import parity'),
        h(LineChart,{rows:m.analysis?.backtest||[],fields:backtestFields,title:'Walk-forward predicted vs actual MCX parity with 68 percent interval'})),
        h('aside',{className:'ac2-analytics-context'},'Backtest uses out-of-sample ensemble predictions. Its uncertainty bands are estimates, not guarantees. Historical values use today’s duty and calibration for consistent comparison.')):
      h('div',{className:'ac2-analytics-grid'},h('div',null,h('h3',null,'MCX parity · last 260 trading sessions'),
        h(LineChart,{rows:indicators,fields:historicalFields,title:'Historical daily MCX import parity'})),
        h('div',null,h('h3',null,'Relative Strength Index · 14 sessions'),
        h(LineChart,{rows:indicators,fields:rsiFields,title:'RSI 14 daily momentum indicator',percent:true}))),
    h('p',{className:'ac2-disclaimer'},'The underlying COMEX-equivalent price series is a spot-adjusted PAXG proxy. Exchange futures quotes require a licensed feed.'));
 }
 function EvidenceTables({m}){
  const [tab,setTab]=useState('factors');
  const rows=tab==='factors'?(m.factors||[]):(m.ledger||[]).slice().reverse().slice(0,40);
  return h('section',{className:'ac2-panel ac2-toolspanel',id:'ac2-evidence-tables'},
   h('div',{className:'ac2-panel-head'},h('div',null,h('h2',null,'Transparent model & investor evidence'),
     h('p',null,'Inspect the actual rules-based factors and forecasts saved in this browser.')),
     h('div',{className:'ac2-ranges'},btn('Factor breakdown',()=>setTab('factors'),tab==='factors'?'active':''),
       btn('Prediction ledger',()=>setTab('ledger'),tab==='ledger'?'active':''))),
   h('div',{className:'ac2-table-wrap'},tab==='factors'?
     h('table',{className:'ac2-table'},h('thead',null,h('tr',null,['Factor','Contribution','Weight','Explanation'].map(n=>h('th',{key:n},n)))),
       h('tbody',null,rows.map((r,i)=>h('tr',{key:i},h('td',null,r.name),h('td',null,pct(r.score/1)),h('td',null,pct(r.weight)),
         h('td',{className:'ac2-explanation'},r.reason))))):
     h('table',{className:'ac2-table'},h('thead',null,h('tr',null,['Target date','Forecast parity','Actual parity','Within 68% band'].map(n=>h('th',{key:n},n)))),
       h('tbody',null,rows.length?rows.map((r,i)=>h('tr',{key:i},
         h('td',null,r.target),h('td',null,money(r.predicted,2)),h('td',null,r.actual==null?'Pending':money(r.actual,2)),
         h('td',null,r.actual==null?'Pending':r.actual>=r.lo68&&r.actual<=r.hi68?'Yes':'No'))):
         h('tr',null,h('td',{colSpan:4},'No locally scored forecast records yet.'))))),
   h('p',{className:'ac2-disclaimer'},'The forecast ledger is browser-local. Factor weights and numbers are generated from the original market engine.'));
 }
 function Dashboard({m,go,onAlerts}){
  const [range,setRange]=useState('1M'),[instrument,setInstrument]=useState('gold'),[term,setTerm]=useState(0),[showSettings,setSettings]=useState(false),[tool,setTool]=useState('prices');
  const [target,setTarget]=useState(0);
  const graded= m.ready?m.rates:{};
  const sentiment=m.ready?(m.score>.05?'Accumulation-leaning':m.score<-.05?'Wait / cautious':'Neutral / mixed'):'Not available';
  const score=m.ready?Math.round(Math.max(-1,Math.min(1,m.score))*100):0;
  return h('div',{className:'ac2-dashboard',id:'ac-dashboard'},
    h('section',{className:'ac2-hero'},h('div',{className:'ac2-hero-copy'},
      h('div',{className:'ac2-eyebrow'},'AURUMCAST · GOLD MARKET INTELLIGENCE'),
      h('h1',null,'Global ',h('em',null,'Gold Market'),' Intelligence'),
      h('p',null,'Live prices • Forecasts • Technicals • Purity • Investor Insights'),
      h('div',{className:'ac2-hero-actions'},h('span',{className:'ac2-live-dot'},'● ',m.ready?'Data received':'Loading market feeds'),
        h('span',null,m.ready?dataTime(m.fetchedAt):'Waiting for validated data'))),
     h('div',{className:'ac2-gold-art','aria-hidden':true},h('div',{className:'ac2-orbit'}),h('div',{className:'ac2-goldbar bar-back'},'AU'),h('div',{className:'ac2-goldbar bar-front'},h('small',null,'FINE GOLD'),h('b',null,'999.9')))),
    !m.ready?h('div',{className:'ac2-loading'},h('p',null,Object.keys(m.errors||{}).length?'Required market data could not be loaded. The dashboard will not show fabricated prices.':'Fetching and validating live gold and FX data. No simulated prices will be shown.'),Object.keys(m.errors||{}).length&&h('div',null,Object.entries(m.errors).map(([k,v])=>h('p',{key:k},k+': '+v)),btn('Retry market data',()=>window.AurumBridge?.refresh(),'ac2-gold-btn'))):h(R.Fragment,null,
      h('div',{className:'ac2-metrics'},
       h(Metric,{title:'Gold · international spot',value:money(m.spot,2,'$')+' /oz',secondary:pct(m.spotChange24h)+' vs prior 24h',positive:m.spotChange24h>=0,icon:'◆'}),
       h(Metric,{title:'MCX · 995 import parity',value:money(m.rates.mcx995*10,0)+' /10g',secondary:pct(m.mcxChange)+' vs previous close',positive:m.mcxChange>=0,icon:'◈'}),
       h(Metric,{title:'Silver · MCX',value:'Unavailable',secondary:'No verified silver feed',positive:null,icon:'◈'}),
       h(Metric,{title:'USD / INR · ECB reference',value:money(m.fx,2,'₹'),secondary:'ECB fix · '+m.fxDate,positive:null,icon:'↗'})),
      h('div',{className:'ac2-main-grid'},h('section',{className:'ac2-panel ac2-chart-panel'},
       h('div',{className:'ac2-panel-head'},h('div',null,h('h2',null,'Gold price & market history'),h('p',null,'XAU-equivalent PAXG / USD · 1-hour candles · live basis adjusted')),
        h('div',{className:'ac2-ranges'},['1D','5D','1M','3M','ALL'].map(r=>btn(r,()=>setRange(r),range===r?'active':'')))),
       h('div',{className:'ac3-instrument-tabs'},[['gold','Gold (XAU)'],['mcx','Gold (MCX)'],['silver','Silver'],['fx','USD/INR']].map(([id,label])=>btn(label,()=>setInstrument(id),instrument===id?'active':''))),
       h('div',{className:'ac2-spotline'},instrument==='silver'?'No verified silver quote':instrument==='mcx'?money(m.rates.mcx995*10)+' /10g':instrument==='fx'?money(m.fx,2,'₹'):money(m.spot,2,'$')),
       instrument==='silver'?h('div',{className:'ac3-unavailable-chart'},'Silver chart requires a verified feed.'):h(Chart,{market:m,range,instrument})),
       h('section',{className:'ac2-panel ac2-forecast'},h('div',{className:'ac2-panel-head'},h('div',null,h('h2',null,h(Icon,{name:'target'}),' Price forecast'),h('p',null,'Next MCX open and next session close'))),
        h('div',{className:'ac2-forecast-value'},money(m.open.mid,0),h('span',null,'₹ / g · MCX parity')),
        h('div',{className:'ac2-range-bar'},h('span',null,'68% interval'),h('b',null,money(m.open.lo68,0)+' – '+money(m.open.hi68,0))),
        h('p',null,'Next open · ',dataTime(m.open.target)),
        h('div',{className:'ac2-forecast-details'},h('span',null,'Next close / 10g',h('b',null,money(m.close.mid))),
        h('span',null,'68% interval / 10g',h('b',null,money(m.close.lo68)+' – '+money(m.close.hi68)))),
        h('p',{className:'ac2-disclaimer'},'Statistical ranges, not guaranteed probabilities or exchange quotes.'))),
      h('div',{className:'ac2-mini-grid'},
       h('section',{className:'ac2-panel ac2-sentiment'},h('h2',null,'Market positioning'),h('p',null,'Rules-based composite, not market-wide sentiment'),
        h('div',{className:'ac2-gauge'},h('div',{className:'ac2-gauge-inner'},h('strong',null,score>0?'+'+score:score),h('small',null,'score / ±100'))),h('b',{className:'ac2-gauge-label'},sentiment),
        btn('Explore investor factors',()=>go('invest'),'ac2-mini-link')),
       h('section',{className:'ac2-panel'},h('h2',null,'Forecast evidence'),h('p',null,'Walk-forward model diagnostics'),
        h('div',{className:'ac2-evidence'},h('span',null,'Theil U vs naive',h('b',null,Number.isFinite(m.accuracy.theilU)?m.accuracy.theilU.toFixed(3):'—')),
         h('span',null,'Diebold–Mariano',h('b',null,Number.isFinite(m.accuracy.dm)?m.accuracy.dm.toFixed(2):'—')),
         h('span',null,'MCX open band coverage',h('b',null,m.openValidation?(m.openValidation.coverage*100).toFixed(1)+'% of '+m.openValidation.n:'Unavailable'))),
        btn('View backtesting',()=>go('proof'),'ac2-mini-link')),
       h('section',{className:'ac2-panel'},h('h2',null,'Quick tools'),h('p',null,'Live parity calculations with current duty and FX'),
        h('div',{className:'ac2-quick-tools'},btn(h(R.Fragment,null,h(Icon,{name:'calculator'}),'Gold calculator'),()=>{setTool('calculator');document.getElementById('ac2-tools')?.scrollIntoView({behavior:'smooth'})}),
        btn(h(R.Fragment,null,h(Icon,{name:'coins'}),'Purity rates'),()=>{setTool('prices');document.getElementById('ac2-tools')?.scrollIntoView({behavior:'smooth'})}),
        btn(h(R.Fragment,null,h(Icon,{name:'target'}),'Forecast explorer'),()=>go('forecast')),
        btn(h(R.Fragment,null,h(Icon,{name:'settings'}),'Settings'),()=>setSettings(true))))),
      h('section',{className:'ac2-panel ac2-toolspanel',id:'ac2-tools'},h('div',{className:'ac2-panel-head'},h('div',null,h('h2',null,'Gold rates & calculators'),h('p',null,'Gold purity conversion with live international reference and Indian landed parity')),
       h('div',{className:'ac2-ranges'},btn('Purity table',()=>setTool('prices'),tool==='prices'?'active':''),btn('Calculator',()=>setTool('calculator'),tool==='calculator'?'active':''))),
       tool==='prices'?h(RateTable,{m}):h(Calculator,{m}),
       h('p',{className:'ac2-disclaimer'},'MCX values are import-parity estimates, not an official MCX market feed. GST is shown separately; making charges vary.'))),
    h(NativeAnalytics,{m}),
    h(EvidenceTables,{m}),
    h('div',{className:'ac2-data-note'},h(Icon,{name:'shield-check'}),m.ready?m.sourceNotice:'Forecast engine and external feeds remain unchanged.'),
    showSettings&&h(Settings,{m,close:()=>setSettings(false)}));
 }
 function App(){
  const m=useMarket(),[selected,setSelected]=useState('overview'),[drawer,setDrawer]=useState(false),[settings,setSettings]=useState(false),[query,setQuery]=useState('');
  const navTo=id=>{
    setDrawer(false);setSelected(id);
    const e=id==='overview'?document.querySelector('#ac-dashboard'):document.getElementById(id);
    e?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  };
  useEffect(()=>{const fn=()=>{const sections=nav.slice(1).map(v=>v[0]);const active=sections.filter(id=>document.getElementById(id)?.getBoundingClientRect().top<170);setSelected(active.at(-1)||'overview')};window.addEventListener('scroll',fn,{passive:true});return()=>window.removeEventListener('scroll',fn)},[]);
  return h(R.Fragment,null,
    h('button',{className:'ac2-mobile-trigger',onClick:()=>setDrawer(true),'aria-label':'Open navigation'},h(Icon,{name:'menu'}),' AurumCast'),
    drawer&&h('div',{className:'ac2-screen',onClick:()=>setDrawer(false)}),
    h('aside',{className:'ac2-side'+(drawer?' open':''),role:'navigation','aria-label':'Application navigation'},
      h('div',{className:'ac2-brand'},h('div',{className:'ac2-brand-symbol'},'Au'),h('div',null,h('strong',null,'AurumCast'),h('small',null,'Gold market intelligence'))),
      h('div',{className:'ac2-nav-kicker'},'WORKSPACE'),
      h('nav',null,nav.map(([id,label,glyph])=>h('button',{key:id,className:selected===id?'active':'',onClick:()=>navTo(id),'aria-current':selected===id?'page':undefined},h(Icon,{name:glyph}),label))),
      h('div',{className:'ac2-side-bottom'},h('p',null,'VERIFIED INPUTS'),h('span',null,'No synthetic or illustrative financial prices are served.'),
       h('div',{className:'ac2-side-version'},'AurumCast · React dashboard'))),
    h('div',{className:'ac2-topbar'},h('div',{className:'ac2-search'},h(Icon,{name:'search'}),
      h('input',{value:query,onChange:e=>setQuery(e.target.value),placeholder:'Search dashboard sections…','aria-label':'Search sections',onKeyDown:e=>{if(e.key==='Enter'){const found=nav.find(n=>n[1].toLowerCase().includes(query.toLowerCase()));if(found)navTo(found[0]);setQuery('')}}}),
      query&&h('div',{className:'ac2-search-results'},nav.filter(n=>n[1].toLowerCase().includes(query.toLowerCase())).map(n=>btn(n[1],()=>{navTo(n[0]);setQuery('')})))),
      h('div',{className:'ac2-top-controls'},h('span',{className:'ac2-status'},'● ',m.ready?'MARKET DATA READY':'UPDATING'),
        btn(h(Icon,{name:'refresh-cw'}),()=>window.AurumBridge?.refresh(),'ac2-square'),
        btn(h(Icon,{name:'settings'}),()=>setSettings(true),'ac2-square'))),
    h('div',{className:'ac2-content'},h(Dashboard,{m,go:navTo})),
    settings&&m.ready&&h(Settings,{m,close:()=>setSettings(false)}));
 }
 const mount=document.getElementById('ac-react-root');if(!mount)return;
 R.createRoot(mount).render(h(App));
})();
