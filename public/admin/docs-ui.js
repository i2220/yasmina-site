/* Reports and invoices tabs for the admin panel (uses window.YS from the panel and window.YSDocs for the PDFs). */
(function () {
  'use strict';
  const D = window.YSDocs;
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x !== undefined && x !== null) e.textContent = x; return e; };
  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  const css = el('style');
  css.textContent = `
  .dform{display:grid;gap:14px;padding-block:10px}
  .dform .panel h2{display:flex;align-items:center;gap:8px}
  .g2{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px 14px}
  .fld{display:grid;gap:4px}.fld>span{font-size:13px;color:var(--muted);font-weight:700}
  .rate{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:6px 0;border-bottom:1px dashed rgba(255,229,0,.14)}
  .rate>b{flex:1 1 120px;font-weight:700}
  .rate .stars{display:flex;gap:6px}
  .rate button{width:40px;height:40px;border-radius:50%;border:1.5px solid var(--line);font-weight:800;font-size:15px;transition:background .15s,color .15s}
  .rate button[aria-pressed=true]{background:var(--yellow);color:#000;border-color:var(--yellow)}
  .rate button.na{width:auto;padding:0 12px;border-radius:99px;font-size:12px;color:var(--muted)}
  .dbar{position:sticky;bottom:10px;z-index:5;display:flex;gap:10px;flex-wrap:wrap;padding:12px;border-radius:20px;border:1px solid var(--line);background:rgba(13,13,8,.95);backdrop-filter:blur(8px)}
  .pv{display:grid;gap:14px;padding-block:10px}
  .pv canvas{width:100%;max-width:640px;height:auto;margin-inline:auto;border-radius:10px;background:#fff;box-shadow:0 10px 40px -10px rgba(0,0,0,.8)}
  .items{display:grid;gap:8px}
  .item{display:grid;grid-template-columns:1fr 80px 110px 100px auto;gap:8px;align-items:center}
  .item .tot{font-weight:800;text-align:left;direction:ltr}
  .tbox{display:grid;gap:4px;padding:12px 16px;border-radius:16px;background:var(--panel-2);border:1px solid var(--line);max-width:380px;margin-inline-start:auto;width:100%}
  .tbox div{display:flex;justify-content:space-between;gap:12px}
  .tbox .big{font-weight:900;font-size:19px;color:var(--yellow)}
  @media (max-width:720px){.item{grid-template-columns:1fr 1fr}.item>:first-child{grid-column:1/-1}}
  `;
  document.head.append(css);

  function fld(label, input) { const l = el('label', 'fld'); l.append(el('span', '', label), input); return l; }
  function inp(type, val, attrs) { const i = el('input'); i.type = type; i.value = val == null ? '' : val; Object.assign(i, attrs || {}); return i; }
  function sel(options, val, blank) {
    const s = el('select');
    if (blank !== undefined) { const o = el('option', '', blank); o.value = ''; s.append(o); }
    options.forEach((x) => { const o = el('option', '', x); o.value = x; if (x === val) o.selected = true; s.append(o); });
    return s;
  }
  function ta(val, ph, max) { const t = el('textarea'); t.value = val || ''; t.placeholder = ph || ''; t.maxLength = max || 600; t.style.minHeight = '84px'; return t; }
  function panel(title) { const p = el('div', 'panel'); p.append(el('h2', '', title)); return p; }
  function chipBox(list, arr, onchange) {
    const box = el('div', 'chips');
    list.forEach((t) => {
      const l = el('label', 'chip'), i = el('input'); i.type = 'checkbox'; i.checked = arr.includes(t);
      i.addEventListener('change', () => { const k = arr.indexOf(t); if (i.checked && k < 0) arr.push(t); if (!i.checked && k >= 0) arr.splice(k, 1); onchange && onchange(); });
      l.append(i, el('span', '', t)); box.append(l);
    });
    return box;
  }
  function rate(label, obj, key, onchange) {
    const r = el('div', 'rate'), st = el('div', 'stars'); r.append(el('b', '', label), st);
    const btns = [];
    const paint = () => btns.forEach((b, i) => b.setAttribute('aria-pressed', String(Number(obj[key]) === i)));
    for (let i = 1; i <= 5; i++) { const b = el('button', '', String(i)); b.type = 'button'; b.addEventListener('click', () => { obj[key] = obj[key] === i ? 0 : i; paint(); onchange && onchange(); }); btns[i] = b; st.append(b); }
    btns[0] = { setAttribute() {} }; paint(); return r;
  }
  const brand = () => {
    const s = YS.settings || {};
    const cc = String(s.countryCode || '').replace(/\D/g, '');
    let w = String(s.whatsapp || '').replace(/\D/g, '').replace(/^00/, '');
    if (w && cc && w.length <= 9 && !w.startsWith(cc)) w = cc + w.replace(/^0+/, '');
    return { teacher: s.teacherName || 'يسمينا طارق العربي', place: [s.teacherCity, s.teacherArea].filter(Boolean).join('، '), placeShort: [s.teacherCity, s.teacherArea].filter(Boolean).join(' · '), whatsapp: w, host: location.host };
  };
  const code = (id, p) => (id ? p + (1000 + Number(id)) : '');
  function download(blob, name) { const a = el('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  function preview(box, pages) { box.textContent = ''; pages.forEach((c) => { const k = el('canvas'); k.width = c.width; k.height = c.height; k.getContext('2d').drawImage(c, 0, 0); box.append(k); }); box.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  async function share(blob, name, text, phone) {
    const file = new File([blob], name, { type: 'application/pdf' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    download(blob, name);
    YS.toast('نُزِّل الملف. أرفقه في محادثة واتساب التي ستُفتح.');
    const num = String(phone || '').replace(/\D/g, '');
    window.open('https://wa.me/' + (num ? YS.waNumber(num) : '') + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
  }
  async function listDocs(kind) { const j = await YS.api('/api/admin/docs?kind=' + kind); return j.docs; }
  async function saveDoc(body) { const j = await YS.api('/api/admin/docs', { method: 'POST', body }); return j.id || body.id; }

  /* =============== reports =============== */
  const STRENGTHS = ['مشاركة نشطة', 'نطق واضح', 'حصيلة مفردات جيدة', 'قراءة سلسة', 'فهم سريع', 'إملاء دقيق', 'ثقة بالنفس', 'التزام بالواجبات', 'فضول وحب للتعلم', 'احترام الدور والإصغاء'];
  const IMPROVE = ['نطق بعض الأصوات', 'القراءة بصوت عالٍ', 'الإملاء', 'تكوين الجمل', 'الثقة في التحدث', 'التركيز', 'الاستماع', 'حفظ المفردات', 'الالتزام بالواجب', 'سرعة القراءة'];
  const TIPS = ['مراجعة المفردات 10 دقائق يوميًا', 'القراءة قبل النوم', 'محتوى إنجليزي مناسب للعمر', 'التحدث بالإنجليزية في البيت', 'الالتزام بالواجب في موعده', 'تهيئة مكان هادئ للحصة', 'الحضور في الموعد'];
  const blankReport = () => ({ bookingId: 0, student: '', grade: '', age: '', parent: '', phone: '', date: todayStr(), sessionNo: '', duration: '', topic: '', attendance: 'حضر في الوقت', objectives: '',
    skills: {}, behavior: {}, level: '', progress: 'كما هو متوقع', homeworkStatus: 'لا يوجد', score: '', newWords: '', mastered: '', strengths: [], strengthsNote: '', improve: [], improveNote: '',
    homework: '', nextPlan: '', parentTips: [], parentNote: '', private: '', code: '' });
  const LEVELS = ['مبتدئ', 'مبتدئ متقدم', 'متوسط', 'متوسط متقدم', 'متقدم'];

  const RS = { d: blankReport(), id: 0, list: [], root: null };

  async function renderReports() {
    const root = YS.pane('reports');
    if (!RS.root) { RS.root = el('div'); root.append(RS.root); try { RS.list = await listDocs('report'); } catch (e) { YS.toast(e.message, true); } buildReports(); }
    else buildReports();
  }

  function historyFor(d, exceptId) {
    return RS.list.filter((x) => x.id !== exceptId && ((d.bookingId && x.booking_id === d.bookingId) || (!d.bookingId && x.data.student && x.data.student === d.student)))
      .sort((a, b) => (a.data.date || a.created_at) < (b.data.date || b.created_at) ? -1 : 1)
      .map((x) => ({ v: D.reportScore(x.data), d: String(x.data.date || x.created_at).slice(5, 10) })).filter((x) => x.v);
  }

  function buildReports() {
    const d = RS.d, root = RS.root; root.textContent = '';
    const touch = () => {};
    const top = el('div', 'tools');
    const pick = el('select'); pick.setAttribute('aria-label', 'اختر الطالب');
    const o0 = el('option', '', 'اختر الطالب من الحجوزات…'); o0.value = ''; pick.append(o0);
    YS.all.filter((b) => b.status !== 'cancelled').forEach((b) => { const o = el('option', '', b.child + ' · ' + b.grade + ' · YS-' + (1000 + b.id)); o.value = b.id; if (Number(d.bookingId) === b.id) o.selected = true; pick.append(o); });
    const fresh = el('button', 'ghost', 'تقرير جديد'); fresh.type = 'button';
    top.append(pick, fresh); root.append(top);
    const form = el('div', 'dform'); root.append(form);

    // 1 session
    const p1 = panel('بيانات الحصة والطالب'), g1 = el('div', 'g2');
    const bind = (i, k) => { i.addEventListener('input', () => { d[k] = i.value; }); i.addEventListener('change', () => { d[k] = i.value; }); return i; };
    const f = {};
    f.student = bind(inp('text', d.student, { maxLength: 60 }), 'student');
    f.grade = bind(inp('text', d.grade, { maxLength: 40 }), 'grade'); f.age = bind(inp('text', d.age, { maxLength: 3, inputMode: 'numeric' }), 'age');
    f.parent = bind(inp('text', d.parent, { maxLength: 60 }), 'parent'); f.phone = bind(inp('tel', d.phone, { maxLength: 20 }), 'phone');
    f.date = bind(inp('date', d.date), 'date'); f.sessionNo = bind(inp('number', d.sessionNo, { min: 1 }), 'sessionNo'); f.duration = bind(inp('number', d.duration, { min: 5, max: 240 }), 'duration');
    f.topic = bind(inp('text', d.topic, { maxLength: 100, placeholder: 'مثال: الحروف A–F وأصواتها' }), 'topic');
    f.attendance = bind(sel(['حضر في الوقت', 'تأخر قليلًا', 'غاب بعذر', 'غاب بدون إبلاغ'], d.attendance), 'attendance');
    [['اسم الطالب', 'student'], ['الصف', 'grade'], ['العمر', 'age'], ['ولي الأمر', 'parent'], ['واتساب ولي الأمر', 'phone'], ['تاريخ الحصة', 'date'], ['رقم الحصة', 'sessionNo'], ['المدة (دقيقة)', 'duration'], ['موضوع الحصة', 'topic'], ['الحضور', 'attendance']].forEach(([l, k]) => g1.append(fld(l, f[k])));
    const obj = ta(d.objectives, 'ما الهدف من الحصة؟ مثال: التعرّف على أصوات الحروف وتكوين كلمات من ثلاثة أحرف', 400); bind(obj, 'objectives');
    p1.append(g1, fld('أهداف الحصة', obj)); form.append(p1);

    // 2 skills
    const p2 = panel('تقييم المهارات (من 1 إلى 5، اتركها فارغة إن لم تُقيَّم)');
    D.SKILLS.forEach(([k, l]) => p2.append(rate(l, d.skills, k)));
    form.append(p2);
    // 3 behaviour
    const p3 = panel('السلوك والتفاعل'); D.BEHAV.forEach(([k, l]) => p3.append(rate(l, d.behavior, k))); form.append(p3);

    // 4 level
    const p4 = panel('المستوى والنتيجة'), g4 = el('div', 'g2');
    const lv = bind(sel(LEVELS, d.level, 'اختر المستوى'), 'level');
    const pr = bind(sel(['أسرع من المتوقع', 'كما هو متوقع', 'يحتاج دعمًا إضافيًا'], d.progress), 'progress');
    const hw = bind(sel(['لا يوجد', 'أنجز كاملًا', 'أنجز جزئيًا', 'لم ينجز'], d.homeworkStatus), 'homeworkStatus');
    const sc = bind(inp('number', d.score, { min: 0, max: 10, step: '0.5', placeholder: 'من 10 (اختياري)' }), 'score');
    g4.append(fld('المستوى الحالي في الإنجليزية', lv), fld('التقدّم مقارنة بالمتوقع', pr), fld('حالة الواجب السابق', hw), fld('نتيجة اختبار قصير', sc));
    const nw = bind(ta(d.newWords, 'مثال: apple, ball, cat, dog', 300), 'newWords'), ms = bind(ta(d.mastered, 'ما الذي أتقنه الطالب فعلًا في هذه الحصة؟', 400), 'mastered');
    p4.append(g4, fld('كلمات وحروف جديدة', nw), fld('ما أتقنه الطالب', ms)); form.append(p4);

    // 5 strengths / improve
    const p5 = panel('نقاط القوة'); p5.append(chipBox(STRENGTHS, d.strengths)); p5.append(fld('ملاحظة عن نقاط القوة (اختياري)', bind(ta(d.strengthsNote, '', 400), 'strengthsNote'))); form.append(p5);
    const p6 = panel('مجالات التطوير'); p6.append(chipBox(IMPROVE, d.improve)); p6.append(fld('ملاحظة عن مجالات التطوير (اختياري)', bind(ta(d.improveNote, 'كن محددًا وإيجابيًا', 400), 'improveNote'))); form.append(p6);

    // 7 plan
    const p7 = panel('الواجب والخطة القادمة');
    p7.append(fld('الواجب المنزلي', bind(ta(d.homework, 'مثال: كتابة الحروف A–F مرتين وقراءة 5 كلمات', 400), 'homework')), fld('خطة الحصة القادمة', bind(ta(d.nextPlan, 'مثال: مراجعة A–F ثم البدء بالحروف G–L', 400), 'nextPlan'))); form.append(p7);
    const p8 = panel('توصيات لولي الأمر'); p8.append(chipBox(TIPS, d.parentTips)); p8.append(fld('رسالة شخصية لولي الأمر (اختياري)', bind(ta(d.parentNote, '', 500), 'parentNote'))); form.append(p8);
    const p9 = panel('ملاحظات خاصة بك (لا تظهر في PDF)'); p9.append(bind(ta(d.private, 'لك وحدك: ظروف الطفل، أمور للمتابعة…', 600), 'private')); form.append(p9);

    const pv = el('div', 'pv'); pv.id = 'rpv';
    const bar = el('div', 'dbar');
    const bSave = el('button', 'btn sm', 'حفظ التقرير'), bPrev = el('button', 'ghost sm', 'معاينة'), bPdf = el('button', 'ghost sm', 'تنزيل PDF'), bWa = el('button', 'ghost sm', 'إرسال لولي الأمر');
    [bSave, bPrev, bPdf, bWa].forEach((b) => { b.type = 'button'; bar.append(b); });
    root.append(bar, pv);
    const hist = el('div', 'list'); hist.id = 'rhist'; root.append(el('div', 'day', 'التقارير المحفوظة'), hist); RS.hist = hist; refreshReportHistory();

    const pre = () => { if (!d.student.trim()) { YS.toast('اكتب اسم الطالب أولًا', true); return false; } return true; };
    const save = async () => {
      if (!pre()) return 0;
      const wasNew = !RS.id;
      RS.id = await saveDoc({ id: RS.id || undefined, kind: 'report', booking_id: Number(d.bookingId) || 0, title: d.student + ' · ' + d.date, data: d });
      d.code = code(RS.id, 'YS-R-');
      await saveDoc({ id: RS.id, kind: 'report', booking_id: Number(d.bookingId) || 0, title: d.student + ' · ' + d.date, data: d });
      RS.list = await listDocs('report'); refreshReportHistory(); if (wasNew) YS.toast('تم حفظ التقرير ' + d.code); else YS.toast('تم تحديث التقرير');
      return RS.id;
    };
    const pages = async () => { await D.ready(); return D.report(d, historyFor(d, RS.id), brand()); };
    bSave.addEventListener('click', async () => { try { await save(); } catch (e) { YS.toast(e.message, true); } });
    bPrev.addEventListener('click', async () => { if (!pre()) return; preview(pv, await pages()); });
    const pdf = async () => { if (!(await save())) return null; return D.toPdf(await pages()); };
    bPdf.addEventListener('click', async () => { try { const b = await pdf(); if (b) download(b, 'تقرير-' + d.student + '-' + d.date + '.pdf'); } catch (e) { YS.toast(e.message, true); } });
    bWa.addEventListener('click', async () => {
      try {
        const b = await pdf(); if (!b) return;
        const pct = D.reportScore(d);
        const msg = 'السلام عليكم ' + (d.parent || '') + '،\nنرفق لكم تقرير تقدّم ' + d.student + ' بعد حصة ' + (d.date || '') + (pct ? '.\nالتقييم العام: ' + pct + '% (' + D.verdict(pct) + ')' : '') + '.\nرقم التقرير: ' + d.code + '\nتسعد معلمتكم ' + (brand().teacher) + ' بمتابعتكم دائمًا.';
        await share(b, 'تقرير-' + d.student + '.pdf', msg, d.phone);
      } catch (e) { YS.toast(e.message, true); }
    });

    pick.addEventListener('change', () => {
      const b = YS.all.find((x) => x.id === Number(pick.value));
      if (!b) { d.bookingId = 0; return; }
      d.bookingId = b.id; d.student = b.child; d.grade = b.grade; d.age = b.age || ''; d.parent = b.parent; d.phone = b.phone;
      d.duration = d.duration || (YS.settings && YS.settings.zoomDuration) || 40;
      d.sessionNo = RS.list.filter((x) => x.booking_id === b.id && x.id !== RS.id).length + 1;
      if (b.level && !d.level) d.level = ['مبتدئ', 'مبتدئ متقدم', 'متوسط', 'متوسط متقدم', 'متقدم'][Math.max(0, Math.min(4, ['لا يعرف الإنجليزية بعد', 'يعرف الحروف والكلمات البسيطة', 'يقرأ كلمات وجملًا قصيرة', 'يقرأ ويتحدث بشكل متوسط'].indexOf(b.level)))] || '';
      buildReports();
    });
    fresh.addEventListener('click', () => { RS.d = blankReport(); RS.id = 0; buildReports(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    window.__rpt = { d, build: () => buildReports() };
  }

  function refreshReportHistory() {
    const box = RS.hist; if (!box) return; box.textContent = '';
    if (!RS.list.length) { box.append(el('div', 'empty', 'لا توجد تقارير محفوظة بعد.')); return; }
    RS.list.forEach((x) => {
      const r = el('div', 'row'), g = el('div', 'grow'), pct = D.reportScore(x.data);
      g.append(el('b', '', x.data.student || x.title), el('div', 'hint', (x.data.date || '') + ' · ' + (x.data.topic || 'بدون موضوع') + (x.data.sessionNo ? ' · الحصة ' + x.data.sessionNo : '')));
      r.append(g);
      if (pct) r.append(el('span', 'tag', pct + '% ' + D.verdict(pct)));
      r.append(el('span', 'hint', x.data.code || code(x.id, 'YS-R-')));
      const ed = el('button', 'ghost sm', 'فتح'); ed.type = 'button'; ed.addEventListener('click', () => { RS.d = Object.assign(blankReport(), x.data); RS.id = x.id; buildReports(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
      const pd = el('button', 'ghost sm', 'PDF'); pd.type = 'button'; pd.addEventListener('click', async () => { await D.ready(); const h = RS.list.filter((y) => y.id !== x.id && (y.booking_id === x.booking_id && x.booking_id || y.data.student === x.data.student)).sort((a, b) => (a.data.date || '') < (b.data.date || '') ? -1 : 1).map((y) => ({ v: D.reportScore(y.data), d: String(y.data.date || '').slice(5, 10) })).filter((y) => y.v); download(D.toPdf(D.report(Object.assign(blankReport(), x.data, { code: x.data.code || code(x.id, 'YS-R-') }), h, brand())), 'تقرير-' + x.data.student + '-' + x.data.date + '.pdf'); });
      const del = el('button', 'ghost sm danger', 'حذف'); del.type = 'button'; let armed = 0;
      del.addEventListener('click', async () => { if (!armed) { armed = 1; del.textContent = 'اضغط للتأكيد'; setTimeout(() => { armed = 0; del.textContent = 'حذف'; }, 3000); return; } try { await YS.api('/api/admin/docs?id=' + x.id, { method: 'DELETE' }); RS.list = RS.list.filter((y) => y.id !== x.id); if (RS.id === x.id) RS.id = 0; refreshReportHistory(); YS.toast('تم الحذف'); } catch (e) { YS.toast(e.message, true); } });
      r.append(ed, pd, del); box.append(r);
    });
  }

  /* =============== invoices =============== */
  const blankInvoice = () => ({ bookingId: 0, number: '', date: todayStr(), due: '', status: 'unpaid', method: '', currency: (YS.settings && YS.settings.currency) || 'د.ك',
    billName: '', billChild: '', billPhone: '', billEmail: '', items: [{ desc: '', qty: 1, price: 0 }], discountType: 'amount', discount: 0, taxPct: 0, paid: 0, notes: '', terms: '', stamp: true });
  const IS = { d: blankInvoice(), id: 0, list: [], root: null };

  async function renderInvoices() {
    const root = YS.pane('invoices');
    if (!IS.root) { IS.root = el('div'); root.append(IS.root); try { IS.list = await listDocs('invoice'); } catch (e) { YS.toast(e.message, true); } IS.d.number = nextNumber(); buildInvoices(); } else buildInvoices();
  }
  function nextNumber() {
    const y = new Date().getFullYear(); let max = 0;
    IS.list.forEach((x) => { const m = /(\d+)$/.exec(String(x.title || x.data.number || '')); if (m && String(x.title).includes('' + y)) max = Math.max(max, Number(m[1])); });
    return 'YS-INV-' + y + '-' + String(max + 1).padStart(3, '0');
  }

  function buildInvoices() {
    const d = IS.d, root = IS.root; root.textContent = '';
    const top = el('div', 'tools'), pick = el('select'); pick.setAttribute('aria-label', 'تعبئة من حجز');
    const o0 = el('option', '', 'تعبئة البيانات من حجز (اختياري)…'); o0.value = ''; pick.append(o0);
    YS.all.filter((b) => b.status !== 'cancelled').forEach((b) => { const o = el('option', '', b.child + ' · ' + b.parent + ' · YS-' + (1000 + b.id)); o.value = b.id; if (Number(d.bookingId) === b.id) o.selected = true; pick.append(o); });
    const fresh = el('button', 'ghost', 'فاتورة جديدة'); fresh.type = 'button'; top.append(pick, fresh); root.append(top);
    const form = el('div', 'dform'); root.append(form);
    const bind = (i, k, num) => { const fn = () => { d[k] = i.type === 'checkbox' ? i.checked : i.value; totals(); }; i.addEventListener('input', fn); i.addEventListener('change', fn); return i; };

    const p1 = panel('بيانات الفاتورة'), g1 = el('div', 'g2');
    const st = el('select'); [['unpaid', 'غير مدفوعة'], ['partial', 'مدفوعة جزئيًا'], ['paid', 'مدفوعة']].forEach(([v, l]) => { const o = el('option', '', l); o.value = v; if (v === d.status) o.selected = true; st.append(o); });
    const method = sel(['نقدًا', 'تحويل بنكي', 'K-Net', 'بطاقة', 'إنستاباي', 'فودافون كاش', 'أخرى'], d.method, 'اختر');
    g1.append(fld('رقم الفاتورة', bind(inp('text', d.number, { maxLength: 30, dir: 'ltr' }), 'number')), fld('تاريخ الإصدار', bind(inp('date', d.date), 'date')), fld('تاريخ الاستحقاق', bind(inp('date', d.due), 'due')),
      fld('حالة الدفع', bind(st, 'status')), fld('طريقة الدفع', bind(method, 'method')), fld('العملة', bind(inp('text', d.currency, { maxLength: 8 }), 'currency')));
    p1.append(g1); form.append(p1);

    const p2 = panel('بيانات العميل'), g2 = el('div', 'g2');
    g2.append(fld('اسم ولي الأمر', bind(inp('text', d.billName, { maxLength: 60 }), 'billName')), fld('اسم الطالب', bind(inp('text', d.billChild, { maxLength: 60 }), 'billChild')),
      fld('الهاتف / واتساب', bind(inp('tel', d.billPhone, { maxLength: 20 }), 'billPhone')), fld('البريد الإلكتروني', bind(inp('text', d.billEmail, { maxLength: 100, dir: 'ltr' }), 'billEmail')));
    p2.append(g2); form.append(p2);

    const p3 = panel('البنود'), items = el('div', 'items'); p3.append(items);
    const tb = el('div', 'tbox');
    function drawItems() {
      items.textContent = '';
      d.items.forEach((it, i) => {
        const r = el('div', 'item');
        const desc = inp('text', it.desc, { maxLength: 120, placeholder: 'الوصف، مثال: باقة 8 حصص إنجليزية' }), q = inp('number', it.qty, { min: 0, step: '1' }), pr = inp('number', it.price, { min: 0, step: '0.5' });
        const tot = el('span', 'tot'), x = el('button', 'ghost sm danger', 'حذف'); x.type = 'button';
        const upd = () => { it.desc = desc.value; it.qty = q.value; it.price = pr.value; tot.textContent = D.money((Number(q.value) || 0) * (Number(pr.value) || 0), ''); totals(); };
        [desc, q, pr].forEach((e) => e.addEventListener('input', upd)); tot.textContent = D.money((Number(it.qty) || 0) * (Number(it.price) || 0), '');
        q.setAttribute('aria-label', 'الكمية'); pr.setAttribute('aria-label', 'السعر');
        x.addEventListener('click', () => { if (d.items.length > 1) { d.items.splice(i, 1); drawItems(); totals(); } });
        r.append(desc, q, pr, tot, x); items.append(r);
      });
    }
    const add = el('button', 'ghost sm', 'إضافة بند'); add.type = 'button'; add.addEventListener('click', () => { if (d.items.length < 20) { d.items.push({ desc: '', qty: 1, price: 0 }); drawItems(); } });
    p3.append(add); form.append(p3);
    drawItems();

    const p4 = panel('الخصم والضريبة والمدفوع'), g4 = el('div', 'g2');
    const dt = el('select'); [['amount', 'مبلغ ثابت'], ['pct', 'نسبة %']].forEach(([v, l]) => { const o = el('option', '', l); o.value = v; if (v === d.discountType) o.selected = true; dt.append(o); });
    g4.append(fld('نوع الخصم', bind(dt, 'discountType')), fld('قيمة الخصم', bind(inp('number', d.discount, { min: 0, step: '0.5' }), 'discount')), fld('الضريبة %', bind(inp('number', d.taxPct, { min: 0, max: 100, step: '0.5' }), 'taxPct')), fld('المبلغ المدفوع', bind(inp('number', d.paid, { min: 0, step: '0.5' }), 'paid')));
    p4.append(g4, tb); form.append(p4);

    const p5 = panel('ملاحظات وشروط');
    p5.append(fld('ملاحظات', bind(ta(d.notes, 'مثال: الباقة تبدأ من تاريخ أول حصة', 400), 'notes')), fld('الشروط والأحكام', bind(ta(d.terms, 'اكتب الشروط التي تريدها (سياسة الإلغاء والتأجيل…)', 600), 'terms')));
    const sl = el('label', 'consent'), sc = el('input'); sc.type = 'checkbox'; sc.checked = d.stamp !== false; sc.addEventListener('change', () => { d.stamp = sc.checked; }); sl.append(sc, el('span', '', 'إضافة ختم ياسمينا الدائري على الفاتورة'));
    sl.style.cssText = 'display:flex;gap:10px;align-items:center;padding:8px 0'; p5.append(sl); form.append(p5);

    function totals() {
      const T = D.invoiceTotals(d), c = d.currency;
      tb.textContent = '';
      const row = (a, b, cls) => { const r = el('div', cls || ''); r.append(el('span', '', a), el('b', '', b)); tb.append(r); };
      row('المجموع', D.money(T.sub, c)); if (T.disc) row('الخصم', '- ' + D.money(T.disc, c)); if (T.tax) row('الضريبة', D.money(T.tax, c));
      row('الإجمالي', D.money(T.total, c), 'big'); row('المدفوع', D.money(T.paid, c)); row('المتبقي', D.money(T.balance, c));
    }
    totals();

    const pv = el('div', 'pv'), bar = el('div', 'dbar');
    const bSave = el('button', 'btn sm', 'حفظ الفاتورة'), bPrev = el('button', 'ghost sm', 'معاينة'), bPdf = el('button', 'ghost sm', 'تنزيل PDF'), bWa = el('button', 'ghost sm', 'إرسال عبر واتساب');
    [bSave, bPrev, bPdf, bWa].forEach((b) => { b.type = 'button'; bar.append(b); });
    root.append(bar, pv);
    const hist = el('div', 'list'); root.append(el('div', 'day', 'الفواتير المحفوظة'), hist); IS.hist = hist; refreshInvoiceHistory();

    const pre = () => { if (!d.billName.trim()) { YS.toast('اكتب اسم العميل أولًا', true); return false; } if (!D.invoiceTotals(d).total) { YS.toast('أضف بندًا بسعر أكبر من صفر', true); return false; } return true; };
    const save = async () => {
      if (!pre()) return 0;
      IS.id = await saveDoc({ id: IS.id || undefined, kind: 'invoice', booking_id: Number(d.bookingId) || 0, title: d.number, data: d });
      IS.list = await listDocs('invoice'); refreshInvoiceHistory(); YS.toast('تم حفظ الفاتورة ' + d.number); return IS.id;
    };
    const pages = async () => { await D.ready(); return D.invoice(d, brand()); };
    bSave.addEventListener('click', async () => { try { await save(); } catch (e) { YS.toast(e.message, true); } });
    bPrev.addEventListener('click', async () => { if (pre()) preview(pv, await pages()); });
    const pdf = async () => { if (!(await save())) return null; return D.toPdf(await pages()); };
    bPdf.addEventListener('click', async () => { try { const b = await pdf(); if (b) download(b, 'فاتورة-' + d.number + '.pdf'); } catch (e) { YS.toast(e.message, true); } });
    bWa.addEventListener('click', async () => {
      try { const b = await pdf(); if (!b) return; const T = D.invoiceTotals(d);
        await share(b, 'فاتورة-' + d.number + '.pdf', 'السلام عليكم ' + d.billName + '،\nنرفق لكم الفاتورة رقم ' + d.number + '\nالإجمالي: ' + D.money(T.total, d.currency) + (T.balance > 0 ? '\nالمتبقي: ' + D.money(T.balance, d.currency) : '\nشكرًا لكم، تم السداد بالكامل.'), d.billPhone);
      } catch (e) { YS.toast(e.message, true); }
    });
    pick.addEventListener('change', () => {
      const b = YS.all.find((x) => x.id === Number(pick.value)); if (!b) { d.bookingId = 0; return; }
      d.bookingId = b.id; d.billName = b.parent; d.billChild = b.child; d.billPhone = b.phone; d.billEmail = b.email || '';
      if (b.plan && (d.items.length === 1 && !d.items[0].desc)) d.items = [{ desc: b.plan + ' · ' + b.child, qty: 1, price: Number(b.amount) || (((YS.settings && YS.settings.plans) || []).find((p) => p.name === b.plan) || {}).price || 0 }];
      if (b.pay_status) d.status = b.pay_status; if (b.pay_status === 'paid') d.paid = 0;
      buildInvoices();
    });
    fresh.addEventListener('click', () => { IS.d = blankInvoice(); IS.d.number = nextNumber(); IS.id = 0; buildInvoices(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  function refreshInvoiceHistory() {
    const box = IS.hist; if (!box) return; box.textContent = '';
    if (!IS.list.length) { box.append(el('div', 'empty', 'لا توجد فواتير محفوظة بعد.')); return; }
    IS.list.forEach((x) => {
      const T = D.invoiceTotals(x.data), r = el('div', 'row'), g = el('div', 'grow');
      g.append(el('b', '', x.title), el('div', 'hint', (x.data.billName || '') + ' · ' + (x.data.date || '')));
      const stl = { paid: ['مدفوعة', 't-paid'], partial: ['جزئية', 't-partial'], unpaid: ['غير مدفوعة', 't-unpaid'] }[x.data.status] || ['', ''];
      r.append(g, el('span', 'tag ' + stl[1], stl[0]), el('b', '', D.money(T.total, x.data.currency)));
      const ed = el('button', 'ghost sm', 'فتح'); ed.type = 'button'; ed.addEventListener('click', () => { IS.d = Object.assign(blankInvoice(), x.data); IS.id = x.id; buildInvoices(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
      const pd = el('button', 'ghost sm', 'PDF'); pd.type = 'button'; pd.addEventListener('click', async () => { await D.ready(); download(D.toPdf(D.invoice(Object.assign(blankInvoice(), x.data), brand())), 'فاتورة-' + x.title + '.pdf'); });
      const del = el('button', 'ghost sm danger', 'حذف'); del.type = 'button'; let armed = 0;
      del.addEventListener('click', async () => { if (!armed) { armed = 1; del.textContent = 'اضغط للتأكيد'; setTimeout(() => { armed = 0; del.textContent = 'حذف'; }, 3000); return; } try { await YS.api('/api/admin/docs?id=' + x.id, { method: 'DELETE' }); IS.list = IS.list.filter((y) => y.id !== x.id); if (IS.id === x.id) IS.id = 0; refreshInvoiceHistory(); YS.toast('تم الحذف'); } catch (e) { YS.toast(e.message, true); } });
      r.append(ed, pd, del); box.append(r);
    });
  }

  window.YSUI = { reports: renderReports, invoices: renderInvoices };
})();
