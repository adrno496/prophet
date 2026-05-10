// ============================================================================
// PULSE PREDICT — AI client unifié
// callAI({ system, user, model?, maxTokens? }) → string
// Choisit le provider depuis les settings, transforme req/res, gère 429 quota.
// ============================================================================

import { loadAISettings } from './settings.js'

export class QuotaExceededError extends Error {
  constructor (info) {
    super(info.code || 'quota_exceeded')
    this.code = 'quota_exceeded'
    this.quota = info.quota
    this.used = info.used
    this.reset = info.reset
  }
}

export async function callAI ({ system, user, messages, model, maxTokens = 1024 } = {}) {
  const settings = loadAISettings()
  const p = settings.providerObj
  if (!p) throw new Error('Provider non configuré')

  if (!p.bundled && !settings.apiKey) {
    throw new Error('API key manquante pour ' + p.name)
  }

  const finalMessages = messages || [
    ...(system ? [{ role: 'system', content: system }] : []),
    ...(user ? [{ role: 'user', content: user }] : [])
  ]
  if (!finalMessages.length) throw new Error('Aucun message fourni')

  const payload = {
    model: model || settings.model || p.defaultModel,
    messages: finalMessages,
    max_tokens: maxTokens
  }

  const body = p.transformRequest ? p.transformRequest(payload) : payload
  const headers = p.headers(settings.apiKey)
  const url = typeof p.endpoint === 'function' ? p.endpoint() : p.endpoint

  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })
  } catch (e) {
    throw new Error('Erreur réseau IA : ' + (e.message || 'fetch failed'))
  }

  // Quota dépassé (Cloudflare Worker freemium)
  if (res.status === 429) {
    let info = {}
    try { info = (await res.json())?.error || {} } catch {}
    throw new QuotaExceededError(info)
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const err = await res.json()
      detail += ' — ' + (err.error?.message || err.message || JSON.stringify(err).slice(0, 200))
    } catch {}
    throw new Error('IA error: ' + detail)
  }

  const data = await res.json()
  const text = p.transformResponse ? p.transformResponse(data) : data
  if (!text || typeof text !== 'string') {
    throw new Error('Réponse IA vide ou mal formatée')
  }
  return text.trim()
}

// Helper : ping l'IA avec un prompt minimal pour valider la config
export async function pingAI () {
  return callAI({
    system: 'You are a test. Reply with the single word PONG.',
    user: 'ping',
    maxTokens: 10
  })
}
