// ═══════════════════════════════════════════
// שטחלה — כלי המנהל (app logic)
// ═══════════════════════════════════════════
const app = document.getElementById('app');
const importTaskInput = document.getElementById('import-task-input');
const importResultInput = document.getElementById('import-result-input');
const toastRegion = document.getElementById('toast-region');

const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));
const dateText = ts => ts ? new Intl.DateTimeFormat('he-IL', { dateStyle:'medium' }).format(new Date(ts)) : '';
const b64ToBytes = v => Uint8Array.from(atob(v), c => c.charCodeAt(0));
const decoder = new TextDecoder();
const encoder = new TextEncoder();
function toast(msg, kind){ const n = document.createElement('div'); n.className = 'toast' + (kind ? ' ' + kind : ''); n.textContent = msg; toastRegion.append(n); setTimeout(() => n.remove(), 3600); }

// ---------- storage ----------
const Store = {
  key:'shtachla2-templates',
  all(){ try { return JSON.parse(localStorage.getItem(this.key) || '[]'); } catch { return []; } },
  save(l){ try { localStorage.setItem(this.key, JSON.stringify(l)); } catch { toast('השמירה נכשלה — ייתכן שהאחסון מלא.', 'warn'); } },
  upsert(t){ const l = this.all(); const i = l.findIndex(x => x.id === t.id); t.updatedAt = Date.now(); if (i > -1) l[i] = t; else l.push(t); this.save(l); },
};

// ---------- field types ----------
const FIELD_TYPES = [
  { value:'text', label:'טקסט קצר', icon:'✍️' },
  { value:'textarea', label:'טקסט ארוך', icon:'📝' },
  { value:'number', label:'מספר', icon:'🔢' },
  { value:'yesno', label:'כן / לא', icon:'☑️' },
  { value:'select', label:'בחירה', icon:'📋' },
  { value:'date', label:'תאריך', icon:'📅' },
  { value:'photo', label:'תמונה', icon:'📷' },
  { value:'gps', label:'מיקום GPS', icon:'📍' },
  { value:'signature', label:'חתימה', icon:'✒️' },
];
const fieldIcon = t => (FIELD_TYPES.find(f => f.value === t) || {}).icon || '•';
const fieldTypeOptions = sel => FIELD_TYPES.map(f => `<option value="${f.value}" ${sel === f.value ? 'selected' : ''}>${f.icon} ${f.label}</option>`).join('');

const CAM_TYPES = [ ['bullet4k','4K BULLET'], ['ptz','PTZ'], ['lpr','LPR'], ['dome','DOME'] ];

// ---------- templates ----------
function siteSurveyTemplate(){
  const f = (label, type, o = {}) => ({ id: uid(), label, type, required: !!o.required, section: o.section || '', help: o.help || '', options: o.options || null });
  return {
    id: uid(), kind:'site-survey', title:'תיק אתר — מצלמות', site:'', owner:'', estimated:'כ-30 דקות',
    description:'תיעוד אתר מלא: פרטי פרויקט, מצלמות (עמוד לכל אחת), ארונות ופריסה.',
    cameras:{ bullet4k:0, ptz:0, lpr:0, dome:0 },
    fields:[
      f('שם האתר','text',{required:true,section:'פרטי פרויקט'}),
      f('מספר אתר','text',{section:'פרטי פרויקט'}),
      f('גרסה (V1/V2)','text',{section:'פרטי פרויקט'}),
      f('כתובת','text',{section:'פרטי פרויקט'}),
      f('מנהל פרויקט','text',{section:'פרטי פרויקט'}),
      f('מהנדס שדה','text',{section:'פרטי פרויקט'}),
      f('תאריך ביצוע','date',{section:'פרטי פרויקט'}),
      { id:uid(), type:'__cameras__', label:'מצלמות', section:'מצלמות' },
      f('ארון ראשי — תמונה','photo',{section:'ארונות'}),
      f('ארון ראשי — מיקום והזנת חשמל','textarea',{section:'ארונות'}),
      f('ארון משני — תמונה','photo',{section:'ארונות'}),
      f('תמונת פריסה / מבט אוויר','photo',{section:'פריסה'}),
      f('תוכנית תשתית / אופטיקה','photo',{section:'פריסה'}),
      f('הערות מסכמות','textarea',{section:'סיכום סיור'}),
      f('חתימת עורך התיק','signature',{required:true,section:'סיכום סיור'}),
    ]
  };
}
function blankTemplate(){
  return { id:uid(), kind:'free', title:'משימת שטח חדשה', site:'', owner:'', estimated:'כ-10 דקות', description:'',
    fields:[ { id:uid(), label:'שאלה ראשונה', type:'text', required:true, section:'', help:'' } ] };
}

// expand camera counts into concrete per-camera fields (at generation time)
function expandCameras(task){
  const out = [];
  for (const f of task.fields){
    if (f.type === '__cameras__'){
      const cams = task.cameras || {};
      for (const [key, name] of CAM_TYPES){
        const n = cams[key] || 0;
        for (let i = 1; i <= n; i++){
          const nn = String(i).padStart(2,'0');
          const sec = `מצלמה: ${name} ${nn}`;
          out.push({ id:uid(), label:`${name} ${nn} — שם / מזהה`, type:'text', required:true, section:sec });
          out.push({ id:uid(), label:`${name} ${nn} — גובה התקנה (מטר)`, type:'number', section:sec });
          out.push({ id:uid(), label:`${name} ${nn} — תמונת המצלמה`, type:'photo', required:true, section:sec });
          out.push({ id:uid(), label:`${name} ${nn} — תמונת אזור העניין`, type:'photo', section:sec });
          out.push({ id:uid(), label:`${name} ${nn} — הערה`, type:'textarea', section:sec });
        }
      }
    } else out.push(f);
  }
  return out;
}

let builder = null;
let runnerTemplateCache = null;
async function getRunnerTemplate(){
  if (runnerTemplateCache) return runnerTemplateCache;
  const r = await fetch('./runner-template.html');
  if (!r.ok) throw new Error('לא נמצא קובץ המנוע.');
  runnerTemplateCache = await r.text();
  return runnerTemplateCache;
}

// ═══════ HOME ═══════
function homeView(){
  const templates = Store.all().sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));
  app.innerHTML = `
    <div class="hero">
      <svg class="circuit" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <g fill="none" stroke="#81d34c" stroke-width="1" opacity=".5">
          <path d="M-10 40 H80 V90 H150"/><circle cx="150" cy="90" r="3" fill="#81d34c"/>
          <path d="M410 60 H330 V120 H260"/><circle cx="260" cy="120" r="3" fill="#16b6d7" stroke="#16b6d7"/>
          <path d="M-10 150 H60 V110"/><circle cx="60" cy="110" r="3" fill="#16b6d7" stroke="#16b6d7"/>
        </g>
      </svg>
      <h1>שלום, בוא נתחיל.</h1>
      <p>בונים משימה, מפיקים קובץ למבצע, ופותחים תוצאות שחזרו מהשטח לעריכה. הכול מקומי, בלי שרת.</p>
    </div>
    <div class="grid2">
      <div class="card">
        <div class="card-head"><h2>המשימות שלי</h2></div>
        <div>${templates.length ? templates.map(t => `
          <div class="list-item">
            <div class="info"><b>${esc(t.title)}</b><span>${esc(t.site || 'ללא אתר')} · ${t.kind === 'site-survey' ? 'תיק אתר' : t.fields.length + ' פעולות'} · ${dateText(t.updatedAt)}</span></div>
            <div style="display:flex;gap:6px;flex:none">
              <button class="btn ghost sm" data-open="${t.id}">עריכה</button>
              <button class="btn ghost sm" data-dup="${t.id}">⧉</button>
            </div>
          </div>`).join('') : '<div class="empty">עדיין אין משימות.<br>התחל מתבנית מוכנה או בנה חדשה.</div>'}</div>
      </div>
      <div class="card">
        <div class="card-head"><h2>פעולות מהירות</h2></div>
        <div class="quick-grid">
          <div class="quick-btn feature" id="new-survey"><span class="ic">🎥</span><b>תבנית: תיק אתר</b></div>
          <div class="quick-btn" id="new-blank"><span class="ic">✦</span><b>משימה חדשה</b></div>
          <div class="quick-btn" id="import-task"><span class="ic">⇣</span><b>ייבוא משימה</b></div>
          <div class="quick-btn" id="open-result"><span class="ic">🔓</span><b>פתיחת תוצאה</b></div>
        </div>
      </div>
    </div>`;
  document.getElementById('new-blank').onclick = () => openBuilder(blankTemplate());
  document.getElementById('new-survey').onclick = () => openBuilder(siteSurveyTemplate());
  document.getElementById('import-task').onclick = () => importTaskInput.click();
  document.getElementById('open-result').onclick = () => importResultInput.click();
  document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { const t = Store.all().find(x => x.id === b.dataset.open); if (t) openBuilder(t); });
  document.querySelectorAll('[data-dup]').forEach(b => b.onclick = () => { const t = Store.all().find(x => x.id === b.dataset.dup); if (!t) return; const c = structuredClone(t); c.id = uid(); c.title = t.title + ' (עותק)'; Store.upsert(c); homeView(); toast('שוכפל.'); });
}

// ═══════ BUILDER ═══════
function openBuilder(task){ if (!task.cameras && task.kind === 'site-survey') task.cameras = {bullet4k:0,ptz:0,lpr:0,dome:0}; builder = structuredClone(task); renderBuilder(); }
function renderBuilder(){
  const t = builder;
  app.innerHTML = `
    <div class="page-head">
      <div><h1>בונה משימה</h1><p>מגדירים מה צריך לחזור מהשטח. השדות ריקים — בלי מידע רגיש.</p></div>
      <button class="btn ghost back-btn" id="back">← חזרה</button>
    </div>
    <div class="card">
      <div class="form-grid">
        <div class="form-group full"><label>שם המשימה</label><input class="input" id="f-title" value="${esc(t.title)}"></div>
        <div class="form-group"><label>אתר / לקוח</label><input class="input" id="f-site" value="${esc(t.site)}"></div>
        <div class="form-group"><label>שולח המשימה</label><input class="input" id="f-owner" value="${esc(t.owner)}"></div>
        <div class="form-group"><label>משך משוער</label><input class="input" id="f-estimated" value="${esc(t.estimated)}"></div>
        <div class="form-group full"><label>הנחיית פתיחה למבצע</label><textarea class="textarea" id="f-desc">${esc(t.description)}</textarea></div>
      </div>
      <div class="fields-header"><b>פעולות במשימה</b><button class="btn ghost sm" id="add-field">＋ הוספת פעולה</button></div>
      <div id="fields-list">${t.fields.map(f => f.type === '__cameras__' ? cameraPanelHtml(t) : fieldRowHtml(f)).join('')}</div>
      <div class="builder-actions">
        <button class="btn solid" id="save-only">שמירה</button>
        <button class="btn grad" id="generate">📄 הפקת קובץ למבצע</button>
      </div>
    </div>`;
  ['title','site','owner','estimated'].forEach(k => document.getElementById('f-'+k).addEventListener('input', e => t[k] = e.target.value));
  document.getElementById('f-desc').addEventListener('input', e => t.description = e.target.value);
  document.getElementById('back').onclick = () => { Store.upsert(t); homeView(); };
  document.getElementById('add-field').onclick = () => { t.fields.push({ id:uid(), label:'שאלה חדשה', type:'text', required:false, section:'', help:'' }); renderBuilder(); };
  document.getElementById('save-only').onclick = () => { Store.upsert(t); toast('נשמר במכשיר.', 'ok'); };
  document.getElementById('generate').onclick = () => generateOperatorFile(t);
  bindFieldRows(); bindCameraPanel();
}
function cameraPanelHtml(t){
  const c = t.cameras || {};
  return `<div class="field-row" data-cameras="1" style="border-color:var(--glass-line);background:var(--grad-soft)">
    <div class="field-row-top"><span class="field-type-ic">🎥</span><b style="font-family:Rubik;font-size:14.5px">הגדרת מצלמות</b><span class="tiny" style="margin-inline-start:auto">עמוד תיעוד ייווצר לכל מצלמה</span></div>
    <div class="cam-counts">
      ${CAM_TYPES.map(([k,name]) => `<div class="cc"><div class="t">${name}</div><div class="row"><button data-cam-dec="${k}">−</button><span class="val" id="cam-${k}">${c[k]||0}</span><button data-cam-inc="${k}">＋</button></div></div>`).join('')}
    </div>
  </div>`;
}
function bindCameraPanel(){
  document.querySelectorAll('[data-cam-inc]').forEach(b => b.onclick = () => { const k = b.dataset.camInc; builder.cameras[k] = (builder.cameras[k]||0) + 1; document.getElementById('cam-'+k).textContent = builder.cameras[k]; });
  document.querySelectorAll('[data-cam-dec]').forEach(b => b.onclick = () => { const k = b.dataset.camDec; builder.cameras[k] = Math.max(0, (builder.cameras[k]||0) - 1); document.getElementById('cam-'+k).textContent = builder.cameras[k]; });
}
function fieldRowHtml(f){
  return `<div class="field-row" data-id="${f.id}">
    <div class="field-row-top">
      <span class="drag">⋮⋮</span><span class="field-type-ic">${fieldIcon(f.type)}</span>
      <input class="field-title" data-prop="label" value="${esc(f.label)}" placeholder="נוסח הפעולה">
      <select class="field-type" data-prop="type">${fieldTypeOptions(f.type)}</select>
      <button class="del-field" data-del="${f.id}">×</button>
    </div>
    <div class="field-extra">
      <input type="checkbox" class="switch" data-prop="required" ${f.required ? 'checked' : ''}>
      <span class="tiny">חובה</span>
      <input class="input" data-prop="section" value="${esc(f.section || '')}" placeholder="שם סעיף">
    </div>
  </div>`;
}
function bindFieldRows(){
  document.querySelectorAll('.field-row[data-id]').forEach(row => {
    const field = builder.fields.find(f => f.id === row.dataset.id);
    row.querySelectorAll('[data-prop]').forEach(el => {
      const evt = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input';
      el.addEventListener(evt, () => { field[el.dataset.prop] = el.type === 'checkbox' ? el.checked : el.value; if (el.dataset.prop === 'type') row.querySelector('.field-type-ic').textContent = fieldIcon(el.value); });
    });
  });
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (builder.fields.filter(f => f.type !== '__cameras__').length <= 1) { toast('חייבת להישאר לפחות פעולה אחת.', 'warn'); return; } builder.fields = builder.fields.filter(f => f.id !== b.dataset.del); renderBuilder(); });
}

async function generateOperatorFile(task){
  const btn = document.getElementById('generate'); btn.disabled = true; btn.textContent = 'מכין…';
  try {
    Store.upsert(task);
    const expanded = { id:task.id, title:task.title, site:task.site, owner:task.owner, estimated:task.estimated, description:task.description, fields: expandCameras(task) };
    const tpl = await getRunnerTemplate();
    const html = tpl.replace('__TASK__', JSON.stringify(expanded));
    const filename = (task.title.replace(/[^\p{L}\p{N}]+/gu,'-') || 'משימה') + '.html';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], {type:'text/html'})); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    toast('הקובץ מוכן. שולחים למבצע בוואטסאפ — כמסמך.', 'ok');
  } catch (e) { toast(e.message || 'ההפקה נכשלה.', 'warn'); }
  finally { btn.disabled = false; btn.textContent = '📄 הפקת קובץ למבצע'; }
}

// ═══════ IMPORT ═══════
importTaskInput.addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try { const text = await file.text(); const m = text.match(/const TASK = ([\s\S]*?);\n\s*const RESULT_TEMPLATE/); if (!m) throw 0; const task = JSON.parse(m[1]); task.id = task.id || uid(); openBuilder(task); toast('המשימה נטענה.'); }
  catch { toast('לא זוהתה משימת שטחלה.', 'warn'); }
});
importResultInput.addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const text = await file.text();
    const hm = text.match(/const HEADER = (\{[\s\S]*?\});/); const pm = text.match(/const PAYLOAD_B64 = "([^"]*)"/);
    if (!hm || !pm) throw 0;
    const header = JSON.parse(hm[1]); const p = pm[1];
    if (header.locked) askResultCode(header, p);
    else openEditor(JSON.parse(decoder.decode(b64ToBytes(p))));
  } catch { toast('לא זוהה קובץ תוצאה תקין.', 'warn'); }
});
function askResultCode(header, payloadB64){
  const modal = document.createElement('div'); modal.className = 'modal-bg';
  modal.innerHTML = `<div class="modal"><h2>פתיחת תוצאה מוגנת</h2><p>הזן את הקוד בן 4 הספרות שהמבצע מסר בטלפון.</p><input id="uc" class="code-input" inputmode="numeric" maxlength="4" placeholder="••••"><div class="modal-actions"><button class="btn ghost" id="cx">ביטול</button><button class="btn grad" id="uk">פתיחה</button></div></div>`;
  document.body.append(modal);
  modal.querySelector('#cx').onclick = () => modal.remove();
  const go = async () => {
    const code = modal.querySelector('#uc').value.trim(); if (!/^\d{4}$/.test(code)) return toast('קוד בן 4 ספרות.', 'warn');
    try {
      const mat = await crypto.subtle.importKey('raw', encoder.encode(code), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({name:'PBKDF2', salt:b64ToBytes(header.salt), iterations:header.iterations, hash:'SHA-256'}, mat, {name:'AES-GCM', length:256}, false, ['decrypt']);
      const data = await crypto.subtle.decrypt({name:'AES-GCM', iv:b64ToBytes(header.iv)}, key, b64ToBytes(payloadB64).buffer);
      modal.remove(); openEditor(JSON.parse(decoder.decode(data)));
    } catch { toast('קוד שגוי או קובץ פגום. לא נחשף מידע חלקי.', 'warn'); }
  };
  modal.querySelector('#uk').onclick = go;
  modal.querySelector('#uc').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}

// ═══════ EDITOR (Asi edits returned result) ═══════
let editPayload = null;
function openEditor(payload){
  editPayload = payload;
  const sections = [];
  payload.answers.forEach(r => { const s = r.section || 'כללי'; if (!sections.includes(s)) sections.push(s); });
  const bySection = sections.map(s => ({ s, rows: payload.answers.filter(r => (r.section||'כללי') === s) }));
  app.innerHTML = `
    <div class="page-head"><div><h1>עריכת תוצאה</h1><p>אפשר לתקן טקסט, למחוק תמונות ולהוסיף הערות לפני הפקת הפלט.</p></div><button class="btn ghost back-btn" id="back">← חזרה</button></div>
    <div class="card">
      <div class="report-actions">
        <button class="btn grad" id="export-skill">✨ ייצוא לסקיל (HTML+JSON)</button>
        <button class="btn ghost" id="pdf-btn">🖨️ PDF</button>
        <button class="btn ghost" id="csv-btn">📊 Excel</button>
      </div>
      <h2 class="rep-title">${esc(payload.task.title)}</h2>
      <p class="rep-sub">${esc(payload.task.site || 'ללא אתר')} · הושלם ${dateText(payload.metadata && payload.metadata.completedAt)}</p>
      ${bySection.map(g => `<div class="section-band">${esc(g.s)}</div>${g.rows.map(r => editRow(r)).join('')}`).join('')}
    </div>`;
  document.getElementById('back').onclick = () => { if (confirm('לצאת מבלי לשמור פלט? השינויים לא יישמרו.')) homeView(); };
  document.getElementById('pdf-btn').onclick = () => window.print();
  document.getElementById('csv-btn').onclick = () => exportCsv(payload);
  document.getElementById('export-skill').onclick = () => exportForSkill(payload);
  bindEditRows();
}
function editRow(r){
  const idx = editPayload.answers.indexOf(r);
  let body;
  if (Array.isArray(r.answer)){
    body = `<div class="imgs">${r.answer.map((img,i) => `<div class="imgw"><img src="${img}"><button class="rm" data-rm="${idx}:${i}">×</button></div>`).join('')}<label class="btn ghost sm" style="align-self:center">＋ תמונה<input type="file" accept="image/*" multiple hidden data-addimg="${idx}"></label></div>`;
  } else if (r.type === 'signature' && r.answer){
    body = `<img class="sig-img" src="${r.answer}">`;
  } else if (r.type === 'gps' && r.answer && r.answer.latitude){
    body = `<div class="a">קו רוחב ${r.answer.latitude.toFixed(6)}, קו אורך ${r.answer.longitude.toFixed(6)}</div>`;
  } else {
    body = `<div class="a edit" contenteditable="true" data-edit="${idx}">${esc(r.answer ?? '')}</div>`;
  }
  return `<div class="rep-row"><div class="q">${esc(r.label)}</div>${body}</div>`;
}
function bindEditRows(){
  document.querySelectorAll('[data-edit]').forEach(el => el.addEventListener('input', () => { editPayload.answers[+el.dataset.edit].answer = el.textContent; }));
  document.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { const [i,j] = b.dataset.rm.split(':').map(Number); editPayload.answers[i].answer.splice(j,1); openEditor(editPayload); });
  document.querySelectorAll('[data-addimg]').forEach(inp => inp.addEventListener('change', async () => {
    const i = +inp.dataset.addimg; const read = f => new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f);});
    const added = await Promise.all([...inp.files].map(read));
    if (!Array.isArray(editPayload.answers[i].answer)) editPayload.answers[i].answer = [];
    editPayload.answers[i].answer.push(...added); openEditor(editPayload);
  }));
}
function exportCsv(payload){
  const rows = payload.answers.map(r => [r.section, r.label, Array.isArray(r.answer) ? `${r.answer.length} תמונות` : (typeof r.answer === 'object' && r.answer ? JSON.stringify(r.answer) : r.answer)]);
  const csv = '\ufeffסעיף,שאלה,תשובה\n' + rows.map(row => row.map(v => `"${String(v ?? '').replaceAll('"','""')}"`).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'})); a.download = `${payload.task.title}-תוצאות.csv`; a.click();
}
// The key output for Asi's Claude skill: readable HTML + embedded clean JSON
function exportForSkill(payload){
  const data = { title: payload.task.title, site: payload.task.site, completedAt: payload.metadata && payload.metadata.completedAt, answers: payload.answers };
  const readable = payload.answers.map(r => {
    let a;
    if (Array.isArray(r.answer)) a = `${r.answer.length} תמונות`;
    else if (r.type === 'signature') a = r.answer ? 'חתום' : '—';
    else if (r.type === 'gps' && r.answer && r.answer.latitude) a = `${r.answer.latitude.toFixed(5)}, ${r.answer.longitude.toFixed(5)}`;
    else a = r.answer || '—';
    const imgs = Array.isArray(r.answer) ? r.answer.map(i => `<img src="${i}" style="max-width:220px;border-radius:8px;margin:4px">`).join('') : (r.type === 'signature' && r.answer ? `<img src="${r.answer}" style="max-width:200px">` : '');
    return `<section><h3>${esc(r.section||'כללי')} — ${esc(r.label)}</h3><p>${esc(String(a))}</p>${imgs}</section>`;
  }).join('\n');
  const html = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${esc(payload.task.title)} — נתוני שטחלה</title>
<style>body{font-family:Arial,sans-serif;direction:rtl;max-width:800px;margin:auto;padding:20px;color:#111}h1{border-bottom:2px solid #81d34c}h3{color:#0e7fb0;margin:18px 0 4px}img{display:inline-block}</style></head>
<body>
<h1>${esc(payload.task.title)}</h1>
<p>${esc(payload.task.site||'')} · ${dateText(data.completedAt)}</p>
${readable}
<script id="shtachla-data" type="application/json">${JSON.stringify(data).replace(/<\//g,'<\\/')}</script>
</body></html>`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], {type:'text/html'})); a.download = `${(payload.task.title||'תוצאה').replace(/[^\p{L}\p{N}]+/gu,'-')}-לסקיל.html`; a.click();
  toast('נוצר קובץ לסקיל: דוח קריא + JSON מוטמע.', 'ok');
}

// ═══════ PWA ═══════
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; document.getElementById('install-banner').classList.add('show'); });
document.getElementById('install-btn').addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; document.getElementById('install-banner').classList.remove('show'); });
window.addEventListener('appinstalled', () => { document.getElementById('install-banner').classList.remove('show'); toast('שטחלה הותקנה.', 'ok'); });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

// ═══════ SPLASH + BOOT ═══════
homeView();
window.addEventListener('load', () => setTimeout(() => { const s = document.getElementById('splash'); if (s) s.classList.add('hide'); }, 1500));
setTimeout(() => { const s = document.getElementById('splash'); if (s && !s.classList.contains('hide')) s.classList.add('hide'); }, 2600);
