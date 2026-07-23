// ─────────────────────────────────────────────
// שטחלה — כלי המנהל
// ─────────────────────────────────────────────
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

function toast(msg, warn){
  const n = document.createElement('div');
  n.className = 'toast' + (warn ? ' warn' : '');
  n.textContent = msg;
  toastRegion.append(n);
  setTimeout(() => n.remove(), 3600);
}

// ---------- local storage of task templates ----------
const Store = {
  key: 'shtachla-manager-templates',
  all(){ try { return JSON.parse(localStorage.getItem(this.key) || '[]'); } catch { return []; } },
  save(list){ try { localStorage.setItem(this.key, JSON.stringify(list)); } catch { toast('השמירה המקומית נכשלה — ייתכן שהאחסון מלא.', true); } },
  upsert(task){ const list = this.all(); const i = list.findIndex(t => t.id === task.id); task.updatedAt = Date.now(); if (i > -1) list[i] = task; else list.push(task); this.save(list); },
  remove(id){ this.save(this.all().filter(t => t.id !== id)); },
};

// ---------- field type metadata ----------
const FIELD_TYPES = [
  { value:'text', label:'טקסט קצר', icon:'✍️' },
  { value:'textarea', label:'טקסט ארוך', icon:'📝' },
  { value:'number', label:'מספר', icon:'🔢' },
  { value:'yesno', label:'כן / לא', icon:'☑️' },
  { value:'select', label:'בחירה מרשימה', icon:'📋' },
  { value:'date', label:'תאריך', icon:'📅' },
  { value:'photo', label:'תמונה', icon:'📷' },
  { value:'gps', label:'מיקום GPS', icon:'📍' },
  { value:'signature', label:'חתימה', icon:'✒️' },
];
const fieldIcon = type => (FIELD_TYPES.find(f => f.value === type) || {}).icon || '•';
function fieldTypeOptions(selected){
  return FIELD_TYPES.map(f => `<option value="${f.value}" ${selected === f.value ? 'selected' : ''}>${f.icon} ${f.label}</option>`).join('');
}

// ---------- prebuilt templates ----------
function siteSurveyTemplate(){
  const f = (label, type, opts = {}) => ({ id: uid(), label, type, required: !!opts.required, section: opts.section || '', help: opts.help || '', options: opts.options || null });
  return {
    id: uid(), title: 'סקר אתר / תיק אתר', site: '', owner: '', estimated: 'כ-25 דקות',
    description: 'תיעוד מלא של האתר לפני התקנה או תכנון: תשתיות, ציוד קיים ותמונות.',
    fields: [
      f('שם האתר / הלקוח', 'text', { required:true, section:'פרטי אתר', help:'שם מלא של האתר או הלקוח.' }),
      f('כתובת', 'text', { section:'פרטי אתר' }),
      f('איש קשר באתר', 'text', { section:'פרטי אתר' }),
      f('תאריך הסקר', 'date', { section:'פרטי אתר' }),
      f('האם קיים מקור חשמל זמין?', 'yesno', { required:true, section:'תשתית חשמל' }),
      f('מרחק ללוח חשמל (מטרים)', 'number', { section:'תשתית חשמל' }),
      f('הערות לגבי חשמל', 'textarea', { section:'תשתית חשמל' }),
      f('סוג חיבור תקשורת זמין', 'select', { section:'תשתית תקשורת', options:['סיבים','נחושת','סלולרי','אין'] }),
      f('מספר נקודות תקשורת נדרשות', 'number', { section:'תשתית תקשורת' }),
      f('האם קיים ציוד באתר?', 'yesno', { section:'ציוד קיים' }),
      f('תיאור הציוד הקיים', 'textarea', { section:'ציוד קיים' }),
      f('תמונת ציוד קיים', 'photo', { section:'ציוד קיים' }),
      f('תמונה כללית של האתר', 'photo', { required:true, section:'תמונות ומדידות', help:'לפחות תמונה אחת רחבה של האתר.' }),
      f('מיקום GPS', 'gps', { section:'תמונות ומדידות' }),
      f('הערות מסכמות', 'textarea', { section:'סיכום' }),
      f('חתימת הסוקר', 'signature', { required:true, section:'סיכום' }),
    ]
  };
}
function blankTemplate(){
  return { id: uid(), title: 'משימת שטח חדשה', site:'', owner:'', estimated:'כ-10 דקות', description:'',
    fields: [ { id: uid(), label:'שאלה ראשונה', type:'text', required:true, section:'', help:'' } ] };
}

let builder = null;
let runnerTemplateCache = null;
async function getRunnerTemplate(){
  if (runnerTemplateCache) return runnerTemplateCache;
  const res = await fetch('./runner-template.html');
  if (!res.ok) throw new Error('לא נמצא קובץ המנוע (runner-template.html).');
  runnerTemplateCache = await res.text();
  return runnerTemplateCache;
}

// ---------- views ----------
function homeView(){
  const templates = Store.all().sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));
  app.innerHTML = `
    <div class="hero">
      <h1>בוקר טוב, מנהל.</h1>
      <p>בונים משימה, מפיקים קובץ למבצע, ופותחים תוצאות שחזרו מהשטח — הכול מקומי, בלי שרת ובלי אפליקציה בצד השני.</p>
    </div>
    <div class="grid2">
      <div class="card">
        <div class="card-head"><h2>המשימות שלי</h2></div>
        <div id="tpl-list">${templates.length ? templates.map(t => `
          <div class="list-item">
            <div class="info"><b>${esc(t.title)}</b><span>${esc(t.site || 'ללא אתר מוגדר')} · ${t.fields.length} פעולות · עודכן ${dateText(t.updatedAt)}</span></div>
            <div style="display:flex;gap:6px;flex:none">
              <button class="btn ghost sm" data-open="${t.id}">עריכה</button>
              <button class="btn ghost sm" data-dup="${t.id}" title="שכפול">⧉</button>
            </div>
          </div>`).join('') : '<div class="empty">עדיין אין משימות שמורות.<br>אפשר להתחיל מתבנית מוכנה או לבנות אחת חדשה.</div>'}</div>
      </div>
      <div class="card">
        <div class="card-head"><h2>פעולות מהירות</h2></div>
        <div class="quick-grid">
          <div class="quick-btn" id="new-blank"><span class="ic">✦</span><b>משימה חדשה</b></div>
          <div class="quick-btn" id="new-survey"><span class="ic">🏗️</span><b>תבנית: סקר אתר</b></div>
          <div class="quick-btn" id="import-task"><span class="ic">⇣</span><b>ייבוא קובץ משימה</b></div>
          <div class="quick-btn" id="open-result"><span class="ic">🔓</span><b>פתיחת תוצאה</b></div>
        </div>
      </div>
    </div>`;
  document.getElementById('new-blank').onclick = () => openBuilder(blankTemplate());
  document.getElementById('new-survey').onclick = () => openBuilder(siteSurveyTemplate());
  document.getElementById('import-task').onclick = () => importTaskInput.click();
  document.getElementById('open-result').onclick = () => importResultInput.click();
  document.querySelectorAll('[data-open]').forEach(btn => btn.onclick = () => { const t = Store.all().find(x => x.id === btn.dataset.open); if (t) openBuilder(t); });
  document.querySelectorAll('[data-dup]').forEach(btn => btn.onclick = () => {
    const t = Store.all().find(x => x.id === btn.dataset.dup); if (!t) return;
    const copy = structuredClone(t); copy.id = uid(); copy.title = t.title + ' (עותק)';
    Store.upsert(copy); toast('המשימה שוכפלה.'); homeView();
  });
}

function openBuilder(task){ builder = structuredClone(task); renderBuilder(); }

function renderBuilder(){
  const t = builder;
  app.innerHTML = `
    <div class="page-head">
      <div><h1>בונה משימה</h1><p>מגדירים מה צריך לחזור מהשטח. אין כאן מידע רגיש — זו רק ההגדרה של השאלות.</p></div>
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
      <div class="fields-header"><b>פעולות במשימה (${t.fields.length})</b><button class="btn ghost sm" id="add-field">＋ הוספת פעולה</button></div>
      <div id="fields-list">${t.fields.map(f => fieldRowHtml(f)).join('')}</div>
      <div class="builder-actions">
        <button class="btn ghost" id="save-only">שמירת המשימה</button>
        <button class="btn lime" id="generate">📄 הפקת קובץ למבצע</button>
      </div>
    </div>`;
  ['title','site','owner','estimated'].forEach(k => document.getElementById('f-' + k).addEventListener('input', e => t[k] = e.target.value));
  document.getElementById('f-desc').addEventListener('input', e => t.description = e.target.value);
  document.getElementById('back').onclick = () => { Store.upsert(t); homeView(); };
  document.getElementById('add-field').onclick = () => { t.fields.push({ id: uid(), label:'שאלה חדשה', type:'text', required:false, section:'', help:'' }); renderBuilder(); };
  document.getElementById('save-only').onclick = () => { Store.upsert(t); toast('המשימה נשמרה במכשיר.'); };
  document.getElementById('generate').onclick = () => generateOperatorFile(t);
  bindFieldRows();
}

function fieldRowHtml(f){
  return `<div class="field-row" data-id="${f.id}">
    <div class="field-row-top">
      <span class="drag">⋮⋮</span>
      <span class="field-type-ic">${fieldIcon(f.type)}</span>
      <input class="field-title" data-prop="label" value="${esc(f.label)}" placeholder="נוסח הפעולה">
      <select class="field-type" data-prop="type">${fieldTypeOptions(f.type)}</select>
      <button class="del-field" data-del="${f.id}" aria-label="מחיקה">×</button>
    </div>
    <div class="field-extra">
      <input type="checkbox" class="switch" data-prop="required" ${f.required ? 'checked' : ''}>
      <span class="tiny">שדה חובה</span>
      <input class="input" data-prop="section" value="${esc(f.section || '')}" placeholder="שם סעיף (אופציונלי)">
    </div>
  </div>`;
}
function bindFieldRows(){
  document.querySelectorAll('.field-row').forEach(row => {
    const id = row.dataset.id; const field = builder.fields.find(f => f.id === id);
    row.querySelectorAll('[data-prop]').forEach(el => {
      const evt = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input';
      el.addEventListener(evt, () => {
        field[el.dataset.prop] = el.type === 'checkbox' ? el.checked : el.value;
        if (el.dataset.prop === 'type') { row.querySelector('.field-type-ic').textContent = fieldIcon(el.value); }
      });
    });
  });
  document.querySelectorAll('[data-del]').forEach(btn => btn.onclick = () => {
    if (builder.fields.length <= 1) { toast('חייבת להישאר לפחות פעולה אחת.', true); return; }
    builder.fields = builder.fields.filter(f => f.id !== btn.dataset.del); renderBuilder();
  });
}

async function generateOperatorFile(task){
  const genBtn = document.getElementById('generate');
  genBtn.disabled = true; genBtn.textContent = 'מכין קובץ…';
  try {
    Store.upsert(task);
    const template = await getRunnerTemplate();
    const html = template.replace('__TASK__', JSON.stringify(task));
    const filename = (task.title.replace(/[^\p{L}\p{N}]+/gu, '-') || 'משימה') + '.html';
    const blob = new Blob([html], { type:'text/html' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    toast('הקובץ מוכן. שולחים אותו למבצע בוואטסאפ — כמסמך, לא כתמונה.');
  } catch (e) {
    toast(e.message || 'הפקת הקובץ נכשלה.', true);
  } finally {
    genBtn.disabled = false; genBtn.textContent = '📄 הפקת קובץ למבצע';
  }
}

// ---------- import task ----------
importTaskInput.addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const text = await file.text();
    const m = text.match(/const TASK = ([\s\S]*?);\n\s*const RESULT_TEMPLATE/);
    if (!m) throw new Error();
    const task = JSON.parse(m[1]); task.id = task.id || uid();
    openBuilder(task); toast('המשימה נטענה מהקובץ.');
  } catch { toast('לא זוהתה משימת שטחלה בקובץ הזה.', true); }
});

// ---------- import / open result ----------
importResultInput.addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const text = await file.text();
    const hm = text.match(/const HEADER = (\{[\s\S]*?\});/);
    const pm = text.match(/const PAYLOAD_B64 = "([^"]*)"/);
    if (!hm || !pm) throw new Error('not a result file');
    const header = JSON.parse(hm[1]); const payloadB64 = pm[1];
    if (header.locked) askResultCode(header, payloadB64);
    else showReport(JSON.parse(decoder.decode(b64ToBytes(payloadB64))));
  } catch { toast('לא זוהה קובץ תוצאה תקין.', true); }
});

function askResultCode(header, payloadB64){
  const modal = document.createElement('div'); modal.className = 'modal-bg';
  modal.innerHTML = `<div class="modal">
    <h2>פתיחת תוצאה מוגנת</h2>
    <p>הזן את הקוד בן 4 הספרות שהמבצע מסר בשיחת טלפון.</p>
    <input id="unlock-code" class="code-input" inputmode="numeric" maxlength="4" placeholder="••••">
    <div class="modal-actions"><button class="btn ghost" id="cancel-unlock">ביטול</button><button class="btn lime" id="do-unlock">פתיחה</button></div>
  </div>`;
  document.body.append(modal);
  modal.querySelector('#cancel-unlock').onclick = () => modal.remove();
  const doUnlock = async () => {
    const code = modal.querySelector('#unlock-code').value.trim();
    if (!/^\d{4}$/.test(code)) return toast('יש להזין קוד בן 4 ספרות.', true);
    try {
      const material = await crypto.subtle.importKey('raw', encoder.encode(code), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({ name:'PBKDF2', salt:b64ToBytes(header.salt), iterations:header.iterations, hash:'SHA-256' }, material, { name:'AES-GCM', length:256 }, false, ['decrypt']);
      const data = await crypto.subtle.decrypt({ name:'AES-GCM', iv:b64ToBytes(header.iv) }, key, b64ToBytes(payloadB64).buffer);
      modal.remove(); showReport(JSON.parse(decoder.decode(data)));
    } catch { toast('הקוד שגוי, או שהקובץ נפגם. לא נחשף מידע חלקי.', true); }
  };
  modal.querySelector('#do-unlock').onclick = doUnlock;
  modal.querySelector('#unlock-code').addEventListener('keydown', e => { if (e.key === 'Enter') doUnlock(); });
}

function renderAnswer(row){
  if (Array.isArray(row.answer)) return row.answer.length ? `<div class="imgs">${row.answer.map(i => `<img src="${i}">`).join('')}</div>` : '<em>לא צורפה תמונה</em>';
  if (row.type === 'signature' && row.answer) return `<img class="sig-img" src="${row.answer}">`;
  if (row.type === 'gps' && row.answer && row.answer.latitude) return `קו רוחב ${row.answer.latitude.toFixed(6)}, קו אורך ${row.answer.longitude.toFixed(6)} · דיוק ${Math.round(row.answer.accuracy || 0)} מ׳`;
  return (row.answer === null || row.answer === undefined || row.answer === '') ? '<em>לא מולא</em>' : esc(row.answer);
}
function showReport(payload){
  app.innerHTML = `
    <div class="page-head"><div><h1>תוצאה מהשטח</h1><p>נפתחה בהצלחה. בדיקת השלמות עברה.</p></div><button class="btn ghost back-btn" id="back">← חזרה</button></div>
    <div class="card">
      <div class="report-actions"><button class="btn ghost" id="csv-btn">📊 ייצוא Excel</button><button class="btn primary" id="pdf-btn">🖨️ ייצוא PDF</button></div>
      <h2 class="rep-title">${esc(payload.task.title)}</h2>
      <p class="rep-sub">${esc(payload.task.site || 'ללא אתר')} · הושלם ${dateText(payload.metadata.completedAt)}</p>
      ${payload.answers.map(r => `<div class="rep-row"><div class="q">${esc(r.section || 'כללי')} · ${esc(r.label)}</div><div class="a">${renderAnswer(r)}</div></div>`).join('')}
    </div>`;
  document.getElementById('back').onclick = () => homeView();
  document.getElementById('pdf-btn').onclick = () => window.print();
  document.getElementById('csv-btn').onclick = () => {
    const rows = payload.answers.map(r => [r.section, r.label, Array.isArray(r.answer) ? `${r.answer.length} תמונות` : (typeof r.answer === 'object' && r.answer ? JSON.stringify(r.answer) : r.answer)]);
    const csv = '\ufeffסעיף,שאלה,תשובה\n' + rows.map(row => row.map(v => `"${String(v ?? '').replaceAll('"','""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' })); a.download = `${payload.task.title}-תוצאות.csv`; a.click();
  };
}

// ---------- PWA install prompt ----------
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredInstallPrompt = e;
  document.getElementById('install-banner').classList.add('show');
});
document.getElementById('install-btn').addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById('install-banner').classList.remove('show');
});
window.addEventListener('appinstalled', () => { document.getElementById('install-banner').classList.remove('show'); toast('שטחלה הותקנה על המכשיר.'); });

// ---------- service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

homeView();
