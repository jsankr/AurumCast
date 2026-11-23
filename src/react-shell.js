/* React-owned navigation, accessibility and presentation shell.
 * Existing DOM charts, settings, live polling, forecast engine and history remain untouched.
 * This is a progressive migration, not a port of the numerical engine.
 */
(function () {
  'use strict';
  if (!window.React || !window.ReactDOM) {
    console.warn('React unavailable; existing AurumCast dashboard remains usable.');
    return;
  }
  const h = React.createElement;
  const items = [
    { id:'overview', label:'Overview', glyph:'◈', desc:'Global and Indian gold prices' },
    { id:'monitor', label:'Live monitor', glyph:'◷', desc:'Intraday moves and hourly candles' },
    { id:'forecast', label:'Forecast studio', glyph:'⌁', desc:'Session outlook and probability ranges' },
    { id:'proof', label:'Model validation', glyph:'▤', desc:'Walk-forward forecast evidence' },
    { id:'analytics', label:'Market analytics', glyph:'▥', desc:'Technical indicators and volatility' },
    { id:'invest', label:'Investor insights', glyph:'◇', desc:'Transparent multi-factor score' },
    { id:'data', label:'Data & methodology', glyph:'⚙', desc:'Sources, assumptions and settings' }
  ];
  const useState = React.useState, useEffect = React.useEffect;
  function shell() {
    const [active,setActive] = useState('overview');
    const [open,setOpen] = useState(false);
    const [clock,setClock] = useState('');
    useEffect(() => {
      const update = () => setClock(new Intl.DateTimeFormat('en-IN', { dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date()) + ' IST');
      update();const tid=setInterval(update,60000);
      const handler=() => {
        const ids=items.map(x=>x.id).filter(x=>x!=='overview');
        const scrolled=ids.filter(id=>{const el=document.getElementById(id);return el&&el.getBoundingClientRect().top<220;});
        setActive(scrolled.length ? scrolled[scrolled.length-1] : 'overview');
      };
      window.addEventListener('scroll',handler,{passive:true});handler();
      return()=>{clearInterval(tid);window.removeEventListener('scroll',handler)};
    },[]);
    function go(id) {
      setOpen(false);setActive(id);
      const target=id==='overview'?document.querySelector('.gstrip'):document.getElementById(id);
      target?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
      history.replaceState(null,'',id==='overview'?location.pathname:'#'+id);
    }
    function clickExisting(id) { document.getElementById(id)?.click(); }
    const side=h('aside',{className:'ac-sidebar'+(open?' open':''),'aria-label':'Main navigation'},
      h('div',{className:'ac-brand'},h('div',{className:'ac-symbol','aria-hidden':'true'},'Au'),
        h('div',null,h('strong',null,'AurumCast'),h('small',null,'Gold intelligence'))),
      h('div',{className:'ac-kicker'},'Workspace'),
      h('nav',{className:'ac-nav'},items.map(it=>h('button',{key:it.id,type:'button',className:active===it.id?'active':'',onClick:()=>go(it.id),title:it.desc,'aria-current':active===it.id?'page':undefined},
        h('span',{className:'ac-icon','aria-hidden':'true'},it.glyph),it.label))),
      h('div',{className:'ac-spacer'}),
      h('div',{className:'ac-info'},h('b',null,'Confidence over certainty'),h('p',null,'Forecast ranges are estimates. Point forecasts have not demonstrated a consistent edge over the naive baseline.')),
      h('div',{className:'ac-foot'},'AURUMCAST · MARKET RESEARCH'));
    return h(React.Fragment,null,
      h('div',{className:'ac-mobile-bar'},h('button',{onClick:()=>setOpen(true),'aria-label':'Open navigation','aria-expanded':open},'☰'),h('span',null,'◈ AurumCast'),h('button',{onClick:()=>clickExisting('setBtn'),'aria-label':'Open settings'},'⚙')),
      h('div',{className:'ac-overlay'+(open?' show':''),onClick:()=>setOpen(false),'aria-hidden':'true'}),
      side,
      h('div',{className:'ac-page-title'},
        h('div',null,h('div',{className:'eyebrow'},'MARKET INTELLIGENCE PLATFORM'),
          h('h1',null,'Gold market overview'),
          h('p',null,'Real-time price intelligence, predictive ranges and model evidence — COMEX to MCX.')),
        h('div',{className:'ac-top-actions'},
          h('span',{className:'ac-timestamp'},clock),
          h('button',{type:'button',onClick:()=>clickExisting('refreshBtn'),'aria-label':'Refresh live market data'},'↻ Refresh'),
          h('button',{type:'button',onClick:()=>clickExisting('setBtn'),'aria-label':'Open dashboard settings'},'⚙ Settings'))));
  }
  const root=document.createElement('div');root.id='ac-shell';document.body.prepend(root);
  const title=document.createElement('div');title.id='ac-react-heading';
  const strip=document.querySelector('.gstrip');
  if(strip)strip.parentNode.insertBefore(title,strip);
  ReactDOM.createRoot(root).render(h(shell));
  /* React owns the shell and heading. Keep heading within dashboard layout. */
  const heading=document.createElement('div');heading.id='ac-title-portal';title.appendChild(heading);
  ReactDOM.createRoot(heading).render(h('div',{className:'ac-page-title'},
    h('div',null,h('div',{className:'eyebrow'},'MARKET INTELLIGENCE PLATFORM'),
      h('h1',null,'Gold market overview'),
      h('p',null,'Real-time price intelligence, predictive ranges and model evidence — COMEX to MCX.'))));
  // Remove duplicate title in the fixed shell to avoid two visible headings.
  const style=document.createElement('style');style.textContent='#ac-shell>.ac-page-title{display:none}';document.head.appendChild(style);
})();
