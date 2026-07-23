const $ = (selector, root = document) => root.querySelector(selector);
const app = $('#app');
const importInput = $('#import-file');
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const DB = {
  name: 'shtachla-local', version: 1,
  async open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, this.version);
      req.onupgradeneeded = () => {
        const db = req.result;
        ['templates', 'drafts', 'results'].forEach(store => db.createObjectStore(store, { keyPath: 'id' }));
      };
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
  },
  async getAll(store) { const db = await this.open(); return new Promise((res, rej) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async get(store, id) { const db = await this.open(); return new Promise((res, rej) => { const r = db.transaction(store).objectStore(store).get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async put(store, data) { const db = await this.open(); return new Promise((res, rej) => { const r = db.transaction(store, 'readwrite').objectStore(store).put(data); r.onsuccess = () => res(data); r.onerror = () => rej(r.error); }); },
  async delete(store, id) { const db = await this.open(); return new Promise((res, rej) => { const r = db.transaction(store, 'readwrite').objectStore(store).delete(id); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); }
};

const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const dateText = (value = Date.now()) => new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(new Date(value));
const escape = value => String(value || '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[ch]));
const bytesToB64 = bytes => { const arr = new Uint8Array(bytes); const chunk = 0x8000; const parts = []; for (let i = 0; i < arr.length; i += chunk) parts.push(String.fromCharCode.apply(null, arr.subarray(i, i + chunk))); return btoa(parts.join('')); };
const b64ToBytes = value => Uint8Array.from(atob(value), ch => ch.charCodeAt(0));
const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
const toast = (message, type = '') => { const node = document.createElement('div'); node.className = `toast ${type}`; node.textContent = message; $('#toast-region').append(node); setTimeout(() => node.remove(), 3500); };
const isSecure = () => location.protocol === 'https:' || location.hostname === 'localhost';

const demoTask = () => ({
  id: uid(), version: 1, createdAt: Date.now(),
  title: 'בדיקת אתר - מצלמות אבטחה', site: 'מוקד ביטחון, לוד', owner: 'מנהל הפרויקט', estimated: 'כ-12 דקות',
  description: 'תיעוד מצב הציוד והכנה לביקור טכנאי. יש לצלם תמונה ברורה של כל חריגה.',
  fields: [
    { id: uid(), section: 'פרטי ביקור', label: 'שם המבצע', type: 'text', required: true, help: 'נא לרשום שם מלא.' },
    { id: uid(), section: 'מצלמה ראשית', label: 'האם התמונה מהמצלמה תקינה?', type: 'yesno', required: true, help: 'בדוק תצוגה חיה במוקד.' },
    { id: uid(), section: 'מצלמה ראשית', label: 'צלם את המצלמה ואת סביבתה', type: 'photo', required: true, help: 'לפחות תמונה אחת באיכות מלאה.' },
    { id: uid(), section: 'מצלמה ראשית', label: 'תיאור חריגה או הערה', type: 'textarea', required: false, help: 'אם הכול תקין, אפשר להשאיר ריק.' },
    { id: uid(), section: 'סיום', label: 'מיקום בזמן הבדיקה', type: 'gps', required: false, help: 'המיקום נשמר כחלק מהתיעוד.' },
    { id: uid(), section: 'סיום', label: 'חתימת המבצע', type: 'signature', required: true, help: 'חתום בתוך המסגרת.' }
  ]
});

let state = { view: 'home', currentTask: null, draft: null, step: 0, builder: null, unlocked: null, importMode: null };

function shell(inner, actions = true) {
  return `<header class="topbar"><button class="brand" data-nav="home" aria-label="חזרה למסך הבית"><span class="brand-mark">✓</span><span>שטחלה<small>FIELD TASK ENGINE</small></span></button><div class="top-actions"><span class="status">● שמירה מקומית פעילה</span>${actions ? '<button class="ghost-btn" data-nav="manager">ממשק מנהל</button>' : ''}<button class="icon-btn" data-action="about" aria-label="אודות">?</button></div></header>${inner}`;
}

function homeView() {
  state.view = 'home';
  app.innerHTML = shell(`<main><section class="hero"><span class="eyebrow"><i class="pulse"></i> עובד מקומית. בלי שרת נתונים.</span><h1>השטח חוזר<br>מסודר.</h1><p>בונים משימה ברורה, ממלאים אותה בלי התקנה, ומקבלים קובץ תוצאה אחד - מאובטח, שלם ומוכן לדוח.</p><div class="hero-stats"><div class="hero-stat"><b>0</b>חשיפה לענן</div><div class="hero-stat"><b>1</b>קובץ תוצאה</div><div class="hero-stat"><b>100%</b>שליטה אצלך</div></div></section><section class="landing-grid"><button class="role-card manager" data-nav="manager"><span class="role-icon">▦</span><h2>אני מנהל</h2><p>בנה משימה, הפק קובץ למבצע, ופתח תוצאות שהוחזרו מהשטח.</p><span class="role-enter">כניסה לממשק המנהל ←</span></button><button class="role-card operator" data-action="start-demo"><span class="role-icon">⌁</span><h2>קיבלתי משימת שטח</h2><p>פתח משימה, מלא שלב אחר שלב, צלם ושלח תוצאה מוגנת בקוד.</p><span class="role-enter">פתיחת משימה לדוגמה ←</span></button></section><div class="info-strip">🔒 <b>חשוב:</b> התוצאה מוצפנת עם קוד שהמבצע בוחר בסיום. את הקוד מוסרים למנהל <b>בשיחת טלפון בלבד</b>, ולא באותו ערוץ עם הקובץ.</div></main>`);
}

async function managerView() {
  state.view = 'manager';
  const [templates, results] = await Promise.all([DB.getAll('templates'), DB.getAll('results')]);
  const recentTemplates = templates.sort((a,b) => b.updatedAt - a.updatedAt).slice(0, 4);
  const recentResults = results.sort((a,b) => b.openedAt - a.openedAt).slice(0, 4);
  app.innerHTML = shell(`<main><section class="view-head"><div class="view-title"><h1>בוקר טוב, מנהל.</h1><p>בוא נסגור את מה שהשטח עוד לא סיפר.</p></div><button class="primary-btn" data-action="new-task">＋ יצירת משימה</button></section><section class="dash-grid"><div class="card"><div class="card-title"><h2>תבניות ומשימות</h2><button class="ghost-btn" data-action="new-task">יצירת משימה</button></div><div class="template-list">${recentTemplates.length ? recentTemplates.map(task => `<div class="list-item"><div class="list-main"><b>${escape(task.title)}</b><span>${escape(task.site || 'ללא אתר')} · ${task.fields.length} פעולות · עודכן ${dateText(task.updatedAt)}</span></div><div><button class="ghost-btn" data-action="open-template" data-id="${task.id}">פתיחה</button></div></div>`).join('') : '<div class="empty">עדיין אין תבניות. צור משימה ראשונה או פתח את הדוגמה כדי להרגיש את הזרימה.</div>'}</div></div><div class="card"><div class="card-title"><h2>פעולות מהירות</h2></div><div class="quick-grid"><button class="quick-btn" data-action="new-task"><span>✦</span><b>בניית משימה חדשה</b></button><button class="quick-btn" data-action="use-demo"><span>◫</span><b>פתיחת תבנית לדוגמה</b></button><button class="quick-btn" data-action="import-result"><span>↥</span><b>פתיחת קובץ תוצאה</b></button><button class="quick-btn" data-action="import-task"><span>⇣</span><b>ייבוא משימה</b></button></div></div><div class="card"><div class="card-title"><h2>תוצאות שנפתחו</h2><span>${results.length} מקומיות</span></div><div class="result-list">${recentResults.length ? recentResults.map(result => `<div class="list-item"><div class="list-main"><b>${escape(result.title)}</b><span>נפתח ${dateText(result.openedAt)} · ${result.payload?.answers?.length || 0} תשובות</span></div><span class="tag">דוח זמין</span></div>`).join('') : '<div class="empty">תוצאות שייפתחו יישמרו כאן מקומית במכשיר הזה.</div>'}</div></div></section></main>`);
}

function newField(type = 'text') { return { id: uid(), section: 'סעיף חדש', label: 'שאלה חדשה', type, required: false, help: '' }; }
function builderView(task = null) {
  const source = task || { id: uid(), version: 1, createdAt: Date.now(), title: 'משימת שטח חדשה', site: '', owner: '', estimated: 'כ-10 דקות', description: '', fields: [newField('text'), newField('photo')] };
  state.builder = structuredClone(source);
  state.view = 'builder'; renderBuilder();
}

function fieldTypeOptions(selected) {
  return [['text','טקסט קצר'],['textarea','טקסט ארוך'],['number','מספר'],['yesno','כן / לא'],['select','בחירה'],['date','תאריך'],['photo','תמונה'],['gps','מיקום GPS'],['signature','חתימה']].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}
function renderBuilder() {
  const task = state.builder;
  app.innerHTML = shell(`<main><section class="view-head"><div class="view-title"><h1>בונה משימה</h1><p>מגדירים מה צריך לחזור מהשטח. המבצע יקבל מסך פעולה אחד בכל פעם.</p></div><button class="ghost-btn" data-nav="manager">שמירה ויציאה</button></section><section class="builder-layout"><aside class="card side-panel"><div class="card-title"><h3>בניית משימה</h3><span>טיוטה</span></div><nav class="steps"><span class="step active"><i class="step-n">1</i>פרטי המשימה</span><span class="step"><i class="step-n">2</i>שאלות ופעולות</span><span class="step"><i class="step-n">3</i>הפצה למבצע</span></nav><div class="privacy" style="margin-top:18px">אין כאן מידע סודי. חבילת המשימה כוללת רק את ההנחיות והשאלות.</div></aside><section class="card"><div class="form-grid"><div class="form-group full"><label>שם המשימה</label><input class="input" data-task-prop="title" value="${escape(task.title)}" placeholder="לדוגמה: בדיקת אתר לפני התקנה"></div><div class="form-group"><label>אתר / לקוח</label><input class="input" data-task-prop="site" value="${escape(task.site)}" placeholder="לדוגמה: מוקד ביטחון, לוד"></div><div class="form-group"><label>שולח המשימה</label><input class="input" data-task-prop="owner" value="${escape(task.owner)}" placeholder="שם המנהל או הצוות"></div><div class="form-group"><label>משך משוער</label><input class="input" data-task-prop="estimated" value="${escape(task.estimated)}"></div><div class="form-group full"><label>הנחיית פתיחה למבצע</label><textarea class="textarea" data-task-prop="description" placeholder="מה צריך לעשות ולמה לשים לב">${escape(task.description)}</textarea></div></div><div class="fields-header"><div><b>פעולות במשימה</b><span class="small-note"> · שדה חובה יחסום את הסיום עד שיושלם.</span></div><button class="ghost-btn" data-action="add-field">＋ הוספת פעולה</button></div><div id="builder-fields">${task.fields.map((field, index) => `<div class="field-row" data-field-id="${field.id}"><span class="drag">⋮⋮</span><input class="field-title" value="${escape(field.label)}" data-field-prop="label" aria-label="נוסח הפעולה"><select class="field-type" data-field-prop="type">${fieldTypeOptions(field.type)}</select><button class="delete-field" data-action="remove-field" aria-label="מחיקת פעולה">×</button><div class="field-options"><input class="switch" type="checkbox" data-field-prop="required" ${field.required ? 'checked' : ''} aria-label="חובה"><span class="small-note">שדה חובה</span><input class="input" style="padding:7px 9px;max-width:280px" value="${escape(field.section)}" data-field-prop="section" placeholder="שם סעיף"></div></div>`).join('')}</div><div class="builder-actions"><button class="ghost-btn" data-action="preview-task">תצוגה מקדימה</button><button class="primary-btn blue" data-action="save-task">שמירת תבנית</button><button class="primary-btn" data-action="export-task">הפקת קובץ למבצע</button></div></section></section></main>`);
}

function taskIntro(task, existingDraft = null) {
  state.currentTask = task; state.draft = existingDraft || { id: uid(), taskId: task.id, task, answers: {}, startedAt: Date.now(), updatedAt: Date.now(), currentIndex: 0 };
  state.step = state.draft.currentIndex || 0; state.view = 'intro';
  app.innerHTML = shell(`<main class="operator-wrap"><section class="task-intro"><span class="task-badge">✦ משימת שטח חדשה</span><h1>${escape(task.title)}</h1><p>${escape(task.description || 'השלם את הפעולות לפי הסדר. כל שינוי נשמר במכשיר שלך באופן מקומי.')}</p><div class="task-meta"><div class="meta-box">אתר / לקוח<b>${escape(task.site || 'לא צוין')}</b></div><div class="meta-box">זמן משוער<b>${escape(task.estimated || 'לא צוין')}</b></div><div class="meta-box">נשלח על ידי<b>${escape(task.owner || 'מנהל המשימה')}</b></div><div class="meta-box">כולל<b>${task.fields.length} פעולות</b></div></div><div class="privacy">🔒 הפרטים נשמרים <b>במכשיר הזה בלבד</b> בזמן העבודה. בסוף יווצר קובץ תוצאה מוצפן שאותו תבחר למי לשלוח.</div><button class="primary-btn aqua wide" data-action="begin-task">התחלת המשימה ←</button>${existingDraft ? '<p class="small-note" style="text-align:center;margin-top:12px">נמצאה טיוטה קודמת - נמשיך בדיוק מהמקום שבו עצרת.</p>' : ''}</section></main>`, false);
}

async function runnerView() {
  state.view = 'runner'; const task = state.currentTask; const field = task.fields[state.step];
  if (!field) return finishView();
  const answer = state.draft.answers[field.id]; const progress = Math.round((state.step / task.fields.length) * 100);
  const input = renderAnswerInput(field, answer);
  app.innerHTML = shell(`<main class="operator-wrap"><div class="runner-meta"><span>${escape(field.section || 'משימה')}</span><span>${state.step + 1} מתוך ${task.fields.length}</span></div><div class="progress-line"><i style="width:${progress}%"></i></div><section class="question-card" data-step="${String(state.step + 1).padStart(2,'0')}"><p class="section-label">פעולה ${String(state.step + 1).padStart(2,'0')}</p><h1>${escape(field.label)} ${field.required ? '<span class="required-mark">*</span>' : ''}</h1>${field.help ? `<p class="question-help">${escape(field.help)}</p>` : ''}${input}</section><div class="runner-actions"><button class="ghost-btn" data-action="prev-step" ${state.step === 0 ? 'disabled' : ''}>→ חזרה</button><button class="primary-btn aqua" data-action="next-step">${state.step === task.fields.length - 1 ? 'לסיום המשימה' : 'המשך ←'}</button></div><p class="save-note">✓ כל שינוי נשמר אוטומטית במכשיר</p></main>`, false);
  if (field.type === 'signature') initSignature(answer);
}

function renderAnswerInput(field, answer) {
  const value = typeof answer === 'string' || typeof answer === 'number' ? answer : '';
  if (field.type === 'textarea') return `<textarea class="answer-input" id="answer" rows="6" placeholder="כתוב כאן...">${escape(value)}</textarea>`;
  if (field.type === 'number') return `<input class="answer-input" id="answer" type="number" inputmode="decimal" value="${escape(value)}" placeholder="הזן מספר">`;
  if (field.type === 'date') return `<input class="answer-input" id="answer" type="date" value="${escape(value)}">`;
  if (field.type === 'yesno') return `<div class="choice-grid"><button class="choice ${answer === 'כן' ? 'active' : ''}" data-answer="כן">✓ כן, תקין</button><button class="choice ${answer === 'לא' ? 'active' : ''}" data-answer="לא">✕ לא תקין</button></div>`;
  if (field.type === 'select') return `<select class="answer-input" id="answer"><option value="">בחר תשובה</option><option ${answer === 'תקין' ? 'selected' : ''}>תקין</option><option ${answer === 'נדרש טיפול' ? 'selected' : ''}>נדרש טיפול</option><option ${answer === 'לא רלוונטי' ? 'selected' : ''}>לא רלוונטי</option></select>`;
  if (field.type === 'photo') return `<div class="photo-zone"><label for="photo-input" style="display:block;cursor:pointer"><span style="font-size:31px;display:block;margin-bottom:8px">◉</span><b>לחץ לצילום או בחירת תמונה</b><span class="small-note" style="display:block;margin-top:6px">התמונה נשמרת באיכות מקורית.</span></label><input id="photo-input" type="file" accept="image/*" multiple><div id="photo-preview" class="photo-preview">${Array.isArray(answer) ? answer.map(url => `<img src="${url}" alt="תמונה שצולמה">`).join('') : ''}</div></div>`;
  if (field.type === 'gps') return `<div class="photo-zone"><span style="font-size:31px;display:block;margin-bottom:8px">⌖</span><b>${answer?.latitude ? 'המיקום נשמר' : 'שמירת מיקום נוכחי'}</b><span class="small-note" style="display:block;margin:6px 0 12px">האישור יילקח רק בלחיצה על הכפתור.</span><button class="ghost-btn" data-action="capture-gps">${answer?.latitude ? 'עדכון מיקום' : 'שמור מיקום'}</button><div id="gps-result" class="small-note" style="margin-top:11px">${answer?.latitude ? `דיוק ${Math.round(answer.accuracy || 0)} מ׳ · ${new Date(answer.capturedAt).toLocaleTimeString('he-IL')}` : ''}</div></div>`;
  if (field.type === 'signature') return `<p class="small-note" style="margin-bottom:10px">חתום עם האצבע בתוך המסגרת.</p><canvas id="signature" class="signature" aria-label="אזור חתימה"></canvas><button class="ghost-btn" style="margin-top:10px" data-action="clear-signature">נקה חתימה</button>`;
  return `<input class="answer-input" id="answer" value="${escape(value)}" placeholder="הקלד תשובה">`;
}

function finishView() {
  state.view = 'finish';
  app.innerHTML = shell(`<main class="operator-wrap"><section class="finish-card"><span class="task-badge">✓ כל הפעולות הושלמו</span><h1>עכשיו מגנים ושולחים.</h1><p>בחר קוד של 6 ספרות. הקובץ שייווצר ייפתח רק למי שמכיר את הקוד הזה.</p><input id="result-code" class="code-input" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" placeholder="••••••" aria-label="קוד בן שש ספרות"><div class="security-callout">⚠️ <b>לא שולחים את הקוד יחד עם הקובץ.</b><br>אחרי שהקובץ נשלח, מסור את הקוד למנהל בשיחת טלפון בלבד. ב-WhatsApp יש לשלוח <b>כמסמך</b>, לא כתמונה.</div><button class="primary-btn aqua wide" data-action="create-result">יצירת קובץ תוצאה מוגן</button></section></main>`, false);
}

async function shareView(blob, filename) {
  state.view = 'share';
  const canShare = !!navigator.canShare && navigator.canShare({ files: [new File([blob], filename, { type: 'application/octet-stream' })] });
  app.innerHTML = shell(`<main class="operator-wrap"><section class="finish-card"><span class="task-badge">✓ הקובץ מוכן</span><h1>סיימנו. שולחים נכון.</h1><p>נוצר קובץ אחד מוגן. שלח אותו למנהל <b>כמסמך</b>, ומסור את הקוד בשיחת טלפון.</p><div class="result-hero"><h2>${escape(filename)}</h2><p>${(blob.size / 1024 / 1024).toFixed(2)} MB · AES-GCM · בדיקת שלמות כלולה</p></div><div class="security-callout">חשוב: ב-WhatsApp בוחרים <b>צרף › מסמך</b>. לא בוחרים גלריה או תמונה - אחרת האיכות עלולה להיפגע.</div><button class="primary-btn aqua wide" data-action="share-result">${canShare ? 'פתיחת אפשרויות שיתוף' : 'הורדת הקובץ למכשיר'}</button><button class="ghost-btn wide" style="margin-top:9px" data-action="download-result">הורדה בלבד</button><button class="danger-btn wide" style="margin-top:18px" data-action="confirm-cleanup">אישרתי שהקובץ נשלח - מחיקת הנתונים מהמכשיר</button></section></main>`, false);
  state.resultBlob = blob; state.resultFilename = filename; state.canShareResult = canShare;
}

async function saveDraft() {
  state.draft.updatedAt = Date.now(); state.draft.currentIndex = state.step; await DB.put('drafts', state.draft);
}
let draftTimer = null;
function autosaveDraftSoon() { clearTimeout(draftTimer); draftTimer = setTimeout(() => { if (state.draft) saveDraft(); }, 500); }
function collectCurrentAnswer() {
  const field = state.currentTask?.fields?.[state.step]; if (!field) return;
  const input = $('#answer');
  if (input) state.draft.answers[field.id] = input.value;
}
async function readFileAsDataURL(file) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); }); }
function initSignature(existing) {
  const canvas = $('#signature'); if (!canvas) return; const ctx = canvas.getContext('2d'); const ratio = devicePixelRatio || 1;
  const resize = () => { const old = canvas.toDataURL(); canvas.width = canvas.clientWidth * ratio; canvas.height = canvas.clientHeight * ratio; ctx.scale(ratio, ratio); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#19324a'; ctx.lineWidth = 2.1; if (existing || old.length > 100) { const img = new Image(); img.onload = () => ctx.drawImage(img,0,0,canvas.clientWidth,canvas.clientHeight); img.src = existing || old; } }; resize();
  let drawing = false; const point = e => { const rect = canvas.getBoundingClientRect(); const p = e.touches?.[0] || e; return { x: p.clientX - rect.left, y: p.clientY - rect.top }; };
  const start = e => { drawing = true; const p = point(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); e.preventDefault(); }; const draw = e => { if (!drawing) return; const p = point(e); ctx.lineTo(p.x,p.y); ctx.stroke(); e.preventDefault(); }; const end = () => { if (drawing) { drawing = false; state.draft.answers[state.currentTask.fields[state.step].id] = canvas.toDataURL('image/png'); saveDraft(); } };
  canvas.addEventListener('pointerdown',start); canvas.addEventListener('pointermove',draw); canvas.addEventListener('pointerup',end); canvas.addEventListener('pointerleave',end);
}

async function createEncryptedResult(code) {
  if (!isSecure() || !crypto.subtle) throw new Error('הצפנה בדפדפן זמינה רק בחיבור HTTPS או localhost.');
  const payload = { format: 'shtachla-result-payload', version: 1, createdAt: Date.now(), task: state.currentTask, answers: state.currentTask.fields.map(field => ({ fieldId: field.id, label: field.label, section: field.section, type: field.type, answer: state.draft.answers[field.id] ?? null })), metadata: { startedAt: state.draft.startedAt, completedAt: Date.now(), userAgent: navigator.userAgent } };
  const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12)); const iterations = 250000;
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(code), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, { name:'AES-GCM', length:256 }, false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, encoder.encode(JSON.stringify(payload)));
  const hash = bytesToB64(await crypto.subtle.digest('SHA-256', encrypted));
  const header = { format:'FRESULT', version:1, createdAt:payload.createdAt, title:state.currentTask.title, salt:bytesToB64(salt), iv:bytesToB64(iv), iterations, hash, algorithm:'PBKDF2-SHA256 / AES-256-GCM' };
  const binary = `FRESULT1\n${JSON.stringify(header)}\n${bytesToB64(encrypted)}`;
  return new Blob([binary], { type:'application/octet-stream' });
}

async function openResultFile(file, code) {
  const text = await file.text(); const [magic, headerText, payloadB64] = text.split('\n');
  if (magic !== 'FRESULT1' || !headerText || !payloadB64) throw new Error('זה לא קובץ תוצאה תקין של שטחלה.');
  const header = JSON.parse(headerText); const encrypted = b64ToBytes(payloadB64).buffer; const actualHash = bytesToB64(await crypto.subtle.digest('SHA-256', encrypted));
  if (actualHash !== header.hash) throw new Error('בדיקת השלמות נכשלה. הקובץ השתנה או נפגם.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(code), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name:'PBKDF2', salt:b64ToBytes(header.salt), iterations:header.iterations, hash:'SHA-256' }, material, { name:'AES-GCM',length:256 }, false, ['decrypt']);
  try { const data = await crypto.subtle.decrypt({ name:'AES-GCM', iv:b64ToBytes(header.iv) }, key, encrypted); return { header, payload: JSON.parse(decoder.decode(data)) }; } catch { throw new Error('הקוד שגוי, או שהקובץ אינו תקין. לא נחשף שום מידע חלקי.'); }
}

function unlockedView(result) {
  state.unlocked = result; state.view = 'report'; const payload = result.payload;
  app.innerHTML = shell(`<main class="operator-wrap"><section class="view-head"><div class="view-title"><h1>תוצאה מהשטח</h1><p>נפתחה בהצלחה ובדיקת השלמות עברה.</p></div><div style="display:flex;gap:8px"><button class="ghost-btn" data-action="export-csv">ייצוא Excel</button><button class="primary-btn" data-action="print-report">ייצוא PDF</button></div></section><section class="result-hero"><span class="task-badge">✓ פענוח מאומת</span><h2>${escape(payload.task.title)}</h2><p>${escape(payload.task.site || 'ללא אתר')} · הושלם ${dateText(payload.metadata.completedAt)}</p></section><section class="card report">${payload.answers.map(row => `<div class="report-row"><div class="report-q">${escape(row.section || 'כללי')} · ${escape(row.label)}</div><div class="report-a">${renderReportAnswer(row)}</div></div>`).join('')}</section></main>`);
}
function renderReportAnswer(row) {
  if (Array.isArray(row.answer)) return row.answer.length ? `<div class="report-images">${row.answer.map(image => `<img src="${image}" alt="תיעוד מהשטח">`).join('')}</div>` : 'לא צורפה תמונה';
  if (row.type === 'signature' && row.answer) return `<img src="${row.answer}" style="max-width:250px;max-height:110px;display:block;border:1px solid #dce5ed;border-radius:8px" alt="חתימת מבצע">`;
  if (row.type === 'gps' && row.answer?.latitude) return `קו רוחב ${row.answer.latitude.toFixed(6)}, קו אורך ${row.answer.longitude.toFixed(6)} · דיוק ${Math.round(row.answer.accuracy)} מ׳`;
  return row.answer === null || row.answer === '' ? '<em>לא מולא</em>' : escape(String(row.answer));
}

function taskFile(task) { return new Blob([JSON.stringify({ format:'FTASK', version:1, exportedAt:Date.now(), task }, null, 2)], { type:'application/json' }); }
async function saveBuilder() { state.builder.updatedAt = Date.now(); await DB.put('templates', state.builder); toast('התבנית נשמרה מקומית במכשיר.'); }

async function handleImport(file) {
  if (!file) return; const mode = state.importMode; state.importMode = null;
  if (mode === 'result' || file.name.endsWith('.fresult')) return askResultCode(file);
  try { const raw = JSON.parse(await file.text()); const task = raw.task || raw; if (raw.format !== 'FTASK' && !task.fields) throw new Error(); task.id = task.id || uid(); builderView(task); toast('המשימה נטענה. אפשר לערוך או להפיץ אותה.'); } catch { toast('קובץ המשימה אינו תקין.', 'warn'); }
}
function askResultCode(file) {
  const modal = document.createElement('div'); modal.className = 'modal-backdrop'; modal.innerHTML = `<section class="modal"><h2>פתיחת תוצאה מוגנת</h2><p>הזן את הקוד בן 6 הספרות שהמבצע מסר לך בטלפון.</p><input id="unlock-code" class="code-input" inputmode="numeric" maxlength="6" placeholder="••••••"><div class="modal-actions"><button class="ghost-btn" data-action="close-modal">ביטול</button><button class="primary-btn" data-action="unlock-result">פתיחת תוצאה</button></div></section>`; document.body.append(modal); modal.querySelector('[data-action="unlock-result"]').addEventListener('click', async () => { const code = modal.querySelector('#unlock-code').value.trim(); if (!/^\d{6}$/.test(code)) return toast('יש להזין קוד בן 6 ספרות.', 'warn'); try { const result = await openResultFile(file, code); await DB.put('results', { id:uid(), openedAt:Date.now(), title:result.payload.task.title, payload:result.payload, header:result.header }); modal.remove(); unlockedView(result); toast('התוצאה נפתחה ובדיקת השלמות עברה.'); } catch (error) { toast(error.message, 'warn'); } }); modal.querySelector('[data-action="close-modal"]').addEventListener('click', () => modal.remove());
}

async function requestPersist() { try { const granted = await navigator.storage?.persist?.(); if (granted) toast('המכשיר אישר שמירה מוגנת לטיוטה.'); else toast('הדפדפן לא אישר שמירה מוגנת. הטיוטה עדיין נשמרת, אך מומלץ לא להשאיר אותה ימים רבים.', 'warn'); } catch {} }
function about() { const modal = document.createElement('div'); modal.className='modal-backdrop'; modal.innerHTML=`<section class="modal"><h2>שטחלה</h2><p>מנוע מקומי ליצירה, ביצוע וקבלת משימות שטח. הנתונים נשמרים בדפדפן; אין שרת נתונים ואין חשבון למבצע.</p><p class="small-note">MVP מקומי · גרסה 0.1<br>נבנה עבור רותם מלכי</p><div class="modal-actions"><button class="primary-btn" data-action="close-modal">סגור</button></div></section>`; document.body.append(modal); modal.querySelector('button').onclick = () => modal.remove(); }

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action],[data-nav],[data-answer]'); if (!target) return;
  if (target.dataset.nav) { if (target.dataset.nav === 'home') homeView(); if (target.dataset.nav === 'manager') managerView(); return; }
  if (target.dataset.answer) { state.draft.answers[state.currentTask.fields[state.step].id] = target.dataset.answer; await saveDraft(); runnerView(); return; }
  const action = target.dataset.action;
  if (action === 'about') return about();
  if (action === 'start-demo') return taskIntro(demoTask());
  if (action === 'use-demo') return builderView(demoTask());
  if (action === 'new-task') return builderView();
  if (action === 'open-template') { const task = await DB.get('templates', target.dataset.id); if (task) builderView(task); return; }
  if (action === 'add-field') { state.builder.fields.push(newField()); return renderBuilder(); }
  if (action === 'remove-field') { const row = target.closest('[data-field-id]'); state.builder.fields = state.builder.fields.filter(f => f.id !== row.dataset.fieldId); return renderBuilder(); }
  if (action === 'save-task') return saveBuilder();
  if (action === 'preview-task') return taskIntro(structuredClone(state.builder));
  if (action === 'export-task') { await saveBuilder(); const name = `${state.builder.title.replace(/[^\p{L}\p{N}]+/gu,'-') || 'task'}.ftask`; download(taskFile(state.builder), name); toast('נוצר קובץ משימה. שלח אותו למבצע לפתיחה בדפדפן.'); return; }
  if (action === 'import-task' || action === 'import-result') { state.importMode = action === 'import-result' ? 'result' : 'task'; importInput.accept = action === 'import-result' ? '.fresult' : '.ftask,application/json'; importInput.click(); return; }
  if (action === 'begin-task') { await requestPersist(); await saveDraft(); return runnerView(); }
  if (action === 'prev-step') { state.step--; await saveDraft(); return runnerView(); }
  if (action === 'next-step') { collectCurrentAnswer(); const field = state.currentTask.fields[state.step]; const answer = state.draft.answers[field.id]; if (field.required && (answer === undefined || answer === null || answer === '' || (Array.isArray(answer) && !answer.length))) return toast('הפעולה הזו חובה לפני שממשיכים.', 'warn'); state.step++; await saveDraft(); return runnerView(); }
  if (action === 'capture-gps') { if (!navigator.geolocation) return toast('מיקום לא נתמך בדפדפן הזה.', 'warn'); target.textContent = 'מאתר מיקום…'; navigator.geolocation.getCurrentPosition(async pos => { state.draft.answers[state.currentTask.fields[state.step].id] = { latitude:pos.coords.latitude, longitude:pos.coords.longitude, accuracy:pos.coords.accuracy, capturedAt:Date.now() }; await saveDraft(); runnerView(); toast('המיקום נשמר.'); }, () => { target.textContent='שמור מיקום'; toast('לא ניתן היה לקבל מיקום. בדוק הרשאה וקליטה.', 'warn'); }, { enableHighAccuracy:true, timeout:10000, maximumAge:0 }); return; }
  if (action === 'clear-signature') { state.draft.answers[state.currentTask.fields[state.step].id] = ''; await saveDraft(); return runnerView(); }
  if (action === 'create-result') { const code = $('#result-code').value.trim(); if (!/^\d{6}$/.test(code)) return toast('יש לבחור קוד בן 6 ספרות בדיוק.', 'warn'); try { target.disabled=true; target.textContent='מצפין את התוצאה…'; const blob = await createEncryptedResult(code); await shareView(blob, `${state.currentTask.title.replace(/[^\p{L}\p{N}]+/gu,'-')}-${new Date().toISOString().slice(0,10)}.fresult`); } catch (error) { toast(error.message || 'יצירת הקובץ נכשלה.', 'warn'); target.disabled=false; target.textContent='יצירת קובץ תוצאה מוגן'; } return; }
  if (action === 'share-result') { if (state.canShareResult) { try { await navigator.share({ title:'תוצאת שטחלה', text:'קובץ תוצאה מוגן - יש לפתוח עם הקוד שנמסר בטלפון.', files:[new File([state.resultBlob], state.resultFilename, { type:'application/octet-stream' })] }); } catch {} } else download(state.resultBlob, state.resultFilename); return; }
  if (action === 'download-result') return download(state.resultBlob, state.resultFilename);
  if (action === 'confirm-cleanup') { const id=state.draft.id; await DB.delete('drafts',id); state.draft=null; homeView(); toast('טיוטת המשימה נמחקה מהמכשיר. הקובץ שהורדת נשאר אצלך.'); return; }
  if (action === 'print-report') return window.print();
  if (action === 'export-csv') { const rows = state.unlocked.payload.answers.map(r => [r.section, r.label, typeof r.answer === 'object' ? JSON.stringify(r.answer) : r.answer]); const csv = '\ufeffסעיף,שאלה,תשובה\n' + rows.map(row => row.map(v => `"${String(v ?? '').replaceAll('"','""')}"`).join(',')).join('\n'); download(new Blob([csv],{type:'text/csv;charset=utf-8'}), `${state.unlocked.payload.task.title}-תוצאות.csv`); return; }
  if (action === 'close-modal') return target.closest('.modal-backdrop')?.remove();
});

document.addEventListener('input', event => {
  if (event.target.id === 'answer' && state.view === 'runner' && state.draft && state.currentTask) {
    const field = state.currentTask.fields[state.step];
    if (field) { state.draft.answers[field.id] = event.target.value; autosaveDraftSoon(); }
  }
  if (event.target.dataset.taskProp) state.builder[event.target.dataset.taskProp] = event.target.value;
  const row = event.target.closest?.('[data-field-id]'); if (row && event.target.dataset.fieldProp) { const field = state.builder.fields.find(f => f.id === row.dataset.fieldId); if (field) field[event.target.dataset.fieldProp] = event.target.type === 'checkbox' ? event.target.checked : event.target.value; }
});
document.addEventListener('change', async event => {
  if (event.target.id === 'answer' && state.view === 'runner' && state.draft && state.currentTask) {
    const field = state.currentTask.fields[state.step];
    if (field) { state.draft.answers[field.id] = event.target.value; await saveDraft(); }
  }
  const row = event.target.closest?.('[data-field-id]'); if (row && event.target.dataset.fieldProp) { const field = state.builder.fields.find(f => f.id === row.dataset.fieldId); if (field) field[event.target.dataset.fieldProp] = event.target.type === 'checkbox' ? event.target.checked : event.target.value; }
  if (event.target.id === 'photo-input') { const id = state.currentTask.fields[state.step].id; const existing = state.draft.answers[id] || []; const additions = await Promise.all([...event.target.files].map(readFileAsDataURL)); state.draft.answers[id] = [...existing,...additions]; await saveDraft(); runnerView(); }
});
importInput.addEventListener('change', event => { handleImport(event.target.files[0]); event.target.value = ''; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
homeView();
