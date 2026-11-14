/* Yasmina documents: draws progress reports and invoices on canvas (the browser shapes Arabic correctly)
   and packs the pages into a real A4 PDF with no external library. */
(function () {
  'use strict';
  const W = 794, H = 1123, S = 2, MX = 40;                 // logical A4 at 96dpi, drawn at 2x
  const XR = W - MX, CW = W - MX * 2;                       // right edge and content width
  const FONT = "Cairo,'Noto Sans Arabic','Segoe UI',Tahoma,Arial,sans-serif";
  const C = { blue: '#0b2a78', blue2: '#1a47c9', yellow: '#ffe500', ink: '#14203f', muted: '#5b6786', line: '#dfe5f3', soft: '#f3f6ff', ok: '#1f9d55', warn: '#d98a00', bad: '#d64545', cream: '#fffbe0' };
  const AR = /[؀-ۿ]/;

  /* ---------- drawing helpers ---------- */
  function setFont(g, size, weight) { g.font = (weight || 600) + ' ' + size + 'px ' + FONT; }
  function text(g, str, x, y, o) {
    o = o || {};
    str = String(str == null ? '' : str);
    setFont(g, o.size || 14, o.weight || 600);
    g.fillStyle = o.color || C.ink;
    g.direction = AR.test(str) ? 'rtl' : 'ltr';
    g.textAlign = o.align || 'right';
    g.fillText(str, x, y);
  }
  function measure(g, str, size, weight) { setFont(g, size, weight || 600); g.direction = AR.test(str) ? 'rtl' : 'ltr'; return g.measureText(str).width; }
  function wrap(g, str, maxW, size, weight) {
    const out = [];
    String(str == null ? '' : str).split(/\r?\n/).forEach((para) => {
      if (!para.trim()) { out.push(''); return; }
      let line = '';
      para.split(/\s+/).forEach((w) => {
        const t = line ? line + ' ' + w : w;
        if (line && measure(g, t, size, weight) > maxW) { out.push(line); line = w; } else line = t;
      });
      if (line) out.push(line);
    });
    return out;
  }
  function para(g, str, xr, y, w, o) {            // returns the y after the paragraph
    o = o || {};
    const size = o.size || 14, lh = o.lh || size * 1.65;
    wrap(g, str, w, size, o.weight).forEach((l) => { y += lh; text(g, l, xr, y - lh * 0.28, { size, weight: o.weight, color: o.color, align: o.align }); });
    return y;
  }
  function paraH(g, str, w, o) { o = o || {}; const size = o.size || 14; return wrap(g, str, w, size, o.weight).length * (o.lh || size * 1.65); }
  function rr(g, x, y, w, h, r, fill, stroke, lw) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); }
  }
  function chips(g, list, xr, y, w, o) {          // pills from right to left, returns y after
    o = o || {};
    let x = xr, rowY = y; const h = 26, gap = 8;
    list.forEach((t) => {
      const tw = measure(g, t, 12, 700) + 22;
      if (x - tw < xr - w) { x = xr; rowY += h + gap; }
      rr(g, x - tw, rowY, tw, h, 13, o.fill || C.soft, o.stroke || C.line);
      text(g, t, x - tw / 2, rowY + 18, { size: 12, weight: 700, color: o.color || C.blue, align: 'center' });
      x -= tw + gap;
    });
    return list.length ? rowY + h : y;
  }
  function chipsH(g, list, w) {
    let x = 0, rows = list.length ? 1 : 0;
    list.forEach((t) => { const tw = measure(g, t, 12, 700) + 22; if (x + tw > w && x > 0) { rows++; x = 0; } x += tw + 8; });
    return rows ? rows * 26 + (rows - 1) * 8 : 0;
  }
  function flower(g, cx, cy, r, o) {               // the logo: white tips, orange-red heart
    o = o || {};
    for (let i = 0; i < 5; i++) {
      g.save(); g.translate(cx, cy); g.rotate((i / 5) * Math.PI * 2 - Math.PI / 2);
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(r * .55, -r * .15, r * .5, -r * 1.0, 0, -r); g.bezierCurveTo(-r * .5, -r * 1.0, -r * .55, -r * .15, 0, 0); g.closePath();
      g.fillStyle = o.petal || '#fff'; g.fill();
      if (o.edge) { g.strokeStyle = o.edge; g.lineWidth = Math.max(1, r * .06); g.stroke(); }
      g.restore();
    }
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r * .32);
    grd.addColorStop(0, o.heart1 || '#ffb000'); grd.addColorStop(1, o.heart2 || '#ff4b1f');
    g.beginPath(); g.arc(cx, cy, r * .3, 0, 7); g.fillStyle = grd; g.fill();
  }
  function bar(g, xr, y, w, v, max, color) {       // progress bar, filling from the right
    rr(g, xr - w, y, w, 9, 4.5, '#e8edf8');
    const f = Math.max(0, Math.min(1, v / max)) * w;
    if (f > 0) rr(g, xr - f, y, f, 9, 4.5, color);
  }
  const scoreColor = (p) => (p >= 80 ? C.ok : p >= 60 ? C.blue2 : p >= 40 ? C.warn : C.bad);

  /* ---------- pages ---------- */
  function Doc(brand, title, subtitle, metaRight) {
    this.pages = []; this.brand = brand; this.title = title; this.subtitle = subtitle; this.metaRight = metaRight || [];
    this.newPage();
  }
  Doc.prototype.newPage = function () {
    const c = document.createElement('canvas'); c.width = W * S; c.height = H * S;
    const g = c.getContext('2d'); g.scale(S, S); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    this.pages.push(c); this.g = g;
    const b = this.brand;
    // header band
    const grd = g.createLinearGradient(0, 0, W, 0); grd.addColorStop(0, '#0a2166'); grd.addColorStop(1, '#1a47c9');
    g.fillStyle = grd; g.fillRect(0, 0, W, 112);
    g.fillStyle = 'rgba(255,229,0,.9)'; g.fillRect(0, 112, W, 4);
    flower(g, XR - 26, 46, 26, { edge: 'rgba(11,42,120,.25)' });
    text(g, 'يسمينا', XR - 66, 56, { size: 34, weight: 900, color: C.yellow });
    text(g, 'Yasmina · English for kids', XR - 66, 80, { size: 12, weight: 600, color: 'rgba(255,255,255,.85)' });
    const info = [b.teacher ? 'المعلمة ' + b.teacher : '', b.place, b.whatsapp ? 'واتساب: +' + b.whatsapp : '', b.host].filter(Boolean);
    info.forEach((t, i) => text(g, t, MX, 34 + i * 19, { size: 12, weight: 600, color: 'rgba(255,255,255,.92)', align: 'left' }));
    if (this.pages.length === 1) {
      text(g, this.title, XR, 154, { size: 26, weight: 900, color: C.blue });
      if (this.subtitle) text(g, this.subtitle, XR, 176, { size: 13, weight: 600, color: C.muted });
      this.metaRight.forEach((m, i) => {
        text(g, m[0], MX + 150, 150 + i * 20, { size: 11, weight: 600, color: C.muted, align: 'left' });
        text(g, m[1], MX, 150 + i * 20, { size: 13, weight: 800, color: C.ink, align: 'left' });
      });
      this.y = this.metaRight.length > 2 ? 214 : 198;
    } else this.y = 140;
  };
  Doc.prototype.need = function (h) { if (this.y + h > H - 70) this.newPage(); };
  Doc.prototype.section = function (label) {
    this.need(60);
    const g = this.g; this.y += 10;
    rr(g, XR - 6, this.y, 6, 20, 3, C.yellow);
    text(g, label, XR - 16, this.y + 16, { size: 16, weight: 900, color: C.blue });
    g.fillStyle = C.line; g.fillRect(MX, this.y + 25, CW, 1);
    this.y += 38;
  };
  Doc.prototype.finish = function () {
    const n = this.pages.length;
    this.pages.forEach((c, i) => {
      const g = c.getContext('2d');
      g.fillStyle = C.line; g.fillRect(MX, H - 50, CW, 1);
      text(g, 'يسمينا · حصص إنجليزية مباشرة للأطفال', XR, H - 28, { size: 11, weight: 600, color: C.muted });
      text(g, 'صفحة ' + (i + 1) + ' من ' + n, MX, H - 28, { size: 11, weight: 600, color: C.muted, align: 'left' });
      if (this.brand.host) text(g, this.brand.host, W / 2, H - 28, { size: 10, weight: 600, color: C.muted, align: 'center' });
    });
    return this.pages;
  };

  /* ---------- progress report ---------- */
  const SKILLS = [['listening', 'الاستماع'], ['speaking', 'التحدث'], ['reading', 'القراءة'], ['writing', 'الكتابة'], ['vocab', 'المفردات'], ['pronunciation', 'النطق'], ['grammar', 'التراكيب'], ['comprehension', 'الفهم']];
  const BEHAV = [['participation', 'المشاركة'], ['focus', 'التركيز'], ['confidence', 'الثقة بالنفس'], ['effort', 'الاجتهاد']];
  function avg(obj, keys) { const v = keys.map((k) => Number(obj && obj[k]) || 0).filter((x) => x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; }
  function reportScore(d) { const a = avg(d.skills, SKILLS.map((s) => s[0])); return a ? Math.round((a / 5) * 100) : 0; }
  function verdict(p) { return p >= 90 ? 'ممتاز' : p >= 76 ? 'جيد جدًا' : p >= 60 ? 'جيد' : p > 0 ? 'يحتاج إلى دعم' : 'غير مُقيَّم'; }

  function gauge(g, cx, cy, r, pct, col) {
    g.lineCap = 'round'; g.lineWidth = 12;
    g.strokeStyle = '#e8edf8'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = col; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * pct) / 100, false); g.stroke();
    text(g, pct + '%', cx, cy + 9, { size: 28, weight: 900, color: col, align: 'center' });
  }

  function trend(g, xr, y, w, h, pts) {
    const x0 = xr - w, mid = y + h;
    g.strokeStyle = C.line; g.lineWidth = 1;
    [0, 50, 100].forEach((v) => { const yy = mid - (v / 100) * (h - 14); g.beginPath(); g.moveTo(x0 + 26, yy); g.lineTo(xr, yy); g.stroke(); text(g, String(v), x0 + 20, yy + 4, { size: 9, weight: 600, color: C.muted, align: 'right' }); });
    const step = (w - 50) / Math.max(1, pts.length - 1);
    const px = (i) => xr - 10 - (pts.length === 1 ? (w - 50) / 2 : i * step);
    const py = (v) => mid - (v / 100) * (h - 14);
    // pts are oldest -> newest, drawn right to left so time reads in the Arabic direction
    g.strokeStyle = C.blue2; g.lineWidth = 2.5; g.lineJoin = 'round'; g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(px(i), py(p.v)) : g.moveTo(px(i), py(p.v)))); g.stroke();
    pts.forEach((p, i) => {
      g.beginPath(); g.arc(px(i), py(p.v), i === pts.length - 1 ? 6 : 4, 0, 7); g.fillStyle = i === pts.length - 1 ? C.yellow : '#fff'; g.fill(); g.strokeStyle = C.blue2; g.lineWidth = 2; g.stroke();
      text(g, p.v + '%', px(i), py(p.v) - 10, { size: 10, weight: 800, color: C.blue, align: 'center' });
      text(g, p.d, px(i), mid + 14, { size: 9, weight: 600, color: C.muted, align: 'center' });
    });
  }

  function renderReport(d, history, brand) {
    const pct = reportScore(d);
    const doc = new Doc(brand, 'تقرير تقدّم الطالب', 'ملخص الحصة ومستوى الطالب وخطة المتابعة',
      [['رقم التقرير', d.code || '—'], ['تاريخ الحصة', d.date || '—']]);
    let g = doc.g;
    // student card
    const cardH = 96; rr(g, MX, doc.y, CW, cardH, 18, C.soft, C.line);
    const cells = [['الطالب', d.student], ['الصف / العمر', [d.grade, d.age ? d.age + ' سنوات' : ''].filter(Boolean).join(' · ')], ['ولي الأمر', d.parent],
      ['الموضوع', d.topic], ['رقم الحصة / المدة', [d.sessionNo ? 'الحصة ' + d.sessionNo : '', d.duration ? d.duration + ' دقيقة' : ''].filter(Boolean).join(' · ')], ['الحضور', d.attendance]];
    const cw = CW / 3;
    cells.forEach((c, i) => {
      const col = i % 3, row = Math.floor(i / 3), x = XR - 14 - col * cw, yy = doc.y + 26 + row * 44;
      text(g, c[0], x, yy, { size: 11, weight: 600, color: C.muted });
      const v = String(c[1] || '—'); text(g, v.length > 26 ? v.slice(0, 25) + '…' : v, x, yy + 18, { size: 14, weight: 800, color: C.ink });
    });
    doc.y += cardH + 14;

    // overall
    const oh = 132; rr(g, MX, doc.y, CW, oh, 18, '#fff', C.line, 1.5);
    gauge(g, XR - 70, doc.y + 66, 42, pct, scoreColor(pct));
    text(g, 'التقييم العام', XR - 150, doc.y + 40, { size: 12, weight: 700, color: C.muted });
    text(g, verdict(pct), XR - 150, doc.y + 68, { size: 22, weight: 900, color: scoreColor(pct) });
    text(g, 'متوسط مهارات الحصة', XR - 150, doc.y + 88, { size: 12, weight: 600, color: C.muted });
    const facts = [['المستوى الحالي', d.level], ['التقدّم', d.progress], ['الواجب المنزلي', d.homeworkStatus], ['نتيجة الاختبار القصير', d.score !== '' && d.score != null ? d.score + ' / 10' : '']];
    facts.forEach((f, i) => {
      const col = i % 2, row = Math.floor(i / 2), x = XR - 250 - col * 230, yy = doc.y + 34 + row * 52;
      text(g, f[0], x, yy, { size: 11, weight: 600, color: C.muted });
      text(g, f[1] || '—', x, yy + 20, { size: 15, weight: 800, color: C.blue });
    });
    doc.y += oh + 8;

    // skills
    doc.section('مهارات الحصة (من 5)');
    g = doc.g;
    const colW = (CW - 30) / 2;
    SKILLS.forEach((s, i) => {
      const col = i % 2, row = Math.floor(i / 2), xr = XR - col * (colW + 30), yy = doc.y + row * 34, v = Number(d.skills && d.skills[s[0]]) || 0;
      text(g, s[1], xr, yy + 12, { size: 13, weight: 700 });
      if (v) { bar(g, xr - 78, yy + 3, colW - 130, v, 5, scoreColor(v * 20)); text(g, v + '/5', xr - colW + 30, yy + 12, { size: 12, weight: 800, color: C.blue, align: 'left' }); }
      else text(g, 'لم تُقيَّم', xr - 78, yy + 12, { size: 11, weight: 600, color: C.muted });
    });
    doc.y += Math.ceil(SKILLS.length / 2) * 34 + 6;

    // behaviour
    doc.section('السلوك والتفاعل');
    g = doc.g;
    BEHAV.forEach((s, i) => {
      const x = XR - i * (CW / 4), v = Number(d.behavior && d.behavior[s[0]]) || 0;
      text(g, s[1], x, doc.y + 12, { size: 12, weight: 700, color: C.muted });
      for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x - 8 - k * 16, doc.y + 30, 6, 0, 7); g.fillStyle = k < v ? C.yellow : '#e8edf8'; g.fill(); if (k < v) { g.strokeStyle = '#e0b800'; g.lineWidth = 1; g.stroke(); } }
    });
    doc.y += 52;

    // trend
    const pts = (history || []).slice(-6).map((h) => ({ v: h.v, d: h.d })).concat([{ v: pct, d: d.date ? d.date.slice(5) : 'الآن' }]);
    if (pts.length >= 2 && pct) {
      doc.need(180); doc.section('تطوّر المستوى عبر الحصص'); trend(doc.g, XR, doc.y + 6, CW, 120, pts); doc.y += 150; g = doc.g;
    }

    // learned
    const learned = [];
    if (d.objectives) learned.push(['أهداف الحصة', d.objectives]);
    if (d.newWords) learned.push(['كلمات وحروف جديدة', d.newWords]);
    if (d.mastered) learned.push(['ما أتقنه الطالب', d.mastered]);
    if (learned.length) {
      doc.section('ماذا تعلّم الطالب؟');
      learned.forEach((l) => { const h = 22 + paraH(doc.g, l[1], CW - 24); doc.need(h + 8); const gg = doc.g; text(gg, l[0], XR, doc.y + 14, { size: 12, weight: 800, color: C.blue }); doc.y = para(gg, l[1], XR, doc.y + 18, CW, { size: 13 }) + 6; });
    }

    // strengths / improve
    const sn = d.strengths || [], im = d.improve || [];
    if (sn.length || im.length || d.strengthsNote || d.improveNote) {
      const hw = (CW - 24) / 2;
      const hS = 30 + chipsH(doc.g, sn, hw) + (d.strengthsNote ? paraH(doc.g, d.strengthsNote, hw, { size: 12.5 }) + 8 : 0);
      const hI = 30 + chipsH(doc.g, im, hw) + (d.improveNote ? paraH(doc.g, d.improveNote, hw, { size: 12.5 }) + 8 : 0);
      doc.need(Math.max(hS, hI) + 20); g = doc.g;
      const top = doc.y + 4;
      text(g, 'نقاط القوة', XR, top + 14, { size: 15, weight: 900, color: C.ok });
      text(g, 'مجالات التطوير', XR - hw - 24, top + 14, { size: 15, weight: 900, color: C.warn });
      let a = chips(g, sn, XR, top + 26, hw, { fill: '#eaf8f0', stroke: '#bfe6cf', color: '#15703d' });
      if (d.strengthsNote) a = para(g, d.strengthsNote, XR, a + 6, hw, { size: 12.5 });
      let b = chips(g, im, XR - hw - 24, top + 26, hw, { fill: '#fff4e0', stroke: '#f3d9a6', color: '#9a5a00' });
      if (d.improveNote) b = para(g, d.improveNote, XR - hw - 24, b + 6, hw, { size: 12.5 });
      doc.y = Math.max(a, b, top + 40) + 12;
    }

    // plan
    const plan = [];
    if (d.homework) plan.push(['الواجب المنزلي', d.homework]);
    if (d.nextPlan) plan.push(['خطة الحصة القادمة', d.nextPlan]);
    if (plan.length) {
      doc.section('الواجب والخطة القادمة');
      plan.forEach((l) => { const h = 22 + paraH(doc.g, l[1], CW - 24); doc.need(h + 8); const gg = doc.g; text(gg, l[0], XR, doc.y + 14, { size: 12, weight: 800, color: C.blue }); doc.y = para(gg, l[1], XR, doc.y + 18, CW, { size: 13 }) + 6; });
    }
    const tips = d.parentTips || [];
    if (tips.length || d.parentNote) {
      const h = 70 + chipsH(doc.g, tips, CW - 28) + (d.parentNote ? paraH(doc.g, d.parentNote, CW - 28, { size: 13 }) + 8 : 0);
      doc.need(h + 10); g = doc.g;
      rr(g, MX, doc.y + 6, CW, h, 18, C.cream, '#f0dc6a');
      text(g, 'توصيات لولي الأمر', XR - 16, doc.y + 34, { size: 15, weight: 900, color: C.blue });
      let y2 = chips(g, tips, XR - 16, doc.y + 46, CW - 32, { fill: '#fff', stroke: '#e9d56a', color: '#6b5a00' });
      if (d.parentNote) y2 = para(g, d.parentNote, XR - 16, y2 + 6, CW - 32, { size: 13 });
      doc.y += h + 16;
    }

    // signature
    doc.need(80); g = doc.g;
    g.strokeStyle = C.line; g.lineWidth = 1; g.beginPath(); g.moveTo(XR - 190, doc.y + 40); g.lineTo(XR, doc.y + 40); g.stroke();
    text(g, 'المعلمة ' + (brand.teacher || ''), XR, doc.y + 60, { size: 14, weight: 800, color: C.blue });
    text(g, d.date ? 'بتاريخ ' + d.date : '', XR, doc.y + 78, { size: 11, weight: 600, color: C.muted });
    text(g, 'نشكركم على ثقتكم، ونسعد بمتابعة تقدّم طفلكم.', MX, doc.y + 50, { size: 12, weight: 600, color: C.muted, align: 'left' });
    doc.y += 90;
    return doc.finish();
  }

  /* ---------- invoice ---------- */
  function invoiceTotals(d) {
    const items = (d.items || []).map((it) => { const q = Number(it.qty) || 0, p = Number(it.price) || 0; return { desc: it.desc || '', qty: q, price: p, total: Math.round(q * p * 100) / 100 }; });
    const sub = items.reduce((s, i) => s + i.total, 0);
    const dv = Number(d.discount) || 0;
    const disc = Math.min(sub, d.discountType === 'pct' ? (sub * dv) / 100 : dv);
    const taxable = sub - disc, tax = (taxable * (Number(d.taxPct) || 0)) / 100;
    const total = Math.round((taxable + tax) * 100) / 100;
    const paid = d.status === 'paid' && !(Number(d.paid) > 0) ? total : Math.min(total, Number(d.paid) || 0);
    return { items, sub, disc: Math.round(disc * 100) / 100, tax: Math.round(tax * 100) / 100, total, paid, balance: Math.round((total - paid) * 100) / 100 };
  }
  const money = (n, cur) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + (cur || '');

  /* a light round ink stamp: rings, arc text, flower and details, with worn ink */
  function stampCanvas(brand, size) {
    const c = document.createElement('canvas'); c.width = c.height = size * S;
    const g = c.getContext('2d'); g.scale(S, S);
    const R = size / 2, ink = '#1b3fa6';
    g.translate(R, R);
    g.strokeStyle = ink; g.fillStyle = ink;
    g.lineWidth = 3.2; g.beginPath(); g.arc(0, 0, R - 3, 0, 7); g.stroke();
    g.lineWidth = 1.1; g.beginPath(); g.arc(0, 0, R - 8.5, 0, 7); g.stroke();
    g.lineWidth = 1.4; g.beginPath(); g.arc(0, 0, R * .6, 0, 7); g.stroke();
    // text on an arc: top reads clockwise, bottom reads left to right (upright)
    function arcText(str, radius, bottom, sz) {
      setFont(g, sz, 800); g.direction = 'ltr'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      const chars = [...str], ws = chars.map((ch) => g.measureText(ch).width + sz * 0.16), total = ws.reduce((x, y) => x + y, 0) / radius;
      let a = -total / 2;
      chars.forEach((ch, i) => {
        const mid = a + ws[i] / radius / 2, th = bottom ? Math.PI / 2 - mid : -Math.PI / 2 + mid;
        g.save(); g.translate(Math.cos(th) * radius, Math.sin(th) * radius); g.rotate(bottom ? th - Math.PI / 2 : th + Math.PI / 2); g.fillText(ch, 0, 0); g.restore();
        a += ws[i] / radius;
      });
    }
    const f1 = size * 0.066;
    arcText('YASMINA  ·  ENGLISH FOR KIDS', R * 0.76, false, f1);
    arcText('ALEXANDRIA  ·  AL-BITASH', R * 0.76 + f1 * 0.62, true, f1 * 0.92);
    [0, Math.PI].forEach((th) => { g.save(); g.translate(Math.cos(th) * R * 0.79, Math.sin(th) * R * 0.79); g.rotate(th); g.beginPath(); for (let k = 0; k < 5; k++) { const a1 = (k / 5) * 6.283 - 1.57, a2 = a1 + 3.14 / 5; g.lineTo(Math.cos(a1) * 5, Math.sin(a1) * 5); g.lineTo(Math.cos(a2) * 2.2, Math.sin(a2) * 2.2); } g.closePath(); g.fill(); g.restore(); });
    flower(g, 0, -R * .33, R * .15, { petal: ink, heart1: ink, heart2: ink });
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(0, -R * .33, R * .05, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over';
    g.textBaseline = 'alphabetic'; g.fillStyle = ink; g.direction = 'rtl'; g.textAlign = 'center';
    setFont(g, size * .105, 900); g.fillText('ياسمينا', 0, R * .1);
    setFont(g, size * .054, 700); g.fillText('معلمة لغة إنجليزية', 0, R * .27);
    g.fillRect(-R * .26, R * .33, R * .52, 1.2);
    setFont(g, size * .05, 700); g.fillText(brand.placeShort || 'الإسكندرية · البيطاش', 0, R * .47);
    // worn ink: uneven alpha and speckles
    g.globalCompositeOperation = 'destination-out';
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 900; i++) { const a = rnd() * 6.283, r = Math.sqrt(rnd()) * R; g.globalAlpha = .15 + rnd() * .55; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, .4 + rnd() * 1.5, 0, 7); g.fill(); }
    for (let i = 0; i < 14; i++) { const a = rnd() * 6.283, r = R * (.35 + rnd() * .62); g.globalAlpha = .12 + rnd() * .2; g.beginPath(); g.ellipse(Math.cos(a) * r, Math.sin(a) * r, 6 + rnd() * 16, 2 + rnd() * 6, rnd() * 3, 0, 7); g.fill(); }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    return c;
  }

  function renderInvoice(d, brand) {
    const T = invoiceTotals(d), cur = d.currency || '';
    const statusMap = { paid: ['مدفوعة', C.ok], partial: ['مدفوعة جزئيًا', C.warn], unpaid: ['غير مدفوعة', C.bad] };
    const st = statusMap[d.status] || statusMap.unpaid;
    const doc = new Doc(brand, 'فاتورة', 'Invoice', [['رقم الفاتورة', d.number || '—'], ['تاريخ الإصدار', d.date || '—'], ['تاريخ الاستحقاق', d.due || '—']]);
    let g = doc.g;
    // status chip
    rr(g, XR - 110, doc.y - 20, 110, 28, 14, st[1]); text(g, st[0], XR - 55, doc.y - 1, { size: 13, weight: 800, color: '#fff', align: 'center' });
    doc.y += 22;
    // parties
    const bw = (CW - 20) / 2, bh = 112;
    [['من', [brand.teacher ? 'المعلمة ' + brand.teacher : 'يسمينا', brand.place, brand.whatsapp ? 'واتساب: +' + brand.whatsapp : '', brand.email || '']], ['فاتورة إلى', [d.billName, d.billChild ? 'الطالب: ' + d.billChild : '', d.billPhone ? 'الهاتف: ' + d.billPhone : '', d.billEmail || '']]].forEach((b, i) => {
      const x = XR - i * (bw + 20);
      rr(g, x - bw, doc.y, bw, bh, 16, C.soft, C.line);
      text(g, b[0], x - 14, doc.y + 24, { size: 11, weight: 800, color: C.muted });
      b[1].filter(Boolean).forEach((t, k) => text(g, t, x - 14, doc.y + 48 + k * 20, { size: k ? 12.5 : 15, weight: k ? 600 : 800, color: k ? C.ink : C.blue }));
    });
    doc.y += bh + 18;
    // items table
    const cols = { n: XR - 12, desc: XR - 40, qty: XR - 380, price: XR - 470, tot: MX + 14 };
    const head = () => { rr(doc.g, MX, doc.y, CW, 32, 10, C.blue); const gg = doc.g; text(gg, '#', cols.n, doc.y + 21, { size: 12, weight: 800, color: '#fff' }); text(gg, 'الوصف', cols.desc, doc.y + 21, { size: 12, weight: 800, color: '#fff' }); text(gg, 'الكمية', cols.qty, doc.y + 21, { size: 12, weight: 800, color: '#fff', align: 'center' }); text(gg, 'السعر', cols.price, doc.y + 21, { size: 12, weight: 800, color: '#fff', align: 'center' }); text(gg, 'الإجمالي', cols.tot, doc.y + 21, { size: 12, weight: 800, color: '#fff', align: 'left' }); doc.y += 32; };
    head();
    T.items.forEach((it, i) => {
      const lines = wrap(doc.g, it.desc, 300, 13, 600), rh = Math.max(36, lines.length * 20 + 14);
      if (doc.y + rh > H - 220) { doc.newPage(); head(); }
      g = doc.g;
      if (i % 2) { g.fillStyle = '#f8faff'; g.fillRect(MX, doc.y, CW, rh); }
      g.fillStyle = C.line; g.fillRect(MX, doc.y + rh - 1, CW, 1);
      text(g, String(i + 1), cols.n, doc.y + 23, { size: 12, weight: 700, color: C.muted });
      lines.forEach((l, k) => text(g, l, cols.desc, doc.y + 23 + k * 20, { size: 13, weight: 700 }));
      text(g, String(it.qty), cols.qty, doc.y + 23, { size: 13, weight: 700, align: 'center' });
      text(g, money(it.price, ''), cols.price, doc.y + 23, { size: 13, weight: 700, align: 'center' });
      text(g, money(it.total, cur), cols.tot, doc.y + 23, { size: 13, weight: 800, align: 'left' });
      doc.y += rh;
    });
    doc.y += 14;
    // totals
    doc.need(210); g = doc.g;
    const rows = [['المجموع', money(T.sub, cur)]];
    if (T.disc) rows.push(['الخصم' + (d.discountType === 'pct' ? ' (' + (Number(d.discount) || 0) + '%)' : ''), '- ' + money(T.disc, cur)]);
    if (T.tax) rows.push(['الضريبة (' + (Number(d.taxPct) || 0) + '%)', money(T.tax, cur)]);
    rows.push(['الإجمالي المستحق', money(T.total, cur)]);
    if (T.paid) rows.push(['المدفوع', money(T.paid, cur)]);
    const tw = 270, top = doc.y;
    // payment info left
    text(g, 'طريقة الدفع', MX + 230, top + 16, { size: 11, weight: 700, color: C.muted, align: 'left' });
    text(g, d.method || '—', MX + 230, top + 38, { size: 14, weight: 800, align: 'left' });
    rows.forEach((r, i) => {
      const last = i === rows.length - 1 && !T.paid, yy = top + i * 30;
      if (r[0] === 'الإجمالي المستحق') { rr(g, XR - tw, yy, tw, 34, 10, C.yellow); text(g, r[0], XR - 14, yy + 23, { size: 14, weight: 900, color: C.blue }); text(g, r[1], XR - tw + 14, yy + 23, { size: 15, weight: 900, color: C.blue, align: 'left' }); }
      else { text(g, r[0], XR - 14, yy + 22, { size: 13, weight: 600, color: C.muted }); text(g, r[1], XR - tw + 14, yy + 22, { size: 13, weight: 800, align: 'left' }); }
      if (r[0] === 'الإجمالي المستحق') { rows.__t = yy; }
    });
    let ty = top + rows.length * 30 + 6;
    const bal = rr(g, XR - tw, ty, tw, 40, 12, T.balance > 0 ? '#fdecec' : '#eaf8f0', T.balance > 0 ? '#f3b9b9' : '#bfe6cf');
    text(g, T.balance > 0 ? 'المتبقي' : 'لا يوجد مبلغ متبقٍ', XR - 14, ty + 26, { size: 14, weight: 900, color: T.balance > 0 ? C.bad : C.ok });
    if (T.balance > 0) text(g, money(T.balance, cur), XR - tw + 14, ty + 26, { size: 16, weight: 900, color: C.bad, align: 'left' });
    doc.y = Math.max(ty + 56, top + 110);

    // notes
    const notes = [d.notes && ['ملاحظات', d.notes], d.terms && ['الشروط والأحكام', d.terms]].filter(Boolean);
    notes.forEach((n) => { const h = 24 + paraH(doc.g, n[1], CW, { size: 12.5 }); doc.need(h + 10); text(doc.g, n[0], XR, doc.y + 14, { size: 12, weight: 800, color: C.blue }); doc.y = para(doc.g, n[1], XR, doc.y + 18, CW, { size: 12.5, color: C.muted }) + 8; });

    // signature + stamp
    doc.need(150); g = doc.g;
    const sy = doc.y + 36;
    g.strokeStyle = C.line; g.lineWidth = 1; g.beginPath(); g.moveTo(XR - 190, sy + 70); g.lineTo(XR, sy + 70); g.stroke();
    text(g, 'توقيع المعلمة', XR, sy + 90, { size: 12, weight: 700, color: C.muted });
    text(g, 'شكرًا لثقتكم بيسمينا', MX, sy + 70, { size: 13, weight: 700, color: C.blue, align: 'left' });
    if (d.stamp !== false) {
      const sc = stampCanvas(brand, 160);
      g.save(); g.translate(XR - 96, sy + 46); g.rotate(-0.2); g.globalAlpha = .6; g.globalCompositeOperation = 'multiply';
      g.drawImage(sc, -80, -80, 160, 160); g.restore();
    }
    doc.y = sy + 110;
    return doc.finish();
  }

  /* ---------- PDF writer (JPEG pages) ---------- */
  function toPdf(canvases) {
    const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
    const push = (u8) => { parts.push(u8); len += u8.length; };
    const str = (s) => push(enc.encode(s));
    const PW = 595.28, PH = 841.89, n = canvases.length;
    str('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const begin = (id) => { offs[id] = len; str(id + ' 0 obj\n'); };
    begin(1); str('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    begin(2); str('<< /Type /Pages /Count ' + n + ' /Kids [' + canvases.map((_, i) => 3 + i * 3 + ' 0 R').join(' ') + '] >>\nendobj\n');
    canvases.forEach((c, i) => {
      const p = 3 + i * 3, ct = p + 1, im = p + 2;
      const b64 = c.toDataURL('image/jpeg', 0.93).split(',')[1], bin = atob(b64), jpg = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) jpg[k] = bin.charCodeAt(k);
      begin(p); str('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /XObject << /Im0 ' + im + ' 0 R >> >> /Contents ' + ct + ' 0 R >>\nendobj\n');
      const content = 'q ' + PW + ' 0 0 ' + PH + ' 0 0 cm /Im0 Do Q';
      begin(ct); str('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream\nendobj\n');
      begin(im); str('<< /Type /XObject /Subtype /Image /Width ' + c.width + ' /Height ' + c.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n');
      push(jpg); str('\nendstream\nendobj\n');
    });
    const total = 3 + n * 3, xref = len;
    str('xref\n0 ' + total + '\n0000000000 65535 f \n');
    for (let i = 1; i < total; i++) str(String(offs[i]).padStart(10, '0') + ' 00000 n \n');
    str('trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF');
    return new Blob(parts, { type: 'application/pdf' });
  }

  window.YSDocs = {
    SKILLS, BEHAV, reportScore, verdict, invoiceTotals, money,
    ready: () => Promise.all(['400', '700', '900'].map((w) => document.fonts.load(w + ' 16px Cairo', 'ياسمينا')).concat([document.fonts.ready])).catch(() => {}),
    report: renderReport, invoice: renderInvoice, toPdf, stamp: stampCanvas,
  };
})();
