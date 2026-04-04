// ════════════════════════════════════════════════════════
//  ShiftCare v2.0 — ai.js
//  AI integration via Cloudflare Worker → Groq LLaMA.
//  PRIVACY: patient data is summarised/anonymised before
//  being sent. Worker strips any direct identifiers.
// ════════════════════════════════════════════════════════

const SC_AI = (() => {

  const SYSTEM_ISBAR = `És um especialista em cuidados intensivos pediátricos. 
Gera relatórios de passagem de turno no formato ISBAR:
I - Identificação (doente, cama, idade, peso, diagnóstico)
S - Situação (situação atual, sinais vitais, alertas críticos)
B - Background/Antecedentes (antecedentes pessoais, história da doença atual)
A - Avaliação (avaliação de enfermagem ABCDE, dispositivos ativos)
R - Recomendações (pendentes, atenções para o próximo turno)
Usa terminologia de enfermagem profissional em Português de Portugal (PT-PT). Sê conciso e clínico. Destaca ALERTAS em maiúsculas.`;

  // Build an anonymised patient summary for the AI
  // PRIVACY: we strip/generalise identifiers before sending
  function buildSummary(p) {
    const R = SC_DATA.vitalRanges(p.ageDays);
    const V = SC_DATA.VITALS;
    const vStr = V.map(v => {
      const val = p.vitals[v.k];
      const st = val && R[v.k] ? SC_DATA.vitalStatus(val, R[v.k]) : '';
      return `${v.label}=${val||'NR'} ${v.unit}${st==='alrt'?' [ALERTA]':st==='warn'?' [ATENÇÃO]':''}`;
    }).join(' | ');
    const age = SC_STATE.ageLabel(p);
    const weight = p.weightKg ? `${p.weightKg}kg` : 'peso não registado';
    const done = p.tasks.filter(t => t.done).map(t => t.text).join('; ') || 'nenhuma';
    const pend = p.tasks.filter(t => !t.done).map(t => t.text).join('; ') || 'nenhuma';
    const notes = p.notes.slice(0, 5).map(n => `[${ft(n.timestamp)}] ${n.text}`).join(' / ') || 'sem notas';
    const devices = p.devices.map(d => d.label + (d.gauge ? ` ${d.gauge}` : '')).join(', ') || 'sem dispositivos registados';
    const todos = p.todos.filter(t => !t.done).map(t => t.text).join('; ') || 'nenhum';
    const abcde = SC_DATA.ABCDE.map(a => p.abcde?.[a.key] ? `${a.key}: ${p.abcde[a.key]}` : '').filter(Boolean).join(' | ') || 'não registada';

    // We generalise age (not exact birthdate) — sufficient for clinical context, not for re-identification
    return `DOENTE: Cama ${p.bed} | Idade: ${age} | Peso: ${weight}
DX Principal: ${p.diagMain || 'não especificado'}
DX Secundários: ${p.diagSec.join(', ') || 'nenhum'}
ANTECEDENTES: ${p.antecedentes || 'não registados'}
HDA: ${p.hda || 'não registada'}
SINAIS VITAIS: ${vStr}
AVALIAÇÃO ABCDE: ${abcde}
DISPOSITIVOS: ${devices}
MEDICAÇÃO: ${(p.medications||[]).map(m => `${m.name} ${m.dose}${m.unit} ${m.route} ${m.freq}`).join('; ') || 'não registada'}
TO-DO PENDENTE: ${todos}
CUIDADOS REALIZADOS: ${done}
CUIDADOS PENDENTES: ${pend}
NOTAS DO TURNO: ${notes}`;
  }

  async function callWorker(payload) {
    const url = SC_STATE.get('workerUrl');
    if (!url) throw new Error('URL do Worker não configurada.');
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`Worker erro: ${r.status}`);
    return r.json();
  }

  // Fallback: call Groq directly (if user has key, no worker)
  async function callGroq(messages, maxTokens = 900) {
    const key = SC_STATE.get('apiKey');
    if (!key) throw new Error('Chave API Groq não configurada.');
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error?.message || `Groq erro: ${r.status}`);
    }
    const d = await r.json();
    return { text: d.choices?.[0]?.message?.content || 'Sem resposta.' };
  }

  async function generateISBAR(patient, onlyPatient = true) {
    const useWorker = !!SC_STATE.get('workerUrl');
    const summaries = onlyPatient
      ? [buildSummary(patient)]
      : SC_STATE.get('patients').filter(p => p.status === 'internado').map(buildSummary);
    const shiftMins = SC_STATE.get('shiftStart')
      ? Math.round((Date.now() - new Date(SC_STATE.get('shiftStart'))) / 60000)
      : 0;
    const prompt = `Gera relatório ISBAR de passagem de turno (turno: ${shiftMins} minutos):\n\n${summaries.join('\n\n───────────────\n\n')}`;
    const messages = [
      { role: 'system', content: SYSTEM_ISBAR },
      { role: 'user', content: prompt },
    ];
    if (useWorker) {
      return callWorker({ type: 'isbar', messages });
    }
    return callGroq(messages);
  }

  async function interpretVitalsImage(base64, mime) {
    // Only direct Groq (image support) — worker can proxy too
    const useWorker = !!SC_STATE.get('workerUrl');
    const messages = [
      { role: 'system', content: 'Extrai sinais vitais de imagens de monitores clínicos. Responde APENAS com JSON: {"hr":"","spo2":"","rr":"","temp":"","sbp":"","gluc":""}. Inclui apenas valores claramente visíveis. Sem texto adicional.' },
      { role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
          { type: 'text', text: 'Extrai os sinais vitais. JSON apenas.' },
        ]
      },
    ];
    if (useWorker) {
      return callWorker({ type: 'vitals_image', messages });
    }
    // Groq vision
    return callGroq(messages, 200);
  }

  return { generateISBAR, interpretVitalsImage, buildSummary };
})();

window.SC_AI = SC_AI;
