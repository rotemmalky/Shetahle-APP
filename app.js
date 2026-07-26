// ═══════════════ שטחלה — app v5 ═══════════════
'use strict';
const app = document.getElementById('app');
const impTask = document.getElementById('imp-task');
const impResult = document.getElementById('imp-result');
const toasts = document.getElementById('toasts');
const q = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));
const dateText = ts => ts ? new Intl.DateTimeFormat('he-IL', { dateStyle:'medium' }).format(new Date(ts)) : '';
const b64ToBytes = v => Uint8Array.from(atob(v), c => c.charCodeAt(0));
const dec = new TextDecoder(); const enc = new TextEncoder();
const ic = (n, cls) => `<svg class="${cls || 'ic'}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
function toast(m, k){ const n = document.createElement('div'); n.className = 'toast' + (k ? ' ' + k : ''); n.textContent = m; toasts.append(n); setTimeout(() => n.remove(), 3800); }

function compressImageFile(file, maxDim, quality){
  maxDim = maxDim || 1920; quality = quality || 0.72;
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
        else { width = Math.round(width * maxDim / height); height = maxDim; }
      }
      const c = document.createElement('canvas'); c.width = width; c.height = height;
      c.getContext('2d').drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      try { resolve(c.toDataURL('image/jpeg', quality)); } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image-decode-failed')); };
    img.src = url;
  });
}

/* ═══ TASKS (localStorage — small, no photos) ═══ */
const Store = {
  key:'shtachla3',
  all(){ try { return JSON.parse(localStorage.getItem(this.key) || '[]'); } catch { return []; } },
  save(l){ try { localStorage.setItem(this.key, JSON.stringify(l)); } catch { toast('האחסון מלא — לא נשמר.', 'warn'); } },
  upsert(t){ const l = this.all(); const i = l.findIndex(x => x.id === t.id); t.updatedAt = Date.now(); if (!t.status) t.status = 'draft'; if (i > -1) l[i] = t; else l.push(t); this.save(l); },
  remove(id){ this.save(this.all().filter(x => x.id !== id)); },
  get(id){ return this.all().find(x => x.id === id); },
  setStatus(id, status, extra){
    const l = this.all(); const t = l.find(x => x.id === id); if (!t) return;
    t.status = status; if (extra) Object.assign(t, extra); t.updatedAt = Date.now(); this.save(l);
  },
};

/* ═══ DEFAULTS — what Asi retypes every single time, remembered once ═══ */
const Prefs = {
  key:'shtachla-prefs',
  def:{ owner:'', estimated:'כ-30 דקות', description:'' },
  get(){ try { return Object.assign({}, this.def, JSON.parse(localStorage.getItem(this.key) || '{}')); } catch { return Object.assign({}, this.def); } },
  set(p){ try { localStorage.setItem(this.key, JSON.stringify(Object.assign(this.get(), p))); } catch {} },
};

/* ═══ RESULTS LIBRARY (IndexedDB) ═══ */
const IDB_NAME = 'shtachla-db', IDB_VER = 1, IDB_STORE = 'results';
function idbOpen(){
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no-idb'));
    const req = indexedDB.open(IDB_NAME, IDB_VER);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath:'id' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbAll(){ const db = await idbOpen(); return new Promise((res, rej) => { const rq = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).getAll(); rq.onsuccess = () => res(rq.result || []); rq.onerror = () => rej(rq.error); }); }
async function idbPut(rec){ const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction(IDB_STORE, 'readwrite'); tx.objectStore(IDB_STORE).put(rec); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); }); }
async function idbDel(id){ const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction(IDB_STORE, 'readwrite'); tx.objectStore(IDB_STORE).delete(id); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); }); }

const ResultsLib = {
  mem:[], broken:false, warned:false,
  async all(){
    if (this.broken) return this.mem.slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    try { return (await idbAll()).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)); }
    catch { this.broken = true; return this.mem.slice(); }
  },
  async save(rec){
    rec.savedAt = rec.savedAt || Date.now();
    try { await idbPut(rec); }
    catch {
      this.broken = true;
      const i = this.mem.findIndex(x => x.id === rec.id); if (i > -1) this.mem[i] = rec; else this.mem.push(rec);
      if (!this.warned) { this.warned = true; toast('האחסון הקבוע לא זמין בדפדפן זה — התוצאות יישמרו רק לסשן הנוכחי.', 'warn'); }
    }
  },
  async remove(id){ try { await idbDel(id); } catch {} this.mem = this.mem.filter(x => x.id !== id); },
  async get(id){ return (await this.all()).find(x => x.id === id); },
};

function isEmptyAnswer(a){ return a.answer === null || a.answer === undefined || a.answer === '' || (Array.isArray(a.answer) && !a.answer.length); }
function answeredCount(r){ return r.answers.filter(a => !isEmptyAnswer(a)).length; }
function missingRequired(r){ return r.answers.filter(a => a.required && isEmptyAnswer(a)).length; }

/* ═══ FIELD TYPES / CAMERAS / STATUS ═══ */
const FIELD_TYPES = [
  { value:'text', label:'טקסט קצר', icon:'f-text' }, { value:'textarea', label:'טקסט ארוך', icon:'f-para' },
  { value:'number', label:'מספר', icon:'f-num' }, { value:'yesno', label:'כן / לא', icon:'f-bool' },
  { value:'select', label:'בחירה', icon:'f-select' }, { value:'date', label:'תאריך', icon:'f-date' },
  { value:'photo', label:'תמונה', icon:'f-photo' }, { value:'gps', label:'מיקום GPS', icon:'f-gps' },
  { value:'signature', label:'חתימה', icon:'f-sign' },
];
const fIcon = t => (FIELD_TYPES.find(f => f.value === t) || {}).icon || 'target';
const fLabel = t => (FIELD_TYPES.find(f => f.value === t) || {}).label || t;
const CAM = [['bullet4k','4K BULLET','עדשה רחבה'], ['ptz','PTZ','ממונעת'], ['lpr','LPR','זיהוי לוחיות'], ['dome','DOME','כיפה']];
const CAM_SHORT = { bullet4k:'4K', ptz:'PTZ', lpr:'LPR', dome:'DOME' };

const STATUS = {
  draft:    { label:'טיוטה',        icon:'draft',      cls:'' ,     hint:'עוד לא נשלחה' },
  sent:     { label:'בשטח',         icon:'send',       cls:'info',  hint:'נשלחה למבצע' },
  returned: { label:'חזרה מהשטח',   icon:'inbox',      cls:'warn',  hint:'ממתינה לעדכון' },
  approved: { label:'הושלמה',       icon:'check-circ', cls:'ok',    hint:'טופלה' },
};
const stMeta = s => STATUS[s] || STATUS.draft;

/* ═══ TEMPLATES ═══ */
function siteTemplate(){
  const p = Prefs.get();
  const f = (label, type, o = {}) => ({ id:uid(), label, type, required:!!o.required, section:o.section || '', secIcon:o.secIcon || '', help:o.help || '', options:o.options || null });
  const PP = { section:'פרטי פרויקט', secIcon:'info' };
  return {
    id:uid(), kind:'site-survey', status:'draft',
    title:'תיק אתר — מצלמות', site:'', owner:p.owner, estimated:p.estimated,
    description: p.description || 'תיעוד אתר מלא: פרטי פרויקט, מצלמות (סעיף לכל אחת), ארונות ופריסה.',
    titleAuto:true,
    cameras:{ bullet4k:0, ptz:0, lpr:0, dome:0 },
    fields:[
      f('שם האתר', 'text', Object.assign({ required:true }, PP)),
      f('מספר אתר', 'text', PP),
      f('גרסה (V1/V2)', 'text', PP),
      f('כתובת', 'text', PP),
      f('מנהל פרויקט', 'text', PP),
      f('מהנדס שדה', 'text', PP),
      f('תאריך ביצוע', 'date', PP),
      { id:uid(), type:'__cameras__', label:'מצלמות', section:'מצלמות', secIcon:'cctv' },
      f('ארון ראשי — תמונה', 'photo', { section:'ארונות', secIcon:'cabinet', required:true }),
      f('ארון ראשי — מיקום והזנת חשמל', 'textarea', { section:'ארונות', secIcon:'cabinet' }),
      f('ארון משני — תמונה', 'photo', { section:'ארונות', secIcon:'cabinet' }),
      f('תמונת פריסה / מבט אוויר', 'photo', { section:'פריסה', secIcon:'grid' }),
      f('תוכנית תשתית / אופטיקה', 'photo', { section:'פריסה', secIcon:'grid' }),
      f('הערות מסכמות', 'textarea', { section:'סיכום סיור', secIcon:'f-sign' }),
      f('חתימת עורך התיק', 'signature', { section:'סיכום סיור', secIcon:'f-sign', required:true }),
    ]
  };
}
function blankTemplate(){
  const p = Prefs.get();
  return { id:uid(), kind:'free', status:'draft', title:'משימת שטח חדשה', site:'', owner:p.owner,
    estimated:'כ-10 דקות', description:p.description || '', titleAuto:false,
    fields:[{ id:uid(), label:'שאלה ראשונה', type:'text', required:true, section:'', secIcon:'', help:'' }] };
}

/* ═══ BLOCK CATALOG — assemble instead of authoring field by field ═══ */
const BLOCKS = [
  { id:'cabinet', name:'ארון', icon:'cabinet', sub:'תמונה, מיקום, הזנה', section:'ארון', fields:[
    ['מזהה הארון','text',1], ['תמונת הארון','photo',1], ['מיקום פיזי','text',0], ['הזנת חשמל','textarea',0], ['הערה','textarea',0]] },
  { id:'power', name:'נקודת חשמל', icon:'bolt', sub:'מקור, הגנה, תמונה', section:'נקודת חשמל', fields:[
    ['מזהה הנקודה','text',1], ['מקור ההזנה','text',0], ['גודל מאמ״ת / הגנה','text',0], ['תמונת הנקודה','photo',1], ['הערה','textarea',0]] },
  { id:'cable', name:'כבילה', icon:'cable', sub:'סוג, אורך, מסלול', section:'כבילה', fields:[
    ['מקטע (מ… אל…)','text',1], ['סוג הכבל','select',0,['CAT6','CAT7','סיב אופטי','חשמל','אחר']], ['אורך משוער (מטר)','number',0], ['תמונת המסלול','photo',0], ['הערה','textarea',0]] },
  { id:'pole', name:'עמוד', icon:'mast', sub:'גובה, סוג, תמונה', section:'עמוד', fields:[
    ['מזהה העמוד','text',1], ['גובה (מטר)','number',1], ['סוג העמוד','select',0,['פלדה','בטון','קיים','חדש']], ['תמונת העמוד','photo',1], ['הערה','textarea',0]] },
  { id:'gate', name:'שער / מחסום', icon:'gate', sub:'סוג, בקרה, תמונה', section:'שער', fields:[
    ['מזהה השער','text',1], ['סוג','select',0,['הזזה','כנף','מחסום','תלוי']], ['בקרת כניסה','yesno',0], ['תמונת השער','photo',1], ['הערה','textarea',0]] },
];
function firstOfSection(task, section){
  const i = task.fields.findIndex(f => (f.section || '') === (section || ''));
  return i > -1 ? i : task.fields.length;
}
function addBlock(task, block){
  const used = new Set(task.fields.map(f => f.section).filter(Boolean));
  let name = block.section, n = 2;
  while (used.has(name)) { name = `${block.section} ${n++}`; }
  const rows = block.fields.map(([label, type, req, options]) =>
    ({ id:uid(), label, type, required:!!req, section:name, secIcon:block.icon, help:'', options:options || null }));
  // the closing section (notes + signature) must stay last, so insert ahead of it
  const tail = task.fields.findIndex(f => f.type === 'signature');
  const at = tail > -1 ? firstOfSection(task, task.fields[tail].section) : task.fields.length;
  task.fields.splice(at, 0, ...rows);
  return name;
}

/* ═══ CAMERA EXPANSION — deterministic ids keep field drafts valid across re-sends ═══ */
function expandCameras(task){
  const out = [];
  for (const f of task.fields) {
    if (f.type === '__cameras__') {
      const c = task.cameras || {};
      for (const [k, name] of CAM) {
        for (let i = 1; i <= (c[k] || 0); i++) {
          const nn = String(i).padStart(2, '0');
          const sec = `מצלמה ${CAM_SHORT[k]} ${nn}`;
          const base = `${task.id}-cam-${k}-${nn}`;
          const S = { section:sec, secIcon:'cctv' };
          out.push(Object.assign({ id:base + '-name',  label:'שם / מזהה המצלמה', type:'text', required:true, prefill:`${CAM_SHORT[k]} ${nn}`, help:`${name} — אפשר לשנות אם המזהה באתר שונה` }, S));
          out.push(Object.assign({ id:base + '-h',     label:'גובה התקנה (מטר)', type:'number' }, S));
          out.push(Object.assign({ id:base + '-photo', label:'תמונת המצלמה', type:'photo', required:true }, S));
          out.push(Object.assign({ id:base + '-roi',   label:'תמונת אזור העניין', type:'photo', help:'אפשר לצרף יותר מתמונה אחת' }, S));
          out.push(Object.assign({ id:base + '-note',  label:'הערה', type:'textarea' }, S));
        }
      }
    } else out.push(f);
  }
  return out;
}
const camTotal = t => CAM.reduce((s, [k]) => s + ((t.cameras || {})[k] || 0), 0);
const camLabel = c => CAM.filter(([k]) => (c || {})[k]).map(([k]) => `${c[k]}×${CAM_SHORT[k]}`).join(' + ') || 'ללא מצלמות';
function sectionCount(t){
  const secs = new Set();
  expandCameras(t).forEach(f => secs.add(f.section || 'כללי'));
  return secs.size;
}
/* presets learned from the manager's own history, plus two sane fallbacks */
function camPresets(){
  const seen = new Map();
  Store.all().filter(t => t.kind === 'site-survey' && t.cameras && camTotal(t)).forEach(t => {
    const key = CAM.map(([k]) => t.cameras[k] || 0).join(',');
    seen.set(key, (seen.get(key) || 0) + 1);
  });
  const out = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([key]) => { const v = key.split(',').map(Number); const c = {}; CAM.forEach(([k], i) => c[k] = v[i]); return c; });
  [{ bullet4k:4, ptz:0, lpr:0, dome:0 }, { bullet4k:1, ptz:0, lpr:3, dome:0 }].forEach(c => {
    const key = CAM.map(([k]) => c[k] || 0).join(',');
    if (!out.some(x => CAM.map(([k]) => x[k] || 0).join(',') === key) && out.length < 4) out.push(c);
  });
  return out;
}

/* ═══ RUNNER HTML — one builder, used by both "send" and "fill myself" ═══ */
let runnerCache = null;
async function getRunner(){
  if (runnerCache) return runnerCache;
  const r = await fetch('./runner-template.html');
  if (!r.ok) throw new Error('לא נמצא קובץ המנוע.');
  runnerCache = await r.text();
  return runnerCache;
}
async function buildRunnerHtml(task){
  const exp = { id:task.id, title:task.title, site:task.site, owner:task.owner, estimated:task.estimated, description:task.description, fields:expandCameras(task) };
  const src = { id:task.id, kind:task.kind, status:task.status, title:task.title, site:task.site, owner:task.owner, estimated:task.estimated, description:task.description, titleAuto:task.titleAuto, cameras:task.cameras || null, fields:task.fields };
  const tpl = await getRunner();
  const safeTitle = (task.title || 'משימת שדה').replace(/[<>]/g, '');
  const taskJson = JSON.stringify(exp).replace(/<\//g, '<\\/');
  const srcJson = JSON.stringify(src).replace(/<\//g, '<\\/');
  // function-form replacers keep $-patterns and </script sequences inert
  return tpl.replace('__TITLE__', () => safeTitle).replace('__TASK__', () => taskJson).replace('__TASKSRC__', () => srcJson);
}
async function genFile(task, afterFn, btnSel){
  const btn = btnSel ? q(btnSel) : null;
  const restore = btn ? btn.innerHTML : null;
  if (btn) { btn.disabled = true; btn.textContent = 'מכין…'; }
  try {
    if (!expandCameras(task).length) { toast('אין שדות במשימה — אין מה להפיק.', 'warn'); return; }
    Store.upsert(task);
    const html = await buildRunnerHtml(task);
    const fn = (task.title.replace(/[^\p{L}\p{N}]+/gu, '-') || 'משימה') + '.html';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type:'text/html' })); a.download = fn; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    Store.setStatus(task.id, 'sent', { sentAt:Date.now() });
    toast('הקובץ מוכן. שולחים למבצע בוואטסאפ — כמסמך.', 'ok');
    if (afterFn) afterFn();
  } catch (e) { toast(e.message || 'ההפקה נכשלה.', 'warn'); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = restore; } }
}

/* ═══ FILL IT MYSELF — the real runner, inside the app ═══ */
window.SHTACHLA_HOST = true;
let selfFillTask = null;
async function fillSelf(task){
  try {
    if (!expandCameras(task).length) { toast('אין שדות במשימה — אין מה למלא.', 'warn'); return; }
    Store.upsert(task);
    selfFillTask = task;
    const html = await buildRunnerHtml(task);
    const ov = document.createElement('div'); ov.className = 'rov'; ov.id = 'rov';
    ov.innerHTML = `
      <div class="rov-bar">
        <button class="rov-x" id="rov-x" type="button" aria-label="סגירה">${ic('close')}</button>
        <div class="rov-t"><b>מילוי עצמי</b><span>${esc(task.title)}</span></div>
        <span class="rov-tag">${ic('pencil','ic sm')} טיוטה נשמרת</span>
      </div>
      <iframe class="rov-if" id="rov-if" title="מילוי משימת שטח"></iframe>`;
    document.body.append(ov);
    document.documentElement.classList.add('locked');
    const ifr = document.getElementById('rov-if');
    // about:blank iframe inherits this origin, so localStorage drafts and the direct
    // parent handoff below both work — no postMessage origin dance needed.
    const d = ifr.contentDocument || ifr.contentWindow.document;
    d.open(); d.write(html); d.close();
    document.getElementById('rov-x').onclick = () => {
      if (!confirm('לסגור את המילוי? מה שמולא נשמר כטיוטה וימשיך מאותה נקודה.')) return;
      closeSelfFill();
    };
  } catch (e) { toast(e.message || 'לא ניתן לפתוח את המילוי.', 'warn'); }
}
function closeSelfFill(){
  const ov = document.getElementById('rov'); if (ov) ov.remove();
  document.documentElement.classList.remove('locked');
  selfFillTask = null;
  switchTab('home');
}
/* the runner calls this directly (same-origin), no serialisation through postMessage */
window.SHTACHLA_RECEIVE = async function (payload){
  await handleOpenedPayload(payload, true);
  const ov = document.getElementById('rov');
  if (ov) setTimeout(closeSelfFillToResult, 900);
};
function closeSelfFillToResult(){
  const ov = document.getElementById('rov'); if (ov) ov.remove();
  document.documentElement.classList.remove('locked');
  selfFillTask = null;
}
window.addEventListener('message', e => {
  const ifr = document.getElementById('rov-if');
  if (!ifr || e.source !== ifr.contentWindow) return;
  if (e.data && e.data.type === 'shtachla-result') window.SHTACHLA_RECEIVE(e.data.payload);
});

/* ═══ SHELL ═══ */
let currentTab = 'home';
function switchTab(name){
  currentTab = name;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  if (name === 'home') renderHome();
  else if (name === 'results') renderResultsTab();
  else renderMoreTab();
}
function openSheetEl(html){
  const bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'sheet-bg';
  bg.innerHTML = `<div class="sheet">${html}</div>`;
  document.body.append(bg);
  bg.addEventListener('click', e => { if (e.target === bg) closeSheet(); });
  return bg;
}
function closeSheet(){ const bg = document.getElementById('sheet-bg'); if (bg) bg.remove(); }

function quickActionsSheet(){
  const recent = Store.all().filter(t => t.kind === 'site-survey').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const el = openSheetEl(`
    <div class="grab"></div>
    <div class="sheet-head"><b>פעולה חדשה</b><button class="done" id="qa-close" type="button">סגירה</button></div>
    <div class="sheet-body">
      ${recent.length ? `<button class="qa-wide" id="qa-based" type="button">
        <span class="qic">${ic('copy')}</span>
        <span class="m"><b>אתר חדש על בסיס קיים</b><span>משנים שם, כתובת וכמות מצלמות — ושולחים</span></span>
        ${ic('chev-left','ic chv')}</button>` : ''}
      <div class="qa-grid">
        <button class="qa-item primary" id="qa-survey" type="button"><span class="qic">${ic('cctv')}</span><b>תיק אתר חדש</b></button>
        <button class="qa-item" id="qa-blank" type="button"><span class="qic">${ic('layers')}</span><b>משימה מאפס</b></button>
        <button class="qa-item" id="qa-imp" type="button"><span class="qic">${ic('download')}</span><b>ייבוא משימה</b></button>
        <button class="qa-item" id="qa-res" type="button"><span class="qic">${ic('unlock')}</span><b>פתיחת תוצאה</b></button>
      </div>
    </div>`);
  el.querySelector('#qa-close').onclick = closeSheet;
  el.querySelector('#qa-survey').onclick = () => { closeSheet(); openWizard(siteTemplate()); };
  el.querySelector('#qa-blank').onclick = () => { closeSheet(); openFieldEditorTask(blankTemplate()); };
  el.querySelector('#qa-imp').onclick = () => { closeSheet(); impTask.click(); };
  el.querySelector('#qa-res').onclick = () => { closeSheet(); impResult.click(); };
  const based = el.querySelector('#qa-based');
  if (based) based.onclick = () => { closeSheet(); basedOnSheet(); };
}

/* ═══ "NEW SITE FROM EXISTING" → 3-field delta screen ═══ */
function basedOnSheet(){
  const recent = Store.all().filter(t => t.kind === 'site-survey').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 8);
  const el = openSheetEl(`
    <div class="grab"></div>
    <div class="sheet-head"><b>על בסיס איזה אתר?</b><button class="done" id="bo-close" type="button">סגירה</button></div>
    <div class="sheet-body">
      ${recent.map(t => `<button class="jrow" type="button" data-base="${t.id}">
        <span class="st ${stMeta(t.status).cls}">${ic(stMeta(t.status).icon)}</span>
        <span class="m"><b>${esc(t.site || t.title)}</b><span>${camLabel(t.cameras)} · ${dateText(t.updatedAt)}</span></span>
        ${ic('chev-left','ic chv')}</button>`).join('')}
    </div>`);
  el.querySelector('#bo-close').onclick = closeSheet;
  el.querySelectorAll('[data-base]').forEach(b => b.onclick = () => {
    const src = Store.get(b.dataset.base); if (!src) return;
    const c = structuredClone(src);
    c.id = uid(); c.status = 'draft'; c.sentAt = null; c.site = ''; c.titleAuto = true;
    c.title = 'תיק אתר — מצלמות';
    // camera field ids are derived from task.id, so they regenerate cleanly
    closeSheet(); openDelta(c, src);
  });
}
let delta = null;
function openDelta(task, src){ delta = { task, srcName:(src.site || src.title) }; renderDelta(); }
function renderDelta(){
  const t = delta.task;
  app.innerHTML = `
    <div class="page-head"><button class="back-btn" id="back" type="button">${ic('back')}</button>
      <div><h1>מה השתנה?</h1><p>מבוסס על ${esc(delta.srcName)} · כל השאר זהה</p></div></div>
    <div class="lcard">
      <div class="form-grid">
        <div class="field full"><label for="d-site">שם האתר</label><input class="input" id="d-site" value="${esc(t.site)}" placeholder="לדוגמה: מגרש חנייה מזרחי" autocomplete="off"></div>
        <div class="field full"><label for="d-addr">כתובת</label><input class="input" id="d-addr" value="${esc(deltaAddr(t))}" placeholder="רחוב, עיר" autocomplete="off"></div>
      </div>
      <div class="dsum" id="d-title"></div>
    </div>
    <div class="lcard">
      <div class="lcard-head"><h3>מצלמות</h3><span class="cnt" id="d-cnt"></span></div>
      <div id="d-cams"></div>
    </div>`;
  q('#back').onclick = () => { delta = null; switchTab('home'); };
  const titleBox = q('#d-title');
  function syncTitle(){
    if (t.titleAuto) t.title = t.site ? `תיק אתר — ${t.site}` : 'תיק אתר — מצלמות';
    titleBox.innerHTML = `${ic('info','ic sm')}<span>שם המשימה: <b>${esc(t.title)}</b></span>`;
  }
  q('#d-site').addEventListener('input', e => { t.site = e.target.value; syncTitle(); });
  q('#d-addr').addEventListener('input', e => setDeltaAddr(t, e.target.value));
  syncTitle();
  renderCamPicker(q('#d-cams'), t, () => { q('#d-cnt').textContent = `${camTotal(t)} מצלמות`; });
  q('#d-cnt').textContent = `${camTotal(t)} מצלמות`;
  actionBar({
    task:t,
    extra:`<button class="btn ghost" id="ab-full" type="button">${ic('settings')} עריכה מלאה</button>`,
    onAfter:() => { delta = null; switchTab('home'); },
    wire:() => { q('#ab-full').onclick = () => { const tt = delta.task; delta = null; openWizard(tt, 1); }; },
  });
}
/* address lives in the field list (it is answered in the field), so the delta screen writes its default */
function deltaAddr(t){ const f = t.fields.find(x => x.label === 'כתובת'); return (f && f.prefill) || ''; }
function setDeltaAddr(t, v){ const f = t.fields.find(x => x.label === 'כתובת'); if (f) f.prefill = v || undefined; }

/* ═══ STICKY ACTION BAR — generate / fill is reachable from every screen ═══ */
function actionBar(opts){
  const old = document.getElementById('abar'); if (old) old.remove();
  const bar = document.createElement('div'); bar.className = 'abar'; bar.id = 'abar';
  bar.innerHTML = `<div class="abar-in">
      ${opts.extra || ''}
      <button class="btn ghost" id="ab-fill" type="button">${ic('pencil')} מלא בעצמי</button>
      <button class="btn primary" id="ab-gen" type="button">${ic('file-out')} הפק ושלח</button>
    </div>`;
  document.body.append(bar);
  document.body.classList.add('has-abar');
  document.getElementById('ab-gen').onclick = () => genFile(opts.task, opts.onAfter, '#ab-gen');
  document.getElementById('ab-fill').onclick = () => fillSelf(opts.task);
  if (opts.wire) opts.wire();
}
function clearActionBar(){ const b = document.getElementById('abar'); if (b) b.remove(); document.body.classList.remove('has-abar'); }

/* ═══ CAMERA PICKER — typed number, learned presets, no tap-tap-tap ═══ */
function renderCamPicker(container, task, onChange){
  if (!task.cameras) task.cameras = { bullet4k:0, ptz:0, lpr:0, dome:0 };
  const presets = camPresets();
  container.innerHTML = `
    ${presets.length ? `<div class="chips" id="cam-presets">${presets.map((c, i) => `<button class="chip" type="button" data-preset="${i}">${esc(camLabel(c))}</button>`).join('')}</div>` : ''}
    <div class="cam-grid">${CAM.map(([k, name, sub]) => `
      <div class="cam-box">
        <div class="cn">${ic('cctv','ic sm')} ${name}</div><div class="cs">${sub}</div>
        <div class="stepper">
          <button type="button" data-dec="${k}" aria-label="הפחתה">${ic('minus')}</button>
          <input class="cv" type="number" inputmode="numeric" min="0" max="99" value="${(task.cameras[k] || 0)}" data-cam="${k}" aria-label="${name} — כמות">
          <button type="button" data-inc="${k}" aria-label="הוספה">${ic('plus')}</button>
        </div>
      </div>`).join('')}</div>
    <div class="summary-box" id="cam-sum"></div>`;
  const sum = container.querySelector('#cam-sum');
  function refresh(){
    const n = camTotal(task);
    sum.innerHTML = n
      ? `${ic('info','ic sm')}<span>ייווצרו <b>${n}</b> סעיפי מצלמה — <b>${n * 5}</b> שדות. סה״כ <b>${sectionCount(task)}</b> מסכים למבצע.</span>`
      : `${ic('info','ic sm')}<span>לא נבחרו מצלמות. אפשר להמשיך בלי, ולהוסיף סעיפים בשלב הבא.</span>`;
    if (onChange) onChange();
  }
  const setVal = (k, v) => {
    task.cameras[k] = Math.max(0, Math.min(99, v | 0));
    container.querySelector(`[data-cam="${k}"]`).value = task.cameras[k];
    refresh();
  };
  container.querySelectorAll('[data-inc]').forEach(b => b.onclick = () => setVal(b.dataset.inc, (task.cameras[b.dataset.inc] || 0) + 1));
  container.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => setVal(b.dataset.dec, (task.cameras[b.dataset.dec] || 0) - 1));
  container.querySelectorAll('[data-cam]').forEach(i => i.addEventListener('input', () => setVal(i.dataset.cam, parseInt(i.value, 10) || 0)));
  container.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => {
    const c = presets[+b.dataset.preset];
    CAM.forEach(([k]) => { task.cameras[k] = c[k] || 0; container.querySelector(`[data-cam="${k}"]`).value = task.cameras[k]; });
    refresh();
  });
  refresh();
}

/* ═══ HOME ═══ */
async function renderHome(){
  clearActionBar();
  const tasks = Store.all().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const results = await ResultsLib.all();
  const pending = results.filter(r => !r.reviewedAt);
  const totalMissing = pending.reduce((s, r) => s + missingRequired(r), 0);
  const totalFields = pending.reduce((s, r) => s + r.answers.length, 0);
  const inField = tasks.filter(t => t.status === 'sent').length;

  const hero = pending.length ? `
    <div class="hero-card">
      <div class="hero-top"><h3>ממתינות לעדכון</h3><button class="hero-arrow" id="hero-go" type="button">${ic('chev-left')}</button></div>
      <div class="hero-stat"><span class="n mono">${pending.length}</span><span class="l">תוצאות חזרו מהשטח</span></div>
      <div class="hero-pills"><span class="pill">${ic('f-para','ic sm')} <b>${totalFields}</b> שדות</span>${totalMissing ? `<span class="pill">${ic('warn','ic sm')} <b>${totalMissing}</b> חסרים</span>` : ''}${inField ? `<span class="pill">${ic('send','ic sm')} <b>${inField}</b> בשטח</span>` : ''}</div>
    </div>` : `
    <div class="hero-card empty">
      <div class="hero-top"><h3>הכול מסודר</h3><button class="hero-arrow" id="hero-go" type="button">${ic('chev-left')}</button></div>
      <div class="hero-stat"><span class="n mono">0</span><span class="l">תוצאות ממתינות</span></div>
      <div class="hero-pills">${inField ? `<span class="pill">${ic('send','ic sm')} <b>${inField}</b> משימות בשטח</span>` : '<span class="pill">אין מה לעשות כרגע</span>'}</div>
    </div>`;

  const recentResults = results.slice(0, 4);
  const resultsList = recentResults.length ? `
    <div class="lcard">
      <div class="lcard-head"><h3>חזרו מהשטח</h3><button class="arrow" id="results-arrow" type="button">${ic('chev-left')}</button></div>
      ${recentResults.map(resultRowHtml).join('')}
    </div>` : '';

  /* grouped by lifecycle status — the thing that was missing entirely */
  const order = ['returned','sent','draft','approved'];
  const groups = order.map(s => ({ s, items:tasks.filter(t => (t.status || 'draft') === s) })).filter(g => g.items.length);
  const tasksList = groups.length ? groups.map(g => `
    <div class="lcard">
      <div class="lcard-head"><h3>${stMeta(g.s).label}</h3><span class="cnt">${g.items.length}</span></div>
      ${g.items.map(taskRowHtml).join('')}
    </div>`).join('') : `<div class="lcard"><div class="lcard-head"><h3>המשימות שלי</h3></div>
      <div class="empty-note">עדיין אין משימות.<br>התחל מתבנית מוכנה, או בנה חדשה מאפס.</div></div>`;

  const hasSurvey = tasks.some(t => t.kind === 'site-survey');
  const quick = `
    <div class="lcard">
      <div class="lcard-head"><h3>התחלה</h3></div>
      ${hasSurvey ? `<button class="qa-wide" id="q-based" type="button">
        <span class="qic">${ic('copy')}</span>
        <span class="m"><b>אתר חדש על בסיס קיים</b><span>הדרך המהירה — 2 שדות וכמות מצלמות</span></span>
        ${ic('chev-left','ic chv')}</button>` : ''}
      <div class="qa-grid">
        <button class="qa-item primary" id="q-survey" type="button"><span class="qic">${ic('cctv')}</span><b>תיק אתר חדש</b></button>
        <button class="qa-item" id="q-blank" type="button"><span class="qic">${ic('layers')}</span><b>משימה מאפס</b></button>
        <button class="qa-item" id="q-imp" type="button"><span class="qic">${ic('download')}</span><b>ייבוא משימה</b></button>
        <button class="qa-item" id="q-res" type="button"><span class="qic">${ic('unlock')}</span><b>פתיחת תוצאה</b></button>
      </div>
    </div>`;

  app.innerHTML = hero + resultsList + tasksList + quick;

  const heroGo = q('#hero-go'); if (heroGo) heroGo.onclick = () => switchTab('results');
  const resArrow = q('#results-arrow'); if (resArrow) resArrow.onclick = () => switchTab('results');
  document.querySelectorAll('[data-viewres]').forEach(b => b.onclick = () => viewResult(b.dataset.viewres));
  q('#q-survey').onclick = () => openWizard(siteTemplate());
  q('#q-blank').onclick = () => openFieldEditorTask(blankTemplate());
  q('#q-imp').onclick = () => impTask.click();
  q('#q-res').onclick = () => impResult.click();
  const qb = q('#q-based'); if (qb) qb.onclick = basedOnSheet;
  document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openTask(b.dataset.open));
  document.querySelectorAll('[data-menu]').forEach(b => b.onclick = e => { e.stopPropagation(); taskMenu(b.dataset.menu); });
}
function taskRowHtml(t){
  const st = stMeta(t.status);
  const secs = t.kind === 'site-survey' ? `${sectionCount(t)} סעיפים` : `${t.fields.length} שדות`;
  const when = t.status === 'sent' && t.sentAt ? `נשלח ${dateText(t.sentAt)}` : dateText(t.updatedAt);
  return `<div class="lrow" data-open="${t.id}" role="button" tabindex="0">
    <div class="tile ${st.cls}">${ic(t.kind === 'site-survey' ? 'cctv' : 'layers')}</div>
    <div class="mid"><b>${esc(t.site || t.title)}</b><span>${secs} · ${esc(when)}</span></div>
    <button class="row-btn" data-menu="${t.id}" type="button" aria-label="אפשרויות">${ic('dots')}</button>
    ${ic('chev-left','ic chv')}
  </div>`;
}
function openTask(id){
  const t = Store.get(id); if (!t) return;
  if (t.kind === 'site-survey') openWizard(t, 4); else openFieldEditorTask(t);
}
function taskMenu(id){
  const t = Store.get(id); if (!t) return;
  const el = openSheetEl(`
    <div class="grab"></div>
    <div class="sheet-head"><b>${esc(t.site || t.title)}</b><button class="done" id="tm-close" type="button">סגירה</button></div>
    <div class="sheet-body">
      <button class="jrow" type="button" id="tm-gen"><span class="st info">${ic('file-out')}</span><span class="m"><b>הפק ושלח שוב</b><span>אותה משימה, קובץ חדש</span></span></button>
      <button class="jrow" type="button" id="tm-fill"><span class="st ok">${ic('pencil')}</span><span class="m"><b>מלא בעצמי</b><span>בלי לשלוח לאף אחד</span></span></button>
      <button class="jrow" type="button" id="tm-edit"><span class="st">${ic('settings')}</span><span class="m"><b>עריכה</b><span>שדות, מצלמות ופרטים</span></span></button>
      <button class="jrow" type="button" id="tm-dup"><span class="st">${ic('copy')}</span><span class="m"><b>שכפול לאתר חדש</b><span>משנים שם וכמות מצלמות</span></span></button>
      ${t.status !== 'draft' ? `<button class="jrow" type="button" id="tm-reset"><span class="st">${ic('reset')}</span><span class="m"><b>סימון כטיוטה</b><span>מחזיר את הסטטוס</span></span></button>` : ''}
      <button class="sheet-danger" id="tm-del" type="button">מחיקת המשימה</button>
    </div>`);
  el.querySelector('#tm-close').onclick = closeSheet;
  el.querySelector('#tm-gen').onclick = () => { closeSheet(); genFile(t, () => switchTab('home')); };
  el.querySelector('#tm-fill').onclick = () => { closeSheet(); fillSelf(t); };
  el.querySelector('#tm-edit').onclick = () => { closeSheet(); t.kind === 'site-survey' ? openWizard(t, 1) : openFieldEditorTask(t); };
  el.querySelector('#tm-dup').onclick = () => {
    closeSheet();
    const c = structuredClone(t); c.id = uid(); c.status = 'draft'; c.sentAt = null; c.site = ''; c.titleAuto = true; c.title = 'תיק אתר — מצלמות';
    if (c.kind === 'site-survey') openDelta(c, t); else { c.title = t.title + ' (עותק)'; Store.upsert(c); openFieldEditorTask(c); }
  };
  const rs = el.querySelector('#tm-reset');
  if (rs) rs.onclick = () => { closeSheet(); Store.setStatus(t.id, 'draft'); renderHome(); toast('סומן כטיוטה.'); };
  el.querySelector('#tm-del').onclick = () => {
    if (!confirm('למחוק את המשימה הזו?')) return;
    closeSheet(); Store.remove(t.id); renderHome(); toast('נמחקה.');
  };
}
function resultRowHtml(r){
  const total = r.answers.length, ans = answeredCount(r), missing = missingRequired(r);
  return `<div class="lrow" data-viewres="${r.id}" role="button" tabindex="0">
    <div class="tile ${missing > 0 ? 'warn' : 'ok'}">${ic(r.task && r.task.kind === 'site-survey' ? 'cctv' : 'layers')}</div>
    <div class="mid"><b>${esc(r.site || r.title)}</b><span>${dateText(r.savedAt)}${missing ? ` · <span class="wn">חסרים ${missing}</span>` : ''}</span></div>
    <div class="frac mono">${ans}/${total}</div>
    ${ic('chev-left','ic chv')}
  </div>`;
}

/* ═══ RESULTS TAB ═══ */
async function renderResultsTab(){
  clearActionBar();
  const results = await ResultsLib.all();
  app.innerHTML = `
    <div class="page-head"><div><h1>תוצאות</h1><p>נשמרות במכשיר הזה בלבד.</p></div></div>
    ${results.length ? `<div class="lcard">${results.map(resultsTabRowHtml).join('')}</div>`
      : `<div class="lcard"><div class="empty-note">אין עדיין תוצאות שמורות.<br>פתח קובץ שחזר מהשטח, או מלא משימה בעצמך.</div></div>`}
    <div class="lcard"><button class="btn primary block" id="res-open">${ic('unlock')} פתיחת קובץ תוצאה</button></div>`;
  q('#res-open').onclick = () => impResult.click();
  document.querySelectorAll('[data-viewres]').forEach(b => b.onclick = () => viewResult(b.dataset.viewres));
  document.querySelectorAll('[data-delres]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    if (!confirm('למחוק את התוצאה הזו מהספרייה?')) return;
    await ResultsLib.remove(b.dataset.delres); renderResultsTab();
  });
}
function resultsTabRowHtml(r){
  const total = r.answers.length, ans = answeredCount(r), missing = missingRequired(r);
  return `<div class="lrow" data-viewres="${r.id}" role="button" tabindex="0">
    <div class="tile ${missing > 0 ? 'warn' : 'ok'}">${ic(r.task && r.task.kind === 'site-survey' ? 'cctv' : 'layers')}</div>
    <div class="mid"><b>${esc(r.site || r.title)}</b><span>${ans}/${total} שדות${missing ? ` · <span class="wn">חסרים ${missing}</span>` : ''}${r.source === 'in-app' ? ' · מילוי עצמי' : ''}</span></div>
    <button class="row-btn" data-delres="${r.id}" type="button" aria-label="מחיקה">${ic('trash')}</button>
    ${ic('chev-left','ic chv')}
  </div>`;
}

/* ═══ MORE TAB ═══ */
function renderMoreTab(){
  clearActionBar();
  const p = Prefs.get();
  app.innerHTML = `
    <div class="page-head"><div><h1>עוד</h1><p>ברירות מחדל, ייבוא והתקנה.</p></div></div>
    <div class="lcard">
      <div class="lcard-head"><h3>ברירות מחדל</h3><span class="cnt">חוסך הקלדה</span></div>
      <p class="note-txt">הערכים האלה ימולאו מראש בכל משימה חדשה.</p>
      <div class="form-grid">
        <div class="field full"><label for="p-owner">שולח המשימה</label><input class="input" id="p-owner" value="${esc(p.owner)}" placeholder="השם שיופיע למבצע" autocomplete="off"></div>
        <div class="field full"><label for="p-est">משך משוער</label><input class="input" id="p-est" value="${esc(p.estimated)}" autocomplete="off"></div>
        <div class="field full"><label for="p-desc">הנחיית פתיחה למבצע</label><textarea class="textarea" id="p-desc" rows="3" placeholder="מה שהמבצע יראה במסך הראשון">${esc(p.description)}</textarea></div>
      </div>
      <div class="saved-tag" id="p-saved" hidden>${ic('check','ic sm')} נשמר</div>
    </div>
    <div class="lcard">
      <div class="lrow" id="more-import" role="button" tabindex="0"><div class="tile info">${ic('download')}</div><div class="mid"><b>ייבוא משימה</b><span>טעינת קובץ משימה קיים</span></div>${ic('chev-left','ic chv')}</div>
      <div class="lrow" id="more-install" role="button" tabindex="0"><div class="tile info">${ic('install')}</div><div class="mid"><b>התקנת האפליקציה</b><span>אייקון על מסך הבית · עובד גם בלי אינטרנט</span></div>${ic('chev-left','ic chv')}</div>
    </div>
    <div class="lcard"><p class="note-txt" style="margin:0">שטחלה — ניהול משימות בשטח. הכול מקומי: המשימות והתוצאות נשמרות רק במכשיר הזה, בלי שרת ובלי ענן.</p></div>`;
  const savedTag = q('#p-saved');
  let tm = null;
  const mark = () => { savedTag.hidden = false; clearTimeout(tm); tm = setTimeout(() => savedTag.hidden = true, 1800); };
  q('#p-owner').addEventListener('input', e => { Prefs.set({ owner:e.target.value }); mark(); });
  q('#p-est').addEventListener('input', e => { Prefs.set({ estimated:e.target.value }); mark(); });
  q('#p-desc').addEventListener('input', e => { Prefs.set({ description:e.target.value }); mark(); });
  q('#more-import').onclick = () => impTask.click();
  q('#more-install').onclick = () => { if (dp) dp.prompt(); else toast('ההתקנה כבר בוצעה, או שהדפדפן לא תומך בה כרגע.'); };
}

/* ═══ FIELD LIST + EDIT SHEET ═══ */
function fieldRowHtml(f, idx){
  return `<div class="field-list-row" data-idx="${idx}" role="button" tabindex="0">
    <span class="gr">${ic(fIcon(f.type))}</span>
    <div class="m"><b>${esc(f.label)}</b>
      <div class="mt"><span class="chip-s">${esc(fLabel(f.type))}</span>${f.required ? '<span class="req">חובה</span>' : ''}${f.prefill ? '<span class="req pre">מולא מראש</span>' : ''}</div>
    </div>
    ${ic('chev-left','ic chv')}
  </div>`;
}
function renderFieldList(container, task, onChange, collapsed){
  const groups = [];
  task.fields.forEach(f => {
    if (f.type === '__cameras__') return;
    const s = f.section || 'כללי';
    let g = groups.find(x => x.s === s); if (!g) { g = { s, icon:f.secIcon, items:[] }; groups.push(g); }
    g.items.push(f);
  });
  const realCount = task.fields.filter(f => f.type !== '__cameras__').length;
  const reqCount = task.fields.filter(f => f.required).length;
  if (collapsed) {
    container.innerHTML = `
      <div class="lcard-head"><h3>שדות המשימה</h3><span class="cnt">${realCount} שדות · ${reqCount} חובה</span></div>
      <div class="collapsed">
        ${groups.map(g => `<span class="chip-s big">${ic(g.icon || 'target','ic sm')} ${esc(g.s)} · ${g.items.length}</span>`).join('')}
      </div>
      <button class="btn ghost block" id="fl-expand" type="button">${ic('settings')} עריכת השדות</button>`;
    container.querySelector('#fl-expand').onclick = () => renderFieldList(container, task, onChange, false);
    return;
  }
  container.innerHTML = `
    <div class="lcard-head"><h3>שדות המשימה</h3><span class="cnt">${realCount} שדות · ${reqCount} חובה</span></div>
    ${groups.map(g => `<div class="section-band">${ic(g.icon || 'target','ic sm')} ${esc(g.s)}</div>${g.items.map(f => fieldRowHtml(f, task.fields.indexOf(f))).join('')}`).join('')}`;
  container.querySelectorAll('.field-list-row').forEach(row => {
    row.onclick = () => openFieldSheet(task, task.fields[+row.dataset.idx], onChange);
  });
}
function blockCatalogSheet(task, onChange){
  const el = openSheetEl(`
    <div class="grab"></div>
    <div class="sheet-head"><b>הוספת סעיף מוכן</b><button class="done" id="bc-close" type="button">סגירה</button></div>
    <div class="sheet-body">
      ${BLOCKS.map(b => `<button class="jrow" type="button" data-blk="${b.id}">
        <span class="st info">${ic(b.icon)}</span>
        <span class="m"><b>${esc(b.name)}</b><span>${esc(b.sub)} · ${b.fields.length} שדות</span></span>
        ${ic('plus','ic chv')}</button>`).join('')}
      <button class="btn ghost block" id="bc-single" type="button" style="margin-top:8px">${ic('plus')} שדה בודד ריק</button>
    </div>`);
  el.querySelector('#bc-close').onclick = closeSheet;
  el.querySelectorAll('[data-blk]').forEach(b => b.onclick = () => {
    const blk = BLOCKS.find(x => x.id === b.dataset.blk);
    const name = addBlock(task, blk);
    closeSheet(); onChange(); toast(`נוסף סעיף "${name}" — ${blk.fields.length} שדות.`, 'ok');
  });
  el.querySelector('#bc-single').onclick = () => {
    task.fields.push({ id:uid(), label:'שדה חדש', type:'text', required:false, section:'', secIcon:'', help:'' });
    closeSheet(); onChange();
  };
}
function fieldSheetHtml(f){
  const opts = (f.options && f.options.length) ? f.options : (f.type === 'select' ? ['תקין','נדרש טיפול','לא רלוונטי'] : []);
  return `
    <div class="grab"></div>
    <div class="sheet-head"><b>עריכת שדה</b><button class="done" id="fs-done" type="button">סיום</button></div>
    <div class="sheet-body">
      <div class="field"><label for="fs-label">נוסח השדה</label><textarea class="textarea" id="fs-label" rows="2">${esc(f.label)}</textarea></div>
      <div class="field"><label>סוג השדה</label><div class="pill-select" id="fs-type">${FIELD_TYPES.map(t => `<button type="button" class="pill-opt ${t.value === f.type ? 'active' : ''}" data-type="${t.value}">${ic(t.icon,'ic sm')} ${esc(t.label)}</button>`).join('')}</div></div>
      <div class="field" id="fs-options-wrap" style="${f.type === 'select' ? '' : 'display:none'}">
        <label>אפשרויות בחירה</label>
        <div class="opt-list" id="fs-options">${opts.map((o, i) => `<div class="opt-row"><input class="input" data-opt="${i}" value="${esc(o)}"><button type="button" class="rm-opt" data-rmopt="${i}" aria-label="מחיקה">${ic('close','ic sm')}</button></div>`).join('')}</div>
        <button type="button" class="add-opt" id="fs-addopt">${ic('plus','ic sm')} הוספת אפשרות</button>
      </div>
      <div class="field"><label for="fs-prefill">ערך שמולא מראש (אופציונלי)</label><input class="input" id="fs-prefill" value="${esc(f.prefill || '')}" placeholder="מה שאתה כבר יודע — המבצע לא יקליד"></div>
      <div class="field"><label for="fs-help">טקסט עזרה (אופציונלי)</label><textarea class="textarea" id="fs-help" rows="2" placeholder="הנחיה קצרה שתופיע מתחת לשאלה">${esc(f.help || '')}</textarea></div>
      <div class="field"><label for="fs-section">שם סעיף (אופציונלי)</label><input class="input" id="fs-section" value="${esc(f.section || '')}" placeholder="לדוגמה: ארונות"></div>
      <div class="switch-row"><span class="lbl">שדה חובה</span><input type="checkbox" class="switch" id="fs-required" ${f.required ? 'checked' : ''}></div>
      <button type="button" class="sheet-danger" id="fs-delete">מחיקת השדה</button>
    </div>`;
}
function openFieldSheet(task, field, onChange){
  const el = openSheetEl(fieldSheetHtml(field));
  const labelEl = el.querySelector('#fs-label');
  const grow = () => { labelEl.style.height = 'auto'; labelEl.style.height = labelEl.scrollHeight + 'px'; };
  grow(); labelEl.addEventListener('input', e => { field.label = e.target.value; grow(); });
  function wireOptRow(row){
    row.querySelector('[data-opt]').addEventListener('input', syncOptions);
    row.querySelector('[data-rmopt]').onclick = () => { row.remove(); syncOptions(); };
  }
  function renderOptionsList(){
    const wrap = el.querySelector('#fs-options');
    const opts = (field.options && field.options.length) ? field.options : ['תקין','נדרש טיפול','לא רלוונטי'];
    wrap.innerHTML = opts.map((o, i) => `<div class="opt-row"><input class="input" data-opt="${i}" value="${esc(o)}"><button type="button" class="rm-opt" data-rmopt="${i}" aria-label="מחיקה">${ic('close','ic sm')}</button></div>`).join('');
    wrap.querySelectorAll('.opt-row').forEach(wireOptRow);
    field.options = opts;
  }
  el.querySelectorAll('[data-type]').forEach(b => b.onclick = () => {
    field.type = b.dataset.type;
    el.querySelectorAll('[data-type]').forEach(x => x.classList.toggle('active', x === b));
    el.querySelector('#fs-options-wrap').style.display = field.type === 'select' ? '' : 'none';
    if (field.type === 'select' && !(field.options && field.options.length)) renderOptionsList();
  });
  el.querySelector('#fs-prefill').addEventListener('input', e => { field.prefill = e.target.value || undefined; });
  el.querySelector('#fs-help').addEventListener('input', e => field.help = e.target.value);
  el.querySelector('#fs-section').addEventListener('input', e => field.section = e.target.value);
  el.querySelector('#fs-required').addEventListener('change', e => field.required = e.target.checked);
  function syncOptions(){ field.options = [...el.querySelectorAll('[data-opt]')].map(i => i.value).filter(v => v.trim()); }
  el.querySelectorAll('.opt-row').forEach(wireOptRow);
  el.querySelector('#fs-addopt').onclick = () => {
    const wrap = el.querySelector('#fs-options'); const i = wrap.children.length;
    const row = document.createElement('div'); row.className = 'opt-row';
    row.innerHTML = `<input class="input" data-opt="${i}" value=""><button type="button" class="rm-opt" data-rmopt="${i}" aria-label="מחיקה">${ic('close','ic sm')}</button>`;
    wrap.append(row); wireOptRow(row);
  };
  el.querySelector('#fs-delete').onclick = () => {
    if (task.fields.filter(x => x.type !== '__cameras__').length <= 1) { toast('חייב להישאר שדה אחד.', 'warn'); return; }
    task.fields = task.fields.filter(x => x !== field);
    closeSheet(); onChange();
  };
  el.querySelector('#fs-done').onclick = () => { syncOptions(); closeSheet(); onChange(); };
}

/* ═══ SITE-SURVEY WIZARD ═══ */
let wiz = null;
const WIZ_STEPS = [
  { n:1, t:'פרטי הפרויקט', s:'מי, מה ומתי' },
  { n:2, t:'מצלמות', s:'כמה מכל סוג' },
  { n:3, t:'סעיפים ושדות', s:'ארונות, פריסה, סיכום' },
  { n:4, t:'סקירה', s:'בדיקה אחרונה' },
];
function openWizard(task, startStep){
  if (!task.cameras) task.cameras = { bullet4k:0, ptz:0, lpr:0, dome:0 };
  wiz = { task:structuredClone(task), step:startStep || 1 };
  renderWizard();
}
function wizHead(){
  const s = WIZ_STEPS[wiz.step - 1];
  return `<div class="page-head"><button class="back-btn" id="back" type="button">${ic('back')}</button>
      <div><h1>${s.t}</h1><p>${s.s}</p></div></div>
    <div class="wiz-track" role="tablist">${WIZ_STEPS.map(x => `<button class="wt ${x.n === wiz.step ? 'now' : (x.n < wiz.step ? 'done' : '')}" type="button" data-step="${x.n}" role="tab">${x.n < wiz.step ? ic('check','ic sm') : x.n}</button>`).join('')}</div>`;
}
/* The step track is tappable and the sticky bar holds only the two decisive actions.
   "Next" lives in the content flow, where you naturally arrive after filling the step. */
function wizNextBtn(){
  return wiz.step < 4 ? `<button class="btn dark block wiz-next" id="wiz-next" type="button">${WIZ_STEPS[wiz.step].t} ${ic('next')}</button>` : '';
}
function wizWire(onLeave){
  q('#back').onclick = () => { saveWiz(); if (wiz.step > 1) { wiz.step--; renderWizard(); } else { wiz = null; clearActionBar(); switchTab('home'); } };
  document.querySelectorAll('[data-step]').forEach(b => b.onclick = () => {
    if (+b.dataset.step > wiz.step && onLeave && onLeave() === false) return;
    saveWiz(); wiz.step = +b.dataset.step; renderWizard();
  });
  const nb = q('#wiz-next');
  if (nb) nb.onclick = () => { if (onLeave && onLeave() === false) return; saveWiz(); wiz.step++; renderWizard(); window.scrollTo({ top:0, behavior:'smooth' }); };
  actionBar({ task:wiz.task, onAfter:() => { wiz = null; clearActionBar(); switchTab('home'); } });
}
function saveWiz(){ if (wiz) Store.upsert(wiz.task); }
function renderWizard(){
  if (wiz.step === 1) return wizStep1();
  if (wiz.step === 2) return wizStep2();
  if (wiz.step === 3) return wizStep3();
  return wizStep4();
}
function wizStep1(){
  const t = wiz.task;
  app.innerHTML = `${wizHead()}
    <div class="lcard">
      <div class="form-grid">
        <div class="field full"><label for="f-site">אתר / לקוח</label><input class="input" id="f-site" value="${esc(t.site)}" placeholder="לדוגמה: מגרש חנייה מזרחי" autocomplete="off"></div>
        <div class="field full"><label for="f-title">שם המשימה</label><input class="input" id="f-title" value="${esc(t.title)}" autocomplete="off">
          <div class="dsum" id="auto-note"></div></div>
        <div class="field"><label for="f-owner">שולח המשימה</label><input class="input" id="f-owner" value="${esc(t.owner)}" autocomplete="off"></div>
        <div class="field"><label for="f-estimated">משך משוער</label><input class="input" id="f-estimated" value="${esc(t.estimated)}" autocomplete="off"></div>
        <div class="field full"><label for="f-desc">הנחיית פתיחה למבצע</label><textarea class="textarea" id="f-desc" rows="3">${esc(t.description)}</textarea></div>
      </div>
    </div>
    ${wizNextBtn()}`;
  const note = q('#auto-note');
  const showNote = () => note.innerHTML = t.titleAuto
    ? `${ic('wand','ic sm')}<span>נבנה אוטומטית משם האתר. הקלד כאן כדי לקבוע שם קבוע.</span>`
    : `${ic('info','ic sm')}<span>שם ידני. <button class="lnk" type="button" id="auto-back">חזרה לשם אוטומטי</button></span>`;
  const wireNote = () => { const b = q('#auto-back'); if (b) b.onclick = () => { t.titleAuto = true; syncTitle(); showNote(); wireNote(); }; };
  function syncTitle(){ if (t.titleAuto) { t.title = t.site ? `תיק אתר — ${t.site}` : 'תיק אתר — מצלמות'; q('#f-title').value = t.title; } }
  q('#f-site').addEventListener('input', e => { t.site = e.target.value; syncTitle(); });
  q('#f-title').addEventListener('input', e => { t.title = e.target.value; if (t.titleAuto) { t.titleAuto = false; showNote(); wireNote(); } });
  ['owner','estimated'].forEach(k => q('#f-' + k).addEventListener('input', e => { t[k] = e.target.value; Prefs.set({ [k === 'owner' ? 'owner' : 'estimated']:e.target.value }); }));
  q('#f-desc').addEventListener('input', e => { t.description = e.target.value; Prefs.set({ description:e.target.value }); });
  showNote(); wireNote();
  wizWire(() => { if (!t.title.trim()) { toast('יש להזין שם למשימה.', 'warn'); return false; } });
}
function wizStep2(){
  const t = wiz.task;
  app.innerHTML = `${wizHead()}<div class="lcard" id="cams"></div>${wizNextBtn()}`;
  renderCamPicker(q('#cams'), t, null);
  wizWire();
}
function wizStep3(){
  const t = wiz.task;
  app.innerHTML = `${wizHead()}
    <div class="lcard" id="flist"></div>
    <button class="btn ghost block" id="add-block" style="margin-bottom:14px">${ic('plus')} הוספת סעיף מוכן</button>
    ${wizNextBtn()}`;
  const flist = q('#flist');
  const onChange = () => renderFieldList(flist, t, onChange, false);
  renderFieldList(flist, t, onChange, true);
  q('#add-block').onclick = () => blockCatalogSheet(t, () => renderFieldList(flist, t, onChange, false));
  wizWire();
}
function wizStep4(){
  const t = wiz.task;
  const cams = camTotal(t);
  const extra = t.fields.filter(f => f.type !== '__cameras__').length;
  const secs = sectionCount(t);
  app.innerHTML = `${wizHead()}
    <div class="lcard">
      <div class="lrow static"><div class="tile info">${ic('cctv')}</div>
        <div class="mid"><b>${esc(t.title)}</b><span>${esc(t.site || 'ללא אתר')} · ${esc(t.owner || 'ללא שולח')}</span></div></div>
      <div class="stat-grid">
        <div class="stat"><span class="n mono">${secs}</span><span class="l">מסכים למבצע</span></div>
        <div class="stat"><span class="n mono">${cams}</span><span class="l">מצלמות</span></div>
        <div class="stat"><span class="n mono">${cams * 5 + extra}</span><span class="l">שדות</span></div>
      </div>
      <div class="summary-box">${ic('info','ic sm')}<span>${esc(camLabel(t.cameras))}. המבצע עובר <b>${secs}</b> מסכים — מסך אחד לכל סעיף.</span></div>
    </div>
    <div class="lcard">
      <button class="qa-wide" id="w-preview" type="button">
        <span class="qic">${ic('eye')}</span>
        <span class="m"><b>תצוגה מקדימה</b><span>לראות בדיוק מה המבצע יראה</span></span>
        ${ic('chev-left','ic chv')}</button>
      <button class="qa-wide" id="w-save" type="button">
        <span class="qic">${ic('draft')}</span>
        <span class="m"><b>שמירה בלבד</b><span>להשאיר כטיוטה ולחזור אחר כך</span></span>
        ${ic('chev-left','ic chv')}</button>
    </div>`;
  q('#w-preview').onclick = () => fillSelf(t);
  q('#w-save').onclick = () => { Store.upsert(t); toast('נשמר במכשיר כטיוטה.', 'ok'); wiz = null; clearActionBar(); switchTab('home'); };
  wizWire();
}

/* ═══ FREE-TASK EDITOR ═══ */
let freeEd = null;
function openFieldEditorTask(task){ freeEd = structuredClone(task); renderFreeEditor(); }
function renderFreeEditor(){
  const t = freeEd;
  app.innerHTML = `
    <div class="page-head"><button class="back-btn" id="back" type="button">${ic('back')}</button>
      <div><h1>בונה משימה</h1><p>מגדירים מה צריך לחזור מהשטח</p></div></div>
    <div class="lcard">
      <div class="form-grid">
        <div class="field full"><label for="f-title">שם המשימה</label><input class="input" id="f-title" value="${esc(t.title)}" autocomplete="off"></div>
        <div class="field"><label for="f-site">אתר / לקוח</label><input class="input" id="f-site" value="${esc(t.site)}" autocomplete="off"></div>
        <div class="field"><label for="f-owner">שולח המשימה</label><input class="input" id="f-owner" value="${esc(t.owner)}" autocomplete="off"></div>
        <div class="field"><label for="f-estimated">משך משוער</label><input class="input" id="f-estimated" value="${esc(t.estimated)}" autocomplete="off"></div>
        <div class="field full"><label for="f-desc">הנחיית פתיחה למבצע</label><textarea class="textarea" id="f-desc" rows="3">${esc(t.description)}</textarea></div>
      </div>
    </div>
    <div class="lcard" id="flist"></div>
    <button class="btn ghost block" id="add-block" style="margin-bottom:14px">${ic('plus')} הוספת סעיף מוכן</button>`;
  q('#back').onclick = () => { Store.upsert(t); freeEd = null; clearActionBar(); switchTab('home'); };
  ['title','site','owner','estimated'].forEach(k => q('#f-' + k).addEventListener('input', e => t[k] = e.target.value));
  q('#f-desc').addEventListener('input', e => t.description = e.target.value);
  const flist = q('#flist');
  const onChange = () => renderFieldList(flist, t, onChange, false);
  onChange();
  q('#add-block').onclick = () => blockCatalogSheet(t, onChange);
  actionBar({ task:t, onAfter:() => { freeEd = null; clearActionBar(); switchTab('home'); } });
}

/* ═══ IMPORT: TASK ═══ */
impTask.addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const txt = await file.text();
    const m = txt.match(/<script id="shtachla-task-src" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) throw new Error('old-format');
    const t = JSON.parse(m[1]);
    t.id = t.id || uid(); t.status = t.status || 'draft';
    if (t.kind === 'site-survey' && !t.cameras) t.cameras = { bullet4k:0, ptz:0, lpr:0, dome:0 };
    if (t.kind === 'site-survey') openWizard(t, 4); else openFieldEditorTask(t);
    toast('המשימה נטענה.', 'ok');
  } catch (err) {
    toast(err.message === 'old-format' ? 'קובץ משימה בפורמט ישן — יש להפיק מחדש מהבונה.' : 'לא זוהתה משימת שטחלה.', 'warn');
  }
});

/* ═══ IMPORT: RESULT ═══ */
impResult.addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const txt = await file.text();
    const hm = txt.match(/const HEADER = (\{[\s\S]*?\});/);
    const pm = txt.match(/const PAYLOAD_B64 = "([^"]*)"/);
    if (!hm || !pm) throw new Error('bad-file');
    const header = JSON.parse(hm[1]); const p = pm[1];
    if (header.locked) askCode(header, p);
    else await handleOpenedPayload(JSON.parse(dec.decode(b64ToBytes(p))));
  } catch { toast('לא זוהה קובץ תוצאה תקין.', 'warn'); }
});
function askCode(header, p){
  const m = document.createElement('div'); m.className = 'modal-bg';
  m.innerHTML = `<div class="modal"><h2>פתיחת תוצאה מוגנת</h2><p>הזן את הקוד בן 4 הספרות שהמבצע מסר בטלפון.</p>
    <input id="uc" class="code-input" inputmode="numeric" maxlength="4" placeholder="••••" aria-label="קוד">
    <div class="modal-actions"><button class="btn ghost" id="cx" type="button">ביטול</button><button class="btn primary" id="uk" type="button">פתיחה</button></div></div>`;
  document.body.append(m);
  m.querySelector('#cx').onclick = () => m.remove();
  const go = async () => {
    const code = m.querySelector('#uc').value.trim();
    if (!/^\d{4}$/.test(code)) return toast('קוד בן 4 ספרות.', 'warn');
    try {
      const mat = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({ name:'PBKDF2', salt:b64ToBytes(header.salt), iterations:header.iterations, hash:'SHA-256' }, mat, { name:'AES-GCM', length:256 }, false, ['decrypt']);
      const data = await crypto.subtle.decrypt({ name:'AES-GCM', iv:b64ToBytes(header.iv) }, key, b64ToBytes(p).buffer);
      m.remove(); await handleOpenedPayload(JSON.parse(dec.decode(data)));
    } catch { toast('קוד שגוי או קובץ פגום.', 'warn'); }
  };
  m.querySelector('#uk').onclick = go;
  m.querySelector('#uc').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  m.querySelector('#uc').focus();
}
async function handleOpenedPayload(payload, silent){
  const rec = { id:uid(), title:payload.task.title, site:payload.task.site, task:payload.task, answers:payload.answers,
    source:(payload.metadata && payload.metadata.source) || 'field-file',
    completedAt:payload.metadata && payload.metadata.completedAt, savedAt:Date.now(), reviewedAt:null };
  await ResultsLib.save(rec);
  if (payload.task && payload.task.id && Store.get(payload.task.id)) Store.setStatus(payload.task.id, 'returned');
  if (!silent) toast('התוצאה נשמרה בספריית התוצאות.', 'ok');
  else toast('המילוי נשמר בספריית התוצאות.', 'ok');
  clearActionBar();
  viewResult(rec.id);
}

/* ═══ RESULT VIEWER ═══ */
let rv = null;
async function viewResult(id){
  const r = await ResultsLib.get(id);
  if (!r) { toast('התוצאה לא נמצאה.', 'warn'); return; }
  rv = { result:r, section:null };
  renderResultViewer();
}
function sectionsOf(r){
  const secs = [];
  r.answers.forEach(a => { const s = a.section || 'כללי'; let g = secs.find(x => x.name === s); if (!g) { g = { name:s, items:[] }; secs.push(g); } g.items.push(a); });
  return secs;
}
function renderResultViewer(){
  clearActionBar();
  if (rv.section !== null) return renderSectionDetail();
  const r = rv.result;
  const total = r.answers.length, ansd = answeredCount(r), missing = missingRequired(r);
  const pct = total ? Math.round(ansd / total * 100) : 0;
  const missPct = total ? Math.round(missing / total * 100) : 0;
  const secs = sectionsOf(r);
  const firstMissing = secs.findIndex(s => s.items.some(a => a.required && isEmptyAnswer(a)));
  app.innerHTML = `
    <div class="page-head"><button class="back-btn" id="back" type="button">${ic('back')}</button>
      <div><h1>${esc(r.title)}</h1><p>${esc(r.site || 'ללא אתר')} · הושלם ${dateText(r.completedAt)}</p></div></div>
    <div class="prog-card">
      <div class="prog-top"><span class="prog-num mono">${ansd}<s>/${total}</s></span><span class="prog-tag ${missing ? '' : 'ok'}">${missing ? `${missing} חסרים` : 'מלא'}</span></div>
      <div class="prog-bar"><i style="width:${Math.max(0, pct - missPct)}%;background:var(--green)"></i><i style="width:${missPct}%;background:var(--amber)"></i></div>
      <div class="prog-legend"><span><u style="background:var(--green)"></u>מלא</span><span><u style="background:var(--amber)"></u>חסר חובה</span></div>
      ${firstMissing > -1 ? `<button class="btn ghost block" id="goto-miss" style="margin-top:12px">${ic('warn')} קפוץ לסעיף החסר הראשון</button>` : ''}
    </div>
    <div class="rep-actions">
      <button class="btn primary sm" id="exp-skill">${ic('wand')} ייצוא לסקיל</button>
      <button class="btn ghost sm" id="exp-pdf">${ic('printer')} PDF</button>
      <button class="btn ghost sm" id="exp-csv">${ic('table')} Excel</button>
      <button class="btn danger sm" id="del-res">${ic('trash')} מחיקה</button>
    </div>
    <div class="lcard">
      <div class="lcard-head"><h3>סעיפי האתר</h3><span class="cnt">${secs.length}</span></div>
      ${secs.map((s, i) => {
        const sTotal = s.items.length, sAns = s.items.filter(a => !isEmptyAnswer(a)).length, sMiss = s.items.filter(a => a.required && isEmptyAnswer(a)).length;
        return `<div class="lrow" data-sec="${i}" role="button" tabindex="0">
          <div class="tile ${sMiss ? 'warn' : 'ok'}">${ic(sMiss ? 'warn' : 'check')}</div>
          <div class="mid"><b>${esc(s.name)}</b><span>${sTotal} שדות · ${sMiss ? `<span class="wn">חסר ${sMiss}</span>` : 'מלא'}</span></div>
          <div class="frac mono">${sAns}/${sTotal}</div>${ic('chev-left','ic chv')}</div>`;
      }).join('')}
    </div>`;
  q('#back').onclick = () => { rv = null; switchTab('results'); };
  q('#exp-skill').onclick = () => expSkill(r);
  q('#exp-pdf').onclick = () => window.print();
  q('#exp-csv').onclick = () => expCsv(r);
  const gm = q('#goto-miss'); if (gm) gm.onclick = () => { rv.section = firstMissing; renderResultViewer(); };
  q('#del-res').onclick = async () => {
    if (!confirm('למחוק את התוצאה הזו מהספרייה? הפעולה בלתי הפיכה.')) return;
    await ResultsLib.remove(r.id); rv = null; switchTab('results'); toast('נמחקה.');
  };
  document.querySelectorAll('[data-sec]').forEach(row => row.onclick = () => { rv.section = +row.dataset.sec; renderResultViewer(); });
}
function renderSectionDetail(){
  const r = rv.result;
  const secs = sectionsOf(r);
  const s = secs[rv.section];
  app.innerHTML = `
    <div class="page-head"><button class="back-btn" id="back" type="button">${ic('back')}</button>
      <div><h1>${esc(s.name)}</h1><p>${s.items.length} שדות · סעיף ${rv.section + 1} מתוך ${secs.length}</p></div></div>
    <div class="lcard">${s.items.map(a => erow(a, r)).join('')}</div>
    <div class="pager">
      ${rv.section > 0 ? `<button class="btn ghost" id="pg-prev" type="button">${ic('back')} הקודם</button>` : '<span></span>'}
      ${rv.section < secs.length - 1 ? `<button class="btn ghost" id="pg-next" type="button">הבא ${ic('next')}</button>` : '<span></span>'}
    </div>`;
  q('#back').onclick = () => { rv.section = null; renderResultViewer(); };
  const pp = q('#pg-prev'); if (pp) pp.onclick = () => { rv.section--; renderSectionDetail(); };
  const pn = q('#pg-next'); if (pn) pn.onclick = () => { rv.section++; renderSectionDetail(); };
  bindEdit(r);
}
function erow(a, r){
  const idx = r.answers.indexOf(a);
  let body;
  if (Array.isArray(a.answer)) body = `<div class="imgs">${a.answer.map((im, j) => `<div class="imgw"><img src="${im}" alt=""><button class="rm" data-rm="${idx}:${j}" type="button" aria-label="מחיקה">${ic('close','ic sm')}</button></div>`).join('')}<label class="btn ghost sm add-photo">${ic('plus')} תמונה<input type="file" accept="image/*" multiple hidden data-add="${idx}"></label></div>`;
  else if (a.type === 'signature' && a.answer) body = `<img class="sig-img" src="${a.answer}" alt="חתימה">`;
  else if (a.type === 'gps' && a.answer && a.answer.latitude) body = `<div class="a">קו רוחב ${a.answer.latitude.toFixed(6)}, קו אורך ${a.answer.longitude.toFixed(6)}</div>`;
  else body = `<div class="a edit" contenteditable="true" data-edit="${idx}" role="textbox" aria-label="${esc(a.label)}">${esc(a.answer ?? '')}</div>`;
  const miss = a.required && isEmptyAnswer(a);
  return `<div class="qa ${miss ? 'miss' : ''}"><div class="q">${esc(a.label)}${miss ? ` <span class="wn">חסר</span>` : ''}</div>${body}</div>`;
}
function bindEdit(r){
  document.querySelectorAll('[data-edit]').forEach(el => el.addEventListener('input', () => { r.answers[+el.dataset.edit].answer = el.textContent; ResultsLib.save(r); }));
  document.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
    const [i, j] = b.dataset.rm.split(':').map(Number);
    r.answers[i].answer.splice(j, 1); await ResultsLib.save(r); renderSectionDetail();
  });
  document.querySelectorAll('[data-add]').forEach(inp => inp.addEventListener('change', async () => {
    const i = +inp.dataset.add; const files = [...inp.files]; if (!files.length) return;
    let added;
    try { added = await Promise.all(files.map(f => compressImageFile(f))); }
    catch { toast('לא ניתן היה לעבד תמונה.', 'warn'); return; }
    if (!Array.isArray(r.answers[i].answer)) r.answers[i].answer = [];
    r.answers[i].answer.push(...added);
    await ResultsLib.save(r); renderSectionDetail();
  }));
}
function expSkill(r){
  const data = { title:r.title, site:r.site, completedAt:r.completedAt, answers:r.answers };
  const readable = r.answers.map(a => {
    let av;
    if (Array.isArray(a.answer)) av = `${a.answer.length} תמונות`;
    else if (a.type === 'signature') av = a.answer ? 'חתום' : '—';
    else if (a.type === 'gps' && a.answer && a.answer.latitude) av = `${a.answer.latitude.toFixed(5)}, ${a.answer.longitude.toFixed(5)}`;
    else av = a.answer || '—';
    const imgs = Array.isArray(a.answer) ? a.answer.map(i => `<img src="${i}" style="max-width:220px;border-radius:8px;margin:4px">`).join('')
      : (a.type === 'signature' && a.answer ? `<img src="${a.answer}" style="max-width:200px">` : '');
    return `<section><h3>${esc(a.section || 'כללי')} — ${esc(a.label)}</h3><p>${esc(String(av))}</p>${imgs}</section>`;
  }).join('\n');
  const html = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${esc(r.title)} — נתוני שטחלה</title><style>body{font-family:Arial,sans-serif;direction:rtl;max-width:800px;margin:auto;padding:20px;color:#111}h1{border-bottom:3px solid #1f9ed4;padding-bottom:8px}h3{color:#0e8fb0;margin:18px 0 4px}</style></head><body><h1>${esc(r.title)}</h1><p>${esc(r.site || '')} · ${dateText(data.completedAt)}</p>${readable}<script id="shtachla-data" type="application/json">${JSON.stringify(data).replace(/<\//g, '<\\/')}<` + `/script></body></html>`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type:'text/html' }));
  a.download = `${(r.title || 'תוצאה').replace(/[^\p{L}\p{N}]+/gu, '-')}-לסקיל.html`; a.click();
  r.reviewedAt = Date.now(); ResultsLib.save(r);
  if (r.task && r.task.id && Store.get(r.task.id)) Store.setStatus(r.task.id, 'approved');
  toast('נוצר קובץ לסקיל: דוח קריא + JSON מוטמע.', 'ok');
}
function expCsv(r){
  const rows = r.answers.map(a => [a.section, a.label, Array.isArray(a.answer) ? `${a.answer.length} תמונות` : (typeof a.answer === 'object' && a.answer ? JSON.stringify(a.answer) : a.answer)]);
  const csv = '\ufeffסעיף,שאלה,תשובה\n' + rows.map(row => row.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
  a.download = `${r.title}-תוצאות.csv`; a.click();
}

/* ═══ PWA ═══ */
let dp = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); dp = e; document.getElementById('install').classList.add('show'); });
document.getElementById('install-btn').addEventListener('click', async () => { if (!dp) return; dp.prompt(); await dp.userChoice; dp = null; document.getElementById('install').classList.remove('show'); });
document.getElementById('install-x').addEventListener('click', () => document.getElementById('install').classList.remove('show'));
window.addEventListener('appinstalled', () => { document.getElementById('install').classList.remove('show'); toast('שטחלה הותקנה.', 'ok'); });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

/* ═══ INIT ═══ */
document.getElementById('fab').onclick = quickActionsSheet;
document.querySelectorAll('.tab').forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
document.getElementById('more-btn').onclick = () => switchTab('more');
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('sheet-bg')) closeSheet();
  else { const m = document.querySelector('.modal-bg'); if (m) m.remove(); }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = document.activeElement;
  if (el && el.matches('.lrow[role="button"], .field-list-row[role="button"]')) { e.preventDefault(); el.click(); }
});
switchTab('home');
