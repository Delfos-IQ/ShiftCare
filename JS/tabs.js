// ════════════════════════════════════════════════════════
//  ShiftCare v2.0 — tabs.js
//  All detail tab renderers and logic.
// ════════════════════════════════════════════════════════

// ── DETAIL NAVIGATION ────────────────────────────────────────
function openDetail(i) {
  SC_STATE.set('idx', i);
  const p = SC_STATE.patient(i);
  if (!p) return;
  el('det-name').textContent = `${p.name} — Cama ${p.bed}`;
  updateDetBadge();
  switchTab(SC_STATE.get('detailTab') || 'vitais');
  showScreen('s-detail');
}

function updateDetBadge() {
  const p = SC_STATE.activePatient(); if (!p) return;
  const R = SC_DATA.vitalRanges(p.ageDays);
  const ac = SC_DATA.VITALS.filter(v => { const val=p.vitals[v.k]; return val&&R[v.k]&&SC_DATA.vitalStatus(val,R[v.k])==='alrt'; }).length;
  el('det-badge').innerHTML = ac > 0 ? `<span class="badge badge-r">⚠ ${ac}</span>` : '';
}

function goBack() {
  const s = SC_STATE.get('screen');
  if (s === 's-detail')  { renderDash(); showScreen('s-dashboard'); }
  else if (s === 's-about') showScreen(SC_STATE.get('prevScreen') || 's-dashboard');
  else showScreen('s-setup');
}

const TABS = ['vitais','cuidados','medicacao','isbar','notas'];
function switchTab(tab) {
  SC_STATE.set('detailTab', tab);
  document.querySelectorAll('.tab-item').forEach((e, i) => e.classList.toggle('active', TABS[i] === tab));
  document.querySelectorAll('.tab-pane').forEach(e => e.classList.remove('active'));
  const pane = el('tab-' + tab); if (pane) pane.classList.add('active');
  // Render on demand
  if (tab === 'vitais')    renderVitals();
  if (tab === 'cuidados')  renderCuidados();
  if (tab === 'medicacao') renderMedicacao();
  if (tab === 'isbar')     renderISBAR();
  if (tab === 'notas')     { renderNotes(); renderQCats(''); }
}

// ════════════════════════════════════════════════════════
//  TAB: VITAIS
// ════════════════════════════════════════════════════════
function renderVitals() {
  const p = SC_STATE.activePatient(); if (!p) return;
  const R = SC_DATA.vitalRanges(p.ageDays);
  const g = el('vitals-grid'); if (!g) return;
  g.innerHTML = SC_DATA.VITALS.map(v => {
    const val = p.vitals[v.k];
    const st = val && R[v.k] ? SC_DATA.vitalStatus(val, R[v.k]) : '';
    const rng = R[v.k] ? `${R[v.k][0]}–${R[v.k][1]} ${v.unit}` : '';
    return `<div class="vc ${st}" id="vc-${v.k}">
      <div class="vc-lbl">${v.label}</div>
      <input class="vc-inp" type="number" value="${val||''}" placeholder="${v.ph}"
        oninput="onVI('${v.k}',this.value)" id="vi-${v.k}" step="any">
      <div class="vc-foot"><span class="vc-unit">${v.unit}</span><span class="vc-range">${rng}</span></div>
    </div>`;
  }).join('');
  renderVAlert();
}

function onVI(k, v) {
  const p = SC_STATE.activePatient(); if (!p) return;
  p.vitals[k] = v; p.vitals.lastUp = new Date().toISOString();
  const R = SC_DATA.vitalRanges(p.ageDays);
  const st = v && R[k] ? SC_DATA.vitalStatus(v, R[k]) : '';
  const vc = el('vc-' + k); if (vc) vc.className = 'vc ' + st;
  renderVAlert(); updateDetBadge(); SC_STATE.save();
}

function renderVAlert() {
  const p = SC_STATE.activePatient(); if (!p) return;
  const R = SC_DATA.vitalRanges(p.ageDays);
  const ac = SC_DATA.VITALS.filter(v => { const val=p.vitals[v.k]; return val&&R[v.k]&&SC_DATA.vitalStatus(val,R[v.k])==='alrt'; }).length;
  const e = el('vitals-alert'); if (e) e.innerHTML = ac > 0 ? `<div class="alert-ban">⚠ ${ac} constante(s) fora do intervalo pediátrico normal</div>` : '';
}

function clearVitals() {
  const p = SC_STATE.activePatient(); if (!p || !confirm('Limpar todos os sinais vitais?')) return;
  SC_DATA.VITALS.forEach(v => { p.vitals[v.k] = ''; });
  SC_STATE.save(); renderVitals();
}

// Camera
function openCamera() {
  const hasAI = SC_STATE.get('workerUrl') || SC_STATE.get('apiKey');
  if (!hasAI) { alert('Configure o Worker URL ou a Chave API Groq em "Sobre" para usar esta funcionalidade.'); return; }
  el('photo-input').click();
}

async function handlePhoto(evt) {
  const file = evt.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = async e => {
    const b64 = e.target.result.split(',')[1], mt = file.type || 'image/jpeg';
    el('capture-img').src = e.target.result;
    el('capture-preview-wrap').style.display = 'block';
    const camBtn = el('cam-btn');
    if (camBtn) { camBtn.textContent = '⏳ A interpretar...'; camBtn.disabled = true; }
    try {
      const res = await SC_AI.interpretVitalsImage(b64, mt);
      const vals = JSON.parse((res.text||'{}').replace(/```json|```/g,'').trim());
      const p = SC_STATE.activePatient(); if (!p) return;
      SC_DATA.VITALS.forEach(v => { if (vals[v.k] !== undefined) p.vitals[v.k] = String(vals[v.k]); });
      p.vitals.lastUp = new Date().toISOString();
      SC_STATE.save(); renderVitals();
      const n = Object.keys(vals).length;
      alert(`✅ ${n} valor(es) interpretado(s). Verifique e confirme.`);
    } catch(err) { alert('Erro ao interpretar: ' + err.message); }
    finally {
      el('capture-preview-wrap').style.display = 'none';
      if (camBtn) { camBtn.textContent = '📷 Capturar Ecrã do Monitor'; camBtn.disabled = false; }
    }
  };
  r.readAsDataURL(file);
  evt.target.value = '';
}

// ════════════════════════════════════════════════════════
//  TAB: CUIDADOS (3 sub-sections)
// ════════════════════════════════════════════════════════
let _cuidadosSection = 'enfermagem'; // enfermagem | dispositivos | todo

function renderCuidados() { renderCSection(_cuidadosSection); }

function setCuidadosSection(s) { _cuidadosSection = s; renderCSection(s); }

function renderCSection(s) {
  ['enfermagem','dispositivos','todo'].forEach(k => {
    const e = el('csect-' + k); if (e) e.style.display = 'none';
    const b = el('ctab-' + k); if (b) b.classList.toggle('active', k === s);
  });
  const show = el('csect-' + s); if (show) show.style.display = 'block';
  if (s === 'enfermagem')   renderEnfermagem();
  if (s === 'dispositivos') renderDispositivos();
  if (s === 'todo')         renderTodo();
}

// ── Enfermagem ───────────────────────────────────────────────
function renderEnfermagem() {
  const p = SC_STATE.activePatient(); if (!p) return;
  // ABCDE
  const abcdeHtml = SC_DATA.ABCDE.map(a => `
    <div class="abcde-item">
      <div class="abcde-hdr">
        <div class="abcde-key">${a.key}</div>
        <div><div class="abcde-title">${a.title}</div><div class="abcde-desc">${a.desc}</div></div>
      </div>
      <textarea class="abcde-inp" rows="2" placeholder="Observações..." oninput="saveABCDE('${a.key}',this.value)">${p.abcde?.[a.key]||''}</textarea>
    </div>`).join('');
  // Hygiene
  const hygieneTask = p.tasks.find(t => t.text.includes('Higiene'));
  // Unit check
  const ucHtml = SC_DATA.UNIT_CHECK.map((item, i) => {
    const done = p.unitCheck?.[i] || false;
    return `<div class="task-it">
      <div class="task-chk ${done?'done':''}" onclick="tglUnitCheck(${i})">${done?'<svg width="11" height="8" viewBox="0 0 11 8" fill="none"><path d="M1 3.5L3.8 6.5L10 1" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>':''}</div>
      <div class="task-lbl ${done?'done':''}">${item}</div>
    </div>`;
  }).join('');
  // Tasks
  const tasksHtml = p.tasks.map(t => `
    <div class="task-it">
      <div class="task-chk ${t.done?'done':''}" onclick="tglTask('${t.id}')">${t.done?'<svg width="11" height="8" viewBox="0 0 11 8" fill="none"><path d="M1 3.5L3.8 6.5L10 1" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>':''}</div>
      <div style="flex:1"><div class="task-lbl ${t.done?'done':''}">${t.text}</div>${t.done&&t.doneAt?`<div class="task-time">✓ ${ft(t.doneAt)}</div>`:''}</div>
    </div>`).join('');
  el('csect-enfermagem').innerHTML = `
    <div class="sub-card"><div class="sub-card-hdr">Avaliação ABCDE</div>${abcdeHtml}</div>
    <div class="sub-card"><div class="sub-card-hdr">Lista de Cuidados</div>${tasksHtml}
      <div class="task-add" style="margin-top:10px"><input id="new-task-inp" type="text" placeholder="Adicionar cuidado..."><button class="btn btn-o btn-sm" onclick="addCustomTask()">+</button></div>
    </div>
    <div class="sub-card"><div class="sub-card-hdr">Estado da Unidade</div>${ucHtml}</div>`;
}

function saveABCDE(key, val) {
  const p = SC_STATE.activePatient(); if (!p) return;
  if (!p.abcde) p.abcde = {};
  p.abcde[key] = val; SC_STATE.save();
}

function tglUnitCheck(i) {
  const p = SC_STATE.activePatient(); if (!p) return;
  if (!p.unitCheck) p.unitCheck = {};
  p.unitCheck[i] = !p.unitCheck[i]; SC_STATE.save(); renderEnfermagem();
}

function tglTask(tid) {
  const p = SC_STATE.activePatient(); if (!p) return;
  const t = p.tasks.find(x => String(x.id) === String(tid)); if (!t) return;
  t.done = !t.done; t.doneAt = t.done ? new Date().toISOString() : null;
  if (t.done) SC_LEARN.learnTask(t.text);
  SC_STATE.save(); renderEnfermagem();
}

function addCustomTask() {
  const inp = el('new-task-inp'); if (!inp || !inp.value.trim()) return;
  const p = SC_STATE.activePatient(); if (!p) return;
  p.tasks.push({ id: uid(), text: inp.value.trim(), done: false, doneAt: null });
  SC_LEARN.learnTask(inp.value.trim());
  inp.value = ''; SC_STATE.save(); renderEnfermagem();
}

// ── Dispositivos ─────────────────────────────────────────────
function renderDispositivos() {
  const p = SC_STATE.activePatient(); if (!p) return;
  const cat = SC_DATA.ageCategory(p.ageDays);
  const devHtml = p.devices.map((d, i) => `
    <div class="dev-item">
      <span class="dev-icon">${d.icon||'💉'}</span>
      <div style="flex:1"><div class="dev-lbl">${d.label}</div>${d.gauge?`<div class="dev-sub">${d.gauge}${d.side?' · '+d.side:''}</div>`:''}</div>
      <button class="rm-btn" onclick="removeDevice(${i})">×</button>
    </div>`).join('');
  el('csect-dispositivos').innerHTML = `
    <div class="sub-card">
      <div class="sub-card-hdr" style="display:flex;align-items:center;justify-content:space-between">
        <span>Dispositivos Activos</span>
        <button class="btn btn-o btn-sm" onclick="openAddDeviceModal()">+ Adicionar</button>
      </div>
      ${p.devices.length ? '' : '<div class="empty-st">Sem dispositivos registados</div>'}
      ${devHtml}
    </div>
    <div class="sub-card" style="padding:0;overflow:hidden">
      <div class="sub-card-hdr" style="padding:12px 14px">Figura do Doente</div>
      ${renderBodyFigure(p, cat)}
    </div>`;
}

function renderBodyFigure(p, cat) {
  // SVG body figure with device dots
  const isNeo = cat === 'neonato';
  const isLac = cat === 'lactente';
  const deviceDots = SC_DATA.DEVICE_TYPES.map(dt => {
    if (dt.neo && !isNeo) return '';
    const active = p.devices.some(d => d.typeId === dt.id);
    if (!active) return '';
    return `<circle cx="${dt.x}" cy="${dt.y}" r="3.5" fill="${dt.cat==='acesso'?'#3B82F6':dt.cat==='via_aerea'?'#10B981':dt.cat==='sonda'?'#F59E0B':dt.cat==='dreno'?'#6B7280':'#8B5CF6'}" stroke="white" stroke-width="1" opacity="0.9"><title>${dt.label}</title></circle>`;
  }).join('');
  // Choose figure based on age
  const fig = isNeo ? neonateFig() : isLac ? infantFig() : childFig();
  return `<div style="display:flex;justify-content:center;padding:16px">
    <svg viewBox="0 0 100 100" width="180" height="180" style="overflow:visible">
      ${fig}
      ${deviceDots}
    </svg>
  </div>
  <div style="padding:0 14px 14px;display:flex;flex-wrap:wrap;gap:6px">
    ${SC_DATA.DEVICE_TYPES.filter(dt => !dt.neo || isNeo).map(dt => {
      const active = p.devices.some(d => d.typeId === dt.id);
      return `<span class="i-chip${active?' sel':''}" onclick="toggleDeviceQuick('${dt.id}')" style="font-size:11px;padding:5px 10px">${dt.icon} ${dt.label.split(' ').slice(-1)[0]}</span>`;
    }).join('')}
  </div>`;
}

function neonateFig() {
  return `<g stroke="#94A3B8" stroke-width="1.2" fill="none">
    <!-- head --><circle cx="50" cy="12" r="10" fill="#FDE68A" stroke="#D97706"/>
    <!-- body --><ellipse cx="50" cy="35" rx="14" ry="18" fill="#FDE68A" stroke="#D97706"/>
    <!-- arms --><path d="M36 27 Q26 32 22 44" stroke-linecap="round"/>
    <path d="M64 27 Q74 32 78 44" stroke-linecap="round"/>
    <!-- legs --><path d="M43 52 Q40 65 38 78" stroke-linecap="round"/>
    <path d="M57 52 Q60 65 62 78" stroke-linecap="round"/>
    <!-- umbilicus --><circle cx="50" cy="40" r="2" fill="#E5E7EB" stroke="#9CA3AF"/>
  </g>`;
}
function infantFig() {
  return `<g stroke="#94A3B8" stroke-width="1.2" fill="none">
    <circle cx="50" cy="11" r="9" fill="#FDE68A" stroke="#D97706"/>
    <rect x="39" y="22" width="22" height="26" rx="4" fill="#FDE68A" stroke="#D97706"/>
    <path d="M39 26 Q27 30 24 44" stroke-linecap="round"/>
    <path d="M61 26 Q73 30 76 44" stroke-linecap="round"/>
    <path d="M43 48 L40 70" stroke-linecap="round"/><path d="M57 48 L60 70" stroke-linecap="round"/>
    <path d="M40 70 L37 76" stroke-linecap="round"/><path d="M60 70 L63 76" stroke-linecap="round"/>
  </g>`;
}
function childFig() {
  return `<g stroke="#94A3B8" stroke-width="1.2" fill="none">
    <circle cx="50" cy="10" r="8" fill="#FDE68A" stroke="#D97706"/>
    <rect x="40" y="20" width="20" height="24" rx="3" fill="#FDE68A" stroke="#D97706"/>
    <path d="M40 24 Q30 28 27 42" stroke-linecap="round"/><path d="M60 24 Q70 28 73 42" stroke-linecap="round"/>
    <path d="M44 44 L41 65" stroke-linecap="round"/><path d="M56 44 L59 65" stroke-linecap="round"/>
    <path d="M41 65 L38 72" stroke-linecap="round"/><path d="M59 65 L62 72" stroke-linecap="round"/>
  </g>`;
}

function toggleDeviceQuick(typeId) {
  const p = SC_STATE.activePatient(); if (!p) return;
  const idx = p.devices.findIndex(d => d.typeId === typeId);
  if (idx >= 0) { p.devices.splice(idx, 1); }
  else {
    const dt = SC_DATA.DEVICE_TYPES.find(d => d.id === typeId);
    if (!dt) return;
    p.devices.push({ id: uid(), typeId, label: dt.label, icon: dt.icon, gauge: '', side: '' });
    SC_LEARN.learnDevice(typeId);
  }
  SC_STATE.save(); renderDispositivos();
}

function openAddDeviceModal() {
  el('dev-type-sel').innerHTML = SC_DATA.DEVICE_TYPES.map(d => `<option value="${d.id}">${d.label}</option>`).join('');
  el('dev-gauge-sel').innerHTML = SC_DATA.DEVICE_GAUGES.map(g => `<option value="${g}">${g}</option>`).join('');
  openModal('modal-device');
}
function confirmAddDevice() {
  const p = SC_STATE.activePatient(); if (!p) return;
  const typeId = el('dev-type-sel').value;
  const gauge  = el('dev-gauge-sel').value;
  const side   = el('dev-side-inp').value.trim();
  const dt = SC_DATA.DEVICE_TYPES.find(d => d.id === typeId);
  if (!dt) return;
  p.devices.push({ id: uid(), typeId, label: dt.label, icon: dt.icon, gauge, side });
  SC_LEARN.learnDevice(typeId);
  SC_STATE.save(); closeModal('modal-device'); renderDispositivos();
}
function removeDevice(i) {
  const p = SC_STATE.activePatient(); if (!p) return;
  p.devices.splice(i, 1); SC_STATE.save(); renderDispositivos();
}

// ── To-Do ────────────────────────────────────────────────────
function renderTodo() {
  const p = SC_STATE.activePatient(); if (!p) return;
  if (!p.todos) p.todos = [];
  const listHtml = p.todos.map((t, i) => `
    <div class="task-it">
      <div class="task-chk ${t.done?'done':''}" onclick="tglTodo(${i})">${t.done?'<svg width="11" height="8" viewBox="0 0 11 8" fill="none"><path d="M1 3.5L3.8 6.5L10 1" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>':''}</div>
      <div style="flex:1"><div class="task-lbl ${t.done?'done':''}">${t.text}</div>${t.done?`<div class="task-time">✓ ${ft(t.doneAt)}</div>`:''}</div>
      <button class="rm-btn" onclick="removeTodo(${i})">×</button>
    </div>`).join('') || '<div class="empty-st">Sem tarefas pendentes</div>';
  const quickHtml = SC_DATA.TODO_ITEMS.map(c => `
    <div style="margin-bottom:8px">
      <div class="sect-lbl" style="margin-bottom:6px">${c.cat}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${c.items.map(item =>
        `<button class="i-chip" onclick="addTodoQuick('${item}')">${item}</button>`
      ).join('')}</div>
    </div>`).join('');
  el('csect-todo').innerHTML = `
    <div class="sub-card">
      <div class="sub-card-hdr">To-Do do Turno</div>
      <div id="todo-list">${listHtml}</div>
      <div class="task-add" style="margin-top:10px">
        <input id="todo-inp" type="text" placeholder="Adicionar tarefa...">
        <button class="btn btn-o btn-sm" onclick="addTodoCustom()">+</button>
      </div>
    </div>
    <div class="sub-card"><div class="sub-card-hdr">Acesso Rápido</div>${quickHtml}</div>`;
}

function addTodoQuick(text) {
  const p = SC_STATE.activePatient(); if (!p) return;
  if (!p.todos) p.todos = [];
  if (p.todos.find(t => t.text === text && !t.done)) return;
  p.todos.push({ id: uid(), text, done: false, doneAt: null });
  SC_LEARN.learnTodo(text);
  SC_STATE.save(); renderTodo();
}
function addTodoCustom() {
  const inp = el('todo-inp'); if (!inp || !inp.value.trim()) return;
  addTodoQuick(inp.value.trim()); inp.value = '';
}
function tglTodo(i) {
  const p = SC_STATE.activePatient(); if (!p) return;
  p.todos[i].done = !p.todos[i].done; p.todos[i].doneAt = p.todos[i].done ? new Date().toISOString() : null;
  SC_STATE.save(); renderTodo();
}
function removeTodo(i) { const p = SC_STATE.activePatient(); if (!p) return; p.todos.splice(i,1); SC_STATE.save(); renderTodo(); }

// ════════════════════════════════════════════════════════
//  TAB: MEDICAÇÃO
// ════════════════════════════════════════════════════════
let _medSection = 'horaria'; // horaria | perfusoes

function renderMedicacao() { renderMedSection(_medSection); }
function setMedSection(s) { _medSection = s; renderMedSection(s); }

function renderMedSection(s) {
  ['horaria','perfusoes'].forEach(k => {
    const b = el('mtab-' + k); if (b) b.classList.toggle('active', k === s);
  });
  if (s === 'horaria')   renderMedHoraria();
  if (s === 'perfusoes') renderPerfusoes();
}

function renderMedHoraria() {
  const p = SC_STATE.activePatient(); if (!p) return;
  const meds = (p.medications||[]).filter(m => m.freq !== 'Contínua (perfusão)');
  const medsHtml = meds.map((m, i) => medCardHTML(m, i)).join('') || '<div class="empty-st">Sem medicações horárias registadas</div>';
  el('med-content').innerHTML = `
    <button class="btn btn-p" style="width:100%;margin-bottom:14px" onclick="openAddMedModal('horaria')">+ Adicionar Medicação</button>
    <div id="med-list">${medsHtml}</div>`;
}

function renderPerfusoes() {
  const p = SC_STATE.activePatient(); if (!p) return;
  const meds = (p.medications||[]).filter(m => m.freq === 'Contínua (perfusão)');
  const medsHtml = meds.map((m, i) => perfusaoCardHTML(m, i)).join('') || '<div class="empty-st">Sem perfusões registadas</div>';
  el('med-content').innerHTML = `
    <button class="btn btn-p" style="width:100%;margin-bottom:14px" onclick="openAddMedModal('perfusao')">+ Adicionar Perfusão</button>
    <div id="med-list">${medsHtml}</div>`;
}

function medCardHTML(m, i) {
  const freqH = SC_DATA.MED_FREQS.find(f => f.label === m.freq)?.hours || 0;
  const allDoses = freqH > 0 ? SC_DATA.shiftDoses(m.firstHour || 8, freqH) : [];
  const shiftsHtml = SC_DATA.SHIFTS.map(sh => {
    const doses = allDoses.filter(h => {
      if (sh.start < sh.end) return h >= sh.start && h < sh.end;
      return h >= sh.start || h < sh.end;
    });
    const admKeys = doses.map(h => `${m.id}_${h}`);
    const doseItems = doses.map(h => {
      const key = `${m.id}_${h}`;
      const done = m.administered?.[key];
      return `<span class="dose-pill ${done?'done':''}" onclick="tglDose('${key}',${i})" title="Administrar ${String(h).padStart(2,'0')}h">${String(h).padStart(2,'0')}h</span>`;
    }).join('');
    return `<div class="shift-col" style="border-left:3px solid ${sh.accent}">
      <div class="shift-name" style="color:${sh.accent}">${sh.name}</div>
      <div class="dose-row">${doseItems || '<span style="font-size:10px;color:var(--t3)">—</span>'}</div>
    </div>`;
  }).join('');
  return `<div class="med-card ${m.suspended?'suspended':''}">
    <div class="med-card-hdr">
      <div>
        <div class="med-name">${m.name}</div>
        <div class="med-meta">${m.dose} ${m.unit} · ${m.route} · ${m.freq}</div>
        ${m.suspended ? '<div class="med-suspended-label">SUSPENSO</div>' : ''}
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-o btn-sm" onclick="tglSuspend(${i})">${m.suspended?'Reativar':'Suspender'}</button>
        <button class="rm-btn" onclick="removeMed(${i})">×</button>
      </div>
    </div>
    <div class="shifts-row">${shiftsHtml}</div>
    <div style="padding:6px 12px;border-top:1px solid var(--b)">
      <label style="font-size:10px;color:var(--t3)">Primeira dose: </label>
      <select style="font-size:12px;padding:3px 6px;border:1px solid var(--b);border-radius:5px;background:var(--s2)" onchange="setFirstHour(${i},this.value)">
        ${Array.from({length:24},(_,h)=>`<option value="${h}" ${m.firstHour==h?'selected':''}>${String(h).padStart(2,'0')}h</option>`).join('')}
      </select>
    </div>
  </div>`;
}

function perfusaoCardHTML(m, i) {
  return `<div class="med-card ${m.suspended?'suspended':''}">
    <div class="med-card-hdr">
      <div>
        <div class="med-name">${m.name}</div>
        <div class="med-meta">${m.dose} ${m.unit}/h · ${m.route} · Perfusão Contínua</div>
        ${m.notes ? `<div style="font-size:12px;color:var(--t2);margin-top:3px">${m.notes}</div>` : ''}
        ${m.suspended ? '<div class="med-suspended-label">SUSPENSO</div>' : ''}
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-o btn-sm" onclick="tglSuspend(${i})">${m.suspended?'Reativar':'Suspender'}</button>
        <button class="rm-btn" onclick="removeMed(${i})">×</button>
      </div>
    </div>
    <div style="padding:10px 12px;background:var(--s2);font-size:12px;color:var(--t2)">
      💧 Perfusão contínua a ${m.dose} ${m.unit}/h ${m.suspended?'— SUSPENSA':'— A CORRER'}
    </div>
  </div>`;
}

function openAddMedModal(type) {
  SC_STATE.set('medModalType', type);
  el('add-med-modal-title').textContent = type === 'perfusao' ? 'Adicionar Perfusão' : 'Adicionar Medicação';
  el('med-freq-row').style.display = type === 'perfusao' ? 'none' : 'block';
  el('med-freq-sel').value = type === 'perfusao' ? 'Contínua (perfusão)' : '8/8h';
  el('med-notes-row').style.display = type === 'perfusao' ? 'block' : 'none';
  ['med-name-inp','med-dose-inp','med-notes-inp'].forEach(id => { const e=el(id); if(e) e.value=''; });
  el('med-autocomplete').innerHTML = '';
  openModal('modal-addmed');
}

function onMedNameInput(v) {
  const sugg = SC_LEARN.medSuggestions(v);
  const ac = el('med-autocomplete');
  if (!ac) return;
  ac.innerHTML = sugg.map(s => `<div class="autocomplete-item" onclick="selectMedName('${s}')">${s}</div>`).join('');
}
function selectMedName(name) {
  el('med-name-inp').value = name;
  el('med-autocomplete').innerHTML = '';
}

function confirmAddMed() {
  const p = SC_STATE.activePatient(); if (!p) return;
  const name  = el('med-name-inp').value.trim();
  const dose  = el('med-dose-inp').value.trim();
  const unit  = el('med-unit-sel').value;
  const route = el('med-route-sel').value;
  const type  = SC_STATE.get('medModalType');
  const freq  = type === 'perfusao' ? 'Contínua (perfusão)' : el('med-freq-sel').value;
  const notes = el('med-notes-inp')?.value.trim() || '';
  if (!name || !dose) { alert('Preencha o nome e a dose.'); return; }
  if (!p.medications) p.medications = [];
  p.medications.push({ id: uid(), name, dose, unit, route, freq, firstHour: 8, administered: {}, suspended: false, notes });
  SC_LEARN.learnMed(name);
  SC_STATE.save(); closeModal('modal-addmed'); renderMedSection(_medSection);
}

function tglDose(key, idx) {
  const p = SC_STATE.activePatient(); if (!p) return;
  const m = p.medications[idx]; if (!m) return;
  if (!m.administered) m.administered = {};
  m.administered[key] = !m.administered[key];
  SC_STATE.save(); renderMedSection(_medSection);
}
function tglSuspend(i) {
  const p = SC_STATE.activePatient(); if (!p) return;
  p.medications[i].suspended = !p.medications[i].suspended;
  SC_STATE.save(); renderMedSection(_medSection);
}
function removeMed(i) {
  const p = SC_STATE.activePatient(); if (!p || !confirm('Remover medicação?')) return;
  p.medications.splice(i, 1); SC_STATE.save(); renderMedSection(_medSection);
}
function setFirstHour(i, h) {
  const p = SC_STATE.activePatient(); if (!p) return;
  p.medications[i].firstHour = parseInt(h); SC_STATE.save(); renderMedSection(_medSection);
}

// ════════════════════════════════════════════════════════
//  TAB: ANTECEDENTES / ISBAR
// ════════════════════════════════════════════════════════
let _isbarSection = null; // null=cards | 'ap' | 'hda' | 'isbar'

function renderISBAR() { _isbarSection ? renderISBARDetail(_isbarSection) : renderISBARCards(); }

function renderISBARCards() {
  const p = SC_STATE.activePatient(); if (!p) return;
  el('tab-isbar').innerHTML = `
    <div style="padding:15px">
      <div class="isbar-card" onclick="openISBARSection('ap')">
        <div class="isbar-card-icon">🏥</div>
        <div><div class="isbar-card-title">Antecedentes Pessoais</div>
        <div class="isbar-card-sub">${p.antecedentes ? p.antecedentes.slice(0,60)+'...' : 'Sem antecedentes registados'}</div></div>
        <div class="isbar-arr">›</div>
      </div>
      <div class="isbar-card" onclick="openISBARSection('hda')">
        <div class="isbar-card-icon">📋</div>
        <div><div class="isbar-card-title">História da Doença Actual</div>
        <div class="isbar-card-sub">${p.hda ? p.hda.slice(0,60)+'...' : 'Sem HDA registada'}</div></div>
        <div class="isbar-arr">›</div>
      </div>
      <div class="isbar-divider"></div>
      <div class="isbar-card isbar-card-ai" onclick="openISBARSection('isbar')">
        <div class="isbar-card-icon">🤖</div>
        <div><div class="isbar-card-title">Relatório ISBAR</div>
        <div class="isbar-card-sub">Gerar relatório de passagem de turno com IA</div></div>
        <div class="isbar-arr">›</div>
      </div>
    </div>`;
}

function openISBARSection(s) { _isbarSection = s; renderISBARDetail(s); }

function renderISBARDetail(s) {
  const p = SC_STATE.activePatient(); if (!p) return;
  const backBtn = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
    <button class="btn btn-g" onclick="_isbarSection=null;renderISBAR()">← Voltar</button>
    <div style="font-weight:700;font-size:15px">${s==='ap'?'Antecedentes Pessoais':s==='hda'?'HDA':'Relatório ISBAR'}</div>
  </div>`;
  if (s === 'ap') {
    el('tab-isbar').innerHTML = `<div style="padding:15px">${backBtn}
      <textarea id="ap-inp" rows="12" class="fi" style="font-size:14px;line-height:1.7;resize:vertical" placeholder="Antecedentes pessoais relevantes (patologias crónicas, alergias, cirurgias, medicação habitual, vacinação...)&#10;&#10;Alergias:&#10;Patologias:&#10;Cirurgias:&#10;Medicação habitual:&#10;Vacinação:">${p.antecedentes||''}</textarea>
      <button class="btn btn-p" style="width:100%;margin-top:10px" onclick="saveAP()">Guardar</button>
    </div>`;
  } else if (s === 'hda') {
    el('tab-isbar').innerHTML = `<div style="padding:15px">${backBtn}
      <textarea id="hda-inp" rows="12" class="fi" style="font-size:14px;line-height:1.7;resize:vertical" placeholder="História da doença actual:&#10;&#10;Data de início dos sintomas:&#10;Motivo de internamento:&#10;Evolução clínica:&#10;Exames realizados:&#10;Intervenções efectuadas:">${p.hda||''}</textarea>
      <button class="btn btn-p" style="width:100%;margin-top:10px" onclick="saveHDA()">Guardar</button>
    </div>`;
  } else {
    const hasAI = SC_STATE.get('workerUrl') || SC_STATE.get('apiKey');
    el('tab-isbar').innerHTML = `<div style="padding:15px">${backBtn}
      <div class="sbar-box"><strong>Relatório ISBAR</strong> — Identificação · Situação · Background · Avaliação · Recomendações<br>
      <span style="font-size:11px;color:var(--t3)">Requer ligação à internet. Configure Worker URL ou Chave Groq em "Sobre".</span></div>
      <button class="btn btn-p" style="width:100%;margin-bottom:14px" id="isbar-btn" onclick="generateISBARReport(false)">
        ⚡ Gerar ISBAR deste doente
      </button>
      <button class="btn btn-o" style="width:100%;margin-bottom:14px" onclick="generateISBARReport(true)">
        📋 Gerar ISBAR de todos os doentes
      </button>
      <div id="isbar-out-wrap" style="display:none">
        <div class="sbar-out" id="isbar-text"></div>
        <button class="btn btn-o" style="width:100%;margin-top:9px" onclick="copyISBAR()">Copiar Relatório</button>
      </div>
    </div>`;
  }
}

function saveAP() { const p=SC_STATE.activePatient(); if(!p)return; p.antecedentes=el('ap-inp').value; SC_STATE.save(); _isbarSection=null; renderISBAR(); }
function saveHDA(){ const p=SC_STATE.activePatient(); if(!p)return; p.hda=el('hda-inp').value; SC_STATE.save(); _isbarSection=null; renderISBAR(); }

async function generateISBARReport(all) {
  const hasAI = SC_STATE.get('workerUrl') || SC_STATE.get('apiKey');
  if (!hasAI) { alert('Configure o Worker URL ou a Chave API Groq em "Sobre".'); return; }
  const out = el('isbar-out-wrap'), txt = el('isbar-text');
  if (!out || !txt) return;
  out.style.display = 'block';
  txt.textContent = 'A gerar relatório ISBAR...';
  txt.style.opacity = '.6';
  try {
    const res = await SC_AI.generateISBAR(SC_STATE.activePatient(), !all);
    txt.textContent = res.text || 'Sem conteúdo gerado.';
    txt.style.opacity = '1';
  } catch(e) {
    txt.textContent = 'Erro: ' + e.message;
    txt.style.opacity = '1';
  }
}

function copyISBAR() {
  navigator.clipboard?.writeText(el('isbar-text')?.textContent || '');
  const b = document.querySelector('[onclick="copyISBAR()"]');
  if (b) { b.textContent = 'Copiado ✓'; setTimeout(() => { b.textContent = 'Copiar Relatório'; }, 2000); }
}

// ════════════════════════════════════════════════════════
//  TAB: NOTAS
// ════════════════════════════════════════════════════════
function addNote(customTxt) {
  const inp = el('note-inp');
  const txt = customTxt || (inp ? inp.value.trim() : '');
  if (!txt) return;
  const p = SC_STATE.activePatient(); if (!p) return;
  p.notes.unshift({ id: uid(), text: txt, timestamp: new Date().toISOString() });
  if (inp && !customTxt) inp.value = '';
  SC_STATE.save(); renderNotes();
}

function renderNotes() {
  const p = SC_STATE.activePatient(); if (!p) return;
  const e = el('notes-list'); if (!e) return;
  if (!p.notes.length) { e.innerHTML = '<div class="empty-st">Sem notas de turno</div>'; return; }
  e.innerHTML = p.notes.map(n => `
    <div class="note-it">
      <span class="note-t">${ft(n.timestamp)}</span>
      <span class="note-txt">${n.text}</span>
    </div>`).join('');
}

// Quick actions
let _qSel = [];
function renderQCats(filter) {
  const e = el('quick-cats'); if (!e) return;
  const q = filter.toLowerCase();
  e.innerHTML = SC_DATA.QUICK_CATS.map(c => {
    const items = q ? c.items.filter(i => i.toLowerCase().includes(q) || c.cat.toLowerCase().includes(q)) : c.items;
    if (q && !items.length) return '';
    return `<div class="cat-wrap">
      <div class="cat-hdr ${q?'open':''}" onclick="tglCat(this)">
        <span class="cat-hdr-name">${c.cat}</span><span class="cat-arr">›</span>
      </div>
      <div class="cat-items ${q?'open':''}">
        ${items.map(item => {
          const sel = _qSel.some(s => s.cat===c.cat && s.item===item);
          return `<button class="i-chip ${sel?'sel':''}" onclick="selQItem('${c.cat}','${item}')">${item}</button>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
}

function tglCat(hdr) {
  hdr.classList.toggle('open');
  const items = hdr.nextElementSibling; if (items) items.classList.toggle('open');
}
function selQItem(cat, item) {
  const i = _qSel.findIndex(s => s.cat===cat && s.item===item);
  if (i >= 0) _qSel.splice(i, 1); else _qSel.push({ cat, item });
  updQBuilder(); renderQCats(el('quick-search')?.value || '');
}
function updQBuilder() {
  const b = el('qbuilder'), pv = el('qb-prev'); if (!b || !pv) return;
  if (!_qSel.length) { b.classList.remove('vis'); return; }
  b.classList.add('vis');
  pv.textContent = _qSel.map(s => `${s.cat} › ${s.item}`).join(' | ');
}
function confirmQuick() {
  if (!_qSel.length) return;
  const txt = _qSel.map(s => `${s.cat} › ${s.item}`).join(' | ');
  SC_LEARN.learnQuick(txt);
  addNote(txt); clearQuick();
}
function clearQuick() { _qSel = []; updQBuilder(); renderQCats(el('quick-search')?.value || ''); }
function filterQuick(v) { renderQCats(v); }

// Expose all
Object.assign(window, {
  openDetail, updateDetBadge, goBack, switchTab,
  renderVitals, onVI, clearVitals, openCamera, handlePhoto,
  renderCuidados, setCuidadosSection, saveABCDE, tglUnitCheck, tglTask, addCustomTask,
  renderDispositivos, toggleDeviceQuick, openAddDeviceModal, confirmAddDevice, removeDevice,
  renderTodo, addTodoQuick, addTodoCustom, tglTodo, removeTodo,
  renderMedicacao, setMedSection, openAddMedModal, onMedNameInput, selectMedName,
  confirmAddMed, tglDose, tglSuspend, removeMed, setFirstHour,
  renderISBAR, openISBARSection, saveAP, saveHDA, generateISBARReport, copyISBAR,
  addNote, renderNotes, renderQCats, tglCat, selQItem, confirmQuick, clearQuick, filterQuick,
  neonateFig, infantFig, childFig,
});
