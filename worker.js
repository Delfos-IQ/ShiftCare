// ShiftCare v2.1 — Cloudflare Worker
// Deploy: wrangler deploy
// Env var required: GROQ_API_KEY

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODELS = {
  isbar:        'llama-3.3-70b-versatile',
  vitals_image: 'llama-3.2-11b-vision-preview',
  ocr:          'llama-3.2-11b-vision-preview',  // NEW — extracção de texto de imagens
  default:      'llama-3.1-8b-instant',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    const { type, messages, b64, mt } = body;

    let groqMessages = messages;

    // Sinais vitais a partir de imagem
    if (type === 'vitals_image' && b64 && mt) {
      groqMessages = [
        { role: 'system', content: 'Extrai sinais vitais de monitores clínicos. Responde APENAS com JSON: {"hr":"","spo2":"","rr":"","temp":"","sbp":"","gluc":""}. Só valores claramente visíveis. Sem texto adicional.' },
        { role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:${mt};base64,${b64}` } },
          { type: 'text', text: 'Extrai os sinais vitais. JSON apenas.' }
        ]}
      ];
    }

    // OCR — extracção de texto de documentos/folhas clínicas (NEW)
    if (type === 'ocr' && b64 && mt) {
      groqMessages = [
        { role: 'system', content: 'És um sistema de OCR clínico. Extrai todo o texto visível na imagem (pode ser folha impressa, ecrã de monitor ou escrita à mão). Devolve APENAS o texto extraído, preservando a estrutura por linhas e parágrafos. Sem comentários, sem explicações adicionais.' },
        { role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:${mt};base64,${b64}` } },
          { type: 'text', text: 'Extrai todo o texto visível nesta imagem clínica.' }
        ]}
      ];
    }

    if (!groqMessages || !Array.isArray(groqMessages)) return json({ error: 'Missing messages' }, 400);

    const model = MODELS[type] || MODELS.default;
    const maxTokens = type === 'vitals_image' ? 200
                    : type === 'ocr'          ? 1500
                    : 1200;

    try {
      const r = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: groqMessages, max_tokens: maxTokens, temperature: 0.2 }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return json({ error: err.error?.message || 'Groq error' }, r.status);
      }
      const d = await r.json();
      return json({ text: d.choices?.[0]?.message?.content || '' });
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}
