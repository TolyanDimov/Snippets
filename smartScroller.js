// Name: smartScroller
// Desc: Universal autoscroll up/down with container selection and dynamic load support.

(() => {
  const raf = () => new Promise(r => requestAnimationFrame(r));

  const CSS = `
    .ss-panel{position:fixed;right:12px;bottom:12px;z-index:2147483647;display:flex;gap:6px;padding:8px;background:rgba(0,0,0,.76);border-radius:10px;color:#fff;font:13px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.25)}
    .ss-btn{cursor:pointer;border:none;border-radius:8px;padding:6px 10px;background:#212830;color:#fff;font-size:16px;line-height:1;transition:background .15s}
    .ss-btn:hover{background:#161b21}
    .ss-label{opacity:.85;align-self:center;min-width:120px;text-align:center;padding:0 4px;font-size:13px}
    .ss-overlay{position:fixed;z-index:2147483646;pointer-events:none;border:2px dashed rgba(111,66,193,.9);background:rgba(111,66,193,.12);border-radius:6px;transition:.08s}
    .ss-overlay.locked{border:2px solid rgba(58,194,107,.95);background:rgba(58,194,107,.10);box-shadow:0 0 0 2px rgba(58,194,107,.35),0 6px 14px rgba(0,0,0,.12)}
  `;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);

  // panel
  const panel = (() => {
    const box=document.createElement('div'); box.className='ss-panel';
    const mk=(txt,c='')=>{const b=document.createElement('button'); b.className=`ss-btn ${c}`.trim(); b.textContent=txt; return b;};
    const down=mk('↓'), up=mk('↑'), pick=mk('◎'), stop=mk('■'), close=mk('×');
    const label=document.createElement('span'); label.className='ss-label'; label.textContent='ready';
    box.append(down,up,pick,stop,close,label); document.body.appendChild(box);
    return {box,down,up,pick,stop,close,label};
  })();

  // helpers
  function isScrollable(el){
    if(!el) return false;
    const cs=getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden') return false;
    return (el.scrollHeight - el.clientHeight > 8) || (cs.overflowY==='auto' || cs.overflowY==='scroll');
  }
  function nearestScrollable(el){
    for(let n=el;n;n=n.parentElement){
      if(isScrollable(n)) return n;
      if(n===document.body||n===document.documentElement) break;
    }
    return document.scrollingElement || document.documentElement;
  }

  // highlight overlay
  const overlay = (()=>{const ov=document.createElement('div');ov.className='ss-overlay';document.body.appendChild(ov);
    let ro=null,t=null;
    const place=()=>{if(!t)return;const r=t.getBoundingClientRect();ov.style.left=r.left-2+'px';ov.style.top=r.top-2+'px';ov.style.width=r.width+4+'px';ov.style.height=r.height+4+'px';};
    const watch=(el)=>{if(ro){try{ro.disconnect();}catch{}ro=null;}if('ResizeObserver'in window&&el){ro=new ResizeObserver(place);ro.observe(el);} };
    return{
      show(x){t=x;ov.classList.remove('locked');watch(x);place();},
      lock(x){t=x;ov.classList.add('locked');watch(x);place();},
      hide(){ov.style.width=ov.style.height='0px';ov.classList.remove('locked');if(ro){try{ro.disconnect();}catch{}ro=null;}},
      destroy(){ov.remove();if(ro){try{ro.disconnect();}catch{} }}
    };
  })();

  // config
  const cfg={ step:1400, near:4, growWaitDown:2500, growWaitUp:3500, maxIdle:4, maxMs:180000 };

  // wait bottom growth
  function waitForGrowth(el, prevH, ms){
    return new Promise(res=>{
      let done=false;const fin=v=>{if(!done){done=true;cle();res(v);} };
      let ro=null,to=null,p=null;
      const cle=()=>{if(ro){try{ro.disconnect();}catch{}ro=null;}if(to)clearTimeout(to);if(p)clearInterval(p);};
      if('ResizeObserver'in window){
        ro=new ResizeObserver(()=>{if(el.scrollHeight>prevH)fin(true);});
        ro.observe(el);
      } else {
        p=setInterval(()=>{if(el.scrollHeight>prevH)fin(true);},150);
      }
      to=setTimeout(()=>fin(false),ms);
    });
  }

  // wait top insertions
  function waitForUpLoad(el, ms){
    return new Promise(resolve=>{
      const start = performance.now();
      const baseH = el.scrollHeight;
      const baseChild = el.childElementCount;
      const baseFirst = el.firstElementChild;
      const baseKey = baseFirst ? (baseFirst.getAttribute('data-id') || baseFirst.textContent.slice(0,32)) : '';
      let done=false, to=null, mo=null;
      const finish = v => { if(!done){ done=true; cleanup(); resolve(v); } };
      const cleanup = ()=>{ if(to) clearTimeout(to); if(mo){ try{mo.disconnect();}catch{} mo=null; } };
      try{
        mo = new MutationObserver(() => {
          const first = el.firstElementChild;
          const changedFirst = first && (first !== baseFirst);
          const childChanged = el.childElementCount > baseChild;
          const heightGrew  = el.scrollHeight > baseH;
          if (childChanged || changedFirst || heightGrew) finish(true);
        });
        mo.observe(el, {childList:true, subtree:true});
      }catch{}
      to = setTimeout(()=>finish(false), ms);
      const poll = setInterval(()=>{
        const first = el.firstElementChild;
        const key = first ? (first.getAttribute('data-id') || first.textContent.slice(0,32)) : '';
        if (el.childElementCount > baseChild || el.scrollHeight > baseH || key !== baseKey){
          clearInterval(poll); finish(true);
        }
        if (performance.now() - start > ms){ clearInterval(poll); }
      }, 150);
    });
  }

  function doStep(el,d){
    el.dispatchEvent(new WheelEvent('wheel',{deltaY:d,bubbles:true,cancelable:true}));
    if(el===document.body||el===document.documentElement||el===document.scrollingElement){
      window.scrollBy(0,d);
    }else{
      el.scrollTop=Math.max(0,Math.min(el.scrollHeight,el.scrollTop+d));
    }
  }

  // state
  let running=false,dir=null,target=null,picking=false;

  async function run(direction){
    if (!target) target = document.scrollingElement || document.documentElement;
    running=true;dir=direction;panel.label.textContent=direction==='down'?'↓ scrolling':'↑ scrolling';
    const start=performance.now();let idle=0;

    while(running&&dir===direction){
      const delta=direction==='down'?cfg.step:-cfg.step;
      doStep(target,delta);
      await raf();

      const atBottom = target.clientHeight + target.scrollTop >= target.scrollHeight - cfg.near;
      const atTop    = target.scrollTop <= cfg.near;

      if ((direction==='down' && atBottom) || (direction==='up' && atTop)) {
        const waitMs = direction==='down' ? cfg.growWaitDown : cfg.growWaitUp;

        // small nudges on edge
        if (direction==='up') {
          for (let i=0;i<3;i++){ doStep(target, -200); await raf(); }
          target.scrollTop = 0;
        } else {
          for (let i=0;i<2;i++){ doStep(target, +200); await raf(); }
        }

        const grew = direction==='up'
          ? await waitForUpLoad(target, waitMs * (1 + idle*0.5))
          : await waitForGrowth(target, target.scrollHeight, waitMs * (1 + idle*0.5));

        if (!running || dir!==direction) break;
        if (!grew) {
          if (++idle >= cfg.maxIdle) break;
        } else {
          idle = 0;
          if (direction==='up') { target.scrollTop = 0; }
        }
      } else {
        idle = 0;
      }

      if (performance.now()-start > cfg.maxMs){ console.warn('timeout'); break; }
    }

    running=false;dir=null;panel.label.textContent='ready';
  }

  function startPick(){
    if(picking)return;
    picking=true;panel.label.textContent='click to select. Esc cancel';
    overlay.hide();
    const move=(e)=>{const el=document.elementFromPoint(e.clientX,e.clientY);const cand=el?nearestScrollable(el):null;if(cand)overlay.show(cand);};
    const key=(e)=>{if(e.key==='Escape'){stop();panel.label.textContent='cancelled';}};
    const click=(e)=>{e.preventDefault();e.stopPropagation();const el=document.elementFromPoint(e.clientX,e.clientY);const cand=el?nearestScrollable(el):null;
      if(cand){target=cand;overlay.lock(cand);stop();panel.label.textContent='selected';console.log('selected:',target);}};
    const stop=()=>{document.removeEventListener('mousemove',move,true);document.removeEventListener('click',click,true);document.removeEventListener('keydown',key,true);picking=false;};
    document.addEventListener('mousemove',move,true);document.addEventListener('click',click,true);document.addEventListener('keydown',key,true);
  }

  function closeAll(){
    running=false;dir=null;picking=false;
    overlay.destroy();
    panel.box.remove();
    style.remove();
    document.removeEventListener('keydown',escClose,true);
    console.log('smartScroller closed');
  }
  const escClose=(e)=>{if(e.key==='Escape'&&!picking){closeAll();}};
  document.addEventListener('keydown',escClose,true);

  // actions
  panel.down.onclick = ()=>{if(!target)target=document.scrollingElement; if(running&&dir==='down')return; running=false;dir=null;run('down');};
  panel.up.onclick   = ()=>{if(!target)target=document.scrollingElement; if(running&&dir==='up')return; running=false;dir=null;run('up');};
  panel.stop.onclick = ()=>{running=false;dir=null;panel.label.textContent='stopped';};
  panel.pick.onclick = ()=>{running=false;dir=null;startPick();};
  panel.close.onclick= ()=>closeAll();

  console.log('smartScroller ready');
})();
