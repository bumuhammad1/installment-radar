'use strict';

// ========== المتغيرات العامة ==========
let persons   = [];
let activeTab = 'all';
let searchQ   = '';
let activeSort= 'newest';
let ctx       = {};
let openDetails = new Set();

// ========== لوحة الألوان للتمييز البصري ==========
const PALETTE = ['#2563EB','#7C3AED','#059669','#D97706','#DB2777','#0891B2','#DC2626'];

// ========== أسماء الشهور بالعربية ==========
const MN = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

// ========== دوال التنسيق ==========
const fmtMoney = n => Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' ر.ق';
const fmtNum   = n => Number(n||0).toLocaleString('en-US');
const fmtPct   = n => Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) + '%';
const fmtDate  = s => { if(!s) return '—'; const d=new Date(s); return `${d.getDate()} ${MN[d.getMonth()]} ${d.getFullYear()}`; };

// ========== حساب مدة العقد بين تاريخين ==========
function durationLabel(from, to) {
  if(!from||!to) return '—';
  const a=new Date(from), b=new Date(to);
  if(b<=a) return '—';
  let years=b.getFullYear()-a.getFullYear(), months=b.getMonth()-a.getMonth(), days=b.getDate()-a.getDate();
  if(days<0){months--;const prev=new Date(b.getFullYear(),b.getMonth(),0);days+=prev.getDate();}
  if(months<0){years--;months+=12;}
  const parts=[];
  if(years>0)  parts.push(years+' سنة');
  if(months>0) parts.push(months+' شهر');
  if(days>0)   parts.push(days+' يوم');
  return parts.join(' و') || '—';
}

// ========== حساب عدد الشهور بين تاريخين ==========
function monthsBetween(from, to) {
  if(!from||!to) return 12;
  const a=new Date(from), b=new Date(to);
  return Math.max(1,(b.getFullYear()-a.getFullYear())*12+b.getMonth()-a.getMonth());
}

// ========== دوال مساعدة للصفقات ==========
const genId  = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2,9)+Date.now().toString(36);
const dTotal = d => (Number(d.devicePrice)+Number(d.profit)) * Number(d.deviceCount||1);
const dPaid  = d => (d.payments||[]).reduce((s,p)=>s+p.amount,0);
const isDone = d => dPaid(d) >= dTotal(d);
const isFullyDone = d => isDone(d) && d.dateTo && new Date() >= new Date(d.dateTo);
function findDealById(id) {
  for (let p of persons) {
    const deal = (p.deals||[]).find(d => d.id === id);
    if (deal) return deal;
  }
  return null;
}

// ========== حساب أيام التأخير ==========
function daysLate(d) {
  if(!d.dateTo) return 0;
  if(isDone(d)) return 0;
  const diff=Math.floor((new Date().setHours(0,0,0,0)-new Date(d.dateTo))/86400000);
  return diff>0?diff:0;
}

// ========== دالة عرض الإشعارات المنبثقة ==========
function showToast(msg, type = 'success', duration = 3000, customEmoji = null) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = {
    success: { icon: 'fa-solid fa-circle-check', emoji: '<i class="fa-solid fa-upload"></i>' },
    error:   { icon: 'fa-solid fa-circle-xmark', emoji: '<i class="fa-solid fa-user-xmark"></i>' },
    info:    { icon: 'fa-solid fa-circle-info',  emoji: '<i class="fa-solid fa-cloud"></i>' },
  };

  const { icon, emoji } = icons[type] || icons.info;
  const finalEmoji = customEmoji || emoji;

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `
    <div class="toast-top-row">
      <span class="toast-icon"><i class="${icon}"></i></span>
      <span class="toast-text">${msg}</span>
      <button class="toast-close-btn"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="toast-emoji">${finalEmoji}</div>
  `;

  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));

  const remove = () => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  };

  const timer = setTimeout(remove, duration);
  el.querySelector('.toast-close-btn').onclick = () => {
    clearTimeout(timer);
    remove();
  };
}

// ========== مودال التأكيد ==========
function showConfirm(msg, sub, onConfirm) {
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmSub').textContent = sub || 'هذا الإجراء لا يمكن التراجع عنه';
  const btn = document.getElementById('confirmBtn');
  btn.onclick = () => { closeModal('modalConfirm'); onConfirm(); };
  openModal('modalConfirm');
}

// ========== دوال فتح وإغلاق النوافذ المنبثقة ==========
const openModal  = id => document.getElementById(id).classList.add('open');
const closeModal = id => document.getElementById(id).classList.remove('open');

document.querySelectorAll('.modal-overlay').forEach(el =>
  el.addEventListener('click', e => { if(e.target===el) el.classList.remove('open'); }));

// ========== دوال الترتيب ==========
function setSort(s) {
  activeSort = s;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort===s));
  render();
}

function sortDeals(deals) {
  const arr = [...deals];
  if(activeSort === 'newest')    return arr.sort((a,b)=>new Date(b.dateFrom||0)-new Date(a.dateFrom||0));
  if(activeSort === 'oldest')    return arr.sort((a,b)=>new Date(a.dateFrom||0)-new Date(b.dateFrom||0));
  if(activeSort === 'late')      return arr.sort((a,b)=>daysLate(b)-daysLate(a));
  if(activeSort === 'remaining') return arr.sort((a,b)=>(dTotal(b)-dPaid(b))-(dTotal(a)-dPaid(a)));
  if(activeSort === 'progress')  return arr.sort((a,b)=>{
    const pa=dTotal(a)>0?dPaid(a)/dTotal(a):0;
    const pb=dTotal(b)>0?dPaid(b)/dTotal(b):0;
    return pb-pa;
  });
  return arr;
}

// ========== دوال إدارة الأشخاص ==========
function openAddPerson() {
  ctx = { personMode: 'add' };
  document.getElementById('personModalTitle').innerHTML = '<i class="fa-solid fa-user-plus"></i> إضافة شخص جديد';
  document.getElementById('newPersonName').value = '';
  openModal('modalPerson');
  setTimeout(()=>document.getElementById('newPersonName').focus(),80);
}

function openEditPerson(pid) {
  const p = persons.find(x=>x.id===pid);
  ctx = { personMode: 'edit', pid };
  document.getElementById('personModalTitle').innerHTML = '<i class="fa-solid fa-user-pen"></i> تعديل اسم الشخص';
  document.getElementById('newPersonName').value = p.name;
  openModal('modalPerson');
  setTimeout(()=>document.getElementById('newPersonName').focus(),80);
}

function savePersonModal() {
  const name = document.getElementById('newPersonName').value.trim();
  if(!name) return;
  if(ctx.personMode === 'edit') {
    persons.find(x=>x.id===ctx.pid).name = name;
    showToast('تم تعديل الاسم بنجاح', 'success', 3000, '<i class="fa-solid fa-user-pen"></i>');
  } else {
    persons.push({id:genId(), name, deals:[]});
    showToast('تمت إضافة الشخص بنجاح', 'success', 3000, '<i class="fa-solid fa-user-plus"></i>');
  }
  closeModal('modalPerson');
  render();
  const _u = window._getUser?.();
  if(_u && window._setDoc) {
    const cleanData = JSON.parse(JSON.stringify(persons));
    window._setDoc(window._doc(window._db, "users_data", _u.uid), { my_list: cleanData }).catch(()=>{});
  }
}

function deletePerson(pid) {
  const p = persons.find(x=>x.id===pid);
  showConfirm(
    `حذف "${p.name}" وجميع صفقاته؟`,
    `سيتم حذف ${p.deals.length} صفقة نهائياً`,
    () => {
      persons = persons.filter(x=>x.id!==pid);
      showToast('تم حذف الشخص وصفقاته', 'error', 3000, '<i class="fa-solid fa-user-slash"></i>');
      render();
    }
  );
}

function deleteDeal(pid, did) {
  const p = persons.find(x => x.id === pid);
  const deal = p.deals.find(x => x.id === did);
  const name = deal.deviceName || 'بدون اسم';
  showConfirm(
    `حذف صفقة "${name}"؟`,
    `سيتم حذف الصفقة وكل دفعاتها نهائياً`,
    () => {
      p.deals = p.deals.filter(x => x.id !== did);
      showToast('تم حذف الصفقة', 'error', 3000, '<i class="fa-solid fa-file-circle-xmark"></i>');
      render();
    }
  );
}
function archiveDeal(pid, did) {
  const p = persons.find(x => x.id === pid);
  const deal = p.deals.find(x => x.id === did);
  deal.archived = true;
  showToast('تمت أرشفة الصفقة 📁', 'success', 3000, '<i class="fa-solid fa-box-archive"></i>');
  render();
  const _u = window._getUser?.();
  if(_u && window._setDoc) {
    const cleanData = JSON.parse(JSON.stringify(persons));
    window._setDoc(window._doc(window._db, "users_data", _u.uid), { my_list: cleanData }).catch(()=>{});
  }
}
function unarchiveDeal(pid, did) {
  const p = persons.find(x => x.id === pid);
  const deal = p.deals.find(x => x.id === did);
  deal.archived = false;
  showToast('تمت استعادة الصفقة ✅', 'success', 3000, '<i class="fa-solid fa-box-open"></i>');
  render();
  const _u = window._getUser?.();
  if(_u && window._setDoc) {
    const cleanData = JSON.parse(JSON.stringify(persons));
    window._setDoc(window._doc(window._db, "users_data", _u.uid), { my_list: cleanData }).catch(()=>{});
  }
}
function unarchiveDealFromModal(pid, did) {
  unarchiveDeal(pid, did);
  openArchive();
}

function openArchive() {
  const archived = persons.flatMap(p =>
    (p.deals||[]).filter(d => d.archived).map(d => ({...d, personName: p.name || 'بدون اسم', _pid: p.id}))
  );
  const html = archived.length === 0
    ? `<div style="text-align:center;padding:40px;color:var(--muted)">لا توجد صفقات مؤرشفة</div>`
    : archived.map(d => `
  <div style="background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px;">
    <div style="font-weight:800;font-size:14px;">${d.deviceName || 'بدون اسم'}</div>
    <div style="font-size:11px;color:var(--muted);margin-top:4px;">👤 ${d.personName}</div>
    <div style="font-size:11px;color:var(--green);margin-top:4px;">✓ إجمالي: ${fmtMoney(dTotal(d))}</div>
    <div style="font-size:11px;color:var(--muted);margin-top:2px;">📅 ${fmtDate(d.dateFrom)} ← ${fmtDate(d.dateTo)}</div>
    <button class="btn btn-sm" style="margin-top:8px;width:100%;justify-content:center;background:var(--blue-l);border:1px solid var(--blue-b)!important;color:var(--blue);gap:6px;" 
      onclick="unarchiveDealFromModal('${d._pid}','${d.id}')">
      <i class="fa-solid fa-box-open"></i> استعادة
    </button>
  </div>`).join('');
    const archiveList = document.getElementById('archiveList');
  if(archiveList) {
    archiveList.innerHTML = html;
  }
  openModal('modalArchive');
}
function togglePerson(pid) {
  const el = document.getElementById(`content_${pid}`);
  const isCurrentlyOpen = el.style.display !== 'none';
  
  document.querySelectorAll('[id^="content_"]').forEach(div => {
    div.style.display = 'none';
  });
  
  if (!isCurrentlyOpen) {
    el.style.display = 'block';
    setTimeout(() => {
      const y = el.getBoundingClientRect().top + window.pageYOffset - 140;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }, 150);
  }
}

// ========== دوال إدارة الصفقات ==========
function openAddDeal(pid) {
  ctx = { mode:'add', pid };
  document.getElementById('dealModalTitle').textContent = 'إضافة صفقة جديدة';
  ['d_name','d_notes'].forEach(id=>document.getElementById(id).value='');
  ['d_price','d_profit'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('d_count').value  = 1;
  document.getElementById('d_months').value = 1;
  document.getElementById('d_check_amount').value = '';
  document.getElementById('d_price_all').value = '';
  document.getElementById('d_profit_all').value = '';
  document.getElementById('d_status').value = 'active';
  document.getElementById('d_image').value  = '';
  document.getElementById('d_img_preview').style.display = 'none';
  document.getElementById('d_img_section').style.display = 'none';
  document.getElementById('d_img_size_warn').style.display = 'none';
  ctx.currentImage = null;
  const today = new Date();
  setDateSelects('d_from', today);
  const end = new Date(today);
  end.setMonth(end.getMonth()+1);
  setDateSelects('d_to', end);
  previewDeal();
  openModal('modalDeal');
}

function openEditDeal(pid, did) {
  const p = persons.find(x=>x.id===pid);
  const d = p.deals.find(x=>x.id===did);
  ctx = { mode:'edit', pid, did };
  document.getElementById('dealModalTitle').textContent = 'تعديل الصفقة';
  document.getElementById('d_name').value   = d.deviceName||'';
  document.getElementById('d_count').value  = d.deviceCount||1;
  document.getElementById('d_price').value  = d.devicePrice||'';
  document.getElementById('d_profit').value = d.profit||'';
  document.getElementById('d_months').value = d.months || monthsBetween(d.dateFrom,d.dateTo) || 1;
  document.getElementById('d_check_amount').value = d.checkAmount||'';
  document.getElementById('d_status').value = d.status||'active';
  document.getElementById('d_notes').value  = d.notes||'';
  ctx.currentImage = d.image||null;
  document.getElementById('d_img_section').style.display = d.image ? 'block':'none';
  document.getElementById('d_img_preview').style.display = 'none';
  document.getElementById('d_phone').value = d.phone || '';
  document.getElementById('d_img_size_warn').style.display = 'none';
  document.getElementById('d_image').value  = '';
  if(d.dateFrom) setDateSelects('d_from', new Date(d.dateFrom));
  if(d.dateTo)   setDateSelects('d_to',   new Date(d.dateTo));
  previewDeal();
  openModal('modalDeal');
}

function setDateSelects(prefix, date) {
  document.getElementById(prefix+'_d').value = date.getDate();
  document.getElementById(prefix+'_m').value = date.getMonth()+1;
  document.getElementById(prefix+'_y').value = date.getFullYear();
  const preview = document.getElementById(prefix+'_preview');
  if(preview) preview.textContent = fmtDate(date.toISOString().split('T')[0]);
}

function getDateFromSelects(prefix) {
  const d=document.getElementById(prefix+'_d').value;
  const m=document.getElementById(prefix+'_m').value;
  const y=document.getElementById(prefix+'_y').value;
  if(!d||!m||!y) return '';
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function autoSetEndDate() {
  const from   = getDateFromSelects('d_from');
  const months = parseFloat(document.getElementById('d_months').value)||1;
  if(from) {
    const d = new Date(from);
    d.setMonth(d.getMonth()+months);
    setDateSelects('d_to', d);
    previewDeal();
  }
}

function previewDeal() {
  const cnt     = Math.max(1, Number(document.getElementById('d_count').value || 1));
  const price   = Number(document.getElementById('d_price').value || 0);
  const profit  = Number(document.getElementById('d_profit').value || 0);
  const months  = Math.max(1, parseFloat(document.getElementById('d_months').value) || 1);
  const from    = getDateFromSelects('d_from');
  const to      = getDateFromSelects('d_to');

  const priceAll   = price * cnt;
  const profitAll  = profit * cnt;
  const total      = priceAll + profitAll;

  const installment    = total / months;
  const monthlyProfit  = profitAll / months;
  const roi            = priceAll > 0 ? (profitAll / priceAll) * 100 : 0;
  const sadaqa         = profitAll * 0.01;

  const dPriceAll  = document.getElementById('d_price_all');
  const dProfitAll = document.getElementById('d_profit_all');
  const dCheckAmt  = document.getElementById('d_check_amount');
  if (dPriceAll)  dPriceAll.value  = priceAll.toFixed(2);
  if (dProfitAll) dProfitAll.value = profitAll.toFixed(2);
  if (dCheckAmt)  dCheckAmt.value  = total.toFixed(2);

  updatePreviewElement('pv_cost',    fmtMoney(priceAll));
  updatePreviewElement('pv_total',   fmtMoney(total), 'var(--blue)');
  updatePreviewElement('pv_profit',  fmtMoney(profitAll), 'var(--green)');
  updatePreviewElement('pv_monthly', `<b style="color:var(--blue)">${fmtMoney(installment)}</b> <small>(قسط)</small>`, null, 'html');
  updatePreviewElement('pv_roi',     fmtPct(roi), 'var(--blue)');
  updatePreviewElement('pv_pct',     fmtMoney(monthlyProfit), 'var(--blue)');
  updatePreviewElement('pv_expire',  to ? fmtDate(to) : '—');
  updatePreviewElement('pv_sadaqa',  fmtMoney(sadaqa), 'var(--gold)');

  const fromPrev = document.getElementById('d_from_preview');
  const toPrev   = document.getElementById('d_to_preview');
  if (fromPrev) fromPrev.textContent = from ? fmtDate(from) : '';
  if (toPrev)   toPrev.textContent   = to   ? fmtDate(to)   : '';
}

function updatePreviewElement(id, content, color = null, type = 'text') {
  const el = document.getElementById(id);
  if (!el) return;
  if (type === 'html') {
    el.innerHTML = content;
  } else {
    el.textContent = content;
  }
  if (color) el.style.color = color;
}

function handleImageUpload() {
  const file    = document.getElementById('d_image').files[0];
  const preview = document.getElementById('d_img_preview');
  const warn    = document.getElementById('d_img_size_warn');

  if (!file) {
    preview.style.display = 'none';
    warn.style.display    = 'none';
    return;
  }

  const maxSize = 10 * 1024 * 1024;
  warn.style.display = file.size > maxSize ? 'block' : 'none';

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX = 500;
      let w = img.width, h = img.height;
      if(w > MAX) { h = h * MAX / w; w = MAX; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL('image/jpeg', 0.6);
      preview.src = compressed;
      preview.style.display = 'block';
      ctx.currentImage = compressed;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function viewDealImage() {
  if (ctx.currentImage) {
    document.getElementById('fullDealImage').src = ctx.currentImage;
    openModal('modalImageView');
  }
}

function deleteDealImage() {
  showConfirm('حذف صورة الشيك؟', 'لن تتمكن من استعادتها', () => {
    ctx.currentImage = null;
    document.getElementById('d_img_section').style.display = 'none';
    document.getElementById('d_image').value = '';
    document.getElementById('d_img_preview').style.display = 'none';
    document.getElementById('d_img_size_warn').style.display = 'none';
  });
}

function saveDeal() {
  const name        = document.getElementById('d_name').value.trim();
  const count       = Number(document.getElementById('d_count').value || 1);
  const price       = Number(document.getElementById('d_price').value || 0);
  const profit      = Number(document.getElementById('d_profit').value || 0);
  const months      = parseFloat(document.getElementById('d_months').value) || 1;
  const dateFrom    = getDateFromSelects('d_from');
  const dateTo      = getDateFromSelects('d_to');
  const checkAmount = parseFloat(document.getElementById('d_check_amount').value) || (price * count + profit);
  const status      = document.getElementById('d_status').value;
  const notes       = document.getElementById('d_notes').value.trim();
  const image       = ctx.currentImage || null;
  const phone       = document.getElementById('d_phone')?.value?.trim() || '';

  const deal = {
    id: ctx.mode === 'edit' ? ctx.did : genId(),
    deviceName:  name,
    deviceCount: count,
    devicePrice: price,
    profit,
    dateFrom,
    dateTo,
    months,
    checkAmount,
    status,
    notes,
    image,
    phone,
    payments: ctx.mode === 'edit'
      ? (persons.find(x => x.id === ctx.pid).deals.find(x => x.id === ctx.did).payments || [])
      : []
  };

  const p = persons.find(x => x.id === ctx.pid);
  if (ctx.mode === 'add') {
    p.deals.push(deal);
    showToast('تمت إضافة الصفقة بنجاح', 'success', 3000, '<i class="fa-solid fa-file-circle-plus"></i>');
  } else {
    const idx = p.deals.findIndex(x => x.id === ctx.did);
    p.deals[idx] = deal;
    showToast('تم تعديل الصفقة بنجاح', 'success', 3000, '<i class="fa-solid fa-file-pen"></i>');
  }
  closeModal('modalDeal');
  render();
  const _u = window._getUser?.();
  if(_u && window._setDoc) {
    const cleanData = JSON.parse(JSON.stringify(persons));
    window._setDoc(window._doc(window._db, "users_data", _u.uid), { my_list: cleanData })
      .then(() => {
        showToast('☁️ تم رفع البيانات إلى السحابة', 'success', 2000, '<i class="fa-solid fa-cloud-arrow-up"></i>');
      })
      .catch(() => {
        showToast('❌ فشل رفع البيانات', 'error', 2000, '<i class="fa-solid fa-cloud-bolt"></i>');
      });
  }
}

// ========== دوال إدارة الدفعات ==========
function openAddPayment(pid, did) {
  const p   = persons.find(x=>x.id===pid);
  const d   = p.deals.find(x=>x.id===did);
  const total = dTotal(d);
  const rem   = Math.max(0, total - dPaid(d));
  
  if(rem <= 0) { 
    showToast('هذه الصفقة مكتملة — لا يمكن إضافة دفعات', 'error', 3000, '<i class="fa-solid fa-circle-check"></i>'); 
    return; 
  }
  
  ctx = { pid, did, maxPay: rem };
  document.getElementById('p_date').value   = new Date().toISOString().split('T')[0];
  document.getElementById('p_amount').value = '';
  document.getElementById('p_amount').max   = rem.toFixed(2);
  document.getElementById('p_note').value   = '';
  document.getElementById('p_hint').textContent = 'المتبقي: ' + fmtMoney(rem);
  openModal('modalPayment');
  setTimeout(()=>document.getElementById('p_amount').focus(),80);
}

function savePayment() {
  const amount = Number(document.getElementById('p_amount').value);
  if(!amount) return;
  
  if(ctx.maxPay !== undefined && amount > ctx.maxPay + 0.01) {
    showToast('المبلغ المدخل أكبر من المتبقي (' + fmtMoney(ctx.maxPay) + ')', 'error', 3000, '<i class="fa-solid fa-circle-exclamation"></i>');
    return;
  }
  
  const pmt = {
    id:     genId(),
    date:   document.getElementById('p_date').value,
    amount,
    note:   document.getElementById('p_note').value.trim()
  };
  
  const deal = persons.find(x=>x.id===ctx.pid).deals.find(x=>x.id===ctx.did);
  deal.payments.push(pmt);
  openDetails.add(ctx.did);
  closeModal('modalPayment');
  showToast(`تم تسجيل دفعة ${fmtMoney(amount)}`, 'success', 3000, '<i class="fa-solid fa-money-bill-wave"></i>');
  render();
  const _u = window._getUser?.();
  if(_u && window._setDoc) {
    const cleanData = JSON.parse(JSON.stringify(persons));
    window._setDoc(window._doc(window._db, "users_data", _u.uid), { my_list: cleanData }).catch(()=>{});
  }
}

function deletePayment(pid, did, pmid) {
  const deal = findDealById(did);
  const payment = deal ? (deal.payments||[]).find(p => p.id === pmid) : null;
  const amount = payment ? payment.amount : 0;
  showConfirm(
    `حذف دفعة ${fmtMoney(amount)}؟`,
    'سيتم حذف هذه الدفعة من السجل',
    () => {
      deal.payments = deal.payments.filter(x => x.id !== pmid);
      openDetails.add(did);
      showToast('تم حذف الدفعة', 'error', 3000, '<i class="fa-solid fa-money-bill-slash"></i>');
      render();
      setTimeout(() => {
        const el = document.getElementById('det_' + did);
        if(el) el.classList.add('open');
      }, 100);
    }
  );
}

// ========== تبديل عرض تفاصيل الصفقة ==========
function toggleDeal(uid) {
  if(openDetails.has(uid)) {
    openDetails.delete(uid);
  } else {
    openDetails.clear();
    openDetails.add(uid);
  }
  document.querySelectorAll('.deal-detail').forEach(el => {
    const id = el.id.replace('det_', '');
    el.classList.toggle('open', openDetails.has(id));
  });
  document.querySelectorAll('.deal-chev').forEach(el => {
    const id = el.id.replace('chev_', '');
    el.classList.toggle('open', openDetails.has(id));
  });
  if(openDetails.size > 0) {
    const openId = [...openDetails][0];
    for(let p of persons) {
      if(p.deals.some(d => d.id === openId)) {
        const el = document.getElementById('content_' + p.id);
        if(el) {
          el.style.display = 'block';
          setTimeout(() => {
            const y = el.getBoundingClientRect().top + window.pageYOffset - 140;
            window.scrollTo({ top: y, behavior: 'smooth' });
          }, 150);
        }
        break;
      }
    }
  }
}

// ========== دوال التبويب والبحث ==========
function setTab(t) {
  activeTab = t;
  document.querySelectorAll('.tab').forEach(el=>el.classList.toggle('active', el.dataset.t===t));
  render();
}

function onSearch(v) {
  searchQ = v;
  document.getElementById('searchClear').style.display = v ? 'flex':'none';
  render();
}

function clearSearch() {
  searchQ = '';
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').style.display = 'none';
  render();
}

function getFiltered() {
  const q = searchQ.trim().toLocaleLowerCase('ar');
  return persons.map(p => {
  let deals = sortDeals((p.deals||[]).filter(d => !d.archived));

    if(activeTab==='late')   deals = deals.filter(d=>daysLate(d)>0);
    else if(activeTab==='active') deals = deals.filter(d=>!isDone(d)&&daysLate(d)===0);
    else if(activeTab==='done')   deals = deals.filter(d=>isDone(d));

    const nameMatch = p.name.toLocaleLowerCase('ar').includes(q);
    const dealMatch = deals.filter(d=>(d.deviceName||'').toLocaleLowerCase('ar').includes(q));

    if(q) {
      if(nameMatch) {
        if(deals.length === 0) return null;
        return {...p, deals};
      } else {
        if(dealMatch.length === 0) return null;
        return {...p, deals: dealMatch};
      }
    }

    if(activeTab !== 'all' && deals.length === 0) return null;

    return {...p, deals};
  }).filter(Boolean);
}

function countTab(t) {
  let n = 0;
  persons.forEach(p=>(p.deals||[]).forEach(d=>{
    if(t==='all') n++;
    else if(t==='late'   && daysLate(d)>0)  n++;
    else if(t==='active' && !isDone(d) && daysLate(d)===0) n++;
    else if(t==='done'   && isDone(d)) n++;
  }));
  return n;
}

function renderDealCard(deal, ci, pid, pci) {
  const color     = PALETTE[(pci+ci+1)%PALETTE.length];
  const cnt       = Math.max(1, Number(deal.deviceCount||1));
  const price1    = Number(deal.devicePrice||0);
  const profit1   = Number(deal.profit||0);
  const priceAll  = price1 * cnt;
  const profitAll = profit1 * cnt;
  const total     = priceAll + profitAll;
  const months    = Math.max(1, Number(deal.months) || monthsBetween(deal.dateFrom, deal.dateTo));
  const monthly   = total / months;
  const roi       = priceAll > 0 ? (profitAll / priceAll) * 100 : 0;
  const profitMonthly = profitAll / months;
  const profitPct = total > 0 ? (profitAll / total) * 100 : 0;
  const paid      = dPaid(deal);
  const rem       = Math.max(0, total - paid);
  const pct       = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
  const done      = paid >= total;
  const late      = daysLate(deal);
  const isLate    = late > 0 && !done;
  const uid       = deal.id;
  const pgColor   = isLate ? 'var(--red)' : done ? 'var(--green)' : color;
  const isOpen    = openDetails.has(uid);

  const statusBadge = done
    ? `<span class="status-badge sb-done">✓ مكتمل</span>`
    : isLate
    ? `<span class="status-badge sb-late">⚠ متأخر ${fmtNum(late)} يوم</span>`
    : `<span class="status-badge sb-active">نشط</span>`;

  const pmtsHtml = (deal.payments||[]).length === 0
    ? `<div class="no-pmts">لا توجد دفعات مسجلة بعد</div>`
    : [...(deal.payments||[])].reverse().map(pm => `
      <div class="pmt-item">
        <div class="pmt-left">
          <div class="pmt-dot"></div>
          <span class="pmt-amt">${fmtMoney(pm.amount)}</span>
          ${pm.note ? `<span class="pmt-note">· ${pm.note}</span>` : ''}
        </div>
        <div class="pmt-right">
          <span class="pmt-date">${fmtDate(pm.date)}</span>
          <button class="pmt-del" onclick="deletePayment('${pid}','${uid}','${pm.id}')">✕</button>
        </div>
      </div>`).join('');

  const statsHtml = [
    ['سعر الجهاز',    fmtMoney(price1),    '#2563EB'],
    ['مجموع الأسعار', fmtMoney(priceAll),  '#2563EB'],
    ['ربح الجهاز',    fmtMoney(profit1),   '#7C3AED'],
    ['مجموع الأرباح', fmtMoney(profitAll), '#7C3AED'],
    ['الإجمالي',      fmtMoney(total),     '#059669'],
    ['القسط الشهري',  fmtMoney(monthly),   '#D97706'],
    ['ROI',           fmtPct(roi),         '#DB2777'],
    ['ربح/شهر',       fmtMoney(profitMonthly), '#059669'],
    ['المدة',         months + ' شهر',     '#0891B2'],
    ['العدد',         fmtNum(cnt),         '#475569'],
  ].map(([l,v,c]) => `<div class="stat-tile"><div class="stat-lbl">${l}</div><div class="stat-val" style="color:${c}">${v}</div></div>`).join('');

  const dateFromBadge = deal.dateFrom
    ? `<span class="date-badge"><i class="fa-solid fa-calendar-days"></i> ${fmtDate(deal.dateFrom)}</span>` : '';
  const dateToBadge = deal.dateTo
    ? `<span class="date-badge"><i class="fa-solid fa-hourglass-end"></i> ${fmtDate(deal.dateTo)}</span>` : '';
  const whatsappBtn = deal.phone
  ? `<button class="btn btn-whatsapp btn-sm" onclick="shareWhatsApp('${deal.phone}','${deal.deviceName || ''}','${deal.deviceName || ''}','${fmtMoney(rem)}')" title="واتساب" style="width:36px;height:36px;border-radius:8px;padding:0;justify-content:center;flex:0;min-width:36px"><i class="fa-brands fa-whatsapp" style="font-size:16px"></i></button>`
  : '';
  const payBtn = done
    ? `<button class="btn btn-sm" style="flex:1;justify-content:center;background:var(--green-l);border:1px solid var(--green-b)!important;color:var(--green);cursor:default" disabled>✓ المبلغ مكتمل</button>`
    : `<button class="btn btn-pay btn-sm" onclick="openAddPayment('${pid}','${uid}')">+ دفعة جديدة</button>`;

const archiveBtn = isFullyDone(deal) && !deal.archived
  ? `<button class="btn btn-sm" style="width:100%;justify-content:center;background:var(--amber-l);border:1px solid var(--amber-b)!important;color:var(--amber);gap:6px;" onclick="archiveDeal('${pid}','${uid}')">
      <i class="fa-solid fa-box-archive"></i> نقل إلى الأرشيف
    </button>`
  : deal.archived
  ? `<button class="btn btn-sm" style="width:100%;justify-content:center;background:var(--panel);border:1px solid var(--border)!important;color:var(--muted);gap:6px;" onclick="unarchiveDeal('${pid}','${uid}')">
      <i class="fa-solid fa-box-open"></i> استعادة من الأرشيف
    </button>`
  : '';

  return `
<div class="deal-card${isLate ? ' is-late' : done ? ' is-done' : ''}">
  ${isLate ? `<div class="deal-late-bar">⚠ متأخر منذ <span class="num">${fmtNum(late)}</span> يوم — المتبقي: <span class="num">${fmtMoney(rem)}</span></div>` : ''}
  <div class="deal-row" onclick="toggleDeal('${uid}')">
    <div class="deal-dot" style="background:${color}"></div>
    <div class="deal-info">
      <div class="deal-name">${deal.deviceName || 'جهاز بدون اسم'}</div>
      <div class="deal-dates-row">${dateFromBadge}<span class="date-sep">←</span>${dateToBadge}</div>
      <div class="deal-prog-wrap">
        <div class="deal-prog-track"><div class="deal-prog-fill" style="width:${pct.toFixed(1)}%;background:${pgColor}"></div></div>
        <div class="deal-prog-labels">
          <span>مدفوع: <b style="color:${pgColor};font-family:'Inter',sans-serif">${fmtMoney(paid)}</b> (<span class="num">${pct.toFixed(1)}</span>%)</span>
          <span>الإجمالي: <span class="num">${fmtMoney(total)}</span></span>
        </div>
      </div>
    </div>
    <div class="deal-right">
      ${statusBadge}
      ${!done ? `<div class="deal-rem" style="color:${isLate ? 'var(--red)' : 'var(--amber)'}">${fmtMoney(rem)}</div>` : ''}
      <div class="deal-chev${isOpen ? ' open' : ''}" id="chev_${uid}">▼</div>
    </div>
  </div>
  <div class="deal-detail${isOpen ? ' open' : ''}" id="det_${uid}">
    <div class="stat-grid">${statsHtml}</div>
    ${deal.notes ? `<div class="deal-notes-box"><span><i class="fa-solid fa-note-sticky"></i></span><span>${deal.notes}</span></div>` : ''}
    ${deal.image ? `<div style="margin:8px 0"><button class="btn btn-ghost btn-sm" onclick="viewDealImageById('${uid}')"><i class="fa-solid fa-image"></i> عرض صورة الشيك</button></div>` : ''}
    <div class="pmts-section">
      <div class="pmts-head">
        <span class="pmts-title">سجل الدفعات (<span class="num">${(deal.payments||[]).length}</span>)</span>
        ${!done ? `<span class="pmts-rem" style="color:${isLate ? 'var(--red)' : 'var(--amber)'}">المتبقي: ${fmtMoney(rem)}</span>` : `<span class="pmts-rem" style="color:var(--green)">✓ مكتمل بالكامل</span>`}
      </div>
      ${pmtsHtml}
    </div>
    <div style="display:flex;flex-direction:column;gap:7px;">
      <div class="deal-acts">
  ${payBtn}
  ${whatsappBtn}
        <button class="btn btn-ghost btn-sm" onclick="openEditDeal('${pid}','${uid}')"><i class="fa-regular fa-pen-to-square"></i> تعديل</button>
        <button class="btn btn-danger btn-sm" style="background:rgba(225,29,72,0.05);border:1px solid rgba(225,29,72,0.2)!important;color:#e11d48;font-size:11px;display:flex;align-items:center;gap:5px;" onclick="deleteDeal('${pid}','${uid}')">
          <i class="fa-solid fa-trash"></i><span>حذف الصفقة</span>
        </button>
      </div>
      ${archiveBtn}
    </div>
  </div>
</div>`;}

window.viewDealImageById = id => {
  const deal = findDealById(id);
  if(deal && deal.image) {
    document.getElementById('fullDealImage').src = deal.image;
    openModal('modalImageView');
  }
};

function renderPersonBlock(p, ci) {
  const color   = PALETTE[ci % PALETTE.length];
  const deals   = p.deals||[];
  
  const totalAll= deals.reduce((s,d)=>s+dTotal(d),0);
  const paidAll = deals.reduce((s,d)=>s+dPaid(d),0);
  const remAll  = totalAll-paidAll;
  const pct     = totalAll>0?Math.min(100,(paidAll/totalAll)*100):0;
  const lateC   = deals.filter(d=>daysLate(d)>0).length;
  const doneC   = deals.filter(d=>isDone(d)).length;

  const dealsHtml = deals.length===0
    ? `<div style="text-align:center; padding:15px; color:var(--sub); font-size:12px;">لا توجد صفقات</div>`
    : deals.map((d,i)=>renderDealCard(d,i,p.id,ci)).join('');

  return `
<div class="person-block" style="margin-bottom:20px; background:var(--panel); border-radius:16px; overflow:hidden; border:1px solid var(--border);">
  
  <div class="person-head" onclick="togglePerson('${p.id}')" style="cursor:pointer; display:flex; align-items:center; padding:15px; border-bottom:1px solid var(--border); gap:12px;">
    
    <div class="person-avatar" style="width:40px; height:40px; border-radius:50%; background:linear-gradient(135deg, ${color}, #34495e); display:flex; align-items:center; justify-content:center; color:white; font-weight:800;">
      ${(p.name||'?').charAt(0)}
    </div>

    <div style="flex:1;">
      <div style="font-weight:800; font-size:15px;">${p.name}</div>
      <div style="font-size:10px; color:var(--sub);">${deals.length} صفقات</div>
    </div>

    <div style="display:flex; gap:8px;">
      <button onclick="event.stopPropagation(); openEditPerson('${p.id}')" style="border:none; background:none; cursor:pointer;"><i class="fa-regular fa-pen-to-square"></i></button>
      <button onclick="event.stopPropagation(); deletePerson('${p.id}')" style="border:none; background:none; cursor:pointer; color:#e11d48;"><i class="fa-solid fa-trash"></i></button>
    </div>
  </div>

  <div id="content_${p.id}" style="display:none; padding:10px;">
    
    <div class="deals-container">
      ${dealsHtml}
    </div>
    
    <button class="btn btn-ghost btn-sm" style="width:100%; margin-top:10px; height:35px; color:${color}; display:flex; justify-content:center; align-items:center; border:1px dashed ${color}66!important; border-radius:10px; font-weight:bold;" onclick="openAddDeal('${p.id}')">
      + إضافة صفقة جديدة
    </button>

  </div>
</div>`;
}

function render() {
  const filtered = getFiltered();

  if(window._syncData) window._syncData();

  ['all','late','active','done'].forEach(t=>
    document.getElementById('cnt-'+t).textContent = fmtNum(countTab(t)));

  const statsBar       = document.getElementById('statsBar');
  const tabsBar        = document.getElementById('tabsBar');
  const sortBar        = document.getElementById('sortBar');
  const statsContainer = document.getElementById('statsContainer');

  if(persons.length > 0) {
    tabsBar.style.display = 'block';
    statsBar.style.display= 'block';
    sortBar.style.display = 'flex';

    const tot = persons.reduce((s,p)=>s+(p.deals||[]).reduce((ds,d)=>ds+dTotal(d),0),0);
    const pd  = persons.reduce((s,p)=>s+(p.deals||[]).reduce((ds,d)=>ds+dPaid(d),0),0);
    const rem = tot-pd;
    const lt  = persons.reduce((s,p)=>s+(p.deals||[]).filter(d=>daysLate(d)>0).length,0);
    const dt  = persons.reduce((s,p)=>s+(p.deals||[]).length,0);
    
    const chips = [
      { label:'الأشخاص', value:persons.length,    color:'#2563EB' },
      { label:'الصفقات', value:dt,                color:'#7C3AED' },
      { label:'الإجمالي',value:fmtMoney(tot),     color:'#0891B2' },
      { label:'مدفوع',   value:fmtMoney(pd),      color:'#059669' },
      { label:'متبقي',   value:fmtMoney(rem),     color:'#D97706' },
    ];
    if(lt>0) chips.push({ label:'متأخر', value:lt+' صفقة', color:'#DC2626' });

    statsContainer.innerHTML = chips.map(c=>`
      <div class="stat-chip">
        <span class="stat-chip-label">${c.label}</span>
        <span class="stat-chip-val" style="color:${c.color}">${c.value}</span>
      </div>`).join('');
  } else {
    tabsBar.style.display = 'none';
    statsBar.style.display= 'none';
    sortBar.style.display = 'none';
  }

  const list       = document.getElementById('personsList');
  const emptyState = document.getElementById('emptyState');
  const noResults  = document.getElementById('noResults');

  if(persons.length===0) {
    emptyState.style.display='block'; noResults.style.display='none'; list.innerHTML='';
  } else if(filtered.length===0) {
    emptyState.style.display='none'; noResults.style.display='block'; list.innerHTML='';
  } else {
    emptyState.style.display='none'; noResults.style.display='none';
    list.innerHTML = filtered.map(p=>renderPersonBlock(p,persons.findIndex(x=>x.id===p.id))).join('');
  }
}

// ========== دوال القائمة الجانبية ==========
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  
  if (sidebar.classList.contains('open')) {
    closeSidebar();
  } else {
    sidebar.classList.add('open');
    overlay.classList.add('open');
  }
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

function toggleSection(id) {
  const el = document.getElementById(id);
  const arr = document.getElementById('arr-' + id);
  const isOpen = el.style.display !== 'none';
  
  // إغلاق كل الأقسام
  document.querySelectorAll('.sidebar-menu').forEach(menu => {
    menu.style.display = 'none';
  });
  
  // إعادة كل الأسهم لوضعها الأصلي
  document.querySelectorAll('[id^="arr-"] i').forEach(icon => {
    icon.style.transform = 'rotate(0deg)';
  });
  
  // فتح القسم المطلوب
  if (!isOpen) {
    el.style.display = 'flex';
    if(arr) {
      const icon = arr.querySelector('i');
      if(icon) icon.style.transform = 'rotate(90deg)';
    }
  }
}

function openSettings() {
  showToast('الإعدادات — قريباً 🔜', 'info', 3000, '<i class="fa-solid fa-gear"></i>');
}

function changeLanguage() {
  showToast('تغيير اللغة — قريباً 🔜', 'info', 3000, '<i class="fa-solid fa-language"></i>');
}

function openAbout() {
  showToast('حول التطبيق — متتبع الأقساط v1.0 ⚡', 'info', 3000, '<i class="fa-solid fa-circle-info"></i>');
}

function exportData() {
  const dataStr = JSON.stringify(persons, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'installment-data.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('تم تصدير البيانات بنجاح 📁', 'success', 3000, '<i class="fa-solid fa-file-export"></i>');
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (Array.isArray(data)) {
          persons = data;
          render();
          showToast('تم استيراد البيانات بنجاح 📂', 'success', 3000, '<i class="fa-solid fa-file-import"></i>');
        } else {
          showToast('الملف غير صالح ❌', 'error', 3000, '<i class="fa-solid fa-triangle-exclamation"></i>');
        }
      } catch (err) {
        showToast('خطأ في قراءة الملف ❌', 'error', 3000, '<i class="fa-solid fa-triangle-exclamation"></i>');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ========== تهيئة قوائم التاريخ المنسدلة ==========
(function initDateSelects() {
  const now = new Date();
  for(let i=1;i<=31;i++) {
    ['d_from_d','d_to_d'].forEach(id=>{const el=document.getElementById(id);if(el)el.add(new Option(i,i));});
  }
  MN.forEach((m,i)=>{
    ['d_from_m','d_to_m'].forEach(id=>{const el=document.getElementById(id);if(el)el.add(new Option(m,i+1));});
  });
  for(let y=now.getFullYear()-2;y<=now.getFullYear()+5;y++) {
    ['d_from_y','d_to_y'].forEach(id=>{const el=document.getElementById(id);if(el)el.add(new Option(y,y));});
  }
})();

// ========== عرض أولي ==========
render();

function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  document.getElementById('darkModeLabel').textContent = isDark ? '☀️ الوضع الفاتح' : '🌙 الوضع الليلي';
  const iconEl = document.getElementById('btnDarkMode').querySelector('.item-icon');
  if(iconEl) iconEl.textContent = isDark ? '☀️' : '🌙';
  const quickBtn = document.getElementById('quickDark');
  if(quickBtn) quickBtn.textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem('darkMode', isDark);
}

if (localStorage.getItem('darkMode') === 'true') {
  document.body.classList.add('dark-mode');
  document.getElementById('darkModeLabel').textContent = '☀️ الوضع الفاتح';
}
// عرض البيانات

// 
let alertTimer = null;

function showAlert(title, body) {
  const overlay = document.getElementById('alertOverlay');
  const bar = document.getElementById('alertBar');
  const line = document.getElementById('alertLine');
  const titleEl = document.getElementById('alertTitle');
  const bodyEl = document.getElementById('alertBody');
  
  if(!overlay || !bar) return;
  
  titleEl.textContent = title || '📅 تنبيه أقساط';
  bodyEl.innerHTML = body || '';
  
  line.style.transition = 'none';
  line.style.width = '0%';
  setTimeout(() => {
    line.style.transition = 'width 5s linear';
    line.style.width = '100%';
  }, 50);
  
  overlay.classList.add('show');
  bar.classList.add('show');
  
  clearTimeout(alertTimer);
  alertTimer = setTimeout(closeAlert, 5000);
  
  // سحب بالإصبع للإغلاق
  let startY = 0;
  let startX = 0;
  
  bar.addEventListener('touchstart', function(e) {
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
  }, {passive: true});
  
  bar.addEventListener('touchmove', function(e) {
    const deltaY = startY - e.touches[0].clientY;
    const deltaX = Math.abs(startX - e.touches[0].clientX);
    if(deltaY > 30 && deltaY > deltaX) {
      closeAlert();
    }
  }, {passive: true});
}

function closeAlert() {
  clearTimeout(alertTimer);
  const bar = document.getElementById('alertBar');
  const overlay = document.getElementById('alertOverlay');
  if(bar) bar.classList.remove('show');
  if(overlay) overlay.classList.remove('show');
}

// فحص الأقساط
setTimeout(() => {
  const today = new Date();
  today.setHours(0,0,0,0);
  
  let alerts = [];
  persons.forEach(p => {
    (p.deals||[]).forEach(d => {
      if(isDone(d) || !d.dateTo) return;
      const daysLeft = Math.floor((new Date(d.dateTo) - today) / 86400000);
      if(daysLeft <= 3 && daysLeft >= 1) {
        const rem = fmtMoney(dTotal(d) - dPaid(d));
        alerts.push(`<b>${d.deviceName || 'جهاز'}</b> · ${p.name}<br>⏳ باقي ${daysLeft} أيام · المتبقي: ${rem}`);
      }
    });
  });
  
  if(alerts.length > 0) {
    showAlert('📅 تذكير بالأقساط', alerts.join('<br><br>'));
  }
}, 2000);

function shareWhatsApp(phone, name, device, remaining) {
  if(!phone) {
    showToast('الرجاء إضافة رقم العميل أولاً', 'error');
    return;
  }
  const msg = `مرحباً ${name}،\n\nباقي على قسط جهاز ${device} مبلغ ${remaining}.\n\nيرجى الدفع في أقرب وقت ممكن. شكراً لك.`;
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}