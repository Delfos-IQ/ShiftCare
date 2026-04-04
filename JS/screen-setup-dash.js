// ════════════════════════════════════════════════════════
//  ShiftCare v2.0 — screen-setup.js + screen-dashboard.js
// ════════════════════════════════════════════════════════

// ── AGE UNIT TOGGLE ──────────────────────────────────────────
function setAgeUnit(u, scope) {
  scope = scope || 'main';
  const key = scope === 'modal' ? 'ageUnitM' : 'ageUnit';
  SC_STATE.set(key, u);
  const sel = scope === 'modal' ? '#modal-addpt .unit-btn' : '#s-setup .unit-btn';
  document.querySelectorAll(sel).forEach(b => b.classList.toggle('active', b.dataset.unit === u));
}

// ── SECONDARY DIAGNOSES ──────────────────────────────────────
function addSD(inpId, tagId, arrKey) {
  const inp = el(inpId), v = inp.value.trim();
  if (!v) return;
  SC_STATE.get(arrKey).push(v);
  inp.value = '';
  renderDTags(tagId, arrKey);
}
function renderDTags(tagId, arrKey) {
  const e = el(tagId); if (!e) return;
  e.innerHTML = SC_STATE.get(arrKey).map((d, i) =>
    `<span class="dtag">${d}<button onclick="rmDiag('${arrKey}',${i},'${tagId}')">×</button></span>`
  ).join('');
}
function rmDiag(arrKey, i, tagId) { SC_STATE.get(arrKey).splice(i, 1); renderDTags(tagId, arrKey); }

// ── PARSE AGE ────────────────────────────────────────────────
function parseAgeDays(val, unit) {
  const n = parseInt(val) || 0;
  if (unit === 'dias')   return n;
  if (unit === 'meses')  return Math.round(n * 30.4);
  if (unit === 'anos')   return Math.round(n * 365);
  return n;
}

// ════════════════════════════════════════════════════════
//  SETUP SCREEN
// ════════════════════════════════════════════════════════
function renderSetup() {
  const pts = SC_STATE.get('patients');
  el('pt-list').innerHTML = pts.map((p, i) => `
    <div class="pt-item">
      <div class="pti">
        <div class="pti-name">${p.name}</div>
        <div class="pti-sub">Cama ${p.bed} · ${SC_STATE.ageLabel(p)}${p.weightKg ? ' · ' + p.weightKg + 'kg' : ''}${p.diagMain ? ' · ' + p.diagMain : ''}</div>
      </div>
      <button class="rm-btn" onclick="removeSetupPt(${i})">×</button>
    </div>`).join('');
  el('start-area').style.display = pts.length ? 'block' : 'none';
}

function addPatient(scope) {
  const s = scope === 'modal';
  const name  = el(s?'m-name':'f-name').value.trim();
  const bed   = el(s?'m-bed':'f-bed').value.trim();
  const age   = el(s?'m-age':'f-age').value.trim();
  const wt    = el(s?'m-weight':'f-weight').value.trim();
  const diag  = el(s?'m-diag':'f-diag').value.trim();
  const unit  = SC_STATE.get(s?'ageUnitM':'ageUnit');
  const secKey= s?'tmpDiagsM':'tmpDiags';
  const tagId = s?'m-dtags':'f-dtags';
  if (!name || !age) { alert('Por favor, preencha o nome e a idade.'); return; }
  SC_STATE.addPatient({
    name, bed, ageDays: parseAgeDays(age, unit),
    weightKg: wt ? parseFloat(wt) : null,
    diagMain: diag,
    diagSec: [...SC_STATE.get(secKey)],
  });
  SC_STATE.set(secKey, []);
  [s?'m-name':'f-name', s?'m-bed':'f-bed', s?'m-age':'f-age', s?'m-weight':'f-weight', s?'m-diag':'f-diag'].forEach(id => { const e=el(id); if(e) e.value=''; });
  el(tagId).innerHTML = '';
  if (s) { closeModal('modal-addpt'); renderDash(); }
  else renderSetup();
}

function removeSetupPt(i) { SC_STATE.removePatient(i); renderSetup(); }

function startShift() {
  if (!SC_STATE.get('patients').length) return;
  SC_STATE.startShift();
  renderDash();
  showScreen('s-dashboard');
}

// ════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════
function renderDash() {
  const pts = SC_STATE.get('patients');
  const start = SC_STATE.get('shiftStart');
  if (start) {
    const mins = Math.round((Date.now() - new Date(start)) / 60000);
    const dur = mins < 60 ? mins + ' min' : Math.floor(mins/60) + 'h ' + (mins%60) + 'min';
    el('dash-sub').textContent = `Turno: ${ft(start)} · ${dur} · ${pts.filter(p=>p.status==='internado').length} doente(s)`;
  }
  const track = el('cards-track'); if (!track) return;
  track.innerHTML = pts.map((p, i) => dashCardHTML(p, i)).join('');
  // Bind open-detail buttons
  track.querySelectorAll('[data-open]').forEach(btn => {
    btn.addEventListener('click', () => openDetail(parseInt(btn.dataset.open)));
  });
  track.querySelectorAll('[data-discharge]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openDischargeModal(parseInt(btn.dataset.discharge)); });
  });
}

function dashCardHTML(p, i) {
  const R = SC_DATA.vitalRanges(p.ageDays);
  const ac = SC_DATA.VITALS.filter(v => { const val=p.vitals[v.k]; return val&&R[v.k]&&SC_DATA.vitalStatus(val,R[v.k])==='alrt'; }).length;
  const td = p.tasks.filter(t => t.done).length;
  const pct = Math.round(td / p.tasks.length * 100);
  const pendTodos = (p.todos||[]).filter(t=>!t.done);
  const statusBadge = p.status !== 'internado'
    ? `<span class="badge badge-g" style="margin-left:8px">${p.status==='alta'?'Alta':'Transferido'}</span>` : '';
  const vRow = SC_DATA.VITALS.slice(0, 4).map(v => {
    const val = p.vitals[v.k];
    const st = val && R[v.k] ? SC_DATA.vitalStatus(val, R[v.k]) : '';
    return `<div class="vt-chip ${st}"><span class="vc-lbl2">${v.label}</span><span class="vc-val2">${val||'—'}</span></div>`;
  }).join('');
  return `<div class="pt-card${ac>0&&p.status==='internado'?' has-alert':''}${p.status!=='internado'?' is-discharged':''}">
    <div class="pc-hdr">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <div style="flex:1;min-width:0">
          <div class="pc-name">${p.name}${statusBadge}</div>
          <div class="pc-meta">
            <span>🛏 Cama ${p.bed}</span>
            <span>📅 ${SC_STATE.ageLabel(p)}</span>
            ${p.weightKg ? `<span>⚖ ${p.weightKg}kg</span>` : ''}
            ${ac>0&&p.status==='internado' ? `<span class="alert-pill">⚠ ${ac}</span>` : ''}
          </div>
          ${p.diagMain ? `<div class="pc-diag">${p.diagMain}</div>` : ''}
        </div>
        ${p.status==='internado' ? `<button class="btn-discharge" data-discharge="${i}" title="Alta / Transferência">🚪</button>` : ''}
      </div>
    </div>
    <div class="pc-body">
      ${ac>0&&p.status==='internado' ? `<div class="alert-ban">⚠ ${ac} constante(s) fora do intervalo pediátrico</div>` : ''}
      <div class="pc-sect">
        <div class="sect-lbl">Sinais Vitais</div>
        <div class="vt-row">${vRow}</div>
        ${p.vitals.lastUp ? `<div style="font-size:10px;color:var(--t3);margin-top:5px">Atualizado: ${ft(p.vitals.lastUp)}</div>` : ''}
      </div>
      <div class="pc-sect">
        <div class="sect-lbl">Cuidados</div>
        <div class="task-prog"><div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div><span class="prog-txt">${td}/${p.tasks.length}</span></div>
        ${pendTodos.length ? `<div style="font-size:11px;color:var(--org);margin-top:5px">📋 ${pendTodos.length} to-do pendente(s)</div>` : ''}
      </div>
      ${p.notes.length ? `<div class="pc-sect"><div class="sect-lbl">Última Nota</div><div style="font-size:11px;color:var(--t2)">[${ft(p.notes[0].timestamp)}] ${p.notes[0].text}</div></div>` : ''}
    </div>
    <div class="pc-foot">
      <button class="btn btn-p" style="width:100%" data-open="${i}" ${p.status!=='internado'?'style="opacity:.6"':''}>Ver Detalhes →</button>
    </div>
  </div>`;
}

// ── NAVIGATION ───────────────────────────────────────────────
let _cardIdx = 0;
function navNext() {
  const pts = SC_STATE.get('patients');
  if (!pts.length) return;
  _cardIdx = (_cardIdx + 1) % pts.length;
  scrollToCard(_cardIdx);
}
function navPrev() {
  const pts = SC_STATE.get('patients');
  if (!pts.length) return;
  _cardIdx = (_cardIdx - 1 + pts.length) % pts.length;
  scrollToCard(_cardIdx);
}
function scrollToCard(i) {
  const t = el('cards-track'); if (!t) return;
  const c = t.children[i]; if (c) c.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'center' });
}

// ── DISCHARGE / TRANSFER ─────────────────────────────────────
function openDischargeModal(i) {
  SC_STATE.set('idx', i);
  el('discharge-pt-name').textContent = SC_STATE.patient(i).name;
  el('discharge-note').value = '';
  openModal('modal-discharge');
}
function confirmDischarge(type) {
  const i = SC_STATE.get('idx');
  const note = el('discharge-note').value.trim();
  SC_STATE.dischargePatient(i, type, note);
  closeModal('modal-discharge');
  renderDash();
}

// ── ADD PATIENT MODAL (dashboard) ────────────────────────────
function openAddPtModal() {
  SC_STATE.set('tmpDiagsM', []);
  ['m-name','m-bed','m-age','m-weight','m-diag'].forEach(id => { const e=el(id); if(e) e.value=''; });
  el('m-dtags').innerHTML = '';
  openModal('modal-addpt');
}

window.setAgeUnit = setAgeUnit;
window.addSD = addSD; window.renderDTags = renderDTags; window.rmDiag = rmDiag;
window.addPatient = addPatient; window.removeSetupPt = removeSetupPt; window.startShift = startShift;
window.renderSetup = renderSetup; window.renderDash = renderDash;
window.navNext = navNext; window.navPrev = navPrev;
window.openDischargeModal = openDischargeModal; window.confirmDischarge = confirmDischarge;
window.openAddPtModal = openAddPtModal;
