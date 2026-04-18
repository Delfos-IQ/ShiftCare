// PediCode — app.js
// ES module: imports all data, contains all application logic

import { T } from './data/i18n.js';
import { DOSE_DRUGS, ADULT_DOSE_CAP } from './data/drugs.js';
import { INFUSION_DRUGS, INF_DRUG_META, INF_GROUPS_ORDER } from './data/infusions.js';
import { RCP_CARDS } from './data/rcp.js';
import { PROTO, PROTO_CATS } from './data/protocols.js';
import { BROW, SCORE_CATS, VITALS_CATS, CALC_CATS, MEDS_CATS, BROW_ITEM_KEYS, CHANGELOG } from './data/misc.js';
import { renderAITab, aiAnalyze, aiClear, aiUpdateCount } from './data/ai.js';

const INF_GROUP_ICONS  = {'Vasoactivos':'🚨', 'Sedoanalgesia':'😴', 'Otros':'💊'};

// Toggle card open/close
function toggleCard(id){
  const card = document.getElementById(id);
  card.classList.toggle('open');
}

document.addEventListener('DOMContentLoaded', function(){ if(typeof renderProtoUI==='function') renderProtoUI(); });

// Kept as stubs — called nowhere now, safe to leave
function initProtoCheckboxes(){}
function updateProgress(){}
function resetGroup(){}


function buildInfDrugGrid() {
  const grid = document.getElementById('inf-drug-grid');
  if (!grid) return;
  const currentVal = document.getElementById('inf-drug')?.value;

  let html = '';
  INF_GROUPS_ORDER.forEach(group => {
    const drugs = INFUSION_DRUGS.filter(d => (INF_DRUG_META[d.name]?.group || t('sec_otros')) === group);
    if (!drugs.length) return;
    html += `<div style="font-size:10px;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);padding:6px 2px 4px">${INF_GROUP_ICONS[group]} ${group}</div>`;
    drugs.forEach(d => {
      const meta = INF_DRUG_META[d.name] || {icon:'💊', sub:'', color:'#94a3b8'};
      const sel = currentVal === d.name ? 'selected' : '';
      html += `<div class="inf-drug-card ${sel}" onclick="selectInfDrug('${d.name}')">
        <div class="inf-drug-bar" style="background:${meta.color}"></div>
        <div class="inf-drug-icon" style="background:${meta.color}22">${meta.icon}</div>
        <div class="inf-drug-info">
          <div class="inf-drug-name">${d.name}</div>
          <div class="inf-drug-sub">${meta.sub}</div>
        </div>
      </div>`;
    });
  });
  grid.innerHTML = html;
}

function selectInfDrug(name) {
  document.getElementById('inf-drug').value = name;
  // Show pill, hide grid
  document.getElementById('inf-drug-grid').style.display = 'none';
  document.getElementById('inf-presc-box').style.display = 'block';
  const pill = document.getElementById('inf-selected-pill');
  pill.style.display = 'flex';
  const meta = INF_DRUG_META[name] || {icon:'💊', color:'#94a3b8'};
  document.getElementById('inf-pill-icon').textContent = meta.icon;
  document.getElementById('inf-pill-name').textContent = name;
  calcInfusion();
}

function clearInfDrug() {
  document.getElementById('inf-drug').value = '';
  document.getElementById('inf-selected-pill').style.display = 'none';
  document.getElementById('inf-presc-box').style.display = 'none';
  document.getElementById('inf-drug-grid').style.display = 'block';
  buildInfDrugGrid();
  document.getElementById('inf-result-area').innerHTML = '';
}

function calcInfusion() {
  try {
  const w       = parseFloat(document.getElementById('calc-weight').value);
  const name    = document.getElementById('inf-drug').value;
  const drugMg  = parseFloat(document.getElementById('inf-drug-mg').value);
  const volMl   = parseFloat(document.getElementById('inf-vol').value);
  const rateMlH = parseFloat(document.getElementById('inf-rate').value);
  const area    = document.getElementById('inf-result-area');
  if (area) area.style.display = 'block';

  const drug = INFUSION_DRUGS.find(d => d.name === name);

  // Update label dynamically: mg / mcg / U depending on drug
  const unitBadge = document.getElementById('inf-drug-unit-badge');
  const unitLabel = document.getElementById('inf-drug-unit-label');
  const prescUnit = drug ? drug.prescUnit : 'mg';
  const isU   = prescUnit === 'U';
  const isMcg = prescUnit === 'mcg';
  if (unitBadge) unitBadge.textContent = prescUnit;
  if (unitLabel) {
    if (isU)   unitLabel.textContent = t('inf_drug_u_lbl');
    else if (isMcg) unitLabel.textContent = t('inf_drug_mcg_lbl') || 'Cantidad de fármaco (mcg)';
    else       unitLabel.textContent = t('inf_drug_mg_lbl');
  }

  if (!name) {
    area.innerHTML = '<div class="inf-no-weight" style="color:var(--text3)">' + t('inf_select_first') + '</div>';
    return;
  }
  if (!drug) return;

  // Progressive hints
  const missing = [];
  if (!w || w <= 0)           missing.push('⚖️ ' + t('inf_missing_weight'));
  if (!drugMg || drugMg <= 0) missing.push(isU ? t('inf_missing_drugu') : isMcg ? (t('inf_missing_drugmcg') || t('inf_missing_drug').replace('mg','mcg')) : t('inf_missing_drug'));
  if (!volMl || volMl <= 0)   missing.push(t('inf_missing_vol'));
  if (!rateMlH || rateMlH <= 0) missing.push(t('inf_missing_rate'));

  if (missing.length > 0) {
    area.innerHTML = '<div class="inf-no-weight" style="color:var(--text3);text-align:left;line-height:2">' + t('inf_enter_all') + '<br>' + missing.map(m => '&nbsp;&nbsp;· ' + m).join('<br>') + '</div>';
    return;
  }

  // ─── CÁLCULOS ──────────────────────────────────────────────────────────
  // 1. Concentración de la jeringa
  // Normalise input to mg (or U) before calculating concentration
  const drugAmountMg = isMcg ? drugMg / 1000 : drugMg;  // mcg→mg; mg and U pass through
  const conc_per_ml = drugAmountMg / volMl;  // mg/mL (or U/mL for insulin)

  // 2. Dosis que recibe el paciente: dosis/h = conc × rate → dosis/kg/h = ÷ peso
  const dose_per_kg_h = (conc_per_ml * rateMlH) / w;  // mg/kg/h (or U/kg/h)

  // 3. Convertir a la unidad del fármaco
  const unit = drug.unit;
  let doseInUnit;
  if (unit === 'mcg/kg/min')      doseInUnit = dose_per_kg_h * 1000 / 60;  // mg→mcg, h→min
  else if (unit === 'mcg/kg/h')   doseInUnit = dose_per_kg_h * 1000;       // mg→mcg
  else                             doseInUnit = dose_per_kg_h;              // mg/kg/h o U/kg/h

  // 4. Rango check
  let checkCls, checkIcon, checkMsg;
  const rLo = drug.rLo, rHi = drug.rHi;
  if (doseInUnit < rLo) {
    checkCls = 'inf-warn'; checkIcon = '⚠️';
    checkMsg = t('inf_below_range') + ' (' + fmtRange(rLo) + '–' + fmtRange(rHi) + ' ' + unit + ')';
  } else if (doseInUnit > rHi) {
    checkCls = 'inf-err'; checkIcon = '⛔';
    checkMsg = t('inf_above_range') + ' (' + fmtRange(rLo) + '–' + fmtRange(rHi) + ' ' + unit + ')';
  } else {
    checkCls = 'inf-ok'; checkIcon = '✅';
    checkMsg = t('inf_in_range') + ' (' + fmtRange(rLo) + '–' + fmtRange(rHi) + ' ' + unit + ')';
  }

  // 5. Formatear concentración
  const concLabel = isU
    ? `${fmtN(conc_per_ml)} U/mL`
    : conc_per_ml >= 1
      ? `${fmtN(conc_per_ml)} mg/mL`
      : `${fmtN(conc_per_ml * 1000)} mcg/mL`;

  const vol24h = (rateMlH * 24).toFixed(1);
  const drugLabel = isU ? 'U' : 'mg';

  const _in = drugMg + ' ' + drugLabel + ' en ' + volMl + ' mL';
  area.innerHTML =
    '<div class="inf-result-card">' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
    '<div style="text-align:center;padding:8px;background:var(--surface);border:1px solid var(--border);border-radius:8px">' +
    '<div class="inf-result-label">' + t('inf_res_conc') + '</div>' +
    '<div style="font-size:22px;font-weight:700;font-family:\'DM Mono\',monospace;color:var(--text);line-height:1.2;margin-top:4px">' + concLabel + '</div>' +
    '<div style="font-size:10px;color:var(--text3);margin-top:3px">' + _in + '</div>' +
    '</div>' +
    '<div style="text-align:center;padding:8px;background:var(--surface);border:2px solid ' + drug.color + ';border-radius:8px">' +
    '<div class="inf-result-label">' + t('inf_res_dose') + '</div>' +
    '<div style="font-size:22px;font-weight:700;font-family:\'DM Mono\',monospace;color:' + drug.color + ';line-height:1.2;margin-top:4px">' + fmtN(doseInUnit) + '</div>' +
    '<div style="font-size:11px;color:var(--text2);margin-top:2px">' + unit + '</div>' +
    '</div>' +
    '</div>' +
    '<div class="inf-result-check ' + checkCls + '">' + checkIcon + ' ' + checkMsg + '</div>' +
    '</div>' +
    '<div class="inf-detail">' +
    '<div class="inf-detail-box"><div class="inf-detail-label">' + t('inf_res_patient') + '</div><div class="inf-detail-val">' + w + ' kg</div></div>' +
    '<div class="inf-detail-box"><div class="inf-detail-label">' + t('inf_res_rate') + '</div><div class="inf-detail-val">' + rateMlH + ' <span style="font-size:10px">mL/h</span></div></div>' +
    '<div class="inf-detail-box"><div class="inf-detail-label">' + t('inf_res_crude') + '</div><div class="inf-detail-val">' + fmtN(conc_per_ml * rateMlH) + ' <span style="font-size:10px">' + drugLabel + '/h</span></div></div>' +
    '<div class="inf-detail-box"><div class="inf-detail-label">' + t('inf_res_vol24') + '</div><div class="inf-detail-val">' + vol24h + ' <span style="font-size:10px">mL</span></div></div>' +
    '</div>';
  } catch(_e) {
    console.error('[PediCode] Error en calcInfusion:', _e);
    /* ── fallback visual ── */
    try {
      var _errEl = document.querySelector('#inf-result-area');
      if (_errEl) _errEl.innerHTML = '<div style="padding:20px;color:#e05c6e;text-align:center;font-size:13px;">⚠️ Error al cargar esta sección. Recarga la página.</div>';
    } catch(_) {}
  }
}

function fmtN(n) {
  if (!isFinite(n) || n === 0) return '0';
  if (n < 0.001)  return n.toExponential(2);
  if (n < 0.01)   return n.toFixed(4);
  if (n < 0.1)    return n.toFixed(3);
  if (n < 1)      return n.toFixed(2);
  if (n < 100)    return parseFloat(n.toFixed(2)).toString();
  return n.toFixed(1);
}
function fmtRange(n) {
  return parseFloat(n.toFixed(3)).toString().replace('.',',');
}


// ═══ SCORES JS ═══

// ═══ I18N ═══

let currentLang = 'pt';
window._currentLang = currentLang;

// Helper: get translated string
function t(key) {
  return (T[currentLang] && T[currentLang][key]) ? T[currentLang][key] : (T['es'][key] || key);
}

function applyI18nToDOM(lang) {
  const langData = T[lang] || T['es'];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const val = langData[el.dataset.i18n];
    if (val !== undefined) {
      if (el.dataset.i18nHtml) el.innerHTML = val;
      else el.textContent = val;
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const val = langData[el.dataset.i18nPlaceholder];
    if (val !== undefined) el.placeholder = val;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const val = langData[el.dataset.i18nTitle];
    if (val !== undefined) el.title = val;
  });
  document.querySelectorAll('option[data-i18n]').forEach(el => {
    const val = langData[el.dataset.i18n];
    if (val !== undefined) el.textContent = val;
  });
}

function setLang(btn, lang) {
  currentLang = lang;
  window._currentLang = lang;
  document.querySelectorAll('.lang-group .hbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.documentElement.lang = lang;
  const langData = T[lang] || T['es'];

  // 1. Apply i18n to static DOM immediately
  try { applyI18nToDOM(lang); } catch(e) { console.warn('[setLang] applyI18nToDOM:', e); }

  // 2. Re-render RCP tab first (visible tab, highest priority)
  try { renderRcpTab(); } catch(e) { console.warn('[setLang] renderRcpTab:', e); }

  // 3. Chrono/metro button labels (RCP state)
  try {
    const chronoBtn = document.getElementById('rcp-chrono-btn');
    if (chronoBtn) {
      if (rcpChronoRunning) chronoBtn.textContent = langData['rcp_chrono_pause'] || t('rcp_chrono_pause');
      else if (rcpChronoElapsed > 0) chronoBtn.textContent = langData['rcp_chrono_resume'] || t('rcp_chrono_resume');
      else chronoBtn.textContent = langData['rcp_chrono_start'] || t('rcp_chrono_start');
    }
    const metroBtn = document.getElementById('rcp-metro-btn');
    if (metroBtn) {
      metroBtn.textContent = rcpMetroRunning
        ? (langData['rcp_metro_stop'] || t('rcp_metro_stop'))
        : (langData['rcp_metro_activate'] || t('rcp_metro_activate'));
    }
  } catch(e) { console.warn('[setLang] rcp-buttons:', e); }

  // 4. Defer heavy renders to next frame — don't block the active tab
  requestAnimationFrame(() => {
    try { renderEvalUI(); } catch(e) { console.warn('[setLang] renderEvalUI:', e); }
    try { renderDoses(); } catch(e) { console.warn('[setLang] renderDoses:', e); }
    try { dvRenderRights(); } catch(e) { console.warn('[setLang] dvRenderRights:', e); }
    try { compatRenderChips(); } catch(e) { console.warn('[setLang] compatChips:', e); }
    try { compatRenderResults(); } catch(e) { console.warn('[setLang] compatResults:', e); }
    // Mark inactive tabs as stale so they rebuild on next visit
    try {
      const ptH = document.getElementById('pt-cards-hidden'); if(ptH) ptH.dataset.lang='';
    } catch(e) {}
    // Rebuild inactive tabs only if they're currently visible
    const activeTab = document.querySelector('.tab-content.active');
    const activeId = activeTab ? activeTab.id : '';
    if (activeId === 'tab-calc') {
      try { renderCalcUI(); calcInfusion(); } catch(e) {}
    }
    if (activeId === 'tab-scores') {
      try { renderScoresUI(); } catch(e) {}
    }
    if (activeId === 'tab-vitals') {
      try { renderVitalsUI(); } catch(e) {}
    }
    if (activeId === 'tab-protos') {
      try { renderProtoUI(); } catch(e) {}
    }
  });
}


// ════════════════════════════════════════════════════════════════════
// RENDER FUNCTIONS — rebuild language-dependent content on lang change
// ════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════
// EVAL TAB RENDER
// ════════════════════════════════════════════════════════════════════
function renderEvalUI() {
  try {
  // TEP subtitles
  setItemSub('A-tep', 'tep_a_sub');
  setItemSub('B-tep', 'tep_b_sub');
  setItemSub('C-tep', 'tep_c_sub');
  // ABCDE subtitles
  setItemSub('A-abc', 'abc_a_sub');
  setItemSub('B-abc', 'abc_b_sub');
  setItemSub('C-abc', 'abc_c_sub');
  setItemSub('D-abc', 'abc_d_sub');
  setItemSub('E-abc', 'abc_e_sub');

  // Reset buttons
  document.querySelectorAll('.reset-btn').forEach(b => {
    b.textContent = t('reset_btn');
  });

  // TEP panels
  buildPanel('tep-A', null, t('tep_a_desc'), t('tep_a_checklist_title'),
    ['tep_a_c1','tep_a_c2','tep_a_c3','tep_a_c4','tep_a_c5'], 'tep-A');

  buildPanel('tep-B', null, t('tep_b_desc'), t('tep_b_checklist_title'),
    ['tep_b_c1','tep_b_c2','tep_b_c3','tep_b_c4','tep_b_c5','tep_b_c6','tep_b_c7','tep_b_c8'], 'tep-B', true);

  buildPanel('tep-C', null, t('tep_c_desc'), t('tep_c_checklist_title'),
    ['tep_c_c1','tep_c_c2','tep_c_c3','tep_c_c4','tep_c_c5','tep_c_c6'], 'tep-C');

  // ABCDE panels
  buildPanel('abc-A', {cls:'alert-red', txt:t('abc_a_alert')}, t('abc_a_desc'), t('abc_a_checklist_title'),
    ['abc_a_c1','abc_a_c2','abc_a_c3','abc_a_c4','abc_a_c5','abc_a_c6','abc_a_c7'], 'abc-A');

  buildPanel('abc-B', null, t('abc_b_desc'), t('abc_b_checklist_title'),
    ['abc_b_c1','abc_b_c2','abc_b_c3','abc_b_c4','abc_b_c5','abc_b_c6','abc_b_c7'], 'abc-B', true);

  buildPanel('abc-C', {cls:'alert-yellow', txt:t('abc_c_alert')}, t('abc_c_desc'), t('abc_c_checklist_title'),
    ['abc_c_c1','abc_c_c2','abc_c_c3','abc_c_c4','abc_c_c5','abc_c_c6','abc_c_c7','abc_c_c8','abc_c_c9'], 'abc-C');

  buildPanel('abc-D', {cls:'alert-red', icon:'🚨', txt:t('abc_d_alert')}, t('abc_d_desc'), t('abc_d_checklist_title'),
    ['abc_d_c1','abc_d_c2','abc_d_c3','abc_d_c4','abc_d_c5','abc_d_c6','abc_d_c7','abc_d_c8'], 'abc-D');

  buildPanel('abc-E', {cls:'alert-yellow', icon:'🌡️', txt:t('abc_e_alert')}, t('abc_e_desc'), t('abc_e_checklist_title'),
    ['abc_e_c1','abc_e_c2','abc_e_c3','abc_e_c4','abc_e_c5','abc_e_c6','abc_e_c7','abc_e_c8'], 'abc-E');
  } catch(_e) {
    console.error('[PediCode] Error en renderEvalUI:', _e);
    /* ── fallback visual ── */
    try {
      var _errEl = document.querySelector('#tab-rcp');
      if (_errEl) _errEl.innerHTML = '<div style="padding:20px;color:#e05c6e;text-align:center;font-size:13px;">⚠️ Error al cargar esta sección. Recarga la página.</div>';
    } catch(_) {}
  }
}

function setItemSub(key, tkey) {
  const el = document.querySelector('[data-key="' + key + '"] .item-sub');
  if (el) el.textContent = t(tkey);
}

function buildPanel(panelId, alert, desc, checkTitle, checkKeys, resetId, hasVitals) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const wasOpen = panel.classList.contains('open');
  let html = '';
  if (alert) {
    const icon = alert.icon || '⚠️';
    html += '<div class="alert-banner ' + alert.cls + '" style="border-radius:6px;margin-bottom:8px;">' +
      '<span class="alert-icon">' + icon + '</span>' +
      '<div><div style="font-size:11px;font-weight:600;">' + alert.txt + '</div></div></div>';
  }
  html += '<div class="panel-desc">' + desc + '</div>';
  if (checkKeys && checkKeys.length) {
    html += '<div class="panel-title" style="margin-top:10px;margin-bottom:6px;">' + checkTitle + '</div>';
    html += '<ul style="margin:0;padding-left:16px;">';
    checkKeys.forEach(function(k) {
      const txt = t(k);
      if (txt && txt !== k) {
        html += '<li style="font-size:12px;color:var(--text2);margin-bottom:4px;line-height:1.5;">' + txt + '</li>';
      }
    });
    html += '</ul>';
  }
  if (hasVitals && panelId === 'abc-B') {
    html += buildVitalsTable();
  }
  panel.innerHTML = html;
  if (wasOpen) panel.classList.add('open');
}

function buildVitalsTable() {
  const ages = ['RN','3m','6m','1a','2a','3a','5a','7a','10a','12a','15a'];
  const agesT = {
    es:['RN término','3 meses','6 meses','1 año','2 años','3 años','5 años','7 años','10 años','12 años','15 años'],
    pt:['RN de termo','3 meses','6 meses','1 ano','2 anos','3 anos','5 anos','7 anos','10 anos','12 anos','15 anos'],
    en:['Term NB','3 months','6 months','1 year','2 years','3 years','5 years','7 years','10 years','12 years','15 years']
  };
  const rows = [
    [3.5,'30–60','90–180','40–60','3.0–3.5'],
    [5.5,'30–50','90–180','45–75','3.5'],
    [7,'30–40','90–180','50–90','3.5–4'],
    [10,'24–35','90–170','50–100','4.0'],
    [12,'22–30','80–140','50–100','4.5'],
    [15,'20–30','70–140','50–100','5.0'],
    [20,'16–20','70–120','60–90','5.5'],
    [25,'16–20','70–120','60–90','6.0'],
    [35,'16–20','60–110','60–90','6.5'],
    [40,'14–18','60–100','65–95','7.0'],
    [50,'14–16','60–100','65–95','7.5']
  ];
  // Update dose verifier placeholders
  const dvSearch = document.getElementById('dv-search');
  if (dvSearch) dvSearch.placeholder = t('dv_search_ph');
  const ageLabels = agesT[currentLang] || agesT.es;
  let html = '<div class="vitals-section"><div class="panel-title">' + t('vitals_ref_title') + '</div>' +
    '<div class="vitals-table-wrap"><table class="vtable"><thead><tr>' +
    '<th>'+t('th_age')+'</th>' +
    '<th><span class="vt vt-wt">'+t('th_weight')+'</span></th>' +
    '<th><span class="vt vt-fr">'+t('th_rr_m').replace('/min','')+'</span>/min</th>' +
    '<th><span class="vt vt-fc">'+t('th_hr_m').replace('/min','')+'</span>/min</th>' +
    '<th><span class="vt vt-ta">'+t('th_sbp_m').replace(' mmHg','')+'</span> mmHg</th>' +
    '<th>TET</th></tr></thead><tbody>';
  rows.forEach(function(r, i) {
    html += '<tr><td>' + ageLabels[i] + '</td><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td><td>' + r[3] + '</td><td>' + r[4] + '</td></tr>';
  });
  html += '</tbody></table></div>' +
    '<div style="font-size:10px;color:var(--text3);margin-top:5px;font-family:\'DM Mono\',monospace;">' + t('vitals_ref_note') + '</div></div>';
  return html;
}

function renderCalcUI() {
  try {
  // Weight card
  const wLbl = document.querySelector('.weight-label');
  if (wLbl) wLbl.textContent = t('calc_weight_label');
  const wHint = document.querySelector('.weight-hint');
  if (wHint) wHint.textContent = t('calc_weight_hint');

  // Sub-tab buttons
  const btns = document.querySelectorAll('.calc-sub-btn');
  if (btns[0]) btns[0].textContent = t('calc_dose_btn');
  if (btns[1]) btns[1].textContent = t('calc_inf_btn');

  // Category filter
  const catBtns = document.querySelectorAll('#cat-filter .cat-btn');
  const catKeys = ['calc_all','calc_cat_rcp','calc_cat_sedo','calc_cat_bnm','calc_cat_antiepi','calc_cat_antidoto','calc_cat_otros'];
  catBtns.forEach((b,i) => { if (catKeys[i]) b.textContent = t(catKeys[i]); });

  // Infusion panel labels
  const dLbl = document.getElementById('inf-drug-lbl');
  if (dLbl) dLbl.textContent = t('inf_drug_lbl');

  const sel = document.getElementById('inf-drug');
  if (sel) {
    const first = sel.querySelector('option[value=""]');
    if (first) first.textContent = t('inf_drug_select');
    const grps = sel.querySelectorAll('optgroup');
    if (grps[0]) grps[0].label = t('inf_grp_vaso');
    if (grps[1]) grps[1].label = t('inf_grp_sedo');
    if (grps[2]) grps[2].label = t('inf_grp_otros');
  }

  const rxHdr = document.getElementById('inf-rx-header');
  if (rxHdr) rxHdr.textContent = t('inf_rx_header');

  const isU = document.getElementById('inf-drug') && document.getElementById('inf-drug').value === 'Insulina';
  const unitLbl = document.getElementById('inf-drug-unit-label');
  if (unitLbl) unitLbl.textContent = t(isU ? 'inf_drug_u_lbl' : 'inf_drug_mg_lbl');

  const volLbl = document.getElementById('inf-vol-lbl');
  if (volLbl) volLbl.textContent = t('inf_vol_lbl');

  const rateLbl = document.getElementById('inf-rate-lbl');
  if (rateLbl) rateLbl.textContent = t('inf_rate_lbl');

  const disc = document.getElementById('inf-disclaimer-txt');
  if (disc) disc.textContent = t('inf_disclaimer');

  // Dose empty state
  const doseEmpty = document.querySelector('#dose-results .dose-empty');
  if (doseEmpty) doseEmpty.textContent = t('calc_dose_empty');

  // Score filter buttons
  const sfBtns = document.querySelectorAll('.sc-filter .cat-btn');
  const sfKeys = ['sc_filter_all','sc_filter_neuro','sc_filter_resp','sc_filter_trauma','sc_filter_dolor','sc_filter_brow'];
  sfBtns.forEach((b,i) => { if (sfKeys[i]) b.textContent = t(sfKeys[i]); });

  // Search placeholder
  const srch = document.getElementById('scores-search');
  if (srch) srch.placeholder = t('sc_search_ph');
  } catch(_e) {
    console.error('[PediCode] Error en renderCalcUI:', _e);
    /* ── fallback visual ── */
    try {
      var _errEl = document.querySelector('#tab-calc');
      if (_errEl) _errEl.innerHTML = '<div style="padding:20px;color:#e05c6e;text-align:center;font-size:13px;">⚠️ Error al cargar esta sección. Recarga la página.</div>';
    } catch(_) {}
  }
}

// ── Scores full rebuild ──────────────────────────────────────────────────────
function renderScoresUI() {
  try {
  // ── Broselow ──
  const browTitle = document.querySelector('#sc-brow .sc-title');
  if (browTitle) browTitle.textContent = t('brow_title');
  const browTag = document.querySelector('#sc-brow .sc-tag');
  if (browTag) browTag.textContent = t('sc_tag_material');
  const browHtLbl = document.getElementById('brow-height-lbl');
  if (browHtLbl) browHtLbl.textContent = t('brow_height_lbl');
  const browHint = document.getElementById('brow-hint');
  if (browHint) browHint.textContent = t('brow_hint');
  // re-run Broselow if height entered
  calcBroselow();

  // ── GCS ──
  renderGCS();

  // ── Pupils ──
  renderPupils();

  // ── PEWS ──
  renderPEWS();

  // ── Westley ──
  renderWestley();

  // ── Wood-Downes ──
  renderWood();

  // ── PECARN ──
  renderPECARN();

  // ── Pain ──
  renderPain();

  // No-results text
  const nr = document.getElementById('scores-no-results');
  if (nr) nr.textContent = t('sc_no_results');

  // Score card tag labels
  document.querySelectorAll('#sc-gcs .sc-t-neuro, #sc-pupils .sc-t-neuro, #sc-pews .sc-t-gen').forEach(el => {
    if (el.classList.contains('sc-t-neuro')) el.textContent = t('sc_tag_neuro');
    if (el.classList.contains('sc-t-gen')) el.textContent = t('sc_tag_gen');
  });
  document.querySelectorAll('#sc-westley .sc-t-resp, #sc-wood .sc-t-resp').forEach(el => el.textContent = t('sc_tag_resp'));
  document.querySelectorAll('#sc-pecarn .sc-t-trauma').forEach(el => el.textContent = t('sc_tag_trauma'));
  document.querySelectorAll('#sc-pain .sc-t-dolor').forEach(el => el.textContent = t('sc_tag_dolor'));

  const scDisc = document.getElementById('sc-disclaimer');
  if (scDisc) scDisc.textContent = t('sc_disclaimer');
  } catch(_e) {
    console.error('[PediCode] Error en renderScoresUI:', _e);
    /* ── fallback visual ── */
    try {
      var _errEl = document.querySelector('#tab-scores');
      if (_errEl) _errEl.innerHTML = '<div style="padding:20px;color:#e05c6e;text-align:center;font-size:13px;">⚠️ Error al cargar esta sección. Recarga la página.</div>';
    } catch(_) {}
  }
}

function renderGCS() {
  const body = document.querySelector('#sc-gcs .sc-body');
  if (!body) return;
  document.querySelector('#sc-gcs .sc-title').textContent = t('gcs_title');
  body.innerHTML =
    '<div style="overflow-x:auto"><table class="sc-tbl">' +
    '<thead><tr>' +
    '<th>' + t('gcs_pts') + '</th>' +
    '<th>' + t('gcs_eye') + '</th>' +
    '<th>' + t('gcs_verbal') + '</th>' +
    '<th>' + t('gcs_motor') + '</th>' +
    '</tr></thead><tbody>' +
    '<tr><td><span class="sv sv-g">4</span></td><td>' + t('gcs_e4') + '</td><td>' + t('gcs_v5').split('/')[0].trim() + '</td><td>—</td></tr>' +
    '<tr><td><span class="sv sv-g">5–6</span></td><td>—</td><td>' + t('gcs_v5') + '</td><td>' + t('gcs_m6') + '</td></tr>' +
    '<tr><td><span class="sv sv-y">3</span></td><td>' + t('gcs_e3') + '</td><td>' + t('gcs_v4') + '</td><td>' + t('gcs_m4') + '</td></tr>' +
    '<tr><td><span class="sv sv-o">3–4</span></td><td>—</td><td>' + t('gcs_v3') + '</td><td>' + t('gcs_m3') + '</td></tr>' +
    '<tr><td><span class="sv sv-o">2</span></td><td>' + t('gcs_e2') + '</td><td>' + t('gcs_v2') + '</td><td>' + t('gcs_m2') + '</td></tr>' +
    '<tr><td><span class="sv sv-r">1</span></td><td>' + t('gcs_e1') + '</td><td>' + t('gcs_v1') + '</td><td>' + t('gcs_m1') + '</td></tr>' +
    '</tbody></table></div>' +
    '<div class="sc-severity" style="grid-template-columns:repeat(3,1fr)">' +
    '<div class="sc-sev-row" style="background:rgba(52,211,153,.08);border-color:rgba(52,211,153,.3)"><div><div class="sc-sev-score" style="color:var(--green)">13–15</div><div class="sc-sev-label" style="color:var(--green)">' + t('gcs_mild') + '</div></div></div>' +
    '<div class="sc-sev-row" style="background:rgba(251,191,36,.08);border-color:rgba(251,191,36,.3)"><div><div class="sc-sev-score" style="color:var(--yellow)">9–12</div><div class="sc-sev-label" style="color:var(--yellow)">' + t('gcs_mod') + '</div></div></div>' +
    '<div class="sc-sev-row" style="background:rgba(248,113,113,.1);border-color:rgba(248,113,113,.3)"><div><div class="sc-sev-score" style="color:var(--red)">≤8</div><div class="sc-sev-label" style="color:var(--red)">' + t('gcs_severe') + '</div></div></div>' +
    '</div>' +
    '<div class="sc-alert sc-a-r">' + t('gcs_alert') + '</div>' +
    '<div class="sc-ref">📖 ' + t('gcs_ref') + '</div>';
}

function renderPupils() {
  const body = document.querySelector('#sc-pupils .sc-body');
  if (!body) return;
  document.querySelector('#sc-pupils .sc-title').textContent = t('pupils_title');
  body.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">' +
    pupilBox('rgba(52,211,153,.08)','rgba(52,211,153,.3)','●●','var(--green)', t('pupils_sym'), t('pupils_sym_desc')) +
    pupilBox('rgba(248,113,113,.08)','rgba(248,113,113,.3)','◉●','var(--red)', t('pupils_aniso'), t('pupils_aniso_desc')) +
    pupilBox('rgba(248,113,113,.12)','rgba(248,113,113,.4)','○○','var(--red)', t('pupils_mydriasis'), t('pupils_mydriasis_desc')) +
    pupilBox('rgba(56,189,248,.08)','rgba(56,189,248,.3)','⊙⊙','var(--accent)', t('pupils_miosis'), t('pupils_miosis_desc')) +
    '</div>' +
    '<div class="sc-alert sc-a-r">' + t('pupils_alert') + '</div>';
}
function pupilBox(bg, border, sym, col, name, desc) {
  return '<div style="background:' + bg + ';border:1px solid ' + border + ';border-radius:8px;padding:10px">' +
    '<div style="font-size:22px;margin-bottom:4px">' + sym + '</div>' +
    '<div style="font-size:12px;font-weight:600;color:' + col + '">' + name + '</div>' +
    '<div style="font-size:11px;color:var(--text3);margin-top:3px">' + desc + '</div>' +
    '</div>';
}

function renderPEWS() {
  const body = document.querySelector('#sc-pews .sc-body');
  if (!body) return;
  document.querySelector('#sc-pews .sc-title').textContent = t('pews_title');
  const svG='<span class="sv sv-g">0</span>', svY='<span class="sv sv-y">1</span>', svO='<span class="sv sv-o">2</span>', svR='<span class="sv sv-r">3</span>';
  body.innerHTML =
    '<div style="overflow-x:auto"><table class="sc-tbl">' +
    '<thead><tr><th>' + t('pews_cat') + '</th><th>' + svG + '</th><th>' + svY + '</th><th>' + svO + '</th><th>' + svR + '</th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>' + t('pews_behaviour') + '</strong></td><td>' + t('pews_b0') + '</td><td>' + t('pews_b1') + '</td><td>' + t('pews_b2') + '</td><td>' + t('pews_b3') + '</td></tr>' +
    '<tr><td><strong>' + t('pews_cardio') + '</strong></td><td>' + t('pews_c0') + '</td><td>' + t('pews_c1') + '</td><td>' + t('pews_c2') + '</td><td>' + t('pews_c3') + '</td></tr>' +
    '<tr><td><strong>' + t('pews_resp') + '</strong></td><td>' + t('pews_r0') + '</td><td>' + t('pews_r1') + '</td><td>' + t('pews_r2') + '</td><td>' + t('pews_r3') + '</td></tr>' +
    '</tbody></table></div>' +
    '<div class="sc-severity" style="grid-template-columns:repeat(4,1fr);margin-top:8px">' +
    pewsSev('var(--green)','rgba(52,211,153,.08)','rgba(52,211,153,.3)','0–2', t('pews_stable')) +
    pewsSev('var(--yellow)','rgba(251,191,36,.08)','rgba(251,191,36,.3)','3–4', t('pews_warn')) +
    pewsSev('var(--orange)','rgba(251,146,60,.1)','rgba(251,146,60,.3)','5–6', t('pews_urgent')) +
    pewsSev('var(--red)','rgba(248,113,113,.1)','rgba(248,113,113,.3)','≥7', t('pews_arrest')) +
    '</div>' +
    '<div class="sc-alert sc-a-r">' + t('pews_alert') + '</div>' +
    '<div class="sc-ref">📖 ' + t('pews_ref') + '</div>';
}
function pewsSev(col, bg, border, score, label) {
  return '<div class="sc-sev-row" style="flex-direction:column;align-items:center;text-align:center;background:' + bg + ';border-color:' + border + '">' +
    '<div class="sc-sev-score" style="color:' + col + '">' + score + '</div>' +
    '<div class="sc-sev-label" style="color:' + col + ';font-size:10px">' + label + '</div></div>';
}

function renderWestley() {
  const body = document.querySelector('#sc-westley .sc-body');
  if (!body) return;
  document.querySelector('#sc-westley .sc-title').textContent = t('westley_title');
  const svG='<span class="sv sv-g">0</span>';
  body.innerHTML =
    '<div style="overflow-x:auto"><table class="sc-tbl">' +
    '<thead><tr><th>' + t('westley_param') + '</th><th>' + t('westley_finding') + '</th><th>' + t('westley_pts') + '</th></tr></thead>' +
    '<tbody>' +
    westleyRows(t('westley_stridor'), [[t('westley_s0'),'sv-g','0'],[t('westley_s1'),'sv-y','1'],[t('westley_s2'),'sv-o','2']]) +
    westleyRows(t('westley_retr'),    [[t('westley_re0'),'sv-g','0'],[t('westley_re1'),'sv-y','1'],[t('westley_re2'),'sv-o','2']]) +
    westleyRows(t('westley_air'),     [[t('westley_air0'),'sv-g','0'],[t('westley_air1'),'sv-y','1'],[t('westley_air2'),'sv-r','2']]) +
    westleyRows(t('westley_cyan'),    [[t('westley_cyan0'),'sv-g','0'],[t('westley_cyan4'),'sv-o','4'],[t('westley_cyan5'),'sv-r','5']]) +
    westleyRows(t('westley_loc'),     [[t('westley_loc0'),'sv-g','0'],[t('westley_loc2'),'sv-y','2'],[t('westley_loc5'),'sv-r','5']]) +
    '</tbody></table></div>' +
    '<div class="sc-severity">' +
    wSev('var(--green)','rgba(52,211,153,.08)','rgba(52,211,153,.3)','≤2', t('westley_mild'), t('westley_mild_rx')) +
    wSev('var(--yellow)','rgba(251,191,36,.08)','rgba(251,191,36,.3)','3–7', t('westley_mod'), t('westley_mod_rx')) +
    wSev('var(--red)','rgba(248,113,113,.1)','rgba(248,113,113,.3)','≥8', t('westley_sev'), t('westley_sev_rx')) +
    '</div>' +
    '<div class="sc-ref">📖 ' + t('westley_ref') + '</div>';
}
function westleyRows(param, rows) {
  return rows.map((r,i) =>
    '<tr>' + (i===0 ? '<td rowspan=3><strong>' + param + '</strong></td>' : '') +
    '<td>' + r[0] + '</td><td><span class="sv ' + r[1] + '">' + r[2] + '</span></td></tr>'
  ).join('');
}
function wSev(col, bg, border, score, label, action) {
  return '<div class="sc-sev-row" style="background:' + bg + ';border-color:' + border + '">' +
    '<div class="sc-sev-score" style="color:' + col + '">' + score + '</div>' +
    '<div><div class="sc-sev-label" style="color:' + col + '">' + label + '</div>' +
    '<div class="sc-sev-action">' + action + '</div></div></div>';
}

function renderWood() {
  const body = document.querySelector('#sc-wood .sc-body');
  if (!body) return;
  document.querySelector('#sc-wood .sc-title').textContent = t('wood_title');
  body.innerHTML =
    '<div style="overflow-x:auto"><table class="sc-tbl">' +
    '<thead><tr><th>' + t('westley_param') + '</th>' +
    '<th><span class="sv sv-g">0</span></th><th><span class="sv sv-y">1</span></th><th><span class="sv sv-r">2</span></th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>' + t('wood_sib') + '</strong></td><td>' + t('wood_sib0') + '</td><td>' + t('wood_sib1') + '</td><td>' + t('wood_sib2') + '</td></tr>' +
    '<tr><td><strong>' + t('wood_musc') + '</strong></td><td>' + t('wood_musc0') + '</td><td>' + t('wood_musc1') + '</td><td>' + t('wood_musc2') + '</td></tr>' +
    '<tr><td><strong>' + t('wood_mv') + '</strong></td><td>' + t('wood_mv0') + '</td><td>' + t('wood_mv1') + '</td><td>' + t('wood_mv2') + '</td></tr>' +
    '<tr><td><strong>' + t('wood_cyan') + '</strong></td><td>' + t('wood_cyan0') + '</td><td>' + t('wood_cyan1') + '</td><td>' + t('wood_cyan2') + '</td></tr>' +
    '</tbody></table></div>' +
    '<div class="sc-severity" style="grid-template-columns:repeat(4,1fr)">' +
    pewsSev('var(--green)','rgba(52,211,153,.08)','rgba(52,211,153,.3)','0–3', t('wood_mild')) +
    pewsSev('var(--yellow)','rgba(251,191,36,.08)','rgba(251,191,36,.3)','4–6', t('wood_mod')) +
    pewsSev('var(--orange)','rgba(251,146,60,.1)','rgba(251,146,60,.3)','7', t('wood_sev')) +
    pewsSev('var(--red)','rgba(248,113,113,.1)','rgba(248,113,113,.3)','8', t('wood_vsev')) +
    '</div>' +
    '<div class="sc-ref" style="margin-top:8px">' + t('wood_note') + '</div>' +
    '<div class="sc-ref">📖 ' + t('wood_ref') + '</div>';
}

function renderPECARN() {
  const body = document.querySelector('#sc-pecarn .sc-body');
  if (!body) return;
  document.querySelector('#sc-pecarn .sc-title').textContent = t('pecarn_title');
  body.innerHTML =
    '<div style="font-size:11px;color:var(--text2);margin-bottom:10px;padding:7px 9px;background:var(--surface2);border-radius:6px">' + t('pecarn_intro') + '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
    pecarnBox(t('pecarn_lt2'), t('pecarn_ct_now'),
      [t('pecarn_lt2_ct1'), t('pecarn_lt2_ct2'), t('pecarn_lt2_ct3')],
      t('pecarn_obs'),
      [t('pecarn_lt2_obs1'), t('pecarn_lt2_obs2'), t('pecarn_lt2_obs3'), t('pecarn_lt2_obs4')]) +
    pecarnBox(t('pecarn_ge2'), t('pecarn_ct_now'),
      [t('pecarn_ge2_ct1'), t('pecarn_ge2_ct2') + '<br><span style="color:var(--text3)">' + t('pecarn_ge2_ct2b') + '</span>'],
      t('pecarn_obs'),
      [t('pecarn_ge2_obs1'), t('pecarn_ge2_obs2'), t('pecarn_ge2_obs3'), t('pecarn_ge2_obs4')]) +
    '</div>' +
    '<div style="font-size:10px;color:var(--text3);margin-top:8px;padding:6px 8px;background:var(--surface2);border-radius:5px;line-height:1.6">' + t('pecarn_mech') + '</div>' +
    '<div class="sc-ref">📖 ' + t('pecarn_ref') + '</div>';
}
function pecarnBox(age, ctLabel, ctItems, obsLabel, obsItems) {
  return '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">' +
    '<div style="padding:7px 10px;background:var(--surface2);font-size:12px;font-weight:600;color:var(--accent)">' + age + '</div>' +
    '<div style="padding:9px 10px">' +
    '<div style="font-size:11px;font-weight:600;color:var(--red);margin-bottom:5px">' + ctLabel + '</div>' +
    '<div style="font-size:11px;color:var(--text2);line-height:1.7;margin-bottom:8px">' + ctItems.map(i => '● ' + i).join('<br>') + '</div>' +
    '<div style="font-size:11px;font-weight:600;color:var(--yellow);margin-bottom:5px">' + obsLabel + '</div>' +
    '<div style="font-size:11px;color:var(--text2);line-height:1.7">' + obsItems.map(i => '● ' + i).join('<br>') + '</div>' +
    '</div></div>';
}

function renderPain() {
  const body = document.querySelector('#sc-pain .sc-body');
  if (!body) return;
  document.querySelector('#sc-pain .sc-title').textContent = t('pain_title');
  const th0 = '<span class="sv sv-g">0</span>', th1 = '<span class="sv sv-y">1</span>', th2 = '<span class="sv sv-r">2</span>';
  body.innerHTML =
    // NIPS
    '<div class="sc-subsection">' + t('nips_title') + ' <span class="sc-pain-age">' + t('nips_age') + '</span></div>' +
    '<div style="overflow-x:auto"><table class="sc-tbl"><thead><tr><th>' + t('westley_param') + '</th><th>' + th0 + '</th><th>' + th1 + '</th><th>' + th2 + '</th></tr></thead><tbody>' +
    '<tr><td>' + t('nips_face') + '</td><td>' + t('nips_face0') + '</td><td>' + t('nips_face1') + '</td><td>—</td></tr>' +
    '<tr><td>' + t('nips_cry') + '</td><td>' + t('nips_cry0') + '</td><td>' + t('nips_cry1') + '</td><td>' + t('nips_cry2') + '</td></tr>' +
    '<tr><td>' + t('nips_breathing') + '</td><td>' + t('nips_br0') + '</td><td>' + t('nips_br1') + '</td><td>—</td></tr>' +
    '<tr><td>' + t('nips_arms') + '</td><td>' + t('nips_arms0') + '</td><td>' + t('nips_arms1') + '</td><td>—</td></tr>' +
    '<tr><td>' + t('nips_legs') + '</td><td>' + t('nips_legs0') + '</td><td>' + t('nips_legs1') + '</td><td>—</td></tr>' +
    '<tr><td>' + t('nips_state') + '</td><td>' + t('nips_state0') + '</td><td>' + t('nips_state1') + '</td><td>—</td></tr>' +
    '</tbody></table></div>' +
    '<div style="font-size:10px;color:var(--text3);margin-bottom:10px;padding:4px 6px">' + t('nips_ref') + '</div>' +
    // FLACC
    '<div class="sc-subsection">' + t('flacc_title') + ' <span class="sc-pain-age">' + t('flacc_age') + '</span></div>' +
    '<div style="overflow-x:auto"><table class="sc-tbl"><thead><tr><th>' + t('westley_param') + '</th><th>' + th0 + '</th><th>' + th1 + '</th><th>' + th2 + '</th></tr></thead><tbody>' +
    '<tr><td><strong>F</strong>ace</td><td>' + t('flacc_face0') + '</td><td>' + t('flacc_face1') + '</td><td>' + t('flacc_face2') + '</td></tr>' +
    '<tr><td><strong>L</strong>egs</td><td>' + t('flacc_legs0') + '</td><td>' + t('flacc_legs1') + '</td><td>' + t('flacc_legs2') + '</td></tr>' +
    '<tr><td><strong>A</strong>ctivity</td><td>' + t('flacc_act0') + '</td><td>' + t('flacc_act1') + '</td><td>' + t('flacc_act2') + '</td></tr>' +
    '<tr><td><strong>C</strong>ry</td><td>' + t('flacc_cry0') + '</td><td>' + t('flacc_cry1') + '</td><td>' + t('flacc_cry2') + '</td></tr>' +
    '<tr><td><strong>C</strong>onsolability</td><td>' + t('flacc_cons0') + '</td><td>' + t('flacc_cons1') + '</td><td>' + t('flacc_cons2') + '</td></tr>' +
    '</tbody></table></div>' +
    '<div style="font-size:10px;color:var(--text3);margin-bottom:10px;padding:4px 6px">' + t('flacc_ref') + '</div>' +
    // FACES
    '<div class="sc-subsection">' + t('faces_title') + ' <span class="sc-pain-age">' + t('faces_age') + '</span></div>' +
    '<div style="display:flex;justify-content:space-around;align-items:flex-end;padding:8px 0;margin-bottom:4px">' +
    faceItem('😊','0', t('faces_0'),'var(--green)') + faceItem('🙂','2', t('faces_2'),'var(--green)') +
    faceItem('😐','4', t('faces_4'),'var(--yellow)') + faceItem('😟','6', t('faces_6'),'var(--yellow)') +
    faceItem('😢','8', t('faces_8'),'var(--orange)') + faceItem('😭','10', t('faces_10'),'var(--red)') +
    '</div>' +
    '<div style="font-size:10px;color:var(--text3);margin-bottom:10px;padding:4px 6px">' + t('faces_ref') + '</div>' +
    // NUMERIC
    '<div class="sc-subsection">' + t('numeric_title') + ' <span class="sc-pain-age">' + t('numeric_age') + '</span></div>' +
    '<div style="padding:8px 0"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
    '<span style="font-size:11px;font-family:\'DM Mono\',monospace;color:var(--green);font-weight:600">0</span>' +
    '<div style="flex:1;height:12px;border-radius:6px;background:linear-gradient(to right,#34d399,#fbbf24,#f87171)"></div>' +
    '<span style="font-size:11px;font-family:\'DM Mono\',monospace;color:var(--red);font-weight:600">10</span></div>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);text-align:center;font-size:10px">' +
    '<span style="color:var(--green)">' + t('numeric_mild') + '</span>' +
    '<span style="color:var(--yellow)">' + t('numeric_mod') + '</span>' +
    '<span style="color:var(--red)">' + t('numeric_sev') + '</span>' +
    '</div></div>' +
    // COMFORT-B
    '<div class="sc-subsection">' + t('comfortb_title') + ' <span class="sc-pain-age">' + t('comfortb_age') + '</span></div>' +
    '<div style="overflow-x:auto"><table class="sc-tbl"><thead><tr><th>' + t('westley_param') + '</th>' +
    '<th><span class="sv sv-g">1</span></th><th><span class="sv sv-g">2</span></th><th><span class="sv sv-y">3</span></th><th><span class="sv sv-o">4</span></th><th><span class="sv sv-r">5</span></th></tr></thead><tbody>' +
    cbRow(t('comfortb_alert'), [t('comfortb_a1'),t('comfortb_a2'),t('comfortb_a3'),t('comfortb_a4'),t('comfortb_a5')]) +
    cbRow(t('comfortb_calm'),  [t('comfortb_c1'),t('comfortb_c2'),t('comfortb_c3'),t('comfortb_c4'),t('comfortb_c5')]) +
    cbRow(t('comfortb_resp'),  [t('comfortb_r1'),t('comfortb_r2'),t('comfortb_r3'),t('comfortb_r4'),t('comfortb_r5')]) +
    cbRow(t('comfortb_move'),  [t('comfortb_m1'),t('comfortb_m2'),t('comfortb_m3'),t('comfortb_m4'),t('comfortb_m5')]) +
    cbRow(t('comfortb_tone'),  [t('comfortb_t1'),t('comfortb_t2'),t('comfortb_t3'),t('comfortb_t4'),t('comfortb_t5')]) +
    cbRow(t('comfortb_face'),  [t('comfortb_f1'),t('comfortb_f2'),t('comfortb_f3'),t('comfortb_f4'),t('comfortb_f5')]) +
    '</tbody></table></div>' +
    '<div style="font-size:10px;color:var(--text3);padding:4px 6px;margin-bottom:6px">' + t('comfortb_ref') + '</div>' +
    '<div style="background:var(--surface2);border-radius:7px;padding:8px 10px;font-size:11px;color:var(--text3);line-height:1.6"><strong>' + t('pain_guide_lbl') + ':</strong> ' + t('pain_guide') + '</div>';
}
function faceItem(emoji, score, label, col) {
  return '<div style="text-align:center"><div style="font-size:26px">' + emoji + '</div>' +
    '<div style="font-family:\'DM Mono\',monospace;font-size:12px;color:' + col + ';font-weight:700">' + score + '</div>' +
    '<div style="font-size:9px;color:var(--text3)">' + label + '</div></div>';
}
function cbRow(label, cells) {
  return '<tr><td><strong>' + label + '</strong></td>' + cells.map(c => '<td>' + c + '</td>').join('') + '</tr>';
}

// ── Vitals dynamic re-render ─────────────────────────────────────────────────
function renderVitalsUI() {
  try {
  // ── 1. Tubes table header ──────────────────────────────────────
  const hdr = document.getElementById('tubes-thead');
  if (hdr) {
    hdr.innerHTML =
      '<tr><th>' + t('th_age') + '</th><th>' + t('th_suction') + '</th><th>' + t('th_sng') + '</th>' +
      '<th>' + t('th_foley') + '</th><th>' + t('th_cvc') + '</th><th>' + t('th_drain') + '</th><th>' + t('th_io') + '</th></tr>';
  }
  // ── 2. Tubes table body (translated age labels) ───────────────
  const tubBody = document.getElementById('tubes-body');
  if (tubBody) {
    const tubRows = [
      [t('vt_rn_pret'), '5–6 Fr','5–6 Fr','3 Fr','2.7–3 Fr','10–12 Fr','18 G'],
      [t('vt_rn_term'), '6–8 Fr','6–8 Fr','5 Fr','3–4 Fr','12–16 Fr','18 G'],
      [t('vt_3_6m'),    '8 Fr','8 Fr','5–6 Fr','4–4.5 Fr','16–20 Fr','18 G'],
      [t('vt_1y'),      '8 Fr','8 Fr','6–8 Fr','4.5 Fr','18–20 Fr','16 G'],
      [t('vt_2y'),      '8–10 Fr','8 Fr','8 Fr','4.5–5 Fr','20–24 Fr','14 G'],
      [t('vt_5y'),      '10 Fr','10 Fr','8–10 Fr','5 Fr','24–28 Fr','14 G'],
      [t('vt_7y'),      '10 Fr','10 Fr','10 Fr','5–7 Fr','28–32 Fr','14 G'],
      [t('vt_10y'),     '12 Fr','12 Fr','10–12 Fr','7 Fr','32–36 Fr','14 G'],
      ['>12 ' + t('vt_12y').replace(/\d+ /,''), '12–14 Fr','12–14 Fr','12–14 Fr','7–8 Fr','36–40 Fr','—'],
    ];
    tubBody.innerHTML = tubRows.map(r =>
      '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>'
    ).join('');
  }
  // ── 3. Tubes note ─────────────────────────────────────────────
  const tn = document.getElementById('tubes-note');
  if (tn) tn.innerHTML = t('tubes_note');

  // ── 4. Main vitals table header (9 columns) ───────────────────
  const vhdr = document.getElementById('main-vitals-thead');
  if (vhdr) {
    vhdr.innerHTML = '<tr>' +
      '<th>' + t('th_age') + '</th>' +
      '<th><span class="vt vt-wt">' + t('th_peso') + '</span></th>' +
      '<th>' + t('th_sc') + '</th>' +
      '<th><span class="vt vt-fr">' + t('th_fr_min') + '</span></th>' +
      '<th><span class="vt vt-fc">' + t('th_fc_min') + '</span></th>' +
      '<th><span class="vt vt-ta">' + t('th_pa_mmhg') + '</span></th>' +
      '<th>' + t('th_tet') + '</th>' +
      '<th>' + t('th_lamina') + '</th>' +
      '<th>' + t('th_dist_oral') + '</th>' +
    '</tr>';
  }
  // ── 5. Main vitals table body (translated ages + blade labels) ─
  const vBody = document.getElementById('main-vitals-tbody');
  if (vBody) {
    const S = t('vt_blade_str'), C = t('vt_blade_cur');
    const vRows = [
      [t('vt_rn_term'),'3.5','0.21','30–60','90–180','40–60','3.0–3.5',S+' 0–1','8.5–9 cm'],
      [t('vt_3m'),     '5.5','0.30','30–50','90–180','45–75','3.5',    S+' 1','10 cm'],
      [t('vt_6m'),     '7',  '0.38','30–40','90–180','50–90','3.5–4',  S+' 1','11 cm'],
      [t('vt_1y'),     '10', '0.47','24–35','90–170','50–100','4.0',   S+' 1','11 cm'],
      [t('vt_2y'),     '12', '0.55','22–30','80–140','50–100','4.5',   S+'1/'+C+'1','12 cm'],
      [t('vt_3y'),     '15', '0.61','20–30','70–140','50–100','5.0',   C+' 1/2','13 cm'],
      [t('vt_5y'),     '20', '0.68','16–20','70–120','60–90','5.5',    C+' 1/2','14 cm'],
      [t('vt_7y'),     '25', '0.86','16–20','70–120','60–90','6.0',    C+' 2','16 cm'],
      [t('vt_10y'),    '35', '1.00','16–20','60–110','60–90','6.5',    C+' 2','17 cm'],
      [t('vt_12y'),    '40', '1.28','14–18','60–100','65–95','7.0',    C+' 2/3','18 cm'],
      [t('vt_15y'),    '50', '1.70','14–16','60–100','65–95','7.5',    C+' 3','19 cm'],
      [t('vt_adult'),  '≥50','&gt;1.80','14–16','60–100','65–105','≤8.5',C+' 4/5','20–21 cm'],
    ];
    vBody.innerHTML = vRows.map(r =>
      '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>'
    ).join('');
  }
  // ── 6. First vitals note (formula) ────────────────────────────
  const vn1 = document.getElementById('vitals-note1');
  if (vn1) vn1.innerHTML = t('vt_bp_note1');

  // ── 7. BP percentiles table header ────────────────────────────
  const bpHdr = document.getElementById('bp-full-thead');
  if (bpHdr) {
    const a = t('th_age'), p = t('th_percentile');
    const sM = t('th_tas_m'), sF = t('th_tas_f'), dM = t('th_tad_m'), dF = t('th_tad_f');
    bpHdr.innerHTML =
      '<tr>' +
        '<th rowspan="2">' + a + '</th>' +
        '<th colspan="3" style="text-align:center;background:rgba(56,189,248,.1);color:var(--accent)">' + sM + '</th>' +
        '<th colspan="3" style="text-align:center;background:rgba(244,114,182,.1);color:var(--pink)">' + sF + '</th>' +
        '<th colspan="3" style="text-align:center;background:rgba(56,189,248,.07);color:var(--accent)">' + dM + '</th>' +
        '<th colspan="3" style="text-align:center;background:rgba(244,114,182,.07);color:var(--pink)">' + dF + '</th>' +
      '</tr>' +
      '<tr>' +
        '<th>' + p + '5</th><th>' + p + '50</th><th>' + p + '95</th>' +
        '<th>' + p + '5</th><th>' + p + '50</th><th>' + p + '95</th>' +
        '<th>' + p + '5</th><th>' + p + '50</th><th>' + p + '95</th>' +
        '<th>' + p + '5</th><th>' + p + '50</th><th>' + p + '95</th>' +
      '</tr>';
  }
  // ── 8. BP percentiles body (translated age labels) ─────────────
  const bpBody = document.getElementById('bp-body');
  if (bpBody) {
    // Age labels use month/year abbreviations — translate suffix only
    const mo = t('vt_3m').replace(/\d+ /,'');    // "meses"/"meses"/"months"
    const yr = t('vt_1y').replace(/\d+ /,'');    // "año"/"ano"/"year"
    const bpRows = [
      ['1–5 ' + mo, 72,93,114, 72,92,112, 29,48,66, 32,50,67],
      ['6–11 ' + mo,71,95,120, 71,95,119, 37,53,70, 37,53,68],
      ['1 ' + yr,   74,94,114, 72,93,114, 38,53,68, 37,52,68],
      ['2 ' + yr+'s',77,95,113,77,95,113, 42,57,71, 43,57,72],
      ['3 ' + yr+'s',73,94,114,72,93,114, 39,54,70, 39,55,71],
      ['4 ' + yr+'s',71,91,111,69,91,112, 38,54,69, 39,55,70],
      ['5 ' + yr+'s',76,94,112,77,94,112, 41,57,73, 41,57,74],
      ['6 ' + yr+'s',80,96,113,78,96,113, 42,59,75, 43,59,76],
      ['7 ' + yr+'s',81,98,115,80,96,113, 44,61,78, 43,60,77],
      ['8 ' + yr+'s',82,99,115,81,98,115, 45,62,78, 44,61,78],
      ['9 ' + yr+'s',84,101,117,82,100,118,46,63,79,46,63,80],
      ['10 ' + yr+'s',85,102,119,84,102,120,48,64,79,47,63,79],
      ['11 ' + yr+'s',85,103,121,86,105,123,47,63,80,48,65,81],
      ['12 ' + yr+'s',88,106,124,89,108,126,50,66,82,51,67,83],
      ['13 ' + yr+'s',87,108,129,87,107,127,48,66,83,50,67,85],
      ['14 ' + yr+'s',89,110,131,88,108,127,48,66,84,51,68,85],
      ['15 ' + yr+'s',92,113,134,89,108,126,48,66,84,49,66,83],
      ['16 ' + yr+'s',95,115,135,91,109,128,49,67,86,49,67,85],
      ['17 ' + yr+'s',98,118,138,92,110,128,53,70,87,51,68,84],
      ['18 ' + yr+'s',98,119,139,92,110,128,55,72,89,50,67,85],
    ];
    bpBody.innerHTML = bpRows.map(r =>
      '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>'
    ).join('');
  }
  // ── 9. Second vitals note (BP emergencies) ─────────────────────
  const vn2 = document.getElementById('vitals-note2');
  if (vn2) vn2.innerHTML = t('vt_bp_note2');

  // ── 10. Vitals card section titles (data-i18n) ─────────────────
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (T[currentLang] && T[currentLang][key]) {
      if (el.dataset.i18nHtml) el.innerHTML = T[currentLang][key];
      else el.textContent = T[currentLang][key];
    }
  });
  } catch(_e) {
    console.error('[PediCode] Error en renderVitalsUI:', _e);
    /* ── fallback visual ── */
    try {
      var _errEl = document.querySelector('#tab-vitals');
      if (_errEl) _errEl.innerHTML = '<div style="padding:20px;color:#e05c6e;text-align:center;font-size:13px;">⚠️ Error al cargar esta sección. Recarga la página.</div>';
    } catch(_) {}
  }
}

// ── Broselow re-render with translated item labels ───────────────────────────
// Override calcBroselow to use translated keys

function calcBroselow() {
  const h = parseFloat(document.getElementById('brow-height').value);
  const area = document.getElementById('brow-result');
  if (!h || h < 46) {
    area.innerHTML = '<div class="brow-empty">' + t('brow_empty') + '</div>';
    return;
  }
  const band = BROW.find(b => h >= b.h0 && h < b.h1) || BROW[BROW.length-1];
  const items = band.d.map((pair, i) => {
    const lbl = BROW_ITEM_KEYS[i] ? t(BROW_ITEM_KEYS[i]) : pair[0];
    return '<div class="brow-item"><div class="brow-item-lbl">' + lbl + '</div><div class="brow-item-val">' + pair[1] + '</div></div>';
  }).join('');
  area.innerHTML =
    '<div class="brow-band-header" style="background:' + band.bg + ';border-color:' + band.c + '">' +
    '<div class="brow-band-name" style="color:' + band.c + '">' + t('brow_band') + ' ' + band.n + '</div>' +
    '<div class="brow-band-sub" style="color:' + band.c + '">' + t('brow_height_range') + ' ' + band.h0 + '–' + band.h1 + ' cm · ' + t('brow_weight_est') + ' ' + band.w + ' kg</div>' +
    '</div>' +
    '<div class="brow-grid">' + items + '</div>' +
    '<div class="sc-ref" style="margin-top:8px">' + t('brow_note') + '</div>';
}

// ── Init on load ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  renderEvalUI();
  renderCalcUI();
  renderScoresUI();
  renderVitalsUI();
  renderDoses();
  renderRcpTab();
  updateWeightPulse();
  initWakeLock();
  // Apply default language translations on initial load
  applyI18nToDOM(currentLang);
});

// ═══ WAKE LOCK ═══
let wakeLock = null;
async function initWakeLock() {
  if (!('wakeLock' in navigator)) return;
  async function requestWakeLock() {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch(e) { /* silencioso */ }
  }
  await requestWakeLock();
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') await requestWakeLock();
  });
}

// ═══ GLOBAL WEIGHT BAR ═══
function updateWeightPulse() {
  const w = getGlobalWeight();
  const inp  = document.getElementById('global-weight');
  const bar  = document.getElementById('swb-bar');
  const hint = document.getElementById('swb-hint');
  const hasWeight = w && w > 0;
  inp?.classList.toggle('swb-needs-weight', !hasWeight);
  bar?.classList.toggle('swb-needs-weight', !hasWeight);
  if (hint) hint.style.display = hasWeight ? 'none' : 'inline';
}

function onGlobalWeightChange() {
  const val = document.getElementById('global-weight').value;
  const display = document.getElementById('swb-display');
  const w = parseFloat(val);
  if (w > 0) {
    display.textContent = w + ' kg';
    const calcW = document.getElementById('calc-weight');
    if (calcW) calcW.value = val;
    const readout = document.getElementById('calc-weight-readout');
    if (readout) readout.textContent = w + ' kg';
  } else {
    display.textContent = '';
    const calcW = document.getElementById('calc-weight');
    if (calcW) calcW.value = '';
    const readout = document.getElementById('calc-weight-readout');
    if (readout) readout.textContent = '—';
  }
  updateWeightPulse();
  renderRcpCards();
  // Refresh open RCP cards with new weight-based chips
  document.querySelectorAll('.rcp-card.open').forEach(el => rcpUpdateCard(el.id));
  renderDoses();
  calcInfusion();
  updateAdultBadge();
  // Recalculate dose verifier if a drug is selected
  if (typeof dvSelectedDrug !== 'undefined' && dvSelectedDrug) dvCalculate();
  // Update AI weight display if tab is open
  const aiW = document.getElementById('ai-weight-display');
  if (aiW) { const w = getGlobalWeight(); aiW.textContent = w ? w + ' kg' : '—'; }
}

function getGlobalWeight() {
  const gw = parseFloat(document.getElementById('global-weight')?.value);
  const cw = parseFloat(document.getElementById('calc-weight')?.value);
  return gw > 0 ? gw : (cw > 0 ? cw : null);
}

// Cap de dosis para pacientes ≥60 kg: usar 60 kg como peso de cálculo
// El peso real se mantiene para parámetros de vía aérea y vitales
function getCalcWeight() {
  const w = getGlobalWeight();
  return w ? Math.min(w, ADULT_DOSE_CAP) : null;
}

function updateAdultBadge() {
  const w = getGlobalWeight();
  const badge = document.getElementById('swb-adult-badge');
  if (badge) badge.style.display = (w && w > ADULT_DOSE_CAP) ? 'inline-block' : 'none';
}

// ═══ RCP TAB ═══
// — Reloj en tiempo real —
setInterval(() => {
  const el = document.getElementById('rcp-clock');
  if (el) {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('es-ES',{hour12:false});
  }
}, 1000);

// — Cronómetro —
let rcpChronoRunning = false, rcpChronoStart = 0, rcpChronoElapsed = 0, rcpChronoTicker = null;
function rcpChronoToggle() {
  if (!rcpChronoRunning) {
    rcpChronoRunning = true;
    rcpChronoStart = Date.now() - rcpChronoElapsed;
    rcpChronoTicker = setInterval(rcpChronoUpdate, 500);
    document.getElementById('rcp-chrono-btn').textContent = t('rcp_chrono_pause');
    document.getElementById('rcp-chrono-btn').classList.add('active-btn');
    document.getElementById('rcp-chrono').classList.add('running');
  } else {
    rcpChronoRunning = false;
    rcpChronoElapsed = Date.now() - rcpChronoStart;
    clearInterval(rcpChronoTicker);
    document.getElementById('rcp-chrono-btn').textContent = t('rcp_chrono_resume');
    document.getElementById('rcp-chrono-btn').classList.remove('active-btn');
    document.getElementById('rcp-chrono').classList.remove('running');
  }
}
function rcpChronoReset() {
  rcpChronoRunning = false;
  rcpChronoElapsed = 0;
  clearInterval(rcpChronoTicker);
  document.getElementById('rcp-chrono').textContent = '00:00';
  document.getElementById('rcp-chrono').classList.remove('running');
  document.getElementById('rcp-chrono-btn').textContent = t('rcp_chrono_start');
  document.getElementById('rcp-chrono-btn').classList.remove('active-btn');
}
function rcpChronoUpdate() {
  const ms = Date.now() - rcpChronoStart;
  const m = Math.floor(ms/60000), s = Math.floor((ms%60000)/1000);
  document.getElementById('rcp-chrono').textContent = String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}

// — Metrónomo —
let rcpBpm = 110, rcpMetroRunning = false, rcpMetroCtx = null, rcpMetroTicker = null;
function rcpBpmAdj(d) {
  rcpBpm = Math.max(60, Math.min(160, rcpBpm + d));
  document.getElementById('rcp-bpm').textContent = rcpBpm;
  if (rcpMetroRunning) { rcpMetroStop(); rcpMetroStart(); }
}
function rcpMetroToggle() {
  if (!rcpMetroRunning) rcpMetroStart();
  else rcpMetroStop();
}
function rcpMetroStart() {
  rcpMetroRunning = true;
  document.getElementById('rcp-metro-btn').textContent = t('rcp_metro_stop');
  document.getElementById('rcp-metro-btn').classList.add('active-btn');
  const interval = 60000 / rcpBpm;
  rcpMetroCtx = new (window.AudioContext || window.webkitAudioContext)();
  function tick() {
    if (!rcpMetroRunning) return;
    const osc = rcpMetroCtx.createOscillator();
    const gain = rcpMetroCtx.createGain();
    osc.connect(gain); gain.connect(rcpMetroCtx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.4, rcpMetroCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, rcpMetroCtx.currentTime + 0.08);
    osc.start(); osc.stop(rcpMetroCtx.currentTime + 0.08);
    rcpMetroTicker = setTimeout(tick, interval);
  }
  tick();
}
function rcpMetroStop() {
  rcpMetroRunning = false;
  clearTimeout(rcpMetroTicker);
  if (rcpMetroCtx) { rcpMetroCtx.close(); rcpMetroCtx = null; }
  document.getElementById('rcp-metro-btn').textContent = t('rcp_metro_activate');
  document.getElementById('rcp-metro-btn').classList.remove('active-btn');
}

// — Render RCP —
// ═══ RCP HELPERS (peso real) ════════════════════════════════════════
function rcpEtt(w) {
  if (w < 3)  return 2.5; if (w < 5)  return 3.0; if (w < 8)  return 3.5;
  if (w < 12) return 4.0; if (w < 16) return 4.5; if (w < 22) return 5.0;
  if (w < 30) return 5.5; if (w < 40) return 6.0; if (w < 55) return 6.5;
  if (w < 70) return 7.0; return 7.5;
}
function rcpEttDepth(w) { return (rcpEtt(w) * 3).toFixed(1); }
function rcpEttNeo(w)   {
  const g = w * 1000;
  if (g < 1000) return '2,5'; if (g < 2000) return '3,0';
  if (g < 3000) return '3,5'; return '3,5–4,0';
}
function rcpLaminaNeo(w) {
  const g = w * 1000;
  if (g < 1000) return '00/0'; if (g < 2000) return '0';
  if (g < 3000) return '0/1'; return '1';
}
function rcpBroselow(w) {
  if (w < 5)  return {es:'Gris',    pt:'Cinzento',  en:'Grey'};
  if (w < 7)  return {es:'Rosa',    pt:'Rosa',       en:'Pink'};
  if (w < 9)  return {es:'Rojo',    pt:'Vermelho',   en:'Red'};
  if (w < 11) return {es:'Morado',  pt:'Roxo',       en:'Purple'};
  if (w < 14) return {es:'Amarillo',pt:'Amarelo',    en:'Yellow'};
  if (w < 18) return {es:'Blanco',  pt:'Branco',     en:'White'};
  if (w < 25) return {es:'Azul',    pt:'Azul',       en:'Blue'};
  if (w < 36) return {es:'Naranja', pt:'Laranja',    en:'Orange'};
  return       {es:'Verde',    pt:'Verde',      en:'Green'};
}

// ═══ RCP_CARDS DATA (multilingual) ═════════════════════════════════

// ═══ RENDER RCP CARDS ═══════════════════════════════════════════════
function rcpToggle(id) {
  const card = document.getElementById(id);
  if (!card) return;
  const isOpen = card.classList.contains('open');
  // Close all open cards first (accordion behaviour)
  document.querySelectorAll('#rcp-card-list .rcp-card.open').forEach(c => c.classList.remove('open'));
  if (!isOpen) {
    card.classList.add('open');
    rcpUpdateCard(id);
  }
}

function rcpChip(chip, w, cw) {
  const d = chip.fn ? chip.fn(w, cw) : {val: chip.val, sub: chip.sub || ''};
  return `<div class="rcp-chip">
    <div class="rcp-chip-label">${chip.lbl}</div>
    <div class="rcp-chip-val">${d.val}</div>
    <div class="rcp-chip-sub">${d.sub}</div>
  </div>`;
}

function rcpNote(note, w, cw) {
  const d = note.fn ? note.fn(w, cw) : {val: note.val, sub: note.sub || ''};
  return `<div class="rcp-note">
    <div class="rcp-note-label">${note.lbl}</div>
    <div class="rcp-note-val">${d.val}</div>
    <div class="rcp-note-sub">${d.sub}</div>
  </div>`;
}

function rcpUpdateCard(id) {
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'es';
  const w  = getGlobalWeight();
  const cw = getCalcWeight();
  const cards = RCP_CARDS[lang] || RCP_CARDS.es;
  const card = cards.find(c => c.id === id);
  if (!card) return;
  const el = document.getElementById(id);
  if (!el) return;

  const algoLbl  = lang==='en' ? 'VISUAL ALGORITHM' : 'ALGORITMO VISUAL';
  const notesLbl = lang==='en' ? 'QUICK NOTES' : lang==='pt' ? 'NOTAS RÁPIDAS' : 'NOTAS RÁPIDAS';

  const chipsHTML = card.chips.map(ch => rcpChip(ch, w, cw)).join('');
  const stepsArr  = card.steps || card.algo || [];
  const stepsHTML = stepsArr.map((s, i) => {
    const isAlgo  = s.type !== undefined;
    const title   = isAlgo ? '' : `<span class="algo-step-title">${s.t}</span>`;
    const text    = isAlgo ? s.text : s.x;
    const cls     = isAlgo ? (s.type==='alert' ? 'algo-item-alert' : '') : '';
    return `<div class="algo-step">
      <div class="algo-step-left">
        <div class="algo-step-num">${isAlgo && s.type==='alert' ? '⚠' : i+1}</div>
        ${i < stepsArr.length-1 ? '<div class="algo-step-spine"></div>' : ''}
      </div>
      <div class="algo-step-content">
        <div class="algo-step-head">${title}</div>
        <div class="algo-step-items"><div class="algo-item-text ${cls}">${text}</div></div>
      </div>
    </div>`;
  }).join('');
  const notesArr  = card.notes || [];
  const notesHTML = notesArr.map(n => typeof n === 'string' ? `<div class="rcp-note"><div class="rcp-note-label" style="font-size:10px;color:var(--text3)">${n}</div></div>` : rcpNote(n, w, cw)).join('');

  el.querySelector('.rcp-chip-row').innerHTML = chipsHTML;
  el.querySelector('.rcp-col-algo').innerHTML  =
    `<div class="rcp-col-label">${algoLbl}</div><div class="algo-steps">${stepsHTML}</div>`;
  el.querySelector('.rcp-col-notes').innerHTML =
    `<div class="rcp-col-label">${notesLbl}</div>${notesHTML}`;
}

function renderRcpCards() {
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'es';
  const w  = getGlobalWeight();
  const cw = getCalcWeight();
  const cards = RCP_CARDS[lang] || RCP_CARDS.es;
  const list = document.getElementById('rcp-card-list');
  if (!list) return;

  const algoLbl  = lang==='en' ? 'VISUAL ALGORITHM' : 'ALGORITMO VISUAL';
  const notesLbl = lang==='en' ? 'QUICK NOTES' : 'NOTAS RÁPIDAS';

  list.innerHTML = cards.map(card => {
    const chipsHTML = card.chips.map(ch => rcpChip(ch, w, cw)).join('');
    const stepsArr  = card.steps || card.algo || [];
    const stepsHTML = stepsArr.map((s, i) => {
      const isAlgo = s.type !== undefined;
      const title  = isAlgo ? '' : `<span class="algo-step-title">${s.t}</span>`;
      const text   = isAlgo ? s.text : s.x;
      const cls    = isAlgo ? (s.type==='alert' ? 'algo-item-alert' : '') : '';
      return `<div class="algo-step">
          <div class="algo-step-left">
            <div class="algo-step-num">${isAlgo && s.type==='alert' ? '⚠' : i+1}</div>
            ${i < stepsArr.length-1 ? '<div class="algo-step-spine"></div>' : ''}
          </div>
          <div class="algo-step-content">
            <div class="algo-step-head">${title}</div>
            <div class="algo-step-items"><div class="algo-item-text ${cls}">${text}</div></div>
          </div>
        </div>`;
    }).join('');
    const notesArr  = card.notes || [];
    const notesHTML = notesArr.map(n => typeof n === 'string' ? `<div class="rcp-note"><div class="rcp-note-label" style="font-size:10px;color:var(--text3)">${n}</div></div>` : rcpNote(n, w, cw)).join('');

    return `<div class="rcp-card" id="${card.id}">
      <div class="rcp-card-hdr" onclick="rcpToggle('${card.id}')">
        <div class="rcp-card-bar" style="background:${card.color}"></div>
        <span class="rcp-card-icon">${card.icon}</span>
        <div class="rcp-card-meta">
          <div class="rcp-card-title">${card.title}</div>
          <div class="rcp-card-src">${card.src}</div>
        </div>
        <span class="rcp-card-arrow">▼</span>
      </div>
      <div class="rcp-card-body">
        <div class="rcp-card-summary">${card.summary}</div>
        <div class="rcp-chip-row">${chipsHTML}</div>
        <div class="rcp-body-cols">
          <div class="rcp-col-algo">
            <div class="rcp-col-label">${algoLbl}</div>
            <div class="algo-steps">${stepsHTML}</div>
          </div>
          <div class="rcp-col-notes">
            <div class="rcp-col-label">${notesLbl}</div>
            ${notesHTML}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderRcpTab() {
  try {
  renderRcpCards();
  updateAdultBadge();
  } catch(_e) {
    console.error('[PediCode] Error en renderRcpTab:', _e);
    /* ── fallback visual ── */
    try {
      var _errEl = document.querySelector('#tab-rcp');
      if (_errEl) _errEl.innerHTML = '<div style="padding:20px;color:#e05c6e;text-align:center;font-size:13px;">⚠️ Error al cargar esta sección. Recarga la página.</div>';
    } catch(_) {}
  }
}

function goToProto(protoId) {
  // Switch to protocolos tab
  const btn = document.querySelector('.tab-btn[onclick*="protos"]');
  if (btn) showTab(btn, 'protos');
  // renderProtoUI renders asynchronously after showTab; wait for it
  setTimeout(() => {
    if (typeof openProtoCard === 'function') openProtoCard(protoId);
    // Scroll to top of protocolos
    const wrap = document.getElementById('pt-wrap');
    if (wrap) wrap.scrollIntoView({block:'start'});
  }, 120);
}

function fmt(val, dec) {
  if (!val && val !== 0) return '—';
  return parseFloat(val.toFixed(dec));
}

function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.getElementById('theme-icon').textContent = dark ? '🌙' : '☀️';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#0b0f1a' : '#f0f4f8';
}
function toggleTheme() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  applyTheme(!isDark);
  try { localStorage.setItem('theme','manual:'+ (!isDark?'dark':'light')); } catch(e) {}
}
function autoTheme() {
  let saved; try { saved = localStorage.getItem('theme'); } catch(e) {}
  if (saved && saved.startsWith('manual:')) {
    applyTheme(saved === 'manual:dark');
  } else {
    const h = new Date().getHours();
    applyTheme(h < 8 || h >= 20);
  }
}
autoTheme();
// Re-check every minute for auto switch
setInterval(() => {
  let saved; try { saved = localStorage.getItem('theme'); } catch(e) {}
  if (!saved || !saved.startsWith('manual:')) autoTheme();
}, 60000);

// ═══ TABS ═══
function showTab(btn, id) {
  try {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  btn.classList.add('active');
  if(id === 'protos') { try { if(typeof renderProtoUI==='function') renderProtoUI(); else showProtoCategories(); } catch(e){} }
  if(id === 'meds')   { try { showMedCategories(); } catch(e){} }
  if(id === 'calc')   { try { renderCalcUI(); buildDoseCatGrid(); buildInfDrugGrid(); buildDvCatGrid(); calcInfusion(); } catch(e){} }
  if(id === 'scores') { try { renderScoresUI(); buildScoreCatGrid(); showScoreCategories(); } catch(e){} }
  if(id === 'vitals') { try { renderVitalsUI(); buildVitalsCatGrid(); showVitalsCategories(); } catch(e){} }
  if(id === 'rcp')    { try { renderRcpTab(); } catch(e){} }
  if(id === 'ai')     { try { renderAITab(currentLang, getGlobalWeight()); } catch(e){} }
  } catch(_e) {
    console.error('[PediCode] Error en showTab:', _e);
  }
}

// ═══ PANELS ═══
function togglePanel(id) {
  const panel = document.getElementById(id);
  const btn = panel.previousElementSibling;
  const isOpen = panel.classList.contains('open');
  document.querySelectorAll('.expand-panel.open').forEach(p => {
    p.classList.remove('open');
    p.previousElementSibling.classList.remove('open');
  });
  if (!isOpen) { panel.classList.add('open'); btn.classList.add('open'); }
}

// ═══ CHECKLIST ═══
function toggleCheck(el) {
  el.classList.toggle('checked');
  el.querySelector('.check-box').textContent = el.classList.contains('checked') ? '✓' : '';
}
function resetPanel(id) {
  document.getElementById(id).querySelectorAll('.check-item').forEach(item => {
    item.classList.remove('checked');
    item.querySelector('.check-box').textContent = '';
  });
}

// ═══ MEDS ═══
// ══ MEDS DRILL-DOWN ══

function buildMedCatGrid() {
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'pt';
  const langData = T[lang] || T['es'];
  const grid = document.getElementById('meds-cat-grid');
  if (!grid) return;
  const allCards = document.querySelectorAll('#meds-list-hidden .med-card');
  grid.innerHTML = MEDS_CATS.map(cat => {
    const count = Array.from(allCards).filter(c => c.dataset.section === cat.id).length;
    if (!count) return '';
    const label = langData[cat.labelKey] || cat.labelKey;
    return `<div class="meds-cat-card" onclick="showMedSection('${cat.id}')" style="border-color:${cat.color}33;">
      <div class="meds-cat-badge" style="background:${cat.color}">${count}</div>
      <div class="meds-cat-icon">${cat.icon}</div>
      <div class="meds-cat-name">${label}</div>
      <div class="meds-cat-count">${count} ${lang==='en'?'drugs':lang==='pt'?'fármacos':'fármacos'}</div>
      <div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${cat.color};border-radius:14px 0 0 14px;"></div>
    </div>`;
  }).join('');
}

function showMedCategories() {
  document.getElementById('meds-categories').style.display = 'block';
  document.getElementById('meds-drug-view').style.display = 'none';
  document.getElementById('meds-search-results').style.display = 'none';
  document.getElementById('med-search').value = '';
  buildMedCatGrid();
  document.querySelector('#tab-meds .meds-wrap').scrollTop = 0;
}

function showMedSection(sectionId) {
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'pt';
  const langData = T[lang] || T['es'];
  const cat = MEDS_CATS.find(c => c.id === sectionId);
  if (!cat) return;

  // Get all cards for this section from hidden list
  const allCards = document.querySelectorAll('#meds-list-hidden .med-card');
  const sectionCards = Array.from(allCards).filter(c => c.dataset.section === sectionId);

  // Update back header
  document.getElementById('meds-back-icon').textContent = cat.icon;
  document.getElementById('meds-back-title').textContent = langData[cat.labelKey] || cat.labelKey;
  document.getElementById('meds-back-count').textContent = sectionCards.length + ' ' + (lang==='en'?'drugs':'fármacos');
  document.querySelector('.meds-back-header').style.borderLeftColor = cat.color;

  // Clone and render cards
  const list = document.getElementById('meds-drug-list');
  list.innerHTML = '';
  sectionCards.forEach(card => {
    const clone = card.cloneNode(true);
    clone.classList.remove('open', 'hidden');
    // Re-attach toggle handler
    const header = clone.querySelector('.med-header');
    if (header) header.onclick = () => toggleMed(clone);
    list.appendChild(clone);
  });

  document.getElementById('meds-categories').style.display = 'none';
  document.getElementById('meds-drug-view').style.display = 'block';
  document.getElementById('meds-search-results').style.display = 'none';

  // Scroll to top
  window.scrollTo(0, document.getElementById('tab-meds').offsetTop - 120);
}

function toggleMed(card) {
  const isOpen = card.classList.contains('open');
  // close all open in same container
  const container = card.closest('#meds-drug-list, #meds-search-list');
  if (container) container.querySelectorAll('.med-card.open').forEach(c => c.classList.remove('open'));
  if (!isOpen) card.classList.add('open');
}

function filterMeds() {
  const q = document.getElementById('med-search').value.toLowerCase().trim();
  if (!q) {
    showMedCategories();
    return;
  }
  // Show search results view
  document.getElementById('meds-categories').style.display = 'none';
  document.getElementById('meds-drug-view').style.display = 'none';
  document.getElementById('meds-search-results').style.display = 'block';

  const allCards = document.querySelectorAll('#meds-list-hidden .med-card');
  const searchList = document.getElementById('meds-search-list');
  searchList.innerHTML = '';
  let visible = 0;

  allCards.forEach(card => {
    const searchText = (card.dataset.name || '') + ' ' + (card.querySelector('.med-name')?.textContent || '').toLowerCase();
    if (searchText.includes(q)) {
      const clone = card.cloneNode(true);
      clone.classList.remove('open', 'hidden');
      const header = clone.querySelector('.med-header');
      if (header) header.onclick = () => toggleMed(clone);
      searchList.appendChild(clone);
      visible++;
    }
  });

  const lang = typeof currentLang !== 'undefined' ? currentLang : 'pt';
  document.getElementById('meds-search-label').textContent = visible > 0
    ? (lang==='en' ? `${visible} result${visible!==1?'s':''} for "${q}"` : `${visible} resultado${visible!==1?'s':''} para "${q}"`)
    : '';
  document.getElementById('no-results').style.display = visible === 0 ? 'block' : 'none';
}

// Init on tab show
document.addEventListener('DOMContentLoaded', () => {
  buildMedCatGrid();
  buildDoseCatGrid();
  buildInfDrugGrid();
  buildDvCatGrid();
  // Scores init
  if (typeof buildScoreCatGrid === 'function') { buildScoreCatGrid(); showScoreCategories(); }
  // Vitals init
  if (typeof buildVitalsCatGrid === 'function') { buildVitalsCatGrid(); }
});

// ═══ DISEASES ═══
function toggleDisease(card) {
  const isOpen = card.classList.contains('open');
  document.querySelectorAll('.disease-card.open').forEach(c => c.classList.remove('open'));
  if (!isOpen) card.classList.add('open');
}

// ═══ CALCULATOR FUNCTIONS ═══


// ─── CALCULATOR FUNCTIONS ────────────────────────────────────────────────────
let currentCat = 'ALL';

function showCalcPanel(btn, id) {
  document.querySelectorAll('.calc-sub-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.calc-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(id).classList.add('active');
  if (id === 'panel-inf') { buildInfDrugGrid(); calcInfusion(); }
  else if (id === 'panel-verify') { showDvCategories(); dvInit(); }
  else if (id === 'panel-compat') { compatInit(); }
  else { buildDoseCatGrid(); renderDoses(); }
}

// ═══════════════════════════════════════════════════════════════════
// DOSE VERIFIER (panel-verify)
// ═══════════════════════════════════════════════════════════════════
let dvSelectedDrug = null;
let dvSelectedDoseIdx = null;
let _dvCurrentCat = null;

// ── DV Category grid ──
function buildDvCatGrid() {
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'es';
  const grid = document.getElementById('dv-cat-grid');
  if (!grid) return;
  grid.innerHTML = CALC_CATS.map(cat => {
    // Only show cats that have bolus-capable drugs
    const drugs = DOSE_DRUGS.filter(d => d.cat === cat.id && d.doses.some(x => !x.infusion && x.factor != null));
    if (!drugs.length) return '';
    const lbl = cat.label[lang] || cat.label.es;
    return `<div class="calc-cat-card" onclick="showDvCat('${cat.id}')" style="border-color:${cat.color}44">
      <div class="calc-cat-badge" style="background:${cat.color}">${drugs.length}</div>
      <div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${cat.color};border-radius:14px 0 0 14px;"></div>
      <div class="calc-cat-icon">${cat.icon}</div>
      <div class="calc-cat-name">${lbl}</div>
      <div class="calc-cat-count">${drugs.length} ${lang==='en'?'drugs':'fármacos'}</div>
    </div>`;
  }).join('');
}

function showDvCategories() {
  _dvCurrentCat = null;
  clearDvSearch();
  document.getElementById('dv-cat-view').style.display = 'block';
  document.getElementById('dv-drug-view').style.display = 'none';
  document.getElementById('dv-form-view').style.display = 'none';
  buildDvCatGrid();
}

function showDvCat(catId) {
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'es';
  const cat = CALC_CATS.find(c => c.id === catId);
  if (!cat) return;
  _dvCurrentCat = catId;
  const drugs = DOSE_DRUGS.filter(d => d.cat === catId && d.doses.some(x => !x.infusion && x.factor != null));
  document.getElementById('dv-back-icon').textContent = cat.icon;
  document.getElementById('dv-back-title').textContent = cat.label[lang] || cat.label.es;
  document.getElementById('dv-back-count').textContent = drugs.length + ' ' + (lang==='en'?'drugs':'fármacos');
  const list = document.getElementById('dv-drug-list');
  list.innerHTML = drugs.map(d => {
    const bolusCount = d.doses.filter(x => !x.infusion && x.factor != null).length;
    return `<div class="inf-drug-card" onclick="dvSelectDrug('${encodeURIComponent(d.name)}')">
      <div class="inf-drug-bar" style="background:${d.color}"></div>
      <div class="inf-drug-icon" style="background:${d.color}22; font-size:18px; width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center;">💊</div>
      <div class="inf-drug-info">
        <div class="inf-drug-name">${d.name}</div>
        <div class="inf-drug-sub">${bolusCount} indicaci${bolusCount !== 1 ? 'ones' : 'ón'}</div>
      </div>
    </div>`;
  }).join('');
  document.getElementById('dv-cat-view').style.display = 'none';
  document.getElementById('dv-drug-view').style.display = 'block';
  document.getElementById('dv-form-view').style.display = 'none';
}

function showDvDrugList() {
  if (_dvCurrentCat) showDvCat(_dvCurrentCat);
  else showDvCategories();
}

function dvInit() {
  dvRenderRights();
  buildDvCatGrid();
}

function dvSearchDrug() {} // legacy no-op

function dvSelectDrug(encodedName) {
  const name = decodeURIComponent(encodedName);
  dvSelectedDrug = DOSE_DRUGS.find(d => d.name === name);
  if (!dvSelectedDrug) return;
  // Show form view
  document.getElementById('dv-cat-view').style.display = 'none';
  document.getElementById('dv-drug-view').style.display = 'none';
  document.getElementById('dv-form-view').style.display = 'block';
  // Update pill header
  const cat = CALC_CATS.find(c => c.id === dvSelectedDrug.cat);
  document.getElementById('dv-pill-icon').textContent = cat ? cat.icon : '💊';
  document.getElementById('dv-drug-name-txt').textContent = dvSelectedDrug.name;
  // Build indication selector
  const ind = document.getElementById('dv-indication');
  // Filter only bolus doses (not infusions)
  const doses = dvSelectedDrug.doses.filter(d => !d.infusion && d.factor != null);
  ind.innerHTML = doses.length
    ? doses.map((d, i) => `<option value="${i}">${d.label}</option>`).join('')
    : `<option value="">Sin dosis en bolo disponibles</option>`;
  document.getElementById('dv-indication-section').style.display = 'block';
  dvSelectedDoseIdx = 0;
  dvOnIndicationChange();
  dvResetRights();
}

function dvClearDrug() {
  dvSelectedDrug = null;
  dvSelectedDoseIdx = null;
  document.getElementById('dv-indication-section').style.display = 'none';
  document.getElementById('dv-dose-section').style.display = 'none';
  document.getElementById('dv-result').style.display = 'none';
  document.getElementById('dv-rights-wrap').style.display = 'none';
  showDvDrugList();
}

function dvOnIndicationChange() {
  if (!dvSelectedDrug) return;
  const ind = document.getElementById('dv-indication');
  dvSelectedDoseIdx = parseInt(ind.value) || 0;
  const doses = dvSelectedDrug.doses.filter(d => !d.infusion && d.factor != null);
  const dose = doses[dvSelectedDoseIdx];
  if (!dose) return;
  // Update unit display
  document.getElementById('dv-dose-unit').textContent = dose.unit;
  // Update range reference
  document.getElementById('dv-range-ref').textContent = t('dv_range_lbl') + ': ' + dose.range;
  // Update hint
  const w = getGlobalWeight() || 0;
  if (w > 0) {
    const calc = dose.factor * Math.min(w, ADULT_DOSE_CAP);
    const dispVal = calc < 0.01 ? calc.toFixed(4) : calc < 1 ? calc.toFixed(3) : calc < 10 ? calc.toFixed(2) : calc.toFixed(1);
    document.getElementById('dv-dose-hint').textContent = `= ${dispVal} ${dose.unit} para ${w} kg`;
  }
  document.getElementById('dv-dose-section').style.display = 'block';
  document.getElementById('dv-dose-input').value = '';
  document.getElementById('dv-result').style.display = 'none';
  dvResetRights();
}

// ── Parse range string to get lo/hi ──
function dvParseRange(rangeStr, unit) {
  // Normalise: commas to dots, Unicode dash to ASCII, remove unit suffixes
  const s = rangeStr.replace(',', '.').replace(',', '.').replace(/[–—]/g, '-')
    .replace(/mg\/kg.*|mcg\/kg.*|mEq\/kg.*|mL\/kg.*|U\/kg.*|g\/kg.*|mcg.*/i, '').trim();
  const rangeMatch = s.match(/^([\d.]+)\s*[-–]\s*([\d.]+)/);
  if (rangeMatch) return { lo: parseFloat(rangeMatch[1]), hi: parseFloat(rangeMatch[2]) };
  const single = s.match(/^([\d.]+)/);
  if (single) { const v = parseFloat(single[1]); return { lo: v, hi: v }; }
  return null;
}

// ── Main calculation ──
function dvCalculate() {
  try {
  if (!dvSelectedDrug) return;
  const rawW = getGlobalWeight() || 0;
  const w = rawW > 0 ? Math.min(rawW, ADULT_DOSE_CAP) : rawW;
  const area = document.getElementById('dv-result');
  const doseInput = parseFloat(document.getElementById('dv-dose-input').value);
  const doses = dvSelectedDrug.doses.filter(d => !d.infusion && d.factor != null);
  const dose = doses[dvSelectedDoseIdx];
  if (!dose) return;
  area.style.display = 'block';
  // No weight
  if (!w || w <= 0) {
    area.innerHTML = `<div class="dv-result-card info"><div class="dv-status-row"><span class="dv-status-emoji">⚖️</span><div><div class="dv-status-label">${t('dv_no_weight')}</div></div></div></div>`;
    return;
  }
  // No dose entered
  if (!doseInput || doseInput <= 0) {
    const calcDose = dose.factor * w;
    const dispCalc = calcDose < 0.01 ? calcDose.toFixed(4) : calcDose < 1 ? calcDose.toFixed(3) : calcDose < 10 ? calcDose.toFixed(2) : calcDose.toFixed(1);
    area.innerHTML = `<div class="dv-result-card info">
      <div class="dv-status-row"><span class="dv-status-emoji">💉</span><div>
        <div class="dv-status-label">${t('dv_enter_dose')}</div>
        <div class="dv-status-sub">${t('dv_dose_lbl2')}: <strong>${dispCalc} ${dose.unit}</strong></div>
      </div></div>
      ${dvDilutionHTML(dose, dvSelectedDrug)}
    </div>`;
    return;
  }
  // Compare
  const r = dvParseRange(dose.range, dose.unit);
  const idealLo = r ? r.lo * w : dose.factor * w * 0.8;
  const idealHi = r ? r.hi * w : dose.factor * w * 1.2;
  const maxAbs = dose.maxDose !== undefined ? dose.maxDose : Infinity;
  const calcIdeal = dose.factor * w;
  const dispCalc = calcIdeal < 0.01 ? calcIdeal.toFixed(4) : calcIdeal < 1 ? calcIdeal.toFixed(3) : calcIdeal < 10 ? calcIdeal.toFixed(2) : calcIdeal.toFixed(1);
  // Tolerance: ±10% slack on range edges for warn zone
  const warnLo = idealLo * 0.85;
  const warnHi = idealHi * 1.1;
  let status, cardCls, labelKey, subKey;
  if (doseInput < warnLo) { status = 'danger_lo'; cardCls = 'danger'; labelKey = 'dv_danger_lo'; subKey = 'dv_danger_sub'; }
  else if (doseInput > maxAbs) { status = 'max'; cardCls = 'warn'; labelKey = 'dv_max_exceeded'; subKey = 'dv_danger_sub'; }
  else if (doseInput > warnHi) { status = 'danger_hi'; cardCls = 'danger'; labelKey = 'dv_danger_hi'; subKey = 'dv_danger_sub'; }
  else if (doseInput < idealLo || doseInput > idealHi) { status = 'warn'; cardCls = 'warn'; labelKey = 'dv_warn'; subKey = 'dv_warn_sub'; }
  else { status = 'ok'; cardCls = 'ok'; labelKey = 'dv_ok'; subKey = 'dv_ok_sub'; }
  const dispLo = idealLo < 0.01 ? idealLo.toFixed(4) : idealLo < 1 ? idealLo.toFixed(3) : idealLo < 10 ? idealLo.toFixed(2) : idealLo.toFixed(1);
  const dispHi = idealHi < 0.01 ? idealHi.toFixed(4) : idealHi < 1 ? idealHi.toFixed(3) : idealHi < 10 ? idealHi.toFixed(2) : idealHi.toFixed(1);
  const rangeText = dispLo === dispHi ? `${dispLo} ${dose.unit}` : `${dispLo}–${dispHi} ${dose.unit}`;
  const maxText = dose.maxDose !== undefined ? `  ·  Máx. ${dose.maxDose} ${dose.unit}` : '';
  area.innerHTML = `<div class="dv-result-card ${cardCls}">
    <div class="dv-status-row">
      <span class="dv-status-emoji">${cardCls === 'ok' ? '✅' : cardCls === 'warn' ? '⚠️' : '🔴'}</span>
      <div><div class="dv-status-label">${t(labelKey)}</div><div class="dv-status-sub">${t(subKey)}</div></div>
    </div>
    <div class="dv-calc-row"><span class="dv-calc-lbl">${t('dv_range_lbl')}</span><span class="dv-calc-val">${rangeText}${maxText}</span></div>
    <div class="dv-calc-row"><span class="dv-calc-lbl">${t('dv_dose_lbl2')}</span><span class="dv-calc-val">${dispCalc} ${dose.unit}</span></div>
    <div class="dv-calc-row"><span class="dv-calc-lbl">Dosis introducida</span><span class="dv-calc-val" style="color:${cardCls==='ok'?'var(--green)':cardCls==='warn'?'var(--yellow)':'var(--red)'}">${doseInput} ${dose.unit}</span></div>
    ${dvDilutionHTML(dose, dvSelectedDrug)}
  </div>`;
  // Show 9 ciertos after dose entered
  document.getElementById('dv-rights-wrap').style.display = 'block';
  } catch(_e) {
    console.error('[PediCode] Error en dvCalculate:', _e);
    /* ── fallback visual ── */
    try {
      var _errEl = document.querySelector('#dv-result-area');
      if (_errEl) _errEl.innerHTML = '<div style="padding:20px;color:#e05c6e;text-align:center;font-size:13px;">⚠️ Error al cargar esta sección. Recarga la página.</div>';
    } catch(_) {}
  }
}

function dvDilutionHTML(dose, drug) {
  if (!dose.note && !drug.notes) return '';
  let html = '';
  if (dose.note) {
    html += `<div class="dv-dilution-box"><div class="dv-dilution-title">${t('dv_dilution_lbl')}</div><div class="dv-dilution-text">${dose.note}</div></div>`;
  }
  if (drug.notes) {
    html += `<div class="dv-notes-box"><div class="dv-notes-text">ℹ️ ${drug.notes}</div></div>`;
  }
  return html;
}

// ── 9 Ciertos ──
let dvRightsState = [];

function dvRenderRights() {
  const grid = document.getElementById('dv-rights-grid');
  if (!grid) return;
  const rights = T[currentLang] && T[currentLang].dv_rights ? T[currentLang].dv_rights : T.es.dv_rights;
  if (dvRightsState.length !== rights.length) dvRightsState = new Array(rights.length).fill(false);
  grid.innerHTML = rights.map((r, i) =>
    `<div class="dv-right-item${dvRightsState[i] ? ' checked' : ''}" onclick="dvToggleRight(${i})">
      <div class="dv-right-check">${dvRightsState[i] ? '✓' : ''}</div>
      <span class="dv-right-num">${i + 1}</span>
      <span class="dv-right-text">${r}</span>
    </div>`
  ).join('');
  dvUpdateRightsProgress();
}

function dvToggleRight(i) {
  dvRightsState[i] = !dvRightsState[i];
  dvRenderRights();
}

function dvResetRights() {
  const rights = T[currentLang] && T[currentLang].dv_rights ? T[currentLang].dv_rights : T.es.dv_rights;
  dvRightsState = new Array(rights.length).fill(false);
  dvRenderRights();
}

function dvUpdateRightsProgress() {
  const total = dvRightsState.length;
  const done = dvRightsState.filter(Boolean).length;
  const bar = document.getElementById('dv-rights-bar');
  const counter = document.getElementById('dv-rights-counter');
  if (bar) bar.style.width = (done / total * 100) + '%';
  if (counter) {
    if (done === total) counter.textContent = t('dv_ciertos_complete');
    else counter.textContent = `${done} / ${total}`;
  }
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.dv-search-wrap')) {
    const dd = document.getElementById('dv-dropdown');
    if (dd) dd.style.display = 'none';
  }
});


// ══ CALC CATEGORY DEFINITIONS ══

// ── BÚSQUEDA EN CALCULADORA ────────────────────────────────────
function filterDoseSearch(q) {
  const sr   = document.getElementById('dose-search-results');
  const catV = document.getElementById('dose-cat-view');
  const drugV= document.getElementById('dose-drug-view');
  const clr  = document.getElementById('dose-search-clear');
  const w    = getGlobalWeight();
  const lq   = (q || '').toLowerCase().trim();
  if (clr) clr.style.display = lq ? 'block' : 'none';
  if (!lq) {
    sr.style.display = 'none';
    catV.style.display = 'block';
    drugV.style.display = 'none';
    return;
  }
  // Search across ALL DOSE_DRUGS
  const hits = DOSE_DRUGS.filter(d => d.name.toLowerCase().includes(lq));
  catV.style.display = 'none';
  drugV.style.display = 'none';
  sr.style.display = 'block';
  if (!hits.length) {
    sr.innerHTML = `<div class="calc-sr-empty">🔍 ${t('no_results_meds')}</div>`;
    return;
  }
  sr.innerHTML = hits.map(drug => `
    <div class="inf-drug-card" data-drug="${drug.name.replace(/"/g,'&quot;')}" onclick="openDrugCard(this.dataset.drug)">
      <div class="inf-drug-bar" style="background:${drug.color}"></div>
      <div class="inf-drug-icon" style="background:${drug.color}22;font-size:20px">💊</div>
      <div class="inf-drug-info">
        <div class="inf-drug-name">${drug.name}</div>
        <div class="inf-drug-sub">${drug.source || ''} · ${drug.doses.length} vía${drug.doses.length!==1?'s':''}</div>
      </div>
      <span style="font-size:13px;color:var(--text3)">▶</span>
    </div>`).join('');
}

function clearDoseSearch() {
  const inp = document.getElementById('dose-search');
  if (inp) { inp.value = ''; inp.focus(); }
  filterDoseSearch('');
}

function filterDvSearch(q) {
  const sr   = document.getElementById('dv-search-results');
  const catV = document.getElementById('dv-cat-view');
  const drugV= document.getElementById('dv-drug-view');
  const formV= document.getElementById('dv-form-view');
  const clr  = document.getElementById('dv-search-clear');
  const lq   = (q || '').toLowerCase().trim();
  if (clr) clr.style.display = lq ? 'block' : 'none';
  if (!lq) {
    sr.style.display = 'none';
    catV.style.display = 'block';
    drugV.style.display = 'none';
    // Don't hide form-view if a drug is already selected
    return;
  }
  // Search only drugs with bolus doses (DV-eligible)
  const hits = DOSE_DRUGS.filter(d =>
    d.name.toLowerCase().includes(lq) &&
    d.doses.some(x => !x.infusion && x.factor != null)
  );
  catV.style.display = 'none';
  drugV.style.display = 'none';
  formV.style.display = 'none';
  sr.style.display = 'block';
  if (!hits.length) {
    sr.innerHTML = `<div class="calc-sr-empty">🔍 ${t('no_results_meds')}</div>`;
    return;
  }
  sr.innerHTML = hits.map(d => {
    const bolusCount = d.doses.filter(x => !x.infusion && x.factor != null).length;
    return `<div class="inf-drug-card" onclick="clearDvSearch();dvSelectDrug('${encodeURIComponent(d.name)}')">
      <div class="inf-drug-bar" style="background:${d.color}"></div>
      <div class="inf-drug-icon" style="background:${d.color}22;font-size:18px;width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;">💊</div>
      <div class="inf-drug-info">
        <div class="inf-drug-name">${d.name}</div>
        <div class="inf-drug-sub">${bolusCount} indicaci${bolusCount!==1?'ones':'ón'}</div>
      </div>
    </div>`;
  }).join('');
}

function clearDvSearch() {
  const inp = document.getElementById('dv-search-input');
  if (inp) { inp.value = ''; }
  const clr = document.getElementById('dv-search-clear');
  if (clr) clr.style.display = 'none';
  const sr = document.getElementById('dv-search-results');
  if (sr) sr.style.display = 'none';
}

function buildDoseCatGrid() {
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'es';
  const grid = document.getElementById('dose-cat-grid');
  if (!grid) return;
  const w = getGlobalWeight();
  grid.innerHTML = CALC_CATS.map(cat => {
    const count = DOSE_DRUGS.filter(d => d.cat === cat.id).length;
    if (!count) return '';
    const lbl = cat.label[lang] || cat.label.es;
    return `<div class="calc-cat-card" onclick="showDoseCat('${cat.id}')" style="border-color:${cat.color}44">
      <div class="calc-cat-badge" style="background:${cat.color}">${count}</div>
      <div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${cat.color};border-radius:14px 0 0 14px;"></div>
      <div class="calc-cat-icon">${cat.icon}</div>
      <div class="calc-cat-name">${lbl}</div>
      <div class="calc-cat-count">${count} ${lang==='en'?'drugs':'fármacos'}${w ? ' · '+w+'kg' : ''}</div>
    </div>`;
  }).join('');
}

function showDoseCategories() {
  currentCat = null;
  // Clear search if active
  const inp = document.getElementById('dose-search');
  if (inp && inp.value) { inp.value = ''; filterDoseSearch(''); }
  document.getElementById('dose-cat-view').style.display = 'block';
  document.getElementById('dose-drug-view').style.display = 'none';
  buildDoseCatGrid();
}

function showDoseCat(catId) {
  try {
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'es';
  const cat = CALC_CATS.find(c => c.id === catId);
  if (!cat) return;
  currentCat = catId;
  const drugs = DOSE_DRUGS.filter(d => d.cat === catId);
  const drugLabel = lang==='en' ? 'drugs' : 'fármacos';

  // Rebuild header FIRST (openDrugCard may have removed the inner ID elements)
  const outerBack = document.querySelector('#dose-drug-view > .calc-back-header');
  if (outerBack) {
    outerBack.style.display = '';
    outerBack.innerHTML = `<span class="calc-back-arrow">←</span>
      <span id="dose-back-icon" style="font-size:18px">${cat.icon}</span>
      <span class="calc-back-title" id="dose-back-title">${cat.label[lang] || cat.label.es}</span>
      <span class="calc-back-count" id="dose-back-count">${drugs.length} ${drugLabel}</span>`;
    outerBack.onclick = () => showDoseCategories();
  }

  // Build collapsed drug entry list
  const results = document.getElementById('dose-results');
  results.innerHTML = drugs.map(drug => `
    <div class="inf-drug-card" data-drug="${drug.name.replace(/"/g,'&quot;')}" onclick="openDrugCard(this.dataset.drug)">
      <div class="inf-drug-bar" style="background:${drug.color}"></div>
      <div class="inf-drug-icon" style="background:${drug.color}22;font-size:20px">💊</div>
      <div class="inf-drug-info">
        <div class="inf-drug-name">${drug.name}</div>
        <div class="inf-drug-sub">${drug.source || ''} · ${drug.doses.length} vía${drug.doses.length!==1?'s':''}</div>
      </div>
      <span style="font-size:13px;color:var(--text3)">▶</span>
    </div>`).join('');

  document.getElementById('dose-cat-view').style.display = 'none';
  document.getElementById('dose-drug-view').style.display = 'block';
  } catch(_e) {
    console.error('[PediCode] Error en showDoseCat:', _e);
    /* ── fallback visual ── */
    try {
      var _errEl = document.querySelector('#dose-cat-view');
      if (_errEl) _errEl.innerHTML = '<div style="padding:20px;color:#e05c6e;text-align:center;font-size:13px;">⚠️ Error al cargar esta sección. Recarga la página.</div>';
    } catch(_) {}
  }
}

function openDrugCard(drugName) {
  try {
  const drug = DOSE_DRUGS.find(d => d.name === drugName);
  if (!drug) return;
  // If called from search results, switch to drug-view so the card is visible
  const sr = document.getElementById('dose-search-results');
  const dv = document.getElementById('dose-drug-view');
  if (sr && sr.style.display !== 'none') {
    sr.style.display = 'none';
    if (dv) dv.style.display = 'block';
  }
  const rawW = getGlobalWeight() || 0;
  const w = rawW > 0 ? Math.min(rawW, ADULT_DOSE_CAP) : rawW;
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'es';
  const cat = CALC_CATS.find(c => c.id === drug.cat);
  const results = document.getElementById('dose-results');

  // Drug card
  const statusIcon = drug.status === 'verified' ? '✅' : drug.status === 'pending' ? '🔄' : '⚠️';
  const srcHtml = drug.source
    ? `<div class="dose-source"><span class="dose-src-badge">${statusIcon} ${drug.source}</span><span class="dose-rev-date">Rev. ${drug.rev||'—'}</span></div>`
    : '';
  const notesHtml = drug.notes
    ? `<div class="dose-notes-row"><span class="dose-notes-icon">ℹ️</span><span class="dose-notes-text">${drug.notes}</span></div>`
    : '';

  let doseRows = '';
  for (const d of drug.doses) {
    const neoTag = d.neonatal ? '<span class="dose-tag-neo">NEO</span> ' : '';
    const infTag = d.infusion ? '<span class="dose-tag-inf">PERF</span> ' : '';
    if (d.factor !== null && d.unit !== null && w > 0) {
      const raw = d.factor * w;
      let val = raw < 0.001 ? raw.toFixed(4) : raw < 0.1 ? raw.toFixed(3) : raw < 1 ? raw.toFixed(2) : raw < 10 ? raw.toFixed(1) : Math.round(raw);
      if (d.maxDose !== undefined && raw > d.maxDose) {
        val = `<span style="color:var(--yellow)">${val}</span> <span style="font-size:10px;color:var(--yellow)">(máx ${d.maxDose})</span>`;
      }
      const noteHtml = d.note ? `<div class="dose-max">${d.note}</div>` : '';
      doseRows += `<div class="dose-row">
        <div class="dose-row-label">${neoTag}${infTag}${d.label}<br><small style="color:var(--text3);font-size:10px">${d.range}</small></div>
        <div style="text-align:right"><span class="dose-result">${val}</span> <span class="dose-result-unit">${d.unit}</span>${noteHtml}</div>
      </div>`;
    } else if (w <= 0) {
      doseRows += `<div class="dose-row">
        <div class="dose-row-label">${neoTag}${infTag}${d.label}<br><small style="color:var(--text3);font-size:10px">${d.range}</small></div>
        <div style="text-align:right;font-size:12px;color:var(--yellow)">${lang==='en'?'⚖️ no weight':'⚖️ sin peso'}</div>
      </div>`;
    } else {
      doseRows += `<div class="dose-row">
        <div class="dose-row-label">${neoTag}${infTag}${d.label}<br><small style="color:var(--text3);font-size:10px">${d.range}</small></div>
        <div style="text-align:right;font-size:11px;color:var(--text3)">→ perf.</div>
      </div>`;
    }
  }
  const reportHtml = `<div class="dose-report-row"><button class="dose-report-btn" onclick="reportError('${encodeURIComponent(drug.name)}',event)" title="Reportar error clínico">⚑ Reportar error</button></div>`;

  // Update outer header → show drug name, click → back to category
  const outerBack = document.querySelector('#dose-drug-view > .calc-back-header');
  if (outerBack && cat) {
    outerBack.style.display = '';
    outerBack.innerHTML = `<span class="calc-back-arrow">←</span>
      <span style="font-size:16px">${cat ? cat.icon : '💊'}</span>
      <span class="calc-back-title">${drug.name}</span>`;
    outerBack.onclick = () => showDoseCat(drug.cat);
  }

  results.innerHTML = `<div class="dose-drug-card">
    <div class="dose-drug-header">
      <div class="dose-drug-dot" style="background:${drug.color}"></div>
      <div class="dose-drug-name">${drug.name}</div>
      <div class="dose-drug-cat">${drug.cat}</div>
    </div>
    ${srcHtml}${notesHtml}
    <div class="dose-rows">${doseRows}</div>
    ${reportHtml}
  </div>`;
  } catch(_e) {
    console.error('[PediCode] Error en openDrugCard:', _e);
    /* ── fallback visual ── */
    try {
      var _errEl = document.querySelector('#dose-results');
      if (_errEl) _errEl.innerHTML = '<div style="padding:20px;color:#e05c6e;text-align:center;font-size:13px;">⚠️ Error al cargar esta sección. Recarga la página.</div>';
    } catch(_) {}
  }
}

function filterCat(btn, cat) { currentCat = cat; showDoseCat(cat); }

function onWeightChange() {
  // If a drug card is currently open, re-render it with the new weight
  const backBtn = document.querySelector('#dose-results .calc-back-header');
  if (backBtn) {
    // find the open drug card name
    const nameEl = document.querySelector('#dose-results .dose-drug-name');
    if (nameEl) openDrugCard(nameEl.textContent);
  }
  calcInfusion();
  buildDoseCatGrid();
}

function renderDoses() {
  try {
  const rawW = parseFloat(document.getElementById('calc-weight').value);
  const w = rawW > 0 ? Math.min(rawW, ADULT_DOSE_CAP) : rawW;
  const container = document.getElementById('dose-results');
  if (!container) return;
  if (!w || w <= 0) {
    container.innerHTML = '<div class="dose-empty" style="text-align:center;padding:30px;color:var(--text3);font-size:13px">⚖️ Introduce el peso en la barra superior</div>';
    return;
  }
  const drugs = !currentCat || currentCat === 'ALL' ? DOSE_DRUGS : DOSE_DRUGS.filter(d => d.cat === currentCat);
  if (!drugs.length) { container.innerHTML = `<div class="dose-empty">${t('sc_no_results')}</div>`; return; }
  let out = '';
  for (const drug of drugs) {
    const statusIcon = drug.status === 'verified' ? '✅' : drug.status === 'pending' ? '🔄' : '⚠️';
    const srcHtml = drug.source
      ? '<div class="dose-source"><span class="dose-src-badge">' + statusIcon + ' ' + drug.source + '</span><span class="dose-rev-date">Rev. ' + (drug.rev || '—') + '</span></div>'
      : '';
    const notesHtml = drug.notes
      ? '<div class="dose-notes-row"><span class="dose-notes-icon">ℹ️</span><span class="dose-notes-text">' + drug.notes + '</span></div>'
      : '';
    const reportHtml = '<div class="dose-report-row"><button class="dose-report-btn" onclick="reportError(\'' + encodeURIComponent(drug.name) + '\',event)" title="Reportar error clínico">⚑ Reportar error</button></div>';

    out += '<div class="dose-drug-card">'
      + '<div class="dose-drug-header">'
      + '<div class="dose-drug-dot" style="background:' + drug.color + '"></div>'
      + '<div class="dose-drug-name">' + drug.name + '</div>'
      + '<div class="dose-drug-cat">' + drug.cat + '</div>'
      + '</div>'
      + srcHtml
      + notesHtml
      + '<div class="dose-rows">';
    for (const d of drug.doses) {
      const neoTag = d.neonatal ? '<span class="dose-tag-neo">NEO</span>' : '';
      const infTag = d.infusion ? '<span class="dose-tag-inf">PERF</span>' : '';
      if (d.factor !== null && d.unit !== null) {
        const raw = d.factor * w;
        let val = raw < 0.001 ? raw.toFixed(4) : raw < 0.1 ? raw.toFixed(3) : raw < 1 ? raw.toFixed(2) : raw < 10 ? raw.toFixed(1) : Math.round(raw);
        // Apply maxDose cap
        if (d.maxDose !== undefined && raw > d.maxDose) {
          val = '<span style="color:var(--accent2,#f59e0b)">' + val + '</span> <span style="font-size:10px;color:var(--accent2,#f59e0b)">(máx ' + d.maxDose + ')</span>';
        }
        const noteHtml = d.note ? '<div class="dose-max">' + d.note + '</div>' : '';
        out += '<div class="dose-row">'
          + '<div class="dose-row-label">' + neoTag + infTag + ' ' + d.label + '<br><small style="color:var(--text3);font-size:10px">' + d.range + '</small></div>'
          + '<div style="text-align:right"><span class="dose-result">' + val + '</span> <span class="dose-result-unit">' + d.unit + '</span>' + noteHtml + '</div>'
          + '</div>';
      } else {
        out += '<div class="dose-row">'
          + '<div class="dose-row-label">' + neoTag + infTag + ' ' + d.label + '<br><small style="color:var(--text3);font-size:10px">' + d.range + '</small></div>'
          + '<div style="text-align:right;font-size:11px;color:var(--text3)">→ perf.</div>'
          + '</div>';
      }
    }
    out += '</div>' + reportHtml + '</div>';
  }
  container.innerHTML = out;
  } catch(_e) {
    console.error('[PediCode] Error en renderDoses:', _e);
    /* ── fallback visual ── */
    try {
      var _errEl = document.querySelector('#dose-results');
      if (_errEl) _errEl.innerHTML = '<div style="padding:20px;color:#e05c6e;text-align:center;font-size:13px;">⚠️ Error al cargar esta sección. Recarga la página.</div>';
    } catch(_) {}
  }
}

function reportError(encodedName, e) {
  e.stopPropagation();
  const name = decodeURIComponent(encodedName);
  const subject = encodeURIComponent('[PediCode] Error clínico: ' + name);
  const body = encodeURIComponent(
    'Fármaco: ' + name + '\n' +
    'Descripción del error / sugerencia:\n\n\n' +
    '---\nPediCode v2 · ' + new Date().toLocaleDateString('es-ES')
  );
  window.open('mailto:pedicode.app@gmail.com?subject=' + subject + '&body=' + body, '_blank');
}
// ─── INFUSION VERIFIER (flujo enfermero) ────────────────────────────────────
// Prescripción real: "X mg de fármaco en Y mL a Z mL/h → (unidad/kg/tiempo)"
// Inputs: peso (ya existe), fármaco, mg fármaco, mL totales, velocidad mL/h
// Outputs: concentración jeringa (mg/mL), dosis recibida (unidad/kg/tiempo), rango


// ══ INFUSION DRUG CARD PICKER ══

function toggleSC(card) {
  const open = card.classList.contains('open');
  document.querySelectorAll('.sc-card.open').forEach(c => c.classList.remove('open'));
  if (!open) card.classList.add('open');
}

// ══ SCORES DRILL-DOWN ══

let _scCurrentCat = null;

// ═══════════════════════════════════════════════════════════════
// PARÁMETROS VITALES — DRILL-DOWN
// ═══════════════════════════════════════════════════════════════

function buildVitalsCatGrid() {
  try {
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'es';
  const grid = document.getElementById('vt-cat-grid');
  if (!grid) return;
  const w = getGlobalWeight();
  grid.innerHTML = VITALS_CATS.map(cat => {
    const lbl = cat.label[lang] || cat.label.es;
    const desc = cat.desc[lang] || cat.desc.es;
    const accent = `style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${cat.color};border-radius:14px 0 0 14px;"`;
    // weight badge only for vitals card when weight is set
    const badge = (cat.id === 'vitals' && w)
      ? `<span class="vt-weight-badge">${w} kg</span>`
      : '';
    return `<div class="vt-cat-card" onclick="showVitalsCat('${cat.id}')" style="border-color:${cat.color}44">
      <div ${accent}></div>
      <div class="vt-cat-icon">${cat.icon}</div>
      <div class="vt-cat-name">${lbl}${badge}</div>
      <div class="vt-cat-desc">${desc}</div>
    </div>`;
  }).join('');
  } catch(_e) {
    console.error('[PediCode] Error en buildVitalsCatGrid:', _e);
    /* ── fallback visual ── */
    try {
      var _errEl = document.querySelector('#vt-cat-grid');
      if (_errEl) _errEl.innerHTML = '<div style="padding:20px;color:#e05c6e;text-align:center;font-size:13px;">⚠️ Error al cargar esta sección. Recarga la página.</div>';
    } catch(_) {}
  }
}

function showVitalsCategories() {
  document.getElementById('vt-cat-view').style.display = 'block';
  document.getElementById('vt-card-view').style.display = 'none';
  buildVitalsCatGrid();
}

function showVitalsCat(catId) {
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'es';
  const cat = VITALS_CATS.find(c => c.id === catId);
  if (!cat) return;
  // Move card from hidden pool into view
  const pool = document.getElementById('vtcard-' + catId);
  const content = document.getElementById('vt-card-content');
  if (!pool || !content) return;
  content.innerHTML = '';
  content.appendChild(pool);
  pool.style.display = '';
  // Update back header
  document.getElementById('vt-back-icon').textContent = cat.icon;
  document.getElementById('vt-back-title').textContent = cat.label[lang] || cat.label.es;
  document.getElementById('vt-cat-view').style.display = 'none';
  document.getElementById('vt-card-view').style.display = 'block';
  // Highlight weight row if vitals card
  if (catId === 'vitals') highlightVitalsRow();
}

function highlightVitalsRow() {
  const w = getGlobalWeight();
  const rows = document.querySelectorAll('#main-vitals-tbody tr[data-wt]');
  rows.forEach(r => r.classList.remove('vt-highlight'));
  if (!w) return;
  // Find closest weight row
  let closest = null, minDiff = Infinity;
  rows.forEach(r => {
    const rowW = parseFloat(r.dataset.wt);
    const diff = Math.abs(rowW - w);
    if (diff < minDiff) { minDiff = diff; closest = r; }
  });
  if (closest) {
    closest.classList.add('vt-highlight');
    // Append badge to weight cell
    const td = closest.cells[1];
    if (td && !td.querySelector('.vt-weight-badge')) {
      td.insertAdjacentHTML('beforeend', ' <span class="vt-weight-badge">↑ paciente</span>');
    }
  }
}

function buildScoreCatGrid() {
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'es';
  const grid = document.getElementById('sc-cat-grid');
  if (!grid) return;
  grid.innerHTML = SCORE_CATS.map(cat => {
    const lbl = cat.label[lang] || cat.label.es;
    return `<div class="calc-cat-card" onclick="showScoreCat('${cat.id}')" style="border-color:${cat.color}44">
      <div class="calc-cat-badge" style="background:${cat.color}">${cat.cards.length}</div>
      <div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${cat.color};border-radius:14px 0 0 14px;"></div>
      <div class="calc-cat-icon">${cat.icon}</div>
      <div class="calc-cat-name">${lbl}</div>
      <div class="calc-cat-count">${cat.cards.length} ${cat.cards.length === 1 ? 'escala' : 'escalas'}</div>
    </div>`;
  }).join('');
}

function showScoreCategories() {
  _scCurrentCat = null;
  // Rescue any real sc-cards in sc-card-list or sc-search-results → move back to sc-cards-hidden
  const hidden = document.getElementById('sc-cards-hidden');
  ['sc-card-list','sc-search-results'].forEach(containerId => {
    document.querySelectorAll('#' + containerId + ' .sc-card').forEach(c => {
      c.classList.remove('open');
      c.classList.add('hidden');
      hidden.appendChild(c);
    });
  });
  document.getElementById('sc-cat-view').style.display = 'block';
  document.getElementById('sc-list-view').style.display = 'none';
  document.getElementById('sc-search-results').style.display = 'none';
  document.getElementById('scores-search').value = '';
  // Hide all real cards
  document.querySelectorAll('#sc-cards-hidden .sc-card').forEach(c => c.classList.add('hidden'));
}

function showScoreCat(catId) {
  try {
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'es';
  const cat = SCORE_CATS.find(c => c.id === catId);
  if (!cat) return;
  _scCurrentCat = catId;
  // Rescue any real sc-cards currently in sc-card-list → move back to sc-cards-hidden
  const hidden = document.getElementById('sc-cards-hidden');
  const list = document.getElementById('sc-card-list');
  list.querySelectorAll('.sc-card').forEach(c => {
    c.classList.remove('open');
    c.classList.add('hidden');
    hidden.appendChild(c);
  });

  // Build list of score entry cards
  list.innerHTML = cat.cards.map(cid => {
    const srcCard = document.getElementById(cid);
    if (!srcCard) return '';
    const titleEl = srcCard.querySelector('.sc-title');
    const tagEl = srcCard.querySelector('.sc-tag');
    const header = srcCard.querySelector('.sc-header');
    const color = header ? (header.style.borderLeftColor || '#38bdf8') : '#38bdf8';
    const title = titleEl ? titleEl.textContent : cid;
    const tag = tagEl ? tagEl.textContent : '';
    return `<div class="inf-drug-card" onclick="openScoreCard('${cid}')">
      <div class="inf-drug-bar" style="background:${cat.color}"></div>
      <div class="inf-drug-icon" style="background:${cat.color}22; font-size:18px">${cat.icon}</div>
      <div class="inf-drug-info">
        <div class="inf-drug-name">${title}</div>
        <div class="inf-drug-sub">${tag}</div>
      </div>
      <span style="font-size:13px;color:var(--text3)">▶</span>
    </div>`;
  }).join('');

  // Restore outer header to show category name
  const outerHdr = document.querySelector('#sc-list-view .calc-back-header');
  if (outerHdr) {
    const count = cat.cards.length;
    outerHdr.innerHTML = `<span class="calc-back-arrow">←</span>
      <span id="sc-back-icon" style="font-size:18px">${cat.icon}</span>
      <span class="calc-back-title" id="sc-back-title">${cat.label[lang] || cat.label.es}</span>
      <span class="calc-back-count" id="sc-back-count">${count}${count===1?' escala':' escalas'}</span>`;
    outerHdr.onclick = () => showScoreCategories();
  }

  document.getElementById('sc-cat-view').style.display = 'none';
  document.getElementById('sc-list-view').style.display = 'block';
  document.getElementById('sc-search-results').style.display = 'none';
  } catch(_e) {
    console.error('[PediCode] Error en showScoreCat:', _e);
    /* ── fallback visual ── */
    try {
      var _errEl = document.querySelector('#sc-cat-grid');
      if (_errEl) _errEl.innerHTML = '<div style="padding:20px;color:#e05c6e;text-align:center;font-size:13px;">⚠️ Error al cargar esta sección. Recarga la página.</div>';
    } catch(_) {}
  }
}

function openScoreCard(cid) {
  try {
  const realCard = document.getElementById(cid);
  if (!realCard) return;

  const cat = SCORE_CATS.find(c => c.cards.includes(cid));
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'es';

  // Update outer breadcrumb header → show score name, click → back to category list
  const outerHdr = document.querySelector('#sc-list-view .calc-back-header');
  if (outerHdr && cat) {
    const scoreName = realCard.querySelector('.sc-title')?.textContent || cid;
    outerHdr.innerHTML = `<span class="calc-back-arrow">←</span>
      <span style="font-size:16px">${cat.icon}</span>
      <span class="calc-back-title">${scoreName}</span>`;
    outerHdr.onclick = () => showScoreCat(cat.id);
  }

  // Fill list with only the card (no inner back div)
  realCard.classList.remove('hidden');
  if (!realCard.classList.contains('open')) toggleSC(realCard);
  const list = document.getElementById('sc-card-list');
  list.innerHTML = '';
  list.appendChild(realCard);

  document.getElementById('sc-cat-view').style.display = 'none';
  document.getElementById('sc-list-view').style.display = 'block';
  realCard.scrollIntoView({behavior:'smooth', block:'start'});
  } catch(_e) {
    console.error('[PediCode] Error en openScoreCard:', _e);
    /* ── fallback visual ── */
    try {
      var _errEl = document.querySelector('#sc-card-view');
      if (_errEl) _errEl.innerHTML = '<div style="padding:20px;color:#e05c6e;text-align:center;font-size:13px;">⚠️ Error al cargar esta sección. Recarga la página.</div>';
    } catch(_) {}
  }
}

function filterScores() {
  const q = document.getElementById('scores-search').value.toLowerCase().trim();
  const catView = document.getElementById('sc-cat-view');
  const listView = document.getElementById('sc-list-view');
  const srView = document.getElementById('sc-search-results');
  if (!q) {
    srView.style.display = 'none';
    // Restore last view
    if (_scCurrentCat) { showScoreCat(_scCurrentCat); }
    else { catView.style.display = 'block'; listView.style.display = 'none'; }
    return;
  }
  catView.style.display = 'none';
  listView.style.display = 'none';
  srView.style.display = 'block';
  // Show matching cards inline from hidden pool
  const matches = [];
  document.querySelectorAll('#sc-cards-hidden .sc-card').forEach(c => {
    const txt = (c.dataset.keywords||'') + ' ' + (c.querySelector('.sc-title')||{textContent:''}).textContent.toLowerCase();
    if (txt.includes(q)) matches.push(c);
  });
  srView.innerHTML = matches.length
    ? `<div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;margin-bottom:8px">${matches.length} resultado${matches.length!==1?'s':''}</div>`
    : '';
  matches.forEach(c => { c.classList.remove('hidden'); srView.appendChild(c); });
  document.getElementById('scores-no-results').style.display = matches.length===0 ? 'block' : 'none';
}
function filterScoreTag(btn, tag) { /* legacy no-op */ }
// ═══ PWA SERVICE WORKER ═══
// ── SERVICE WORKER — gestión de versiones ─────────────────────────
let _swReg = null;
let _swUpdateAvailable = false;

function _swShowUpdateAvailable() {
  _swUpdateAvailable = true;
  // Mostrar badge rojo en el botón ℹ️
  const badge = document.getElementById('update-badge');
  if (badge) badge.style.display = 'block';
  // Actualizar el botón si el modal está abierto
  _swRefreshUpdateUI();
}

function _swRefreshUpdateUI() {
  const btn = document.getElementById('about-update-btn');
  const status = document.getElementById('about-update-status');
  const verEl = document.getElementById('about-sw-version');
  const L = {
    es: { ready: '🟠 Actualización disponible', current: '✅ App actualizada',
          apply: '⬇ Instalar actualización', check: 'Buscar actualización' },
    pt: { ready: '🟠 Atualização disponível',  current: '✅ App atualizada',
          apply: '⬇ Instalar atualização',    check: 'Verificar atualização' },
    en: { ready: '🟠 Update available',        current: '✅ App up to date',
          apply: '⬇ Install update',          check: 'Check for update' },
  };
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'es';
  const lbl = L[lang] || L.es;
  // Versión SW actual
  if (verEl) {
    const cache = typeof CHANGELOG !== 'undefined' && CHANGELOG[0] ? CHANGELOG[0].ver : '—';
    verEl.textContent = cache;
  }
  if (_swUpdateAvailable) {
    if (status) status.innerHTML = '<span style="color:#fb923c;font-weight:600">' + lbl.ready + '</span>';
    if (btn) {
      btn.textContent = lbl.apply;
      btn.style.background = 'rgba(251,146,60,0.15)';
      btn.style.borderColor = 'rgba(251,146,60,0.4)';
      btn.style.color = '#fb923c';
    }
  } else {
    if (status) status.textContent = lbl.current;
    if (btn) {
      btn.textContent = lbl.check;
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
    }
  }
}

async function doManualUpdate() {
  const btn = document.getElementById('about-update-btn');
  const status = document.getElementById('about-update-status');
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'es';
  const L = {
    es: { checking: '⏳ Comprobando...', found: '🟠 Actualización encontrada — instalando...', uptodate: '✅ Ya tienes la versión más reciente', error: '⚠ Sin conexión — inténtalo más tarde' },
    pt: { checking: '⏳ A verificar...', found: '🟠 Atualização encontrada — a instalar...', uptodate: '✅ Tens a versão mais recente', error: '⚠ Sem ligação — tenta mais tarde' },
    en: { checking: '⏳ Checking...', found: '🟠 Update found — installing...', uptodate: '✅ You have the latest version', error: '⚠ No connection — try again later' },
  };
  const lbl = L[lang] || L.es;
  if (!('serviceWorker' in navigator)) return;

  if (_swUpdateAvailable && _swReg && _swReg.waiting) {
    // Hay uno esperando → instalar ahora
    if (btn) { btn.textContent = lbl.found; btn.disabled = true; }
    _swReg.waiting.postMessage({ type: 'SKIP_WAITING' });
    return;
  }

  // Buscar actualización en red
  if (btn) { btn.textContent = lbl.checking; btn.disabled = true; }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) { if (btn) { btn.textContent = lbl.uptodate; btn.disabled = false; } return; }
    _swReg = reg;
    await reg.update();
    if (reg.waiting) {
      _swShowUpdateAvailable();
      if (btn) { btn.textContent = lbl.found; btn.disabled = false; }
      // dar un momento y aplicar
      setTimeout(() => { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); }, 800);
    } else {
      if (status) status.textContent = lbl.uptodate;
      if (btn) { btn.textContent = lbl.uptodate; btn.disabled = false; }
      setTimeout(() => { _swRefreshUpdateUI(); }, 3000);
    }
  } catch(e) {
    if (btn) { btn.textContent = lbl.error; btn.disabled = false; }
    setTimeout(() => { _swRefreshUpdateUI(); }, 4000);
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        _swReg = reg;
        console.log('[PediCode] SW registrado, scope:', reg.scope);

        // Verificar actualización silenciosa al abrir (sin forzar recarga)
        reg.update().catch(() => {});

        // Si ya hay uno esperando → notificar (NO aplicar automáticamente)
        if (reg.waiting) {
          _swShowUpdateAvailable();
        }

        // Detectar nuevo SW durante la sesión
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              _swShowUpdateAvailable();
            }
          });
        });
      })
      .catch(e => console.warn('[PediCode] SW registration failed:', e));

    // Cuando se activa el nuevo SW → recargar para aplicar caché nueva
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}


/* ══ ABOUT MODAL ══ */
/* ══ CHANGELOG DATA ══ */

function renderChangelog(lang) {
  const container = document.getElementById('changelog-list');
  if (!container) return;
  const badgeLbl = (type, l) => {
    const map = {
      es: {major:'nueva versión', minor:'actualización'},
      pt: {major:'nova versão',   minor:'atualização'},
      en: {major:'new version',   minor:'update'},
    };
    return (map[l] || map.es)[type] || type;
  };
  container.innerHTML = CHANGELOG.map((entry, i) => {
    const items = (entry.items[lang] || entry.items.es);
    const dotColor = entry.type === 'major'
      ? 'var(--accent)'
      : 'var(--green)';
    const isFirst = i === 0;
    return `<div class="cl-card" id="clc-${i}" style="
        background:var(--surface2);
        border:1px solid var(--border);
        border-radius:10px;
        overflow:hidden;
        transition:border-color .2s;
      ">
      <!-- Version header row (always visible, clickable) -->
      <div onclick="toggleCL(${i})" style="
          display:flex;align-items:center;gap:10px;
          padding:10px 14px;cursor:pointer;
          user-select:none;
        ">
        <div style="width:9px;height:9px;border-radius:50%;background:${dotColor};flex-shrink:0"></div>
        <span style="font-size:13px;font-weight:700;color:var(--text);font-family:'DM Mono',monospace">${entry.ver}</span>
        <span style="font-size:11px;color:var(--text3)">${entry.date}</span>
        <span style="font-size:10px;color:${dotColor};background:${dotColor}1a;border:1px solid ${dotColor}40;
              border-radius:20px;padding:1px 7px;font-weight:600;margin-right:auto">${badgeLbl(entry.type, lang)}</span>
        <span id="clc-arr-${i}" style="
            color:var(--text3);font-size:11px;
            transition:transform .2s;display:inline-block;
            transform:${isFirst ? 'rotate(90deg)' : 'rotate(0deg)'}
          ">▶</span>
      </div>
      <!-- Items panel (collapsible) -->
      <div id="clc-body-${i}" style="
          display:${isFirst ? 'block' : 'none'};
          padding:0 14px 12px 33px;
          border-top:1px solid var(--border);
        ">
        ${items.map(t => `<div style="
            font-size:12px;color:var(--text2);line-height:1.6;
            padding:4px 0;
            border-bottom:1px solid var(--border);
          ">${t}</div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function toggleCL(i) {
  const body = document.getElementById('clc-body-' + i);
  const arr  = document.getElementById('clc-arr-' + i);
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (arr) arr.style.transform = open ? 'rotate(0deg)' : 'rotate(90deg)';
}

function openAbout(){
  const overlay = document.getElementById('about-overlay');
  overlay.style.display = 'block';
  const lang = currentLang;
  const langData = T[lang] || T['es'];
  // Update i18n inside modal
  overlay.querySelectorAll('[data-i18n]').forEach(el => {
    const val = langData[el.dataset.i18n];
    if(val !== undefined) el.textContent = val;
  });
  overlay.querySelectorAll('[data-i18n-html]').forEach(el => {
    const val = langData[el.dataset.i18nHtml];
    if(val !== undefined) el.innerHTML = val;
  });
  renderChangelog(lang);
  if (document.getElementById('meds-categories')?.style.display !== 'none') buildMedCatGrid();
  // Refresh update UI state
  _swRefreshUpdateUI();
}

// renderUpdateBtn replaced by _swRefreshUpdateUI + doManualUpdate
function closeAbout(){
  document.getElementById('about-overlay').style.display = 'none';
}

/* ══ PROTOCOL CONTENT DATA (trilingual) ══ */


let _protoCatActive = null;

function buildProtoCatGrid() {
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'es';
  const grid = document.getElementById('pt-cat-grid');
  if (!grid) return;
  grid.innerHTML = PROTO_CATS.map(cat => {
    const count = cat.cards.length;
    const lbl = cat.label[lang] || cat.label.es;
    return `<div class="calc-cat-card" onclick="showProtoCat('${cat.id}')" style="border-color:${cat.color}44">
      <div class="calc-cat-badge" style="background:${cat.color}">${count}</div>
      <div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${cat.color};border-radius:14px 0 0 14px;"></div>
      <div class="calc-cat-icon">${cat.icon}</div>
      <div class="calc-cat-name">${lbl}</div>
      <div class="calc-cat-count">${count} ${lang==='en'?'protocol'+(count!==1?'s':''):'protocolo'+(count!==1?'s':'')}</div>
    </div>`;
  }).join('');
}

function showProtoCategories() {
  _protoCatActive = null;
  // Rescue any proto-cards in pt-card-list or pt-search-results → back to hidden pool
  const hidden = document.getElementById('pt-cards-hidden');
  if (!hidden) return;
  ['pt-card-list','pt-search-results'].forEach(cid => {
    const el = document.getElementById(cid);
    if (!el) return;
    el.querySelectorAll('.proto-card').forEach(c => {
      c.classList.remove('open');
      hidden.appendChild(c);
    });
  });
  const catView = document.getElementById('pt-cat-view');
  const listView = document.getElementById('pt-list-view');
  const srView = document.getElementById('pt-search-results');
  const searchEl = document.getElementById('pt-search');
  if (catView) catView.style.display = 'block';
  if (listView) listView.style.display = 'none';
  if (srView) srView.style.display = 'none';
  if (searchEl) searchEl.value = '';
}

function showProtoCat(catId) {
  try {
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'es';
  const cat = PROTO_CATS.find(c => c.id === catId);
  if (!cat) return;
  _protoCatActive = catId;

  // Rescue any proto-cards currently in pt-card-list → back to hidden pool
  const hidden = document.getElementById('pt-cards-hidden');
  const list = document.getElementById('pt-card-list');
  list.querySelectorAll('.proto-card').forEach(c => {
    c.classList.remove('open');
    hidden.appendChild(c);
  });

  // Build entry cards for this category
  list.innerHTML = cat.cards.map(cid => {
    const srcCard = document.getElementById(cid);
    if (!srcCard) return '';
    const name = srcCard.querySelector('.proto-name')?.textContent || cid;
    const src = srcCard.querySelector('.proto-src')?.textContent || '';
    return `<div class="inf-drug-card" onclick="openProtoCard('${cid}')">
      <div class="inf-drug-bar" style="background:${cat.color}"></div>
      <div class="inf-drug-icon" style="background:${cat.color}22;font-size:20px">${cat.icon}</div>
      <div class="inf-drug-info">
        <div class="inf-drug-name">${name}</div>
        <div class="inf-drug-sub">${src}</div>
      </div>
      <span style="font-size:13px;color:var(--text3)">▶</span>
    </div>`;
  }).join('');

  // Restore outer header to show category (may have been changed by openProtoCard)
  const outerHdr = document.querySelector('#pt-list-view .calc-back-header');
  if (outerHdr) {
    outerHdr.innerHTML = `<span class="calc-back-arrow">←</span>
      <span id="pt-back-icon" style="font-size:18px">${cat.icon}</span>
      <span class="calc-back-title" id="pt-back-title">${cat.label[lang] || cat.label.es}</span>
      <span class="calc-back-count" id="pt-back-count">${cat.cards.length} protocolo${cat.cards.length!==1?'s':''}</span>`;
    outerHdr.onclick = () => showProtoCategories();
  }

  document.getElementById('pt-cat-view').style.display = 'none';
  document.getElementById('pt-list-view').style.display = 'block';
  document.getElementById('pt-search-results').style.display = 'none';
  } catch(_e) {
    console.error('[PediCode] Error en showProtoCat:', _e);
    /* ── fallback visual ── */
    try {
      var _errEl = document.querySelector('#pt-cat-grid');
      if (_errEl) _errEl.innerHTML = '<div style="padding:20px;color:#e05c6e;text-align:center;font-size:13px;">⚠️ Error al cargar esta sección. Recarga la página.</div>';
    } catch(_) {}
  }
}

function openProtoCard(cid) {
  try {
  const realCard = document.getElementById(cid);
  if (!realCard) return;

  const cat = PROTO_CATS.find(c => c.cards.includes(cid));
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'es';

  // Update outer breadcrumb header → show card name, click → back to category list
  const outerHdr = document.querySelector('#pt-list-view .calc-back-header');
  if (outerHdr && cat) {
    const cardName = realCard.querySelector('.proto-name')?.textContent || cid;
    outerHdr.innerHTML = `<span class="calc-back-arrow">←</span>
      <span style="font-size:16px">${cat.icon}</span>
      <span class="calc-back-title">${cardName}</span>`;
    outerHdr.onclick = () => showProtoCat(cat.id);
  }

  // Fill list with only the card (no inner back div)
  const list = document.getElementById('pt-card-list');
  list.innerHTML = '';
  if (!realCard.classList.contains('open')) realCard.classList.add('open');
  list.appendChild(realCard);

  document.getElementById('pt-cat-view').style.display = 'none';
  document.getElementById('pt-list-view').style.display = 'block';
  realCard.scrollIntoView({behavior: 'smooth', block: 'start'});
  } catch(_e) {
    console.error('[PediCode] Error en openProtoCard:', _e);
    /* ── fallback visual ── */
    try {
      var _errEl = document.querySelector('#pt-card-view');
      if (_errEl) _errEl.innerHTML = '<div style="padding:20px;color:#e05c6e;text-align:center;font-size:13px;">⚠️ Error al cargar esta sección. Recarga la página.</div>';
    } catch(_) {}
  }
}

function filterProtos(q) {
  const lq = (q || '').toLowerCase().trim();
  const catView = document.getElementById('pt-cat-view');
  const listView = document.getElementById('pt-list-view');
  const srView = document.getElementById('pt-search-results');
  const hidden = document.getElementById('pt-cards-hidden');

  if (!lq) {
    srView.style.display = 'none';
    if (_protoCatActive) { showProtoCat(_protoCatActive); }
    else { catView.style.display = 'block'; listView.style.display = 'none'; }
    return;
  }

  // Rescue cards from list/search back to hidden before searching
  ['pt-card-list','pt-search-results'].forEach(cid => {
    const el = document.getElementById(cid);
    if (el) el.querySelectorAll('.proto-card').forEach(c => hidden.appendChild(c));
  });

  catView.style.display = 'none';
  listView.style.display = 'none';
  srView.style.display = 'block';

  const matches = [];
  hidden.querySelectorAll('.proto-card').forEach(c => {
    const name = (c.querySelector('.proto-name')?.textContent || '').toLowerCase();
    const body = (c.textContent || '').toLowerCase();
    if (name.includes(lq) || body.includes(lq)) matches.push(c);
  });

  srView.innerHTML = matches.length
    ? `<div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;margin-bottom:8px">${matches.length} resultado${matches.length!==1?'s':''}</div>`
    : '<div style="text-align:center;padding:30px;color:var(--text3);font-size:13px">🔍 Sin resultados</div>';
  matches.forEach(c => srView.appendChild(c));
}


function renderProtoUI() {
  try {
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'pt';
  const data = PROTO[lang];
  const hidden = document.getElementById('pt-cards-hidden');
  if (!hidden || !data) return;

  // Only rebuild on lang change
  const currentLangAttr = hidden.dataset.lang;
  if (currentLangAttr === lang && hidden.children.length > 0) {
    updateProtoDoseChips();
    buildProtoCatGrid();
    return;
  }

  // Build all proto cards into the hidden pool
  hidden.innerHTML = data.cards.map(card => {
    // Build visual algorithm steps from phases
    const stepsHTML = card.phases.map((ph, idx) => {
      const itemsHTML = ph.items.map(item =>
        `<div class="algo-item-text">${item.text}</div>`
      ).join('');
      return `<div class="algo-step">
        <div class="algo-step-left">
          <div class="algo-step-num">${idx + 1}</div>
          ${idx < card.phases.length - 1 ? '<div class="algo-step-spine"></div>' : ''}
        </div>
        <div class="algo-step-content">
          <div class="algo-step-head">
            <span class="algo-step-tag">${ph.tag}</span>
            <span class="algo-step-title">${ph.title}</span>
          </div>
          <div class="algo-step-items">${itemsHTML}</div>
        </div>
      </div>`;
    }).join('');

    const srcTxt = (T[lang] && T[lang][card.src]) ? T[lang][card.src] : card.src;
    const badgeTxt = (T[lang] && T[lang][card.badge]) ? T[lang][card.badge] : card.badge;
    const wLbl = t('proto_weight_lbl');
    const wLink = t('proto_weight_link');

    return `<div class="proto-card ${card.cls}" id="${card.id}">
      <div class="proto-header" onclick="toggleCard('${card.id}')">
        <div class="proto-color-bar"></div>
        <div class="proto-info">
          <div class="proto-name">${card.name}</div>
          <div class="proto-src">${srcTxt}</div>
        </div>
        <span class="proto-badge">${badgeTxt}</span>
        <span class="proto-arrow">▼</span>
      </div>
      <div class="proto-body">
        <div class="proto-weight-bar">
          <span class="proto-weight-ico">⚖️</span>
          <span class="proto-weight-lbl">${wLbl}:</span>
          <span class="proto-weight-val" id="pw-${card.id}">—</span>
          <span class="proto-weight-link" onclick="goToCalc()">${wLink}</span>
        </div>
        <div class="source-note">${card.sourceNote}</div>
        <div class="algo-steps">${stepsHTML}</div>
      </div>
    </div>`;
  }).join('');

  hidden.dataset.lang = lang;

  // Inject dose chips (reads .algo-item-text)
  injectProtoDoseChips();
  updateProtoDoseChips();

  // Build category grid and show category view
  buildProtoCatGrid();
  showProtoCategories();
  } catch(_e) {
    console.error('[PediCode] Error en renderProtoUI:', _e);
    /* ── fallback visual ── */
    try {
      var _errEl = document.querySelector('#tab-protos');
      if (_errEl) _errEl.innerHTML = '<div style="padding:20px;color:#e05c6e;text-align:center;font-size:13px;">⚠️ Error al cargar esta sección. Recarga la página.</div>';
    } catch(_) {}
  }
}

// ═══════════════════════════════════════════════════════════════════
// PROTOCOL DOSE CHIP ENGINE
// Detects dose patterns in protocol item text, injects calculated
// chips that update in real-time when patient weight changes.
// ═══════════════════════════════════════════════════════════════════

// Regex: matches "0.3 mg/kg", "40–60 mg/kg/día", "2 mL/kg", "0.01 mg/kg", "5 mEq/kg", "0,3 mg/kg"
// Captures: [full match, factor_or_range, unit]
const DOSE_PATTERN = /(\d+(?:[.,]\d+)?(?:\s*[–\-]\s*\d+(?:[.,]\d+)?)?)\s*(mg|mcg|µg|mEq|mL|g|U|mmol)\/kg(?:\/(?:día|dia|day|min|h|hora|hour))?/gi;

// Max dose hints embedded in protocol text: "máx Xmg", "max X mg"
const MAX_PATTERN = /m[aá]x(?:imo|imum)?\s*[:\s]?\s*(\d+(?:[.,]\d+)?)\s*(mg|mcg|mEq|mL|g|U)/i;

function injectProtoDoseChips() {
  // For each algo-item-text div, scan for dose patterns and wrap them
  document.querySelectorAll('#tab-protos .algo-item-text').forEach(span => {
    if (span.dataset.doseInjected) return;
    const html = span.innerHTML;
    const newHtml = html.replace(DOSE_PATTERN, (match, factorStr, unit) => {
      // Parse factor — may be range like "40–60"
      const clean = factorStr.replace(',', '.').replace(/\s/g, '');
      const rangeParts = clean.split(/[–\-]/);
      let lo = parseFloat(rangeParts[0]);
      let hi = rangeParts.length > 1 ? parseFloat(rangeParts[1]) : lo;
      if (isNaN(lo)) return match;
      const mid = (lo + hi) / 2;
      // Encode max from surrounding text
      const maxM = span.textContent.match(MAX_PATTERN);
      const maxAbs = maxM ? parseFloat(maxM[1].replace(',', '.')) : null;
      return `${match}<span class="pdose-chip pdose-no-weight" data-lo="${lo}" data-hi="${hi}" data-mid="${mid}" data-unit="${unit}" data-max="${maxAbs || ''}" onclick="goToCalc()">⚖ kg?</span>`;
    });
    if (newHtml !== html) {
      span.innerHTML = newHtml;
      span.dataset.doseInjected = '1';
    }
  });
}

function updateProtoDoseChips() {
  const w = parseFloat(document.getElementById('calc-weight')?.value);
  const hasWeight = w && w > 0;

  // Update weight bars in all protocol cards
  document.querySelectorAll('[id^="pw-"]').forEach(el => {
    el.textContent = hasWeight ? `${w} kg` : t('proto_weight_none');
    el.style.color = hasWeight ? 'var(--accent)' : 'var(--text3)';
  });

  // Update all dose chips
  document.querySelectorAll('.pdose-chip').forEach(chip => {
    if (!hasWeight) {
      chip.textContent = t('proto_dose_no_weight') || '⚖ kg?';
      chip.className = 'pdose-chip pdose-no-weight';
      chip.onclick = goToCalc;
      return;
    }
    const lo = parseFloat(chip.dataset.lo);
    const hi = parseFloat(chip.dataset.hi);
    const unit = chip.dataset.unit;
    const maxAbs = chip.dataset.max ? parseFloat(chip.dataset.max) : null;

    const valLo = lo * w;
    const valHi = hi * w;
    const fmt = v => v < 0.001 ? v.toFixed(4) : v < 0.1 ? v.toFixed(3) : v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : Math.round(v);

    let display, isCapped = false;
    if (lo === hi) {
      let v = valLo;
      if (maxAbs && v > maxAbs) { v = maxAbs; isCapped = true; }
      display = `${fmt(v)} ${unit}`;
    } else {
      let vLo = valLo, vHi = valHi;
      if (maxAbs && vHi > maxAbs) { vHi = maxAbs; isCapped = true; }
      display = `${fmt(vLo)}–${fmt(vHi)} ${unit}`;
    }
    if (isCapped) display += ` (${t('proto_dose_max') || 'máx'})`;

    chip.textContent = display;
    chip.className = isCapped ? 'pdose-chip pdose-max' : 'pdose-chip';
    chip.onclick = null;
    chip.title = `Para ${w} kg · Rango: ${lo}–${hi} ${unit}/kg`;
  });
}

function goToCalc() {
  // Switch to calc tab and focus weight input
  const calcBtn = document.querySelector('.tab-btn[onclick*="calc"]');
  if (calcBtn) { showTab(calcBtn, 'calc'); }
  setTimeout(() => { const wi = document.getElementById('calc-weight'); if (wi) wi.focus(); }, 100);
}

// ═══════════════════════════════════════════════════════════════════
// data/compatibilities.js — Compatibilidad en Y de fármacos IV
// PediCode v1.0 — módulo de compatibilidades
// ───────────────────────────────────────────────────────────────────
// Fuentes principales:
//   • Stabilis 4.0 (stabilis.org)
//   • Trissel's Handbook on Injectable Drugs (15ª ed.)
//   • Santos MT et al. Rev Bras Farm Hosp Serv Saúde 2013;4(3):34-37
//   • King Guide to Parenteral Admixtures
//   • Micromedex 2.0 (Truven Health Analytics)
//
// ⚠ Verificar siempre con farmacéutico clínico o fuente primaria.
//    Los datos de compatibilidad pueden variar según concentración,
//    diluyente, temperatura y tiempo de contacto.
// ═══════════════════════════════════════════════════════════════════

// ─── LISTA DE FÁRMACOS ─────────────────────────────────────────────
// id: clave interna (lowercase, sin acentos)
// label: etiqueta multilingual
// icon: emoji representativo
// group: agrupación visual
// ═══════════════════════════════════════════════════════════════════
// COMPATIBILIDAD EN Y — UCIP + NICU
// ───────────────────────────────────────────────────────────────────
// FUENTES:
//  [CL2020] Castells Lao G et al. Med Intensiva 2020;44(2):80-87
//           Hospital Clínic Barcelona — 44 fármacos, revisión sistemática
//           Fuente: Medline + Stabilis 4.0 + Trissel's + Micromedex
//  [LPaz]   H. La Paz 2020 — Servicio de Farmacia, tabla práctica UCI
//  [Tri]    Trissel's Handbook on Injectable Drugs (15ª ed.)
//  [Sta]    Stabilis 4.0 (stabilis.org)
//  [Fl17]   Flamein F et al. Pharm Technol Hosp Pharm 2017;2(2):71-78 (NICU)
//  [KEMH]   KEMH NICU Y-Site Compatibility Guideline v5.1 2024 (Australia)
//  [ATM]    Antimicrobianos en Neonatología, Soc. Chilena Infectología 2021
// ═══════════════════════════════════════════════════════════════════

const COMPAT_DRUGS = [
  // ── VASOACTIVOS / INOTRÓPICOS
  { id: 'adrenalina',      label: { es: 'Adrenalina',         pt: 'Adrenalina',         en: 'Epinephrine'        }, icon: '🔴', group: 'vasoactivo' },
  { id: 'noradrenalina',   label: { es: 'Noradrenalina',      pt: 'Noradrenalina',      en: 'Norepinephrine'     }, icon: '🔴', group: 'vasoactivo' },
  { id: 'dopamina',        label: { es: 'Dopamina',           pt: 'Dopamina',           en: 'Dopamine'           }, icon: '🔴', group: 'vasoactivo' },
  { id: 'dobutamina',      label: { es: 'Dobutamina',         pt: 'Dobutamina',         en: 'Dobutamine'         }, icon: '🔴', group: 'vasoactivo' },
  { id: 'milrinona',       label: { es: 'Milrinona',          pt: 'Milrinona',          en: 'Milrinone'          }, icon: '🔴', group: 'vasoactivo' },
  { id: 'vasopresina',     label: { es: 'Vasopresina',        pt: 'Vasopressina',       en: 'Vasopressin'        }, icon: '🔴', group: 'vasoactivo' },
  { id: 'fenilefrina',     label: { es: 'Fenilefrina',        pt: 'Fenilefrina',        en: 'Phenylephrine'      }, icon: '🔴', group: 'vasoactivo' },
  { id: 'isoproterenol',   label: { es: 'Isoproterenol',      pt: 'Isoproterenol',      en: 'Isoproterenol'      }, icon: '🔴', group: 'vasoactivo' },
  { id: 'nitroglicerina',  label: { es: 'Nitroglicerina',     pt: 'Nitroglicerina',     en: 'Nitroglycerin'      }, icon: '🩸', group: 'vasoactivo' },
  { id: 'nitroprusiato',   label: { es: 'Nitroprusiato',      pt: 'Nitroprussiato',     en: 'Nitroprusside'      }, icon: '🩸', group: 'vasoactivo' },
  { id: 'labetalol',       label: { es: 'Labetalol',          pt: 'Labetalol',          en: 'Labetalol'          }, icon: '🩸', group: 'vasoactivo' },
  { id: 'alprostadilo',    label: { es: 'Alprostadilo (PGE1)',pt: 'Alprostadil (PGE1)', en: 'Alprostadil (PGE1)' }, icon: '🫀', group: 'vasoactivo', nicu: true },
  // ── SEDOANALGESIA
  { id: 'fentanilo',       label: { es: 'Fentanilo',          pt: 'Fentanilo',          en: 'Fentanyl'           }, icon: '🟣', group: 'sedoanalgesia' },
  { id: 'morfina',         label: { es: 'Morfina',            pt: 'Morfina',            en: 'Morphine'           }, icon: '🟣', group: 'sedoanalgesia' },
  { id: 'remifentanilo',   label: { es: 'Remifentanilo',      pt: 'Remifentanilo',      en: 'Remifentanil'       }, icon: '🟣', group: 'sedoanalgesia' },
  { id: 'metadona',        label: { es: 'Metadona',           pt: 'Metadona',           en: 'Methadone'          }, icon: '🟣', group: 'sedoanalgesia' },
  { id: 'midazolam',       label: { es: 'Midazolam',          pt: 'Midazolam',          en: 'Midazolam'          }, icon: '🟡', group: 'sedoanalgesia' },
  { id: 'propofol',        label: { es: 'Propofol',           pt: 'Propofol',           en: 'Propofol'           }, icon: '🟡', group: 'sedoanalgesia' },
  { id: 'ketamina',        label: { es: 'Ketamina',           pt: 'Cetamina',           en: 'Ketamine'           }, icon: '🟡', group: 'sedoanalgesia' },
  { id: 'dexmedetomidina', label: { es: 'Dexmedetomidina',    pt: 'Dexmedetomidina',    en: 'Dexmedetomidine'    }, icon: '🟡', group: 'sedoanalgesia' },
  { id: 'clonidina',       label: { es: 'Clonidina',          pt: 'Clonidina',          en: 'Clonidine'          }, icon: '🟡', group: 'sedoanalgesia' },
  { id: 'flumazenilo',     label: { es: 'Flumazenilo',        pt: 'Flumazenil',         en: 'Flumazenil'         }, icon: '🟡', group: 'sedoanalgesia' },
  { id: 'naloxona',        label: { es: 'Naloxona',           pt: 'Naloxona',           en: 'Naloxone'           }, icon: '🟡', group: 'sedoanalgesia' },
  { id: 'paracetamol_iv',  label: { es: 'Paracetamol IV',     pt: 'Paracetamol IV',     en: 'Paracetamol IV'     }, icon: '🟡', group: 'sedoanalgesia' },
  { id: 'fenobarbital',    label: { es: 'Fenobarbital',       pt: 'Fenobarbital',       en: 'Phenobarbital'      }, icon: '🟡', group: 'sedoanalgesia', nicu: true },
  // ── RELAJANTES NEUROMUSCULARES
  { id: 'cisatracurio',    label: { es: 'Cisatracurio',       pt: 'Cisatracúrio',       en: 'Cisatracurium'      }, icon: '⚪', group: 'relajante' },
  { id: 'vecuronio',       label: { es: 'Vecuronio',          pt: 'Vecurônio',          en: 'Vecuronium'         }, icon: '⚪', group: 'relajante' },
  { id: 'rocuronio',       label: { es: 'Rocuronio',          pt: 'Rocurônio',          en: 'Rocuronium'         }, icon: '⚪', group: 'relajante' },
  // ── CARDIOLOGÍA
  { id: 'amiodarona',      label: { es: 'Amiodarona',         pt: 'Amiodarona',         en: 'Amiodarone'         }, icon: '🟠', group: 'cardio' },
  { id: 'lidocaina',       label: { es: 'Lidocaína',          pt: 'Lidocaína',          en: 'Lidocaine'          }, icon: '🟠', group: 'cardio' },
  { id: 'diltiazem',       label: { es: 'Diltiazem',          pt: 'Diltiazem',          en: 'Diltiazem'          }, icon: '🟠', group: 'cardio' },
  { id: 'verapamilo',      label: { es: 'Verapamilo',         pt: 'Verapamil',          en: 'Verapamil'          }, icon: '🟠', group: 'cardio' },
  // ── ELECTROLITOS
  { id: 'bicarbonato',     label: { es: 'Bicarbonato Na',     pt: 'Bicarbonato Na',     en: 'Sodium Bicarbonate' }, icon: '🔵', group: 'electrolito' },
  { id: 'calcio_glu',      label: { es: 'Calcio gluconato',   pt: 'Gluconato Ca',       en: 'Calcium Gluconate'  }, icon: '🔵', group: 'electrolito' },
  { id: 'calcio_clo',      label: { es: 'Calcio cloruro',     pt: 'Cloreto de Ca',      en: 'Calcium Chloride'   }, icon: '🔵', group: 'electrolito' },
  { id: 'magnesio',        label: { es: 'Magnesio sulfato',   pt: 'Sulfato Mg',         en: 'Magnesium Sulfate'  }, icon: '🔵', group: 'electrolito' },
  { id: 'potasio',         label: { es: 'Potasio cloruro',    pt: 'Cloreto de K',       en: 'Potassium Chloride' }, icon: '🔵', group: 'electrolito' },
  // ── ANTIBIÓTICOS UCI
  { id: 'meropenem',       label: { es: 'Meropenem',          pt: 'Meropenem',          en: 'Meropenem'          }, icon: '🟤', group: 'antibiotico' },
  { id: 'pip_tazo',        label: { es: 'Pip-tazobactam',     pt: 'Pip-tazobactam',     en: 'Pip-tazobactam'     }, icon: '🟤', group: 'antibiotico' },
  { id: 'ceftazidima',     label: { es: 'Ceftazidima',        pt: 'Ceftazidima',        en: 'Ceftazidime'        }, icon: '🟤', group: 'antibiotico' },
  { id: 'vancomicina',     label: { es: 'Vancomicina',        pt: 'Vancomicina',        en: 'Vancomycin'         }, icon: '🟤', group: 'antibiotico' },
  { id: 'fluconazol',      label: { es: 'Fluconazol',         pt: 'Fluconazol',         en: 'Fluconazole'        }, icon: '🟤', group: 'antibiotico' },
  { id: 'aciclovir',       label: { es: 'Aciclovir',          pt: 'Aciclovir',          en: 'Acyclovir'          }, icon: '🟤', group: 'antibiotico' },
  // ── ANTIBIÓTICOS NICU/PICU
  { id: 'ampicilina',      label: { es: 'Ampicilina',         pt: 'Ampicilina',         en: 'Ampicillin'         }, icon: '🔶', group: 'neonatal', nicu: true },
  { id: 'gentamicina',     label: { es: 'Gentamicina',        pt: 'Gentamicina',        en: 'Gentamicin'         }, icon: '🔶', group: 'neonatal', nicu: true },
  { id: 'amikacina',       label: { es: 'Amikacina',          pt: 'Amicacina',          en: 'Amikacin'           }, icon: '🔶', group: 'neonatal', nicu: true },
  // ── NICU ESPECÍFICOS
  { id: 'cafeina',         label: { es: 'Cafeína citrato',    pt: 'Cafeína citrato',    en: 'Caffeine citrate'   }, icon: '🍼', group: 'neonatal', nicu: true },
  { id: 'aminofilina',     label: { es: 'Aminofilina',        pt: 'Aminofilina',        en: 'Aminophylline'      }, icon: '🍼', group: 'neonatal', nicu: true },
  { id: 'indometacina',    label: { es: 'Indometacina IV',    pt: 'Indometacina IV',    en: 'Indomethacin IV'    }, icon: '🍼', group: 'neonatal', nicu: true },
  { id: 'ibuprofeno_iv',   label: { es: 'Ibuprofeno IV',      pt: 'Ibuprofeno IV',      en: 'Ibuprofen IV'       }, icon: '🍼', group: 'neonatal', nicu: true },
  // ── OTROS
  { id: 'furosemida',      label: { es: 'Furosemida',         pt: 'Furosemida',         en: 'Furosemide'         }, icon: '🟢', group: 'otro' },
  { id: 'heparina',        label: { es: 'Heparina sódica',    pt: 'Heparina sódica',    en: 'Heparin'            }, icon: '🟢', group: 'otro' },
  { id: 'insulina',        label: { es: 'Insulina',           pt: 'Insulina',           en: 'Insulin'            }, icon: '🟢', group: 'otro' },
  { id: 'nacetilcisteina', label: { es: 'N-acetilcisteína',   pt: 'N-acetilcisteína',   en: 'N-acetylcysteine'   }, icon: '⚗️', group: 'otro' },
  { id: 'pantoprazol',     label: { es: 'Pantoprazol',        pt: 'Pantoprazol',        en: 'Pantoprazole'       }, icon: '⚗️', group: 'otro' },
  { id: 'hidrocortisona',  label: { es: 'Hidrocortisona',     pt: 'Hidrocortisona',     en: 'Hydrocortisone'     }, icon: '⚗️', group: 'otro' },
  { id: 'somatostatina',   label: { es: 'Somatostatina',      pt: 'Somatostatina',      en: 'Somatostatin'       }, icon: '⚗️', group: 'otro' },
];

const COMPAT_GROUPS = {
  vasoactivo:   { es: '🔴 Vasoactivos',       pt: '🔴 Vasoativos',        en: '🔴 Vasoactive'    },
  sedoanalgesia:{ es: '🟣 Sedoanalgesia',      pt: '🟣 Sedoanalgesia',     en: '🟣 Sedoanalgesia' },
  relajante:    { es: '⚪ Relajantes NM',      pt: '⚪ Relaxantes NM',     en: '⚪ Neuromuscular'  },
  cardio:       { es: '🟠 Cardiología',        pt: '🟠 Cardiologia',       en: '🟠 Cardiac'       },
  electrolito:  { es: '🔵 Electrolitos',       pt: '🔵 Eletrólitos',       en: '🔵 Electrolytes'  },
  antibiotico:  { es: '🟤 Antibióticos',       pt: '🟤 Antibióticos',      en: '🟤 Antibiotics'   },
  neonatal:     { es: '🔶 Neonatología/UCIP',  pt: '🔶 Neonatologia/UCIP', en: '🔶 Neonatal/PICU' },
  otro:         { es: '🟢 Otros',              pt: '🟢 Outros',            en: '🟢 Other'         },
};

const COMPAT_PAIRS = {
  // ════ ADRENALINA
  'adrenalina+amiodarona':        { status:'C',  note:'', src:'CL2020' },
  'adrenalina+bicarbonato':       { status:'I',  note:'Álcali inactiva catecolaminas — precipitación', src:'CL2020' },
  'adrenalina+calcio_clo':        { status:'C',  note:'', src:'CL2020' },
  'adrenalina+calcio_glu':        { status:'C',  note:'', src:'CL2020' },
  'adrenalina+ceftazidima':       { status:'C',  note:'', src:'CL2020' },
  'adrenalina+cisatracurio':      { status:'C',  note:'', src:'CL2020' },
  'adrenalina+clonidina':         { status:'IC', note:'Solo en suero fisiológico', src:'Sta' },
  'adrenalina+dexmedetomidina':   { status:'C',  note:'', src:'CL2020' },
  'adrenalina+diltiazem':         { status:'C',  note:'', src:'CL2020' },
  'adrenalina+dobutamina':        { status:'C',  note:'', src:'CL2020' },
  'adrenalina+dopamina':          { status:'C',  note:'', src:'CL2020' },
  'adrenalina+fentanilo':         { status:'C',  note:'', src:'CL2020' },
  'adrenalina+flumazenilo':       { status:'C',  note:'', src:'CL2020' },
  'adrenalina+furosemida':        { status:'IC', note:'Compatible a concentraciones bajas', src:'CL2020' },
  'adrenalina+heparina':          { status:'C',  note:'', src:'CL2020' },
  'adrenalina+insulina':          { status:'C',  note:'', src:'CL2020' },
  'adrenalina+isoproterenol':     { status:'C',  note:'', src:'CL2020' },
  'adrenalina+ketamina':          { status:'C',  note:'', src:'CL2020' },
  'adrenalina+labetalol':         { status:'C',  note:'', src:'CL2020' },
  'adrenalina+magnesio':          { status:'IC', note:'Verificar concentraciones', src:'CL2020' },
  'adrenalina+metadona':          { status:'C',  note:'', src:'CL2020' },
  'adrenalina+midazolam':         { status:'C',  note:'', src:'CL2020' },
  'adrenalina+milrinona':         { status:'C',  note:'', src:'CL2020' },
  'adrenalina+morfina':           { status:'C',  note:'', src:'CL2020' },
  'adrenalina+naloxona':          { status:'C',  note:'', src:'CL2020' },
  'adrenalina+nitroglicerina':    { status:'C',  note:'', src:'CL2020' },
  'adrenalina+nitroprusiato':     { status:'C',  note:'', src:'CL2020' },
  'adrenalina+noradrenalina':     { status:'C',  note:'', src:'CL2020' },
  'adrenalina+pantoprazol':       { status:'IC', note:'Compatible solo a bajas concentraciones', src:'CL2020' },
  'adrenalina+pip_tazo':          { status:'IC', note:'Verificar concentraciones', src:'CL2020' },
  'adrenalina+potasio':           { status:'C',  note:'', src:'CL2020' },
  'adrenalina+propofol':          { status:'C',  note:'', src:'CL2020' },
  'adrenalina+remifentanilo':     { status:'IC', note:'Compatible en condiciones estándar', src:'CL2020' },
  'adrenalina+somatostatina':     { status:'C',  note:'', src:'CL2020' },
  'adrenalina+vasopresina':       { status:'C',  note:'', src:'CL2020' },
  'adrenalina+vecuronio':         { status:'C',  note:'', src:'CL2020' },
  'adrenalina+verapamilo':        { status:'IC', note:'Compatible solo a concentraciones bajas', src:'CL2020' },
  // ════ NORADRENALINA
  'bicarbonato+noradrenalina':    { status:'I',  note:'Álcali inactiva catecolaminas', src:'CL2020' },
  'cisatracurio+noradrenalina':   { status:'C',  note:'', src:'CL2020' },
  'dexmedetomidina+noradrenalina':{ status:'C',  note:'', src:'CL2020' },
  'dobutamina+noradrenalina':     { status:'C',  note:'', src:'CL2020' },
  'dopamina+noradrenalina':       { status:'C',  note:'', src:'CL2020' },
  'fentanilo+noradrenalina':      { status:'C',  note:'', src:'CL2020' },
  'furosemida+noradrenalina':     { status:'IC', note:'Verificar concentraciones', src:'CL2020' },
  'heparina+noradrenalina':       { status:'C',  note:'', src:'CL2020' },
  'insulina+noradrenalina':       { status:'C',  note:'', src:'CL2020' },
  'labetalol+noradrenalina':      { status:'C',  note:'', src:'CL2020' },
  'midazolam+noradrenalina':      { status:'C',  note:'', src:'CL2020' },
  'milrinona+noradrenalina':      { status:'C',  note:'', src:'CL2020' },
  'morfina+noradrenalina':        { status:'C',  note:'', src:'CL2020' },
  'nitroglicerina+noradrenalina': { status:'C',  note:'', src:'CL2020' },
  'nitroprusiato+noradrenalina':  { status:'C',  note:'', src:'CL2020' },
  'noradrenalina+potasio':        { status:'C',  note:'', src:'CL2020' },
  'noradrenalina+propofol':       { status:'C',  note:'', src:'CL2020' },
  'noradrenalina+remifentanilo':  { status:'IC', note:'Compatible en condiciones estándar', src:'CL2020' },
  'noradrenalina+vasopresina':    { status:'C',  note:'', src:'CL2020' },
  'noradrenalina+vecuronio':      { status:'C',  note:'', src:'CL2020' },
  'noradrenalina+verapamilo':     { status:'IC', note:'Compatible solo a concentraciones bajas', src:'CL2020' },
  // ════ DOPAMINA
  'bicarbonato+dopamina':         { status:'I',  note:'Álcali inactiva catecolaminas', src:'CL2020' },
  'cisatracurio+dopamina':        { status:'C',  note:'', src:'CL2020' },
  'dexmedetomidina+dopamina':     { status:'C',  note:'', src:'CL2020' },
  'diltiazem+dopamina':           { status:'C',  note:'', src:'CL2020' },
  'dobutamina+dopamina':          { status:'C',  note:'', src:'CL2020' },
  'dopamina+fentanilo':           { status:'C',  note:'', src:'CL2020' },
  'dopamina+furosemida':          { status:'I',  note:'Incompatible — precipitación', src:'CL2020,LPaz' },
  'dopamina+heparina':            { status:'IC', note:'Precipitación posible a concentraciones altas', src:'CL2020' },
  'dopamina+insulina':            { status:'IC', note:'Verificar concentraciones', src:'CL2020' },
  'dopamina+labetalol':           { status:'C',  note:'', src:'CL2020' },
  'dopamina+midazolam':           { status:'IC', note:'Compatible dopamina ≤3,2 mg/mL + midazolam ≤2 mg/mL', src:'CL2020' },
  'dopamina+milrinona':           { status:'C',  note:'', src:'CL2020' },
  'dopamina+morfina':             { status:'C',  note:'', src:'CL2020' },
  'dopamina+nitroglicerina':      { status:'IC', note:'Solo en glucosado 5%', src:'CL2020' },
  'dopamina+nitroprusiato':       { status:'C',  note:'', src:'CL2020' },
  'dopamina+potasio':             { status:'C',  note:'', src:'CL2020' },
  'dopamina+propofol':            { status:'C',  note:'', src:'CL2020' },
  'dopamina+remifentanilo':       { status:'IC', note:'Verificar', src:'CL2020' },
  'dopamina+vecuronio':           { status:'C',  note:'', src:'CL2020' },
  'dopamina+verapamilo':          { status:'IC', note:'Verificar', src:'CL2020' },
  // ════ DOBUTAMINA
  'bicarbonato+dobutamina':       { status:'I',  note:'Álcali inactiva catecolaminas', src:'CL2020' },
  'calcio_clo+dobutamina':        { status:'IC', note:'Compatible a ≤4 mg/mL de cada uno', src:'CL2020' },
  'calcio_glu+dobutamina':        { status:'IC', note:'Compatible a ≤4 mg/mL de cada uno', src:'CL2020' },
  'cisatracurio+dobutamina':      { status:'C',  note:'', src:'CL2020' },
  'diltiazem+dobutamina':         { status:'C',  note:'', src:'CL2020' },
  'dobutamina+dexmedetomidina':   { status:'C',  note:'', src:'CL2020' },
  'dobutamina+fentanilo':         { status:'C',  note:'', src:'CL2020' },
  'dobutamina+furosemida':        { status:'I',  note:'Incompatible — no administrar en Y', src:'CL2020,LPaz' },
  'dobutamina+heparina':          { status:'IC', note:'Compatible dobutamina ≤1 mg/mL + heparina ≤50 UI/mL', src:'CL2020' },
  'dobutamina+insulina':          { status:'IC', note:'Verificar concentraciones', src:'CL2020' },
  'dobutamina+ketamina':          { status:'C',  note:'', src:'LPaz' },
  'dobutamina+magnesio':          { status:'IC', note:'Compatible a ≤4 mg/mL + ≤40 mg/mL magnesio', src:'CL2020' },
  'dobutamina+midazolam':         { status:'IC', note:'Verificar — precaución', src:'LPaz' },
  'dobutamina+milrinona':         { status:'C',  note:'', src:'CL2020' },
  'dobutamina+morfina':           { status:'C',  note:'', src:'CL2020' },
  'dobutamina+nitroglicerina':    { status:'C',  note:'', src:'CL2020' },
  'dobutamina+nitroprusiato':     { status:'C',  note:'', src:'CL2020' },
  'dobutamina+potasio':           { status:'IC', note:'Compatible a ≤4 mg/mL + ≤60 mEq/L KCl', src:'CL2020' },
  'dobutamina+propofol':          { status:'C',  note:'', src:'CL2020' },
  'dobutamina+remifentanilo':     { status:'C',  note:'', src:'CL2020' },
  'dobutamina+vecuronio':         { status:'C',  note:'', src:'CL2020' },
  // ════ MILRINONA
  'amiodarona+milrinona':         { status:'C',  note:'', src:'CL2020' },
  'cisatracurio+milrinona':       { status:'C',  note:'', src:'CL2020' },
  'dexmedetomidina+milrinona':    { status:'C',  note:'', src:'CL2020' },
  'fentanilo+milrinona':          { status:'C',  note:'', src:'CL2020' },
  'furosemida+milrinona':         { status:'I',  note:'Precipitación inmediata', src:'CL2020,LPaz' },
  'heparina+milrinona':           { status:'C',  note:'', src:'CL2020' },
  'midazolam+milrinona':          { status:'C',  note:'', src:'CL2020' },
  'milrinona+morfina':            { status:'C',  note:'', src:'CL2020' },
  'milrinona+nitroglicerina':     { status:'C',  note:'', src:'CL2020' },
  'milrinona+nitroprusiato':      { status:'C',  note:'', src:'CL2020' },
  'milrinona+potasio':            { status:'IC', note:'Verificar concentración de potasio', src:'CL2020' },
  'milrinona+propofol':           { status:'C',  note:'', src:'CL2020' },
  'milrinona+remifentanilo':      { status:'IC', note:'Verificar', src:'CL2020' },
  'milrinona+vasopresina':        { status:'C',  note:'', src:'CL2020' },
  'milrinona+vecuronio':          { status:'C',  note:'', src:'CL2020' },
  // ════ AMIODARONA
  'amiodarona+bicarbonato':       { status:'I',  note:'Precipitación', src:'CL2020' },
  'amiodarona+cisatracurio':      { status:'C',  note:'', src:'CL2020' },
  'amiodarona+dexmedetomidina':   { status:'C',  note:'', src:'CL2020' },
  'amiodarona+diltiazem':         { status:'C',  note:'', src:'CL2020' },
  'amiodarona+dobutamina':        { status:'IC', note:'Solo en glucosado 5%; inestable en SF 0,9%', src:'CL2020' },
  'amiodarona+dopamina':          { status:'IC', note:'Solo en glucosado 5%; inestable en SF 0,9%', src:'CL2020' },
  'amiodarona+fentanilo':         { status:'C',  note:'', src:'CL2020' },
  'amiodarona+fenilefrina':       { status:'IC', note:'Compatible a concentraciones bajas', src:'CL2020' },
  'amiodarona+furosemida':        { status:'IC', note:'Compatible amiodarona ≤6 mg/mL + furosemida ≤1 mg/mL', src:'CL2020' },
  'amiodarona+heparina':          { status:'I',  note:'Precipitación — no administrar en Y', src:'CL2020' },
  'amiodarona+insulina':          { status:'IC', note:'Verificar concentraciones', src:'CL2020' },
  'amiodarona+labetalol':         { status:'C',  note:'', src:'CL2020' },
  'amiodarona+midazolam':         { status:'C',  note:'', src:'CL2020,LPaz' },
  'amiodarona+morfina':           { status:'C',  note:'', src:'CL2020' },
  'amiodarona+nitroglicerina':    { status:'IC', note:'Verificar', src:'CL2020' },
  'amiodarona+nitroprusiato':     { status:'IC', note:'Compatible amiodarona ≤15 mg/mL + nitroprusiato ≤0,3 mg/mL', src:'CL2020' },
  'amiodarona+noradrenalina':     { status:'C',  note:'', src:'CL2020' },
  'amiodarona+potasio':           { status:'I',  note:'Incompatible a concentraciones estándar', src:'CL2020' },
  'amiodarona+propofol':          { status:'C',  note:'', src:'CL2020' },
  'amiodarona+remifentanilo':     { status:'C',  note:'', src:'CL2020' },
  'amiodarona+vancomicina':       { status:'IC', note:'Verificar concentraciones', src:'CL2020' },
  'amiodarona+vasopresina':       { status:'C',  note:'', src:'CL2020' },
  'amiodarona+vecuronio':         { status:'C',  note:'', src:'CL2020' },
  // ════ FENTANILO
  'ceftazidima+fentanilo':        { status:'C',  note:'', src:'CL2020' },
  'cisatracurio+fentanilo':       { status:'C',  note:'', src:'CL2020' },
  'dexmedetomidina+fentanilo':    { status:'C',  note:'', src:'CL2020' },
  'fentanilo+flumazenilo':        { status:'C',  note:'', src:'CL2020' },
  'fentanilo+heparina':           { status:'C',  note:'', src:'CL2020' },
  'fentanilo+hidrocortisona':     { status:'C',  note:'', src:'CL2020' },
  'fentanilo+insulina':           { status:'C',  note:'', src:'CL2020' },
  'fentanilo+ketamina':           { status:'C',  note:'', src:'CL2020,LPaz' },
  'fentanilo+labetalol':          { status:'C',  note:'', src:'CL2020' },
  'fentanilo+magnesio':           { status:'C',  note:'', src:'CL2020' },
  'fentanilo+meropenem':          { status:'C',  note:'', src:'CL2020' },
  'fentanilo+metadona':           { status:'C',  note:'', src:'CL2020' },
  'fentanilo+midazolam':          { status:'C',  note:'', src:'CL2020,LPaz' },
  'fentanilo+morfina':            { status:'C',  note:'', src:'CL2020' },
  'fentanilo+nitroglicerina':     { status:'C',  note:'', src:'CL2020' },
  'fentanilo+nitroprusiato':      { status:'C',  note:'', src:'CL2020' },
  'fentanilo+paracetamol_iv':     { status:'C',  note:'', src:'Sta' },
  'fentanilo+pantoprazol':        { status:'C',  note:'', src:'CL2020' },
  'fentanilo+pip_tazo':           { status:'C',  note:'', src:'CL2020' },
  'fentanilo+potasio':            { status:'C',  note:'', src:'CL2020' },
  'fentanilo+propofol':           { status:'C',  note:'', src:'CL2020' },
  'fentanilo+remifentanilo':      { status:'IC', note:'Compatible a concentraciones estándar', src:'CL2020' },
  'fentanilo+rocuronio':          { status:'C',  note:'', src:'CL2020' },
  'fentanilo+vancomicina':        { status:'C',  note:'', src:'CL2020' },
  'fentanilo+vasopresina':        { status:'C',  note:'', src:'CL2020' },
  'fentanilo+vecuronio':          { status:'C',  note:'', src:'CL2020' },
  // ════ MIDAZOLAM
  'ceftazidima+midazolam':        { status:'C',  note:'', src:'CL2020' },
  'cisatracurio+midazolam':       { status:'C',  note:'', src:'CL2020' },
  'dexmedetomidina+midazolam':    { status:'C',  note:'', src:'CL2020' },
  'fluconazol+midazolam':         { status:'C',  note:'', src:'CL2020' },
  'furosemida+midazolam':         { status:'I',  note:'Precipitación por incompatibilidad de pH', src:'CL2020,LPaz' },
  'heparina+midazolam':           { status:'C',  note:'', src:'CL2020' },
  'hidrocortisona+midazolam':     { status:'C',  note:'', src:'CL2020' },
  'insulina+midazolam':           { status:'C',  note:'', src:'CL2020' },
  'ketamina+midazolam':           { status:'C',  note:'', src:'CL2020,LPaz' },
  'labetalol+midazolam':          { status:'C',  note:'', src:'CL2020' },
  'magnesio+midazolam':           { status:'C',  note:'', src:'CL2020' },
  'meropenem+midazolam':          { status:'C',  note:'', src:'CL2020' },
  'midazolam+metadona':           { status:'C',  note:'', src:'CL2020' },
  'midazolam+morfina':            { status:'C',  note:'', src:'CL2020,LPaz' },
  'midazolam+naloxona':           { status:'C',  note:'', src:'CL2020' },
  'midazolam+nitroglicerina':     { status:'C',  note:'', src:'CL2020' },
  'midazolam+nitroprusiato':      { status:'C',  note:'', src:'CL2020' },
  'midazolam+pantoprazol':        { status:'I',  note:'Precipitación — pH incompatible', src:'CL2020' },
  'midazolam+paracetamol_iv':     { status:'C',  note:'', src:'Sta' },
  'midazolam+pip_tazo':           { status:'C',  note:'', src:'CL2020' },
  'midazolam+potasio':            { status:'C',  note:'', src:'CL2020' },
  'midazolam+propofol':           { status:'C',  note:'', src:'CL2020' },
  'midazolam+remifentanilo':      { status:'C',  note:'', src:'CL2020,LPaz' },
  'midazolam+rocuronio':          { status:'C',  note:'', src:'CL2020' },
  'midazolam+vancomicina':        { status:'C',  note:'', src:'CL2020' },
  'midazolam+vasopresina':        { status:'C',  note:'', src:'CL2020' },
  'midazolam+vecuronio':          { status:'C',  note:'', src:'CL2020' },
  // ════ MORFINA
  'ceftazidima+morfina':          { status:'C',  note:'', src:'CL2020' },
  'cisatracurio+morfina':         { status:'C',  note:'', src:'CL2020' },
  'dexmedetomidina+morfina':      { status:'C',  note:'', src:'CL2020' },
  'fluconazol+morfina':           { status:'C',  note:'', src:'CL2020' },
  'furosemida+morfina':           { status:'I',  note:'Precipitación por incompatibilidad de pH', src:'CL2020' },
  'heparina+morfina':             { status:'C',  note:'', src:'CL2020' },
  'insulina+morfina':             { status:'C',  note:'', src:'CL2020' },
  'ketamina+morfina':             { status:'C',  note:'', src:'CL2020' },
  'labetalol+morfina':            { status:'C',  note:'', src:'CL2020' },
  'magnesio+morfina':             { status:'C',  note:'', src:'CL2020' },
  'meropenem+morfina':            { status:'C',  note:'', src:'CL2020' },
  'morfina+naloxona':             { status:'C',  note:'', src:'CL2020' },
  'morfina+nitroglicerina':       { status:'C',  note:'', src:'CL2020' },
  'morfina+nitroprusiato':        { status:'C',  note:'', src:'CL2020' },
  'morfina+pantoprazol':          { status:'I',  note:'Precipitación — no administrar en Y', src:'CL2020' },
  'morfina+paracetamol_iv':       { status:'C',  note:'', src:'Sta' },
  'morfina+pip_tazo':             { status:'C',  note:'', src:'CL2020' },
  'morfina+potasio':              { status:'C',  note:'', src:'CL2020' },
  'morfina+propofol':             { status:'C',  note:'', src:'CL2020' },
  'morfina+remifentanilo':        { status:'C',  note:'', src:'CL2020,LPaz' },
  'morfina+rocuronio':            { status:'C',  note:'', src:'CL2020' },
  'morfina+vancomicina':          { status:'C',  note:'', src:'CL2020' },
  'morfina+vasopresina':          { status:'C',  note:'', src:'CL2020' },
  'morfina+vecuronio':            { status:'C',  note:'', src:'CL2020' },
  // ════ PROPOFOL
  'cisatracurio+propofol':        { status:'C',  note:'', src:'CL2020' },
  'dexmedetomidina+propofol':     { status:'C',  note:'', src:'CL2020' },
  'furosemida+propofol':          { status:'I',  note:'Incompatible — no administrar en Y', src:'CL2020' },
  'heparina+propofol':            { status:'IC', note:'Puede romper la emulsión lipídica', src:'CL2020' },
  'insulina+propofol':            { status:'C',  note:'', src:'CL2020' },
  'ketamina+propofol':            { status:'C',  note:'Uso clínico habitual — verificar concentraciones', src:'CL2020' },
  'labetalol+propofol':           { status:'C',  note:'', src:'CL2020' },
  'magnesio+propofol':            { status:'C',  note:'', src:'CL2020' },
  'meropenem+propofol':           { status:'C',  note:'', src:'CL2020' },
  'nitroglicerina+propofol':      { status:'C',  note:'', src:'CL2020' },
  'nitroprusiato+propofol':       { status:'C',  note:'', src:'CL2020' },
  'pantoprazol+propofol':         { status:'I',  note:'Incompatible — no administrar en Y', src:'CL2020' },
  'pip_tazo+propofol':            { status:'C',  note:'', src:'CL2020' },
  'potasio+propofol':             { status:'IC', note:'Concentraciones estándar de KCl', src:'CL2020' },
  'propofol+remifentanilo':       { status:'C',  note:'', src:'CL2020,LPaz' },
  'propofol+rocuronio':           { status:'C',  note:'', src:'CL2020' },
  'propofol+vancomicina':         { status:'IC', note:'Puede romper emulsión a altas concentraciones', src:'CL2020' },
  'propofol+vasopresina':         { status:'C',  note:'', src:'CL2020' },
  'propofol+vecuronio':           { status:'C',  note:'', src:'CL2020' },
  // ════ KETAMINA
  'cisatracurio+ketamina':        { status:'C',  note:'', src:'CL2020' },
  'dexmedetomidina+ketamina':     { status:'C',  note:'', src:'CL2020,LPaz' },
  'heparina+ketamina':            { status:'C',  note:'', src:'CL2020' },
  'ketamina+rocuronio':           { status:'C',  note:'', src:'CL2020' },
  'ketamina+vecuronio':           { status:'C',  note:'', src:'CL2020' },
  // ════ DEXMEDETOMIDINA
  'cisatracurio+dexmedetomidina': { status:'C',  note:'', src:'CL2020' },
  'dexmedetomidina+heparina':     { status:'C',  note:'', src:'CL2020' },
  'dexmedetomidina+insulina':     { status:'C',  note:'', src:'CL2020' },
  'dexmedetomidina+labetalol':    { status:'C',  note:'', src:'CL2020' },
  'dexmedetomidina+magnesio':     { status:'C',  note:'', src:'CL2020' },
  'dexmedetomidina+meropenem':    { status:'C',  note:'', src:'CL2020' },
  'dexmedetomidina+nitroglicerina':{ status:'C', note:'', src:'CL2020' },
  'dexmedetomidina+potasio':      { status:'C',  note:'', src:'CL2020' },
  'dexmedetomidina+rocuronio':    { status:'C',  note:'', src:'CL2020,LPaz' },
  'dexmedetomidina+vecuronio':    { status:'C',  note:'', src:'CL2020,LPaz' },
  'dexmedetomidina+vasopresina':  { status:'C',  note:'', src:'CL2020' },
  // ════ RELAJANTES NEUROMUSCULARES
  'cisatracurio+heparina':        { status:'IC', note:'Verificar concentraciones', src:'CL2020' },
  'cisatracurio+insulina':        { status:'C',  note:'', src:'CL2020' },
  'cisatracurio+potasio':         { status:'C',  note:'', src:'CL2020' },
  'cisatracurio+rocuronio':       { status:'?',  note:'Sin datos', src:'' },
  'cisatracurio+vancomicina':     { status:'C',  note:'', src:'CL2020' },
  'cisatracurio+vecuronio':       { status:'?',  note:'Sin datos', src:'' },
  'heparina+rocuronio':           { status:'IC', note:'Verificar concentraciones', src:'Sta' },
  'heparina+vecuronio':           { status:'IC', note:'Verificar concentraciones', src:'CL2020' },
  'insulina+vecuronio':           { status:'C',  note:'', src:'CL2020' },
  'isoproterenol+vecuronio':      { status:'IC', note:'Compatible a concentraciones bajas', src:'CL2020' },
  'nitroprusiato+vecuronio':      { status:'IC', note:'Compatible a concentraciones bajas', src:'CL2020' },
  'potasio+vecuronio':            { status:'C',  note:'', src:'CL2020' },
  'rocuronio+vancomicina':        { status:'IC', note:'Verificar concentraciones', src:'Sta' },
  'rocuronio+vecuronio':          { status:'?',  note:'Sin datos — no mezclar', src:'' },
  // ════ ELECTROLITOS
  'bicarbonato+calcio_clo':       { status:'I',  note:'Precipitación de CaCO3', src:'CL2020' },
  'bicarbonato+calcio_glu':       { status:'I',  note:'Precipitación de CaCO3', src:'CL2020' },
  'bicarbonato+furosemida':       { status:'C',  note:'', src:'CL2020' },
  'bicarbonato+heparina':         { status:'C',  note:'', src:'CL2020' },
  'bicarbonato+magnesio':         { status:'IC', note:'Precipitación posible a concentraciones altas', src:'CL2020' },
  'bicarbonato+midazolam':        { status:'I',  note:'Precipitación — pH muy incompatible', src:'CL2020' },
  'bicarbonato+potasio':          { status:'C',  note:'', src:'CL2020' },
  'calcio_clo+calcio_glu':        { status:'?',  note:'No mezclar en el mismo acceso', src:'' },
  'calcio_clo+furosemida':        { status:'I',  note:'Precipitación', src:'CL2020' },
  'calcio_clo+heparina':          { status:'I',  note:'Precipitación', src:'CL2020' },
  'calcio_clo+magnesio':          { status:'IC', note:'Precipitación posible — verificar', src:'CL2020' },
  'calcio_clo+potasio':           { status:'C',  note:'', src:'CL2020' },
  'calcio_glu+furosemida':        { status:'IC', note:'Precipitación posible — verificar', src:'CL2020' },
  'calcio_glu+heparina':          { status:'IC', note:'Precipitación a concentraciones altas', src:'CL2020' },
  'calcio_glu+magnesio':          { status:'IC', note:'Precipitación posible — vías separadas recomendadas', src:'CL2020' },
  'calcio_glu+potasio':           { status:'C',  note:'', src:'CL2020' },
  'furosemida+heparina':          { status:'C',  note:'', src:'CL2020' },
  'furosemida+insulina':          { status:'IC', note:'Verificar concentraciones', src:'CL2020' },
  'furosemida+potasio':           { status:'C',  note:'', src:'CL2020' },
  'heparina+insulina':            { status:'C',  note:'Compatible — uso clínico habitual', src:'CL2020' },
  'heparina+magnesio':            { status:'C',  note:'', src:'CL2020' },
  'heparina+potasio':             { status:'C',  note:'', src:'CL2020' },
  'insulina+magnesio':            { status:'C',  note:'', src:'CL2020' },
  'insulina+potasio':             { status:'C',  note:'Compatible — administración conjunta frecuente', src:'CL2020' },
  'isoproterenol+magnesio':       { status:'IC', note:'Compatible a concentraciones bajas', src:'CL2020' },
  'isoproterenol+potasio':        { status:'IC', note:'Compatible a concentraciones bajas', src:'CL2020' },
  'magnesio+potasio':             { status:'C',  note:'', src:'CL2020' },
  // ════ ANTIBIÓTICOS UCI
  'ceftazidima+heparina':         { status:'C',  note:'', src:'CL2020' },
  'ceftazidima+insulina':         { status:'C',  note:'', src:'CL2020' },
  'ceftazidima+pip_tazo':         { status:'?',  note:'No mezclar beta-lactámicos sin verificar', src:'' },
  'ceftazidima+potasio':          { status:'C',  note:'', src:'CL2020' },
  'ceftazidima+vancomicina':      { status:'I',  note:'Precipitación — usar accesos separados', src:'CL2020' },
  'fluconazol+furosemida':        { status:'I',  note:'Precipitación', src:'CL2020' },
  'fluconazol+heparina':          { status:'C',  note:'', src:'CL2020' },
  'fluconazol+insulina':          { status:'C',  note:'', src:'CL2020' },
  'fluconazol+potasio':           { status:'C',  note:'', src:'CL2020' },
  'fluconazol+vancomicina':       { status:'C',  note:'Compatible a concentraciones estándar', src:'CL2020' },
  'aciclovir+heparina':           { status:'IC', note:'Verificar', src:'Sta' },
  'aciclovir+insulina':           { status:'IC', note:'Verificar', src:'Sta' },
  'aciclovir+potasio':            { status:'IC', note:'Verificar', src:'Sta' },
  'heparina+vancomicina':         { status:'IC', note:'Precipitación posible a concentraciones altas', src:'CL2020' },
  'insulina+vancomicina':         { status:'C',  note:'', src:'CL2020' },
  'meropenem+heparina':           { status:'C',  note:'', src:'CL2020' },
  'meropenem+insulina':           { status:'C',  note:'', src:'CL2020' },
  'meropenem+pip_tazo':           { status:'?',  note:'Sin datos — no mezclar', src:'' },
  'meropenem+potasio':            { status:'IC', note:'Compatible a concentraciones estándar', src:'CL2020' },
  'meropenem+vancomicina':        { status:'C',  note:'Compatible en Y a concentraciones estándar', src:'CL2020' },
  'pip_tazo+heparina':            { status:'IC', note:'Verificar concentraciones', src:'CL2020' },
  'pip_tazo+insulina':            { status:'C',  note:'', src:'CL2020' },
  'pip_tazo+potasio':             { status:'C',  note:'', src:'CL2020' },
  'pip_tazo+vancomicina':         { status:'C',  note:'Compatible a concentraciones estándar', src:'CL2020' },
  'vancomicina+potasio':          { status:'C',  note:'', src:'CL2020' },
  // ════ FUROSEMIDA
  'furosemida+ketamina':          { status:'I',  note:'Incompatible — no administrar en Y', src:'CL2020' },
  'furosemida+labetalol':         { status:'I',  note:'Incompatible — no administrar en Y', src:'CL2020' },
  'furosemida+nitroglicerina':    { status:'I',  note:'Incompatible — no administrar en Y', src:'CL2020' },
  'furosemida+remifentanilo':     { status:'IC', note:'Verificar concentraciones', src:'CL2020' },
  // ════ PANTOPRAZOL
  'pantoprazol+pip_tazo':         { status:'I',  note:'Precipitación — pH incompatible', src:'CL2020' },
  'pantoprazol+vancomicina':      { status:'I',  note:'Precipitación — pH incompatible', src:'CL2020' },
  'pantoprazol+meropenem':        { status:'C',  note:'', src:'CL2020' },
  'heparina+pantoprazol':         { status:'C',  note:'', src:'CL2020' },
  'insulina+pantoprazol':         { status:'IC', note:'Verificar', src:'CL2020' },
  // ════ VASOPRESINA
  'heparina+vasopresina':         { status:'C',  note:'', src:'CL2020' },
  'insulina+vasopresina':         { status:'C',  note:'', src:'CL2020' },
  'nitroglicerina+vasopresina':   { status:'C',  note:'', src:'CL2020' },
  // ════ N-ACETILCISTEÍNA
  'bicarbonato+nacetilcisteina':  { status:'I',  note:'Incompatible — no administrar en Y', src:'CL2020' },
  // ════ LABETALOL
  'heparina+labetalol':           { status:'IC', note:'Verificar concentraciones', src:'CL2020' },
  'labetalol+nitroglicerina':     { status:'C',  note:'', src:'CL2020' },
  'labetalol+nitroprusiato':      { status:'C',  note:'', src:'CL2020' },
  'labetalol+potasio':            { status:'C',  note:'', src:'CL2020' },
  // ════ NITROGLICERINA / NITROPRUSIATO
  'heparina+nitroglicerina':      { status:'IC', note:'Puede reducir efecto anticoagulante — monitorizar APTT', src:'CL2020' },
  'insulina+nitroglicerina':      { status:'C',  note:'', src:'CL2020' },
  'nitroglicerina+nitroprusiato': { status:'C',  note:'', src:'CL2020' },
  'nitroglicerina+potasio':       { status:'C',  note:'', src:'CL2020' },
  'heparina+nitroprusiato':       { status:'C',  note:'', src:'CL2020' },
  'insulina+nitroprusiato':       { status:'C',  note:'', src:'CL2020' },
  'nitroprusiato+potasio':        { status:'C',  note:'', src:'CL2020' },
  // ════ HIDROCORTISONA
  'hidrocortisona+insulina':      { status:'C',  note:'', src:'CL2020' },
  'heparina+hidrocortisona':      { status:'IC', note:'Verificar concentraciones', src:'CL2020' },
  'hidrocortisona+meropenem':     { status:'C',  note:'', src:'CL2020' },
  'hidrocortisona+pip_tazo':      { status:'C',  note:'', src:'CL2020' },
  'hidrocortisona+potasio':       { status:'C',  note:'', src:'CL2020' },
  'hidrocortisona+vancomicina':   { status:'IC', note:'Verificar', src:'CL2020' },
  // ════ SOMATOSTATINA
  'heparina+somatostatina':       { status:'C',  note:'', src:'CL2020' },
  'insulina+somatostatina':       { status:'C',  note:'', src:'CL2020' },
  // ════ DILTIAZEM / VERAPAMILO
  'diltiazem+fentanilo':          { status:'C',  note:'', src:'CL2020' },
  'diltiazem+heparina':           { status:'C',  note:'', src:'CL2020' },
  'diltiazem+insulina':           { status:'C',  note:'', src:'CL2020' },
  'diltiazem+magnesio':           { status:'C',  note:'', src:'CL2020' },
  'diltiazem+midazolam':          { status:'C',  note:'', src:'CL2020' },
  'diltiazem+morfina':            { status:'C',  note:'', src:'CL2020' },
  'diltiazem+nitroglicerina':     { status:'C',  note:'', src:'CL2020' },
  'diltiazem+nitroprusiato':      { status:'C',  note:'', src:'CL2020' },
  'diltiazem+potasio':            { status:'C',  note:'', src:'CL2020' },
  'diltiazem+propofol':           { status:'C',  note:'', src:'CL2020' },
  'diltiazem+vecuronio':          { status:'C',  note:'', src:'CL2020' },
  'heparina+verapamilo':          { status:'IC', note:'Compatible a concentraciones bajas', src:'CL2020' },
  'naloxona+verapamilo':          { status:'IC', note:'Compatible a concentraciones bajas', src:'CL2020' },
  'nitroglicerina+verapamilo':    { status:'IC', note:'Compatible a concentraciones bajas', src:'CL2020' },
  'nitroprusiato+verapamilo':     { status:'IC', note:'Compatible a concentraciones bajas', src:'CL2020' },
  // ════ REMIFENTANILO
  'heparina+remifentanilo':       { status:'IC', note:'Verificar concentraciones', src:'CL2020' },
  'pip_tazo+remifentanilo':       { status:'IC', note:'Compatible a concentraciones estándar', src:'CL2020' },
  'potasio+remifentanilo':        { status:'IC', note:'Compatible a concentraciones estándar', src:'CL2020' },
  'remifentanilo+vecuronio':      { status:'IC', note:'Compatible en condiciones estándar', src:'CL2020' },
  // ════ METADONA
  'heparina+metadona':            { status:'IC', note:'Verificar', src:'CL2020' },
  // ════ FLUMAZENILO / NALOXONA
  'flumazenilo+heparina':         { status:'IC', note:'Verificar', src:'CL2020' },
  'heparina+naloxona':            { status:'C',  note:'', src:'CL2020' },
  // ════ PARACETAMOL IV
  'heparina+paracetamol_iv':      { status:'C',  note:'', src:'Sta' },
  'paracetamol_iv+propofol':      { status:'IC', note:'Posible incompatibilidad física — verificar', src:'Sta' },
  'paracetamol_iv+vancomicina':   { status:'C',  note:'', src:'Sta' },
  // ════ ALPROSTADILO (PGE1) — NICU ══════════════════════════════════
  'adrenalina+alprostadilo':      { status:'IC', note:'Datos limitados en neonatología — verificar', src:'KEMH' },
  'alprostadilo+dopamina':        { status:'IC', note:'Verificar concentraciones', src:'KEMH' },
  'alprostadilo+dobutamina':      { status:'IC', note:'Verificar concentraciones', src:'KEMH' },
  'alprostadilo+fentanilo':       { status:'C',  note:'', src:'KEMH' },
  'alprostadilo+heparina':        { status:'C',  note:'', src:'KEMH' },
  'alprostadilo+midazolam':       { status:'C',  note:'', src:'KEMH' },
  'alprostadilo+morfina':         { status:'C',  note:'', src:'KEMH' },
  // ════ AMPICILINA — NICU/PICU ═══════════════════════════════════════
  // ⚠ AMPICILINA pH 9-10 — incompatible con la gran mayoría de fármacos
  'amikacina+ampicilina':         { status:'I',  note:'INACTIVACIÓN QUÍMICA de aminoglucósido — VÍA SEPARADA obligatoria', src:'ATM,Tri' },
  'ampicilina+bicarbonato':       { status:'I',  note:'Precipitación — ambos muy alcalinos', src:'ATM' },
  'ampicilina+calcio_clo':        { status:'I',  note:'Precipitación', src:'ATM' },
  'ampicilina+calcio_glu':        { status:'I',  note:'Precipitación', src:'ATM,KEMH' },
  'adrenalina+ampicilina':        { status:'I',  note:'Incompatible — pH incompatible', src:'ATM' },
  'ampicilina+dobutamina':        { status:'I',  note:'Incompatible — pH incompatible', src:'ATM' },
  'ampicilina+dopamina':          { status:'I',  note:'Incompatible — pH incompatible', src:'ATM' },
  'ampicilina+fluconazol':        { status:'I',  note:'Precipitación visual inmediata', src:'KEMH,Tri' },
  'ampicilina+gentamicina':       { status:'I',  note:'INACTIVACIÓN QUÍMICA de gentamicina — VÍA SEPARADA obligatoria', src:'ATM,KEMH,Tri' },
  'ampicilina+heparina':          { status:'IC', note:'Compatible a bajas concentraciones en SF', src:'KEMH' },
  'ampicilina+insulina':          { status:'I',  note:'Incompatible', src:'ATM' },
  'ampicilina+midazolam':         { status:'I',  note:'Precipitación — pH incompatible', src:'ATM,KEMH' },
  'ampicilina+morfina':           { status:'I',  note:'Incompatible', src:'ATM' },
  'ampicilina+pip_tazo':          { status:'?',  note:'No mezclar beta-lactámicos sin verificar', src:'' },
  'ampicilina+vancomicina':       { status:'IC', note:'Compatible a bajas concentraciones — verificar con farmacéutico', src:'KEMH' },
  'ampicilina+fentanilo':         { status:'IC', note:'Datos limitados — verificar', src:'KEMH' },
  // ════ GENTAMICINA — NICU/PICU ══════════════════════════════════════
  // ⚠ Gentamicina: inactivada por penicilinas/beta-lactámicos en la misma vía
  'amikacina+gentamicina':        { status:'I',  note:'No mezclar aminoglucósidos — precipitación y reducción de eficacia', src:'Tri' },
  'furosemida+gentamicina':       { status:'IC', note:'Compatible en Y a concentraciones estándar — vigilar ototoxicidad aditiva', src:'Tri' },
  'gentamicina+heparina':         { status:'I',  note:'Precipitación — no administrar en Y', src:'Tri,KEMH' },
  'gentamicina+midazolam':        { status:'IC', note:'Verificar', src:'KEMH' },
  'gentamicina+morfina':          { status:'IC', note:'Verificar', src:'KEMH' },
  'fluconazol+gentamicina':       { status:'IC', note:'Verificar', src:'Sta' },
  'gentamicina+vancomicina':      { status:'IC', note:'Compatible en Y — NO en misma solución. Monitorizar nefrotoxicidad', src:'KEMH,Tri' },
  // ════ AMIKACINA — NICU/PICU ════════════════════════════════════════
  'amikacina+fluconazol':         { status:'C',  note:'Compatible a concentraciones estándar', src:'Sta' },
  'amikacina+furosemida':         { status:'IC', note:'Vigilar ototoxicidad aditiva', src:'Tri' },
  'amikacina+heparina':           { status:'I',  note:'Precipitación — no administrar en Y', src:'Tri' },
  'amikacina+midazolam':          { status:'IC', note:'Verificar', src:'KEMH' },
  'amikacina+morfina':            { status:'IC', note:'Verificar', src:'KEMH' },
  'amikacina+vancomicina':        { status:'IC', note:'Compatible en Y — NO en misma solución. Monitorizar nefrotoxicidad', src:'Tri' },
  // ════ FENOBARBITAL — NICU/PICU ═════════════════════════════════════
  // ⚠ FENOBARBITAL pH 9-10 — precipita con casi todo
  'calcio_clo+fenobarbital':      { status:'I',  note:'Precipitación', src:'Fl17' },
  'calcio_glu+fenobarbital':      { status:'I',  note:'Precipitación', src:'Fl17' },
  'fenobarbital+dobutamina':      { status:'I',  note:'Incompatible — pH incompatible', src:'Fl17' },
  'fenobarbital+dopamina':        { status:'I',  note:'Incompatible — pH incompatible', src:'Fl17' },
  'fenobarbital+fentanilo':       { status:'IC', note:'Verificar — datos limitados en neonatos', src:'Fl17' },
  'fenobarbital+heparina':        { status:'I',  note:'Incompatible', src:'Fl17,KEMH' },
  'fenobarbital+hidrocortisona':  { status:'IC', note:'Verificar concentraciones', src:'KEMH' },
  'fenobarbital+insulina':        { status:'I',  note:'Incompatible', src:'Fl17' },
  'fenobarbital+ketamina':        { status:'IC', note:'Datos limitados — verificar', src:'Fl17' },
  'fenobarbital+midazolam':       { status:'IC', note:'Precipitación posible — monitorizar la vía', src:'Fl17,KEMH' },
  'fenobarbital+morfina':         { status:'I',  note:'Precipitación', src:'Fl17,KEMH' },
  'fenobarbital+vancomicina':     { status:'IC', note:'Verificar', src:'KEMH' },
  // ════ CAFEÍNA CITRATO — NICU ════════════════════════════════════════
  'ampicilina+cafeina':           { status:'IC', note:'Verificar', src:'KEMH' },
  'cafeina+dobutamina':           { status:'IC', note:'Verificar concentraciones', src:'KEMH' },
  'cafeina+dopamina':             { status:'IC', note:'Verificar concentraciones', src:'KEMH' },
  'cafeina+fentanilo':            { status:'C',  note:'', src:'KEMH' },
  'cafeina+gentamicina':          { status:'IC', note:'Verificar', src:'KEMH' },
  'cafeina+heparina':             { status:'C',  note:'', src:'KEMH' },
  'cafeina+midazolam':            { status:'IC', note:'Verificar', src:'KEMH' },
  'cafeina+morfina':              { status:'IC', note:'Verificar', src:'KEMH' },
  'cafeina+vancomicina':          { status:'IC', note:'Verificar', src:'KEMH' },
  // ════ AMINOFILINA — NICU/PICU ══════════════════════════════════════
  // ⚠ AMINOFILINA pH 8,6-9 — múltiples incompatibilidades
  'aminofilina+dobutamina':       { status:'IC', note:'Verificar', src:'Tri' },
  'aminofilina+dopamina':         { status:'IC', note:'Verificar', src:'Tri' },
  'aminofilina+fentanilo':        { status:'IC', note:'Verificar concentraciones', src:'Tri' },
  'aminofilina+heparina':         { status:'IC', note:'Verificar', src:'Tri' },
  'aminofilina+hidrocortisona':   { status:'IC', note:'Verificar', src:'Tri' },
  'aminofilina+insulina':         { status:'I',  note:'Incompatible', src:'Tri' },
  'aminofilina+midazolam':        { status:'I',  note:'Incompatible — precipitación', src:'Tri,Fl17' },
  'aminofilina+morfina':          { status:'I',  note:'Incompatible — precipitación', src:'Tri,Fl17' },
  'aminofilina+vancomicina':      { status:'I',  note:'Incompatible — precipitación', src:'Tri' },
  // ════ INDOMETACINA / IBUPROFENO IV — NICU ══════════════════════════
  'amikacina+indometacina':       { status:'I',  note:'Incompatible', src:'Tri' },
  'dobutamina+indometacina':      { status:'IC', note:'Verificar', src:'Tri' },
  'dopamina+indometacina':        { status:'IC', note:'Verificar concentraciones', src:'Tri' },
  'furosemida+indometacina':      { status:'IC', note:'Verificar', src:'Tri' },
  'gentamicina+indometacina':     { status:'I',  note:'Incompatible — precipitación', src:'Tri' },
  'heparina+indometacina':        { status:'IC', note:'Verificar', src:'Tri' },
  'dopamina+ibuprofeno_iv':       { status:'IC', note:'Verificar', src:'Tri' },
  'gentamicina+ibuprofeno_iv':    { status:'I',  note:'Incompatible', src:'Tri' },
  'heparina+ibuprofeno_iv':       { status:'IC', note:'Verificar', src:'Tri' },
  // ════ FLUCONAZOL ════════════════════════════════════════════════════
  'aciclovir+fluconazol':         { status:'IC', note:'Verificar', src:'Sta' },
  'ceftazidima+fluconazol':       { status:'I',  note:'Precipitación', src:'Tri' },
  'calcio_glu+fluconazol':        { status:'I',  note:'Precipitación', src:'Tri' },
  'fluconazol+meropenem':         { status:'IC', note:'Verificar', src:'Sta' },
  // ════ ACICLOVIR ═════════════════════════════════════════════════════
  'aciclovir+dopamina':           { status:'I',  note:'Incompatible — no administrar en Y', src:'Sta' },
  'aciclovir+dobutamina':         { status:'I',  note:'Incompatible', src:'Sta' },
  'aciclovir+midazolam':          { status:'IC', note:'Verificar', src:'Sta' },
  'aciclovir+morfina':            { status:'IC', note:'Verificar concentraciones', src:'Sta' },
  'aciclovir+vancomicina':        { status:'IC', note:'Verificar', src:'Sta' },
};


function getCompat(id1, id2) {
  if (id1 === id2) return { status: 'same', note: '' };
  const key = [id1, id2].sort().join('+');
  return COMPAT_PAIRS[key] || { status: '?', note: 'Sin datos disponibles', src: '' };
}

// ─── HELPER: obtener todas las combinaciones de un array de ids ─────
function getAllPairs(ids) {
  const pairs = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      pairs.push({ a: ids[i], b: ids[j], ...getCompat(ids[i], ids[j]) });
    }
  }
  return pairs;
}


// ═══════════════════════════════════════════════════════════════════
// MÓDULO COMPATIBILIDAD EN Y (panel-compat)
// ═══════════════════════════════════════════════════════════════════
let compatSelected = []; // array de drug ids seleccionados (max 5)
const COMPAT_MAX = 5;

function compatInit() {
  compatSelected = [];
  const inp = document.getElementById('compat-search-input');
  if (inp) { inp.value = ''; inp.disabled = false; }
  const dd = document.getElementById('compat-dropdown');
  if (dd) { dd.style.display = 'none'; dd.innerHTML = ''; }
  const clr = document.getElementById('compat-search-clear');
  if (clr) clr.style.display = 'none';
  const results = document.getElementById('compat-results');
  if (results) results.innerHTML = '';
  compatRenderChips();
}

function compatFilterSearch(q) {
  const dd = document.getElementById('compat-dropdown');
  const clr = document.getElementById('compat-search-clear');
  if (!dd) return;
  q = (q || '').trim().toLowerCase();
  if (clr) clr.style.display = q ? '' : 'none';
  if (!q) { dd.style.display = 'none'; dd.innerHTML = ''; return; }
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'es';
  const hits = COMPAT_DRUGS.filter(d => {
    if (compatSelected.includes(d.id)) return false;
    const lbl = (d.label[lang] || d.label.es || '').toLowerCase();
    return lbl.includes(q) || d.id.includes(q);
  }).slice(0, 8);
  if (!hits.length) {
    dd.innerHTML = '<div class="compat-dd-empty">' + t('compat_no_results') + '</div>';
    dd.style.display = '';
    return;
  }
  dd.innerHTML = hits.map(d => {
    const lbl = d.label[lang] || d.label.es;
    return '<div class="compat-dd-item" onclick="compatSelectDrug(\'' + d.id + '\')">' +
      '<span class="compat-dd-icon">' + d.icon + '</span>' +
      '<span class="compat-dd-label">' + lbl + '</span>' +
      '</div>';
  }).join('');
  dd.style.display = '';
}

function compatClearSearch() {
  const inp = document.getElementById('compat-search-input');
  const dd = document.getElementById('compat-dropdown');
  const clr = document.getElementById('compat-search-clear');
  if (inp) inp.value = '';
  if (dd) { dd.style.display = 'none'; dd.innerHTML = ''; }
  if (clr) clr.style.display = 'none';
}

function compatSelectDrug(id) {
  if (compatSelected.includes(id)) return;
  if (compatSelected.length >= COMPAT_MAX) return;
  compatSelected.push(id);
  compatClearSearch();
  const inp = document.getElementById('compat-search-input');
  if (inp) inp.focus();
  compatRenderChips();
  compatRenderResults();
}

function compatRemoveDrug(id) {
  compatSelected = compatSelected.filter(x => x !== id);
  compatRenderChips();
  compatRenderResults();
}

function compatRenderChips() {
  const wrap = document.getElementById('compat-chips');
  const btn = document.getElementById('compat-verify-btn');
  const hint = document.getElementById('compat-hint');
  const inp = document.getElementById('compat-search-input');
  const counter = document.getElementById('compat-count');
  if (!wrap) return;
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'es';
  const n = compatSelected.length;

  // Counter
  if (counter) counter.textContent = n;

  // Chips
  wrap.innerHTML = compatSelected.map(id => {
    const drug = COMPAT_DRUGS.find(d => d.id === id);
    if (!drug) return '';
    const lbl = drug.label[lang] || drug.label.es;
    return '<div class="compat-chip">' +
      '<span class="compat-chip-icon">' + drug.icon + '</span>' +
      '<span class="compat-chip-label">' + lbl + '</span>' +
      '<button class="compat-chip-remove" onclick="compatRemoveDrug(\'' + id + '\')" title="Quitar">✕</button>' +
      '</div>';
  }).join('');

  // Button — always visible, enabled only with ≥2 drugs
  if (btn) {
    btn.disabled = n < 2;
    btn.classList.toggle('compat-verify-disabled', n < 2);
  }

  // Hint — show "add at least 2" when <2, hide when ≥2
  if (hint) hint.style.display = n >= 2 ? 'none' : '';

  // Search input
  if (inp) {
    inp.disabled = n >= COMPAT_MAX;
    inp.placeholder = n >= COMPAT_MAX ? t('compat_max_reached') : t('compat_search_ph');
  }
}

function checkCompat() {
  compatRenderResults();
}

function compatRenderResults() {
  const wrap = document.getElementById('compat-results');
  if (!wrap) return;
  if (compatSelected.length < 2) { wrap.innerHTML = ''; return; }

  const lang = typeof currentLang !== 'undefined' ? currentLang : 'es';
  const pairs = getAllPairs(compatSelected);

  // Contar por status
  const counts = { C: 0, I: 0, IC: 0, '?': 0 };
  pairs.forEach(p => { if (counts[p.status] !== undefined) counts[p.status]++; });

  // Resumen
  let summaryClass = 'compat-summary-ok';
  if (counts.I > 0) summaryClass = 'compat-summary-bad';
  else if (counts.IC > 0 || counts['?'] > 0) summaryClass = 'compat-summary-warn';

  let summaryHtml = '<div class="compat-summary ' + summaryClass + '">';
  if (counts.I > 0) summaryHtml += '<span class="compat-sum-badge compat-badge-I">❌ ' + counts.I + ' ' + t('compat_incompatible') + '</span>';
  if (counts.IC > 0) summaryHtml += '<span class="compat-sum-badge compat-badge-IC">⚠️ ' + counts.IC + ' ' + t('compat_conditional') + '</span>';
  if (counts['?'] > 0) summaryHtml += '<span class="compat-sum-badge compat-badge-unk">❓ ' + counts['?'] + ' ' + t('compat_unknown') + '</span>';
  if (counts.C > 0) summaryHtml += '<span class="compat-sum-badge compat-badge-C">✅ ' + counts.C + ' ' + t('compat_compatible') + '</span>';
  summaryHtml += '</div>';

  // Filas de pares — ordenadas: I primero, luego IC, ?, C
  const order = { I: 0, IC: 1, '?': 2, C: 3 };
  pairs.sort((a, b) => (order[a.status] || 0) - (order[b.status] || 0));

  const STATUS_META = {
    C:  { icon: '✅', cls: 'compat-row-C',  label: t('compat_compatible') },
    I:  { icon: '❌', cls: 'compat-row-I',  label: t('compat_incompatible') },
    IC: { icon: '⚠️', cls: 'compat-row-IC', label: t('compat_conditional') },
    '?':{ icon: '❓', cls: 'compat-row-unk',label: t('compat_unknown') },
  };

  let rowsHtml = pairs.map(p => {
    const drugA = COMPAT_DRUGS.find(d => d.id === p.a);
    const drugB = COMPAT_DRUGS.find(d => d.id === p.b);
    const lblA = drugA ? (drugA.label[lang] || drugA.label.es) : p.a;
    const lblB = drugB ? (drugB.label[lang] || drugB.label.es) : p.b;
    const meta = STATUS_META[p.status] || STATUS_META['?'];
    const noteHtml = p.note ? '<div class="compat-row-note">' + p.note + '</div>' : '';
    const stabLink = p.status === '?' ?
      '<a class="compat-stabilis-link" href="https://www.stabilis.org/" target="_blank" rel="noopener">Consultar Stabilis ↗</a>' : '';
    return '<div class="compat-row ' + meta.cls + '">' +
      '<div class="compat-row-drugs">' +
        '<span class="compat-row-icon">' + (drugA ? drugA.icon : '') + '</span>' +
        '<span class="compat-row-name">' + lblA + '</span>' +
        '<span class="compat-row-sep">+</span>' +
        '<span class="compat-row-icon">' + (drugB ? drugB.icon : '') + '</span>' +
        '<span class="compat-row-name">' + lblB + '</span>' +
        '<span class="compat-row-status-icon">' + meta.icon + '</span>' +
      '</div>' +
      '<div class="compat-row-status-label">' + meta.label + '</div>' +
      noteHtml + stabLink +
    '</div>';
  }).join('');

  wrap.innerHTML = summaryHtml + '<div class="compat-pairs-list">' + rowsHtml + '</div>';
}

// Hook into onWeightChange so chips update when weight changes
const _origOnWeightChange = onWeightChange;

// ── Expose to global scope (called from inline HTML handlers) ──
window.setLang = typeof setLang !== 'undefined' ? setLang : undefined;
window.openTab = typeof openTab !== 'undefined' ? openTab : undefined;
window.showTab = typeof showTab !== 'undefined' ? showTab : undefined;
window.toggleCard = typeof toggleCard !== 'undefined' ? toggleCard : undefined;
window.togglePanel = typeof togglePanel !== 'undefined' ? togglePanel : undefined;
window.toggleCheck = typeof toggleCheck !== 'undefined' ? toggleCheck : undefined;
window.toggleMed = typeof toggleMed !== 'undefined' ? toggleMed : undefined;
window.toggleTheme = typeof toggleTheme !== 'undefined' ? toggleTheme : undefined;
window.toggleCL = typeof toggleCL !== 'undefined' ? toggleCL : undefined;
window.toggleSC = typeof toggleSC !== 'undefined' ? toggleSC : undefined;
window.getGlobalWeight = typeof getGlobalWeight !== 'undefined' ? getGlobalWeight : undefined;
window.onGlobalWeightChange = typeof onGlobalWeightChange !== 'undefined' ? onGlobalWeightChange : undefined;
window.onWeightChange = typeof onWeightChange !== 'undefined' ? onWeightChange : undefined;
window.calcInfusion = typeof calcInfusion !== 'undefined' ? calcInfusion : undefined;
window.selectInfDrug = typeof selectInfDrug !== 'undefined' ? selectInfDrug : undefined;
window.clearInfDrug = typeof clearInfDrug !== 'undefined' ? clearInfDrug : undefined;
window.calcBroselow = typeof calcBroselow !== 'undefined' ? calcBroselow : undefined;
window.renderDoses = typeof renderDoses !== 'undefined' ? renderDoses : undefined;
window.renderEvalUI = typeof renderEvalUI !== 'undefined' ? renderEvalUI : undefined;
window.renderCalcUI = typeof renderCalcUI !== 'undefined' ? renderCalcUI : undefined;
window.renderScoresUI = typeof renderScoresUI !== 'undefined' ? renderScoresUI : undefined;
window.renderVitalsUI = typeof renderVitalsUI !== 'undefined' ? renderVitalsUI : undefined;
window.renderProtoUI = typeof renderProtoUI !== 'undefined' ? renderProtoUI : undefined;
window.renderRcpTab = typeof renderRcpTab !== 'undefined' ? renderRcpTab : undefined;
window.dvRenderRights = typeof dvRenderRights !== 'undefined' ? dvRenderRights : undefined;
window.dvResetRights = typeof dvResetRights !== 'undefined' ? dvResetRights : undefined;
window.dvCalculate = typeof dvCalculate !== 'undefined' ? dvCalculate : undefined;
window.dvClearDrug = typeof dvClearDrug !== 'undefined' ? dvClearDrug : undefined;
window.dvSearchDrug = typeof dvSearchDrug !== 'undefined' ? dvSearchDrug : undefined;
window.dvSelectDrug = typeof dvSelectDrug !== 'undefined' ? dvSelectDrug : undefined;
window.dvToggleRight = typeof dvToggleRight !== 'undefined' ? dvToggleRight : undefined;
window.dvOnIndicationChange = typeof dvOnIndicationChange !== 'undefined' ? dvOnIndicationChange : undefined;
window.filterDoseSearch = typeof filterDoseSearch !== 'undefined' ? filterDoseSearch : undefined;
window.filterDvSearch = typeof filterDvSearch !== 'undefined' ? filterDvSearch : undefined;
window.clearDoseSearch = typeof clearDoseSearch !== 'undefined' ? clearDoseSearch : undefined;
window.clearDvSearch = typeof clearDvSearch !== 'undefined' ? clearDvSearch : undefined;
window.filterMeds = typeof filterMeds !== 'undefined' ? filterMeds : undefined;
window.filterProtos = typeof filterProtos !== 'undefined' ? filterProtos : undefined;
window.filterScores = typeof filterScores !== 'undefined' ? filterScores : undefined;
window.goToCalc = typeof goToCalc !== 'undefined' ? goToCalc : undefined;
window.goToProto = typeof goToProto !== 'undefined' ? goToProto : undefined;
window.openAbout = typeof openAbout !== 'undefined' ? openAbout : undefined;
window.closeAbout = typeof closeAbout !== 'undefined' ? closeAbout : undefined;
window.openDrugCard = typeof openDrugCard !== 'undefined' ? openDrugCard : undefined;
window.openProtoCard = typeof openProtoCard !== 'undefined' ? openProtoCard : undefined;
window.openScoreCard = typeof openScoreCard !== 'undefined' ? openScoreCard : undefined;
window.showCalcPanel = typeof showCalcPanel !== 'undefined' ? showCalcPanel : undefined;
window.showDoseCat = typeof showDoseCat !== 'undefined' ? showDoseCat : undefined;
window.showDoseCategories = typeof showDoseCategories !== 'undefined' ? showDoseCategories : undefined;
window.showDvCat = typeof showDvCat !== 'undefined' ? showDvCat : undefined;
window.showDvCategories = typeof showDvCategories !== 'undefined' ? showDvCategories : undefined;
window.showDvDrugList = typeof showDvDrugList !== 'undefined' ? showDvDrugList : undefined;
window.showMedCategories = typeof showMedCategories !== 'undefined' ? showMedCategories : undefined;
window.showMedSection = typeof showMedSection !== 'undefined' ? showMedSection : undefined;
window.showProtoCat = typeof showProtoCat !== 'undefined' ? showProtoCat : undefined;
window.showProtoCategories = typeof showProtoCategories !== 'undefined' ? showProtoCategories : undefined;
window.showScoreCat = typeof showScoreCat !== 'undefined' ? showScoreCat : undefined;
window.showScoreCategories = typeof showScoreCategories !== 'undefined' ? showScoreCategories : undefined;
window.showVitalsCat = typeof showVitalsCat !== 'undefined' ? showVitalsCat : undefined;
window.showVitalsCategories = typeof showVitalsCategories !== 'undefined' ? showVitalsCategories : undefined;
window.rcpBpmAdj = typeof rcpBpmAdj !== 'undefined' ? rcpBpmAdj : undefined;
window.rcpChronoReset = typeof rcpChronoReset !== 'undefined' ? rcpChronoReset : undefined;
window.rcpChronoToggle = typeof rcpChronoToggle !== 'undefined' ? rcpChronoToggle : undefined;
window.rcpMetroToggle = typeof rcpMetroToggle !== 'undefined' ? rcpMetroToggle : undefined;
window.rcpToggle = typeof rcpToggle !== 'undefined' ? rcpToggle : undefined;
window.resetPanel = typeof resetPanel !== 'undefined' ? resetPanel : undefined;
window.reportError = typeof reportError !== 'undefined' ? reportError : undefined;
window.aiAnalyze = aiAnalyze;
window.aiClear = aiClear;
window.aiUpdateCount = aiUpdateCount;
window.doManualUpdate = typeof doManualUpdate !== 'undefined' ? doManualUpdate : undefined;
window.compatFilterSearch = typeof compatFilterSearch !== 'undefined' ? compatFilterSearch : undefined;
window.compatClearSearch = typeof compatClearSearch !== 'undefined' ? compatClearSearch : undefined;
window.compatSelectDrug = typeof compatSelectDrug !== 'undefined' ? compatSelectDrug : undefined;
window.compatRemoveDrug = typeof compatRemoveDrug !== 'undefined' ? compatRemoveDrug : undefined;
window.checkCompat = typeof checkCompat !== 'undefined' ? checkCompat : undefined;
