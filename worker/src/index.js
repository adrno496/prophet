// ============================================================================
// PULSE PREDICT — Cloudflare Worker
// Proxy vers Groq avec rate-limit par device (KV) et whitelist de modèles.
// L'utilisateur final n'a aucune clé : MA clé Groq vit dans env.GROQ_API_KEY,
// le device est identifié par un UUID stocké dans son localStorage côté app.
// ============================================================================

const WHITELIST_MODELS = new Set([
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile'
])

const MAX_BODY_BYTES = 64 * 1024            // 64 KiB
const MAX_TOKENS_HARD_CAP = 2000             // clamp côté serveur
const QUOTA_TTL_SECONDS = 26 * 60 * 60       // 26h (absorbe les fuseaux horaires)
const DEVICE_ID_PATTERN = /^[a-zA-Z0-9-]{8,64}$/

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id',
  'Access-Control-Max-Age': '86400'
}

function json (obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...extra
    }
  })
}

function todayUtc () {
  return new Date().toISOString().slice(0, 10)
}

function nextMidnightUtcIso () {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

export default {
  async fetch (req, env, ctx) {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    // Healthcheck
    const url = new URL(req.url)
    if (req.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, time: new Date().toISOString() })
    }

    if (req.method !== 'POST') {
      return json({ error: { code: 'method_not_allowed' } }, 405)
    }
    if (url.pathname !== '/v1/chat/completions') {
      return json({ error: { code: 'not_found' } }, 404)
    }

    // ----- Validation device ID -----
    const deviceId = req.headers.get('X-Device-Id') || ''
    if (!DEVICE_ID_PATTERN.test(deviceId)) {
      return json({ error: { code: 'bad_device_id', message: 'Header X-Device-Id manquant ou invalide' } }, 400)
    }

    // ----- Lecture & validation body -----
    const text = await req.text()
    if (text.length > MAX_BODY_BYTES) {
      return json({ error: { code: 'body_too_large', max: MAX_BODY_BYTES } }, 413)
    }

    let body
    try {
      body = JSON.parse(text)
    } catch {
      return json({ error: { code: 'bad_json' } }, 400)
    }

    if (!body.model || !WHITELIST_MODELS.has(body.model)) {
      return json({
        error: {
          code: 'model_not_allowed',
          allowed: Array.from(WHITELIST_MODELS)
        }
      }, 400)
    }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return json({ error: { code: 'missing_messages' } }, 400)
    }

    // Clamp max_tokens
    body.max_tokens = Math.min(
      Number.isFinite(body.max_tokens) ? body.max_tokens : 1000,
      MAX_TOKENS_HARD_CAP
    )

    // ----- Rate limit via KV -----
    const dailyQuota = parseInt(env.DAILY_QUOTA || '30', 10)
    const quotaKey = `q:${deviceId}:${todayUtc()}`
    const usedRaw = await env.QUOTA.get(quotaKey)
    const used = parseInt(usedRaw || '0', 10)

    if (used >= dailyQuota) {
      return json({
        error: {
          code: 'quota_exceeded',
          quota: dailyQuota,
          used,
          reset: nextMidnightUtcIso(),
          message: `Quota gratuit atteint (${used}/${dailyQuota}). Reset à minuit UTC.`
        }
      }, 429, {
        'X-Quota-Limit': String(dailyQuota),
        'X-Quota-Remaining': '0',
        'X-Quota-Reset': nextMidnightUtcIso()
      })
    }

    // Incrémenter AVANT le proxy (anti-spam si Groq est lent)
    await env.QUOTA.put(quotaKey, String(used + 1), {
      expirationTtl: QUOTA_TTL_SECONDS
    })

    // ----- Proxy vers Groq -----
    let groqRes
    try {
      groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
    } catch (e) {
      return json({ error: { code: 'upstream_unreachable', message: e.message } }, 502, {
        'X-Quota-Limit': String(dailyQuota),
        'X-Quota-Remaining': String(Math.max(0, dailyQuota - used - 1))
      })
    }

    // Renvoie la réponse Groq telle quelle (déjà OpenAI-compatible)
    const respText = await groqRes.text()
    return new Response(respText, {
      status: groqRes.status,
      headers: {
        ...corsHeaders,
        'Content-Type': groqRes.headers.get('Content-Type') || 'application/json',
        'X-Quota-Limit': String(dailyQuota),
        'X-Quota-Remaining': String(Math.max(0, dailyQuota - used - 1)),
        'X-Quota-Reset': nextMidnightUtcIso()
      }
    })
  }
}
