// ════════════════════════════════════════════════════════
//  ShiftCare v2.0 — data.js
//  Static reference data. No patient info stored here.
// ════════════════════════════════════════════════════════

const SC_DATA = {

  // ── Age categories ──────────────────────────────────────
  ageCategory(days) {
    if (days <= 28)  return 'neonato';
    if (days <= 730) return 'lactente';   // ~0-24 months
    return 'crianca';
  },

  // ── Pediatric vital sign ranges (by age in DAYS) ────────
  vitalRanges(days) {
    days = parseInt(days) || 0;
    if (days <= 28)   return { hr:[100,180], rr:[40,60], sbp:[45,80],  spo2:[88,100], temp:[36.3,37.5], gluc:[45,120] };
    if (days <= 90)   return { hr:[100,180], rr:[35,55], sbp:[60,95],  spo2:[95,100], temp:[36.3,37.5], gluc:[50,120] };
    if (days <= 365)  return { hr:[100,160], rr:[30,50], sbp:[65,100], spo2:[95,100], temp:[36.4,37.5], gluc:[60,120] };
    if (days <= 730)  return { hr:[90,150],  rr:[24,40], sbp:[70,110], spo2:[95,100], temp:[36.4,37.5], gluc:[60,120] };
    if (days <= 1825) return { hr:[80,140],  rr:[22,34], sbp:[80,112], spo2:[96,100], temp:[36.4,37.5], gluc:[60,120] };
    if (days <= 4380) return { hr:[70,120],  rr:[18,30], sbp:[85,118], spo2:[96,100], temp:[36.5,37.5], gluc:[60,120] };
    return                   { hr:[55,100],  rr:[12,20], sbp:[90,130], spo2:[96,100], temp:[36.5,37.5], gluc:[70,120] };
  },

  vitalStatus(v, r) {
    if (v === '' || v === null || v === undefined) return '';
    const n = parseFloat(v); if (isNaN(n)) return '';
    if (n < r[0] || n > r[1]) return 'alrt';
    const span = r[1] - r[0];
    if (n < r[0] + span * .12 || n > r[1] - span * .12) return 'warn';
    return 'ok';
  },

  VITALS: [
    { k:'hr',   label:'FC',       unit:'bpm',   ph:'140' },
    { k:'spo2', label:'SpO₂',     unit:'%',     ph:'98'  },
    { k:'rr',   label:'FR',       unit:'rpm',   ph:'40'  },
    { k:'temp', label:'Temp',     unit:'°C',    ph:'36.8'},
    { k:'sbp',  label:'TAS',      unit:'mmHg',  ph:'80'  },
    { k:'gluc', label:'Glicemia', unit:'mg/dL', ph:'80'  },
  ],

  // ── Default nursing tasks ────────────────────────────────
  DEFAULT_TASKS: [
    'Avaliação ABCDE completa',
    'Controlo de sinais vitais',
    'Administração de medicação',
    'Balanço hídrico',
    'Higiene e conforto',
    'Estado da unidade',
    'Comunicação à família',
  ],

  // ── ABCDE assessment items ───────────────────────────────
  ABCDE: [
    { key:'A', title:'Airway — Via Aérea',      desc:'Permeabilidade, secreções, posicionamento, dispositivos (ETT, máscara)' },
    { key:'B', title:'Breathing — Respiração',  desc:'FR, SpO₂, padrão respiratório, trabalho ventilatório, auscultação' },
    { key:'C', title:'Circulation — Circulação',desc:'FC, TAS, perfusão periférica, tempo de repreenchimento capilar, cor' },
    { key:'D', title:'Disability — Neurológico', desc:'Consciência (AVPU/GCS), pupilas, tónus muscular, convulsões' },
    { key:'E', title:'Exposure — Exposição',     desc:'Temperatura, pele, lesões, presença de edema, drenos, feridas' },
  ],

  // ── Unit check items ─────────────────────────────────────
  UNIT_CHECK: [
    'Insuflador manual presente e funcional',
    'Aspiração funcionante (teste)',
    'Sondas de aspiração disponíveis',
    'Débito-metro de O₂ (≥15 L/min)',
    'Unidade organizada e limpa',
    'Medicação de urgência acessível',
  ],

  // ── To-Do items (quick select) ───────────────────────────
  TODO_ITEMS: [
    { cat:'Análises',    items:['Sangue','Urina','Secreções','LCR','Exsudado'] },
    { cat:'Gasimetria',  items:['Capilar','Venosa','Arterial'] },
    { cat:'Outros',      items:['Balanço hídrico','Mudar drenos','Aspirar secreções','Pesar doente','Eletrocardiograma'] },
  ],

  // ── Medication routes ────────────────────────────────────
  MED_ROUTES: ['Oral','Gástrica (SNG/SOG)','EV','Inalatória','Perineural','Epidural','Retal','Subcutânea','Intramuscular'],

  // ── Medication dose units ────────────────────────────────
  MED_UNITS: ['mg','mcg','g','UI','mEq','mL','mmol'],

  // ── Medication frequencies ───────────────────────────────
  MED_FREQS: [
    { label:'1/1h',   hours:1  },
    { label:'2/2h',   hours:2  },
    { label:'4/4h',   hours:4  },
    { label:'6/6h',   hours:6  },
    { label:'8/8h',   hours:8  },
    { label:'12/12h', hours:12 },
    { label:'24/24h', hours:24 },
    { label:'36/36h', hours:36 },
    { label:'SOS',    hours:0  },
    { label:'Contínua (perfusão)', hours:-1 },
  ],

  // ── Shift schedule definitions ───────────────────────────
  SHIFTS: [
    { name:'Manhã',  start:8,  end:15, color:'#FEF3C7', accent:'#D97706' },
    { name:'Tarde',  start:15, end:22, color:'#EDE9FE', accent:'#7C3AED' },
    { name:'Noite',  start:22, end:8,  color:'#E0F2FE', accent:'#0369A1' },
  ],

  // Compute doses for a shift given first dose time + frequency (hours)
  shiftDoses(firstHour, freqHours) {
    if (freqHours <= 0) return [];
    const doses = [];
    let h = parseInt(firstHour);
    for (let i = 0; i < Math.ceil(24 / freqHours) + 2; i++) {
      doses.push(h % 24);
      h += freqHours;
    }
    return [...new Set(doses)].sort((a,b) => a-b);
  },

  dosesInShift(doses, shift) {
    return doses.filter(h => {
      if (shift.start < shift.end) return h >= shift.start && h < shift.end;
      return h >= shift.start || h < shift.end; // overnight
    });
  },

  // ── Device types with body hotspot ──────────────────────
  DEVICE_TYPES: [
    { id:'piv-r',  label:'Acesso Venoso Periférico Direito',  x:78, y:44, cat:'acesso',    icon:'💉' },
    { id:'piv-l',  label:'Acesso Venoso Periférico Esquerdo', x:22, y:44, cat:'acesso',    icon:'💉' },
    { id:'cvc-r',  label:'Cateter Venoso Central Direito',    x:64, y:21, cat:'acesso',    icon:'🔵' },
    { id:'cvc-l',  label:'Cateter Venoso Central Esquerdo',   x:36, y:21, cat:'acesso',    icon:'🔵' },
    { id:'art-r',  label:'Linha Arterial Direita',            x:82, y:52, cat:'acesso',    icon:'🔴' },
    { id:'art-l',  label:'Linha Arterial Esquerda',           x:18, y:52, cat:'acesso',    icon:'🔴' },
    { id:'uvc',    label:'Cateter Umbilical Venoso',          x:50, y:59, cat:'acesso',    icon:'⚪', neo:true },
    { id:'uac',    label:'Cateter Umbilical Arterial',        x:50, y:62, cat:'acesso',    icon:'🔴', neo:true },
    { id:'ett',    label:'Tubo Endotraqueal',                 x:50, y:17, cat:'via_aerea', icon:'🟢' },
    { id:'sng',    label:'Sonda Nasogástrica',                x:44, y:14, cat:'sonda',     icon:'🟡' },
    { id:'sog',    label:'Sonda Orogástrica',                 x:50, y:15, cat:'sonda',     icon:'🟡' },
    { id:'sjej',   label:'Sonda Jejunal',                     x:56, y:15, cat:'sonda',     icon:'🟠' },
    { id:'alg',    label:'Algália',                           x:50, y:70, cat:'sonda',     icon:'🟤' },
    { id:'drain-r',label:'Dreno Torácico Direito',            x:65, y:34, cat:'dreno',     icon:'⬛' },
    { id:'drain-l',label:'Dreno Torácico Esquerdo',           x:35, y:34, cat:'dreno',     icon:'⬛' },
    { id:'spo2-r', label:'SpO₂ Mão/Pé Direito',              x:75, y:88, cat:'monitor',   icon:'🟣' },
    { id:'spo2-l', label:'SpO₂ Mão/Pé Esquerdo',             x:25, y:88, cat:'monitor',   icon:'🟣' },
  ],

  DEVICE_GAUGES: ['24G','22G','20G','18G','16G','14G','Fr 5','Fr 6','Fr 8','Fr 10','Fr 12','Fr 14','N/A'],

  // ── Quick note categories ────────────────────────────────
  QUICK_CATS: [
    { cat:'Colheita',       items:['Sangue','Secreções','Urina','LCR'] },
    { cat:'Lateralidade',   items:['Esquerda','Direita','Bilateral'] },
    { cat:'Acesso Venoso',  items:['Periférico','Central','PICC'] },
    { cat:'Sonda',          items:['Nasogástrica','Orogástrica','Jejunal'] },
    { cat:'Procedimento',   items:['Algaliação','Entubação Orotraqueal','Aspiração Gástrica','Aspiração de Secreções'] },
    { cat:'Aviso',          items:['Médico avisado','Família contactada','Anestesia avisada','Cirurgia avisada'] },
    { cat:'Intercorrência', items:['Agitação','Convulsão','Dessaturação','Bradicardia','Hipertermia'] },
  ],

  // ── Common medications (for learning autocomplete) ───────
  COMMON_MEDS: [
    'Morfina','Fentanil','Midazolam','Propofol','Ketamina',
    'Adrenalina','Noradrenalina','Dopamina','Dobutamina',
    'Furosemida','Heparina','Insulina','Dextrose 10%',
    'Amoxicilina','Ampicilina','Gentamicina','Meropenem','Vancomicina',
    'Paracetamol','Ibuprofeno','Dexametasona','Hidrocortisona',
    'Surfactante','Cafeína','Fenobarbital','Levetiracetam',
    'Albumina','Imunoglobulina','Vitamina K',
  ],
};

// Make globally available
window.SC_DATA = SC_DATA;
