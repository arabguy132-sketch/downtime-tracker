(() => {
  'use strict';
  const KEY = 'downtime.logs.v1', TTL = 12 * 60 * 60 * 1000;
  const $ = id => document.getElementById(id);
  let entries = [], editId = null, deleteId = null, storageOK = true;
  const valid = e => e && typeof e.id === 'string' && Number.isFinite(e.start) && (e.end === null || (Number.isFinite(e.end) && e.end >= e.start));
  function warn(message) { $('notice').textContent = message; $('notice').hidden = false; }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(entries)); storageOK = true; $('notice').hidden = true; return true; }
    catch { storageOK = false; warn('Browser storage is unavailable or full. Changes cannot be saved. Keep this page open.'); return false; }
  }
  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      const data = raw === null ? [] : JSON.parse(raw);
      if (!Array.isArray(data) || !data.every(valid)) throw new Error('Invalid logs');
      entries = data;
    } catch { warn('Saved logs could not be read. Existing browser data has been left untouched.'); storageOK = false; return false; }
    return true;
  }
  function expire(now) {
    const kept = entries.filter(e => e.end === null || now < e.end + TTL);
    if (kept.length === entries.length) return false;
    entries = kept; save(); return true;
  }
  function duration(ms) {
    const minutes = Math.floor(Math.max(0, ms) / 60000);
    return [Math.floor(minutes / 60), minutes % 60].map(n => String(n).padStart(2, '0')).join(':');
  }
  const elapsed = (e, now) => Math.max(0, (e.end ?? now) - e.start);
  const displayDate = n => new Date(n).toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit',hour12:true});
  function tick() {
    const now = Date.now();
    if (expire(now)) { render(); return; }
    $('total').textContent = duration(entries.reduce((sum, e) => sum + elapsed(e, now), 0));
    document.querySelectorAll('[data-duration]').forEach(el => {
      const e = entries.find(e => e.id === el.dataset.duration);
      if (e) el.textContent = duration(elapsed(e, now));
    });
  }
  function render() {
    $('logs').replaceChildren();
    $('count').textContent = `${entries.length} saved ${entries.length === 1 ? 'entry' : 'entries'}`;
    $('activeCount').textContent = `${entries.filter(e => e.end === null).length} active`;
    if (!entries.length) $('logs').innerHTML = '<div class="empty"><strong>No downtime logged</strong>Tap the green + to start.</div>';
    [...entries].sort((a,b) => b.start - a.start).forEach(e => {
      const card = document.createElement('article'); card.className = 'entry';
      card.innerHTML = '<div class="entry-top"><strong class="duration"></strong><span class="badge"></span></div><div class="times"></div><div class="actions"></div>';
      card.querySelector('.duration').dataset.duration = e.id;
      const badge = card.querySelector('.badge'); badge.textContent = e.end === null ? '● Active' : 'Ended'; badge.classList.toggle('active', e.end === null);
      const times = card.querySelector('.times');
      ['Start: ' + displayDate(e.start), 'End: ' + (e.end === null ? '—' : displayDate(e.end))].forEach(t => { const row = document.createElement('div'); row.textContent = t; times.append(row); });
      const actions = card.querySelector('.actions');
      const button = (text, cls, action, label) => {const b = document.createElement('button'); b.textContent = text; b.className = cls; if(label) b.setAttribute('aria-label',label); b.onclick = action; actions.append(b);};
      if(e.end === null) button('End','end',() => { if(Date.now() < e.start) {warn('The current time is earlier than the start. Edit the start or end time.');return;} e.end = Date.now(); save(); render(); });
      button('Edit','edit',() => openEdit(e));
      button('×','delete',() => { deleteId=e.id; $('deleteDialog').showModal(); }, 'Delete entry starting ' + displayDate(e.start));
      $('logs').append(card);
    });
    tick();
  }
  const pad = n => String(n).padStart(2,'0');
  function field(n) { const d = new Date(n); return `${d.getHours()%12 || 12}:${pad(d.getMinutes())} ${d.getHours()<12?'AM':'PM'}`; }
  function parse(value, anchor) {
    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value.trim());
    if(!m) return NaN;
    const hour=Number(m[1]), mi=Number(m[2]);
    if(hour<1 || hour>12 || mi>59) return NaN;
    const h=hour%12+(m[3].toUpperCase()==='PM'?12:0), dt=new Date(anchor);
    dt.setHours(h,mi,0,0);
    if(dt.getHours()!==h || dt.getMinutes()!==mi) return NaN;
    return dt.getTime();
  }
  function editTimes(e, startText, endText, now=Date.now()) {
    // Preserve the original timestamp (including its date) for unchanged fields.
    let start=startText.trim()===field(e.start)?e.start:parse(startText,e.start);
    if(e.end===null && e.start<=now && start>now) {const d=new Date(start);d.setDate(d.getDate()-1);start=d.getTime();}
    let end=null;
    if(endText.trim()) {
      end=e.end!==null && endText.trim()===field(e.end)?e.end:parse(endText,start);
      if(Number.isFinite(end) && end<start) {
        if(Math.floor(end/60000)===Math.floor(start/60000)) end=start;
        else {const d=new Date(end);d.setDate(d.getDate()+1);end=d.getTime();}
      }
    }
    return {start,end};
  }
  const pickers=[];
  function openEdit(e) { editId=e.id; $('startInput').value=field(e.start); $('endInput').value=e.end===null?'':field(e.end); pickers.forEach(p=>{p.details.open=false;p.sync();}); $('editError').textContent=''; $('editor').showModal(); $('startInput').focus(); $('startInput').select(); }
  ['startInput','endInput'].forEach(id => {
    const input=$(id), name=id==='startInput'?'Start':'End';
    const details=document.createElement('details');details.className='time-picker';
    const summary=document.createElement('summary');summary.textContent='Scroll to choose '+name.toLowerCase()+' time';details.append(summary);
    const wheels=document.createElement('div');wheels.className='wheels';details.append(wheels);
    const selects=[['Hour',Array.from({length:12},(_,i)=>String(i+1))],['Minute',Array.from({length:60},(_,i)=>pad(i))],['AM / PM',['AM','PM']]].map(([label,values])=>{
      const wrap=document.createElement('label');wrap.textContent=label;
      const select=document.createElement('select');select.size=3;select.setAttribute('aria-label',`${name} ${label.toLowerCase()}`);
      values.forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;select.append(option);});
      wrap.append(select);wheels.append(wrap);return select;
    });
    const sync=()=>{const parsed=parse(input.value,Date.now()),d=new Date(Number.isFinite(parsed)?parsed:Date.now());selects[0].value=String(d.getHours()%12||12);selects[1].value=pad(d.getMinutes());selects[2].value=d.getHours()<12?'AM':'PM';};
    selects.forEach(select=>select.addEventListener('change',()=>{input.value=`${selects[0].value}:${selects[1].value} ${selects[2].value}`;}));
    details.addEventListener('toggle',()=>{if(details.open){pickers.forEach(p=>{if(p.details!==details)p.details.open=false;});sync();}});
    input.addEventListener('input',sync);input.parentElement.after(details);pickers.push({details,sync});
  });
  ['startInput','endInput'].forEach(id => { $(id).addEventListener('focus',() => $(id).select()); $(id).addEventListener('click',() => $(id).select()); });
  $('cancelEdit').onclick = () => $('editor').close();
  $('editForm').onsubmit = event => {
    event.preventDefault();
    const e=entries.find(e=>e.id===editId);
    if(!e) {$('editor').close();return;}
    const {start,end}=editTimes(e,$('startInput').value,$('endInput').value);
    if(!Number.isFinite(start) || (end!==null && !Number.isFinite(end))) { $('editError').textContent='Enter a time with AM or PM, such as 3:15 PM.'; return; }
    if(end!==null && end<start) { $('editError').textContent='End time must be the same as or later than start time.'; return; }
    if(e) {e.start=start;e.end=end;save();expire(Date.now());}
    $('editor').close();render();
  };
  $('cancelDelete').onclick = () => $('deleteDialog').close();
  $('confirmDelete').onclick = () => { entries=entries.filter(e=>e.id!==deleteId);save();$('deleteDialog').close();render(); };
  $('add').onclick = () => {
    if(!storageOK) {warn('Storage is unavailable. Reload after enabling browser storage before starting an entry.');return;}
    entries.push({id:globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,start:Date.now(),end:null});save();render();$('logs').scrollTop=0;
  };
  window.addEventListener('storage',event => {if(event.key===KEY || event.key===null) {if(read()){expire(Date.now());render();}}});
  document.addEventListener('visibilitychange',() => {if(!document.hidden) tick();});
  window.addEventListener('pageshow',tick);
  if(read()) {expire(Date.now()); if(!localStorage.getItem(KEY)) save();}
  render(); setInterval(tick,1000);
})();
