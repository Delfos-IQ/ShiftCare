// ShiftCare v3.3.2 — Cloudflare Worker
// Deploy: wrangler deploy
// Env vars required: GROQ_API_KEY, LS_API_KEY
// Durable Objects: SYNC_ROOM (see wrangler.toml)

import { DurableObject } from 'cloudflare:workers';

const ALLOWED_ORIGINS = [
  'https://pedicode-app.github.io',
  'https://delfos-iq.github.io',
  'http://localhost',
  'http://127.0.0.1',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.some(o => origin && origin.startsWith(o));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

/* Compat: mantém CORS como objecto para os poucos sítios que ainda usam a constante directamente */
const CORS = corsHeaders('https://pedicode-app.github.io');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const MODELS = {
  isbar:        'llama-3.3-70b-versatile',
  vitals_image: 'meta-llama/llama-4-scout-17b-16e-instruct',
  ocr:          'meta-llama/llama-4-scout-17b-16e-instruct',
  mesh:         'llama-3.3-70b-versatile',
  default:      'llama-3.3-70b-versatile',
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

// ══════════════════════════════════════════════════════════════════════════
// DURABLE OBJECT — SyncRoom
// Relay de WebSocket entre dois dispositivos ShiftCare.
// Cada sala é identificada por um código de 6 chars (ex: "SC-A3F7").
// Mensagens são retransmitidas a todos os outros clientes na sala.
// A sala expira automaticamente 12h após a última actividade.
// ══════════════════════════════════════════════════════════════════════════
export class SyncRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Resposta automática a pings — sem código extra no handler
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong')
    );
  }

  async fetch(request) {
    const upgrade = request.headers.get('Upgrade');
    if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
      return new Response('Este endpoint requer WebSocket.', { status: 426 });
    }

    // Aceitar WebSocket com hibernação (Cloudflare Hibernatable WebSocket API)
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, ['shiftcare']);

    // Notifica os clientes existentes da nova ligação
    const sockets = this.ctx.getWebSockets('shiftcare');
    const count   = sockets.length;
    if (count > 1) {
      this._broadcast(server, JSON.stringify({ type: 'peer_joined', peers: count }));
    }

    // Envia snapshot ao novo cliente (para receber estado actual da sala)
    try {
      const snapshot = await this.ctx.storage.get('snapshot');
      if (snapshot) server.send(snapshot);
    } catch { /* sem snapshot ainda */ }

    // Agenda limpeza automática via Alarm API
    try {
      const alarm = await this.ctx.storage.getAlarm();
      if (!alarm) {
        await this.ctx.storage.setAlarm(Date.now() + 13 * 60 * 60 * 1000); // 13h
      }
    } catch { /* Alarm API opcional */ }

    await this.ctx.storage.put('lastActivity', Date.now());

    return new Response(null, { status: 101, webSocket: client });
  }

  // Chamado pelo runtime quando uma mensagem chega (modo hibernação)
  async webSocketMessage(ws, msg) {
    try {
      const data = JSON.parse(msg);
      await this.ctx.storage.put('lastActivity', Date.now());
      // Relay para todos os outros clientes na sala
      this._broadcast(ws, msg);
      // Guarda estado completo como snapshot para novos clientes
      if (data.type === 'state') {
        await this.ctx.storage.put('snapshot', msg);
      }
    } catch { /* mensagem malformada — ignora */ }
  }

  async webSocketClose(ws) {
    ws.close();
    const remaining = this.ctx.getWebSockets('shiftcare').length;
    if (remaining > 0) {
      this._broadcast(ws, JSON.stringify({ type: 'peer_left', peers: remaining }));
    }
  }

  async webSocketError(ws) {
    ws.close();
  }

  // Retransmite msg a todos os clientes excepto o remetente
  _broadcast(sender, msg) {
    for (const ws of this.ctx.getWebSockets('shiftcare')) {
      if (ws !== sender) {
        try { ws.send(msg); } catch { /* cliente já fechado */ }
      }
    }
  }

  // Limpeza periódica — chamada pelo Alarm
  async alarm() {
    const lastActivity = await this.ctx.storage.get('lastActivity') || 0;
    if (Date.now() - lastActivity > 12 * 3600 * 1000) {
      for (const ws of this.ctx.getWebSockets('shiftcare')) {
        try { ws.close(1001, 'Sala expirada'); } catch {}
      }
      await this.ctx.storage.deleteAll();
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// RATE LIMITING — in-memory, resets per Worker isolate (~few minutes)
// Limita pedidos IA a 30/min por IP para prevenir abuso da GROQ_API_KEY
// ══════════════════════════════════════════════════════════════════════════
const _rl = new Map();
function _checkRL(ip) {
  const now = Date.now();
  const w   = _rl.get(ip) || { n: 0, t: now + 60000 };
  if (now > w.t) { w.n = 0; w.t = now + 60000; }
  w.n++;
  _rl.set(ip, w);
  return w.n <= 30;
}

// ══════════════════════════════════════════════════════════════════════════
// WORKER PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════
export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const ch     = corsHeaders(origin);

    // json() local — usa sempre o CORS correto para este pedido (não o estático)
    const json = (data, status = 200, extra = {}) => new Response(
      JSON.stringify(data),
      { status, headers: { 'Content-Type': 'application/json', ...ch, ...extra } }
    );

    // ── /sync/{roomCode} → WebSocket relay (Durable Object) ──
    if (url.pathname.startsWith('/sync/')) {
      const roomCode = url.pathname.split('/')[2]?.toUpperCase().trim();
      if (!roomCode || !/^[A-Z0-9]{4,8}$/.test(roomCode)) {
        return new Response('Código de sala inválido.', { status: 400 });
      }
      if (!env.SYNC_ROOM) {
        return new Response('Sincronização não configurada (SYNC_ROOM binding em falta).', { status: 503 });
      }
      const id   = env.SYNC_ROOM.idFromName(roomCode);
      const room = env.SYNC_ROOM.get(id);
      return room.fetch(request);
    }

    if (request.method === 'OPTIONS') return new Response(null, { headers: ch });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, ch);

    // Rate limiting — aplicado a pedidos IA (não a backup/sync)
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    const { type, messages, b64, mt } = body;

    // ══════════════════════════════════════════════════════════════
    // BACKUP CLOUD CIFRADO — Zero-knowledge: o Worker só vê blobs
    // cifrados AES-256-GCM. A chave de descifragem existe apenas no
    // dispositivo do utilizador e nunca é transmitida.
    // ══════════════════════════════════════════════════════════════

    const MAX_BACKUPS = 5;
    const BACKUP_MAX_BYTES = 4 * 1024 * 1024; // 4 MB por backup

    if (type === 'backup_save') {
      if (!env.BACKUP_KV) return json({ error: 'Backup não configurado no servidor.' }, 503);
      const { userId, data, label } = body;
      if (!userId || !/^[a-f0-9\-]{36}$/.test(userId)) return json({ error: 'userId inválido.' }, 400);
      if (!data || typeof data !== 'string') return json({ error: 'Dados em falta.' }, 400);
      if (data.length > BACKUP_MAX_BYTES) return json({ error: 'Backup demasiado grande (máx. 4 MB).' }, 413);

      const backupId = crypto.randomUUID();
      const metaKey  = `meta:${userId}`;
      const dataKey  = `bk:${userId}:${backupId}`;

      // Carrega metadados existentes e adiciona novo
      let meta = [];
      try { meta = JSON.parse(await env.BACKUP_KV.get(metaKey) || '[]'); } catch {}
      meta.unshift({ id: backupId, ts: Date.now(), size: data.length, label: label || '' });

      // Limita a MAX_BACKUPS — apaga os mais antigos
      const toDelete = meta.splice(MAX_BACKUPS);
      for (const old of toDelete) {
        await env.BACKUP_KV.delete(`bk:${userId}:${old.id}`).catch(() => {});
      }

      await env.BACKUP_KV.put(dataKey,  data,               { expirationTtl: 60 * 60 * 24 * 365 });
      await env.BACKUP_KV.put(metaKey,  JSON.stringify(meta),{ expirationTtl: 60 * 60 * 24 * 365 });
      return json({ ok: true, id: backupId, remaining: MAX_BACKUPS - meta.length });
    }

    if (type === 'backup_list') {
      if (!env.BACKUP_KV) return json({ error: 'Backup não configurado no servidor.' }, 503);
      const { userId } = body;
      if (!userId || !/^[a-f0-9\-]{36}$/.test(userId)) return json({ error: 'userId inválido.' }, 400);
      let meta = [];
      try { meta = JSON.parse(await env.BACKUP_KV.get(`meta:${userId}`) || '[]'); } catch {}
      return json({ backups: meta });
    }

    if (type === 'backup_load') {
      if (!env.BACKUP_KV) return json({ error: 'Backup não configurado no servidor.' }, 503);
      const { userId, backupId } = body;
      if (!userId || !/^[a-f0-9\-]{36}$/.test(userId)) return json({ error: 'userId inválido.' }, 400);
      if (!backupId) return json({ error: 'backupId em falta.' }, 400);
      const data = await env.BACKUP_KV.get(`bk:${userId}:${backupId}`);
      if (!data) return json({ error: 'Backup não encontrado.' }, 404);
      return json({ data });
    }

    if (type === 'backup_delete') {
      if (!env.BACKUP_KV) return json({ error: 'Backup não configurado no servidor.' }, 503);
      const { userId, backupId } = body;
      if (!userId || !/^[a-f0-9\-]{36}$/.test(userId)) return json({ error: 'userId inválido.' }, 400);
      if (!backupId) return json({ error: 'backupId em falta.' }, 400);

      await env.BACKUP_KV.delete(`bk:${userId}:${backupId}`).catch(() => {});
      const metaKey = `meta:${userId}`;
      let meta = [];
      try { meta = JSON.parse(await env.BACKUP_KV.get(metaKey) || '[]'); } catch {}
      meta = meta.filter(m => m.id !== backupId);
      await env.BACKUP_KV.put(metaKey, JSON.stringify(meta), { expirationTtl: 60 * 60 * 24 * 365 });
      return json({ ok: true });
    }

    // ── validate_license: valida license key do Lemon Squeezy ──
    if (type === 'validate_license') {
      const licenseKey = (body.license_key || '').trim();
      if (!licenseKey) return json({ valid: false, error: 'Chave em falta.' }, 400);
      try {
        const r = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.LS_API_KEY}`,
            'Content-Type':  'application/json',
            'Accept':        'application/json',
          },
          body: JSON.stringify({ license_key: licenseKey, instance_name: 'ShiftCare' }),
        });
        const d = await r.json();
        const valid = d.valid === true;
        return json({ valid, error: valid ? null : (d.error || 'Chave inválida.') });
      } catch (e) {
        return json({ valid: false, error: 'Erro ao validar chave: ' + e.message }, 502);
      }
    }

    // ── mesh: converte linguagem natural em descritores MeSH/DeCS ──
    if (type === 'mesh') {
      const text = (body.text || '').trim();
      if (!text) return json({ error: 'Texto em falta.' }, 400);
      const meshMessages = [
        {
          role: 'system',
          content: `${CLINICAL_SYSTEM_PREFIX}
És um especialista em indexação biomédica e ciências da saúde pediátrica.
A tua tarefa é converter termos clínicos ou texto em linguagem natural em descritores MeSH (Medical Subject Headings) e DeCS (Descritores em Ciências da Saúde) para pesquisa em PubMed, Europe PMC e BVS.

Regras:
- Devolve APENAS um array JSON com os descritores, sem mais nada: ["termo1","termo2","termo3"]
- Máximo 6 descritores, ordenados por relevância
- Usa a forma preferida do MeSH (em inglês): ex. "Sepsis" não "septicemia"
- Inclui descritores gerais E específicos quando relevante
- Para patologias pediátricas, inclui o contexto de idade se for clinicamente relevante (ex: "Infant, Newborn, Diseases")
- Não inclui descritores de método de estudo (RCT, meta-analysis) — esses são filtros
- Responde APENAS com o JSON array, sem explicações`,
        },
        {
          role: 'user',
          content: `Converte este texto clínico em descritores MeSH/DeCS: "${text}"`,
        },
      ];
      try {
        const r = await fetch(GROQ_URL, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: MODELS.mesh, messages: meshMessages, max_tokens: 200, temperature: 0.1 }),
        });
        if (!r.ok) { const err = await r.json().catch(()=>({})); return json({ error: err.error?.message || 'Groq error' }, r.status); }
        const d = await r.json();
        const raw = (d.choices?.[0]?.message?.content || '').trim();
        // Parse the JSON array from the response
        const match = raw.match(/\[[\s\S]*\]/);
        const terms = match ? JSON.parse(match[0]) : [];
        return json({ terms: terms.filter(t => typeof t === 'string' && t.trim()) });
      } catch (e) {
        return json({ error: e.message }, 502);
      }
    }

    let groqMessages = messages;

    // ── isbar: injecta prefixo de contexto clínico no system prompt ──
    if (type === 'isbar' && Array.isArray(messages)) {
      groqMessages = messages.map(msg => {
        if (msg.role === 'system' && typeof msg.content === 'string') {
          return { ...msg, content: CLINICAL_SYSTEM_PREFIX + msg.content };
        }
        return msg;
      });
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

    // Rate limit para pedidos que consomem GROQ_API_KEY
    if (!_checkRL(clientIP)) {
      return json({ error: 'Demasiados pedidos. Aguarda 1 minuto.' }, 429, ch);
    }

    const model  = MODELS[type] || MODELS.default;
    const maxTok = type === 'vitals_image' ? 200
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

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extraHeaders },
  });
}
