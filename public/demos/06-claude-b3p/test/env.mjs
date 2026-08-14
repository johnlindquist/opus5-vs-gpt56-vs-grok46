/* Minimal DOM + Canvas 2D stub that lets index.html's <script> block run under
 * Node, so the browser code can be tested without a browser.
 * Exports boot() -> the window.SandAlchemist debug surface. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));

function makeCtx(){
  const noop = () => {};
  return {
    canvas:null,
    imageSmoothingEnabled:true, globalAlpha:1, globalCompositeOperation:'source-over',
    fillStyle:'#000', strokeStyle:'#000', lineWidth:1, filter:'none',
    createImageData(w,h){ return { width:w, height:h, data:new Uint8ClampedArray(w*h*4) }; },
    getImageData(x,y,w,h){ return { width:w, height:h, data:new Uint8ClampedArray(w*h*4) }; },
    putImageData:noop, drawImage:noop, clearRect:noop, fillRect:noop, strokeRect:noop,
    beginPath:noop, arc:noop, stroke:noop, fill:noop, save:noop, restore:noop,
    setLineDash:noop, moveTo:noop, lineTo:noop
  };
}
function makeNode(tag='div'){
  return {
    tagName:String(tag).toUpperCase(), _ctx:null,
    width:0, height:0, value:'', textContent:'', innerHTML:'', hidden:false,
    className:'', type:'', title:'', id:'', dataset:{}, style:{}, children:[],
    classList:{ add(){}, remove(){}, toggle(){}, contains(){return false} },
    getContext(){ if(!this._ctx){ this._ctx = makeCtx(); this._ctx.canvas = this; } return this._ctx; },
    _ls:{},
    addEventListener(t,f){ (this._ls[t] || (this._ls[t]=[])).push(f); },
    removeEventListener(t,f){ const a=this._ls[t]; if(a) a.splice(a.indexOf(f)>>>0,1); },
    dispatchEvent(e){ const a=this._ls[e.type]||[]; for(const f of a) f.call(this,e); return true; },
    setAttribute(k,v){ this['attr_'+k]=v; }, getAttribute(k){ return this['attr_'+k]; },
    appendChild(c){ this.children.push(c); return c; },
    append(...c){ this.children.push(...c); },
    focus(){}, blur(){}, select(){},
    setPointerCapture(){}, releasePointerCapture(){},
    getBoundingClientRect(){ return {left:0,top:0,width:1600,height:900,right:1600,bottom:900}; },
    querySelector(){ return null; }, querySelectorAll(){ return []; }
  };
}

export function boot(){
  const nodes = new Map();
  const document = {
    createElement:(t) => makeNode(t),
    createTextNode:(t) => ({ nodeType:3, textContent:t }),
    getElementById(id){
      if (!nodes.has(id)){ const n = makeNode('div'); n.id = id; nodes.set(id, n); }
      return nodes.get(id);
    },
    addEventListener(){}, removeEventListener(){},
    activeElement:null, body:makeNode('body')
  };
  let raf = 0;
  const winLs = {};
  const window = {
    document,
    addEventListener(t,f){ (winLs[t] || (winLs[t]=[])).push(f); },
    removeEventListener(t,f){ const a=winLs[t]; if(a) a.splice(a.indexOf(f)>>>0,1); },
    matchMedia(){ return { matches:false, addEventListener(){}, addListener(){} }; },
    requestAnimationFrame(){ return ++raf; },   // never schedules: the loop is inert
    cancelAnimationFrame(){}, devicePixelRatio:1
  };
  const sandbox = {
    window, document, console, Math, Date, JSON,
    Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array,
    Float32Array, Float64Array, Uint8ClampedArray, ArrayBuffer, Array, Object,
    Number, String, Boolean, Error, Set, Map,
    requestAnimationFrame: window.requestAnimationFrame,
    Event: class Event { constructor(t){ this.type = t; } }
  };
  sandbox.globalThis = sandbox; sandbox.self = sandbox;
  vm.createContext(sandbox);

  const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no <script> block found in index.html');
  vm.runInContext(m[1], sandbox, { filename:'index.html#script', timeout:30000 });

  const S = sandbox.window.SandAlchemist;
  if (!S) throw new Error('window.SandAlchemist was not exported');

  /* Fire a real keydown through the page's own window listener, so keyboard
     bindings are exercised end-to-end instead of by calling handlers directly. */
  S.key = (key, mods = {}) => {
    let prevented = false;
    const ev = {
      type:'keydown', key,
      shiftKey:!!mods.shift, ctrlKey:!!mods.ctrl, altKey:!!mods.alt, metaKey:!!mods.meta,
      preventDefault(){ prevented = true; }, stopPropagation(){}
    };
    for (const f of (winLs.keydown || [])) f(ev);
    return prevented;
  };
  S.focusCanvas = (on) => { document.activeElement = on ? nodes.get('view') || null : null; };
  S.focusSearch = (on) => {
    const n = document.getElementById('matSearch');
    n.tagName = 'INPUT'; n.type = 'search';   // match the real element
    document.activeElement = on ? n : null;
  };
  S.el = (id) => document.getElementById(id);
  S.click = (id) => { const n = document.getElementById(id); n.dispatchEvent({type:'click'}); };
  return S;
}
