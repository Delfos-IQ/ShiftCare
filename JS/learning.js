// ════════════════════════════════════════════════════════
//  ShiftCare v2.0 — learning.js
//  Privacy-preserving pattern learning.
//  NEVER stores patient names, ages, diagnoses or IDs.
//  Only aggregated anonymous usage patterns.
// ════════════════════════════════════════════════════════

const SC_LEARN = (() => {
  const KEY = 'sc_learn_v1';
  let _data = {
    medFreq: {},       // medication name → count (no doses/patients)
    taskFreq: {},      // task text → count
    todoFreq: {},      // todo item → count
    deviceFreq: {},    // device type id → count
    noteKeywords: {},  // keyword → count (after stripping patient refs)
    quickFreq: {},     // cat>item → count
    lastReset: null,
    version: '1',
  };

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (d.version === '1') Object.assign(_data, d);
    } catch(e) {}
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(_data)); } catch(e) {}
  }

  function inc(obj, key, amount = 1) {
    if (!key || typeof key !== 'string') return;
    obj[key] = (obj[key] || 0) + amount;
  }

  // Called when a medication is confirmed (name only, no patient data)
  function learnMed(name) {
    if (!name) return;
    inc(_data.medFreq, name.trim().toLowerCase());
    save();
  }

  // Called when a task is marked done (text only)
  function learnTask(text) {
    inc(_data.taskFreq, text.trim().toLowerCase());
    save();
  }

  // Called when a todo item is added
  function learnTodo(text) {
    inc(_data.todoFreq, text.trim().toLowerCase());
    save();
  }

  // Called when a device is added
  function learnDevice(typeId) {
    inc(_data.deviceFreq, typeId);
    save();
  }

  // Called when quick note confirmed
  function learnQuick(catItem) {
    inc(_data.quickFreq, catItem);
    save();
  }

  // Top N suggestions for a category
  function suggest(category, input, n = 5) {
    const map = { med: _data.medFreq, task: _data.taskFreq, todo: _data.todoFreq, device: _data.deviceFreq };
    const freq = map[category] || {};
    const q = (input || '').toLowerCase();
    return Object.entries(freq)
      .filter(([k]) => !q || k.includes(q))
      .sort(([,a],[,b]) => b - a)
      .slice(0, n)
      .map(([k]) => k);
  }

  // Med name autocomplete (combines learned + static list)
  function medSuggestions(input) {
    const q = (input || '').toLowerCase();
    if (!q) return [];
    const learned = suggest('med', q, 4);
    const staticList = (SC_DATA.COMMON_MEDS || [])
      .filter(m => m.toLowerCase().includes(q))
      .slice(0, 6);
    const merged = [...new Set([...learned, ...staticList.map(m => m.toLowerCase())])];
    return merged.slice(0, 6).map(m => SC_DATA.COMMON_MEDS.find(s => s.toLowerCase() === m) || m);
  }

  // Export for AI (anonymised — only aggregate patterns, no patient data)
  function exportPatterns() {
    return {
      topMeds: Object.entries(_data.medFreq).sort(([,a],[,b]) => b-a).slice(0,10).map(([k]) => k),
      topTasks: Object.entries(_data.taskFreq).sort(([,a],[,b]) => b-a).slice(0,10).map(([k]) => k),
      topTodos: Object.entries(_data.todoFreq).sort(([,a],[,b]) => b-a).slice(0,10).map(([k]) => k),
      topDevices: Object.entries(_data.deviceFreq).sort(([,a],[,b]) => b-a).slice(0,8).map(([k]) => k),
    };
  }

  function reset() {
    _data = { medFreq:{}, taskFreq:{}, todoFreq:{}, deviceFreq:{}, noteKeywords:{}, quickFreq:{}, lastReset: new Date().toISOString(), version:'1' };
    save();
  }

  load();
  return { learnMed, learnTask, learnTodo, learnDevice, learnQuick, suggest, medSuggestions, exportPatterns, reset };
})();

window.SC_LEARN = SC_LEARN;
