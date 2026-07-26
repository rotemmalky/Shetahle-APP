// ═══════════════ שטחלה — app v4 ═══════════════
const app = document.getElementById('app');
const impTask = document.getElementById('imp-task');
const impResult = document.getElementById('imp-result');
const toasts = document.getElementById('toasts');
const q = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now()+'-'+Math.random().toString(16).slice(2));
const dateText = ts => ts ? new Intl.DateTimeFormat('he-IL',{dateStyle:'medium'}).format(new Date(ts)) : '';
const b64ToBytes = v => Uint8Array.from(atob(v), c => c.charCodeAt(0));
const dec = new TextDecoder(); const enc = new TextEncoder();
function toast(m, k){ const n=document.createElement('div'); n.className='toast'+(k?' '+k:''); n.textContent=m; toasts.append(n); setTimeout(()=>n.remove(),3600); }

function compressImageFile(file, maxDim, quality){
  maxDim = maxDim || 1920; quality = quality || 0.72;
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
        else { width = Math.round(width * maxDim / height); height = maxDim; }
      }
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      try { resolve(canvas.toDataURL('image/jpeg', quality)); } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image-decode-failed')); };
    img.src = url;
  });
}

// ═══ TASKS (localStorage — small, no photos) ═══
const Store = {
  key:'shtachla3',
  all(){ try { return JSON.parse(localStorage.getItem(this.key)||'[]'); } catch { return []; } },
  save(l){ try { localStorage.setItem(this.key, JSON.stringify(l)); } catch { toast('האחסון מלא — לא נשמר.','warn'); } },
  upsert(t){ const l=this.all(); const i=l.findIndex(x=>x.id===t.id); t.updatedAt=Date.now(); if(i>-1)l[i]=t; else l.push(t); this.save(l); },
  remove(id){ this.save(this.all().filter(x=>x.id!==id)); },
};

// ═══ RESULTS LIBRARY (IndexedDB — the app itself runs on a real https/PWA origin, not file://) ═══
const IDB_NAME='shtachla-db', IDB_VER=1, IDB_STORE='results';
function idbOpen(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)) return reject(new Error('no-idb'));
    const req = indexedDB.open(IDB_NAME, IDB_VER);
    req.onupgradeneeded = () => { const db=req.result; if(!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE,{keyPath:'id'}); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbAll(){ const db=await idbOpen(); return new Promise((res,rej)=>{ const rq=db.transaction(IDB_STORE,'readonly').objectStore(IDB_STORE).getAll(); rq.onsuccess=()=>res(rq.result||[]); rq.onerror=()=>rej(rq.error); }); }
async function idbPut(rec){ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,'readwrite'); tx.objectStore(IDB_STORE).put(rec); tx.oncomplete=()=>res(true); tx.onerror=()=>rej(tx.error); }); }
async function idbDel(id){ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,'readwrite'); tx.objectStore(IDB_STORE).delete(id); tx.oncomplete=()=>res(true); tx.onerror=()=>rej(tx.error); }); }

const ResultsLib = {
  mem: [], broken: false, warned: false,
  async all(){
    if(this.broken) return this.mem.slice().sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
    try { return (await idbAll()).sort((a,b)=>(b.savedAt||0)-(a.savedAt||0)); }
    catch(e){ this.broken=true; return this.mem.slice(); }
  },
  async save(rec){
    rec.savedAt = rec.savedAt || Date.now();
    try { await idbPut(rec); }
    catch(e){
      this.broken = true;
      const i=this.mem.findIndex(x=>x.id===rec.id); if(i>-1) this.mem[i]=rec; else this.mem.push(rec);
      if(!this.warned){ this.warned=true; toast('האחסון הקבוע לא זמין בדפדפן זה — התוצאות יישמרו רק לסשן הנוכחי.','warn'); }
    }
  },
  async remove(id){ try { await idbDel(id); } catch(e){} this.mem = this.mem.filter(x=>x.id!==id); },
  async get(id){ return (await this.all()).find(x=>x.id===id); },
};

function isEmptyAnswer(a){ return a.answer===null||a.answer===undefined||a.answer===''||(Array.isArray(a.answer)&&!a.answer.length); }
function answeredCount(r){ return r.answers.filter(a=>!isEmptyAnswer(a)).length; }
function missingRequired(r){ return r.answers.filter(a=>a.required && isEmptyAnswer(a)).length; }

// ═══ FIELD TYPES / CAMERAS ═══
const FIELD_TYPES = [
  {value:'text',label:'טקסט קצר',icon:'✍️'},{value:'textarea',label:'טקסט ארוך',icon:'📝'},
  {value:'number',label:'מספר',icon:'🔢'},{value:'yesno',label:'כן / לא',icon:'☑️'},
  {value:'select',label:'בחירה',icon:'📋'},{value:'date',label:'תאריך',icon:'📅'},
  {value:'photo',label:'תמונה',icon:'📷'},{value:'gps',label:'מיקום GPS',icon:'📍'},{value:'signature',label:'חתימה',icon:'✒️'},
];
const fIcon = t => (FIELD_TYPES.find(f=>f.value===t)||{}).icon||'•';
const fLabel = t => (FIELD_TYPES.find(f=>f.value===t)||{}).label||t;
const CAM = [['bullet4k','4K BULLET','עדשה רחבה'],['ptz','PTZ','ממונעת'],['lpr','LPR','זיהוי לוחיות'],['dome','DOME','כיפה']];

function siteTemplate(){
  const f=(label,type,o={})=>({id:uid(),label,type,required:!!o.required,section:o.section||'',help:'',options:o.options||null});
  return { id:uid(), kind:'site-survey', title:'תיק אתר — מצלמות', site:'', owner:'', estimated:'כ-30 דקות',
    description:'תיעוד אתר מלא: פרטי פרויקט, מצלמות (עמוד לכל אחת), ארונות ופריסה.',
    cameras:{bullet4k:0,ptz:0,lpr:0,dome:0},
    fields:[
      f('שם האתר','text',{required:true,section:'פרטי פרויקט'}),
      f('מספר אתר','text',{section:'פרטי פרויקט'}),
      f('גרסה (V1/V2)','text',{section:'פרטי פרויקט'}),
      f('כתובת','text',{section:'פרטי פרויקט'}),
      f('מנהל פרויקט','text',{section:'פרטי פרויקט'}),
      f('מהנדס שדה','text',{section:'פרטי פרויקט'}),
      f('תאריך ביצוע','date',{section:'פרטי פרויקט'}),
      {id:uid(),type:'__cameras__',label:'מצלמות',section:'מצלמות'},
      f('ארון ראשי — תמונה','photo',{section:'ארונות'}),
      f('ארון ראשי — מיקום והזנת חשמל','textarea',{section:'ארונות'}),
      f('ארון משני — תמונה','photo',{section:'ארונות'}),
      f('תמונת פריסה / מבט אוויר','photo',{section:'פריסה'}),
      f('תוכנית תשתית / אופטיקה','photo',{section:'פריסה'}),
      f('הערות מסכמות','textarea',{section:'סיכום סיור'}),
      f('חתימת עורך התיק','signature',{required:true,section:'סיכום סיור'}),
    ]};
}
function blankTemplate(){ return {id:uid(),kind:'free',title:'משימת שטח חדשה',site:'',owner:'',estimated:'כ-10 דקות',description:'',fields:[{id:uid(),label:'שאלה ראשונה',type:'text',required:true,section:'',help:''}]}; }

// deterministic ids: regenerating the same task keeps camera-field ids stable, so an in-progress
// runner draft on the field worker's phone still matches after a re-send of the same task.
function expandCameras(task){
  const out=[];
  for(const f of task.fields){
    if(f.type==='__cameras__'){
      const c=task.cameras||{};
      for(const [k,name] of CAM){ for(let i=1;i<=(c[k]||0);i++){ const nn=String(i).padStart(2,'0'); const sec=`מצלמה: ${name} ${nn}`; const base=`${task.id}-cam-${k}-${nn}`;
        out.push({id:base+'-name',label:`${name} ${nn} — שם / מזהה`,type:'text',required:true,section:sec});
        out.push({id:base+'-h',label:`${name} ${nn} — גובה התקנה (מטר)`,type:'number',section:sec});
        out.push({id:base+'-photo',label:`${name} ${nn} — תמונת המצלמה`,type:'photo',required:true,section:sec});
        out.push({id:base+'-roi',label:`${name} ${nn} — תמונת אזור העניין`,type:'photo',section:sec});
        out.push({id:base+'-note',label:`${name} ${nn} — הערה`,type:'textarea',section:sec});
      }}
    } else out.push(f);
  }
  return out;
}
async function getRunner(){ const r=await fetch('./runner-template.html'); if(!r.ok) throw new Error('לא נמצא קובץ המנוע.'); return r.text(); }

async function genFile(task, afterFn){
  const btn = q('#gen'); if(btn){ btn.disabled=true; btn.textContent='מכין…'; }
  try{
    task.updatedAt = Date.now();
    Store.upsert(task);
    const exp = { id:task.id, title:task.title, site:task.site, owner:task.owner, estimated:task.estimated, description:task.description, fields:expandCameras(task) };
    const src = { id:task.id, kind:task.kind, title:task.title, site:task.site, owner:task.owner, estimated:task.estimated, description:task.description, cameras:task.cameras||null, fields:task.fields };
    const tpl = await getRunner();
    const safeTitle = (task.title||'משימת שדה').replace(/[<>]/g,'');
    const taskJson = JSON.stringify(exp).replace(/<\//g,'<\\/');
    const srcJson = JSON.stringify(src).replace(/<\//g,'<\\/');
    // function-form replacers: avoids $-pattern interpretation and keeps </script sequences inert
    const html = tpl.replace('__TITLE__', () => safeTitle).replace('__TASK__', () => taskJson).replace('__TASKSRC__', () => srcJson);
    const fn = (task.title.replace(/[^\p{L}\p{N}]+/gu,'-')||'משימה')+'.html';
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([html],{type:'text/html'})); a.download=fn; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1500);
    toast('הקובץ מוכן. שולחים למבצע בוואטסאפ — כמסמך.','ok');
    if(afterFn) afterFn();
  }catch(e){ toast(e.message||'ההפקה נכשלה.','warn'); }
  finally{ if(btn){ btn.disabled=false; btn.textContent='📄 הפקת קובץ למבצע'; } }
}

// ═══ SHELL: FAB, tabs, sheets ═══
let currentTab='home';
function switchTab(name){
  currentTab=name;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
  if(name==='home') renderHome();
  else if(name==='results') renderResultsTab();
  else renderMoreTab();
}
function openSheetEl(html){
  const bg=document.createElement('div'); bg.className='sheet-bg'; bg.id='sheet-bg';
  bg.innerHTML=`<div class="sheet">${html}</div>`;
  document.body.append(bg);
  bg.addEventListener('click', e=>{ if(e.target===bg) closeSheet(); });
  return bg;
}
function closeSheet(){ const bg=document.getElementById('sheet-bg'); if(bg) bg.remove(); }

function quickActionsSheet(){
  const html = `
    <div class="grab"></div>
    <div class="sheet-head"><b>פעולה חדשה</b><button class="done" id="qa-close" type="button">סגירה</button></div>
    <div class="sheet-body">
      <div class="qa-grid" style="margin-bottom:6px">
        <button class="qa-item primary" id="qa-survey" type="button"><span class="qic">🎥</span><b>תיק אתר חדש</b></button>
        <button class="qa-item" id="qa-blank" type="button"><span class="qic">✦</span><b>משימה מאפס</b></button>
        <button class="qa-item" id="qa-imp" type="button"><span class="qic">⬇️</span><b>ייבוא משימה</b></button>
        <button class="qa-item" id="qa-res" type="button"><span class="qic">🔓</span><b>פתיחת תוצאה</b></button>
      </div>
    </div>`;
  const el = openSheetEl(html);
  el.querySelector('#qa-close').onclick = closeSheet;
  el.querySelector('#qa-survey').onclick = () => { closeSheet(); openWizard(siteTemplate()); };
  el.querySelector('#qa-blank').onclick = () => { closeSheet(); openFieldEditorTask(blankTemplate()); };
  el.querySelector('#qa-imp').onclick = () => { closeSheet(); impTask.click(); };
  el.querySelector('#qa-res').onclick = () => { closeSheet(); impResult.click(); };
}

// ═══ HOME ═══
async function renderHome(){
  const tasks = Store.all().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  const results = await ResultsLib.all();
  const pending = results.filter(r=>!r.reviewedAt);
  const totalMissing = pending.reduce((s,r)=>s+missingRequired(r),0);
  const totalFields = pending.reduce((s,r)=>s+r.answers.length,0);

  const heroHtml = pending.length ? `
    <div class="hero-card">
      <div class="hero-top"><h3>ממתינות לעדכון</h3><button class="hero-arrow" id="hero-go" type="button">←</button></div>
      <div class="hero-stat"><span class="n mono">${pending.length}</span><span class="l">תוצאות חזרו מהשטח</span></div>
      <div class="hero-pills"><span class="pill">📋 <b>${totalFields}</b> שדות בסך הכול</span>${totalMissing?`<span class="pill">⚠️ <b>${totalMissing}</b> שדות חסרים</span>`:''}</div>
    </div>` : `
    <div class="hero-card empty">
      <div class="hero-top"><h3>הכול מסודר</h3><button class="hero-arrow" id="hero-go" type="button">←</button></div>
      <div class="hero-stat"><span class="n mono">0</span><span class="l">תוצאות ממתינות</span></div>
      <div class="hero-pills"><span class="pill">אין מה לעשות כרגע</span></div>
    </div>`;

  const recentResults = results.slice(0,5);
  const resultsListHtml = recentResults.length ? `
    <div class="lcard">
      <div class="lcard-head"><h3>חזרו מהשטח</h3><button class="arrow" id="results-arrow" type="button">←</button></div>
      ${recentResults.map(r=>resultRowHtml(r)).join('')}
    </div>` : '';

  const tasksListHtml = `
    <div class="lcard">
      <div class="lcard-head"><h3>המשימות שלי</h3></div>
      ${tasks.length ? tasks.map(t=>taskRowHtml(t)).join('') : '<div class="empty-note">עדיין אין משימות.<br>התחל מתבנית מוכנה או בנה חדשה.</div>'}
    </div>`;

  const quickHtml = `
    <div class="lcard">
      <div class="lcard-head"><h3>התחלה</h3></div>
      <div class="qa-grid">
        <button class="qa-item primary" id="q-survey" type="button"><span class="qic">🎥</span><b>תיק אתר חדש</b></button>
        <button class="qa-item" id="q-blank" type="button"><span class="qic">✦</span><b>משימה מאפס</b></button>
        <button class="qa-item" id="q-imp" type="button"><span class="qic">⬇️</span><b>ייבוא משימה</b></button>
        <button class="qa-item" id="q-res" type="button"><span class="qic">🔓</span><b>פתיחת תוצאה</b></button>
      </div>
    </div>`;

  app.innerHTML = heroHtml + resultsListHtml + tasksListHtml + quickHtml;

  const heroGo = q('#hero-go'); if(heroGo) heroGo.onclick=()=>switchTab('results');
  const resArrow=q('#results-arrow'); if(resArrow) resArrow.onclick=()=>switchTab('results');
  document.querySelectorAll('[data-viewres]').forEach(b=>b.onclick=()=>viewResult(b.dataset.viewres));
  q('#q-survey').onclick=()=>openWizard(siteTemplate());
  q('#q-blank').onclick=()=>openFieldEditorTask(blankTemplate());
  q('#q-imp').onclick=()=>impTask.click();
  q('#q-res').onclick=()=>impResult.click();
  document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{ const t=Store.all().find(x=>x.id===b.dataset.open); if(t){ if(t.kind==='site-survey') openWizard(t,1); else openFieldEditorTask(t); } });
  document.querySelectorAll('[data-dup]').forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); const t=Store.all().find(x=>x.id===b.dataset.dup); if(!t)return; const c=structuredClone(t); c.id=uid(); c.title=t.title+' (עותק)'; Store.upsert(c); renderHome(); toast('שוכפל.'); });
  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); if(confirm('למחוק את המשימה הזו?')){ Store.remove(b.dataset.del); renderHome(); toast('נמחקה.'); } });
}
function taskRowHtml(t){
  return `<div class="lrow" data-open="${t.id}" style="cursor:pointer">
    <div class="tile ${t.kind==='site-survey'?'info':''}">${t.kind==='site-survey'?'🎥':'✦'}</div>
    <div class="mid"><b>${esc(t.title)}</b><span>${esc(t.site||'ללא אתר')} · ${t.kind==='site-survey'?'תיק אתר':t.fields.length+' פעולות'} · ${dateText(t.updatedAt)}</span></div>
    <div class="actions"><button class="btn ghost sm" data-dup="${t.id}" type="button">⧉</button><button class="btn ghost sm" data-del="${t.id}" type="button">🗑</button></div>
  </div>`;
}
function resultRowHtml(r){
  const total=r.answers.length, ans=answeredCount(r), missing=missingRequired(r);
  return `<div class="lrow" data-viewres="${r.id}" style="cursor:pointer">
    <div class="tile ${missing>0?'warn':'ok'}">${r.task && r.task.kind==='site-survey' ? '🎥':'✦'}</div>
    <div class="mid"><b>${esc(r.site||r.title)}</b><span>${esc(r.title)} · ${dateText(r.savedAt)}${missing?` · <span class="wn">חסרים ${missing}</span>`:''}</span></div>
    <div class="frac mono">${ans}/${total}</div>
    <span class="chv">›</span>
  </div>`;
}

// ═══ RESULTS TAB ═══
async function renderResultsTab(){
  const results = await ResultsLib.all();
  app.innerHTML = `
    <div class="page-head"><div><h1>תוצאות</h1><p>תוצאות שנפתחו ונשמרות במכשיר הזה.</p></div></div>
    ${results.length ? `<div class="lcard">${results.map(r=>resultsTabRowHtml(r)).join('')}</div>` : `<div class="lcard"><div class="empty-note">אין עדיין תוצאות שמורות.<br>פתח קובץ תוצאה שחזר מהשטח כדי להתחיל.</div></div>`}
    <div class="lcard"><button class="btn primary block" id="res-open">🔓 פתיחת תוצאה</button></div>`;
  q('#res-open').onclick = () => impResult.click();
  document.querySelectorAll('[data-viewres]').forEach(b=>b.onclick=()=>viewResult(b.dataset.viewres));
  document.querySelectorAll('[data-delres]').forEach(b=>b.onclick=async (e)=>{ e.stopPropagation(); if(confirm('למחוק את התוצאה הזו מהספרייה?')){ await ResultsLib.remove(b.dataset.delres); renderResultsTab(); } });
}
function resultsTabRowHtml(r){
  const total=r.answers.length, ans=answeredCount(r), missing=missingRequired(r);
  return `<div class="lrow" data-viewres="${r.id}" style="cursor:pointer">
    <div class="tile ${missing>0?'warn':'ok'}">${r.task && r.task.kind==='site-survey' ? '🎥':'✦'}</div>
    <div class="mid"><b>${esc(r.site||r.title)}</b><span>${esc(r.title)} · ${ans}/${total}${missing?` · <span class="wn">חסרים ${missing}</span>`:''}</span></div>
    <div class="actions"><button class="btn ghost sm" data-delres="${r.id}" type="button">🗑</button></div>
    <span class="chv">›</span>
  </div>`;
}

// ═══ MORE TAB ═══
function renderMoreTab(){
  app.innerHTML = `
    <div class="page-head"><div><h1>עוד</h1><p>ייבוא, התקנה ומידע על שטחלה.</p></div></div>
    <div class="lcard">
      <div class="lrow" id="more-import" style="cursor:pointer"><div class="tile info">⬇️</div><div class="mid"><b>ייבוא משימה</b><span>טעינת קובץ הגדרת משימה קיים</span></div><span class="chv">›</span></div>
      <div class="lrow" id="more-install" style="cursor:pointer"><div class="tile info">📲</div><div class="mid"><b>התקנת האפליקציה</b><span>אייקון על מסך הבית · עובד גם בלי אינטרנט</span></div><span class="chv">›</span></div>
    </div>
    <div class="lcard">
      <p style="color:var(--ink-2);font-size:13.5px;line-height:1.7;margin:0">שטחלה — ניהול משימות בשטח. הכול מקומי: המשימות שלך והתוצאות שנפתחו נשמרות רק במכשיר הזה, בלי שרת ובלי ענן.</p>
    </div>`;
  q('#more-import').onclick = () => impTask.click();
  q('#more-install').onclick = () => { if(dp){ dp.prompt(); } else toast('ההתקנה כבר בוצעה, או שהדפדפן לא תומך בהתקנה כרגע.'); };
}

// ═══ FIELD LIST + BOTTOM SHEET (shared: wizard step 3 + free-task editor) ═══
function fieldRowHtml(f, idx){
  return `<div class="field-list-row" data-idx="${idx}">
    <span class="gr">${fIcon(f.type)}</span>
    <div class="m">
      <b>${esc(f.label)}</b>
      <div class="mt"><span class="chip">${esc(fLabel(f.type))}</span>${f.required?'<span class="req">חובה</span>':''}</div>
    </div>
    <span class="chv">›</span>
  </div>`;
}
function renderFieldList(container, task, onChange){
  const groups = [];
  task.fields.forEach((f)=>{ if(f.type==='__cameras__') return; const s=f.section||'כללי'; let g=groups.find(x=>x.s===s); if(!g){ g={s,items:[]}; groups.push(g); } g.items.push(f); });
  const realCount = task.fields.filter(f=>f.type!=='__cameras__').length;
  const reqCount = task.fields.filter(f=>f.required).length;
  const rowsHtml = groups.map(g=>`<div class="section-band">${esc(g.s)}</div>${g.items.map(f=>fieldRowHtml(f, task.fields.indexOf(f))).join('')}`).join('');
  container.innerHTML = `<div class="lcard-head"><h3>שדות המשימה</h3><span class="cnt">${realCount} שדות · ${reqCount} חובה</span></div>${rowsHtml}`;
  container.querySelectorAll('.field-list-row').forEach(row=>{
    row.onclick=()=>{ const f=task.fields[+row.dataset.idx]; openFieldSheet(task, f, onChange); };
  });
}
function fieldSheetHtml(f){
  const opts = (f.options && f.options.length ? f.options : (f.type==='select' ? ['תקין','נדרש טיפול','לא רלוונטי'] : []));
  return `
    <div class="grab"></div>
    <div class="sheet-head"><b>עריכת שדה</b><button class="done" id="fs-done" type="button">סיום</button></div>
    <div class="sheet-body">
      <div class="field"><label>נוסח השדה</label><textarea class="textarea" id="fs-label" rows="2">${esc(f.label)}</textarea></div>
      <div class="field"><label>סוג השדה</label><div class="pill-select" id="fs-type">${FIELD_TYPES.map(t=>`<button type="button" class="pill-opt ${t.value===f.type?'active':''}" data-type="${t.value}">${t.icon} ${esc(t.label)}</button>`).join('')}</div></div>
      <div class="field" id="fs-options-wrap" style="${f.type==='select'?'':'display:none'}">
        <label>אפשרויות בחירה</label>
        <div class="opt-list" id="fs-options">${opts.map((o,i)=>`<div class="opt-row"><input class="input" data-opt="${i}" value="${esc(o)}"><button type="button" class="rm-opt" data-rmopt="${i}">×</button></div>`).join('')}</div>
        <button type="button" class="add-opt" id="fs-addopt">+ הוספת אפשרות</button>
      </div>
      <div class="field"><label>טקסט עזרה (אופציונלי)</label><textarea class="textarea" id="fs-help" rows="2" placeholder="הנחיה קצרה שתופיע מתחת לשאלה">${esc(f.help||'')}</textarea></div>
      <div class="field"><label>שם סעיף (אופציונלי)</label><input class="input" id="fs-section" value="${esc(f.section||'')}" placeholder="לדוגמה: ארונות"></div>
      <div class="switch-row"><span class="lbl">שדה חובה</span><input type="checkbox" class="switch" id="fs-required" ${f.required?'checked':''}></div>
      <button type="button" class="sheet-danger" id="fs-delete">מחיקת השדה</button>
    </div>`;
}
function openFieldSheet(task, field, onChange){
  const el = openSheetEl(fieldSheetHtml(field));
  const labelEl = el.querySelector('#fs-label');
  const grow = () => { labelEl.style.height='auto'; labelEl.style.height=labelEl.scrollHeight+'px'; };
  grow(); labelEl.addEventListener('input', e=>{ field.label=e.target.value; grow(); });
  function wireOptRow(row){
    row.querySelector('[data-opt]').addEventListener('input', syncOptions);
    row.querySelector('[data-rmopt]').onclick=()=>{ row.remove(); syncOptions(); };
  }
  function renderOptionsList(){
    const wrap = el.querySelector('#fs-options');
    const opts = (field.options && field.options.length ? field.options : ['תקין','נדרש טיפול','לא רלוונטי']);
    wrap.innerHTML = opts.map((o,i)=>`<div class="opt-row"><input class="input" data-opt="${i}" value="${esc(o)}"><button type="button" class="rm-opt" data-rmopt="${i}">×</button></div>`).join('');
    wrap.querySelectorAll('.opt-row').forEach(wireOptRow);
    field.options = opts;
  }
  el.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{
    field.type = b.dataset.type;
    el.querySelectorAll('[data-type]').forEach(x=>x.classList.toggle('active', x===b));
    el.querySelector('#fs-options-wrap').style.display = field.type==='select' ? '' : 'none';
    if(field.type==='select' && !(field.options && field.options.length)) renderOptionsList();
  });
  el.querySelector('#fs-help').addEventListener('input', e=>field.help=e.target.value);
  el.querySelector('#fs-section').addEventListener('input', e=>field.section=e.target.value);
  el.querySelector('#fs-required').addEventListener('change', e=>field.required=e.target.checked);
  function syncOptions(){ field.options = [...el.querySelectorAll('[data-opt]')].map(i=>i.value).filter(v=>v.trim()); }
  el.querySelectorAll('.opt-row').forEach(wireOptRow);
  el.querySelector('#fs-addopt').onclick=()=>{
    const wrap = el.querySelector('#fs-options'); const i = wrap.children.length;
    const row=document.createElement('div'); row.className='opt-row';
    row.innerHTML = `<input class="input" data-opt="${i}" value=""><button type="button" class="rm-opt" data-rmopt="${i}">×</button>`;
    wrap.append(row); wireOptRow(row);
  };
  el.querySelector('#fs-delete').onclick=()=>{
    if(task.fields.filter(x=>x.type!=='__cameras__').length<=1){ toast('חייבת להישאר פעולה אחת.','warn'); return; }
    task.fields = task.fields.filter(x=>x!==field);
    closeSheet(); onChange();
  };
  el.querySelector('#fs-done').onclick=()=>{ syncOptions(); closeSheet(); onChange(); };
}

// ═══ SITE-SURVEY WIZARD (4 steps) ═══
let wiz = null;
function openWizard(task, startStep){
  if(!task.cameras) task.cameras = {bullet4k:0,ptz:0,lpr:0,dome:0};
  wiz = { task: structuredClone(task), step: startStep||1 };
  renderWizard();
}
function wizTrack(step){ return `<div class="wiz-track">${[1,2,3,4].map(i=>`<i class="${i<=step?'done':''}"></i>`).join('')}</div><div class="wiz-label">שלב ${step} מתוך 4</div>`; }
function renderWizard(){
  if(wiz.step===1) return renderWizStep1();
  if(wiz.step===2) return renderWizStep2();
  if(wiz.step===3) return renderWizStep3();
  return renderWizStep4();
}
function wizBack(){ if(wiz.step>1){ wiz.step--; renderWizard(); } else { wiz=null; switchTab('home'); } }
function renderWizStep1(){
  const t = wiz.task;
  app.innerHTML = `
    <div class="page-head"><button class="back-btn" id="back" type="button">→</button><div><h1>אתר חדש</h1><p>פרטי הפרויקט</p></div></div>
    ${wizTrack(1)}
    <div class="lcard">
      <div class="form-grid">
        <div class="field full"><label>שם המשימה</label><input class="input" id="f-title" value="${esc(t.title)}"></div>
        <div class="field"><label>אתר / לקוח</label><input class="input" id="f-site" value="${esc(t.site)}"></div>
        <div class="field"><label>שולח המשימה</label><input class="input" id="f-owner" value="${esc(t.owner)}"></div>
        <div class="field"><label>משך משוער</label><input class="input" id="f-estimated" value="${esc(t.estimated)}"></div>
        <div class="field full"><label>הנחיית פתיחה למבצע</label><textarea class="textarea" id="f-desc">${esc(t.description)}</textarea></div>
      </div>
      <button class="btn primary block" id="next" style="margin-top:18px">המשך ←</button>
    </div>`;
  q('#back').onclick=()=>{ wiz=null; switchTab('home'); };
  ['title','site','owner','estimated'].forEach(k=>q('#f-'+k).addEventListener('input', e=>t[k]=e.target.value));
  q('#f-desc').addEventListener('input', e=>t.description=e.target.value);
  q('#next').onclick=()=>{ if(!t.title.trim()){ toast('יש להזין שם למשימה.','warn'); return; } wiz.step=2; renderWizard(); };
}
function renderWizStep2(){
  const t = wiz.task;
  app.innerHTML = `
    <div class="page-head"><button class="back-btn" id="back" type="button">→</button><div><h1>מצלמות</h1><p>כמה מכל סוג</p></div></div>
    ${wizTrack(2)}
    <div class="lcard">
      <div class="cam-grid">${CAM.map(([k,name,sub])=>`<div class="cam-box"><div class="cn">${name}</div><div class="cs">${sub}</div><div class="stepper-round"><button type="button" data-dec="${k}">−</button><span class="v" id="c-${k}">${t.cameras[k]||0}</span><button type="button" data-inc="${k}">＋</button></div></div>`).join('')}</div>
    </div>
    <div class="summary-box" id="cam-summary"></div>
    <button class="btn primary block" id="next" style="margin-top:14px">המשך לשדות נוספים ←</button>`;
  q('#back').onclick=wizBack;
  function updateSummary(){
    const totalCams = CAM.reduce((s,[k])=>s+(t.cameras[k]||0),0);
    q('#cam-summary').innerHTML = totalCams ? `ייווצרו <b>${totalCams}</b> סעיפי מצלמה — <b>${totalCams*5}</b> שדות תיעוד. לכל מצלמה: שם, גובה, תמונת מצלמה, אזור עניין והערה.` : `לא נבחרו מצלמות עדיין — אפשר להמשיך גם בלי, ולהוסיף שדות ידנית בשלב הבא.`;
  }
  document.querySelectorAll('[data-inc]').forEach(b=>b.onclick=()=>{ const k=b.dataset.inc; t.cameras[k]=(t.cameras[k]||0)+1; q('#c-'+k).textContent=t.cameras[k]; updateSummary(); });
  document.querySelectorAll('[data-dec]').forEach(b=>b.onclick=()=>{ const k=b.dataset.dec; t.cameras[k]=Math.max(0,(t.cameras[k]||0)-1); q('#c-'+k).textContent=t.cameras[k]; updateSummary(); });
  updateSummary();
  q('#next').onclick=()=>{ wiz.step=3; renderWizard(); };
}
function renderWizStep3(){
  const t = wiz.task;
  app.innerHTML = `
    <div class="page-head"><button class="back-btn" id="back" type="button">→</button><div><h1>שדות נוספים</h1><p>ארונות, פריסה, סיכום — ואפשר להוסיף עוד</p></div></div>
    ${wizTrack(3)}
    <div class="lcard" id="flist"></div>
    <button class="btn ghost block" id="add-field" style="margin-bottom:14px">＋ הוספת שדה</button>
    <button class="btn primary block" id="next">המשך לסקירה ←</button>`;
  q('#back').onclick=wizBack;
  const flist = q('#flist');
  function onChange(){ renderFieldList(flist, t, onChange); }
  onChange();
  q('#add-field').onclick=()=>{ t.fields.push({id:uid(),label:'שדה חדש',type:'text',required:false,section:'',help:''}); onChange(); };
  q('#next').onclick=()=>{ wiz.step=4; renderWizard(); };
}
function renderWizStep4(){
  const t = wiz.task;
  const totalCams = CAM.reduce((s,[k])=>s+(t.cameras[k]||0),0);
  const extraFields = t.fields.filter(f=>f.type!=='__cameras__').length;
  app.innerHTML = `
    <div class="page-head"><button class="back-btn" id="back" type="button">→</button><div><h1>סקירה והפקה</h1><p>בדוק ואז הפק קובץ למבצע</p></div></div>
    ${wizTrack(4)}
    <div class="lcard">
      <div class="lrow"><div class="tile info">🎥</div><div class="mid"><b>${esc(t.title)}</b><span>${esc(t.site||'ללא אתר')}</span></div></div>
      <div class="summary-box" style="margin-top:12px">${totalCams} סעיפי מצלמה · ${extraFields} שדות נוספים · סה"כ ${totalCams*5+extraFields} שדות</div>
    </div>
    <div style="display:flex;gap:12px">
      <button class="btn ghost block" id="save-only">שמירה בלבד</button>
      <button class="btn primary block" id="gen">📄 הפקת קובץ למבצע</button>
    </div>`;
  q('#back').onclick=wizBack;
  q('#save-only').onclick=()=>{ Store.upsert(t); toast('נשמר במכשיר.','ok'); wiz=null; switchTab('home'); };
  q('#gen').onclick=()=>genFile(t, ()=>{ wiz=null; switchTab('home'); });
}

// ═══ FREE-TASK EDITOR (single screen: form + field list) ═══
let freeEd = null;
function openFieldEditorTask(task){ freeEd = structuredClone(task); renderFreeEditor(); }
function renderFreeEditor(){
  const t = freeEd;
  app.innerHTML = `
    <div class="page-head"><button class="back-btn" id="back" type="button">→</button><div><h1>בונה משימה</h1><p>מגדירים מה צריך לחזור מהשטח</p></div></div>
    <div class="lcard">
      <div class="form-grid">
        <div class="field full"><label>שם המשימה</label><input class="input" id="f-title" value="${esc(t.title)}"></div>
        <div class="field"><label>אתר / לקוח</label><input class="input" id="f-site" value="${esc(t.site)}"></div>
        <div class="field"><label>שולח המשימה</label><input class="input" id="f-owner" value="${esc(t.owner)}"></div>
        <div class="field"><label>משך משוער</label><input class="input" id="f-estimated" value="${esc(t.estimated)}"></div>
        <div class="field full"><label>הנחיית פתיחה למבצע</label><textarea class="textarea" id="f-desc">${esc(t.description)}</textarea></div>
      </div>
    </div>
    <div class="lcard" id="flist"></div>
    <button class="btn ghost block" id="add-field" style="margin-bottom:14px">＋ הוספת שדה</button>
    <div style="display:flex;gap:12px">
      <button class="btn ghost block" id="save">שמירה</button>
      <button class="btn primary block" id="gen">📄 הפקת קובץ למבצע</button>
    </div>`;
  q('#back').onclick=()=>{ Store.upsert(t); freeEd=null; switchTab('home'); };
  ['title','site','owner','estimated'].forEach(k=>q('#f-'+k).addEventListener('input', e=>t[k]=e.target.value));
  q('#f-desc').addEventListener('input', e=>t.description=e.target.value);
  const flist=q('#flist');
  function onChange(){ renderFieldList(flist, t, onChange); }
  onChange();
  q('#add-field').onclick=()=>{ t.fields.push({id:uid(),label:'שדה חדש',type:'text',required:false,section:'',help:''}); onChange(); };
  q('#save').onclick=()=>{ Store.upsert(t); toast('נשמר במכשיר.','ok'); };
  q('#gen').onclick=()=>genFile(t, null);
}

// ═══ IMPORT: TASK (lossless — reads the embedded pre-expansion source blob) ═══
impTask.addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value=''; if(!file) return;
  try{
    const txt = await file.text();
    const m = txt.match(/<script id="shtachla-task-src" type="application\/json">([\s\S]*?)<\/script>/);
    if(!m) throw new Error('old-format');
    const t = JSON.parse(m[1]);
    t.id = t.id || uid();
    if(t.kind==='site-survey' && !t.cameras) t.cameras = {bullet4k:0,ptz:0,lpr:0,dome:0};
    if(t.kind==='site-survey') openWizard(t, 1); else openFieldEditorTask(t);
    toast('המשימה נטענה.','ok');
  }catch(e){
    toast(e.message==='old-format' ? 'קובץ משימה בפורמט ישן — יש להפיק מחדש מהבונה.' : 'לא זוהתה משימת שטחלה.', 'warn');
  }
});

// ═══ IMPORT: RESULT ═══
impResult.addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value=''; if(!file) return;
  try{
    const txt = await file.text();
    const hm = txt.match(/const HEADER = (\{[\s\S]*?\});/);
    const pm = txt.match(/const PAYLOAD_B64 = "([^"]*)"/);
    if(!hm||!pm) throw new Error('bad-file');
    const header = JSON.parse(hm[1]); const p = pm[1];
    if(header.locked) askCode(header,p);
    else await handleOpenedPayload(JSON.parse(dec.decode(b64ToBytes(p))));
  }catch(e){ toast('לא זוהה קובץ תוצאה תקין.','warn'); }
});
function askCode(header,p){
  const m=document.createElement('div'); m.className='modal-bg';
  m.innerHTML=`<div class="modal"><h2>פתיחת תוצאה מוגנת</h2><p>הזן את הקוד בן 4 הספרות שהמבצע מסר בטלפון.</p><input id="uc" class="code-input" inputmode="numeric" maxlength="4" placeholder="••••"><div class="modal-actions"><button class="btn ghost" id="cx" type="button">ביטול</button><button class="btn primary" id="uk" type="button">פתיחה</button></div></div>`;
  document.body.append(m); m.querySelector('#cx').onclick=()=>m.remove();
  const go=async()=>{ const code=m.querySelector('#uc').value.trim(); if(!/^\d{4}$/.test(code)) return toast('קוד בן 4 ספרות.','warn');
    try{
      const mat=await crypto.subtle.importKey('raw',enc.encode(code),'PBKDF2',false,['deriveKey']);
      const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:b64ToBytes(header.salt),iterations:header.iterations,hash:'SHA-256'},mat,{name:'AES-GCM',length:256},false,['decrypt']);
      const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(header.iv)},key,b64ToBytes(p).buffer);
      m.remove(); await handleOpenedPayload(JSON.parse(dec.decode(data)));
    }catch{ toast('קוד שגוי או קובץ פגום.','warn'); }
  };
  m.querySelector('#uk').onclick=go; m.querySelector('#uc').addEventListener('keydown', e=>{ if(e.key==='Enter') go(); });
}
async function handleOpenedPayload(payload){
  const rec = { id: uid(), title: payload.task.title, site: payload.task.site, task: payload.task, answers: payload.answers, completedAt: payload.metadata && payload.metadata.completedAt, savedAt: Date.now(), reviewedAt: null };
  await ResultsLib.save(rec);
  toast('התוצאה נשמרה בספריית התוצאות.','ok');
  switchTab('results');
  viewResult(rec.id);
}

// ═══ RESULT VIEWER ═══
let rv = null; // {result, section}
async function viewResult(id){
  const r = await ResultsLib.get(id);
  if(!r){ toast('התוצאה לא נמצאה.','warn'); return; }
  rv = { result:r, section:null };
  renderResultViewer();
}
function sectionsOf(r){
  const secs=[];
  r.answers.forEach(a=>{ const s=a.section||'כללי'; let g=secs.find(x=>x.name===s); if(!g){ g={name:s,items:[]}; secs.push(g); } g.items.push(a); });
  return secs;
}
function renderResultViewer(){
  if(rv.section!==null) return renderSectionDetail();
  const r = rv.result;
  const total=r.answers.length, ansd=answeredCount(r), missing=missingRequired(r);
  const pct = total? Math.round(ansd/total*100):0;
  const missPct = total? Math.round(missing/total*100):0;
  const secs = sectionsOf(r);
  app.innerHTML = `
    <div class="page-head"><button class="back-btn" id="back" type="button">→</button><div><h1>${esc(r.title)}</h1><p>${esc(r.site||'ללא אתר')} · הושלם ${dateText(r.completedAt)}</p></div></div>
    <div class="prog-card">
      <div class="prog-top"><span class="prog-num mono">${ansd}<s>/${total}</s></span><span class="prog-tag ${missing?'':'ok'}">${missing?`${missing} חסרים`:'מלא'}</span></div>
      <div class="prog-bar"><i style="width:${Math.max(0,pct-missPct)}%;background:var(--green)"></i><i style="width:${missPct}%;background:var(--amber)"></i></div>
      <div class="prog-legend"><span><u style="background:var(--green)"></u>מלא</span><span><u style="background:var(--amber)"></u>חסר חובה</span></div>
    </div>
    <div class="rep-actions">
      <button class="btn primary sm" id="exp-skill">✨ ייצוא לסקיל</button>
      <button class="btn ghost sm" id="exp-pdf">🖨️ PDF</button>
      <button class="btn ghost sm" id="exp-csv">📊 Excel</button>
      <button class="btn danger sm" id="del-res">🗑 מחיקה</button>
    </div>
    <div class="lcard">
      <div class="lcard-head"><h3>סעיפי האתר</h3><span class="cnt">${secs.length}</span></div>
      ${secs.map((s,i)=>{ const sTotal=s.items.length, sAns=s.items.filter(a=>!isEmptyAnswer(a)).length, sMiss=s.items.filter(a=>a.required&&isEmptyAnswer(a)).length;
        return `<div class="lrow" data-sec="${i}" style="cursor:pointer"><div class="tile ${sMiss?'warn':'ok'}">${sMiss?'⚠️':'✓'}</div><div class="mid"><b>${esc(s.name)}</b><span>${sTotal} שדות · ${sMiss?`<span class="wn">חסר ${sMiss}</span>`:'מלא'}</span></div><div class="frac mono">${sAns}/${sTotal}</div><span class="chv">›</span></div>`; }).join('')}
    </div>`;
  q('#back').onclick=()=>{ rv=null; switchTab('results'); };
  q('#exp-skill').onclick=()=>expSkill(r);
  q('#exp-pdf').onclick=()=>window.print();
  q('#exp-csv').onclick=()=>expCsv(r);
  q('#del-res').onclick=async ()=>{ if(confirm('למחוק את התוצאה הזו מהספרייה? הפעולה בלתי הפיכה.')){ await ResultsLib.remove(r.id); rv=null; switchTab('results'); toast('נמחקה.'); } };
  document.querySelectorAll('[data-sec]').forEach(row=>row.onclick=()=>{ rv.section=+row.dataset.sec; renderResultViewer(); });
}
function renderSectionDetail(){
  const r = rv.result;
  const s = sectionsOf(r)[rv.section];
  app.innerHTML = `
    <div class="page-head"><button class="back-btn" id="back" type="button">→</button><div><h1>${esc(s.name)}</h1><p>${s.items.length} שדות</p></div></div>
    <div class="lcard">${s.items.map(a=>erow(a, r)).join('')}</div>`;
  q('#back').onclick=()=>{ rv.section=null; renderResultViewer(); };
  bindEdit(r);
}
function erow(a, r){
  const idx = r.answers.indexOf(a);
  let body;
  if(Array.isArray(a.answer)) body = `<div class="imgs">${a.answer.map((im,j)=>`<div class="imgw"><img src="${im}"><button class="rm" data-rm="${idx}:${j}" type="button">×</button></div>`).join('')}<label class="btn ghost sm add-photo">＋ תמונה<input type="file" accept="image/*" multiple hidden data-add="${idx}"></label></div>`;
  else if(a.type==='signature' && a.answer) body = `<img class="sig-img" src="${a.answer}">`;
  else if(a.type==='gps' && a.answer && a.answer.latitude) body = `<div class="a">קו רוחב ${a.answer.latitude.toFixed(6)}, קו אורך ${a.answer.longitude.toFixed(6)}</div>`;
  else body = `<div class="a edit" contenteditable="true" data-edit="${idx}">${esc(a.answer??'')}</div>`;
  return `<div class="qa"><div class="q">${esc(a.label)}</div>${body}</div>`;
}
function bindEdit(r){
  document.querySelectorAll('[data-edit]').forEach(el=>el.addEventListener('input', ()=>{ r.answers[+el.dataset.edit].answer = el.textContent; ResultsLib.save(r); }));
  document.querySelectorAll('[data-rm]').forEach(b=>b.onclick=async ()=>{ const [i,j]=b.dataset.rm.split(':').map(Number); r.answers[i].answer.splice(j,1); await ResultsLib.save(r); renderSectionDetail(); });
  document.querySelectorAll('[data-add]').forEach(inp=>inp.addEventListener('change', async ()=>{
    const i=+inp.dataset.add; const files=[...inp.files]; if(!files.length) return;
    let added;
    try{ added = await Promise.all(files.map(f=>compressImageFile(f))); }
    catch{ toast('לא ניתן היה לעבד תמונה.','warn'); return; }
    if(!Array.isArray(r.answers[i].answer)) r.answers[i].answer=[];
    r.answers[i].answer.push(...added);
    await ResultsLib.save(r); renderSectionDetail();
  }));
}
function expSkill(r){
  const data = { title:r.title, site:r.site, completedAt:r.completedAt, answers:r.answers };
  const readable = r.answers.map(a=>{
    let av; if(Array.isArray(a.answer)) av=`${a.answer.length} תמונות`; else if(a.type==='signature') av = a.answer?'חתום':'—'; else if(a.type==='gps'&&a.answer&&a.answer.latitude) av=`${a.answer.latitude.toFixed(5)}, ${a.answer.longitude.toFixed(5)}`; else av = a.answer||'—';
    const imgs = Array.isArray(a.answer)? a.answer.map(i=>`<img src="${i}" style="max-width:220px;border-radius:8px;margin:4px">`).join('') : (a.type==='signature'&&a.answer?`<img src="${a.answer}" style="max-width:200px">`:'');
    return `<section><h3>${esc(a.section||'כללי')} — ${esc(a.label)}</h3><p>${esc(String(av))}</p>${imgs}</section>`;
  }).join('\n');
  const html = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${esc(r.title)} — נתוני שטחלה</title><style>body{font-family:Arial,sans-serif;direction:rtl;max-width:800px;margin:auto;padding:20px;color:#111}h1{border-bottom:3px solid #1f9ed4;padding-bottom:8px}h3{color:#0e8fb0;margin:18px 0 4px}</style></head><body><h1>${esc(r.title)}</h1><p>${esc(r.site||'')} · ${dateText(data.completedAt)}</p>${readable}<script id="shtachla-data" type="application/json">${JSON.stringify(data).replace(/<\//g,'<\\/')}<`+`/script></body></html>`;
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([html],{type:'text/html'})); a.download=`${(r.title||'תוצאה').replace(/[^\p{L}\p{N}]+/gu,'-')}-לסקיל.html`; a.click();
  r.reviewedAt = Date.now(); ResultsLib.save(r);
  toast('נוצר קובץ לסקיל: דוח קריא + JSON מוטמע.','ok');
}
function expCsv(r){
  const rows = r.answers.map(a=>[a.section,a.label, Array.isArray(a.answer)?`${a.answer.length} תמונות`:(typeof a.answer==='object'&&a.answer?JSON.stringify(a.answer):a.answer)]);
  const csv='\ufeffסעיף,שאלה,תשובה\n'+rows.map(row=>row.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download=`${r.title}-תוצאות.csv`; a.click();
}

// ═══ PWA ═══
let dp=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();dp=e;document.getElementById('install').classList.add('show');});
document.getElementById('install-btn').addEventListener('click',async()=>{if(!dp)return;dp.prompt();await dp.userChoice;dp=null;document.getElementById('install').classList.remove('show');});
window.addEventListener('appinstalled',()=>{document.getElementById('install').classList.remove('show');toast('שטחלה הותקנה.','ok');});
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));

// ═══ INIT ═══
function bindShell(){
  document.getElementById('fab').onclick = quickActionsSheet;
  document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>switchTab(btn.dataset.tab));
  document.getElementById('more-btn').onclick=()=>switchTab('more');
}
bindShell();
switchTab('home');
