// ════════════════════════════════════════════════════════
//  ShiftCare v2.0 — worker.js (Cloudflare Worker)
//
//  Deploy: wrangler deploy worker.js
//  Env var required: GROQ_API_KEY
//
//  Endpoints (POST /):
//    { type: 'isbar',        messages: [...] }
//    { type: 'vitals_image', messages: [...] }
//    { type: 'suggest',      context: '...' }
//
//  PRIVACY: This worker acts as a proxy. It does NOT log
//  or store any patient data. Only the Groq API receives
//  the (already anonymised) payload from the app.
// ════════════════════════════════════════════════════════

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Model selection per task type
const MODELS = {
  isbar:        'llama-3.3-70b-versatile',
  vitals_image: 'llama-3.2-11b-vision-preview',   // vision model
  suggest:      'llama-3.1-8b-instant',            // fast/cheap for suggestions
};

// Token limits per type
const MAX_TOKENS = {
  isbar:        1200,
  vitals_image: 250,
  suggest:      300,
};

export default {
  async fetch(request, env) {

    // ── CORS preflight ──────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    // ── Parse body ──────────────────────────────────────
    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'Invalid JSON' }, 400); }

    const { type, messages, context } = body;
    if (!type) return json({ error: 'Missing type' }, 400);

    // ── Rate limiting (simple — Cloudflare KV optional) ─
    // For production add: env.RATE_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') })

    // ── Build Groq request ──────────────────────────────
    const model = MODELS[type] || MODELS.isbar;
    let groqMessages = messages;

    // For text suggestions (no patient data)
    if (type === 'suggest' && context) {
      groqMessages = [
        { role: 'system', content: 'És um assistente de enfermagem pediátrica. Sugere cuidados, medicações ou procedimentos relevantes com base no contexto clínico anónimo fornecido. Responde em PT-PT de forma concisa.' },
        { role: 'user', content: context },
      ];
    }

    if (!groqMessages || !Array.isArray(groqMessages)) {
      return json({ error: 'Missing messages' }, 400);
    }

    // ── Call Groq ───────────────────────────────────────
    let groqRes;
    try {
      groqRes = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: groqMessages,
          max_tokens: MAX_TOKENS[type] || 900,
          temperature: 0.3,
        }),
      });
    } catch (e) {
      return json({ error: 'Failed to reach Groq API', detail: e.message }, 502);
    }

    if (!groqRes.ok) {
      const errBody = await groqRes.json().catch(() => ({}));
      return json({ error: 'Groq API error', detail: errBody?.error?.message || groqRes.status }, groqRes.status);
    }

    const groqData = await groqRes.json();
    const text = groqData.choices?.[0]?.message?.content || '';

    return json({ text });
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
