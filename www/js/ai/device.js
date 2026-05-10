// ============================================================================
// PULSE PREDICT — Device ID (rate limit côté Cloudflare Worker)
// UUID v4 persisté en localStorage. Idempotent.
// ============================================================================

const KEY = 'pulse.deviceId'

function uuidV4 () {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback (vieux navigateurs / WebView Capacitor anciens)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function getDeviceId () {
  try {
    let id = localStorage.getItem(KEY)
    if (id && /^[a-zA-Z0-9-]{8,64}$/.test(id)) return id
    id = uuidV4()
    localStorage.setItem(KEY, id)
    return id
  } catch (_) {
    // localStorage indisponible (Safari private) → ID éphémère in-memory
    if (!globalThis.__pulseDeviceId) globalThis.__pulseDeviceId = uuidV4()
    return globalThis.__pulseDeviceId
  }
}
