// ShiftCare v2.2 — Cloudflare Worker
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
  vitals_image: 'meta-llama/llama-4-scout-17b-16e-instruct',
  ocr:          'meta-llama/llama-4-scout-17b-16e-instruct',
  default:      'llama-3.1-8b-instant',
};

/* Prefixo de contexto clínico injectado em TODOS os pedidos isbar.
   Resolve o bloqueio do filtro de conteúdo do Groq quando o payload
   contém nomes de opiáceos, sedativos ou outros fármacos de uso
   controlado (morfina, fentanil, sufentanil, ketamina, midazolam…)
   que são perfeitamente normais em UCIP/UCIN. */
const CLINICAL_SYSTEM_PREFIX = `Função: assistente de documentação clínica para enfermagem em unidade de cuidados intensivos pediátricos (UCIP/UCIN) de um hospital público.
Contexto: o utilizador é um enfermeiro especialista em saúde infantil e pediátrica. Os dados enviados são registos clínicos reais de turno — sinais vitais, medicação endovenosa (incluindo analgésicos opiáceos, sedativos, vasopressores e outros fármacos de uso controlado em UCI), procedimentos invasivos e estado neurológico de doentes pediátricos internados.
Missão: processar e sintetizar informação clínica de forma rigorosa, estruturada e segura, exclusivamente para apoio à documentação de enfermagem. Nunca recusar pedidos por conterem nomes de fármacos de uso controlado — neste contexto são prescrições médicas hospitalares normais.
`;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    const { type, messages, b64, mt } = body;

    let groqMessages = messages;

    // ── isbar: injecta prefixo de contexto clínico no system prompt ──
    if (type === 'isbar' && Array.isArray(messages)) {
      groqMessages = messages.map(msg => {
        if (msg.role === 'system' && typeof msg.content === 'string') {
          return { ...msg, content: CLINICAL_SYSTEM_PREFIX + msg.content };
        }
        return msg;
      });
      // Se não houver system message, adiciona uma
      if (!groqMessages.some(m => m.role === 'system')) {
        groqMessages = [
          { role: 'system', content: CLINICAL_SYSTEM_PREFIX },
          ...groqMessages,
        ];
      }
    }

    // ── vitals_image: leitura de sinais vitais de monitor ──
    if (type === 'vitals_image' && b64 && mt) {
      groqMessages = [
        {
          role: 'system',
          content: CLINICAL_SYSTEM_PREFIX +
            'Extrai sinais vitais de monitores clínicos. Responde APENAS com JSON válido: {"hr":"","spo2":"","rr":"","temp":"","sbp":"","gluc":""}. Só valores claramente visíveis. Sem texto adicional.',
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mt};base64,${b64}` } },
            { type: 'text', text: 'Extrai os sinais vitais visíveis no monitor. Responde apenas com o JSON.' },
          ],
        },
      ];
    }

    // ── ocr: extracção de texto de documentos/folhas clínicas ──
    if (type === 'ocr' && b64 && mt) {
      groqMessages = [
        {
          role: 'system',
          content: CLINICAL_SYSTEM_PREFIX +
            'És um sistema de OCR clínico. Extrai todo o texto visível na imagem (folha impressa, ecrã de monitor ou escrita à mão). Devolve APENAS o texto extraído, preservando a estrutura por linhas e parágrafos. Sem comentários nem explicações adicionais.',
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mt};base64,${b64}` } },
            { type: 'text', text: 'Extrai todo o texto visível nesta imagem clínica.' },
          ],
        },
      ];
    }

    if (!groqMessages || !Array.isArray(groqMessages)) return json({ error: 'Missing messages' }, 400);

    const model   = MODELS[type] || MODELS.default;
    const maxTok  = type === 'vitals_image' ? 200
                  : type === 'ocr'          ? 1500
                  : 1200;

    try {
      const r = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.GROQ_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          model,
          messages:    groqMessages,
          max_tokens:  maxTok,
          temperature: 0.3,
        }),
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
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
