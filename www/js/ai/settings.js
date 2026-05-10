// ============================================================================
// PULSE PREDICT — AI settings persistance
// localStorage : provider sélectionné + API key (chiffrement léger via base64,
// la vraie sécurité serait d'avoir un keystore natif Capacitor — Phase ultérieure)
// ============================================================================

import { PROVIDERS, getProvider } from './providers.js'

const KEY_PROVIDER = 'pulse.ai.provider'
const KEY_KEY      = 'pulse.ai.key'      // sk-... encodé en base64 light
const KEY_MODEL    = 'pulse.ai.model'

function decode (s) {
  try { return s ? atob(s) : '' } catch { return '' }
}
function encode (s) {
  try { return s ? btoa(s) : '' } catch { return '' }
}

export function loadAISettings () {
  try {
    const provider = localStorage.getItem(KEY_PROVIDER) || 'freemium'
    const apiKey = decode(localStorage.getItem(KEY_KEY) || '')
    const model = localStorage.getItem(KEY_MODEL) || ''
    const p = getProvider(provider)
    return {
      provider,
      apiKey,
      model: model || p.defaultModel,
      providerObj: p
    }
  } catch (_) {
    return { provider: 'freemium', apiKey: '', model: PROVIDERS.freemium.defaultModel, providerObj: PROVIDERS.freemium }
  }
}

export function saveAISettings ({ provider, apiKey, model }) {
  try {
    if (provider) localStorage.setItem(KEY_PROVIDER, provider)
    if (apiKey != null) {
      if (apiKey === '') localStorage.removeItem(KEY_KEY)
      else localStorage.setItem(KEY_KEY, encode(apiKey))
    }
    if (model) localStorage.setItem(KEY_MODEL, model)
  } catch (_) {}
}

// hasAI : indique si l'utilisateur peut utiliser l'IA en l'état
// - bundled (freemium) : toujours true (pas de clé requise, quota côté Worker)
// - BYOK : true seulement si l'API key est non vide
export function hasAI (settings = null) {
  const s = settings || loadAISettings()
  if (s.providerObj?.bundled) return true
  return !!(s.apiKey && s.apiKey.trim().length > 0)
}

// validateApiKey : vérifie le format pour le provider donné
export function validateApiKey (providerId, key) {
  const p = getProvider(providerId)
  if (p.bundled) return { ok: true }
  if (!key || key.trim().length < 8) return { ok: false, reason: 'too_short' }
  if (p.apiKeyPattern && !p.apiKeyPattern.test(key.trim())) {
    return { ok: false, reason: 'wrong_format' }
  }
  return { ok: true }
}
