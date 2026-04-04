// ════════════════════════════════════════════════════════
//  ShiftCare v2.0 — state.js
//  Central state, patient model, localStorage persistence.
//  PRIVACY: only anonymised patterns go to learning module.
// ════════════════════════════════════════════════════════

const SC_STATE = (() => {
  let _state = {
    patients: [],
    shiftStart: null,
    screen: 'setup',
    prevScreen: null,
    idx: 0,          // active patient index in dashboard
    detailTab: 'vitais',
    ageUnit: 'dias',
    ageUnitM: 'dias',
    tmpDiags: [],
    tmpDiagsM: [],
    qSel: [],
    apiKey: '',
    workerUrl: '',
    useGroq: false,
  };

  // ── Patient factory ──────────────────────────────────────
  function mkPatient(opts = {}) {
    return {
      id: uid(),
      name: opts.name || 'Doente',
      bed: opts.bed || '—',
      ageDays: parseInt(opts.ageDays) || 0,
      weightKg: parseFloat(opts.weightKg) || null,
      diagMain: opts.diagMain || '',
      diagSec: [...(opts.diagSec || [])],
      // Clinical
      antecedentes: '',
      hda: '',
      // Vitals
      vitals: { hr:'', spo2:'', rr:'', temp:'', sbp:'', gluc:'', lastUp: null },
      // Tasks
      tasks: (SC_DATA.DEFAULT_TASKS || []).map((t, i) => ({
        id: i, text: t, done: false, doneAt: null
      })),
      // ABCDE
      abcde: { A:'', B:'', C:'', D:'', E:'' },
      // Unit check
      unitCheck: {},
      // Devices
      devices: [],
      // Medications
      medications: [],
      // Notes
      notes: [],
      // Todo
      todos: [],
      // Status
      status: 'internado', // internado | alta | transferido
      dischargeAt: null,
      dischargeNote: '',
    };
  }

  // ── Age helper ───────────────────────────────────────────
  function ageLabel(p) {
    const d = p.ageDays || 0;
    if (d <= 28)   return d + ' dias';
    if (d < 60)    return d + ' dias';
    const m = Math.floor(d / 30.4);
    if (m < 24)    return m + ' meses';
    const y = Math.floor(d / 365);
    const rm = Math.floor((d % 365) / 30.4);
    return y + 'a' + (rm ? ' ' + rm + 'm' : '');
  }

  // ── Persistence ──────────────────────────────────────────
  const STORE_KEY = 'sc_v2';

  function save() {
    try {
      const toSave = {
        patients: _state.patients,
        shiftStart: _state.shiftStart,
        apiKey: _state.apiKey,
        workerUrl: _state.workerUrl,
        useGroq: _state.useGroq,
      };
      localStorage.setItem(STORE_KEY, JSON.stringify(toSave));
    } catch(e) { console.warn('Save failed', e); }
  }

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      if (d.patients) _state.patients = d.patients;
      if (d.shiftStart) _state.shiftStart = d.shiftStart;
      if (d.apiKey) _state.apiKey = d.apiKey;
      if (d.workerUrl) _state.workerUrl = d.workerUrl;
      if (d.useGroq !== undefined) _state.useGroq = d.useGroq;
    } catch(e) { console.warn('Load failed', e); }
  }

  // ── Getters / setters ────────────────────────────────────
  function get(key)        { return key ? _state[key] : _state; }
  function set(key, val)   { _state[key] = val; }
  function patient(i)      { return _state.patients[i !== undefined ? i : _state.idx]; }
  function activePatient() { return _state.patients[_state.idx]; }

  function addPatient(opts) {
    _state.patients.push(mkPatient(opts));
    save();
  }

  function removePatient(i) {
    _state.patients.splice(i, 1);
    if (_state.idx >= _state.patients.length) _state.idx = Math.max(0, _state.patients.length - 1);
    save();
  }

  function dischargePatient(i, type, note) {
    const p = _state.patients[i];
    if (!p) return;
    p.status = type; // 'alta' | 'transferido'
    p.dischargeAt = new Date().toISOString();
    p.dischargeNote = note || '';
    save();
  }

  function updatePatient(i, patch) {
    if (_state.patients[i]) Object.assign(_state.patients[i], patch);
    save();
  }

  function startShift() {
    if (!_state.shiftStart) _state.shiftStart = new Date().toISOString();
    save();
  }

  return { get, set, patient, activePatient, addPatient, removePatient,
           dischargePatient, updatePatient, save, load, ageLabel };
})();

// ── Tiny utilities (shared) ──────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,5); }
function el(id) { return document.getElementById(id); }
function ft(d)  { return (d ? new Date(d) : new Date()).toLocaleTimeString('pt-PT', { hour:'2-digit', minute:'2-digit' }); }
function fDate(d){ return (d ? new Date(d) : new Date()).toLocaleDateString('pt-PT'); }
function ce(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v]) => {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  });
  children.forEach(c => { if (c != null) e.append(typeof c === 'string' ? c : c); });
  return e;
}

// Navigation
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const e = el(id); if (e) { e.classList.remove('hidden'); SC_STATE.set('screen', id); }
}
function openModal(id)  { const e = el(id); if (e) e.classList.add('open'); }
function closeModal(id) { const e = el(id); if (e) e.classList.remove('open'); }

window.SC_STATE = SC_STATE;
window.uid = uid; window.el = el; window.ft = ft; window.fDate = fDate; window.ce = ce;
window.showScreen = showScreen; window.openModal = openModal; window.closeModal = closeModal;
