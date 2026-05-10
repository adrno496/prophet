// ============================================================================
// PROPHET — state.js
// Pub/sub global réactif (user, profile, lang). Pas de framework, juste un EventTarget.
// ============================================================================

import { sb } from './supabase-client.js'

class Store extends EventTarget {
  constructor () {
    super()
    this.user = null
    this.profile = null
    this.fng = null
  }

  set (key, value) {
    this[key] = value
    this.dispatchEvent(new CustomEvent('change', { detail: { key, value } }))
    this.dispatchEvent(new CustomEvent(`change:${key}`, { detail: value }))
  }

  on (key, cb) {
    const handler = e => cb(e.detail)
    this.addEventListener(`change:${key}`, handler)
    return () => this.removeEventListener(`change:${key}`, handler)
  }
}

export const store = new Store()

// Charger le profil de l'utilisateur courant
// Auto-récupération : si profil manquant (session stale après reset DB) → sign out
export async function loadProfile () {
  const userId = store.user?.id
  if (!userId) {
    console.warn('loadProfile: no user in store')
    return null
  }

  const { data, error } = await sb
    .from('profiles')
    .select('id, username, balance, level, xp, total_trades, wins, losses, peak_balance, total_pnl, country_code, preferred_lang, last_bonus_at, is_premium, created_at')
    .eq('id', userId)
    .maybeSingle()

  // Cas 1 : table profiles inexistante (migrations pas push) → erreur claire
  if (error) {
    console.error('loadProfile error', error)
    if (error.code === '42P01' || /relation .* does not exist/i.test(error.message || '')) {
      alert('La base de données n\'est pas initialisée. Push les migrations :\nsupabase db push')
    }
    return null
  }

  // Cas 2 : pas de ligne pour ce user (session stale post-reset) → auto sign out
  if (!data) {
    console.warn('Profile missing for current user — signing out')
    try { await sb.auth.signOut() } catch (_) {}
    try { localStorage.removeItem('prophet.onboarded') } catch (_) {}
    window.location.replace('index.html')
    return null
  }

  store.set('profile', data)
  return data
}

// Réclamer le bonus quotidien
export async function claimDailyBonus () {
  const { data, error } = await sb.rpc('daily_bonus')
  if (error) throw error
  await loadProfile()
  return Number(data) // €0 si déjà réclamé, €10 sinon
}

// Reset compte (balance ≤ €100, cooldown 24h)
export async function resetAccount () {
  const { error } = await sb.rpc('reset_account')
  if (error) throw error
  await loadProfile()
  return true
}

// Mettre à jour pseudo (validation côté serveur)
export async function updateUsername (username) {
  const { error } = await sb.rpc('update_username', { p_username: username })
  if (error) throw error
  await loadProfile()
  return true
}

// Fetch Fear & Greed depuis api.alternative.me (no key)
export async function fetchFearGreed () {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1', { cache: 'no-cache' })
    if (!res.ok) throw new Error('http ' + res.status)
    const json = await res.json()
    const item = json?.data?.[0]
    if (!item) return null
    const fng = {
      value: Number(item.value),
      classification: item.value_classification,
      timestamp: Number(item.timestamp)
    }
    store.set('fng', fng)
    return fng
  } catch (e) {
    console.warn('fetchFearGreed failed', e)
    return null
  }
}
